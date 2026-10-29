// Co-located unit test for the `agentbrowser` plugin manifest.
// Runner: bun test; uses the production manifest and MCP schemas.
//
// agentbrowser is a manifest-only plugin: it contributes an MCP server
// (`npx -y agent-browser@0.34.0 mcp`) and has no inline turn_hooks, so there is no
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
import {
	McpServerDeclSchema,
	PluginManifestSchema,
} from "../../../packages/sdk/src/manifest.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");

const RAW = readFileSync(MANIFEST_PATH, "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

async function executeAdapter(code, input) {
	const calls = [];
	const callTool = async (args) => {
		calls.push(["tool", args]);
		return { called: true };
	};
	const callNamed = async (id, args) => {
		calls.push(["named", id, args]);
		return { called: true };
	};
	const result = await new AsyncFunction(
		"input",
		"defaults",
		"callTool",
		"callNamed",
		code
	)(input, {}, callTool, callNamed);
	return { calls, result };
}

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
	assert.doesNotThrow(() => PluginManifestSchema.parse(parsed));
	assert.notEqual(parsed, null);
});

test("required identity fields are present and well-formed", () => {
	const m = parseManifest();

	assert.doesNotThrow(() => PluginManifestSchema.shape.id.parse(m.id));
	assert.ok(m.id.length > 0, "id must be non-empty");
	assert.equal(m.id, "@ryu/agentbrowser");

	assert.doesNotThrow(() => PluginManifestSchema.shape.name.parse(m.name));
	assert.ok(m.name.length > 0, "name must be non-empty");

	assert.doesNotThrow(() =>
		PluginManifestSchema.shape.version.parse(m.version)
	);
	assert.match(m.version, SEMVER, "version must be semver-ish");
});

test("runnables is an array (empty for this MCP-only plugin)", () => {
	const m = parseManifest();
	assert.ok(Array.isArray(m.runnables), "runnables must be an array");
});

