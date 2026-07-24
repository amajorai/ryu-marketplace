// Co-located, zero-dependency test for the `goal` plugin.
// Run with:  node --test plugins-store/goal/plugin.test.mjs
//
// `goal` is an INLINE-HOOK plugin: its behaviour lives entirely in the JS string
// at contributes.turn_hooks[0].code, which Core runs in a sandbox with an injected
// `ctx` and a `host` capability facade (see apps/core/src/plugin_host/mod.rs,
// build_hook_program). This test extracts that exact string and RUNS it against a
// realistic mock ctx + a stub host that mirrors Core's facade contract, asserting
// the returned directive and the storage side effects match the hook's logic.
// It never edits plugin.json.

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "plugin.json");
const JUDGE_PREF_KEY = "goal-judge-model";

const raw = readFileSync(MANIFEST_PATH, "utf8");

// Core wraps the hook body in an async IIFE where a bare `return` reports the
// directive as the program's final value. AsyncFunction(body) reproduces that:
// the body runs as an async function taking (ctx, host) and its `return` is the
// resolved value. Mirrors run_hook/build_hook_program in Core.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function loadHookRunner(manifest) {
  const hook = manifest.contributes.turn_hooks[0];
  const fn = new AsyncFunction("ctx", "host", hook.code);
  return (ctx, host) => fn(ctx, host);
}

// A realistic post_assistant_turn ctx (mirrors HookContext in Core: transcript
// oldest→newest of {role, content}, conversation_id, per-request flags).
function makeCtx(overrides = {}) {
  return {
    conversation_id: "conv-123",
    agent_id: "ryu",
    transcript: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ],
    flags: {},
    input: null,
    ...overrides,
  };
}

// Stub host that mirrors Core's `host` facade from build_hook_program:
//   storage.set(k, v)  → stores `typeof v === "string" ? v : JSON.stringify(v)`
//   storage.get(k)     → returns the stored STRING, or null (never the object)
//   storage.delete(k)  → removes the key, returns true
//   sideModel(a)       → records the call and returns a canned string
// Replicating the JSON.stringify-on-set is load-bearing: the goal hook stores an
// object and later `JSON.parse`s what get() returns, so get() MUST yield a string.
function makeHost(sideModelReply, seed = {}) {
  const store = new Map(Object.entries(seed));
  const sideModelCalls = [];
  return {
    store,
    sideModelCalls,
    sideModel: async (args) => {
      sideModelCalls.push(args);
      return typeof sideModelReply === "function"
        ? sideModelReply(args)
        : sideModelReply;
    },
    storage: {
      get: async (k) => {
        const v = store.get(String(k));
        return v === undefined ? null : v;
      },
      set: async (k, v) => {
        store.set(String(k), typeof v === "string" ? v : JSON.stringify(v));
        return true;
      },
      delete: async (k) => {
        store.delete(String(k));
        return true;
      },
    },
  };
}

// ── Manifest / contract ──────────────────────────────────────────────────────

