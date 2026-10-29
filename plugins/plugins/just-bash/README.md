# just-bash
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="just-bash" width="96" />
  </picture>
</p>

A simulated bash shell for Ryu agents, powered by Vercel Labs'
[just-bash](https://github.com/vercel-labs/just-bash) CLI. This is a fully
declarative plugin: Ryu owns the tool contract and security gate, while the
upstream project owns the shell interpreter and its TypeScript re-implementations
of the common Unix commands.

It fills the gap between the JavaScript-only programmatic tool-calling sandbox and
the real container/microVM sandboxes: agents get the `grep | sed | jq` workflow
they are good at, with no Docker or VM runtime installed.

## Tools

| Tool id | Backend | Required args |
| --- | --- | --- |
| `just-bash.run` | `command` → local `just-bash` CLI | `script`, `path` |

`just-bash.run` runs:

```text
just-bash --json --allow-write --root <path> -c <script>
```

The result is the CLI's JSON object, returned verbatim: `stdout`, `stderr`, and
`exitCode`. A non-zero `exitCode` is a normal result, not a tool error.

## What the script sees

- `path` (a directory inside the active Ryu workspace) is mounted read-only at
  `/home/user/project`, which is also the working directory.
- Writes are allowed but land in an in-memory copy-on-write layer that is discarded
  when the call ends. The real workspace is never modified, and nothing carries
  over to the next call.
- Pipes, redirection, loops, functions, globbing, and the commands upstream ships:
  `ls`, `cat`, `find`, `grep`, `rg`, `sed`, `awk`, `jq`, `yq`, `xan`, `sort`,
  `uniq`, `wc`, `head`, `tail`, `diff`, `tar`, `gzip`, `sqlite3`, and more.
- No network (`curl` is absent), no `python3`/`js-exec` (neither flag is passed),
  and no host binaries such as `git` or `node`.
- Upstream execution limits stop runaway loops (exit code 126). Core also kills the
  process after `timeout_secs` (60). Core reads at most 1 MiB of the CLI's `--json`
  envelope, which holds the script's stdout and stderr together, JSON-escaped. A script
  that prints more than about 1 MiB in total cuts the envelope short, and the result is
  then `{available, content, exit_code, truncated: true}` with the raw, cut text in
  `content` instead of the parsed object. Pipe large output through `head` or `tail`.

## Install

Install the upstream CLI (Node.js 20.19 or newer), then give Core an absolute path to
the binary through its command allowlist:

```bash
npm install -g just-bash@3.6.0
export RYU_COMMAND_TOOL_ALLOWLIST="just-bash=$(command -v just-bash)"
```

Ryu never searches `PATH` at tool-call time, and the manifest never contains a
filesystem path. The CLI reports a fixed `1.0.0` from `--version`, so the plugin
declares no `bin_version` check; pin the npm version yourself.

## Security

The plugin can execute only the allowlisted `just-bash` binary. Arguments are passed
as an argv array, never through a host shell; the script is the value of `-c`, so a
flag-shaped script stays a script. Calls require the explicit
`tool:command:just-bash` Gateway grant and the `just-bash` command-allowlist entry.
Core resolves `path` against the active workspace and refuses paths outside it,
symlink escapes, protected host directories, and any folder that holds one (for
example a parent of your home folder), because the script can read hidden files.
The script is limited to 8192 bytes of UTF-8.

just-bash is beta software, and its simulated shell is not a hardened isolation
boundary like a container or microVM. The script can read every file under `path`,
including hidden ones such as `.env`. Use a real sandbox for untrusted code, and the
Ryu shell tool when a task needs real binaries.

## Tests

```bash
node --test
```

The co-located test checks the manifest identity, argv, required inputs, workspace
path argument, and grant scope. When `just-bash` is on `PATH` (or `JUST_BASH_BIN`
points at it), it also runs the exact argv against a temporary fixture and asserts
piped output, in-memory writes that leave the fixture untouched, containment, and
exit codes.
