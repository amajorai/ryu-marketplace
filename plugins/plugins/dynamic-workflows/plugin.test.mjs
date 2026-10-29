// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isNativeText } from "../../../tools/dist/native-primitive-observation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

test("manifest registers the bounded workflow tool", () => {
	assert.equal(manifest.id, "@ryu/dynamic-workflows");
	assert.deepEqual(manifest.engines, { ryu: ">=0.1.0" });
	assert.ok(manifest.permission_grants.includes("tool:execute"));
	assert.ok(manifest.permission_grants.includes("hook:run-agent"));
	const tool = manifest.runnables.find(
		(entry) => entry.name === "workflow.run"
	);
	assert.ok(tool);
	assert.equal(tool.kind, "tool");
	assert.equal(tool.config.backend, "inline_js");
	assert.equal(tool.config.timeout_secs, 600);
	assert.deepEqual(tool.config.input_schema.required, ["tasks"]);
	assert.equal(isNativeText(tool.config.code), true);
	assert.ok(tool.config.code.includes("host.runFanout"));
});

test("Agent Plugins projection stays synchronized with the workflow package", () => {
	const projection = JSON.parse(
		readFileSync(join(here, "plugin.json"), "utf8")
	);
	assert.equal(projection.name, "ryu.dynamic-workflows");
	assert.equal(projection.version, manifest.version);
	assert.equal(projection.description, manifest.description);
	assert.equal(projection.repository, manifest.repository);
	assert.equal(projection.homepage, manifest.homepage);
	assert.deepEqual(projection.keywords, manifest.keywords);
	assert.deepEqual(projection.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
});

test("tool schema keeps task and cap bounds explicit", () => {
	const tool = manifest.runnables.find(
		(entry) => entry.config.slug === "workflow.run"
	);
	const schema = tool.config.input_schema;
	assert.equal(schema.properties.tasks.type, "array");
	assert.equal(schema.properties.tasks.minItems, 1);
	assert.equal(schema.properties.tasks.maxItems, 20);
	assert.deepEqual(schema.properties.tasks.items.required, ["task"]);
	assert.equal(schema.properties.tasks.items.additionalProperties, false);
	assert.deepEqual(
		{
			max_concurrent: [
				schema.properties.max_concurrent.minimum,
				schema.properties.max_concurrent.maximum,
			],
			wall_time_secs: [
				schema.properties.wall_time_secs.minimum,
				schema.properties.wall_time_secs.maximum,
			],
			max_tokens: [
				schema.properties.max_tokens.minimum,
				schema.properties.max_tokens.maximum,
			],
		},
		{
			max_concurrent: [1, 5],
			wall_time_secs: [5, 600],
			max_tokens: [1, 32_768],
		}
	);
});

test("manifest registers the durable workflow script tool", () => {
	const tool = manifest.runnables.find(
		(entry) => entry.name === "workflow.script"
	);
	assert.ok(tool);
	assert.equal(tool.kind, "tool");
	assert.equal(tool.config.backend, "inline_js");
	assert.equal(tool.config.timeout_secs, 600);
	assert.equal(isNativeText(tool.config.code), true);
	assert.ok(tool.config.code.includes("host.workflows.script"));
	assert.ok(tool.config.code.includes("host.workflows.status"));
	const schema = tool.config.input_schema;
	assert.equal(schema.additionalProperties, false);
	assert.equal(schema.properties.wait_secs.maximum, 540);
	assert.ok(
		schema.properties.wait_secs.maximum < tool.config.timeout_secs,
		"a wait must return before the sandbox deadline"
	);
	assert.deepEqual(schema.properties.preset.enum, [
		"research",
		"code_read",
		"code_write",
		"summarise",
	]);
});
