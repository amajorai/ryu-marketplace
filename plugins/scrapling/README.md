# Scrapling
<p align="center"><img src="./icon.png" alt="scrapling" width="96" /></p>

Adaptive web-page extraction for Ryu, powered by
[Scrapling](https://scrapling.readthedocs.io). Ships as a fully declarative plugin —
no runnables and no Core Rust: the tools come from Scrapling's own MCP server, and one
adapter maps the canonical verb onto them.

This is the **third `web.extract` provider**, after the local `spider` CLI (the
default) and the BYOK hosted services (`serper`, `tavily`, `firecrawl`). It is the
only one that needs neither an API key nor a hosted service — and the only one that
impersonates a real browser's TLS/JA3 fingerprint, which is the reason to reach for
it when a page refuses a plain HTTP fetch.

## Setup

```bash
pip install "scrapling[ai]"     # the MCP server lives in the `ai` extra
scrapling install               # ONLY for the browser-backed tools (Chromium + Camoufox)
```

`scrapling` must be on `PATH` — Core launches the server as `scrapling mcp`. Nothing
here is downloaded or managed by Ryu; this is a BYO install, exactly like the `spider`
CLI. Until it is present the MCP server does not start, `web.extract` falls back to
whichever other provider you select, and nothing errors.

### Known upstream breakage: `mcp` 2.x

Scrapling 0.4.12 declares `mcp>=1.27.0` with **no upper bound**, but `mcp` 2.0.0
renamed `mcp.server.fastmcp` → `mcp.server.mcpserver`. A fresh
`pip install "scrapling[ai]"` therefore resolves `mcp==2.0.0` and `scrapling mcp`
dies on import:

```
ModuleNotFoundError: No module named 'mcp.server.fastmcp'
```

Pin the SDK until upstream caps it:

```bash
pip install "scrapling[ai]" "mcp<2"
```

This is the single most likely reason the provider looks installed but serves
nothing. The adapter is written so this failure surfaces as itself (see below) rather
than as an empty page.

## Tools

Registering the MCP server publishes all ten of Scrapling's tools under a
`scrapling__` prefix, not just the one the capability binds:

| Tool id                       | What it is                                          |
| ----------------------------- | --------------------------------------------------- |
| `scrapling__get`              | Fast HTTP fetch with browser TLS impersonation       |
| `scrapling__bulk_get`         | The concurrent form, for many URLs                   |
| `scrapling__fetch`            | Chromium render, for SPA / JS-built pages            |
| `scrapling__bulk_fetch`       | The concurrent form                                  |
| `scrapling__stealthy_fetch`   | Camoufox + Cloudflare solving, for protected sites   |
| `scrapling__bulk_stealthy_fetch` | The concurrent form                               |
| `scrapling__screenshot`       | PNG/JPEG capture                                     |
| `scrapling__open_session` / `close_session` / `list_sessions` | Persistent browser sessions |

## It is a swappable layer provider

| Capability    | Canonical verb  | Forwards to      |
| ------------- | --------------- | ---------------- |
| `web.extract` | `web__extract`  | `scrapling__get` |

`"selectable": true` is declared and `"default"` is **not** — the local `spider`
plugin is the declared default for `web.extract`, and exactly one provider per
capability may claim it. Selectability needs unanimity: if any provider of a
capability omits the flag, the capability has candidates it cannot choose between and
the layer silently stops serving.

Select a provider in the desktop node selector's Toolkits section, or via
`PUT /api/capabilities/bindings` (note: that endpoint **replaces** the whole override
map — read, merge, then write).

### Why `get`, and not the stealth fetcher

`get` is the only tool that works off the base `pip install`. `stealthy_fetch` needs
`scrapling install` to download Camoufox first, and drives a real browser, so binding
the canonical verb to it would make `web__extract` slow and — on a partial install —
broken. The stealth tools stay directly callable as `scrapling__stealthy_fetch` for an
agent that actually needs them; only the *layer* default is the cheap path.

### Why no `web.crawl`

Scrapling does crawl — but only through its Python `Spider` class, which is not
exposed over MCP or the CLI. The MCP server's `bulk_*` tools fetch a list of URLs you
already have; none of them discovers links. Declaring `web.crawl` with a partial
`tools` map would be worse than useless: the entry would join resolution for that
capability and could win the pick away from `spider`, silently killing a layer that
currently works. So the entry is **absent**, not empty — the same call `firecrawl`
makes about its own asynchronous crawl endpoint.

### Why an adapter rather than a `response` map

Two shape facts, both verified against a live `scrapling mcp` server rather than the
docs (which state neither):

1. **An MCP `tools/call` answer is the transport envelope**, not the tool's value:
   `{content: [{type, text}], structuredContent, isError}`. The typed `ResponseModel`
   is only under `structuredContent`.
2. **`ResponseModel.content` is an array of strings**, and Scrapling emits empty
   entries for regions it extracted nothing from. Verbatim, for `https://example.com`:

   ```json
   { "status": 200, "content": ["Example Domain\n====…", ""], "url": "https://example.com/" }
   ```

The canonical `content` field is a **string**, and the declarative response mapper
copies a located value verbatim — it has no join. So the flattening lives in the
adapter, in the one provider whose shape this is, rather than in shared kernel code
every provider flows through. `firecrawl` sets the precedent, collapsing its own
`metadata.title` array quirk the same way.

The adapter also passes a missing `structuredContent` or an `isError: true` answer
straight through under `raw` instead of shaping it into an empty record — which is
what makes the `mcp` 2.x breakage above visible rather than silent.

### `format` is forwarded, uniquely

The canonical `web__extract.format` enum (`markdown | text | html`) is *exactly*
Scrapling's `extraction_type` enum, so this is the one shipped extract provider that
honours the argument instead of dropping it. That is why
`layer.web.extract.default.format` still has no settings field: a node-wide default
applied whichever provider is selected would be silently ignored by the other four.

## Tier: Core, but opt-in

Registered in `CORE_PLUGINS` and deliberately **not** in `CORE_DEFAULT_ON`.

Core-tier is not a promotion here, it is a requirement. `may_register_mcp_servers`
auto-allows manifest-declared `mcp_servers` only for compiled-in fixtures; a
Community-tier plugin needs the approved `mcp:server` grant, which is off the
Gateway's default allowlist and lives in a reserved namespace, so it can only be
granted out-of-band via `RYU_MARKETPLACE_GRANT_ALLOWLIST`. A Community-tier Scrapling
would register nothing and be dead on arrival.

Opt-in, because it needs a `pip install` the user has to perform. Shipping it
default-on would put a permanently unavailable tool on every fresh install — the same
reason the BYOK search providers stay opt-in. `firewall`, `routing`, `sandbox` and
`predict` are the existing Core-tier-but-opt-in precedent.

## Tests

```bash
node --test
```

Validates the manifest contract, the MCP-server declaration, the tier/grant
agreement, and the adapter — including running the adapter body against the verbatim
envelope captured from a live server, so a change that reintroduces array `content`
or swallows the failure path fails here rather than in a user's chat.
