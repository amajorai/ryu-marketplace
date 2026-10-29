// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.
import { isNativeText } from "../../../tools/dist/native-primitive-observation.mjs";

// Co-located test for the `chat-title` plugin.
// Run with:  node --test plugins-store/plugins/chat-title/plugin.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const PLUGIN_PATH = join(HERE, "plugin.json");
const raw = readFileSync(MANIFEST_PATH, "utf8");
const plugin = JSON.parse(readFileSync(PLUGIN_PATH, "utf8"));

// ── code_file hydration ───────────────────────────────────────────────────────
// This plugin keeps its sandboxed JS in real files (`hooks/*.js`, `adapters/*.js`)
// and references them from the manifest by `code_file`. Core resolves those into
// the inline `code` string at parse time (`PluginManifest::hydrate_code_files`),
// so every consumer — including the sandbox — only ever sees `code`. Mirror that
// here, or the assertions below would read an empty body and silently pass.
function hydrateCodeFiles(m) {
	const read = (rel) => readFileSync(join(HERE, rel), "utf8");
	for (const hook of m.contributes?.turn_hooks ?? []) {
		if (hook.code_file) {
			hook.code = read(hook.code_file);
			hook.code_file = undefined;
		}
	}
	for (const entry of m.provides ?? []) {
		for (const binding of Object.values(entry.tools ?? {})) {
			if (binding.adapter?.code_file) {
				binding.adapter.code = read(binding.adapter.code_file);
				binding.adapter.code_file = undefined;
			}
		}
	}
	return m;
}

/** The manifest as Core sees it: parsed, with every `code_file` hydrated. */
const parseManifest = () => hydrateCodeFiles(JSON.parse(raw));

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function loadHookRunner(manifest) {
	const hook = manifest.contributes.turn_hooks[0];
	const fn = new AsyncFunction("ctx", "host", hook.code);
	return (ctx, host) => fn(ctx, host);
}

function makeTranscript(assistantTurns) {
	const transcript = [];
	for (let i = 0; i < assistantTurns; i++) {
		transcript.push({ role: "user", content: `question ${i + 1}` });
		transcript.push({
			role: "assistant",
			content: `answer ${i + 1} about centering a div`,
		});
	}
	return transcript;
}

function makeCtx(assistantTurns, overrides = {}) {
	return {
		conversation_id: "conv-123",
		agent_id: "ryu",
		transcript: makeTranscript(assistantTurns),
		flags: {},
		input: null,
		...overrides,
	};
}

function makeHost({ prefs = {}, titleReply = "Centering a div" } = {}) {
	const calls = { sideModel: [], setTitle: [], getPreference: [], log: [] };
	return {
		calls,
		getPreference: async ({ key }) => {
			calls.getPreference.push(key);
			return Object.hasOwn(prefs, key) ? prefs[key] : null;
		},
		sideModel: async (args) => {
			calls.sideModel.push(args);
			return titleReply;
		},
		setConversationTitle: async (args) => {
			calls.setTitle.push(args);
			return { ok: true, applied: true, title: args.title };
		},
		log: (...args) => calls.log.push(args),
	};
}

test("manifest.json is valid JSON with id/name/version", () => {
	const m = parseManifest();
	assert.equal(m.id, "@ryu/chat-title");
	assert.equal(isNativeText(m.name), true);
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
	assert.equal(plugin.version, m.version);
	assert.deepEqual(m.activation_events, ["*"]);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: m.id,
		displayName: m.name,
	});
	const hook = m.contributes.turn_hooks[0];
	assert.equal(hook.id, "chat-title.rename");
	assert.equal(hook.on, "post_assistant_turn");
	assert.match(hook.code, /host\.setConversationTitle/);
});

test("declares required grants and settings", () => {
	const m = parseManifest();
	assert.deepEqual(m.permission_grants, [
		"hook:side-model",
		"conversation:set-title",
		"preferences:read",
		"hook:run-self",
	]);
	const tab = m.contributes.settings_tabs[0];
	assert.deepEqual([tab.id, tab.title], ["chat-title.settings", "Chat titles"]);
	assert.equal(tab.scope, "node");
	assert.deepEqual(
		tab.fields.map((field) => [field.pref_key, field.label, field.type]),
		[
			["auto-title-enabled", "Auto-rename chats", "toggle"],
			["auto-title-on-first-turn", "Rename after the first reply", "toggle"],
			["auto-title-every-n", "Rename every N turns", "number"],
			["auto-title-model", "Title model", "model_picker"],
		]
	);
	const contextItem = m.contributes.context_menu_items[0];
	assert.equal(contextItem.id, "chat-title.rename-now");
	assert.equal(contextItem.label, "Rename with AI");
	assert.equal(contextItem.anchor, "conversation");
	assert.equal(contextItem.capability, "hooks.run");
	assert.deepEqual(contextItem.args, {
		hook_id: "chat-title.rename",
		event: { force: true },
	});
	assert.deepEqual(contextItem.feedback, {
		loading: "Renaming this chat…",
		success: "Renamed",
		error: "Couldn't rename this chat",
	});
	assert.equal(contextItem.order, 20);
});

