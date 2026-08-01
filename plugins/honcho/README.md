# Honcho

Give the swappable `memory` layer a provider that **models the user** rather than only
storing rows, powered by [Honcho](https://honcho.dev) (Plastic Labs) and its
[v3 REST API](https://honcho.dev/docs/v3/api-reference/endpoint/peers/chat). Ships as a
fully declarative plugin — two `http` tool-defs in `manifest.json`, no Core Rust.

Honcho ingests the messages you hand it and derives a per-peer **representation**: a
standing model of that person built from their messages and the conclusions Honcho draws
from them. Its **Dialectic** endpoint then answers a natural-language question against
that representation with Honcho's own synthesis. That is exactly what Ryu's canonical
`memory__context` verb promises, and **no shipped provider served it** — so
`memory_provider::context`, the `memory.provider-context` setting, and the whole `context`
kernel bridge were dead code. This plugin is the first that makes them run.

Honcho is also what [Hermes uses](https://honcho.dev/docs/v3/guides/integrations/hermes.md)
for persistent cross-session memory, which is where Ryu's whole swappable-layers design
took the idea from (see `docs/swappable-layers-design.md` §3).

## Tools

| Tool id          | Endpoint                                                             | Required args |
| ---------------- | -------------------------------------------------------------------- | ------------- |
| `honcho__chat`   | `POST https://api.honcho.dev/v3/workspaces/{workspace_id}/peers/{peer_id}/chat`   | `workspace_id`, `peer_id`, `query` |
| `honcho__search` | `POST https://api.honcho.dev/v3/workspaces/{workspace_id}/peers/{peer_id}/search` | `workspace_id`, `peer_id`, `query` |

Both are `unwrap_body`, so they return Honcho's JSON body directly, and both are
`fail_open`, so with no key configured they degrade rather than error.

Host, paths, methods, request fields and response fields are quoted from the OpenAPI
fragments Honcho publishes inside its own docs — `servers: - url: https://api.honcho.dev`
(*"Production SaaS Platform"*), `openapi: 3.1.0`, `info.version: 3.0.11` — at
`honcho.dev/docs/v3/api-reference/endpoint/peers/chat.md` and
`honcho.dev/docs/v3/api-reference/endpoint/peers/search-peer.md`.

### `honcho__chat` — the Dialectic endpoint

> Query a Peer's representation using natural language. Performs agentic search and
> reasoning to comprehensively answer the query based on all latent knowledge gathered
> about the peer from their messages and conclusions.

Request body (`DialecticOptions`): `query` (string, **required**, 1–10000 chars),
`session_id` (string|null), `target` (string|null), `stream` (boolean, default `false`),
`reasoning_level` (enum `minimal | low | medium | high | max`, default `low`).

Response (`DialecticResponse`): `{ "content": string | null }`.

`stream` is **deliberately not exposed**. The 200 response declares
`text/event-stream: {}` alongside JSON, and an SSE body is not a JSON tool result.

### `honcho__search`

> Search a Peer's messages, optionally filtered by various criteria.

Request body (`MessageSearchOptions`): `query` (string, **required**), `filters`
(object|null), `limit` (integer 1–100, default 10).

Response: a **bare JSON array** of `Message` — `{id, content, peer_id, session_id,
metadata, created_at, workspace_id, token_count}`.

`filters` is **not exposed**: the schema is `additionalProperties: true` with the
description *"Filters to scope the search"* and no documented key set at this endpoint,
so shipping it would be a schema field this plugin cannot describe.

## Setup

Honcho's OpenAPI declares one security scheme, `HTTPBearer` (`type: http, scheme:
bearer`), so the header this plugin sends is `Authorization: Bearer <key>`.

The key is named once in `manifest.json` as
`"secret_headers": {"Authorization": "Bearer env:RYU_HONCHO_API_KEY"}`. Core resolves the
`env:` token server-side, so it never reaches the model, never appears in a tool argument,
and is excluded from the audit trail. Two sources, checked in this order:

1. **The process environment** — export `RYU_HONCHO_API_KEY` in whatever launches Core.
   An operator who configures a deployment this way expects `env | grep` to explain the
   running process, so this source wins.
2. **The settings UI** — enable this plugin and open its **Honcho** settings tab. The
   `Honcho API key` field writes the encrypted per-plugin secret store under that same
   name, which is why the field's `pref_key` **is** the env var name. Create a key at
   <https://app.honcho.dev> under *API Keys*.

Honcho keys can be scoped in its dashboard to a workspace, peer or session. A
**workspace-scoped** key is enough for both tools here. A peer-scoped key acts on its own
peer plus read-only access to its sessions, which also covers both calls for that one
peer; a session-scoped key does **not** reach peer routes and will not work.

### Workspace and peer are per-install, not baked in

Both URLs carry two path placeholders, and Honcho's model needs both: a **workspace** is
the isolation boundary between applications, and a **peer** is the individual whose
representation gets synthesized. Neither is a canonical memory-verb argument and neither
may be hardcoded — a manifest constant would put every Ryu install in one shared bucket,
reading and answering about somebody else's user.

So both come from node preferences through `arg_defaults` `pref:` tokens:

```json
"arg_defaults": {
  "workspace_id": "pref:honcho.workspace-id",
  "peer_id": "pref:honcho.peer-id"
}
```

The two `text` settings fields (`Honcho workspace id`, `Honcho peer id`) are their
readers, and both are `required`. Set them to the workspace and peer you already send
messages under — Honcho's SDKs use the workspace `default` unless told otherwise, and its
quickstart names the human peer `user`.

An **unresolved `pref:` token drops its argument** rather than sending the literal string
upstream. Here that drop then leaves a `{workspace_id}` placeholder with nothing to fill
it, and the call fails with `http tool: missing path parameter(s)`. That is the intended
loud failure: the alternative shapes — a literal `"pref:honcho.workspace-id"` in the URL,
or a baked-in default — would both silently read the wrong bucket.

### `reasoning_level` is layered on purpose

The kernel gives a memory provider **4 seconds** (`memory_provider::PROVIDER_TIMEOUT`) and
then continues without it — and `read_hooks` runs `context` and `prefetch` under **one**
shared budget, so a slow Dialectic call takes prefetch down with it. A Dialectic call does
agentic search plus reasoning; at Honcho's own default (`low`) it can comfortably exceed
that, which would leave `memory__context` bound but never actually arriving in a chat
turn — the exact silent failure this plugin exists to end.

Two mechanisms, and they compose because `body_defaults` merge **under** the arguments:

- the tool's `"body_defaults": {"reasoning_level": "minimal"}` pins the fast setting
  out of the box, with no configuration;
- `"reasoning_level": "pref:honcho.reasoning-level"` in `arg_defaults` overrides it when
  the `Dialectic reasoning level` settings field is set.

Unset, the token drops and `minimal` from `body_defaults` stands — which is why the select
field's advertised default and the effective behaviour agree. (A settings-field `default`
is a UI default; it is not written to the preference store until the user saves, so a
`pref:` token alone would have fallen through to Honcho's `low`.)

## It is a swappable layer provider

| Capability | Canonical verb    | Forwards to      |
| ---------- | ----------------- | ---------------- |
| `memory`   | `memory__context` | `honcho__chat`   |
| `memory`   | `memory__search`  | `honcho__search` |

The entry declares `"selectable": true` and claims **no** `"default"`. Selectability needs
unanimity — if any provider of a capability omits the flag, the capability has candidates
and no way to choose, so it resolves to nothing and the layer silently stops serving.
`@ryu/memory` declares both `selectable` and `default`, so the built-in stays the
zero-config pick and Honcho becomes available to select.

Select a provider in the desktop node selector's Layers section, or via
`PUT /api/capabilities/bindings` (note: that endpoint **replaces** the whole override map
— read, merge, then write).

### What selecting Honcho turns on

`memory_provider.rs` has four kernel bridges, each opening with
`if !is_external().await { return }`, where "external" means "not `@ryu/memory`".
Selecting Honcho makes **two** of them fire:

- **`context`** → `memory__context`, at system-prompt assembly, gated by
  `memory.provider-context` (default **off**, so turn it on). This is the one that had no
  provider at all before this plugin.
- **`prefetch`** → `memory__search`, before each turn, following `recall_mode` (on by
  default).

- **`mirror`** → `memory__store`, and **`sync`** → `memory__sync`. Both are bound now
  (see below); `memory.mirror-builtin` is ON by default, so selecting Honcho starts
  writing facts to it. Both kernel hooks are fire-and-forget, so a write failure never
  surfaces in the turn.

### `memory__context` declares NO `response` map, and that is load-bearing

`memory_provider::summary_text` reads the prose out of a context result by looking for
`context` / `summary` / `content` / `text` at the top level, or one level inside `raw`.

The Dialectic response is `{"content": "…"}`. With no `response` map the facade returns
its un-normalized passthrough, `{provider: "honcho", raw: {"content": "…"}}` — and
`raw.content` is exactly where `summary_text` looks. Adding a `response` map would rewrite
the payload into `{provider, results: [...]}`, a shape `summary_text` cannot read at all,
so "mapping it properly" would produce **no context, silently**. The absence is the
binding.

This is also why the sibling endpoints were not used.
`POST .../peers/{peer_id}/representation` returns `{"representation": string}` and
`GET .../peers/{peer_id}/context` returns `{peer_id, target_id, representation,
peer_card}`; both are real standing-summary endpoints, but `representation` is not one of
the four keys `summary_text` accepts, and no `response` mapping can produce one of them
without a Core change.

### `memory__search` searches MESSAGES, not derived facts

Worth stating plainly, because `prefetch` is on by default: `POST
.../peers/{peer_id}/search` searches *"a Peer's messages"*. Selecting Honcho therefore
starts folding excerpts of raw conversation into every turn's recall, not distilled facts.
The synthesis lives behind `memory__context`. Provider text is capped and run through
`untrusted::neutralize` either way, but if you want only the synthesis, turn
`memory.recall-mode` down and leave `memory.provider-context` on.

The mapping is small on purpose:

```json
"args": { "scope": "" },
"response": { "fields": { "id": "id", "content": "content" } }
```

- `scope` is **dropped** — Honcho has no scope-level concept to map it onto.
- `query` and `limit` pass through unmapped because Honcho's names already match.
- **No `arg_clamp`.** The canonical `limit` maxes at 50 and Honcho's at 100, so a clamp
  would narrow nothing; the grammar says not to declare one that never narrows.
- `results` is **omitted** from the response map because the payload *is* the record set —
  Honcho answers a bare array, which the facade takes as the items directly.
- `content` is the canonical key `memory_provider::fact_text` reads first, which is what
  makes the prefetched messages actually reach the prompt.

## The write path, and why it needs an adapter

`memory__sync` and `memory__store` are bound; `memory__forget` is not.

**Delete has nothing to bind.** Honcho's documented API surface, from
`honcho.dev/docs/llms.txt`, includes *Get Message*, *Get Messages*, *Update Message*,
*Create Messages For Session* and *Create Messages With File* — and **no** message-delete
endpoint. (There is a *Delete Session* and a *Delete Workspace*; deleting a whole session
because an agent wanted to forget one fact is not what `memory__forget` promises.) No
adapter can invent an endpoint, so this verb stays unbound.

**Write was blocked by a real limit of the DECLARATIVE grammar.** The only documented
write is:

```
POST /v3/workspaces/{workspace_id}/sessions/{session_id}/messages
{ "messages": [ { "content": "…", "peer_id": "…" } ] }
```

`MessageCreate` requires **both** `content` and `peer_id` on every item. `arg_template`
can build an array of objects — that is what made Mem0's writes bindable — but
`map_args_with_defaults` expands the template from the **caller's** arguments only:

```rust
let (templated, consumed) = expand_arg_template(binding, &arguments);
let mut out: Map<String, Value> = defaults;
out.extend(templated);
```

`arg_defaults` (and therefore every `pref:` token) is merged *after*, at the top level. It
cannot reach inside the template. The canonical `memory__store` / `memory__sync` arguments
are `content` (+ `role`, `scope`, `category`, …) — none of which is the install's peer id.
So the only expressible declarative binding would hardcode a peer, i.e. exactly the
shared-bucket bug the `pref:` mechanism exists to prevent.

**An adapter closes it.** An adapter receives `defaults` with every `pref:` token
**already resolved**, so the per-install peer id can be placed inside `messages[]` where
no declarative field could reach. That is the gap the adapter contract names as its own
motivation.

Three things the adapter does that are worth knowing:

- **It creates what it needs.** Honcho's session and peer ids are *caller-named*
  (`POST .../sessions` and `POST .../peers` are both get-or-create), so the adapter
  upserts them rather than making you set anything up in Honcho first. Optimistically:
  it writes the message, and only on a **missing-resource** status (404/422) does it
  upsert and retry once, so the steady state stays **one** request per turn on a path
  that runs every turn. The gate is deliberately narrow: these tools are `fail_open`,
  so a bad API key comes back as `{available,reason,hint}` and any other non-2xx as
  `{status,body}` — repairing on "anything that is not the expected array" would turn
  one bad key into four upstream requests on every single turn.
- **It falls back in code, not in a settings `default`.** A settings field's `default` is
  UI-only and is never written to the preferences store, so an unset session id would
  *drop* its argument and hard-fail with `missing path parameter(s)`. `honcho.session-id`
  and `honcho.assistant-peer-id` therefore default inside the adapter, which is the one
  place a default actually applies.
- **It never attributes an assistant turn to you.** Honcho derives a representation *of*
  a peer from that peer's messages. Writing Ryu's replies as your peer would poison it,
  so replies go to a separate peer id.

`memory__store` has no natural home in Honcho — it models conversations, not fact rows —
so a stored fact is written as a message from your peer with the canonical `scope`,
`category`, `importance` and `when_to_use` preserved in Honcho's documented per-message
`metadata` rather than silently dropped.

**Not runtime-verified.** Every endpoint, field name and requiredness above was checked
against Honcho's published v3 API reference, but no write has been executed against a live
Honcho workspace from this repo.

## Files

- `manifest.json` — the plugin. Byte-identical to
  `apps/core/src/plugin_manifest/fixtures/honcho.manifest.json`, which is the built-in
  registration seam (`include_str!` in `plugin_manifest/mod.rs`). The contract test
  asserts they have not drifted.
- `plugin.test.mjs` — the co-located contract test. Run with `node --test`.
