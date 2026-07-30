# Tavily Search

Agent-tuned web search and content extraction for Ryu, powered by the
[Tavily API](https://tavily.com). Ships as a fully declarative plugin — two `http`
tool-defs in `manifest.json`, no Core Rust.

## Tools

| Tool id            | Endpoint                                | Required arg |
| ------------------ | --------------------------------------- | ------------ |
| `tavily__search`   | `POST https://api.tavily.com/search`    | `query`      |
| `tavily__extract`  | `POST https://api.tavily.com/extract`   | `urls`       |

## Setup

The key is named once in `manifest.json` as
`"secret_headers": {"Authorization": "Bearer env:RYU_TAVILY_API_KEY"}`. Core resolves
that `env:` token server-side, so it never reaches the model, never appears in a tool
argument, and is excluded from the audit trail.

There are two ways to supply it, checked in this order. The second requires a Core
that ships the `secret` settings-field type and the encrypted plugin-secret store; on
an older build that field renders as a plain text input and the value it writes is
never read back.

1. **The process environment.** Export `RYU_TAVILY_API_KEY` in whatever launches Core.
   An operator who configures a deployment this way expects `env | grep` to explain
   the running process, so this source wins.
2. **The settings UI.** Enable this plugin and open its **Tavily Search** settings tab
   — the `Tavily API key` field writes to the encrypted per-plugin secret store under
   that same name. Use this when you have *not* otherwise configured the key; it is the
   fallback, never an override of an exported variable.

The settings field is declared in `contributes.settings_tabs` with `"type": "secret"`
and `"pref_key": "RYU_TAVILY_API_KEY"` — the pref key **is** the env var name, which is
what makes the store reachable by the same `env:` token with no second grammar. The tab
is `"scope": "node"` because the credential belongs to this node, not to a person:
it is stored once in Core's encrypted secret store and used by every caller on the
node. (Scope chooses which settings dialog the tab appears in; a `secret` field does
not write a preference at all, so scope does not affect where the value lands.)

One field covers both layers below: `web.search` and `web.extract` authenticate with the
same credential, and two fields sharing a `pref_key` inside one tab is rejected at load.

Both tools are `fail_open`, so with no key configured they degrade rather than error and
the layers fall through to whichever other provider you select.

## It is a swappable layer provider

This plugin is a **provider** for two hot-swappable layers:

| Capability    | Canonical verb  | Forwards to       |
| ------------- | --------------- | ----------------- |
| `web.search`  | `web__search`   | `tavily__search`  |
| `web.extract` | `web__extract`  | `tavily__extract` |

Agents call the canonical verb (`web__search`), not the provider tool. Selecting a
different provider — Exa for search, Spider for extraction — re-points that verb
without changing its id, its input schema, or the shape of its results. An agent
allowlisted for `web__search` keeps working across the swap, and prompts that name
the tool keep matching.

Two mappings do the normalizing, both declared in `provides[].tools`:

- **`args`** renames the canonical arguments onto Tavily's (`limit` → `max_results`).
  The suffix `[]` means "rename and wrap in a single-element array": the canonical
  `web__extract` passes one `url`, while Tavily's endpoint takes a batch `urls`
  array, so the binding is `"url": "urls[]"`.
- **`response`** maps Tavily's records into the canonical `{title, url, snippet}`
  shape. Each item keeps the provider's original record under `raw`, so nothing is
  lost by the mapping.

Both entries declare `"selectable": true`. That flag needs **unanimity**: if any
provider of a capability omits it, the capability has two candidates and no way to
choose, so it resolves to nothing and the layer silently stops serving. Neither
entry claims `"default"` — `exa` is the default for `web.search` and `spider` for
`web.extract`, and exactly one provider per capability may claim it.

Select a provider in the desktop node selector's Layers section, or via
`PUT /api/capabilities/bindings` (note: that endpoint **replaces** the whole
override map — read, merge, then write).

## Tests

```bash
node --test
```

Validates the manifest contract, the egress-grant/called-host agreement, and the
verb bindings — including that every argument rename targets an argument the
provider tool actually accepts, which is otherwise a silent runtime failure.
