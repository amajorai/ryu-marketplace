// Co-located contract test for the `mem0` plugin.
// Runner: `node --test` (zero dependencies).
//
// `mem0` is a declarative HTTP-tool plugin AND the second provider of the `memory`
// capability — the one that makes that layer swappable at all, and the one that makes
// `apps/core/src/memory_provider.rs`'s kernel bridges reachable (each opens with
// `if !is_external().await { return }`, where "external" means "not com.ryu.memory").
// These tests therefore cover both the usual manifest contract and the verb-binding
// contract, since a typo in a verb key is otherwise silent — the layer just stops
// serving that verb.
//
// The WRITE half (`memory__store`, `memory__sync`) is bound through `arg_template`,
// which builds Mem0's documented `messages: [{role, content}]` body — a shape the flat
// rename table could not construct. Because the template is expanded in Core, the
// assertions here pin its literal structure against the documented request body, and
// pin the two things a copy-paste would get wrong: WHERE the entity id goes (nested in
// `filters` for search, top-level for add) and that the async write response is never
// mapped onto a canonical id.

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
	assert.equal(manifest.id, "mem0");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("declares an engines.ryu constraint", () => {
	assert.equal(typeof manifest.engines?.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
});

const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("contributes three http tool runnables with namespaced native slugs", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 3);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(r.config.backend, "http");
		// A slug containing `__` registers under its NATIVE id rather than being
		// prefixed with `app__`, which is what makes the verb bindings below resolve.
		assert.ok(
			r.config.slug.startsWith("mem0__"),
			`slug ${r.config.slug} not namespaced`
		);
	}
	assert.ok(bySlug.has("mem0__search"));
	assert.ok(bySlug.has("mem0__add"));
	assert.ok(bySlug.has("mem0__delete"));
});

test("each tool uses the HTTP method Mem0 documents for its endpoint", () => {
	// `POST /v3/memories/search/`, `POST /v3/memories/add/` and
	// `DELETE /v1/memories/{memory_id}/`. Getting the method wrong is a 405 that
	// fail_open would turn into a silent empty result.
	assert.equal(bySlug.get("mem0__search").config.method, "POST");
	assert.equal(bySlug.get("mem0__add").config.method, "POST");
	assert.equal(bySlug.get("mem0__delete").config.method, "DELETE");
});

test("tool urls are the exact documented Mem0 paths", () => {
	assert.equal(
		bySlug.get("mem0__search").config.url,
		"https://api.mem0.ai/v3/memories/search/"
	);
	// Note the API VERSION: add is v3 (same as search), delete is v1. Quoted from
	// docs.mem0.ai/api-reference/memory/add-memories.
	assert.equal(
		bySlug.get("mem0__add").config.url,
		"https://api.mem0.ai/v3/memories/add/"
	);
	assert.equal(
		bySlug.get("mem0__delete").config.url,
		"https://api.mem0.ai/v1/memories/{memory_id}/"
	);
});

test("delete keeps its status envelope while the two POSTs unwrap", () => {
	// `finalize_http_result` returns the parsed 2xx body VERBATIM under
	// `unwrap_body`. Mem0 documents delete as a 204, and an empty 204 payload parses
	// to `Value::String("")` — so unwrapping it hands the caller a bare empty string
	// that reads like a failure. The `{status, body}` envelope reports success either
	// way. Search and add really do answer JSON objects, so they unwrap.
	assert.equal(bySlug.get("mem0__search").config.unwrap_body, true);
	assert.equal(bySlug.get("mem0__add").config.unwrap_body, true);
	assert.equal(bySlug.get("mem0__delete").config.unwrap_body, false);
});

test("all tools are fail_open so a missing key degrades instead of erroring", () => {
	for (const r of manifest.runnables) {
		assert.equal(r.config.fail_open, true, `${r.config.slug} must fail open`);
	}
});

