# Shadow

Search everything Shadow has captured (screen text, audio transcripts, input) and summarize recent activity. Exposed as declarative HTTP tools that reach the device-local Shadow sidecar through Core's authenticated `/api/shadow/*` proxy (which injects Shadow's bearer token).

Definition lives in `manifest.json`; Core compiles it in straight from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
