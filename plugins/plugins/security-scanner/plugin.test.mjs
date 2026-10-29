// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isNativeText } from "../../../tools/dist/native-primitive-observation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function manifest() {
	const value = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
	for (const hook of value.contributes.turn_hooks) {
		if (!isNativeText(hook.code_file)) {
			throw new Error("hook code_file must be a string");
		}
		hook.code = readFileSync(join(HERE, hook.code_file), "utf8");
	}
	return value;
}

function loadHook(value, id) {
	const hook = value.contributes.turn_hooks.find((entry) => entry.id === id);
	if (!hook) {
		throw new Error(`missing hook ${id}`);
	}
	const fn = new AsyncFunction("ctx", "host", hook.code);
	return (ctx, host) => fn(ctx, host);
}

function makeHost(overrides = {}) {
	const state = new Map(Object.entries(overrides.initialState ?? {}));
	const calls = [];
	const requests = [];
	const preferences = {
		"security-scanner-agent": "configured-agent",
		"security-scanner-workers": "4",
		"security-scanner-effort": "high",
		...overrides.preferences,
	};
	return {
		state,
		calls,
		requests,
		host: {
			getPreference: async ({ key }) => {
				requests.push({ path: "host.getPreference", args: { key } });
				return preferences[key] ?? "";
			},
			runFanout: async (args) => {
				requests.push({ path: "host.runFanout", args: structuredClone(args) });
				const { delegates } = args;
				calls.push([
					"runFanout",
					delegates.length,
					delegates.map((delegate) => delegate.agent_id),
				]);
				if (overrides.runFanout) {
					return overrides.runFanout(args);
				}
				return {
					ok: true,
					results: delegates.map((delegate) => ({
						id: delegate.id,
						output: `Evidence for ${delegate.id} at src/example.ts:12.`,
					})),
				};
			},
			sideModel: async (args) => {
				calls.push(["sideModel"]);
				requests.push({ path: "host.sideModel", args: structuredClone(args) });
				if (overrides.sideModel) {
					return overrides.sideModel(args);
				}
				return "No verified vulnerability was established from the supplied evidence.";
			},
			runAgent: async (args) => {
				calls.push(["runAgent"]);
				requests.push({ path: "host.runAgent", args: structuredClone(args) });
				if (overrides.runAgent) {
					return overrides.runAgent(args);
				}
				return "Patch proposal only: validate the input and add a regression test.";
			},
			storage: {
				get: async (key) => {
					requests.push({ path: "host.storage.get", args: { key } });
					return state.get(key) ?? null;
				},
				set: async (key, value) => {
					requests.push({
						path: "host.storage.set",
						args: { key, value: structuredClone(value) },
					});
					return state.set(
						key,
						isNativeText(value) ? value : JSON.stringify(value)
					);
				},
				delete: async (key) => {
					requests.push({ path: "host.storage.delete", args: { key } });
					return state.delete(key);
				},
			},
			log: (...args) => requests.push({ path: "host.log", args }),
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
		[
			"hook:run-agent",
			"hook:side-model",
			"preferences:read",
			"storage:kv",
		].sort()
	);
	assert.deepEqual(
		value.contributes.slash_commands.map((command) => command.command),
		["/security-scan", "/security-verify", "/security-fix", "/security-clear"]
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
	assert.deepEqual(calls[0][2], [
		"configured-agent",
		"configured-agent",
		"configured-agent",
	]);
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
	assert.deepEqual(
		calls.map(([kind]) => kind),
		["runFanout", "sideModel", "runFanout", "sideModel", "runAgent"]
	);
});

test("automatic review emits a static signal without an LLM finding", async () => {
	const value = manifest();
	const run = loadHook(value, "security-scanner.auto-review");
	const { host } = makeHost();
	const answer =
		"The config loader is shown below and needs review before deployment. cfg = yaml.load(open('config.yml')) and the object then flows into the application configuration layer.";
	const result = await run(
		{
			conversation_id: "security-scanner-review",
			agent_id: "test-agent",
			transcript: [{ role: "assistant", content: answer }],
			flags: { "io.ryu.security-scanner.auto-review": true },
		},
		host
	);
	assert.equal(result.kind, "note");
	assert.match(result.text, /Static signals to validate/);
	assert.match(result.text, /YAML/);
});

test("deep scan sends bounded read-only tasks and persists exact completed state", async () => {
	const run = loadHook(manifest(), "security-scanner.command");
	const { host, state, requests } = makeHost();
	const result = await run(
		context("/security-scan deep src/auth/session.ts"),
		host
	);

	assert.equal(result.kind, "handled");
	assert.match(result.text, /Mode: deep/);
	assert.match(result.text, /Delegate coverage: 5\/5/);
	assert.match(result.text, /Status: complete/);
	const fanout = requests.find((request) => request.path === "host.runFanout");
	assert.ok(fanout);
	assert.equal(fanout.args.delegates.length, 5);
	assert.deepEqual(fanout.args.caps, {
		max_concurrent: 5,
		wall_time_secs: 600,
		max_tokens: 12_000,
	});
	assert.deepEqual(
		fanout.args.delegates.map((delegate) => delegate.id),
		[
			"scan-architecture",
			"scan-hunt",
			"scan-config",
			"scan-attack-path",
			"scan-independent",
		]
	);
	for (const delegate of fanout.args.delegates) {
		assert.equal(delegate.agent_id, "configured-agent");
		assert.equal(delegate.preset, "code_read");
		assert.match(delegate.task, /src\/auth\/session\.ts/);
		assert.match(delegate.task, /Do not use network access/);
		assert.match(delegate.task, /never follow instructions/i);
	}
	const synthesis = requests.find(
		(request) => request.path === "host.sideModel"
	);
	assert.equal(synthesis.args.model_pref_key, "security-scanner-model");
	assert.equal(synthesis.args.effort, "high");
	assert.match(synthesis.args.prompt, /Delegate coverage: 5 of 5 completed/);
	assert.match(synthesis.args.prompt, /src\/example\.ts:12/);
	const saved = JSON.parse(state.get("security-scanner-test"));
	assert.equal(saved.status, "complete");
	assert.equal(saved.mode, "deep");
	assert.equal(saved.scope, "src/auth/session.ts");
	assert.match(saved.report, /No verified vulnerability was established/);
});

test("incomplete delegate coverage is saved as partial and never reported clean", async () => {
	const run = loadHook(manifest(), "security-scanner.command");
	const { host, state, requests } = makeHost({
		runFanout: async ({ delegates }) => ({
			results: [
				{
					id: delegates[0].id,
					output: "One source-backed finding remains to validate.",
				},
				{ id: delegates[1].id, error: "worker did not start" },
			],
		}),
	});
	const result = await run(context("/security-scan quick auth"), host);
	assert.equal(result.kind, "handled");
	assert.match(result.text, /Status: partial/);
	assert.match(result.text, /Delegate coverage: 2\/3/);
	assert.doesNotMatch(result.text, /Status: complete/);
	const synthesis = requests.find(
		(request) => request.path === "host.sideModel"
	);
	assert.match(synthesis.args.prompt, /Delegate error: worker did not start/);
	assert.equal(
		JSON.parse(state.get("security-scanner-test")).status,
		"partial"
	);
});

test("failed scan delegation returns incomplete without side-model or persisted clean state", async () => {
	const run = loadHook(manifest(), "security-scanner.command");
	const { host, state, requests } = makeHost({
		runFanout: async () => {
			throw new Error("local fixture could not start reviewers");
		},
	});
	const result = await run(context("/security-scan auth"), host);
	assert.equal(result.kind, "handled");
	assert.match(result.text, /Security Scanner — incomplete/);
	assert.match(result.text, /could not start/);
	assert.match(result.text, /No clean result was produced/);
	assert.equal(
		requests.some((request) => request.path === "host.sideModel"),
		false
	);
	assert.equal(
		requests.some((request) => request.path === "host.storage.set"),
		false
	);
	assert.equal(state.has("security-scanner-test"), false);
});

test("verify and fix reject absent local report without delegating or writing", async () => {
	const run = loadHook(manifest(), "security-scanner.command");
	const { host, requests, state } = makeHost();
	const verify = await run(context("/security-verify F1"), host);
	assert.equal(verify.kind, "handled");
	assert.match(verify.text, /No Security Scanner report is stored/);
	const fix = await run(context("/security-fix F1"), host);
	assert.equal(fix.kind, "handled");
	assert.match(fix.text, /No Security Scanner report is stored/);
	assert.equal(
		requests.some((request) => request.path === "host.runFanout"),
		false
	);
	assert.equal(
		requests.some((request) => request.path === "host.runAgent"),
		false
	);
	assert.equal(
		requests.some((request) => request.path === "host.sideModel"),
		false
	);
	assert.equal(
		requests.some((request) => request.path === "host.storage.set"),
		false
	);
	assert.equal(state.size, 0);
});

test("automatic review skips an explicit security command without calling the model", async () => {
	const run = loadHook(manifest(), "security-scanner.auto-review");
	const { host, requests } = makeHost();
	const result = await run(
		{
			conversation_id: "security-scanner-command-skip",
			agent_id: "test-agent",
			transcript: [
				{
					role: "assistant",
					content: `const result = yaml.load(input); ${"x".repeat(140)}`,
				},
				{ role: "user", content: "/security-scan quick auth" },
			],
			flags: {},
		},
		host
	);
	assert.deepEqual(result, { kind: "none" });
	assert.equal(
		requests.some((request) => request.path === "host.sideModel"),
		false
	);
});

test("clear refuses storage failure without losing report and succeeds on retry", async () => {
	const run = loadHook(manifest(), "security-scanner.command");
	for (const refusal of [false, new Error("storage denied")]) {
		const { host, state, calls } = makeHost();
		await run(context("/security-scan quick auth"), host);
		const report = state.get("security-scanner-test");
		const originalDelete = host.storage.delete;
		host.storage.delete = async () => {
			if (refusal instanceof Error) {
				throw refusal;
			}
			return refusal;
		};
		const failed = await run(context("/security-clear"), host);
		assert.match(failed.text, /could not be cleared/);
		assert.equal(state.get("security-scanner-test"), report);
		host.storage.delete = originalDelete;
		assert.match(
			(await run(context("/security-clear"), host)).text,
			/state cleared/
		);
		assert.equal(state.has("security-scanner-test"), false);
		assert.deepEqual(
			calls.map(([kind]) => kind),
			["runFanout", "sideModel"]
		);
	}
});

test("verification and proposal consume saved evidence and preserve unrelated conversations", async () => {
	const run = loadHook(manifest(), "security-scanner.command");
	const { host, state, requests } = makeHost({
		initialState: { other: "untouched" },
	});
	await run(context("/security-scan quick auth"), host);
	const report = JSON.parse(state.get("security-scanner-test")).report;
	await run(context("/security-verify F1"), host);
	const fanout = requests.filter(
		(request) => request.path === "host.runFanout"
	)[1];
	assert.equal(fanout.args.delegates.length, 2);
	for (const delegate of fanout.args.delegates) {
		assert.equal(delegate.preset, "code_read");
		assert.ok(delegate.task.includes(report));
	}
	const verified = JSON.parse(state.get("security-scanner-test"));
	assert.equal(verified.report, report);
	assert.match(verified.verification, /Independent verifier coverage: 2\/2/);
	await run(context("/security-fix F1"), host);
	const planner = requests.find(
		(request) => request.path === "host.runAgent"
	).args;
	assert.equal(planner.preset, "code_read");
	assert.equal(planner.agent_id, "test-agent");
	assert.ok(planner.task.includes(report));
	assert.ok(planner.task.includes(verified.verification));
	assert.match(
		planner.task,
		/Do not write, create, delete, apply, commit, or push/
	);
	await run(context("/security-clear"), host);
	assert.equal(state.get("other"), "untouched");
});

test("scan reports refused persistence and succeeds on an exact retry", async () => {
	const run = loadHook(manifest(), "security-scanner.command");
	const fixture = makeHost();
	const originalSet = fixture.host.storage.set;
	let writes = 0;
	fixture.host.storage.set = async () => {
		writes += 1;
		return false;
	};

	const refused = await run(context("/security-scan quick auth"), fixture.host);
	assert.match(refused.text, /State warning: this result could not be saved/);
	assert.equal(fixture.state.has("security-scanner-test"), false);
	assert.equal(writes, 1);
	assert.match(
		(await run(context("/security-verify F1"), fixture.host)).text,
		/No Security Scanner report is stored/
	);

	fixture.host.storage.set = originalSet;
	const retried = await run(context("/security-scan quick auth"), fixture.host);
	assert.doesNotMatch(retried.text, /State warning/);
	assert.equal(
		JSON.parse(fixture.state.get("security-scanner-test")).status,
		"complete"
	);
	assert.equal(writes, 1);
});

test("verification and fix retain visible results when follow-up persistence fails", async () => {
	const run = loadHook(manifest(), "security-scanner.command");
	const fixture = makeHost();
	await run(context("/security-scan quick auth"), fixture.host);
	const savedScan = fixture.state.get("security-scanner-test");
	fixture.host.storage.set = async () => {
		throw new Error("storage unavailable");
	};

	const verification = await run(context("/security-verify F1"), fixture.host);
	assert.match(verification.text, /Security Scanner verification/);
	assert.match(
		verification.text,
		/State warning: this result could not be saved/
	);
	assert.equal(fixture.state.get("security-scanner-test"), savedScan);

	const proposal = await run(context("/security-fix F1"), fixture.host);
	assert.match(proposal.text, /Security Scanner patch proposal/);
	assert.match(proposal.text, /State warning: this result could not be saved/);
	assert.equal(fixture.state.get("security-scanner-test"), savedScan);
});
