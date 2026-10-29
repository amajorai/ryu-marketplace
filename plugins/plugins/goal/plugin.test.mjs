// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.
import {
	isNativeFunction,
	isNativeNumber,
	isNativeObjectLike,
	isNativeText,
} from "../../../tools/dist/native-primitive-observation.mjs";

// Preserve the original object representation assertion, including null.
function isObjectRepresentation(value) {
	return value === null || isNativeObjectLike(value);
}

// Co-located test for the `goal` plugin.
// Run with:  node --test plugins-store/plugins/goal/plugin.test.mjs
//
// `goal` has an inline tool and an inline turn hook. Core runs them in sandboxes
// with injected `input`/`caller`/`host` or `ctx`/`host` bindings. This test
// extracts the exact bodies, runs them against a realistic mock host, and checks
// both behavior and the source-to-wire seal. It never edits manifest.json.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runCase, runOnce } from "../../../tools/toolsmith/harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const plugin = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));
const JUDGE_PREF_KEY = "goal-judge-model";
const normalizeLineEndings = (value) => value.replace(/\r\n?/g, "\n");

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
// resolved value. Mirrors run_hook/build_hook_program in Core.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function toolBody(manifest, slug) {
	const runnable = manifest.runnables.find(
		(entry) => entry.config?.slug === slug
	);
	if (!runnable) {
		throw new Error(`no runnable declares the tool '${slug}'`);
	}
	return runnable.config.code;
}

function loadToolRunner(manifest) {
	const fn = new AsyncFunction(
		"input",
		"caller",
		"host",
		toolBody(manifest, "goal.set")
	);
	return (input, caller, host) =>
		fn(input, { agent_id: null, conversation_id: null, ...caller }, host);
}

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
			return isNativeFunction(sideModelReply)
				? sideModelReply(args)
				: sideModelReply;
		},
		storage: {
			get: async (k) => {
				const v = store.get(String(k));
				return v === undefined ? null : v;
			},
			set: async (k, v) => {
				store.set(String(k), isNativeText(v) ? v : JSON.stringify(v));
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
	assert.equal(isObjectRepresentation(m), true);
	assert.equal(m.id, "@ryu/goal");
	assert.equal(isNativeText(m.name), true);
	assert.ok(m.name.length > 0);
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
	assert.equal(plugin.version, m.version);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"].id, m.id);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, m.name);
	assert.deepEqual(m.activation_events, ["*"]);
});

test("Toolsmith executes the hydrated goal clear hook against conversation-scoped KV", async () => {
	const hook = parseManifest().contributes.turn_hooks[0];
	await runCase({
		kind: "turn_hook",
		code: hook.code,
		testCase: {
			name: "clear only the current conversation goal",
			ctx: {
				conversation_id: "toolsmith-goal-conversation",
				transcript: [{ role: "user", content: "/goal clear" }],
			},
			host: {
				storage: {
					"toolsmith-goal-conversation": JSON.stringify({
						condition: "local fixture goal",
						status: "active",
						turns: 2,
					}),
				},
			},
			expect: { kind: "note", text: "Goal cleared." },
			expectCalls: [
				{
					path: "host.storage.delete",
					args: { key: "toolsmith-goal-conversation" },
				},
			],
		},
	});
});

test("Toolsmith evaluates an active goal and persists a retryable unfinished turn", async () => {
	const hook = parseManifest().contributes.turn_hooks[0];
	const context = {
		conversation_id: "toolsmith-active-goal",
		transcript: [
			{ role: "user", content: "finish the local fixture" },
			{ role: "assistant", content: "the first part is done" },
		],
	};
	const testCase = {
		ctx: context,
		host: {
			sideModel: ["MET: no - one assertion is still missing"],
			storage: {
				"toolsmith-active-goal": JSON.stringify({
					condition: "complete all local assertions",
					status: "active",
					turns: 2,
				}),
			},
		},
	};
	const first = await runOnce({ kind: "turn_hook", code: hook.code, testCase });
	const second = await runOnce({
		kind: "turn_hook",
		code: hook.code,
		testCase,
	});

	assert.deepEqual(
		second,
		first,
		"the real goal hook is deterministic for this fixture"
	);
	assert.deepEqual(first.value, {
		kind: "continue",
		text: "Keep working toward the goal: complete all local assertions. Judge feedback: MET: no - one assertion is still missing",
	});
	assert.equal(first.calls[0].path, "host.storage.get");
	assert.equal(first.calls[1].path, "host.sideModel");
	assert.equal(first.calls[1].args.model_pref_key, JUDGE_PREF_KEY);
	assert.match(first.calls[1].args.prompt, /complete all local assertions/);
	assert.match(first.calls[1].args.prompt, /assistant: the first part is done/);
	assert.deepEqual(first.calls[2], {
		path: "host.storage.set",
		args: {
			key: "toolsmith-active-goal",
			value: {
				condition: "complete all local assertions",
				status: "active",
				turns: 3,
				last_reason: "MET: no - one assertion is still missing",
			},
		},
	});
});

