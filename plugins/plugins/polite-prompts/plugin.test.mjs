// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.
import { isNativeFunction } from "../../../tools/dist/native-primitive-observation.mjs";

// Co-located test for the `polite-prompts` plugin.
// Run with:  node --test plugins-store/plugins/polite-prompts/plugin.test.mjs
//
// The plugin's behaviour lives entirely in one sandboxed hook body that Core runs
// with an injected `ctx` and a `host` facade (see apps/core/src/plugin_host/
// mod.rs, `build_hook_program`). This test hydrates it exactly as Core does and
// RUNS it against a realistic `pre_user_turn` ctx plus a stub host.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ID = "@ryu/polite-prompts";
const HOOK_ID = "polite-prompts.rewrite";

const raw = readFileSync(join(HERE, "manifest.json"), "utf8");

/** The manifest as Core sees it: parsed, with every `code_file` hydrated. */
function parseManifest() {
	const m = JSON.parse(raw);
	for (const hook of m.contributes?.turn_hooks ?? []) {
		if (hook.code_file) {
			hook.code = readFileSync(join(HERE, hook.code_file), "utf8");
			hook.code_file = undefined;
		}
	}
	return m;
}

// Core wraps the hook body in an async IIFE where a bare `return` reports the
// directive as the program's final value. AsyncFunction(body) reproduces that.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const hook = parseManifest().contributes.turn_hooks.find(
	(h) => h.id === HOOK_ID
);
const runHook = new AsyncFunction("ctx", "host", hook.code);

function makeCtx(input) {
	return {
		conversation_id: "conv-1",
		agent_id: "ryu",
		transcript: [],
		flags: {},
		input,
	};
}

function makeHost({ reply = "", prefs = {} } = {}) {
	const state = { sideModelCalls: [], logs: [] };
	return {
		state,
		sideModel: async (args) => {
			state.sideModelCalls.push(args);
			return isNativeFunction(reply) ? reply(args) : reply;
		},
		getPreference: async ({ key }) =>
			Object.hasOwn(prefs, key) ? prefs[key] : null,
		log: (...a) => state.logs.push(a),
	};
}

// ── manifest ─────────────────────────────────────────────────────────────────

test("manifest declares the hook, grants and settings the body reads", () => {
	const m = parseManifest();
	const plugin = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));
	assert.equal(m.id, PLUGIN_ID);
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
	assert.equal(plugin.version, m.version);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: m.id,
		displayName: m.name,
	});
	assert.deepEqual(m.permission_grants, [
		"hook:side-model",
		"preferences:read",
	]);

	assert.equal(m.contributes.turn_hooks.length, 1);
	assert.equal(hook.on, "pre_user_turn");
	assert.equal(hook.match, undefined, "hostility cannot be match-gated");

	assert.deepEqual(
		m.contributes.settings_tabs[0].fields.map((f) => [f.pref_key, f.type]),
		[
			["polite-prompts-auto", "toggle"],
			["polite-prompts-model", "model_picker"],
		]
	);
	assert.deepEqual(
		m.contributes.slash_commands.map(({ command }) => command),
		["/polite"]
	);
});

test("Core compiles the manifest and hook body in (registration seam)", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}
	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/polite-prompts/manifest.json")'
		)
	);
	const embeds = readFileSync(
		join(coreSrc, "plugin_manifest", "builtin_code.rs"),
		"utf8"
	);
	assert.ok(
		embeds.includes(
			'include_str!("../../../../plugins-store/plugins/polite-prompts/hooks/rewrite.js")'
		)
	);
	const builtins = readFileSync(
		join(coreSrc, "plugins", "builtins.rs"),
		"utf8"
	);
	assert.ok(builtins.includes(`"${PLUGIN_ID}"`));
});

// ── automatic rewrite ────────────────────────────────────────────────────────

test("an ordinary message is sent untouched without a model call", async () => {
	const host = makeHost({ reply: "should not be used" });
	const out = await runHook(
		makeCtx("Can you kill the stale dev server and rerun the tests?"),
		host
	);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.state.sideModelCalls.length, 0);
});

test("an abusive message is replaced with the polite rewrite", async () => {
	const polite =
		"The login test is still failing after your last change. Please fix it — this is urgent.";
	const host = makeHost({ reply: polite });
	const out = await runHook(
		makeCtx("you useless bot, the login test is STILL failing, fix it now"),
		host
	);
	assert.deepEqual(out, { kind: "replace", text: polite });
	const [call] = host.state.sideModelCalls;
	assert.equal(call.model_pref_key, "polite-prompts-model");
	assert.match(call.system, /UNCHANGED/);
	assert.match(call.prompt, /the login test is STILL failing/);
});

