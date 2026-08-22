# Background Bash
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="pi-shell" width="96" />
  </picture>
</p>

Adds bash_background / bash_output / bash_kill to the managed Pi agent, so a
long-running command does not hold the turn open.

Ships one **Pi extension** (`contributes.pi_extensions`): `pi-extensions/ryu-shell.ts`
adds `bash_background` / `bash_output` / `bash_kill` to the managed `ryu` (Pi) agent,
so starting a dev server no longer holds the turn open for its whole lifetime.

Starting, polling, and manually stopping a shell render as ordinary chat tool
transactions. When a shell exits on its own, fails to spawn, or reaches its
lifetime cap, the extension also sends a lifecycle message to the parent agent
and triggers a follow-up turn. The agent then collects the final output through
`bash_output`, so a background completion cannot silently disappear between
turns.

The extension deliberately does NOT replace Pi's built-in `bash`, and none of its three
tool names may ever be `bash`: pi-acp special-cases that exact name and would hijack the
call into terminal rendering, dropping `rawOutput` entirely.

**Session restarts are honest.** Every spawn, finish and release is written to a durable
per-project ledger (`ryu-background-shells.json` in the Pi session directory). If the Pi
process dies while a shell is running, the next session is told — "N background shell(s)
from the previous session have no completion record … they have been marked stopped" —
so the agent re-verifies (is the port still bound?) instead of assuming its server is
still up. This mirrors Claude Code's background-task restart warning.

The TypeScript is loaded by the Pi process itself, unsandboxed, so Core gates the
contribution: Core-tier is auto-allowed, anything else needs the operator-only
`pi:extension` grant. The file reaches the agent through
`pi_config::app_extensions`, which writes it into `~/.ryu/pi-agent/extensions/` and
deletes it again when the plugin is disabled. **Toggling takes effect in a new chat** —
Pi reads its extensions at process start.
