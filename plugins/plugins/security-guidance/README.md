# Security Guidance
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="security-guidance" width="96" />
  </picture>
</p>

Scans each answer for security vulnerabilities and has a second model review the code before you ship it. Off until you flip the Security review toggle in the composer, or run `/security` for a one-off review of the last answer; the reviewer model is configurable.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/review.js`; Core compiles both in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
