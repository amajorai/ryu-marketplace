// Co-located contract test for the `brave` plugin.
// Runner: `node --test` (zero dependencies).
//
// `brave` is a declarative HTTP-tool plugin AND a capability provider for the
// swappable layers: it declares a `provides` entry binding the canonical
// `web__search` verb to its own tool, so selecting it in the layer picker re-points
// that stable tool at Brave's index without changing the id or schema any agent
// sees. These tests therefore cover both the usual manifest contract and the
// verb-binding contract, since a typo in a verb key is otherwise silent — the layer
// just stops serving that verb.
//
// Brave differs from the other search providers in two ways that this file is
// deliberately strict about, because both fail only at runtime, as a 4xx:
//
//   1. Auth is NOT `Authorization: Bearer`. Brave reads a `X-Subscription-Token`
//      header whose value is the bare token, so the manifest's secret template must
//      carry no `Bearer ` prefix.
//   2. The endpoint is a GET. Core's `build_rest_request` partitions a bodyless
//      method's arguments into the QUERY STRING verbatim, so every property name in
//      the input schema — and therefore every target of an `args` rename — must be a
//      real Brave query parameter, not a name of our choosing.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const raw = readFileSync(manifestPath, "utf8");

test("manifest.json is valid parseable JSON", () => {
	assert.doesNotThrow(() => JSON.parse(raw));
});

const manifest = JSON.parse(raw);

test("has required top-level identity fields", () => {
	assert.equal(manifest.id, "brave");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("declares an engines.ryu constraint", () => {
	assert.equal(typeof manifest.engines?.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
});

const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("contributes one GET http tool runnable with a namespaced native slug", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 1);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(r.config.backend, "http");
		// GET is load-bearing, not cosmetic: Core treats GET/HEAD as bodyless and
		// turns the argument map into query-string pairs. Flipping this to POST
		// would ship every argument as a JSON body Brave does not read.
		assert.equal(r.config.method, "GET");
		// A slug containing `__` registers under its NATIVE id rather than being
		// prefixed with `app__`, which is what makes the verb binding below resolve.
		assert.ok(
			r.config.slug.startsWith("brave__"),
			`slug ${r.config.slug} not namespaced`
		);
	}
	assert.ok(bySlug.has("brave__search"));
});

test("auth is the X-Subscription-Token header, from env, with NO Bearer prefix", () => {
	for (const r of manifest.runnables) {
		const sh = r.config.secret_headers;
		assert.ok(sh, `${r.id} missing secret_headers`);
		// Brave does not accept `Authorization: Bearer`. Naming the header wrong is
		// a 401 on the first real call, which is exactly what this asserts away.
		assert.deepEqual(Object.keys(sh), ["X-Subscription-Token"]);
		const template = sh["X-Subscription-Token"];
		assert.equal(template, "env:RYU_BRAVE_API_KEY");
		// The value template is resolved by substituting the `env:` word in place,
		// so a stray scheme prefix would be sent verbatim and rejected upstream.
		assert.doesNotMatch(template, /bearer/i);
		// Never a literal token baked into a committed manifest.
		assert.doesNotMatch(template, /^[A-Za-z0-9_-]{16,}$/);
	}
});

test("the tool targets the api.search.brave.com host over https", () => {
	for (const r of manifest.runnables) {
		const u = new URL(r.config.url);
		assert.equal(u.protocol, "https:");
		// The DOCS live on api-dashboard.search.brave.com; the API does not. Getting
		// this wrong would 404 every call and mis-scope the egress grant.
		assert.equal(u.hostname, "api.search.brave.com");
		assert.equal(u.pathname, "/res/v1/web/search");
		// A GET tool's arguments become the query string, so a base URL that already
		// carries one would be ambiguous.
		assert.equal(u.search, "");
	}
});

test("permission_grants gate egress to exactly the hosts the tools call", () => {
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:api.search.brave.com",
	]);
	const hosts = new Set(
		manifest.runnables.map((r) => new URL(r.config.url).hostname)
	);
	for (const h of hosts) {
		assert.ok(
			manifest.permission_grants.includes(`tool:http-egress:${h}`),
			`no egress grant for called host ${h}`
		);
	}
	// And nothing granted that no tool calls — a grant wider than the surface.
	for (const grant of manifest.permission_grants) {
		const host = grant.replace("tool:http-egress:", "");
		assert.ok(hosts.has(host), `granted egress to ${host}, which no tool calls`);
	}
});

