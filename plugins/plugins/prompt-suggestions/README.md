# Prompt Suggestions
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="prompt-suggestions" width="96" />
  </picture>
</p>

Prompt Suggestions is the installable plugin for the shared chat-composer prompt
bridge. It exposes the existing Core next-prompt generator as a configurable plugin:
the generator uses recent conversation turns, runs as a background side-model call,
and defaults to the resident local engine. The desktop composer renders the result as
ghost text and a keyboard-navigable list.

Install or enable `@ryu/prompt-suggestions`. Configure it from the plugin settings to
disable suggestions or select a cheaper/faster model. New chats use the same composer
bridge and can receive seed prompts from the host's recent-chat/project context.
