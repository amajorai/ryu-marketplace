// Co-located test for the `goal` plugin: the manifest contract, the
// source-to-wire seal, the Core registration seam, and the Toolsmith runs of
// the hydrated hook. The goal.set tool and the hook's behaviour are covered in
// goal-set.test.mjs and hook-loop.test.mjs; the judge's untrusted-content
// handling in judge-hardening.test.mjs.
// Run with:  node --test plugins-store/plugins/goal/plugin.test.mjs

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isNativeText } from "../../../tools/dist/native-primitive-observation.mjs";
import { runCase, runOnce } from "../../../tools/toolsmith/harness.mjs";
import {
	HERE,
	isObjectRepresentation,
	JUDGE_FEEDBACK_FRAME,
	JUDGE_PREF_KEY,
	normalizeLineEndings,
	parseManifest,
	plugin,
} from "./goal.test-fixture.mjs";

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
		text: `Keep working toward the goal: complete all local assertions. ${JUDGE_FEEDBACK_FRAME}Judge feedback: MET: no - one assertion is still missing`,
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
