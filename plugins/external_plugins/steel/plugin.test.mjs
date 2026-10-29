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

const ok = (structuredContent = {}) => ({
	content: [{ type: "text", text: "### Result\nok" }],
	structuredContent,
});
const providerError = {
	isError: true,
	content: [{ type: "text", text: "bad" }],
};

test("declares an external Steel provider with a vault-backed key", () => {
	const manifest = parseManifest();
	assert.equal(manifest.external, true);
	assert.deepEqual(manifest.permission_grants, ["mcp:server", "tool:execute"]);
	const server = manifest.mcp_servers.steel;
	assert.equal(server.command, "npx");
	// Pinned to the v2.0.1 commit; Steel does not publish the server to npm.
	assert.match(
		server.args[1],
		/^github:steel-dev\/steel-mcp-server#[0-9a-f]{40}$/
	);
	assert.equal(server.env.STEEL_API_KEY, "secret:STEEL_API_KEY");
	assert.equal(server.env.STEEL_PROFILE, "browse");
});

test("ships hidden because its session handle does not outlive one MCP call", () => {
	// Core starts a fresh stdio server per tool call, and Steel keeps the handle that
	// steel_session_create mints in that process, so browser.navigate cannot hand a
	// usable tab id to the next verb. Keep the listing dark until that changes.
	const manifest = parseManifest();
	assert.equal(manifest.hidden, true);
	assert.equal(manifest.stability, "experimental");
	assert.match(manifest.description, /Not usable as the Browser layer yet/);
});

test("participates in the Browser toolkit with session-scoped verbs", () => {
	const layer = parseManifest().provides.find(
		(provided) => provided.capability === "browser.control"
	);
	assert.equal(layer.target, "remote-desktop");
	assert.equal(layer.selectable, true);
	assert.deepEqual(Object.keys(layer.tools).sort(), [
		"browser.click",
		"browser.hover",
		"browser.navigate",
		"browser.screenshot",
		"browser.scroll",
		"browser.snapshot",
		"browser.type",
	]);
	for (const binding of Object.values(layer.tools)) {
		assert.match(binding.tool, /^steel\.steel_/);
		assert.equal(typeof binding.adapter?.code_file, "string");
		assert.equal(binding.adapter.code, undefined);
	}
});

test("navigate starts a session and returns its handle as the tab id", async () => {
	const outcome = await runAdapterCase("browser.navigate", {
		input: { url: "https://example.test" },
		provider: {
			named: { "steel.steel_session_create": [ok({ session_id: "s1" })] },
			call: [
				ok({
					final_url: "https://example.test/home",
					title: "Home",
					navigated: true,
				}),
			],
		},
	});
	assert.equal(outcome.value.tab_id, "s1");
	assert.equal(outcome.value.url, "https://example.test/home");
	assert.equal(outcome.value.title, "Home");
	assert.deepEqual(outcome.calls, [
		{ path: "callNamed:steel.steel_session_create", args: {} },
		{
			path: "callTool",
			args: { session_id: "s1", url: "https://example.test" },
		},
	]);
});

test("navigate always starts a new session and preserves provider failures", async () => {
	// The canonical navigate schema has no tab_id, so a stray one is ignored.
	const fresh = await runAdapterCase("browser.navigate", {
		input: { url: "https://example.test", tab_id: "s9" },
		provider: {
			named: { "steel.steel_session_create": [ok({ session_id: "s2" })] },
			call: [ok({})],
		},
	});
	assert.equal(fresh.value.tab_id, "s2");
	assert.equal(fresh.value.url, "https://example.test");
	assert.deepEqual(fresh.calls, [
		{ path: "callNamed:steel.steel_session_create", args: {} },
		{
			path: "callTool",
			args: { session_id: "s2", url: "https://example.test" },
		},
	]);
	const refused = await runAdapterCase("browser.navigate", {
		input: { url: "https://example.test" },
		provider: { named: { "steel.steel_session_create": [providerError] } },
	});
	assert.deepEqual(refused.value, { raw: providerError });
	const missing = await runAdapterCase("browser.navigate", { input: {} });
	assert.equal(typeof missing.value.error, "string");
	assert.deepEqual(missing.calls, []);
});

