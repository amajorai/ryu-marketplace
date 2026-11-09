// Double Check renders its clean verdict through `host.t` from an English
// sentinel and asks the reviewer to write corrections in the UI language.
// Runner: `node --test hook-i18n.test.mjs` (no external dependencies).

import assert from "node:assert/strict";
import { dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
	loadTurnHook,
	translatingHost,
} from "../../tests/hook-i18n-harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const run = loadTurnHook(HERE, "double-check.review");

const ctx = {
	conversation_id: "conv-i18n",
	agent_id: "agent-1",
	flags: { "io.ryu.double-check": true },
	transcript: [
		{ role: "user", content: "Is 7 prime?" },
		{ role: "assistant", content: "Yes, 7 is prime." },
	],
};

test("the RESULT: correct sentinel is shown as the translated sentence", async () => {
	for (const reply of [
		"RESULT: correct",
		"**RESULT: correct.**",
		"Looks correct.",
	]) {
		const { host, sideModelCalls } = translatingHost({
			sideModel: () => reply,
		});
		assert.deepEqual(await run(ctx, host), {
			kind: "note",
			text: "[ja] Looks correct.",
		});
		assert.equal(sideModelCalls[0].reply_language, "ui");
		assert.match(
			sideModelCalls[0].system,
			/reply with exactly: RESULT: correct\./
		);
	}
});

test("a correction is shown as the reviewer wrote it", async () => {
	const correction = "7 は素数です。ただし説明が不足しています。";
	const { host } = translatingHost({ sideModel: () => `  ${correction}  ` });
	assert.deepEqual(await run(ctx, host), { kind: "note", text: correction });
});

test("text after the sentinel is kept, without the English sentinel", async () => {
	const { host } = translatingHost({
		sideModel: () =>
			"RESULT: correct\n補足: 7 は 1 と自身でしか割り切れません。",
	});
	assert.deepEqual(await run(ctx, host), {
		kind: "note",
		text: "[ja] Looks correct.\n\n補足: 7 は 1 と自身でしか割り切れません。",
	});
});
