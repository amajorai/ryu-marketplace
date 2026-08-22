import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname);
const manifest = JSON.parse(await readFile(path.join(ROOT, "manifest.json"), "utf8"));
const usagePacer = JSON.parse(
	await readFile(path.join(ROOT, "../usage-pacer/manifest.json"), "utf8"),
);

async function hydratedHooks(source) {
	return Promise.all(
		(source.contributes?.turn_hooks ?? []).map(async (hook) => ({
			...hook,
			code: await readFile(path.join(ROOT, hook.code_file), "utf8"),
		})),
	);
}

async function runHook(hook, ctx, host) {
	const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
	return new AsyncFunction("ctx", "host", hook.code)(ctx, host);
}

function stuckHost(enabled = "true", onSet = () => {}, options = {}) {
	const {
		escalations = 1,
		maxEscalations,
		ladder = [{ from: "gpt-4o", to: "o3", effort: "high" }],
	} = options;
	return {
		storage: {
			async get() {
				return JSON.stringify({ stuck: true, escalations });
			},
			async set(key, value) {
				onSet(key, value);
			},
		},
		async getPreference({ key }) {
			if (key === "effort-escalator-enabled") return enabled;
			if (key === "effort-escalator-rules") {
				return JSON.stringify({
					global: {
						...(maxEscalations === undefined ? {} : { max_escalations: maxEscalations }),
						ladder,
					},
				});
			}
			return "true";
		},
	};
}

function judgeHost({ escalations, maxEscalations, onSet = () => {} }) {
	let state = { checked_at: Date.now() - 31 * 60 * 1000, escalations };
	return {
		storage: {
			async get() {
				return JSON.stringify(state);
			},
			async set(key, value) {
				state = value;
				onSet(key, value);
			},
		},
		async getPreference({ key }) {
			if (key === "effort-escalator-enabled") return "true";
			if (key === "effort-escalator-rules") {
				return JSON.stringify({
					global: {
						...(maxEscalations === undefined ? {} : { max_escalations: maxEscalations }),
						ladder: [
							{ from: "gpt-4o-mini", to: "gpt-4o" },
							{ from: "gpt-4o", to: "o3" },
							{ from: "o3", to: "claude-sonnet" },
						],
					},
				});
			}
			return "true";
		},
		async sideModel() {
			return "STUCK: yes\nThe worker is not making progress.";
		},
	};
}

test("declares explicit precedence over Usage Pacer", () => {
	const hooks = [
		...manifest.contributes.turn_hooks.filter((hook) => hook.on === "pre_model_select").map((hook) => ({
			plugin: manifest.id,
			id: hook.id,
			priority: hook.priority ?? 0,
		})),
		...usagePacer.contributes.turn_hooks.filter((hook) => hook.on === "pre_model_select").map((hook) => ({
			plugin: usagePacer.id,
			id: hook.id,
			priority: hook.priority ?? 0,
		})),
	].sort(
		(left, right) =>
			right.priority - left.priority ||
			left.plugin.localeCompare(right.plugin) ||
			left.id.localeCompare(right.id),
	);

	assert.equal(hooks[0].plugin, manifest.id);
	assert.equal(hooks[0].priority, 100);
	assert.equal(hooks[1].plugin, usagePacer.id);
});

test("step.effort is a select_model request field, not only a reason", async () => {
	const hooks = await hydratedHooks(manifest);
	const hook = hooks.find((entry) => entry.id === "effort-escalator.select");
	const writes = [];
	const directive = await runHook(
		hook,
		{
			conversation_id: "conversation-1",
			agent_id: "agent-1",
			event: { model: "gpt-4o" },
		},
		stuckHost("true", (...write) => writes.push(write)),
	);

	assert.deepEqual(directive, {
		kind: "select_model",
		model: "o3",
		effort: "high",
		reason: "stuck-task escalation 1; effort high",
	});
	assert.deepEqual(writes, [["effort-escalator:conversation-1", {
		stuck: false,
		escalations: 1,
	}]]);
});

