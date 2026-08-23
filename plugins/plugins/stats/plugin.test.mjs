import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));

test("declares the host-rendered session stats feature", () => {
	assert.equal(manifest.id, "@ryu/stats");
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.contributes?.chat_features, [
		{
			context: "main-chat",
			id: "session-stats",
			kind: "session-stats",
			options: {
				cacheTtlMinutes: [5, 60],
				contextFallback: 200_000,
				hideEmpty: true,
				rollingWindowSeconds: [0, 5, 15, 30, 60, 120],
			},
			persistence: "transcript",
			renderer: "session-stats",
			scope: "current-chat",
		},
	]);
});

test("is registered from the plugin package, not a Core fixture copy", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	assert.ok(existsSync(coreSrc));
	assert.equal(
		existsSync(
			join(coreSrc, "plugin_manifest", "fixtures", "stats.manifest.json")
		),
		false
	);
	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/stats/manifest.json")'
		),
		"Core must include the package manifest in its test catalog"
	);
});
