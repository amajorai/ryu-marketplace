# RTK (Rust Token Killer)

Token-compress noisy dev-command output for Ryu agents, powered by the
[RTK](https://github.com/rtk-ai/rtk) CLI. RTK wraps a dev command (e.g.
`rtk git status`, `rtk cargo test`) and returns a token-compressed version of its
output — 60–90% fewer tokens — so an agent spends far less context on noisy tool
output. Ships as a fully declarative plugin — one `command` tool-def in
`manifest.json`, no Core Rust.

## Tools

| Tool id           | Backend                        | Required args | Optional args      |
| ----------------- | ------------------------------ | ------------- | ------------------ |
| `rtk__run`   | `command` → local `rtk` binary | `command`     | `mode` (default `wrap`) |

The tool shells out to `rtk [mode] <command…>` under a 120s wall-clock timeout.
`command` is `shell_words`-split into a variadic argv (quotes honored, never a
shell — metacharacters stay literal), so `command: "git status"` runs `rtk git
status`. `mode` selects RTK's filter: `wrap` (default, contributes NO subcommand
token — the plain compressing filter), `proxy` (raw with tracking, no filtering),
`test` (keep only failures), `err` (keep only errors).

## Install

RTK is a local CLI, not a bundled binary. Install it and register its path on
Core's command allowlist:

```bash
brew install rtk-ai/rtk/rtk     # or: cargo install rtk
# then add it to Core's command-tool allowlist (KEY=abs-path):
export RYU_COMMAND_TOOL_ALLOWLIST="rtk=$(command -v rtk)"
```

Core resolves the `bin` allowlist KEY (`rtk`) to that absolute path at dispatch;
the manifest never names a filesystem path. Until the binary is present and
allowlisted, a call errors deterministically ("not in the command allowlist").

## Auto-wrap (settings)

The plugin also contributes an **RTK** settings tab that drives Ryu's per-agent
auto-wrap (Phase 2): toggles to install RTK's `PreToolUse` hook for the managed
Ryu (Pi) and Claude Code agents so their OWN shell commands are token-compressed
automatically, plus a list of commands to never wrap. That behavior is Core-side
logic (`rtk_config`), not part of the declarative tool.

## Security

`command` is exec'd as an argv array — never through `sh -c` / `cmd /C` — so shell
metacharacters are inert. Every call is grant-gated (`tool:command:rtk`) and runs
through the same Gateway budget + exec-approval scan the other command tools use;
the `run` verb also classifies risky, so Smart-mode approval gates it. Unlike a
crawler there is no `egress_url_arg` — RTK is a purely-local wrapper.

## Migration from the built-in Rust tool

This plugin replaces the former built-in `rtk` registry server
(`apps/core/src/sidecar/mcp/rtk.rs`). Behavioural deltas from that implementation:

- **Callable id** is now `rtk__run` (declarative tools live under the `app__`
  namespace), not the bare `rtk__run`. Agent allowlists or grants referencing
  `rtk__run` or the `rtk` server must migrate to `rtk__run` /
  `tool:command:rtk`.
- **Binary resolution** is now the command-tool allowlist
  (`RYU_COMMAND_TOOL_ALLOWLIST`, an absolute path), not PATH auto-detection or the
  `RYU_RTK_BIN` override. (The `RYU_RTK_BIN`/PATH detection lives on only for the
  separate Phase-2 auto-wrap in `rtk_config`.)
- **Output shape** is now `{exit_code, stdout, truncated}` (the generic `command`
  backend's envelope), not the former `{available, exit_code, output}`; stderr is
  no longer appended to stdout.
- The former `{available:false, …}` graceful degradation on a missing binary is
  dropped: an absent/unallowlisted binary now surfaces as a deterministic tool
  error rather than a soft `available:false` result.
