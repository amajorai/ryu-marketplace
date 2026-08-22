// Co-located contract test for the `tavily` plugin.
// Runner: `node --test` (zero dependencies).
//
// `tavily` is a declarative HTTP-tool plugin AND the first plugin to be a
// *capability provider* for the swappable layers: it declares `provides` entries
// binding the canonical `web.search` / `web.extract` verbs to its own tools, so
// selecting it in the layer picker re-points those stable tools at Tavily without
// changing the id or schema any agent sees. These tests therefore cover both the
// usual manifest contract and the verb-binding contract, since a typo in a verb key
// is otherwise silent — the layer just stops serving that verb.

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
	assert.equal(manifest.id, "@ryu/tavily");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("declares an engines.ryu constraint", () => {
	assert.equal(typeof manifest.engines?.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
});

const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("contributes two http tool runnables with namespaced native slugs", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 2);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(r.config.backend, "http");
		assert.equal(r.config.method, "POST");
		// A dotted slug registers under its NATIVE id rather than being wrapped in
		// an `app.` alias, which is what makes the verb bindings below resolve.
		assert.ok(
			r.config.slug.startsWith("tavily."),
			`slug ${r.config.slug} not namespaced`
		);
	}
	assert.ok(bySlug.has("tavily.search"));
	assert.ok(bySlug.has("tavily.extract"));
});

test("both tools carry a SERVER-SIDE Authorization secret header from env", () => {
	for (const r of manifest.runnables) {
		const sh = r.config.secret_headers;
		assert.ok(sh, `${r.id} missing secret_headers`);
		assert.equal(sh.Authorization, "Bearer env:RYU_TAVILY_API_KEY");
		// Never a literal token baked into a committed manifest.
		assert.doesNotMatch(sh.Authorization, /Bearer\s+[A-Za-z0-9_-]{16,}$/);
	}
});

test("both tools target the api.tavily.com host over https", () => {
	for (const r of manifest.runnables) {
		const u = new URL(r.config.url);
		assert.equal(u.protocol, "https:");
		assert.equal(u.hostname, "api.tavily.com");
	}
});

test("permission_grants gate egress to exactly the hosts the tools call", () => {
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:api.tavily.com",
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

test("provides the web.search and web.extract capabilities", () => {
	assert.equal(provides.length, 2);
	assert.ok(byCapability.has("web.search"));
	assert.ok(byCapability.has("web.extract"));
});

test("every provides entry is selectable and claims no default", () => {
	for (const p of provides) {
		// Selectability requires UNANIMITY across all providers of a capability: if
		// any one omits it, the capability resolves to nothing at all. Tavily is a
		// second provider alongside exa/spider, so this flag is load-bearing.
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

test("search normalizes into the canonical result shape", () => {
	const binding = byCapability.get("web.search").tools["web.search"];
	assert.equal(binding.response.results, "results");
	// The canonical item keys other providers also produce, so a swap is invisible.
	for (const key of ["title", "url", "snippet"]) {
		assert.ok(
			Object.hasOwn(binding.response.fields, key),
			`missing canonical field ${key}`
		);
	}
});

test("extract wraps the single canonical url into Tavily's urls array", () => {
	const binding = byCapability.get("web.extract").tools["web.extract"];
	// The canonical verb passes one `url`; Tavily's API takes a batch `urls`.
	assert.equal(binding.args.url, "urls[]");
});

// --- BYOK settings tab -------------------------------------------------------
// The key is env-only at the tool layer (`env:RYU_TAVILY_API_KEY`). The settings
// tab is the ONLY UI a user has for it: a `secret` field whose pref_key is exactly
// that env var name, which the secret-header resolver falls back to when the
// process env has no such variable.

test("contributes exactly one settings tab, declarative and node-scoped", () => {
	const tabs = manifest.contributes?.settings_tabs;
	assert.ok(Array.isArray(tabs), "no contributes.settings_tabs");
	assert.equal(tabs.length, 1);
	const [tab] = tabs;
	assert.equal(tab.id, "tavily.settings");
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

test("one key powers BOTH capabilities tavily provides", () => {
	// Tavily is the only provider here that backs two layers (web.search and
	// web.extract) off a single credential, so one settings field is correct —
	// a second would be a duplicate pref_key and the loader rejects that.
	const field = manifest.contributes.settings_tabs[0].fields[0];
	const capabilities = manifest.provides.map((p) => p.capability);
	assert.deepEqual([...capabilities].sort(), ["web.extract", "web.search"]);
	assert.equal(field.pref_key, "RYU_TAVILY_API_KEY");
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
	// Tavily as their web.search / web.extract layer.
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
		"tavily.manifest.json"
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
			'include_str!("../../../../plugins-store/plugins/tavily/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});
