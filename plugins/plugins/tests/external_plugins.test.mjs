import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isNativeText } from "../../tools/dist/native-primitive-observation.mjs";
import { runOnce } from "../../tools/toolsmith/harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const EXTERNAL_ROOT = join(REPO_ROOT, "plugins-store/external_plugins");

function loadExternalPackage(packageName) {
	const directory = join(EXTERNAL_ROOT, packageName);
	return {
		manifest: JSON.parse(
			readFileSync(join(directory, "manifest.json"), "utf8")
		),
		plugin: JSON.parse(readFileSync(join(directory, "plugin.json"), "utf8")),
		mcpConfig: JSON.parse(readFileSync(join(directory, "mcp.json"), "utf8")),
	};
}

async function runCloudflareAdapter(verb, testCase) {
	const packageRoot = join(EXTERNAL_ROOT, "cloudflare-browser-run");
	const manifest = loadExternalPackage("cloudflare-browser-run").manifest;
	const binding = manifest.provides
		.flatMap((provided) => Object.entries(provided.tools ?? {}))
		.find(([toolId]) => toolId === verb)?.[1];
	if (!binding) {
		throw new Error(`missing Cloudflare adapter binding for ${verb}`);
	}
	return runOnce({
		kind: "adapter",
		code: readFileSync(join(packageRoot, binding.adapter.code_file), "utf8"),
		adapterTools: binding.adapter.tools ?? [],
		testCase,
	});
}

const PACKAGES = ["cloudflare-browser-run", "composio-connect", "kernel"];

test("external package cards and Ryu extension descriptors keep one stable identity", () => {
	for (const packageName of PACKAGES) {
		const { manifest, plugin } = loadExternalPackage(packageName);
		assert.equal(
			manifest.external,
			true,
			`${packageName} remains an external provider`
		);
		assert.equal(
			plugin.version,
			manifest.version,
			`${packageName} version matches`
		);
		const ryuExtension = plugin.extensions?.["com.ryuhq.ryu"];
		assert.ok(
			ryuExtension,
			`${packageName} exposes its Ryu extension descriptor`
		);
		assert.equal(ryuExtension.id, manifest.id);
		assert.equal(ryuExtension.displayName, manifest.name);
	}
});

test("external MCP mirrors match manifest endpoints and require hosted OAuth", () => {
	for (const packageName of PACKAGES) {
		const { manifest, mcpConfig } = loadExternalPackage(packageName);
		const servers = manifest.mcp_servers ?? {};
		assert.deepEqual(
			Object.keys(mcpConfig.mcpServers ?? {}).sort(),
			Object.keys(servers).sort(),
			`${packageName} mcp.json server keys match`
		);
		for (const [serverName, server] of Object.entries(servers)) {
			const mirror = mcpConfig.mcpServers[serverName];
			assert.equal(mirror.url, server.url);
			assert.equal(mirror.type, server.type);
			assert.deepEqual(server.auth, { type: "oauth" });
			assert.equal(mirror.headers, undefined);
			assert.equal(server.headers, undefined);
		}
		assert.doesNotMatch(
			JSON.stringify(mcpConfig),
			/api[_-]?key|access[_-]?token/i
		);
	}
});

test("Cloudflare Browser Run exposes only the declared URL-scoped browser verbs", () => {
	const { manifest } = loadExternalPackage("cloudflare-browser-run");
	assert.deepEqual(manifest.permission_grants, [
		"mcp:server",
		"identity.read",
		"tool:execute",
	]);
	assert.equal(manifest.provides.length, 1);
	const capability = manifest.provides[0];
	assert.equal(capability.capability, "browser.control");
	assert.equal(capability.selectable, true);
	assert.equal(capability.target, "remote-desktop");
	assert.deepEqual(Object.keys(capability.tools).sort(), [
		"browser.navigate",
		"browser.screenshot",
		"browser.snapshot",
	]);
	assert.equal(
		capability.tools["browser.navigate"].tool,
		"cloudflare.get_url_snapshot"
	);
	assert.equal(
		capability.tools["browser.snapshot"].tool,
		"cloudflare.get_url_snapshot"
	);
	assert.equal(
		capability.tools["browser.screenshot"].tool,
		"cloudflare.get_url_screenshot"
	);
});

test("Composio Connect keeps its OAuth namespace and hosted-account boundary", () => {
	const { manifest } = loadExternalPackage("composio-connect");
	assert.deepEqual(manifest.permission_grants, ["mcp:server", "identity.read"]);
	assert.deepEqual(Object.keys(manifest.mcp_servers), ["composio_connect"]);
	const server = manifest.mcp_servers.composio_connect;
	assert.equal(server.enabled, true);
	assert.equal(server.url, "https://connect.composio.dev/mcp");
	assert.deepEqual(server.auth, { type: "oauth" });
	assert.equal(server.command, undefined);
	assert.equal(server.headers, undefined);
	assert.equal(Object.hasOwn(manifest.mcp_servers, "composio"), false);
	assert.doesNotMatch(
		JSON.stringify(manifest),
		/COMPOSIO_API_KEY|Bearer\s+[A-Za-z0-9_-]+/
	);
});

const URL = "https://example.test/route?q=local";
const ADAPTER_CASES = [
	[
		"browser.navigate",
		{ url: `  ${URL}  ` },
		{ structuredContent: { content: "local page snapshot" } },
	],
	[
		"browser.snapshot",
		{ tab_id: `  ${URL}  ` },
		{ structuredContent: { content: "local page snapshot" } },
	],
	[
		"browser.screenshot",
		{ tab_id: `  ${URL}  ` },
		{
			content: [
				{ type: "image", data: "fixture-image", mimeType: "image/png" },
			],
		},
	],
];

for (const [verb, input, providerResult] of ADAPTER_CASES) {
	test(`${verb} sends one trimmed URL request and returns the documented result`, async () => {
		const outcome = await runCloudflareAdapter(verb, {
			input,
			provider: { call: [providerResult] },
		});
		assert.deepEqual(outcome.calls, [{ path: "callTool", args: { url: URL } }]);
		assert.equal(outcome.value.url, URL);
		assert.equal(outcome.value.tab_id, URL);
		if (verb === "browser.screenshot") {
			assert.deepEqual(outcome.value.image, {
				data: "fixture-image",
				mimeType: "image/png",
			});
		} else {
			assert.equal(outcome.value.content, "local page snapshot");
		}
	});

	test(
		verb +
			" rejects missing input before provider effects and preserves provider errors",
		async () => {
			const missing = await runCloudflareAdapter(verb, { input: {} });
			assert.equal(isNativeText(missing.value.error), true);
			assert.deepEqual(missing.calls, []);

			const providerError = {
				isError: true,
				content: [{ type: "text", text: "fixture provider unavailable" }],
			};
			const failed = await runCloudflareAdapter(verb, {
				input,
				provider: { call: [providerError] },
			});
			assert.deepEqual(failed.value, { raw: providerError });
			assert.deepEqual(failed.calls, [
				{ path: "callTool", args: { url: URL } },
			]);
		}
	);
}
