# AGENTS.md Tail

AGENTS.md Tail is an experimental, opt-in context hook. On every model turn it
appends the current `ctx.project_instructions` block to the latest outbound user
message. The user message in chat history is unchanged, so the injection is
invisible to the user. For OpenAI-compatible/local agents it does not accumulate
in the next turn's message array; ACP agents keep earlier copies in their own
session history (see Caching).

The hook handles both outbound message arrays (OpenAI-compatible/local agents)
and the flattened prompt used by ACP agents, including the managed `ryu` Pi agent.
On ACP it appends the block to the end of the prompt; Core forwards that suffix
to the warm pooled session as part of the latest turn.

## Caching

The hook never edits the system prompt or earlier turns. Those are the prefix a
provider prompt cache reuses, and Core ignores any `context` rewrite that changes
them.

- **OpenAI-compatible/local agents (message array):** the tail is not
  persisted, so on the next turn the previous user message is resent without
  the tail it carried and the cached prefix ends there. The system prompt and
  every turn before the previous user message stay cached; the previous
  assistant reply, the new user message, and the fresh tail are re-read on each
  turn.
- **Gateway response cache:** the exact cache key includes the complete message
  array, including the hidden tail. Changing the project instructions
  intentionally invalidates the old entry.
- **ACP and the managed Ryu/Pi agent:** the pooled session is kept, so warm
  in-session state and prefix caching survive. Earlier turns' tail copies remain
  in the agent's own session history, the same as any earlier message.

Definition lives in `manifest.json`, and the sandboxed context hook lives in
`hooks/inject.js`. This is an experimental Core-tier plugin and is not enabled on
fresh installs.
