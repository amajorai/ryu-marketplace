import assert from "node:assert/strict";
import { test } from "node:test";
import { createControlledAmbientAudio } from "../../../apps/desktop/src/audio/ambient-agent-audio.fixture.ts";
import {
	AmbientAudioController,
	clampAmbientVolume,
} from "../../../apps/desktop/src/audio/ambient-agent-audio.ts";

test("production controller retries autoplay refusal and keeps one player", async () => {
	const players: ReturnType<typeof createControlledAmbientAudio>[] = [];
	const controller = new AmbientAudioController((source) => {
		const player = createControlledAmbientAudio(source, 12);
		players.push(player);
		return player;
	});

	controller.sync({ playing: true, source: "/first.mp3", volume: 0.35 });
	await Promise.resolve();
	assert.equal(players.length, 1);
	assert.equal(players[0].playCount, 1);
	assert.equal(players[0].preload, "auto");

	players[0].playbackPaused = true;
	players[0].playFailure = new Error("autoplay refused");
	controller.sync({ playing: true, source: "/first.mp3", volume: 0.4 });
	await Promise.resolve();
	assert.equal(players[0].playCount, 2, "a refused play is attempted once");

	players[0].playFailure = undefined;
	controller.sync({ playing: true, source: "/first.mp3", volume: 0.45 });
	await Promise.resolve();
	assert.equal(players[0].playCount, 3, "the next sync retries playback");
	assert.equal(players[0].volume, 0.45);
	assert.equal(players.length, 1, "retry must not allocate a second player");

	controller.dispose();
});

test("production controller replaces a source in place and stops cleanly", async () => {
	const player = createControlledAmbientAudio("/first.mp3", 12);
	const controller = new AmbientAudioController(() => player);

	controller.sync({ playing: true, source: "/first.mp3", volume: 5 });
	await Promise.resolve();
	controller.sync({
		loop: false,
		playing: true,
		source: "/second.mp3",
		volume: -5,
	});
	await Promise.resolve();

	assert.match(player.src, /second\.mp3$/);
	assert.equal(player.volume, 0);
	assert.equal(player.loop, false);
	assert.equal(player.pauseCount, 1);
	assert.equal(player.currentTime, 0);

	controller.sync({ playing: false, source: "/second.mp3", volume: 0 });
	assert.equal(player.pauseCount, 2);
	assert.equal(player.currentTime, 0);
	controller.dispose();
	assert.equal(player.pauseCount, 3);
	assert.deepEqual(
		[Number.NaN, Number.POSITIVE_INFINITY, -1, 2].map(clampAmbientVolume),
		[0, 0, 0, 1]
	);
});
