import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function readJson(name) {
	return JSON.parse(readFileSync(join(HERE, name), "utf8"));
}

test("native manifest pins the launch contract and projection preserves package identity", () => {
	const manifest = readJson("manifest.json");
	const projection = readJson("plugin.json");
	const server = manifest.contributes.lsp_servers.pyright;

	assert.equal(manifest.id, "@ryu/pyright-lsp");
	assert.deepEqual(manifest.permission_grants, ["pi:extension"]);
	assert.deepEqual(server, {
		command: "pyright-langserver",
		args: ["--stdio"],
		extensionToLanguage: {
			".py": "python",
			".pyi": "python",
		},
	});
	assert.equal(projection.name, "ryu.pyright-lsp");
	assert.equal(projection.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(
		projection.extensions["com.ryuhq.ryu"].displayName,
		manifest.name
	);
});

test("config-only package declares no bundled process or executable runnable", () => {
	const manifest = readJson("manifest.json");
	assert.deepEqual(manifest.runnables, []);
	assert.equal("sidecar" in manifest, false);
	assert.deepEqual(Object.keys(manifest.contributes), ["lsp_servers"]);
	assert.match(
		readFileSync(join(HERE, "README.md"), "utf8"),
		/missing binary is a\s+graceful skip with a visible reason/
	);
});
