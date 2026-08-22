// Co-located, zero-dependency test for the `no-more-mistakes` plugin.
// Run with:  node --test plugins-store/plugins/no-more-mistakes/plugin.test.mjs
//
// The plugin's behaviour lives entirely in three sandboxed hook bodies that Core
// runs with an injected `ctx` and a `host` facade (see apps/core/src/plugin_host/
// mod.rs, `build_hook_program`). This test hydrates them exactly as Core does and
// RUNS them against a realistic ctx plus a stub host — including a stub
// `host.spaces` facade, because the whole point of the plugin is what it writes
// there. It never edits manifest.json.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const PLUGIN_ID = "@ryu/no-more-mistakes";

const raw = readFileSync(MANIFEST_PATH, "utf8");

// ── code_file hydration ───────────────────────────────────────────────────────
// This plugin keeps its sandboxed JS in real files (`hooks/*.js`) and references
// them from the manifest by `code_file`. Core resolves those into the inline `code`
// string at parse time (`PluginManifest::hydrate_code_files`), so every consumer —
// including the sandbox — only ever sees `code`. Mirror that here, or the
// assertions below would read an empty body and silently pass.
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

// Core wraps the hook body in an async IIFE where a bare `return` reports the
// directive as the program's final value. AsyncFunction(body) reproduces that.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function loadHookRunner(manifest, hookId) {
	const hook = manifest.contributes.turn_hooks.find((h) => h.id === hookId);
	assert.ok(hook, `hook ${hookId} is missing from the manifest`);
	const fn = new AsyncFunction("ctx", "host", hook.code);
	return (ctx, host) => fn(ctx, host);
}

/** A realistic `pre_user_turn` ctx: the pending message plus the window behind it. */
function makeCtx(overrides = {}) {
	return {
		conversation_id: "conv-123",
		agent_id: "ryu",
		transcript: [
			{ role: "user", content: "Tidy the working tree before you start." },
			{ role: "assistant", content: "Ran `git stash` to get a clean tree, then rebuilt." },
		],
		flags: {},
		input: "no — never run git stash here, you just wiped my other job's work",
		...overrides,
	};
}

/**
 * Stub host. `spaces` is an in-memory Space keyed by name, so a test can assert on
 * what the hook actually filed rather than on the calls it made.
 */
function makeHost({ reply = "", prefs = {}, docs = [], stored = {} } = {}) {
	const state = {
		sideModelCalls: [],
		docs: docs.map((d) => ({ ...d })),
		ensured: [],
		deleted: [],
		stored: { ...stored },
		logs: [],
	};
	let nextId = state.docs.length + 1;
	const host = {
		state,
		sideModel: async (args) => {
			state.sideModelCalls.push(args);
			return typeof reply === "function" ? reply(args) : reply;
		},
		getPreference: async ({ key }) =>
			Object.hasOwn(prefs, key) ? prefs[key] : null,
		spaces: {
			ensureSpace: async (args) => {
				state.ensured.push(args);
				return "space-" + String(args.name).toLowerCase();
			},
			listDocs: async () => state.docs.map((d) => ({ ...d })),
			createDoc: async ({ title }) => {
				const id = "doc-" + String(nextId++);
				state.docs.unshift({ id, title, updated_at: nextId, source: "" });
				return id;
			},
			updateDoc: async ({ doc_id, title, source }) => {
				const doc = state.docs.find((d) => d.id === doc_id);
				if (doc) {
					doc.title = title ?? doc.title;
					doc.source = source;
				}
				return true;
			},
			deleteDoc: async ({ doc_id }) => {
				state.deleted.push(doc_id);
				state.docs = state.docs.filter((d) => d.id !== doc_id);
				return true;
			},
		},
		storage: {
			get: async (k) => state.stored[k] ?? null,
			set: async (k, v) => {
				state.stored[k] = typeof v === "string" ? v : JSON.stringify(v);
				return true;
			},
			delete: async (k) => {
				delete state.stored[k];
				return true;
			},
		},
		log: (...a) => state.logs.push(a),
	};
	return host;
}

const RULE_REPLY = JSON.stringify({
	verdict: "rule",
	rule: "Never run `git stash` in this repo — the working tree is shared.",
	why: "A stash reverted another job's uncommitted files.",
});

