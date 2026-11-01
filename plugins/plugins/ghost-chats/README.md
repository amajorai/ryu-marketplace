# Temporary Chats
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="ghost-chats" width="96" />
  </picture>
</p>

Extracts the desktop temporary-chat (`ghostMode`) behavior into its own
`@ryu/ghost-chats` plugin. The host still owns the safe native lifecycle: turns
use `persist: false`, skip long-term memory, avoid sidebar creation, drafts,
presence, and reactions, and label the tab **Temporary chat**.

The manifest is the feature-detection seam. Disabling the plugin removes the
composer toggle and prevents the temporary-chat behavior from being activated;
the existing `@ryu/ghost` plugin remains the separate computer-control provider.
