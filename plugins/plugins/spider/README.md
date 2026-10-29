# Spider
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="spider" width="96" />
  </picture>
</p>

Web crawling and content extraction for Ryu agents, powered by the
[Spider](https://spider.cloud) crawler (`spider-rs/spider`). Ships as a fully
declarative plugin — one `command` tool-def in `manifest.json`, no Core Rust.

## Tools

| Tool id              | Backend                          | Required args          |
| -------------------- | -------------------------------- | ---------------------- |
| `spider.crawl` | `command` → local `spider` binary | `url`, `depth`, `limit` |

The manifest declares `spider crawl --depth <n> --limit <n> --output json -- <url>`
with a 120s wall-clock timeout and JSON output. Both `web.crawl` and
`web.extract` route to this same command. Core screens the URL argument before the
CLI starts and runs the CLI behind a per-call egress proxy (see Security). `depth`
(0–10, recommended 1) controls how many link hops are followed; `limit` (1–500,
recommended 10) caps the number of pages.

## Install

Spider is a local CLI, not a bundled binary. Install the pinned version and
register its path on Core's command allowlist:

```bash
cargo install spider_cli --version 2.53.9 --locked   # builds the `spider` binary
# then add it to Core's command-tool allowlist (KEY=abs-path):
export RYU_COMMAND_TOOL_ALLOWLIST="spider=$HOME/.cargo/bin/spider"
```

The manifest names the allowlist key `spider`, never a filesystem path.

**Why the pin.** Core's per-call egress proxy (see Security) only mediates a
client that honours `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`. That behaviour was
verified for `spider_cli` 2.53.9 (`apps/core/src/tool_exec/egress_broker.rs`);
an unpinned `cargo install` may pull a release whose HTTP stack bypasses the
proxy. The manifest therefore declares a `bin_version` requirement
(`=2.53.9`, probed with `spider --version`, which prints `spider_cli 2.53.9`).
Before every call Core runs that probe against the allowlisted binary (cached
per binary path, size and modification time) and refuses the call, naming the
installed version and this install command, when the version is missing,
unparsable or anything other than 2.53.9. Re-verify proxy handling before
moving the pin, then update the manifest requirement and this command together.

## Security

The command grant is checked first. The declared `egress_url_arg: "url"` then
makes Core screen the URL argument (http/https only; internal hostnames and
private, loopback, link-local, metadata, ULA and CGNAT addresses refused; ports
80/443 only) before the CLI starts. Core then starts a loopback forward proxy for
that one call and points the CLI at it through `HTTP_PROXY`, `HTTPS_PROXY` and
`ALL_PROXY` (with `NO_PROXY` removed). The proxy requires a random per-call
credential, re-screens every connection the crawler opens (redirects, crawled
links, robots.txt) with the same rules, connects only to the address it
validated (no DNS rebinding), caps concurrent connections, and stops when the CLI
exits or the tool times out. The Spider CLI's HTTP stack (reqwest with system
proxy support) honours these variables; the `--headless` browser mode is not used.
`RYU_AGENT_EGRESS_ALLOW_HOSTS` `host:port` entries are the only exemption, and
`RYU_AGENT_EGRESS_SSRF_GUARD=0` disables address screening. The declared `--` argv
terminator and Core's interpolation guard prevent URL values being interpreted as
flags.

## Migration from the built-in Rust tool

This plugin replaces the former built-in `spider` registry server
(`apps/core/src/sidecar/mcp/spider.rs`) and its downloader/sidecar plumbing.
Behavioural deltas from that implementation:

- **Callable id** is now `spider.crawl` (declarative tools live under the
  `app.` namespace), not the bare `spider.crawl`. Agent allowlists or grants
  referencing `spider.crawl` or the `mcp:spider` grant must migrate to
  `spider.crawl` / `tool:command:spider`. (Core's monitors host callback is
  updated accordingly.)
- **`depth`/`limit` are now required** — the declarative `command` backend does
  no default-filling or server-side clamping, so both are always supplied by the
  caller. The schema `minimum`/`maximum` remain advisory.
- The Rust `{available:false, …}` graceful-degradation on a missing/failing
  binary is dropped: an absent binary or a non-JSON/failed crawl now surfaces as
  a deterministic tool error rather than a soft `available:false` result.
