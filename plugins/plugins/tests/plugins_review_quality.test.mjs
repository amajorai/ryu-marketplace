import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runOnce } from "../../tools/toolsmith/harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGINS_ROOT = join(HERE, "../plugins");

const REVIEW_PACKAGES = {
	advisor: {
		id: "@ryu/advisor",
		name: "Advisor",
		grants: ["hook:side-model", "tool:http-egress:127.0.0.1"],
		hookId: "advisor.review",
		hookOn: "post_assistant_turn",
		settingsId: "advisor.settings",
		composer: ["advisor.toggle", "@ryu/advisor"],
		commands: ["/advisor"],
		settings: [["advisor-model", "Advisor model", "model_picker"]],
	},
	"double-check": {
		id: "@ryu/double-check",
		name: "Double Check",
		grants: ["hook:side-model"],
		hookId: "double-check.review",
		hookOn: "post_assistant_turn",
		settingsId: "double-check.settings",
		composer: ["double-check.toggle", "io.ryu.double-check"],
		commands: [],
		settings: [["double-check-model", "Reviewer model", "model_picker"]],
	},
	"observer-agents": {
		id: "@ryu/observer-agents",
		name: "Observer Agents",
		grants: ["hook:side-model"],
		hookId: "observer-agents.review",
		hookOn: "post_assistant_turn",
		settingsId: "observer-agents.settings",
		composer: ["observer-agents.toggle", "io.ryu.observer-agents"],
		commands: [],
		settings: [["observer-agents-model", "Observer model", "model_picker"]],
	},
};

function loadPackage(packageName) {
	const packageRoot = join(PLUGINS_ROOT, packageName);
	const manifest = JSON.parse(
		readFileSync(join(packageRoot, "manifest.json"), "utf8")
	);
	const plugin = JSON.parse(
		readFileSync(join(packageRoot, "plugin.json"), "utf8")
	);
	const hook = manifest.contributes.turn_hooks.find(
		(entry) => entry.id === REVIEW_PACKAGES[packageName].hookId
	);
	if (!hook?.code_file) {
		throw new Error(`${packageName} hook code_file is missing`);
	}
	return {
		code: readFileSync(join(packageRoot, hook.code_file), "utf8"),
		hook,
		manifest,
		plugin,
	};
}

function context(flags, transcript) {
	return {
		conversation_id: "review-quality-fixture",
		agent_id: "agent-fixture",
		flags,
		transcript,
	};
}

async function runHook(
	packageName,
	ctx,
	sideModelResponses = [],
	hostEffects = {}
) {
	const { code } = loadPackage(packageName);
	return runOnce({
		kind: "turn_hook",
		code,
		testCase: {
			ctx,
			host: { sideModel: sideModelResponses, ...hostEffects },
		},
	});
}

test("review package metadata preserves controls, field keys, grants, and the Advisor HTTP contract", () => {
	for (const [packageName, expected] of Object.entries(REVIEW_PACKAGES)) {
		const { manifest, plugin, hook } = loadPackage(packageName);
		assert.equal(manifest.id, expected.id);
		assert.equal(manifest.name, expected.name);
		assert.equal(plugin.version, manifest.version);
		assert.equal(plugin.extensions["com.ryuhq.ryu"].id, manifest.id);
		assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, manifest.name);
		assert.deepEqual(manifest.permission_grants, expected.grants);
		assert.deepEqual(manifest.activation_events, ["*"]);
		assert.equal(hook.id, expected.hookId);
		assert.equal(hook.on, expected.hookOn);
		assert.ok(hook.code_file);

		const settings = manifest.contributes.settings_tabs[0];
		assert.equal(settings.id, expected.settingsId);
		assert.deepEqual(
			settings.fields.map((field) => [field.pref_key, field.label, field.type]),
			expected.settings
		);
		assert.deepEqual(
			(manifest.contributes.composer_controls ?? []).map((control) => [
				control.id,
				control.flag,
			]),
			expected.composer ? [expected.composer] : []
		);
		assert.deepEqual(
			(manifest.contributes.slash_commands ?? []).map(
				(command) => command.command
			),
			expected.commands
		);
	}

	const advisor = loadPackage("advisor").manifest;
	assert.equal(advisor.contributes.composer_controls[0].flag, "@ryu/advisor");
	assert.equal(advisor.contributes.slash_commands[0].command, "/advisor");
	const runnable = advisor.runnables.find(
		(entry) => entry.id === "tool-advisor-consult"
	);
	assert.ok(runnable);
	assert.equal(runnable.config.backend, "http");
	assert.equal(runnable.config.method, "POST");
	assert.equal(runnable.config.url, "core:/api/advisor/consult");
	assert.deepEqual(runnable.config.input_schema.required, ["question"]);
	assert.deepEqual(
		Object.keys(runnable.config.input_schema.properties).sort(),
		["context", "model", "question"]
	);

	const doubleCheck = loadPackage("double-check").manifest;
	assert.equal(
		doubleCheck.contributes.composer_controls[0].flag,
		"io.ryu.double-check"
	);
});

