// Co-located unit test for the `security-guidance` plugin.
// Runner: `node --test plugin.test.mjs` (zero external deps).
//
// This is an INLINE-HOOK plugin: the real behaviour lives in the JS string at
// contributes.turn_hooks[].code, which Core injects into a sandbox where `ctx`
// and `host` are globals (see apps/core/src/plugin_host/mod.rs build_hook_program).
// The hook body runs inside an async IIFE and `return`s a directive, so we load
// the string into an AsyncFunction(ctx, host) and actually RUN it against a
// realistic mock ctx + a stub host.sideModel, then assert the returned
// {kind, text} matches the hook's logic.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "plugin.json");
const RAW = readFileSync(MANIFEST_PATH, "utf8");

const FLAG = "io.ryu.security-guidance";

// AsyncFunction constructor — the hook body uses top-level `await` + `return`.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** Load and compile the hook body into a callable (ctx, host) => Promise<directive>. */
function loadHook(manifest) {
  const hooks = manifest.contributes.turn_hooks;
  const hook = hooks.find((h) => h.id === "security-guidance.review");
  assert.ok(hook, "expected a turn hook with id security-guidance.review");
  // The body runs with `ctx` and `host` in scope (Core injects them as the
  // sandbox globals). Mirror that by taking them as function params.
  const fn = new AsyncFunction("ctx", "host", hook.code);
  return (ctx, host) => fn(ctx, host);
}

/** Build a realistic post_assistant_turn ctx (mirrors HookContext in Core). */
function makeCtx({ flags = {}, transcript = [] } = {}) {
  return {
    conversation_id: "conv-1",
    agent_id: "agent-1",
    transcript,
    flags,
    // post_assistant_turn leaves these unset:
    input: null,
    output: null,
    event: null,
  };
}

/** A stub host: sideModel returns a canned string; log records into `logs`. */
function makeHost(sideModelReturn) {
  const logs = [];
  const calls = [];
  return {
    logs,
    calls,
    host: {
      sideModel: async (arg) => {
        calls.push(arg);
        if (typeof sideModelReturn === "function") {
          return sideModelReturn(arg);
        }
        return sideModelReturn;
      },
      log: (...a) => logs.push(a.join(" ")),
    },
  };
}

const userMsg = (content) => ({ role: "user", content });
const asstMsg = (content) => ({ role: "assistant", content });

// ---------------------------------------------------------------------------
// ALWAYS: manifest shape / contract validation
// ---------------------------------------------------------------------------

