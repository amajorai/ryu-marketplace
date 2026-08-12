// Co-located, zero-dependency test for the `receipts` plugin.
// Run with:  node --test plugins-store/receipts/plugin.test.mjs
//
// `receipts` is a HOOK plugin: its behaviour lives entirely in the JS body Core
// runs in a sandbox with an injected `ctx` and a `host` capability facade (see
// apps/core/src/plugin_host/mod.rs, build_hook_program). This test extracts that
// exact body and RUNS it against a realistic mock ctx + a stub host whose
// storage / runAgent / getPreference mirror the real facade, asserting the
// returned directive matches the hook's state machine. It never edits manifest.json.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");

const raw = readFileSync(MANIFEST_PATH, "utf8");

// ── code_file hydration ───────────────────────────────────────────────────────
// This plugin keeps its sandboxed JS in a real file (`hooks/loop.js`) and
// references it from the manifest by `code_file`. Core resolves that into the
// inline `code` string at parse time (`PluginManifest::hydrate_code_files`), so
// every consumer — including the sandbox — only ever sees `code`. Mirror that
// here, or the assertions below would read an empty body and silently pass.
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

// A realistic post_assistant_turn ctx (mirrors HookContext in Core: transcript
// oldest→newest of {role, content}, conversation_id, agent_id, per-request flags).
function makeCtx(overrides = {}) {
	return {
		conversation_id: "conv-abc",
		agent_id: "ryu",
		transcript: [
			{ role: "user", content: "make the login screen work" },
			{ role: "assistant", content: "Done, it works now." },
		],
		flags: {},
		input: null,
		...overrides,
	};
}

// Stub host mirroring the real facade built in build_hook_program:
//   - storage.set stringifies non-string values
//   - storage.get returns the stored string, or null when absent
//   - runAgent returns a canned verdict; calls are recorded
//   - getPreference returns the seeded string, or null
function makeHost({ verdict = "", seed, prefs = {} } = {}) {
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
		getPreference: async ({ key }) =>
			Object.hasOwn(prefs, key) ? prefs[key] : null,
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

const activeGoal = (over = {}) => ({
	condition: "the login screen works",
	status: "active",
	rounds: 0,
	nudges: 0,
	submitted: [],
	...over,
});

// ── Manifest / contract shape ────────────────────────────────────────────────

test("manifest.json is valid JSON with id/name/version", () => {
	const m = parseManifest();
	assert.equal(m.id, "@ryu/receipts");
	assert.equal(typeof m.name, "string");
	assert.ok(m.name.length > 0);
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("declared contributes fields are well-formed", () => {
	const m = parseManifest();

	// grants required to reach host.runAgent / host.storage / host.getPreference
	for (const grant of ["hook:run-agent", "storage:kv", "preferences:read"]) {
		assert.ok(
			m.permission_grants.includes(grant),
			`must grant ${grant} — the hook calls it`
		);
	}

	const cmd = m.contributes.slash_commands[0];
	assert.equal(cmd.command, "/receipt");
	assert.equal(typeof cmd.description, "string");

	// Settings write the two pref keys the hook actually reads. `proof` declares a
	// model_picker its hook never consults (runAgent takes no model); don't copy that.
	const keys = m.contributes.settings_tabs[0].fields.map((f) => f.pref_key);
	assert.deepEqual(keys, ["receipts-evidence-kind", "receipts-max-rounds"]);
	const hookCode = m.contributes.turn_hooks[0].code;
	for (const key of keys) {
		assert.ok(
			hookCode.includes(key),
			`settings declare ${key} but the hook never reads it`
		);
	}

	const hook = m.contributes.turn_hooks[0];
	assert.equal(hook.on, "post_assistant_turn");
	assert.deepEqual(hook.match.commands, ["/receipt"]);
	assert.equal(hook.match.stateful, true);
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
	const coreSrc = join(HERE, "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}

	// There is no fixture COPY any more. Core `include_str!`s this manifest straight
	// from its package home, so a resurrected copy is a dead-edit trap.
	const stale = join(
		coreSrc,
		"plugin_manifest",
		"fixtures",
		"receipts.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory. Delete the fixture copy.`
	);

	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/receipts/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);

	// A built-in ships only its manifest; the sandbox body must be embedded too or
	// the `code_file` cannot be resolved on a user's machine.
	const table = readFileSync(
		join(coreSrc, "plugin_manifest", "builtin_code.rs"),
		"utf8"
	);
	assert.ok(
		table.includes(
			'include_str!("../../../../plugins-store/receipts/hooks/loop.js")'
		),
		"hooks/loop.js is not embedded in builtin_code.rs — the hook body would be unresolvable at runtime"
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

test("'/receipt clear' and '/receipt stop' delete the stored goal", async () => {
	for (const cmd of ["/receipt clear", "  /receipt stop  "]) {
		const run = loadHookRunner(parseManifest());
		const host = makeHost({ seed: activeGoal({ rounds: 3 }) });
		const ctx = makeCtx({ transcript: [{ role: "user", content: cmd }] });
		assert.deepEqual(await run(ctx, host), {
			kind: "note",
			text: "Receipt goal cleared.",
		});
		assert.equal(host.kv.has("conv-abc"), false, "goal removed from storage");
		assert.equal(host.runAgentCalls.length, 0, "no verifier on clear");
	}
});

test("'/receipt <goal>' stores an active goal and issues the capture brief", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "/receipt the login screen works" },
			{ role: "assistant", content: "ok" },
		],
	});
	const directive = await run(ctx, host);
	assert.equal(directive.kind, "continue");
	assert.ok(directive.text.includes("the login screen works"));
	assert.ok(
		directive.text.includes("EVIDENCE: <absolute path to the captured file>"),
		"brief states the absolute-path contract with an unextractable placeholder"
	);
	assert.ok(
		directive.text.includes("FILE ON DISK"),
		"brief requires a durable file, not an inline image"
	);

	// no verifier runs on the round that merely sets the goal
	assert.equal(host.runAgentCalls.length, 0);

	const stored = JSON.parse(host.kv.get("conv-abc"));
	assert.deepEqual(stored, {
		condition: "the login screen works",
		status: "active",
		rounds: 0,
		nudges: 0,
		submitted: [],
	});
});

test("plain turn with no stored goal is a no-op", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.runAgentCalls.length, 0);
});

