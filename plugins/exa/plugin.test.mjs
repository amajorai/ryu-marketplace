// Co-located contract test for the `exa` plugin.
// Runner: `node --test` (zero dependencies).
//
// `exa` is a declarative HTTP-tool plugin: it contributes two `tool` runnables
// (search + find-similar) that Core proxies to https://api.exa.ai with a
// server-side Authorization header. There are no inline turn-hook `code`
// strings to execute, so this test validates the manifest contract and the
// byte-identical Core fixture registration seam. See notes in the task report.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const raw = readFileSync(manifestPath, "utf8");

// ── code_file hydration ───────────────────────────────────────────────────────
// This plugin keeps its sandboxed JS in real files (`hooks/*.js`, `adapters/*.js`)
// and references them from the manifest by `code_file`. Core resolves those into
// the inline `code` string at parse time (`PluginManifest::hydrate_code_files`),
// so every consumer — including the sandbox — only ever sees `code`. Mirror that
// here, or the assertions below would read an empty body and silently pass.
function hydrateCodeFiles(m) {
	const read = (rel) => readFileSync(join(here, rel), "utf8");
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

test("manifest.json is valid parseable JSON", () => {
	assert.doesNotThrow(() => JSON.parse(raw));
});

const manifest = parseManifest();

test("has required top-level identity fields", () => {
	assert.equal(manifest.id, "exa");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	// semantic-ish version string
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("declares an engines.ryu constraint", () => {
	assert.equal(typeof manifest.engines?.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
});

test("contributes exactly three http tool runnables", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 3);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(typeof r.id, "string");
		assert.equal(typeof r.name, "string");
		assert.equal(r.config.backend, "http");
		assert.equal(r.config.method, "POST");
	}
});

// Index runnables by their native tool slug for precise assertions.
const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("exposes the native tool ids exa__search and exa__find_similar", () => {
	assert.ok(bySlug.has("exa__search"), "missing exa__search slug");
	assert.ok(bySlug.has("exa__find_similar"), "missing exa__find_similar slug");
	// slugs are namespaced under the plugin id
	for (const slug of bySlug.keys()) {
		assert.ok(slug.startsWith("exa__"), `slug ${slug} not namespaced`);
	}
});

test("the KEYED tools carry a SERVER-SIDE Authorization secret header from env", () => {
	// exa__free_search deliberately has none: it is the no-key fallback, and
	// attaching a secret header to a public endpoint would leak the key to a host
	// that never needed it.
	assert.equal(bySlug.get("exa__free_search").config.secret_headers, undefined);
	for (const r of manifest.runnables) {
		if (r.config.slug === "exa__free_search") {
			continue;
		}
		const sh = r.config.secret_headers;
		assert.ok(sh, `${r.id} missing secret_headers`);
		// Key insight: the key lives in secret_headers (server-side injection),
		// NOT in the client-visible request, and references an env var — never a
		// literal token baked into the manifest.
		assert.equal(sh.Authorization, "Bearer env:RYU_EXA_API_KEY");
		assert.match(sh.Authorization, /env:/);
		assert.doesNotMatch(sh.Authorization, /Bearer\s+[A-Za-z0-9_-]{16,}$/);
	}
});

test("every tool targets an exa host over https", () => {
	const hosts = new Set();
	for (const r of manifest.runnables) {
		const u = new URL(r.config.url);
		assert.equal(u.protocol, "https:");
		hosts.add(u.hostname);
	}
	// Two DIFFERENT hosts: the keyed REST API, and the public MCP endpoint the
	// no-key fallback uses. Each needs its own egress grant.
	assert.deepEqual([...hosts].sort(), ["api.exa.ai", "mcp.exa.ai"]);
});

test("search tool routes to /search with sane body defaults", () => {
	const s = bySlug.get("exa__search");
	assert.equal(new URL(s.config.url).pathname, "/search");
	const bd = s.config.body_defaults;
	assert.equal(bd.num_results, 10);
	assert.equal(bd.use_autoprompt, true);
	assert.deepEqual(bd.contents, { text: true });
});

test("find-similar tool routes to /findSimilar with num_results default", () => {
	const f = bySlug.get("exa__find_similar");
	assert.equal(new URL(f.config.url).pathname, "/findSimilar");
	assert.equal(f.config.body_defaults.num_results, 10);
});

test("both tools are fail_open and unwrap_body proxies", () => {
	for (const r of manifest.runnables) {
		assert.equal(r.config.fail_open, true);
		assert.equal(r.config.unwrap_body, true);
	}
});

test("input schemas are well-formed JSON Schema objects with required keys", () => {
	const s = bySlug.get("exa__search").config.input_schema;
	assert.equal(s.type, "object");
	assert.equal(s.properties.query.type, "string");
	assert.deepEqual(s.required, ["query"]);
	// declared numeric bounds are coherent
	assert.equal(s.properties.num_results.type, "integer");
	assert.ok(
		s.properties.num_results.minimum <= s.properties.num_results.maximum
	);

	const f = bySlug.get("exa__find_similar").config.input_schema;
	assert.equal(f.type, "object");
	assert.equal(f.properties.url.type, "string");
	assert.deepEqual(f.required, ["url"]);
});

test("required schema properties are actually declared in properties", () => {
	for (const r of manifest.runnables) {
		const sch = r.config.input_schema;
		for (const key of sch.required) {
			assert.ok(
				Object.hasOwn(sch.properties, key),
				`${r.config.slug}: required key ${key} not in properties`
			);
		}
	}
});

test("permission_grants gate egress to the exa host only", () => {
	assert.ok(Array.isArray(manifest.permission_grants));
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:api.exa.ai",
		"tool:http-egress:mcp.exa.ai",
		// web__search is bound through an adapter (it falls back to the keyless
		// endpoint), and running adapter code is gated on this grant.
		"tool:execute",
	]);
	// the granted egress host matches the hosts the tools actually call
	const hosts = new Set(
		manifest.runnables.map((r) => new URL(r.config.url).hostname)
	);
	for (const h of hosts) {
		assert.ok(
			manifest.permission_grants.includes(`tool:http-egress:${h}`),
			`no egress grant for called host ${h}`
		);
	}
});

