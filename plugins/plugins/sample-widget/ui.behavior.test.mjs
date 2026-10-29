// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { isNativeNumber } from "../../../tools/dist/native-primitive-observation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRequire = createRequire(
	resolve(here, "../../../apps/desktop/package.json")
);
const globalRegistratorPath = desktopRequire.resolve(
	"@happy-dom/global-registrator"
);
const { Window } = createRequire(globalRegistratorPath)("happy-dom");
const html = readFileSync(join(here, "sample.html"), "utf8");

test("widget controls persist counter state, respect its lower bound, refresh, and react to host updates", async () => {
	const scriptMatches = [
		...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g),
	];
	assert.equal(
		scriptMatches.length,
		1,
		"the widget should ship one inline application module"
	);
	const window = new Window();
	window.window = window;
	window.globalThis = window;
	window.document.body.innerHTML = html.replace(
		/<script type="module">[\s\S]*?<\/script>/g,
		""
	);

	const stateWrites = [];
	const heightNotices = [];
	const toolCalls = [];
	let failRefresh = false;
	let resolveRefresh;
	let holdRefresh = false;
	const bridge = {
		theme: "dark",
		toolInput: { name: "Ada" },
		toolOutput: { greeting: "Hello, Ada!", counter: 3, renderedAt: "initial" },
		widgetState: { count: 3 },
		setWidgetState(next) {
			this.widgetState = next;
			stateWrites.push(next);
		},
		notifyIntrinsicHeight(height) {
			heightNotices.push(height);
		},
		async callTool(name, args) {
			toolCalls.push({ name, args });
			if (failRefresh) {
				throw new Error("host bridge unavailable");
			}
			if (holdRefresh) {
				await new Promise((resolve) => {
					resolveRefresh = resolve;
				});
			}
			return { structuredContent: { renderedAt: "refreshed" } };
		},
	};
	window.ryu = bridge;
	window.openai = bridge;

	runInNewContext(scriptMatches[0][1], window, {
		filename: "plugins-store/plugins/sample-widget/sample.html",
	});
	assert.equal(
		window.document.getElementById("greeting").textContent,
		"Hello, Ada!"
	);
	assert.equal(window.document.getElementById("count").textContent, "3");
	assert.equal(
		window.document.documentElement.getAttribute("data-theme"),
		"dark"
	);
	assert.ok(
		heightNotices.length > 0,
		"initial render should report its intrinsic height"
	);
	assert.equal(isNativeNumber(heightNotices.at(-1)), true);

	window.document.getElementById("inc").click();
	assert.equal(window.document.getElementById("count").textContent, "4");
	assert.equal(stateWrites.at(-1).count, 4);
	window.document.getElementById("dec").click();
	assert.equal(window.document.getElementById("count").textContent, "3");
	assert.equal(stateWrites.at(-1).count, 3);
	bridge.widgetState = { count: 0 };
	window.document.getElementById("dec").click();
	assert.equal(window.document.getElementById("count").textContent, "0");
	assert.equal(stateWrites.at(-1).count, 0);

	const refresh = window.document.getElementById("refresh");
	holdRefresh = true;
	refresh.click();
	await new Promise((resolveTurn) => setImmediate(resolveTurn));
	assert.equal(toolCalls.length, 1);
	assert.equal(refresh.disabled, true);
	refresh.click();
	assert.equal(
		toolCalls.length,
		1,
		"an in-flight refresh must not be duplicated"
	);
	assert.equal(toolCalls[0].name, "render");
	assert.equal(toolCalls[0].args.name, "Ada");
	resolveRefresh();
	await new Promise((resolveTurn) => setImmediate(resolveTurn));
	holdRefresh = false;
	assert.equal(refresh.disabled, false);
	assert.equal(
		window.document.getElementById("meta").textContent,
		"Refreshed at refreshed"
	);

	failRefresh = true;
	refresh.click();
	await new Promise((resolveTurn) => setImmediate(resolveTurn));
	assert.equal(refresh.disabled, false, "failure must permit an exact retry");
	assert.equal(
		window.document.getElementById("meta").textContent,
		"Refresh unavailable (needs widgetAccessible + live session)."
	);

	bridge.theme = "light";
	bridge.toolOutput = { greeting: "Updated from host", counter: 8 };
	bridge.widgetState = {};
	window.dispatchEvent(new window.Event("ryu:set_globals"));
	assert.equal(
		window.document.getElementById("greeting").textContent,
		"Updated from host"
	);
	assert.equal(window.document.getElementById("count").textContent, "8");
	assert.equal(
		window.document.documentElement.getAttribute("data-theme"),
		"light"
	);

	window.close();
});

test("widget refuses refresh without a live tool bridge and permits later retry", async () => {
	const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
	assert.ok(script);
	const window = new Window();
	window.window = window;
	window.globalThis = window;
	window.document.body.innerHTML = html.replace(
		/<script type="module">[\s\S]*?<\/script>/g,
		""
	);
	const bridge = {
		toolOutput: { greeting: "Hello", counter: 0 },
		notifyIntrinsicHeight() {},
	};
	window.ryu = bridge;
	runInNewContext(script, window, {
		filename: "plugins-store/plugins/sample-widget/sample.html",
	});
	const refresh = window.document.getElementById("refresh");
	refresh.click();
	assert.equal(
		window.document.getElementById("meta").textContent,
		"Refresh unavailable (needs widgetAccessible + live session)."
	);
	assert.equal(refresh.disabled, false);

	let retries = 0;
	bridge.callTool = async () => {
		retries += 1;
		return { structuredContent: { renderedAt: "retry-success" } };
	};
	refresh.click();
	await new Promise((resolveTurn) => setImmediate(resolveTurn));
	assert.equal(retries, 1);
	assert.equal(
		window.document.getElementById("meta").textContent,
		"Refreshed at retry-success"
	);
	window.close();
});
