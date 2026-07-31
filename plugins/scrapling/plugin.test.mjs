// Co-located contract test for the `scrapling` plugin.
// Runner: `node --test` (zero dependencies).
//
// `scrapling` is an MCP-server-backed plugin and the THIRD provider of the
// `web.extract` capability. Unlike the declarative HTTP providers it owns no
// runnables at all — its tools come from `scrapling mcp` — and it maps the canonical
// verb through an ADAPTER rather than a `response` map. Four decisions here are
// silent if reverted, so each is pinned:
//
//   1. NO `web.crawl` entry. Scrapling only crawls via its Python `Spider` class,
//      which MCP does not expose. A partial entry would join resolution for that
//      capability and could win the pick away from `spider`, killing a working layer.
//   2. `tool:execute` is declared. `run_capability_adapter` HARD-ERRORS without it,
//      so dropping the grant breaks every `web__extract` call through this provider.
//   3. The adapter joins `structuredContent.content`, which is an ARRAY of chunks
//      with empty entries. The declarative mapper copies values verbatim — no join —
//      so a `response` map here would emit an array where every other provider emits
//      a string.
//   4. The adapter passes a missing `structuredContent`/`isError` answer through
//      under `raw`. Scrapling 0.4.12 declares `mcp>=1.27.0` unbounded and `mcp` 2.x
//      renamed `mcp.server.fastmcp`, so `scrapling mcp` crashing on import is a
//      REACHABLE state on a fresh install, not a hypothetical.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
	assert.equal(manifest.id, "scrapling");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("declares an engines.ryu constraint", () => {
	assert.equal(typeof manifest.engines?.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
});

test("declares NO runnables — the tools are owned by the MCP server", () => {
	// Re-adding tool runnables here would double-list every MCP tool as an
	// `app__<slug>` alias alongside its native `scrapling__<tool>` id.
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 0);
});

// ── The MCP server declaration ────────────────────────────────────────────────

test("declares exactly one MCP server, launched as `scrapling mcp`", () => {
	const servers = manifest.mcp_servers;
	assert.ok(servers, "no mcp_servers: the plugin would own no tools at all");
	assert.deepEqual(Object.keys(servers), ["scrapling"]);
	const decl = servers.scrapling;
	assert.equal(decl.command, "scrapling");
	assert.deepEqual(decl.args, ["mcp"]);
});

test("the server description says how to install it and what is missing without it", () => {
	// A BYO install with no in-product hint is indistinguishable from a broken one.
	const { description } = manifest.mcp_servers.scrapling;
	assert.match(description, /pip install/);
	assert.match(description, /PATH/);
});

test("no literal secret is baked into the server env", () => {
	const { env } = manifest.mcp_servers.scrapling;
	// Scrapling needs no credential at all; an env block here would be a smell.
	assert.equal(env, undefined);
});

// ── Grants ────────────────────────────────────────────────────────────────────

test("permission_grants cover the MCP server AND adapter execution", () => {
	assert.deepEqual(manifest.permission_grants, [
		"mcp:scrapling",
		"tool:execute",
	]);
});

test("tool:execute is present because the binding uses an adapter", () => {
	// `run_capability_adapter` refuses outright when the provider lacks this grant:
	// "maps '<verb>' through an adapter but does not hold the 'tool:execute' grant".
	const usesAdapter = manifest.provides.some((p) =>
		Object.values(p.tools).some((b) => b.adapter)
	);
	assert.equal(usesAdapter, true);
	assert.ok(manifest.permission_grants.includes("tool:execute"));
});

test("declares no HTTP egress grant — nothing here calls a hosted API", () => {
	// The fetching happens inside the local MCP subprocess, not through Core's http
	// tool, so an egress grant would be decoration that overstates the blast radius.
	for (const grant of manifest.permission_grants) {
		assert.ok(!grant.startsWith("tool:http-egress:"), `unexpected ${grant}`);
	}
});

// ── Capability-provider contract (the swappable-layer seam) ───────────────────