test("a turn with no artifact re-asks instead of verifying", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ seed: activeGoal() });
	const directive = await run(makeCtx(), host);
	assert.equal(directive.kind, "continue");
	assert.ok(directive.text.includes("No visual evidence was attached"));
	assert.equal(
		host.runAgentCalls.length,
		0,
		"no verifier round is spent when there is nothing to look at"
	);
	assert.equal(JSON.parse(host.kv.get("conv-abc")).nudges, 1);
});

test("the loop gives up after 3 turns that produce no artifact", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ seed: activeGoal({ nudges: 2 }) });
	const directive = await run(makeCtx(), host);
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.includes("no visual evidence was produced"));
	assert.equal(host.kv.has("conv-abc"), false);
	assert.equal(host.runAgentCalls.length, 0);
});

test("an EVIDENCE path drives the verifier and a yes verdict emits a receipt", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict:
			"The screenshot shows the dashboard after a successful login.\nEVIDENCE VERIFIED: yes - the logged-in dashboard is visible",
		seed: activeGoal({ rounds: 1 }),
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "keep going" },
			{
				role: "assistant",
				content: "It works now.\nEVIDENCE: /tmp/login-works.png",
			},
		],
	});

	const directive = await run(ctx, host);
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.startsWith("Receipt accepted."));
	assert.ok(directive.text.includes("/tmp/login-works.png"));
	assert.ok(directive.text.includes("EVIDENCE VERIFIED: yes"));
	assert.equal(host.kv.has("conv-abc"), false, "goal cleared once accepted");

	assert.equal(host.runAgentCalls.length, 1);
	const call = host.runAgentCalls[0];
	assert.equal(call.agent_id, "ryu");
	assert.equal(call.preset, "code_read");
	assert.ok(
		call.task.includes("the login screen works"),
		"task carries the goal"
	);
	assert.ok(
		call.task.includes("/tmp/login-works.png"),
		"task carries the artifact"
	);
	assert.ok(
		call.task.includes("INDEPENDENT visual-evidence verifier"),
		"task frames an independent visual verifier"
	);
	assert.ok(
		call.task.includes("EVIDENCE VERIFIED: no"),
		"task pins the verdict grammar"
	);
});

