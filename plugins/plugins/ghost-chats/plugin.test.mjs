// Co-located contract test for the declarative temporary-chat plugin.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
	readFileSync(join(HERE, "manifest.json"), "utf8")
);

test("declares a current-tab ghost-chat feature with no persistence", () => {
	assert.equal(manifest.id, "@ryu/ghost-chats");
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.contributes?.chat_features, [
		{
			id: "ghost-chats",
			kind: "ghost-chat",
			persistence: "none",
			renderer: "temporary-chat",
			scope: "current-tab",
		},
	]);
});

test("stays distinct from the computer-control ghost plugin", () => {
	assert.notEqual(manifest.id, "@ryu/ghost");
	const coreSrc = join(HERE, "..", "..", "apps", "core", "src");
	assert.ok(existsSync(coreSrc));
	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/ghost-chats/manifest.json")'
		),
		"Core must include the package manifest in its test catalog"
	);
});
