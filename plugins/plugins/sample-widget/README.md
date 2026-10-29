# Sample Widget — reference third-party MCP widget plugin
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="sample-widget" width="96" />
  </picture>
</p>

A minimal, **self-contained** widget plugin you can copy as the starting point for
your own. It shows the smallest thing that works end-to-end:

- a tiny local **MCP server** (`server.mjs`, Node, zero dependencies) that
  - exposes one **render tool** returning structured data, and
  - serves the widget HTML as an **MCP resource**;
- a **manifest** (`manifest.json`) that binds the tool to the widget, requests the
  reserved `mcp:server` registration grant, and holds the `widget:render` consent
  grant;
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
    { "tool_id": "sample_widget.render", "uri": "ui://widget/sample.html",
      "mime": "text/html+skybridge", "default_display_mode": "inline" }
  ]
}
```

### The tool_id join (easy to get wrong)

`contributes.widgets[].tool_id` is the **runtime** id, formed as
`<mcp_servers-key>.<toolName>`:

```
mcp_servers key   "sample_widget"
tool name         "render"           (from tools/list)
                  ───────────────
tool_id           "sample_widget.render"
```

The manifest `uri` and the `_meta` `outputTemplate` must be the **same** string,
and the server must serve that uri via `resources/list` + `resources/read`.

## Data flow at runtime

1. The model calls `sample_widget.render`.
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
`mcp:server` lets this Community plugin register its stdio server after operator
approval; `widget:render` authorizes inline promotion. Both are declared.

## The host CSP (why this must be one file)

The host pins a strict CSP that is never widened:

- `default-src 'none'`, `connect-src 'none'` → **no** fetch / XHR / WebSocket.
- `script-src 'nonce-…'` → any non-nonced or CDN `<script>` is refused.
- `style-src 'unsafe-inline'`; `img`/`font`/`media` allow `data:`.

So ship **one self-contained HTML document** (inline `<style>` + inline
`<script type="module">`). Remote passive assets (images/fonts) only load if the
resource's own `_meta` declares `resource_domains`; there is no other egress.

## Try it locally

The widget is opt-in. Install the Community plugin, approve its reserved
`mcp:server` grant through the Gateway's Marketplace grant policy, then enable it.
The live record must hold both `mcp:server` and `widget:render`: the first registers
the tool server and the second allows the declared widget to render.

Sanity-check the server by hand (newline-delimited JSON-RPC on stdin):

```bash
cd plugins-store/plugins/sample-widget
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
| `manifest.json` | Manifest: mcp_servers + contributes.widgets + `mcp:server` and `widget:render`. |
| `server.mjs` | Zero-dep stdio MCP server: render tool + widget resource. |
| `sample.html` | Self-contained skybridge widget UI. |

## Gotchas when you fork this

- **Change the `id`.** This template is `@ryu/sample-widget`; a fork keeping that id
  collides with any installed copy of the reference. Pick your own id
  (reverse-domain-ish is conventional, e.g. `com.acme.checklist`).
- **Spawn cwd / the `node server.mjs` path.** `args: ["server.mjs"]` is relative;
  Core spawns the server from the installed plugin directory, so `server.mjs`
  resolves next to `manifest.json`. `server.mjs` reads `sample.html` relative to
  itself (via `import.meta.url`), not the cwd, so it resolves either way.
- **`isError` results emit no widget.** Return `isError: false` (the default) with
  `structuredContent`; an error result is delivered as text only.
- **Bind from the tool _definition_, not the result.** The binding is the flat
  `_meta.outputTemplate` on the `tools/list` entry. (A `_meta["ryu/widget"]` key
  you may see in a tool *result* is a Core-internal field, not the binding.)
