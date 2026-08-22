// Co-located contract test for the `shadow` plugin.
// Runner: `node --test` (zero dependencies).
//
// `shadow` is a declarative HTTP-tool plugin: it contributes four `tool`
// runnables (search, semantic search, timeline, recent-context) that Core
// proxies to the device-local Shadow sidecar on 127.0.0.1:7980 under
// `/api/shadow/*`, injecting a server-side Authorization bearer. There are no
// inline turn-hook `code` strings to execute, so this test validates the
// manifest contract and the byte-identical Core fixture registration seam.
// See notes in the task report.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const raw = readFileSync(manifestPath, "utf8");

const EXPECTED_SLUGS = [
	"shadow.search",
	"shadow.semantic_search",
	"shadow.timeline",
	"shadow.recent_context",
];

test("manifest.json is valid parseable JSON", () => {
	assert.doesNotThrow(() => JSON.parse(raw));
});

const manifest = JSON.parse(raw);

test("has required top-level identity fields", () => {
	assert.equal(manifest.id, "@ryu/shadow");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.equal(manifest.name, "Shadow");
	// semantic-ish version string
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("contributes exactly four http GET tool runnables", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 4);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(typeof r.id, "string");
		assert.equal(typeof r.name, "string");
		assert.equal(r.config.backend, "http");
		assert.equal(r.config.method, "GET");
	}
});

// Index runnables by their native tool slug for precise assertions.
const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("exposes the four native shadow.* tool ids, each namespaced", () => {
	for (const slug of EXPECTED_SLUGS) {
		assert.ok(bySlug.has(slug), `missing ${slug} slug`);
	}
	assert.equal(bySlug.size, EXPECTED_SLUGS.length);
	for (const slug of bySlug.keys()) {
		assert.ok(slug.startsWith("shadow."), `slug ${slug} not namespaced`);
	}
});

test("every tool carries a SERVER-SIDE Authorization secret header from env", () => {
	for (const r of manifest.runnables) {
		const sh = r.config.secret_headers;
		assert.ok(sh, `${r.config.slug} missing secret_headers`);
		// Key insight: the bearer lives in secret_headers (server-side injection by
		// Core's /api/shadow/* proxy), references an env var, and is never a literal
		// token baked into the manifest.
		assert.equal(sh.Authorization, "Bearer env:RYU_TOKEN");
		assert.match(sh.Authorization, /env:/);
		assert.doesNotMatch(sh.Authorization, /Bearer\s+[A-Za-z0-9_-]{16,}$/);
	}
});

test("every tool targets Core's own loopback surface under /api/shadow", () => {
	for (const r of manifest.runnables) {
		const u = new URL(r.config.url);
		// `core:` is resolved by Core at call time to this PROFILE's loopback origin.
		// Hardcoding `http://127.0.0.1:7980` here was wrong on every profile but
		// `release` — under `bun dev` Core binds 8980, so the tool reached nothing,
		// or worse, a release-profile Core running alongside it.
		assert.equal(
			u.protocol,
			"core:",
			`${r.config.slug} must address Core through the profile-resolved core: scheme`
		);
		assert.ok(
			u.pathname.startsWith("/api/shadow/"),
			`${r.config.slug} path ${u.pathname} not under /api/shadow/`
		);
	}
});

test("each tool routes to its expected Shadow sidecar path", () => {
	const pathBySlug = {
		"shadow.search": "/api/shadow/search",
		"shadow.semantic_search": "/api/shadow/search/semantic",
		"shadow.timeline": "/api/shadow/timeline",
		"shadow.recent_context": "/api/shadow/context/recent",
	};
	for (const [slug, path] of Object.entries(pathBySlug)) {
		assert.equal(new URL(bySlug.get(slug).config.url).pathname, path);
	}
});

test("every tool is a fail_open, unwrap_body proxy", () => {
	// Cross-platform capture: when the sidecar is down the tool must fail open
	// (report unavailable) rather than error the whole turn.
	for (const r of manifest.runnables) {
		assert.equal(r.config.fail_open, true, `${r.config.slug} not fail_open`);
		assert.equal(
			r.config.unwrap_body,
			true,
			`${r.config.slug} not unwrap_body`
		);
	}
});

test("search + semantic-search require q; a positive-int limit is optional", () => {
	for (const slug of ["shadow.search", "shadow.semantic_search"]) {
		const s = bySlug.get(slug).config.input_schema;
		assert.equal(s.type, "object");
		assert.equal(s.properties.q.type, "string");
		assert.deepEqual(s.required, ["q"]);
		assert.equal(s.properties.limit.type, "integer");
		assert.equal(s.properties.limit.minimum, 1);
	}
});

test("timeline requires an explicit integer [start, end] range", () => {
	const s = bySlug.get("shadow.timeline").config.input_schema;
	assert.equal(s.type, "object");
	assert.equal(s.properties.start.type, "integer");
	assert.equal(s.properties.end.type, "integer");
	assert.deepEqual(s.required, ["start", "end"]);
});

test("recent-context takes an optional positive-int minute window and requires nothing", () => {
	const cfg = bySlug.get("shadow.recent_context").config;
	const s = cfg.input_schema;
	assert.equal(s.type, "object");
	assert.equal(s.properties.q.type, "integer");
	assert.equal(s.properties.q.minimum, 1);
	// No required keys: Shadow defaults the window when q is omitted.
	assert.ok(!("required" in s) || s.required.length === 0);
});

test("required schema keys are actually declared in properties", () => {
	for (const r of manifest.runnables) {
		const sch = r.config.input_schema;
		const required = Array.isArray(sch.required) ? sch.required : [];
		for (const key of required) {
			assert.ok(
				Object.hasOwn(sch.properties, key),
				`${r.config.slug}: required key ${key} not in properties`
			);
		}
	}
});

test("permission_grants gate egress to loopback only, matching called hosts", () => {
	assert.ok(Array.isArray(manifest.permission_grants));
	assert.deepEqual(manifest.permission_grants, ["tool:http-egress:127.0.0.1"]);
	// A `core:` url resolves to `http://127.0.0.1:<profile port>` at call time, so
	// loopback is the host the egress gate actually sees — the grant above is the one
	// that governs these tools.
	for (const r of manifest.runnables) {
		assert.equal(
			new URL(r.config.url).protocol,
			"core:",
			`${r.config.slug} should address Core via core:, whose resolved host is 127.0.0.1`
		);
	}
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(here, "..", "..", "..", "apps", "core", "src");
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
		"shadow.manifest.json"
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
			'include_str!("../../../../plugins-store/plugins/shadow/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});
