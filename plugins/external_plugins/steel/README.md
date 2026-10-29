# Steel
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="steel" width="96" />
  </picture>
</p>

Steel is a preview provider for Ryu's swappable `browser.control` layer. It runs
Steel's official MCP server (pinned to the v2.0.1 commit and launched with `npx` from
GitHub, because Steel does not publish it to npm) against Steel Cloud browsers.

**Not usable as the Browser layer yet.** Ryu starts a fresh Steel server process for
every tool call, and the session handle that `steel_session_create` mints exists only
inside the process that created it. Even the `steel_navigate` call that
`browser.navigate` makes right after creating the session runs in a new process that
cannot resolve that handle, so no verb gets a usable tab id. The manifest ships `hidden: true` so the Store does not offer
Steel while that is the case; do not select it in the Browser provider picker.
Steel's stateless tools that take a URL directly, such as `steel_scrape`, finish within
one call and are not affected.

The declared mapping treats a Steel session as the canonical `tab_id`. Every
`browser.navigate` starts a new Steel session (the canonical navigate schema has no
`tab_id`, so nothing is reused), with no cookies or sign-in state shared with earlier
sessions; Steel bills each session until it is released or reaches its inactivity
timeout. `browser.snapshot`, `browser.click`, `browser.type`, `browser.hover`,
`browser.scroll`, and `browser.screenshot` act on that session by Steel's `@eN`
element references.

Two canonical behaviors are refused rather than approximated: Steel's `type` always
replaces the field, so `browser.type` requires `replace: true`; and Steel scrolls
vertically only, so `left`/`right` are rejected. `browser.tabs` is not bound because
Steel sessions are not tabs in one browser.

Requirements: Node on PATH, a Steel API key in the Secret Vault as `STEEL_API_KEY`, and
an operator-approved reserved `mcp:server` grant for this plugin in the Gateway grant
policy. The generated Agent Plugin `mcp.json` omits `STEEL_API_KEY`, because only Ryu
can resolve a vault reference; another MCP host must supply that variable itself.

References:

- [Steel MCP server](https://github.com/steel-dev/steel-mcp-server)
- [steel-browser](https://github.com/steel-dev/steel-browser)
