# Mem0

Recall from **and record into** a hosted [Mem0](https://mem0.ai) memory project inside
Ryu, powered by the [Mem0 Platform REST API](https://docs.mem0.ai/api-reference). Ships
as a fully declarative plugin — three `http` tool-defs in `manifest.json`, no Core Rust.

## Tools

| Tool id         | Endpoint                                                | Required arg |
| --------------- | ------------------------------------------------------- | ------------ |
| `mem0__search`  | `POST https://api.mem0.ai/v3/memories/search/`          | `query`, `filters` |
| `mem0__add`     | `POST https://api.mem0.ai/v3/memories/add/`             | `messages`   |
| `mem0__delete`  | `DELETE https://api.mem0.ai/v1/memories/{memory_id}/`   | `memory_id`  |

`mem0__search` and `mem0__add` set `unwrap_body`, so they return Mem0's JSON body
directly. `mem0__delete` does not: Mem0 documents delete as a **204**, and an unwrapped
empty 204 payload reaches the caller as a bare empty string that reads like a failure, so
it keeps the `{status, body}` envelope.

Every path, method, and host is quoted from Mem0's own API reference
(`servers: - url: https://api.mem0.ai/`) at
`docs.mem0.ai/api-reference/memory/search-memories`,
`docs.mem0.ai/api-reference/memory/add-memories` and
`docs.mem0.ai/api-reference/memory/delete-memory`.

## Setup

Mem0 documents its auth scheme as: *"API key authentication. Prefix your Mem0 API key
with 'Token '. Example: 'Token your_api_key'"* — so the header this plugin sends is
`Authorization: Token <key>`, **not** `Bearer`.

The key is named once per tool in `manifest.json` as
`"secret_headers": {"Authorization": "Token env:RYU_MEM0_API_KEY"}`. Core resolves that
`env:` token server-side, so it never reaches the model, never appears in a tool
argument, and is excluded from the audit trail.

There are two ways to supply it, checked in this order.

1. **The process environment.** Export `RYU_MEM0_API_KEY` in whatever launches Core.
   An operator who configures a deployment this way expects `env | grep` to explain the
   running process, so this source wins.
2. **The settings UI.** Enable this plugin and open its **Mem0** settings tab — the
   `Mem0 API key` field writes to the encrypted per-plugin secret store under that same
   name. Get a key from the Mem0 Dashboard at
   <https://app.mem0.ai/dashboard/api-keys>.

The settings field is declared in `contributes.settings_tabs` with `"type": "secret"`
and `"pref_key": "RYU_MEM0_API_KEY"` — the pref key **is** the env var name, which is
what makes the store reachable by the same `env:` token with no second grammar. The tab
is `"scope": "node"` because the credential belongs to this node, not to a person.

All three tools are `fail_open`, so with no key configured they degrade rather than error
and the `memory` layer falls back to whichever other provider you select.

## It is a swappable layer provider

| Capability | Canonical verb   | Forwards to    | Notes |
| ---------- | ---------------- | -------------- | ----- |
| `memory`   | `memory__search` | `mem0__search` | entity id nested in `filters` |
| `memory`   | `memory__store`  | `mem0__add`    | `infer: false` — store the decided fact as-is |
| `memory`   | `memory__sync`   | `mem0__add`    | Mem0's default inference on — it mines the turn |
| `memory`   | `memory__forget` | `mem0__delete` | |

Before this plugin, `memory` had exactly one provider (`@ryu/memory`), which made the
layer un-swappable and left the four kernel bridges in `apps/core/src/memory_provider.rs`
unreachable — each opens with `if !is_external().await { return }`, and "external" means
"not `@ryu/memory`".

Selecting Mem0 now fires **three of those four bridges**:

| Bridge | Verb | When | Setting | Default |
| --- | --- | --- | --- | --- |
| `prefetch` | `memory__search` | before each turn | follows `memory.recall-mode` | on |
| `mirror` | `memory__store` | after a built-in write succeeds | `memory.mirror-builtin` | **on** |
| `sync` | `memory__sync` | per turn, raw user text | `memory.sync-turns` | off |
| `context` | `memory__context` | prompt assembly | `memory.provider-context` | off — **inert**, see below |

`context` stays a no-op because this provider binds no `memory__context`, so
`memory.provider-context` has nothing to call while Mem0 is selected.

The entry declares `"selectable": true` and claims **no** `"default"`. Selectability
needs unanimity — if any provider of a capability omits the flag, the capability has two
candidates and no way to choose, so it resolves to nothing and the layer silently stops
serving. `@ryu/memory` declares both `selectable` and `default`, so the built-in stays
the zero-config pick and Mem0 becomes available to select.

Select a provider in the desktop node selector's Layers section, or via
`PUT /api/capabilities/bindings` (note: that endpoint **replaces** the whole override
map — read, merge, then write).

## The write verbs, and what made them bindable

Mem0's write endpoint is `POST /v3/memories/add/`. Its request body, verbatim from the
API reference:

```bash
curl -X POST https://api.mem0.ai/v3/memories/add/ \
  -H "Authorization: Token <api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I just moved to San Francisco from New York."},
      {"role": "assistant", "content": "Got it, I'\''ll update your location."}
    ],
    "user_id": "alice"
  }'
```

`messages` is an array of `{role, content}` **objects** (`role` ∈ `user | assistant |
system`). The canonical verbs hand a provider a single `content` string
(`memory__store`) or `content` plus `role` (`memory__sync`). `CapabilityToolBinding.args`
is a flat rename table whose only shape transform is the `[]` suffix, which wraps the
value it was given in a one-element array — applied here it produces
`{"messages": ["…"]}`, an array of strings, which Mem0 documents no form of. That is why
both verbs were unbound until `arg_template` shipped:

```json
"memory__store": {
  "tool": "mem0__add",
  "arg_template": { "messages": [{ "role": "user", "content": "{content}" }] },
  "arg_defaults": { "user_id": "pref:mem0.user-id", "infer": false }
}
```

`arg_template` is a nested body shape with `{canonical_arg}` placeholders. A string that
is exactly `"{arg}"` becomes that argument's value with its JSON type preserved, and an
argument the template consumes is withheld from the flat rename pass so it cannot also
appear twice.

### Why the same endpoint serves two verbs

They differ in one documented field. Mem0 documents `infer` as *"Set to `false` to skip
inference and store the provided text as-is"*, default `true`.

- `memory__store` is *"a fact you have already decided on"* — the `mirror` bridge sends a
  fact the built-in store just recorded. Re-running Mem0's extractor over an
  already-distilled fact would paraphrase or discard it, so this binding sends
  `infer: false`.
- `memory__sync` *"delegates the extraction"* — the whole point is that the provider
  decides what is worth keeping. It leaves `infer` at Mem0's default.

### `role` on `memory__sync` is carried through, not defaulted

```json
"arg_template": { "messages": [{ "role": "{role}", "content": "{content}" }] }
```

The canonical `memory__sync` schema is `{content, role?}` — `role` is optional. An absent
placeholder **drops its field**, so a caller that omits `role` produces
`{"content": "…"}`, a message Mem0 does not document and will reject.

That is the accepted behaviour, and pinning `"role": "user"` instead was rejected: it
would relabel assistant turns as things the user said, and Mem0's inference would then
store the assistant's words as facts about the user. Silent corruption of stored content
is worse than a rejected write, especially since the write is `fail_open` and
fire-and-forget — a 4xx here is a no-op nobody sees. The kernel `sync` bridge
(`memory_provider::sync_turn`) always passes a role, so the only path that can produce a
role-less message is an agent calling `memory__sync` by hand and choosing to omit it.
There is no grammar for defaulting a value *inside* a template: `arg_defaults` merges
under the template's output, so a default `messages` would simply be overwritten.

### The write response is ASYNCHRONOUS

```json
{ "message": "Memory processing has been queued for background execution", "status": "PENDING", "event_id": "<uuid>" }
```

Mem0 answers with a **job envelope, never a memory id**. Neither write verb declares a
`response` map, so this passes through untouched under `{provider, raw}` and nothing
pretends it is a fact record. Two consequences worth stating:

- **Do not chain `memory__forget` onto a store result.** `event_id` is a job id;
  `DELETE /v1/memories/{memory_id}/` wants a memory id. Use an id from `mem0__search`.
- **A successful call means "accepted", not "stored".** Both kernel bridges are
  fire-and-forget (`detach()` does `let _ = call_verb(…)`), so neither reads the
  response, which is what makes an async write acceptable here at all.

## Why `memory__context` is NOT bound

Mem0 publishes no standing-summary endpoint. The complete memory API surface, from
`docs.mem0.ai/llms.txt`, is: add, get-all, get, search, update, delete, delete-all,
batch-update, batch-delete, history, feedback, create-export, get-export. None of them
returns "the provider's own synthesis of this user", which is what `memory__context`
promises. Forcing the verb onto, say, get-all would inject a raw fact dump at system rank
under a label that says it is a summary. An unverified binding ships a provider that
4xxs — or worse, silently misleads — on first use while the picker cheerfully offers it.

## Scoping: one preference, two placements

Mem0 scopes every memory to an entity — `user_id`, `agent_id`, `app_id` or `run_id` — and
**requires at least one**. Ryu's canonical memory verbs carry no principal at all, so the
id comes from the manifest via `arg_defaults`, resolved at call time from the
`mem0.user-id` node preference (the `Mem0 user id` settings field is its reader):

```json
"memory__search": { "arg_defaults": { "filters": { "user_id": "pref:mem0.user-id" } } },
"memory__store":  { "arg_defaults": { "user_id": "pref:mem0.user-id" } },
"memory__sync":   { "arg_defaults": { "user_id": "pref:mem0.user-id" } }
```

**The nesting differs because Mem0's API differs, and getting it wrong is silent.**

- **Search** documents: *"Entity IDs (`user_id`, `agent_id`, `app_id`, `run_id`) **must**
  be passed inside the `filters` object: top-level entity IDs are rejected with 400."*
- **Add** documents `user_id` as a **top-level** body field, alongside `messages`. There
  is no `filters` object on this endpoint — copying the search shape here would send a
  `filters` field Mem0's add endpoint does not document, leaving the request with no
  entity at all.

Everything else about the choice is unchanged from search:

- **`arg_defaults`, not a new canonical argument.** Adding `user_id` to the verb table is
  a contract change every `memory` provider would have to honour, and it would leak a
  Mem0-specific concept into a shape the built-in store has no use for.
- **`user_id`, not `agent_id` or `run_id`.** Mem0 documents `user_id` as "Associates the
  memory with a user"; `run_id` is "this session / run". Keying on the agent or the run
  would split recall across every agent and every conversation.
- **A `pref:` token, not a literal.** A hard-coded bucket gave every install the same id,
  so recall returned nothing forever and silently. An **unresolved** token drops its
  field rather than sending the literal `"pref:…"` upstream — on search Mem0 then reports
  a missing entity id instead of matching nothing, and on add it rejects the write
  instead of parking it in a bucket nothing can read back.

If your project already uses a different id, set it in the **Mem0 user id** field, or
call `mem0__search` / `mem0__add` directly with your own arguments — the provider-native
tool ids stay registered and take them.

## Dropped canonical arguments

`memory__store`'s canonical schema is `{content, scope?, category?, importance?,
when_to_use?}`. Only `content` has a home in Mem0's request, so the other four map to
`""` — an explicit drop. Unmapped arguments pass through **under their own name**, so
without this they would land as undocumented top-level body fields.

They are deliberately *not* folded into Mem0's `metadata` object: this provider's search
binding never filters on metadata, so they would be write-only — a field nothing reads —
and a content-only call would produce `metadata: {}`, a shape no Mem0 example shows. The
built-in store remains the source of truth for scope and category; the Mem0 copy exists
for recall.

## No `arg_clamp`

Mem0's `top_k` ceiling (1000) is **above** the canonical `memory__search.limit` maximum
(50), and the kernel prefetch clamps lower still. `arg_clamp` is for a provider that
accepts *less* than the canonical schema allows (Brave's `count` maxes at 20); declaring
one that can never narrow anything is noise that reads as a real constraint.

## Tests

```bash
node --test
```

Validates the manifest contract, the egress-grant/called-host agreement, and the verb
bindings — including that every argument rename targets an argument the provider tool
actually accepts, that the write templates build the documented `messages` shape, that
the entity id sits where Mem0 documents it on **each** endpoint, and that
`memory__context` stays unbound.
