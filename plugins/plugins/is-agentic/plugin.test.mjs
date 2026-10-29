// Co-located contract test for the `is-agentic` plugin.
//
// `is-agentic` is a keyless, declarative HTTP-tool plugin: one GET tool reads
// the latest completed report from https://is-agentic.com/api/v1/report. Core's
// `build_rest_request` turns a GET tool's arguments into the query string
// verbatim, so every schema property must be a real upstream query parameter.
// Core execution against a loopback fixture is covered by
// `apps/core/src/tool_exec/tests/agent_readiness_runtime_test.rs`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PluginManifestSchema } from "../../../packages/sdk/src/manifest.ts";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));

test("the manifest parses against the SDK schema with stable identity", () => {
	assert.doesNotThrow(() => PluginManifestSchema.parse(manifest));
	assert.equal(manifest.id, "@ryu/is-agentic");
	assert.equal(plugin.name, "ryu.is-agentic");
	assert.equal(plugin.version, manifest.version);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, manifest.name);
});

test("one keyless GET tool reads the versioned report endpoint", () => {
	assert.equal(manifest.runnables.length, 1);
	const { config } = manifest.runnables[0];
	assert.equal(config.slug, "is_agentic.report");
	assert.equal(config.backend, "http");
	assert.equal(config.method, "GET");
	assert.equal(config.url, "https://is-agentic.com/api/v1/report");
	assert.equal(config.fail_open, true);
	assert.equal(config.unwrap_body, true);
	assert.equal(config.secret_headers, undefined);
	assert.equal(config.body_defaults, undefined);
	assert.deepEqual(Object.keys(config.input_schema.properties), ["url"]);
	assert.deepEqual(config.input_schema.required, ["url"]);
});

test("egress is granted to exactly the called host and nothing else", () => {
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:is-agentic.com",
	]);
	assert.equal(manifest.mcp_servers, undefined);
	assert.equal(manifest.contributes, undefined);
});
