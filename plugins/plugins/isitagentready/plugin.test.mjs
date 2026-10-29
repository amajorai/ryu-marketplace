// Co-located contract test for the `isitagentready` plugin.
//
// `isitagentready` is a keyless, declarative HTTP-tool plugin: one POST tool
// runs a live scan through https://isitagentready.com/api/scan. Core merges
// `body_defaults` under the caller's body, so `format: "agent"` (a compact
// Markdown fix list) is the default and `format: "json"` still wins when asked.
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
	assert.equal(manifest.id, "@ryu/isitagentready");
	assert.equal(plugin.name, "ryu.isitagentready");
	assert.equal(plugin.version, manifest.version);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, manifest.name);
});

test("one keyless POST tool scans with the compact format by default", () => {
	assert.equal(manifest.runnables.length, 1);
	const { config } = manifest.runnables[0];
	assert.equal(config.slug, "isitagentready.scan");
	assert.equal(config.backend, "http");
	assert.equal(config.method, "POST");
	assert.equal(config.url, "https://isitagentready.com/api/scan");
	assert.equal(config.fail_open, true);
	assert.equal(config.unwrap_body, true);
	assert.equal(config.secret_headers, undefined);
	assert.deepEqual(config.body_defaults, { format: "agent" });
	assert.deepEqual(config.input_schema.required, ["url"]);
	// The two documented response formats, and the default is one of them.
	assert.deepEqual(config.input_schema.properties.format.enum, [
		"agent",
		"json",
	]);
});

test("egress is granted to exactly the called host and nothing else", () => {
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:isitagentready.com",
	]);
	assert.equal(manifest.mcp_servers, undefined);
	assert.equal(manifest.contributes, undefined);
});
