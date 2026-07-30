# Chat Title

Auto-renames chats after every N completed assistant turns (default 5), keeps a Core-side title history, and exposes settings for enablement / frequency / model.

Declarative Ryu plugin (no UI, no Core Rust beyond the host bridge). Definition lives in `manifest.json`; a byte-identical copy is registered built-in in Core (`apps/core/src/plugin_manifest/fixtures/chat-title.manifest.json`). Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