test("mcp_servers.agentbrowser is a well-formed command spec", () => {
	const m = parseManifest();

	assert.doesNotThrow(() =>
		PluginManifestSchema.shape.mcp_servers.unwrap().parse(m.mcp_servers)
	);
	assert.notEqual(m.mcp_servers, null);

	const server = m.mcp_servers.agentbrowser;
	assert.ok(server, "must declare an `agentbrowser` MCP server");

	// command must be a non-empty string
	assert.doesNotThrow(() =>
		McpServerDeclSchema.shape.command.unwrap().parse(server.command)
	);
	assert.ok(server.command.length > 0, "command must be non-empty");
	assert.equal(server.command, "npx");

	// args must be a string array launching the agent-browser package in MCP
	// mode. The hyphen is not cosmetic: `agentbrowser` 404s on npm, so the old
	// spelling made this provider unstartable.
	assert.ok(Array.isArray(server.args), "args must be an array");
	for (const arg of server.args) {
		assert.doesNotThrow(
			() => McpServerDeclSchema.shape.args.removeDefault().element.parse(arg),
			"every arg must be a string"
		);
	}
	assert.deepEqual(server.args, [
		"-y",
		"agent-browser@0.34.0",
		"mcp",
		"--tools",
		"all",
	]);

	// description, if present, must be a non-empty string
	if (server.description !== undefined) {
		assert.doesNotThrow(() =>
			McpServerDeclSchema.shape.description.unwrap().parse(server.description)
		);
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
		assert.doesNotThrow(() =>
			PluginManifestSchema.shape.permission_grants
				.removeDefault()
				.element.parse(grant)
		);
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
		assert.ok(
			REAL_MCP_TOOLS.has(tool),
			`${tool} must be exposed by --tools all`
		);
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

	// `submit` means "press Enter after typing" — a second call. The canonical
	// verb appends by default and only replaces when asked, which maps onto
	// agent-browser's `clear` argument.
	const type = tools["browser.type"];
	assert.ok(type.adapter, "browser.type needs an adapter for submit + replace");
	assert.match(type.adapter.code, /clear:\s*input\.replace\s*===\s*true/);
	assert.deepEqual(type.adapter.tools, [
		"agentbrowser.agent_browser_press",
		"agentbrowser.agent_browser_tab_switch",
	]);

	// agent-browser has no per-call tab argument, so honouring the canonical
	// tab_id means switching tabs first rather than ignoring it.
	for (const verb of [
		"browser.click",
		"browser.scroll",
		"browser.snapshot",
		"browser.screenshot",
	]) {
		assert.ok(tools[verb].adapter, `${verb} must honour tab_id explicitly`);
		assert.deepEqual(tools[verb].adapter.tools, [
			"agentbrowser.agent_browser_tab_switch",
		]);
		assert.match(tools[verb].adapter.code, /input\.tab_id/);
	}
});

test("browser.type preserves append, replace, and submit semantics", async () => {
	const m = parseManifest();
	const type = m.provides.find((p) => p.capability === "browser.control").tools[
		"browser.type"
	];
	const appended = await executeAdapter(type.adapter.code, {
		ref: "@e1",
		text: "more",
	});
	assert.deepEqual(appended.calls, [
		["tool", { selector: "@e1", text: "more", clear: false }],
	]);
	assert.equal(appended.result.submitted, false);

	const replaced = await executeAdapter(type.adapter.code, {
		ref: "@e2",
		text: "new",
		replace: true,
	});
	assert.deepEqual(replaced.calls, [
		["tool", { selector: "@e2", text: "new", clear: true }],
	]);

	const submitted = await executeAdapter(type.adapter.code, {
		ref: "@e3",
		text: "go",
		submit: true,
		tab_id: "tab-3",
	});
	assert.deepEqual(submitted.calls, [
		["named", "agentbrowser.agent_browser_tab_switch", { tab: "tab-3" }],
		["tool", { selector: "@e3", text: "go", clear: false }],
		["named", "agentbrowser.agent_browser_press", { key: "Enter" }],
	]);
	assert.equal(submitted.result.submitted, true);
});

test("browser.click and browser.scroll act on the requested tab", async () => {
	const tools = parseManifest().provides.find(
		(p) => p.capability === "browser.control"
	).tools;
	const clicked = await executeAdapter(tools["browser.click"].adapter.code, {
		ref: "@e4",
		tab_id: "tab-click",
	});
	assert.deepEqual(clicked.calls, [
		["named", "agentbrowser.agent_browser_tab_switch", { tab: "tab-click" }],
		["tool", { selector: "@e4" }],
	]);

	const scrolled = await executeAdapter(tools["browser.scroll"].adapter.code, {
		direction: "down",
		amount: 240,
		tab_id: "tab-scroll",
	});
	assert.deepEqual(scrolled.calls, [
		["named", "agentbrowser.agent_browser_tab_switch", { tab: "tab-scroll" }],
		["tool", { direction: "down", amount: 240 }],
	]);

	const activeTabScroll = await executeAdapter(
		tools["browser.scroll"].adapter.code,
		{ direction: "up" }
	);
	assert.deepEqual(activeTabScroll.calls, [["tool", { direction: "up" }]]);
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

// Execute the native fragment with Toolsmith's recorded, allowlisted effects.
async function runAdapterCase(verb, fixture) {
	const { runOnce } = await import("../../../tools/toolsmith/harness.mjs");
	const directory = dirname(fileURLToPath(import.meta.url));
	const source = JSON.parse(
		readFileSync(join(directory, "manifest.json"), "utf8")
	);
	const binding = source.provides
		.flatMap((entry) => Object.entries(entry.tools ?? {}))
		.find(([id]) => id === verb)[1];
	return runOnce({
		kind: "adapter",
		code: readFileSync(join(directory, binding.adapter.code_file), "utf8"),
		adapterTools: binding.adapter.tools ?? [],
		testCase: fixture,
	});
}

test("Toolsmith runs browser adapters with exact tool payloads and result shapes", async () => {
	const cases = [
		{
			verb: "browser.click",
			input: { ref: "@e7", tab_id: "tab-click" },
			provider: {
				call: [{ clicked: true }],
				named: {
					"agentbrowser.agent_browser_tab_switch": [{ active: "tab-click" }],
				},
			},
			expect: { clicked: true },
			expectCalls: [
				{
					path: "callNamed:agentbrowser.agent_browser_tab_switch",
					args: { tab: "tab-click" },
				},
				{ path: "callTool", args: { selector: "@e7" } },
			],
		},
		{
			verb: "browser.scroll",
			input: { tab_id: "tab-scroll", direction: "down", amount: 240 },
			provider: {
				call: [{ scrolled: true }],
				named: {
					"agentbrowser.agent_browser_tab_switch": [{ active: "tab-scroll" }],
				},
			},
			expect: { scrolled: true },
			expectCalls: [
				{
					path: "callNamed:agentbrowser.agent_browser_tab_switch",
					args: { tab: "tab-scroll" },
				},
				{
					path: "callTool",
					args: { direction: "down", amount: 240 },
				},
			],
		},
		{
			verb: "browser.snapshot",
			input: { tab_id: "tab-snapshot" },
			provider: {
				call: [{ content: "local accessibility tree" }],
				named: {
					"agentbrowser.agent_browser_tab_switch": [{ active: "tab-snapshot" }],
				},
			},
			expect: { content: "local accessibility tree" },
			expectCalls: [
				{
					path: "callNamed:agentbrowser.agent_browser_tab_switch",
					args: { tab: "tab-snapshot" },
				},
				{ path: "callTool", args: {} },
			],
		},
		{
			verb: "browser.screenshot",
			input: { tab_id: "tab-image" },
			provider: {
				call: [{ image: "local-png-fixture" }],
				named: {
					"agentbrowser.agent_browser_tab_switch": [{ active: "tab-image" }],
				},
			},
			expect: { image: "local-png-fixture" },
			expectCalls: [
				{
					path: "callNamed:agentbrowser.agent_browser_tab_switch",
					args: { tab: "tab-image" },
				},
				{ path: "callTool", args: {} },
			],
		},
		{
			verb: "browser.type",
			input: {
				ref: "@e9",
				text: "fixture query",
				replace: true,
				submit: true,
				tab_id: "tab-form",
			},
			provider: {
				call: [{ typed: true }],
				named: {
					"agentbrowser.agent_browser_tab_switch": [{ active: "tab-form" }],
					"agentbrowser.agent_browser_press": [{ pressed: "Enter" }],
				},
			},
			expect: {
				ok: true,
				ref: "@e9",
				submitted: true,
				raw: { typed: { typed: true }, pressed: { pressed: "Enter" } },
			},
			expectCalls: [
				{
					path: "callNamed:agentbrowser.agent_browser_tab_switch",
					args: { tab: "tab-form" },
				},
				{
					path: "callTool",
					args: {
						selector: "@e9",
						text: "fixture query",
						clear: true,
					},
				},
				{
					path: "callNamed:agentbrowser.agent_browser_press",
					args: { key: "Enter" },
				},
			],
		},
	];

	for (const fixture of cases) {
		const outcome = await runAdapterCase(fixture.verb, {
			name: `${fixture.verb} local success`,
			input: fixture.input,
			provider: fixture.provider,
			expect: fixture.expect,
			expectCalls: fixture.expectCalls,
		});
		assert.deepEqual(outcome.value, fixture.expect);
		assert.deepEqual(outcome.calls, fixture.expectCalls);
	}
});

for (const verb of [
	"browser.click",
	"browser.type",
	"browser.scroll",
	"browser.snapshot",
	"browser.screenshot",
]) {
	test(`${verb} stops before acting when tab selection fails`, async () => {
		const error = {
			isError: true,
			content: [{ type: "text", text: "tab not found" }],
		};
		const outcome = await runAdapterCase(verb, {
			input: {
				tab_id: "missing",
				ref: "@e1",
				text: "hello",
				submit: true,
				direction: "down",
			},
			provider: { named: { "agentbrowser.agent_browser_tab_switch": [error] } },
		});
		assert.deepEqual(outcome.value, error);
		assert.deepEqual(outcome.calls, [
			{
				path: "callNamed:agentbrowser.agent_browser_tab_switch",
				args: { tab: "missing" },
			},
		]);
	});
}

test("browser.type does not press Enter after a failed write", async () => {
	const error = {
		isError: true,
		content: [{ type: "text", text: "element missing" }],
	};
	const outcome = await runAdapterCase("browser.type", {
		input: { ref: "@e1", text: "hello", submit: true },
		provider: { call: [error] },
	});
	assert.deepEqual(outcome.value, error);
	assert.deepEqual(outcome.calls, [
		{
			path: "callTool",
			args: { selector: "@e1", text: "hello", clear: false },
		},
	]);
});

test("browser.type preserves failed Enter instead of reporting submitted", async () => {
	const error = {
		isError: true,
		content: [{ type: "text", text: "Enter failed" }],
	};
	const outcome = await runAdapterCase("browser.type", {
		input: { ref: "@e1", text: "hello", submit: true },
		provider: {
			call: [{ content: [] }],
			named: { "agentbrowser.agent_browser_press": [error] },
		},
	});
	assert.deepEqual(outcome.value, error);
	assert.equal(outcome.calls.length, 2);
});

test("a caller retry repeats exactly one complete type sequence", async () => {
	const fixture = {
		input: {
			ref: "@retry",
			text: "retry me",
			replace: true,
			submit: true,
			tab_id: "tab-retry",
		},
		provider: {
			call: [{ typed: "first" }],
			named: {
				"agentbrowser.agent_browser_tab_switch": [{ active: "tab-retry" }],
				"agentbrowser.agent_browser_press": [{ pressed: "Enter" }],
			},
		},
	};
	const first = await runAdapterCase("browser.type", fixture);
	const retry = await runAdapterCase("browser.type", fixture);

	assert.deepEqual(retry.calls, first.calls);
	assert.equal(retry.calls.length, 3);
	assert.deepEqual(retry.value, first.value);
});

test("concurrent adapter calls keep their tab and payload isolated", async () => {
	const tools = parseManifest().provides.find(
		(entry) => entry.capability === "browser.control"
	).tools;
	const [left, right] = await Promise.all([
		executeAdapter(tools["browser.click"].adapter.code, {
			ref: "@left",
			tab_id: "tab-left",
		}),
		executeAdapter(tools["browser.scroll"].adapter.code, {
			direction: "up",
			amount: 17,
			tab_id: "tab-right",
		}),
	]);

	assert.deepEqual(left.calls, [
		["named", "agentbrowser.agent_browser_tab_switch", { tab: "tab-left" }],
		["tool", { selector: "@left" }],
	]);
	assert.deepEqual(right.calls, [
		["named", "agentbrowser.agent_browser_tab_switch", { tab: "tab-right" }],
		["tool", { direction: "up", amount: 17 }],
	]);
});

test("provider cancellation propagates and prevents submit", async () => {
	const type = parseManifest().provides.find(
		(entry) => entry.capability === "browser.control"
	).tools["browser.type"];
	const cancellation = new Error("provider request cancelled");
	const calls = [];
	const run = new AsyncFunction(
		"input",
		"defaults",
		"callTool",
		"callNamed",
		type.adapter.code
	);

	await assert.rejects(
		run(
			{ ref: "@cancel", text: "unfinished", submit: true },
			{},
			async (args) => {
				calls.push(["tool", args]);
				throw cancellation;
			},
			async (id, args) => {
				calls.push(["named", id, args]);
				return { called: true };
			}
		),
		(error) => error === cancellation
	);
	assert.deepEqual(calls, [
		["tool", { selector: "@cancel", text: "unfinished", clear: false }],
	]);
});
