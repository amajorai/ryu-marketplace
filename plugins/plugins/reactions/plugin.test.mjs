// Co-located contract test for the declarative reactions message-action plugin.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
	readFileSync(join(HERE, "manifest.json"), "utf8")
);

test("declares one user-targeted reaction picker action", () => {
	assert.equal(manifest.id, "@ryu/reactions");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.deepEqual(manifest.runnables, []);

	const actions = manifest.contributes?.message_actions ?? [];
	assert.equal(actions.length, 1);
	assert.deepEqual(actions[0], {
		args: {
			dispatch: "reactions.toggle",
			renderer: "reaction-picker",
		},
		capability: "reactions.toggle",
		icon: "smile",
		id: "reactions.picker",
		kind: "menu",
		label: "Add reaction",
		order: 100,
		target: "user",
	});
});

test("is registered from its package manifest, not a Core fixture copy", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	assert.ok(existsSync(coreSrc));
	assert.equal(
		existsSync(join(coreSrc, "plugin_manifest", "fixtures", "reactions.manifest.json")),
		false
	);

	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/reactions/manifest.json")'
		),
		"Core must include the package manifest in its test catalog"
	);
});
