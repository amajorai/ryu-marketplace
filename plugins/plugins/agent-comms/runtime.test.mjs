import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

test("the shipped directory tool has a registered Core loopback runtime proof", () => {
	const runtimeTestPath = join(
		HERE,
		"../../../apps/core/src/tool_exec/tests/agent_comms_runtime_test.rs"
	);
	assert.ok(existsSync(runtimeTestPath), "Core runtime proof exists");
	const runtimeTest = readFileSync(runtimeTestPath, "utf8");
	assert.ok(runtimeTest.includes("plugins/agent-comms/manifest.json"));
	assert.ok(runtimeTest.includes('"agents.directory"'));
	assert.ok(runtimeTest.includes('"core:/api/agents"'));
	assert.ok(runtimeTest.includes("tool:http-egress:127.0.0.1"));
	assert.ok(runtimeTest.includes("fixture rejected token"));
	assert.ok(runtimeTest.includes("fixture roster unavailable"));

	const toolExecSource = readFileSync(
		join(HERE, "../../../apps/core/src/tool_exec/tests/mod.rs"),
		"utf8"
	);
	assert.ok(
		/#\[path\s*=\s*"agent_comms_runtime_test\.rs"\]\s*mod\s+agent_comms_runtime\s*;/.test(
			toolExecSource
		),
		"Core's tool_exec test module registers the package's runtime proof"
	);
});
