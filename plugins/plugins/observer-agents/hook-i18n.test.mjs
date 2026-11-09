// The observer report is written in the UI language; its SILENT sentinel stays
// English and still suppresses the note.
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
const run = loadTurnHook(HERE, "observer-agents.review");

const ctx = {
	conversation_id: "conv-i18n",
	transcript: [
		{ role: "user", content: "Migrate the table." },
		{ role: "assistant", content: "Dropping the old table first." },
	],
};

test("the report opts into the UI language and renders through host.t", async () => {
	const { host, sideModelCalls } = translatingHost({
		sideModel: () => "Back up first.",
	});
	const out = await run(ctx, host);
	assert.deepEqual(out, {
		kind: "note",
		text: "[ja] Background observer report (advisory only): Back up first.",
	});
	assert.equal(sideModelCalls[0].reply_language, "ui");
});

test("the English SILENT sentinel still means no note", async () => {
	const { host } = translatingHost({ sideModel: () => "SILENT" });
	assert.deepEqual(await run(ctx, host), { kind: "none" });
});