// --- BYOK settings tab -------------------------------------------------------
// The key is env-only at the tool layer (`env:RYU_EXA_API_KEY`). The settings tab
// is the ONLY UI a user has for it: a `secret` field whose pref_key is exactly
// that env var name, which the secret-header resolver falls back to when the
// process env has no such variable.

test("contributes exactly one settings tab, declarative and node-scoped", () => {
	const tabs = manifest.contributes?.settings_tabs;
	assert.ok(Array.isArray(tabs), "no contributes.settings_tabs");
	assert.equal(tabs.length, 1);
	const [tab] = tabs;
	assert.equal(tab.id, "exa.settings");
	assert.equal(typeof tab.title, "string");
	assert.ok(tab.title.length > 0);
	// The secret-header resolver runs in Core ON THE NODE, so it can only read a
	// node-scoped preference. A `user` (client-local) scope would be invisible to
	// it and the key would silently never apply.
	assert.equal(tab.scope, "node");
	// Declarative fields, not a bespoke component: `view` is the escape hatch for
	// rich app settings UIs and this tab must render through the shared renderer.
	assert.equal(tab.view, undefined);
	assert.equal(tab.fields.length, 1);
});

test("the settings field pref_key IS the env var the tools reference", () => {
	const field = manifest.contributes.settings_tabs[0].fields[0];
	assert.equal(field.type, "secret");
	// Derive the expected name from the manifest itself rather than restating a
	// literal — this is what actually catches a rename on one side only.
	const envVars = new Set(
		manifest.runnables
			.filter((r) => r.config.secret_headers)
			.map((r) => /env:(\w+)/.exec(r.config.secret_headers.Authorization)[1])
	);
	assert.equal(
		envVars.size,
		1,
		"tools disagree on which env var holds the key"
	);
	assert.equal(field.pref_key, [...envVars][0]);
});

test("the secret field carries a real label and a sourcing description", () => {
	const field = manifest.contributes.settings_tabs[0].fields[0];
	assert.equal(typeof field.label, "string");
	assert.ok(field.label.length > 0);
	assert.ok(
		field.description?.includes("https://"),
		"description must say where to get the key"
	);
	assert.match(field.description, /encrypted/i);
});

