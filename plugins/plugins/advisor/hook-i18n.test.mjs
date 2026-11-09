// The Advisor note is written in the UI language; on-demand advice, which goes
// back to the agent, does not opt in.
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
const run = loadTurnHook(HERE, "advisor.review");

function ctxFor(userText, flags) {
	return {
		conversation_id: "conv-i18n",
		agent_id: "agent-1",
		flags,
		transcript: [
			{ role: "user", content: userText },
			{ role: "assistant", content: "I will do X then Y." },
		],
	};
}

test("toggle-mode advice is a translated note written in the UI language", async () => {
	const { host, sideModelCalls } = translatingHost({
		sideModel: () => "Check Y first.",
	});
	const out = await run(ctxFor("plan it", { "@ryu/advisor": true }), host);
	assert.deepEqual(out, { kind: "note", text: "[ja] Advisor: Check Y first." });
	assert.equal(sideModelCalls[0].reply_language, "ui");
});

test("on-demand advice goes to the agent without the language opt-in", async () => {
	const { host, sideModelCalls } = translatingHost({
		sideModel: () => "Check Y first.",
	});
	const out = await run(ctxFor("/advisor", {}), host);
	assert.equal(out.kind, "continue");
	assert.equal(Object.hasOwn(sideModelCalls[0], "reply_language"), false);
});
