# Prompt Suggestions

Prompt Suggestions is the installable plugin for the shared chat-composer prompt
bridge. It lifecycle-gates Core's one next-prompt generator: after an assistant turn,
the desktop asks Core for suggestions only through `/api/chat/suggestions`; Core uses
recent conversation turns, performs one background model call, and defaults to the
resident local engine. The plugin does not run a second post-turn hook or keep a
parallel cache. The desktop composer renders the result as ghost text and a
keyboard-navigable list.

Install or enable `@ryu/prompt-suggestions`. Configure it from the plugin settings to
disable suggestions or select a cheaper/faster model. New chats use the same composer
bridge and can receive seed prompts from the host's recent-chat/project context.
