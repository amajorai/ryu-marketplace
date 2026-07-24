// Co-located unit test for the `hook-session-context` plugin.
//
// Zero-dependency, runnable with `node --test plugin.test.mjs`.
//
// This is an INLINE-HOOK plugin: its only contribution is a `turn_hooks` entry
// whose `code` string is JS the Core plugin sandbox executes. Core wraps that
// string in an async IIFE with `ctx` + a `host` capability facade in scope, and a
// bare `return` inside the body reports the directive (see
// apps/core/src/plugin_host/mod.rs `build_hook_program`). So the meaningful test
// is to EXTRACT the hook code and ACTUALLY RUN it against a realistic mock ctx,
// then assert the returned directive matches the hook's logic.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "plugin.json");
const rawManifest = readFileSync(manifestPath, "utf8");

// Valid HookDirective kinds Core's serde enum accepts
// (apps/core/src/plugin_host/mod.rs `enum HookDirective`).
const VALID_KINDS = new Set(["none", "note", "continue", "replace", "inject"]);

// AsyncFunction constructor — lets us run the hook body exactly like Core's
// sandbox: `ctx` and `host` in scope, a bare `return` yields the directive.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** Parse the manifest fresh for each test (cheap, avoids shared mutation). */
function manifest() {
	return JSON.parse(rawManifest);
}

/** A realistic mock hook ctx mirroring Core's `HookContext` serde shape. */
function mockCtx(overrides = {}) {
	return {
		conversation_id: "conv-test-1",
		agent_id: "ryu",
		flags: {},
		transcript: [
			{ role: "user", content: "what's due today?" },
			{ role: "assistant", content: "Let me check." },
		],
		...overrides,
	};
}

/** A `host` stub mirroring the capability facade Core injects. */
function mockHost() {
	const calls = { sideModel: [], log: [] };
	return {
		calls,
		host: {
			sideModel: async (args) => {
				calls.sideModel.push(args);
				return "canned-side-model-response";
			},
			runAgent: async () => "canned-agent-response",
			storage: {
				get: async () => null,
				set: async () => true,
				delete: async () => true,
				keys: async () => [],
			},
			log: (...a) => {
				calls.log.push(a);
			},
		},
	};
}

/** Run an inline hook's `code` string the way Core's sandbox does. */
async function runHook(code, ctx, host) {
	const fn = new AsyncFunction("ctx", "host", code);
	return await fn(ctx, host);
}

// ── Manifest shape (ALWAYS) ────────────────────────────────────────────────

test("plugin.json is valid JSON and re-serializes stably", () => {
	const m = manifest();
	assert.equal(typeof m, "object");
	assert.ok(m !== null);
	// Round-trips without throwing.
	assert.doesNotThrow(() => JSON.parse(JSON.stringify(m)));
});

