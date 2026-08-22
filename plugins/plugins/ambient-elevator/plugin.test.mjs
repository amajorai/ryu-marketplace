import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

test("declares user controls and one desktop audio source", () => {
	assert.equal(manifest.id, "@ryu/ambient-elevator");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.deepEqual(manifest.runnables, []);
	assert.equal(manifest.surfaces.desktop.support, "full");

	const settings = manifest.contributes.settings_tabs;
	assert.equal(settings.length, 1);
	assert.equal(settings[0].scope, "user");
	assert.deepEqual(
		settings[0].fields.map(({ pref_key, type }) => ({ pref_key, type })),
		[
			{ pref_key: "ambient-elevator-enabled", type: "toggle" },
			{ pref_key: "ambient-elevator-volume", type: "number" },
		]
	);

	const audio = manifest.contributes.live_activities[0].spec.audio;
	assert.deepEqual(audio, {
		loop: true,
		src: "/sounds/elevator-4.mp3",
	});

	const audioBytes = readFileSync(
		join(here, "../../../apps/desktop/public/sounds/elevator-4.mp3")
	);
	assert.equal(audioBytes.subarray(0, 3).toString("ascii"), "ID3");
	assert.ok(audioBytes.length > 1_000_000);
});
