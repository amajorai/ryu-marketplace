// Drives the production TokenEconomizer Pi extension against a fake dispatcher.
// Run with:  node --test plugins-store/plugins/tokeneconomizer/runtime.behavior.test.mjs
//
// The fake `te-hook` is a real executable the extension spawns exactly as it
// would spawn TokenEconomizer's launcher: JSON on stdin, JSON on stdout. It logs
// each call (payload and the TE_* environment) so the tests assert what the
// dispatcher actually received, and answers the way TokenEconomizer does.

import assert from "node:assert/strict";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";

const extensionModule = await import("./pi-extensions/ryu-tokeneconomizer.ts");
const {
	carriedSection,
	default: ryuTokenEconomizer,
	hookEnv,
	launch,
	parseAnswer,
	POINTER_FILE,
	resolveConfig,
	SECTION,
} = extensionModule;

const root = mkdtempSync(join(tmpdir(), "ryu-tokeneconomizer-test-"));
after(() => rmSync(root, { force: true, recursive: true }));

const pluginDir = join(root, "TokenEconomizer", "plugin");
const agentDir = join(root, "pi-agent");
const callLog = join(root, "calls.jsonl");
mkdirSync(join(pluginDir, "scripts"), { recursive: true });
mkdirSync(agentDir, { recursive: true });

