// Co-located contract test for the `serper` plugin.
// Runner: `node --test` (zero dependencies).
//
// `serper` is a declarative HTTP-tool plugin AND a capability provider for the
// swappable layers: it declares `provides` entries binding the canonical
// `web__search` / `web__extract` verbs to its own tools, so selecting it in the
// layer picker re-points those stable tools at Serper without changing the id or
// schema any agent sees. These tests therefore cover both the usual manifest
// contract and the verb-binding contract, since a typo in a verb key is otherwise
// silent — the layer just stops serving that verb.
//
// Serper differs from the other providers in four ways this file is deliberately
// strict about, because each fails only at runtime, as a 4xx or as an empty result:
//
//   1. Auth is NOT `Authorization: Bearer`. Serper reads an `X-API-KEY` header whose
//      value is the bare key, so the secret template must carry no scheme prefix.
//   2. The two tools live on DIFFERENT hosts — search on `google.serper.dev`,
//      scraping on `scrape.serper.dev` — so the manifest needs two egress grants.
//      A single grant would let one tool through and silently block the other.
//   3. Neither of Serper's search argument names is canonical: the query is `q` and
//      the result count is `num`. Both must be renamed or the required `q` never
//      arrives.
//   4. The scrape endpoint answers with a SINGLE record, not an array, so the
//      extract binding declares `fields` and no `results` path.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
	assert.equal(manifest.id, "serper");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("declares an engines.ryu constraint", () => {
	assert.equal(typeof manifest.engines?.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
});

const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("contributes two POST http tool runnables with namespaced native slugs", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 2);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(r.config.backend, "http");
		// POST is load-bearing: both Serper endpoints read a JSON body. As a GET,
		// Core would lower the arguments into a query string Serper does not read.
		assert.equal(r.config.method, "POST");
		// A slug containing `__` registers under its NATIVE id rather than being
		// prefixed with `app__`, which is what makes the verb bindings below resolve.
		assert.ok(
			r.config.slug.startsWith("serper__"),
			`slug ${r.config.slug} not namespaced`
		);
	}
	assert.ok(bySlug.has("serper__search"));
	assert.ok(bySlug.has("serper__scrape"));
});

test("auth is the X-API-KEY header, from env, with NO Bearer prefix", () => {
	for (const r of manifest.runnables) {
		const sh = r.config.secret_headers;
		assert.ok(sh, `${r.id} missing secret_headers`);
		// Serper does not accept `Authorization: Bearer`. Naming the header wrong is
		// a 403 on the first real call, which is exactly what this asserts away.
		assert.deepEqual(Object.keys(sh), ["X-API-KEY"]);
		const template = sh["X-API-KEY"];
		assert.equal(template, "env:RYU_SERPER_API_KEY");
		// The value template is resolved by substituting the `env:` word in place,
		// so a stray scheme prefix would be sent verbatim and rejected upstream.
		assert.doesNotMatch(template, /bearer/i);
		// Never a literal key baked into a committed manifest.
		assert.doesNotMatch(template, /^[A-Za-z0-9_-]{16,}$/);
	}
});

test("the tools target their two distinct serper.dev hosts over https", () => {
	const search = bySlug.get("serper__search").config;
	const scrape = bySlug.get("serper__scrape").config;
	for (const url of [search.url, scrape.url]) {
		assert.equal(new URL(url).protocol, "https:");
	}
	const s = new URL(search.url);
	assert.equal(s.hostname, "google.serper.dev");
	assert.equal(s.pathname, "/search");
	// The scrape endpoint is its own HOST with no path segment at all — appending
	// `/scrape` to it is a 404, and pointing it at google.serper.dev is a 404 too.
	const p = new URL(scrape.url);
	assert.equal(p.hostname, "scrape.serper.dev");
	assert.equal(p.pathname, "/");
	assert.notEqual(s.hostname, p.hostname);
});

test("permission_grants gate egress to exactly the hosts the tools call", () => {
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:google.serper.dev",
		"tool:http-egress:scrape.serper.dev",
	]);
	const hosts = new Set(
		manifest.runnables.map((r) => new URL(r.config.url).hostname)
	);
	// Two hosts, therefore two grants: this plugin is the case where a single
	// grant copied from a one-host provider would half-work.
	assert.equal(hosts.size, 2);
	for (const h of hosts) {
		assert.ok(
			manifest.permission_grants.includes(`tool:http-egress:${h}`),
			`no egress grant for called host ${h}`
		);
	}
	// And nothing granted that no tool calls — a grant wider than the surface.
	for (const grant of manifest.permission_grants) {
		const host = grant.replace("tool:http-egress:", "");
		assert.ok(
			hosts.has(host),
			`granted egress to ${host}, which no tool calls`
		);
	}
});

