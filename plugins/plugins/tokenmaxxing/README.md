# Tokenmaxxing
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="tokenmaxxing" width="96" />
  </picture>
</p>

An opt-in notification for when every agent you delegated work to has finished.

Delegate a fan-out of agents, step away, and get one notification when the last of
them completes, instead of polling the run.

## How it works

The plugin contributes one turn hook, `tokenmaxxing.delegation-complete`, on the
`delegation_lifecycle` phase. Its body (`hooks/delegation-complete.js`) is a flat
sandboxed fragment that Core runs with only `ctx` and the grant-gated `host`
facade:

- It tracks state **per fan-out run**, keyed by run id in plugin KV storage, so
  overlapping runs never suppress or trigger one another.
- Lifecycle events carry a monotonic transition id; a stale or duplicate
  delivery is ignored.
- It notifies exactly once, when the run's delegate count reaches zero. Core
  counts every delegate the fan-out queued, including ones still waiting for a
  concurrency slot, so a fan-out wider than its concurrency limit notifies only
  after its last delegate finishes.
- If sending the notification fails (for example, notifications are not
  permitted), it restores the previous state so a repeated delivery can retry.
  The hook never fails the delegation itself.

The hook always returns `{ kind: "none" }`: it observes delegation, it never
changes it.

## Permissions

| Grant                | Why                                          |
| -------------------- | -------------------------------------------- |
| `notifications:send` | Send the "Delegated agents finished" notice. |
| `storage:kv`         | Remember each run's last seen transition.    |

## Status

Experimental and opt-in.
