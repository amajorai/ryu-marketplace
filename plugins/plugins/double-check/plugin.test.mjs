// Co-located, zero-dependency test for the `double-check` plugin.
// Run with:  node --test plugins-store/plugins/double-check/plugin.test.mjs
//
// `double-check` is an INLINE-HOOK plugin: its behaviour lives entirely in the
// JS string at contributes.turn_hooks[0].code, which Core runs in a sandbox with
// an injected `ctx` and a `host` facade (see apps/core/src/plugin_host/mod.rs,
// build_hook_program). This test extracts that exact string and RUNS it against a
// realistic mock ctx + a stub host.sideModel, asserting the returned directive
// matches the hook's logic. It never edits manifest.json.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const FLAG = "io.ryu.double-check";

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

// Core wraps the hook body in an async IIFE where a bare `return` reports the
// directive as the program's final value. AsyncFunction(body) reproduces that:
// the body runs as an async function taking (ctx, host) and its `return` is the
// resolved value. Mirrors run_hook/build_hook_program in Core.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function loadHookRunner(manifest) {
	const hook = manifest.contributes.turn_hooks[0];
	const fn = new AsyncFunction("ctx", "host", hook.code);
	return (ctx, host) => fn(ctx, host);
}

// A realistic post_assistant_turn ctx (mirrors HookContext in Core: transcript
// oldest→newest of {role, content}, per-request flags, conversation_id).
function makeCtx(overrides = {}) {
	return {
		conversation_id: "conv-123",
		agent_id: "ryu",
		transcript: [
			{ role: "user", content: "What is 2 + 2?" },
			{ role: "assistant", content: "2 + 2 = 5." },
		],
		flags: { [FLAG]: true },
		input: null,
		...overrides,
	};
}

// Stub host: records the sideModel call and returns a canned string.
function makeHost(reply) {
	const calls = [];
	return {
		calls,
		sideModel: async (args) => {
			calls.push(args);
			return typeof reply === "function" ? reply(args) : reply;
		},
	};
}

test("manifest.json is valid JSON with id/name/version", () => {
	const m = parseManifest();
	assert.equal(typeof m, "object");
	assert.equal(m.id, "@ryu/double-check");
	assert.equal(typeof m.name, "string");
	assert.ok(m.name.length > 0);
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("declared contributes fields are well-formed", () => {
	const m = parseManifest();

	// grant required to reach host.sideModel
	assert.ok(
		Array.isArray(m.permission_grants) &&
			m.permission_grants.includes("hook:side-model"),
		"must grant hook:side-model"
	);

	// composer toggle drives the flag the hook reads
	const toggle = m.contributes.composer_controls[0];
	assert.equal(toggle.type, "toggle");
	assert.equal(toggle.flag, FLAG);

	// reviewer model picker writes the pref key the hook passes to sideModel
	const field = m.contributes.settings_tabs[0].fields[0];
	assert.equal(field.type, "model_picker");
	assert.equal(field.pref_key, "double-check-model");

	// the inline hook itself
	const hook = m.contributes.turn_hooks[0];
	assert.equal(hook.on, "post_assistant_turn");
	assert.equal(hook.match.flag, FLAG);
	assert.equal(typeof hook.code, "string");
	assert.ok(hook.code.includes("host.sideModel"));
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(HERE, "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}

	// There is no fixture COPY any more. Core `include_str!`s this manifest straight
	// from its package home, so a resurrected copy is a dead-edit trap: the fixture
	// would WIN for any include_str! still pointing at fixtures/, and edits made here
	// would silently go nowhere. Core asserts this across all packages; repeating it
	// per plugin is what makes a failure name the plugin that regressed.
	const stale = join(
		coreSrc,
		"plugin_manifest",
		"fixtures",
		"double-check.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory. Delete the fixture copy.`
	);

	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	// Registration seam: forgetting the include_str! leaves every other guard passing
	// while the plugin simply does not exist at runtime. Compiled in via BUILTIN_MANIFESTS.
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/double-check/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});

test("hook returns {kind:'none'} when the flag is off", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("Looks correct.");

	// flag absent entirely
	assert.deepEqual(await run(makeCtx({ flags: {} }), host), { kind: "none" });
	// flag explicitly false
	assert.deepEqual(await run(makeCtx({ flags: { [FLAG]: false } }), host), {
		kind: "none",
	});
	assert.equal(host.calls.length, 0, "sideModel must not run when flag is off");
});

test("hook returns {kind:'none'} when there is no assistant turn to review", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("Looks correct.");
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "hello?" }],
	});
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.length, 0);
});

test("hook calls sideModel with the right args and returns a note", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("The answer is wrong: 2 + 2 = 4.");
	const directive = await run(makeCtx(), host);

	assert.deepEqual(directive, {
		kind: "note",
		text: "The answer is wrong: 2 + 2 = 4.",
	});

	assert.equal(host.calls.length, 1);
	const args = host.calls[0];
	assert.equal(args.model_pref_key, "double-check-model");
	assert.ok(
		args.system.includes("reviewer"),
		"system prompt frames a reviewer"
	);
	// prompt must carry BOTH the last user question and the last assistant answer
	assert.ok(args.prompt.includes("What is 2 + 2?"), "prompt includes user ask");
	assert.ok(
		args.prompt.includes("2 + 2 = 5."),
		"prompt includes assistant answer"
	);
});

test("hook uses the newest assistant + user turns (reverse scan)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("note");
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "OLD question" },
			{ role: "assistant", content: "OLD answer" },
			{ role: "user", content: "NEW question" },
			{ role: "assistant", content: "NEW answer" },
		],
	});
	await run(ctx, host);
	const { prompt } = host.calls[0];
	assert.ok(prompt.includes("NEW question"), "picks newest user turn");
	assert.ok(prompt.includes("NEW answer"), "picks newest assistant turn");
	assert.ok(!prompt.includes("OLD"), "ignores older turns");
});

test("empty / whitespace-only review degrades to {kind:'none'}", async () => {
	const run = loadHookRunner(parseManifest());

	assert.deepEqual(await run(makeCtx(), makeHost("")), { kind: "none" });
	assert.deepEqual(await run(makeCtx(), makeHost("   \n\t ")), {
		kind: "none",
	});
	// null return (sideModel produced nothing) also degrades safely
	assert.deepEqual(await run(makeCtx(), makeHost(null)), { kind: "none" });
});

test("note text is trimmed", async () => {
	const run = loadHookRunner(parseManifest());
	const directive = await run(makeCtx(), makeHost("   Looks correct.   "));
	assert.deepEqual(directive, { kind: "note", text: "Looks correct." });
});
