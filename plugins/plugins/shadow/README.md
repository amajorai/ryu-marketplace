# Shadow
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="shadow" width="96" />
  </picture>
</p>

Search everything Shadow has captured (screen text, audio transcripts, input) and summarize recent activity. Exposed as declarative HTTP tools that reach the device-local Shadow sidecar through Core's authenticated `/api/shadow/*` proxy (which injects Shadow's bearer token).

Definition lives in `manifest.json`; Core compiles it in straight from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
