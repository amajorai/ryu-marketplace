# Rules
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="rules" width="96" />
  </picture>
</p>

Rules discovers project instruction files from the Cursor and Claude layouts and
exposes them in the agent edit page. The desktop panel configures a per-agent
preference at `rules.agent.<agent_id>`:

```json
{
  "enabled": true,
  "autoInject": true,
  "applyMode": "auto",
  "turnsPerPlan": 0,
  "rules": [{ "id": "team", "text": "...", "enabled": true, "applyMode": "always" }]
}
```

`always`, `path`, `intelligent`, and `manual` are supported matching modes;
`auto` uses a rule's mode when present and defaults agent-base rules to always.
`turnsPerPlan: 0` means every turn. Project rules are normalized into
`ctx.project_rules` with their provider, scope, path, content, description, globs,
and apply mode. Manual mode leaves agent-base rules available but does not
automatically inject project rules.

The context hook adds one hidden, delimited block to the latest outbound user
message. It removes stale blocks before adding the fresh block, and asks ACP for
a fresh session so its private transcript cannot accumulate old rule copies.