test("shouting in capitals is treated as hostile", async () => {
	const host = makeHost({
		reply: "Why is the deploy failing again? Please look into it.",
	});
	const out = await runHook(
		makeCtx("WHY IS THE DEPLOY FAILING AGAIN FIX IT RIGHT NOW"),
		host
	);
	assert.equal(out.kind, "replace");
	assert.equal(host.state.sideModelCalls.length, 1);
});

test("rude words inside code or quotes do not trigger a rewrite", async () => {
	const host = makeHost({ reply: "should not be used" });
	const input = [
		"Why does this throw?",
		"```",
		"throw new Error('wtf, idiot input');",
		"```",
		"> stupid bot said: shit happens",
		"The `fuck` variable is legacy.",
	].join("\n");
	const out = await runHook(makeCtx(input), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.state.sideModelCalls.length, 0);
});

test("the model's UNCHANGED verdict sends the original", async () => {
	const host = makeHost({ reply: "UNCHANGED" });
	const out = await runHook(
		makeCtx("the paper calls this the stupid AI baseline; add it to the table"),
		host
	);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.state.sideModelCalls.length, 1);
});

test("the setting off disables automatic rewriting", async () => {
	const host = makeHost({
		reply: "nope",
		prefs: { "polite-prompts-auto": "false" },
	});
	const out = await runHook(makeCtx("fix this shit, idiot"), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.state.sideModelCalls.length, 0);
});

test("another plugin's slash command is never rewritten", async () => {
	const host = makeHost({ reply: "nope" });
	const out = await runHook(makeCtx("/goal fix this fucking build"), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.state.sideModelCalls.length, 0);
});

// ── fail-open guards ─────────────────────────────────────────────────────────

test("a model failure sends the original", async () => {
	const host = makeHost({
		reply: () => {
			throw new Error("gateway down");
		},
	});
	const out = await runHook(makeCtx("you idiot, fix the build"), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.state.logs.length, 1);
});

test("a rewrite that alters a code block sends the original", async () => {
	const block = "```js\nconst x = 1;\n```";
	const host = makeHost({
		reply: "Please fix this:\n```js\nconst x = 2;\n```",
	});
	const out = await runHook(
		makeCtx(`fix this garbage code you moron\n${block}`),
		host
	);
	assert.deepEqual(out, { kind: "none" });
});

test("a rewrite that keeps the code block verbatim is accepted", async () => {
	const block = "```js\nconst x = 1;\n```";
	const polite = `Could you please fix this code?\n${block}`;
	const host = makeHost({ reply: polite });
	const out = await runHook(
		makeCtx(`fix this garbage code you moron\n${block}`),
		host
	);
	assert.deepEqual(out, { kind: "replace", text: polite });
});

test("a reply that answers instead of rewriting is rejected", async () => {
	const host = makeHost({ reply: "Sure! ".repeat(400) });
	const out = await runHook(makeCtx("stupid bot, fix it"), host);
	assert.deepEqual(out, { kind: "none" });
});

test("an echoed <message> wrapper is stripped", async () => {
	const host = makeHost({ reply: "<message>\nPlease fix it.\n</message>" });
	const out = await runHook(makeCtx("stupid bot, fix it"), host);
	assert.deepEqual(out, { kind: "replace", text: "Please fix it." });
});

// ── /polite ──────────────────────────────────────────────────────────────────

test("/polite rewrites on demand even with the setting off", async () => {
	const host = makeHost({
		reply: "Could you take another look at the parser?",
		prefs: { "polite-prompts-auto": "false" },
	});
	const out = await runHook(makeCtx("/polite look at the parser again"), host);
	assert.deepEqual(out, {
		kind: "replace",
		text: "Could you take another look at the parser?",
	});
	assert.doesNotMatch(host.state.sideModelCalls[0].system, /UNCHANGED/);
});

test("/polite never forwards its own prefix, even when the model fails", async () => {
	const host = makeHost({ reply: "" });
	const out = await runHook(makeCtx("/polite look at the parser again"), host);
	assert.deepEqual(out, { kind: "replace", text: "look at the parser again" });
});

test("bare /polite answers with usage and no model call", async () => {
	const host = makeHost({ reply: "nope" });
	const out = await runHook(makeCtx("/polite"), host);
	assert.equal(out.kind, "handled");
	assert.match(out.text, /Usage/);
	assert.equal(host.state.sideModelCalls.length, 0);
});

test("/politeness is not the /polite command", async () => {
	const host = makeHost({ reply: "nope" });
	const out = await runHook(makeCtx("/politeness check"), host);
	assert.deepEqual(out, { kind: "none" });
});