test("the secret field declares no bounds, default, or options", () => {
	const field = manifest.contributes.settings_tabs[0].fields[0];
	// `secret` is not a textual/numeric type, so the loader's bounds cross-check
	// rejects any of these outright. Asserting their absence stops one being
	// re-added later on the assumption it is inert.
	for (const key of [
		"min",
		"max",
		"min_length",
		"max_length",
		"default",
		"options",
	]) {
		assert.equal(field[key], undefined, `secret field must not declare ${key}`);
	}
	// The tools are fail_open: a missing key degrades, it does not error. Marking
	// the field required would contradict that and nag users who never selected
	// Exa as their web.search layer.
	assert.notEqual(field.required, true);
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(here, "..", "..", "apps", "core", "src");
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
		"exa.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory. Delete the fixture copy.`
	);

	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	// Registration seam: forgetting the include_str! leaves every other guard passing
	// while the plugin simply does not exist at runtime. Compiled in via BUILTIN_MANIFESTS.
	assert.ok(
		mod.includes('include_str!("../../../../plugins-store/exa/manifest.json")'),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});

// --- The no-key fallback (why exa can ship default-ON) -----------------------
// exa is the ONE search provider seeded enabled on a fresh install, so it has to
// return results with no credential at all. Exa's REST search needs a key; Exa's
// public MCP endpoint does not.

test("web__search is bound, and through an adapter", () => {
	const entry = (manifest.provides ?? []).find(
		(p) => p.capability === "web.search"
	);
	assert.ok(entry, "must provide web.search");
	assert.equal(entry.default, true, "exa is the declared default provider");
	const binding = entry.tools.web__search;
	assert.equal(binding.tool, "exa__search", "the KEYED tool is primary");
	assert.ok(binding.adapter, "the fallback cannot be expressed declaratively");
	// An adapter REPLACES the declarative mapping; keeping both would describe the
	// same transformation twice and only one would run.
	assert.equal(binding.args, undefined);
	assert.equal(binding.response, undefined);
	// The fallback target must be DECLARED or it is refused host-side at call time.
	assert.deepEqual(binding.adapter.tools, ["exa__free_search"]);
});

test("the fallback fires ONLY on a missing key, not on any failure", () => {
	// `fail_open` turns 401/403 into {available:false,...}, which IS the no-key
	// signal. Retrying on anything else would double every request during an
	// outage or a rate-limit, and would mask a broken key behind free-tier results.
	const code = manifest.provides.find((p) => p.capability === "web.search")
		.tools.web__search.adapter.code;
	assert.match(code, /keyed\.available === false/);
	assert.match(code, /return \{ raw: keyed \};/);
});

test("the free endpoint is called with the Accept header it requires", () => {
	// mcp.exa.ai answers 406 unless Accept names BOTH application/json and
	// text/event-stream. It is passed as a header_param, not a body field.
	const free = bySlug.get("exa__free_search").config;
	assert.deepEqual(free.header_params, ["Accept"]);
	assert.ok(free.input_schema.required.includes("Accept"));
	const code = manifest.provides.find((p) => p.capability === "web.search")
		.tools.web__search.adapter.code;
	assert.match(code, /Accept: "application\/json, text\/event-stream"/);
	// The endpoint accepts a STATELESS tools/call: no initialize, no session id.
	assert.match(code, /method: "tools\/call"/);
	assert.match(code, /name: "web_search_exa"/);
});

test("the adapter parses the SSE frame the endpoint actually returns", () => {
	// The reply is `event: message\ndata: {json}` with Content-Type
	// text/event-stream, so the http tool hands back a STRING, not JSON. Records
	// inside the payload text are separated by a `---` line.
	const code = manifest.provides.find((p) => p.capability === "web.search")
		.tools.web__search.adapter.code;
	assert.match(code, /typeof free !== "string"/);
	assert.match(code, /startsWith\("data: "\)/);
	assert.match(code, /split\(\/\\n-\{3,\}\\n\/\)/);
});
