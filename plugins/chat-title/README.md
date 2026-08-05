# Chat Title

Auto-renames a chat after every N completed assistant turns (default 5) using a side model, and keeps a Core-side history of the names it chose so you can see how a conversation drifted. Enablement, frequency, and the model to use are all settings.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/rename.js`; Core compiles both in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
