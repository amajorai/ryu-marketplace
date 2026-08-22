# Switchboard (`@ryu/agent-comms`)
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="agent-comms" width="96" />
  </picture>
</p>

The agents on this node can message each other.

Any agent can look up who else is here or leave one of them a message. "Tell the
deploy agent I'm done" is a message that is actually waiting for it next time it
runs; the recipient is never started synchronously by this plugin.

It ships as ordinary registry tools, not as one runtime's private feature, so
**every** agent gets it: the flagship agent (through its MCP extension), an ACP
agent like Claude Code or Codex (through Core's in-process plugin dispatch), and
the gateway plane's tool loop.

## The tools

| Tool | What it does |
| --- | --- |
| `agents.directory` | The other agents on this node: id, name, what each is for. Auto-discovery — call it when the user names an agent loosely, or to find out who is better placed to answer. |
| `agents.send` | Leave a message in another agent's inbox and carry on. Delivered at the start of the recipient's next turn. |
| `agents.thread` | What you and another agent have already said to each other, or the list of agents you have a thread with. |

Messages are deliberately asynchronous. `send` leaves a bounded handover in the
recipient's inbox and costs nothing but a KV write; the recipient reads it at the
start of its next turn. There is no tool in this plugin that starts another
agent run or waits on another agent.

## How a message is delivered

Writes and reads use different seams, and the split is the security posture:

- A **tool writes.** The sender is `caller.agent_id` (resolved by Core's dispatch),
  so an agent cannot post as another one by naming it in its arguments.
- The **`pre_user_turn` hook reads.** `ctx.agent_id` is the only place "whose mail
  is this" is answered by Core rather than by a model, so the hook is the sole
  reader of an inbox. There is deliberately no tool argument for reading someone
  else's mailbox; a spoofable read is a different class of mistake from a forged
  signature inside a message body.

The hook injects whatever arrived as additional context at the start of the
recipient's next turn, clears the inbox (delivered once), and tells the agent that
a peer is not its operator — a message is data, not an instruction that outranks
the user.

## What bounds it

Agents spending each other's budget is the failure mode, so three independent
stops:

1. **Hop limit (2).** Hop 1 is a user-initiated message; hop 2 is the one relay it
   may cause. The count travels on the message and is re-read from the
   conversation that received it (or, inside a delegated run, from an
   agent-scoped key, because a delegated peer has no conversation of its own).
2. **No synchronous delegation.** This plugin only queues a bounded mailbox
   message. It cannot start another agent run, wait on another model, or spend a
   peer's tool budget.
3. **No self-addressing.** An agent asking itself is thinking; it does not need a
   tool.

Hop-limit refusals come back as `{ok:false, refused:"hop_limit"}` — a result the
model can act on, not an error it has to interpret.

## Known limits (v1)

- **Delivery is next-turn, not live.** Nothing wakes an idle agent; a queued
  message sits until that agent runs again.
- **The inbox is per-agent, not per-conversation.** An agent with several open
  chats reads its mail in whichever one runs next.
- **The delivery hook has no `match` pre-gate**, so it costs one KV read and a
  sandbox spawn per turn. That is why the plugin is pre-installed but **off** by
  default; enable it from the Store.
- **A message to an agent id that does not exist looks like a success.** The
  sandbox cannot check the roster (the tools have no network), so `agents.send`
  returns `ok:true` and the message waits in an inbox nobody reads. Pair `send`
  with `agents.directory` when the id came
  from a guess rather than from the user.
- **`agents.directory` is unavailable on an org-bound node.** It reads Core's own
  `GET /api/agents` over loopback with the node token, and `enforce_permission`
  refuses a caller with no user principal once the node is bound to an
  organisation — correctly, since the node token is not a person. The tool is
  `fail_open`, so the model gets an `available:false` envelope instead of an
  error, and `agents.send` still works against an agent id the user names.
  Closing this properly means a user-principal-scoped roster read, not
  a wider token.

## Desktop conversation UI

The desktop transcript renders `agents.send` as agent activity, so the handover
remains readable in a restored workspace tab.

In Bot mode, direct conversations appear as expandable threads under their
bot. The branch action on a message creates a new conversation and the sidebar
marks it as a branch under that bot. Conversations whose summary contains more
than one participant are grouped into a Group chat with a circular participant
avatar mark and expandable child threads. Sidebar page-size and overflow
controls apply to both bot threads and group-chat threads.

## Files

| Path | What |
| --- | --- |
| `manifest.json` | The three tools, the two hooks, and the grants (`tool:execute`, `storage:kv`, `tool:http-egress:127.0.0.1`). |
| `tools/*.js` | The `inline_deno` tool bodies — the SOURCE form. Sealed into the manifest's `code` strings. |
| `hooks/deliver.js` | `pre_user_turn` — delivers the inbox. |
| `hooks/directory.js` | `tool_result` — projects `agents.directory` down to id/name/description, so no other agent's `system_prompt` ever reaches the transcript. |
| `seal.mjs` | Seals `tools/*.js` into the manifest (`--check` verifies). |

## Working on it

```bash
node plugins-store/plugins/agent-comms/seal.mjs           # after editing any tools/*.js
node plugins-store/plugins/agent-comms/seal.mjs --check   # verify, non-zero on drift
node --test plugins-store/plugins/agent-comms/plugin.test.mjs
```

`plugin.test.mjs` runs the real bodies through the same splice Core uses
(`input`/`caller`/`host` for a tool, `ctx`/`host` for a hook) against an in-memory
KV, and fails on an unsealed edit. The two Core-side registration rows
(`plugin_manifest::BUILTIN_MANIFESTS` and `plugin_manifest::builtin_code`) are
covered by `cargo test -p ryu-core --bin ryu-core -- builtin_code_table_matches_package_manifests`.
