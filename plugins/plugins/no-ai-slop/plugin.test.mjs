// Co-located, zero-dependency test for the `no-ai-slop` plugin.
// Run with:  node --test plugins-store/plugins/no-ai-slop/plugin.test.mjs
//
// The plugin's behaviour lives entirely in `hooks/review.js`, which Core hydrates
// into `contributes.turn_hooks[0].code` and runs in a sandbox with an injected
// `ctx` and a `host` facade (apps/core/src/plugin_host/mod.rs, build_hook_program).
// This test extracts that exact string and RUNS it against a realistic mock ctx
// plus a stub host, asserting the returned directive. It never edits manifest.json.
//
// The load-bearing case is the loop guard: this hook returns `continue`, which
// injects a user turn, which runs another assistant turn, which fires this same
// hook. `hook stops once the pass budget is spent` is the test that keeps that
// from being infinite.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const FLAG = "io.ryu.no-ai-slop";
const MARKER = "No-AI-slop review (pass";

const raw = readFileSync(MANIFEST_PATH, "utf8");

// ── code_file hydration ───────────────────────────────────────────────────────
// This plugin keeps its sandboxed JS in a real file (`hooks/review.js`) and
// references it from the manifest by `code_file`. Core resolves that into the
// inline `code` string at parse time (`PluginManifest::hydrate_code_files`), so
// every consumer — including the sandbox — only ever sees `code`. Mirror that
// here, or the assertions below would read an empty body and silently pass.
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

function loadHookRunner(manifest) {
	const hook = manifest.contributes.turn_hooks[0];
	const fn = new AsyncFunction("ctx", "host", hook.code);
	return (ctx, host) => fn(ctx, host);
}

// A draft long enough to clear the 240-character prose floor.
const SLOPPY = [
	"It's worth noting that this is not just a refactor, it's a paradigm shift.",
	"Here's the thing: the module leverages a robust, cutting-edge pipeline that",
	"empowers the team to streamline delivery, underscoring our commitment to",
	"quality. Experts agree this marks a pivotal moment. At the end of the day,",
	"the code speaks for itself.",
].join(" ");

function makeCtx(overrides = {}) {
	return {
		conversation_id: "conv-123",
		agent_id: "ryu",
		transcript: [
			{ role: "user", content: "Summarise the refactor." },
			{ role: "assistant", content: SLOPPY },
		],
		flags: {},
		input: null,
		...overrides,
	};
}

/** A user turn shaped exactly like the one this hook injects. */
const injected = (n, of_) =>
	`${MARKER} ${n} of ${of_}) — a separate reviewer read your last answer with a fresh context and flagged the AI-slop patterns below.\n\nSLOP: found\n- "paradigm shift" — banned word.`;

// Stub host: records runAgent calls, serves preferences from a plain object.
function makeHost(reply, prefs = {}) {
	const calls = [];
	return {
		calls,
		prefs,
		getPreference: async ({ key }) =>
			Object.hasOwn(prefs, key) ? prefs[key] : null,
		runAgent: async (args) => {
			calls.push(args);
			return typeof reply === "function" ? reply(args) : reply;
		},
		log: () => {},
	};
}

const FOUND = 'SLOP: found\n- "paradigm shift" — banned word. Cut it.';

