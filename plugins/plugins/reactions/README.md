# Message Reactions

Emoji reactions on chat messages, for people and for agents.

- **People** react through the `contributes.message_actions` declaration. The desktop shell supplies
  the native renderer (toolbar button, context-menu strip, and the corner badge on user bubbles) and
  Core-backed persistence. Enabling or disabling `@ryu/reactions` controls whether the reaction
  affordance and its realtime data path are active.
- **Agents** react with the `agents.react` tool (`tools/agents.react.js`, sealed into the manifest).
  With no `message_id`, Core reacts to the latest user message in the agent's current conversation,
  which is the "👍 instead of 'Got it'" acknowledgement. With an id, the agent can react to an
  earlier message or to another agent's message. Core's bridge binds the conversation and the
  `agent:<id>` actor from the dispatch context; the model supplies only the id and the emoji.
- **Channel bots** mirror the agent's reaction onto the provider message that started the turn.
  `POST /api/channels/run` returns it as `agentReactions`, and the Gateway's `finish_reactions`
  (`crates/gateway/channels/src/lib.rs`) swaps the working 👀 for it.

The tool lives here rather than in Switchboard (`@ryu/agent-comms`) because this plugin is
pre-installed and has no per-turn hook, so every agent can react without enabling the mailbox.

## Working on it

```bash
node tools/toolsmith/index.mjs sync   plugins-store/plugins/reactions   # after editing tools/agents.react.js
node tools/toolsmith/index.mjs verify plugins-store/plugins/reactions
node --test plugins-store/plugins/reactions/plugin.test.mjs
```

Core-side proofs: `apps/core/src/plugin_host/agent_react_runtime_test.rs` (sandbox → bridge →
SQLite/room) and `apps/core/src/sidecar/mcp/agent_react_registry_runtime_test.rs` (registry
dispatch).
