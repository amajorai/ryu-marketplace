import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function manifest() {
	const value = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
	for (const hook of value.contributes.turn_hooks) {
		assert.equal(typeof hook.code_file, "string");
		hook.code = readFileSync(join(HERE, hook.code_file), "utf8");
	}
	return value;
}

function loadHook(value, id) {
	const hook = value.contributes.turn_hooks.find((entry) => entry.id === id);
	assert.ok(hook, "missing hook " + id);
	const fn = new AsyncFunction("ctx", "host", hook.code);
	return (ctx, host) => fn(ctx, host);
}

function makeHost() {
	const state = new Map();
	const calls = [];
	return {
		state,
		calls,
		host: {
		getPreference: async ({ key }) => ({
			"security-scanner-agent": "configured-agent",
			"security-scanner-workers": "4",
				"security-scanner-effort": "high",
			})[key] ?? "",
			runFanout: async ({ delegates }) => {
				calls.push(["runFanout", delegates.length, delegates.map((delegate) => delegate.agent_id)]);
				return {
					ok: true,
					results: delegates.map((delegate) => ({
						id: delegate.id,
						output: "Evidence for " + delegate.id + " at src/example.ts:12.",
					})),
				};
			},
			sideModel: async () => {
				calls.push(["sideModel"]);
				return "No verified vulnerability was established from the supplied evidence.";
			},
			runAgent: async () => {
				calls.push(["runAgent"]);
				return "Patch proposal only: validate the input and add a regression test.";
			},
			storage: {
				get: async (key) => state.get(key) ?? null,
				set: async (key, value) => state.set(key, typeof value === "string" ? value : JSON.stringify(value)),
				delete: async (key) => state.delete(key),
			},
			log: () => {},
		},
	};
}

function context(input, transcript = []) {
	return {
		conversation_id: "security-scanner-test",
		agent_id: "test-agent",
		input,
		transcript,
		flags: {},
	};
}

test("manifest wires both flat hooks and all required capabilities", () => {
	const value = manifest();
	assert.equal(value.id, "@ryu/security-scanner");
	assert.deepEqual(
		value.permission_grants.sort(),
		["hook:run-agent", "hook:side-model", "preferences:read", "storage:kv"].sort(),
	);
	assert.deepEqual(
		value.contributes.slash_commands.map((command) => command.command),
		["/security-scan", "/security-verify", "/security-fix", "/security-clear"],
	);
	assert.match(value.contributes.turn_hooks[0].code, /runFanout/);
	assert.match(value.contributes.turn_hooks[1].code, /sideModel/);
});

test("command hook runs scan, verification, proposal, and clear without writes", async () => {
	const value = manifest();
	const run = loadHook(value, "security-scanner.command");
	const { host, state, calls } = makeHost();

	const scan = await run(context("/security-scan quick auth"), host);
	assert.equal(scan.kind, "handled");
	assert.match(scan.text, /Mode: quick/);
	assert.match(scan.text, /Delegate coverage: 3\/3/);
	assert.deepEqual(calls[0][2], ["configured-agent", "configured-agent", "configured-agent"]);
	assert.ok(state.has("security-scanner-test"));

	const verification = await run(context("/security-verify F1"), host);
	assert.equal(verification.kind, "handled");
	assert.match(verification.text, /Security Scanner verification/);

	const proposal = await run(context("/security-fix F1"), host);
	assert.equal(proposal.kind, "handled");
	assert.match(proposal.text, /Patch proposal only/);

	const cleared = await run(context("/security-clear"), host);
	assert.deepEqual(cleared, {
		kind: "handled",
		text: "Security Scanner state cleared for this conversation.",
	});
	assert.equal(state.size, 0);
	assert.deepEqual(calls.map(([kind]) => kind), [
		"runFanout",
		"sideModel",
		"runFanout",
		"sideModel",
		"runAgent",
	]);
});

test("automatic review emits a static signal without an LLM finding", async () => {
	const value = manifest();
	const run = loadHook(value, "security-scanner.auto-review");
	const { host } = makeHost();
	const answer = "The config loader is shown below and needs review before deployment. cfg = yaml.load(open('config.yml')) and the object then flows into the application configuration layer.";
	const result = await run({
		conversation_id: "security-scanner-review",
		agent_id: "test-agent",
		transcript: [{ role: "assistant", content: answer }],
		flags: { "io.ryu.security-scanner.auto-review": true },
	}, host);
	assert.equal(result.kind, "note");
	assert.match(result.text, /Static signals to validate/);
	assert.match(result.text, /YAML/);
});
