#!/usr/bin/env node
// =============================================================================
// Pomodoro Timer — a dependency-free stdio MCP server
// =============================================================================
//
// One half of the Pomodoro widget plugin. `manifest.json` holds the consent gate
// (`contributes.widgets` + `widget:render`) and `pomodoro.html` is the timer UI.
//
//   initialize      — MCP handshake.
//   tools/list      — the `start` tool, bound to the widget through the flat
//                     `_meta["openai/outputTemplate"]` key.
//   tools/call      — validates the session settings and returns them as
//                     `structuredContent` (→ `window.ryu.toolOutput`).
//   resources/list  — advertises `ui://widget/pomodoro.html`.
//   resources/read  — returns the HTML with mime `text/html+skybridge`.
//
// The server holds no timer state. The countdown runs in the widget, which
// persists its own progress with `setWidgetState`, so nothing here depends on
// wall-clock time and every call is deterministic for its arguments.
//
// TRANSPORT: newline-delimited JSON-RPC 2.0 over stdin/stdout, one compact JSON
// object per line. Diagnostics belong on stderr only.
// =============================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const WIDGET_URI = "ui://widget/pomodoro.html";
const WIDGET_MIME = "text/html+skybridge";
const SERVER_VERSION = "0.1.0";

// Read relative to this file, not the cwd Core spawns us in.
const HERE = dirname(fileURLToPath(import.meta.url));
const WIDGET_HTML = readFileSync(join(HERE, "pomodoro.html"), "utf8");

const MAX_TASK_LENGTH = 120;

/** Integer settings: argument name → bounds and the classic Pomodoro default. */
const DURATION_FIELDS = [
	{ key: "focus_minutes", min: 1, max: 180, fallback: 25 },
	{ key: "short_break_minutes", min: 1, max: 60, fallback: 5 },
	{ key: "long_break_minutes", min: 1, max: 120, fallback: 15 },
	{ key: "rounds_before_long_break", min: 1, max: 12, fallback: 4 },
];

const START_INPUT_SCHEMA = {
	type: "object",
	properties: {
		task: {
			type: "string",
			description: `Optional label for what the user is focusing on (at most ${MAX_TASK_LENGTH} characters).`,
		},
		focus_minutes: {
			type: "integer",
			minimum: 1,
			maximum: 180,
			description: "Length of each focus round in minutes. Defaults to 25.",
		},
		short_break_minutes: {
			type: "integer",
			minimum: 1,
			maximum: 60,
			description: "Length of a short break in minutes. Defaults to 5.",
		},
		long_break_minutes: {
			type: "integer",
			minimum: 1,
			maximum: 120,
			description: "Length of a long break in minutes. Defaults to 15.",
		},
		rounds_before_long_break: {
			type: "integer",
			minimum: 1,
			maximum: 12,
			description:
				"Focus rounds completed before a long break replaces the short one. Defaults to 4.",
		},
		auto_start: {
			type: "boolean",
			description:
				"Start the next phase automatically when one ends. Defaults to false, so the user starts each phase.",
		},
	},
	additionalProperties: false,
};

const TOOLS = [
	{
		name: "start",
		description:
			"Show a Pomodoro focus timer inline in chat. Use when the user wants to focus, work in timed intervals, or take structured breaks. The user starts, pauses, skips and resets phases in the widget.",
		inputSchema: START_INPUT_SCHEMA,
		_meta: {
			"openai/outputTemplate": WIDGET_URI,
			// The widget never calls back into this server, so it does not ask
			// for the derived tool-call or follow-up-message capabilities.
			"openai/widgetAccessible": false,
			"openai/toolInvocation": {
				invoking: "Setting up your Pomodoro timer…",
				invoked: "Pomodoro timer ready",
			},
		},
	},
];

const RESOURCES = [
	{
		uri: WIDGET_URI,
		name: "Pomodoro Timer UI",
		description: "Self-contained skybridge HTML for the Pomodoro timer.",
		mimeType: WIDGET_MIME,
	},
];

const KNOWN_ARGUMENTS = new Set([
	"task",
	"auto_start",
	...DURATION_FIELDS.map((field) => field.key),
]);

/**
 * Validate `start` arguments into the widget's settings. Returns either
 * `{ settings }` or `{ problems }`; a bad value is reported, never clamped into
 * a session the user did not ask for.
 */
