import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const readJson = (name) =>
	JSON.parse(readFileSync(join(packageRoot, name), "utf8"));
const manifest = readJson("manifest.json");
const portableManifest = readJson("plugin.json");
const expectedServer = {
	command: "intelephense",
	args: ["--stdio"],
	extensionToLanguage: { ".php": "php" },
};

test("the shipped PHP server configuration declares its exact executable contract", () => {
	assert.deepEqual(
		manifest.contributes?.lsp_servers.intelephense,
		expectedServer
	);
	assert.deepEqual(manifest.permission_grants, ["pi:extension"]);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(manifest.runnables, []);
});

test("the README install and extension contract matches the parsed manifest", () => {
	const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
	const supportedExtensions = readme.match(/```json\n([\s\S]*?)\n```/);

	assert.ok(
		supportedExtensions,
		"README must keep a parseable extension example"
	);
	assert.deepEqual(JSON.parse(supportedExtensions[1]), { ".php": "php" });
	assert.match(readme, /npm install -g intelephense/);
	assert.deepEqual(
		manifest.contributes?.lsp_servers.intelephense,
		expectedServer
	);
});

test("the portable projection keeps the native package identity and version", () => {
	assert.equal(portableManifest.extensions?.["com.ryuhq.ryu"]?.id, manifest.id);
	assert.equal(
		portableManifest.extensions?.["com.ryuhq.ryu"]?.displayName,
		manifest.name
	);
	assert.equal(portableManifest.version, manifest.version);
	assert.equal(portableManifest.description, manifest.description);
});
