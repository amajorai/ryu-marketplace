# Chat Title
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="chat-title" width="96" />
  </picture>
</p>

Auto-renames a chat as soon as the first reply lands, then again after every N completed assistant turns (default 5), using a side model — and keeps a Core-side history of the names it chose so you can see how a conversation drifted. Enablement, the first-turn rename, frequency, and the model to use are all settings.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/rename.js`; Core compiles both in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.

## What is a plugin here and what is not

The **default** chat title is not this plugin's. Core cuts it from the first user
message when it persists the turn (`derive_title` in
`apps/core/src/server/conversations.rs`, first line capped at 60 chars), and the
desktop applies the same rule locally so the sidebar shows it the instant you
hit send. Disable this plugin and chats still read as their opening line — they
just never get a model-written name.

What the plugin owns is the rename **on top** of that:

| Setting | Default | Effect |
| --- | --- | --- |
| `auto-title-enabled` | on | Master toggle. Off keeps the first-message title. |
| `auto-title-on-first-turn` | on | Rename once the first reply lands. |
| `auto-title-every-n` | 5 | Re-title every N completed assistant turns. |
| `auto-title-model` | — | Side model. Empty = node default, else local engine. |

With the defaults that means renames at turn 1, 5, 10, … Turning the first-turn
toggle off restores the pure every-N cadence.