const provides = manifest.provides ?? [];
const byCapability = new Map(provides.map((p) => [p.capability, p]));

test("provides exactly the web.extract capability", () => {
	assert.equal(provides.length, 1);
	assert.ok(byCapability.has("web.extract"));
});

test("does NOT provide web.crawl", () => {
	// Neither the MCP server nor the CLI follows links — only Scrapling's Python
	// `Spider` class crawls, and MCP does not expose it. An entry here would join
	// resolution for web.crawl and could win the pick away from `spider`.
	assert.equal(byCapability.has("web.crawl"), false);
});

test("the provides entry is selectable and claims no default", () => {
	const p = byCapability.get("web.extract");
	// Selectability requires UNANIMITY across all providers of a capability: if any
	// one omits it, the capability has candidates it cannot choose between.
	assert.equal(p.selectable, true);
	// The local `spider` CLI plugin is the declared default for web.extract; exactly
	// one provider per capability may claim it.
	assert.ok(p.default === undefined || p.default === false);
	assert.match(p.version, /^\d+\.\d+\.\d+/);
});

test("verb key is the canonical DOUBLE-underscore id under the right capability", () => {
	// A single-underscore typo (`web_extract`) is not an error anywhere — the verb
	// lookup simply misses and the layer silently serves nothing.
	assert.deepEqual(Object.keys(byCapability.get("web.extract").tools), [
		"web__extract",
	]);
});

const binding = byCapability.get("web.extract").tools.web__extract;

test("the verb forwards to a tool the declared MCP server actually serves", () => {
	// An MCP tool registers as `<mcp_servers key>__<tool name>`. The binding is a
	// STRING match resolved at call time, so a wrong prefix fails in the user's chat
	// rather than at manifest-parse time.
	const [serverKey] = Object.keys(manifest.mcp_servers);
	assert.equal(binding.tool, `${serverKey}__get`);
});

test("the binding uses an adapter and NOT a declarative response map", () => {
	// Running both would apply the same transformation twice — Core deliberately
	// skips the declarative mapping when an adapter is present.
	assert.ok(binding.adapter?.code, "no adapter code");
	assert.equal(binding.response, undefined);
	assert.equal(binding.args, undefined);
});

test("the adapter declares no ADDITIONAL callable tools", () => {
	// `adapter.tools` widens what sandboxed code may reach. One fetch needs exactly
	// one call, so the allowlist stays empty and the adapter's authority is a strict
	// subset of the declarative path's.
	assert.ok(
		binding.adapter.tools === undefined || binding.adapter.tools.length === 0
	);
});

// ── The adapter, executed ─────────────────────────────────────────────────────
// Core wraps `adapter.code` as the tail of an async IIFE with `input`, `defaults`,
// `callTool` and `callNamed` in scope. Reconstructing that here runs the real body
// rather than asserting on its source text.

const AsyncFunction = Object.getPrototypeOf(async () => {
	// intentionally empty: this expression exists only to reach AsyncFunction
}).constructor;
const runAdapter = new AsyncFunction(
	"input",
	"defaults",
	"callTool",
	"callNamed",
	binding.adapter.code
);

// VERBATIM `tools/call` envelope captured from a live `scrapling mcp` server for
// `get {url: "https://example.com"}`. Note both shape facts the adapter exists for:
// the typed model is nested under `structuredContent`, and `content` is an ARRAY
// whose trailing entry is empty.
const liveEnvelope = () => ({
	content: [{ type: "text", text: "{…}" }],
	structuredContent: {
		status: 200,
		content: ["Example Domain\n==============\n\nThis domain is for use…", ""],
		url: "https://example.com/",
	},
	isError: false,
});

