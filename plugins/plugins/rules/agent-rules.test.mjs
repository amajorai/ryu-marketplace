import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Per-agent settings written by the RulesAgentEditPanel
// (apps/desktop/src/lib/api/agent-rules.ts) under `rules.agent.<id>`.
const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const hook = manifest.contributes.turn_hooks[0];
const code = readFileSync(join(here, hook.code_file), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const recordingHost = (preference) => {
	const calls = [];
	const values = new Map();
	const host = {
		getPreference: async ({ key }) => {
			calls.push({ path: "getPreference", key });
			return key === "rules.agent.claude" ? preference : null;
		},
		storage: {
			get: async (key) => {
				calls.push({ path: "storage.get", key });
				return values.get(key);
			},
			set: async (key, value) => {
				calls.push({ path: "storage.set", key, value });
				values.set(key, value);
			},
		},
	};
	return { calls, host, values };
};

const runHook = (ctx, host) =>
	new AsyncFunction("ctx", "host", code)(ctx, host);

const baseCtx = () => ({
	agent_id: "claude",
	conversation_id: "conv-1",
	messages: [
		{ role: "system", content: "Base system context" },
		{ role: "user", content: "Earlier question" },
		{ role: "assistant", content: "Earlier answer" },
		{ role: "user", content: "Latest question" },
	],
	project_rules: [
		{
			id: "p",
			path: "AGENTS.md",
			content: "Project rule",
			apply_mode: "always",
		},
	],
});

test("autoInject:false skips injection and leaves the turn budget untouched", async () => {
	const { calls, host, values } = recordingHost({
		autoInject: false,
		turnsPerPlan: 1,
		rules: [{ id: "a", text: "Be concise", enabled: true }],
	});
	const directive = await runHook(baseCtx(), host);

	assert.deepEqual(directive, { kind: "none" });
	assert.deepEqual(calls, [
		{ path: "getPreference", key: "rules.agent.claude" },
	]);
	assert.equal(values.size, 0);
});

test("autoInject:true with the same rules injects and consumes one turn", async () => {
	const { host, values } = recordingHost({
		autoInject: true,
		turnsPerPlan: 1,
		rules: [{ id: "a", text: "Be concise", enabled: true }],
	});
	const directive = await runHook(baseCtx(), host);

	assert.equal(directive.kind, "rewrite");
	assert.match(directive.messages[3].content, /Be concise/);
	assert.equal(values.get("turns:conv-1"), "1");
});

test("only enabled, non-manual agent rules with text are injected into the latest user message", async () => {
	const { host } = recordingHost({
		rules: [
			{ id: "rule-a", text: "Rule A text", enabled: false },
			{ id: "rule-b", text: "Rule B text", mode: "manual" },
			{ id: "rule-b2", text: "Rule B2 text", applyMode: "manual" },
			{ id: "rule-blank", text: "   \n\t", enabled: true },
			{ id: "rule-c", text: "Rule C text" },
		],
	});
	const ctx = { ...baseCtx(), project_rules: [] };
	const directive = await runHook(ctx, host);

	assert.equal(directive.kind, "rewrite");
	const latest = directive.messages[3].content;
	assert.match(latest, /^Latest question\n\n/);
	assert.match(latest, /### agent \(rule-c\)\nRule C text/);
	assert.doesNotMatch(latest, /Rule A text/);
	assert.doesNotMatch(latest, /Rule B text/);
	assert.doesNotMatch(latest, /Rule B2 text/);
	assert.doesNotMatch(latest, /rule-blank/);
	// Earlier turns and the system prompt stay byte-identical.
	assert.deepEqual(directive.messages.slice(0, 3), ctx.messages.slice(0, 3));
});

test("all agent rules filtered out with no project rules is a no-op that consumes no turn", async () => {
	const { host, values } = recordingHost({
		turnsPerPlan: 3,
		rules: [
			{ id: "a", text: "A", enabled: false },
			{ id: "b", text: "B", mode: "manual" },
			{ id: "blank", text: "" },
		],
	});
	const directive = await runHook({ ...baseCtx(), project_rules: [] }, host);

	assert.deepEqual(directive, { kind: "none" });
	assert.equal(values.size, 0);
});
