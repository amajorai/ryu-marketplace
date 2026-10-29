# Kernel
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="kernel" width="96" />
  </picture>
</p>

Kernel is an external provider for Ryu's swappable `browser.control` layer. It
connects to Kernel's hosted MCP server (`https://mcp.onkernel.com/mcp`) with
Core-managed OAuth and drives Kernel cloud browsers.

A Kernel browser session is the canonical `tab_id`. Every `browser.navigate` creates a
new Kernel browser on the URL (the canonical navigate schema has no `tab_id`, so
nothing is reused), with no cookies or sign-in state shared with earlier sessions.
`browser.tabs` lists live sessions, and `browser.screenshot`, `browser.click_at`,
`browser.key`, `browser.scroll`, and `browser.drag` control a session by viewport
coordinates.

Kernel controls browsers by pixels, so the element-reference verbs
(`browser.snapshot`, `browser.click`, `browser.type`) are intentionally unbound.
`browser.key` maps canonical key tokens to one X11 chord, with `cmd` becoming `Ctrl`
because Kernel browsers run on Linux. `browser.scroll` converts pixels to xdotool
wheel units at about 100 px per unit and reports the units it sent. `browser.tabs`
reports each session's start URL, since Kernel does not report the current page.

The complete Kernel tool set stays available under `kernel.*`, including
`execute_playwright_code`, `browser_repl`, profiles, proxies, replays, and browser
files.

Setup: Kernel requests the reserved `mcp:server` grant, so an operator must allow
`mcp:server` for `@ryu/kernel` in the Gateway grant policy before the plugin can be
enabled. Then install from Marketplace, complete the Kernel OAuth connection, and
select **Kernel** in the Browser provider picker. Kernel bills each browser until it
is deleted or times out, so delete sessions you no longer need with
`kernel.manage_browsers` (`action: "delete"`).

References:

- [Kernel](https://www.kernel.sh)
- [Kernel MCP server](https://github.com/kernel/kernel-mcp-server)
