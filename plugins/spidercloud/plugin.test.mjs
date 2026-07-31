// Co-located contract test for the `spidercloud` plugin.
// Runner: `node --test` (zero dependencies).
//
// `spidercloud` is a declarative HTTP-tool plugin and the SECOND provider of the
// `web.crawl` capability — the one that makes that layer actually swappable rather
// than merely marked selectable. Its bindings encode three decisions that are silent
// if reverted, so they are each pinned here:
//
//   1. `depth` is DROPPED (`""`), because upstream's `depth: 0` means "no limit" and
//      the canonical `depth: 0` means "the start page only". Re-binding it would
//      invert the argument's meaning at exactly the value a cautious model sends.
//   2. `limit` carries BOTH a body default and a clamp, because upstream treats an
//      absent/zero limit as "crawl every page" and the host http tool aborts at 30s.
//      Losing either turns the first `web__crawl {url}` call into a timeout.
//   3. `unwrap_body` is deliberately NOT set (unlike tavily/firecrawl/exa) so that
//      `results: "body"` has a path to name — the success payload is a top-level
//      array with no wrapper key.

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
	assert.equal(manifest.id, "spidercloud");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("id does not collide with the local `spider` CLI plugin", () => {
	// Both wrap the same engine; only this one is the hosted HTTP form. Sharing an
	// id would make the two manifests fight over one record and one fixture name.
	assert.notEqual(manifest.id, "spider");
});

test("declares an engines.ryu constraint", () => {
	assert.equal(typeof manifest.engines?.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
});

const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("contributes one http tool runnable with a namespaced native slug", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 1);
	const [r] = manifest.runnables;
	assert.equal(r.kind, "tool");
	assert.equal(r.config.backend, "http");
	assert.equal(r.config.method, "POST");
	// A slug containing `__` registers under its NATIVE id rather than being
	// prefixed with `app__`, which is what makes the verb binding below resolve.
	assert.ok(bySlug.has("spidercloud__crawl"));
});

test("the tool carries a SERVER-SIDE Authorization secret header from env", () => {
	const sh = manifest.runnables[0].config.secret_headers;
	assert.ok(sh, "missing secret_headers");
	assert.equal(sh.Authorization, "Bearer env:RYU_SPIDERCLOUD_API_KEY");
	// Never a literal token baked into a committed manifest.
	assert.doesNotMatch(sh.Authorization, /Bearer\s+[A-Za-z0-9_-]{16,}$/);
});

test("the tool targets the documented api.spider.cloud/crawl endpoint over https", () => {
	const u = new URL(manifest.runnables[0].config.url);
	assert.equal(u.protocol, "https:");
	assert.equal(u.hostname, "api.spider.cloud");
	// The official clients post to `{base}/crawl`; there is no `/v1` segment.
	assert.equal(u.pathname, "/crawl");
});

