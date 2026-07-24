#!/usr/bin/env node
// =============================================================================
// Sample Widget — a minimal, dependency-free stdio MCP server (TEMPLATE)
// =============================================================================
//
// This is HALF of a Ryu widget plugin. The other half is `plugin.json` (the
// consent/promotion gate) + `sample.html` (the widget UI). See README.md.
//
// What Core needs from this server, and where each piece is implemented below:
//
//   1. `initialize`      — the MCP handshake.                         (handleRequest)
//   2. `tools/list`      — advertise the render tool, and CRUCIALLY carry
//                          `_meta["openai/outputTemplate"]` = the widget uri.
//                          That flat `_meta` key is what BINDS the tool to a
//                          widget (Core reads it via WidgetBinding::from_meta).  (TOOLS)
//   3. `tools/call`      — run the tool; return `structuredContent`, which
//                          becomes `window.openai.toolOutput` in the widget.    (callTool)
//   4. `resources/list`  — advertise `ui://widget/sample.html`.                 (RESOURCES)
//   5. `resources/read`  — return the HTML with mime `text/html+skybridge`.
//                          Core fetches this, caches it per-server, and ships it
//                          INLINE into the sandboxed iframe (srcdoc). The widget
//                          never fetches anything itself.                        (readResource)
//
// TRANSPORT: newline-delimited JSON-RPC 2.0 over stdin/stdout — ONE compact JSON
// object per line, `\n`-terminated. Core's client (apps/core/src/sidecar/mcp/
// client.rs) reads line-by-line, so we must never emit a bare newline mid-frame
// (JSON.stringify guarantees that). Anything we print to stderr is captured as
// server logs and does NOT corrupt the protocol — use stderr for debugging.
//
// Zero dependencies: only Node built-ins (node:fs, node:readline). This keeps the
// satellite buildable from its own tree with nothing to install.
// =============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

// The widget slug (the `<slug>` in `ui://widget/<slug>.html`). Keep this in sync
// with the `uri` in plugin.json's contributes.widgets and with sample.html.
const WIDGET_URI = "ui://widget/sample.html";
const WIDGET_MIME = "text/html+skybridge"; // the skybridge dialect Core expects.

// Load the widget HTML ONCE, relative to this script (not the process cwd, which
// Core controls). It must be ONE self-contained document: inline <style> + inline
// <script type="module">, no external <script src> / CDN / fetch — the host CSP
// pins connect-src 'none' and refuses any non-nonced script, so a remote-asset
// widget fails closed.
const HERE = dirname(fileURLToPath(import.meta.url));
const WIDGET_HTML = readFileSync(join(HERE, "sample.html"), "utf8");

// ── Tool + resource catalogs ────────────────────────────────────────────────

// The single render tool. Its NAME is "render"; joined with the mcp_servers key
// ("sample_widget") Core forms the runtime tool_id "sample_widget__render", which
// is exactly what plugin.json's contributes.widgets[].tool_id must equal.
const TOOLS = [
	{
		name: "render",
		description:
			"Render the Sample Widget: returns a greeting + a starting counter, shown inline in chat.",
		inputSchema: {
			type: "object",
			properties: {
				name: {
					type: "string",
					description: "Who to greet. Defaults to \"world\".",
				},
			},
			additionalProperties: false,
		},
		// THE BINDING. These flat top-level `_meta` keys are read by Core's
		// WidgetBinding::from_meta. `openai/*` works verbatim (Apps-SDK parity);
		// `ryu/*` are the primary aliases if you prefer to be explicit.
		_meta: {
			// REQUIRED — points at the resource this server serves below. This is
			// what makes `render` a *widget* tool. Must match plugin.json's uri.
			"openai/outputTemplate": WIDGET_URI,
			// Lets the mounted widget call THIS server's widget-accessible tools back
			// over the MessagePort (see sample.html's "refresh from server" button).
			// tool:call / ui:send_message grants are auto-derived from this flag at
			// emit time — you do NOT list them in permission_grants. Set false (or
			// omit) if your widget only reads toolOutput + uses setWidgetState.
			"openai/widgetAccessible": true,
			// Optional status labels shown while the tool runs.
			"openai/toolInvocation": {
				invoking: "Rendering sample widget…",
				invoked: "Sample widget ready",
			},
		},
	},
];

const RESOURCES = [
	{
		uri: WIDGET_URI,
		name: "Sample Widget UI",
		description: "Self-contained skybridge HTML for the Sample Widget.",
		mimeType: WIDGET_MIME,
	},
];

// ── JSON-RPC method handlers ────────────────────────────────────────────────

// tools/call — the render tool. The KEY output is `structuredContent`: Core maps
// it to `window.openai.toolOutput`, which the widget reads at module top level.
// (`content` is the plain-text fallback shown when the widget can't render, e.g.
// the experimental runtime flag is off.) Return isError:false — an error result
// emits NO widget.
function callTool(params) {
	const toolName = params?.name;
	if (toolName !== "render") {
		throw new Error(`unknown tool: ${toolName}`);
	}
	const who = (params?.arguments?.name ?? "world").toString().slice(0, 64);
	const structuredContent = {
		greeting: `Hello, ${who}!`,
		// A server-side starting value the widget shows and can grow locally via
		// setWidgetState, or re-fetch by calling this tool again (widgetAccessible).
		counter: 0,
		renderedAt: new Date().toISOString(),
	};
	return {
		// Plain-text fallback (shown if the widget itself doesn't render).
		content: [{ type: "text", text: `${structuredContent.greeting} (open the widget to interact)` }],
		// The widget's data channel → window.openai.toolOutput.
		structuredContent,
	};
}

// resources/read — hand back the widget HTML with the skybridge mime. Core takes
// the first content entry that has `text` and caches it per-server.
function readResource(params) {
	const uri = params?.uri;
	if (uri !== WIDGET_URI) {
		throw new Error(`unknown resource: ${uri}`);
	}
	return {
		contents: [{ uri: WIDGET_URI, mimeType: WIDGET_MIME, text: WIDGET_HTML }],
	};
}

// Dispatch a single JSON-RPC request → its `result` (or throw for an error). We
// implement exactly the five methods Core calls; unknown methods return a proper
// JSON-RPC "method not found" so a stricter client degrades cleanly.
function handleRequest(method, params) {
	switch (method) {
		case "initialize":
			return {
				// Echo the protocol version the client offered when present.
				protocolVersion: params?.protocolVersion ?? "2025-06-18",
				capabilities: { tools: {}, resources: {} },
				serverInfo: { name: "sample-widget", version: "1.0.0" },
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
			// Sentinel the writer turns into a JSON-RPC error object.
			return { __methodNotFound: true };
	}
}

// ── stdio loop ──────────────────────────────────────────────────────────────

function send(obj) {
	process.stdout.write(`${JSON.stringify(obj)}\n`);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
	const trimmed = line.trim();
	if (trimmed === "") {
		return;
	}
	let msg;
	try {
		msg = JSON.parse(trimmed);
	} catch {
		return; // ignore anything that isn't a JSON frame.
	}
	// Notifications (e.g. notifications/initialized) have no `id` and expect no
	// reply — just acknowledge by doing nothing.
	if (msg.id === undefined || msg.id === null) {
		return;
	}
	try {
		const result = handleRequest(msg.method, msg.params);
		if (result && result.__methodNotFound) {
			send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
			return;
		}
		send({ jsonrpc: "2.0", id: msg.id, result });
	} catch (err) {
		send({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: String(err?.message ?? err) } });
	}
});
