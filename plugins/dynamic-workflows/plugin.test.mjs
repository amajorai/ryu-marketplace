import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

test("manifest registers the bounded workflow tool", () => {
	assert.equal(manifest.id, "@ryu/dynamic-workflows");
	assert.ok(manifest.permission_grants.includes("tool:execute"));
	assert.ok(manifest.permission_grants.includes("hook:run-agent"));
	const tool = manifest.runnables.find((entry) => entry.name === "workflow__run");
	assert.ok(tool);
	assert.equal(tool.kind, "tool");
	assert.equal(tool.config.backend, "inline_deno");
	assert.equal(tool.config.timeout_secs, 600);
	assert.deepEqual(tool.config.input_schema.required, ["tasks"]);
	assert.equal(typeof tool.config.code, "string");
	assert.ok(tool.config.code.includes("host.runFanout"));
});
