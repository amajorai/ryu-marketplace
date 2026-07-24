// Co-located unit test for the Advisor plugin.
//
// Runner: `node --test` (zero dependencies — node:test + node:assert only).
//   node --test plugins-store/advisor/plugin.test.mjs
//
// Advisor is an INLINE-HOOK plugin: it ships a `post_assistant_turn` turn hook
// whose behaviour lives entirely in a JS string inside manifest.json. So this test
// does two things:
//   1. Manifest contract — the http tool runnable + contributes are well-formed.
//   2. Live hook execution — it EXTRACTS contributes.turn_hooks[0].code and runs
//      it against a realistic mock `ctx` + a stub `host.sideModel`, mirroring how
//      Core wraps it (see apps/core/src/plugin_host/mod.rs::build_hook_program:
//      `const ctx = {...}; const host = {...}; <entry_code>` run as an async
//      function body whose top-level `return` yields the directive).

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, 'manifest.json');
const RAW = readFileSync(MANIFEST_PATH, 'utf8');

// ── 1. Manifest is valid JSON with the core identity fields ────────────────────

test('manifest.json is valid JSON and parses', () => {
  const m = JSON.parse(RAW);
  assert.equal(typeof m, 'object');
  assert.notEqual(m, null);
});

const manifest = JSON.parse(RAW);

test('has id / name / version', () => {
  assert.equal(manifest.id, 'com.ryuhq.advisor');
  assert.equal(manifest.name, 'Advisor');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test('activation_events + permission_grants are declared for a side-model hook', () => {
  assert.ok(Array.isArray(manifest.activation_events));
  assert.deepEqual(manifest.activation_events, ['*']);
  assert.ok(Array.isArray(manifest.permission_grants));
  // The hook calls host.sideModel — that requires the side-model grant.
  assert.ok(
    manifest.permission_grants.includes('hook:side-model'),
    'a sideModel hook must declare the hook:side-model grant'
  );
  // The http tool egresses to loopback — declared as a scoped grant.
  assert.ok(
    manifest.permission_grants.includes('tool:http-egress:127.0.0.1'),
    'the http tool must declare its loopback egress grant'
  );
});

// ── 2. The declarative HTTP tool runnable is well-formed ───────────────────────

test('advisor__consult is an http POST tool with a server-side Authorization secret header', () => {
  assert.ok(Array.isArray(manifest.runnables));
  const tool = manifest.runnables.find((r) => r.kind === 'tool');
  assert.ok(tool, 'a tool runnable exists');
  const cfg = tool.config;
  assert.equal(cfg.slug, 'advisor__consult');
  assert.equal(cfg.backend, 'http');
  assert.equal(cfg.method, 'POST');
  // Routed through Core's loopback bridge, not a public host.
  assert.match(cfg.url, /^http:\/\/127\.0\.0\.1:\d+\/api\/advisor\/consult$/);
  // Secret stays server-side: an env-ref bearer token, never a literal secret.
  assert.ok(cfg.secret_headers, 'secret_headers present');
  assert.equal(cfg.secret_headers.Authorization, 'Bearer env:RYU_TOKEN');
  assert.match(
    cfg.secret_headers.Authorization,
    /env:/,
    'the bearer token is an env ref, not a baked literal'
  );
  // fail_open so a dead advisor never blocks a turn; unwrap_body for a clean payload.
  assert.equal(cfg.fail_open, true);
  assert.equal(cfg.unwrap_body, true);
});

test('advisor__consult input_schema requires `question`', () => {
  const tool = manifest.runnables.find((r) => r.kind === 'tool');
  const schema = tool.config.input_schema;
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['question']);
  for (const key of ['question', 'context', 'model']) {
    assert.equal(schema.properties[key].type, 'string', `${key} is a string prop`);
  }
});

// ── 3. contributes surfaces are well-formed ────────────────────────────────────

const FLAG = 'com.ryuhq.advisor';

test('composer toggle / slash command / settings tab wire the same flag + key', () => {
  const c = manifest.contributes;
  assert.ok(c, 'contributes present');

  const toggle = c.composer_controls.find((x) => x.type === 'toggle');
  assert.equal(toggle.flag, FLAG);

  const cmd = c.slash_commands.find((x) => x.command === '/advisor');
  assert.ok(cmd, '/advisor slash command declared');

  const field = c.settings_tabs[0].fields.find((f) => f.type === 'model_picker');
  assert.equal(field.pref_key, 'advisor-model');
});

test('turn hook is a post_assistant_turn hook carrying JS code', () => {
  const hooks = manifest.contributes.turn_hooks;
  assert.ok(Array.isArray(hooks));
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].on, 'post_assistant_turn');
  assert.equal(typeof hooks[0].code, 'string');
  assert.ok(hooks[0].code.length > 0);
});

// ── 4. Live hook execution ─────────────────────────────────────────────────────
//
// Mirror Core's wrapper: the entry code runs as an async function body with
// `ctx` and `host` in lexical scope; its top-level `return` produces the
// directive. Core's real facade also exposes host.runAgent / host.storage /
// host.log — advisor only touches host.sideModel, so the stub provides that and
// records the arguments it was called with.

const HOOK_CODE = manifest.contributes.turn_hooks[0].code;

function makeHost(sideModelImpl) {
  const calls = [];
  return {
    calls,
    host: {
      sideModel: async (args) => {
        calls.push(args);
        return sideModelImpl(args);
      },
      runAgent: async () => '',
      storage: {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
        keys: async () => [],
      },
      log: () => {},
    },
  };
}

