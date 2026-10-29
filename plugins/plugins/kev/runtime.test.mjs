// Guard the package-to-Core runtime proof for Kev's keyless System One tools.
// Runner: plugins-store/tests/run.mjs plugins --package kev
//
// Core exercises the actual manifest runnables through run_http_tool in
// apps/core/src/tool_exec/tests/kev_runtime_test.rs. This package-owned test keeps
// the proof registered and tied to both keyless HTTP endpoints.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const runtimeTestPath = join(
	here,
	"../../../apps/core/src/tool_exec/tests/kev_runtime_test.rs"
);
const runtimeTest = readFileSync(runtimeTestPath, "utf8");
const toolExec = readFileSync(
	join(here, "../../../apps/core/src/tool_exec/tests/mod.rs"),
	"utf8"
);

test("Core registers a loopback proof for both shipped Kev HTTP tools", () => {
	assert.equal(manifest.id, "@ryu/kev");
	assert.equal(manifest.runnables.length, 2);
	assert.ok(runtimeTest.includes("plugins/kev/manifest.json"));
	assert.match(
		toolExec,
		/#\[path\s*=\s*"kev_runtime_test\.rs"\]\s*mod\s+kev_runtime\s*;/
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

test("the Core fixture checks grants, keyless requests, and failures", () => {
	assert.ok(runtimeTest.includes('"tool:http-egress:127.0.0.1"'));
	assert.ok(runtimeTest.includes("http egress to '127.0.0.1' is not granted"));
	assert.ok(runtimeTest.includes('"authorization": null'));
	assert.ok(runtimeTest.includes("fixture-auth-failure"));
	assert.ok(runtimeTest.includes("fixture-upstream-failure"));
	assert.ok(runtimeTest.includes("http tool request failed:"));
	assert.ok(runtimeTest.includes("transport_attempts.load(Ordering::SeqCst)"));
	assert.ok(runtimeTest.includes('models.get("secret_headers").is_none()'));
	assert.ok(runtimeTest.includes('predict.get("secret_headers").is_none()'));
});

test("Core's configured-secret HTTPS refusal remains covered separately", () => {
	const genericPolicyTest = readFileSync(
		join(
			here,
			"../../../apps/core/src/tool_exec/tests/parallel_runtime_test.rs"
		),
		"utf8"
	);
	assert.ok(genericPolicyTest.includes("parallel-fixture-key-not-real"));
	assert.ok(
		genericPolicyTest.includes("secret headers require an HTTPS destination")
	);
	assert.ok(genericPolicyTest.includes("secret guard performs no I/O"));
});
