# Effort Escalator
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="effort-escalator" width="96" />
  </picture>
</p>

Effort Escalator is an opt-in, per-conversation recovery policy. After the
configured delay (30 minutes by default), a cheap read-only side model judges
the recent transcript. If it returns `STUCK: yes`, the next turn selects the
next manually configured model tier. Agent-specific rules override the global
ladder, and `max_escalations` prevents an unbounded loop.

The plugin deliberately escalates on the next turn rather than changing a
running request. The hook returns `effort` as a first-class field on the
`select_model` directive. Core forwards it as `reasoning_effort` on compatible
requests and updates an already-selected ACP `effort` or `thought_level` option
when that option is present; the selection reason is explanatory only.

When Usage Pacer is installed too, the escalation hook has explicit priority
`100` (Usage Pacer's default is `0`), so Effort Escalator runs first and wins the
first-writer-wins model-selection contract for that turn. Once the task is no
longer marked stuck, Usage Pacer can select its lower-cost model normally. This
avoids an escalation/downgrade oscillation.
