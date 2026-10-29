# Plugin store behavior proof

This suite covers only plugins-store packages. It does not cover apps-store
satellites or marketplace-store publishing.

The inventory has three disjoint ownership clusters:

- plugins owns packages under plugins-store/plugins/ and rows whose cluster is
  plugins.
- lsp owns packages under plugins-store/lsp/ and rows whose cluster is lsp.
- external_plugins owns packages under plugins-store/external_plugins/ and rows
  whose cluster is external_plugins.

The umbrella inventory, coverage map, and runner live in this directory. A
cluster owner updates only that cluster's entries in coverage-map.json, adds
tests within its package roots, then regenerates and validates the snapshot:

  rtk node plugins-store/tests/inventory.mjs --write
  rtk node plugins-store/tests/run.mjs external_plugins
  rtk node plugins-store/tests/run.mjs plugins --package auto-continue,plan-continue
  rtk node plugins-store/tests/run.mjs plugins --package advisor,double-check,observer-agents
  rtk node plugins-store/tests/run.mjs plugins --package laya

Use plugins, lsp, or all in place of external_plugins to select another cluster.
The inventory gate runs for every selected cluster and compares the checked-in
snapshot to live package manifests before tests start.
Within one ownership cluster, the optional --package directory-name,directory-name selector
runs only the named package tests and a matching cohort suite, while retaining
the full inventory gate.

Examples: `rtk proxy node plugins-store/tests/run.mjs lsp --package rust-analyzer-lsp`
and `rtk proxy node plugins-store/tests/run.mjs external_plugins --package cloudflare-browser-run`.
Shared cluster contract fixtures still run alongside the selected package's tests.

The default runner includes registered Core runtime fixtures after package checks.
See [RUNTIME.md](./RUNTIME.md) for per-package mapping, fresh compiled-binary reuse,
explicit `--contract-only` mode and remaining provider/device boundaries.

The plugins cluster runs the Laya, Cloudflare Clef, FunctionGemma and Needle3 Python
sidecar suites after Node package tests. They run for full plugins/all selections or
their own `--package` selection. Set `PYTHON` to choose another interpreter. Laya and
Cloudflare Clef stub FastAPI; FunctionGemma and Needle3 drive their real ASGI apps, so
the runner provisions only their pinned FastAPI through `uv run --no-project --with`
(uv must be on `PATH`). All four exclude credential environment, stub model runtimes and
provider responses, and do not download checkpoints or contact Cloudflare.

Inventory statuses mean:

- behavior: a listed test drives the local production body or contract and
  asserts its result, state, or side effect.
- partial: local evidence covers only the safe local boundary; the boundary
  column names remaining local host tests separately from provider/device boundaries.
- unmapped: no meaningful behavior proof is assigned yet. A colocated test is
  not coverage merely because it exists.

The external_plugins cluster uses local Toolsmith host/provider fixtures. It
does not sign into Composio, authorize OAuth, contact Cloudflare, or open a real
browser session. Those provider round trips remain explicitly partial.

## Chat-surface product evidence

The reaction message-action fixture was run in Chromium against the production
message-action surface with local transcript state. Its stable screenshot is
[chat-surface-reactions.png](../../docs/proof/test-coverage-sweep-20260924/evidence/plugins-store/chat-surface-reactions.png).
