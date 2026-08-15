// Co-located, zero-dependency test for the `auto-continue` plugin.
// Run with:  node --test plugins-store/auto-continue/plugin.test.mjs
//
// The plugin's whole behaviour is the sandboxed hook body Core runs with an
// injected `ctx` and a `host` capability facade (apps/core/src/plugin_host/mod.rs,
// build_hook_program). This test hydrates the manifest's `code_file` the way Core
// does, runs that exact body against a realistic ctx and a stub host whose
// storage + runAgent mirror the real facade, and asserts the directive and storage
// side effects. It never edits manifest.json.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const MARKER = "[auto-continue]";
const MAX_CONSECUTIVE = 5;

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
	`${MARKER} Ryu generated this message; the user did not type it.\n\n${body ?? "keep going"}`;

function makeCtx(overrides = {}) {
	return {
		conversation_id: "conv-123",
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

// Stub host mirroring Core's facade: storage.set stringifies non-strings,
// storage.get returns the STRING (never the object), storage.delete removes.
// runAgent returns a canned verdict and records the calls so tests can assert on
// the scanner task that was constructed.
function makeHost({ verdict = "", seed = null } = {}) {
	const store = new Map();
	if (seed !== null) {
		store.set(
			"conv-123",
			typeof seed === "string" ? seed : JSON.stringify(seed)
		);
	}
	const runAgentCalls = [];
	return {
		store,
		runAgentCalls,
		runAgent: async (args) => {
			runAgentCalls.push(args);
			if (typeof verdict === "function") {
				return verdict(args);
			}
			if (verdict instanceof Error) {
				throw verdict;
			}
			return verdict;
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

const armed = { status: "active" };

// ── Manifest / contract ──────────────────────────────────────────────────────

test("manifest.json is valid JSON with id/name/version", () => {
	const m = parseManifest();
	assert.equal(m.id, "@ryu/auto-continue");
	assert.ok(typeof m.name === "string" && m.name.length > 0);
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("declared contributes fields are well-formed", () => {
	const m = parseManifest();

	// The two capabilities the hook reaches for: its own KV (the arming switch)
	// and a local scanner sub-agent.
	assert.deepEqual(m.permission_grants, ["hook:run-agent", "storage:kv"]);

	const cmd = m.contributes.slash_commands[0];
	assert.equal(cmd.command, "/auto-continue");
	assert.equal(typeof cmd.description, "string");

	const hook = m.contributes.turn_hooks[0];
	assert.equal(hook.on, "post_assistant_turn");
	assert.deepEqual(hook.match.commands, ["/auto-continue"]);
	// `stateful` is what makes presence of the KV record the arming switch: an
	// unarmed conversation costs one KV read in the Rust pre-gate, never a
	// sandbox spawn, and the switch is off by default.
	assert.equal(hook.match.stateful, true);
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
		"auto-continue.manifest.json"
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
			'include_str!("../../../../plugins-store/auto-continue/manifest.json")'
		),
		"Core does not compile this manifest in from its package home"
	);
	const code = readFileSync(
		join(coreSrc, "plugin_manifest", "builtin_code.rs"),
		"utf8"
	);
	assert.ok(
		code.includes(
			'include_str!("../../../../plugins-store/auto-continue/hooks/loop.js")'
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

test("unarmed (no KV record, no command) → none", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(
		host.runAgentCalls.length,
		0,
		"scanner must not run while unarmed"
	);
});

test("garbled stored record fails quiet (no scanner call on an untrusted read)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ seed: "not-json{" });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.runAgentCalls.length, 0);
});

test("'/auto-continue on' arms and reports it", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "/auto-continue on" }],
	});
	const directive = await run(ctx, host);
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.includes("on"));
	assert.deepEqual(JSON.parse(host.store.get("conv-123")), armed);
});

test("'/auto-continue off' disarms and reports it", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ seed: armed });
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "/auto-continue off" }],
	});
	const directive = await run(ctx, host);
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.includes("off"));
	assert.equal(host.store.has("conv-123"), false);
});

test("armed + scanner DONE → none", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict: "VERDICT: DONE - the build is green",
		seed: armed,
	});
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
});

test("armed + scanner BLOCKED → none (a blocked task must never continue)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict: "VERDICT: BLOCKED - needs the user to choose the database",
		seed: armed,
	});
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
});

