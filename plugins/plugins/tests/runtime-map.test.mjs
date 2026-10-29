import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	assertFreshSnapshot,
	assertListedFilters,
	assertRuntimeResult,
	CORE_RUNTIME_FILTERS,
	runtimePlan,
} from "./runtime-map.mjs";

test("binary link time cannot conceal source edits during a build or an in-flight compile", () => {
	assert.throws(
		() => assertFreshSnapshot(1000, 900, [{ path: "hook.js", modified: 950 }]),
		/changed after compilation began/
	);
	assert.throws(
		() => assertFreshSnapshot(800, 900, []),
		/predates the current compilation/
	);
	assert.doesNotThrow(() =>
		assertFreshSnapshot(1000, 900, [{ path: "hook.js", modified: 800 }])
	);
});

test("provider swaps share one exact execution and retain both package identities", () => {
	const plan = runtimePlan([
		"laya",
		"ollaya",
		"mem0",
		"unregistered-runtime-fixture",
	]);
	assert.deepEqual(plan.packages, ["laya", "ollaya", "mem0"]);
	assert.deepEqual(plan.boundaries, ["unregistered-runtime-fixture"]);
	assert.equal(plan.filters.length, 6);
	assert.equal(new Set(plan.filters).size, plan.filters.length);
});

test("missing exact filters are refused before runtime execution", () => {
	const filter = CORE_RUNTIME_FILTERS.mem0[0];
	assert.doesNotThrow(() =>
		assertListedFilters([filter], `${filter}: test\nother: test\n`)
	);
	assert.throws(
		() => assertListedFilters([filter], "other: test\n"),
		/missing from compiled binary/
	);
});

test("zero-test, failure, signal and launch errors cannot pass runtime", () => {
	assert.throws(
		() =>
			assertRuntimeResult("fixture", {
				status: 0,
				stdout:
					"test result: ok. 0 passed; 0 failed;\ntest result: ok. 1 passed; 0 failed;",
			}),
		/did not execute/
	);
	assert.throws(
		() =>
			assertRuntimeResult("fixture", {
				status: 0,
				stdout: "test result: ok. 0 passed; 0 failed;",
			}),
		/did not execute/
	);
	assert.throws(
		() =>
			assertRuntimeResult("fixture", {
				status: 1,
				stdout: "test result: ok. 1 passed; 0 failed;",
			}),
		/runtime failed/
	);
	assert.throws(
		() => assertRuntimeResult("fixture", { status: 0, signal: "SIGTERM" }),
		/runtime failed/
	);
	assert.throws(
		() =>
			assertRuntimeResult("fixture", {
				error: new Error("fixture launch failed"),
			}),
		/fixture launch failed/
	);
	assert.doesNotThrow(() =>
		assertRuntimeResult("fixture", {
			status: 0,
			stdout: "test result: ok. 1 passed; 0 failed; 0 ignored;",
		})
	);
});

test("plan inspection runs without compiling and exposes registered package filters", () => {
	const file = join(dirname(fileURLToPath(import.meta.url)), "runtime.mjs");
	const result = spawnSync(
		process.execPath,
		[file, "--package", "recap,security-scanner", "--list-plan"],
		{ encoding: "utf8" }
	);
	assert.equal(result.status, 0, result.stderr);
	const plan = JSON.parse(result.stdout);
	assert.deepEqual(plan.boundaries, []);
	assert.equal(plan.filters.length, 8);
});

test("runtime-only refuses unknown package identities and flags before compilation", () => {
	assert.equal(runtimePlan(["unregistered-runtime-fixture"]).filters.length, 0);
	const file = join(dirname(fileURLToPath(import.meta.url)), "runtime.mjs");
	for (const args of [
		["--package", "unregistered-runtime-fixture"],
		["--pretend-pass"],
	]) {
		const result = spawnSync(process.execPath, [file, ...args], {
			encoding: "utf8",
		});
		assert.notEqual(result.status, 0);
		assert.match(
			result.stderr,
			/Unknown plugins package ids|Unknown Core runtime flag/
		);
	}
});

test("runtime selector rejects duplicate, empty and unknown packages before compilation", () => {
	const file = join(dirname(fileURLToPath(import.meta.url)), "runtime.mjs");
	for (const value of ["mem0,mem0", ",,", "mem0,not-a-shipped-plugin"]) {
		const result = spawnSync(
			process.execPath,
			[file, "--package", value, "--list-plan"],
			{ encoding: "utf8" }
		);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /nonempty unique|Unknown plugins package/);
	}
});

test("Headroom bundled plan includes Core policy and all seven Gateway cases", () => {
	const file = join(dirname(fileURLToPath(import.meta.url)), "runtime.mjs");
	const result = spawnSync(
		process.execPath,
		[file, "--package", "headroom", "--list-plan"],
		{ encoding: "utf8" }
	);
	assert.equal(result.status, 0, result.stderr);
	const plan = JSON.parse(result.stdout);
	assert.equal(plan.filters.length, 3);
	assert.equal(plan.gatewayFilters.length, 7);
	assert.equal(new Set(plan.gatewayFilters).size, 7);
});