test("does not escalate a stuck conversation when disabled", async () => {
	const hooks = await hydratedHooks(manifest);
	const hook = hooks.find((entry) => entry.id === "effort-escalator.select");
	const directive = await runHook(
		hook,
		{
			conversation_id: "conversation-disabled",
			agent_id: "agent-1",
			event: { model: "gpt-4o" },
		},
		stuckHost("false"),
	);

	assert.deepEqual(directive, { kind: "none" });
});

test("allows one pending escalation when max_escalations is one", async () => {
	const hooks = await hydratedHooks(manifest);
	const hook = hooks.find((entry) => entry.id === "effort-escalator.select");
	const directive = await runHook(
		hook,
		{
			conversation_id: "conversation-at-limit",
			agent_id: "agent-1",
			event: { model: "gpt-4o" },
		},
		stuckHost("true", () => {}, { maxEscalations: 1 }),
	);

	assert.equal(directive.kind, "select_model");
	assert.equal(directive.model, "o3");
});

test("does not select a pending escalation above max_escalations", async () => {
	const hooks = await hydratedHooks(manifest);
	const hook = hooks.find((entry) => entry.id === "effort-escalator.select");
	const directive = await runHook(
		hook,
		{
			conversation_id: "conversation-over-limit",
			agent_id: "agent-1",
			event: { model: "gpt-4o" },
		},
		stuckHost("true", () => {}, { escalations: 2, maxEscalations: 1 }),
	);

	assert.deepEqual(directive, { kind: "none" });
});

test("allows the third pending escalation with the default maximum", async () => {
	const hooks = await hydratedHooks(manifest);
	const hook = hooks.find((entry) => entry.id === "effort-escalator.select");
	const directive = await runHook(
		hook,
		{
			conversation_id: "conversation-default-limit",
			agent_id: "agent-1",
			event: { model: "o3" },
		},
		stuckHost("true", () => {}, {
			escalations: 3,
			ladder: [
				{ from: "gpt-4o-mini", to: "gpt-4o" },
				{ from: "gpt-4o", to: "o3" },
				{ from: "o3", to: "claude-sonnet" },
			],
		}),
	);

	assert.equal(directive.kind, "select_model");
	assert.equal(directive.model, "claude-sonnet");
});

test("judge increments to the configured maximum without exceeding it", async () => {
	const hooks = await hydratedHooks(manifest);
	const hook = hooks.find((entry) => entry.id === "effort-escalator.judge");
	const writes = [];
	const directive = await runHook(
		hook,
		{
			conversation_id: "conversation-judge-cap",
			agent_id: "agent-1",
			transcript: [{ role: "user", content: "Please continue the task." }],
		},
		judgeHost({ escalations: 0, maxEscalations: 1, onSet: (...write) => writes.push(write) }),
	);

	assert.equal(directive.kind, "note");
	assert.match(directive.text, /escalation 1/);
	assert.equal(writes.at(-1)[1].escalations, 1);
});

test("judge does not increment an escalation count already at the cap", async () => {
	const hooks = await hydratedHooks(manifest);
	const hook = hooks.find((entry) => entry.id === "effort-escalator.judge");
	const writes = [];
	const directive = await runHook(
		hook,
		{
			conversation_id: "conversation-judge-at-cap",
			agent_id: "agent-1",
			transcript: [{ role: "user", content: "Please continue the task." }],
		},
		judgeHost({ escalations: 1, maxEscalations: 1, onSet: (...write) => writes.push(write) }),
	);

	assert.deepEqual(directive, { kind: "none" });
	assert.equal(writes.at(-1)[1].escalations, 1);
});

test("judge permits the default maximum of three", async () => {
	const hooks = await hydratedHooks(manifest);
	const hook = hooks.find((entry) => entry.id === "effort-escalator.judge");
	const writes = [];
	const directive = await runHook(
		hook,
		{
			conversation_id: "conversation-judge-default",
			agent_id: "agent-1",
			transcript: [{ role: "user", content: "Please continue the task." }],
		},
		judgeHost({ escalations: 2, onSet: (...write) => writes.push(write) }),
	);

	assert.equal(directive.kind, "note");
	assert.match(directive.text, /escalation 3/);
	assert.equal(writes.at(-1)[1].escalations, 3);
});
