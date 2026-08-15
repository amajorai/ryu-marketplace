# Parallel Search
<p align="center"><img src="./icon.png" alt="parallel" width="96" /></p>

Objective-driven web search and content extraction for Ryu agents, powered by
[Parallel](https://parallel.ai). Ships as a fully declarative plugin — three
`http` tool-defs in `manifest.json` plus one capability adapter, no Core Rust.

## Tools

| Tool id                 | Endpoint                                | Required arg     | Key    |
| ----------------------- | --------------------------------------- | ---------------- | ------ |
| `parallel__search`      | `POST https://api.parallel.ai/v1/search`  | `search_queries` | yes    |
| `parallel__free_search` | `POST https://search.parallel.ai/mcp`     | JSON-RPC envelope | **no** |
| `parallel__extract`     | `POST https://api.parallel.ai/v1/extract` | `urls`           | yes    |

`search` also accepts `objective` (a self-contained natural-language statement of
what you are looking for), `mode` (`turbo` / `basic` / `advanced`; this plugin
defaults to `basic`, Parallel's own default is `advanced`), and `max_chars_total`.
`extract` also accepts `objective`, `search_queries`, and `max_chars_total`, and
sends `advanced_settings.full_content` so each record carries the whole page as
markdown rather than objective-focused excerpts.

**There is no result-count parameter.** Parallel's search has none on either path,
and both request bodies are `additionalProperties: false`, so adding one is a 4xx
rather than a no-op. Size the response with `max_chars_total`; the canonical
`limit` is applied client-side by the adapter.

## Capabilities

- **`web.search`** — through `adapters/web__search.js`. Four things make an
  adapter mandatory here rather than stylistic:
  1. Parallel search takes an `objective` **and** `search_queries`; the canonical
     verb supplies one `query`, and a declarative `args` map is 1:1.
  2. `limit` has no server-side home (see above), so it is honoured client-side.
  3. Each result's `excerpts` is an **array** of markdown passages where the
     canonical `snippet` is a string — and the answer is routinely in a later
     passage, so they are joined rather than `[0]`-picked.
  4. The keyless fallback below cannot be expressed declaratively.
- **`web.extract`** — bound declaratively (`urls[]` wrap + a `response.fields`
  map). No adapter, because nothing needs reshaping once `full_content` is on.

Selecting Parallel in the layer picker re-points the stable `web__search` /
`web__extract` tools at it without changing the id or schema an agent sees.

## Works with no key

Parallel publishes a **public** Search MCP endpoint that needs no credential.
`web.search` tries the keyed REST API first (higher limits) and falls back to it
only when the key is genuinely absent — `fail_open` turns a 401/403 into
`{available: false, …}`, and that envelope *is* the no-key signal. Any other
failure (5xx, rate limit, transport) is passed straight through, so a broken key
costs one request rather than two.

Two things about that endpoint differ from [`exa`](../exa/README.md), whose
adapter this one otherwise mirrors — do not copy exa's parsing here:

- It answers `content-type: application/json`, not `text/event-stream`. The
  adapter reads `result.structuredContent` (falling back to parsing
  `result.content[0].text`) instead of pulling JSON out of an SSE frame.
- It needs no `Accept` header and no `initialize` handshake, so there is no
  `header_params` entry and the `tools/call` is sent bare.

JSON-RPC errors arrive as HTTP 200, so `fail_open` never sees them; an envelope
with no usable payload is handed back raw rather than flattened into an empty
result set that would read as "the web has nothing".

`session_id` and `model_name` are deliberately never sent. `session_id` is what
Parallel rate-limits the free tier on — a constant baked into a shipped manifest
would be shared by every Ryu install and collide globally, so the server mints a
fresh one per call instead. `model_name` is analytics-only and the sandbox has no
trustworthy view of the calling model.

## BYOK auth

Parallel authenticates with `x-api-key` (not a bearer token), named once in
`manifest.json` as `"secret_headers": {"x-api-key": "env:RYU_PARALLEL_API_KEY"}`.
Core resolves that `env:` token server-side, so the key never reaches the model,
never appears in a tool argument, and is excluded from the audit trail.

There are two ways to supply it, checked in this order:

1. **The process environment.** Export `RYU_PARALLEL_API_KEY` in whatever launches
   Core (service unit, shell profile). An operator who configures a deployment
   this way expects `env | grep` to explain the running process, so this wins.
2. **The settings UI.** Enable this plugin and open its **Parallel Search**
   settings tab — the `Parallel API key` field writes to the encrypted per-plugin
   secret store under that same name. Use this when you have *not* otherwise
   configured the key; it is the fallback, never an override.

The field is declared in `contributes.settings_tabs` with `"type": "secret"` and
`"pref_key": "RYU_PARALLEL_API_KEY"` — the pref key **is** the env var name, which
is what makes the store reachable by the same `env:` token with no second grammar.
The tab is `"scope": "node"` because the credential belongs to this node, not to a
person.

Without a key, `web.search` still works through the free endpoint; `web.extract`
returns nothing and falls back to whichever other provider you select.

## Known degradations

- **Failed extract URLs are dropped, not reported.** `V1ExtractResponse` carries
  `results` (successes) *and* `errors` (requested URLs that failed, with
  `error_type` / `http_status_code`). The declarative binding maps `results` only,
  so a URL that fails extraction just shortens the list. That is a partial answer
  rather than a wrong one; surfacing `errors` would mean replacing the binding
  with an adapter, which nothing else here needs.
- **`advanced_settings` is not exposed as a tool argument** on purpose. Core's
  `body_defaults` merge lets the model win every collision and its leaf case is a
  plain overwrite, so a model sending `advanced_settings: null` — legal in
  Parallel's own schema — would wipe out `full_content: true` and silently revert
  to excerpt mode, leaving the canonical `content` null. Not declaring the key
  makes that unreachable.

## Verification status

The MCP endpoint's behaviour above — stateless `tools/call`, JSON content type, no
`Accept` requirement, `structuredContent` present alongside the text block — was
checked against the live service. The **keyed** REST paths are derived from
Parallel's published OpenAPI schema and a 401 probe; they have not been exercised
with a real key here, which is why the fallback condition stays narrow
(`available === false` only) rather than widening to "anything that failed".
