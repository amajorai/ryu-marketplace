# Polite Prompts
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="polite-prompts" width="96" />
  </picture>
</p>

Notices when a message is written in anger (insults, profanity aimed at the agent,
shouting) and has a side model rewrite it into a calm, respectful prompt before it is
sent. The request, every concrete detail, every code block and the urgency are kept;
only the abuse is dropped. `/polite <message>` rewrites one message on demand.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/rewrite.js`;
Core compiles both in from this package directory. Published to the grouped
`ryu-marketplace` via `tools/mirror-plugins.sh`.

Community-tier and **opt-in**: it is in `CORE_PLUGINS` but deliberately not in
`CORE_PREINSTALLED`. The hook cannot be `match`-gated (the pre-gate grammar has no "this
message is hostile"), so it costs a sandbox spawn per user turn, and a flagged message
costs a side-model call on top.

## The hook

| Hook | Phase | Fires |
| --- | --- | --- |
| `polite-prompts.rewrite` | `pre_user_turn` | Every turn. Returns before any host call unless the message starts with `/polite` or (with the setting on) the prose matches a hostility pattern or is shouted in capitals. |

It returns `replace`, so the rewritten text is what the model sees and what is
persisted. Core streams a note with the rewritten prompt, so the user always sees what
was sent on their behalf.

## Detection and the side model

The regex sweep is a cost gate, not the decision. Fenced code, inline code and `>`
quoted lines are removed before matching, so a stack trace or a pasted log that contains
rude words does not trigger it. When the gate fires, the side model either rewrites the
message or answers `UNCHANGED` (for example "kill the stale process"), in which case the
original is sent untouched.

## Fail-open guards

The original message is sent, unchanged, when:

- the side model throws or returns nothing;
- the rewrite is identical to the message;
- any fenced code block from the message is missing from the rewrite;
- the rewrite is far longer than the message (the model answered it instead).

For `/polite`, the same failures send the message without the `/polite` prefix.
`/polite` with no message is answered with a usage line and no model call.

## Settings

| Key | Default | Effect |
| --- | --- | --- |
| `polite-prompts-auto` | `true` | Rewrite flagged messages automatically. Off leaves `/polite` only. |
| `polite-prompts-model` | empty | Rewrite model. Empty uses the local engine or the node default. |

## Interaction with Auto-Expand

Core applies at most one `replace` per turn. When Auto-Expand is also on, whichever
`pre_user_turn` hook answers first wins for that message.

## Tests

```sh
node --test plugins-store/plugins/polite-prompts/plugin.test.mjs
```
