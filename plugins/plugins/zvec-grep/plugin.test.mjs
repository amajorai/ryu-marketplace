// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.
import { isNativeObjectLike } from "../../../tools/dist/native-primitive-observation.mjs";

// Preserve the original object representation assertion, including null.
function isObjectRepresentation(value) {
	return value === null || isNativeObjectLike(value);
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));

test("manifest identity and upstream metadata are complete", () => {
	assert.equal(manifest.id, "@ryu/zvec-grep");
	assert.equal(manifest.name, "zvec-grep");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(plugin.version, manifest.version);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, manifest.name);
	assert.equal(manifest.category, "Search");
	assert.equal(manifest.engines.ryu, ">=0.1.0");
	assert.ok(manifest.homepage.includes("zvec-ai/zvec-grep"));
});

test("is an MCP-only plugin with no phantom Ryu runnables", () => {
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.permission_grants, ["mcp:zvec_grep"]);
	assert.equal(isObjectRepresentation(manifest.mcp_servers), true);
	assert.ok(manifest.mcp_servers.zvec_grep);
});

test("launches the pinned upstream stdio bootstrap bridge", () => {
	const server = manifest.mcp_servers.zvec_grep;
	assert.equal(server.command, "npx");
	assert.deepEqual(server.args, [
		"-y",
		"@zvec/zvec-grep@0.2.1",
		"server",
		"--stdio",
	]);
	assert.equal(server.args[2], "server");
	assert.equal(server.args[3], "--stdio");
});

test("keeps the default agent MCP toolset search-only", () => {
	const server = manifest.mcp_servers.zvec_grep;
	assert.ok(
		!server.args.includes("--mcp-toolset"),
		"full toolset would expose persistent index administration and managed rg"
	);
	assert.match(server.description, /default indexed-search MCP toolset/);
});
