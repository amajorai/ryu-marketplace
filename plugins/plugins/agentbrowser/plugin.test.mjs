// Co-located unit test for the `agentbrowser` plugin manifest.
// Zero-dependency, runnable with: node --test plugin.test.mjs
//
// agentbrowser is a manifest-only plugin: it contributes an MCP server
// (`npx -y agent-browser mcp`) and has no inline turn_hooks, so there is no
// executable hook code to run. The strongest honest coverage is therefore
// structural validation of the manifest contract Core relies on:
//   - manifest.json parses as valid JSON
//   - required identity fields (id / name / version) are well-formed
//   - the mcp_servers command spec is well-formed (command + args)
//   - permission_grants line up with the declared MCP server id
//   - every browser.control verb binds a tool the MCP server really exposes
//
// The package name is load-bearing and was WRONG until verified against npm:
// the manifest launched `agentbrowser`, which does not exist on the registry
// (404), so this provider could never have started and served zero verbs. The
// real package is `agent-browser`, and its MCP mode is a subcommand (`mcp`).
// The tool names asserted below were captured from a live `tools/list` against
// `npx -y agent-browser mcp --tools all`, not guessed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");

const RAW = readFileSync(MANIFEST_PATH, "utf8");

// ── code_file hydration ───────────────────────────────────────────────────────
// This plugin keeps its sandboxed JS in real files (`hooks/*.js`, `adapters/*.js`)
// and references them from the manifest by `code_file`. Core resolves those into
// the inline `code` string at parse time (`PluginManifest::hydrate_code_files`),
// so every consumer — including the sandbox — only ever sees `code`. Mirror that
// here, or the assertions below would read an empty body and silently pass.
function hydrateCodeFiles(m) {
	const read = (rel) => readFileSync(join(HERE, rel), "utf8");
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
const parseManifest = () => hydrateCodeFiles(JSON.parse(RAW));

const SEMVER = /^\d+\.\d+\.\d+/;

test("manifest.json is valid JSON and parses", () => {
	let parsed;
	assert.doesNotThrow(() => {
		parsed = parseManifest();
	}, "manifest.json must be parseable JSON");
	assert.equal(typeof parsed, "object");
	assert.notEqual(parsed, null);
});

test("required identity fields are present and well-formed", () => {
	const m = parseManifest();

	assert.equal(typeof m.id, "string");
	assert.ok(m.id.length > 0, "id must be non-empty");
	assert.equal(m.id, "@ryu/agentbrowser");

	assert.equal(typeof m.name, "string");
	assert.ok(m.name.length > 0, "name must be non-empty");

	assert.equal(typeof m.version, "string");
	assert.match(m.version, SEMVER, "version must be semver-ish");
});

test("runnables is an array (empty for this MCP-only plugin)", () => {
	const m = parseManifest();
	assert.ok(Array.isArray(m.runnables), "runnables must be an array");
});

test("mcp_servers.agentbrowser is a well-formed command spec", () => {
	const m = parseManifest();

	assert.equal(typeof m.mcp_servers, "object");
	assert.notEqual(m.mcp_servers, null);

	const server = m.mcp_servers.agentbrowser;
	assert.ok(server, "must declare an `agentbrowser` MCP server");

	// command must be a non-empty string
	assert.equal(typeof server.command, "string");
	assert.ok(server.command.length > 0, "command must be non-empty");
	assert.equal(server.command, "npx");

	// args must be a string array launching the agent-browser package in MCP
	// mode. The hyphen is not cosmetic: `agentbrowser` 404s on npm, so the old
	// spelling made this provider unstartable.
	assert.ok(Array.isArray(server.args), "args must be an array");
	for (const arg of server.args) {
		assert.equal(typeof arg, "string", "every arg must be a string");
	}
	assert.deepEqual(server.args, ["-y", "agent-browser", "mcp", "--tools", "all"]);

	// description, if present, must be a non-empty string
	if (server.description !== undefined) {
		assert.equal(typeof server.description, "string");
		assert.ok(server.description.length > 0, "description must be non-empty");
	}
});

test("permission_grants reference the declared MCP server", () => {
	const m = parseManifest();

	assert.ok(
		Array.isArray(m.permission_grants),
		"permission_grants must be an array"
	);
	for (const grant of m.permission_grants) {
		assert.equal(typeof grant, "string");
	}

	// The mcp:<id> grant must correspond to an actually-declared server.
	const mcpGrants = m.permission_grants.filter((g) => g.startsWith("mcp:"));
	for (const grant of mcpGrants) {
		const serverId = grant.slice("mcp:".length);
		assert.ok(
			Object.hasOwn(m.mcp_servers ?? {}, serverId),
			`permission grant ${grant} must match a declared mcp_servers key`
		);
	}
	assert.ok(mcpGrants.includes("mcp:agentbrowser"));
});

// ── Capability-provider contract (the swappable-layer seam) ─────────────────

const CANONICAL_BROWSER_VERBS = [
	"browser.navigate",
	"browser.snapshot",
	"browser.click",
	"browser.type",
	"browser.scroll",
	"browser.screenshot",
	"browser.tabs",
];

// Captured from a live `tools/list` against `npx -y agent-browser mcp --tools all`. Core
// registers an MCP server's tools as `<server>.<tool>`, which is why every
// binding target below carries the `agentbrowser.` prefix.
const REAL_MCP_TOOLS = new Set([
	"agent_browser_open",
	"agent_browser_snapshot",
	"agent_browser_click",
	"agent_browser_type",
	"agent_browser_press",
	"agent_browser_scroll",
	"agent_browser_screenshot",
	"agent_browser_tab_list",
	"agent_browser_tab_switch",
	"agent_browser_record_start",
	"agent_browser_record_stop",
	"agent_browser_record_restart",
]);

test("the full MCP profile carries recording controls", () => {
	const m = parseManifest();
	const args = m.mcp_servers.agentbrowser.args;
	assert.deepEqual(args.slice(-2), ["--tools", "all"]);
	for (const tool of [
		"agent_browser_record_start",
		"agent_browser_record_stop",
		"agent_browser_record_restart",
	]) {
		assert.ok(REAL_MCP_TOOLS.has(tool), `${tool} must be exposed by --tools all`);
	}
});

test("serves EVERY canonical browser verb, so the layer is really swappable", () => {
	const m = parseManifest();
	const entry = (m.provides ?? []).find(
		(p) => p.capability === "browser.control"
	);
	assert.ok(entry, "must provide browser.control");
	// An empty tools map is the failure this test exists to catch: such an entry
	// still joins resolution and can win the pick, killing a working layer. This
	// manifest shipped exactly that for its whole life before the bindings below.
	assert.deepEqual(
		Object.keys(entry.tools).sort(),
		[...CANONICAL_BROWSER_VERBS].sort()
	);
});

test("every verb binds a tool the MCP server actually exposes", () => {
	const m = parseManifest();
	const entry = m.provides.find((p) => p.capability === "browser.control");
	for (const [verb, binding] of Object.entries(entry.tools)) {
		const prefix = "agentbrowser.";
		assert.ok(
			binding.tool.startsWith(prefix),
			`${verb}: ${binding.tool} is not namespaced to the declared MCP server`
		);
		assert.ok(
			REAL_MCP_TOOLS.has(binding.tool.slice(prefix.length)),
			`${verb}: ${binding.tool} is not a tool agent-browser exposes`
		);
		// Same check for every extra tool an adapter is allowed to reach — an id
		// missing from the server is refused at runtime, silently breaking the verb.
		for (const extra of binding.adapter?.tools ?? []) {
			assert.ok(
				extra.startsWith(prefix) &&
					REAL_MCP_TOOLS.has(extra.slice(prefix.length)),
				`${verb}: adapter may call ${extra}, which agent-browser does not expose`
			);
		}
	}
});

test("verbs agent-browser cannot express in ONE call are adapted, not faked", () => {
	const m = parseManifest();
	const tools = m.provides.find(
		(p) => p.capability === "browser.control"
	).tools;

	// `submit` means "press Enter after typing" — a second call. And the canonical
	// verb REPLACES the field's contents, which agent-browser's type only does
	// with `clear`.
	const type = tools["browser.type"];
	assert.ok(
		type.adapter,
		"browser.type needs an adapter for submit + replace"
	);
	assert.match(type.adapter.code, /clear:\s*true/);
	assert.deepEqual(type.adapter.tools, ["agentbrowser.agent_browser_press"]);

	// agent-browser has no per-call tab argument, so honouring the canonical
	// tab_id means switching tabs first rather than ignoring it.
	for (const verb of ["browser.snapshot", "browser.screenshot"]) {
		assert.ok(tools[verb].adapter, `${verb} must honour tab_id explicitly`);
		assert.deepEqual(tools[verb].adapter.tools, [
			"agentbrowser.agent_browser_tab_switch",
		]);
		assert.match(tools[verb].adapter.code, /input\.tab_id/);
	}
});

test("shipping adapter code is grant-gated", () => {
	const m = parseManifest();
	const entry = m.provides.find((p) => p.capability === "browser.control");
	const shipsCode = Object.values(entry.tools).some((b) => b.adapter);
	assert.equal(shipsCode, true);
	// An adapter runs JS in the sandbox, so the plugin must hold `tool:execute`
	// or every adapted verb fails closed at dispatch.
	assert.ok(m.permission_grants.includes("tool:execute"));
});

test("the provider is selectable and claims no default", () => {
	const m = parseManifest();
	const entry = m.provides.find((p) => p.capability === "browser.control");
	// Selectability requires UNANIMITY across a capability's providers: if any one
	// omits it the capability resolves to nothing at all and the whole layer stops
	// serving. @ryu/browser is the other provider and the declared default.
	assert.equal(entry.selectable, true);
	assert.ok(entry.default === undefined || entry.default === false);
});

test("no inline turn_hooks are declared (nothing to execute)", () => {
	const m = parseManifest();
	const hooks = m.contributes?.turn_hooks;
	// agentbrowser contributes no turn hooks; if this ever changes, this test
	// fails loudly so a maintainer adds executable-hook coverage.
	assert.ok(
		hooks === undefined || (Array.isArray(hooks) && hooks.length === 0),
		"agentbrowser declares no turn_hooks; add hook-execution tests if it starts to"
	);
});
