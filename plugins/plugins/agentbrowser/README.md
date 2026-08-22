# Agent Browser
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="agentbrowser" width="96" />
  </picture>
</p>

Browser automation via the `agent-browser` CLI's MCP server (https://agent-browser.dev). Provides the swappable `browser.control` layer, recording tools, and the documented localhost live stream. Launched via `npx agent-browser mcp --tools all`; needs Node on PATH.

The desktop shell reads `agent-browser stream status --json` and follows the returned
WebSocket frames in the shared live-media PiP/lightbox surface. Recording is exposed
through the MCP `record start`, `record stop`, and `record restart` tools; streaming
is enabled per session with `agent-browser stream enable`.

Definition lives in `manifest.json`, its sandboxed adapter bodies in
`adapters/browser.screenshot.js`, `adapters/browser.snapshot.js`, and
`adapters/browser.type.js`; Core compiles them all in from this package directory.
Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
