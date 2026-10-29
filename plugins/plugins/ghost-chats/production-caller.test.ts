import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { hasPluginChatFeature } from "../../../apps/desktop/src/lib/plugin-chat-features.ts";

const manifest = JSON.parse(
	readFileSync(new URL("./manifest.json", import.meta.url), "utf8")
);
const feature = manifest.contributes.chat_features[0];

test("Desktop production feature gate enables only the exact ghost contribution", () => {
	const projected = [{ ...feature, plugin: manifest.id }];
	assert.equal(
		hasPluginChatFeature(projected, "@ryu/ghost-chats", "ghost-chat"),
		true
	);
	assert.equal(
		hasPluginChatFeature(projected, "@ryu/ghost", "ghost-chat"),
		false,
		"the computer-control plugin must not enable temporary chats"
	);
	assert.equal(
		hasPluginChatFeature(projected, "@ryu/ghost-chats", "session-stats"),
		false
	);
	assert.equal(
		hasPluginChatFeature([], "@ryu/ghost-chats", "ghost-chat"),
		false,
		"removing or disabling the contribution removes the control"
	);
});