test("has non-empty string id / name / version", () => {
	const m = manifest();
	for (const key of ["id", "name", "version"]) {
		assert.equal(typeof m[key], "string", `${key} must be a string`);
		assert.ok(m[key].length > 0, `${key} must be non-empty`);
	}
	assert.equal(m.id, "com.ryuhq.session-context");
	assert.equal(m.name, "Session Context");
	// Semver-ish version.
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test("id is reverse-domain form", () => {
	const m = manifest();
	assert.match(m.id, /^[a-z0-9]+(\.[a-z0-9-]+)+$/);
});

test("declares no runnables / grants and activates on '*'", () => {
	const m = manifest();
	// A pure inline-hook plugin: no out-of-process runnables, no grants.
	assert.deepEqual(m.runnables, []);
	assert.deepEqual(m.permission_grants, []);
	assert.deepEqual(m.activation_events, ["*"]);
});

test("declares NO mcp_servers / http-tool / command-tool / secret_headers", () => {
	// This plugin is inline-only; none of the sidecar/tool families should
	// appear. Guards against a future edit silently adding an unvetted surface.
	const m = manifest();
	assert.equal(m.mcp_servers, undefined);
	assert.equal(m.secret_headers, undefined);
	for (const r of m.runnables) {
		assert.notEqual(r.kind, "http");
		assert.notEqual(r.kind, "command");
	}
});

test("contributes exactly one well-formed turn hook", () => {
	const m = manifest();
	assert.ok(m.contributes, "contributes must be present");
	const hooks = m.contributes.turn_hooks;
	assert.ok(Array.isArray(hooks), "turn_hooks must be an array");
	assert.equal(hooks.length, 1);
	const h = hooks[0];
	assert.equal(typeof h.id, "string");
	assert.ok(h.id.length > 0);
	assert.equal(h.id, "session-context.start");
	assert.equal(h.on, "session_start");
	assert.equal(typeof h.code, "string");
	assert.ok(h.code.length > 0);
});

// ── Byte-identity with the Core fixture (only when Core tree is present) ────

test("plugin.json is byte-identical to the Core fixture when present", () => {
	// Satellites ship without apps/core, so this is a best-effort guard: only
	// asserts when the monorepo fixture is reachable.
	const fixturePath = join(
		here,
		"..",
		"..",
		"apps",
		"core",
		"src",
		"plugin_manifest",
		"fixtures",
		"hook-session-context.plugin.json"
	);
	let fixture;
	try {
		fixture = readFileSync(fixturePath, "utf8");
	} catch {
		return; // Core tree absent (satellite build): nothing to compare.
	}
	assert.equal(
		rawManifest,
		fixture,
		"plugin.json and the Core fixture must be byte-identical"
	);
});

// ── INLINE HOOK: extract the code and ACTUALLY RUN it ──────────────────────

test("session_start hook returns an inject directive", async () => {
	const m = manifest();
	const { code } = m.contributes.turn_hooks[0];
	const { host } = mockHost();
	const directive = await runHook(code, mockCtx(), host);

	assert.equal(typeof directive, "object");
	assert.ok(directive !== null);
	assert.ok(
		VALID_KINDS.has(directive.kind),
		`kind '${directive.kind}' must be a valid HookDirective kind`
	);
	assert.equal(directive.kind, "inject");
	assert.equal(typeof directive.text, "string");
	assert.ok(directive.text.length > 0);
});

test("injected text carries a valid, current ISO timestamp", async () => {
	const m = manifest();
	const { code } = m.contributes.turn_hooks[0];
	const { host } = mockHost();

	const before = Date.now();
	const directive = await runHook(code, mockCtx(), host);
	const after = Date.now();

	// Pull the ISO-8601 timestamp back out of the injected text.
	const match = directive.text.match(
		/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/
	);
	assert.ok(match, "injected text must contain an ISO-8601 timestamp");
	const parsed = Date.parse(match[0]);
	assert.ok(Number.isFinite(parsed), "embedded timestamp must be parseable");
	// The hook builds `new Date().toISOString()`, so the stamp must fall inside
	// the wall-clock window that bracketed the call.
	assert.ok(
		parsed >= before - 1000 && parsed <= after + 1000,
		`timestamp ${match[0]} must be ~now`
	);
});

test("injected text includes the recency-guidance phrasing", async () => {
	const m = manifest();
	const { code } = m.contributes.turn_hooks[0];
	const { host } = mockHost();
	const directive = await runHook(code, mockCtx(), host);

	assert.match(directive.text, /Session context \(auto-added\)/);
	assert.match(directive.text, /current date and time/i);
	// The literal double-quoted word "today" survives JSON escaping.
	assert.ok(
		directive.text.includes('"today"'),
		'text should reference "today"'
	);
});

test("hook is deterministic in shape across varied ctx / does not touch host", async () => {
	const m = manifest();
	const { code } = m.contributes.turn_hooks[0];

	// Empty transcript + flags on: the hook ignores ctx entirely, so the
	// directive shape must not change and no host capability may be invoked.
	const h1 = mockHost();
	const d1 = await runHook(
		code,
		mockCtx({ transcript: [], flags: { "com.ryuhq.session-context": true } }),
		h1
	);
	assert.equal(d1.kind, "inject");
	assert.equal(h1.calls.sideModel.length, 0, "hook must not call host.sideModel");

	// Missing conversation_id (global dispatch path): still yields inject.
	const h2 = mockHost();
	const d2 = await runHook(code, mockCtx({ conversation_id: undefined }), h2);
	assert.equal(d2.kind, "inject");
});
