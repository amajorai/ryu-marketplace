// Co-located structural contract test for the manifest-only Composio Connect plugin.
// Run with: node --test plugin.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");

const parseManifest = () => JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

test("manifest.json is valid JSON with stable identity", () => {
	const manifest = parseManifest();
	assert.equal(manifest.id, "@ryu/composio-connect");
	assert.equal(manifest.name, "Composio Connect");
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
	assert.equal(manifest.external, true);
});

test("declares the hosted Composio MCP endpoint with OAuth", () => {
	const manifest = parseManifest();
	const server = manifest.mcp_servers?.composio_connect;
	assert.ok(server, "composio_connect MCP server is required");
	assert.equal(server.type, "streamable-http");
	assert.equal(server.url, "https://connect.composio.dev/mcp");
	assert.deepEqual(server.auth, { type: "oauth" });
	assert.equal(server.command, undefined);
	assert.equal(server.headers, undefined);
});

test("keeps the MCP namespace separate from direct API-key actions", () => {
	const manifest = parseManifest();
	assert.equal(Object.hasOwn(manifest.mcp_servers, "composio"), false);
	assert.equal(Object.hasOwn(manifest.mcp_servers, "composio_connect"), true);
});

test("declares the governance grants required by Core OAuth", () => {
	const manifest = parseManifest();
	assert.ok(manifest.permission_grants.includes("mcp:server"));
	assert.ok(manifest.permission_grants.includes("identity.read"));
});