test("plugin.json is valid JSON with id/name/version", () => {
  const m = JSON.parse(raw);
  assert.equal(typeof m, "object");
  assert.equal(m.id, "goal");
  assert.equal(typeof m.name, "string");
  assert.ok(m.name.length > 0);
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("declared contributes fields are well-formed", () => {
  const m = JSON.parse(raw);

  // grants the hook actually exercises: sideModel + KV storage
  assert.ok(
    Array.isArray(m.permission_grants) &&
      m.permission_grants.includes("hook:side-model"),
    "must grant hook:side-model"
  );
  assert.ok(
    m.permission_grants.includes("storage:kv"),
    "must grant storage:kv"
  );

  // slash command that seeds the goal
  const cmd = m.contributes.slash_commands[0];
  assert.equal(cmd.command, "/goal");
  assert.equal(typeof cmd.description, "string");

  // judge model picker writes the pref key the hook passes to sideModel
  const field = m.contributes.settings_tabs[0].fields[0];
  assert.equal(field.type, "model_picker");
  assert.equal(field.pref_key, JUDGE_PREF_KEY);

  // the inline hook itself: post_assistant_turn, stateful /goal match
  const hook = m.contributes.turn_hooks[0];
  assert.equal(hook.on, "post_assistant_turn");
  assert.deepEqual(hook.match.commands, ["/goal"]);
  assert.equal(hook.match.stateful, true);
  assert.equal(typeof hook.code, "string");
  assert.ok(hook.code.includes("host.sideModel"), "hook uses sideModel");
  assert.ok(hook.code.includes("host.storage"), "hook uses storage");
  assert.ok(
    hook.code.includes(JUDGE_PREF_KEY),
    "hook passes goal-judge-model pref key"
  );
});

test("Core fixture (when present) is byte-identical to this manifest", () => {
  // Soft check: the satellite repo ships this file alone, so the fixture only
  // exists in the monorepo. When it does, enforce the byte-identity invariant.
  const fixture = join(
    HERE,
    "..",
    "..",
    "apps",
    "core",
    "src",
    "plugin_manifest",
    "fixtures",
    "goal.plugin.json"
  );
  if (!existsSync(fixture)) {
    return; // standalone satellite tree — nothing to compare against
  }
  assert.equal(
    readFileSync(fixture, "utf8"),
    raw,
    "Core fixture and plugins-store manifest must be byte-identical"
  );
});

// ── Hook behaviour ─────────────────────────────────────────────────────────────

test("no conversation_id → {kind:'none'}", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("MET: no - x");
  assert.deepEqual(await run(makeCtx({ conversation_id: null }), host), {
    kind: "none",
  });
  assert.equal(host.sideModelCalls.length, 0);
});

test("'/goal clear' deletes stored state and returns a note", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("unused", {
    "conv-123": JSON.stringify({ condition: "x", status: "active", turns: 3 }),
  });
  const ctx = makeCtx({
    transcript: [
      { role: "assistant", content: "working…" },
      { role: "user", content: "/goal clear" },
    ],
  });
  const directive = await run(ctx, host);
  assert.deepEqual(directive, { kind: "note", text: "Goal cleared." });
  assert.equal(host.store.has("conv-123"), false, "state removed");
  assert.equal(host.sideModelCalls.length, 0, "no judge call on clear");
});

test("'/goal stop' also clears (same note)", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("unused", {
    "conv-123": JSON.stringify({ condition: "x", status: "active", turns: 1 }),
  });
  const ctx = makeCtx({
    transcript: [{ role: "user", content: "  /goal stop  " }],
  });
  assert.deepEqual(await run(ctx, host), {
    kind: "note",
    text: "Goal cleared.",
  });
  assert.equal(host.store.has("conv-123"), false);
});

test("'/goal <condition>' seeds active state and returns a continue", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("unused");
  const ctx = makeCtx({
    transcript: [
      { role: "assistant", content: "ok" },
      { role: "user", content: "/goal ship the release notes" },
    ],
  });
  const directive = await run(ctx, host);
  assert.deepEqual(directive, {
    kind: "continue",
    text: "Begin working toward this goal: ship the release notes",
  });
  // storage now holds a parseable active goal at turn 0
  const stored = JSON.parse(host.store.get("conv-123"));
  assert.deepEqual(stored, {
    condition: "ship the release notes",
    status: "active",
    turns: 0,
  });
  assert.equal(host.sideModelCalls.length, 0, "seeding does not judge");
});

test("'/goal ' with an empty condition does not seed", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("unused");
  const ctx = makeCtx({
    transcript: [{ role: "user", content: "/goal    " }],
  });
  // no condition → skip the set; no prior state → none
  assert.deepEqual(await run(ctx, host), { kind: "none" });
  assert.equal(host.store.size, 0);
});

test("no command and no stored state → {kind:'none'}", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("MET: no - x");
  assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
  assert.equal(host.sideModelCalls.length, 0);
});

