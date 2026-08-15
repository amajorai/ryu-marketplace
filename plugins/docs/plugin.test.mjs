// Co-located unit test for the `docs` plugin manifest.
// Zero-dependency, runnable with: node --test plugin.test.mjs
//
// docs is a manifest-only plugin: it declares a REMOTE (HTTP) MCP server
// (`https://docs.ryuhq.com/mcp`) and has no inline turn_hooks, sandboxed code
// or runnables — so there is no executable body to run. The strongest honest
// coverage is therefore structural validation of the contract Core relies on:
//   - manifest.json parses as valid JSON
//   - required identity fields (id / name / version) are well-formed
//   - the mcp_servers.docs entry is a well-formed REMOTE declaration
//     (type "http" + an https url — no command to spawn)
//   - permission_grants line up with the declared MCP server id
//   - no turn_hooks / adapters / runnables are declared (nothing to execute)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");

const parseManifest = () => JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

const SEMVER = /^\d+\.\d+\.\d+/;

test("manifest.json is valid JSON and parses", () => {
	const m = parseManifest();
	assert.equal(typeof m, "object");
	assert.notEqual(m, null);
});

test("required identity fields are present and well-formed", () => {
	const m = parseManifest();

	assert.equal(typeof m.id, "string");
	assert.ok(m.id.length > 0, "id must be non-empty");
	assert.equal(m.id, "@ryu/docs");

	assert.equal(typeof m.name, "string");
	assert.ok(m.name.length > 0, "name must be non-empty");

	assert.equal(typeof m.version, "string");
	assert.match(m.version, SEMVER, "version must be semver-ish");
});

test("runnables is an empty array (remote-server plugin ships no runnables)", () => {
	const m = parseManifest();
	assert.ok(Array.isArray(m.runnables), "runnables must be an array");
	assert.equal(m.runnables.length, 0);
});

test("mcp_servers.docs is a well-formed REMOTE declaration", () => {
	const m = parseManifest();

	assert.equal(typeof m.mcp_servers, "object");
	assert.notEqual(m.mcp_servers, null);

	const server = m.mcp_servers.docs;
	assert.ok(server, "must declare a `docs` MCP server");

	// A remote server names an HTTP transport + a URL and spawns nothing.
	assert.equal(typeof server.type, "string");
	assert.ok(
		["http", "streamable-http", "streamable_http", "sse"].includes(server.type),
		"transport must be one Core lowers to HTTP"
	);
	assert.equal(typeof server.url, "string");
	assert.match(server.url, /^https:\/\/.+/, "endpoint must be https");
	assert.match(server.url, /\/mcp$/, "endpoint should point at the /mcp route");
	assert.equal(
		server.command,
		undefined,
		"a remote server must not declare a command to spawn"
	);

	if (server.description !== undefined) {
		assert.equal(typeof server.description, "string");
		assert.ok(server.description.length > 0, "description must be non-empty");
	}
});

test("permission_grants reference the declared MCP server", () => {
	const m = parseManifest();

	assert.ok(
		Array.isArray(m.permission_grants),
		"permission_grants must be an array"
	);
	for (const grant of m.permission_grants) {
		assert.equal(typeof grant, "string");
	}

	// The mcp:<id> grant must correspond to an actually-declared server.
	const mcpGrants = m.permission_grants.filter((g) => g.startsWith("mcp:"));
	for (const grant of mcpGrants) {
		const serverId = grant.slice("mcp:".length);
		assert.ok(
			Object.hasOwn(m.mcp_servers ?? {}, serverId),
			`permission grant ${grant} must match a declared mcp_servers key`
		);
	}
	assert.ok(mcpGrants.includes("mcp:docs"));
});

test("no inline turn_hooks or sandboxed code are declared (nothing to execute)", () => {
	const m = parseManifest();
	const hooks = m.contributes?.turn_hooks;
	assert.ok(
		hooks === undefined || (Array.isArray(hooks) && hooks.length === 0),
		"docs declares no turn_hooks; add hook-execution tests if it starts to"
	);
	for (const entry of m.provides ?? []) {
		for (const binding of Object.values(entry.tools ?? {})) {
			assert.equal(
				binding.adapter,
				undefined,
				"docs ships no capability adapters (no sandboxed code)"
			);
		}
	}
});
