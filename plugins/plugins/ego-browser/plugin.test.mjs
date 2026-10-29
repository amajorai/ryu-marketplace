import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const dispatcher = readFileSync(
	join(here, "tools/ego-browser.js"),
	"utf8"
).replace(/\r\n?/g, "\n");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const operations = [
	"tabs",
	"navigate",
	"snapshot",
	"click",
	"type",
	"scroll",
	"screenshot",
];

// Core's sandbox exposes `childProcess.run(program, { args, stdin })` and
// resolves `{ code, success, stdout, stderr }`; these tests stand in for it.
async function withChildProcess(run, body) {
	const previous = globalThis.childProcess;
	globalThis.childProcess = { run };
	try {
		return await body();
	} finally {
		globalThis.childProcess = previous;
	}
}

function hydrateAdapters(source) {
	const copy = structuredClone(source);
	for (const entry of copy.provides ?? []) {
		for (const binding of Object.values(entry.tools ?? {})) {
			if (binding.adapter?.code_file) {
				binding.adapter.code = readFileSync(
					join(here, binding.adapter.code_file),
					"utf8"
				);
			}
		}
	}
	return copy;
}

test("manifest seals the legacy dispatcher and immutable reviewed operations", () => {
	assert.equal(manifest.id, "@ryu/ego-browser");
	assert.deepEqual(manifest.permissions, {
		child_process: true,
		run: ["ego-browser"],
	});
	assert.equal(manifest.runnables.length, 8);
	assert.equal(manifest.runnables[0].config.slug, "ego_browser.dispatch");
	assert.equal(manifest.runnables[0].config.code, dispatcher);
	assert.deepEqual(manifest.runnables[0].config.annotations, {
		readOnlyHint: false,
		destructiveHint: true,
	});
	for (const operation of operations) {
		const config = manifest.runnables.find(
			(entry) => entry.config.slug === `ego_browser.${operation}`
		)?.config;
		assert.ok(config);
		assert.equal(
			config.code,
			`input.operation = ${JSON.stringify(operation)};\n${dispatcher}`
		);
		assert.deepEqual(config.annotations, {
			readOnlyHint: ["tabs", "snapshot", "screenshot"].includes(operation),
			destructiveHint: !["tabs", "snapshot", "screenshot"].includes(operation),
		});
		assert.equal(
			manifest.provides[0].tools[`browser.${operation}`].tool,
			`ego_browser.${operation}`
		);
	}
	assert.doesNotMatch(JSON.stringify(manifest), /const operation = 'tabs'/);
});

test("native operation wrappers cannot be changed by caller input", async () => {
	for (const operation of operations) {
		let sent = "";
		const run = async (command, options) => {
			assert.equal(command, "ego-browser");
			sent = options.stdin;
			return {
				code: 0,
				success: true,
				stdout: '__RYU_EGO_RESULT_V1__:{"fixture":true}\n',
				stderr: "",
			};
		};
		await withChildProcess(run, async () => {
			const config = manifest.runnables.find(
				(entry) => entry.config.slug === `ego_browser.${operation}`
			).config;
			const input = {
				operation: operation === "navigate" ? "snapshot" : "navigate",
				url: "https://fixture.invalid",
			};
			assert.deepEqual(
				await new AsyncFunction("input", "caller", "host", config.code)(
					input,
					{ agent_id: "operation-fixture" },
					{}
				),
				{ fixture: true }
			);
			assert.equal(input.operation, operation);
			assert.ok(
				sent.includes(`const operation = ${JSON.stringify(operation)};`)
			);
		});
	}
});

