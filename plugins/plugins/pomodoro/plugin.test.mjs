import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

async function exchange(frames, preamble = []) {
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
	for (const line of preamble) {
		child.stdin.write(`${line}\n`);
	}
	for (const frame of frames) {
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...frame })}\n`);
	}
	child.stdin.end();
	await once(child, "exit");
	if (child.exitCode !== 0 || stderr !== "") {
		throw new Error(`server exited ${child.exitCode} with stderr: ${stderr}`);
	}
	const responses = stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
	return new Map(responses.map((response) => [response.id, response]));
}

function startCall(id, args) {
	return {
		id,
		method: "tools/call",
		params: { name: "start", arguments: args },
	};
}

test("manifest binds the start tool to the widget it is granted to render", () => {
	assert.equal(manifest.id, "@ryu/pomodoro");
	assert.deepEqual(manifest.permission_grants, ["mcp:server", "widget:render"]);
	assert.deepEqual(Object.keys(manifest.mcp_servers), ["pomodoro"]);
	assert.deepEqual(manifest.mcp_servers.pomodoro.args, ["server.mjs"]);
	assert.deepEqual(manifest.contributes.widgets, [
		{
			tool_id: "pomodoro.start",
			uri: "ui://widget/pomodoro.html",
			mime: "text/html+skybridge",
			default_display_mode: "inline",
		},
	]);
});

test("stdio server implements the widget MCP contract", async () => {
	const byId = await exchange(
		[
			{
				id: 1,
				method: "initialize",
				params: { protocolVersion: "2025-06-18" },
			},
			{ id: 2, method: "tools/list", params: {} },
			{ id: 3, method: "resources/list", params: {} },
			{
				id: 4,
				method: "resources/read",
				params: { uri: "ui://widget/pomodoro.html" },
			},
			{
				id: 5,
				method: "resources/read",
				params: { uri: "ui://widget/other.html" },
			},
			{ id: 6, method: "tools/call", params: { name: "stop", arguments: {} } },
			{ id: 7, method: "unknown/method", params: {} },
		],
		[
			"not-json",
			JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
		]
	);
	assert.equal(
		byId.size,
		7,
		"malformed frames and notifications must be silent"
	);

	assert.equal(byId.get(1).result.serverInfo.name, "pomodoro");
	assert.equal(byId.get(1).result.protocolVersion, "2025-06-18");

	const [tool] = byId.get(2).result.tools;
	assert.equal(tool.name, "start");
	const [server] = Object.keys(manifest.mcp_servers);
	assert.equal(
		`${server}.${tool.name}`,
		manifest.contributes.widgets[0].tool_id
	);
	assert.equal(
		tool._meta["openai/outputTemplate"],
		manifest.contributes.widgets[0].uri
	);
	assert.equal(
		tool._meta["openai/widgetAccessible"],
		false,
		"the widget never calls back, so it must not derive tool-call grants"
	);
	assert.equal(tool.inputSchema.additionalProperties, false);

	assert.equal(byId.get(3).result.resources[0].mimeType, "text/html+skybridge");
	const [resource] = byId.get(4).result.contents;
	assert.equal(resource.uri, "ui://widget/pomodoro.html");
	assert.equal(resource.mimeType, "text/html+skybridge");
	assert.equal(
		resource.text,
		readFileSync(join(here, "pomodoro.html"), "utf8")
	);
	assert.doesNotMatch(resource.text, /<script[^>]+src=/i);
	assert.doesNotMatch(resource.text, /<link[^>]+stylesheet/i);
	assert.doesNotMatch(resource.text, /\bfetch\(|XMLHttpRequest|WebSocket/);

	assert.match(byId.get(5).error.message, /unknown resource/);
	assert.match(byId.get(6).error.message, /unknown tool: stop/);
	assert.equal(byId.get(7).error.code, -32_601);
});

test("start returns classic defaults, honors explicit settings, and trims the task", async () => {
	const byId = await exchange([
		startCall(1, {}),
		startCall(2, {
			task: "  Write the release notes  ",
			focus_minutes: 50,
			short_break_minutes: 10,
			long_break_minutes: 30,
			rounds_before_long_break: 2,
			auto_start: true,
		}),
		startCall(3, { focus_minutes: 180, short_break_minutes: 1 }),
	]);

	assert.equal(byId.get(1).result.isError, undefined);
	assert.deepEqual(byId.get(1).result.structuredContent, {
		task: "",
		focusMinutes: 25,
		shortBreakMinutes: 5,
		longBreakMinutes: 15,
		roundsBeforeLongBreak: 4,
		autoStart: false,
	});
	assert.equal(
		byId.get(1).result.content[0].text,
		"Pomodoro timer ready: 25-minute focus rounds, 5-minute short breaks, and a 15-minute long break every 4 rounds. Start it from the widget."
	);

	assert.deepEqual(byId.get(2).result.structuredContent, {
		task: "Write the release notes",
		focusMinutes: 50,
		shortBreakMinutes: 10,
		longBreakMinutes: 30,
		roundsBeforeLongBreak: 2,
		autoStart: true,
	});
	assert.match(
		byId.get(2).result.content[0].text,
		/for "Write the release notes"/
	);

	assert.equal(byId.get(3).result.structuredContent.focusMinutes, 180);
	assert.equal(byId.get(3).result.structuredContent.shortBreakMinutes, 1);
});

test("start rejects invalid settings instead of silently changing them", async () => {
	const byId = await exchange([
		startCall(1, { focus_minutes: 0 }),
		startCall(2, { focus_minutes: 181, long_break_minutes: 2.5 }),
		startCall(3, { focus_minutes: "25" }),
		startCall(4, { task: 42, auto_start: "yes" }),
		startCall(5, { task: "x".repeat(121) }),
		startCall(6, { minutes: 25 }),
		startCall(7, [25]),
	]);

	for (const id of [1, 2, 3, 4, 5, 6, 7]) {
		const { result } = byId.get(id);
		assert.equal(result.isError, true, `call ${id} must be an error result`);
		assert.equal(
			result.structuredContent,
			undefined,
			`call ${id} must not render a widget`
		);
	}
	const text = (id) => byId.get(id).result.content[0].text;
	assert.match(text(1), /'focus_minutes' must be an integer from 1 to 180/);
	assert.match(text(2), /'focus_minutes' must be an integer from 1 to 180/);
	assert.match(
		text(2),
		/'long_break_minutes' must be an integer from 1 to 120/
	);
	assert.match(text(3), /'focus_minutes' must be an integer/);
	assert.match(text(4), /'task' must be a string/);
	assert.match(text(4), /'auto_start' must be a boolean/);
	assert.match(text(5), /'task' must be at most 120 characters/);
	assert.match(text(6), /unknown argument 'minutes'/);
	assert.match(text(7), /arguments must be an object/);
});
