# Dynamic Workflows
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="dynamic-workflows" width="96" />
  </picture>
</p>

`@ryu/dynamic-workflows` adds the `workflow.run` tool. It accepts a bounded list
of independent delegate tasks, validates ids, presets, inline definitions, and
resource caps, then asks Core's generic `host.runFanout` bridge to execute them
through the existing workflow delegation engine. The token cap is bounded to
32,768 per delegate.

The tool is opt-in because a call consumes model budget. Delegates default to the
read-only `code_read` preset. The available presets describe clean-context
reasoning modes; they do not grant a tool loop. Use a registered `agent_id` when
the delegate must execute tools. The inline sandbox has a manifest-configured
10-minute ceiling, while the fan-out itself defaults to Core's 120-second
per-delegate cap.