test("Toolsmith ignores valid JSON that is not a stored goal object", async () => {
	const hook = parseManifest().contributes.turn_hooks[0];
	for (const raw of ["null", "[]", JSON.stringify({ status: "active" })]) {
		await runCase({
			kind: "turn_hook",
			code: hook.code,
			testCase: {
				name: `ignore malformed goal value ${raw}`,
				ctx: {
					conversation_id: "toolsmith-malformed-goal",
					transcript: [{ role: "user", content: "continue" }],
				},
				host: {
					storage: { "toolsmith-malformed-goal": raw },
				},
				expect: { kind: "none" },
				expectCalls: [
					{
						path: "host.storage.get",
						args: { key: "toolsmith-malformed-goal" },
					},
				],
			},
		});
	}
});

test("declared contributes fields are well-formed", () => {
	const m = parseManifest();

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
	assert.ok(
		m.permission_grants.includes("tool:execute"),
		"must grant tool:execute for goal.set"
	);

	const tool = m.runnables.find((entry) => entry.config?.slug === "goal.set");
	assert.ok(tool, "must expose goal.set as a runnable");
	assert.equal(tool.kind, "tool");
	assert.equal(tool.config.backend, "inline_js");
	assert.equal(tool.config.input_schema.type, "object");
	assert.deepEqual(tool.config.input_schema.required, ["goal"]);
	assert.equal(isNativeText(tool.config.code), true);
	assert.ok(tool.config.code.includes("caller?.conversation_id"));
	assert.equal(
		normalizeLineEndings(tool.config.code),
		normalizeLineEndings(
			readFileSync(join(HERE, "tools", "goal.set.js"), "utf8")
		),
		"goal.set was edited without resealing — run: node plugins-store/plugins/goal/seal.mjs"
	);

	// slash command that seeds the goal
	const cmd = m.contributes.slash_commands[0];
	assert.equal(cmd.command, "/goal");
	assert.equal(isNativeText(cmd.description), true);

	// judge model picker writes the pref key the hook passes to sideModel
	const field = m.contributes.settings_tabs[0].fields[0];
	assert.equal(field.type, "model_picker");
	assert.equal(field.pref_key, JUDGE_PREF_KEY);

	// the inline hook itself: post_assistant_turn, stateful /goal match
	const hook = m.contributes.turn_hooks[0];
	assert.equal(hook.on, "post_assistant_turn");
	assert.deepEqual(hook.match.commands, ["/goal"]);
	assert.equal(hook.match.stateful, true);
	assert.equal(isNativeText(hook.code), true);
	assert.ok(hook.code.includes("host.sideModel"), "hook uses sideModel");
	assert.ok(hook.code.includes("host.storage"), "hook uses storage");
	assert.ok(
		hook.code.includes(JUDGE_PREF_KEY),
		"hook passes goal-judge-model pref key"
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
		"goal.manifest.json"
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
			'include_str!("../../../../plugins-store/plugins/goal/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});

test("goal.set stores an active goal under the caller's conversation", async () => {
	const run = loadToolRunner(parseManifest());
	const host = makeHost("unused");
	const result = await run(
		{ goal: "  ship the release notes  " },
		{ agent_id: "ryu", conversation_id: "conv-agent" },
		host
	);
	assert.deepEqual(result, {
		ok: true,
		goal: "ship the release notes",
		status: "active",
		turns: 0,
		message:
			"Goal set for this conversation. Continue working toward it; the goal judge will evaluate progress after the reply.",
	});
	const stored = JSON.parse(host.store.get("conv-agent"));
	assert.equal(stored.condition, "ship the release notes");
	assert.equal(stored.status, "active");
	assert.equal(stored.turns, 0);
	assert.equal(isNativeNumber(stored.started_at), true);
});

test("goal.set ignores a model-supplied conversation id", async () => {
	const run = loadToolRunner(parseManifest());
	const host = makeHost("unused");
	await run(
		{ goal: "only this chat", conversation_id: "another-chat" },
		{ agent_id: "ryu", conversation_id: "current-chat" },
		host
	);
	assert.equal(host.store.has("another-chat"), false);
	const stored = JSON.parse(host.store.get("current-chat"));
	assert.equal(stored.condition, "only this chat");
	assert.equal(stored.status, "active");
	assert.equal(stored.turns, 0);
	assert.equal(isNativeNumber(stored.started_at), true);
});

test("goal.set rejects empty, oversized, and agent-less calls", async () => {
	const run = loadToolRunner(parseManifest());
	const host = makeHost("unused");
	await assert.rejects(
		() => run({ goal: "   " }, { conversation_id: "conv-agent" }, host),
		/goal.set: 'goal' must not be empty/
	);
	await assert.rejects(
		() =>
			run({ goal: "x".repeat(4001) }, { conversation_id: "conv-agent" }, host),
		/goal.set: 'goal' must be 4000 characters or fewer/
	);
	await assert.rejects(
		() => run({ goal: "no scope" }, {}, host),
		/goal.set: an active conversation is required/
	);
});

test("goal.set rejects a non-string goal before writing storage", async () => {
	const run = loadToolRunner(parseManifest());
	const writes = [];
	const host = {
		storage: {
			set: async (...args) => writes.push(args),
		},
	};
	await assert.rejects(
		() => run({ goal: 42 }, { conversation_id: "conv-agent" }, host),
		/goal.set: 'goal' is required and must be a string/
	);
	assert.deepEqual(writes, []);
});

test("goal.set accepts the exact 4000-character boundary and writes serialized state", async () => {
	const run = loadToolRunner(parseManifest());
	const goal = "x".repeat(4000);
	const writes = [];
	const result = await run(
		{ goal },
		{ agent_id: "ryu", conversation_id: "conv-boundary" },
		{
			storage: {
				set: async (...args) => writes.push(args),
			},
		}
	);

	assert.equal(result.goal, goal);
	assert.equal(writes.length, 1);
	assert.equal(writes[0][0], "conv-boundary");
	assert.equal(isNativeText(writes[0][1]), true);
	const stored = JSON.parse(writes[0][1]);
	assert.deepEqual(Object.keys(stored).sort(), [
		"condition",
		"started_at",
		"status",
		"turns",
	]);
	assert.equal(stored.condition, goal);
	assert.equal(stored.status, "active");
	assert.equal(stored.turns, 0);
	assert.equal(isNativeNumber(stored.started_at), true);
});

test("goal.set does not report success when conversation storage rejects the write", async () => {
	const run = loadToolRunner(parseManifest());
	let attemptedWrite;
	const host = {
		storage: {
			set: async (key, value) => {
				attemptedWrite = { key, value };
				throw new Error("conversation storage unavailable");
			},
		},
	};
	await assert.rejects(
		() =>
			run(
				{ goal: "persist this" },
				{ agent_id: "ryu", conversation_id: "conv-storage-error" },
				host
			),
		/conversation storage unavailable/
	);
	assert.equal(attemptedWrite.key, "conv-storage-error");
	assert.equal(isNativeText(attemptedWrite.value), true);
	assert.equal(JSON.parse(attemptedWrite.value).condition, "persist this");
});

// ── Hook behaviour ─────────────────────────────────────────────────────────────

test("no conversation_id → {kind:'none'}", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no - x");
	assert.deepEqual(await run(makeCtx({ conversation_id: null }), host), {
		kind: "none",
	});
	assert.equal(host.sideModelCalls.length, 0);
});

test("'/goal clear' deletes stored state and returns a note", async () => {
	const run = loadHookRunner(parseManifest());
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
	const run = loadHookRunner(parseManifest());
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
	const run = loadHookRunner(parseManifest());
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
	assert.equal(stored.condition, "ship the release notes");
	assert.equal(stored.status, "active");
	assert.equal(stored.turns, 0);
	assert.equal(isNativeNumber(stored.started_at), true);
	assert.equal(host.sideModelCalls.length, 0, "seeding does not judge");
});

test("'/goal ' with an empty condition does not seed", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("unused");
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "/goal    " }],
	});
	// no condition → skip the set; no prior state → none
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.store.size, 0);
});

