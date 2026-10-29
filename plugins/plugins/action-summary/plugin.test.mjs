import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));
const hookCode = readFileSync(join(HERE, "hooks/action.js"), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function loadHook() {
	return new AsyncFunction("ctx", "host", hookCode);
}

function makeHost({
	prefs = {},
	reply = "Running the tests to verify the change.",
	failModel = false,
	failPreferenceOnce = false,
} = {}) {
	const calls = { preferences: [], sideModel: [], log: [] };
	let preferenceFailuresRemaining = failPreferenceOnce ? 1 : 0;
	return {
		calls,
		getPreference: async ({ key }) => {
			calls.preferences.push(key);
			if (preferenceFailuresRemaining > 0) {
				preferenceFailuresRemaining -= 1;
				throw new Error("preference store unavailable");
			}
			return Object.hasOwn(prefs, key) ? prefs[key] : null;
		},
		sideModel: async (args) => {
			calls.sideModel.push(args);
			if (failModel) {
				throw new Error("local model unavailable");
			}
			return reply;
		},
		log: (...args) => calls.log.push(args),
	};
}

test("manifest exposes the opt-in action hook and detail/model settings", () => {
	assert.equal(manifest.id, "@ryu/action-summary");
	assert.equal(manifest.name, "Action Summary");
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(manifest.permission_grants, [
		"hook:side-model",
		"preferences:read",
	]);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	const hook = manifest.contributes.turn_hooks[0];
	assert.equal(hook.id, "action-summary.action");
	assert.equal(hook.on, "action");
	assert.equal(hook.code_file, "hooks/action.js");
	const tab = manifest.contributes.settings_tabs[0];
	assert.deepEqual(
		[tab.id, tab.title],
		["action-summary.settings", "Action summaries"]
	);
	const fields = tab.fields;
	assert.deepEqual(
		fields.map((field) => [field.pref_key, field.label, field.type]),
		[
			["action-summary-enabled", "Explain thinking and tool actions", "toggle"],
			["action-summary-detail", "Detail", "select"],
			["action-summary-model", "Summary model", "model_picker"],
		]
	);
	assert.deepEqual(
		fields[1].options.map((option) => option.value),
		["brief", "standard", "full"]
	);
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

test("transient enabled-preference refusal preserves the manifest default and retries on the next action", async () => {
	const host = makeHost({ failPreferenceOnce: true });
	const run = loadHook();
	const action = {
		action: {
			id: "call-retry",
			kind: "tool",
			name: "Read",
			input: { path: "README.md" },
			status: "completed",
		},
	};

	const first = await run(action, host);
	const second = await run(action, host);

	assert.equal(first.kind, "tool_approval");
	assert.equal(second.kind, "tool_approval");
	assert.deepEqual(host.calls.preferences, [
		"action-summary-enabled",
		"action-summary-detail",
		"action-summary-enabled",
		"action-summary-detail",
	]);
	assert.equal(host.calls.sideModel.length, 2);
	assert.equal(
		host.calls.log[0][0],
		"action-summary: enabled preference read failed"
	);
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

test("side-model rejection is logged and falls back to a useful action summary", async () => {
	const host = makeHost({ failModel: true });
	const out = await loadHook()(
		{
			action: {
				id: "call-retry",
				kind: "tool",
				name: "Bash",
				input: { command: "bun test" },
				status: "failed",
			},
		},
		host
	);

	assert.equal(out.kind, "tool_approval");
	assert.equal(out.summary, "Bash bun test failed.");
	assert.equal(host.calls.sideModel.length, 1);
	assert.equal(host.calls.log[0][0], "action-summary: side model failed");
});

test("redacts credentials embedded in command and URL strings before side-model calls", async () => {
	const secrets = [
		"Authorization: Basic dXNlcjpwYXNz",
		"Cookie: session=super-secret",
		"https://alice:password@example.com/private",
		"https://example.com/hook?api_key=vendor-secret&ok=1",
		"-----BEGIN PRIVATE KEY-----\nsecret-material\n-----END PRIVATE KEY-----",
	];
	for (const secret of secrets) {
		const host = makeHost();
		await loadHook()(
			{
				action: {
					id: "call-secret",
					kind: "tool",
					name: "Bash",
					input: { command: secret },
					status: "completed",
					sequence: 0,
				},
			},
			host
		);
		assert.equal(host.calls.sideModel.length, 1);
		assert.doesNotMatch(
			host.calls.sideModel[0].prompt,
			/dXNlcjpwYXNz|super-secret|password@example|vendor-secret|secret-material/
		);
	}
});
