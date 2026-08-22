// Co-located contract test for the `firecrawl` plugin.
// Runner: `node --test` (zero dependencies).
//
// `firecrawl` is a declarative HTTP-tool plugin AND a *capability provider* for the
// swappable layers: it declares `provides` entries binding the canonical
// `web.search` / `web.extract` verbs to its own tools, so selecting it in the layer
// picker re-points those stable tools at Firecrawl without changing the id or schema
// any agent sees. These tests therefore cover both the usual manifest contract and the
// verb-binding contract, since a typo in a verb key is otherwise silent — the layer
// just stops serving that verb.
//
// The one binding this plugin deliberately does NOT make — `web.crawl` — is asserted
// on just as hard as the two it does, because Firecrawl's crawl endpoint is
// asynchronous and a half-declared provider would be worse than an absent one.

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
	assert.equal(manifest.id, "@ryu/firecrawl");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("declares an engines.ryu constraint", () => {
	assert.equal(typeof manifest.engines?.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
});

const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("contributes four http tool runnables with namespaced native slugs", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 4);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(r.config.backend, "http");
		// A dotted slug registers under its NATIVE id rather than being wrapped in
		// an `app.` alias, which is what makes the verb bindings below resolve.
		assert.ok(
			r.config.slug.startsWith("firecrawl."),
			`slug ${r.config.slug} not namespaced`
		);
	}
	assert.ok(bySlug.has("firecrawl.search"));
	assert.ok(bySlug.has("firecrawl.scrape"));
	// The crawl JOB pair: one call starts it, the other reads it.
	assert.ok(bySlug.has("firecrawl.crawl_start"));
	assert.ok(bySlug.has("firecrawl.crawl_status"));
});

test("the crawl job pair uses the verbs its two endpoints actually require", () => {
	// Starting a job POSTs a body; reading one GETs a job-scoped path. A declarative
	// http tool interpolates `{id}` into the URL, which is what makes the status
	// endpoint expressible at all.
	assert.equal(bySlug.get("firecrawl.crawl_start").config.method, "POST");
	const status = bySlug.get("firecrawl.crawl_status").config;
	assert.equal(status.method, "GET");
	assert.ok(
		status.url.includes("{id}"),
		"the status route must interpolate the job id into its path"
	);
	assert.ok(Object.hasOwn(status.input_schema.properties, "id"));
});

test("both tools carry a SERVER-SIDE Authorization secret header from env", () => {
	for (const r of manifest.runnables) {
		const sh = r.config.secret_headers;
		assert.ok(sh, `${r.id} missing secret_headers`);
		assert.equal(sh.Authorization, "Bearer env:RYU_FIRECRAWL_API_KEY");
		// Never a literal token baked into a committed manifest. Firecrawl keys are
		// `fc-`-prefixed, so that prefix must never appear here either.
		assert.doesNotMatch(sh.Authorization, /Bearer\s+[A-Za-z0-9_-]{16,}$/);
		assert.doesNotMatch(sh.Authorization, /fc-/);
	}
});

test("both tools target the api.firecrawl.dev host over https, on /v2", () => {
	for (const r of manifest.runnables) {
		const u = new URL(r.config.url);
		assert.equal(u.protocol, "https:");
		assert.equal(u.hostname, "api.firecrawl.dev");
		// The version prefix is part of the verified contract: /v1 and /v2 differ in
		// both request and response shape (v2 search nests results under `data.web`),
		// so a silent downgrade would break the response mapping below.
		assert.match(
			u.pathname,
			/^\/v2\//,
			`${r.config.slug} is not a /v2 endpoint`
		);
	}
});

test("the two endpoints are the verified search and scrape routes", () => {
	assert.equal(
		bySlug.get("firecrawl.search").config.url,
		"https://api.firecrawl.dev/v2/search"
	);
	assert.equal(
		bySlug.get("firecrawl.scrape").config.url,
		"https://api.firecrawl.dev/v2/scrape"
	);
});

test("both tools fail open and unwrap the response body", () => {
	for (const r of manifest.runnables) {
		// fail_open: a missing/invalid key degrades to a soft envelope instead of an
		// error, so an unconfigured install does not hard-fail every web call.
		assert.equal(r.config.fail_open, true);
		// unwrap_body: the response mapping paths below (`data.web`, `data`) are
		// relative to Firecrawl's own JSON, not to a tool-exec envelope.
		assert.equal(r.config.unwrap_body, true);
	}
});

