// Co-located contract tests for the Ego Browser provider.
//
// The live ego-lite app is an external dependency, so this test deliberately
// proves the integration boundary rather than pretending the dependency is
// installed on every CI runner. It validates the manifest Core loads, the
// stable browser.control mapping, every inline tool's JavaScript syntax, and
// the fixed child-process invocation that keeps model input out of a shell.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

const CANONICAL_VERBS = [
	"browser.navigate",
	"browser.tabs",
	"browser.snapshot",
	"browser.click",
	"browser.type",
	"browser.scroll",
	"browser.screenshot",
];

const runnableBySlug = new Map(
	(manifest.runnables ?? []).map((runnable) => [
		runnable.config?.slug,
		runnable,
	])
);

test("manifest identity and external-runtime posture are explicit", () => {
	assert.equal(manifest.id, "@ryu/ego-browser");
	assert.equal(manifest.name, "Ego Browser");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(manifest.stability, "experimental");
	assert.match(manifest.description, /github\.com\/citrolabs\/ego-lite/);
	assert.match(manifest.description, /macOS/);
	assert.deepEqual(manifest.permissions, { child_process: true });
	assert.equal(manifest.mcp_servers, undefined);
	assert.deepEqual([...manifest.permission_grants].sort(), [
		"browser:control",
		"tool:execute",
	]);
});

test("browser.control is a complete selectable provider", () => {
	const provider = manifest.provides?.find(
		(entry) => entry.capability === "browser.control"
	);
	assert.ok(provider, "manifest must provide browser.control");
	assert.equal(provider.version, "1.0.0");
	assert.equal(provider.title, "Browser");
	assert.equal(provider.grant, "browser:control");
	assert.equal(provider.target, "local-machine");
	assert.equal(provider.selectable, true);
	assert.deepEqual(
		Object.keys(provider.tools).sort(),
		[...CANONICAL_VERBS].sort()
	);

	for (const verb of CANONICAL_VERBS) {
		const binding = provider.tools[verb];
		const nativeSlug = verb.slice("browser.".length);
		assert.equal(binding.tool, `ego_browser.${nativeSlug}`);
		assert.equal(
			runnableBySlug.has(binding.tool),
			true,
			`${verb} must target a declared runnable`
		);
	}
});

test("each canonical verb has the expected input contract", () => {
	const schemas = Object.fromEntries(
		(manifest.runnables ?? []).map((runnable) => [
			runnable.config.slug,
			runnable.config.input_schema,
		])
	);

	assert.deepEqual(Object.keys(schemas["ego_browser.tabs"].properties), []);
	assert.deepEqual(schemas["ego_browser.navigate"].required, ["url"]);
	assert.deepEqual(schemas["ego_browser.snapshot"].required ?? [], []);
	assert.deepEqual(schemas["ego_browser.click"].required, ["ref"]);
	assert.deepEqual(schemas["ego_browser.type"].required, ["ref", "text"]);
	assert.deepEqual(schemas["ego_browser.scroll"].required, ["direction"]);
	assert.deepEqual(schemas["ego_browser.screenshot"].required ?? [], []);
	assert.deepEqual(schemas["ego_browser.scroll"].properties.direction.enum, [
		"up",
		"down",
		"left",
		"right",
	]);
});

