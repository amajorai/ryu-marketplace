// Behaviour tests for the security-scanner hooks: automatic review verdict
// handling, scan modes and the reviewer-count preference, and failure paths of
// /security-verify and /security-fix that must keep the stored report intact.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const CONVERSATION = "security-scanner-behaviour";

function loadHook(id) {
	const value = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
	const hook = value.contributes.turn_hooks.find((entry) => entry.id === id);
	if (!hook) {
		throw new Error(`missing hook ${id}`);
	}
	const fn = new AsyncFunction(
		"ctx",
		"host",
		readFileSync(join(HERE, hook.code_file), "utf8")
	);
	return (ctx, host) => fn(ctx, host);
}

const runCommand = loadHook("security-scanner.command");
const runReview = loadHook("security-scanner.auto-review");

function makeHost(overrides = {}) {
	const state = new Map();
	const requests = [];
	const preferences = {
		"security-scanner-agent": "configured-agent",
		"security-scanner-workers": "4",
		...overrides.preferences,
	};
	const record = (path, args) => requests.push({ path, args });
	const host = {
		getPreference: async ({ key }) => {
			record("host.getPreference", { key });
			if (overrides.getPreference) {
				return overrides.getPreference(key);
			}
			return preferences[key] ?? "";
		},
		runFanout: async (args) => {
			record("host.runFanout", structuredClone(args));
			if (overrides.runFanout) {
				return overrides.runFanout(args);
			}
			return {
				results: args.delegates.map((entry) => ({
					id: entry.id,
					output: `Evidence for ${entry.id} at src/example.ts:12.`,
				})),
			};
		},
		sideModel: async (args) => {
			record("host.sideModel", structuredClone(args));
			if (overrides.sideModel) {
				return overrides.sideModel(args);
			}
			return "F1 high: command injection in src/example.ts:12.";
		},
		runAgent: async (args) => {
			record("host.runAgent", structuredClone(args));
			if (overrides.runAgent) {
				return overrides.runAgent(args);
			}
			return "Patch proposal only.";
		},
		storage: {
			get: async (key) => {
				record("host.storage.get", { key });
				return state.get(key) ?? null;
			},
			set: async (key, value) => {
				record("host.storage.set", { key });
				state.set(
					key,
					typeof value === "string" ? value : JSON.stringify(value)
				);
				return true;
			},
			delete: async (key) => {
				record("host.storage.delete", { key });
				return state.delete(key);
			},
		},
		log: (...args) => record("host.log", args),
	};
	return { host, state, requests };
}

function commandContext(input) {
	return {
		conversation_id: CONVERSATION,
		agent_id: "test-agent",
		input,
		transcript: [],
		flags: {},
	};
}

function reviewContext(answer) {
	return {
		conversation_id: CONVERSATION,
		agent_id: "test-agent",
		transcript: [
			{ role: "user", content: "Write the handler." },
			{ role: "assistant", content: answer },
		],
		flags: {},
	};
}

const pathsOf = (requests, path) =>
	requests.filter((request) => request.path === path);

// Code with no static rule hit, long enough and containing code markers.
const CLEAN_CODE = `\`\`\`ts
export function add(left: number, right: number): number {
	return left + right;
}
export function subtract(left: number, right: number): number {
	return left - right;
}
\`\`\``;
// Code that trips the child_process.exec static rule.
const RISKY_CODE = `\`\`\`js
import { exec } from "node:child_process";
export function run(name) {
	child_process.exec("ls " + name, () => undefined);
}
// padding so the answer is comfortably above the minimum length
\`\`\``;

test("auto-review: a clean model verdict with no static hit is suppressed", async () => {
	for (const verdict of ["RESULT: clean", "Looks secure.", "result: CLEAN"]) {
		const { host, requests } = makeHost({ sideModel: () => verdict });
		const result = await runReview(reviewContext(CLEAN_CODE), host);
		assert.deepEqual(result, { kind: "none" }, verdict);
		assert.equal(pathsOf(requests, "host.sideModel").length, 1);
	}
});

test("auto-review: a clean model verdict keeps static hits but omits the model section", async () => {
	for (const verdict of ["RESULT: clean", "Looks secure."]) {
		const { host } = makeHost({ sideModel: () => verdict });
		const result = await runReview(reviewContext(RISKY_CODE), host);
		assert.equal(result.kind, "note");
		assert.match(result.text, /Static signals to validate/);
		assert.match(result.text, /child_process call/);
		assert.doesNotMatch(result.text, /Independent model review/);
		assert.doesNotMatch(result.text, /RESULT: clean|Looks secure/);
	}
});

