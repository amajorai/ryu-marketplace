# Security Scanner
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="security-scanner" width="96" />
  </picture>
</p>

Security Scanner is an original Ryu plugin that combines the strongest workflow
ideas from modern coding-agent security tools into one model-agnostic package.
It uses Ryu's own governed agent and side-model capabilities, so the scan can
run with whichever model or agent the user selects rather than assuming a
vendor-owned model.

## What it does

- /security-scan runs independent architecture/threat-model, vulnerability,
  secrets/configuration, and attack-path workers.
- /security-scan quick keeps the same evidence contract with fewer workers.
- /security-scan deep runs five independent passes and asks the synthesizer to
  account for coverage and unresolved questions.
- /security-scan diff limits the primary review to the current working-tree
  diff or the scope supplied after the command.
- /security-verify starts independent falsification passes against the latest
  report. A finding is not upgraded to verified just because a worker repeats it.
- /security-fix drafts a minimal patch or unified diff plus tests. It never
  writes, applies, commits, or pushes a change.
- The optional Security review composer toggle adds a fast static pass and a
  second-model review to completed code answers.

Every report uses a stable finding shape: severity, confidence, affected
location, source-to-sink or attacker path, impact, evidence, counterevidence,
remediation, and verification status. Reports also state what was covered and
what was not completed, so an incomplete scan cannot look clean.

## Model routing

The worker agents run through Ryu's delegation engine with the active agent's
tools, workspace, MCP access, and model routing. Report synthesis and automatic
reviews use the configurable Security Scanner model picker. Leaving that picker
empty uses the node default. No model name is embedded in this plugin.

## Safety boundaries

The scanner is read-only by design. Worker prompts explicitly forbid network
access, dependency installation, file writes, patch application, commits, and
pushes. Repository text, including instructions in source files, READMEs, and
AGENTS files, is treated as untrusted evidence rather than instructions. The
fix command returns a proposal for human or agent review; it does not mutate
the workspace.

The plugin stores only the latest bounded report, verification, and patch
proposal in its namespaced Ryu KV store so the follow-up commands can refer to
the same evidence. /security-clear removes that state.

## Permissions

- hook:run-agent for bounded independent evidence-gathering delegates.
- hook:side-model for report synthesis and optional answer review.
- storage:kv for the latest per-conversation report.
- preferences:read for the model, effort, and worker settings.

## Attribution and implementation

This is a clean-room Ryu implementation informed by the public workflow
descriptions and documentation of [OpenAI Codex Security](https://github.com/openai/codex-security)
and [Anthropic's Claude Security plugin](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-security).
It does not copy Anthropic's proprietary plugin source or bundle either upstream
plugin. The Ryu package adapts the ideas to Ryu's sandboxed hooks, governed
delegation, model picker, and no-auto-apply contract.

The package is published with the Ryu plugin marketplace mirror. Its bundled
Agent Skills are materialized when the plugin is installed from a package.