test("manifest.json is valid JSON with id/name/version", () => {
	const m = parseManifest();
	assert.equal(m.id, PLUGIN_ID);
	assert.ok(m.name.length > 0);
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("declared contributes fields are well-formed", () => {
	const m = parseManifest();

	// Every host family the hooks reach for must be granted, or the calls 403 at
	// the bridge and the plugin is silently inert.
	for (const grant of [
		"hook:side-model",
		"storage:kv",
		"preferences:read",
		"spaces:docs",
	]) {
		assert.ok(
			m.permission_grants.includes(grant),
			`must grant ${grant}`
		);
	}

	const hooks = m.contributes.turn_hooks;
	assert.equal(hooks.length, 3);

	const capture = hooks.find((h) => h.id === "no-more-mistakes.capture");
	assert.equal(capture.on, "pre_user_turn");
	assert.equal(capture.match, undefined, "capture cannot be match-gated");

	const brief = hooks.find((h) => h.id === "no-more-mistakes.brief");
	assert.equal(brief.on, "session_start");

	const command = hooks.find((h) => h.id === "no-more-mistakes.command");
	assert.equal(command.on, "pre_user_turn");
	assert.deepEqual(command.match.commands, ["/mistakes"]);

	// The settings the hooks read by key.
	const keys = m.contributes.settings_tabs[0].fields.map((f) => f.pref_key);
	assert.deepEqual(keys, [
		"mistakes-capture",
		"mistakes-brief",
		"mistakes-space",
		"mistakes-brief-max",
		"mistakes-model",
	]);
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}

	// A resurrected fixture copy would WIN for any include_str! still pointing at
	// fixtures/, making every edit here a dead edit.
	const stale = join(
		coreSrc,
		"plugin_manifest",
		"fixtures",
		"no-more-mistakes.manifest.json"
	);
	assert.ok(!existsSync(stale), `${stale} duplicates this manifest — delete it.`);

	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/no-more-mistakes/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);

	// Each hook body needs its own row in the hand-written embed table, or the
	// `code_file` cannot be resolved on a machine that has no package directory.
	const embeds = readFileSync(
		join(coreSrc, "plugin_manifest", "builtin_code.rs"),
		"utf8"
	);
	for (const file of ["capture.js", "brief.js", "command.js"]) {
		assert.ok(
			embeds.includes(
				`include_str!("../../../../plugins-store/plugins/no-more-mistakes/hooks/${file}")`
			),
			`hooks/${file} is not embedded in builtin_code.rs — it would not resolve at runtime`
		);
	}

	// Tier list: compiled-in but absent from CORE_PLUGINS means not installable,
	// and nothing else fails when it is missing.
	const builtins = readFileSync(join(coreSrc, "plugins", "builtins.rs"), "utf8");
	assert.ok(
		builtins.includes(`"${PLUGIN_ID}"`),
		"plugin id is missing from the Core tier lists (plugins/builtins.rs)"
	);
});

// ── capture ──────────────────────────────────────────────────────────────────

test("capture ignores an ordinary message without spending anything", async () => {
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.capture");
	const host = makeHost({ reply: RULE_REPLY });
	const directive = await run(
		makeCtx({ input: "can you add a test for the parser?" }),
		host
	);
	assert.deepEqual(directive, { kind: "none" });
	assert.equal(host.state.sideModelCalls.length, 0);
	assert.equal(host.state.ensured.length, 0, "must not even open the Space");
});

test("capture ignores a slash command", async () => {
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.capture");
	const host = makeHost({ reply: RULE_REPLY });
	assert.deepEqual(
		await run(makeCtx({ input: "/mistakes forget 2" }), host),
		{ kind: "none" }
	);
	assert.equal(host.state.sideModelCalls.length, 0);
});

test("capture ignores a correction with no answer behind it", async () => {
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.capture");
	const host = makeHost({ reply: RULE_REPLY });
	const ctx = makeCtx({ transcript: [{ role: "user", content: "hello?" }] });
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.state.sideModelCalls.length, 0);
});

