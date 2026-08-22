// Co-located contract test for the `honcho` plugin.
// Runner: `node --test` (zero dependencies).
//
// `honcho` is a declarative HTTP-tool plugin AND a capability provider for the
// swappable `memory` layer. It is the FIRST provider anywhere to bind
// `memory.context`, so several of the assertions below are not about "is this
// manifest well-formed" but about the exact shapes `apps/core/src/memory_provider.rs`
// reads. Every one of those failure modes is SILENT — the layer resolves, the call
// succeeds, and nothing reaches the prompt — which is why they are pinned here.

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
	assert.equal(manifest.id, "@ryu/honcho");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("declares an engines.ryu constraint", () => {
	assert.equal(typeof manifest.engines?.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
});

const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("contributes five http tool runnables with namespaced native slugs", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 5);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(r.config.backend, "http");
		assert.equal(r.config.method, "POST");
		// A slug containing `__` registers under its NATIVE id rather than being
	// wrapped in `app.`, which is what makes the verb bindings below resolve.
		assert.ok(
			r.config.slug.startsWith("honcho."),
			`slug ${r.config.slug} not namespaced`
		);
	}
	assert.ok(bySlug.has("honcho.chat"));
	assert.ok(bySlug.has("honcho.search"));
	// The WRITE side: a message append plus the two caller-named upserts that make
	// writing work on a fresh install without any manual setup in Honcho.
	assert.ok(bySlug.has("honcho.messages"));
	assert.ok(bySlug.has("honcho.session_upsert"));
	assert.ok(bySlug.has("honcho.peer_upsert"));
});

test("both tools carry a SERVER-SIDE Bearer secret header from env", () => {
	for (const r of manifest.runnables) {
		const sh = r.config.secret_headers;
		assert.ok(sh, `${r.id} missing secret_headers`);
		// Honcho's OpenAPI declares exactly one security scheme:
		// `HTTPBearer: {type: http, scheme: bearer}`. `Token <key>` (Mem0's scheme)
		// would 401 here.
		assert.equal(sh.Authorization, "Bearer env:RYU_HONCHO_API_KEY");
		// Never a literal token baked into a committed manifest.
		assert.doesNotMatch(sh.Authorization, /Bearer\s+[A-Za-z0-9_-]{16,}$/);
	}
});

test("both tools target api.honcho.dev over https on the documented v3 paths", () => {
	const paths = new Set();
	for (const r of manifest.runnables) {
		// A path template with `{}` placeholders is still a legal URL to parse.
		const u = new URL(r.config.url);
		assert.equal(u.protocol, "https:");
		// `servers: - url: https://api.honcho.dev` in Honcho's own OpenAPI.
		assert.equal(u.hostname, "api.honcho.dev");
		assert.ok(u.pathname.startsWith("/v3/"), `${u.pathname} is not a v3 path`);
		paths.add(u.pathname);
	}
	assert.deepEqual([...paths].sort(), [
		"/v3/workspaces/%7Bworkspace_id%7D/peers",
		"/v3/workspaces/%7Bworkspace_id%7D/peers/%7Bpeer_id%7D/chat",
		"/v3/workspaces/%7Bworkspace_id%7D/peers/%7Bpeer_id%7D/search",
		"/v3/workspaces/%7Bworkspace_id%7D/sessions",
		"/v3/workspaces/%7Bworkspace_id%7D/sessions/%7Bsession_id%7D/messages",
	]);
});

test("both tools are fail_open and unwrap the upstream body", () => {
	for (const r of manifest.runnables) {
		// fail_open: a missing/rejected key degrades to `{available:false}` rather
		// than erroring, so `memory` falls back to another provider.
		assert.equal(r.config.fail_open, true);
		// unwrap_body: the facade's `{provider, raw}` passthrough must wrap Honcho's
		// OWN body. With the `{status, body}` envelope, `summary_text` would look for
		// `content` inside `{status, body}` and find nothing.
		assert.equal(r.config.unwrap_body, true);
	}
});