test("all tools carry a SERVER-SIDE Authorization secret header from env", () => {
	for (const r of manifest.runnables) {
		const sh = r.config.secret_headers;
		assert.ok(sh, `${r.id} missing secret_headers`);
		// Mem0's documented scheme is `Token <key>`, NOT `Bearer` — a Bearer prefix
		// here is a 401 on every call, which fail_open hides.
		assert.equal(sh.Authorization, "Token env:RYU_MEM0_API_KEY");
		// Never a literal token baked into a committed manifest.
		assert.doesNotMatch(sh.Authorization, /Token\s+[A-Za-z0-9_-]{16,}$/);
	}
});

test("all tools target the api.mem0.ai host over https", () => {
	for (const r of manifest.runnables) {
		// Strip the `{memory_id}` path placeholder before URL parsing.
		const u = new URL(r.config.url.replace(/\{[^}]+\}/g, "x"));
		assert.equal(u.protocol, "https:");
		assert.equal(u.hostname, "api.mem0.ai");
	}
});

test("permission_grants gate egress to exactly the hosts the tools call", () => {
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:api.mem0.ai",
	]);
	const hosts = new Set(
		manifest.runnables.map(
			(r) => new URL(r.config.url.replace(/\{[^}]+\}/g, "x")).hostname
		)
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

