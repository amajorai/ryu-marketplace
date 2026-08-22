import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const hookCode = readFileSync(join(HERE, "hooks/action.js"), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function loadHook() {
	return new AsyncFunction("ctx", "host", hookCode);
}

function makeHost({
	prefs = {},
	reply = "Running the tests to verify the change.",
} = {}) {
	const calls = { preferences: [], sideModel: [] };
	return {
		calls,
		getPreference: async ({ key }) => {
			calls.preferences.push(key);
			return Object.hasOwn(prefs, key) ? prefs[key] : null;
		},
		sideModel: async (args) => {
			calls.sideModel.push(args);
			return reply;
		},
		log: () => undefined,
	};
}

test("manifest exposes the opt-in action hook and detail/model settings", () => {
	assert.equal(manifest.id, "@ryu/action-summary");
	assert.equal(manifest.contributes.turn_hooks[0].on, "action");
	assert.equal(manifest.contributes.turn_hooks[0].code_file, "hooks/action.js");
	const keys = manifest.contributes.settings_tabs[0].fields.map(
		(field) => field.pref_key
	);
	assert.deepEqual(keys, [
		"action-summary-enabled",
		"action-summary-detail",
		"action-summary-model",
	]);
});

test("standard detail sends the configured side-model preference and one line", async () => {
	const host = makeHost();
	const out = await loadHook()(
		{
			action: {
				id: "call-1",
				kind: "tool",
				name: "Bash",
				input: { command: "npm test" },
				status: "completed",
				sequence: 0,
			},
		},
		host
	);
	assert.equal(out.kind, "tool_approval");
	assert.equal(out.question, "Can I run Bash now?");
	assert.equal(out.summary, "Running the tests to verify the change.");
	assert.equal(host.calls.sideModel.length, 1);
	assert.equal(host.calls.sideModel[0].model_pref_key, "action-summary-model");
	assert.match(host.calls.sideModel[0].system, /140/);
});

test("brief detail normalizes multiline model output to the configured budget", async () => {
	const host = makeHost({
		prefs: { "action-summary-detail": "brief" },
		reply: "Summary: first line\nsecond line\nthird line",
	});
	const out = await loadHook()(
		{
			action: {
				id: "thought-1",
				kind: "thinking",
				name: "Thinking",
				input: { thought: "inspect and edit" },
				status: "completed",
				sequence: 0,
			},
		},
		host
	);
	assert.equal(out.kind, "note");
	assert.equal(out.text, "first line second line third line");
	assert.ok(out.text.length <= 80);
});

test("disabled setting avoids the side-model call", async () => {
	const host = makeHost({ prefs: { "action-summary-enabled": "false" } });
	const out = await loadHook()({ action: { id: "call-1" } }, host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.calls.sideModel.length, 0);
});

test("failure fallback describes the command without requiring the model", async () => {
	const host = makeHost({ reply: "" });
	const out = await loadHook()(
		{
			action: {
				id: "call-1",
				kind: "tool",
				name: "Bash",
				input: { command: "npm test" },
				status: "failed",
				sequence: 0,
			},
		},
		host
	);
	assert.equal(out.kind, "tool_approval");
	assert.equal(out.question, "Can I run Bash now?");
	assert.match(out.summary, /Bash npm test failed/);
});
