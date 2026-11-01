# Double Check
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="double-check" width="96" />
  </picture>
</p>

Sends every answer to a second model for review before you act on it, so mistakes get caught by a fresh set of eyes. Off until you flip the Double-check toggle in the composer; the reviewer model is configurable in settings.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/review.js`; Core compiles both in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
