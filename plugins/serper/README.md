# Serper
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="serper" width="96" />
  </picture>
</p>

Google's own search results as JSON, plus single-page scraping, powered by the
[Serper API](https://serper.dev). Ships as a fully declarative plugin — two `http`
tool-defs in `manifest.json`, no Core Rust.

## Tools

| Tool id           | Endpoint                                    | Required arg |
| ----------------- | ------------------------------------------- | ------------ |
| `serper__search`  | `POST https://google.serper.dev/search`     | `q`          |
| `serper__scrape`  | `POST https://scrape.serper.dev`            | `url`        |

Note the two **different hosts**, and that the scrape endpoint has no path segment
at all — it is the bare host. That is why `permission_grants` carries two
`tool:http-egress:` entries rather than one; a single grant would let search through
and silently block every scrape.

## It costs money

Serper is a **paid, credit-metered API** with a free allowance (2,500 queries at the
time of writing) and no subscription — you top up credits and spend them.

| Call                             | Credits                                        |
| -------------------------------- | ---------------------------------------------- |
| `serper__search` (Google search) | 1                                              |
| `serper__scrape` (one page)      | 2 typically; 6 or 10 for hard-to-scrape pages  |

Serper publishes volume pricing (around \$1.00 per 1,000 credits at the 50k tier).
Selecting Serper as your `web.search` layer therefore means every agent search on
this node spends credits — worth knowing before you make it the layer rather than
one of several installed providers. The number of credits a scrape actually consumed
comes back in the response.

## Setup

The key is named once in `manifest.json` as
`"secret_headers": {"X-API-KEY": "env:RYU_SERPER_API_KEY"}`. Core resolves that
`env:` token server-side, so it never reaches the model, never appears in a tool
argument, and is excluded from the audit trail.

Serper does **not** use `Authorization: Bearer` — it reads a custom `X-API-KEY`
header whose value is the bare key, with no scheme prefix. The manifest uses the
degenerate whole-value form of the secret template for exactly that reason.

There are two ways to supply the key, checked in this order:

1. **The process environment.** Export `RYU_SERPER_API_KEY` in whatever launches
   Core. An operator who configures a deployment this way expects `env | grep` to
   explain the running process, so this source wins.
2. **The settings UI.** Enable this plugin and open its **Serper** settings tab — the
   `Serper API key` field writes to the encrypted per-plugin secret store under that
   same name. Use this when you have *not* otherwise configured the key; it is the
   fallback, never an override of an exported variable.

Create a key at <https://serper.dev/api-keys>.

Both tools are `fail_open`, so with no key configured they degrade rather than error
and the layers fall through to whichever other provider you select.

## It is a swappable layer provider

This plugin is a **provider** for two hot-swappable layers:

| Capability    | Canonical verb  | Forwards to      |
| ------------- | --------------- | ---------------- |
| `web.search`  | `web__search`   | `serper__search` |
| `web.extract` | `web__extract`  | `serper__scrape` |

It deliberately does **not** provide `web.crawl`: Serper scrapes exactly one URL per
call and has no link-following endpoint. Declaring the capability anyway would put
Serper into resolution for that layer, where it could win the pick away from
`spider` and silently kill a layer that works.

Agents call the canonical verb (`web__search`), not the provider tool. Selecting a
different provider (Exa, Tavily or Brave for search, Spider or Tavily for extraction)
re-points that verb without changing its id, its input schema, or the shape of its
results. An agent allowlisted for `web__search` keeps working across the swap.

Two mappings do the normalizing, both declared in `provides[].tools`:

- **`args`** renames the canonical arguments onto Serper's. Serper agrees with the
  canonical names on nothing that matters: the query is `q` and the result count is
  `num`, so **both** search arguments are renamed. An unmapped canonical argument is
  forwarded under its original name, which here would mean the required `q` never
  arrives. On extract, `format` maps to `""` (an explicit drop) because Serper
  expresses output format as an `includeMarkdown` boolean rather than a format enum;
  `url` is left unmapped on purpose, since Serper's field is called `url` too.
- **`response`** maps Serper's records into the canonical shape. Search reads the
  ranked results out of the top-level `organic` array and renames `link` → `url`
  (title and snippet already match). Extract declares **no** `results` path: a scrape
  answers with a single record, not an array, and the contract reads an absent path
  as "the response itself is the record". Its `text` becomes the canonical `content`,
  with `markdown` alongside. Each item keeps the provider's original record under
  `raw`, so nothing is lost by the mapping.

One consequence of omitting the `results` path, worth knowing before anyone "fixes"
it by inventing one: the facade's absent-path escape hatch (which passes a payload
straight through when the declared path is missing) does not apply, so a `fail_open`
403 arrives as a single result with no `content` rather than a visible error.

The canonical `limit` accepts up to 100 while Google decides the real page size, so
a large `limit` may return fewer results than asked. Tavily ships the same mismatch
(its own maximum is 20); the canonical schema is the union, not a promise every
provider can keep.

Both entries declare `"selectable": true`. That flag needs **unanimity**: if any
provider of a capability omits it, the capability has several candidates and no way
to choose, so it resolves to nothing and the layer silently stops serving. Neither
entry claims `"default"` — `exa` is the default for `web.search` and `spider` for
`web.extract`, and exactly one provider per capability may claim it.

Select a provider in the desktop node selector's Layers section, or via
`PUT /api/capabilities/bindings` (note: that endpoint **replaces** the whole
override map — read, merge, then write).

## Tests

```bash
node --test
```

Validates the manifest contract, the two-host egress-grant agreement, and the verb
bindings — including that every argument rename targets an argument the provider tool
actually accepts, which is otherwise a silent runtime failure.