test("auto-review: a non-clean model reply is reported and clipped to 10000 chars", async () => {
	const finding = `F1 high: injection. ${"A".repeat(12_000)}TAIL_MARKER`;
	const { host, requests } = makeHost({ sideModel: () => finding });
	const result = await runReview(reviewContext(CLEAN_CODE), host);
	assert.equal(result.kind, "note");
	assert.doesNotMatch(result.text, /Static signals to validate/);
	const [, section] = result.text.split("Independent model review:\n");
	assert.equal(section, finding.slice(0, 10_000));
	assert.doesNotMatch(result.text, /TAIL_MARKER/);
	const [call] = pathsOf(requests, "host.sideModel");
	assert.equal(call.args.model_pref_key, "security-scanner-model");
	assert.match(call.args.prompt, /export function add/);
});

test("auto-review: side-model failure is logged and falls back to static hits", async () => {
	const failing = () => {
		throw new Error("model offline");
	};
	const risky = makeHost({ sideModel: failing });
	const withHits = await runReview(reviewContext(RISKY_CODE), risky.host);
	assert.equal(withHits.kind, "note");
	assert.match(withHits.text, /Static signals to validate/);
	assert.doesNotMatch(withHits.text, /Independent model review/);
	assert.deepEqual(
		pathsOf(risky.requests, "host.log").map((entry) => entry.args),
		[["security-scanner: automatic review failed"]]
	);

	const clean = makeHost({ sideModel: failing });
	const withoutHits = await runReview(reviewContext(CLEAN_CODE), clean.host);
	assert.deepEqual(withoutHits, { kind: "none" });
	assert.equal(pathsOf(clean.requests, "host.log").length, 1);
});

test("auto-review: short answers and prose without code markers never reach the model", async () => {
	const prose =
		"Thanks for the question. The weather this week will be pleasant with mild temperatures and a light breeze across the valley, so plan an outdoor walk.";
	assert.ok(prose.length >= 120);
	for (const answer of ["child_process.exec(input)", prose]) {
		const { host, requests } = makeHost();
		const result = await runReview(reviewContext(answer), host);
		assert.deepEqual(result, { kind: "none" });
		assert.equal(pathsOf(requests, "host.sideModel").length, 0);
	}
});

async function scan(input, overrides) {
	const fixture = makeHost(overrides);
	const result = await runCommand(commandContext(input), fixture.host);
	const [fanout] = pathsOf(fixture.requests, "host.runFanout");
	return { result, fanout: fanout.args, ...fixture };
}

test("scan: standard mode sends the clamped security-scanner-workers count", async () => {
	const cases = [
		["2", 2],
		["9", 5],
		["1", 2],
		["abc", 4],
		["5", 5],
	];
	for (const [workers, expected] of cases) {
		const { result, fanout, state } = await scan("/security-scan src/x", {
			preferences: { "security-scanner-workers": workers },
		});
		assert.match(result.text, /Mode: standard/, workers);
		assert.match(result.text, /Scope: src\/x/);
		assert.equal(fanout.delegates.length, expected, workers);
		assert.equal(fanout.caps.max_concurrent, expected);
		assert.match(
			result.text,
			new RegExp(`Delegate coverage: ${expected}/${expected}`)
		);
		assert.equal(JSON.parse(state.get(CONVERSATION)).mode, "standard");
	}
});

test("scan: a failing preference read falls back to four reviewers", async () => {
	const { result, fanout } = await scan("/security-scan src/x", {
		getPreference: () => {
			throw new Error("preferences unavailable");
		},
	});
	assert.match(result.text, /Mode: standard/);
	assert.equal(fanout.delegates.length, 4);
	for (const entry of fanout.delegates) {
		assert.equal(entry.agent_id, "test-agent");
	}
});

test("scan: diff aliases use diff mode and the working-tree-diff default scope", async () => {
	for (const alias of ["diff", "pr", "changes", "commit", "DIFF"]) {
		const { result, fanout } = await scan(`/security-scan ${alias}`);
		assert.match(result.text, /Mode: diff/, alias);
		assert.match(result.text, /Scope: the current working-tree diff/);
		assert.equal(fanout.delegates.length, 4);
		assert.match(fanout.delegates[0].task, /Scan mode: diff/);
		assert.match(fanout.delegates[0].task, /current working-tree diff/);
	}
	const scoped = await scan("/security-scan pr src/api");
	assert.match(scoped.result.text, /Mode: diff/);
	assert.match(scoped.result.text, /Scope: src\/api/);
});

