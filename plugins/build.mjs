// Build the installable ChatGPT Web plugin bundle.
//
// Core writes `backend_code` to the managed Node sidecar entry at spawn and
// refuses to run it when `backend_sha256` does not match. Keep the source body in
// backend.js and regenerate the manifest whenever it changes.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginId = "@ryu/chatgpt-web";
const entry = "./backend.js";
const port = 8301;

const code = await readFile(join(here, "backend.js"), "utf8");
const backendSha256 = createHash("sha256").update(code, "utf8").digest("hex");

const manifest = {
	id: pluginId,
	name: "ChatGPT Web",
	version: "0.1.0",
	stability: "experimental",
	description:
		"Use a ChatGPT Web subscription through Ryu's signed-in Browser app as an OpenAI-compatible model provider.",
	tagline: "ChatGPT Web, routed through Ryu",
	keywords: ["chatgpt", "browser", "model", "temporary-chat", "subscription"],
	category: "Models",
	icon: "ai-chat",
	surfaces: {
		gateway: { support: "none" },
		core: { support: "full" },
		desktop: { support: "full" },
		island: { support: "full" },
		mobile: { support: "limited" },
		extension: { support: "limited" },
		web: { support: "full" },
		cli: { support: "full" },
	},
	engines: { ryu: ">=0.1.0" },
	runnables: [],
	requires: {
		capabilities: [{ capability: "browser.control", min_version: "1.0.0" }],
		grants: ["browser:control"],
	},
	permission_grants: ["sidecar:process", "browser:control", "preferences:read"],
	contributes: {
		settings_tabs: [
			{
				id: "chatgpt-web.settings",
				title: "ChatGPT Web",
				scope: "node",
				fields: [
					{
						type: "text",
						pref_key: "chatgpt-web.models",
						label: "Enabled profiles",
						description:
							"Comma-separated profile ids. Defaults to instant, medium, high, extra-high, and pro.",
						default:
							"chatgpt-web/instant,chatgpt-web/medium,chatgpt-web/high,chatgpt-web/extra-high,chatgpt-web/pro",
					},
				],
			},
		],
	},
	backend_code: code,
	backend_sha256: backendSha256,
	sidecars: [
		{
			name: "bridge",
			process: { kind: "node", entry },
			port,
			health_path: "/health",
			http: {
				routes: [
					{ path: "/v1/models" },
					{ path: "/v1/chat/completions" },
					{ path: "/status" },
				],
			},
			host_api: { grants: ["browser:control", "preferences:read"] },
			provides_provider: {
				id: "chatgpt-web",
				label: "ChatGPT Web",
				api: "openai-completions",
				base_path: "/v1",
				models: [
					"chatgpt-web/instant",
					"chatgpt-web/medium",
					"chatgpt-web/high",
					"chatgpt-web/extra-high",
					"chatgpt-web/pro",
				],
			},
		},
	],
};

const output = join(here, "manifest.json");
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(
	`wrote ${output}\n  id     ${pluginId}\n  port   ${port}\n  sha256 ${backendSha256}\n`
);
