# TypeScript & JavaScript LSP
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="typescript-lsp" width="96" />
  </picture>
</p>

TypeScript/JavaScript language server for the ryu agent: definitions, references, hover, symbols, implementations, call hierarchies and diagnostics after every edit. You install typescript-language-server; the plugin ships config.

This is one of Ryu's built-in language-server plugins. It is a **config-only**
plugin: it declares how to reach a language server, and never bundles the server
binary. Enable it only after the binary is on `PATH`; a missing binary is a
graceful skip with a visible reason, never a hard failure.

## Supported extensions

```json
{
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mts": "typescript",
  ".cts": "typescript",
  ".mjs": "javascript",
  ".cjs": "javascript"
}
```

## Install the server

```bash
Install the language server and the TypeScript compiler it shells out to: `npm install -g typescript-language-server typescript`.
```

## More information

The language-server declaration is field-for-field Claude Code's `.lsp.json`, so
the same config body loads in either host. See the [Declare Language Servers
guide](/docs/extend/develop/extensions/lsp-servers) for how Ryu arbitrates plugins that
declare the same extension.
