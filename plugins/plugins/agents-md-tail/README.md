# AGENTS.md Tail
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="agents-md-tail" width="96" />
  </picture>
</p>

AGENTS.md Tail is an experimental, opt-in context hook. On every model turn it
removes stale copies of its own hidden tail block and appends the current
`ctx.project_instructions` block to the latest user message. The user message in
chat history is unchanged, so the injection is invisible to the user and does not
accumulate in the next turn's transcript.

The hook handles both outbound message arrays (OpenAI-compatible/local agents)
and the flattened prompt used by ACP agents, including the managed `ryu` Pi agent.
ACP replacements request a fresh session so a prior hidden tail cannot remain in
the agent's private session history.

## Caching and session trade-offs

This plugin changes the model's outbound prompt, so it can affect server-side
caching:

- **Gateway response cache:** the exact cache key includes the complete message
  array, including the hidden tail. Repeating the same effective prompt still
  produces the same key, while changing the project instructions intentionally
  invalidates the old entry.
- **Provider prompt cache:** with the default settings, the stable system/head
  prefix remains cacheable. The repeated instructions at the tail are part of
  the changing suffix and will usually be billed as uncached input each turn.
  Enabling **Remove the head injection** can reduce the amount of project context
  in the stable cacheable prefix.
- **ACP and the managed Ryu/Pi agent:** strict latest-only behavior starts a fresh
  ACP session for every turn. Ryu replays the persisted visible transcript, but
  pooled ACP process state, session affinity, and warm in-session KV-cache reuse
  are not retained. An upstream provider may still reuse a content-based prompt
  prefix, but the plugin does not guarantee it.

The ACP cost is deliberate: standard ACP has no portable way to inject context
for one turn while also removing that context from the agent's retained session
history. Keeping a warm ACP session would violate the plugin's guarantee that the
agent sees only the head copy and the latest tail copy.

The **Remove the head injection** setting is off by default. When enabled, the
exact project-instructions block at the start of the system context is removed,
leaving only the latest copy at the tail. The setting is node-scoped and lives in
the plugin's **AGENTS.md Tail** settings tab.

Definition lives in `manifest.json`, and the sandboxed context hook lives in
`hooks/inject.js`. This is an experimental Core-tier plugin and is not enabled on
fresh installs.