test("every inline bridge is parseable and invokes only ego-browser nodejs", () => {
	assert.equal(manifest.runnables.length, CANONICAL_VERBS.length);
	for (const runnable of manifest.runnables) {
		const config = runnable.config;
		assert.equal(runnable.kind, "tool");
		assert.equal(config.backend, "inline_deno");
		assert.equal(typeof config.code, "string");
		assert.ok(config.code.length > 0);

		const program = `"use strict"; return (async () => {${config.code}\n})();`;
		assert.doesNotThrow(
			() => new Function("input", "caller", "host", program),
			`${config.slug} code must parse as a sandbox fragment`
		);
		assert.match(config.code, /new Deno\.Command\('ego-browser'/);
		assert.match(config.code, /args: \['nodejs'\]/);
		assert.match(config.code, /taskSpaces\.useOrCreate/);
		assert.match(config.code, /__RYU_EGO_RESULT__/);
		assert.doesNotMatch(config.code, /Deno\.Command\(input/);
		assert.doesNotMatch(config.code, /shell\s*:/);
	}
});

test("each inline bridge executes its operation contract with a CLI harness", async () => {
	const cases = {
		tabs: {},
		navigate: { url: "https://example.com" },
		snapshot: {},
		click: { ref: "e1" },
		type: { ref: "e2", text: "hello", replace: true, submit: true },
		scroll: { direction: "down", amount: 100 },
		screenshot: {},
	};
	const previousDeno = globalThis.Deno;

	try {
		for (const [operation, input] of Object.entries(cases)) {
			const events = [];
			let childScript = "";

			class FakeCommand {
				constructor(command, options) {
					assert.equal(command, "ego-browser");
					assert.deepEqual(options, {
						args: ["nodejs"],
						stdin: "piped",
						stdout: "piped",
						stderr: "piped",
					});
				}

				spawn() {
					return {
						stdin: {
							getWriter() {
								return {
									write: async (bytes) => {
										childScript = new TextDecoder().decode(bytes);
									},
									close: async () => {},
								};
							},
						},
						output: async () => {
							let logged;
							const taskSpaces = {
								useOrCreate: async (name) => {
									events.push(["space", name]);
								},
							};
							const browser = {
								listTabs: async () => [
									{ active: true, targetId: "tab-1", title: "Example" },
								],
								switchTab: async (targetId) => {
									events.push(["switch", targetId]);
								},
								openOrReuseTab: async (url) => ({
									targetId: "tab-1",
									url,
								}),
							};
							const page = {
								snapshotRaw: async () => ({
									content: "button Submit",
									refs: { e1: { role: "button" } },
								}),
								locator: (ref) => ({
									click: async () => events.push(["click", ref]),
									fill: async (text, options) =>
										events.push(["fill", ref, text, options]),
									press: async (key) => events.push(["press", ref, key]),
								}),
								info: async () => ({ h: 100 }),
								mouse: {
									wheel: async (x, y) => events.push(["wheel", x, y]),
								},
							};
							const cdp = async () => ({ data: "cG5n" });
							const childConsole = {
								log: (value) => {
									logged = value;
								},
							};

							await new Function(
								"taskSpaces",
								"browser",
								"page",
								"cdp",
								"console",
								`return (async () => {${childScript}})()`
							)(taskSpaces, browser, page, cdp, childConsole);

							return {
								success: true,
								stdout: new TextEncoder().encode(`${logged}\n`),
								stderr: new Uint8Array(),
							};
						},
					};
				}
			}

			globalThis.Deno = { Command: FakeCommand };
			const runnable = runnableBySlug.get(`ego_browser.${operation}`);
			const program = `"use strict"; return (async () => {${runnable.config.code}\n})();`;
			const result = await new Function("input", "caller", "host", program)(
				input,
				{ conversation_id: "conv/demo" },
				{}
			);

			assert.equal(
				childScript.includes(`const operation = "${operation}"`),
				true
			);
			assert.deepEqual(events[0], ["space", "ryu-conversation-conv-demo"]);
			if (operation === "tabs") {
				assert.equal(result.tabs[0].targetId, "tab-1");
			} else {
				assert.equal(result.tab_id, "tab-1");
			}
			if (operation === "navigate") {
				assert.equal(result.tab.url, input.url);
			}
			if (operation === "snapshot") {
				assert.equal(result.snapshot, "button Submit");
				assert.deepEqual(result.refs, { e1: { role: "button" } });
			}
			if (operation === "screenshot") {
				assert.equal(result.image, "cG5n");
				assert.equal(result.mime, "image/png");
			}
			if (operation === "click") {
				assert.deepEqual(events.at(-1), ["click", "e1"]);
			}
			if (operation === "type") {
				assert.deepEqual(events.at(-2), [
					"fill",
					"e2",
					"hello",
					{ clearFirst: true },
				]);
				assert.deepEqual(events.at(-1), ["press", "e2", "Enter"]);
			}
			if (operation === "scroll") {
				assert.deepEqual(events.at(-1), ["wheel", 0, 100]);
			}
		}
	} finally {
		if (typeof previousDeno === "undefined") {
			globalThis.Deno = undefined;
		} else {
			globalThis.Deno = previousDeno;
		}
	}
});

test("tool slugs are unique, namespaced, and operation-complete", () => {
	assert.equal(runnableBySlug.size, CANONICAL_VERBS.length);
	for (const verb of CANONICAL_VERBS) {
		const operation = verb.slice("browser.".length);
		const runnable = runnableBySlug.get(`ego_browser.${operation}`);
		assert.ok(runnable, `${verb} must have a runnable`);
		assert.match(
			runnable.config.code,
			new RegExp(`const operation = '${operation}'`)
		);
		assert.match(runnable.config.slug, /^ego_browser\.[a-z]+$/);
	}
});
