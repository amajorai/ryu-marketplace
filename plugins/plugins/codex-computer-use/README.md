# Codex Computer Use

An optional provider for Ryu's swappable `computer.control` layer. It drives the
signed Codex Computer Use engine that the ChatGPT macOS app installs. It talks to
that engine through the pinned, unofficial
[`codex-computer-use-mcp@0.5.2`](https://github.com/tmustier/codex-computer-use-mcp)
stdio bridge.

## Read this before you select it

- **Unofficial.** It relies on an experimental ChatGPT app-server API and the
  Computer Use components ChatGPT installs. A ChatGPT update can break it, and
  OpenAI does not support this use.
- **macOS only.** Codex Computer Use on macOS only exists inside the ChatGPT app.
- **One app at a time, in the background.** The engine acts on a named app
  through its accessibility tree and window screenshots. It does not move your
  cursor or bring the app to the front. It cannot hover. It cannot drive
  terminals, ChatGPT itself, or system security prompts.
- **Only signed binaries.** The bridge refuses to run anything not signed by
  OpenAI (Team ID `2DC432GLL2`), and it runs no model of its own.

## Setup

1. Install the ChatGPT macOS app and turn on Computer Use there, so that
   `~/.codex/computer-use/Codex Computer Use.app` exists. Grant it Screen
   Recording and Accessibility.
2. Install Node.js 22 or newer.
3. Enable this plugin, then set **Settings → Codex Computer Use → Target app**,
   for example `Calculator` or `com.apple.TextEdit`.
4. Select **Codex Computer Use** for the Computer layer.

The bridge keeps its state in `~/.direct-computer-use`. If ChatGPT is installed
somewhere unusual, put `codexPath` or `computerUseAppPath` in that directory's
`config.json`. The `codex_cu.computer_use_status` tool reports what it found.

## Swappable-layer verbs

| Verb | Codex method | Notes |
| --- | --- | --- |
| `computer.capture` | `get_app_state` | Screenshot plus accessibility tree of the target app's key window. Call it each turn before acting. |
| `computer.click` | `click` | `button` becomes `mouse_button` and `count` becomes `click_count`. Coordinates are in the screenshot's pixel space. |
| `computer.type` | `type_text` | Literal text. |
| `computer.key` | `press_key` | Tokens are joined into an xdotool chord. `cmd`, `option`, `enter` and `esc` become `super`, `alt`, `Return` and `Escape`. |
| `computer.scroll` | — | Not bound: Codex scrolls an accessibility element by index, not a screen point. |
| `computer.focus_app` | — | Not bound: the canonical verbs carry no app, so focusing one could not retarget later calls. |

Every bound verb acts on the **Target app** preference, and refuses to run with a
clear message while it is unset. For work across several apps, or to use
element indexes, `set_value`, `select_text`, `drag` or `scroll`, call the
`codex_cu.*` tools directly. Each one takes its own `app`.

## Tests

`plugin.test.mjs` checks the manifest, the projections, the grants and the
bindings, and runs every adapter against a mocked `callTool`. The bridge's tool
names and argument schemas were read from the published 0.5.2 package.
