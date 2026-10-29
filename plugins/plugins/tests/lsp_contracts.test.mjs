import {
	isNativeObjectLike,
	isNativeText,
} from "../../tools/dist/native-primitive-observation.mjs";
// Safe local contract checks for the shipped language-server packages.
// Core's resolver integration is exercised by the focused `ryu-core` LSP test;
// this suite keeps all package declarations and host-facing argv/grant metadata
// independently selectable with `node plugins-store/tests/run.mjs lsp`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const PACKAGE_IDS = [
	"clangd-lsp",
	"csharp-lsp",
	"gopls-lsp",
	"jdtls-lsp",
	"kotlin-lsp",
	"lua-lsp",
	"php-lsp",
	"pyright-lsp",
	"ruby-lsp",
	"rust-analyzer-lsp",
	"swift-lsp",
	"typescript-lsp",
];

function loadPackage(packageId) {
	const packageRoot = join(REPO_ROOT, "plugins-store", "lsp", packageId);
	return {
		manifest: JSON.parse(
			readFileSync(join(packageRoot, "manifest.json"), "utf8")
		),
		plugin: JSON.parse(readFileSync(join(packageRoot, "plugin.json"), "utf8")),
	};
}

test("the LSP suite owns the complete 12-package language-server cluster", () => {
	assert.deepEqual(PACKAGE_IDS, [
		"clangd-lsp",
		"csharp-lsp",
		"gopls-lsp",
		"jdtls-lsp",
		"kotlin-lsp",
		"lua-lsp",
		"php-lsp",
		"pyright-lsp",
		"ruby-lsp",
		"rust-analyzer-lsp",
		"swift-lsp",
		"typescript-lsp",
	]);
	assert.equal(new Set(PACKAGE_IDS).size, 12);
});

for (const packageId of PACKAGE_IDS) {
	test(`${packageId} declares one bounded stdio server and the extension grant`, () => {
		const { manifest, plugin } = loadPackage(packageId);
		assert.equal(manifest.id, `@ryu/${packageId}`);
		assert.equal(isNativeText(manifest.name), true);
		assert.ok(manifest.name.length > 0);
		assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
		assert.equal(plugin.version, manifest.version);
		assert.equal(plugin.extensions["com.ryuhq.ryu"].id, manifest.id);
		assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, manifest.name);
		assert.deepEqual(manifest.activation_events, ["*"]);
		assert.deepEqual(manifest.permission_grants, ["pi:extension"]);
		assert.deepEqual(manifest.runnables ?? [], []);
		assert.deepEqual(manifest.provides ?? [], []);
		assert.equal(manifest.mcp_servers, undefined);

		const servers = manifest.contributes?.lsp_servers;
		assert.ok(servers && isNativeObjectLike(servers));
		assert.equal(Object.keys(servers).length, 1);
		for (const [serverName, server] of Object.entries(servers)) {
			assert.ok(serverName.length > 0);
			assert.match(server.command, /^[A-Za-z0-9._+-]+$/);
			assert.equal(server.transport ?? "stdio", "stdio");
			assert.ok(
				Array.isArray(server.args ?? []),
				"argv must be an array, never a shell command string"
			);
			for (const argument of server.args ?? []) {
				assert.equal(isNativeText(argument), true);
				assert.ok(!argument.includes("\0"), "argv cannot contain NUL bytes");
			}
			const extensions = server.extensionToLanguage;
			assert.ok(extensions && Object.keys(extensions).length > 0);
			for (const [extension, language] of Object.entries(extensions)) {
				assert.match(extension, /^\.[a-z0-9][a-z0-9._+-]*$/);
				assert.equal(isNativeText(language), true);
				assert.ok(language.length > 0);
			}
		}
	});
}

test("the shipped LSP packages do not claim the same normalized extension", () => {
	const ownerByExtension = new Map();
	for (const packageId of PACKAGE_IDS) {
		const { manifest } = loadPackage(packageId);
		for (const [serverName, server] of Object.entries(
			manifest.contributes.lsp_servers
		)) {
			for (const extension of Object.keys(server.extensionToLanguage)) {
				const previous = ownerByExtension.get(extension);
				assert.equal(
					previous,
					undefined,
					`${extension} is claimed by both ${previous} and ${manifest.id}/${serverName}`
				);
				ownerByExtension.set(extension, `${manifest.id}/${serverName}`);
			}
		}
	}
	assert.ok(ownerByExtension.size > 0);
});
