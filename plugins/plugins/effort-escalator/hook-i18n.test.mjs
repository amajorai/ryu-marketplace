// The Effort Escalator judge writes its reason in the UI language, and the note
// shows that reason without the machine-read `STUCK: yes` verdict.
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
const run = loadTurnHook(HERE, "effort-escalator.judge");

function hostFor(verdict) {
	let state = JSON.stringify({ checked_at: 0 });
	return translatingHost({
		storage: {
			get: async () => state,
			set: async (_key, value) => {
				state = typeof value === "string" ? value : JSON.stringify(value);
			},
		},
		getPreference: async ({ key }) => {
			if (key === "effort-escalator-rules") {
				return JSON.stringify({ global: { ladder: [{ from: "a", to: "b" }] } });
			}
			return "true";
		},
		sideModel: () => verdict,
	});
}

const ctx = {
	conversation_id: "conv-i18n",
	agent_id: "agent-1",
	transcript: [{ role: "user", content: "fix the build" }],
};

test("the note shows the reason, not the STUCK: verdict, in a translated sentence", async () => {
	for (const verdict of [
		"STUCK: yes\nテストが三回失敗しています。",
		"STUCK: yes - テストが三回失敗しています。",
	]) {
		const { host, sideModelCalls } = hostFor(verdict);
		const out = await run(ctx, host);
		assert.equal(
			out.text,
			"[ja] Effort Escalator detected stalled work; the next turn will use escalation 1. テストが三回失敗しています。"
		);
		assert.equal(sideModelCalls[0].reply_language, "ui");
	}
});
