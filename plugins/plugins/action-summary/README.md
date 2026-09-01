# Action Summary
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="action-summary" width="96" />
  </picture>
</p>

Action Summary puts a first-person approval question above a plain-language
summary for the agent's visible thinking blocks and tool calls for
people who do not know the underlying tool names. It emits one plain-language
line per action through Ryu's existing plugin-note transport, so the same
behavior works in desktop, web, island, CLI, and connected mobile Core chat
clients. Offline mobile chat uses Ryu's built-in one-sentence tool-call guidance
instead because it cannot call the Core side model.

The plugin is opt-in because every action explanation uses a side-model call.
The main agent model is never changed.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| action-summary-enabled | on | Master toggle for action explanations. |
| action-summary-detail | standard | brief, standard, or full; every result remains one line. |
| action-summary-model | empty | Optional override. Empty follows Ryu's normal side-model/node default. |

Brief is capped at about 80 characters, standard at about 140, and full at
about 220. Inputs are bounded and likely secrets are redacted before the
side-model request. Tool output is not sent; a small status such as failed or
interrupted may be included.

The plugin uses the generic action hook phase. Core supplies the same
provider-neutral action shape for ACP and non-ACP streams. Tool actions return a
`tool_approval` intent with `question` and `summary`; clients that do not render
the optional intent can safely keep reading the summary text. Core approval rows
and offline native confirmation cards use the same two fields, while the actual
approval decision remains owned by Core or the native tool registry.
