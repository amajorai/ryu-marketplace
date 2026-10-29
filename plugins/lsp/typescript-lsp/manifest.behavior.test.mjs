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
const expectedLanguages = {
	".ts": "typescript",
	".tsx": "typescriptreact",
	".js": "javascript",
	".jsx": "javascriptreact",
	".mts": "typescript",
	".cts": "typescript",
	".mjs": "javascript",
	".cjs": "javascript",
};

test("the TypeScript LSP config survives the SDK manifest validation boundary", () => {
	const parsed = PluginManifestSchema.parse(manifest);
	const server = parsed.contributes?.lsp_servers.typescript;

	assert.deepEqual(server, {
		command: "typescript-language-server",
		args: ["--stdio"],
		extensionToLanguage: expectedLanguages,
	});
	assert.deepEqual(server?.extensionToLanguage, expectedLanguages);
});

test("the TypeScript LSP README advertises the same extensions as the validated manifest", () => {
	const readme = readFileSync(join(PACKAGE_ROOT, "README.md"), "utf8");
	const supportedExtensions = readme.match(/```json\n([\s\S]*?)\n```/);

	assert.ok(
		supportedExtensions,
		"README must retain a parseable supported-extension example"
	);
	assert.deepEqual(JSON.parse(supportedExtensions[1]), expectedLanguages);
	assert.deepEqual(
		PluginManifestSchema.parse(manifest).contributes?.lsp_servers.typescript
			.extensionToLanguage,
		expectedLanguages
	);
});

test("SDK validation preserves additive LSP fields for the packaging boundary", () => {
	const manifestWithAdditionalOption = structuredClone(manifest);
	const server =
		manifestWithAdditionalOption.contributes.lsp_servers.typescript;
	server.restartOnCrash = false;
	server.startupTimeout = 20_000;

	const parsed = PluginManifestSchema.parse(manifestWithAdditionalOption);
	assert.deepEqual(
		parsed.contributes?.lsp_servers.typescript,
		manifestWithAdditionalOption.contributes.lsp_servers.typescript
	);
});
