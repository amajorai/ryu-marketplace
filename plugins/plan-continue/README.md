# Plan Continue
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="plan-continue" width="96" />
  </picture>
</p>

While plan mode is on and the plan has not been accepted, this keeps the agent
working: when a turn finishes, the plugin injects a follow-up turn asking it to
carry on planning, so a plan does not stall waiting for the user to type
"continue".

Declarative Ryu plugin (no UI, no Core Rust). Definition lives in
`manifest.json`, its sandboxed hook body in `hooks/loop.js`; Core compiles both
in from this package directory. Published to the grouped `ryu-marketplace` via
`tools/mirror-plugins.sh`.

## When it fires

Only when `ryu.plan` — the composer's plan-mode pill — is on for the turn. That
flag is also the completeness signal: an approved `ExitPlanMode` writes it back
off, so the hook stops on its own the moment the plan is accepted. There is no
judge model in the loop.

## What bounds it

Two hard stops, because a self-prompt loop with no exit spends the user's tokens
while they are not watching:

- **At most 3 consecutive auto-continuations per user message.** The streak is
  counted from the transcript (the injected rows carry an `[auto-continue]`
  marker), so anything the user actually types resets it.
- **No progress.** If the last two non-empty assistant replies are byte
  identical, the model is restating itself and the loop stops.

`plugin_host::MAX_CONTINUE_TURNS` (25) is the server's backstop for a whole
request, not this plugin's budget.

## Turning it off

- Disable or uninstall **Plan Continue** in the Store — the ordinary per-feature
  switch, and the only one that survives across chats.
- Turn the plan-mode pill off in the composer.
- `/plan-continue off` in a chat, to stop it for that conversation only.
  `/plan-continue on` re-arms it.

## Telling it from a real user message

Every injected message opens with `[auto-continue] Ryu generated this message;
the user did not type it.` A `continue` directive is persisted as an ordinary
user row, so that line is currently the only thing distinguishing it on reload.
Rendering it as its own kind of row is a desktop follow-up.