test("every canonical verb adds only its immutable operation", async () => {
	const hydrated = hydrateAdapters(manifest);
	const tools = hydrated.provides.find(
		(entry) => entry.capability === "browser.control"
	).tools;
	assert.deepEqual(
		Object.keys(tools),
		operations.map((operation) => `browser.${operation}`)
	);
	for (const operation of operations) {
		const calls = [];
		const result = await new AsyncFunction(
			"input",
			"defaults",
			"callTool",
			"callNamed",
			tools[`browser.${operation}`].adapter.code
		)(
			{ ref: "@e1" },
			{},
			async (args) => {
				calls.push(args);
				return { ok: true };
			},
			async () => {
				throw new Error("adapter must not call another tool");
			}
		);
		assert.deepEqual(calls, [{ ref: "@e1", operation }]);
		assert.deepEqual(result, { ok: true });
	}
});

test("dispatcher executes every operation and ignores marker text inside page data", async () => {
	for (const operation of operations) {
		let childScript = "";
		const events = [];
		const localTabs = [
			{
				active: true,
				targetId: "tab-1",
				title: "__RYU_EGO_RESULT_V1__: page title",
			},
		];
		const run = async (command, options) => {
			assert.equal(command, "ego-browser");
			assert.deepEqual(options.args, ["nodejs"]);
			childScript = options.stdin;
			let logged = "";
			const taskSpaces = {
				useOrCreate: async (name) => events.push(["space", name]),
			};
			const browser = {
				listTabs: async (listOptions) => {
					events.push(["listTabs", listOptions]);
					return localTabs;
				},
				switchTab: async (id) => events.push(["switch", id]),
				openOrReuseTab: async (url, openOptions) => {
					events.push(["openOrReuseTab", url, openOptions]);
					return { targetId: "tab-nav", url };
				},
			};
			const page = {
				snapshotRaw: async () => {
					events.push(["snapshotRaw"]);
					return {
						content: "__RYU_EGO_RESULT_V1__: hostile page text",
						refs: { e1: { role: "button" } },
					};
				},
				locator: (ref) => ({
					click: async () => events.push(["click", ref]),
					fill: async (text, fillOptions) =>
						events.push(["fill", ref, text, fillOptions]),
					press: async (key) => events.push(["press", ref, key]),
				}),
				info: async () => {
					events.push(["info"]);
					return { h: 100 };
				},
				mouse: {
					wheel: async (x, y) => events.push(["wheel", x, y]),
				},
			};
			const cdp = async (method, params) => {
				events.push(["cdp", method, params]);
				return { data: "cG5n" };
			};
			await new AsyncFunction(
				"taskSpaces",
				"browser",
				"page",
				"cdp",
				"console",
				childScript
			)(taskSpaces, browser, page, cdp, {
				log: (value) => {
					logged = value;
				},
			});
			return {
				code: 0,
				success: true,
				stdout: `noise\n${logged}\n`,
				stderr: "",
			};
		};

		const input = {
			operation,
			url: "http://127.0.0.1:4177/fixture",
			ref: "@e1",
			text: "hello \x60 \x24{not_code}",
			direction: "down",
			amount: 100,
			tab_id: "tab-target",
			replace: true,
			submit: true,
		};
		const result = await withChildProcess(run, () =>
			new AsyncFunction("input", "caller", "host", dispatcher)(
				input,
				{ conversation_id: "conv/demo" },
				{}
			)
		);
		assert.equal(
			childScript.includes(`const operation = "${operation}"`),
			true
		);
		const taskSpace = ["space", "ryu-conversation-conv-demo"];
		const listTabs = ["listTabs", { includeChrome: false }];
		const switchTab = ["switch", "tab-target"];
		const expectedEvents = {
			tabs: [taskSpace, listTabs],
			navigate: [
				taskSpace,
				["openOrReuseTab", "http://127.0.0.1:4177/fixture", { wait: true }],
			],
			snapshot: [taskSpace, listTabs, switchTab, ["snapshotRaw"]],
			click: [taskSpace, listTabs, switchTab, ["click", "@e1"]],
			type: [
				taskSpace,
				listTabs,
				switchTab,
				["fill", "@e1", input.text, { clearFirst: true }],
				["press", "@e1", "Enter"],
			],
			scroll: [taskSpace, listTabs, switchTab, ["info"], ["wheel", 0, 100]],
			screenshot: [
				taskSpace,
				listTabs,
				switchTab,
				["cdp", "Page.captureScreenshot", { format: "png" }],
			],
		};
		assert.deepEqual(events, expectedEvents[operation]);
		const expectedResults = {
			tabs: { tabs: localTabs },
			navigate: {
				tab_id: "tab-nav",
				tab: {
					targetId: "tab-nav",
					url: "http://127.0.0.1:4177/fixture",
				},
			},
			snapshot: {
				tab_id: "tab-target",
				snapshot: "__RYU_EGO_RESULT_V1__: hostile page text",
				refs: { e1: { role: "button" } },
			},
			click: { ok: true, tab_id: "tab-target" },
			type: { ok: true, tab_id: "tab-target" },
			scroll: { ok: true, tab_id: "tab-target" },
			screenshot: {
				tab_id: "tab-target",
				image: "cG5n",
				encoding: "base64",
				mime: "image/png",
			},
		};
		assert.deepEqual(result, expectedResults[operation]);
	}
});