test("scan: fast maps to quick and exhaustive or thorough map to deep", async () => {
	const fast = await scan("/security-scan fast auth", {
		preferences: { "security-scanner-workers": "5" },
	});
	assert.match(fast.result.text, /Mode: quick/);
	assert.equal(fast.fanout.delegates.length, 3);
	assert.equal(fast.fanout.caps.wall_time_secs, 360);
	for (const alias of ["exhaustive", "thorough"]) {
		const deep = await scan(`/security-scan ${alias} auth`, {
			preferences: { "security-scanner-workers": "2" },
		});
		assert.match(deep.result.text, /Mode: deep/, alias);
		assert.equal(deep.fanout.delegates.length, 5);
		assert.equal(deep.fanout.caps.wall_time_secs, 600);
		assert.match(deep.result.text, /Scope: auth/);
	}
});

async function scannedHost(overrides) {
	const fixture = makeHost(overrides);
	const scanResult = await runCommand(
		commandContext("/security-scan quick auth"),
		fixture.host
	);
	const saved = fixture.state.get(CONVERSATION);
	if (!(scanResult.text.includes("Status: complete") && saved)) {
		throw new Error("fixture scan did not persist a complete report");
	}
	fixture.requests.length = 0;
	return { ...fixture, saved };
}

test("verify: a fan-out failure leaves the stored report unchanged", async () => {
	let fail = false;
	const fixture = await scannedHost({
		runFanout: (args) => {
			if (fail) {
				throw new Error("reviewers unavailable");
			}
			return {
				results: args.delegates.map((entry) => ({
					id: entry.id,
					output: "ok",
				})),
			};
		},
	});
	fail = true;
	const result = await runCommand(
		commandContext("/security-verify F1"),
		fixture.host
	);
	assert.deepEqual(result, {
		kind: "handled",
		text: "Security Scanner verification could not start. The previous report remains unchanged.",
	});
	assert.equal(pathsOf(fixture.requests, "host.sideModel").length, 0);
	assert.equal(pathsOf(fixture.requests, "host.storage.set").length, 0);
	assert.equal(fixture.state.get(CONVERSATION), fixture.saved);
});

test("verify: no usable verifier output leaves the stored report unchanged", async () => {
	for (const empty of [{ results: [] }, {}, null]) {
		let verifying = false;
		const fixture = await scannedHost({
			runFanout: (args) =>
				verifying
					? empty
					: {
							results: args.delegates.map((entry) => ({
								id: entry.id,
								output: "ok",
							})),
						},
		});
		verifying = true;
		const result = await runCommand(
			commandContext("/security-verify F1"),
			fixture.host
		);
		assert.match(result.text, /returned no evidence/);
		assert.match(result.text, /previous report remains unchanged/);
		assert.equal(pathsOf(fixture.requests, "host.sideModel").length, 0);
		assert.equal(pathsOf(fixture.requests, "host.storage.set").length, 0);
		assert.equal(fixture.state.get(CONVERSATION), fixture.saved);
	}
});

test("fix: a throwing or empty planner proposes nothing and keeps state", async () => {
	const planners = [
		[
			() => {
				throw new Error("planner crashed");
			},
			true,
		],
		[() => "", false],
		[() => "   ", false],
	];
	for (const [runAgent, logs] of planners) {
		const fixture = await scannedHost({ runAgent });
		const result = await runCommand(
			commandContext("/security-fix F1"),
			fixture.host
		);
		assert.deepEqual(result, {
			kind: "handled",
			text: "Security Scanner could not produce a patch proposal. No files were changed.",
		});
		assert.equal(pathsOf(fixture.requests, "host.runAgent").length, 1);
		assert.equal(pathsOf(fixture.requests, "host.storage.set").length, 0);
		assert.deepEqual(
			pathsOf(fixture.requests, "host.log").map((entry) => entry.args),
			logs ? [["security-scanner: fix planner failed"]] : []
		);
		assert.equal(fixture.state.get(CONVERSATION), fixture.saved);
	}
});
