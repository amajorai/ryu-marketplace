import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const hook = raw.contributes.turn_hooks[0];
hook.code = readFileSync(join(HERE, hook.code_file), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = (ctx, host) => new AsyncFunction("ctx", "host", hook.code)(ctx, host);

function harness(seed) {
	const store = new Map(seed ? [["tokenmaxxing:global", JSON.stringify(seed)]] : []);
	const notifications = [];
	return {
		notifications,
		host: {
			storage: {
				get: async (key) => store.get(key) ?? null,
				set: async (key, value) => store.set(key, value),
			},
			notify: async (value) => notifications.push(value),
		},
	};
}

const event = (active_count, transition_id, agent_id = "worker-a") => ({
	run_id: "run-1",
	agent_id,
	active_count,
	transition_id,
});

test("manifest uses flat code_file and narrow grants", () => {
	assert.deepEqual(raw.permission_grants, ["notifications:send", "storage:kv"]);
	assert.equal(hook.on, "delegation_lifecycle");
	assert.equal(typeof hook.code_file, "string");
	assert.equal(typeof hook.code, "string");
});

test("notifies exactly once on 1-to-0", async () => {
	const h = harness();
	await run({ event: event(1, 10) }, h.host);
	await run({ event: event(0, 11) }, h.host);
	await run({ event: event(0, 11) }, h.host);
	assert.equal(h.notifications.length, 1);
});

test("parallel and unrelated transitions stay silent", async () => {
	const h = harness();
	await run({ event: { ...event(1, 20), run_id: "run-a" } }, h.host);
	await run({ event: { ...event(2, 21), run_id: "run-b" } }, h.host);
	await run({ event: { ...event(1, 22), run_id: "run-a" } }, h.host);
	await run({ event: { ...event(0, 23), run_id: "run-b" } }, h.host);
	await run({ event: { ...event(0, 24), run_id: "unrelated" } }, h.host);
	assert.equal(h.notifications.length, 1);
});

test("malformed, out-of-order, and failed notification paths fail closed", async () => {
	const h = harness({ active_count: 1, transition_id: 50 });
	await run({ event: event(0, 49) }, h.host);
	await run({ event: { run_id: "run-1", active_count: 0, transition_id: 51 } }, h.host);
	assert.equal(h.notifications.length, 0);
	const failing = harness({ active_count: 1, transition_id: 60 });
	failing.host.notify = async () => { throw new Error("unavailable"); };
	await run({ event: event(0, 61) }, failing.host);
	assert.equal(failing.notifications.length, 0);
});
