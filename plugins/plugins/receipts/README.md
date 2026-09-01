# Receipts
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="receipts" width="96" />
  </picture>
</p>

`/receipt <goal>` is the visual sibling of [`/proof`](../proof). Both loop until an
independent verifier agent agrees the goal is done; they differ in what counts as
proof:

| | how it verifies | what you are left with |
| --- | --- | --- |
| `/goal` | a judge model reads the transcript | a verdict |
| `/proof` | a verifier agent re-reads the real workspace with its tools | a verdict |
| `/receipt` | a verifier agent opens a captured **screenshot or screen recording** and judges what is visible | a verdict **and an artifact on disk** |

So `/receipt` is the one to use when "it works" needs to be demonstrable after the
fact — a demo, a UI fix, a flow that has to be seen rather than asserted.

## How a round works

1. `/receipt <goal>` stores the goal and hands the agent a capture brief: do the
   work, capture the finished state, write the artifact to a **file on disk**, and
   end the reply with one `EVIDENCE: /absolute/path.png` line per artifact.
2. The `post_assistant_turn` hook pulls those lines out of the turn (bounded: at
   most 4 paths, 300 chars each, media extensions only).
3. No artifact ⇒ the loop re-asks rather than verifying. Only previously-rejected
   artifacts ⇒ rejected as a replay, without spending a verifier round.
4. Otherwise `host.runAgent` spawns an **independent** verifier with a clean
   context. It is told to open each artifact, judge only what is visible, and
   answer `no` when the file is missing, unreadable, stale, or shows a blank or
   errored screen. It ends with `EVIDENCE VERIFIED: yes|no - …`.
5. `yes` clears the goal and emits a receipt note listing the accepted artifacts.
   `no` forwards the verifier's findings and asks for a **new** capture.

## Why the artifact must be a file

The turn hook runs in Core's sandbox with no HTTP and no `callTool`, and
`ctx.transcript` carries text only. An inline image returned by a screenshot tool
is therefore invisible both to the hook (nothing to extract) and to the verifier
(no file to open) — hence the absolute-path contract.

Whether the verifier can literally *see* a PNG is the verifier agent's own
capability: `host.runAgent` with an `agent_id` runs the real chat path, where the
agent's own engine, tools and MCP take over and the permission preset is only
metadata (`workflow/delegation.rs`, `call_sub_agent`). The verifier is instructed
to answer `no` when it cannot open an artifact, so a vision-less agent fails
closed instead of rubber-stamping a filename.

## Capture routes

The brief deliberately names no single tool — it asks for whatever the node has: a
screenshot/recording MCP tool (`ghost`, `bytebot`, computer-use), the browser app's
`chromium.screenshot_tab`, the [Clips](../../../apps-store/clips) recorder
(`/api/clips/start` → `/api/clips/{id}/stop` → `/api/clips/{id}/file`),
`screencapture` on macOS, or `ffmpeg`.

## Settings

- **Required evidence** (`receipts-evidence-kind`) — `any` (default), `still`, or
  `recording`. Also narrows the accepted file extensions.
- **Maximum verification rounds** (`receipts-max-rounds`) — default 8, clamped to
  1–25. Separately, the loop gives up after 3 turns that produce no new artifact.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/loop.js`;
Core compiles both in from this package directory. Published to the grouped
`ryu-marketplace` via `tools/mirror-plugins.sh`.
