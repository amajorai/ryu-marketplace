# Usage Pacer

Usage Pacer reads an agent's subscription usage windows before each turn. It
supports both sides of quota management:

- `ladder` steps down to a cheaper model when used-percent or even-burn pressure
  crosses an `at` threshold.
- `upgrade_ladder` steps back up when a selected window has at most `remaining`
  percent left or resets within `within_minutes`; an active upgrade takes
  precedence over `ladder` for that turn.

An upgrade step can set `model`, `effort`, or ACP session options. The readable
`fast_mode` key maps to Codex ACP's current `fast-mode` option or Claude ACP's
current `fast` option, and can be requested at the end of a weekly window:

```json
{
  "windows": "weekly",
  "upgrade_ladder": [
    { "from": "sonnet", "remaining": 20, "model": "opus" },
    { "from": "opus", "within_minutes": 1440, "acp_config": { "fast_mode": "true" } }
  ]
}
```

`remaining` and `within_minutes` are OR conditions. Agent-specific rules replace
the global rule. ACP options are best-effort: adapters that do not advertise an
option ignore the request and continue with their normal configuration. Use the
adapter's advertised id directly in `acp_config` for non-Claude/Codex agents.

The plugin is opt-in and only has `preferences:read` and `usage:read`; it never
changes an agent's saved model or reads provider credentials.
