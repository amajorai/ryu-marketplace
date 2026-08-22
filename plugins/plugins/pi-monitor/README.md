# Monitor
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="pi-monitor" width="96" />
  </picture>
</p>

Adds the `monitor` tool to the managed Pi agent, so the flagship `ryu` agent can
watch something in the background and react when it changes — the same idea as
Claude Code's `Monitor` tool, re-implemented from scratch against Pi's
extension API.

Ships one **Pi extension** (`contributes.pi_extensions`):
`pi-extensions/ryu-monitor.ts` registers the `monitor` tool on the managed `ryu`
(Pi) agent.

## What the tool does

A single `monitor` call watches one source and streams every line as it
arrives, then resolves when the watch ends:

- **Command** (`command`): runs a shell command (e.g. `timeout 60 npm run
  build`, `tail -f app.log`) and streams stdout+stderr line by line. Ends when
  the command exits.
- **WebSocket** (`ws.url`): connects to a `ws://`/`wss://` feed and emits each
  incoming message as one line. Ends when the socket closes.

Every watch ends when the source ends, when a line matches the optional `until`
regex, or when `timeout_ms` fires (default 5 minutes, clamped to
[1 s, 30 min]). While the watch runs, the turn is held open — the same contract
as Claude Code's `Monitor` — so bound every watch.

## How it differs from `pi-shell` (and why)

- `pi-shell`'s `bash_background` is for work the model wants to **check on
  later**: it returns instantly and is polled with `bash_output`.
- `monitor` is for work the model wants to **watch to its end**: it stays open
  and streams, because Pi's `onUpdate` only works while a tool call is live.

Pi cannot feed streamed lines back to the model mid-turn (Claude Code can), so
`monitor` adds an `until` regex: the watch stops the instant a line matches and
the result names that line. That is how "tail the log and flag errors *as they
appear*" works on Pi — the watch ends the moment the error appears, then the
model reports.

## Notes

- **Turn held open.** A forgotten watch blocks the conversation until its
  timeout, so the tool description tells the model to prefer bounded commands.
- **No child monitor.** Subagent children (`Task` from `pi-subagent`) do not get
  `monitor` — a child has no user to interrupt it, and a long watch inside a
  delegated job would hold the parent's turn open.
- **WebSocket needs a runtime global.** The ws source uses the global
  `WebSocket` (Node ≥ 21 or Bun) rather than a package, because Pi's extension
  loader resolves only node built-ins + the pi packages. It fails with a clear
  message if the runtime has no global.
- **Not registered as `bash`.** The tool is named `monitor`, deliberately —
  pi-acp special-cases the exact name `bash` into terminal rendering and drops
  `rawOutput`, so a background variant named `bash` would render empty.

## Installing / enabling

This is a built-in (Core-tier) plugin, so it ships compiled into Core. It is in
`CORE_DEFAULT_ON` and is seeded installed + enabled on a fresh install, like
`pi-shell` and `pi-subagent`. Toggling it takes effect in a **new chat** — Pi
reads its extensions at process start.
