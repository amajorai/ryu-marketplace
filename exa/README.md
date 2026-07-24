# Exa Search

Neural and keyword web search for Ryu agents, powered by the
[Exa API](https://exa.ai). Ships as a fully declarative plugin — two `http`
tool-defs in `plugin.json`, no Core Rust.

## Tools

| Tool id             | Endpoint                        | Required arg |
| ------------------- | ------------------------------- | ------------ |
| `exa__search`  | `POST https://api.exa.ai/search`      | `query`      |
| `exa__find_similar` | `POST https://api.exa.ai/findSimilar` | `url`        |

`search` also accepts `num_results` (1–100, Exa default 10), `use_autoprompt`
(Exa default true), and `contents` (e.g. `{"text": true}` to include full page
text). `find_similar` also accepts `num_results`.

## BYOK auth

Exa requires an API key. Set `RYU_EXA_API_KEY` to your key; it is sent as the
`Authorization: Bearer …` header (named via `header_params`).

> **Note (auth injection):** the declarative `http` tool backend today sources
> header *values* from call arguments only — it has no env→header seam, so the
> `Authorization` header is not yet populated from `RYU_EXA_API_KEY`. Wiring
> this requires a small generic env→header injection in Core's
> `tool_exec::run_http_tool` (recommended follow-up; do **not** expose the key
> as a model-supplied argument). Until then the tool will 401.

## Migration from the built-in Rust tool

This plugin replaces the former built-in `exa` registry server
(`apps/core/src/sidecar/mcp/exa.rs`). Two behavioural deltas from that
implementation:

- **Output shape** is `{status, body}` (the generic `run_http_tool` envelope),
  not the raw Exa JSON body.
- The Rust `{available:false, …}` graceful degradation, the `include_text`→
  `contents.text` convenience remap, its `num_results`/`use_autoprompt` defaults,
  and the `RYU_EXA_BASE_URL` self-host override are dropped. The model passes
  Exa-native keys and relies on Exa's server-side defaults.

The callable tool ids (`exa__search`, `exa__find_similar`) are
unchanged. Agent allowlists or grants referencing the bare `exa__search` id or
the `mcp:exa` grant must migrate to `exa__search` /
`tool:http-egress:api.exa.ai`.