test("permission_grants gate egress to exactly the hosts the tools call", () => {
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:api.firecrawl.dev",
		// Firecrawl ships adapter CODE (see the web.extract / web.crawl bindings
		// below), and running it is gated on this grant so that shipping code stays
		// a visible, approvable act rather than a silent one.
		"tool:execute",
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

// ── Capability-provider contract (the swappable-layer seam) ─────────────────

const provides = manifest.provides ?? [];
const byCapability = new Map(provides.map((p) => [p.capability, p]));

test("provides the web.search, web.extract and web.crawl capabilities", () => {
	assert.equal(provides.length, 3);
	assert.ok(byCapability.has("web.search"));
	assert.ok(byCapability.has("web.extract"));
	assert.ok(byCapability.has("web.crawl"));
});

test("web.crawl is served through an ADAPTER, because the endpoint is async", () => {
	// `POST /v2/crawl` answers `{success, id, url}`: a job id. The pages only arrive
	// from a second `GET /v2/crawl/{id}` poll. A DECLARATIVE binding is one request
	// with no loop, so binding `web.crawl` that way would hand the model a UUID
	// where the canonical verb promises page content — which is why this verb went
	// unbound until adapters existed.
	const binding = byCapability.get("web.crawl").tools["web.crawl"];
	assert.equal(binding.tool, "firecrawl.crawl_start");
	assert.ok(binding.adapter, "web.crawl must carry an adapter");
	assert.equal(typeof binding.adapter.code, "string");
	// The second endpoint must be DECLARED: the adapter's reachable tool set is
	// fixed by this list and enforced host-side, so an id missing here is refused
	// at runtime rather than silently called.
	assert.deepEqual(binding.adapter.tools, ["firecrawl.crawl_status"]);
	// An adapter REPLACES the declarative mapping; carrying both would describe the
	// same transformation twice and only one of them would run.
	assert.equal(binding.response, undefined);
	assert.equal(binding.args, undefined);
});

test("the crawl adapter returns pages, never a bare job id", () => {
	// The failure this whole capability exists to avoid: returning the job id as if
	// it were the result. The adapter must poll and shape `data` into results.
	const code = byCapability.get("web.crawl").tools["web.crawl"].adapter.code;
	assert.match(code, /callNamed\(\s*"firecrawl.crawl_status"/);
	assert.match(code, /results:/);
	// It must terminate on its own rather than run until the sandbox kills it:
	// awaiting a tool call spends the wall-clock budget, so a crawl bigger than the
	// budget has to return partial pages instead of being killed with nothing.
	assert.match(code, /complete/);
});

test("every provides entry is selectable and claims no default", () => {
	for (const p of provides) {
		// Selectability requires UNANIMITY across all providers of a capability: if
		// any one omits it, the capability has candidates but no way to choose, so it
		// resolves to nothing at all. Firecrawl joins exa/tavily on web.search and
		// spider/tavily on web.extract, so this flag is load-bearing.
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
		"web.search": "web.search",
		"web.extract": "web.extract",
		"web.crawl": "web.crawl",
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

test("canonical args that are neither renamed nor dropped pass through by name", () => {
	// Unmapped canonical arguments are forwarded VERBATIM, so the provider tool must
	// declare a property of exactly that name or the call ships an argument the
	// endpoint ignores (or rejects). These are the canonical schemas in Core's verb
	// table: web.search{query,limit}, web.extract{url,format}.
	const canonical = {
		"web.search": ["query", "limit"],
		"web.extract": ["url", "format"],
		"web.crawl": ["url", "depth", "limit"],
	};
	for (const p of provides) {
		for (const [verb, binding] of Object.entries(p.tools)) {
			if (binding.adapter) {
				// An adapter builds the provider's arguments itself, so nothing is
				// forwarded verbatim and this pass-through rule does not apply.
				continue;
			}
			const props = bySlug.get(binding.tool).config.input_schema.properties;
			for (const arg of canonical[verb]) {
				if (Object.hasOwn(binding.args ?? {}, arg)) {
					continue; // explicitly renamed or dropped, covered above
				}
				assert.ok(
					Object.hasOwn(props, arg),
					`${verb}: canonical arg '${arg}' is neither mapped nor accepted by ${binding.tool}`
				);
			}
		}
	}
});

test("search reads Firecrawl's v2 data.web array into the canonical shape", () => {
	const binding = byCapability.get("web.search").tools["web.search"];
	// v2 nests per-source arrays under `data`; the default `sources` is
	// `[{"type":"web"}]`, so `data.web` is the array that is always populated.
	assert.equal(binding.response.results, "data.web");
	// The canonical item keys other providers also produce, so a swap is invisible.
	for (const key of ["title", "url", "snippet"]) {
		assert.ok(
			Object.hasOwn(binding.response.fields, key),
			`missing canonical field ${key}`
		);
	}
	// Firecrawl calls the snippet `description`; exa calls it `text` and tavily
	// `content`. Normalizing that name is the whole point of the mapping.
	assert.equal(binding.response.fields.snippet, "description");
});

test("search does not map Firecrawl's rank `position` onto `score`", () => {
	// `score` in the canonical shape is a RELEVANCE score (higher = better), which is
	// what exa and tavily emit. Firecrawl emits `position`, a 1-based rank where
	// LOWER is better. Mapping one onto the other inverts the ordering semantics
	// across a provider swap, so `position` is deliberately left in `raw`.
	const fields =
		byCapability.get("web.search").tools["web.search"].response.fields;
	assert.equal(fields.score, undefined);
	for (const source of Object.values(fields)) {
		assert.notEqual(source, "position");
	}
});

test("extract adapts the single scrape object, dotted through metadata", () => {
	const binding = byCapability.get("web.extract").tools["web.extract"];
	assert.equal(binding.tool, "firecrawl.scrape");
	assert.ok(binding.adapter, "web.extract must carry an adapter");
	const code = binding.adapter.code;
	// The canonical fields still come from Firecrawl's nested shape — the adapter
	// moved WHERE that mapping is written, not what it produces.
	assert.match(code, /metadata\b/);
	assert.match(code, /sourceURL/);
	assert.match(code, /markdown/);
	// Only one tool is reachable: extract is a single request, so it declares no
	// additional tools and `callTool` alone is enough.
	assert.equal(binding.adapter.tools, undefined);
});

test("an adapter passes a failure envelope through instead of shaping results", () => {
	// These tools are `fail_open`, so a bad or missing API key returns
	// {available,reason,hint} and any other non-2xx returns {status,body}. Core's
	// declarative response mapper detects that its results path is absent and passes
	// the payload straight through, precisely so a broken key does not read as "no
	// results". An adapter REPLACES that mapper, so it inherits the obligation — and
	// nothing else tests it, because the mapper's own guard no longer covers a verb
	// once that verb is adapted.
	const tools = Object.fromEntries(
		provides.flatMap((p) => Object.entries(p.tools))
	);
	for (const [verb, binding] of Object.entries(tools)) {
		if (!binding.adapter) {
			continue;
		}
		// The passthrough itself: an early return carrying ONLY the raw envelope.
		// `{results: []}` or a synthesized status would be the lie.
		assert.match(
			binding.adapter.code,
			/return \{ raw: \w+ \};/,
			`${verb}: adapter must pass a non-result payload through under \`raw\` rather than shaping it into results`
		);
	}
});

test("extract normalizes Firecrawl's string|string[] title IN ITS OWN adapter", () => {
	// Firecrawl types `metadata.title` as `string | string[]` (a page with both a
	// <title> and an og:title yields an array). The canonical shape promises a
	// scalar, so `["Foo"]` would be visible to the model as a difference between
	// providers. This normalization used to live in Core's shared response mapper —
	// one vendor's quirk in code every provider flows through. It belongs here.
	const code = byCapability.get("web.extract").tools["web.extract"].adapter.code;
	assert.match(
		code,
		/Array\.isArray\([^)]*\)\s*&&\s*[^?]*\.length\s*===\s*1/,
		"the adapter must collapse a single-element array to its element"
	);
});

test("extract sends `url` and never forwards the canonical `format`", () => {
	// The canonical `format` enum is markdown|text|html. Firecrawl v2 `formats`
	// accepts markdown and html but has NO `text` member, so forwarding the
	// canonical value would fail on one of its three legal values. Omitting it
	// leaves Firecrawl's own default (`[{"type":"markdown"}]`), which is what the
	// canonical default means anyway.
	const code = byCapability.get("web.extract").tools["web.extract"].adapter.code;
	assert.match(code, /callTool\(\s*\{\s*url:\s*input\.url\s*\}\s*\)/);
	assert.doesNotMatch(code, /input\.format/);
});

// --- BYOK settings tab -------------------------------------------------------
// The key is env-only at the tool layer (`env:RYU_FIRECRAWL_API_KEY`). The settings
// tab is the ONLY UI a user has for it: a `secret` field whose pref_key is exactly
// that env var name, which the secret-header resolver falls back to when the
// process env has no such variable.

test("contributes exactly one settings tab, declarative and node-scoped", () => {
	const tabs = manifest.contributes?.settings_tabs;
	assert.ok(Array.isArray(tabs), "no contributes.settings_tabs");
	assert.equal(tabs.length, 1);
	const [tab] = tabs;
	assert.equal(tab.id, "firecrawl.settings");
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
		manifest.runnables.map(
			(r) => /env:(\w+)/.exec(r.config.secret_headers.Authorization)[1]
		)
	);
	assert.equal(
		envVars.size,
		1,
		"tools disagree on which env var holds the key"
	);
	assert.equal(field.pref_key, [...envVars][0]);
});

test("one key powers EVERY capability firecrawl provides", () => {
	// Search, scrape and crawl authenticate with the same credential, so one
	// settings field is correct — a second sharing the pref_key is rejected at load.
	const field = manifest.contributes.settings_tabs[0].fields[0];
	const capabilities = manifest.provides.map((p) => p.capability);
	assert.deepEqual([...capabilities].sort(), [
		"web.crawl",
		"web.extract",
		"web.search",
	]);
	assert.equal(field.pref_key, "RYU_FIRECRAWL_API_KEY");
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
	// Firecrawl as their web.search / web.extract layer.
	assert.notEqual(field.required, true);
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
		"firecrawl.manifest.json"
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
			'include_str!("../../../../plugins-store/plugins/firecrawl/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});
