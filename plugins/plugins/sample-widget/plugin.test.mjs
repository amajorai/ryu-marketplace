import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const docs = readFileSync(
	join(
		here,
		"../../../apps/fumadocs/content/docs/extend/develop/extensions/inline-widget.mdx"
	),
	"utf8"
);

test("reference identity and registration grants stay aligned with the guide", () => {
	assert.equal(manifest.id, "@ryu/sample-widget");
	assert.equal(manifest.version, "0.1.14");
	assert.deepEqual(manifest.permission_grants, ["mcp:server", "widget:render"]);
	assert.match(docs, /"id": "@ryu\/sample-widget"/);
	assert.match(docs, /"version": "0\.1\.14"/);
	assert.match(docs, /"permission_grants": \["mcp:server", "widget:render"\]/);
});

test("stdio server implements the complete widget MCP contract", async () => {
	const child = spawn(process.execPath, [join(here, "server.mjs")], {
		cwd: here,
		stdio: ["pipe", "pipe", "pipe"],
	});
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});

	const frames = [
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
		{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
		{
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: { name: "render", arguments: { name: "Ryu" } },
		},
		{ jsonrpc: "2.0", id: 4, method: "resources/list", params: {} },
		{
			jsonrpc: "2.0",
			id: 5,
			method: "resources/read",
			params: { uri: "ui://widget/sample.html" },
		},
		{ jsonrpc: "2.0", id: 6, method: "unknown/method", params: {} },
	];
	child.stdin.write("not-json\n");
	child.stdin.write(
		`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`
	);
	for (const frame of frames) {
		child.stdin.write(`${JSON.stringify(frame)}\n`);
	}
	child.stdin.end();
	await once(child, "exit");

	assert.equal(child.exitCode, 0, stderr);
	assert.equal(stderr, "");
	const responses = stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
	assert.equal(
		responses.length,
		6,
		"malformed frames and notifications must be silent"
	);
	const byId = new Map(responses.map((response) => [response.id, response]));

	assert.equal(byId.get(1).result.serverInfo.name, "sample-widget");
	const tool = byId.get(2).result.tools[0];
	assert.equal(tool.name, "render");
	assert.equal(tool._meta["openai/outputTemplate"], "ui://widget/sample.html");
	assert.equal(tool._meta["openai/widgetAccessible"], true);
	assert.deepEqual(byId.get(3).result.structuredContent, {
		greeting: "Hello, Ryu!",
		counter: 0,
		renderedAt: byId.get(3).result.structuredContent.renderedAt,
	});
	assert.match(byId.get(3).result.content[0].text, /Hello, Ryu!/);
	assert.equal(byId.get(4).result.resources[0].mimeType, "text/html+skybridge");
	const resource = byId.get(5).result.contents[0];
	assert.equal(resource.uri, "ui://widget/sample.html");
	assert.equal(resource.mimeType, "text/html+skybridge");
	assert.match(resource.text, /<style>/i);
	assert.match(resource.text, /<script type="module">/i);
	assert.equal(byId.get(6).error.code, -32_601);
});
