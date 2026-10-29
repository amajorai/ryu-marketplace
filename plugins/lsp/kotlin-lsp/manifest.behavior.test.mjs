import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PluginManifestSchema } from "../../../packages/sdk/src/manifest.ts";

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
	readFileSync(join(PACKAGE_ROOT, "manifest.json"), "utf8")
);
const expectedServer = {
	command: "kotlin-lsp",
	args: ["--stdio"],
	extensionToLanguage: {
		".kt": "kotlin",
		".kts": "kotlin",
	},
	startupTimeout: 120_000,
};

test("Kotlin LSP config survives the SDK manifest validation boundary", () => {
	const parsed = PluginManifestSchema.parse(manifest);

	assert.deepEqual(
		parsed.contributes?.lsp_servers["kotlin-lsp"],
		expectedServer
	);
	assert.deepEqual(parsed.permission_grants, ["pi:extension"]);
	assert.deepEqual(parsed.activation_events, ["*"]);
	assert.deepEqual(parsed.runnables, []);
});

test("README and validated manifest promise the same supported extensions", () => {
	const readme = readFileSync(join(PACKAGE_ROOT, "README.md"), "utf8");
	const supportedExtensions = readme.match(/```json\n([\s\S]*?)\n```/);

	assert.ok(
		supportedExtensions,
		"README must retain a parseable supported-extension example"
	);
	assert.deepEqual(
		JSON.parse(supportedExtensions[1]),
		expectedServer.extensionToLanguage
	);
	assert.match(readme, /never bundles the server\s+binary/);
	assert.match(readme, /missing binary is a\s+graceful skip/);
});

test("portable projection retains the native package identity and version", () => {
	const projection = JSON.parse(
		readFileSync(join(PACKAGE_ROOT, "plugin.json"), "utf8")
	);
	const native = PluginManifestSchema.parse(manifest);

	assert.equal(projection.name, "ryu.kotlin-lsp");
	assert.equal(projection.version, native.version);
	assert.equal(projection.extensions?.["com.ryuhq.ryu"]?.id, native.id);
	assert.equal(
		projection.extensions?.["com.ryuhq.ryu"]?.displayName,
		native.name
	);
	assert.equal(
		projection.extensions?.["com.ryuhq.ryu"]?.lsp_servers,
		undefined
	);
	assert.equal(
		projection.extensions?.["com.ryuhq.ryu"]?.permission_grants,
		undefined
	);
});

test("SDK packaging preserves additive language-server fields", () => {
	const futureManifest = structuredClone(manifest);
	futureManifest.contributes.lsp_servers["kotlin-lsp"].futureKotlinOption = {
		enabled: true,
	};

	const parsed = PluginManifestSchema.parse(futureManifest);
	assert.deepEqual(
		parsed.contributes?.lsp_servers["kotlin-lsp"],
		futureManifest.contributes.lsp_servers["kotlin-lsp"]
	);
});
