import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
const mcpConfig = JSON.parse(readFileSync(join(here, "mcp.json"), "utf8"));

test("declares the default Agentation MCP server", () => {
	assert.equal(manifest.id, "@ryu/agentation");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(manifest.homepage, "https://www.agentation.com/");
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.permission_grants, ["mcp:agentation"]);

	const server = manifest.mcp_servers?.agentation;
	assert.ok(server);
	assert.equal(server.command, "npx");
	assert.deepEqual(server.args, ["-y", "agentation-mcp@1.2.0", "server"]);
	assert.equal(server.url, undefined);
	assert.equal(server.env, undefined);
});

test("Ryu extension and standalone MCP config mirror the shipped server", () => {
	const server = manifest.mcp_servers.agentation;
	const extension = plugin.extensions["com.ryuhq.ryu"];
	assert.equal(extension.id, manifest.id);
	assert.equal(extension.displayName, manifest.name);
	assert.equal(extension.mcp.agentation.description, server.description);
	assert.deepEqual(mcpConfig.mcpServers.agentation, {
		type: "stdio",
		command: server.command,
		args: server.args,
	});
});
