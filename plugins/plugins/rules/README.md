# Rules

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
message (or, for ACP agents, appends it to the end of the prompt). It never edits
the system prompt or earlier turns: those are the prompt-cache prefix, and Core
ignores a context rewrite that changes them.

For OpenAI-compatible/local agents that send a message array, the block is not
persisted in chat history, so earlier turns do not carry old copies. The
previous user message is therefore resent without its block on the next turn,
and the provider cache prefix ends just before that message: the previous
assistant reply and the new message are re-read each turn. ACP agents are the
exception: the block reaches the warm pooled session as part of that turn's
prompt, so earlier copies stay in the agent's own session history and its
prefix caching is unaffected.
