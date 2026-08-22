// Black-box test for the real backend + Ryu's managed Node bootstrap.
// The Core and Browser hops are faked at their HTTP boundaries so this stays
// deterministic and does not require a ChatGPT login.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backend = join(here, "backend.js");
const bootstrap = join(
	here,
	"../../apps/core/src/sidecar/assets/plugin_host_bootstrap.mjs"
);

async function readBody(request) {
	const chunks = [];
	for await (const chunk of request) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, status, payload) {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(payload));
}

async function waitForHealthy(port) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/health`, {
				headers: { authorization: "Bearer test-token" },
			});
			if (response.ok) {
				return;
			}
		} catch {
			// The bootstrap is still binding or activating.
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error("ChatGPT Web extension host did not become healthy");
}

test("serves an OpenAI completion through the managed browser capability hop", async () => {
	let submittedPrompt = "";
	const browserCalls = [];
	const core = createServer(async (request, response) => {
		const body = await readBody(request);
		if (request.url === "/api/host/rpc") {
			sendJson(response, 200, { result: null });
			return;
		}
		if (request.url !== "/api/host/capability/browser.control") {
			sendJson(response, 404, { error: "not found" });
			return;
		}
		const envelope = JSON.parse(body);
		browserCalls.push(envelope.tool);
		if (envelope.tool === "browser.tabs") {
			sendJson(response, 200, {
				tabs: [
					{
						id: "user-tab",
						title: "ChatGPT",
						url: "https://chatgpt.com/c/user-owned",
					},
				],
			});
			return;
		}
		if (envelope.tool === "browser.navigate") {
			sendJson(response, 201, {
				tab: { id: "tab-1", title: "ChatGPT", url: envelope.args.url },
			});
			return;
		}
		if (envelope.tool === "browser.type") {
			submittedPrompt = envelope.args.text;
			sendJson(response, 200, { ok: true });
			return;
		}
		if (envelope.tool === "browser.snapshot") {
			const elements = [
				{ name: "Instant", ref: "@model", role: "button" },
				{ name: "Message", ref: "@composer", role: "textbox" },
			];
			if (submittedPrompt !== "") {
				elements.push(
					{ name: submittedPrompt, ref: "@user", role: "StaticText" },
					{
						name: "Hello from fake ChatGPT",
						ref: "@answer",
						role: "StaticText",
					},
					{ name: "Regenerate", ref: "@regenerate", role: "button" }
				);
			}
			sendJson(response, 200, {
				elements,
				snapshot_id: `snapshot-${browserCalls.length}`,
				tab: { id: "tab-1", title: "ChatGPT", url: "https://chatgpt.com/" },
				truncated: false,
			});
			return;
		}
		sendJson(response, 400, { error: `unexpected tool ${envelope.tool}` });
	});
	core.listen(0, "127.0.0.1");
	await once(core, "listening");
	const corePort = core.address().port;
	const hostPort = 48_000 + Math.floor(Math.random() * 500);
	const child = spawn(process.execPath, [bootstrap], {
		env: {
			RYU_CORE_PORT: String(corePort),
			RYU_EXT_PLUGIN_ID: "@ryu/chatgpt-web",
			RYU_EXT_TOKEN: "test-token",
			RYU_HOST_ENTRY: backend,
			RYU_HOST_HEALTH_PATH: "/health",
			RYU_HOST_PLUGIN_VERSION: "0.1.0",
			RYU_HOST_PORT: String(hostPort),
		},
		stdio: ["ignore", "ignore", "pipe"],
	});
	let stderr = "";
	child.stderr?.on("data", (chunk) => {
		stderr += chunk.toString();
	});

	try {
		try {
			await waitForHealthy(hostPort);
		} catch (error) {
			throw new Error(`${error.message}\n${stderr}`);
		}

		const models = await fetch(`http://127.0.0.1:${hostPort}/v1/models`, {
			headers: { authorization: "Bearer test-token" },
		});
		assert.equal(models.status, 200);
		assert.equal((await models.json()).data.length, 5);

		const completion = await fetch(
			`http://127.0.0.1:${hostPort}/v1/chat/completions`,
			{
				method: "POST",
				headers: {
					authorization: "Bearer test-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					messages: [{ content: "Say hello", role: "user" }],
					model: "chatgpt-web/instant",
				}),
			}
		);
		assert.equal(completion.status, 200);
		const payload = await completion.json();
		assert.equal(payload.choices[0].message.content, "Hello from fake ChatGPT");
		assert.ok(submittedPrompt.includes("RYU_CHATGPT_WEB_"));
		assert.deepEqual(browserCalls.slice(0, 3), [
			"browser.tabs",
			"browser.navigate",
			"browser.snapshot",
		]);
		assert.ok(!browserCalls.includes("browser.navigate_tab"));
		assert.ok(browserCalls.includes("browser.type"));
	} finally {
		child.kill("SIGTERM");
		await Promise.race([
			once(child, "exit"),
			new Promise((resolve) => setTimeout(resolve, 500)),
		]);
		if (child.exitCode === null) {
			child.kill("SIGKILL");
			await once(child, "exit").catch(() => undefined);
		}
		core.close();
		await once(core, "close");
	}
});
