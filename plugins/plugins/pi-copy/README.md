# Copy & Paste
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="pi-copy" width="96" />
  </picture>
</p>

Adds the `copy_paste` tool to the managed Pi agent, so the flagship `ryu` agent
can copy or move a block of text between or within files **without retyping
it**.

Ships one **Pi extension** (`contributes.pi_extensions`):
`pi-extensions/ryu-copy.ts` registers the `copy_paste` tool on the managed `ryu`
(Pi) agent.

## Why

Pi's built-in file tools are `read`, `write` and `edit`. With only those, moving
a function, splitting a file, or reordering a long list means the model reads
the block and then regenerates every byte of it into an `edit`/`write` call.
That spends output tokens on text that already exists, and it is lossy: smaller
local models occasionally drop a row, "fix" data that looked like a typo, or
normalize significant whitespace. `copy_paste` moves the bytes disk-to-disk, so
the block never passes through the model's output.

## What the tool does

One call selects a span and pastes it:

- **Source:** `path` plus either `start_line`/`end_line` (1-based, inclusive)
  or `text` (an exact snippet that must occur exactly once).
- **Destination:** `to_path` (defaults to `path`; created with its parent
  directories when missing) plus one of:
  - `to_line`: insert before that line (one past the last line appends);
  - `to_anchor` + `position` (`before`, `after` (the default), or `replace`):
    paste relative to an exact, unique snippet;
  - neither: append at the end.
- **`move: true`** cuts instead of copying. Across files the destination is
  written first, so a failed write never loses the block.

The result reports where the block landed (its new line numbers) and quotes
only its first and last line, so the model can check the paste without the
block re-entering its context.

Line pastes keep the block on lines of its own (a missing final newline is
added in the destination's own style, `\n` or `\r\n`). Anchor pastes are
verbatim. Files must be UTF-8 text under 8 MiB; binary files are refused.

## Diagnostics

When a language server is configured for the destination file (`ryu-lsp.ts`),
its fresh diagnostics are appended to the `copy_paste` result, exactly as they
are after `edit` and `write`.

## Safety

`ryu-plan.ts` gates `copy_paste` like `edit`/`write`: it is withheld in plan
mode, and writing to a sensitive target (`.env`, `.git/`, `.ssh/`, `id_rsa`,
`node_modules/`) asks for confirmation. Copying *from* such a file only reads
it, so only a `move` out of one asks.

## Installing / enabling

This is a built-in (Core-tier) plugin, so it ships compiled into Core. It is in
`CORE_PREINSTALLED` and is seeded installed + enabled on a fresh install, like
`pi-shell`, `pi-subagent` and `pi-monitor`. Toggling it takes effect in a
**new chat**, because Pi reads its extensions at process start.
