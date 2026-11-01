# Advisor
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="advisor" width="96" />
  </picture>
</p>

Consult a stronger reviewer model.

Declarative Ryu plugin (no UI). The model-callable "consult a stronger reviewer" tool. Definition lives in `manifest.json`; a byte-identical copy is registered built-in in Core, and its runtime (a Gateway-governed side-model completion) stays in Core. Published to `ryu-marketplace` via `tools/mirror-plugins.sh`.
