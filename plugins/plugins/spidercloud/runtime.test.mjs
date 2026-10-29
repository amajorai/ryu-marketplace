import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));

test("the shipped crawl runnable has a registered Core loopback runtime proof", () => {
	assert.equal(manifest.id, "@ryu/spidercloud");
	const runtimeTestPath = join(
		HERE,
		"../../../apps/core/src/tool_exec/tests/spidercloud_runtime_test.rs"
	);
	assert.ok(existsSync(runtimeTestPath), "Core runtime proof exists");
	const runtimeTest = readFileSync(runtimeTestPath, "utf8");
	assert.ok(runtimeTest.includes("plugins/spidercloud/manifest.json"));
	assert.ok(runtimeTest.includes("https://api.spider.cloud/crawl"));
	assert.ok(runtimeTest.includes("RYU_SPIDERCLOUD_API_KEY"));
	assert.ok(runtimeTest.includes('"return_format": "markdown"'));
	assert.ok(runtimeTest.includes("fixture crawl unavailable"));

	const toolExecSource = readFileSync(
		join(HERE, "../../../apps/core/src/tool_exec/tests/mod.rs"),
		"utf8"
	);
	assert.ok(
		/#\[path\s*=\s*"spidercloud_runtime_test\.rs"\]\s*mod\s+spidercloud_runtime\s*;/.test(
			toolExecSource
		),
		"Core's tool_exec test module registers the package runtime proof"
	);
});
