// Security Guidance renders its pattern hints and incomplete-review sentences
// through `host.t`, asks the reviewer to write in the UI language, and reads
// the English `RESULT: clean` sentinel as a clean verdict.
// Runner: `node --test hook-i18n.test.mjs` (no external dependencies).

import assert from "node:assert/strict";
import { dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
	bulletLines,
	loadTurnHook,
	TRANSLATED,
	translatingHost,
} from "../../tests/hook-i18n-harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const run = loadTurnHook(HERE, "security-guidance.review");
const FLAG = "io.ryu.security-guidance";

// Fixture text the hook scans, never executed: it must trip the static rules.
const RISKY =
	"import yaml\ndata = yaml.load(body)\nrequests.get(url, verify=False)";
const PLAIN = "function add(a, b) { return a + b; }";

function ctxFor(code) {
	return {
		conversation_id: "conv-i18n",
		agent_id: "agent-1",
		flags: { [FLAG]: true },
		transcript: [
			{ role: "user", content: "write it" },
			{ role: "assistant", content: code },
		],
	};
}

test("pattern hints are translated and the reviewer writes in the UI language", async () => {
	const { host, sideModelCalls } = translatingHost({
		sideModel: () => "RESULT: clean",
	});
	const out = await run(ctxFor(RISKY), host);
	assert.equal(out.kind, "note");
	const bullets = bulletLines(out.text);
	assert.equal(bullets.length, 2, out.text);
	for (const line of bullets) {
		assert.ok(line.startsWith(`• ${TRANSLATED}`), line);
	}
	assert.ok(bullets.some((line) => line.includes("yaml.safe_load()")));
	assert.equal(sideModelCalls[0].reply_language, "ui");
	assert.match(sideModelCalls[0].system, /reply with exactly: RESULT: clean\./);
	assert.doesNotMatch(out.text, /LLM security review/);
});

test("RESULT: clean on code with no pattern hit is silent", async () => {
	const { host } = translatingHost({ sideModel: () => "**RESULT: clean**" });
	assert.deepEqual(await run(ctxFor(PLAIN), host), { kind: "none" });
});

test("each incomplete reason is one whole translated sentence", async () => {
	const cases = [
		[() => "", "the reviewer returned no answer"],
		[
			() => "I'm sorry, I can't help with that.",
			"the reviewer refused or declined",
		],
		[
			() => "SQL injection on line 1: use a parameterized",
			"it stopped before its closing RESULT line and may be truncated",
		],
		[
			() => {
				throw new Error("offline");
			},
			"the reviewer could not be reached",
		],
	];
	for (const [reply, reason] of cases) {
		const { host } = translatingHost({ sideModel: reply });
		const out = await run(ctxFor(PLAIN), host);
		assert.ok(
			out.text.includes(
				`${TRANSLATED}LLM security review did not complete because ${reason}; this is not a clean result.`
			),
			out.text
		);
	}
});