test("dispatcher rejects unknown verbs before spawn and surfaces worker failure", async () => {
	let commandCount = 0;
	let childScript = "";
	await withChildProcess(
		() => {
			throw new Error("invalid operations must be refused before spawning");
		},
		() =>
			assert.rejects(
				new AsyncFunction("input", "caller", "host", dispatcher)(
					{ operation: "launch-external-url" },
					{},
					{}
				),
				/unsupported Ego Browser operation/
			)
	);
	assert.equal(commandCount, 0);

	const failing = async (command, options) => {
		commandCount += 1;
		assert.equal(command, "ego-browser");
		assert.deepEqual(options.args, ["nodejs"]);
		childScript = options.stdin;
		return {
			code: 1,
			success: false,
			stdout: "",
			stderr: "local fixture worker stopped",
		};
	};
	await withChildProcess(failing, () =>
		assert.rejects(
			new AsyncFunction("input", "caller", "host", dispatcher)(
				{
					operation: "navigate",
					url: "http://127.0.0.1:4177/rejected-fixture",
				},
				{ conversation_id: "local-error-case" },
				{}
			),
			/ego-browser failed: local fixture worker stopped/
		)
	);
	assert.equal(commandCount, 1);
	assert.match(childScript, /127\.0\.0\.1:4177\/rejected-fixture/);
});

test("dispatcher refuses missing, duplicate and malformed result frames then succeeds on explicit retry", async () => {
	const prefix = "__RYU_EGO_RESULT_V1__:";
	let attempts = 0;
	let stdout = "worker log only\n";
	const scripts = [];
	const run = async (command, options) => {
		assert.equal(command, "ego-browser");
		assert.deepEqual(options.args, ["nodejs"]);
		attempts += 1;
		scripts.push(options.stdin);
		return { code: 0, success: true, stdout, stderr: "" };
	};
	await withChildProcess(run, async () => {
		const dispatch = () =>
			new AsyncFunction("input", "caller", "host", dispatcher)(
				{ operation: "tabs" },
				{ agent_id: "agent/fixture" },
				{}
			);
		await assert.rejects(dispatch(), /returned 0 result frames/);
		assert.equal(attempts, 1, "no automatic retry on missing output");
		stdout = `${prefix}{}\n${prefix}{}\n`;
		await assert.rejects(dispatch(), /returned 2 result frames/);
		assert.equal(attempts, 2);
		stdout = `${prefix}{malformed}\n`;
		await assert.rejects(dispatch(), /returned invalid JSON/);
		assert.equal(attempts, 3);
		stdout = `worker log\n${prefix}{"tabs":[]}\n`;
		assert.deepEqual(await dispatch(), { tabs: [] });
		assert.equal(attempts, 4, "only the explicit retry starts another worker");
		assert.equal(scripts.length, 4);
		for (const script of scripts) {
			assert.match(script, /ryu-agent-agent-fixture/);
		}
	});
});
