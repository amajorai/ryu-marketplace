# Auto Continue
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="auto-continue" width="96" />
  </picture>
</p>

After each turn while armed, a **local sub-agent** scans the reply and the real
workspace and judges whether the work is genuinely finished — or whether there is
concrete unfinished work another turn could complete right now. If there is, the
plugin injects a follow-up turn automatically, so a task never stalls waiting for
you to type "continue".

Declarative Ryu plugin (no UI, no Core Rust). Definition lives in
`manifest.json`, its sandboxed hook body in `hooks/loop.js`; Core compiles both
in from this package directory.

## How it decides

The judge is `host.runAgent` — the same "proof of work" primitive the `proof`
plugin builds on. Unlike a transcript-only side model, the scanner sub-agent is
granted **read-only** tools (`code_read` preset), so "I fixed it" is checked
against the actual workspace: does the file exist, does the test pass, is the
TODO the assistant promised still there.

It returns one of three verdicts:

- **DONE** — the work is genuinely complete. Stop quietly. It will not invent
  busywork just to keep a turn going.
- **CONTINUE** — there is specific, actionable unfinished work another turn can
  complete now (a failing test, a half-written file, an unimplemented step). The
  plugin injects a follow-up turn carrying exactly that finding.
- **BLOCKED** — work remains but proceeding requires the user (a decision, more
  input, credentials) or an external dependency. Stop quietly; a blocked task is
  never forced to continue.

## What bounds it

Three hard stops, because a self-prompt loop with no exit spends the user's
tokens while they are not watching:

- **At most 5 consecutive auto-continuations per user message.** The streak is
  counted from the transcript (the injected rows carry an `[auto-continue]`
  marker), so anything the user actually types resets it.
- **No progress.** If the last two non-empty assistant replies are byte
  identical, the model is restating itself and the loop stops.
- **The verdict itself.** Only an explicit `CONTINUE` verdict continues; `DONE`,
  `BLOCKED`, or a scanner that fails to return a verdict all stop.

`plugin_host::MAX_CONTINUE_TURNS` (25) is the server's backstop for a whole
request, not this plugin's budget.

## Arming it

The loop is **off by default** and per-conversation:

- `/auto-continue on` — arm it for this chat.
- `/auto-continue off` — stop it for this chat.

You can also disable or uninstall **Auto Continue** in the Store, the ordinary
per-feature switch that survives across chats.

## Telling it from a real user message

Every injected message opens with `[auto-continue] Ryu generated this message;
the user did not type it.` A `continue` directive is persisted as an ordinary
user row, so that line is currently the only thing distinguishing it on reload.
Rendering it as its own kind of row is a desktop follow-up.
