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

const json = (value) => ({
	content: [{ type: "text", text: JSON.stringify(value) }],
});
const done = { content: [{ type: "text", text: "executed 1 action(s)." }] };
const providerError = {
	isError: true,
	content: [{ type: "text", text: "authentication required" }],
};

test("declares an external Kernel provider over hosted OAuth", () => {
	const manifest = parseManifest();
	assert.equal(manifest.external, true);
	assert.equal(manifest.mcp_servers.kernel.type, "streamable-http");
	assert.equal(manifest.mcp_servers.kernel.url, "https://mcp.onkernel.com/mcp");
	assert.deepEqual(manifest.mcp_servers.kernel.auth, { type: "oauth" });
	assert.deepEqual(manifest.permission_grants, [
		"mcp:server",
		"identity.read",
		"tool:execute",
	]);
});

test("binds only the coordinate and session verbs Kernel can honour", () => {
	const layer = parseManifest().provides.find(
		(provided) => provided.capability === "browser.control"
	);
	assert.equal(layer.target, "remote-desktop");
	assert.equal(layer.selectable, true);
	assert.deepEqual(Object.keys(layer.tools).sort(), [
		"browser.click_at",
		"browser.drag",
		"browser.key",
		"browser.navigate",
		"browser.screenshot",
		"browser.scroll",
		"browser.tabs",
	]);
	for (const binding of Object.values(layer.tools)) {
		assert.equal(typeof binding.adapter?.code_file, "string");
		assert.equal(binding.adapter.code, undefined);
	}
});

test("navigate creates a browser and returns its session as the tab id", async () => {
	const outcome = await runAdapterCase("browser.navigate", {
		input: { url: "https://example.test" },
		provider: {
			call: [
				json({
					browser: {
						session_id: "k1",
						browser_live_view_url: "https://live.example.test/k1",
					},
				}),
			],
		},
	});
	assert.equal(outcome.value.tab_id, "k1");
	assert.equal(outcome.value.url, "https://example.test");
	assert.equal(outcome.value.live_view_url, "https://live.example.test/k1");
	assert.deepEqual(outcome.calls, [
		{
			path: "callTool",
			args: { action: "create", start_url: "https://example.test" },
		},
	]);
});

test("navigate always creates a new browser and preserves provider failures", async () => {
	// The canonical navigate schema has no tab_id, so a stray one is ignored.
	const fresh = await runAdapterCase("browser.navigate", {
		input: { url: "https://example.test", tab_id: "k2" },
		provider: { call: [json({ browser: { session_id: "k3" } })] },
	});
	assert.equal(fresh.value.tab_id, "k3");
	assert.deepEqual(fresh.calls, [
		{
			path: "callTool",
			args: { action: "create", start_url: "https://example.test" },
		},
	]);
	const refused = await runAdapterCase("browser.navigate", {
		input: { url: "https://example.test" },
		provider: { call: [providerError] },
	});
	assert.deepEqual(refused.value, { raw: providerError });
	const missing = await runAdapterCase("browser.navigate", { input: {} });
	assert.equal(typeof missing.value.error, "string");
	assert.deepEqual(missing.calls, []);
});

test("tabs lists live sessions without inventing a page URL", async () => {
	const outcome = await runAdapterCase("browser.tabs", {
		input: {},
		provider: {
			call: [
				json({
					items: [
						{ session_id: "k1", name: "checkout", start_url: "https://a.test" },
						{ session_id: "k2" },
						{ name: "no-id" },
					],
					has_more: false,
				}),
			],
		},
	});
	assert.deepEqual(outcome.value, {
		tabs: [
			{ id: "k1", url: "https://a.test", title: "checkout" },
			{ id: "k2", url: "", title: "k2" },
		],
		has_more: false,
	});
	assert.deepEqual(outcome.calls, [
		{ path: "callTool", args: { action: "list", status: "active" } },
	]);
});

for (const verb of [
	"browser.screenshot",
	"browser.click_at",
	"browser.key",
	"browser.scroll",
	"browser.drag",
]) {
	test(`${verb} requires a session tab id before any provider effect`, async () => {
		const outcome = await runAdapterCase(verb, {
			input: {
				x: 1,
				y: 2,
				keys: ["Escape"],
				direction: "down",
				from: { x: 0, y: 0 },
				to: { x: 1, y: 1 },
			},
		});
		assert.match(outcome.value.error, /tab_id is required/);
		assert.deepEqual(outcome.calls, []);
	});
}

