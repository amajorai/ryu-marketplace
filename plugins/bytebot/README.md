# Bytebot Desktop

Computer control for Ryu, backed by [`bytebotd`](https://github.com/bytebot-ai/bytebot)
— the local HTTP daemon inside a Bytebot desktop. Ships as a fully declarative plugin:
six `http` tool-defs in `manifest.json`, no Core Rust.

## Read this before you select it

**bytebotd drives the desktop it runs on, not the machine running Ryu.** In the shipped
Bytebot product that desktop is a container: a Linux XFCE session with Firefox,
Thunderbird, VS Code, 1Password, a terminal and a file manager preinstalled. Selecting
this provider therefore points `computer__*` at *that* screen and away from your own.

That is a deliberate shape, not a defect — it is the same local-vs-remote relationship
`browser.control` already has between the local Chromium sidecar and a hosted browser
(the design doc's D2 table lists `browserbase` / `camofox` alongside the local one). But
it is the single fact that decides whether this provider is the one you want, so the
layer picker's description leads with it too.

## Setup

1. Run a Bytebot desktop. The daemon is the `bytebot-desktop` container; the quickstart
   in the upstream README brings it up with the rest of the stack.
2. Make sure the daemon answers on `127.0.0.1:9990` from the machine running Ryu — the
   upstream `docker-compose` publishes that port, and it is what the manifest addresses.
3. Install and enable this plugin, then pick **Bytebot Desktop** for the `computer.control`
   layer.

There is **no API key and no settings tab**. bytebotd ships with no authentication
whatsoever (no guard on the controller, permissive CORS), which is also why this manifest
only ever addresses it over loopback and declares exactly one egress grant,
`tool:http-egress:127.0.0.1`. Do not expose that port off the host: anything that can
reach it can type on the desktop.

The port is **fixed by choice, not by the grammar**. It is true that a `pref:` token
cannot be written inside a `url` string — but a resolved `arg_defaults` value lands in the
outgoing args map, and that map is exactly what fills `{placeholder}` path segments, which
is how `honcho` pins its workspace and peer ids into a URL in a shipped manifest today. So
`.../{port}/...` plus `"port": "pref:bytebot.port"` is expressible.

It is not done because it would REGRESS the default install: an unresolved `pref:` drops
its argument, a missing path parameter is a hard error, and a settings field's `default` is
UI-only and never seeded into the preferences store. A user who never opens settings would
go from "works on 9990" to "every call fails". Making the port configurable therefore needs
a resolved-default fallback first, not just a placeholder.
9990 is Bytebot's documented default (`app.listen(9990)` in `packages/bytebotd/src/main.ts`).

## Tools

Every action is the same endpoint — `POST http://127.0.0.1:9990/computer-use` with a JSON
body whose `action` field selects the operation. The six tools differ only in that
constant, which each one pins in `body_defaults`.

| Tool id                | `action`      | Required arg   |
| ---------------------- | ------------- | -------------- |
| `bytebot__screenshot`  | `screenshot`  | —              |
| `bytebot__click`       | `click_mouse` | `coordinates`  |
| `bytebot__type_text`   | `type_text`   | `text`         |
| `bytebot__type_keys`   | `type_keys`   | `keys`         |
| `bytebot__scroll`      | `scroll`      | `direction`    |
| `bytebot__application` | `application` | `application`  |

`bytebot__screenshot` is the only one with `unwrap_body`, because its `{image}` base64
payload *is* the result. The five action tools return an **empty body** on success, so
they answer `{status, body}` instead — an unwrapped empty string reaches the caller as
`""`, which reads like a failure. (Nest answers a `@Post()` with **201**, not 200.)

Nothing is `fail_open`. For a tool that moves a pointer, turning an unreachable daemon
into `{available:false}` would report "nothing to see here" in the one situation where the
caller must be told the click did not happen.

## It is a swappable layer provider

| Capability        | Canonical verb        | Forwards to            |
| ----------------- | --------------------- | ---------------------- |
| `computer.control`| `computer__capture`   | `bytebot__screenshot`  |
| `computer.control`| `computer__click`     | `bytebot__click`       |
| `computer.control`| `computer__type`      | `bytebot__type_text`   |
| `computer.control`| `computer__key`       | `bytebot__type_keys`   |
| `computer.control`| `computer__scroll`    | `bytebot__scroll`      |

Agents call the canonical verb, not the provider tool. `ghost` — which drives *this*
machine through the accessibility APIs — stays the declared `default`; this plugin is
`selectable` and claims no default. Before it existed `computer.control` had exactly one
provider, so the layer was marked selectable but nothing could be selected.

### Five verbs, not six — `computer__focus_app` is unbound

Bytebot's `application` action validates a **closed enum**: `firefox`, `1password`,
`thunderbird`, `vscode`, `terminal`, `desktop`, `directory`. The canonical
`computer__focus_app` takes a free-form `app` string, so binding it would make
`focus_app("Safari")` — a schema-legal call — fail with a 400. Rather than ship a verb
that 4xxs on legal input, the verb is left unbound and the action stays reachable natively
as `bytebot__application`, whose own schema carries the enum so an illegal call cannot be
composed in the first place.

The consequence, stated plainly: **while Bytebot is selected, `computer__focus_app`
disappears from the agent-visible surface**. That is the same narrowing `mem0` does to
`memory__store`, and for the same reason.

### Three binding decisions worth knowing

* **`computer__key` binds `type_keys`, not `press_keys`.** They look interchangeable and
  are not. `type_keys` → nut.js `pressKey(...all)` then `releaseKey(...all)` — one chord,
  which is what the canonical verb promises. `press_keys` is a *half* action with a
  required `press: "up" | "down"`; sending a chord through it would leave the modifiers
  physically held down on the desktop.
* **`computer__scroll` drops `x`/`y`.** `arg_template` builds its object shape
  unconditionally, and Bytebot's `coordinates` is `@IsOptional @ValidateNested` over a
  `{x, y}` that are both `@IsNumber` — so a scroll with no coordinates (legal: the
  canonical schema marks them optional) would send `coordinates: {}` and be rejected.
  Dropping them scrolls at the pointer's current position, which is exactly the fallback
  the canonical `x` description already warns callers about. `computer__click` *does*
  template them, and safely: there `x`/`y` are **required**, so the placeholders always
  resolve.
* **`amount` is clamped to 1..10.** Bytebot's `scrollCount` counts mouse-wheel **ticks**
  and the daemon sleeps 150ms between them. An `amount` a model intends as pixels — say
  500 — would be 500 ticks and 75 seconds of scrolling. `count` gets no clamp, because the
  canonical maximum is already 3 and Bytebot declares no upper bound: a clamp that narrows
  nothing is noise.

### What a capture returns

`computer__capture` answers `{provider: "bytebot", raw: {image: "<base64 png>"}}` — no
accessibility tree, no set-of-mark indices. Ghost returns annotated, indexed elements;
Bytebot's daemon is pixels-only, so a model working through this provider must read
coordinates off the image. The verb's own schema is silent about capture *mode* for
exactly this reason: providers differ and the result says which one you got.

## Registration seam

`manifest.json` here is the single source of truth: Core registers it built-in by
`include_str!`-ing **this** file from its package home. There is no fixture copy to
drift against any more.

## Tests

```sh
cd plugins-store/bytebot && node --test
```
