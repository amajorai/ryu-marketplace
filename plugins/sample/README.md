# Research Assistant
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="sample" width="96" />
  </picture>
</p>

The reference plugin: a minimal example that declares one of each runnable kind — an agent, a workflow, a tool, and a skill — plus a companion window. It does nothing useful on purpose, and ships hidden. Copy this directory as the starting point for your own plugin.

Definition lives in `manifest.json`; Core compiles it in straight from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