test("screenshot returns Kernel's image and requires one", async () => {
	const success = await runAdapterCase("browser.screenshot", {
		input: { tab_id: "k1" },
		provider: {
			call: [
				{
					content: [
						{ type: "text", text: "viewport: 1024x768." },
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
	assert.deepEqual(success.calls, [
		{
			path: "callTool",
			args: { session_id: "k1", actions: [{ type: "screenshot" }] },
		},
	]);
	const missing = await runAdapterCase("browser.screenshot", {
		input: { tab_id: "k1" },
		provider: { call: [done] },
	});
	assert.deepEqual(missing.value, { raw: done });
});

test("click_at maps button and count onto click_mouse", async () => {
	const outcome = await runAdapterCase("browser.click_at", {
		input: { tab_id: "k1", x: 10, y: 20, button: "right", count: 2 },
		provider: { call: [done] },
	});
	assert.deepEqual(outcome.calls[0].args, {
		session_id: "k1",
		actions: [
			{
				type: "click_mouse",
				click_mouse: { x: 10, y: 20, button: "right", num_clicks: 2 },
			},
		],
	});
	const invalid = await runAdapterCase("browser.click_at", {
		input: { tab_id: "k1", x: "10", y: 20 },
	});
	assert.equal(typeof invalid.value.error, "string");
	assert.deepEqual(invalid.calls, []);
});

test("key joins canonical tokens into one X11 chord", async () => {
	const outcome = await runAdapterCase("browser.key", {
		input: { tab_id: "k1", keys: ["cmd", "l"] },
		provider: { call: [done] },
	});
	assert.equal(outcome.value.chord, "Ctrl+l");
	assert.deepEqual(outcome.calls[0].args, {
		session_id: "k1",
		actions: [{ type: "press_key", press_key: { keys: ["Ctrl+l"] } }],
	});
	const enter = await runAdapterCase("browser.key", {
		input: { tab_id: "k1", keys: ["Enter"] },
		provider: { call: [providerError] },
	});
	assert.deepEqual(enter.value, providerError);
	assert.deepEqual(enter.calls[0].args.actions[0].press_key.keys, ["Return"]);
});

test("scroll converts pixels to wheel units at the viewport centre", async () => {
	const outcome = await runAdapterCase("browser.scroll", {
		input: { tab_id: "k1", direction: "up", amount: 300 },
		provider: {
			named: {
				"kernel.manage_browsers": [
					json({ session_id: "k1", viewport: { width: 1000, height: 600 } }),
				],
			},
			call: [done],
		},
	});
	assert.equal(outcome.value.wheel_units, 3);
	assert.deepEqual(outcome.value.point, { x: 500, y: 300 });
	assert.deepEqual(outcome.calls, [
		{
			path: "callNamed:kernel.manage_browsers",
			args: { action: "get", session_id: "k1" },
		},
		{
			path: "callTool",
			args: {
				session_id: "k1",
				actions: [{ type: "scroll", scroll: { x: 500, y: 300, delta_y: -3 } }],
			},
		},
	]);
	const sideways = await runAdapterCase("browser.scroll", {
		input: { tab_id: "k1", direction: "right" },
		provider: {
			named: { "kernel.manage_browsers": [json({ session_id: "k1" })] },
			call: [done],
		},
	});
	assert.deepEqual(sideways.value.point, { x: 10, y: 10 });
	assert.deepEqual(sideways.calls[1].args.actions[0].scroll, {
		x: 10,
		y: 10,
		delta_x: 5,
	});
	const refused = await runAdapterCase("browser.scroll", {
		input: { tab_id: "k1", direction: "down" },
		provider: { named: { "kernel.manage_browsers": [providerError] } },
	});
	assert.deepEqual(refused.value, providerError);
	assert.equal(refused.calls.length, 1);
});

test("drag sends a two-point path", async () => {
	const outcome = await runAdapterCase("browser.drag", {
		input: { tab_id: "k1", from: { x: 1, y: 2 }, to: { x: 30, y: 40 } },
		provider: { call: [done] },
	});
	assert.deepEqual(outcome.calls[0].args, {
		session_id: "k1",
		actions: [
			{
				type: "drag_mouse",
				drag_mouse: {
					path: [
						[1, 2],
						[30, 40],
					],
				},
			},
		],
	});
});
