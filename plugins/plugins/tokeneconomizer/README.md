# TokenEconomizer
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="tokeneconomizer" width="96" />
  </picture>
</p>

Runs your own [TokenEconomizer](https://github.com/microsoft/TokenEconomizer) install inside
Ryu's managed Pi agent (the flagship `ryu` agent). TokenEconomizer is a research plugin from
Microsoft Research and UC Berkeley. It learns from the sessions an agent has already run in a
repository and uses that to cut waste in later sessions:

- **Micro-skills** learn facts about the repository (for example, "run tests with
  `python -m pytest`") and add the confirmed ones at session start.
- **The loop guard** asks a judge model whether a turn that keeps hitting the same failures is
  stuck, and if so sends the agent one redirect.
- **Tool pruning** does nothing on Pi, which loads only a few tools of its own.

This plugin is the bridge, not TokenEconomizer itself. It ships one Pi extension
(`pi-extensions/ryu-tokeneconomizer.ts`, adapted from TokenEconomizer's Apache-2.0 Pi adapter)
that sends Pi's session, prompt, tool-result and turn-end events to TokenEconomizer's own
dispatcher and applies its answers.

## Setup

1. Install Python 3.10 or newer and clone TokenEconomizer:

   ```bash
   git clone https://github.com/microsoft/TokenEconomizer.git
   ```

2. Enable the plugin, open its **TokenEconomizer** settings tab, and enter the clone's absolute
   path (the clone root or its `plugin/` folder).
3. Start a new chat. Pi loads extensions when its process starts, so open chats keep running
   without it.

Core checks that the folder contains `plugin/scripts/te-hook`, then writes
`tokeneconomizer.json` into the managed Pi config dir with the plugin folder, the managed Pi
CLI path and the mechanism settings. Clearing the folder removes that file. The extension reads
it at start-up; with no file, or a broken install, every event answers "no change".

## Settings

| Setting | Values | Effect |
| --- | --- | --- |
| TokenEconomizer folder | absolute path, or empty | Empty turns the bridge off |
| Micro-skills | default, off, envfacts, on | Passed as `TE_MICROSKILLS`; `envfacts` learns only from repeated failures and makes no model calls |
| Loop guard | default, on, off | Passed as `TE_LOOPGUARD` |

`default` leaves the mechanism to TokenEconomizer's own config (`te config`). The overrides
apply only to Ryu's managed Pi, not to TokenEconomizer running in other agents.

## Model calls and data

TokenEconomizer's judge and fact proposer run as `pi --print` side calls. The bridge points
them at Ryu's managed Pi (`TE_PI_CLI`) and they inherit the agent's `PI_CODING_AGENT_DIR`, so
they use the same model routing and sign-ins as the agent. What TokenEconomizer learns stays in
its own state folder (`$TOKENECONOMIZER_HOME`, default `~/.tokeneconomizer`), shared with any
other agent you run it in. Inspect it from a terminal:

```bash
~/.tokeneconomizer/bin/te --host pi status
```

## Scope

- Only the managed agent dir gets the pointer file. Agents with limited model access and
  sub-agents started by `pi-subagent` run without TokenEconomizer.
- Upstream's `/te` slash command is not ported: an extension command breaks the ACP prompt
  loop. Run `te` from a terminal.
- Claude Code: install TokenEconomizer's own Claude Code plugin by following its README. This
  plugin does not change Claude Code's configuration.
- Ryu makes no claim about how much this saves. TokenEconomizer's published numbers come from
  its authors' benchmarks.

## Security

The extension is unsandboxed TypeScript running in the Pi process, so the plugin is Core-tier.
It runs the dispatcher from the folder you named, as an argv array with no shell. It skips
TokenEconomizer's own side calls (`TE_SIDECALL`), honours `TE_DISABLE=1`, and never reads
credentials.
