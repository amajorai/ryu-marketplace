import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const parseManifest = () =>
	JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));

// Execute the native fragment with Toolsmith's recorded, allowlisted effects.
async function runAdapterCase(verb, fixture) {
	const { runOnce } = await import("../../../tools/toolsmith/harness.mjs");
	const binding = parseManifest()
		.provides.flatMap((entry) => Object.entries(entry.tools ?? {}))
		.find(([id]) => id === verb)[1];
	return runOnce({
		kind: "adapter",
		code: readFileSync(join(HERE, binding.adapter.code_file), "utf8"),
		adapterTools: binding.adapter.tools ?? [],
		testCase: fixture,
	});
}

const text = (value) => ({
	content: [
		{
			type: "text",
			text: typeof value === "string" ? value : JSON.stringify(value),
		},
	],
});
const SWITCH = "browseruse.browser_switch_tab";
const LIST = "browseruse.browser_list_tabs";

test("launches the pinned browser-use MCP server with telemetry off", () => {
	const manifest = parseManifest();
	assert.equal(manifest.external, undefined);
	assert.deepEqual(manifest.permission_grants, ["mcp:server", "tool:execute"]);
	const server = manifest.mcp_servers.browseruse;
	assert.equal(server.command, "uvx");
	assert.deepEqual(server.args, ["browser-use@0.13.11", "--mcp"]);
	assert.equal(server.env.ANONYMIZED_TELEMETRY, "false");
	assert.equal(server.env.BROWSER_USE_CLOUD_SYNC, "false");
});

test("ships hidden because its browser does not outlive one MCP call", () => {
	// Core starts a fresh stdio server per tool call, and browser-use keeps its
	// browser session in that process, so a tab id from one verb is unknown to the
	// next. Keep the listing dark until that changes.
	const manifest = parseManifest();
	assert.equal(manifest.hidden, true);
	assert.equal(manifest.stability, "experimental");
	assert.match(manifest.description, /Not usable as the Browser layer yet/);
});

test("participates in the Browser toolkit as a local-machine provider", () => {
	const layer = parseManifest().provides.find(
		(provided) => provided.capability === "browser.control"
	);
	assert.equal(layer.target, "local-machine");
	assert.equal(layer.selectable, true);
	assert.deepEqual(Object.keys(layer.tools).sort(), [
		"browser.click",
		"browser.navigate",
		"browser.screenshot",
		"browser.scroll",
		"browser.snapshot",
		"browser.tabs",
		"browser.type",
	]);
	for (const binding of Object.values(layer.tools)) {
		assert.match(binding.tool, /^browseruse\.browser_/);
		assert.equal(typeof binding.adapter?.code_file, "string");
		assert.equal(binding.adapter.code, undefined);
	}
});

test("navigate identifies the tab it opened by diffing the tab list", async () => {
	const outcome = await runAdapterCase("browser.navigate", {
		input: { url: "https://example.test" },
		provider: {
			named: {
				[LIST]: [
					text([{ tab_id: "aaaa", url: "about:blank", title: "" }]),
					text([
						{ tab_id: "aaaa", url: "about:blank", title: "" },
						{ tab_id: "bbbb", url: "https://example.test/", title: "Example" },
					]),
				],
			},
			call: [text("Opened new tab with URL: https://example.test")],
		},
	});
	assert.equal(outcome.value.tab_id, "bbbb");
	assert.equal(outcome.value.url, "https://example.test/");
	assert.equal(outcome.value.title, "Example");
	assert.deepEqual(outcome.calls, [
		{ path: `callNamed:${LIST}`, args: {} },
		{ path: "callTool", args: { url: "https://example.test", new_tab: true } },
		{ path: `callNamed:${LIST}`, args: {} },
	]);
});

test("navigate refuses to guess when the new tab is ambiguous", async () => {
	const outcome = await runAdapterCase("browser.navigate", {
		input: { url: "https://example.test" },
		provider: {
			named: {
				[LIST]: [text([{ tab_id: "aaaa" }]), text([{ tab_id: "aaaa" }])],
			},
			call: [text("Opened new tab with URL: https://example.test")],
		},
	});
	assert.match(outcome.value.error, /could not be identified/);
	assert.equal(outcome.value.tab_id, undefined);
});

test("text-only browser-use errors are failures, not success", async () => {
	const noSession = text("Error: No browser session active");
	const outcome = await runAdapterCase("browser.navigate", {
		input: { url: "https://example.test" },
		provider: { named: { [LIST]: [noSession] } },
	});
	assert.deepEqual(outcome.value, { raw: noSession });
	const missing = await runAdapterCase("browser.click", {
		input: { ref: "@e7" },
		provider: { call: [text("Element with index 7 not found")] },
	});
	assert.deepEqual(missing.value, text("Element with index 7 not found"));
});

