# Tool Firewall

A Ryu plugin.

Declarative Ryu plugin (no UI). Definition lives in `plugin.json`; a byte-identical copy is registered built-in in Core (`apps/core/src/plugin_manifest/fixtures/tool-firewall.plugin.json`), and its runtime (MCP registration / bridge / policy / turn-hook) stays in Core. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
