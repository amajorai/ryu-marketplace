# Agent Browser

Browser automation via the `agent-browser` CLI's MCP server (https://agent-browser.dev). Provides the swappable `browser.control` layer, so selecting it re-points the stable `browser__*` tools at agent-browser without changing what agents call. Launched via `npx agent-browser mcp`; needs Node on PATH.

Definition lives in `manifest.json`, its sandboxed adapter bodies in `adapters/browser__screenshot.js`, `adapters/browser__snapshot.js` and `adapters/browser__type.js`; Core compiles them all in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