test("capture is off when the setting is off, and when the chat is muted", async () => {
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.capture");

	const offHost = makeHost({
		reply: RULE_REPLY,
		prefs: { "mistakes-capture": "false" },
	});
	assert.deepEqual(await run(makeCtx(), offHost), { kind: "none" });
	assert.equal(offHost.state.sideModelCalls.length, 0);

	const mutedHost = makeHost({
		reply: RULE_REPLY,
		stored: { "conv-123": JSON.stringify({ muted: true }) },
	});
	assert.deepEqual(await run(makeCtx(), mutedHost), { kind: "none" });
	assert.equal(mutedHost.state.sideModelCalls.length, 0);
});

test("capture files the rule as a Space document and injects it", async () => {
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.capture");
	const host = makeHost({ reply: RULE_REPLY });
	const directive = await run(makeCtx(), host);

	assert.equal(directive.kind, "inject");
	assert.ok(
		directive.text.includes("Never run `git stash` in this repo"),
		"the injected text carries the rule"
	);

	// One document, titled with the rule, bodied with the evidence.
	assert.equal(host.state.docs.length, 1);
	const doc = host.state.docs[0];
	assert.equal(doc.title, "Never run `git stash` in this repo — the working tree is shared");
	assert.ok(doc.source.includes("**Why:**"));
	assert.ok(doc.source.includes("A stash reverted another job's uncommitted files"));
	assert.ok(doc.source.includes("conv-123"));

	// The extraction call is pointed at the configurable model and carries both
	// halves of the exchange.
	assert.equal(host.state.sideModelCalls.length, 1);
	const args = host.state.sideModelCalls[0];
	assert.equal(args.model_pref_key, "mistakes-model");
	assert.ok(args.prompt.includes("git stash"));
	assert.ok(args.prompt.includes("never run git stash here"));
});

test("capture files nothing on a `none` or duplicate verdict", async () => {
	const m = parseManifest();

	const noneHost = makeHost({ reply: JSON.stringify({ verdict: "none" }) });
	assert.deepEqual(
		await loadHookRunner(m, "no-more-mistakes.capture")(makeCtx(), noneHost),
		{ kind: "none" }
	);
	assert.equal(noneHost.state.docs.length, 0);

	const dupeHost = makeHost({
		reply: JSON.stringify({ verdict: "duplicate" }),
		docs: [{ id: "doc-1", title: "Never run git stash in this repo" }],
	});
	assert.deepEqual(
		await loadHookRunner(m, "no-more-mistakes.capture")(makeCtx(), dupeHost),
		{ kind: "none" }
	);
	assert.equal(dupeHost.state.docs.length, 1);
});

test("capture re-files nothing when the model reproposes an existing rule", async () => {
	// The model is asked to say `duplicate`; the code-side pass is what catches it
	// when the model reworded it into the same rule anyway.
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.capture");
	const host = makeHost({
		reply: RULE_REPLY,
		docs: [
			{
				id: "doc-1",
				title: "never run GIT STASH in this repo the working tree is shared!",
			},
		],
	});
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.state.docs.length, 1, "no second copy of the same rule");
});

test("capture survives a model that answers with prose around the JSON", async () => {
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.capture");
	const host = makeHost({
		reply: "```json\n" + RULE_REPLY + "\n```",
	});
	const directive = await run(makeCtx(), host);
	assert.equal(directive.kind, "inject");
	assert.equal(host.state.docs.length, 1);
});

test("capture fails open when the Space cannot be reached", async () => {
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.capture");
	const host = makeHost({ reply: RULE_REPLY });
	host.spaces.ensureSpace = async () => {
		throw new Error("no space store");
	};
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.state.sideModelCalls.length, 0);
});

// ── brief ────────────────────────────────────────────────────────────────────

test("brief injects the rules, newest first, capped by the setting", async () => {
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.brief");
	const host = makeHost({
		prefs: { "mistakes-brief-max": "2" },
		docs: [
			{ id: "d1", title: "Rule one" },
			{ id: "d2", title: "Rule two" },
			{ id: "d3", title: "Rule three" },
		],
	});
	const directive = await run({ conversation_id: "conv-9" }, host);

	assert.equal(directive.kind, "inject");
	assert.ok(directive.text.includes("1. Rule one"));
	assert.ok(directive.text.includes("2. Rule two"));
	assert.ok(!directive.text.includes("Rule three"), "capped at 2");
});

