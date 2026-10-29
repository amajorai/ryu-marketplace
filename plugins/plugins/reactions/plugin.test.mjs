// Co-located contract test for the declarative reactions message-action plugin.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));

test("declares one all-message reaction picker action", () => {
	assert.equal(manifest.id, "@ryu/reactions");
	assert.equal(manifest.name, "Message Reactions");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});

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
		target: "any",
	});
});

test("ships exactly the agent reaction tool and the grants it needs", () => {
	// The consent request stays as narrow as the one tool: execute it, and write
	// reactions through Core's agent-bound bridge. No storage, egress or model use.
	assert.deepEqual(manifest.permission_grants, [
		"tool:execute",
		"conversation:reactions",
	]);
	assert.deepEqual(
		manifest.runnables.map((runnable) => [
			runnable.id,
			runnable.kind,
			runnable.config.slug,
			runnable.config.backend,
		]),
		[["tool-agents-react", "tool", "agents.react", "inline_js"]]
	);
	const schema = manifest.runnables[0].config.input_schema;
	// `message_id` is optional: Core resolves an omitted id to the latest user
	// message, which is the acknowledgement case the model cannot address by id.
	assert.deepEqual(schema.required, ["emoji"]);
	assert.deepEqual(Object.keys(schema.properties).sort(), [
		"emoji",
		"message_id",
	]);
	assert.equal(schema.additionalProperties, false);
});

test("is registered from its package manifest, not a Core fixture copy", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	assert.ok(existsSync(coreSrc));
	assert.equal(
		existsSync(
			join(coreSrc, "plugin_manifest", "fixtures", "reactions.manifest.json")
		),
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