test("every url path placeholder is a declared, required tool argument", () => {
	// `build_rest_request` fills `{name}` from the args map and hard-errors with
	// "missing path parameter(s)" when it is absent — so an undeclared placeholder is
	// a tool that can never succeed.
	for (const r of manifest.runnables) {
		const names = [...r.config.url.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
		for (const name of names) {
			assert.ok(
				Object.hasOwn(r.config.input_schema.properties, name),
				`${r.config.slug}: path placeholder {${name}} is not a declared argument`
			);
			assert.ok(
				r.config.input_schema.required?.includes(name),
				`${r.config.slug}: path placeholder {${name}} must be required`
			);
		}
	}
});

test("mem0__add declares the documented add-memories request shape", () => {
	// Quoted from docs.mem0.ai/api-reference/memory/add-memories:
	//   messages  array  required  "Conversation turns for Mem0 to extract memories
	//                               from. Each object should include role and content."
	//   user_id   string           "Associates the memory with a user."
	//   infer     boolean, default true
	//                              "Set to false to skip inference and store the
	//                               provided text as-is."
	const sch = bySlug.get("mem0__add").config.input_schema;
	assert.deepEqual(sch.required, ["messages"]);
	assert.equal(sch.properties.messages.type, "array");
	assert.equal(sch.properties.messages.items.type, "object");
	assert.deepEqual(sch.properties.messages.items.required, ["role", "content"]);
	assert.deepEqual(sch.properties.messages.items.properties.role.enum, [
		"user",
		"assistant",
		"system",
	]);
	assert.equal(sch.properties.messages.items.properties.content.type, "string");
	assert.equal(sch.properties.user_id.type, "string");
	assert.equal(sch.properties.infer.type, "boolean");
	// `filters` is a SEARCH concept. Declaring it here would invite the copy-paste
	// this whole file exists to prevent.
	assert.equal(sch.properties.filters, undefined);
	// The description is the ONLY guard that exists against an agent reading the async
	// response and feeding `event_id` (a job id) to mem0__delete (which wants a memory
	// id). No manifest field can prevent that, so the prose is load-bearing and a
	// rewrite must not silently drop it.
	assert.match(bySlug.get("mem0__add").config.description, /event_id/);
});

// ── Capability-provider contract (the swappable-layer seam) ─────────────────

const provides = manifest.provides ?? [];
const byCapability = new Map(provides.map((p) => [p.capability, p]));
const memoryTools = byCapability.get("memory")?.tools ?? {};

test("provides exactly the memory capability", () => {
	assert.equal(provides.length, 1);
	assert.ok(byCapability.has("memory"));
	assert.match(byCapability.get("memory").version, /^\d+\.\d+\.\d+/);
});

test("the provides entry is selectable and claims no default", () => {
	const entry = byCapability.get("memory");
	// Selectability requires UNANIMITY across all providers of a capability: if any
	// one omits it, the capability resolves to nothing at all. mem0 is the SECOND
	// provider of `memory` (com.ryu.memory is the first), so this flag is what keeps
	// the layer serving anything once mem0 ships.
	assert.equal(entry.selectable, true, "memory must be selectable");
	// `com.ryu.memory` is the declared default for `memory`; exactly one provider per
	// capability may claim it, and the built-in stays the zero-config pick.
	assert.ok(
		entry.default === undefined || entry.default === false,
		"memory must not claim default — com.ryu.memory owns it"
	);
});

test("verb keys are canonical DOUBLE-underscore ids under the right capability", () => {
	// A single-underscore typo (`memory_search`) is not an error anywhere — the verb
	// lookup simply misses and the layer silently serves nothing. Hence this test.
	assert.deepEqual(
		Object.keys(memoryTools).sort(),
		["memory__forget", "memory__search", "memory__store", "memory__sync"],
		"memory must bind search, store, sync and forget"
	);
});

test("memory__context stays deliberately unbound", () => {
	// Mem0 publishes no standing-summary endpoint at all (see the memory section of
	// docs.mem0.ai/llms.txt: add, get-all, get, search, update, delete, delete-all,
	// batch-update, batch-delete, history, feedback, create-export, get-export).
	// Forcing the verb onto get-all would inject a raw fact dump at system rank under
	// a label promising the provider's own synthesis. So `memory.provider-context`
	// stays inert while Mem0 is selected, and that is the honest outcome.
	assert.ok(
		!Object.hasOwn(memoryTools, "memory__context"),
		"memory__context is bound, but Mem0 has no standing-summary endpoint"
	);
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

test("search renames limit onto Mem0's top_k and drops the scope it has no concept of", () => {
	const binding = memoryTools.memory__search;
	assert.equal(binding.args.limit, "top_k");
	// Mem0 has no scope levels; forwarding `scope` verbatim would be a silent schema
	// violation, so it is mapped to the empty string (an explicit drop).
	assert.equal(binding.args.scope, "");
});

test("forget renames the canonical id onto Mem0's path parameter", () => {
	const binding = memoryTools.memory__forget;
	assert.equal(binding.args.id, "memory_id");
});

test("search normalizes into the canonical memory result shape", () => {
	const binding = memoryTools.memory__search;
	// Mem0 answers `{results: [{id, memory, score, ...}]}`.
	assert.equal(binding.response.results, "results");
	// `content` is what `memory_provider::fact_text` and the built-in provider's own
	// mapping both produce, so a swap between the two is invisible downstream.
	assert.equal(binding.response.fields.content, "memory");
	assert.equal(binding.response.fields.id, "id");
	assert.equal(binding.response.fields.score, "score");
});

// ── The write verbs: arg_template builds Mem0's documented body ─────────────

test("memory__store templates the documented messages array", () => {
	// Documented request body (docs.mem0.ai/api-reference/memory/add-memories):
	//   {"messages":[{"role":"user","content":"I moved to Austin last month."}],
	//    "user_id":"alice"}
	// A string that is EXACTLY "{arg}" is replaced by that argument's value with its
	// JSON type preserved, so `{content}` yields the caller's string in position.
	const binding = memoryTools.memory__store;
	assert.equal(binding.tool, "mem0__add");
	assert.deepEqual(binding.arg_template, {
		messages: [{ role: "user", content: "{content}" }],
	});
	// The canonical arg the template consumes must be a real property of the verb —
	// `memory__store` is `{content, scope?, category?, importance?, when_to_use?}`.
	assert.match(binding.arg_template.messages[0].content, /^\{content\}$/);
});

test("memory__sync carries the turn's role through the template", () => {
	const binding = memoryTools.memory__sync;
	assert.equal(binding.tool, "mem0__add");
	assert.deepEqual(binding.arg_template, {
		messages: [{ role: "{role}", content: "{content}" }],
	});
	// `role` is a PLACEHOLDER, not a pinned literal, and that is the decision worth
	// pinning. Canonical `memory__sync` is `{content, role?}`; an absent placeholder
	// drops its field, so a caller that omits `role` produces `{"content": …}`, which
	// Mem0 does not document and will reject. That is accepted deliberately: pinning
	// `"user"` would relabel assistant turns as the user's own words and Mem0's
	// inference would store them as facts about the user — silent corruption, worse
	// than a rejected fire-and-forget write. `memory_provider::sync_turn` always
	// passes a role, and there is no grammar for defaulting a value INSIDE a template
	// (`arg_defaults` merges under the template output, so it would be overwritten).
	assert.notEqual(binding.arg_template.messages[0].role, "user");
});

test("template placeholders name only canonical arguments of their verb", () => {
	// A typo (`{contents}`) is silent: the placeholder never resolves, the field is
	// dropped, and Mem0 gets a message with no content.
	const canonical = {
		memory__store: ["content", "scope", "category", "importance", "when_to_use"],
		memory__sync: ["content", "role"],
	};
	for (const [verb, allowed] of Object.entries(canonical)) {
		const seen = JSON.stringify(memoryTools[verb].arg_template).matchAll(
			/\{([a-z_]+)\}/g
		);
		for (const [, name] of seen) {
			assert.ok(
				allowed.includes(name),
				`${verb}: template references {${name}}, not a canonical argument`
			);
		}
	}
});

test("arg_template top-level fields are arguments the provider tool accepts", () => {
	// The `args`/`arg_defaults` cross-checks below do not cover template output, so a
	// template writing an undeclared field would go unnoticed here and land as an
	// undocumented body field upstream.
	for (const p of provides) {
		for (const [verb, binding] of Object.entries(p.tools)) {
			const props = bySlug.get(binding.tool).config.input_schema.properties;
			for (const key of Object.keys(binding.arg_template ?? {})) {
				assert.ok(
					Object.hasOwn(props, key),
					`${verb}: arg_template writes '${key}', which ${binding.tool} does not accept`
				);
			}
		}
	}
});

test("store drops the canonical fields Mem0's request has no home for", () => {
	// Unmapped canonical arguments pass through UNDER THEIR OWN NAME, so without an
	// explicit `""` these would land as undocumented top-level body fields on
	// /v3/memories/add/. They are deliberately not folded into Mem0's `metadata`
	// either: this provider's search binding never filters on metadata, so they would
	// be write-only, and a content-only call would produce `metadata: {}`.
	const binding = memoryTools.memory__store;
	for (const arg of ["scope", "category", "importance", "when_to_use"]) {
		assert.equal(binding.args[arg], "", `${arg} must be explicitly dropped`);
	}
	// `content` is consumed by the template, so a drop for it would be dead config:
	// `map_args_with_defaults` skips consumed keys BEFORE consulting `args`.
	assert.equal(binding.args.content, undefined);
});

test("sync declares no dead arg drops", () => {
	// Both canonical arguments of `memory__sync` are consumed by the template, and a
	// consumed key never reaches the rename pass — so any `args` entry here could
	// never fire.
	assert.equal(memoryTools.memory__sync.args, undefined);
});

test("store skips Mem0's inference, sync delegates to it", () => {
	// The one documented field that makes two verbs on ONE endpoint meaningful.
	// Mem0: `infer` boolean, default true — "Set to false to skip inference and store
	// the provided text as-is."
	//   memory__store = "a fact you have already decided on" -> store as-is.
	//   memory__sync  = "let IT decide what is worth remembering" -> Mem0's default.
	assert.equal(memoryTools.memory__store.arg_defaults.infer, false);
	assert.equal(memoryTools.memory__sync.arg_defaults.infer, undefined);
});

test("neither write verb maps the async job envelope onto a canonical field", () => {
	// `POST /v3/memories/add/` answers `{message, status: "PENDING", event_id}` — a
	// JOB id, not a memory id. Mapping `event_id` onto the canonical `id` would let an
	// agent chain memory__forget onto a store result and delete nothing (or worse).
	// Omitting `response` entirely is correct: the payload passes through under
	// `{provider, raw}`, and both kernel bridges are fire-and-forget
	// (`memory_provider::detach` does `let _ = call_verb(…)`), so nothing reads it.
	for (const verb of ["memory__store", "memory__sync"]) {
		assert.equal(
			memoryTools[verb].response,
			undefined,
			`${verb} must not normalize an async job envelope into a fact record`
		);
	}
	assert.doesNotMatch(JSON.stringify(memoryTools), /event_id/);
});

// ── Entity scoping ──────────────────────────────────────────────────────────

test("the entity id sits where Mem0 documents it on EACH endpoint", () => {
	// This is the asymmetry a copy-paste gets wrong, and it fails silently in the
	// worst direction: a write with no entity is rejected, or lands somewhere recall
	// can never reach.
	//   SEARCH: "Entity IDs (user_id, agent_id, app_id, run_id) MUST be passed inside
	//   the `filters` object: top-level entity IDs are rejected with 400."
	//   ADD: `user_id` is a TOP-LEVEL body field — the documented curl is
	//   {"messages": [...], "user_id": "alice"}; there is no `filters` on it.
	assert.deepEqual(memoryTools.memory__search.arg_defaults, {
		filters: { user_id: "pref:mem0.user-id" },
	});
	assert.equal(memoryTools.memory__store.arg_defaults.user_id, "pref:mem0.user-id");
	assert.equal(memoryTools.memory__sync.arg_defaults.user_id, "pref:mem0.user-id");
	for (const verb of ["memory__store", "memory__sync"]) {
		assert.equal(
			memoryTools[verb].arg_defaults.filters,
			undefined,
			`${verb}: /v3/memories/add/ takes no filters object — the entity would be lost`
		);
	}
});

test("every entity id is a pref: token, never a literal bucket", () => {
	// A hard-coded id gave every install the same bucket, so recall returned nothing
	// forever and silently. A per-agent or per-run id would fragment recall across
	// agents and sessions; a wildcard is not a "positively-scoped entity ID" in Mem0's
	// own 400 wording.
	const tokens = prefTokens(memoryTools);
	assert.ok(tokens.length >= 3, "expected an entity token on search, store and sync");
	for (const token of tokens) {
		assert.match(token, /^pref:/);
	}
	// One preference for the whole provider: two would let reads and writes drift onto
	// different buckets, which looks exactly like "Mem0 forgets everything".
	assert.deepEqual([...new Set(tokens)], ["pref:mem0.user-id"]);
});

test("arg_defaults only sets arguments the provider tool accepts", () => {
	for (const p of provides) {
		for (const [verb, binding] of Object.entries(p.tools)) {
			const props = bySlug.get(binding.tool).config.input_schema.properties;
			for (const key of Object.keys(binding.arg_defaults ?? {})) {
				assert.ok(
					Object.hasOwn(props, key),
					`${verb}: arg_defaults sets '${key}', which ${binding.tool} does not accept`
				);
			}
		}
	}
});

test("no dead arg_clamp is declared on any verb", () => {
	// Mem0's top_k ceiling (1000) is ABOVE the canonical memory__search.limit maximum
	// (50), and the kernel prefetch clamps to 8 besides — so a clamp here could never
	// fire. `arg_clamp` is for providers that accept LESS than the canonical schema
	// allows (Brave's count maxes at 20); declaring one that never narrows anything is
	// noise that reads as a real constraint.
	for (const [verb, binding] of Object.entries(memoryTools)) {
		assert.equal(binding.arg_clamp, undefined, `${verb} declares a dead arg_clamp`);
	}
});

// --- BYOK settings tab -------------------------------------------------------
// The key is env-only at the tool layer (`env:RYU_MEM0_API_KEY`). The settings tab is
// the ONLY UI a user has for it: a `secret` field whose pref_key is exactly that env
// var name, which the secret-header resolver falls back to when the process env has no
// such variable.

test("contributes exactly one settings tab, declarative and node-scoped", () => {
	const tabs = manifest.contributes?.settings_tabs;
	assert.ok(Array.isArray(tabs), "no contributes.settings_tabs");
	assert.equal(tabs.length, 1);
	const [tab] = tabs;
	assert.equal(tab.id, "mem0.settings");
	assert.equal(typeof tab.title, "string");
	assert.ok(tab.title.length > 0);
	// The secret-header resolver runs in Core ON THE NODE, so it can only read a
	// node-scoped preference. A `user` (client-local) scope would be invisible to it
	// and the key would silently never apply.
	assert.equal(tab.scope, "node");
	// Declarative fields, not a bespoke component.
	assert.equal(tab.view, undefined);
	assert.equal(tab.fields.length, 2);
});

test("the settings field pref_key IS the env var the tools reference", () => {
	const field = manifest.contributes.settings_tabs[0].fields.find(
		(f) => f.type === "secret"
	);
	assert.equal(field.type, "secret");
	// Derive the expected name from the manifest itself rather than restating a
	// literal — this is what actually catches a rename on one side only.
	const envVars = new Set(
		manifest.runnables.map(
			(r) => /env:(\w+)/.exec(r.config.secret_headers.Authorization)[1]
		)
	);
	assert.equal(envVars.size, 1, "tools disagree on which env var holds the key");
	assert.equal(envVars.has("RYU_MEM0_API_KEY"), true);
	assert.equal(field.pref_key, [...envVars][0]);
});

test("the secret field carries a real label and a sourcing description", () => {
	const field = manifest.contributes.settings_tabs[0].fields.find(
		(f) => f.type === "secret"
	);
	assert.equal(typeof field.label, "string");
	assert.ok(field.label.length > 0);
	assert.ok(
		field.description?.includes("https://"),
		"description must say where to get the key"
	);
	assert.match(field.description, /encrypted/i);
});

test("the secret field declares no bounds, default, or options", () => {
	const field = manifest.contributes.settings_tabs[0].fields.find(
		(f) => f.type === "secret"
	);
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
	// The tools are fail_open: a missing key degrades, it does not error. Marking the
	// field required would contradict that and nag users who never selected Mem0.
	assert.notEqual(field.required, true);
});

test("manifest is byte-identical to the Core fixture (registration seam)", () => {
	const fixturePath = resolve(
		here,
		"../../apps/core/src/plugin_manifest/fixtures/mem0.manifest.json"
	);
	// Skip on the SATELLITE tree (no apps/core at all), but fail loudly if the
	// fixtures directory is here and only the file name is wrong — otherwise a broken
	// path silently skips instead of catching real drift.
	if (!existsSync(dirname(fixturePath))) {
		return;
	}
	assert.deepEqual(
		readFileSync(manifestPath),
		readFileSync(fixturePath),
		"manifest.json drifted from the Core fixture — they must be byte-identical"
	);
});

test("every pref: token in every binding has a settings field that writes it", () => {
	// The token and the settings field are two halves of one contract: Core reads the
	// preference named by the token. A rename on either side alone silently restores
	// the "returns nothing forever" bug this replaced, with nothing failing. Walked
	// over ALL bindings at ANY depth, because the entity id is nested under `filters`
	// on search and top-level on the two write verbs.
	const fields = manifest.contributes.settings_tabs.flatMap((t) => t.fields ?? []);
	const tokens = prefTokens(memoryTools);
	assert.ok(tokens.length > 0, "no pref: token found — has the seam been removed?");
	for (const token of tokens) {
		const key = token.slice("pref:".length);
		const field = fields.find((f) => f.pref_key === key);
		assert.ok(
			field,
			`no settings field writes '${key}', so the token can never resolve`
		);
		assert.notEqual(field.type, "secret", "an entity id is config, not a credential");
	}
});

/** Every `pref:<key>` token appearing anywhere in a binding's `arg_defaults`. */
function prefTokens(tools) {
	const found = [];
	const walk = (node) => {
		if (typeof node === "string") {
			if (node.startsWith("pref:")) {
				found.push(node);
			}
			return;
		}
		if (node && typeof node === "object") {
			for (const value of Object.values(node)) {
				walk(value);
			}
		}
	};
	for (const binding of Object.values(tools)) {
		walk(binding.arg_defaults ?? {});
	}
	return found;
}
