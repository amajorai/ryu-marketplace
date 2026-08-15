# Clangd (C/C++)
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="clangd-lsp" width="96" />
  </picture>
</p>

C/C++ language server (clangd) for the ryu agent: definitions, references, hover, symbols, implementations, call hierarchies and diagnostics after every edit. You install clangd; the plugin ships config.

This is one of Ryu's built-in language-server plugins. It is a **config-only**
plugin: it declares how to reach a language server, and never bundles the server
binary. Enable it only after the binary is on `PATH`; a missing binary is a
graceful skip with a visible reason, never a hard failure.

## Supported extensions

```json
{
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp"
}
```

## Install the server

```bash
Install `clangd` from your package manager (Homebrew: `brew install clangd`), or use the LLVM bundle that ships `clangd`.
```

## Note

Uppercase `.C`/`.H` from Claude Code's clangd config are intentionally omitted: Ryu's extension lookup lowercases file extensions, so `.C` would collide with `.c` and misroute a C file to the C++ language id. clangd detects the language itself, so nothing is lost.

## More information

The language-server declaration is field-for-field Claude Code's `.lsp.json`, so
the same config body loads in either host. See the [Declare Language Servers
guide](/docs/develop/extensions/lsp-servers) for how Ryu arbitrates plugins that
declare the same extension.