test("manifest.json is valid JSON with id/name/version", () => {
	const m = parseManifest();
	assert.equal(typeof m, "object");
	assert.equal(m.id, "@ryu/no-ai-slop");
	assert.equal(typeof m.name, "string");
	assert.ok(m.name.length > 0);
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("declared contributes fields are well-formed", () => {
	const m = parseManifest();

	// grants required to reach host.runAgent and host.getPreference
	assert.ok(
		Array.isArray(m.permission_grants) &&
			m.permission_grants.includes("hook:run-agent") &&
			m.permission_grants.includes("preferences:read"),
		"must grant hook:run-agent and preferences:read"
	);

	// composer toggle drives the flag the hook reads. It must be a `toggle`:
	// plugin_flags is HashMap<String, bool> in Core, so a `select` control's
	// string value could never reach ctx.flags.
	const toggle = m.contributes.composer_controls[0];
	assert.equal(toggle.type, "toggle");
	assert.equal(toggle.flag, FLAG);

	const fields = m.contributes.settings_tabs[0].fields;
	const passes = fields.find((f) => f.pref_key === "no-ai-slop-passes");
	assert.equal(passes.type, "number");
	assert.equal(passes.default, 1);
	assert.equal(passes.min, 0);
	// Core caps a continue loop at MAX_CONTINUE_TURNS (25) for the whole
	// conversation; the field must not offer more than the hook clamps to.
	assert.ok(passes.max <= 12, "max passes must stay under Core's continue cap");

	const mode = fields.find((f) => f.pref_key === "no-ai-slop-mode");
	assert.equal(mode.type, "select");
	assert.deepEqual(
		mode.options.map((o) => o.value),
		["revise", "report"]
	);
	assert.equal(mode.default, "revise");

	// The hook fires on EVERY completed turn, so it carries no `match` gate.
	const hook = m.contributes.turn_hooks[0];
	assert.equal(hook.on, "post_assistant_turn");
	assert.ok(!("match" in hook), "no match gate: it must see every turn");
	assert.equal(typeof hook.code, "string");
	assert.ok(hook.code.includes("host.runAgent"));
});

test("the skill is bundled in the hook body, not read from disk", () => {
	const m = parseManifest();
	const { code } = m.contributes.turn_hooks[0];
	// A built-in ships only its manifest — its package dir is not on the user's
	// machine and the sandbox has no filesystem, so the rules must travel inside
	// the code. Spot-check the banned-word list and a named pattern.
	assert.ok(code.includes("paradigm shift"), "banned words are inlined");
	assert.ok(code.includes("Binary contrasts"), "patterns are inlined");
	assert.ok(
		!existsSync(join(HERE, "SKILL.md")),
		"a second copy of the rules would drift from the one the sandbox runs"
	);
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(HERE, "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}

	// There is no fixture COPY any more. A resurrected copy is a dead-edit trap:
	// the fixture would WIN for any include_str! still pointing at fixtures/.
	const stale = join(
		coreSrc,
		"plugin_manifest",
		"fixtures",
		"no-ai-slop.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory.`
	);

	// Registration seam 1: BUILTIN_MANIFESTS. Forgetting it leaves every other
	// guard passing while the plugin simply does not exist at runtime.
	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/no-ai-slop/manifest.json")'
		),
		"Core does not compile this manifest in from its package home"
	);

	// Registration seam 2: the hook body must be embedded too, or `code_file`
	// cannot resolve on a user's machine.
	const builtinCode = readFileSync(
		join(coreSrc, "plugin_manifest", "builtin_code.rs"),
		"utf8"
	);
	assert.ok(
		builtinCode.includes(
			'include_str!("../../../../plugins-store/plugins/no-ai-slop/hooks/review.js")'
		),
		"hooks/review.js is not embedded in builtin_code.rs"
	);

	// Registration seam 3: the installable/governed plugin list.
	const builtins = readFileSync(
		join(coreSrc, "plugins", "builtins.rs"),
		"utf8"
	);
	assert.ok(
		builtins.includes('"@ryu/no-ai-slop"'),
		"plugin is not listed in plugins/builtins.rs"
	);
});

test("hook returns {kind:'none'} when there is no assistant turn", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND);
	const ctx = makeCtx({ transcript: [{ role: "user", content: "hello?" }] });
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.length, 0, "no sub-agent for nothing to review");
});

test("short answers are skipped before any sub-agent spend", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND);
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "2+2?" },
			{ role: "assistant", content: "4." },
		],
	});
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.length, 0);
});

test("a code-only answer is skipped (prose floor ignores fences)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND);
	const patch = `Done.\n\n\`\`\`js\n${"const x = 1; // ".repeat(40)}\n\`\`\``;
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "patch it" },
			{ role: "assistant", content: patch },
		],
	});
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.calls.length, 0, "a patch has nothing for an editor to do");
});

test("passes = 0 disables automatic review", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND, { "no-ai-slop-passes": "0" });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.calls.length, 0);
});

test("the composer toggle still runs one pass when passes = 0", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND, { "no-ai-slop-passes": "0" });
	const directive = await run(makeCtx({ flags: { [FLAG]: true } }), host);
	assert.equal(directive.kind, "continue");
	assert.equal(host.calls.length, 1);
});

