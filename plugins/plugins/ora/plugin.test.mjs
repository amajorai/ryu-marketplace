// Co-located contract test for the `ora` plugin.
//
// `ora` is a keyless, declarative HTTP-tool plugin over the public read
// endpoints of https://ora.ai/api. Core's `build_rest_request` fills `{name}`
// URL placeholders from (and consumes) the matching argument, sends the rest of
// a GET's arguments as the query string, and a POST's as the JSON body. These
// tests pin that every placeholder is a required argument and that each tool
// stays on the read-only endpoints (ora's feedback and contact writes are not
// shipped). Core execution against a loopback fixture is covered by
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
const bySlug = new Map(
	manifest.runnables.map((r) => [r.config.slug, r.config])
);

test("the manifest parses against the SDK schema with stable identity", () => {
	assert.doesNotThrow(() => PluginManifestSchema.parse(manifest));
	assert.equal(manifest.id, "@ryu/ora");
	assert.equal(plugin.name, "ryu.ora");
	assert.equal(plugin.version, manifest.version);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, manifest.name);
});

test("each tool targets one read-only ora endpoint", () => {
	const expected = {
		"ora.score": ["GET", "https://ora.ai/api/score/{domain}"],
		"ora.scan": ["POST", "https://ora.ai/api/scan"],
		"ora.run_checks": ["POST", "https://ora.ai/api/scan/checks"],
		"ora.checks": ["GET", "https://ora.ai/api/checks"],
		"ora.discover": ["GET", "https://ora.ai/api/discover"],
		"ora.agent_files": ["GET", "https://ora.ai/api/agent-files/{domain}"],
	};
	assert.deepEqual([...bySlug.keys()], Object.keys(expected));
	for (const [slug, [method, url]] of Object.entries(expected)) {
		const config = bySlug.get(slug);
		assert.equal(config.backend, "http", slug);
		assert.equal(config.method, method, slug);
		assert.equal(config.url, url, slug);
		assert.equal(config.fail_open, true, slug);
		assert.equal(config.unwrap_body, true, slug);
		assert.equal(config.secret_headers, undefined, `${slug} is keyless`);
		assert.equal(config.body_defaults, undefined, slug);
	}
});

test("every URL placeholder is a required argument and every required key exists", () => {
	for (const [slug, config] of bySlug) {
		const schema = config.input_schema;
		const required = schema.required ?? [];
		for (const [, name] of config.url.matchAll(/\{([^}/]+)\}/g)) {
			assert.ok(required.includes(name), `${slug}: {${name}} must be required`);
		}
		for (const key of required) {
			assert.ok(Object.hasOwn(schema.properties, key), `${slug}: ${key}`);
		}
	}
});

test("GET arguments are the documented upstream query parameters", () => {
	// A GET's non-path arguments become the query string verbatim.
	const query = {
		"ora.score": ["format", "include", "siteType", "competitors"],
		"ora.checks": [],
		"ora.discover": ["intent", "limit"],
		"ora.agent_files": ["include"],
	};
	for (const [slug, names] of Object.entries(query)) {
		const config = bySlug.get(slug);
		const placeholders = [...config.url.matchAll(/\{([^}/]+)\}/g)].map(
			([, name]) => name
		);
		const rest = Object.keys(config.input_schema.properties).filter(
			(name) => !placeholders.includes(name)
		);
		assert.deepEqual(rest, names, slug);
	}
});

test("egress is granted to exactly the called host and nothing else", () => {
	assert.deepEqual(manifest.permission_grants, ["tool:http-egress:ora.ai"]);
	assert.equal(manifest.mcp_servers, undefined);
	assert.equal(manifest.contributes, undefined);
});