// Build the async runner exactly like Core: ctx + host injected, entry code as body.
const runHook = new Function(
  'ctx',
  'host',
  `return (async () => { ${HOOK_CODE} })();`
);

function mkCtx({ transcript = [], flags = {}, conversationId = 'conv-test' } = {}) {
  return {
    conversation_id: conversationId,
    agent_id: 'ryu',
    transcript,
    flags,
    input: null,
  };
}

const userMsg = (content) => ({ role: 'user', content });
const asstMsg = (content) => ({ role: 'assistant', content });

test('hook: neither toggled nor on-demand → kind:none, side model never called', async () => {
  const { host, calls } = makeHost(() => 'SHOULD NOT BE CALLED');
  const ctx = mkCtx({
    transcript: [userMsg('what is 2+2?'), asstMsg('4')],
    flags: { [FLAG]: false },
  });
  const out = await runHook(ctx, host);
  assert.deepEqual(out, { kind: 'none' });
  assert.equal(calls.length, 0, 'side model must not be consulted when off');
});

test('hook: toggled ON → kind:note prefixed "Advisor: " with the advice', async () => {
  const ADVICE = 'Consider adding a rollback test before you ship.';
  const { host, calls } = makeHost(() => ADVICE);
  const ctx = mkCtx({
    transcript: [userMsg('here is my plan'), asstMsg('I will do X then Y')],
    flags: { [FLAG]: true },
  });
  const out = await runHook(ctx, host);
  assert.equal(out.kind, 'note');
  assert.equal(out.text, `Advisor: ${ADVICE}`);
  assert.equal(calls.length, 1);
  // Wired to the right preference + high effort, per the manifest field/pref_key.
  assert.equal(calls[0].model_pref_key, 'advisor-model');
  assert.equal(calls[0].effort, 'high');
  // The whole transcript is handed to the advisor.
  assert.match(calls[0].prompt, /here is my plan/);
  assert.match(calls[0].prompt, /I will do X then Y/);
});

test('hook: /advisor on-demand → kind:continue that injects the advice as guidance', async () => {
  const ADVICE = 'Your approach is sound; add a timeout guard.';
  const { host, calls } = makeHost(() => ADVICE);
  const ctx = mkCtx({
    // Flag is OFF — on-demand must fire purely on the slash command.
    transcript: [userMsg('/advisor'), asstMsg('done')],
    flags: { [FLAG]: false },
  });
  const out = await runHook(ctx, host);
  assert.equal(out.kind, 'continue');
  assert.match(out.text, /expert advisor reviewed the whole conversation/i);
  assert.ok(out.text.endsWith(ADVICE), 'advice appended to the continue directive');
  assert.equal(calls.length, 1);
});

test('hook: /advisor <focus> forwards the focus text to the side model', async () => {
  const { host, calls } = makeHost(() => 'ok');
  const ctx = mkCtx({
    transcript: [userMsg('/advisor is this the right approach?'), asstMsg('maybe')],
    flags: { [FLAG]: false },
  });
  const out = await runHook(ctx, host);
  assert.equal(out.kind, 'continue');
  assert.equal(calls.length, 1);
  assert.match(
    calls[0].prompt,
    /specifically wants advice on: is this the right approach\?/,
    'the focus after "/advisor " is passed through to the advisor prompt'
  );
});

test('hook: on-demand takes precedence — /advisor while toggled still returns continue', async () => {
  const { host } = makeHost(() => 'advice');
  const ctx = mkCtx({
    transcript: [userMsg('/advisor'), asstMsg('done')],
    flags: { [FLAG]: true },
  });
  const out = await runHook(ctx, host);
  assert.equal(out.kind, 'continue');
});

test('hook: empty transcript → kind:none even when toggled', async () => {
  const { host, calls } = makeHost(() => 'advice');
  const ctx = mkCtx({ transcript: [], flags: { [FLAG]: true } });
  const out = await runHook(ctx, host);
  assert.deepEqual(out, { kind: 'none' });
  assert.equal(calls.length, 0);
});

test('hook: empty / whitespace advice from side model → kind:none (no empty note)', async () => {
  const { host } = makeHost(() => '   ');
  const ctx = mkCtx({
    transcript: [userMsg('plan'), asstMsg('answer')],
    flags: { [FLAG]: true },
  });
  const out = await runHook(ctx, host);
  assert.deepEqual(out, { kind: 'none' });
});

test('hook: null advice from side model → kind:none', async () => {
  const { host } = makeHost(() => null);
  const ctx = mkCtx({
    transcript: [userMsg('/advisor'), asstMsg('answer')],
    flags: { [FLAG]: false },
  });
  const out = await runHook(ctx, host);
  assert.deepEqual(out, { kind: 'none' });
});

// ── 5. Byte-identity with the built-in Core fixture (monorepo only) ────────────
//
// AGENTS.md mandates the manifest be byte-identical to its Core registration
// fixture. In the standalone satellite repo the fixture doesn't exist, so this
// check is skipped there rather than failing.

test('manifest.json is byte-identical to the Core fixture (skipped if absent)', () => {
  const fixture = join(
    HERE,
    '..',
    '..',
    'apps',
    'core',
    'src',
    'plugin_manifest',
    'fixtures',
    'advisor.manifest.json'
  );
  // Skip on the SATELLITE tree (no apps/core at all), but fail loudly if the
  // fixtures directory is here and only the file name is wrong — otherwise a
  // broken path silently skips instead of catching real drift.
  if (!existsSync(dirname(fixture))) {
    return;
  }
  const fixtureRaw = readFileSync(fixture, 'utf8');
  assert.equal(RAW, fixtureRaw, 'manifest must stay byte-identical to the Core fixture');
});
