# Swift LSP
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="swift-lsp" width="96" />
  </picture>
</p>

Swift language server (SourceKit-LSP) for the ryu agent: definitions, references, hover, symbols, implementations, call hierarchies and diagnostics after every edit. You install sourcekit-lsp; the plugin ships config.

This is one of Ryu's built-in language-server plugins. It is a **config-only**
plugin: it declares how to reach a language server, and never bundles the server
binary. Enable it only after the binary is on `PATH`; a missing binary is a
graceful skip with a visible reason, never a hard failure.

## Supported extensions

```json
{
  ".swift": "swift"
}
```

## Install the server

```bash
Install SourceKit-LSP: `brew install sourcekit-lsp` (ships with recent Xcode toolchains too).
```

## More information

The language-server declaration is field-for-field Claude Code's `.lsp.json`, so
the same config body loads in either host. See the [Declare Language Servers
guide](/docs/develop/extensions/lsp-servers) for how Ryu arbitrates plugins that
declare the same extension.