function parseStartArguments(raw) {
	const args = raw ?? {};
	const problems = [];
	if (typeof args !== "object" || Array.isArray(args)) {
		return { problems: ["arguments must be an object"] };
	}
	for (const key of Object.keys(args)) {
		if (!KNOWN_ARGUMENTS.has(key)) {
			problems.push(`unknown argument '${key}'`);
		}
	}

	const durations = {};
	for (const { key, min, max, fallback } of DURATION_FIELDS) {
		const value = args[key];
		if (value === undefined || value === null) {
			durations[key] = fallback;
			continue;
		}
		if (!Number.isInteger(value) || value < min || value > max) {
			problems.push(`'${key}' must be an integer from ${min} to ${max}`);
			continue;
		}
		durations[key] = value;
	}

	let task = "";
	if (args.task !== undefined && args.task !== null) {
		if (typeof args.task === "string") {
			task = args.task.trim();
			if (task.length > MAX_TASK_LENGTH) {
				problems.push(`'task' must be at most ${MAX_TASK_LENGTH} characters`);
			}
		} else {
			problems.push("'task' must be a string");
		}
	}

	let autoStart = false;
	if (args.auto_start !== undefined && args.auto_start !== null) {
		if (typeof args.auto_start === "boolean") {
			autoStart = args.auto_start;
		} else {
			problems.push("'auto_start' must be a boolean");
		}
	}

	if (problems.length > 0) {
		return { problems };
	}
	return {
		settings: {
			task,
			focusMinutes: durations.focus_minutes,
			shortBreakMinutes: durations.short_break_minutes,
			longBreakMinutes: durations.long_break_minutes,
			roundsBeforeLongBreak: durations.rounds_before_long_break,
			autoStart,
		},
	};
}

function describe(settings) {
	const subject = settings.task ? ` for "${settings.task}"` : "";
	return (
		`Pomodoro timer ready${subject}: ${settings.focusMinutes}-minute focus rounds, ` +
		`${settings.shortBreakMinutes}-minute short breaks, and a ` +
		`${settings.longBreakMinutes}-minute long break every ` +
		`${settings.roundsBeforeLongBreak} rounds. Start it from the widget.`
	);
}

function callTool(params) {
	const toolName = params?.name;
	if (toolName !== "start") {
		throw new Error(`unknown tool: ${toolName}`);
	}
	const parsed = parseStartArguments(params?.arguments);
	if (parsed.problems) {
		// An error result renders no widget, which is the intent: the model sees
		// what to fix instead of the user seeing a timer with silently changed values.
		return {
			isError: true,
			content: [
				{
					type: "text",
					text: `Cannot start the Pomodoro timer: ${parsed.problems.join("; ")}.`,
				},
			],
		};
	}
	return {
		content: [{ type: "text", text: describe(parsed.settings) }],
		structuredContent: parsed.settings,
	};
}

function readResource(params) {
	const uri = params?.uri;
	if (uri !== WIDGET_URI) {
		throw new Error(`unknown resource: ${uri}`);
	}
	return {
		contents: [{ uri: WIDGET_URI, mimeType: WIDGET_MIME, text: WIDGET_HTML }],
	};
}

const METHOD_NOT_FOUND = Symbol("method-not-found");

function handleRequest(method, params) {
	switch (method) {
		case "initialize":
			return {
				protocolVersion: params?.protocolVersion ?? "2025-06-18",
				capabilities: { tools: {}, resources: {} },
				serverInfo: { name: "pomodoro", version: SERVER_VERSION },
			};
		case "tools/list":
			return { tools: TOOLS };
		case "tools/call":
			return callTool(params);
		case "resources/list":
			return { resources: RESOURCES };
		case "resources/read":
			return readResource(params);
		default:
			return METHOD_NOT_FOUND;
	}
}

function send(frame) {
	process.stdout.write(`${JSON.stringify(frame)}\n`);
}

function handleLine(line) {
	const trimmed = line.trim();
	if (trimmed === "") {
		return;
	}
	let message;
	try {
		message = JSON.parse(trimmed);
	} catch {
		return;
	}
	// Notifications carry no id and expect no reply.
	if (message?.id === undefined || message.id === null) {
		return;
	}
	try {
		const result = handleRequest(message.method, message.params);
		if (result === METHOD_NOT_FOUND) {
			send({
				jsonrpc: "2.0",
				id: message.id,
				error: {
					code: -32_601,
					message: `method not found: ${message.method}`,
				},
			});
			return;
		}
		send({ jsonrpc: "2.0", id: message.id, result });
	} catch (error) {
		send({
			jsonrpc: "2.0",
			id: message.id,
			error: { code: -32_000, message: String(error?.message ?? error) },
		});
	}
}

createInterface({ input: process.stdin }).on("line", handleLine);
