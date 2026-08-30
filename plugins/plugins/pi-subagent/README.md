# Subagents
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="pi-subagent" width="96" />
  </picture>
</p>

Adds the Task tool to the managed Pi agent, so it can delegate a bounded,
context-isolated job to a child agent.

Ships one **Pi extension** (`contributes.pi_extensions`): `pi-extensions/ryu-subagent.ts`
registers a tool named exactly `Task` on the managed `ryu` (Pi) agent, so it can delegate
a bounded, context-isolated job to a child agent the way every other ACP agent Ryu drives
already can. The name is load-bearing: it is what lands the call on the desktop's existing
subagent card and Cowork rail with zero client changes.

Each spawned child is also emitted as a nested `Agent` lifecycle transaction.
That includes every child in a parallel fan-out: it appears when the process is
spawned, stays running while the child works, and closes as completed or failed.
The parent agent still receives the final result through the enclosing `Task`,
so completion both updates the chat activity and continues the parent turn.

An absent config is NOT a no-op here — the extension carries a built-in agent set and the
optional `extensions/ryu-subagents.json` only overrides it.

The plugin registers a node setting named **Default subagent model**. It is unset
by default, so the main agent may choose a model for each `Task`; if it does not,
the child inherits Pi's managed default. Pick a model to force every child
spawned by `Task` to use it. The node setting wins over both the model requested
by the main agent and persona-specific models in `ryu-subagents.json`.

The TypeScript is loaded by the Pi process itself, unsandboxed, so Core gates the
contribution: Core-tier is auto-allowed, anything else needs the operator-only
`pi:extension` grant. The file reaches the agent through
`pi_config::app_extensions`, which writes it into `~/.ryu/pi-agent/extensions/` and
deletes it again when the plugin is disabled. **Toggling takes effect in a new chat** —
Pi reads its extensions at process start.
