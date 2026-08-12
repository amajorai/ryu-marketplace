# Switchboard (`@ryu/agent-comms`)

The agents on this node can message each other.

Any agent can look up who else is here, leave one of them a message, or ask one a
question and wait for its answer. "Ask the research agent what it found" becomes a
real message to a real agent instead of a guess, and "tell the deploy agent I'm
done" is a message that is actually waiting for it next time it runs.

It ships as ordinary registry tools, not as one runtime's private feature, so
**every** agent gets it: the flagship agent (through its MCP extension), an ACP
agent like Claude Code or Codex (through Core's in-process `mcp_bridge`), and the
gateway plane's tool loop.

## The tools

| Tool | What it does |
| --- | --- |
| `agents__directory` | The other agents on this node: id, name, what each is for. Auto-discovery — call it when the user names an agent loosely, or to find out who is better placed to answer. |
| `agents__send` | Leave a message in another agent's inbox and carry on. Delivered at the start of the recipient's next turn. |
| `agents__ask` | Ask an agent a question and wait. It runs now, in a clean context, and its reply is the tool's result. |
| `agents__thread` | What you and another agent have already said to each other, or the list of agents you have a thread with. |

Two paths, on purpose. `ask` is for an answer that changes what you do next and
costs a full agent run; `send` is a handover that does not need answering now and
costs nothing but a KV write.

## How a message is delivered

Writes and reads use different seams, and the split is the security posture:

- A **tool writes.** The sender is `caller.agent_id` — resolved by Core's dispatch
  — so an agent cannot post as another one by naming it in its arguments.
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
2. **Cycle guard.** `ask` marks BOTH ends busy for the duration, so A→B→A is
   refused rather than deadlocked with two model budgets burning. A marker
   records who wrote it, and is released only by the ask that claimed it — so a
   nested ask cannot free the outer one's. Recovery from a process that dies
   mid-ask has two paths: the owner clears its own marker on its next attempt
   (immediate), and a marker left by a *different* agent expires by distance in
   the attempt counter, which every ask advances including a refused one. The
   sandbox has no clock, so counted attempts are the only aging available.
3. **No self-addressing.** An agent asking itself is thinking; it does not need a
   tool.

Refusals come back as `{ok:false, refused:"hop_limit"|"cycle"}` — a result the
model can act on, not an error it has to interpret.

## Known limits (v1)

- **Delivery is next-turn, not live.** Nothing wakes an idle agent; a queued
  message sits until that agent runs again. `agents__ask` is the synchronous path.
- **The inbox is per-agent, not per-conversation.** An agent with several open
  chats reads its mail in whichever one runs next.
- **`agents__ask` runs the peer with a clean context.** It sees the pair's message
  history (carried in explicitly) and nothing else — not the asker's conversation.
- **The delivery hook has no `match` pre-gate**, so it costs one KV read and a
  sandbox spawn per turn. That is why the plugin is pre-installed but **off** by
  default; enable it from the Store.
- **A message to an agent id that does not exist looks like a success.** The
  sandbox cannot check the roster (the tools have no network), so `agents__send`
  returns `ok:true` and the message waits in an inbox nobody reads. `agents__ask`
  does surface it, because the delegation engine reports the unknown agent back
  as a failure to answer. Pair `send` with `agents__directory` when the id came
  from a guess rather than from the user.
- **`agents__directory` is unavailable on an org-bound node.** It reads Core's own
  `GET /api/agents` over loopback with the node token, and `enforce_permission`
  refuses a caller with no user principal once the node is bound to an
  organisation — correctly, since the node token is not a person. The tool is
  `fail_open`, so the model gets an `available:false` envelope instead of an
  error, and `agents__send` / `agents__ask` still work against an agent id the
  user names. Closing this properly means a user-principal-scoped roster read, not
  a wider token.

## Files

| Path | What |
| --- | --- |
| `manifest.json` | The four tools, the two hooks, and the grants (`tool:execute`, `storage:kv`, `hook:run-agent`, `tool:http-egress:127.0.0.1`). |
| `tools/*.js` | The `inline_deno` tool bodies — the SOURCE form. Sealed into the manifest's `code` strings. |
| `hooks/deliver.js` | `pre_user_turn` — delivers the inbox. |
| `hooks/directory.js` | `tool_result` — projects `agents__directory` down to id/name/description, so no other agent's `system_prompt` ever reaches the transcript. |
| `seal.mjs` | Seals `tools/*.js` into the manifest (`--check` verifies). |

## Working on it

```bash
node plugins-store/agent-comms/seal.mjs           # after editing any tools/*.js
node plugins-store/agent-comms/seal.mjs --check   # verify, non-zero on drift
node --test plugins-store/agent-comms/plugin.test.mjs
```

`plugin.test.mjs` runs the real bodies through the same splice Core uses
(`input`/`caller`/`host` for a tool, `ctx`/`host` for a hook) against an in-memory
KV, and fails on an unsealed edit. The two Core-side registration rows —
`plugin_manifest::BUILTIN_MANIFESTS` and `plugin_manifest::builtin_code` — are
covered by `cargo test -p ryu-core --bin ryu-core -- builtin_code_table_matches_package_manifests`.
