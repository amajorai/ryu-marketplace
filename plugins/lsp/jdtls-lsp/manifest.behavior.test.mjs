import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PluginManifestSchema } from "../../../packages/sdk/src/manifest.ts";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
	readFileSync(join(packageRoot, "manifest.json"), "utf8")
);
const expectedServer = {
	command: "jdtls",
	extensionToLanguage: { ".java": "java" },
	startupTimeout: 120_000,
};

test("the Java LSP declaration survives the production SDK boundary", () => {
	const parsed = PluginManifestSchema.parse(manifest);

	assert.deepEqual(parsed.contributes?.lsp_servers.jdtls, expectedServer);
	assert.deepEqual(parsed.permission_grants, ["pi:extension"]);
	assert.deepEqual(parsed.activation_events, ["*"]);
});

test("the public package projection preserves the native identity and version", () => {
	const projection = JSON.parse(
		readFileSync(join(packageRoot, "plugin.json"), "utf8")
	);

	assert.equal(projection.name, "ryu.jdtls-lsp");
	assert.equal(projection.version, manifest.version);
	assert.equal(projection.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(
		projection.extensions["com.ryuhq.ryu"].displayName,
		manifest.name
	);
});

test("the documented extension map exactly matches the validated caller input", () => {
	const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
	const documentedMap = readme.match(/```json\n([\s\S]*?)\n```/);

	assert.ok(documentedMap, "README must contain a parseable extension map");
	assert.deepEqual(
		JSON.parse(documentedMap[1]),
		expectedServer.extensionToLanguage
	);
	assert.deepEqual(
		PluginManifestSchema.parse(manifest).contributes?.lsp_servers.jdtls
			.extensionToLanguage,
		expectedServer.extensionToLanguage
	);
});

test("SDK validation refuses a malformed package identity before activation", () => {
	const candidate = structuredClone(manifest);
	candidate.id = "";
	assert.throws(() => PluginManifestSchema.parse(candidate));
});

test("the package remains config-only and never claims to bundle a server", () => {
	assert.equal(manifest.sidecar, undefined);
	assert.equal(manifest.mcp_servers, undefined);
	assert.deepEqual(manifest.runnables, []);
	assert.equal(manifest.contributes.lsp_servers.jdtls.command, "jdtls");
});