test("a no verdict continues with the report, records the artifact, increments rounds", async () => {
	const run = loadHookRunner(parseManifest());
	const verdict =
		"The window is blank.\nEVIDENCE VERIFIED: no - the screenshot shows an empty window";
	const host = makeHost({
		verdict,
		seed: activeGoal({ rounds: 4, nudges: 2 }),
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "keep going" },
			{ role: "assistant", content: "Fixed.\nEVIDENCE: /tmp/shot.png" },
		],
	});

	const directive = await run(ctx, host);
	assert.equal(directive.kind, "continue");
	assert.ok(directive.text.includes("does NOT show the goal done"));
	assert.ok(directive.text.includes("EVIDENCE VERIFIED: no"));

	const stored = JSON.parse(host.kv.get("conv-abc"));
	assert.equal(stored.status, "active");
	assert.equal(stored.rounds, 5, "rounds incremented from 4 → 5");
	assert.equal(stored.nudges, 0, "nudge counter resets once evidence arrives");
	assert.deepEqual(stored.submitted, ["/tmp/shot.png"]);
	assert.equal(stored.last_verdict, verdict);
});

test("resubmitting an already-rejected artifact is refused without a verifier round", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict: "EVIDENCE VERIFIED: yes - should never be consulted",
		seed: activeGoal({ rounds: 2, submitted: ["/tmp/shot.png"] }),
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "keep going" },
			{
				role: "assistant",
				content: "Here it is again.\nEVIDENCE: /tmp/shot.png",
			},
		],
	});

	const directive = await run(ctx, host);
	assert.equal(directive.kind, "continue");
	assert.ok(directive.text.includes("already submitted and already rejected"));
	assert.equal(
		host.runAgentCalls.length,
		0,
		"replay is rejected before spending a verifier round"
	);
	assert.equal(
		JSON.parse(host.kv.get("conv-abc")).rounds,
		2,
		"rounds unchanged"
	);
});

test("a fresh artifact alongside a replayed one still verifies, on the fresh one only", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict: "EVIDENCE VERIFIED: no - still broken",
		seed: activeGoal({ submitted: ["/tmp/old.png"] }),
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "keep going" },
			{
				role: "assistant",
				content: "EVIDENCE: /tmp/old.png\nEVIDENCE: /tmp/new.png",
			},
		],
	});

	await run(ctx, host);
	assert.equal(host.runAgentCalls.length, 1);
	const task = host.runAgentCalls[0].task;
	const thisRound = task.slice(
		task.indexOf("ARTIFACTS SUBMITTED THIS ROUND"),
		task.indexOf("Already submitted in earlier rounds")
	);
	assert.ok(thisRound.includes("/tmp/new.png"), "fresh artifact is verified");
	assert.ok(
		!thisRound.includes("/tmp/old.png"),
		"the replayed artifact is not presented as this round's evidence"
	);
	assert.ok(
		task.includes("is not new evidence"),
		"the verifier is told which paths were already rejected"
	);
});

test("extraction is bounded: bad extensions, over-long paths, and >4 artifacts are dropped", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict: "EVIDENCE VERIFIED: no - x",
		seed: activeGoal(),
	});
	const long = `/tmp/${"a".repeat(320)}.png`;
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "go" },
			{
				role: "assistant",
				content: [
					"EVIDENCE: /tmp/notes.txt", // not a media file
					`EVIDENCE: ${long}`, // over the path cap
					"EVIDENCE: `/tmp/a.png`", // backticks stripped
					"EVIDENCE: /tmp/b.mp4",
					"EVIDENCE: /tmp/c.webp",
					"EVIDENCE: /tmp/d.gif",
					"EVIDENCE: /tmp/e.png", // 5th accepted path — dropped by the cap
				].join("\n"),
			},
		],
	});

	await run(ctx, host);
	const task = host.runAgentCalls[0].task;
	// Assert on the artifact list, not the whole task: the task also quotes the raw
	// turn text as untrusted context, so rejected paths legitimately appear there.
	const listed = task.slice(
		task.indexOf("ARTIFACTS SUBMITTED THIS ROUND"),
		task.indexOf("What the other agent said")
	);
	for (const good of [
		"/tmp/a.png",
		"/tmp/b.mp4",
		"/tmp/c.webp",
		"/tmp/d.gif",
	]) {
		assert.ok(listed.includes(good), `${good} should be extracted`);
	}
	assert.ok(!listed.includes("/tmp/notes.txt"), "non-media path is rejected");
	assert.ok(!listed.includes(long), "over-long path is rejected");
	assert.ok(!listed.includes("/tmp/e.png"), "extraction stops at 4 artifacts");
	assert.deepEqual(JSON.parse(host.kv.get("conv-abc")).submitted, [
		"/tmp/a.png",
		"/tmp/b.mp4",
		"/tmp/c.webp",
		"/tmp/d.gif",
	]);
});

