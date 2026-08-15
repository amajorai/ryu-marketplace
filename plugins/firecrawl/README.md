# Firecrawl
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="firecrawl" width="96" />
  </picture>
</p>

Web search and page scraping for Ryu, powered by the
[Firecrawl v2 API](https://firecrawl.dev). Ships as a fully declarative plugin — two
`http` tool-defs in `manifest.json`, no Core Rust.

## Tools

| Tool id              | Endpoint                                     | Required arg |
| -------------------- | -------------------------------------------- | ------------ |
| `firecrawl__search`  | `POST https://api.firecrawl.dev/v2/search`   | `query`      |
| `firecrawl__scrape`  | `POST https://api.firecrawl.dev/v2/scrape`   | `url`        |

Both are on the **v2** API. That prefix is part of the contract, not a detail: v1 and
v2 differ in response shape (v2 search nests its results under `data.web`), so a
silent downgrade would break the response mapping below.

## Setup

The key is named once in `manifest.json` as
`"secret_headers": {"Authorization": "Bearer env:RYU_FIRECRAWL_API_KEY"}`. Core resolves
that `env:` token server-side, so it never reaches the model, never appears in a tool
argument, and is excluded from the audit trail.

There are two ways to supply it, checked in this order. The second requires a Core
that ships the `secret` settings-field type and the encrypted plugin-secret store; on
an older build that field renders as a plain text input and the value it writes is
never read back.

1. **The process environment.** Export `RYU_FIRECRAWL_API_KEY` in whatever launches
   Core. An operator who configures a deployment this way expects `env | grep` to
   explain the running process, so this source wins.
2. **The settings UI.** Enable this plugin and open its **Firecrawl** settings tab —
   the `Firecrawl API key` field writes to the encrypted per-plugin secret store under
   that same name. Use this when you have *not* otherwise configured the key; it is the
   fallback, never an override of an exported variable.

Keys are created at <https://www.firecrawl.dev/app/api-keys> and are `fc-`-prefixed.

The settings field is declared in `contributes.settings_tabs` with `"type": "secret"`
and `"pref_key": "RYU_FIRECRAWL_API_KEY"` — the pref key **is** the env var name, which
is what makes the store reachable by the same `env:` token with no second grammar. The
tab is `"scope": "node"` because the credential belongs to this node, not to a person:
it is stored once in Core's encrypted secret store and used by every caller on the
node.

One field covers both layers below: `web.search` and `web.extract` authenticate with
the same credential, and two fields sharing a `pref_key` inside one tab is rejected at
load.

Both tools are `fail_open`, so with no key configured they degrade rather than error and
the layers fall through to whichever other provider you select.

## It is a swappable layer provider

This plugin is a **provider** for two hot-swappable layers:

| Capability    | Canonical verb  | Forwards to          |
| ------------- | --------------- | -------------------- |
| `web.search`  | `web__search`   | `firecrawl__search`  |
| `web.extract` | `web__extract`  | `firecrawl__scrape`  |

Agents call the canonical verb (`web__search`), not the provider tool. Selecting a
different provider (Exa or Tavily for search, Spider or Tavily for extraction)
re-points that verb without changing its id, its input schema, or the shape of its
results. An agent allowlisted for `web__search` keeps working across the swap.

Two mappings do the normalizing, both declared in `provides[].tools`:

- **`args`** reconciles the canonical argument names with Firecrawl's. Firecrawl
  happens to use the canonical names already for `query`, `limit` and `url`, so those
  pass through untouched; the one real decision is `"format": ""`, an explicit **drop**
  (see below).
- **`response`** maps Firecrawl's records into the canonical `{title, url, snippet}` /
  `{url, content}` shapes. Search reads `data.web`; scrape reads `data`, a single
  object that the mapper wraps into a one-element result list, and reaches the page URL
  through the dotted path `metadata.sourceURL`. Each item keeps Firecrawl's original
  record under `raw`, so nothing is lost by the mapping.

Two deliberate omissions in that mapping:

- **`format` is dropped, not forwarded.** The canonical enum is
  `markdown | text | html`. Firecrawl v2's `formats` accepts `markdown` and `html` but
  has **no `text` member**, so forwarding the canonical value verbatim would fail on
  one of its three legal values. Dropping it leaves Firecrawl's own default
  (`[{"type":"markdown"}]`), which is what the canonical default means anyway.
- **`position` is not mapped onto `score`.** Canonical `score` is a *relevance* score,
  higher-is-better, which is what Exa and Tavily emit. Firecrawl's `position` is a
  1-based *rank*, lower-is-better. Mapping one onto the other would invert the ordering
  semantics across a provider swap, so `position` stays in `raw`.

Both entries declare `"selectable": true`. That flag needs **unanimity**: if any
provider of a capability omits it, the capability has candidates and no way to choose,
so it resolves to nothing and the layer silently stops serving. Neither entry claims
`"default"` — `exa` is the default for `web.search` and `spider` for `web.extract`, and
exactly one provider per capability may claim it.

Select a provider in the desktop node selector's Layers section, or via
`PUT /api/capabilities/bindings` (note: that endpoint **replaces** the whole
override map — read, merge, then write).

## Why `web.crawl` is NOT provided

Firecrawl has a crawl endpoint, and this plugin deliberately does not bind it.

`POST https://api.firecrawl.dev/v2/crawl` is **asynchronous**. It answers
`{"success": true, "id": "<uuid>", "url": "<status url>"}` — a job id. The pages only
arrive from a second, separate `GET https://api.firecrawl.dev/v2/crawl/{id}`, which
returns `status`/`total`/`completed` plus a `data` array and a `next` cursor once the
job finishes. (`POST /v2/batch/scrape` is the same story, and takes a URL list rather
than a start URL + depth, so it cannot satisfy the canonical crawl schema either.)

A declarative `http` tool is **one request with no polling loop**. Binding `web__crawl`
to the crawl endpoint would therefore hand the model a UUID where the canonical verb
promises page content — every crawl on a node that selected Firecrawl would return
nothing usable.

The entry is **absent** rather than declared-but-empty, and that distinction is the
load-bearing part. A `provides` entry for `web.crawl` carrying no (or a partial) `tools`
map would still join resolution for that capability and could win the pick away from
`spider`, silently killing a layer that currently works. Absent is safe; empty is not.

If Firecrawl ever ships a synchronous crawl, binding it is a manifest edit and nothing
more.

## Tests

```bash
node --test
```

Validates the manifest contract, the egress-grant/called-host agreement, and the verb
bindings — including that every argument rename targets an argument the provider tool
actually accepts (otherwise a silent runtime failure), and that `web.crawl` stays
unprovided.
