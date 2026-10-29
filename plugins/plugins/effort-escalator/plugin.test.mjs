// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
	isNativeNumber,
	isNativeText,
} from "../../../tools/dist/native-primitive-observation.mjs";

const ROOT = path.resolve(import.meta.dirname);
const manifest = JSON.parse(
	await readFile(path.join(ROOT, "manifest.json"), "utf8")
);
const plugin = JSON.parse(
	await readFile(path.join(ROOT, "plugin.json"), "utf8")
);
const usagePacer = JSON.parse(
	await readFile(path.join(ROOT, "../usage-pacer/manifest.json"), "utf8")
);

async function hydratedHooks(source) {
	return Promise.all(
		(source.contributes?.turn_hooks ?? []).map(async (hook) => ({
			...hook,
			code: await readFile(path.join(ROOT, hook.code_file), "utf8"),
		}))
	);
}

async function runHook(hook, ctx, host, { nowMs } = {}) {
	const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
	if (nowMs !== undefined) {
		return new AsyncFunction("ctx", "host", "Date", hook.code)(ctx, host, {
			now: () => nowMs,
		});
	}
	return new AsyncFunction("ctx", "host", hook.code)(ctx, host);
}

function stuckHost(enabled = "true", onSet = () => {}, options = {}) {
	const {
		escalations = 1,
		maxEscalations,
		agents = {},
		ladder = [{ from: "gpt-4o", to: "o3", effort: "high" }],
		storedState,
	} = options;
	return {
		storage: {
			async get() {
				if (storedState !== undefined) {
					return storedState;
				}
				return JSON.stringify({ stuck: true, escalations });
			},
			async set(key, value) {
				onSet(key, value);
			},
		},
		async getPreference({ key }) {
			if (key === "effort-escalator-enabled") {
				return enabled;
			}
			if (key === "effort-escalator-rules") {
				return JSON.stringify({
					agents,
					global: {
						...(maxEscalations === undefined
							? undefined
							: { max_escalations: maxEscalations }),
						ladder,
					},
				});
			}
			return "true";
		},
	};
}