test("armed + scanner CONTINUE → a marked continue carrying the findings", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict:
			"VERDICT: CONTINUE - the migration script is only half-written and test still fails",
		seed: armed,
	});
	const directive = await run(makeCtx(), host);
	assert.equal(directive.kind, "continue");
	assert.ok(
		directive.text.startsWith(`${MARKER} Ryu generated this message`),
		"the injected turn is labelled as not user-typed"
	);
	assert.ok(
		directive.text.includes("half-written"),
		"the scanner's findings are carried into the injected turn"
	);
});

test("scanner reply without a verdict line → none (fail quiet)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict: "I looked at it and there are things to do.",
		seed: armed,
	});
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
});

test("scanner throw → none, and the hook logs it", async () => {
	const run = loadHookRunner(parseManifest());
	const logs = [];
	const host = makeHost({
		verdict: new Error("agent runner down"),
		seed: armed,
	});
	host.log = (...a) => logs.push(a.join(" "));
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.ok(logs.length > 0, "the failure is logged");
});

test("the scanner task carries the transcript and asks for the exact verdict lines", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ verdict: "VERDICT: DONE - ok", seed: armed });
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "add a retry loop" },
			{ role: "assistant", content: "implemented" },
		],
	});
	await run(ctx, host);
	assert.equal(host.runAgentCalls.length, 1);
	const task = host.runAgentCalls[0].task;
	assert.ok(
		task.includes("add a retry loop"),
		"the user's request reaches the scanner"
	);
	assert.ok(task.includes("implemented"), "the reply reaches the scanner");
	assert.ok(
		task.includes("VERDICT: CONTINUE"),
		"scanner is told the verdict grammar"
	);
	assert.equal(host.runAgentCalls[0].preset, "code_read");
});

test("cap: stops after MAX_CONSECUTIVE auto-continuations", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict: "VERDICT: CONTINUE - keep going",
		seed: armed,
	});
	const transcript = [{ role: "user", content: "finish the feature" }];
	for (let i = 0; i < MAX_CONSECUTIVE; i++) {
		transcript.push({ role: "assistant", content: `step ${i}` });
		transcript.push({ role: "user", content: auto() });
	}
	transcript.push({ role: "assistant", content: "still going" });

	const directive = await run(makeCtx({ transcript }), host);
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.includes(String(MAX_CONSECUTIVE)));
	assert.equal(
		host.runAgentCalls.length,
		0,
		"the cap stops before the scanner even runs"
	);
});

test("cap counts CONSECUTIVE runs: a real user message resets the streak", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ verdict: "VERDICT: CONTINUE - more", seed: armed });
	const transcript = [];
	for (let i = 0; i < MAX_CONSECUTIVE; i++) {
		transcript.push({ role: "user", content: auto() });
		transcript.push({ role: "assistant", content: `step ${i}` });
	}
	// The user typed something themselves after the capped streak.
	transcript.push({ role: "user", content: "also cover rollback" });
	transcript.push({ role: "assistant", content: "rollback notes" });

	const directive = await run(makeCtx({ transcript }), host);
	assert.equal(directive.kind, "continue");
});

test("no progress: two identical non-empty replies stop the loop", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict: "VERDICT: CONTINUE - keep going",
		seed: armed,
	});
	const transcript = [
		{ role: "user", content: "finish it" },
		{ role: "assistant", content: "here is the result" },
		{ role: "user", content: auto() },
		{ role: "assistant", content: "here is the result" },
	];
	const directive = await run(makeCtx({ transcript }), host);
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.includes("identical"));
	assert.equal(
		host.runAgentCalls.length,
		0,
		"a stalled loop must not spend another scanner call"
	);
});

test("no progress rule ignores EMPTY replies (tool-only turns)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ verdict: "VERDICT: CONTINUE - more", seed: armed });
	const transcript = [
		{ role: "user", content: "finish it" },
		{ role: "assistant", content: "" },
		{ role: "user", content: auto() },
		{ role: "assistant", content: "   " },
	];
	const directive = await run(makeCtx({ transcript }), host);
	assert.equal(directive.kind, "continue");
});

test("a stalled reply with no streak of ours is silently none", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ verdict: "VERDICT: CONTINUE - more", seed: armed });
	const transcript = [
		{ role: "user", content: "finish it" },
		{ role: "assistant", content: "same answer" },
		{ role: "user", content: "finish it again" },
		{ role: "assistant", content: "same answer" },
	];
	assert.deepEqual(await run(makeCtx({ transcript }), host), { kind: "none" });
});
