// Co-located, zero-dependency test for the `chat-title` plugin.
// Run with:  node --test plugins-store/chat-title/plugin.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const raw = readFileSync(MANIFEST_PATH, "utf8");

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
	const calls = { sideModel: [], setTitle: [], getPreference: [] };
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
		log: () => undefined,
	};
}

test("manifest.json is valid JSON with id/name/version", () => {
	const m = parseManifest();
	assert.equal(m.id, "@ryu/chat-title");
	assert.equal(typeof m.name, "string");
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("declares required grants and settings", () => {
	const m = parseManifest();
	for (const g of [
		"hook:side-model",
		"conversation:set-title",
		"preferences:read",
	]) {
		assert.ok(m.permission_grants.includes(g), `missing grant ${g}`);
	}
	const tab = m.contributes.settings_tabs[0];
	assert.equal(tab.scope, "node");
	const keys = tab.fields.map((f) => f.pref_key);
	assert.ok(keys.includes("auto-title-enabled"));
	assert.ok(keys.includes("auto-title-every-n"));
	assert.ok(keys.includes("auto-title-model"));
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

test("every-n=1 renames every turn", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost({ prefs: { "auto-title-every-n": "1" } });
	const out = await run(makeCtx(1), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.calls.sideModel.length, 1);
	assert.equal(host.calls.setTitle.length, 1);
});
