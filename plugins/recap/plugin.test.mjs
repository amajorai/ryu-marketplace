// Co-located, zero-dependency test for the `recap` plugin.
// Run with:  node --test plugins-store/recap/plugin.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const raw = readFileSync(MANIFEST_PATH, "utf8");

// ── code_file hydration ───────────────────────────────────────────────────────
// This plugin keeps its sandboxed JS in real files (`hooks/*.js`) and references
// them from the manifest by `code_file`. Core resolves those into the inline `code`
// string at parse time (`PluginManifest::hydrate_code_files`), so every consumer —
// including the sandbox — only ever sees `code`. Mirror that here, or the assertions
// below would read an empty body and silently pass.
function hydrateCodeFiles(m) {
	const read = (rel) => readFileSync(join(HERE, rel), "utf8");
	for (const hook of m.contributes?.turn_hooks ?? []) {
		if (hook.code_file) {
			hook.code = read(hook.code_file);
			hook.code_file = undefined;
		}
	}
	return m;
}

/** The manifest as Core sees it: parsed, with every `code_file` hydrated. */
const parseManifest = () => hydrateCodeFiles(JSON.parse(raw));

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function loadHook(manifest, id) {
	const hook = manifest.contributes.turn_hooks.find((h) => h.id === id);
	if (!hook) {
		throw new Error(`no hook ${id} in the manifest`);
	}
	const fn = new AsyncFunction("ctx", "host", hook.code);
	return (ctx, host) => fn(ctx, host);
}

const LONG_ANSWER =
	`I rewrote the token expiry check in apps/core/src/auth/session.rs.
`.repeat(40);

function makeCtx(overrides = {}) {
	return {
		conversation_id: "conv-123",
		agent_id: "ryu",
		transcript: [
			{ role: "user", content: "fix the auth expiry bug" },
			{ role: "assistant", content: LONG_ANSWER },
		],
		flags: {},
		input: null,
		...overrides,
	};
}

function makeHost({
	prefs = {},
	stored = null,
	reply = "Fixed the expiry check.",
} = {}) {
	const calls = { sideModel: [], getPreference: [], set: [], delete: [] };
	let value = stored === null ? null : JSON.stringify(stored);
	return {
		calls,
		stored: () => (value === null ? null : JSON.parse(value)),
		getPreference: async ({ key }) => {
			calls.getPreference.push(key);
			return Object.hasOwn(prefs, key) ? prefs[key] : null;
		},
		sideModel: async (args) => {
			calls.sideModel.push(args);
			return reply;
		},
		storage: {
			get: async () => value,
			set: async (key, v) => {
				calls.set.push({ key, value: v });
				value = JSON.stringify(v);
			},
			delete: async (key) => {
				calls.delete.push(key);
				value = null;
			},
		},
		log: () => undefined,
	};
}

// ── manifest ──────────────────────────────────────────────────────────────────

test("manifest.json is valid JSON with id/name/version", () => {
	const m = parseManifest();
	assert.equal(m.id, "@ryu/recap");
	assert.equal(typeof m.name, "string");
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("declares required grants, settings and the /recap command", () => {
	const m = parseManifest();
	for (const g of ["hook:side-model", "storage:kv", "preferences:read"]) {
		assert.ok(m.permission_grants.includes(g), `missing grant ${g}`);
	}
	const keys = m.contributes.settings_tabs[0].fields.map((f) => f.pref_key);
	for (const k of [
		"recap-auto",
		"recap-min-chars",
		"recap-detail",
		"recap-model",
	]) {
		assert.ok(keys.includes(k), `missing setting ${k}`);
	}
	assert.equal(m.contributes.slash_commands[0].command, "/recap");
});

test("the command hook pre-gates on /recap so idle turns never spawn a sandbox", () => {
	const m = parseManifest();
	const hook = m.contributes.turn_hooks.find((h) => h.id === "recap.command");
	assert.equal(hook.on, "pre_user_turn");
	assert.deepEqual(hook.match.commands, ["/recap"]);
});

// ── recap.turn ────────────────────────────────────────────────────────────────

test("recaps a long turn as a note and stores it", async () => {
	const run = loadHook(parseManifest(), "recap.turn");
	const host = makeHost();
	const out = await run(makeCtx(), host);
	assert.equal(out.kind, "note");
	assert.match(out.text, /Fixed the expiry check\./);
	assert.equal(host.calls.sideModel.length, 1);
	assert.equal(host.calls.sideModel[0].model_pref_key, "recap-model");
	assert.equal(host.stored().entries.length, 1);
});

test("skips a short turn before spending a model call", async () => {
	const run = loadHook(parseManifest(), "recap.turn");
	const host = makeHost();
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "what time is it" },
			{ role: "assistant", content: "About 4pm." },
		],
	});
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.sideModel.length, 0);
});

test("recap-min-chars=0 recaps every turn", async () => {
	const run = loadHook(parseManifest(), "recap.turn");
	const host = makeHost({ prefs: { "recap-min-chars": "0" } });
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "what time is it" },
			{ role: "assistant", content: "About 4pm." },
		],
	});
	assert.equal((await run(ctx, host)).kind, "note");
	assert.equal(host.calls.sideModel.length, 1);
});

test("skips when the setting is off", async () => {
	const run = loadHook(parseManifest(), "recap.turn");
	const host = makeHost({ prefs: { "recap-auto": "false" } });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.calls.sideModel.length, 0);
});