test("adapter normalizes a real envelope into the canonical result shape", async () => {
	const out = await runAdapter(
		{ url: "https://example.com" },
		{},
		liveEnvelope,
		() => {
			throw new Error("callNamed must not be used");
		}
	);
	assert.equal(out.results.length, 1);
	const [record] = out.results;
	// The canonical `content` field is a STRING. The declarative mapper has no join,
	// which is the whole reason this provider needs an adapter.
	assert.equal(typeof record.content, "string");
	assert.ok(record.content.includes("Example Domain"));
	// The empty trailing chunk must not survive as blank padding.
	assert.equal(record.content.endsWith("\n\n"), false);
	// The RESOLVED url (redirects followed) is what a canonical record reports.
	assert.equal(record.url, "https://example.com/");
	// The provider's original item is kept, mirroring what `map_item` does.
	assert.equal(record.raw.status, 200);
});

test("adapter maps no `title` rather than emitting an empty one", async () => {
	// Scrapling's ResponseModel has no title field. A null/empty one would read as a
	// page whose title is blank instead of a field this provider cannot supply.
	const out = await runAdapter({ url: "u" }, {}, liveEnvelope, () => {});
	assert.equal(Object.hasOwn(out.results[0], "title"), false);
});

test("adapter forwards the canonical `format` onto `extraction_type`", async () => {
	// The canonical enum (markdown|text|html) IS Scrapling's extraction_type enum,
	// so this is the one extract provider that can honour the argument.
	let sent;
	const capture = (args) => {
		sent = args;
		return liveEnvelope();
	};
	await runAdapter({ url: "u", format: "text" }, {}, capture, () => {});
	assert.equal(sent.extraction_type, "text");
	await runAdapter({ url: "u" }, {}, capture, () => {});
	assert.equal(sent.extraction_type, "markdown", "must default to markdown");
});

test("adapter passes a FAILED call through as raw, never as an empty page", async () => {
	// Shaping these into `results: [{content: ""}]` would report a broken install as
	// "this URL has no content" — an invisible, plausible-looking lie.
	const errored = await runAdapter({ url: "u" }, {}, () => ({ isError: true }));
	assert.equal(errored.results, undefined);
	assert.ok(errored.raw);

	// `scrapling mcp` dies on import against `mcp` 2.x, so an answer with no typed
	// channel at all is reachable on a real, fresh install.
	const untyped = await runAdapter({ url: "u" }, {}, () => ({
		content: [{ type: "text", text: "ModuleNotFoundError" }],
	}));
	assert.equal(untyped.results, undefined);
	assert.ok(untyped.raw);
});

test("adapter tolerates a scalar `content` if upstream ever stops using an array", async () => {
	const out = await runAdapter({ url: "u" }, {}, () => ({
		structuredContent: { status: 200, content: "just a string", url: "u" },
	}));
	assert.equal(out.results[0].content, "just a string");
});

// ── Registration seams ────────────────────────────────────────────────────────

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
		"scrapling.manifest.json"
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
			'include_str!("../../../../plugins-store/scrapling/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});

test("the plugin is Core-tier but NOT default-on", () => {
	// Core-tier is a REQUIREMENT, not a promotion: `may_register_mcp_servers`
	// auto-allows manifest `mcp_servers` only for compiled-in fixtures, and the
	// Community path needs the `mcp:server` grant, which is off the Gateway's
	// default allowlist. A Community-tier scrapling would register nothing.
	//
	// Opt-in, because it needs a `pip install` the user must perform — shipping it
	// default-on would put a permanently unavailable tool on every fresh install.
	const builtinsPath = resolve(here, "../../apps/core/src/plugins/builtins.rs");
	if (!existsSync(builtinsPath)) {
		return; // satellite tree
	}
	const src = readFileSync(builtinsPath, "utf8");
	const section = (name) =>
		src.slice(src.indexOf(`${name}: &[&str] = &[`)).split("];")[0];
	assert.ok(
		section("CORE_PLUGINS").includes('"scrapling"'),
		"scrapling must be Core-tier or its MCP server is never registered"
	);
	assert.ok(
		!section("CORE_DEFAULT_ON").includes('"scrapling"'),
		"scrapling must stay opt-in: it needs a BYO `pip install`"
	);
});
