# Goal
<p align="center"><img src="./icon.png" alt="goal" width="96" /></p>

Give the agent a goal with `/goal` and it keeps working until a judge model agrees the goal is actually met, re-prompting itself after every turn instead of stopping and waiting for you. `/goal clear` stops the loop; the judge model is configurable.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/loop.js`; Core compiles both in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
