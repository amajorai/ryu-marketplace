// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isNativeText } from "../../../tools/dist/native-primitive-observation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));
const hook = raw.contributes.turn_hooks[0];
hook.code = readFileSync(join(HERE, hook.code_file), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = (ctx, host) =>
	new AsyncFunction("ctx", "host", hook.code)(ctx, host);

function harness(seed) {
	const store = new Map(
		seed ? [["tokenmaxxing:run-1", JSON.stringify(seed)]] : []
	);
	const notifications = [];
	return {
		notifications,
		store,
		host: {
			storage: {
				get: async (key) => store.get(key) ?? null,
				set: async (key, value) => store.set(key, value),
			},
			notify: async (value) => notifications.push(value),
		},
	};
}

const event = (
	active_count,
	transition_id,
	agent_id = "worker-a",
	run_active_count = active_count
) => ({
	run_id: "run-1",
	agent_id,
	active_count,
	run_active_count,
	transition_id,
});

test("manifest uses flat code_file and narrow grants", () => {
	assert.equal(raw.id, "@ryu/tokenmaxxing");
	assert.equal(raw.name, "Tokenmaxxing");
	assert.equal(plugin.version, raw.version);
	assert.deepEqual(raw.permission_grants, ["notifications:send", "storage:kv"]);
	assert.deepEqual(raw.activation_events, ["*"]);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: raw.id,
		displayName: raw.name,
	});
	assert.equal(hook.on, "delegation_lifecycle");
	assert.equal(isNativeText(hook.code_file), true);
	assert.equal(isNativeText(hook.code), true);
});

test("notifies exactly once on 1-to-0", async () => {
	const h = harness();
	await run({ event: event(1, 10, "worker-a", 1) }, h.host);
	await run({ event: event(0, 11, "worker-a", 0) }, h.host);
	await run({ event: event(0, 11) }, h.host);
	assert.equal(h.notifications.length, 1);
});

test("a final 0 processed before the 1 it followed still notifies once", async () => {
	const h = harness();
	await run({ event: event(1, 90, "worker-a", 1) }, h.host);
	await run({ event: event(2, 91, "worker-b", 2) }, h.host);
	// Dispatch reordered: the last finish (id 93) lands before id 92.
	await run({ event: event(0, 93, "worker-b", 0) }, h.host);
	await run({ event: event(1, 92, "worker-a", 1) }, h.host);
	assert.equal(h.notifications.length, 1);
});

test("a fan-out wider than its concurrency notifies once, at the end", async () => {
	// Core's sequence for 3 delegates at concurrency 1: all three are counted
	// when queued, so the run's count drains 3 -> 0 across the admits/finishes.
	const h = harness();
	const sequence = [
		["worker-a", 1, 3],
		["worker-a", 0, 2],
		["worker-b", 1, 2],
		["worker-b", 0, 1],
		["worker-c", 1, 1],
	];
	let id = 100;
	for (const [agent, active, runActive] of sequence) {
		id += 1;
		await run({ event: event(active, id, agent, runActive) }, h.host);
	}
	assert.equal(h.notifications.length, 0);
	await run({ event: event(0, id + 1, "worker-c", 0) }, h.host);
	assert.equal(h.notifications.length, 1);
});

test("parallel and unrelated transitions stay silent", async () => {
	const h = harness();
	await run(
		{ event: { ...event(1, 20, "worker-a", 1), run_id: "run-a" } },
		h.host
	);
	await run(
		{ event: { ...event(2, 21, "worker-b", 1), run_id: "run-b" } },
		h.host
	);
	await run(
		{ event: { ...event(1, 22, "worker-a", 0), run_id: "run-a" } },
		h.host
	);
	await run(
		{ event: { ...event(0, 23, "worker-b", 0), run_id: "run-b" } },
		h.host
	);
	await run(
		{ event: { ...event(0, 24, "unrelated", 0), run_id: "unrelated" } },
		h.host
	);
	assert.equal(h.notifications.length, 2);
});

test("malformed, out-of-order, and failed notification paths fail closed", async () => {
	const h = harness({
		active_count: 1,
		run_active_count: 1,
		transition_id: 50,
	});
	await run({ event: event(0, 49, "worker-a", 0) }, h.host);
	await run(
		{
			event: {
				run_id: "run-1",
				active_count: 0,
				run_active_count: 0,
				transition_id: 51,
			},
		},
		h.host
	);
	assert.equal(h.notifications.length, 0);
	const failing = harness({
		active_count: 1,
		run_active_count: 1,
		transition_id: 60,
	});
	failing.host.notify = async () => {
		throw new Error("unavailable");
	};
	await run({ event: event(0, 61, "worker-a", 0) }, failing.host);
	assert.equal(failing.notifications.length, 0);
});

test("notification refusal can be retried exactly once", async () => {
	const h = harness({
		active_count: 1,
		run_active_count: 1,
		transition_id: 70,
	});
	let attempts = 0;
	h.host.notify = async (value) => {
		attempts += 1;
		if (attempts === 1) {
			throw new Error("permission refused");
		}
		h.notifications.push(value);
	};

	await run({ event: event(0, 71, "worker-a", 0) }, h.host);
	await run({ event: event(0, 71, "worker-a", 0) }, h.host);
	await run({ event: event(0, 71, "worker-a", 0) }, h.host);
	assert.equal(attempts, 2, "one refusal and one retry");
	assert.equal(h.notifications.length, 1, "successful retry is not duplicated");
});

test("stored transition survives host reconstruction and suppresses replay", async () => {
	const h = harness();
	await run({ event: event(1, 80, "worker-a", 1) }, h.host);
	await run({ event: event(0, 81, "worker-a", 0) }, h.host);

	const persisted = h.store.get("tokenmaxxing:run-1");
	const relaunched = harness();
	relaunched.store.set("tokenmaxxing:run-1", persisted);
	await run({ event: event(0, 81, "worker-a", 0) }, relaunched.host);
	assert.equal(relaunched.notifications.length, 0);
});