test("the tool is fail_open and unwraps the 2xx body verbatim", () => {
	for (const r of manifest.runnables) {
		// `unwrap_body` is required, not stylistic: the verb binding reads the
		// results out of the dotted path `web.results`, which only exists on the raw
		// upstream JSON. Without it the tool returns a `{status, body}` envelope and
		// the path silently misses.
		assert.equal(r.config.unwrap_body, true);
		// fail_open turns a missing/rejected key into `{available:false}` rather than
		// an error, so an unconfigured Brave degrades instead of breaking a run.
		assert.equal(r.config.fail_open, true);
	}
});

test("required schema properties are actually declared in properties", () => {
	for (const r of manifest.runnables) {
		const sch = r.config.input_schema;
		assert.equal(sch.type, "object");
		for (const key of sch.required) {
			assert.ok(
				Object.hasOwn(sch.properties, key),
				`${r.config.slug}: required key ${key} not in properties`
			);
		}
	}
});

test("every declared argument is a real Brave query parameter", () => {
	// The exhaustive list from the API reference for GET /res/v1/web/search. A GET
	// tool's arguments are lowered into the query string as-is, so an argument named
	// anything not on this list is silently ignored by Brave (or rejected).
	const braveQueryParams = new Set([
		"q",
		"count",
		"offset",
		"country",
		"search_lang",
		"ui_lang",
		"safesearch",
		"freshness",
		"extra_snippets",
		"enable_rich_callback",
	]);
	const props = bySlug.get("brave__search").config.input_schema.properties;
	for (const name of Object.keys(props)) {
		assert.ok(
			braveQueryParams.has(name),
			`'${name}' is not a Brave query parameter — a GET tool sends it verbatim`
		);
	}
	// `q` is the query parameter. It is NOT called `query`, which is precisely why
	// the verb binding has to rename rather than pass through.
	assert.equal(bySlug.get("brave__search").config.input_schema.required[0], "q");
});

test("numeric bounds match the limits Brave documents", () => {
	const props = bySlug.get("brave__search").config.input_schema.properties;
	// Documented as min 1 / max 20. Advertising more would let the model author a
	// request that is in-schema here and a 4xx upstream.
	assert.equal(props.count.minimum, 1);
	assert.equal(props.count.maximum, 20);
	assert.equal(props.offset.minimum, 0);
	assert.equal(props.offset.maximum, 9);
	assert.deepEqual(props.safesearch.enum, ["off", "moderate", "strict"]);
});

// ── Capability-provider contract (the swappable-layer seam) ─────────────────

const provides = manifest.provides ?? [];
const byCapability = new Map(provides.map((p) => [p.capability, p]));

test("provides web.search ONLY — Brave has no extract or crawl endpoint", () => {
	// This asymmetry is the reason the design splits web.search from web.extract /
	// web.crawl in the first place. Declaring a capability Brave cannot serve would
	// put a provider in the picker that 404s on selection.
	assert.equal(provides.length, 1);
	assert.ok(byCapability.has("web.search"));
	assert.ok(!byCapability.has("web.extract"));
	assert.ok(!byCapability.has("web.crawl"));
});

test("every provides entry is selectable and claims no default", () => {
	for (const p of provides) {
		// Selectability requires UNANIMITY across all providers of a capability: if
		// any one omits it, the capability resolves to nothing at all. Brave is a
		// third provider alongside exa/tavily, so this flag is load-bearing.
		assert.equal(p.selectable, true, `${p.capability} must be selectable`);
		// `exa` is the declared default for web.search; exactly one provider per
		// capability may claim it.
		assert.ok(
			p.default === undefined || p.default === false,
			`${p.capability} must not claim default`
		);
		assert.match(p.version, /^\d+\.\d+\.\d+/);
	}
});

test("verb keys are canonical DOUBLE-underscore ids under the right capability", () => {
	// A single-underscore typo (`web_search`) is not an error anywhere — the verb
	// lookup simply misses and the layer silently serves nothing. Hence this test.
	const expected = { "web.search": "web__search" };
	for (const [capability, verb] of Object.entries(expected)) {
		const entry = byCapability.get(capability);
		assert.deepEqual(
			Object.keys(entry.tools),
			[verb],
			`${capability} must bind exactly ${verb}`
		);
	}
});

test("each verb forwards to a tool this manifest actually declares", () => {
	for (const p of provides) {
		for (const [verb, binding] of Object.entries(p.tools)) {
			assert.ok(
				bySlug.has(binding.tool),
				`${verb} forwards to ${binding.tool}, which this manifest does not declare`
			);
		}
	}
});

