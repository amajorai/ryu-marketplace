# Is It Agent Ready?
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="isitagentready" width="96" />
  </picture>
</p>

Live agent-readiness scans from [Is Your Site Agent-Ready?](https://isitagentready.com)
for Ryu. Ships as a fully declarative plugin: one `http` tool-def in `manifest.json`, no
key, no Core Rust.

## Tools

| Tool id               | Endpoint                                   | Required arg |
| --------------------- | ------------------------------------------ | ------------ |
| `isitagentready.scan` | `POST https://isitagentready.com/api/scan` | `url`        |

Each call runs a fresh scan (about 5-10 seconds) across discoverability (robots.txt,
sitemap, Link headers, DNS-AID), Markdown negotiation, bot access control (AI bot rules,
Content Signals, Web Bot Auth), protocol discovery (API catalog, OAuth, MCP server card,
A2A agent card, Agent Skills, WebMCP) and agent commerce, and reports a readiness level
from 0 (Not Ready) to 5 (Agent-Native).

`body_defaults` sets `format: "agent"`, so by default the agent gets a compact Markdown
list of failing checks, each with a fix and an implementation-guide link. Pass
`format: "json"` for every check with its status and evidence; that response is far
larger.

## Permissions

`tool:http-egress:isitagentready.com` only. The scan API needs no credential, so the
plugin declares no settings and no secret.
