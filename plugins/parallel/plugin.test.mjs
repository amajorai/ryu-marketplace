// Co-located contract test for the `parallel` plugin.
// Runner: `node --test` (zero dependencies).
//
// `parallel` is a declarative HTTP-tool plugin: it contributes three `tool`
// runnables (keyed search, keyless MCP search, extract) that Core proxies to
// Parallel with a server-side `x-api-key` header. There is no inline turn-hook
// `code`, so this test validates the manifest contract, the capability adapter,
// and the Core registration seam.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const raw = readFileSync(manifestPath, "utf8");

// ── code_file hydration ───────────────────────────────────────────────────────
// This plugin keeps its sandboxed JS in real files (`adapters/*.js`) and
// references them from the manifest by `code_file`. Core resolves those into the
// inline `code` string at parse time (`PluginManifest::hydrate_code_files`), so
// every consumer — including the sandbox — only ever sees `code`. Mirror that
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

/** The hydrated `web.search` adapter body, which several tests assert against. */
const adapterCode = () =>
	manifest.provides.find((p) => p.capability === "web.search").tools.web__search
		.adapter.code;

test("has required top-level identity fields", () => {
	assert.equal(manifest.id, "@ryu/parallel");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
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

test("exposes the native tool ids the bindings and adapter name", () => {
	for (const slug of [
		"parallel__search",
		"parallel__free_search",
		"parallel__extract",
	]) {
		assert.ok(bySlug.has(slug), `missing ${slug} slug`);
	}
	// slugs are namespaced under the plugin id
	for (const slug of bySlug.keys()) {
		assert.ok(slug.startsWith("parallel__"), `slug ${slug} not namespaced`);
	}
});

test("the KEYED tools carry a SERVER-SIDE x-api-key secret header from env", () => {
	// parallel__free_search deliberately has none: it is the no-key path, and
	// attaching a secret header to a public endpoint would leak the key to a host
	// that never needed it.
	assert.equal(
		bySlug.get("parallel__free_search").config.secret_headers,
		undefined
	);
	for (const r of manifest.runnables) {
		if (r.config.slug === "parallel__free_search") {
			continue;
		}
		const sh = r.config.secret_headers;
		assert.ok(sh, `${r.id} missing secret_headers`);
		// Parallel authenticates with `x-api-key`, NOT a bearer token. The key lives
		// in secret_headers (server-side injection), never in the client-visible
		// request, and references an env var — never a literal baked into the
		// manifest.
		assert.equal(sh["x-api-key"], "env:RYU_PARALLEL_API_KEY");
		assert.equal(sh.Authorization, undefined);
		assert.doesNotMatch(sh["x-api-key"], /^[A-Za-z0-9_-]{16,}$/);
	}
});

test("every tool targets a parallel.ai host over https", () => {
	const hosts = new Set();
	for (const r of manifest.runnables) {
		const u = new URL(r.config.url);
		assert.equal(u.protocol, "https:");
		hosts.add(u.hostname);
	}
	// Two DIFFERENT hosts: the keyed REST API, and the public Search MCP endpoint
	// the no-key path uses. Each needs its own egress grant.
	assert.deepEqual([...hosts].sort(), [
		"api.parallel.ai",
		"search.parallel.ai",
	]);
});

test("search routes to /v1/search, not the legacy beta path", () => {
	const s = bySlug.get("parallel__search");
	// `/v1beta/search` is the LEGACY endpoint and still answers; pinning v1 is what
	// stops a copy-paste from the older docs regressing this silently.
	assert.equal(new URL(s.config.url).pathname, "/v1/search");
	assert.equal(s.config.body_defaults.mode, "basic");
});

test("extract routes to /v1/extract and asks for full page content", () => {
	const e = bySlug.get("parallel__extract");
	assert.equal(new URL(e.config.url).pathname, "/v1/extract");
	// Parallel returns objective-focused EXCERPTS by default and full markdown only
	// when asked. The declarative `web.extract` binding maps `content` <- the
	// per-result `full_content` field, which is null unless this default is sent.
	assert.deepEqual(e.config.body_defaults, {
		advanced_settings: { full_content: true },
	});
	// And `advanced_settings` is deliberately NOT in the input schema. Core's
	// `deep_merge_json` lets the model WIN every collision, and its leaf case is a
	// plain overwrite — so a model sending `advanced_settings: null` (legal in
	// Parallel's own schema, which types it `anyOf [object, null]`) would replace
	// the default outright, silently reverting to excerpt mode and leaving the
	// canonical `content` null. Not exposing the key is what makes that
	// unreachable; exposing it later needs an adapter, not a schema line.
	assert.equal(e.config.input_schema.properties.advanced_settings, undefined);
});

test("all three tools are fail_open and unwrap_body proxies", () => {
	for (const r of manifest.runnables) {
		assert.equal(r.config.fail_open, true);
		assert.equal(r.config.unwrap_body, true);
	}
});

test("no tool declares a result-count argument, because Parallel has none", () => {
	// This is the load-bearing fact behind the adapter: neither the REST body nor
	// the MCP tool takes a count, so `limit` can only be honoured client-side. A
	// count re-added here would be silently dropped at best — the request schemas
	// are `additionalProperties: false`, so at worst it is a 4xx.
	for (const r of manifest.runnables) {
		for (const key of ["limit", "num_results", "max_results", "count", "num"]) {
			assert.equal(
				r.config.input_schema.properties[key],
				undefined,
				`${r.config.slug} declares a nonexistent ${key} parameter`
			);
			assert.equal(r.config.body_defaults?.[key], undefined);
		}
	}
});

test("input schemas are well-formed JSON Schema objects with required keys", () => {
	const s = bySlug.get("parallel__search").config.input_schema;
	assert.equal(s.type, "object");
	assert.equal(s.properties.objective.type, "string");
	assert.equal(s.properties.search_queries.type, "array");
	// `objective` is optional on the REST body (only `search_queries` is required),
	// even though the MCP tool demands both. The schema states the endpoint's own
	// contract; the adapter is what always sends both.
	assert.deepEqual(s.required, ["search_queries"]);
	assert.deepEqual(s.properties.mode.enum, ["turbo", "basic", "advanced"]);

	const e = bySlug.get("parallel__extract").config.input_schema;
	assert.equal(e.type, "object");
	assert.equal(e.properties.urls.type, "array");
	assert.deepEqual(e.required, ["urls"]);
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

test("permission_grants gate egress to the parallel.ai hosts only", () => {
	assert.ok(Array.isArray(manifest.permission_grants));
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:api.parallel.ai",
		"tool:http-egress:search.parallel.ai",
		// web__search is bound through an adapter (it falls back to the keyless
		// endpoint), and running adapter code is gated on this grant.
		"tool:execute",
	]);
	// the granted egress hosts match the hosts the tools actually call
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

// --- capability bindings -----------------------------------------------------

test("web__search is bound, and through an adapter", () => {
	const entry = (manifest.provides ?? []).find(
		(p) => p.capability === "web.search"
	);
	assert.ok(entry, "must provide web.search");
	assert.equal(entry.selectable, true);
	// `exa` owns the default. A second `"default": true` would make the pick
	// depend on manifest ordering.
	assert.notEqual(entry.default, true);
	const binding = entry.tools.web__search;
	assert.equal(binding.tool, "parallel__search", "the KEYED tool is primary");
	assert.ok(binding.adapter, "one canonical query cannot fill two required args");
	// An adapter REPLACES the declarative mapping; keeping both would describe the
	// same transformation twice and only one would run.
	assert.equal(binding.args, undefined);
	assert.equal(binding.response, undefined);
	// The fallback target must be DECLARED or it is refused host-side at call time.
	assert.deepEqual(binding.adapter.tools, ["parallel__free_search"]);
});

test("web__extract binds DECLARATIVELY — it needs no adapter", () => {
	const entry = manifest.provides.find((p) => p.capability === "web.extract");
	assert.ok(entry, "must provide web.extract");
	const binding = entry.tools.web__extract;
	assert.equal(binding.tool, "parallel__extract");
	assert.equal(binding.adapter, undefined);
	// The canonical verb takes ONE url; Parallel takes a list, so the binding wraps
	// it. `format` is dropped: Parallel always answers markdown.
	assert.deepEqual(binding.args, { url: "urls[]", format: "" });
	assert.equal(binding.response.results, "results");
	// Parallel's full content IS markdown, so both canonical fields read the same
	// source field rather than one of them being left empty.
	assert.equal(binding.response.fields.content, "full_content");
	assert.equal(binding.response.fields.markdown, "full_content");
});

test("the adapter fans ONE canonical query out to objective + search_queries", () => {
	const code = adapterCode();
	assert.match(code, /const objective = input\.query;/);
	assert.match(code, /const search_queries = \[input\.query\];/);
	assert.match(code, /callTool\(\{ objective, search_queries \}\)/);
});

test("the adapter applies `limit` itself, guarded for undefined", () => {
	// Parallel exposes no result-count knob on either path, so the canonical
	// `limit` is honoured client-side or not at all. Slicing at an absent limit
	// would return zero results, hence the type guard.
	const code = adapterCode();
	assert.match(code, /typeof input\.limit === "number"/);
	assert.match(code, /slice\(0, input\.limit\)/);
});

test("the adapter joins the excerpts ARRAY into a snippet string", () => {
	// `excerpts` is an array of disjoint markdown passages; the canonical `snippet`
	// is a string, and the answer is routinely in a later passage than the first.
	const code = adapterCode();
	assert.match(code, /Array\.isArray\(r\.excerpts\)/);
	assert.match(code, /r\.excerpts\.join\("\\n\\n"\)/);
	assert.match(code, /published: r\.publish_date/);
});

test("the fallback fires ONLY on a missing key, not on any failure", () => {
	// `fail_open` turns 401/403 into {available:false,...}, which IS the no-key
	// signal. Retrying on anything else would double every request during an
	// outage or a rate-limit, and would mask a broken key behind free-tier results.
	const code = adapterCode();
	assert.match(code, /keyed\.available === false/);
	assert.match(code, /return \{ raw: keyed \};/);
});

test("the free endpoint is called statelessly, with no Accept header dance", () => {
	// Verified against the live endpoint: it answers a bare `tools/call` with
	// `content-type: application/json` and needs no `initialize`, no session id and
	// no `Accept`. That is the difference from exa's MCP endpoint, which 406s
	// without an Accept naming text/event-stream — do not copy that here.
	const free = bySlug.get("parallel__free_search").config;
	assert.equal(free.header_params, undefined);
	assert.deepEqual(free.input_schema.required, [
		"jsonrpc",
		"id",
		"method",
		"params",
	]);
	const code = adapterCode();
	assert.match(code, /method: "tools\/call"/);
	assert.match(code, /name: "web_search"/);
	assert.doesNotMatch(code, /text\/event-stream/);
});

test("the adapter sends no session_id and no model_name", () => {
	// `session_id` is what Parallel rate-limits the free tier on. A constant in a
	// shipped manifest would be shared by every Ryu install and collide globally;
	// omitted, the server mints a fresh one per call. `model_name` is analytics
	// only and the sandbox cannot see the calling model anyway.
	const code = adapterCode();
	assert.doesNotMatch(code, /session_id:/);
	assert.doesNotMatch(code, /model_name:/);
});

test("the adapter reads structuredContent and passes JSON-RPC errors through", () => {
	// JSON-RPC errors arrive as HTTP 200, so `fail_open` never sees them: an
	// envelope with no usable payload must be handed back raw, not flattened into
	// an empty result set that reads like "the web has nothing".
	const code = adapterCode();
	assert.match(code, /structuredContent/);
	assert.match(code, /Array\.isArray\(payload\.results\)/);
	assert.match(code, /return \{ raw: free \};/);
	// Every parse is guarded — a throw would surface as an adapter crash.
	assert.match(code, /catch \(e\)/);
});

// --- BYOK settings tab -------------------------------------------------------
// The key is env-only at the tool layer (`env:RYU_PARALLEL_API_KEY`). The settings
// tab is the ONLY UI a user has for it: a `secret` field whose pref_key is exactly
// that env var name, which the secret-header resolver falls back to when the
// process env has no such variable.

test("contributes exactly one settings tab, declarative and node-scoped", () => {
	const tabs = manifest.contributes?.settings_tabs;
	assert.ok(Array.isArray(tabs), "no contributes.settings_tabs");
	assert.equal(tabs.length, 1);
	const [tab] = tabs;
	assert.equal(tab.id, "parallel.settings");
	assert.equal(typeof tab.title, "string");
	assert.ok(tab.title.length > 0);
	// The secret-header resolver runs in Core ON THE NODE, so it can only read a
	// node-scoped preference. A `user` (client-local) scope would be invisible to
	// it and the key would silently never apply.
	assert.equal(tab.scope, "node");
	// Declarative fields, not a bespoke component.
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
			.map((r) => /env:(\w+)/.exec(r.config.secret_headers["x-api-key"])[1])
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
	// The tools are fail_open and search works with no key at all, so a missing
	// key degrades rather than errors. Marking the field required would contradict
	// that and nag users who never selected Parallel as their layer.
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
	// would silently go nowhere.
	const stale = join(
		coreSrc,
		"plugin_manifest",
		"fixtures",
		"parallel.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory. Delete the fixture copy.`
	);

	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	// Registration seam: forgetting the include_str! leaves every other guard passing
	// while the plugin simply does not exist at runtime.
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/parallel/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);

	// A built-in ships only its manifest; its package directory is not on the
	// user's machine, so an un-embedded `code_file` cannot be resolved at runtime.
	const builtinCode = readFileSync(
		join(coreSrc, "plugin_manifest", "builtin_code.rs"),
		"utf8"
	);
	assert.ok(
		builtinCode.includes(
			'include_str!("../../../../plugins-store/parallel/adapters/web__search.js")'
		),
		"the adapter body is not embedded — web__search would fail to load at runtime"
	);
});
