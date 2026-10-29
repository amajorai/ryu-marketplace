// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.
import { isNativeText } from "../../../tools/dist/native-primitive-observation.mjs";

// Co-located contract test for the `tavily` plugin.
// Runner: `node --test` (no external runtime dependencies).
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
const plugin = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));

const manifest = JSON.parse(raw);

test("has required top-level identity fields", () => {
	assert.equal(manifest.id, "@ryu/tavily");
	assert.equal(isNativeText(manifest.name), true);
	assert.ok(manifest.name.length > 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
	assert.equal(plugin.version, manifest.version);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, manifest.name);
});

test("declares an engines.ryu constraint", () => {
	assert.equal(isNativeText(manifest.engines?.ryu), true);
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
	// `tool:execute` is the grant Core gates the web.extract adapter on.
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:api.tavily.com",
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

test("verb keys are canonical dotted ids under the right capability", () => {
	// Replacing the canonical dot with an underscore (`web_search`) is not an error
	// anywhere — the verb lookup simply misses and the layer silently serves nothing.
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

const extractCode = readFileSync(
	join(
		here,
		byCapability.get("web.extract").tools["web.extract"].adapter.code_file
	),
	"utf8"
);

async function runExtract(input, response) {
	const { runOnce } = await import("../../../tools/toolsmith/harness.mjs");
	return runOnce({
		kind: "adapter",
		code: extractCode,
		adapterTools: [],
		testCase: { input, provider: { call: [response] } },
	});
}

test("extract is an adapter whose format enum matches Tavily's", () => {
	const binding = byCapability.get("web.extract").tools["web.extract"];
	assert.equal(binding.tool, "tavily.extract");
	assert.equal(binding.adapter.code_file, "adapters/web.extract.js");
	// An adapter REPLACES the declarative mapping; carrying both would describe the
	// same transformation twice and only one of them would run.
	assert.equal(binding.args, undefined);
	assert.equal(binding.response, undefined);
	assert.deepEqual(
		bySlug.get("tavily.extract").config.input_schema.properties.format.enum,
		["markdown", "text"]
	);
});

test("extract wraps the url, maps markdown/text and leaves html unmapped", async () => {
	const item = { url: "https://a.example/x", raw_content: "Body" };
	for (const [format, forwarded] of [
		["markdown", "markdown"],
		["text", "text"],
		["html", undefined],
		[undefined, undefined],
	]) {
		const { value, calls } = await runExtract(
			{ url: "https://a.example/x", format },
			{ results: [item] }
		);
		const args = { urls: ["https://a.example/x"] };
		if (forwarded) {
			args.format = forwarded;
		}
		assert.deepEqual(calls, [{ path: "callTool", args }], String(format));
		assert.deepEqual(value, {
			results: [{ url: "https://a.example/x", content: "Body", raw: item }],
		});
	}
});

test("extract passes a failure envelope through under raw", async () => {
	for (const failure of [
		{ available: false, reason: "endpoint returned HTTP 401" },
		{ status: 500, body: "boom" },
		null,
	]) {
		const { value } = await runExtract({ url: "https://a.example/x" }, failure);
		assert.deepEqual(value, { raw: failure });
	}
});

test("search defaults and schema bounds match the provider request contract", () => {
	const config = bySlug.get("tavily.search").config;
	assert.deepEqual(config.body_defaults, {
		max_results: 10,
		search_depth: "basic",
	});
	assert.equal(config.unwrap_body, true);
	assert.equal(config.fail_open, true);
	assert.deepEqual(config.input_schema.additionalProperties, undefined);
	assert.deepEqual(config.input_schema.properties.max_results, {
		type: "integer",
		description: "Number of results to return (default 10).",
		minimum: 1,
		maximum: 20,
	});
	assert.deepEqual(config.input_schema.properties.search_depth.enum, [
		"basic",
		"advanced",
	]);
});

test("extract accepts a required array and never accepts a caller-supplied credential", () => {
	const schema = bySlug.get("tavily.extract").config.input_schema;
	assert.deepEqual(schema.required, ["urls"]);
	assert.equal(schema.properties.urls.type, "array");
	assert.equal(schema.properties.urls.items.type, "string");
	for (const runnable of manifest.runnables) {
		const propertyNames = Object.keys(runnable.config.input_schema.properties);
		assert.equal(propertyNames.includes("api_key"), false);
		assert.equal(propertyNames.includes("authorization"), false);
		assert.equal(propertyNames.includes("headers"), false);
	}
});

test("both provider tools deliberately use identical degradation semantics", () => {
	for (const runnable of manifest.runnables) {
		assert.equal(runnable.config.fail_open, true, runnable.config.slug);
		assert.equal(runnable.config.unwrap_body, true, runnable.config.slug);
	}
});

test("portable projection publishes identity but no native secret or endpoint", () => {
	const extension = plugin.extensions["com.ryuhq.ryu"];
	assert.deepEqual(Object.keys(extension).sort(), ["displayName", "id"]);
	const portableText = JSON.stringify(plugin);
	assert.equal(portableText.includes("RYU_TAVILY_API_KEY"), false);
	assert.equal(portableText.includes("Authorization"), false);
	assert.equal(portableText.includes("api.tavily.com"), false);
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
	assert.equal(isNativeText(tab.title), true);
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
	assert.equal(isNativeText(field.label), true);
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
