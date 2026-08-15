# Kotlin LSP
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="kotlin-lsp" width="96" />
  </picture>
</p>

Kotlin language server for the ryu agent: definitions, references, hover, symbols, implementations, call hierarchies and diagnostics after every edit. You install kotlin-lsp; the plugin ships config.

This is one of Ryu's built-in language-server plugins. It is a **config-only**
plugin: it declares how to reach a language server, and never bundles the server
binary. Enable it only after the binary is on `PATH`; a missing binary is a
graceful skip with a visible reason, never a hard failure.

## Supported extensions

```json
{
  ".kt": "kotlin",
  ".kts": "kotlin"
}
```

## Install the server

```bash
Install the Kotlin LSP CLI: `brew install JetBrains/utils/kotlin-lsp`.
```

## More information

The language-server declaration is field-for-field Claude Code's `.lsp.json`, so
the same config body loads in either host. See the [Declare Language Servers
guide](/docs/develop/extensions/lsp-servers) for how Ryu arbitrates plugins that
declare the same extension.
