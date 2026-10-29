# Toolsmith Example
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="toolsmith-example" width="96" />
  </picture>
</p>

The worked example for **toolsmith**, Ryu's tool-authoring harness: one real,
verified `inline_js` tool, `text_chunk`, that splits text into fixed-size,
optionally overlapping chunks.

It is not registered with Core and not offered in the Store. It exists so the
scaffold → verify → seal pipeline has an end-to-end regression test on a real
package.

## Layout

| File                 | Role                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `tools/text_chunk.js` | The tool body: a flat fragment, the reviewable **source** form.     |
| `manifest.json`      | Carries the same body as the runnable's `code` string, the **wire** form, sealed from the file. |
| `cases.json`         | Golden cases: happy path, edge cases, and failures.                  |
| `tool.test.mjs`      | Generated suite that runs every case twice with ambient nondeterminism shadowed. |

## The tool

`text_chunk` takes `text` (required), `size` (characters per chunk, default 512)
and `overlap` (characters each chunk re-reads from the previous one, default 0,
must be less than `size`). It returns `{ count, chunks: [{ start, text }] }` and
throws on invalid arguments.

## Working on it

```sh
node tools/toolsmith/index.mjs verify plugins-store/plugins/toolsmith-example
node tools/toolsmith/index.mjs sync   plugins-store/plugins/toolsmith-example   # reseal after editing the body
```

`verify` runs the purity scan, the manifest contract, the drift check and the
cases; a body edited without resealing fails the drift check.
