# Spider

Web crawling and content extraction for Ryu agents, powered by the
[Spider](https://spider.cloud) crawler (`spider-rs/spider`). Ships as a fully
declarative plugin — one `command` tool-def in `manifest.json`, no Core Rust.

## Tools

| Tool id              | Backend                          | Required args          |
| -------------------- | -------------------------------- | ---------------------- |
| `spider__crawl` | `command` → local `spider` binary | `url`, `depth`, `limit` |

The tool shells out to `spider crawl --depth <n> --limit <n> --output json -- <url>`
under a 120s wall-clock timeout and returns the crawler's parsed JSON. `depth`
(0–10, recommended 1) controls how many link hops are followed; `limit` (1–500,
recommended 10) caps the number of pages.

## Install

Spider is a local CLI, not a bundled binary. Install it and register its path on
Core's command allowlist:

```bash
cargo install spider_cli            # builds the `spider` binary
# then add it to Core's command-tool allowlist (KEY=abs-path):
export RYU_COMMAND_TOOL_ALLOWLIST="spider=$HOME/.cargo/bin/spider"
```

Core resolves the `bin` allowlist KEY (`spider`) to that absolute path at
dispatch; the manifest never names a filesystem path. Until the binary is present
and allowlisted, a call errors deterministically ("not in the command allowlist").

## Security

The `url` argument is SSRF-screened **before** the crawler spawns
(`egress_url_arg: "url"`): non-http(s) schemes and internal destinations
(loopback / RFC1918 / link-local / `169.254.169.254` metadata / ULA / CGNAT) are
rejected — the same guard the `http` tool backend applies. Tune with
`RYU_AGENT_EGRESS_SSRF_GUARD` / `RYU_AGENT_EGRESS_ALLOW_HOSTS`. The `--` argv
terminator prevents flag smuggling, and interpolated values may not begin with
`-`.

## Migration from the built-in Rust tool

This plugin replaces the former built-in `spider` registry server
(`apps/core/src/sidecar/mcp/spider.rs`) and its downloader/sidecar plumbing.
Behavioural deltas from that implementation:

- **Callable id** is now `spider__crawl` (declarative tools live under the
  `app__` namespace), not the bare `spider__crawl`. Agent allowlists or grants
  referencing `spider__crawl` or the `mcp:spider` grant must migrate to
  `spider__crawl` / `tool:command:spider`. (Core's monitors host callback is
  updated accordingly.)
- **`depth`/`limit` are now required** — the declarative `command` backend does
  no default-filling or server-side clamping, so both are always supplied by the
  caller. The schema `minimum`/`maximum` remain advisory.
- The Rust `{available:false, …}` graceful-degradation on a missing/failing
  binary is dropped: an absent binary or a non-JSON/failed crawl now surfaces as
  a deterministic tool error rather than a soft `available:false` result.