test("the capture brief cannot be echoed back as its own evidence", async () => {
	// The brief is injected into the next turn as a `continue` directive, and models
	// echo their instructions. A placeholder that looked like a real media path would
	// be re-extracted as a phantom artifact and burn a verifier round on a file that
	// never existed — so the brief must contain no extractable path.
	const run = loadHookRunner(parseManifest());

	// Capture the real brief from the goal-setting turn…
	const setup = makeHost();
	const brief = (
		await run(
			makeCtx({
				transcript: [
					{ role: "user", content: "/receipt the login screen works" },
				],
			}),
			setup
		)
	).text;

	// …then hand it straight back as the assistant's reply.
	const host = makeHost({
		verdict: "EVIDENCE VERIFIED: yes - should never be consulted",
		seed: activeGoal(),
	});
	const directive = await run(
		makeCtx({
			transcript: [
				{ role: "user", content: "go" },
				{ role: "assistant", content: brief },
			],
		}),
		host
	);

	assert.equal(
		host.runAgentCalls.length,
		0,
		"the brief's own placeholder must not be extracted as an artifact"
	);
	assert.equal(directive.kind, "continue");
	assert.ok(directive.text.includes("No visual evidence was attached"));
	assert.deepEqual(JSON.parse(host.kv.get("conv-abc")).submitted, []);
});

test("receipts-evidence-kind=still rejects a video artifact", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		seed: activeGoal(),
		prefs: { "receipts-evidence-kind": "still" },
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "go" },
			{ role: "assistant", content: "EVIDENCE: /tmp/demo.mp4" },
		],
	});
	const directive = await run(ctx, host);
	assert.equal(directive.kind, "continue");
	assert.ok(directive.text.includes("No visual evidence was attached"));
	assert.ok(
		directive.text.includes("a screenshot (PNG/JPG/WEBP)"),
		"the brief narrows to the configured evidence kind"
	);
	assert.equal(host.runAgentCalls.length, 0);
});

test("receipts-evidence-kind=recording rejects a still artifact", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		seed: activeGoal(),
		prefs: { "receipts-evidence-kind": "recording" },
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "go" },
			{ role: "assistant", content: "EVIDENCE: /tmp/shot.png" },
		],
	});
	const directive = await run(ctx, host);
	assert.equal(directive.kind, "continue");
	assert.equal(host.runAgentCalls.length, 0);
	assert.ok(directive.text.includes("a screen recording"));
});

test("the round cap stops the goal before spawning a verifier", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({
		verdict: "EVIDENCE VERIFIED: yes - should never be consulted",
		seed: activeGoal({ rounds: 8 }),
	});
	const directive = await run(makeCtx(), host);
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.includes("stopped after 8 verification rounds"));
	assert.equal(host.runAgentCalls.length, 0);
	assert.equal(host.kv.has("conv-abc"), false);
});

test("receipts-max-rounds overrides the cap and is clamped", async () => {
	const run = loadHookRunner(parseManifest());
	// 2 rounds spent, cap lowered to 2 → stop
	const low = makeHost({
		seed: activeGoal({ rounds: 2 }),
		prefs: { "receipts-max-rounds": "2" },
	});
	const stopped = await run(makeCtx(), low);
	assert.equal(stopped.kind, "note");
	assert.ok(stopped.text.includes("stopped after 2 verification rounds"));

	// a nonsense value falls back to the default 8 rather than stopping at 0
	const bogus = makeHost({
		seed: activeGoal({ rounds: 2 }),
		prefs: { "receipts-max-rounds": "not-a-number" },
	});
	const running = await run(makeCtx(), bogus);
	assert.equal(running.kind, "continue");

	// an absurd value is clamped to 25, not honoured verbatim
	const huge = makeHost({
		seed: activeGoal({ rounds: 25 }),
		prefs: { "receipts-max-rounds": "9999" },
	});
	const capped = await run(makeCtx(), huge);
	assert.equal(capped.kind, "note");
	assert.ok(capped.text.includes("stopped after 25 verification rounds"));
});

test("corrupt stored state degrades to {kind:'none'}", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ seed: "}{ not json" });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.runAgentCalls.length, 0);
});

test("empty '/receipt ' condition does not create a goal", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "/receipt    " }],
	});
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.kv.has("conv-abc"), false);
	assert.equal(host.runAgentCalls.length, 0);
});
