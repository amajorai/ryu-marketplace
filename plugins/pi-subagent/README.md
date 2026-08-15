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

An absent config is NOT a no-op here — the extension carries a built-in agent set and the
optional `extensions/ryu-subagents.json` only overrides it.

The TypeScript is loaded by the Pi process itself, unsandboxed, so Core gates the
contribution: Core-tier is auto-allowed, anything else needs the operator-only
`pi:extension` grant. The file reaches the agent through
`pi_config::app_extensions`, which writes it into `~/.ryu/pi-agent/extensions/` and
deletes it again when the plugin is disabled. **Toggling takes effect in a new chat** —
Pi reads its extensions at process start.
