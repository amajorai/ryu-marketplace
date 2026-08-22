// Co-located, zero-dependency test for the `proof` plugin.
// Run with:  node --test plugins-store/plugins/proof/plugin.test.mjs
//
// `proof` is an INLINE-HOOK plugin: its behaviour lives entirely in the JS
// string at contributes.turn_hooks[0].code, which Core runs in a sandbox with an
// injected `ctx` and a `host` capability facade (see
// apps/core/src/plugin_host/mod.rs, build_hook_program). This test extracts that
// exact string and RUNS it against a realistic mock ctx + a stub host whose
// storage + runAgent mirror the real facade, asserting the returned directive
// matches the hook's state-machine logic. It never edits manifest.json.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");

const raw = readFileSync(MANIFEST_PATH, "utf8");

// ── code_file hydration ───────────────────────────────────────────────────────
// This plugin keeps its sandboxed JS in real files (`hooks/*.js`, `adapters/*.js`)
// and references them from the manifest by `code_file`. Core resolves those into
// the inline `code` string at parse time (`PluginManifest::hydrate_code_files`),
// so every consumer — including the sandbox — only ever sees `code`. Mirror that
// here, or the assertions below would read an empty body and silently pass.
function hydrateCodeFiles(m) {
	const read = (rel) => readFileSync(join(HERE, rel), "utf8");
	for (const hook of m.contributes?.turn_hooks ?? []) {
		if (hook.code_file) {
			hook.code = read(hook.code_file);
			hook.code_file = undefined;
		}
	}
	for (const entry of m.provides ?? []) {
		for (const binding of Object.values(entry.tools ?? {})) {
			if (binding.adapter?.code_file) {
				binding.adapter.code = read(binding.adapter.code_file);
				binding.adapter.code_file = undefined;
			}
		}
	}
	return m;
}

/** The manifest as Core sees it: parsed, with every `code_file` hydrated. */
const parseManifest = () => hydrateCodeFiles(JSON.parse(raw));

// Core wraps the hook body in an async IIFE where a bare `return` reports the
// directive as the program's final value. AsyncFunction(body) reproduces that:
// the body runs as an async function taking (ctx, host) and its `return` is the
// resolved value. Mirrors build_hook_program / run_hook in Core.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function loadHookRunner(manifest) {
	const hook = manifest.contributes.turn_hooks[0];
	const fn = new AsyncFunction("ctx", "host", hook.code);
	return (ctx, host) => fn(ctx, host);
}

// A realistic post_assistant_turn ctx (mirrors HookContext in Core: transcript
// oldest→newest of {role, content}, conversation_id, agent_id, per-request flags).
function makeCtx(overrides = {}) {
	return {
		conversation_id: "conv-abc",
		agent_id: "ryu",
		transcript: [
			{ role: "user", content: "make the build pass" },
			{ role: "assistant", content: "Done, I fixed it." },
		],
		flags: {},
		input: null,
		...overrides,
	};
}

// Stub host mirroring the real facade built in build_hook_program:
//   - storage.set stringifies non-string values (typeof v === "string" ? v : JSON.stringify(v))
//   - storage.get returns the stored string, or null when absent (Ok(None) → Value::Null)
//   - storage.delete removes the key
//   - runAgent returns a canned string verdict; calls are recorded
function makeHost({ verdict = "", seed } = {}) {
	const kv = new Map();
	if (seed !== undefined) {
		kv.set("conv-abc", typeof seed === "string" ? seed : JSON.stringify(seed));
	}
	const runAgentCalls = [];
	return {
		kv,
		runAgentCalls,
		runAgent: async (args) => {
			runAgentCalls.push(args);
			return typeof verdict === "function" ? verdict(args) : verdict;
		},
		storage: {
			get: async (k) => (kv.has(String(k)) ? kv.get(String(k)) : null),
			set: async (k, v) => {
				kv.set(String(k), typeof v === "string" ? v : JSON.stringify(v));
				return true;
			},
			delete: async (k) => {
				kv.delete(String(k));
				return true;
			},
			keys: async () => Array.from(kv.keys()),
		},
	};
}

