# Browser Use

Browser Use is a preview provider for Ryu's swappable `browser.control` layer. It runs
the open-source [browser-use](https://github.com/browser-use/browser-use) MCP server
(`browser-use --mcp`) from the pinned `browser-use@0.13.11` package with `uvx`, with
anonymous telemetry and cloud sync turned off. browser-use launches and drives a
Chromium on this machine.

**Not usable as the Browser layer yet.** Ryu starts a fresh browser-use process for
every tool call, and browser-use keeps its browser session inside that process, so a
tab opened by one call is gone by the next. `browser.navigate` therefore cannot hand a
usable tab id to the next verb, and calling the `browseruse.browser_*` tools directly
has the same limit. The manifest ships `hidden: true` so the Store does not offer
Browser Use while that is the case; do not select it in the Browser provider picker.
A task that finishes within one call, such as `retry_with_browser_use_agent` (which
needs an LLM key configured for browser-use), is not affected.

The declared mapping re-points `browser.navigate`, `browser.tabs`, `browser.snapshot`,
`browser.click`, `browser.type`, `browser.scroll`, and `browser.screenshot` at that
browser. Tab ids are browser-use's own 4-character ids; snapshot element references
are its integer indices written as `@e<index>`, which click and type parse back.
`browser.navigate` opens a new tab and identifies it by diffing the tab list.

Behaviors the MCP server cannot provide are refused rather than approximated:
`browser_type` always clears the field, so `browser.type` requires `replace: true`
and cannot `submit`; `browser_scroll` moves a fixed 500 px vertically, so `left`,
`right`, and other distances are rejected.

Requirements: [uv](https://docs.astral.sh/uv/) on PATH and an operator-approved
reserved `mcp:server` grant for this plugin in the Gateway grant policy.
