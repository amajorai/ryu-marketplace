// Co-located test for the `bitwarden` plugin manifest.
//
// Bitwarden is a declarative `command`-tool plugin (no inline turn_hooks, no
// mcp_servers, no http tool). It shells out to the locally installed `bws` CLI.
// There is therefore no embedded JS to execute; the strongest honest test is a
// full validation of the command-tool contract: the runnable shapes, the
// placeholder<->input_schema wiring, the `command_env` token plumbing, the
// timeout, and the permission grant. We also assert the manifest is
// byte-identical to the Core built-in fixture (the registration seam).
//
// Runner: `node --test` (zero deps).

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const raw = readFileSync(manifestPath, "utf8");

test("manifest.json is valid JSON and parses", () => {
	assert.doesNotThrow(() => JSON.parse(raw));
});

const manifest = JSON.parse(raw);

test("has required top-level identity fields", () => {
	assert.equal(manifest.id, "@ryu/bitwarden");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.equal(typeof manifest.version, "string");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("declares an engines.ryu constraint and Security category", () => {
	assert.equal(typeof manifest.engines, "object");
	assert.equal(typeof manifest.engines.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
	assert.equal(manifest.category, "Security");
});

test("runnables is a non-empty array of command-tool definitions", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.ok(manifest.runnables.length >= 4);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(typeof r.name, "string");
		assert.equal(typeof r.config, "object");
		assert.equal(r.config.backend, "command");
		assert.equal(r.config.bin, "bws");
	}
});

const bySlug = Object.fromEntries(
	manifest.runnables.map((r) => [r.config.slug, r.config])
);

test("exposes the four expected bitwarden__ tools", () => {
	for (const slug of [
		"bitwarden__status",
		"bitwarden__projects",
		"bitwarden__list",
		"bitwarden__get",
	]) {
		assert.ok(bySlug[slug], `missing tool ${slug}`);
		assert.equal(typeof bySlug[slug].description, "string");
		assert.ok(bySlug[slug].description.length > 0);
	}
});

test("every command tool carries a positive integer timeout_secs", () => {
	for (const r of manifest.runnables) {
		assert.equal(typeof r.config.timeout_secs, "number");
		assert.ok(Number.isInteger(r.config.timeout_secs));
		assert.ok(r.config.timeout_secs > 0);
	}
});

// Every {placeholder} used in command_args must resolve to a declared input.
function placeholdersIn(args) {
	const found = new Set();
	const re = /\{([a-zA-Z0-9_]+)\}/g;
	for (const a of args) {
		let m;
		// biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
		while ((m = re.exec(a)) !== null) {
			found.add(m[1]);
		}
	}
	return found;
}

test("every command_args placeholder maps to an input_schema property", () => {
	for (const [slug, cfg] of Object.entries(bySlug)) {
		if (!cfg.command_args) {
			continue; // no-arg tools (status / projects) have nothing to wire
		}
		const schema = cfg.input_schema;
		assert.equal(schema.type, "object");
		assert.ok(schema.properties, `${slug} input_schema has properties`);
		for (const name of placeholdersIn(cfg.command_args)) {
			assert.ok(
				Object.hasOwn(schema.properties, name),
				`${slug}: placeholder {${name}} has no matching input_schema property`
			);
		}
	}
});

test("list/get declare their required id arguments", () => {
	assert.deepEqual(bySlug["bitwarden__list"].input_schema.required, [
		"project_id",
	]);
	assert.equal(bySlug["bitwarden__list"].input_schema.properties.project_id.type, "string");
	assert.deepEqual(bySlug["bitwarden__get"].input_schema.required, [
		"secret_id",
	]);
	assert.equal(bySlug["bitwarden__get"].input_schema.properties.secret_id.type, "string");
});

test("list/get/projects parse stdout as JSON; status returns raw text", () => {
	assert.equal(bySlug["bitwarden__list"].output, "json");
	assert.equal(bySlug["bitwarden__get"].output, "json");
	assert.equal(bySlug["bitwarden__projects"].output, "json");
	assert.equal(bySlug["bitwarden__status"].output, undefined);
});

test("bws receives the bootstrap token through command_env (env: source)", () => {
	// The whole point of the Hermes port: the token is an env var the child reads,
	// never a key in the manifest. Every authenticated tool must declare it.
	for (const slug of ["bitwarden__projects", "bitwarden__list", "bitwarden__get"]) {
		assert.ok(bySlug[slug].command_env, `${slug} must declare command_env`);
		assert.equal(
			bySlug[slug].command_env.BWS_ACCESS_TOKEN,
			"env:BWS_ACCESS_TOKEN",
			`${slug} must map BWS_ACCESS_TOKEN from the process env`
		);
	}
});

test("permission_grants scopes the command tools to the bws binary", () => {
	assert.ok(Array.isArray(manifest.permission_grants));
	assert.ok(manifest.permission_grants.includes("tool:command:bws"));
});

test("declares NO mcp_servers / http / inline sandbox code / turn_hooks", () => {
	assert.equal(manifest.mcp_servers, undefined);
	assert.equal(manifest.contributes, undefined);
	for (const r of manifest.runnables) {
		const cfg = r.config;
		assert.equal(cfg.secret_headers, undefined);
		assert.equal(cfg.code, undefined);
		assert.notEqual(cfg.backend, "http");
		assert.notEqual(cfg.backend, "inline_deno");
	}
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(here, "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}

	// There is no fixture COPY any more. Core `include_str!`s this manifest straight
	// from its package home, so a resurrected copy is a dead-edit trap: the fixture
	// would WIN for any include_str! still pointing at fixtures/, and edits made here
	// would silently go nowhere. Core asserts this across all packages; repeating it
	// per plugin is what makes a failure name the plugin that regressed.
	const stale = join(
		coreSrc,
		"plugin_manifest",
		"fixtures",
		"bitwarden.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory. Delete the fixture copy.`
	);

	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/bitwarden/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});