test("permission_grants gate egress to exactly the hosts the tools call", () => {
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:api.spider.cloud",
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

// ── The unbounded-crawl guard ──────────────────────────────────────────────────
// Upstream: "limit (default 0) — The maximum amount of pages allowed to crawl per
// website. Remove the value or set it to 0 to crawl all pages." The canonical
// `limit` is OPTIONAL, so without a default a bare `web__crawl {url}` asks for the
// whole site and blows the host's 30s http timeout, returning nothing at all.

const crawlConfig = bySlug.get("spidercloud__crawl").config;

test("body_defaults supply a page limit so a bare call is never unbounded", () => {
	const d = crawlConfig.body_defaults;
	assert.ok(
		d,
		"no body_defaults: an omitted limit would crawl the entire site"
	);
	assert.equal(typeof d.limit, "number");
	assert.ok(d.limit >= 1, "a limit of 0 means 'crawl every page' upstream");
});

test("body_defaults ask for markdown, not the raw HTML upstream defaults to", () => {
	// The canonical `content` field promises page content; `return_format` defaults
	// to `raw` (HTML) upstream, which would hand the model markup instead.
	assert.equal(crawlConfig.body_defaults.return_format, "markdown");
});

test("body_defaults enable metadata, which is what supplies the title", () => {
	// `metadata` defaults to false upstream; the response map reads `metadata.title`,
	// so turning it off would silently drop `title` from every canonical record.
	assert.equal(crawlConfig.body_defaults.metadata, true);
});

test("unwrap_body is deliberately NOT set", () => {
	// The 2xx payload is a TOP-LEVEL ARRAY with no wrapper key. Unwrapping it would
	// leave `response.results` with no path to name, and the failure envelopes
	// (`{available:false,…}` on a bad key) would then be mapped as if they were
	// result records instead of passed through.
	assert.equal(crawlConfig.unwrap_body, undefined);
});

test("the tool is fail_open so a missing key degrades instead of erroring", () => {
	assert.equal(crawlConfig.fail_open, true);
});

// ── Capability-provider contract (the swappable-layer seam) ─────────────────────

const provides = manifest.provides ?? [];
const byCapability = new Map(provides.map((p) => [p.capability, p]));

test("provides exactly the web.crawl capability", () => {
	assert.equal(provides.length, 1);
	assert.ok(byCapability.has("web.crawl"));
});

test("the provides entry is selectable and claims no default", () => {
	const p = byCapability.get("web.crawl");
	// Selectability requires UNANIMITY across all providers of a capability: if any
	// one omits it, the capability has candidates it cannot choose between and
	// resolves to nothing at all.
	assert.equal(p.selectable, true);
	// The local `spider` CLI plugin is the declared default for web.crawl; exactly
	// one provider per capability may claim it.
	assert.ok(p.default === undefined || p.default === false);
	assert.match(p.version, /^\d+\.\d+\.\d+/);
});

test("verb key is the canonical DOUBLE-underscore id under the right capability", () => {
	// A single-underscore typo (`web_crawl`) is not an error anywhere — the verb
	// lookup simply misses and the layer silently serves nothing.
	assert.deepEqual(Object.keys(byCapability.get("web.crawl").tools), [
		"web__crawl",
	]);
});

const binding = byCapability.get("web.crawl").tools.web__crawl;

test("the verb forwards to a tool this manifest actually declares", () => {
	assert.ok(
		bySlug.has(binding.tool),
		`web__crawl forwards to ${binding.tool}, which this manifest does not declare`
	);
});

test("argument renames target arguments the provider tool really accepts", () => {
	const props = bySlug.get(binding.tool).config.input_schema.properties;
	for (const [canonical, target] of Object.entries(binding.args ?? {})) {
		if (target === "") {
			continue; // an explicit drop: the provider cannot express it
		}
		const field = target.endsWith("[]") ? target.slice(0, -2) : target;
		assert.ok(
			Object.hasOwn(props, field),
			`web__crawl maps ${canonical} onto '${field}', which ${binding.tool} does not accept`
		);
	}
});

test("canonical `depth` is dropped, never forwarded or clamped", () => {
	// Upstream: "The crawl limit for maximum depth. If 0, no limit will be applied."
	// Canonical: "Link hops to follow (0 = the start page only)." Those invert at 0.
	// A clamp would hide the inversion while still asserting the two count hops the
	// same way, which upstream does not document. The explicit `""` drop is the
	// honest encoding of "this provider cannot express the argument".
	assert.equal(binding.args.depth, "");
	assert.equal(
		binding.arg_clamp?.depth,
		undefined,
		"depth must be dropped, not clamped — a clamp would hide a semantic inversion"
	);
});

test("limit is clamped to a range this synchronous provider can actually finish", () => {
	const bounds = binding.arg_clamp?.limit;
	assert.ok(
		bounds,
		"no limit clamp: `limit: 0` upstream means 'crawl every page'"
	);
	assert.equal(bounds.min, 1);
	// A clamp that never narrows anything is decoration; the canonical schema allows
	// up to 500, and the host http tool aborts at 30s.
	assert.ok(
		bounds.max < 500,
		"clamp must actually narrow the canonical ceiling"
	);
	// The clamp and the tool's own declared maximum must agree, or a direct call and
	// a verb call would disagree about what this provider accepts.
	assert.equal(
		bounds.max,
		bySlug.get(binding.tool).config.input_schema.properties.limit.maximum
	);
});

test("crawl normalizes into the canonical result shape", () => {
	// The success payload is a top-level array, which the default `{status, body}`
	// envelope makes reachable at `body`. When that path is ABSENT — which is exactly
	// what a fail_open 401/403 produces — `map_response` passes the payload through
	// instead of reporting an empty result set.
	assert.equal(binding.response.results, "body");
	for (const key of ["title", "url", "content"]) {
		assert.ok(
			Object.hasOwn(binding.response.fields, key),
			`missing canonical field ${key}`
		);
	}
	// Verified per-page keys upstream are {url, status, content, error, costs}; the
	// title only exists under the `metadata` object the body defaults request.
	assert.equal(binding.response.fields.url, "url");
	assert.equal(binding.response.fields.content, "content");
	assert.equal(binding.response.fields.title, "metadata.title");
});

// --- BYOK settings tab -------------------------------------------------------
// The key is env-only at the tool layer (`env:RYU_SPIDERCLOUD_API_KEY`). The settings
// tab is the ONLY UI a user has for it: a `secret` field whose pref_key is exactly
// that env var name, which the secret-header resolver falls back to when the process
// env has no such variable.

test("contributes exactly one settings tab, declarative and node-scoped", () => {
	const tabs = manifest.contributes?.settings_tabs;
	assert.ok(Array.isArray(tabs), "no contributes.settings_tabs");
	assert.equal(tabs.length, 1);
	const [tab] = tabs;
	assert.equal(tab.id, "spidercloud.settings");
	assert.equal(typeof tab.title, "string");
	assert.ok(tab.title.length > 0);
	// The secret-header resolver runs in Core ON THE NODE, so it can only read a
	// node-scoped preference. A `user` (client-local) scope would be invisible to it
	// and the key would silently never apply.
	assert.equal(tab.scope, "node");
	// Declarative fields, not a bespoke component.
	assert.equal(tab.view, undefined);
	assert.equal(tab.fields.length, 1);
});

test("the settings field pref_key IS the env var the tool references", () => {
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
	// rejects any of these outright.
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
	// field required would contradict that and nag users who never selected Spider
	// Cloud as their web.crawl layer.
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
		"spidercloud.manifest.json"
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
			'include_str!("../../../../plugins-store/spidercloud/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});
