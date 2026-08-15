# No More Mistakes
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="no-more-mistakes" width="96" />
  </picture>
</p>

Notices when you correct the agent, writes the lesson down as a one-line rule in a Space,
and hands every later session that rule list before the first word is generated — so a
mistake you have already fixed once stops coming back. Each rule is an ordinary Space
document you can read, edit or delete, and `/mistakes` lists, adds and forgets them from
the chat.

Definition lives in `manifest.json`, its sandboxed hook bodies in `hooks/capture.js`,
`hooks/brief.js` and `hooks/command.js`; Core compiles all four in from this package
directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.

Community-tier and **opt-in**: it is in `CORE_PLUGINS` but deliberately not in
`CORE_DEFAULT_ON`. The capture hook cannot be `match`-gated (there is no "this message
reads like a complaint" pre-gate in the manifest grammar), so it costs a sandbox spawn per
user turn, and a captured correction costs a side-model call on top.

## The three hooks

| Hook | Phase | Fires |
| --- | --- | --- |
| `no-more-mistakes.capture` | `pre_user_turn` | Every turn; returns before any host call unless the message matches a correction pattern **and** there is an answer to learn from. |
| `no-more-mistakes.brief` | `session_start` | Once per conversation, injecting the rule list. |
| `no-more-mistakes.command` | `pre_user_turn` | Only on a message starting with `/mistakes` (a `match.commands` gate, evaluated in Rust — no sandbox spawn otherwise). |

### Why capture is a `pre_user_turn` hook

The correction is a **user** message. On `post_assistant_turn` the correcting message has
not been typed yet, so the hook would be judging an answer nobody has objected to. On this
phase `ctx.input` is the pending message and `ctx.transcript` still holds the answer it is
objecting to — the pair the rule has to be derived from.

It returns `inject`, never `replace`. Rewriting the user's own words to smuggle a rule in
would change what gets persisted as their message; `inject` appends to the outgoing turn
only, so the rule is in force immediately and the transcript still shows what they typed.

### Why the briefing is an injection and not retrieval

The rules are in a Space and Spaces are embedded, so a RAG query *could* surface them —
but only if the current phrasing happens to resemble a rule written weeks ago about
something else. "Never touch `vendor/`" has to arrive on the turn where the agent is about
to touch `vendor/`, and nothing about that turn's wording retrieves it. A rule you have to
get lucky to recall is not a rule.

It fires once per conversation, not once per turn: after the first turn the rules are
already in the window the model sees.

## Where the rules live

One document per rule, in a Space named by the `mistakes-space` setting (default
`Mistakes`), created on first write via `host.spaces.ensureSpace`.

- **Title = the rule.** The Space's document list shows titles, so the whole ruleset is
  readable — and deletable one row at a time — from the Spaces page without opening
  anything.
- **Body = the evidence**: why the rule exists, when it was recorded, the conversation id,
  and the exchange that produced it.
- Writes go through the ordinary document path, so each rule is flattened, embedded and
  searchable like any other Space content.

The Space is an ordinary one, not a system Space: rename it, move it, or delete the whole
thing — nothing in Core depends on it existing.

**Known rough edge.** The documents are app-owned (`kind = app:@ryu/no-more-mistakes`) and
this plugin ships no companion UI, so *clicking* a rule in the Spaces page lands on "App
not available". Reading the list, and deleting rows, work; reading a rule's body needs
`/mistakes` or a companion, which is the obvious next increment.

## Commands

| Command | Effect |
| --- | --- |
| `/mistakes` | The rules, numbered. |
| `/mistakes add <rule>` | Record one by hand (no model call, no correction needed). |
| `/mistakes forget <number>` | Delete that rule. By number only — a substring match would drop the wrong one. |
| `/mistakes off` \| `on` | Stop / resume automatic learning **in this chat** (beats the global setting). |

Every branch returns `handled`, so `/mistakes` never reaches the main model: listing rules
the plugin already holds is bookkeeping, not a turn worth paying a frontier model for.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `mistakes-capture` | on | Learn from corrections. Off leaves `/mistakes add` as the only way in. |
| `mistakes-brief` | on | Brief the agent at the start of a chat. Off keeps recording but stops enforcing. |
| `mistakes-space` | `Mistakes` | The Space rules are filed in, by name. |
| `mistakes-brief-max` | 12 | Rules per briefing (most recently touched first). The rest stay searchable. |
| `mistakes-model` | — | Extraction model. Empty = node default, else the local engine. |

## What it can and cannot see

- `ctx.transcript` is **text only** (`HookMessage` is `{role, content}`), so a rule is
  derived from what the agent *said*, never from the tool calls it made. A correction of
  the shape "you ran the wrong command" still works — the command is usually in the text —
  but "you edited the wrong file silently" is invisible.
- The correction gate is **English-only**, on purpose: it is a cost gate, not the
  decision. A correction in another language is not auto-captured; `/mistakes add` records
  it by hand. The alternative — no gate — is a model call on every message anyone sends.
- The extraction model decides `rule` / `duplicate` / `none`, and is told to answer `none`
  when unsure. A false positive costs one side-model call; a rule that should not exist is
  one `/mistakes forget` away.

## Failure posture

Fail-open throughout. An unreachable Space, a model that returns prose instead of JSON, a
KV error — each costs the lesson or the briefing, never the turn. The user's message is
sent either way.