test("Advisor hook is silent while disabled and forwards opt-in advice to the local side-model fixture", async () => {
	const transcript = [
		{ role: "user", content: "Review the retry budget." },
		{ role: "assistant", content: "I will use three retries." },
	];
	const disabled = await runHook("advisor", context({}, transcript));
	assert.deepEqual(disabled.value, { kind: "none" });
	assert.deepEqual(disabled.calls, []);

	const reviewed = await runHook(
		"advisor",
		context({ "@ryu/advisor": true }, transcript),
		["Check backoff and idempotency."]
	);
	assert.deepEqual(reviewed.value, {
		kind: "note",
		text: "Advisor: Check backoff and idempotency.",
	});
	assert.equal(reviewed.calls.length, 1);
	assert.equal(reviewed.calls[0].path, "host.sideModel");
	assert.equal(reviewed.calls[0].args.model_pref_key, "advisor-model");
	assert.equal(reviewed.calls[0].args.effort, "high");
	assert.match(reviewed.calls[0].args.prompt, /Review the retry budget/);
	assert.match(reviewed.calls[0].args.prompt, /I will use three retries/);
});

test("Advisor on-demand command supplies focus and returns guidance as a continuation", async () => {
	const outcome = await runHook(
		"advisor",
		context({}, [
			{ role: "user", content: "Review the plan." },
			{
				role: "assistant",
				content: "I will migrate first.",
			},
			{ role: "user", content: "/advisor focus on rollback safety" },
		]),
		["Add a rollback before migration."]
	);
	assert.equal(outcome.value.kind, "continue");
	assert.match(outcome.value.text, /Add a rollback before migration/);
	assert.match(
		outcome.calls[0].args.prompt,
		/specifically wants advice on: focus on rollback safety/
	);
});

test("Double Check runs only when its composer flag is on and returns the local review", async () => {
	const transcript = [
		{ role: "user", content: "Is this migration safe?" },
		{ role: "assistant", content: "Yes, because it is atomic." },
	];
	const disabled = await runHook("double-check", context({}, transcript));
	assert.deepEqual(disabled.value, { kind: "none" });
	assert.deepEqual(disabled.calls, []);

	const reviewed = await runHook(
		"double-check",
		context({ "io.ryu.double-check": true }, transcript),
		["Looks correct."]
	);
	assert.deepEqual(reviewed.value, { kind: "note", text: "Looks correct." });
	assert.equal(reviewed.calls.length, 1);
	assert.equal(reviewed.calls[0].path, "host.sideModel");
	assert.equal(reviewed.calls[0].args.model_pref_key, "double-check-model");
	assert.match(reviewed.calls[0].args.prompt, /Is this migration safe/);
	assert.match(reviewed.calls[0].args.prompt, /Yes, because it is atomic/);
});

test("Observer Agents sends only a bounded read-only activity digest and honors SILENT", async () => {
	const transcript = [
		{ role: "user", content: "Keep the request limited to local fixtures." },
		{ role: "assistant", content: "I am testing against the local fixture." },
	];
	const silent = await runHook("observer-agents", context({}, transcript), [
		"SILENT",
	]);
	assert.deepEqual(silent.value, { kind: "none" });
	assert.equal(silent.calls.length, 1);
	assert.equal(silent.calls[0].path, "host.sideModel");
	assert.equal(silent.calls[0].args.model_pref_key, "observer-agents-model");
	assert.match(silent.calls[0].args.system, /read-only digest wrapped as data/);
	assert.match(silent.calls[0].args.prompt, /<worker-activity>/);
	assert.match(silent.calls[0].args.prompt, /local fixtures/);

	const report = await runHook("observer-agents", context({}, transcript), [
		"Check that the fixture does not contact a provider.",
	]);
	assert.equal(report.value.kind, "note");
	assert.match(
		report.value.text,
		/^Background observer report \(advisory only\):/
	);
	assert.match(report.value.text, /does not contact a provider/);
});

test("Observer Agents has no activity to inspect without transcript text", async () => {
	const empty = await runHook("observer-agents", context({}, []));
	assert.deepEqual(empty.value, { kind: "none" });
	assert.deepEqual(empty.calls, []);
});
