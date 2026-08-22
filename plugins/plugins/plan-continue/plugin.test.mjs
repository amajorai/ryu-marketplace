// Co-located, zero-dependency test for the `plan-continue` plugin.
// Run with:  node --test plugins-store/plugins/plan-continue/plugin.test.mjs
//
// The plugin's whole behaviour is the sandboxed hook body Core runs with an
// injected `ctx` and a `host` capability facade (apps/core/src/plugin_host/mod.rs,
// build_hook_program). This test hydrates the manifest's `code_file` the way Core
// does, runs that exact body against a realistic ctx and a stub host, and asserts
// the directive and storage side effects. It never edits manifest.json.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const PLAN_FLAG = "ryu.plan";
const MARKER = "[auto-continue]";
const MAX_CONSECUTIVE = 3;

const raw = readFileSync(MANIFEST_PATH, "utf8");

// ── code_file hydration ───────────────────────────────────────────────────────
// This plugin keeps its sandboxed JS in a real file (`hooks/loop.js`) and points
// at it with `code_file`. Core resolves that into the inline `code` string at
// parse time (`PluginManifest::hydrate_code_files`), so every consumer — the
// sandbox included — only ever sees `code`. Mirror that here, or the assertions
// below read an empty body and silently pass.
function hydrateCodeFiles(m) {
	const read = (rel) => readFileSync(join(HERE, rel), "utf8");
	for (const hook of m.contributes?.turn_hooks ?? []) {
		if (hook.code_file) {
			hook.code = read(hook.code_file);
			hook.code_file = undefined;
		}
	}
	return m;
}

/** The manifest as Core sees it: parsed, with every `code_file` hydrated. */
const parseManifest = () => hydrateCodeFiles(JSON.parse(raw));

// Core wraps the hook body in an async IIFE where a bare `return` reports the
// directive as the program's final value. AsyncFunction(body) reproduces that.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function loadHookRunner(manifest) {
	const hook = manifest.contributes.turn_hooks[0];
	const fn = new AsyncFunction("ctx", "host", hook.code);
	return (ctx, host) => fn(ctx, host);
}

const auto = (body) =>
	`${MARKER} Ryu generated this message; the user did not type it.\n\n${body ?? "keep planning"}`;

function makeCtx(overrides = {}) {
	return {
		conversation_id: "conv-123",
		agent_id: "ryu",
		transcript: [
			{ role: "user", content: "plan the migration" },
			{ role: "assistant", content: "looking into it" },
		],
		flags: { [PLAN_FLAG]: true },
		input: null,
		...overrides,
	};
}

