# Is Agentic
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="is-agentic" width="96" />
  </picture>
</p>

Agent-readiness reports from [Is Agentic](https://is-agentic.com) for Ryu. Ships as a
fully declarative plugin: one `http` tool-def in `manifest.json`, no key, no Core Rust.

## Tools

| Tool id             | Endpoint                                     | Required arg |
| ------------------- | -------------------------------------------- | ------------ |
| `is_agentic.report` | `GET https://is-agentic.com/api/v1/report`   | `url`        |

The tool reads the latest **completed** report for a public website: a 0-100 `score`,
`score_breakdown` (essential, recommended and bonus), and `issues`, each with its tier,
result, evidence and recommendation. Start with failed essential issues.

It never starts a scan. A site with no stored report answers `404` with
`code: report_not_found`, and `fail_open` hands that envelope to the agent as data; its
`resolution` names the `https://is-agentic.com/scan/<domain>` page that starts one.

## Permissions

`tool:http-egress:is-agentic.com` only. Is Agentic's API is read-only and needs no
credential, so the plugin declares no settings and no secret.