test("a clean verdict is silent", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("SLOP: none");
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.calls.length, 1);

	// an empty / null reviewer reply degrades the same way
	assert.deepEqual(await run(makeCtx(), makeHost("   ")), { kind: "none" });
	assert.deepEqual(await run(makeCtx(), makeHost(null)), { kind: "none" });
});

test("findings drive a continue that carries them and the marker", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND);
	const directive = await run(makeCtx(), host);

	assert.equal(directive.kind, "continue");
	assert.ok(directive.text.startsWith(`${MARKER} 1 of 1)`), directive.text);
	assert.ok(directive.text.includes("paradigm shift"), "carries the findings");

	const args = host.calls[0];
	assert.equal(args.preset, "summarise", "reviewer needs no tools");
	assert.equal(args.agent_id, "ryu");
	assert.ok(args.task.includes(SLOPPY), "reviewer sees the draft");
	assert.ok(
		args.task.includes("SLOP: none"),
		"reviewer is told the clean form"
	);
	assert.ok(
		!args.task.includes("Summarise the refactor."),
		"fresh context: the reviewer must not receive the conversation"
	);
});

test("hook stops once the pass budget is spent (the loop guard)", async () => {
	const run = loadHookRunner(parseManifest());
	const base = [
		{ role: "user", content: "Summarise the refactor." },
		{ role: "assistant", content: SLOPPY },
	];

	// One pass configured, one already spent → stop, and do NOT spend a reviewer.
	const host = makeHost(FOUND, { "no-ai-slop-passes": "1" });
	const spent = await run(
		makeCtx({
			transcript: [
				...base,
				{ role: "user", content: injected(1, 1) },
				{ role: "assistant", content: SLOPPY },
			],
		}),
		host
	);
	assert.deepEqual(spent, { kind: "none" });
	assert.equal(host.calls.length, 0, "a spent budget costs nothing");

	// Three configured: passes 2 and 3 still run, the fourth stops.
	const three = { "no-ai-slop-passes": "3" };
	const after = (n) => {
		const t = [...base];
		for (let i = 1; i <= n; i += 1) {
			t.push({ role: "user", content: injected(i, 3) });
			t.push({ role: "assistant", content: SLOPPY });
		}
		return makeCtx({ transcript: t });
	};
	const second = await run(after(1), makeHost(FOUND, three));
	assert.equal(second.kind, "continue");
	assert.ok(second.text.startsWith(`${MARKER} 2 of 3)`));

	const third = await run(after(2), makeHost(FOUND, three));
	assert.equal(third.kind, "continue");
	assert.ok(third.text.startsWith(`${MARKER} 3 of 3)`));

	assert.deepEqual(await run(after(3), makeHost(FOUND, three)), {
		kind: "none",
	});
});

test("the budget resets on the user's next real message", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND, { "no-ai-slop-passes": "1" });
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "Summarise the refactor." },
			{ role: "assistant", content: SLOPPY },
			{ role: "user", content: injected(1, 1) },
			{ role: "assistant", content: SLOPPY },
			// a real user turn: the scan must stop here, not keep counting back
			{ role: "user", content: "Now do the same for the parser." },
			{ role: "assistant", content: SLOPPY },
		],
	});
	const directive = await run(ctx, host);
	assert.equal(directive.kind, "continue");
	assert.ok(directive.text.startsWith(`${MARKER} 1 of 1)`));
});

test("an oversized passes setting clamps under Core's continue cap", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND, { "no-ai-slop-passes": "999" });
	const directive = await run(makeCtx(), host);
	assert.ok(directive.text.startsWith(`${MARKER} 1 of 12)`), directive.text);
});

test("report mode notes the findings and never continues", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND, { "no-ai-slop-mode": "report" });
	assert.deepEqual(await run(makeCtx(), host), { kind: "note", text: FOUND });
});

test("an unreadable preference falls back to one pass", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND);
	host.getPreference = async () => {
		throw new Error("preferences unavailable");
	};
	const directive = await run(makeCtx(), host);
	assert.equal(directive.kind, "continue");
	assert.ok(directive.text.startsWith(`${MARKER} 1 of 1)`));
});

test("JSON-quoted preference values are parsed", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost(FOUND, {
		"no-ai-slop-passes": '"2"',
		"no-ai-slop-mode": '"report"',
	});
	assert.deepEqual(await run(makeCtx(), host), { kind: "note", text: FOUND });
});
