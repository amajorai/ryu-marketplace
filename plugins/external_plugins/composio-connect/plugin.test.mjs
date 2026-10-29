// Co-located structural contract test for the manifest-only Composio Connect plugin.
// Run with: node --test plugin.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");

const MCP_PATH = join(HERE, "mcp.json");
const PLUGIN_PATH = join(HERE, "plugin.json");

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

test("portable MCP projection preserves the exact public transport", () => {
	const manifest = parseManifest();
	const mcp = JSON.parse(readFileSync(MCP_PATH, "utf8"));
	const nativeServer = manifest.mcp_servers.composio_connect;
	const portableServer = mcp.mcpServers.composio_connect;
	assert.deepEqual(portableServer, {
		type: nativeServer.type,
		url: nativeServer.url,
	});
	assert.deepEqual(Object.keys(mcp.mcpServers), ["composio_connect"]);
});

test("portable plugin projection preserves identity and MCP description", () => {
	const manifest = parseManifest();
	const plugin = JSON.parse(readFileSync(PLUGIN_PATH, "utf8"));
	const extension = plugin.extensions["com.ryuhq.ryu"];
	assert.equal(plugin.version, manifest.version);
	assert.equal(extension.id, manifest.id);
	assert.equal(extension.displayName, manifest.name);
	assert.equal(
		extension.mcp.composio_connect.description,
		manifest.mcp_servers.composio_connect.description
	);
});

test("auth material is never embedded in either portable projection", () => {
	for (const path of [MCP_PATH, PLUGIN_PATH]) {
		const raw = readFileSync(path, "utf8");
		assert.doesNotMatch(
			raw,
			/authorization|bearer|api[_-]?key|client[_-]?secret/i
		);
	}
});

test("hosted connector has no local process or caller-controlled auth surface", () => {
	const server = parseManifest().mcp_servers.composio_connect;
	for (const key of ["command", "args", "env", "headers"]) {
		assert.equal(server[key], undefined, `unexpected ${key} transport field`);
	}
	assert.deepEqual(Object.keys(server).sort(), [
		"auth",
		"description",
		"enabled",
		"type",
		"url",
	]);
});

test("OAuth connector is enabled by default and declares no fake runnable", () => {
	const manifest = parseManifest();
	assert.equal(manifest.mcp_servers.composio_connect.enabled, true);
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.permission_grants.sort(), [
		"identity.read",
		"mcp:server",
	]);
});
