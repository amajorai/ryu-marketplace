// Co-located contract test for the declarative side-chats plugin.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));

test("declares a main-chat-context side-chat feature and /btw command", () => {
	assert.equal(manifest.id, "@ryu/side-chats");
	assert.equal(manifest.name, "Side Chats");
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(manifest.permission_grants ?? [], []);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.contributes?.chat_features, [
		{
			command: "/btw",
			context: "main-chat",
			id: "side-chats",
			kind: "side-chat",
			persistence: "parent-conversation",
		},
	]);
	assert.deepEqual(manifest.contributes?.selection_actions, [
		{
			args: { dispatch: "side-chat.selection", intent: "ask" },
			id: "side-chats.ask-selection",
			kind: "button",
			label: "Ask in side chat",
			order: 100,
		},
		{
			args: { dispatch: "side-chat.selection", intent: "explain" },
			id: "side-chats.explain-selection",
			kind: "button",
			label: "Explain",
			order: 110,
		},
		{
			args: { dispatch: "side-chat.selection", intent: "proofread" },
			id: "side-chats.proofread-selection",
			kind: "button",
			label: "Fix grammar",
			order: 120,
		},
	]);
	assert.deepEqual(
		manifest.contributes?.slash_commands?.map(({ id, command }) => [
			id,
			command,
		]),
		[["side-chats.ask", "/btw"]]
	);
});

test("is registered from its package manifest, not a Core fixture copy", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	assert.ok(existsSync(coreSrc));
	assert.equal(
		existsSync(
			join(coreSrc, "plugin_manifest", "fixtures", "side-chats.manifest.json")
		),
		false
	);
	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/side-chats/manifest.json")'
		),
		"Core must include the package manifest in its test catalog"
	);
});
