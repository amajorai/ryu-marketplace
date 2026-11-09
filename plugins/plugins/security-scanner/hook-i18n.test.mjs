// Security Scanner auto-review renders every user-visible sentence through
// `host.t` and asks the reviewer to write in the UI language.
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
const run = loadTurnHook(HERE, "security-scanner.auto-review");

// Fixture text the hook scans, never executed: it must trip the static rules.
const RISKY =
	"```tsx\nexport function View({ html }) {\n  return <div dangerouslySetInnerHTML={{ __html: html }} />;\n}\nconst out = eval(userInput);\n```";

function ctxFor(answer) {
	return {
		conversation_id: "conv-i18n",
		agent_id: "agent-1",
		transcript: [
			{ role: "user", content: "write it" },
			{ role: "assistant", content: answer },
		],
	};
}

test("rule hints and the failure sentence are translated whole", async () => {
	const { host, sideModelCalls } = translatingHost({
		sideModel: () => {
			throw new Error("offline");
		},
	});
	const out = await run(ctxFor(RISKY), host);
	assert.equal(out.kind, "note");
	const bullets = bulletLines(out.text);
	assert.ok(bullets.length >= 2, out.text);
	for (const line of bullets) {
		assert.ok(line.startsWith(`• ${TRANSLATED}`), line);
	}
	assert.match(
		out.text,
		/\[ja\] Model review did not complete because the reviewer could not be reached; this is not a clean result\./
	);
	assert.equal(sideModelCalls[0].reply_language, "ui");
});

test("each incomplete reason is one translated sentence, shown once", async () => {
	const cases = [
		["", "the reviewer returned no answer"],
		["I'm sorry, I can't review this.", "the reviewer refused or declined"],
		[
			"F1: possible injection on line",
			"it stopped before its closing RESULT line and may be truncated",
		],
	];
	for (const [reply, reason] of cases) {
		const { host } = translatingHost({ sideModel: () => reply });
		const out = await run(ctxFor(RISKY), host);
		const sentence = `${TRANSLATED}Model review did not complete because ${reason}; this is not a clean result.`;
		assert.equal(out.text.split(sentence).length - 1, 1, out.text);
	}
});

test("the partial-coverage sentence is one message with its numbers", async () => {
	const huge = `\`\`\`ts\n${"export const value = 1;\n".repeat(5000)}\`\`\``;
	const { host, sources } = translatingHost({
		sideModel: () => "RESULT: clean",
	});
	const out = await run(ctxFor(huge), host);
	assert.ok(
		sources.includes(
			"Model review covered only the first {covered} of {total} characters; the rest was not reviewed."
		)
	);
	assert.match(
		out.text,
		new RegExp(
			`\\[ja\\] Model review covered only the first \\d+ of ${huge.length} characters`
		)
	);
});

test("a reason hit by several chunks is shown once", async () => {
	const huge = `\`\`\`ts\nconst out = eval(userInput);\n${"export const value = 1;\n".repeat(1500)}\`\`\``;
	const { host, sideModelCalls } = translatingHost({ sideModel: () => "" });
	const out = await run(ctxFor(huge), host);
	assert.ok(sideModelCalls.length > 1, String(sideModelCalls.length));
	const sentence = `${TRANSLATED}Model review did not complete because the reviewer returned no answer; this is not a clean result.`;
	assert.equal(out.text.split(sentence).length - 1, 1, out.text);
	for (const call of sideModelCalls) {
		assert.equal(call.reply_language, "ui");
	}
});
