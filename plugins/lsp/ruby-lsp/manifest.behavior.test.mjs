import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
	readFileSync(join(PACKAGE_ROOT, "manifest.json"), "utf8")
);
const portablePlugin = JSON.parse(
	readFileSync(join(PACKAGE_ROOT, "plugin.json"), "utf8")
);
const expectedLanguages = {
	".rb": "ruby",
	".rake": "ruby",
	".gemspec": "ruby",
	".ru": "ruby",
	".erb": "erb",
};

test("Ruby LSP declares its exact config-only launch contract", () => {
	assert.deepEqual(manifest.contributes?.lsp_servers["ruby-lsp"], {
		command: "ruby-lsp",
		extensionToLanguage: expectedLanguages,
	});
	assert.deepEqual(manifest.permission_grants, ["pi:extension"]);
	assert.deepEqual(manifest.runnables, []);
});

test("the portable package projects the native identity and version exactly", () => {
	assert.equal(portablePlugin.version, manifest.version);
	assert.deepEqual(portablePlugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
});

test("the user-facing extension table matches the validated launch declaration", () => {
	const readme = readFileSync(join(PACKAGE_ROOT, "README.md"), "utf8");
	const supportedExtensions = readme.match(/```json\n([\s\S]*?)\n```/);

	assert.ok(
		supportedExtensions,
		"README must retain a parseable supported-extension example"
	);
	assert.deepEqual(JSON.parse(supportedExtensions[1]), expectedLanguages);
	assert.deepEqual(
		manifest.contributes?.lsp_servers["ruby-lsp"].extensionToLanguage,
		expectedLanguages
	);
});