test("no command and no stored state → {kind:'none'}", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no - x");
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.sideModelCalls.length, 0);
});

test("active goal, judge says not met → continue + turn incremented + state persisted", async () => {
	const run = loadHookRunner(parseManifest());
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
	assert.ok(
		args.system.includes("MET:"),
		"system frames the MET: verdict format"
	);
	assert.ok(args.prompt.includes("reach 100 stars"), "prompt carries the goal");
	assert.ok(
		args.prompt.includes("user: keep pushing"),
		"prompt renders transcript"
	);
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

test("active goal, judge says met → note + achieved state persisted", async () => {
	const run = loadHookRunner(parseManifest());
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
	assert.equal(host.store.has("conv-123"), true, "met goal is retained");
	const stored = JSON.parse(host.store.get("conv-123"));
	assert.equal(stored.condition, "finish the task");
	assert.equal(stored.status, "achieved");
	assert.equal(stored.turns, 3);
	assert.equal(stored.last_reason, "MET: yes - all done");
	assert.equal(isNativeNumber(stored.achieved_at), true);
	assert.equal(host.sideModelCalls.length, 1);
});

test("case-insensitive verdict: 'met: YES' still counts as met", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("met: YES — good enough", {
		"conv-123": JSON.stringify({ condition: "c", status: "active", turns: 0 }),
	});
	const directive = await run(makeCtx(), host);
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.startsWith("Goal met."));
});

