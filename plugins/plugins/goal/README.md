# Goal
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="goal" width="96" />
  </picture>
</p>

Give the agent a goal with `/goal`, or grant an agent the `goal.set` tool so it can set or replace the goal for its current conversation. Ryu keeps working until a judge model agrees the goal is actually met, re-prompting itself after every turn instead of stopping and waiting for you. `/goal clear` stops the loop; the judge model is configurable.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/loop.js`, and its sandboxed tool body in `tools/goal.set.js`; Core compiles all of them in from this package directory. Run `node plugins-store/plugins/goal/seal.mjs` after editing the tool body. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
