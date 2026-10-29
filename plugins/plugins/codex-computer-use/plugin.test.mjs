// Co-located contract test for the `codex-computer-use` plugin.
// Runner: bun test; uses the production manifest and MCP schemas.
//
// codex-computer-use is an MCP-server plugin with capability adapters. It launches
// the pinned `codex-computer-use-mcp@0.5.2` stdio bridge to OpenAI's signed
// Codex Computer Use engine and serves the computer.control layer through small
// `adapters/*.js` fragments. The bridge's tool names and argument schemas were
// read from the published 0.5.2 package (`dist/tools.js`), not guessed. Every
// method requires an `app`, which the canonical verbs do not carry, so the
// adapters take it from the `codex-computer-use.app` preference and refuse
// to run without it.

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
const RAW = readFileSync(join(HERE, "manifest.json"), "utf8");
const manifest = JSON.parse(RAW);
const plugin = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));
const mcpConfig = JSON.parse(readFileSync(join(HERE, "mcp.json"), "utf8"));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// The ten official methods plus the status tool, from the bridge's 0.5.2 package.
const BRIDGE_TOOLS = new Set([
	"list_apps",
	"get_app_state",
	"click",
	"perform_secondary_action",
	"set_value",
	"select_text",
	"scroll",
	"drag",
	"press_key",
	"type_text",
	"computer_use_status",
]);
const PREF = "pref:codex-computer-use.app";

const provider = manifest.provides.find(
	(entry) => entry.capability === "computer.control"
);
const adapterCode = (verb) =>
	readFileSync(join(HERE, provider.tools[verb].adapter.code_file), "utf8");

async function runAdapter(verb, input, defaults = { app: "Calculator" }) {
	const calls = [];
	// A fresh object per run, so a test can tell the bridge reply apart from
	// anything the adapter might build itself.
	const reply = { ok: true, verb };
	const callTool = async (args) => {
		calls.push(args);
		return reply;
	};
	const callNamed = () => {
		throw new Error("no extra tools are allowlisted");
	};
	const result = await new AsyncFunction(
		"input",
		"defaults",
		"callTool",
		"callNamed",
		adapterCode(verb)
	)(input, defaults, callTool, callNamed);
	return { calls, reply, result };
}

test("manifest parses against the SDK schema with a stable identity", () => {
	assert.doesNotThrow(() => PluginManifestSchema.parse(manifest));
	assert.equal(manifest.id, "@ryu/codex-computer-use");
	assert.equal(manifest.name, "Codex Computer Use");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.deepEqual(manifest.runnables, []);
});

test("the stdio bridge is pinned and mirrored in plugin.json and mcp.json", () => {
	assert.deepEqual(Object.keys(manifest.mcp_servers), ["codex_cu"]);
	const server = manifest.mcp_servers.codex_cu;
	assert.doesNotThrow(() => McpServerDeclSchema.parse(server));
	assert.equal(server.command, "npx");
	assert.deepEqual(server.args, ["-y", "codex-computer-use-mcp@0.5.2"]);
	assert.equal(server.url, undefined);
	assert.deepEqual(mcpConfig.mcpServers.codex_cu, {
		type: "stdio",
		command: server.command,
		args: server.args,
	});
	const extension = plugin.extensions["com.ryuhq.ryu"];
	assert.equal(extension.id, manifest.id);
	assert.equal(extension.displayName, manifest.name);
});

test("grants cover exactly the declared server plus adapter execution", () => {
	assert.deepEqual(manifest.permission_grants, [
		"mcp:codex_cu",
		"tool:execute",
	]);
	assert.ok(!RAW.includes("secret_headers"));
});

test("it is a selectable, non-default provider that drives this machine", () => {
	assert.equal(provider.target, "local-machine");
	assert.equal(provider.selectable, true);
	assert.equal(provider.default, undefined, "ghost stays the default provider");
	assert.equal(provider.layerKind, undefined, "computer.control is a toolkit");
});

test("every bound verb targets a real bridge tool and reads the target-app preference", () => {
	assert.deepEqual(Object.keys(provider.tools).sort(), [
		"computer.capture",
		"computer.click",
		"computer.key",
		"computer.type",
	]);
	for (const [verb, binding] of Object.entries(provider.tools)) {
		const [server, tool] = binding.tool.split(".");
		assert.equal(server, "codex_cu", verb);
		assert.ok(BRIDGE_TOOLS.has(tool), `${verb} binds unknown tool ${tool}`);
		assert.deepEqual(binding.arg_defaults, { app: PREF }, verb);
		assert.match(
			binding.adapter.code_file,
			/^adapters\/computer\.[a-z_]+\.js$/
		);
	}
	// Scroll needs an element index and focus_app would not retarget later verbs,
	// so both stay unbound rather than half-working.
	assert.equal(provider.tools["computer.scroll"], undefined);
	assert.equal(provider.tools["computer.focus_app"], undefined);
});

test("the settings tab declares the preference the bindings read", () => {
	const fields = manifest.contributes.settings_tabs.flatMap(
		(tab) => tab.fields
	);
	const field = fields.find((f) => f.pref_key === "codex-computer-use.app");
	assert.ok(field, "the target-app preference must be settable");
	assert.equal(field.required, true);
});

test("every adapter refuses to run without a target app", async () => {
	for (const verb of Object.keys(provider.tools)) {
		await assert.rejects(
			runAdapter(verb, { x: 1, y: 1, text: "a", keys: ["a"] }, {}),
			/no target app/,
			verb
		);
		await assert.rejects(
			runAdapter(verb, { x: 1, y: 1, text: "a", keys: ["a"] }, { app: "  " }),
			/no target app/,
			verb
		);
	}
});

test("every adapter returns the bridge reply unchanged", async () => {
	const input = { x: 1, y: 2, text: "a", keys: ["a"] };
	for (const verb of Object.keys(provider.tools)) {
		const { calls, reply, result } = await runAdapter(verb, input);
		assert.equal(calls.length, 1, `${verb} makes exactly one bridge call`);
		assert.equal(result, reply, `${verb} returns the bridge reply itself`);
	}
});

test("capture asks for the target app's state", async () => {
	const { calls } = await runAdapter("computer.capture", {});
	assert.deepEqual(calls, [{ app: "Calculator" }]);
});

test("click renames button and count and defaults to one left click", async () => {
	assert.deepEqual(
		(await runAdapter("computer.click", { x: 10, y: 20 })).calls,
		[{ app: "Calculator", x: 10, y: 20, mouse_button: "left", click_count: 1 }]
	);
	assert.deepEqual(
		(
			await runAdapter("computer.click", {
				x: 3,
				y: 4,
				button: "right",
				count: 2,
			})
		).calls,
		[{ app: "Calculator", x: 3, y: 4, mouse_button: "right", click_count: 2 }]
	);
});

test("type forwards the literal text", async () => {
	const { calls } = await runAdapter("computer.type", { text: "12*12" });
	assert.deepEqual(calls, [{ app: "Calculator", text: "12*12" }]);
});

test("key joins tokens into an xdotool chord with macOS names renamed", async () => {
	const chord = async (keys) =>
		(await runAdapter("computer.key", { keys })).calls[0].key;
	assert.equal(await chord(["cmd", "s"]), "super+s");
	assert.equal(await chord(["Option", "Shift", "Left"]), "alt+Shift+Left");
	assert.equal(await chord(["enter"]), "Return");
	assert.equal(await chord(["Escape"]), "Escape");
	await assert.rejects(
		runAdapter("computer.key", { keys: [] }),
		/at least one/
	);
});
