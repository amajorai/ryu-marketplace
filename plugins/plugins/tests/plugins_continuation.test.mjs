import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isNativeText } from "../../tools/dist/native-primitive-observation.mjs";
import { runOnce } from "../../tools/toolsmith/harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGINS_ROOT = join(HERE, "../plugins");
const MARKER = "[auto-continue]";

const PACKAGES = {
	"auto-continue": {
		command: "/auto-continue",
		flags: {},
		id: "@ryu/auto-continue",
		name: "Auto Continue",
	},
	"plan-continue": {
		command: "/plan-continue",
		flags: { "ryu.plan": true },
		id: "@ryu/plan-continue",
		name: "Plan Continue",
	},
};

function packageSource(packageName) {
	const root = join(PLUGINS_ROOT, packageName);
	const manifest = JSON.parse(
		readFileSync(join(root, "manifest.json"), "utf8")
	);
	const plugin = JSON.parse(readFileSync(join(root, "plugin.json"), "utf8"));
	const hooks = manifest.contributes?.turn_hooks ?? [];
	if (hooks.length !== 1 || !isNativeText(hooks[0].code_file)) {
		throw new Error(`${packageName} must declare one code_file turn hook`);
	}
	return {
		code: readFileSync(join(root, hooks[0].code_file), "utf8"),
		hook: hooks[0],
		manifest,
		plugin,
	};
}

function context(packageName, overrides = {}) {
	return {
		conversation_id: "conversation-proof",
		agent_id: "agent-proof",
		transcript: [
			{ role: "user", content: "Finish the local fixture task." },
			{ role: "assistant", content: "One step remains." },
		],
		flags: PACKAGES[packageName].flags,
		...overrides,
	};
}

async function runHook(packageName, ctx, host = {}) {
	const { code } = packageSource(packageName);
	return runOnce({
		kind: "turn_hook",
		code,
		testCase: { ctx, host },
	});
}

function recordedCall(outcome, path) {
	return outcome.calls.find((call) => call.path === path);
}

test("both package cards, extension descriptors, grants, and hook registrations stay aligned", () => {
	for (const [packageName, expected] of Object.entries(PACKAGES)) {
		const { manifest, plugin, hook } = packageSource(packageName);
		assert.equal(manifest.id, expected.id);
		assert.equal(manifest.name, expected.name);
		assert.equal(plugin.version, manifest.version);
		assert.equal(plugin.extensions["com.ryuhq.ryu"].id, manifest.id);
		assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, manifest.name);
		assert.deepEqual(manifest.activation_events, ["*"]);
		assert.equal(hook.on, "post_assistant_turn");
		assert.equal(isNativeText(hook.code_file), true);
		assert.equal(
			manifest.contributes.slash_commands[0].command,
			expected.command
		);
		assert.deepEqual(hook.match.commands, [expected.command]);
		if (packageName === "auto-continue") {
			assert.equal(hook.match.stateful, true);
		} else {
			assert.equal(hook.match.stateful, undefined);
			assert.equal(hook.match.flag, "ryu.plan");
		}
	}
	assert.deepEqual(packageSource("auto-continue").manifest.permission_grants, [
		"hook:run-agent",
		"storage:kv",
	]);
	assert.deepEqual(packageSource("plan-continue").manifest.permission_grants, [
		"storage:kv",
	]);
});

test("auto-continue on writes the conversation switch consumed by the next turn", async () => {
	const outcome = await runHook(
		"auto-continue",
		context("auto-continue", {
			transcript: [{ role: "user", content: "/auto-continue on" }],
		}),
		{ storage: {} }
	);
	assert.equal(outcome.value.kind, "note");
	assert.match(outcome.value.text, /Auto-continue is on/);
	assert.deepEqual(recordedCall(outcome, "host.storage.set"), {
		path: "host.storage.set",
		args: {
			key: "conversation-proof",
			value: JSON.stringify({ status: "active" }),
		},
	});

	const nextTurn = await runHook("auto-continue", context("auto-continue"), {
		storage: { "conversation-proof": JSON.stringify({ status: "active" }) },
		runAgent: ["VERDICT: CONTINUE - one local verification remains"],
	});
	assert.equal(nextTurn.value.kind, "continue");
	assert.ok(nextTurn.value.text.startsWith(MARKER));
	const scan = recordedCall(nextTurn, "host.runAgent");
	assert.equal(scan.args.agent_id, "agent-proof");
	assert.equal(scan.args.preset, "code_read");
	assert.equal(scan.args.wall_time_secs, 120);
	assert.match(scan.args.task, /Finish the local fixture task/);
	assert.match(scan.args.task, /VERDICT: BLOCKED/);
	assert.equal(
		recordedCall(nextTurn, "host.storage.get").args.key,
		"conversation-proof"
	);
});