test("skips when disabled", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ prefs: { "auto-title-enabled": "false" } });
	const out = await run(makeCtx(5), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.calls.sideModel.length, 0);
	assert.equal(host.calls.setTitle.length, 0);
});

test("skips mid-interval turns (default every 5)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	const out = await run(makeCtx(3), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.calls.sideModel.length, 0);
});

test("renames on the 5th assistant turn by default", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	const out = await run(makeCtx(5), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.calls.sideModel.length, 1);
	assert.equal(host.calls.setTitle.length, 1);
	assert.equal(host.calls.setTitle[0].id, "conv-123");
	assert.equal(host.calls.setTitle[0].mode, "auto");
	assert.equal(host.calls.setTitle[0].title, "Centering a div");
});

test("renames on the first assistant turn by default", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	const out = await run(makeCtx(1), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.calls.sideModel.length, 1);
	assert.equal(host.calls.setTitle.length, 1);
	assert.equal(host.calls.setTitle[0].mode, "auto");
});

test("first-turn rename can be turned off without touching the interval", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ prefs: { "auto-title-on-first-turn": "false" } });
	assert.deepEqual(await run(makeCtx(1), host), { kind: "none" });
	assert.equal(host.calls.sideModel.length, 0);
	// The every-5 cadence still applies.
	await run(makeCtx(5), host);
	assert.equal(host.calls.sideModel.length, 1);
});

test("every-n=1 renames every turn", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ prefs: { "auto-title-every-n": "1" } });
	const out = await run(makeCtx(1), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.calls.sideModel.length, 1);
	assert.equal(host.calls.setTitle.length, 1);
});

test("Rename with AI bypasses automatic gates and saves a custom title", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ prefs: { "auto-title-enabled": "false" } });
	const ctx = makeCtx(0, {
		event: { force: true },
		transcript: [{ role: "user", content: "Explain the whitespace issue" }],
	});
	const out = await run(ctx, host);

	assert.deepEqual(out, { kind: "note", text: 'Renamed to "Centering a div"' });
	assert.equal(host.calls.sideModel.length, 1);
	assert.equal(host.calls.sideModel[0].model_pref_key, "auto-title-model");
	assert.match(host.calls.sideModel[0].prompt, /Explain the whitespace issue/);
	assert.deepEqual(host.calls.setTitle, [
		{ id: "conv-123", title: "Centering a div", mode: "custom" },
	]);
});

test("a failed forced title write stays unclaimed and can succeed on retry", async () => {
	const run = loadHookRunner(parseManifest());
	let failTitle = true;
	const host = makeHost();
	host.setConversationTitle = async (args) => {
		host.calls.setTitle.push(args);
		if (failTitle) {
			throw new Error("local title store unavailable");
		}
		return { ok: true, applied: true, title: args.title };
	};
	const ctx = makeCtx(0, {
		event: { force: true },
		transcript: [{ role: "user", content: "Explain the whitespace issue" }],
	});

	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.log[0][0], "chat-title: setTitle failed");
	failTitle = false;
	assert.deepEqual(await run(ctx, host), {
		kind: "note",
		text: 'Renamed to "Centering a div"',
	});
	assert.equal(host.calls.sideModel.length, 2);
	assert.ok(host.calls.setTitle.every((entry) => entry.mode === "custom"));
});

test("a failed title generation stays unclaimed and retries exactly once", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost();
	let attempts = 0;
	host.sideModel = async (args) => {
		host.calls.sideModel.push(args);
		attempts += 1;
		if (attempts === 1) {
			throw new Error("provider unavailable");
		}
		return "Recovered title";
	};
	const ctx = makeCtx(1);

	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.setTitle.length, 0);
	assert.equal(host.calls.log[0][0], "chat-title: title generation failed");
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.sideModel.length, 2);
	assert.deepEqual(host.calls.setTitle, [
		{ id: "conv-123", title: "Recovered title", mode: "auto" },
	]);
});
