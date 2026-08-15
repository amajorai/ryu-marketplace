# Recap
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="recap" width="96" />
  </picture>
</p>

Ends a long agent turn with a short recap of what it actually did — the work, the files
and commands it named, what it could not finish, and the obvious next step — written by a
side model so the main answer is left untouched. Long turns only by default (a three-line
answer is already its own recap). `/recap` recaps the whole conversation on demand, and
`/recap off` mutes the automatic one for that chat.

Definition lives in `manifest.json`, its sandboxed hook bodies in `hooks/turn.js` and
`hooks/command.js`; Core compiles all three in from this package directory. Published to
the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.

Community-tier and **opt-in**: it is in `CORE_PLUGINS` but deliberately not in
`CORE_DEFAULT_ON`, because every recap is a real side-model call the user pays for.

## The two hooks

| Hook | Phase | Fires |
| --- | --- | --- |
| `recap.turn` | `post_assistant_turn` | Every turn; skips before the model call when the chat is muted, the setting is off, or the turn was short. |
| `recap.command` | `pre_user_turn` | Only on a message starting with `/recap` (a `match.commands` gate, evaluated in Rust — no sandbox spawn otherwise). |

`recap.turn` returns a `note`, so the recap is surfaced beside the answer and never
enters the history the model sees next turn — a recap fed back as context is duplicated
tokens the model then re-summarizes.

**A note is live, not scrollback.** `plugin_note_frame` (`apps/core/src/server/mod.rs`)
streams a `data-plugin_note` SSE part and persists nothing, and the desktop shows only the
most recent undismissed one, in a dismissible banner above the composer
(`ChatPage.tsx` → `activePluginNote`). So an automatic recap disappears on dismiss or
reload. The text itself is not lost — each one is stored in the plugin's own KV, and
`/recap` rebuilds the conversation's recap from exactly those entries. That is the
deliberate trade: a durable recap row would need a Core capability to append a message,
which is not something a plugin has (`plugin_host/bridge.rs` exposes no such host
function).

`recap.command` returns `handled`, so `/recap` **never reaches the main model**: the side
model writes the recap and it becomes the assistant reply. Asking the working agent to
summarize itself would cost a full turn at the expensive model, in the very context the
recap exists to keep clear.

## Commands

| Command | Effect |
| --- | --- |
| `/recap` | Recap the conversation so far. |
| `/recap <focus>` | Same, but pointed: `/recap what changed in auth`. |
| `/recap off` \| `on` | Mute / unmute the automatic per-turn recap **for this chat** (beats the global setting). |
| `/recap clear` | Drop the stored per-turn recaps for this chat. |

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `recap-auto` | on | Master toggle for the per-turn recap. Off leaves `/recap`. |
| `recap-min-chars` | 1200 | Turns shorter than this are skipped. `0` recaps every turn. |
| `recap-detail` | standard | `brief` (one line), `standard` (line + bullets), `detailed` (+ what is still open). |
| `recap-model` | — | Side model. Empty = node default, else the local engine. |

## What it can and cannot see

`ctx.transcript` is **text only** (`HookMessage` is `{role, content}`), so a recap
describes what the agent *said* it did. There is no tool ledger, on purpose:

- `post_tool_use` carries no `conversation_id` (`fire_post_tool_hooks` in
  `apps/core/src/sidecar/mcp/mod.rs` builds its context without one), so per-conversation
  accumulation has no key.
- It fires from Core's MCP registry dispatch, which an ACP agent's own tools never reach —
  Claude and Codex run `Read`/`Edit`/`Bash` in their own process. The ledger would be
  empty for exactly the agents most people run.
- It is detached and per-call, so observing it means one Deno sandbox spawn per tool call.

If those change, a third hook can be added without touching anything else here.

`/recap` reads two sources and needs both: the stored per-turn recaps reach back past the
20-message hook window but only exist for turns long enough to have been recapped; the
visible transcript tail covers the short ones and anything typed since.