const FAKE_HOOK = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
	const payload = JSON.parse(input);
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([key]) =>
			key.startsWith("TE_") || key === "PYTHONUTF8" || key === "PI_CODING_AGENT_DIR"
		)
	);
	appendFileSync(${JSON.stringify(callLog)}, JSON.stringify({ argv: process.argv.slice(2), payload, env }) + "\\n");
	const context = (text) => ({ hookSpecificOutput: { additionalContext: text } });
	let answer = {};
	if (payload.hook_event_name === "SessionStart") {
		answer = { ...context("Run tests with python -m pytest."), systemMessage: "tokeneconomizer: 1 fact" };
	} else if (payload.hook_event_name === "UserPromptSubmit") {
		answer = context("Generated files live in dist/.");
	} else if (payload.hook_event_name === "PostToolUse" && payload.tool_response.isError) {
		answer = context("Same failure three times: try another approach.");
	}
	process.stdout.write("noise before the answer\\n" + JSON.stringify(answer) + "\\n");
});
`;
writeFileSync(join(pluginDir, "scripts", "te-hook"), FAKE_HOOK);
chmodSync(join(pluginDir, "scripts", "te-hook"), 0o755);

const ENV_KEYS = [
	"PI_CODING_AGENT_DIR",
	"RYU_TOKENECONOMIZER_PLUGIN_DIR",
	"RYU_PI_SUBAGENT",
	"TE_DISABLE",
	"TE_SIDECALL",
];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
after(() => {
	for (const [key, value] of Object.entries(savedEnv)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
});

function writePointer(pointer) {
	writeFileSync(join(agentDir, POINTER_FILE), JSON.stringify(pointer));
}

beforeEach(() => {
	for (const key of ENV_KEYS) {
		delete process.env[key];
	}
	process.env.PI_CODING_AGENT_DIR = agentDir;
	rmSync(join(agentDir, POINTER_FILE), { force: true });
	rmSync(callLog, { force: true });
});

function readCalls() {
	try {
		return readFileSync(callLog, "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
	} catch {
		return [];
	}
}

/** Load the extension against a fake Pi and return its handlers. */
function loadExtension() {
	const handlers = new Map();
	const sent = [];
	ryuTokenEconomizer({
		on(event, handler) {
			handlers.set(event, handler);
		},
		sendMessage(message, options) {
			sent.push({ message, options });
		},
	});
	const ctx = {
		mode: "rpc",
		hasUI: false,
		cwd: root,
		sessionManager: {
			getSessionId: () => "session-1",
			getSessionFile: () => join(root, "session-1.jsonl"),
			getBranch: () => [],
		},
	};
	return { ctx, handlers, sent };
}

test("stays inert with no pointer file and spawns nothing", async () => {
	assert.equal(resolveConfig(), null);
	const { handlers } = loadExtension();
	assert.equal(handlers.size, 0);
	assert.deepEqual(readCalls(), []);
});

test("refuses a relative folder, a folder without the dispatcher, sub-agents, and side calls", () => {
	writePointer({ pluginDir: "TokenEconomizer/plugin" });
	assert.equal(resolveConfig(), null);
	writePointer({ pluginDir: join(root, "missing") });
	assert.equal(resolveConfig(), null);
	writePointer({ pluginDir });
	assert.equal(resolveConfig()?.pluginDir, pluginDir);
	process.env.RYU_PI_SUBAGENT = "1";
	assert.equal(resolveConfig(), null);
	delete process.env.RYU_PI_SUBAGENT;
	process.env.TE_SIDECALL = "1";
	assert.equal(resolveConfig(), null);
	delete process.env.TE_SIDECALL;
	process.env.TE_DISABLE = "true";
	assert.equal(resolveConfig(), null);
});

test("keeps only known mechanism modes and absolute CLI paths", () => {
	writePointer({
		pluginDir,
		piCli: "pi",
		microskills: "turbo",
		loopguard: "off",
	});
	assert.deepEqual(resolveConfig(), { pluginDir, loopguard: "off" });
	process.env.RYU_TOKENECONOMIZER_PLUGIN_DIR = pluginDir;
	rmSync(join(agentDir, POINTER_FILE));
	assert.deepEqual(resolveConfig(), { pluginDir });
});

test("passes the managed Pi CLI and mechanism modes to the dispatcher", () => {
	assert.deepEqual(
		hookEnv(
			{
				pluginDir,
				piCli: "/opt/ryu/pi",
				microskills: "envfacts",
				loopguard: "on",
			},
			"rpc"
		),
		{
			PYTHONUTF8: "1",
			TE_PI_MODE: "rpc",
			TE_PI_CLI: "/opt/ryu/pi",
			TE_MICROSKILLS: "envfacts",
			TE_LOOPGUARD: "on",
		}
	);
	assert.deepEqual(launch(pluginDir, "linux"), [
		join(pluginDir, "scripts", "te-hook"),
		["--host", "pi"],
	]);
	assert.deepEqual(launch(pluginDir, "win32", { TE_PYTHON: "py" }), [
		"py",
		[join(pluginDir, "scripts", "te_bootstrap.py"), "hook", "--host", "pi"],
	]);
});

test("adds learned facts to the system prompt and redirects a failing turn", {
	skip:
		process.platform === "win32" && "the fake dispatcher is a POSIX executable",
}, async () => {
	writePointer({ pluginDir, piCli: "/opt/ryu/pi", loopguard: "on" });
	const { ctx, handlers, sent } = loadExtension();
	assert.deepEqual([...handlers.keys()].sort(), [
		"agent_end",
		"before_agent_start",
		"session_shutdown",
		"session_start",
		"tool_result",
	]);

	await handlers.get("session_start")({ reason: "startup" }, ctx);
	const promptEvent = {
		prompt: "fix the failing test",
		systemPromptOptions: { sections: { existing: "kept" } },
	};
	await handlers.get("before_agent_start")(promptEvent, ctx);
	assert.deepEqual(promptEvent.systemPromptOptions.sections, {
		existing: "kept",
		[SECTION]:
			"Run tests with python -m pytest.\n\nGenerated files live in dist/.",
	});

	await handlers.get("tool_result")(
		{
			toolName: "bash",
			toolCallId: "call-1",
			input: { command: "pytest" },
			content: [{ type: "text", text: "pytest: not found" }],
			isError: true,
			structuredContent: { exit_code: 127 },
		},
		ctx
	);
	assert.deepEqual(sent, [
		{
			message: {
				customType: SECTION,
				content: "Same failure three times: try another approach.",
				display: true,
			},
			options: { deliverAs: "steer" },
		},
	]);

	await handlers.get("agent_end")({}, ctx);
	await handlers.get("session_shutdown")({ reason: "quit" }, ctx);

	const calls = readCalls();
	assert.deepEqual(
		calls.map((call) => call.payload.hook_event_name),
		["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"]
	);
	for (const call of calls) {
		assert.deepEqual(call.argv, ["--host", "pi"]);
		assert.equal(call.payload.session_id, "session-1");
		assert.equal(call.env.TE_PI_CLI, "/opt/ryu/pi");
		assert.equal(call.env.TE_LOOPGUARD, "on");
		assert.equal(call.env.TE_PI_MODE, "rpc");
		assert.equal(call.env.PI_CODING_AGENT_DIR, agentDir);
	}
	assert.equal(calls[1].payload.prompt_id, "session-1:1");
	assert.deepEqual(calls[2].payload.tool_response, {
		content: "pytest: not found",
		isError: true,
		exit_code: 127,
	});
	assert.equal(calls[4].payload.reason, "quit");
});

test("a resumed conversation keeps the section it already carries", () => {
	const entries = [
		{ type: "message", message: { role: "user" } },
		{
			type: "message",
			message: {
				role: "system",
				sections: { [SECTION]: `<${SECTION}>\nold fact\n</${SECTION}>` },
			},
		},
	];
	assert.equal(carriedSection(entries), "old fact");
	assert.equal(
		carriedSection([
			...entries,
			{ type: "compaction", systemMessage: { sections: { [SECTION]: "" } } },
		]),
		""
	);
});

test("an unparseable answer is no change", () => {
	assert.deepEqual(parseAnswer(""), {});
	assert.deepEqual(parseAnswer("Traceback (most recent call last):"), {});
	assert.deepEqual(parseAnswer("[1,2]"), {});
	assert.deepEqual(parseAnswer('log\n{"systemMessage":"hi"}\n'), {
		systemMessage: "hi",
	});
});
