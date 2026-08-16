# Agent Browser
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="agentbrowser" width="96" />
  </picture>
</p>

Browser automation via the `agent-browser` CLI's MCP server (https://agent-browser.dev). Provides the swappable `browser.control` layer, so selecting it re-points the stable `browser__*` tools at agent-browser without changing what agents call. Launched via `npx agent-browser mcp`; needs Node on PATH.

Definition lives in `manifest.json`, its sandboxed adapter bodies in `adapters/browser.screenshot.js`, `adapters/browser.snapshot.js` and `adapters/browser.type.js`; Core compiles them all in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
