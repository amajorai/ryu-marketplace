# Brave Search
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="brave" width="96" />
  </picture>
</p>

Independent web search for Ryu, powered by the
[Brave Search API](https://brave.com/search/api/). Ships as a fully declarative
plugin — one `http` tool-def in `manifest.json`, no Core Rust.

Brave crawls and ranks its own index rather than reselling someone else's, which is
the point of having it installed alongside Exa or Tavily: swapping the `web.search`
layer to Brave changes *which web the agent sees*, not just which vendor bills you.

## Tools

| Tool id         | Endpoint                                                | Required arg |
| --------------- | ------------------------------------------------------- | ------------ |
| `brave__search` | `GET https://api.search.brave.com/res/v1/web/search`     | `q`          |

Two things about that row are easy to get wrong and both fail only at runtime:

- **It is a `GET`.** Core treats `GET`/`HEAD` as bodyless and lowers the whole
  argument map into the **query string** verbatim, so every property name in the
  input schema has to be a real Brave query parameter. The query is `q`, not
  `query`; the result count is `count`, not `limit`. (`body_defaults` is also inert
  on a bodyless method, so this manifest declares none — Brave's own defaults apply.)
- **Auth is not `Authorization: Bearer`.** Brave reads an `X-Subscription-Token`
  header whose value is the bare token, so the manifest declares
  `"secret_headers": {"X-Subscription-Token": "env:RYU_BRAVE_API_KEY"}` with no
  scheme prefix.

## Setup

The key is named once in `manifest.json` as the `env:RYU_BRAVE_API_KEY` token above.
Core resolves that token server-side, so it never reaches the model, never appears in
a tool argument, and is excluded from the audit trail.

There are two ways to supply it, checked in this order.

1. **The process environment.** Export `RYU_BRAVE_API_KEY` in whatever launches Core.
   An operator who configures a deployment this way expects `env | grep` to explain
   the running process, so this source wins.
2. **The settings UI.** Enable this plugin and open its **Brave Search** settings tab
   — the `Brave Search subscription token` field writes to the encrypted per-plugin
   secret store under that same name. Use this when you have *not* otherwise
   configured the key; it is the fallback, never an override of an exported variable.

Get a token from the [Brave Search API dashboard](https://api-dashboard.search.brave.com/app/keys).
The tab is `"scope": "node"` because the credential belongs to this node, not to a
person.

The tool is `fail_open`, so with no key configured it degrades rather than errors and
the layer falls through to whichever other provider you select.

## It is a swappable layer provider — search only

| Capability   | Canonical verb | Forwards to     |
| ------------ | -------------- | --------------- |
| `web.search` | `web__search`  | `brave__search` |

That table has exactly one row on purpose. The Brave Search API returns *search
results*; it has no page-extraction and no crawl endpoint. So this plugin declares
`web.search` and deliberately declares neither `web.extract` nor `web.crawl` —
selecting Brave for search leaves extraction and crawling on Spider (or whatever else
you picked), which is precisely why the design splits those three capabilities
instead of shipping one `web` layer.

Agents call the canonical verb (`web__search`), not the provider tool. Selecting a
different provider (Exa or Tavily) re-points that verb without changing its id, its
input schema, or the shape of its results. An agent allowlisted for `web__search`
keeps working across the swap.

Two mappings do the normalizing, both declared in `provides[].tools`:

- **`args`** renames **both** canonical arguments onto Brave's query parameters:
  `query` → `q` and `limit` → `count`. Unmapped canonical arguments are forwarded
  under their *original* name, so leaving either one out would put `query=`/`limit=`
  on the wire (parameters Brave ignores) while the required `q` went missing.
- **`response`** reads the results from the dotted path `web.results` (Brave nests
  them under a `web` cluster alongside `news`, `videos`, and friends) and maps each
  record into the canonical `{title, url, snippet}` shape. Brave calls the snippet
  `description`. Each item keeps the provider's original record under `raw`.

`unwrap_body` is therefore required, not stylistic: the `web.results` path only
exists on the raw upstream JSON, and without it the tool would return a
`{status, body}` envelope the path silently misses.

The entry declares `"selectable": true`. That flag needs **unanimity**: if any
provider of a capability omits it, the capability has several candidates and no way
to choose, so it resolves to nothing and the layer silently stops serving. It does
not claim `"default"` — `exa` is the default for `web.search`, and exactly one
provider per capability may claim it.

Select a provider in the desktop node selector's Layers section, or via
`PUT /api/capabilities/bindings` (note: that endpoint **replaces** the whole override
map — read, merge, then write).

## Known limitation: `limit` above 20

The canonical `web__search` schema advertises `limit` up to 100. Brave's `count`
caps at 20, and nothing between the facade's rename and the HTTP send clamps a
renamed argument against the provider's schema. A caller that asks for more than 20
results therefore gets Brave's own validation error rather than 20 results. Ask for
≤ 20 on this layer, or set the node-wide default under **Layers → search result
count**.

## Tests

```bash
node --test
```

Validates the manifest contract, the egress-grant/called-host agreement, the exact
auth header shape, that every declared argument is a real Brave query parameter, and
the verb binding — including that every argument rename targets an argument the
provider tool actually accepts, which is otherwise a silent runtime failure.
