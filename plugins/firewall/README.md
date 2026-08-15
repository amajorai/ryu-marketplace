# Gateway Firewall
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="firewall" width="96" />
  </picture>
</p>

An on/off switch over the Gateway's built-in firewall, which screens model traffic for prompt injection and PII. Enabling this plugin forces `firewall.enabled` on at the next Gateway restart; the pattern set and policy mode stay owned by the Gateway config (GET/PUT /v1/config), not by this plugin.

Definition lives in `manifest.json`; Core compiles it in straight from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
