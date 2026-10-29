// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { isNativeFunction } from "../../../tools/dist/native-primitive-observation.mjs";

// Match the actual managed Pi loader's closed native Typebox aliases.
// These resolve the installed SDK implementation, not a shape-only fixture.
const piRequire = createRequire(
	import.meta.resolve("@earendil-works/pi-coding-agent")
);
const nativeTypeboxEntries = new Map([
	["typebox", piRequire.resolve("typebox")],
	["typebox/value", piRequire.resolve("typebox/value")],
]);
registerHooks({
	resolve(specifier, context, nextResolve) {
		const entry = nativeTypeboxEntries.get(specifier);
		if (entry) {
			return { shortCircuit: true, url: pathToFileURL(entry).href };
		}
		return nextResolve(specifier, context);
	},
});

const monitorExtension = (await import("./pi-extensions/ryu-monitor.ts"))
	.default;
const registeredTools = new Map();
const eventHandlers = new Map();
const piFixture = {
	registerTool(tool) {
		registeredTools.set(tool.name, tool);
	},
	on(event, handler) {
		eventHandlers.set(event, handler);
	},
};
const priorSubagent = process.env.RYU_PI_SUBAGENT;
delete process.env.RYU_PI_SUBAGENT;
monitorExtension(piFixture);
if (priorSubagent !== undefined) {
	process.env.RYU_PI_SUBAGENT = priorSubagent;
}

function monitor(
	params,
	onUpdate = () => undefined,
	signal = new AbortController().signal
) {
	const tool = registeredTools.get("monitor");
	if (!tool) {
		throw new Error("monitor tool did not register");
	}
	return tool.execute("test-monitor", params, signal, onUpdate, {
		cwd: process.cwd(),
	});
}

test("runs a local command, streams output, and ends on the matching line", async () => {
	const updates = [];
	const result = await monitor(
		{
			command:
				"printf 'booting\\nERROR: test failed\\n'; sleep 2; printf 'late output\\n'",
			until: "ERROR",
			timeout_ms: 5000,
			description: "local regression fixture",
		},
		(update) => updates.push(update.content.map(({ text }) => text).join("\n"))
	);
	const finalText = result.content.map(({ text }) => text).join("\n");
	assert.equal(result.details.source_type, "command");
	assert.equal(
		result.details.stop_reason,
		"matched",
		JSON.stringify(result.details)
	);
	assert.equal(result.details.matched_line, "ERROR: test failed");
	assert.match(finalText, /booting/);
	assert.match(finalText, /ERROR: test failed/);
	const tail = finalText.split("--- tail").at(-1) ?? "";
	assert.doesNotMatch(tail, /late output/);
	assert.match(updates.join("\n"), /ERROR: test failed/);
});

test("an already-canceled call performs no command effect and releases its slot for exact retry", async () => {
	const directory = mkdtempSync(join(tmpdir(), "ryu-monitor-abort-"));
	const marker = join(directory, "must-not-exist");
	const controller = new AbortController();
	controller.abort();
	try {
		await assert.rejects(
			monitor(
				{ command: `printf executed > ${JSON.stringify(marker)}` },
				undefined,
				controller.signal
			),
			/Monitor was aborted/
		);
		assert.equal(existsSync(marker), false, "canceled command must not start");

		const retry = await monitor({ command: "printf 'retry ok\\n'" });
		assert.equal(retry.details.reason, "exited");
		assert.match(retry.content.map(({ text }) => text).join("\n"), /retry ok/);
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});

test("rejects ambiguous and link-local WebSocket sources before connecting", async () => {
	const opened = [];
	class NeverConnectWebSocket {
		onclose = null;
		onerror = null;
		onmessage = null;
		onopen = null;
		constructor(url) {
			opened.push(url);
		}
		close() {
			this.onclose?.({ code: 1000, reason: "closed" });
		}
	}
	Object.defineProperty(globalThis, "WebSocket", {
		configurable: true,
		value: NeverConnectWebSocket,
	});

	await assert.rejects(
		monitor({ command: "printf ok", ws: { url: "ws://127.0.0.1/feed" } }),
		/pass exactly one source/
	);
	await assert.rejects(
		monitor({ ws: { url: "ws://169.254.169.254/latest/meta-data" } }),
		/link-local \/ cloud-metadata address/
	);
	await assert.rejects(
		monitor({ ws: { url: "https://example.test/feed" } }),
		/ws:\/\/ or wss:\/\//
	);
	assert.deepEqual(opened, []);
});

test("a WebSocket watch streams messages and session shutdown settles it", async () => {
	const sockets = [];
	class FixtureWebSocket {
		onclose = null;
		onerror = null;
		onmessage = null;
		onopen = null;
		constructor(url) {
			this.url = url;
			sockets.push(this);
		}
		close(code = 1000, reason = "closed") {
			this.onclose?.({ code, reason });
		}
	}
	Object.defineProperty(globalThis, "WebSocket", {
		configurable: true,
		value: FixtureWebSocket,
	});

	const updates = [];
	const first = monitor(
		{ ws: { url: "ws://127.0.0.1/first" }, timeout_ms: 5000 },
		(update) => updates.push(update.content.map(({ text }) => text).join("\n"))
	);
	const second = monitor({
		ws: { url: "ws://127.0.0.1/second" },
		timeout_ms: 5000,
	});
	const overLimit = await monitor({ ws: { url: "ws://127.0.0.1/third" } });
	assert.deepEqual(
		sockets.map(({ url }) => url),
		["ws://127.0.0.1/first", "ws://127.0.0.1/second"]
	);
	assert.equal(overLimit.details.reason, "at-cap");
	sockets[0]?.onmessage?.({ data: "build complete" });
	await Promise.resolve();

	const shutdown = eventHandlers.get("session_shutdown");
	assert.equal(isNativeFunction(shutdown), true);
	await shutdown();
	const [firstResult, secondResult] = await Promise.all([first, second]);
	assert.equal(firstResult.details.reason, "teardown");
	assert.equal(firstResult.details.stop_reason, "teardown");
	assert.equal(secondResult.details.stop_reason, "teardown");
	assert.match(
		firstResult.content.map(({ text }) => text).join("\n"),
		/build complete/
	);
	assert.match(updates.join("\n"), /build complete/);
});

after(async () => {
	await eventHandlers.get("session_shutdown")?.();
});
