import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const projection = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));

test("declares the exact Go language-server command and file mapping", () => {
	assert.equal(manifest.id, "@ryu/gopls-lsp");
	assert.deepEqual(manifest.permission_grants, ["pi:extension"]);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.contributes.lsp_servers, {
		gopls: {
			command: "gopls",
			extensionToLanguage: { ".go": "go" },
		},
	});
});

test("Agent Plugins projection preserves the native package identity", () => {
	assert.equal(projection.name, "ryu.gopls-lsp");
	assert.equal(projection.version, manifest.version);
	assert.equal(projection.description, manifest.description);
	assert.equal(projection.repository, manifest.repository);
	assert.equal(projection.homepage, manifest.homepage);
	assert.deepEqual(projection.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
});

test("surfaces do not overstate browser or mobile language-server support", () => {
	assert.equal(manifest.surfaces.core.support, "full");
	assert.equal(manifest.surfaces.desktop.support, "full");
	assert.equal(manifest.surfaces.cli.support, "full");
	assert.equal(manifest.surfaces.web.support, "limited");
	assert.equal(manifest.surfaces.mobile.support, "limited");
	assert.equal(manifest.surfaces.extension.support, "limited");
	assert.equal(manifest.surfaces.gateway.support, "none");
});