test("plugin.json is valid JSON and has id/name/version", () => {
  const m = JSON.parse(RAW);
  assert.equal(m.id, "security-guidance");
  assert.equal(typeof m.name, "string");
  assert.ok(m.name.length > 0);
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("permission_grants declares hook:side-model (needed for host.sideModel)", () => {
  const m = JSON.parse(RAW);
  assert.ok(
    Array.isArray(m.permission_grants) &&
      m.permission_grants.includes("hook:side-model"),
    "hook uses host.sideModel, so it must be granted hook:side-model",
  );
});

test("contributes composer_controls / settings_tabs / slash_commands are well-formed", () => {
  const c = JSON.parse(RAW).contributes;

  const toggle = c.composer_controls[0];
  assert.equal(toggle.type, "toggle");
  assert.equal(toggle.flag, FLAG, "toggle flag must be the flag the hook reads");

  const field = c.settings_tabs[0].fields[0];
  assert.equal(field.type, "model_picker");
  assert.equal(
    field.pref_key,
    "security-review-model",
    "settings pref_key must match the model_pref_key the hook passes to sideModel",
  );

  const cmd = c.slash_commands[0];
  assert.equal(cmd.command, "/security");
});

test("turn_hook is a post_assistant_turn hook matching the flag + /security command", () => {
  const hook = JSON.parse(RAW).contributes.turn_hooks[0];
  assert.equal(hook.on, "post_assistant_turn");
  assert.equal(hook.match.flag, FLAG);
  assert.deepEqual(hook.match.commands, ["/security"]);
  assert.equal(typeof hook.code, "string");
  assert.ok(hook.code.length > 0);
});

test("hook code passes model_pref_key (swappable model, never hardcoded)", () => {
  const hook = JSON.parse(RAW).contributes.turn_hooks[0];
  assert.match(hook.code, /model_pref_key:\s*['"]security-review-model['"]/);
  // Sanity: no hardcoded model id like "gpt-4"/"claude-..." in the sideModel call.
  assert.doesNotMatch(hook.code, /model:\s*['"](gpt|claude|o\d|gemini)/i);
});

// ---------------------------------------------------------------------------
// INLINE-HOOK: actually RUN the hook body
// ---------------------------------------------------------------------------

test("returns {kind:'none'} when flag off and no /security force", async () => {
  const run = loadHook(JSON.parse(RAW));
  const ctx = makeCtx({
    flags: { [FLAG]: false },
    transcript: [userMsg("hi"), asstMsg("child_process.execSync('ls')")],
  });
  const { host, calls } = makeHost("Looks secure.");
  const out = await run(ctx, host);
  assert.deepEqual(out, { kind: "none" });
  assert.equal(calls.length, 0, "sideModel must not be called when hook is idle");
});

test("returns {kind:'none'} when toggled on but last assistant message is empty", async () => {
  const run = loadHook(JSON.parse(RAW));
  const ctx = makeCtx({
    flags: { [FLAG]: true },
    transcript: [userMsg("hi"), asstMsg("   ")],
  });
  const { host } = makeHost("something dangerous");
  const out = await run(ctx, host);
  assert.deepEqual(out, { kind: "none" });
});

test("toggled on: pattern hit surfaces even when LLM says 'Looks secure.'", async () => {
  const run = loadHook(JSON.parse(RAW));
  const ctx = makeCtx({
    flags: { [FLAG]: true },
    transcript: [
      userMsg("write a shell helper"),
      asstMsg("import subprocess\nsubprocess.run(cmd, shell=True)"),
    ],
  });
  const { host, calls } = makeHost("Looks secure.");
  const out = await run(ctx, host);
  assert.equal(out.kind, "note");
  assert.match(out.text, /Security guidance:/);
  assert.match(out.text, /Pattern warnings:/);
  assert.match(out.text, /shell=True/);
  // "Looks secure." is filtered → no LLM review section.
  assert.doesNotMatch(out.text, /LLM security review:/);
  assert.equal(calls.length, 1, "sideModel called once");
  assert.equal(
    calls[0].model_pref_key,
    "security-review-model",
    "swappable model pref forwarded to sideModel",
  );
  assert.match(calls[0].prompt, /shell=True/, "reviewed code is the assistant text");
});

test("forced via /security acts even when the flag is off", async () => {
  const run = loadHook(JSON.parse(RAW));
  const ctx = makeCtx({
    flags: { [FLAG]: false },
    transcript: [
      userMsg("/security"),
      asstMsg("const html = el.innerHTML = userInput;"),
    ],
  });
  const { host, calls } = makeHost("Looks secure.");
  const out = await run(ctx, host);
  assert.equal(out.kind, "note", "/security forces a review despite flag off");
  assert.match(out.text, /innerHTML/);
  assert.equal(calls.length, 1);
});

test("clean code + 'Looks secure.' → {kind:'none'} (no note when nothing found)", async () => {
  const run = loadHook(JSON.parse(RAW));
  const ctx = makeCtx({
    flags: { [FLAG]: true },
    transcript: [
      userMsg("add two numbers"),
      asstMsg("function add(a, b) { return a + b; }"),
    ],
  });
  const { host } = makeHost("Looks secure.");
  const out = await run(ctx, host);
  assert.deepEqual(out, { kind: "none" });
});

test("LLM review text is surfaced under 'LLM security review:'", async () => {
  const run = loadHook(JSON.parse(RAW));
  const ctx = makeCtx({
    flags: { [FLAG]: true },
    transcript: [
      userMsg("build a query"),
      asstMsg("db.query('SELECT * FROM u WHERE id=' + id)"),
    ],
  });
  const review = "SQL injection on line 1: use a parameterized query.";
  const { host } = makeHost(review);
  const out = await run(ctx, host);
  assert.equal(out.kind, "note");
  assert.match(out.text, /LLM security review:/);
  assert.match(out.text, /parameterized query/);
});

test("a 'looks good'/'looks fine' style reply is treated as clean and filtered", async () => {
  const run = loadHook(JSON.parse(RAW));
  const ctx = makeCtx({
    flags: { [FLAG]: true },
    transcript: [
      userMsg("simple fn"),
      asstMsg("function noop() {}"),
    ],
  });
  const { host } = makeHost("Looks good, no issues.");
  const out = await run(ctx, host);
  assert.deepEqual(out, { kind: "none" });
});

test("sideModel throwing is caught, logged, and does not crash the hook", async () => {
  const run = loadHook(JSON.parse(RAW));
  const ctx = makeCtx({
    flags: { [FLAG]: true },
    transcript: [
      userMsg("yaml please"),
      asstMsg("import yaml\ndata = yaml.load(open('x.yml'))"),
    ],
  });
  const { host, logs } = makeHost(() => {
    throw new Error("gateway down");
  });
  const out = await run(ctx, host);
  // The pattern layer still fires even though the LLM layer errored.
  assert.equal(out.kind, "note");
  assert.match(out.text, /yaml\.load/);
  assert.doesNotMatch(out.text, /LLM security review:/);
  assert.ok(
    logs.some((l) => /security-guidance review failed/.test(l)),
    "the failure is logged via host.log",
  );
});

test("multiple distinct patterns each produce a bullet warning", async () => {
  const run = loadHook(JSON.parse(RAW));
  const ctx = makeCtx({
    flags: { [FLAG]: true },
    transcript: [
      userMsg("do stuff"),
      asstMsg(
        [
          "os.system('rm -rf /')",
          "pickle.loads(blob)",
          "requests.get(url, verify=False)",
        ].join("\n"),
      ),
    ],
  });
  const { host } = makeHost("Looks secure.");
  const out = await run(ctx, host);
  assert.equal(out.kind, "note");
  const bullets = out.text.split("\n").filter((l) => l.startsWith("•"));
  assert.equal(bullets.length, 3, "one bullet per matched rule");
  assert.match(out.text, /os\.system/);
  assert.match(out.text, /pickle/);
  assert.match(out.text, /TLS verification/);
});
