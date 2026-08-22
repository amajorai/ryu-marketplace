// Co-located contract test for the declarative reconnect-retry plugin.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
	readFileSync(join(HERE, "manifest.json"), "utf8")
);

test("declares one bounded host-rendered reconnect feature", () => {
	assert.equal(manifest.id, "@ryu/reconnect-retry");
	assert.deepEqual(manifest.runnables, []);
	assert.equal(manifest.surfaces?.core?.support, "full");
	assert.equal(manifest.surfaces?.desktop?.support, "full");
	assert.equal(manifest.surfaces?.web?.support, "none");
	assert.deepEqual(manifest.contributes?.chat_features, [
		{
			id: "reconnect-retry",
			kind: "reconnect-retry",
			max_attempts: 1,
			persistence: "node-local",
			scope: "all-chats",
			trigger: "connection-restored",
		},
	]);
});

test("does not ship a sandbox body and is registered from its package manifest", () => {
	assert.equal(existsSync(join(HERE, "hooks")), false);
	assert.equal(existsSync(join(HERE, "adapters")), false);
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	assert.ok(existsSync(coreSrc));
	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/reconnect-retry/manifest.json")'
		),
		"Core must include the package manifest in its test catalog"
	);
});
