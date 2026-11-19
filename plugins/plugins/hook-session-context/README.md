# Session Context

Injects the current date and time at the start of every session, so the agent stops guessing what "today" means and can reason about recency and deadlines. Also the smallest working turn hook in the catalog, which makes it a good template to copy.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/start.js`; Core compiles both in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
