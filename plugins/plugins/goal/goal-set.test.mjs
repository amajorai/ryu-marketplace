// The `goal.set` inline tool, run from its sealed manifest body against a mock
// host: it stores an active goal under the caller's conversation only, and
// rejects invalid input or a failed write instead of reporting success.
// Run with:  node --test plugins-store/plugins/goal/goal-set.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import {
	isNativeNumber,
	isNativeText,
} from "../../../tools/dist/native-primitive-observation.mjs";
import {
	loadToolRunner,
	makeHost,
	parseManifest,
} from "./goal.test-fixture.mjs";

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