function judgeHost({
	escalations,
	maxEscalations,
	afterMinutes,
	checkedAgoMs = 31 * 60 * 1000,
	nowMs = Date.now(),
	storedState,
	onJudge = () => {},
	onSet = () => {},
	sideModelError,
}) {
	let state =
		storedState === undefined
			? { checked_at: nowMs - checkedAgoMs, escalations }
			: storedState;
	return {
		storage: {
			async get() {
				return isNativeText(state) ? state : JSON.stringify(state);
			},
			async set(key, value) {
				state = value;
				onSet(key, value);
			},
		},
		async getPreference({ key }) {
			if (key === "effort-escalator-enabled") {
				return "true";
			}
			if (key === "effort-escalator-rules") {
				return JSON.stringify({
					global: {
						...(maxEscalations === undefined
							? undefined
							: { max_escalations: maxEscalations }),
						...(afterMinutes === undefined
							? undefined
							: { after_minutes: afterMinutes }),
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
			onJudge();
			if (sideModelError) {
				throw sideModelError;
			}
			return "STUCK: yes\nThe worker is not making progress.";
		},
	};
}

test("declares explicit precedence over Usage Pacer", () => {
	assert.equal(manifest.id, "@ryu/effort-escalator");
	assert.equal(manifest.name, "Effort Escalator");
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(manifest.permission_grants, [
		"hook:side-model",
		"storage:kv",
		"preferences:read",
	]);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.deepEqual(
		[
			manifest.contributes.settings_tabs[0].id,
			manifest.contributes.settings_tabs[0].title,
		],
		["effort-escalator.settings", "Effort escalation"]
	);
	assert.deepEqual(
		manifest.contributes.settings_tabs[0].fields.map((field) => [
			field.pref_key,
			field.label,
			field.type,
		]),
		[
			[
				"effort-escalator-enabled",
				"Automatically escalate stuck tasks",
				"toggle",
			],
			["effort-escalator-judge-model", "Judge model", "model_picker"],
			[
				"effort-escalator-rules",
				"Agent and global escalation ladders",
				"textarea",
			],
		]
	);
	assert.deepEqual(
		manifest.contributes.turn_hooks.map(({ id, on, priority }) => [
			id,
			on,
			priority ?? 0,
		]),
		[
			["effort-escalator.judge", "post_assistant_turn", 0],
			["effort-escalator.select", "pre_model_select", 100],
		]
	);

	const hooks = [
		...manifest.contributes.turn_hooks
			.filter((hook) => hook.on === "pre_model_select")
			.map((hook) => ({
				plugin: manifest.id,
				id: hook.id,
				priority: hook.priority ?? 0,
			})),
		...usagePacer.contributes.turn_hooks
			.filter((hook) => hook.on === "pre_model_select")
			.map((hook) => ({
				plugin: usagePacer.id,
				id: hook.id,
				priority: hook.priority ?? 0,
			})),
	].sort(
		(left, right) =>
			right.priority - left.priority ||
			left.plugin.localeCompare(right.plugin) ||
			left.id.localeCompare(right.id)
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
		stuckHost("true", (...write) => writes.push(write))
	);

	assert.deepEqual(directive, {
		kind: "select_model",
		model: "o3",
		effort: "high",
		reason: "stuck-task escalation 1; effort high",
	});
	assert.deepEqual(writes, [
		[
			"effort-escalator:conversation-1",
			{
				stuck: false,
				escalations: 1,
			},
		],
	]);
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
		stuckHost("false")
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
		stuckHost("true", () => {}, { maxEscalations: 1 })
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
		stuckHost("true", () => {}, { escalations: 2, maxEscalations: 1 })
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
		})
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
		judgeHost({
			escalations: 0,
			maxEscalations: 1,
			onSet: (...write) => writes.push(write),
		})
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
		judgeHost({
			escalations: 1,
			maxEscalations: 1,
			onSet: (...write) => writes.push(write),
		})
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
		judgeHost({ escalations: 2, onSet: (...write) => writes.push(write) })
	);

	assert.equal(directive.kind, "note");
	assert.match(directive.text, /escalation 3/);
	assert.equal(writes.at(-1)[1].escalations, 3);
});

test("judge defaults a nonnumeric delay instead of running every turn", async () => {
	const hook = (await hydratedHooks(manifest)).find(
		(entry) => entry.id === "effort-escalator.judge"
	);
	let judgeCalls = 0;
	const directive = await runHook(
		hook,
		{
			conversation_id: "conversation-invalid-delay",
			agent_id: "agent-1",
			transcript: [{ role: "user", content: "Please continue the task." }],
		},
		judgeHost({
			escalations: 0,
			afterMinutes: "not-a-number",
			checkedAgoMs: 60_000,
			onJudge: () => {
				judgeCalls += 1;
			},
		})
	);

	assert.deepEqual(directive, { kind: "none" });
	assert.equal(judgeCalls, 0);
});

test("judge clamps negative and huge delays to safe bounds", async () => {
	const hook = (await hydratedHooks(manifest)).find(
		(entry) => entry.id === "effort-escalator.judge"
	);
	let judgeCalls = 0;
	for (const [conversationId, afterMinutes, checkedAgoMs] of [
		["negative-delay", -50, 30_000],
		["huge-delay", 1e12, 23 * 60 * 60 * 1000],
	]) {
		const directive = await runHook(
			hook,
			{
				conversation_id: conversationId,
				agent_id: "agent-1",
				transcript: [{ role: "user", content: "Please continue the task." }],
			},
			judgeHost({
				escalations: 0,
				afterMinutes,
				checkedAgoMs,
				onJudge: () => {
					judgeCalls += 1;
				},
			})
		);
		assert.deepEqual(directive, { kind: "none" });
	}
	assert.equal(judgeCalls, 0);
});

test("judge clamps malformed escalation caps to the configured ladder", async () => {
	const hook = (await hydratedHooks(manifest)).find(
		(entry) => entry.id === "effort-escalator.judge"
	);
	for (const [conversationId, maxEscalations] of [
		["invalid-cap", "not-a-number"],
		["negative-cap", -99],
	]) {
		const directive = await runHook(
			hook,
			{
				conversation_id: conversationId,
				agent_id: "agent-1",
				transcript: [{ role: "user", content: "Please continue the task." }],
			},
			judgeHost({ escalations: 3, maxEscalations })
		);
		assert.deepEqual(directive, { kind: "none" });
	}
});

test("normalizes malformed judge state and ignores malformed selection state", async () => {
	const hooks = await hydratedHooks(manifest);
	const judgeHook = hooks.find(
		(entry) => entry.id === "effort-escalator.judge"
	);
	const selectHook = hooks.find(
		(entry) => entry.id === "effort-escalator.select"
	);
	for (const [index, storedState] of ["not-json", "null"].entries()) {
		const writes = [];
		const judgeDirective = await runHook(
			judgeHook,
			{
				conversation_id: `conversation-malformed-judge-${index}`,
				agent_id: "agent-1",
				transcript: [{ role: "user", content: "Please continue the task." }],
			},
			judgeHost({
				escalations: 0,
				storedState,
				onSet: (...write) => writes.push(write),
			})
		);

		assert.deepEqual(judgeDirective, { kind: "none" });
		assert.equal(writes.length, 1);
		assert.equal(isNativeNumber(writes[0][1].checked_at), true);

		const selectDirective = await runHook(
			selectHook,
			{
				conversation_id: `conversation-malformed-select-${index}`,
				agent_id: "agent-1",
				event: { model: "gpt-4o" },
			},
			stuckHost("true", () => {}, { storedState })
		);
		assert.deepEqual(selectDirective, { kind: "none" });
	}
});

test("judge waits for the configured delay and runs at its exact boundary", async () => {
	const hook = (await hydratedHooks(manifest)).find(
		(entry) => entry.id === "effort-escalator.judge"
	);
	const nowMs = 1_800_000_000_000;
	for (const [checkedAgoMs, expectedKind, expectedJudgeCalls] of [
		[59_999, "none", 0],
		[60_000, "note", 1],
	]) {
		let judgeCalls = 0;
		const directive = await runHook(
			hook,
			{
				conversation_id: `conversation-delay-${checkedAgoMs}`,
				agent_id: "agent-1",
				transcript: [{ role: "user", content: "Please continue the task." }],
			},
			judgeHost({
				escalations: 0,
				afterMinutes: 1,
				checkedAgoMs,
				nowMs,
				onJudge: () => {
					judgeCalls += 1;
				},
			}),
			{ nowMs }
		);

		assert.equal(directive.kind, expectedKind);
		assert.equal(judgeCalls, expectedJudgeCalls);
	}
});

test("uses the matching agent ladder to select its exact model and effort", async () => {
	const hook = (await hydratedHooks(manifest)).find(
		(entry) => entry.id === "effort-escalator.select"
	);
	const directive = await runHook(
		hook,
		{
			conversation_id: "conversation-agent-ladder",
			agent_id: "agent-1",
			event: { model: "gpt-4o" },
		},
		stuckHost("true", () => {}, {
			ladder: [{ from: "gpt-4o", to: "global-model", effort: "low" }],
			agents: {
				"agent-1": {
					max_escalations: 1,
					ladder: [{ from: "gpt-4o", to: "agent-model", effort: "xhigh" }],
				},
			},
		})
	);

	assert.deepEqual(directive, {
		kind: "select_model",
		model: "agent-model",
		effort: "xhigh",
		reason: "stuck-task escalation 1; effort xhigh",
	});
});

test("does not advance judge state when the side-model host call fails", async () => {
	const hook = (await hydratedHooks(manifest)).find(
		(entry) => entry.id === "effort-escalator.judge"
	);
	const failure = new Error("side model unavailable");
	const writes = [];
	await assert.rejects(
		runHook(
			hook,
			{
				conversation_id: "conversation-side-model-error",
				agent_id: "agent-1",
				transcript: [{ role: "user", content: "Please continue the task." }],
			},
			judgeHost({
				escalations: 0,
				sideModelError: failure,
				onSet: (...write) => writes.push(write),
			})
		),
		(error) => error === failure
	);
	assert.deepEqual(writes, []);
});

test("failed judging is retried only when the caller invokes the hook again", async () => {
	const hook = (await hydratedHooks(manifest)).find(
		(entry) => entry.id === "effort-escalator.judge"
	);
	const nowMs = 1_800_000_000_000;
	let attempts = 0;
	let storedState = JSON.stringify({
		checked_at: nowMs - 60_000,
		escalations: 0,
	});
	const failure = new Error("judge unavailable");
	const host = judgeHost({
		escalations: 0,
		afterMinutes: 1,
		checkedAgoMs: 60_000,
		nowMs,
		onJudge: () => {
			attempts += 1;
		},
		onSet: (_key, value) => {
			storedState = JSON.stringify(value);
		},
	});
	const originalSideModel = host.sideModel;
	host.sideModel = async (...args) => {
		if (attempts === 0) {
			attempts += 1;
			throw failure;
		}
		return originalSideModel(...args);
	};
	host.storage.get = async () => storedState;

	const context = {
		conversation_id: "conversation-explicit-retry",
		agent_id: "agent-1",
		transcript: [{ role: "user", content: "Please continue the task." }],
	};
	await assert.rejects(
		runHook(hook, context, host, { nowMs }),
		(error) => error === failure
	);
	assert.equal(attempts, 1);
	assert.equal(JSON.parse(storedState).escalations, 0);

	const directive = await runHook(hook, context, host, { nowMs });
	assert.equal(directive.kind, "note");
	assert.equal(attempts, 2);
	assert.equal(JSON.parse(storedState).escalations, 1);
});

test("persisted judge state is consumed once by model selection after readback", async () => {
	const hooks = await hydratedHooks(manifest);
	const judge = hooks.find((entry) => entry.id === "effort-escalator.judge");
	const select = hooks.find((entry) => entry.id === "effort-escalator.select");
	const nowMs = 1_800_000_000_000;
	let persisted = JSON.stringify({
		checked_at: nowMs - 60_000,
		escalations: 0,
	});
	const host = judgeHost({
		escalations: 0,
		afterMinutes: 1,
		checkedAgoMs: 60_000,
		nowMs,
		onSet: (_key, value) => {
			persisted = JSON.stringify(value);
		},
	});
	host.storage.get = async () => persisted;

	const judged = await runHook(
		judge,
		{
			conversation_id: "conversation-readback",
			agent_id: "agent-1",
			transcript: [{ role: "user", content: "Please continue the task." }],
		},
		host,
		{ nowMs }
	);
	assert.equal(judged.kind, "note");

	const selected = await runHook(
		select,
		{
			conversation_id: "conversation-readback",
			agent_id: "agent-1",
			event: { model: "gpt-4o-mini" },
		},
		host
	);
	assert.equal(selected.kind, "select_model");
	assert.equal(selected.model, "gpt-4o");
	assert.equal(JSON.parse(persisted).stuck, false);
	assert.deepEqual(
		await runHook(
			select,
			{
				conversation_id: "conversation-readback",
				agent_id: "agent-1",
				event: { model: "gpt-4o-mini" },
			},
			host
		),
		{ kind: "none" }
	);
});

test("concurrent conversations keep persisted escalation state isolated", async () => {
	const hook = (await hydratedHooks(manifest)).find(
		(entry) => entry.id === "effort-escalator.select"
	);
	const writes = [];
	const [alpha, beta] = await Promise.all([
		runHook(
			hook,
			{
				conversation_id: "alpha",
				agent_id: "agent-1",
				event: { model: "gpt-4o" },
			},
			stuckHost("true", (key, value) => writes.push([key, value]))
		),
		runHook(
			hook,
			{
				conversation_id: "beta",
				agent_id: "agent-1",
				event: { model: "gpt-4o" },
			},
			stuckHost("true", (key, value) => writes.push([key, value]))
		),
	]);

	assert.equal(alpha.kind, "select_model");
	assert.equal(beta.kind, "select_model");
	assert.deepEqual(writes.map(([key]) => key).sort(), [
		"effort-escalator:alpha",
		"effort-escalator:beta",
	]);
});

test("a refused selection write preserves the pending escalation for an explicit retry", async () => {
	const hook = (await hydratedHooks(manifest)).find(
		(entry) => entry.id === "effort-escalator.select"
	);
	const pending = JSON.stringify({ stuck: true, escalations: 1 });
	let persisted = pending;
	let writeAttempts = 0;
	const failure = new Error("storage unavailable");
	const host = stuckHost();
	host.storage.get = async () => persisted;
	host.storage.set = async (key, value) => {
		assert.equal(key, "effort-escalator:retry-selection");
		writeAttempts += 1;
		if (writeAttempts === 1) {
			throw failure;
		}
		persisted = JSON.stringify(value);
	};
	const ctx = {
		conversation_id: "retry-selection",
		agent_id: "agent-1",
		event: { model: "gpt-4o" },
	};
	await assert.rejects(runHook(hook, ctx, host), (error) => error === failure);
	assert.equal(persisted, pending);
	assert.equal(writeAttempts, 1);
	assert.equal((await runHook(hook, ctx, host)).model, "o3");
	assert.equal(writeAttempts, 2);
	assert.equal(JSON.parse(persisted).stuck, false);
	assert.deepEqual(await runHook(hook, ctx, host), { kind: "none" });
	assert.equal(writeAttempts, 2);
});

test("a progressing verdict clears stale stuck state without advancing the escalation ladder", async () => {
	const hooks = await hydratedHooks(manifest);
	const judge = hooks.find((entry) => entry.id === "effort-escalator.judge");
	const select = hooks.find((entry) => entry.id === "effort-escalator.select");
	const nowMs = 1_800_000_000_000;
	let persisted = JSON.stringify({
		checked_at: nowMs - 60_000,
		stuck: true,
		escalations: 1,
	});
	const calls = [];
	const host = judgeHost({ escalations: 1, afterMinutes: 1, nowMs });
	host.storage.get = async () => persisted;
	host.storage.set = async (_key, value) => {
		persisted = JSON.stringify(value);
	};
	host.sideModel = async (request) => {
		calls.push(request);
		return "STUCK: no\nThe tests now pass.";
	};
	assert.deepEqual(
		await runHook(
			judge,
			{
				conversation_id: "progressing",
				agent_id: "agent-1",
				transcript: [{ role: "assistant", content: "The tests pass now." }],
			},
			host,
			{ nowMs }
		),
		{ kind: "none" }
	);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].model_pref_key, "effort-escalator-judge-model");
	assert.deepEqual(JSON.parse(persisted), {
		checked_at: nowMs,
		escalations: 1,
		stuck: false,
	});
	assert.deepEqual(
		await runHook(
			select,
			{
				conversation_id: "progressing",
				agent_id: "agent-1",
				event: { model: "gpt-4o" },
			},
			host
		),
		{ kind: "none" }
	);
});
