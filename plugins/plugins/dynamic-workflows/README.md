# Dynamic Workflows

`@ryu/dynamic-workflows` adds the `workflow.run` and `workflow.script` tools.

## `workflow.run`

`workflow.run` accepts a bounded list
of independent delegate tasks, validates ids, presets, inline definitions, and
resource caps, then asks Core's generic `host.runFanout` bridge to execute them
through the existing workflow delegation engine. The token cap is bounded to
32,768 per delegate.

The tool is opt-in because a call consumes model budget. Delegates default to the
read-only `code_read` preset. Inline delegates are prompt-only: the `tools` field
is rejected because it cannot create a real allowlisted tool loop. Use a registered
`agent_id` when the delegate must execute tools. The available presets describe
clean-context reasoning modes and do not override the registered agent's policy.
The inline sandbox has a manifest-configured 10-minute ceiling, while the fan-out itself defaults to Core's 120-second
per-delegate cap.

## `workflow.script`

`workflow.script` runs a workflow written as code: an async JavaScript body that
orchestrates sub-agents with `agent()`, `parallel()`, `pipeline()`, `phase()`, and
`log()`, reading the `args` input and returning the result. Core stores the call as
a durable workflow run (a `script` node) and executes it in its own sandbox, through
the `host.workflows.script` / `host.workflows.status` bridge.

Every finished `agent()` call is checkpointed before the script sees it. If Ryu
restarts, the background task crashes, or a provider rate, usage, or session limit
is reached, Core resumes the run on its own and unchanged `agent()` calls return
their saved results. Calling the tool again with the same script and args (for
example from an interrupted chat turn that was resumed) attaches to the same run;
set `run_key` to run it again on purpose. Sub-agents always run as the calling
agent. The call waits up to `wait_secs` (default 300, at most 540); pass the
returned `run_id` to keep waiting for a longer run.

Its cases live in `script.cases.json` and run from `script.tool.test.mjs`.