test("brief says nothing when there are no rules, or when it is off", async () => {
	const m = parseManifest();

	const emptyHost = makeHost({ docs: [] });
	assert.deepEqual(
		await loadHookRunner(m, "no-more-mistakes.brief")({}, emptyHost),
		{ kind: "none" }
	);

	const offHost = makeHost({
		prefs: { "mistakes-brief": "false" },
		docs: [{ id: "d1", title: "Rule one" }],
	});
	assert.deepEqual(
		await loadHookRunner(m, "no-more-mistakes.brief")({}, offHost),
		{ kind: "none" }
	);
	assert.equal(offHost.state.ensured.length, 0, "off must not open the Space");
});

// ── command ──────────────────────────────────────────────────────────────────

test("/mistakes lists the rules and never reaches the model", async () => {
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.command");
	const host = makeHost({
		docs: [
			{ id: "d1", title: "Rule one" },
			{ id: "d2", title: "Rule two" },
		],
	});
	const directive = await run(makeCtx({ input: "/mistakes" }), host);

	assert.equal(directive.kind, "handled");
	assert.ok(directive.text.includes("1. Rule one"));
	assert.ok(directive.text.includes("2. Rule two"));
	assert.equal(host.state.sideModelCalls.length, 0);
});

test("/mistakes declines a command it was not addressed by", async () => {
	const run = loadHookRunner(parseManifest(), "no-more-mistakes.command");
	const host = makeHost({ docs: [{ id: "d1", title: "Rule one" }] });
	// The Rust pre-gate is a prefix test, so this reaches the hook.
	assert.deepEqual(
		await run(makeCtx({ input: "/mistakesomething else" }), host),
		{ kind: "none" }
	);
});

test("/mistakes add records a rule, and refuses to record it twice", async () => {
	const m = parseManifest();
	const host = makeHost({ docs: [] });

	const first = await loadHookRunner(m, "no-more-mistakes.command")(
		makeCtx({ input: "/mistakes add Never edit files under vendor/" }),
		host
	);
	assert.equal(first.kind, "handled");
	assert.equal(host.state.docs.length, 1);
	assert.equal(host.state.docs[0].title, "Never edit files under vendor/");

	const second = await loadHookRunner(m, "no-more-mistakes.command")(
		makeCtx({ input: "/mistakes add never edit FILES under vendor/." }),
		host
	);
	assert.ok(second.text.startsWith("Already on the list"));
	assert.equal(host.state.docs.length, 1);
});

test("/mistakes forget deletes by number and refuses anything else", async () => {
	const m = parseManifest();
	const host = makeHost({
		docs: [
			{ id: "d1", title: "Rule one" },
			{ id: "d2", title: "Rule two" },
		],
	});

	const bad = await loadHookRunner(m, "no-more-mistakes.command")(
		makeCtx({ input: "/mistakes forget stash" }),
		host
	);
	assert.ok(bad.text.includes("Which one?"));
	assert.equal(host.state.deleted.length, 0);

	const ok = await loadHookRunner(m, "no-more-mistakes.command")(
		makeCtx({ input: "/mistakes forget 2" }),
		host
	);
	assert.ok(ok.text.includes("Rule two"));
	assert.deepEqual(host.state.deleted, ["d2"]);
});

test("/mistakes off mutes this conversation, and capture then stays quiet", async () => {
	const m = parseManifest();
	const host = makeHost({ reply: RULE_REPLY });

	const muted = await loadHookRunner(m, "no-more-mistakes.command")(
		makeCtx({ input: "/mistakes off" }),
		host
	);
	assert.equal(muted.kind, "handled");
	assert.equal(JSON.parse(host.state.stored["conv-123"]).muted, true);

	// The mute is what the capture hook reads, so the two hooks agree.
	assert.deepEqual(
		await loadHookRunner(m, "no-more-mistakes.capture")(makeCtx(), host),
		{ kind: "none" }
	);
	assert.equal(host.state.sideModelCalls.length, 0);

	const unmuted = await loadHookRunner(m, "no-more-mistakes.command")(
		makeCtx({ input: "/mistakes on" }),
		host
	);
	assert.equal(unmuted.kind, "handled");
	assert.equal(JSON.parse(host.state.stored["conv-123"]).muted, false);
});
