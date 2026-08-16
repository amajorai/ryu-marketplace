// Zero-dependency tests for the experimental AGENTS.md Tail context hook.
// Run with: node --test plugins-store/agents-md-tail/plugin.test.mjs

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

const runHook = (ctx, preference = false) => {
	const calls = [];
	const host = {
		getPreference: async (input) => {
			calls.push(input);
			return preference;
		},
	};
	return new AsyncFunction("ctx", "host", code)(ctx, host).then(
		(directive) => ({
			calls,
			directive,
		})
	);
};

const instructions = "Follow the project rules exactly.";
const marker = /<ryu-agents-md-tail>[\s\S]*?<\/ryu-agents-md-tail>/g;

test("manifest declares an opt-in node setting and context hook", () => {
	assert.equal(manifest.id, "@ryu/agents-md-tail");
	assert.deepEqual(manifest.permission_grants, ["preferences:read"]);
	assert.deepEqual(manifest.runnables, []);
	assert.equal(manifest.contributes.turn_hooks.length, 1);
	assert.equal(hook.on, "context");
	assert.equal(hook.code_file, "hooks/inject.js");
	const field = manifest.contributes.settings_tabs[0].fields[0];
	assert.equal(manifest.contributes.settings_tabs[0].scope, "node");
	assert.equal(field.pref_key, "agents-md-tail-remove-head");
	assert.equal(field.default, false);
});

test("missing project instructions is a no-op and does not read preferences", async () => {
	const { calls, directive } = await runHook({
		messages: [{ role: "user", content: "hi" }],
	});
	assert.deepEqual(directive, { kind: "none" });
	assert.deepEqual(calls, []);
});

test("OAI rewrite refreshes one tail on the last user string and preserves the head by default", async () => {
	const oldTail = "\n\n<ryu-agents-md-tail>\nold copy\n</ryu-agents-md-tail>";
	const messages = [
		{
			role: "system",
			content: `system prefix\n${instructions}\nsystem suffix`,
		},
		{ role: "user", content: `earlier${oldTail}` },
		{ role: "assistant", content: "answer" },
		{ role: "user", content: "latest" },
	];
	const { directive } = await runHook({
		project_instructions: instructions,
		messages,
	});
	assert.equal(directive.kind, "rewrite");
	assert.equal(directive.messages[0].content, messages[0].content);
	assert.equal(directive.messages[1].content, "earlier");
	assert.equal(
		directive.messages[3].content,
		`latest\n\n<ryu-agents-md-tail>\n${instructions}\n</ryu-agents-md-tail>`
	);
	assert.equal((directive.messages[3].content.match(marker) ?? []).length, 1);
	assert.equal(
		messages[3].content,
		"latest",
		"the chat-visible input must not be mutated"
	);
});

test("remove-head removes the exact project block even when system text surrounds it", async () => {
	const system = `style preface\n${instructions}\nstyle suffix`;
	const { calls, directive } = await runHook(
		{
			project_instructions: instructions,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: "latest" },
			],
		},
		true
	);
	assert.deepEqual(calls, [{ key: "agents-md-tail-remove-head" }]);
	assert.equal(directive.messages[0].content, "style preface\nstyle suffix");
	assert.equal(directive.messages[1].content.match(marker).length, 1);
});

test("multimodal last-user content keeps non-text parts and appends a text part", async () => {
	const { directive } = await runHook({
		project_instructions: instructions,
		messages: [
			{
				role: "user",
				content: [
					{ type: "image_url", image_url: { url: "data:image/png;base64,x" } },
				],
			},
		],
	});
	assert.equal(directive.kind, "rewrite");
	assert.equal(directive.messages[0].content.length, 2);
	assert.equal(directive.messages[0].content[0].type, "image_url");
	assert.equal(directive.messages[0].content[1].type, "text");
	assert.match(directive.messages[0].content[1].text, marker);
});

test("ACP replaces the flattened prompt, refreshes the tail, and requests a fresh session", async () => {
	const oldTail = "\n\n<ryu-agents-md-tail>\nold copy\n</ryu-agents-md-tail>";
	const { directive } = await runHook(
		{
			project_instructions: instructions,
			input: `prefix\n${instructions}\nsuffix${oldTail}`,
		},
		true
	);
	assert.equal(directive.kind, "replace");
	assert.equal(directive.fresh_session, true);
	assert.equal(
		directive.text,
		`prefix\nsuffix\n\n<ryu-agents-md-tail>\n${instructions}\n</ryu-agents-md-tail>`
	);
	assert.equal((directive.text.match(marker) ?? []).length, 1);
});

test("an OAI context without a user message is a no-op", async () => {
	const { directive } = await runHook({
		project_instructions: instructions,
		messages: [{ role: "system", content: "system" }],
	});
	assert.deepEqual(directive, { kind: "none" });
});
