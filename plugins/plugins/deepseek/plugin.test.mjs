// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.
import { isNativeText } from "../../../tools/dist/native-primitive-observation.mjs";

// Co-located contract test for the `deepseek` plugin.
// Runner: `node --test` (no external runtime dependencies).
//
// `deepseek` is a declarative HTTP-tool plugin and a capability provider for the
// swappable `web.search` / `web.extract` layers. Both verbs are bound
// declaratively (no adapter), so these tests cover the manifest contract and the
// verb-binding contract, since a typo in a verb key or a renamed argument is
// otherwise silent — the layer just stops serving that verb.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, "manifest.json"), "utf8");
const plugin = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));

const manifest = JSON.parse(raw);

test("has required top-level identity fields", () => {
	assert.equal(manifest.id, "@ryu/deepseek");
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

test("contributes two POST http tool runnables with namespaced native slugs", () => {
	assert.equal(manifest.runnables.length, 2);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(r.config.backend, "http");
		assert.equal(r.config.method, "POST");
		assert.ok(
			r.config.slug.startsWith("deepseek."),
			`slug ${r.config.slug} not namespaced`
		);
	}
	assert.ok(bySlug.has("deepseek.search"));
	assert.ok(bySlug.has("deepseek.fetch"));
});

test("tools call the documented DeepSeek Search / Fetch endpoints over https", () => {
	assert.equal(
		bySlug.get("deepseek.search").config.url,
		"https://api.deepseek.com/v1/tools/search"
	);
	assert.equal(
		bySlug.get("deepseek.fetch").config.url,
		"https://api.deepseek.com/v1/tools/fetch"
	);
});

test("both tools carry a SERVER-SIDE Authorization secret header from env", () => {
	for (const r of manifest.runnables) {
		const sh = r.config.secret_headers;
		assert.ok(sh, `${r.id} missing secret_headers`);
		assert.equal(sh.Authorization, "Bearer env:RYU_DEEPSEEK_API_KEY");
		assert.doesNotMatch(sh.Authorization, /Bearer\s+[A-Za-z0-9_-]{16,}$/);
	}
});

test("permission_grants gate egress to exactly the host the tools call", () => {
	// No adapter, so no `tool:execute`: the bindings are purely declarative.
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:api.deepseek.com",
	]);
	for (const r of manifest.runnables) {
		const host = new URL(r.config.url).hostname;
		assert.ok(
			manifest.permission_grants.includes(`tool:http-egress:${host}`),
			`no egress grant for called host ${host}`
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

test("search defaults and schema bounds match DeepSeek's request contract", () => {
	const config = bySlug.get("deepseek.search").config;
	assert.deepEqual(config.body_defaults, { count: 10 });
	assert.deepEqual(config.input_schema.required, ["query"]);
	const { query, count, ori_question, need_content } =
		config.input_schema.properties;
	assert.equal(query.minLength, 1);
	assert.equal(query.maxLength, 128);
	assert.equal(count.minimum, 1);
	assert.equal(count.maximum, 50);
	assert.equal(ori_question.maxLength, 128);
	assert.equal(need_content.type, "boolean");
});

test("fetch takes exactly one required url", () => {
	const schema = bySlug.get("deepseek.fetch").config.input_schema;
	assert.deepEqual(schema.required, ["url"]);
	assert.deepEqual(Object.keys(schema.properties), ["url"]);
	assert.equal(schema.properties.url.maxLength, 8192);
});

test("no tool accepts a caller-supplied credential", () => {
	for (const runnable of manifest.runnables) {
		const names = Object.keys(runnable.config.input_schema.properties);
		for (const banned of ["api_key", "authorization", "headers"]) {
			assert.equal(names.includes(banned), false, runnable.config.slug);
		}
	}
});

test("both provider tools use identical degradation semantics", () => {
	for (const runnable of manifest.runnables) {
		assert.equal(runnable.config.fail_open, true, runnable.config.slug);
		assert.equal(runnable.config.unwrap_body, true, runnable.config.slug);
	}
});

// ── Capability-provider contract (the swappable-layer seam) ─────────────────

const provides = manifest.provides ?? [];
const byCapability = new Map(provides.map((p) => [p.capability, p]));

test("provides web.search and web.extract under their canonical verbs", () => {
	assert.equal(provides.length, 2);
	for (const verb of ["web.search", "web.extract"]) {
		assert.deepEqual(Object.keys(byCapability.get(verb).tools), [verb]);
	}
});

test("every provides entry is selectable and claims no default", () => {
	for (const p of provides) {
		assert.equal(p.selectable, true, `${p.capability} must be selectable`);
		assert.ok(
			p.default === undefined || p.default === false,
			`${p.capability} must not claim default`
		);
		assert.match(p.version, /^\d+\.\d+\.\d+/);
	}
});

test("each verb forwards declaratively to a tool this manifest declares", () => {
	for (const p of provides) {
		for (const [verb, binding] of Object.entries(p.tools)) {
			assert.ok(bySlug.has(binding.tool), `${verb} → ${binding.tool}`);
			assert.equal(binding.adapter, undefined, `${verb} must stay declarative`);
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
				assert.ok(
					Object.hasOwn(props, target),
					`${verb}: maps ${canonical} onto '${target}', which ${binding.tool} does not accept`
				);
			}
		}
	}
});

test("search clamps limit to DeepSeek's count range and maps canonical fields", () => {
	const binding = byCapability.get("web.search").tools["web.search"];
	assert.deepEqual(binding.args, { limit: "count" });
	const countSchema =
		bySlug.get("deepseek.search").config.input_schema.properties.count;
	assert.deepEqual(binding.arg_clamp.limit, {
		min: countSchema.minimum,
		max: countSchema.maximum,
	});
	assert.equal(binding.response.results, "results");
	assert.deepEqual(binding.response.fields, {
		title: "title",
		url: "url",
		// The ~600-800 character model-readable summary, not the short UI snippet.
		snippet: "summary",
		score: "rerank_score",
		published: "date",
	});
});

test("extract drops format and maps the single fetch record", () => {
	const binding = byCapability.get("web.extract").tools["web.extract"];
	assert.deepEqual(binding.args, { format: "" });
	// No `results` path: a fetch answers with one record, not an array.
	assert.equal(binding.response.results, undefined);
	assert.deepEqual(binding.response.fields, {
		title: "title",
		content: "content",
	});
});

test("portable projection publishes identity but no native secret or endpoint", () => {
	const extension = plugin.extensions["com.ryuhq.ryu"];
	assert.deepEqual(Object.keys(extension).sort(), ["displayName", "id"]);
	const portableText = JSON.stringify(plugin);
	assert.equal(portableText.includes("RYU_DEEPSEEK_API_KEY"), false);
	assert.equal(portableText.includes("Authorization"), false);
	assert.equal(portableText.includes("api.deepseek.com"), false);
});

// --- BYOK settings tab -------------------------------------------------------

test("contributes exactly one declarative, node-scoped settings tab", () => {
	const tabs = manifest.contributes?.settings_tabs;
	assert.ok(Array.isArray(tabs));
	assert.equal(tabs.length, 1);
	const [tab] = tabs;
	assert.equal(tab.id, "deepseek.settings");
	assert.equal(isNativeText(tab.title), true);
	assert.equal(tab.scope, "node");
	assert.equal(tab.view, undefined);
	assert.equal(tab.fields.length, 1);
});

test("the secret field pref_key IS the env var the tools reference", () => {
	const field = manifest.contributes.settings_tabs[0].fields[0];
	assert.equal(field.type, "secret");
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
	// Deliberately NOT the model provider's DEEPSEEK_API_KEY: configuring chat
	// models must not silently turn on a billed search layer.
	assert.notEqual(field.pref_key, "DEEPSEEK_API_KEY");
});

test("the secret field is labelled, sourced, optional and unbounded", () => {
	const field = manifest.contributes.settings_tabs[0].fields[0];
	assert.equal(isNativeText(field.label), true);
	assert.ok(field.description?.includes("https://"));
	assert.match(field.description, /encrypted/i);
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
	assert.notEqual(field.required, true);
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(here, "..", "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}
	assert.ok(
		!existsSync(
			join(coreSrc, "plugin_manifest", "fixtures", "deepseek.manifest.json")
		),
		"a fixture copy would shadow this manifest"
	);
	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/deepseek/manifest.json")'
		),
		"Core does not compile this manifest in from its package home"
	);
});
