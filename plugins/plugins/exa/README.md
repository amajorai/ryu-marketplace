# Exa Search
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="exa" width="96" />
  </picture>
</p>

Neural and keyword web search for Ryu agents, powered by the
[Exa API](https://exa.ai). Ships as a fully declarative plugin — two `http`
tool-defs in `manifest.json`, no Core Rust.

## Tools

| Tool id             | Endpoint                        | Required arg |
| ------------------- | ------------------------------- | ------------ |
| `exa.search`  | `POST https://api.exa.ai/search`      | `query`      |
| `exa.find_similar` | `POST https://api.exa.ai/findSimilar` | `url`        |

`search` also accepts `num_results` (1–100, Exa default 10), `use_autoprompt`
(Exa default true), and `contents` (e.g. `{"text": true}` to include full page
text). `find_similar` also accepts `num_results`.

## BYOK auth

Exa requires an API key, named once in `manifest.json` as
`"secret_headers": {"Authorization": "Bearer env:RYU_EXA_API_KEY"}`. Core resolves
that `env:` token server-side, so the key never reaches the model, never appears in
a tool argument, and is excluded from the audit trail.

There are two ways to supply it, and they are checked in this order. The second
requires a Core that ships the `secret` settings-field type and the encrypted
plugin-secret store; on an older build that field renders as a plain text input and
the value it writes is never read back.

1. **The process environment.** Export `RYU_EXA_API_KEY` in whatever launches Core
   (service unit, shell profile). An operator who configures a deployment this way
   expects `env | grep` to explain the running process, so this source wins.
2. **The settings UI.** Enable this plugin and open its **Exa Search** settings tab
   — the `Exa API key` field writes to the encrypted per-plugin secret store under
   that same name. Use this when you have *not* otherwise configured the key; it is
   the fallback, never an override of an exported variable.

The settings field is declared in `contributes.settings_tabs` with
`"type": "secret"` and `"pref_key": "RYU_EXA_API_KEY"` — the pref key **is** the env
var name, which is what makes the store reachable by the same `env:` token with no
second grammar. The tab is `"scope": "node"` because the credential belongs to
this node, not to a person: it is stored once in Core's encrypted secret store and
used by every caller on the node. (Scope chooses which settings dialog the tab appears
in; a `secret` field does not write a preference at all, so scope does not affect where
the value lands.)

Both tools are `fail_open`, so with no key configured they degrade rather than error
and `web.search` falls through to whichever other provider you select.

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

The callable tool ids (`exa.search`, `exa.find_similar`) are
unchanged. Agent allowlists or grants referencing the bare `exa.search` id or
the `mcp:exa` grant must migrate to `exa.search` /
`tool:http-egress:api.exa.ai`.
