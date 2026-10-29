// Generate (and seal) the Ego Browser manifest from tools/ego-browser.js.
//
//   node plugins-store/plugins/ego-browser/build.mjs          # write manifest.json
//   node plugins-store/plugins/ego-browser/build.mjs --check  # verify, non-zero on drift

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
	version: "0.1.15",
	stability: "experimental",
	description:
		"Ego lite (https://github.com/citrolabs/ego-lite) as an optional provider for Ryu's swappable browser.control layer. Immutable operation tools launch the installed ego-browser CLI in a conversation-scoped Ego Space while small adapters preserve the stable browser.* verbs. Tabs, snapshot and screenshot carry read-only effect metadata; navigation, click, type, scroll and the legacy mixed dispatcher are conservatively mutating. Caller input cannot change an operation tool into another action. Requires the Ego lite macOS app and ego-browser on PATH; Ryu does not install Ego lite or copy browser login state.",
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
				backend: "inline_js",
				annotations: { readOnlyHint: false, destructiveHint: true },
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
						tool: `ego_browser.${operation}`,
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

// Each canonical operation has an immutable native body and its own reviewed
// effect. The legacy mixed dispatcher stays conservatively mutating.
const legacy = manifest.runnables[0].config;
const operationFields = {
	tabs: [],
	navigate: ["url"],
	snapshot: ["tab_id"],
	click: ["tab_id", "ref"],
	type: ["tab_id", "ref", "text", "replace", "submit"],
	scroll: ["tab_id", "direction", "amount"],
	screenshot: ["tab_id"],
};
const requiredFields = {
	navigate: ["url"],
	click: ["ref"],
	type: ["ref", "text"],
	scroll: ["direction"],
};
for (const operation of operations) {
	const readOnly = ["tabs", "snapshot", "screenshot"].includes(operation);
	const inputSchema = {
		type: "object",
		properties: Object.fromEntries([
			["operation", { type: "string", const: operation }],
			...operationFields[operation].map((field) => [
				field,
				structuredClone(legacy.input_schema.properties[field]),
			]),
		]),
		required: requiredFields[operation] ?? [],
		additionalProperties: false,
	};
	manifest.runnables.push({
		id: `tool-ego-browser-${operation}`,
		name: `Ego Browser ${operation}`,
		kind: "tool",
		config: {
			...legacy,
			slug: `ego_browser.${operation}`,
			description: `Run the immutable ${operation} operation in the conversation-scoped Ego Space.`,
			annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly },
			input_schema: inputSchema,
			code: `input.operation = ${JSON.stringify(operation)};\n${dispatcher}`,
		},
	});
}

const manifestPath = join(here, "manifest.json");
if (process.argv.includes("--check")) {
	// Compare the PARSED manifest, not bytes: the repo formatter may reflow the
	// JSON, and the property worth pinning is that it carries exactly this build.
	const current = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (JSON.stringify(current) !== JSON.stringify(manifest)) {
		process.stderr.write(
			"manifest.json is out of date with tools/ego-browser.js — run: node plugins-store/plugins/ego-browser/build.mjs\n"
		);
		process.exit(1);
	}
	process.stdout.write("manifest.json matches tools/ego-browser.js\n");
} else {
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	process.stdout.write(
		"sealed Ego Browser manifest from tools/ego-browser.js\n"
	);
}
