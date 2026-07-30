# Spider Cloud

Hosted multi-page web crawling for Ryu, powered by the
[Spider Cloud API](https://spider.cloud). Ships as a fully declarative plugin — one
`http` tool-def in `manifest.json`, no Core Rust.

This is the **second `web.crawl` provider**. Before it, `web.crawl` had exactly one
(the local `spider` CLI), so `selectable`/`default` were correct but inert and there
was nothing to swap to.

## Tools

| Tool id              | Endpoint                                    | Required arg |
| -------------------- | ------------------------------------------- | ------------ |
| `spidercloud__crawl` | `POST https://api.spider.cloud/crawl`       | `url`        |

## Setup

The key is named once in `manifest.json` as
`"secret_headers": {"Authorization": "Bearer env:RYU_SPIDERCLOUD_API_KEY"}`. Core
resolves that `env:` token server-side, so it never reaches the model, never appears
in a tool argument, and is excluded from the audit trail.

There are two ways to supply it, checked in this order:

1. **The process environment.** Export `RYU_SPIDERCLOUD_API_KEY` in whatever launches
   Core. An operator who configures a deployment this way expects `env | grep` to
   explain the running process, so this source wins.
2. **The settings UI.** Enable this plugin and open its **Spider Cloud** settings tab
   — the `Spider Cloud API key` field writes to the encrypted per-plugin secret store
   under that same name. Use this when you have *not* otherwise configured the key; it
   is the fallback, never an override of an exported variable.

Create a key at <https://spider.cloud/api-keys/>. The tool is `fail_open`, so with no
key configured it degrades rather than errors and `web.crawl` falls through to
whichever other provider you select.

## Why this API and not another crawler

A canonical `web__crawl` call must come back with page **content**. Spider Cloud's
crawl is **synchronous**: `run_in_background` is documented with default `false`, and
a plain `POST /crawl` returns the fetched pages in the same HTTP response. That is the
whole reason this provider can exist as a declarative HTTP tool — one request, no
polling loop.

Firecrawl is still deliberately **not** bound to `web.crawl` for the opposite reason:
its crawl endpoint returns a job id to poll, so the verb would hand the model a UUID
where it promises page content. Nothing here changes that.

## It is a swappable layer provider

| Capability  | Canonical verb | Forwards to          |
| ----------- | -------------- | -------------------- |
| `web.crawl` | `web__crawl`   | `spidercloud__crawl` |

`"selectable": true` is declared, and `"default"` is **not** — the local `spider`
plugin is the declared default for `web.crawl`, and exactly one provider per
capability may claim it. Selectability needs unanimity: if any provider of a
capability omits the flag, the capability has candidates it cannot choose between and
the layer silently stops serving.

Select a provider in the desktop node selector's Layers section, or via
`PUT /api/capabilities/bindings` (note: that endpoint **replaces** the whole override
map — read, merge, then write).

### The three mappings, and why each is what it is

**`args: {"depth": ""}` — the canonical `depth` is DROPPED.** Spider Cloud documents
`depth` as *"The crawl limit for maximum depth. If `0`, no limit will be applied"*
(default 25). The canonical verb documents `depth` as *"Link hops to follow (0 = the
start page only)"*. Those are inverses at exactly the value a cautious model passes:
canonical `depth: 0` means "just this page", upstream `depth: 0` means "crawl
forever". Clamping `min: 1` would paper over the inversion at 0 while still asserting
that the two systems count hops the same way — and upstream does not document what an
individual depth value counts, so that assertion is unverifiable. The grammar's
explicit drop (`""`) is the honest encoding: this provider cannot express the
argument, so it ignores it rather than misreading it.

The consequence, stated plainly: with Spider Cloud selected, `web__crawl` is bounded
by `limit` alone, not by hop count. The `layer.web.crawl.default.depth` preference is
dropped for this provider (the local `spider` provider still forwards it, so that
settings field is not decoration).

**`limit` gets both a default and a clamp — this is the load-bearing one.** Upstream
documents `limit` default `0`, *"Remove the value or set it to `0` to crawl all
pages."* The canonical `limit` is **optional**, so `web__crawl {url}` with no limit
would ask Spider Cloud to crawl an entire site. Core's http tool aborts at 30s, so
that call returns nothing at all — the layer would break on its very first use by a
model that simply omitted an optional argument.

- `body_defaults: {"limit": 10}` supplies the canonical schema's own stated default
  whenever no limit is sent, on the verb path *and* on a direct `spidercloud__crawl`
  call. Caller arguments merge over it, so an explicit `limit` still wins.
- `arg_clamp: {"limit": {"min": 1, "max": 25}}` turns a `limit: 0` into 1 rather than
  "everything", and caps the ceiling far below the canonical maximum of 500. 25 is a
  deliberate under-promise against the 30s synchronous budget: fewer pages than asked
  for is a normal outcome for a "up to N" argument, a timeout that returns nothing is
  not.

**`response` normalizes into `{title, url, content}`.** Each page record upstream is
`{url, status, content, error, costs}`, plus a `metadata` object when `metadata: true`
is sent (which `body_defaults` does). `body_defaults` also sends
`return_format: "markdown"` — the upstream default is `raw`, i.e. HTML, and the
canonical `content` field promises page content, not markup.

Two caveats worth stating rather than hiding:

- `metadata.title` is the mapped path for `title`. That Spider Cloud's `metadata`
  parameter *"Collect metadata about the content found like page title, description,
  keywords and etc."* is verbatim from the API reference, and client usage shows
  `page['metadata']['title']`, but no verbatim response example in the docs pins the
  path. The failure mode is soft by construction: `map_item` looks the path up with
  `dotted`, which returns `None` on a missing segment, so a wrong path **omits the
  field** — it cannot error, and it cannot report something false. The incumbent local
  `spider` provider declares no response map at all, so this is strictly closer to the
  canonical shape either way.
- `unwrap_body` is deliberately **not** set here, unlike `tavily`/`firecrawl`/`exa`.
  Spider Cloud's success payload is a **top-level JSON array** with no wrapper key, so
  there would be no dotted path for `results` to name. Leaving the default
  `{status, body}` envelope in place gives `results: "body"` a real path, which
  restores the property `map_response` depends on: when the declared results path is
  absent, the payload is passed straight through instead of being reported as an empty
  result set. That is what makes a bad or missing API key (`fail_open` turns 401/403
  into `{available:false, reason, hint}`) surface as itself rather than as "the crawl
  found nothing".

## Tests

```bash
node --test
```

Validates the manifest contract, the egress-grant/called-host agreement, and the verb
binding — including that every argument rename targets an argument the provider tool
actually accepts, and that the `depth` drop and the `limit` guards are both still in
place, since either silently reverting is the difference between a working layer and
a broken one.
