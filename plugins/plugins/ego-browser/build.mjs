import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dispatcher = readFileSync(
	join(here, "tools/ego-browser.js"),
	"utf8"
).replace(/\r\n?/g, "\n");
const operations = [
	"tabs",
	"navigate",
	"snapshot",
	"click",
	"type",
	"scroll",
	"screenshot",
];

const manifest = {
	tags: ["browser", "automation", "ego-lite", "chromium"],
	author: { name: "Ryu", url: "https://ryuhq.com" },
	repository:
		"https://github.com/amajorai/ryu-marketplace/tree/main/plugins/plugins/ego-browser",
	homepage:
		"https://github.com/amajorai/ryu-marketplace/tree/main/plugins/plugins/ego-browser",
	privacyPolicyUrl: "https://ryuhq.com/privacy",
	termsOfServiceUrl: "https://ryuhq.com/terms",
	id: "@ryu/ego-browser",
	name: "Ego Browser",
	version: "0.1.14",
	stability: "experimental",
	description:
		"Ego lite (https://github.com/citrolabs/ego-lite) as an optional provider for Ryu's swappable browser.control layer. One sealed dispatcher launches the installed ego-browser CLI in a conversation-scoped Ego Space, while small adapters keep agents on the stable browser.navigate, browser.tabs, browser.snapshot, browser.click, browser.type, browser.scroll, and browser.screenshot verbs. Requires the Ego lite macOS app and ego-browser on PATH; Ryu does not install Ego lite or copy browser login state.",
	icon: "ai-browser",
	iconDither: { from: 3, to: "transparent", direction: "down" },
	tagline: "Swap browser control onto Ego lite Spaces",
	keywords: ["browser", "automation", "ego-lite", "chromium"],
	category: "Browsers",
	surfaces: {
		gateway: { support: "none" },
		core: { support: "full" },
		desktop: { support: "full" },
		island: { support: "limited" },
		mobile: { support: "none" },
		extension: { support: "none" },
		web: { support: "none" },
		cli: { support: "full" },
	},
	engines: { ryu: ">=0.1.0" },
	permissions: { child_process: true, run: ["ego-browser"] },
	runnables: [
		{
			id: "tool-ego-browser-dispatch",
			name: "Ego Browser Dispatch",
			kind: "tool",
			config: {
				slug: "ego_browser.dispatch",
				backend: "inline_deno",
				timeout_secs: 60,
				description:
					"Dispatch one validated browser operation to the conversation-scoped Ego lite Space.",
				input_schema: {
					type: "object",
					properties: {
						operation: { type: "string", enum: operations },
						url: { type: "string" },
						tab_id: { type: "string" },
						ref: { type: "string" },
						text: { type: "string" },
						replace: { type: "boolean" },
						submit: { type: "boolean" },
						direction: {
							type: "string",
							enum: ["up", "down", "left", "right"],
						},
						amount: { type: "integer", minimum: 1 },
					},
					required: ["operation"],
					additionalProperties: false,
				},
				code: dispatcher,
			},
		},
	],
	provides: [
		{
			capability: "browser.control",
			version: "1.0.0",
			title: "Browser",
			grant: "browser:control",
			selectable: true,
			target: "local-machine",
			tools: Object.fromEntries(
				operations.map((operation) => [
					`browser.${operation}`,
					{
						tool: "ego_browser.dispatch",
						adapter: {
							code_file: `adapters/browser.${operation}.js`,
						},
					},
				])
			),
		},
	],
	permission_grants: ["browser:control", "tool:execute"],
};

writeFileSync(
	join(here, "manifest.json"),
	`${JSON.stringify(manifest, null, 2)}\n`
);
process.stdout.write("sealed Ego Browser manifest from tools/ego-browser.js\n");
