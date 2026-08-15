# Session Context
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="hook-session-context" width="96" />
  </picture>
</p>

Injects the current date and time at the start of every session, so the agent stops guessing what "today" means and can reason about recency and deadlines. Also the smallest working turn hook in the catalog, which makes it a good template to copy.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/start.js`; Core compiles both in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
