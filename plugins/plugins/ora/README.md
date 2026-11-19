# ora

Agent-readiness scoring from [ora](https://ora.ai) for Ryu. Ships as a fully declarative
plugin: six `http` tool-defs over ora's public, keyless read API, no Core Rust.

## Tools

| Tool id           | Endpoint                                        | Required args       |
| ----------------- | ----------------------------------------------- | ------------------- |
| `ora.score`       | `GET https://ora.ai/api/score/{domain}`         | `domain`            |
| `ora.scan`        | `POST https://ora.ai/api/scan`                  | `url`               |
| `ora.run_checks`  | `POST https://ora.ai/api/scan/checks`           | `url`, `checkIds`   |
| `ora.checks`      | `GET https://ora.ai/api/checks`                 | none                |
| `ora.discover`    | `GET https://ora.ai/api/discover`               | `intent`            |
| `ora.agent_files` | `GET https://ora.ai/api/agent-files/{domain}`   | `domain`            |

Look up a cached score with `ora.score` before scanning. A domain ora has never scanned
answers `404` with `code: DOMAIN_NOT_SCANNED`; run `ora.scan` then. ora documents a
fresh scan at about 30 seconds, which is also Core's HTTP tool timeout, so a slow scan can
come back as `available: false`; check `ora.score` before retrying. Deep checks can finish after the scan returns, so poll `ora.score` while
`analysisStatus` is not `complete`. After a fix, re-verify only the affected checks with
`ora.run_checks`, using ids from `ora.checks` or the score's layer breakdown.

`{domain}` is filled from the argument of the same name. The other arguments of a `GET`
tool become the query string, so they are ora's own parameter names (`format`,
`include`, `siteType`, `competitors`, `intent`, `limit`).

Responses are large: a full score is about 100 KB of JSON. `format: "audit"` returns
ora's documented, versioned shape without internal fields.

## Not shipped

ora's agent-feedback, check-feedback and contact endpoints write to ora, and its journey
runs stream over SSE or need a partner key. This plugin does not declare them.

## Permissions

`tool:http-egress:ora.ai` only. The read API needs no credential, so the plugin declares
no settings and no secret.