test("permission_grants gate egress to exactly the hosts the tools call", () => {
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:api.honcho.dev",
		// The write verbs are ADAPTED (Honcho needs the peer id nested inside
		// messages[], which no declarative field can reach), and running adapter
		// code is gated on this grant.
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

test("every URL path placeholder is a declared, required argument", () => {
	// `build_rest_request` fills `{name}` from the args map and ERRORS when one has
	// no match, so a placeholder the schema never declares is a tool that can only
	// ever fail.
	for (const r of manifest.runnables) {
		const names = [...r.config.url.matchAll(/\{([^{}/]+)\}/g)].map((m) => m[1]);
		// Every Honcho route is workspace-scoped; the rest depends on the resource.
		assert.equal(names[0], "workspace_id");
		assert.ok(
			names.length <= 2,
			`${r.config.slug}: unexpected path placeholders ${names.join(",")}`
		);
		for (const name of names) {
			assert.ok(
				Object.hasOwn(r.config.input_schema.properties, name),
				`${r.config.slug}: path param ${name} not in input_schema`
			);
			assert.ok(
				r.config.input_schema.required.includes(name),
				`${r.config.slug}: path param ${name} must be required — the request cannot be built without it`
			);
		}
	}
});

test("the dialectic tool does NOT expose `stream`", () => {
	// The 200 response declares `text/event-stream: {}` when `stream` is true, and an
	// SSE body is not a JSON tool result.
	const props = bySlug.get("honcho.chat").config.input_schema.properties;
	assert.equal(props.stream, undefined);
});

test("reasoning_level is pinned fast by body_defaults", () => {
	// `deep_merge_json` applies body_defaults UNDER the args, so this is the
	// out-of-the-box value AND remains overridable by the `pref:` token below.
	// It matters because `memory_provider::PROVIDER_TIMEOUT` is 4s and a deeper
	// Dialectic pass routinely costs more, which would make `memory.context`
	// resolve and then silently never arrive.
	const chat = bySlug.get("honcho.chat").config;
	assert.equal(chat.body_defaults.reasoning_level, "minimal");
	assert.ok(
		chat.input_schema.properties.reasoning_level.enum.includes("minimal"),
		"body_defaults must name a value the documented enum allows"
	);
});

test("search declares no `filters` argument", () => {
	// `MessageSearchOptions.filters` is `additionalProperties: true` with no
	// documented key set at this endpoint. Shipping it would be a schema field this
	// manifest cannot describe.
	const props = bySlug.get("honcho.search").config.input_schema.properties;
	assert.equal(props.filters, undefined);
});

// ── Capability-provider contract (the swappable-layer seam) ─────────────────

const provides = manifest.provides ?? [];
const byCapability = new Map(provides.map((p) => [p.capability, p]));

test("provides exactly the memory capability", () => {
	assert.equal(provides.length, 1);
	assert.ok(byCapability.has("memory"));
	assert.match(byCapability.get("memory").version, /^\d+\.\d+\.\d+/);
});

test("memory is selectable and claims no default", () => {
	const entry = byCapability.get("memory");
	// Selectability requires UNANIMITY across all providers of a capability: if any
	// one omits it, the capability resolves to nothing at all.
	assert.equal(entry.selectable, true);
	// `@ryu/memory` is the declared default and must stay the zero-config pick.
	assert.ok(
		entry.default === undefined || entry.default === false,
		"memory must not claim default — @ryu/memory owns it"
	);
});

test("binds the two read verbs and the two write verbs", () => {
	// A single-underscore typo (`memory_context`) is not an error anywhere — the verb
	// lookup simply misses and the layer silently serves nothing. Hence this test.
	assert.deepEqual(Object.keys(byCapability.get("memory").tools).sort(), [
		"memory.context",
		"memory.search",
		"memory.store",
		"memory.sync",
	]);
});

test("memory.forget stays unbound — Honcho has no delete endpoint", () => {
	// The one gap no adapter can close. Honcho documents no message-delete endpoint,
	// and binding the verb anyway would offer the model a delete that cannot happen.
	assert.equal(byCapability.get("memory").tools["memory.forget"], undefined);
});

test("the write verbs are ADAPTED, because the peer id must nest inside messages[]", () => {
	// The reason both write verbs were unbound for this provider's whole life:
	// Honcho's write requires `messages[].peer_id`, that peer is per-install
	// configuration, and `arg_template` substitutes only from CALLER arguments so it
	// can never see a resolved `pref:`. An adapter receives them already resolved.
	const tools = byCapability.get("memory").tools;
	for (const verb of ["memory.sync", "memory.store"]) {
		const binding = tools[verb];
		assert.equal(binding.tool, "honcho.messages");
		assert.ok(binding.adapter, `${verb} must carry an adapter`);
		// Both upserts must be declared: an id missing from `adapter.tools` is
		// refused host-side at call time, which would break the verb only when run.
		assert.deepEqual(binding.adapter.tools, [
			"honcho.peer_upsert",
			"honcho.session_upsert",
		]);
		// An adapter REPLACES the declarative mapping; declaring both would describe
		// the same transformation twice and only one would run.
		assert.equal(binding.response, undefined);
		assert.equal(binding.args, undefined);
		// Invariant: a payload that is not a result set is passed through, never
		// reshaped into a success.
		assert.match(binding.adapter.code, /return \{ raw: res \};/);
	}
});

test("the upsert repair fires ONLY on a missing resource, not on any failure", () => {
	// These tools are fail_open, so a bad API key returns {available,reason,hint}
	// and every other non-2xx returns {status,body}. Gating the repair on "the
	// result is not an array" would retry on ALL of those, turning one bad key into
	// four upstream requests EVERY turn on a default-on path. Only a missing
	// session or peer is fixable by upserting.
	for (const verb of ["memory.sync", "memory.store"]) {
		const code = byCapability.get("memory").tools[verb].adapter.code;
		assert.match(
			code,
			/if \(res && \(res\.status === 404 \|\| res\.status === 422\)\) \{/,
			`${verb}: the repair must be gated on a missing-resource status`
		);
		assert.doesNotMatch(
			code,
			/if \(!Array\.isArray\(res\)\) \{\s*\n\s*await callNamed/,
			`${verb}: must not retry on every non-array result`
		);
	}
});

test("an assistant turn is never attributed to the user's peer", () => {
	// Honcho derives a representation OF a peer from that peer's messages. Writing
	// Ryu's own replies as the user would poison it, so replies go to a separate
	// peer. This is a correctness property of the memory model, not a preference.
	const code = byCapability.get("memory").tools["memory.sync"].adapter.code;
	assert.match(code, /input\.role === "assistant"/);
	assert.match(code, /assistant_peer_id/);
});

test("the write path falls back in CODE, where a default actually applies", () => {
	// A settings field's `default` is UI-only and is never written to the
	// preferences store, so an unset session id would DROP its argument and hard-fail
	// with `missing path parameter(s)`. The fallback has to live in the adapter.
	for (const verb of ["memory.sync", "memory.store"]) {
		const code = byCapability.get("memory").tools[verb].adapter.code;
		assert.match(code, /defaults\.session_id \|\| "ryu"/);
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
				const field = target.endsWith("[]") ? target.slice(0, -2) : target;
				assert.ok(
					Object.hasOwn(props, field),
					`${verb}: maps ${canonical} onto '${field}', which ${binding.tool} does not accept`
				);
			}
		}
	}
});

test("arg_defaults target arguments the provider tool really accepts", () => {
	// `arg_defaults` are merged into the SAME args map the tool receives, so a key
	// the tool does not declare is dead weight — and for a path placeholder it is
	// the difference between a working call and `missing path parameter(s)`.
	for (const p of provides) {
		for (const [verb, binding] of Object.entries(p.tools)) {
			if (binding.adapter) {
				// An adapter receives `arg_defaults` as its `defaults` object and
				// builds the request itself, so they are never merged into the args
				// map and need not be arguments of the tool at all. That is the whole
				// point: `assistant_peer_id` is configuration, not a request field.
				continue;
			}
			const props = bySlug.get(binding.tool).config.input_schema.properties;
			for (const name of Object.keys(binding.arg_defaults ?? {})) {
				assert.ok(
					Object.hasOwn(props, name),
					`${verb}: arg_defaults sets '${name}', which ${binding.tool} does not accept`
				);
			}
		}
	}
});

test("no verb declares an arg_clamp", () => {
	// Honcho's `limit` maxes at 100 and the canonical `memory.search` limit at 50,
	// so a clamp would narrow nothing. The grammar says not to declare one that never
	// narrows, and a no-op clamp reads like a real constraint to the next editor.
	for (const p of provides) {
		for (const [verb, binding] of Object.entries(p.tools)) {
			assert.equal(
				binding.arg_clamp,
				undefined,
				`${verb} declares a no-op arg_clamp`
			);
		}
	}
});

// --- The two shapes memory_provider.rs reads ---------------------------------

test("memory.context declares NO response map, on purpose", () => {
	// `memory_provider::summary_text` reads `context`/`summary`/`content`/`text` at
	// the top level or one level inside `raw`. With no response map the facade
	// returns `{provider, raw: <Honcho body>}` and Honcho's documented body is
	// `{"content": …}` — so `raw.content` is exactly where it looks. ANY response map
	// would rewrite the payload into `{provider, results: [...]}`, which that function
	// cannot read, and the context bridge would silently inject nothing.
	const binding = byCapability.get("memory").tools["memory.context"];
	assert.equal(binding.response, undefined);
	assert.equal(binding.tool, "honcho.chat");
});

test("memory.context pins workspace, peer and reasoning from preferences", () => {
	const binding = byCapability.get("memory").tools["memory.context"];
	assert.deepEqual(binding.arg_defaults, {
		workspace_id: "pref:honcho.workspace-id",
		peer_id: "pref:honcho.peer-id",
		reasoning_level: "pref:honcho.reasoning-level",
	});
});

test("memory.search normalizes into the canonical item shape", () => {
	const binding = byCapability.get("memory").tools["memory.search"];
	// `results` is OMITTED because the payload IS the record set — Honcho answers a
	// bare array of Message. Declaring a path here would find nothing and the facade
	// would fall back to the raw passthrough.
	assert.equal(binding.response.results, undefined);
	// `content` is the first key `memory_provider::fact_text` reads; without it the
	// prefetch bridge resolves, returns items, and injects nothing.
	assert.equal(binding.response.fields.content, "content");
	assert.equal(binding.response.fields.id, "id");
});

test("memory.search drops `scope`, which Honcho has no concept of", () => {
	const binding = byCapability.get("memory").tools["memory.search"];
	assert.equal(binding.args.scope, "");
	// `query` and `limit` pass through unmapped because Honcho's names already match;
	// re-mapping them onto themselves would be noise that can drift.
	assert.equal(binding.args.query, undefined);
	assert.equal(binding.args.limit, undefined);
});

// --- BYOK + per-install scoping settings -------------------------------------

test("contributes exactly one settings tab, declarative and node-scoped", () => {
	const tabs = manifest.contributes?.settings_tabs;
	assert.ok(Array.isArray(tabs), "no contributes.settings_tabs");
	assert.equal(tabs.length, 1);
	const [tab] = tabs;
	assert.equal(tab.id, "honcho.settings");
	assert.equal(typeof tab.title, "string");
	assert.ok(tab.title.length > 0);
	// Both the secret-header resolver and the `pref:` token resolver run in Core ON
	// THE NODE, so they can only read a node-scoped preference. A `user`
	// (client-local) scope would be invisible to both.
	assert.equal(tab.scope, "node");
	// Declarative fields, not a bespoke component.
	assert.equal(tab.view, undefined);
});

const fields = manifest.contributes.settings_tabs[0].fields;
const byPrefKey = new Map(fields.map((f) => [f.pref_key, f]));

test("every pref: token referenced by a binding has a settings field", () => {
	// This is the assertion that catches a rename on ONE side. Without a reader, the
	// token never resolves, the argument drops, and either the workspace vanishes
	// from the URL or the reasoning level silently reverts.
	const referenced = new Set();
	for (const p of provides) {
		for (const binding of Object.values(p.tools)) {
			for (const value of Object.values(binding.arg_defaults ?? {})) {
				if (typeof value === "string" && value.startsWith("pref:")) {
					referenced.add(value.slice("pref:".length));
				}
			}
		}
	}
	assert.deepEqual([...referenced].sort(), [
		"honcho.assistant-peer-id",
		"honcho.peer-id",
		"honcho.reasoning-level",
		"honcho.session-id",
		"honcho.workspace-id",
	]);
	for (const key of referenced) {
		assert.ok(byPrefKey.has(key), `no settings field writes ${key}`);
	}
});

test("the secret field pref_key IS the env var the tools reference", () => {
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
	const [envVar] = [...envVars];
	assert.equal(envVar, "RYU_HONCHO_API_KEY");
	const field = byPrefKey.get(envVar);
	assert.ok(field, "no settings field writes the API key env var");
	assert.equal(field.type, "secret");
});

test("the secret field carries a real label and a sourcing description", () => {
	const field = byPrefKey.get("RYU_HONCHO_API_KEY");
	assert.equal(typeof field.label, "string");
	assert.ok(field.label.length > 0);
	assert.ok(
		field.description?.includes("https://"),
		"description must say where to get the key"
	);
	assert.match(field.description, /encrypted/i);
});

test("the secret field declares no bounds, default, or options", () => {
	const field = byPrefKey.get("RYU_HONCHO_API_KEY");
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
	// The tools are fail_open: a missing key degrades, it does not error.
	assert.notEqual(field.required, true);
});

test("workspace and peer are required text fields with no baked-in default", () => {
	for (const key of ["honcho.workspace-id", "honcho.peer-id"]) {
		const field = byPrefKey.get(key);
		assert.equal(field.type, "text");
		// Required, because an unresolved token drops the argument and the call then
		// fails on a missing path parameter.
		assert.equal(field.required, true);
		assert.equal(typeof field.placeholder, "string");
		// A `default` here would be a hardcoded identifier by another name: every
		// install would share one Honcho bucket. The placeholder suggests without
		// writing anything.
		assert.equal(field.default, undefined, `${key} must not carry a default`);
	}
});

test("the reasoning-level select agrees with the documented enum and the body default", () => {
	const field = byPrefKey.get("honcho.reasoning-level");
	assert.equal(field.type, "select");
	const documented =
		bySlug.get("honcho.chat").config.input_schema.properties.reasoning_level
			.enum;
	assert.deepEqual(
		field.options.map((o) => o.value),
		documented
	);
	// The field's advertised default must match what actually happens when the pref
	// is UNSET — a settings-field default is a UI default and is not written to the
	// preference store until saved, so the effective value is body_defaults'.
	assert.equal(
		field.default,
		bySlug.get("honcho.chat").config.body_defaults.reasoning_level
	);
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
		"honcho.manifest.json"
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
			'include_str!("../../../../plugins-store/plugins/honcho/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});