// Stub host mirroring Core's facade: storage.set stringifies non-strings,
// storage.get returns the STRING (never the object), storage.delete removes.
function makeHost(seed = {}) {
	const store = new Map(Object.entries(seed));
	return {
		store,
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

test("manifest.json is valid JSON with id/name/version", () => {
	const m = parseManifest();
	assert.equal(m.id, "@ryu/plan-continue");
	assert.ok(typeof m.name === "string" && m.name.length > 0);
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("declared contributes fields are well-formed", () => {
	const m = parseManifest();

	// The only capability the hook reaches for is its own KV (the off switch).
	assert.deepEqual(m.permission_grants, ["storage:kv"]);

	const cmd = m.contributes.slash_commands[0];
	assert.equal(cmd.command, "/plan-continue");
	assert.equal(typeof cmd.description, "string");

	const hook = m.contributes.turn_hooks[0];
	assert.equal(hook.on, "post_assistant_turn");
	// The flag pre-gate is what keeps the sandbox from spawning on every turn of
	// every chat; the command wakes the hook so the off switch works.
	assert.equal(hook.match.flag, PLAN_FLAG);
	assert.deepEqual(hook.match.commands, ["/plan-continue"]);
	// `stateful` would wake the hook on every later turn of any conversation that
	// once used the off switch. The streak is counted from the transcript instead,
	// so there is no counter in KV that needs waking to be cleared.
	assert.equal(hook.match.stateful, undefined);
	assert.equal(typeof hook.code, "string");
	assert.ok(hook.code.includes(MARKER), "hook stamps the auto-continue marker");
});

test("no sandboxed code is inlined into the manifest", () => {
	const m = JSON.parse(raw);
	for (const hook of m.contributes.turn_hooks) {
		assert.equal(hook.code, undefined, "hook bodies live in hooks/*.js");
		assert.match(hook.code_file, /^hooks\/[a-z0-9-]+\.js$/);
	}
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(HERE, "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}

	// There is no fixture COPY. Core `include_str!`s this manifest straight from
	// its package home, so a resurrected copy is a dead-edit trap.
	const stale = join(
		coreSrc,
		"plugin_manifest",
		"fixtures",
		"plan-continue.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory.`
	);

	// Registration seam: forgetting either include_str! leaves every other guard
	// passing while the plugin simply does not exist at runtime.
	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/plan-continue/manifest.json")'
		),
		"Core does not compile this manifest in from its package home"
	);
	const code = readFileSync(
		join(coreSrc, "plugin_manifest", "builtin_code.rs"),
		"utf8"
	);
	assert.ok(
		code.includes(
			'include_str!("../../../../plugins-store/plugins/plan-continue/hooks/loop.js")'
		),
		"Core does not embed hooks/loop.js — a built-in cannot resolve a code_file at runtime"
	);
});

// ── Hook behaviour ───────────────────────────────────────────────────────────

test("no conversation_id → none", async () => {
	const run = loadHookRunner(parseManifest());
	assert.deepEqual(await run(makeCtx({ conversation_id: null }), makeHost()), {
		kind: "none",
	});
});

test("plan mode on, plan unfinished → a marked continue", async () => {
	const run = loadHookRunner(parseManifest());
	const directive = await run(makeCtx(), makeHost());
	assert.equal(directive.kind, "continue");
	assert.ok(
		directive.text.startsWith(`${MARKER} Ryu generated this message`),
		"the injected turn is labelled as not user-typed"
	);
	assert.ok(
		directive.text.includes("ExitPlanMode"),
		"the model is told how to finish"
	);
});

test("plan mode off (approved ExitPlanMode wrote the flag back) → none", async () => {
	const run = loadHookRunner(parseManifest());
	assert.deepEqual(await run(makeCtx({ flags: {} }), makeHost()), {
		kind: "none",
	});
	assert.deepEqual(
		await run(makeCtx({ flags: { [PLAN_FLAG]: false } }), makeHost()),
		{ kind: "none" }
	);
});

test("cap: stops after MAX_CONSECUTIVE auto-continuations", async () => {
	const run = loadHookRunner(parseManifest());
	const transcript = [{ role: "user", content: "plan the migration" }];
	for (let i = 0; i < MAX_CONSECUTIVE; i++) {
		transcript.push({ role: "assistant", content: `step ${i}` });
		transcript.push({ role: "user", content: auto() });
	}
	transcript.push({ role: "assistant", content: "still going" });

	const directive = await run(makeCtx({ transcript }), makeHost());
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.includes(String(MAX_CONSECUTIVE)));
});

test("cap counts CONSECUTIVE runs: a real user message resets the streak", async () => {
	const run = loadHookRunner(parseManifest());
	const transcript = [];
	for (let i = 0; i < MAX_CONSECUTIVE; i++) {
		transcript.push({ role: "user", content: auto() });
		transcript.push({ role: "assistant", content: `step ${i}` });
	}
	// The user typed something themselves after the capped streak.
	transcript.push({ role: "user", content: "also cover rollback" });
	transcript.push({ role: "assistant", content: "rollback notes" });

	const directive = await run(makeCtx({ transcript }), makeHost());
	assert.equal(directive.kind, "continue");
});

test("no progress: two identical non-empty replies stop the loop", async () => {
	const run = loadHookRunner(parseManifest());
	const transcript = [
		{ role: "user", content: "plan it" },
		{ role: "assistant", content: "here is the plan" },
		{ role: "user", content: auto() },
		{ role: "assistant", content: "here is the plan" },
	];
	const directive = await run(makeCtx({ transcript }), makeHost());
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.includes("identical"));
});

test("no progress rule ignores EMPTY replies (tool-only plan turns)", async () => {
	// Tool rows live in the sealed `parts` column, so an investigate-only turn
	// persists empty `content`. Comparing those would stop the loop exactly when
	// continuing is most useful.
	const run = loadHookRunner(parseManifest());
	const transcript = [
		{ role: "user", content: "plan it" },
		{ role: "assistant", content: "" },
		{ role: "user", content: auto() },
		{ role: "assistant", content: "   " },
	];
	const directive = await run(makeCtx({ transcript }), makeHost());
	assert.equal(directive.kind, "continue");
});

test("a stalled reply with no streak of ours is silently none", async () => {
	const run = loadHookRunner(parseManifest());
	const transcript = [
		{ role: "user", content: "plan it" },
		{ role: "assistant", content: "same answer" },
		{ role: "user", content: "plan it again" },
		{ role: "assistant", content: "same answer" },
	];
	assert.deepEqual(await run(makeCtx({ transcript }), makeHost()), {
		kind: "none",
	});
});

test("'/plan-continue off' stores the opt-out and reports it", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	const ctx = makeCtx({
		transcript: [
			{ role: "assistant", content: "planning" },
			{ role: "user", content: "/plan-continue off" },
			{ role: "assistant", content: "ok" },
		],
	});
	const directive = await run(ctx, host);
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.includes("off"));
	assert.deepEqual(JSON.parse(host.store.get("conv-123")), { auto: "off" });
});

test("the stored opt-out suppresses the loop even with plan mode on", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ "conv-123": JSON.stringify({ auto: "off" }) });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
});

test("'/plan-continue on' clears the opt-out", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ "conv-123": JSON.stringify({ auto: "off" }) });
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "/plan-continue on" }],
	});
	const directive = await run(ctx, host);
	assert.equal(directive.kind, "note");
	assert.equal(host.store.has("conv-123"), false);
});

test("corrupt stored state fails quiet (no tokens spent on a bad read)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ "conv-123": "not-json{" });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
});

test("the off switch is checked before the flag, so it works mid-plan", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	const ctx = makeCtx({
		flags: {},
		transcript: [{ role: "user", content: "/plan-continue off" }],
	});
	const directive = await run(ctx, host);
	assert.equal(directive.kind, "note");
	assert.ok(host.store.has("conv-123"));
});
