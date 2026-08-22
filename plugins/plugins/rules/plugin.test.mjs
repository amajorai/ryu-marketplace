import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const hook = manifest.contributes.turn_hooks[0];
const code = readFileSync(join(here, hook.code_file), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const runHook = async (ctx, preference = {}, values = new Map()) => {
	const host = {
		getPreference: async ({ key }) => (key.startsWith("rules.agent.") ? preference : null),
		storage: {
			get: async (key) => values.get(key),
			set: async (key, value) => values.set(key, value),
		},
	};
	return new AsyncFunction("ctx", "host", code)(ctx, host);
};

test("manifest declares the agent edit panel and context hook", () => {
	assert.deepEqual(manifest.permission_grants, ["preferences:read", "storage:kv"]);
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.contributes.agent_edit_panels[0], {
		id: "rules",
		type: "rules",
		title: "Rules",
		description: "Configure project and agent rules, matching mode, automatic context injection, and turns per plan.",
		pref_key_prefix: "rules.agent.",
	});
	assert.equal(hook.on, "context");
});

test("injects enabled agent and always project rules into the latest user message", async () => {
	const directive = await runHook(
		{
			conversation_id: "c1",
			agent_id: "claude",
			messages: [{ role: "user", content: "Fix the parser" }],
			project_rules: [{ id: "project", path: "AGENTS.md", content: "Use tests first", enabled: true, apply_mode: "always" }],
		},
		{ rules: [{ id: "agent", text: "Be concise", enabled: true, applyMode: "always" }] },
	);
	assert.equal(directive.kind, "rewrite");
	assert.match(directive.messages[0].content, /Use tests first/);
	assert.match(directive.messages[0].content, /Be concise/);
});

test("manual mode keeps agent rules but suppresses project rules", async () => {
	const directive = await runHook(
		{
			messages: [{ role: "user", content: "Fix the parser" }],
			project_rules: [{ id: "project", content: "Do not inject", enabled: true }],
		},
		{ applyMode: "manual", rules: [{ id: "agent", text: "Agent base", enabled: true }] },
	);
	assert.match(directive.messages[0].content, /Agent base/);
	assert.doesNotMatch(directive.messages[0].content, /Do not inject/);
});

test("ACP replaces the prompt and requests a fresh session", async () => {
	const directive = await runHook(
		{ input: "Implement the feature", project_rules: [{ id: "p", content: "Run tests", apply_mode: "always" }] },
		{},
	);
	assert.equal(directive.kind, "replace");
	assert.equal(directive.fresh_session, true);
	assert.match(directive.text, /Run tests/);
});

test("path mode matches a rule glob against the latest user text", async () => {
	const directive = await runHook(
		{
			messages: [{ role: "user", content: "Please update src/parser/index.ts" }],
			project_rules: [
				{ id: "ts", content: "Keep parser tests green", globs: ["**/*.ts"], apply_mode: "path" },
				{ id: "rs", content: "Do not select this", globs: ["**/*.rs"], apply_mode: "path" },
			],
		},
		{ applyMode: "path" },
	);
	assert.match(directive.messages[0].content, /Keep parser tests green/);
	assert.doesNotMatch(directive.messages[0].content, /Do not select this/);
});

test("path mode supports Claude brace expansion", async () => {
	const directive = await runHook(
		{
			messages: [{ role: "user", content: "Update src/parser.tsx" }],
			project_rules: [
				{ id: "ui", content: "Use UI rules", globs: ["src/**/*.{ts,tsx}"], apply_mode: "path" },
			],
		},
		{},
	);
	assert.match(directive.messages[0].content, /Use UI rules/);
});

test("turn budget removes legacy project context after the configured turns", async () => {
	const values = new Map();
	const context = {
		conversation_id: "limited",
		agent_id: "ryu",
		project_instructions: "## Project instructions (AGENTS.md)\nLegacy rule",
		project_rules: [{ id: "project", content: "Fresh rule", apply_mode: "always" }],
		messages: [
			{ role: "system", content: "## Project instructions (AGENTS.md)\nLegacy rule\n\nBase" },
			{ role: "user", content: "Work" },
		],
	};
	const preference = { turnsPerPlan: 1 };
	const first = await runHook(context, preference, values);
	assert.match(first.messages[1].content, /Fresh rule/);
	const second = await runHook(context, preference, values);
	assert.equal(second.kind, "rewrite");
	assert.doesNotMatch(second.messages[0].content, /Legacy rule/);
	assert.doesNotMatch(second.messages[1].content, /Fresh rule/);
});
