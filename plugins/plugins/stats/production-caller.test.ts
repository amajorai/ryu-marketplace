import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { hasPluginChatFeature } from "../../../apps/desktop/src/lib/plugin-chat-features.ts";

const manifest = JSON.parse(
	readFileSync(new URL("./manifest.json", import.meta.url), "utf8")
);
const feature = manifest.contributes.chat_features[0];

test("Desktop production feature gate enables only the exact stats contribution", () => {
	const projected = [{ ...feature, plugin: manifest.id }];
	assert.equal(
		hasPluginChatFeature(projected, "@ryu/stats", "session-stats"),
		true
	);
	assert.equal(
		hasPluginChatFeature(projected, "@ryu/stats", "ghost-chat"),
		false
	);
	assert.equal(
		hasPluginChatFeature(
			[{ ...feature, plugin: "@ryu/unrelated" }],
			"@ryu/stats",
			"session-stats"
		),
		false,
		"another package cannot activate the stats renderer by reusing its kind"
	);
	assert.equal(
		hasPluginChatFeature([], "@ryu/stats", "session-stats"),
		false,
		"removing or disabling the contribution removes the control"
	);
});