test("a muted chat skips without reading preferences or calling the model", async () => {
	const run = loadHook(parseManifest(), "recap.turn");
	const host = makeHost({ stored: { entries: [], muted: true } });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.calls.sideModel.length, 0);
	assert.equal(host.calls.getPreference.length, 0);
});

test("recaps only what was said since the last user message", async () => {
	const run = loadHook(parseManifest(), "recap.turn");
	const host = makeHost();
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "first question" },
			{ role: "assistant", content: "OLD ANSWER that is not this turn" },
			{ role: "user", content: "second question" },
			{ role: "assistant", content: LONG_ANSWER },
		],
	});
	await run(ctx, host);
	const prompt = host.calls.sideModel[0].prompt;
	assert.ok(
		!prompt.includes("OLD ANSWER"),
		"leaked a previous turn into the recap"
	);
	assert.ok(prompt.includes("session.rs"));
});

test("a turn that produced nothing is not recapped", async () => {
	const run = loadHook(parseManifest(), "recap.turn");
	const host = makeHost({ prefs: { "recap-min-chars": "0" } });
	// Last row is the user's own message — the model said nothing. Recapping here
	// would read the user's prompt back to them as if it were work done.
	const ctx = makeCtx({
		transcript: [
			{ role: "assistant", content: LONG_ANSWER },
			{ role: "user", content: "and now do the other half" },
		],
	});
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.sideModel.length, 0);
});

test("a blank recap from the model is not surfaced", async () => {
	const run = loadHook(parseManifest(), "recap.turn");
	const host = makeHost({ reply: "   " });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.calls.set.length, 0);
});

test("stored recaps stay bounded", async () => {
	const run = loadHook(parseManifest(), "recap.turn");
	const entries = [];
	for (let i = 0; i < 30; i++) {
		entries.push({ turn: i + 1, text: `recap ${i + 1}` });
	}
	const host = makeHost({ stored: { entries, muted: false } });
	await run(makeCtx(), host);
	assert.equal(host.stored().entries.length, 30);
	assert.equal(host.stored().entries.at(-1).text, "Fixed the expiry check.");
});

// ── recap.command ─────────────────────────────────────────────────────────────

test("/recap answers the turn itself, without the main model", async () => {
	const run = loadHook(parseManifest(), "recap.command");
	const host = makeHost({
		reply:
			"Recap: shipped the auth fix.\n\n- edited session.rs\n\nOpen: nothing outstanding.",
	});
	const ctx = makeCtx({
		input: "/recap",
		transcript: [
			{ role: "user", content: "fix the auth expiry bug" },
			{ role: "assistant", content: LONG_ANSWER },
			{ role: "user", content: "/recap" },
		],
	});
	const out = await run(ctx, host);
	assert.equal(out.kind, "handled");
	assert.match(out.text, /^Recap: /);
	assert.equal(host.calls.sideModel.length, 1);
	// The command itself is not part of what is being summarized.
	assert.ok(!host.calls.sideModel[0].prompt.includes("/recap"));
});

test("/recap <focus> points the summary without becoming the whole prompt", async () => {
	const run = loadHook(parseManifest(), "recap.command");
	const host = makeHost();
	const ctx = makeCtx({ input: "/recap what changed in auth" });
	await run(ctx, host);
	assert.match(
		host.calls.sideModel[0].system,
		/focus on: what changed in auth/
	);
});

test("/recap off mutes this chat, /recap on restores it", async () => {
	const run = loadHook(parseManifest(), "recap.command");
	const host = makeHost();
	const off = await run(makeCtx({ input: "/recap off" }), host);
	assert.equal(off.kind, "handled");
	assert.equal(host.stored().muted, true);
	assert.equal(host.calls.sideModel.length, 0);

	const on = await run(makeCtx({ input: "/recap on" }), host);
	assert.equal(on.kind, "handled");
	assert.equal(host.stored().muted, false);
});

test("/recap off preserves the recaps already collected", async () => {
	const run = loadHook(parseManifest(), "recap.command");
	const host = makeHost({
		stored: { entries: [{ turn: 1, text: "did a thing" }], muted: false },
	});
	await run(makeCtx({ input: "/recap off" }), host);
	assert.equal(host.stored().entries.length, 1);
});

test("/recap clear drops the stored recaps", async () => {
	const run = loadHook(parseManifest(), "recap.command");
	const host = makeHost({
		stored: { entries: [{ turn: 1, text: "did a thing" }], muted: true },
	});
	const out = await run(makeCtx({ input: "/recap clear" }), host);
	assert.equal(out.kind, "handled");
	assert.equal(host.calls.delete.length, 1);
	assert.equal(host.stored(), null);
});

test("/recap on an empty conversation says so instead of calling the model", async () => {
	const run = loadHook(parseManifest(), "recap.command");
	const host = makeHost();
	const ctx = makeCtx({
		input: "/recap",
		transcript: [{ role: "user", content: "/recap" }],
	});
	const out = await run(ctx, host);
	assert.equal(out.kind, "handled");
	assert.match(out.text, /Nothing to recap/);
	assert.equal(host.calls.sideModel.length, 0);
});

test("a longer command that merely starts with /recap is not claimed", async () => {
	const run = loadHook(parseManifest(), "recap.command");
	const host = makeHost();
	const ctx = makeCtx({ input: "/recapture the browser tab" });
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.sideModel.length, 0);
});

test("a message that merely mentions recap is not the command", async () => {
	const run = loadHook(parseManifest(), "recap.command");
	const host = makeHost();
	const ctx = makeCtx({ input: "can you recap that for me" });
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.sideModel.length, 0);
});