test("both tools are fail_open and unwrap the 2xx body verbatim", () => {
	for (const r of manifest.runnables) {
		// `unwrap_body` is required, not stylistic: the search binding reads its
		// results out of the top-level `organic` path, which only exists on the raw
		// upstream JSON. Without it the tool returns a `{status, body}` envelope and
		// the path silently misses. The extract binding, which reads `text` off the
		// response root, breaks the same way.
		assert.equal(r.config.unwrap_body, true);
		// fail_open turns a missing/rejected key into `{available:false}` rather than
		// an error, so an unconfigured Serper degrades instead of breaking a run.
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

test("every declared argument is a real Serper request-body field", () => {
	// The fields Serper's own playground puts on the wire for each endpoint. A
	// property named anything else is silently ignored upstream, so the tool would
	// appear to work while doing something other than what the model asked.
	const bodyFields = {
		serper__search: new Set(["q", "num", "page", "gl", "hl", "autocorrect"]),
		serper__scrape: new Set([
			"url",
			"includeMarkdown",
			"includeImages",
			"includeLinks",
			"includeVideos",
		]),
	};
	for (const [slug, allowed] of Object.entries(bodyFields)) {
		const cfg = bySlug.get(slug).config;
		for (const name of Object.keys(cfg.input_schema.properties)) {
			assert.ok(
				allowed.has(name),
				`'${slug}': '${name}' is not a Serper field`
			);
		}
		// `body_defaults` go on the wire too and are never validated against the
		// schema, so they need the same check.
		for (const name of Object.keys(cfg.body_defaults ?? {})) {
			assert.ok(
				allowed.has(name),
				`'${slug}': body default '${name}' is not a Serper field`
			);
		}
	}
	// The query field is `q` and the count field is `num`. Neither is the canonical
	// name, which is precisely why the verb binding has to rename both.
	assert.deepEqual(bySlug.get("serper__search").config.input_schema.required, [
		"q",
	]);
	assert.deepEqual(bySlug.get("serper__scrape").config.input_schema.required, [
		"url",
	]);
});

test("the scrape tool asks for markdown by default, at the TOOL layer", () => {
	// On the tool's `body_defaults` rather than the verb binding's `arg_defaults`,
	// so a direct `serper__scrape` call gets markdown too — not only calls that
	// arrive through the `web__extract` facade.
	const cfg = bySlug.get("serper__scrape").config;
	assert.equal(cfg.body_defaults.includeMarkdown, true);
});

// ── Capability-provider contract (the swappable-layer seam) ─────────────────

const provides = manifest.provides ?? [];
const byCapability = new Map(provides.map((p) => [p.capability, p]));

test("provides web.search and web.extract, but NOT web.crawl", () => {
	// Serper scrapes exactly one URL per call and has no link-following endpoint,
	// so it cannot serve `web__crawl`. Declaring the capability anyway would put it
	// into resolution for that layer and let it win the pick away from `spider`,
	// silently killing a layer that works.
	assert.equal(provides.length, 2);
	assert.ok(byCapability.has("web.search"));
	assert.ok(byCapability.has("web.extract"));
	assert.ok(!byCapability.has("web.crawl"));
});

test("every provides entry is selectable and claims no default", () => {
	for (const p of provides) {
		// Selectability requires UNANIMITY across all providers of a capability: if
		// any one omits it, the capability resolves to nothing at all. Serper joins
		// exa/tavily/brave on search and spider/tavily on extract, so this flag is
		// load-bearing.
		assert.equal(p.selectable, true, `${p.capability} must be selectable`);
		// `exa` is the declared default for web.search and `spider` for web.extract;
		// exactly one provider per capability may claim it.
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
	const expected = {
		"web.search": "web__search",
		"web.extract": "web__extract",
	};
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
	// Unmapped canonical arguments are forwarded under their ORIGINAL name. Serper
	// calls the query `q` and the count `num`, so leaving either unmapped would put
	// `query=`/`limit=` in the body — Serper ignores them and the required `q` is
	// missing, which is an error rather than a bad-but-working search.
	const { args } = byCapability.get("web.search").tools.web__search;
	assert.deepEqual(args, { query: "q", limit: "num" });
});

test("search normalizes into the canonical result shape from Serper's names", () => {
	const binding = byCapability.get("web.search").tools.web__search;
	// Serper's ranked results live under the top-level `organic` key. A `results`
	// path copied from another provider would find nothing and the facade would
	// pass the raw envelope through unmapped.
	assert.equal(binding.response.results, "organic");
	// The canonical item keys other providers also produce, so a swap is invisible.
	for (const key of ["title", "url", "snippet"]) {
		assert.ok(
			Object.hasOwn(binding.response.fields, key),
			`missing canonical field ${key}`
		);
	}
	// Serper names the result URL `link`, not `url` — the rename is the whole
	// reason a provider swap is invisible to the model.
	assert.equal(binding.response.fields.url, "link");
	assert.equal(binding.response.fields.title, "title");
	assert.equal(binding.response.fields.snippet, "snippet");
});

test("extract drops `format` and maps the single scraped record", () => {
	const binding = byCapability.get("web.extract").tools.web__extract;
	// Serper expresses output format as an `includeMarkdown` boolean, not as the
	// canonical `format` enum, so the argument is explicitly dropped rather than
	// forwarded under a name Serper would ignore.
	assert.equal(binding.args.format, "");
	// The canonical `url` is NOT renamed: Serper's field is also called `url`, and
	// an unmapped canonical argument passes through under its own name.
	assert.equal(binding.args.url, undefined);
	assert.ok(
		Object.hasOwn(
			bySlug.get(binding.tool).config.input_schema.properties,
			"url"
		)
	);
	// NO `results` path, on purpose: a scrape answers with one record, not an
	// array, and the contract reads an absent path as "the response itself is the
	// record". The tradeoff to keep in view — do not "fix" this by inventing a
	// path — is that omitting it also forfeits the facade's absent-path escape
	// hatch, so a fail_open 403 payload arrives as one result with no `content`
	// instead of being passed through verbatim.
	assert.equal(binding.response.results, undefined);
	// Serper calls the page body `text`; the canonical extract field is `content`.
	assert.equal(binding.response.fields.content, "text");
	assert.equal(binding.response.fields.markdown, "markdown");
});

// --- BYOK settings tab -------------------------------------------------------
// The key is env-only at the tool layer (`env:RYU_SERPER_API_KEY`). The settings tab
// is the ONLY UI a user has for it: a `secret` field whose pref_key is exactly that
// env var name, which the secret-header resolver falls back to when the process env
// has no such variable.

test("contributes exactly one settings tab, declarative and node-scoped", () => {
	const tabs = manifest.contributes?.settings_tabs;
	assert.ok(Array.isArray(tabs), "no contributes.settings_tabs");
	assert.equal(tabs.length, 1);
	const [tab] = tabs;
	assert.equal(tab.id, "serper.settings");
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
	// literal — this is what actually catches a rename on one side only. Read the
	// secret headers by VALUE, not by a hardcoded header name, so renaming the
	// header cannot make this test vacuously pass.
	const envVars = new Set(
		manifest.runnables.flatMap((r) =>
			Object.values(r.config.secret_headers).map(
				(template) => /env:(\w+)/.exec(template)[1]
			)
		)
	);
	assert.equal(
		envVars.size,
		1,
		"tools disagree on which env var holds the key"
	);
	assert.equal(field.pref_key, [...envVars][0]);
	assert.equal(field.pref_key, "RYU_SERPER_API_KEY");
});

test("one key powers BOTH capabilities serper provides", () => {
	// Search and scrape authenticate with the same credential across two hosts, so
	// one settings field is correct — a second sharing a pref_key inside one tab is
	// rejected at load.
	const field = manifest.contributes.settings_tabs[0].fields[0];
	const capabilities = manifest.provides.map((p) => p.capability);
	assert.deepEqual([...capabilities].sort(), ["web.extract", "web.search"]);
	assert.equal(field.pref_key, "RYU_SERPER_API_KEY");
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
	// Serper is metered. Selecting it as a layer spends money, so the field a user
	// reads before pasting a key has to say so.
	assert.match(field.description, /paid|credit/i);
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
	// Serper as their web.search / web.extract layer.
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
		"serper.manifest.json"
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
			'include_str!("../../../../plugins-store/serper/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});