// ── Manifest / contract shape ────────────────────────────────────────────────

test("manifest.json is valid JSON with id/name/version", () => {
	const m = parseManifest();
	assert.equal(typeof m, "object");
	assert.equal(m.id, "@ryu/proof");
	assert.equal(typeof m.name, "string");
	assert.ok(m.name.length > 0);
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("declared contributes fields are well-formed", () => {
	const m = parseManifest();

	// grants required to reach host.runAgent + host.storage
	assert.ok(
		Array.isArray(m.permission_grants) &&
			m.permission_grants.includes("hook:run-agent"),
		"must grant hook:run-agent"
	);
	assert.ok(
		m.permission_grants.includes("storage:kv"),
		"must grant storage:kv"
	);

	// /proof slash command
	const cmd = m.contributes.slash_commands[0];
	assert.equal(cmd.command, "/proof");
	assert.equal(typeof cmd.description, "string");

	// verifier model picker writes the pref key referenced conceptually by the hook
	const field = m.contributes.settings_tabs[0].fields[0];
	assert.equal(field.type, "model_picker");
	assert.equal(field.pref_key, "proof-verifier-model");

	// the inline hook itself
	const hook = m.contributes.turn_hooks[0];
	assert.equal(hook.on, "post_assistant_turn");
	assert.deepEqual(hook.match.commands, ["/proof"]);
	assert.equal(hook.match.stateful, true);
	assert.equal(typeof hook.code, "string");
	assert.ok(
		hook.code.includes("host.runAgent"),
		"hook drives an independent verifier agent"
	);
	assert.ok(
		hook.code.includes("host.storage"),
		"hook persists goal state across turns"
	);
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}

	// There is no fixture COPY any more. Core `include_str!`s this manifest straight
	// from its package home, so a resurrected copy is a dead-edit trap: the fixture
	// would WIN for any include_str! still pointing at fixtures/, and edits made here
	// would silently go nowhere. Core asserts this across all packages; repeating it
	// per plugin is what makes a failure name the plugin that regressed.
	const stale = join(
		coreSrc,
		"plugin_manifest",
		"fixtures",
		"proof.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory. Delete the fixture copy.`
	);

	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	// Registration seam: forgetting the include_str! leaves every other guard passing
	// while the plugin simply does not exist at runtime. Compiled in via BUILTIN_MANIFESTS.
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/proof/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});

// ── Hook state machine ───────────────────────────────────────────────────────

test("returns {kind:'none'} when there is no conversation_id", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	assert.deepEqual(await run(makeCtx({ conversation_id: null }), host), {
		kind: "none",
	});
	assert.equal(host.runAgentCalls.length, 0);
});

test("'/proof clear' deletes stored goal and notes it cleared", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		seed: { condition: "x", status: "active", turns: 3 },
	});
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "/proof clear" }],
	});
	assert.deepEqual(await run(ctx, host), {
		kind: "note",
		text: "Proof goal cleared.",
	});
	assert.equal(host.kv.has("conv-abc"), false, "goal removed from storage");
	assert.equal(host.runAgentCalls.length, 0, "no verifier on clear");
});

test("'/proof stop' also clears the goal", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		seed: { condition: "x", status: "active", turns: 1 },
	});
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "  /proof stop  " }],
	});
	assert.deepEqual(await run(ctx, host), {
		kind: "note",
		text: "Proof goal cleared.",
	});
	assert.equal(host.kv.has("conv-abc"), false);
});