test("active goal, judge says not met → continue + turn incremented + state persisted", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("MET: no - not there yet", {
    "conv-123": JSON.stringify({
      condition: "reach 100 stars",
      status: "active",
      turns: 3,
    }),
  });
  const ctx = makeCtx({
    transcript: [
      { role: "user", content: "keep pushing" },
      { role: "assistant", content: "made progress" },
    ],
  });
  const directive = await run(ctx, host);

  assert.deepEqual(directive, {
    kind: "continue",
    text: "Keep working toward the goal: reach 100 stars. Judge feedback: MET: no - not there yet",
  });

  // judge was consulted with the right pref key + a prompt carrying the goal
  // and the rendered transcript
  assert.equal(host.sideModelCalls.length, 1);
  const args = host.sideModelCalls[0];
  assert.equal(args.model_pref_key, JUDGE_PREF_KEY);
  assert.ok(args.system.includes("MET:"), "system frames the MET: verdict format");
  assert.ok(args.prompt.includes("reach 100 stars"), "prompt carries the goal");
  assert.ok(args.prompt.includes("user: keep pushing"), "prompt renders transcript");
  assert.ok(
    args.prompt.includes("assistant: made progress"),
    "prompt renders assistant turn"
  );

  // state persisted: turns 3 → 4, still active, last_reason recorded
  const stored = JSON.parse(host.store.get("conv-123"));
  assert.equal(stored.turns, 4);
  assert.equal(stored.status, "active");
  assert.equal(stored.condition, "reach 100 stars");
  assert.equal(stored.last_reason, "MET: no - not there yet");
});

test("active goal, judge says met → note + state cleared", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("MET: yes - all done", {
    "conv-123": JSON.stringify({
      condition: "finish the task",
      status: "active",
      turns: 2,
    }),
  });
  const directive = await run(makeCtx(), host);

  assert.deepEqual(directive, {
    kind: "note",
    text: "Goal met. MET: yes - all done",
  });
  assert.equal(host.store.has("conv-123"), false, "met goal is cleared");
  assert.equal(host.sideModelCalls.length, 1);
});

test("case-insensitive verdict: 'met: YES' still counts as met", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("met: YES — good enough", {
    "conv-123": JSON.stringify({ condition: "c", status: "active", turns: 0 }),
  });
  const directive = await run(makeCtx(), host);
  assert.equal(directive.kind, "note");
  assert.ok(directive.text.startsWith("Goal met."));
});

test("turn cap: at 25 turns the loop stops without judging", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("MET: no - keep going", {
    "conv-123": JSON.stringify({ condition: "c", status: "active", turns: 25 }),
  });
  const directive = await run(makeCtx(), host);
  assert.deepEqual(directive, {
    kind: "note",
    text: "Goal stopped after 25 turns.",
  });
  assert.equal(host.store.has("conv-123"), false, "state cleared at the cap");
  assert.equal(host.sideModelCalls.length, 0, "no judge call once capped");
});

test("corrupt stored state → {kind:'none'} (fail-safe, no judge)", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("MET: no", { "conv-123": "not-json{" });
  assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
  assert.equal(host.sideModelCalls.length, 0);
});

test("non-active stored status → {kind:'none'}", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("MET: no", {
    "conv-123": JSON.stringify({ condition: "c", status: "done", turns: 1 }),
  });
  assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
  assert.equal(host.sideModelCalls.length, 0);
});

test("command detection uses the NEWEST user turn (reverse scan)", async () => {
  const run = loadHookRunner(JSON.parse(raw));
  const host = makeHost("unused", {
    "conv-123": JSON.stringify({ condition: "c", status: "active", turns: 0 }),
  });
  // an OLD '/goal clear' precedes a newer ordinary user turn — must NOT clear
  const ctx = makeCtx({
    transcript: [
      { role: "user", content: "/goal clear" },
      { role: "assistant", content: "cleared" },
      { role: "user", content: "actually keep going" },
      { role: "assistant", content: "ok" },
    ],
  });
  const directive = await run(ctx, host);
  // newest user turn is not a command → falls through to the active-goal judge loop
  assert.equal(directive.kind, "continue");
  assert.equal(host.store.has("conv-123"), true, "state survived (no stale clear)");
  assert.equal(host.sideModelCalls.length, 1, "judge ran on the active goal");
});
