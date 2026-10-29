import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const portable = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));

test("portable and native identities stay aligned", () => {
	assert.equal(manifest.id, "@ryu/lua-lsp");
	assert.equal(portable.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(portable.extensions["com.ryuhq.ryu"].displayName, manifest.name);
	assert.equal(portable.version, manifest.version);
});

test("declares one config-only Lua language server with least privilege", () => {
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.permission_grants, ["pi:extension"]);
	assert.deepEqual(Object.keys(manifest.contributes.lsp_servers), ["lua"]);
	assert.deepEqual(manifest.contributes.lsp_servers.lua, {
		command: "lua-language-server",
		extensionToLanguage: { ".lua": "lua" },
	});
	assert.equal(manifest.mcp_servers, undefined);
	assert.equal(manifest.contributes.turn_hooks, undefined);
});

test("activates without embedding machine-specific arguments or environment", () => {
	assert.deepEqual(manifest.activation_events, ["*"]);
	const server = manifest.contributes.lsp_servers.lua;
	assert.equal(server.args, undefined);
	assert.equal(server.env, undefined);
	assert.equal(server.command.includes("/"), false);
});
