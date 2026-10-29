import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
	readFileSync(join(packageRoot, "manifest.json"), "utf8")
);
const expectedServer = {
	command: "sourcekit-lsp",
	extensionToLanguage: { ".swift": "swift" },
};

test("the Swift server declaration carries its exact activation and permission boundary", () => {
	assert.deepEqual(
		manifest.contributes?.lsp_servers["sourcekit-lsp"],
		expectedServer
	);
	assert.deepEqual(manifest.permission_grants, ["pi:extension"]);
	assert.deepEqual(manifest.activation_events, ["*"]);
});

test("the config-only package cannot imply a bundled executable or runnable", () => {
	const server = manifest.contributes?.lsp_servers["sourcekit-lsp"];

	assert.equal(server?.command, "sourcekit-lsp");
	assert.equal(server?.args, undefined);
	assert.deepEqual(manifest.runnables, []);
	assert.equal(manifest.sidecar, undefined);
	assert.equal(manifest.mcp_server, undefined);
});

test("the user-facing extension map agrees with the validated manifest", () => {
	const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
	const documentedMap = readme.match(/```json\n([\s\S]*?)\n```/);

	assert.ok(documentedMap, "README must retain a parseable extension map");
	assert.deepEqual(
		JSON.parse(documentedMap[1]),
		expectedServer.extensionToLanguage
	);
	assert.match(readme, /never bundles the server\s+binary/);
	assert.match(readme, /missing binary is a\s+graceful skip/);
});