test("auto-continue off deletes the switch; unarmed turns never spend a scanner call", async () => {
	const stopped = await runHook(
		"auto-continue",
		context("auto-continue", {
			transcript: [{ role: "user", content: "/auto-continue off" }],
		}),
		{ storage: { "conversation-proof": JSON.stringify({ status: "active" }) } }
	);
	assert.equal(stopped.value.kind, "note");
	assert.match(stopped.value.text, /Auto-continue is off/);
	assert.deepEqual(recordedCall(stopped, "host.storage.delete"), {
		path: "host.storage.delete",
		args: { key: "conversation-proof" },
	});

	const unarmed = await runHook("auto-continue", context("auto-continue"), {
		storage: {},
	});
	assert.deepEqual(unarmed.value, { kind: "none" });
	assert.equal(recordedCall(unarmed, "host.runAgent"), undefined);
});

test("auto-continue stops on DONE, BLOCKED, and a failed local scanner", async () => {
	for (const verdict of [
		"VERDICT: DONE - fixture is complete",
		"VERDICT: BLOCKED - a user decision is required",
	]) {
		const outcome = await runHook("auto-continue", context("auto-continue"), {
			storage: {
				"conversation-proof": JSON.stringify({ status: "active" }),
			},
			runAgent: [verdict],
		});
		assert.deepEqual(outcome.value, { kind: "none" });
	}

	const failedScanner = await runHook(
		"auto-continue",
		context("auto-continue"),
		{
			storage: { "conversation-proof": JSON.stringify({ status: "active" }) },
			runAgent: [],
		}
	);
	assert.deepEqual(failedScanner.value, { kind: "none" });
	assert.ok(recordedCall(failedScanner, "host.runAgent"));
	assert.ok(recordedCall(failedScanner, "host.log"));
});

test("plan-continue off persists a per-chat opt-out and on removes it", async () => {
	const off = await runHook(
		"plan-continue",
		context("plan-continue", {
			transcript: [{ role: "user", content: "/plan-continue off" }],
		}),
		{ storage: {} }
	);
	assert.equal(off.value.kind, "note");
	assert.match(off.value.text, /Auto-continue is off/);
	assert.deepEqual(recordedCall(off, "host.storage.set"), {
		path: "host.storage.set",
		args: { key: "conversation-proof", value: { auto: "off" } },
	});

	const reload = await runHook("plan-continue", context("plan-continue"), {
		storage: { "conversation-proof": JSON.stringify({ auto: "off" }) },
	});
	assert.deepEqual(reload.value, { kind: "none" });
	assert.equal(
		recordedCall(reload, "host.storage.get").args.key,
		"conversation-proof"
	);

	const on = await runHook(
		"plan-continue",
		context("plan-continue", {
			transcript: [{ role: "user", content: "/plan-continue on" }],
		}),
		{ storage: { "conversation-proof": JSON.stringify({ auto: "off" }) } }
	);
	assert.deepEqual(on.value, {
		kind: "note",
		text: "Auto-continue is on for this chat.",
	});
	assert.deepEqual(recordedCall(on, "host.storage.delete"), {
		path: "host.storage.delete",
		args: { key: "conversation-proof" },
	});
});

test("plan-continue injects only while plan mode is active and stops at its streak cap", async () => {
	const active = await runHook("plan-continue", context("plan-continue"), {
		storage: {},
	});
	assert.equal(active.value.kind, "continue");
	assert.ok(active.value.text.startsWith(MARKER));
	assert.match(active.value.text, /ExitPlanMode/);
	assert.equal(
		recordedCall(active, "host.storage.get").args.key,
		"conversation-proof"
	);

	const modeOff = await runHook(
		"plan-continue",
		context("plan-continue", { flags: {} }),
		{ storage: {} }
	);
	assert.deepEqual(modeOff.value, { kind: "none" });

	const transcript = [{ role: "user", content: "Plan the local migration." }];
	for (let index = 0; index < 3; index += 1) {
		transcript.push(
			{ role: "assistant", content: `Step ${index}` },
			{ role: "user", content: `${MARKER} Ryu generated this message` }
		);
	}
	transcript.push({ role: "assistant", content: "Still planning." });
	const capped = await runHook(
		"plan-continue",
		context("plan-continue", { transcript }),
		{ storage: {} }
	);
	assert.equal(capped.value.kind, "note");
	assert.match(capped.value.text, /stopped after 3 nudges/);
});
