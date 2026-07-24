# Sample Widget — reference third-party MCP widget plugin

A minimal, **self-contained** widget plugin you can copy as the starting point for
your own. It shows the smallest thing that works end-to-end:

- a tiny local **MCP server** (`server.mjs`, Node, zero dependencies) that
  - exposes one **render tool** returning structured data, and
  - serves the widget HTML as an **MCP resource**;
- a **manifest** (`manifest.json`) that binds the tool to the widget and holds the
  `widget:render` consent grant;
- a **self-contained skybridge widget** (`sample.html`) that reads the tool output
  and renders a greeting + an interactive counter.

## The two halves that must agree

A Ryu widget is authorized by **two independent halves**. Both must line up or the
widget silently falls back to plain text.

**A) The tool-definition `_meta` (the _binding_).** In the server's `tools/list`
response, the `render` tool carries a flat `_meta`:

```json
"_meta": {
  "openai/outputTemplate": "ui://widget/sample.html",
  "openai/widgetAccessible": true
}
```

`openai/outputTemplate` is what makes the tool a *widget* tool. `openai/*` works
verbatim (ChatGPT Apps-SDK parity); `ryu/*` keys are the primary aliases.

**B) The manifest `contributes.widgets` (the _consent gate_).** The `_meta` alone
does **not** authorize promotion. The plugin must be installed + enabled, hold the
`widget:render` grant, and declare the tool in `contributes.widgets`:

```json
"contributes": {
  "widgets": [
    { "tool_id": "sample_widget__render", "uri": "ui://widget/sample.html",
      "mime": "text/html+skybridge", "default_display_mode": "inline" }
  ]
}
```

### The tool_id join (easy to get wrong)

`contributes.widgets[].tool_id` is the **runtime** id, formed as
`<mcp_servers-key>__<toolName>`:

```
mcp_servers key   "sample_widget"
tool name         "render"           (from tools/list)
                  ───────────────
tool_id           "sample_widget__render"
```

The manifest `uri` and the `_meta` `outputTemplate` must be the **same** string,
and the server must serve that uri via `resources/list` + `resources/read`.

## Data flow at runtime

1. The model calls `sample_widget__render`.
2. The server returns `{ structuredContent: {...} }`. Core maps
   `structuredContent` → `window.openai.toolOutput`.
3. Core reads the widget HTML from the server's `resources/read` (cached
   per-server) and ships it **inline** into a null-origin
   `sandbox="allow-scripts"` iframe (srcdoc). The widget never fetches anything.
4. `sample.html` reads `window.ryu.toolOutput` (alias `window.openai`) at module
   top level and renders. All privileged calls go over a MessagePort, never the
   network.

## Widget capabilities used here

| What | API | Needs |
| --- | --- | --- |
| Read tool result | `window.ryu.toolOutput` | nothing (always present) |
| Persist UI state | `setWidgetState({...})` | nothing — always works |
| Size the iframe | `notifyIntrinsicHeight(px)` | nothing |
| Round-trip to server | `callTool("render", args)` | `openai/widgetAccessible: true` **and** a widget-accessible tool on the **same** server |

`tool:call` / `ui:send_message` grants are **auto-derived** from
`widgetAccessible` at emit time — you do **not** list them in `permission_grants`.
`widget:render` is the only grant you declare.

## The host CSP (why this must be one file)

The host pins a strict CSP that is never widened:

- `default-src 'none'`, `connect-src 'none'` → **no** fetch / XHR / WebSocket.
- `script-src 'nonce-…'` → any non-nonced or CDN `<script>` is refused.
- `style-src 'unsafe-inline'`; `img`/`font`/`media` allow `data:`.

So ship **one self-contained HTML document** (inline `<style>` + inline
`<script type="module">`). Remote passive assets (images/fonts) only load if the
resource's own `_meta` declares `resource_domains`; there is no other egress.

## Try it locally

The widget renderer is **experimental and opt-in**, behind two gates:

1. **Client flag** — the `AppWidget` renderer is behind the plugin-runtime
   experimental flag. Off → the widget shows an inert placeholder and the host
   context is withheld. Turn it on to see the sample render.
2. **Core consent** — this plugin ships as a built-in fixture but is **opt-in**
   (not in `CORE_DEFAULT_ON`). Install/enable it so it holds `widget:render` and
   its `contributes.widgets` entry is live.

Sanity-check the server by hand (newline-delimited JSON-RPC on stdin):

```bash
cd plugins-store/sample-widget
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"ui://widget/sample.html"}}' \
  | node server.mjs
```

You should see the tool (with its `_meta.outputTemplate`) and the HTML come back.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | Manifest: mcp_servers + contributes.widgets + `widget:render`. |
| `server.mjs` | Zero-dep stdio MCP server: render tool + widget resource. |
| `sample.html` | Self-contained skybridge widget UI. |

## Gotchas when you fork this

- **Change the `id`.** This template's manifest is also compiled into Core as a
  built-in fixture (`apps/core/src/plugin_manifest/fixtures/sample-widget.manifest.json`).
  If you drop a copy into `~/.ryu/plugins/` **keeping `id: "sample-widget"`**, the
  loader treats it as a **duplicate id** and skips your copy. Pick your own id
  (reverse-domain-ish is conventional, e.g. `com.acme.checklist`).
- **Spawn cwd / the `node server.mjs` path.** `args: ["server.mjs"]` is relative;
  Core spawns the server from the installed plugin directory, so `server.mjs`
  resolves next to `manifest.json`. `server.mjs` reads `sample.html` relative to
  itself (via `import.meta.url`), not the cwd, so it is robust regardless.
- **`isError` results emit no widget.** Return `isError: false` (the default) with
  `structuredContent`; an error result is delivered as text only.
- **Bind from the tool _definition_, not the result.** The binding is the flat
  `_meta.outputTemplate` on the `tools/list` entry. (A `_meta["ryu/widget"]` key
  you may see in a tool *result* is a Core-internal field, not the binding.)
