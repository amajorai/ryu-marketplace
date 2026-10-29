// Zero-dependency tests for the experimental AGENTS.md Tail context hook.
// Run with: node --test plugins-store/plugins/agents-md-tail/plugin.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
const hook = manifest.contributes.turn_hooks[0];
const code = readFileSync(join(here, hook.code_file), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const runHook = async (ctx) => {
	const calls = [];
	const host = {
		getPreference: async (input) => {
			calls.push(input);
			return null;
		},
	};
	const directive = await new AsyncFunction("ctx", "host", code)(ctx, host);
	return { calls, directive };
};

const instructions = "Follow the project rules exactly.";
const marker = /<ryu-agents-md-tail>[\s\S]*?<\/ryu-agents-md-tail>/g;

test("manifest declares the context hook and needs no grants or settings", () => {
	assert.equal(manifest.id, "@ryu/agents-md-tail");
	assert.equal(manifest.name, "AGENTS.md Tail");
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(manifest.permission_grants, []);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.deepEqual(manifest.runnables, []);
	assert.equal(manifest.contributes.settings_tabs, undefined);
	assert.equal(manifest.contributes.turn_hooks.length, 1);
	assert.equal(hook.id, "agents-md-tail.context");
	assert.equal(hook.on, "context");
	assert.equal(hook.code_file, "hooks/inject.js");
});

test("missing project instructions is a no-op", async () => {
	const { calls, directive } = await runHook({
		messages: [{ role: "user", content: "hi" }],
	});
	assert.deepEqual(directive, { kind: "none" });
	assert.deepEqual(calls, []);
});

test("OAI rewrite appends one tail to the latest user message and leaves the cacheable prefix untouched", async () => {
	const messages = [
		{
			role: "system",
			content: `system prefix\n${instructions}\nsystem suffix`,
		},
		{ role: "user", content: "earlier" },
		{ role: "assistant", content: "answer" },
		{ role: "user", content: "latest" },
	];
	const { calls, directive } = await runHook({
		project_instructions: instructions,
		messages,
	});
	assert.deepEqual(calls, [], "no preference decides the system prompt");
	assert.equal(directive.kind, "rewrite");
	assert.deepEqual(
		directive.messages.slice(0, 3),
		messages.slice(0, 3),
		"the system prompt and earlier turns must stay byte-identical"
	);
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

test("ACP appends the tail to the flattened prompt and keeps the pooled session", async () => {
	const input = `prefix\n${instructions}\nsuffix`;
	const { directive } = await runHook({
		project_instructions: instructions,
		input,
	});
	assert.equal(directive.kind, "replace");
	assert.equal(directive.fresh_session, undefined);
	assert.ok(
		directive.text.startsWith(input),
		"the built prompt is a frozen prefix"
	);
	assert.equal(
		directive.text,
		`${input}\n\n<ryu-agents-md-tail>\n${instructions}\n</ryu-agents-md-tail>`
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

test("unsupported object content is stringified without mutating the caller's value", async () => {
	const structuredContent = { kind: "tool-result", output: "unchanged" };
	const { directive } = await runHook({
		project_instructions: instructions,
		messages: [{ role: "user", content: structuredContent }],
	});

	assert.equal(directive.kind, "rewrite");
	assert.deepEqual(directive.messages[0].content, [
		{ type: "text", text: "[object Object]" },
		{
			type: "text",
			text: `\n\n<ryu-agents-md-tail>\n${instructions}\n</ryu-agents-md-tail>`,
		},
	]);
	assert.deepEqual(structuredContent, {
		kind: "tool-result",
		output: "unchanged",
	});
});
