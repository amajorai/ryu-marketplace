import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

test("published MCP launch config stays pinned to the same local CLI contract", () => {
	const mcp = JSON.parse(readFileSync(join(here, "mcp.json"), "utf8"));
	const extension = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
	const server = manifest.mcp_servers.expect;

	assert.equal(mcp.mcpServers.expect.type, "stdio");
	assert.equal(mcp.mcpServers.expect.command, server.command);
	assert.deepEqual(mcp.mcpServers.expect.args, server.args);
	assert.equal(extension.name, "ryu.expect");
	assert.equal(extension.version, manifest.version);
	assert.equal(extension.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.match(server.args[1], /^expect-cli@\d+\.\d+\.\d+$/);
	assert.equal(
		server.env,
		undefined,
		"the published launcher does not need a secret env payload"
	);
});

test("declares the default Expect MCP server", () => {
	assert.equal(manifest.id, "@ryu/expect");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(manifest.homepage, "https://www.expect.dev/");
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.permission_grants, ["mcp:expect"]);

	const server = manifest.mcp_servers?.expect;
	assert.ok(server);
	assert.equal(server.command, "npx");
	assert.deepEqual(server.args, ["-y", "expect-cli@0.1.3", "mcp"]);
	assert.equal(server.url, undefined);
	assert.equal(server.env, undefined);
});
