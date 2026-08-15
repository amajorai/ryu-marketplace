# Background Bash
<p align="center"><img src="./icon.png" alt="pi-shell" width="96" /></p>

Adds bash_background / bash_output / bash_kill to the managed Pi agent, so a
long-running command does not hold the turn open.

Ships one **Pi extension** (`contributes.pi_extensions`): `pi-extensions/ryu-shell.ts`
adds `bash_background` / `bash_output` / `bash_kill` to the managed `ryu` (Pi) agent,
so starting a dev server no longer holds the turn open for its whole lifetime.

The extension deliberately does NOT replace Pi's built-in `bash`, and none of its three
tool names may ever be `bash`: pi-acp special-cases that exact name and would hijack the
call into terminal rendering, dropping `rawOutput` entirely.

The TypeScript is loaded by the Pi process itself, unsandboxed, so Core gates the
contribution: Core-tier is auto-allowed, anything else needs the operator-only
`pi:extension` grant. The file reaches the agent through
`pi_config::app_extensions`, which writes it into `~/.ryu/pi-agent/extensions/` and
deletes it again when the plugin is disabled. **Toggling takes effect in a new chat** —
Pi reads its extensions at process start.