test("argument renames target arguments the provider tool really accepts", () => {
	for (const p of provides) {
		for (const [verb, binding] of Object.entries(p.tools)) {
			const props = bySlug.get(binding.tool).config.input_schema.properties;
			for (const [canonical, target] of Object.entries(binding.args ?? {})) {
				if (target === "") {
					continue; // an explicit drop: the provider cannot express it
				}
				// `name[]` means "rename and wrap in a single-element array" — strip
				// the marker before checking the field exists.
				const field = target.endsWith("[]") ? target.slice(0, -2) : target;
				assert.ok(
					Object.hasOwn(props, field),
					`${verb}: maps ${canonical} onto '${field}', which ${binding.tool} does not accept`
				);
			}
		}
	}
});

test("BOTH canonical search arguments are renamed, none passed through", () => {
	// Unmapped canonical arguments are forwarded under their ORIGINAL name. Brave
	// calls the query `q` and the result count `count`, so leaving either unmapped
	// would put `query=`/`limit=` on the wire — Brave ignores them and the required
	// `q` is missing, which is a 422 rather than a bad-but-working search.
	const { args } = byCapability.get("web.search").tools.web__search;
	assert.deepEqual(args, { query: "q", limit: "count" });
});

test("search normalizes into the canonical result shape from Brave's nesting", () => {
	const binding = byCapability.get("web.search").tools.web__search;
	// Brave nests the array two levels down; a flat `"results"` path would find
	// nothing and the facade would pass the raw envelope through unmapped.
	assert.equal(binding.response.results, "web.results");
	// The canonical item keys other providers also produce, so a swap is invisible.
	for (const key of ["title", "url", "snippet"]) {
		assert.ok(
			Object.hasOwn(binding.response.fields, key),
			`missing canonical field ${key}`
		);
	}
	// Brave names the snippet `description`, not `text`/`content` — the rename is
	// the whole reason a provider swap is invisible to the model.
	assert.equal(binding.response.fields.snippet, "description");
	assert.equal(binding.response.fields.title, "title");
	assert.equal(binding.response.fields.url, "url");
});

// --- BYOK settings tab -------------------------------------------------------
// The key is env-only at the tool layer (`env:RYU_BRAVE_API_KEY`). The settings tab
// is the ONLY UI a user has for it: a `secret` field whose pref_key is exactly that
// env var name, which the secret-header resolver falls back to when the process env
// has no such variable.

test("contributes exactly one settings tab, declarative and node-scoped", () => {
	const tabs = manifest.contributes?.settings_tabs;
	assert.ok(Array.isArray(tabs), "no contributes.settings_tabs");
	assert.equal(tabs.length, 1);
	const [tab] = tabs;
	assert.equal(tab.id, "brave.settings");
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

test("the settings field pref_key IS the env var the tool references", () => {
	const field = manifest.contributes.settings_tabs[0].fields[0];
	assert.equal(field.type, "secret");
	// Derive the expected name from the manifest itself rather than restating a
	// literal — this is what actually catches a rename on one side only. Read the
	// single secret header by VALUE, not by a hardcoded header name, so renaming
	// the header cannot make this test vacuously pass.
	const envVars = new Set(
		manifest.runnables.flatMap((r) =>
			Object.values(r.config.secret_headers).map(
				(template) => /env:(\w+)/.exec(template)[1]
			)
		)
	);
	assert.equal(envVars.size, 1, "tools disagree on which env var holds the key");
	assert.equal(field.pref_key, [...envVars][0]);
	assert.equal(field.pref_key, "RYU_BRAVE_API_KEY");
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
	// The tool is fail_open: a missing key degrades, it does not error. Marking the
	// field required would contradict that and nag users who never selected Brave
	// as their web.search layer.
	assert.notEqual(field.required, true);
});

test("manifest is byte-identical to the Core fixture (registration seam)", () => {
	const fixturePath = resolve(
		here,
		"../../apps/core/src/plugin_manifest/fixtures/brave.manifest.json"
	);
	// Skip on the SATELLITE tree (no apps/core at all), but fail loudly if the
	// fixtures directory is here and only the file name is wrong — otherwise a
	// broken path silently skips instead of catching real drift.
	if (!existsSync(dirname(fixturePath))) {
		return;
	}
	assert.deepEqual(
		readFileSync(manifestPath),
		readFileSync(fixturePath),
		"manifest.json drifted from the Core fixture — they must be byte-identical"
	);
});
