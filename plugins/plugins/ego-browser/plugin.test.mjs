import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const dispatcher = readFileSync(join(here, "tools/ego-browser.js"), "utf8");
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

test("manifest seals one dispatcher and an explicit executable allowlist", () => {
	assert.equal(manifest.id, "@ryu/ego-browser");
	assert.deepEqual(manifest.permissions, {
		child_process: true,
		run: ["ego-browser"],
	});
	assert.equal(manifest.runnables.length, 1);
	assert.equal(manifest.runnables[0].config.slug, "ego_browser.dispatch");
	assert.equal(manifest.runnables[0].config.code, dispatcher);
	assert.doesNotMatch(JSON.stringify(manifest), /const operation = 'tabs'/);
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
	const previousDeno = globalThis.Deno;
	try {
		for (const operation of operations) {
			let childScript = "";
			const events = [];
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
							getWriter: () => ({
								write: async (bytes) => {
									childScript = new TextDecoder().decode(bytes);
								},
								close: async () => {},
							}),
						},
						output: async () => {
							let logged = "";
							const taskSpaces = {
								useOrCreate: async (name) => events.push(["space", name]),
							};
							const browser = {
								listTabs: async () => [
									{
										active: true,
										targetId: "tab-1",
										title: "__RYU_EGO_RESULT_V1__: page title",
									},
								],
								switchTab: async (id) => events.push(["switch", id]),
								openOrReuseTab: async (url) => ({ targetId: "tab-1", url }),
							};
							const page = {
								snapshotRaw: async () => ({
									content: "__RYU_EGO_RESULT_V1__: hostile page text",
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
								success: true,
								stdout: new TextEncoder().encode(`noise\n${logged}\n`),
								stderr: new Uint8Array(),
							};
						},
					};
				}
			}

			globalThis.Deno = { Command: FakeCommand };
			const input = {
				operation,
				url: "https://example.com",
				ref: "@e1",
				text: "hello \x60 \x24{not_code}",
				direction: "down",
				amount: 100,
			};
			const result = await new AsyncFunction(
				"input",
				"caller",
				"host",
				dispatcher
			)(input, { conversation_id: "conv/demo" }, {});
			assert.equal(
				childScript.includes(`const operation = "${operation}"`),
				true
			);
			assert.deepEqual(events[0], ["space", "ryu-conversation-conv-demo"]);
			if (operation === "tabs") {
				assert.match(result.tabs[0].title, /RYU_EGO_RESULT/);
			} else {
				assert.equal(result.tab_id, "tab-1");
			}
			if (operation === "snapshot") {
				assert.match(result.snapshot, /hostile page text/);
			}
		}
	} finally {
		globalThis.Deno = previousDeno;
	}
});

test("Deno executable scope admits ego-browser and rejects an undeclared binary", {
	// Bun's nested spawnSync environment grants the command even when Deno is
	// passed a different allow-run value; Node runs the real permission probe.
	skip: process.platform === "win32" || Boolean(process.versions.bun),
}, () => {
	const directory = mkdtempSync(join(tmpdir(), "ryu-ego-browser-"));
	try {
		const executable = join(directory, "ego-browser");
		writeFileSync(executable, "#!/bin/sh\nexit 37");
		chmodSync(executable, 0o755);
		const script =
			'const out = await new Deno.Command("ego-browser", { stdout: "piped" }).output(); Deno.exit(out.code === 37 ? 0 : 1);';
		const env = {
			...process.env,
			PATH: `${directory}:${process.env.PATH ?? ""}`,
		};
		const allowed = spawnSync(
			"deno",
			["run", "--quiet", "--no-prompt", `--allow-run=${executable}`, "-"],
			{ encoding: "utf8", env, input: script }
		);
		assert.equal(allowed.status, 0, allowed.stderr);

		const denied = spawnSync(
			"deno",
			["run", "--quiet", "--no-prompt", "--allow-run=ryu-cap", "-"],
			{ encoding: "utf8", env, input: script }
		);
		assert.notEqual(denied.status, 0);
		assert.match(denied.stderr, /NotCapable|Requires run access/i);
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});
