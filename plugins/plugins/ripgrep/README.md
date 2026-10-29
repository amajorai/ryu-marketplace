# ripgrep
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="ripgrep" width="96" />
  </picture>
</p>

Fast local code and text search for Ryu agents, powered by
[ripgrep](https://github.com/BurntSushi/ripgrep)'s `rg` binary. This is a fully
declarative plugin: Ryu owns the tool contract and security gate, while the
upstream project owns the search engine.

## Tools

| Tool id | Backend | Required args |
| --- | --- | --- |
| `ripgrep.search` | `command` → local `rg` binary | `pattern`, `path` |
| `ripgrep.files` | `command` → local `rg` binary | `path` |

`ripgrep.search` runs:

```text
rg --json --color never -- <pattern> <path>
```

The result is JSON Lines in the generic command envelope (`exit_code`, `stdout`,
and `truncated`). `exit_code: 1` means that no match was found. `ripgrep.files`
uses `rg --files` and returns one visible path per line. Both tools retain
ripgrep's defaults: `.gitignore`/`.ignore` filtering, hidden-file filtering,
binary-file filtering, Unicode regexes, and recursive directory search.

## Install

Install ripgrep using the upstream instructions, then give Core an absolute path
to the binary through its command allowlist:

```bash
brew install ripgrep
export RYU_COMMAND_TOOL_ALLOWLIST="rg=$(command -v rg)"
```

The same allowlist works with a package-manager or downloaded binary on Linux
and Windows. Ryu never searches `PATH` at tool-call time and the manifest never
contains a filesystem path.

## Security

The plugin can execute only the fixed `rg` binary. Arguments are passed as an
argv array, never through a shell; the `--` terminator keeps search values from
becoming ripgrep flags. Calls require the explicit `tool:command:rg` Gateway
grant and the `rg` command-allowlist entry. A missing or unallowlisted binary is
reported as a deterministic unavailable/allowlist error.

The plugin does not expose ripgrep's unrestricted CLI surface as an arbitrary
shell tool. Use the Ryu shell tool when a user explicitly needs an option that
is outside these two stable search contracts.

## Tests

```bash
node --test
```

The co-located test checks the manifest identity, command backends, argv
terminators, required inputs, and grant scope.