test("tabs maps browser-use tab ids", async () => {
	const outcome = await runAdapterCase("browser.tabs", {
		input: {},
		provider: {
			call: [text([{ tab_id: "aaaa", url: "https://a.test", title: "A" }])],
		},
	});
	assert.deepEqual(outcome.value, {
		tabs: [{ id: "aaaa", url: "https://a.test", title: "A" }],
	});
});

test("snapshot switches to the tab and surfaces indices as @e refs", async () => {
	const outcome = await runAdapterCase("browser.snapshot", {
		input: { tab_id: "bbbb" },
		provider: {
			named: { [SWITCH]: [text("Switched to tab bbbb: https://b.test")] },
			call: [
				text({
					url: "https://b.test",
					title: "B",
					tabs: [],
					interactive_elements: [
						{ index: 3, tag: "button", text: "Go" },
						{ tag: "div", text: "no index" },
					],
				}),
			],
		},
	});
	assert.equal(outcome.value.tab_id, "bbbb");
	assert.deepEqual(outcome.value.elements, [
		{ index: 3, tag: "button", text: "Go", ref: "@e3" },
	]);
	assert.deepEqual(outcome.calls, [
		{ path: `callNamed:${SWITCH}`, args: { tab_id: "bbbb" } },
		{ path: "callTool", args: {} },
	]);
});

test("a failed tab switch stops the action", async () => {
	const refused = {
		isError: true,
		content: [{ type: "text", text: "Error: no tab" }],
	};
	const outcome = await runAdapterCase("browser.click", {
		input: { ref: "@e1", tab_id: "zzzz" },
		provider: { named: { [SWITCH]: [refused] } },
	});
	assert.deepEqual(outcome.value, refused);
	assert.equal(outcome.calls.length, 1);
});

test("click parses the ref back to browser-use's index", async () => {
	const outcome = await runAdapterCase("browser.click", {
		input: { ref: "@e12" },
		provider: { call: [text("Clicked element 12")] },
	});
	assert.deepEqual(outcome.calls, [{ path: "callTool", args: { index: 12 } }]);
	const invalid = await runAdapterCase("browser.click", {
		input: { ref: "#submit" },
	});
	assert.match(invalid.value.error, /ref must be/);
	assert.deepEqual(invalid.calls, []);
});

test("type refuses append and submit semantics browser-use cannot honour", async () => {
	const append = await runAdapterCase("browser.type", {
		input: { ref: "@e2", text: "hi" },
	});
	assert.match(append.value.error, /replace: true/);
	const submit = await runAdapterCase("browser.type", {
		input: { ref: "@e2", text: "hi", replace: true, submit: true },
	});
	assert.match(submit.value.error, /cannot press Enter/);
	assert.deepEqual([...append.calls, ...submit.calls], []);
	const typed = await runAdapterCase("browser.type", {
		input: { ref: "@e2", text: "hi", replace: true },
		provider: { call: [text("Typed 'hi' into element 2")] },
	});
	assert.equal(typed.value.ok, true);
	assert.deepEqual(typed.calls, [
		{ path: "callTool", args: { index: 2, text: "hi" } },
	]);
});

test("scroll refuses a distance or axis browser-use cannot honour", async () => {
	const down = await runAdapterCase("browser.scroll", {
		input: { direction: "down" },
		provider: { call: [text("Scrolled down")] },
	});
	assert.equal(down.value.amount, 500);
	assert.deepEqual(down.calls, [
		{ path: "callTool", args: { direction: "down" } },
	]);
	for (const input of [
		{ direction: "left" },
		{ direction: "down", amount: 120 },
	]) {
		const refused = await runAdapterCase("browser.scroll", { input });
		assert.equal(typeof refused.value.error, "string");
		assert.deepEqual(refused.calls, []);
	}
});

test("screenshot requires an image result", async () => {
	const metaOnly = text({ size_bytes: 0 });
	const missing = await runAdapterCase("browser.screenshot", {
		input: {},
		provider: { call: [metaOnly] },
	});
	assert.deepEqual(missing.value, { raw: metaOnly });
	const success = await runAdapterCase("browser.screenshot", {
		input: {},
		provider: {
			call: [
				{
					content: [
						{ type: "text", text: "{}" },
						{ type: "image", data: "fixture", mimeType: "image/png" },
					],
				},
			],
		},
	});
	assert.deepEqual(success.value.image, {
		data: "fixture",
		mimeType: "image/png",
	});
});