for (const verb of [
	"browser.snapshot",
	"browser.click",
	"browser.hover",
	"browser.type",
	"browser.scroll",
	"browser.screenshot",
]) {
	test(`${verb} requires a session tab id before any provider effect`, async () => {
		const outcome = await runAdapterCase(verb, {
			input: { ref: "@e1", text: "x", replace: true, direction: "down" },
		});
		assert.match(outcome.value.error, /tab_id is required/);
		assert.deepEqual(outcome.calls, []);
	});
}

test("click and hover act on the referenced element", async () => {
	for (const [verb, action] of [
		["browser.click", "click"],
		["browser.hover", "hover"],
	]) {
		const outcome = await runAdapterCase(verb, {
			input: { tab_id: "s1", ref: "@e4" },
			provider: { call: [ok()] },
		});
		assert.deepEqual(outcome.calls, [
			{ path: "callTool", args: { session_id: "s1", action, target: "@e4" } },
		]);
	}
});

test("type refuses append semantics Steel cannot honour", async () => {
	const outcome = await runAdapterCase("browser.type", {
		input: { tab_id: "s1", ref: "@e2", text: "hello" },
	});
	assert.match(outcome.value.error, /replace: true/);
	assert.deepEqual(outcome.calls, []);
});

test("type replaces and presses Enter only when asked to submit", async () => {
	const outcome = await runAdapterCase("browser.type", {
		input: {
			tab_id: "s1",
			ref: "@e2",
			text: "hello",
			replace: true,
			submit: true,
		},
		provider: { call: [ok(), ok()] },
	});
	assert.equal(outcome.value.submitted, true);
	assert.deepEqual(outcome.calls, [
		{
			path: "callTool",
			args: { session_id: "s1", action: "type", target: "@e2", value: "hello" },
		},
		{
			path: "callTool",
			args: { session_id: "s1", action: "press", value: "Enter" },
		},
	]);
	const failedType = await runAdapterCase("browser.type", {
		input: {
			tab_id: "s1",
			ref: "@e2",
			text: "hello",
			replace: true,
			submit: true,
		},
		provider: { call: [providerError] },
	});
	assert.deepEqual(failedType.value, providerError);
	assert.equal(failedType.calls.length, 1);
});

test("scroll signs the pixel distance and refuses a horizontal axis", async () => {
	const up = await runAdapterCase("browser.scroll", {
		input: { tab_id: "s1", direction: "up", amount: 300 },
		provider: { call: [ok()] },
	});
	assert.deepEqual(up.calls, [
		{
			path: "callTool",
			args: { session_id: "s1", action: "scroll", value: "-300" },
		},
	]);
	const fallback = await runAdapterCase("browser.scroll", {
		input: { tab_id: "s1", direction: "down" },
		provider: { call: [ok()] },
	});
	assert.equal(fallback.calls[0].args.value, "600");
	const sideways = await runAdapterCase("browser.scroll", {
		input: { tab_id: "s1", direction: "left" },
	});
	assert.match(sideways.value.error, /vertically/);
	assert.deepEqual(sideways.calls, []);
});

test("screenshot requires an image result", async () => {
	const textOnly = ok();
	const missing = await runAdapterCase("browser.screenshot", {
		input: { tab_id: "s1" },
		provider: { call: [textOnly] },
	});
	assert.deepEqual(missing.value, { raw: textOnly });
	const success = await runAdapterCase("browser.screenshot", {
		input: { tab_id: "s1" },
		provider: {
			call: [
				{
					content: [
						{ type: "text", text: "captured" },
						{ type: "image", data: "fixture", mimeType: "image/jpeg" },
					],
				},
			],
		},
	});
	assert.deepEqual(success.value.image, {
		data: "fixture",
		mimeType: "image/jpeg",
	});
	assert.deepEqual(success.calls, [
		{ path: "callTool", args: { session_id: "s1" } },
	]);
});