test("'/proof <condition>' stores an active goal and continues", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "/proof the test suite passes green" },
			{ role: "assistant", content: "ok" },
		],
	});
	const directive = await run(ctx, host);
	assert.deepEqual(directive, {
		kind: "continue",
		text: "Begin working toward this goal: the test suite passes green",
	});

	// no verifier runs on the round that merely sets the goal
	assert.equal(host.runAgentCalls.length, 0);

	// storage holds a fresh active goal at turn 0
	const stored = JSON.parse(host.kv.get("conv-abc"));
	assert.deepEqual(stored, {
		condition: "the test suite passes green",
		status: "active",
		turns: 0,
	});
});

test("plain turn with no stored goal is a no-op", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.runAgentCalls.length, 0);
});

test("active goal + VERIFIED:yes → confirmed note, goal cleared", async () => {
	const run = loadHookRunner(parseManifest());
	const verdict =
		"I ran the suite and read the output.\nVERIFIED: yes - all 1298 tests pass";
	const host = makeHost({
		verdict,
		seed: {
			condition: "the test suite passes green",
			status: "active",
			turns: 2,
		},
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "keep going" },
			{ role: "assistant", content: "I believe it is done now." },
		],
	});

	const directive = await run(ctx, host);
	assert.equal(directive.kind, "note");
	assert.ok(
		directive.text.startsWith(
			"Proof of work confirmed by an independent verifier agent."
		)
	);
	assert.ok(directive.text.includes("VERIFIED: yes"));

	// goal is removed once proven
	assert.equal(host.kv.has("conv-abc"), false);

	// the verifier was actually driven with the right shape
	assert.equal(host.runAgentCalls.length, 1);
	const call = host.runAgentCalls[0];
	assert.equal(call.agent_id, "ryu");
	assert.equal(call.preset, "code_read");
	assert.ok(
		call.task.includes("the test suite passes green"),
		"task carries the goal"
	);
	assert.ok(
		call.task.includes("INDEPENDENT"),
		"task frames an independent verifier"
	);
	assert.ok(
		call.task.includes("I believe it is done now."),
		"task carries the transcript claims"
	);
});

test("active goal + VERIFIED:no → continue with report, turns incremented, goal kept", async () => {
	const run = loadHookRunner(parseManifest());
	const verdict =
		"I read src/x.rs and the function is still a stub.\nVERIFIED: no - the fix is not implemented";
	const host = makeHost({
		verdict,
		seed: { condition: "implement the fix", status: "active", turns: 4 },
	});

	const directive = await run(makeCtx(), host);
	assert.equal(directive.kind, "continue");
	assert.ok(directive.text.includes("could NOT yet prove"));
	assert.ok(
		directive.text.includes("VERIFIED: no"),
		"verifier report is forwarded"
	);

	// goal stays active, turn counter advanced, last verdict recorded
	const stored = JSON.parse(host.kv.get("conv-abc"));
	assert.equal(stored.status, "active");
	assert.equal(stored.turns, 5, "turns incremented from 4 → 5");
	assert.equal(stored.condition, "implement the fix");
	assert.equal(stored.last_verdict, verdict);
});

test("goal stops after 12 verification rounds without running the verifier", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict: "VERIFIED: yes - should never be consulted",
		seed: { condition: "x", status: "active", turns: 12 },
	});
	const directive = await run(makeCtx(), host);
	assert.deepEqual(directive, {
		kind: "note",
		text: "Proof goal stopped after 12 verification rounds.",
	});
	assert.equal(
		host.runAgentCalls.length,
		0,
		"cap is enforced before spawning a verifier"
	);
	assert.equal(host.kv.has("conv-abc"), false, "goal removed at the cap");
});

test("corrupt stored state degrades to {kind:'none'}", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ seed: "}{ not json" });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.runAgentCalls.length, 0);
});

test("empty '/proof ' condition does not create a goal", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "/proof    " }],
	});
	// no condition captured, nothing stored → falls through to the (empty) read → none
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.kv.has("conv-abc"), false);
	assert.equal(host.runAgentCalls.length, 0);
});