test("turn cap: at 25 turns the loop stops without judging", async () => {
	const run = loadHookRunner(parseManifest());
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
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no", { "conv-123": "not-json{" });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.sideModelCalls.length, 0);
});

test("non-active stored status → {kind:'none'}", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no", {
		"conv-123": JSON.stringify({ condition: "c", status: "done", turns: 1 }),
	});
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.sideModelCalls.length, 0);
});

test("paused goal keeps its persisted state and does not judge", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no - should not run", {
		"conv-123": JSON.stringify({
			condition: "ship it",
			status: "paused",
			turns: 4,
		}),
	});
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.deepEqual(JSON.parse(host.store.get("conv-123")), {
		condition: "ship it",
		status: "paused",
		turns: 4,
	});
	assert.equal(host.sideModelCalls.length, 0);
});

test("command detection uses the NEWEST user turn (reverse scan)", async () => {
	const run = loadHookRunner(parseManifest());
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
	assert.equal(
		host.store.has("conv-123"),
		true,
		"state survived (no stale clear)"
	);
	assert.equal(host.sideModelCalls.length, 1, "judge ran on the active goal");
});

test("a newest /goal command replaces an active goal before judging it", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: yes - should not be consulted", {
		"conv-123": JSON.stringify({
			condition: "old goal",
			status: "active",
			turns: 12,
			last_reason: "old verdict",
		}),
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "/goal stale command" },
			{ role: "assistant", content: "started stale command" },
			{ role: "user", content: "  /goal new goal  " },
		],
	});

	assert.deepEqual(await run(ctx, host), {
		kind: "continue",
		text: "Begin working toward this goal: new goal",
	});
	const stored = JSON.parse(host.store.get("conv-123"));
	assert.equal(stored.condition, "new goal");
	assert.equal(stored.status, "active");
	assert.equal(stored.turns, 0);
	assert.equal("last_reason" in stored, false);
	assert.equal(isNativeNumber(stored.started_at), true);
	assert.equal(
		host.sideModelCalls.length,
		0,
		"replacement runs before the judge"
	);
});

test("a judge host failure leaves the active goal unchanged", async () => {
	const run = loadHookRunner(parseManifest());
	const original = JSON.stringify({
		condition: "finish the task",
		status: "active",
		turns: 4,
	});
	const host = makeHost(
		() => {
			throw new Error("judge service unavailable");
		},
		{ "conv-123": original }
	);

	await assert.rejects(() => run(makeCtx(), host), /judge service unavailable/);
	assert.equal(host.sideModelCalls.length, 1);
	assert.equal(host.store.get("conv-123"), original);
});

test("a failed judge call retries from unchanged persisted state", async () => {
	const run = loadHookRunner(parseManifest());
	const original = JSON.stringify({
		condition: "finish the task",
		status: "active",
		turns: 4,
	});
	let attempts = 0;
	const host = makeHost(
		() => {
			attempts += 1;
			if (attempts === 1) {
				throw new Error("temporary judge outage");
			}
			return "MET: no - one check remains";
		},
		{ "conv-123": original }
	);

	await assert.rejects(() => run(makeCtx(), host), /temporary judge outage/);
	assert.equal(host.store.get("conv-123"), original);
	assert.deepEqual(await run(makeCtx(), host), {
		kind: "continue",
		text: "Keep working toward the goal: finish the task. Judge feedback: MET: no - one check remains",
	});
	assert.equal(attempts, 2, "the next hook dispatch performs one exact retry");
	assert.deepEqual(JSON.parse(host.store.get("conv-123")), {
		condition: "finish the task",
		status: "active",
		turns: 5,
		last_reason: "MET: no - one check remains",
	});
});
