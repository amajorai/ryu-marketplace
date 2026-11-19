# DeepSeek Search

Web search and single-page fetch for Ryu, powered by the
[DeepSeek Search / Fetch API](https://api-docs.deepseek.com/guides/search) and
DeepSeek's in-house search engine. Ships as a fully declarative plugin — two `http`
tool-defs in `manifest.json`, no Core Rust and no adapter.

## Tools

| Tool id           | Endpoint                                         | Required arg |
| ----------------- | ------------------------------------------------ | ------------ |
| `deepseek.search` | `POST https://api.deepseek.com/v1/tools/search`  | `query`      |
| `deepseek.fetch`  | `POST https://api.deepseek.com/v1/tools/fetch`   | `url`        |

Both endpoints share one host, so `permission_grants` carries a single
`tool:http-egress:api.deepseek.com` entry.

`deepseek.search` accepts `query` (1–128 characters), `count` (1–50, default 10),
`ori_question` (the user's original question, to improve ranking) and `need_content`
(also return each page's full content). The query supports `site:`, `-site:`,
`"exact phrase"`, `-term`, `lang:zh,en`, `after:` and `before:` operators. Each result
carries `title`, `url`, `snippet` (short, for display), `summary` (longer, for
models), `rerank_score` (0–3; 1.5+ is high quality), `authority` (0–4, `-1` unknown),
`site_name`, `site_icon`, `date` and, when requested, `content`.

`deepseek.fetch` returns the page `title` and its `content` as markdown. A 403 means
DeepSeek's security policy refused the URL; a 404 means it could not extract usable
content from it.

## It costs money

DeepSeek bills **$0.75 per 1,000 successful requests** for each of search and fetch,
deducted from your DeepSeek balance. Only an HTTP 200 with a non-empty `results` array
(search) or page content (fetch) is billed — errors, empty results and timeouts are
free, and `count` does not change the price. Rate limits are per account: 100 QPS for
search and 25 QPS (plus a per-domain limit) for fetch.

## Setup

The key is named once in `manifest.json` as
`"secret_headers": {"Authorization": "Bearer env:RYU_DEEPSEEK_API_KEY"}`. Core resolves
that `env:` token server-side, so it never reaches the model, never appears in a tool
argument, and is excluded from the audit trail.

It is deliberately a different variable from the `DEEPSEEK_API_KEY` that the DeepSeek
model provider reads: enabling a search layer must be an explicit choice, not a side
effect of having configured DeepSeek chat models. The same DeepSeek key works for
both — set it in each place you want it used.

There are two ways to supply it, checked in this order:

1. **The process environment.** Export `RYU_DEEPSEEK_API_KEY` in whatever launches
   Core. This source wins.
2. **The settings UI.** Enable this plugin and open its **DeepSeek Search** settings
   tab — the `DeepSeek API key` field writes to the encrypted per-plugin secret store
   under that same name. The tab is `"scope": "node"` because the credential belongs
   to this node, not to a person.

Both tools are `fail_open`, so with no key configured they degrade rather than error and
the layers fall through to whichever other provider you select.

## It is a swappable layer provider

| Capability    | Canonical verb | Forwards to       |
| ------------- | -------------- | ----------------- |
| `web.search`  | `web.search`   | `deepseek.search` |
| `web.extract` | `web.extract`  | `deepseek.fetch`  |

Agents call the canonical verb (`web.search`), not the provider tool. The normalizing
is declared in `provides[].tools`:

- **`web.search`** renames `limit` → `count` and clamps it to DeepSeek's 1–50 range.
  The response maps `title`/`url` straight across, the model-readable `summary` onto
  the canonical `snippet`, `rerank_score` onto `score` and `date` onto `published`.
  Each item keeps DeepSeek's original record under `raw`.
- **`web.extract`** drops the canonical `format` (DeepSeek always answers in
  markdown) and declares `response.fields` with **no** `results` path: a fetch
  answers with a single `{title, content}` record, not an array, which the contract
  reads as "the response itself is the record". DeepSeek's fetch response carries no
  URL, so the canonical result has `title` and `content` only.

Both entries declare `"selectable": true` and neither claims `"default"` — `exa`
stays the default for `web.search` and `spider` for `web.extract`.

## Tests

```bash
node --test
```
