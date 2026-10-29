// Guard the package-to-Core runtime proof for the shipped Parallel manifest.
// Runner: plugins-store/tests/run.mjs plugins --package parallel
//
// The HTTP behavior is exercised by Core's real run_http_tool dispatcher in
// apps/core/src/tool_exec/tests/parallel_runtime_test.rs. This package-owned
// suite keeps that runtime proof registered and tied to the manifest's three
// shipped runnable endpoints.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const runtimeTestPath = join(
	here,
	"../../../apps/core/src/tool_exec/tests/parallel_runtime_test.rs"
);
const runtimeTest = readFileSync(runtimeTestPath, "utf8");
const toolExec = readFileSync(
	join(here, "../../../apps/core/src/tool_exec/tests/mod.rs"),
	"utf8"
);

test("Core registers a loopback dispatcher proof for the shipped runnables", () => {
	assert.equal(manifest.id, "@ryu/parallel");
	assert.equal(manifest.runnables.length, 3);
	assert.ok(runtimeTest.includes("plugins/parallel/manifest.json"));
	assert.match(
		toolExec,
		/#\[path\s*=\s*"parallel_runtime_test\.rs"\]\s*mod\s+parallel_runtime\s*;/
	);
	assert.ok(
		runtimeTest.includes("PluginManifest::parse_and_validate_with_code")
	);
	assert.ok(runtimeTest.includes("run_http_tool("));
	for (const runnable of manifest.runnables) {
		assert.ok(
			runtimeTest.includes(runnable.config.slug),
			`Core runtime proof does not cover ${runnable.config.slug}`
		);
		assert.ok(
			runtimeTest.includes(runnable.config.url),
			`Core runtime proof does not pin ${runnable.config.url}`
		);
	}
});

test("the Core fixture covers grants, fake-key isolation, and failure envelopes", () => {
	assert.ok(runtimeTest.includes('"tool:http-egress:127.0.0.1"'));
	assert.ok(runtimeTest.includes("parallel-fixture-key-not-real"));
	assert.ok(
		runtimeTest.includes("secret headers require an HTTPS destination")
	);
	assert.ok(runtimeTest.includes("http egress to '127.0.0.1' is not granted"));
	assert.ok(runtimeTest.includes("fixture-auth-failure"));
	assert.ok(runtimeTest.includes("fixture-rate-limit"));
	assert.ok(runtimeTest.includes("fixture-upstream-failure"));
	assert.ok(runtimeTest.includes("endpoint not reachable:"));
	assert.ok(runtimeTest.includes("accepted.load(Ordering::SeqCst)"));
	assert.ok(runtimeTest.includes("transport is not retried"));
});
