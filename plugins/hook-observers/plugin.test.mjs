// Co-located unit test for the hook-observers plugin.
// Runnable with `node --test` (zero dependencies).
//
// hook-observers is an INLINE-HOOK plugin: its behavior lives entirely in the
// `contributes.turn_hooks[].code` JS strings. This test validates the manifest
// shape AND actually EXECUTES each hook body against a realistic mock `ctx`,
// asserting the returned `{kind, text}` matches the hook's logic.
//
// Execution model is mirrored from Core's build_hook_program
// (apps/core/src/plugin_host/mod.rs): the hook body is injected after a global
// `const ctx = {...}` and a `host` facade, and runs inside an async IIFE so a
// bare `return` reports the directive as the program's final value. We reproduce
// that with `new Function('ctx', 'host', code)` — none of these hooks use
// `await`, so a plain function call is faithful. A stub `host.sideModel` is
// provided (unused by these three observers, but wired to match the real ctx).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, 'manifest.json');
const RAW = readFileSync(MANIFEST_PATH, 'utf8');

// ── Manifest / contract validation (ALWAYS) ─────────────────────────────────

test('manifest.json is valid JSON and parses', () => {
  assert.doesNotThrow(() => JSON.parse(RAW));
});

const manifest = JSON.parse(RAW);

test('manifest has required id/name/version', () => {
  assert.equal(manifest.id, 'com.ryuhq.hook-observers');
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length > 0);
  // Semver-ish version.
  assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test('manifest declares contributes.turn_hooks (well-formed)', () => {
  assert.ok(manifest.contributes, 'expected contributes');
  const hooks = manifest.contributes.turn_hooks;
  assert.ok(Array.isArray(hooks), 'turn_hooks must be an array');
  assert.equal(hooks.length, 3);

  const validPhases = new Set([
    'post_assistant_turn',
    'pre_user_turn',
    'session_start',
    'stop',
    'pre_tool_use',
    'post_tool_use',
    'subagent_stop',
    'session_end',
    'notification',
  ]);

  for (const hook of hooks) {
    assert.equal(typeof hook.id, 'string');
    assert.ok(hook.id.length > 0, 'hook id must be non-empty');
    assert.ok(validPhases.has(hook.on), `unknown phase: ${hook.on}`);
    assert.equal(typeof hook.code, 'string');
    assert.ok(hook.code.includes('return'), 'hook body must return a directive');
    // Each body must compile as a function body.
    assert.doesNotThrow(
      // eslint-disable-next-line no-new-func
      () => new Function('ctx', 'host', hook.code),
      `hook ${hook.id} body must be syntactically valid`
    );
  }

  // This is a pure-observer plugin: no runnables, grants, servers or tools.
  assert.deepEqual(manifest.runnables, []);
  assert.deepEqual(manifest.permission_grants, []);
  assert.equal(manifest.mcp_servers, undefined);
});

// ── Hook execution harness (mirrors build_hook_program semantics) ────────────

function hookById(id) {
  const hook = manifest.contributes.turn_hooks.find((h) => h.id === id);
  assert.ok(hook, `missing hook: ${id}`);
  return hook;
}

function runHook(id, ctx) {
  const hook = hookById(id);
  const host = {
    // Canned side-model stub — matches the real host facade shape even though
    // these observer hooks never call it.
    sideModel: async () => 'CANNED_SIDE_MODEL',
    log: () => {},
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('ctx', 'host', hook.code);
  return fn(ctx, host);
}

// ── observers.subagent-stop ──────────────────────────────────────────────────

test('subagent-stop notes the finished sub-agent id and output', () => {
  const out = runHook('observers.subagent-stop', {
    event: { id: 'researcher-7' },
    output: 'Compiled a summary of the three sources into a final report.',
  });
  assert.equal(out.kind, 'note');
  assert.ok(out.text.startsWith('subagent researcher-7 finished: '));
  // Output is truncated to 60 chars.
  const finished = out.text.split('finished: ')[1];
  assert.equal(finished, 'Compiled a summary of the three sources into a final report.'.slice(0, 60));
  assert.ok(finished.length <= 60);
});

test('subagent-stop falls back to "?" for missing id and empty output', () => {
  const out = runHook('observers.subagent-stop', {});
  assert.equal(out.kind, 'note');
  assert.equal(out.text, 'subagent ? finished: ');
});

test('subagent-stop truncates a long output to 60 chars', () => {
  const longOutput = 'x'.repeat(200);
  const out = runHook('observers.subagent-stop', {
    event: { id: 'a' },
    output: longOutput,
  });
  const finished = out.text.split('finished: ')[1];
  assert.equal(finished.length, 60);
  assert.equal(finished, 'x'.repeat(60));
});

// ── observers.session-end ────────────────────────────────────────────────────

test('session-end note contains the conversation id and message count', () => {
  const transcript = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
    { role: 'user', content: 'bye' },
  ];
  const out = runHook('observers.session-end', {
    conversation_id: 'conv-abc',
    transcript,
  });
  assert.equal(out.kind, 'note');
  assert.equal(out.text, 'session conv-abc ended with 3 messages');
  // The message count in the note must reflect ctx.transcript.length.
  assert.ok(out.text.includes(`${transcript.length} messages`));
});

test('session-end handles a missing transcript (0 messages) and missing id', () => {
  const out = runHook('observers.session-end', {});
  assert.equal(out.kind, 'note');
  assert.equal(out.text, 'session ? ended with 0 messages');
});

test('session-end counts an empty transcript as 0 messages', () => {
  const out = runHook('observers.session-end', {
    conversation_id: 'c1',
    transcript: [],
  });
  assert.equal(out.text, 'session c1 ended with 0 messages');
});

// ── observers.notification ───────────────────────────────────────────────────

test('notification note surfaces the event title', () => {
  const out = runHook('observers.notification', {
    event: { title: 'Build finished' },
  });
  assert.equal(out.kind, 'note');
  assert.equal(out.text, 'notification: Build finished');
});

test('notification falls back to "?" for a missing event title', () => {
  const out = runHook('observers.notification', {});
  assert.equal(out.kind, 'note');
  assert.equal(out.text, 'notification: ?');
});

// ── Cross-cutting invariant ──────────────────────────────────────────────────

test('every observer hook returns a well-formed note directive', () => {
  const ctx = {
    conversation_id: 'c',
    transcript: [{ role: 'user' }],
    event: { id: 'e', title: 't' },
    output: 'o',
  };
  for (const hook of manifest.contributes.turn_hooks) {
    const out = runHook(hook.id, ctx);
    assert.equal(out.kind, 'note', `${hook.id} must return kind:note`);
    assert.equal(typeof out.text, 'string');
    assert.ok(out.text.length > 0, `${hook.id} text must be non-empty`);
  }
});
