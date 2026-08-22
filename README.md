# Ryu Marketplace

The catalog for **Ryu apps, plugins, and portable packages**.

- `.ryu-plugin/marketplace.json` — the generated index. It lists **both**
  tiers: `type: "app"` (apps-store apps, which ship from their own
  `amajorai/ryu-<app>` satellite repos) and `type: "plugin"` (declarative,
  UI-less plugins, whose source is carried here).
  Portable packages are listed in `entries`/`packages` and live under
  `agents/`, `workflows/`, `themes/`, `spaces/`, `profiles/`, and `bundles/`.
- `plugins/plugins/<name>/manifest.json` — the source-of-truth manifest for each
  local first-party plugin; `plugins/lsp/<name>/manifest.json` holds language
  servers; `plugins/external_plugins/<name>/manifest.json` is the matching root
  for hosted/external providers. A declarative plugin IS its manifest.
- `schema/marketplace.schema.json` — the index schema.

This tree is a ONE-WAY mirror generated from the private monorepo by
`tools/mirror-plugins.sh`; do not edit it here (changes are overwritten —
edit the generator instead).

## Apps (48)

Manifest-driven feature apps, grouped by their manifest `category`.

Each ships from its own `amajorai/ryu-<app>` satellite repo (source is

not carried here).

### Automation

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/predict-dark.png" /><img src="./app-icons/predict-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-predict">Autocomplete</a></div> | ✓ | – | – | 0.2.0 | Inline ghost-text autocomplete in any text field on your machine, accepted with Tab. A small… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/recipes-dark.png" /><img src="./app-icons/recipes-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-recipes">Recipes</a></div> | ✓ | – | – | 0.2.0 | Desktop-automation recipes: record → save → replay UI action sequences. Backed by Ghost's… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/warmup-dark.png" /><img src="./app-icons/warmup-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-warmup">Warmup</a></div> | ✓ | – | – | 0.2.0 | Starts your subscription agents' rolling usage windows on your own schedule: a one-word ping to… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/webhooks-dark.png" /><img src="./app-icons/webhooks-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-webhooks">Webhooks</a></div> | ✓ | – | – | 0.2.0 | Inbound webhook endpoint registry: resolved public URLs, signing-secret configuration,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/workflows-dark.png" /><img src="./app-icons/workflows-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-workflows">Workflows</a></div> | ✓ | – | – | 0.2.0 | Workflows: petgraph DAG automation with triggers, durable execution, and a natural-language… |

### Browsers

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/browser-dark.png" /><img src="./app-icons/browser-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-browser">Browser</a></div> | ✓ | ✓ | – | 0.2.0 | A real-Chromium browser (Electron) Ryu runs as a local sidecar and exposes as the grant-gated… |

### Communication

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/mail-dark.png" /><img src="./app-icons/mail-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-mail">Mail</a></div> | ✓ | – | – | 0.2.0 | Agent Inboxes — email as a service for agents. Runs the out-of-process ryu-mail sidecar; Core… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/meetings-dark.png" /><img src="./app-icons/meetings-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-meetings">Meetings</a></div> | ✓ | – | – | 0.2.0 | Meeting notes: record → live transcript → AI notes, auto-saved into the Meetings Space so they… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/teams-dark.png" /><img src="./app-icons/teams-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-teams">Teams</a></div> | ✓ | – | – | 0.2.0 | Teams: named groups of agents you can address as one. Governance shell over the in-crate teams… |

### Creative

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/canvas-dark.png" /><img src="./app-icons/canvas-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-canvas">Canvas</a></div> | ✓ | – | – | 0.2.0 | A node board for generative media: wire up image, video, chat, text-to-speech, speech-to-text,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/reelfarm-dark.png" /><img src="./app-icons/reelfarm-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-reelfarm">Sprout Studio</a></div> | ✓ | – | – | 0.2.0 | A Ryu-native local-first creator workspace: turn a point of view into an AI-assisted short-form… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/whiteboard-dark.png" /><img src="./app-icons/whiteboard-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-whiteboard">Whiteboard</a></div> | ✓ | – | – | 0.2.0 | An Excalidraw whiteboard shipped as a Ryu app: draw, diagram, and rearrange freely, with… |

### Developer Tools

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/blueprint-dark.png" /><img src="./app-icons/blueprint-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-blueprint">Blueprint</a></div> | ✓ | – | – | 0.2.0 | Review an agent's plan before it touches a file. The agent publishes its plan over MCP;… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/checks-dark.png" /><img src="./app-icons/checks-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-checks">Checks</a></div> | ✓ | – | – | 0.2.0 | A local-first verification workspace for planning, running, and reviewing UI, API, and… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/desktop-dark.png" /><img src="./app-icons/desktop-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-desktop">Virtual Desktop</a></div> | ✓ | – | – | 0.2.0 | An interactive virtual desktop for any Ryu node — cloud-managed, self-hosted, or local. The… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/finetune-dark.png" /><img src="./app-icons/finetune-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-finetune">Fine-tuning</a></div> | ✓ | – | – | 0.2.0 | A LoRA/QLoRA training studio: launch fine-tune jobs on this node's GPU or a remote Ryu Cloud GPU… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/healing-dark.png" /><img src="./app-icons/healing-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-healing">Self-Healing</a></div> | ✓ | – | – | 0.2.0 | Self-healing: failed runs are diagnosed by a Gateway side-model and proposed fixes are delivered… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/monitors-dark.png" /><img src="./app-icons/monitors-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-monitors">Monitors</a></div> | ✓ | – | – | 0.2.0 | Website monitors: price, stock, keyword, content, and uptime watches with cross-device… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/pull-requests-dark.png" /><img src="./app-icons/pull-requests-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-pull-requests">Pull Requests</a></div> | ✓ | – | – | 0.2.0 | A focused GitHub work inbox for Ryu. Browse pull requests and issues across repositories,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/simulator-dark.png" /><img src="./app-icons/simulator-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-simulator">Simulators</a></div> | ✓ | – | – | 0.2.0 | Drive iOS Simulators (macOS + Xcode) and Android Emulators from a workspace tab. Ryu runs the… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/skill-editor-dark.png" /><img src="./app-icons/skill-editor-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-skill-editor">Skill Editor</a></div> | ✓ | – | – | 0.2.0 | Author a user-owned Agent Skill (SKILL.md): front-matter fields (name / description / allowed… |

### Documents

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/docling-dark.png" /><img src="./app-icons/docling-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-docling">Docling</a></div> | ✓ | – | – | 0.2.0 | Document parsing via IBM's MIT-licensed Docling — the highest-fidelity `document.parse` backend.… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/markitdown-dark.png" /><img src="./app-icons/markitdown-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-markitdown">MarkItDown</a></div> | ✓ | – | – | 0.2.0 | Document parsing via Microsoft's MIT-licensed MarkItDown library — the default `document.parse`… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/mineru-dark.png" /><img src="./app-icons/mineru-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-mineru">MinerU</a></div> | ✓ | – | – | 0.2.0 | Document parsing via MinerU (opendatalab) — the highest-fidelity `document.parse` backend, and… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/unstructured-dark.png" /><img src="./app-icons/unstructured-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-unstructured">Unstructured</a></div> | ✓ | – | – | 0.2.0 | Document parsing via the Apache-2.0 Unstructured library — the broadest-coverage… |

### Games

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/token-table-dark.png" /><img src="./app-icons/token-table-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-token-table">Token Table</a></div> | ✓ | – | – | 0.2.0 | A cosmetic six-max no-limit Texas Hold'em table with simulated tokens, deterministic server-side… |

### Knowledge & Memory

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/learning-dark.png" /><img src="./app-icons/learning-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-learning">Learning</a></div> | ✓ | – | – | 0.2.0 | Learning loop: turn chats and runs into reusable skills, gated by the approval Inbox, with an… |

### Media & Voice

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/clips-dark.png" /><img src="./app-icons/clips-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-clips">Clips</a></div> | ✓ | – | – | 0.2.0 | Clips: capture and browse screen/timeline clips. A Core→Shadow proxy that depends on the Shadow… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/dictation-dark.png" /><img src="./app-icons/dictation-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-dictation">Dictation</a></div> | ✓ | – | – | 0.2.0 | System-wide dictation and agent-ask via the Island companion: speak anywhere to type a… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/subtitles-dark.png" /><img src="./app-icons/subtitles-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-subtitles">Subtitles</a></div> | ✓ | – | – | 0.2.0 | Pick a video on this machine, transcribe it locally, translate the transcript into the language… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/voice-dark.png" /><img src="./app-icons/voice-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-voice">Voice</a></div> | ✓ | – | – | 0.2.0 | Voice data path: speech-to-text transcription (whisper.cpp) and text-to-speech (OuteTTS + the… |

### Productivity

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/activity-dark.png" /><img src="./app-icons/activity-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-activity">Activity</a></div> | ✓ | – | – | 0.2.0 | The unified activity feed: everything happening on this node — monitor alerts, finished tasks,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/agent-status-dark.png" /><img src="./app-icons/agent-status-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-agent-status">Agent Status</a></div> | ✓ | – | – | 0.2.0 | Splits your agent runs across three sidebar sections — Working, Needs input and Done — each row… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/calendar-dark.png" /><img src="./app-icons/calendar-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-calendar">Calendar</a></div> | ✓ | – | – | 0.2.0 | The scheduled-runs calendar: every agent and workflow scheduled job projected onto Month, Week,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/crm-dark.png" /><img src="./app-icons/crm-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-crm">Harbor</a></div> | ✓ | – | – | 0.2.0 | A CRM that starts as a data model rather than a fixed set of screens. Harbor ships the five… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/dashboards-dark.png" /><img src="./app-icons/dashboards-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-dashboards">Dashboards</a></div> | ✓ | – | – | 0.2.0 | Dashboards: composable widget boards that assemble live views over monitors, meetings, quests,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/drafts-dark.png" /><img src="./app-icons/drafts-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-drafts">Drafts</a></div> | ✓ | – | – | 0.2.0 | A durable outbox for messages you have not sent yet. Anything you type into a composer and walk… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/mission-control-dark.png" /><img src="./app-icons/mission-control-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-mission-control">Mission Control</a></div> | ✓ | – | – | 0.2.0 | The project-level view over many chats: recent sessions and what each one accomplished, per-day… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/news-dark.png" /><img src="./app-icons/news-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-news">Wire</a></div> | ✓ | – | – | 0.2.0 | Your own newsroom, running on your node. Wire pulls RSS, Atom and JSON Feed in on a schedule —… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/quests-dark.png" /><img src="./app-icons/quests-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-quests">Quests</a></div> | ✓ | – | – | 0.2.0 | Quests: auto-detecting todos surfaced from your chats and activity, tracked as a lightweight… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/rlm-dark.png" /><img src="./app-icons/rlm-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-rlm">Recursive Language Model</a></div> | ✓ | – | – | 0.2.0 | Answer questions about a corpus far larger than any model's context window — without putting it… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/social-dark.png" /><img src="./app-icons/social-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-social">Outpost</a></div> | ✓ | – | – | 0.2.0 | A publishing command center for every social account you run: compose once, tailor per platform,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/timeline-dark.png" /><img src="./app-icons/timeline-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-timeline">Timeline</a></div> | ✓ | – | – | 0.2.0 | The activity timeline with Replay lanes and a chronological History view over Shadow's captured… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/tuition-dark.png" /><img src="./app-icons/tuition-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-tuition">Tuition</a></div> | ✓ | – | – | 0.2.0 | A tutor for one learner — you. Point it at your own syllabus, chapter or notes and it builds a… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/ugc-dark.png" /><img src="./app-icons/ugc-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-ugc">UGC</a></div> | ✓ | – | – | 0.2.0 | Creator-marketing campaign tracker: briefs, a creator roster, post submissions with review,… |

### Research

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/research-dark.png" /><img src="./app-icons/research-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-research">Research</a></div> | ✓ | – | – | 0.2.0 | Deep research: multi-step web research runs backed by the autoresearch sidecar, with sources,… |

### Security

| App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/approvals-dark.png" /><img src="./app-icons/approvals-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-approvals">Approvals</a></div> | ✓ | – | – | 0.2.0 | Approval inbox: a human-in-the-loop queue where agent-proposed actions, edits, and fixes wait… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/reasoning-dark.png" /><img src="./app-icons/reasoning-light.png" width="32" alt="" /></picture><br /><a href="https://github.com/amajorai/ryu-reasoning">Automated Reasoning</a></div> | ✓ | – | – | 0.2.0 | Check an answer against a written policy with a solver instead of a second opinion. Point it at… |

## Third-party listings (GitHub topic discovery)

Third-party apps and plugins are discovered automatically from GitHub
topics — add **`ryu-app`** or **`ryu-plugin`** to your repository and it
becomes discoverable in the Ryu marketplace (desktop + web).

> Listings discovered by topic are **not reviewed** by Ryu. Install at
> your own discretion — read the manifest, check what permission grants
> it requests, and prefer repos you can audit.

## First-party plugins (76)

Declarative `@ryu/*` plugins, grouped by their manifest `category`.

### Automation

| Plugin | Official | System | Hidden | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/agent-comms/icon-dark.png" /><img src="./plugins/plugins/agent-comms/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/agent-comms/">Switchboard</a></div> | ✓ | – | – | – | 0.2.0 | Lets the agents on this node talk to each other. Any agent can look up who else is here, leave… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/bytebot/icon-dark.png" /><img src="./plugins/plugins/bytebot/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/bytebot/">Bytebot Desktop</a></div> | ✓ | – | – | – | 0.2.0 | Drives a Bytebot desktop (https://github.com/bytebot-ai/bytebot) through `bytebotd`, its local… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/effort-escalator/icon-dark.png" /><img src="./plugins/plugins/effort-escalator/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/effort-escalator/">Effort Escalator</a></div> | ✓ | – | – | – | 0.2.0 | Detects stalled work with a cheap background judge and moves the next turn up a configured… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/ghost/icon-dark.png" /><img src="./plugins/plugins/ghost/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/ghost/">Ghost</a></div> | ✓ | ✓ | – | – | 0.2.0 | Desktop automation: 29 screen perception and input control tools. Cross-platform (Windows,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/pi-subagent/icon-dark.png" /><img src="./plugins/plugins/pi-subagent/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/pi-subagent/">Subagents</a></div> | ✓ | – | – | – | 0.2.0 | Adds the Task tool to the managed Pi agent, so it can delegate a bounded, context-isolated job… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/usage-pacer/icon-dark.png" /><img src="./plugins/plugins/usage-pacer/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/usage-pacer/">Usage Pacer</a></div> | ✓ | – | – | – | 0.2.0 | Keeps subscription agents usable for the whole rolling window. It can pace usage down with a… |

### Browsers

| Plugin | Official | System | Hidden | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/agentbrowser/icon-dark.png" /><img src="./plugins/plugins/agentbrowser/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/agentbrowser/">Agent Browser</a></div> | ✓ | ✓ | – | – | 0.2.0 | Browser automation via the `agent-browser` CLI's MCP server (https://agent-browser.dev).… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/ego-browser/icon-dark.png" /><img src="./plugins/plugins/ego-browser/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/ego-browser/">Ego Browser</a></div> | ✓ | – | – | – | 0.2.0 | Ego lite (https://github.com/citrolabs/ego-lite) as an optional provider for Ryu's swappable… |

### Developer Tools

| Plugin | Official | System | Hidden | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/agentation/icon-dark.png" /><img src="./plugins/plugins/agentation/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/agentation/">Agentation</a></div> | ✓ | – | – | – | 0.2.0 | Visual feedback for coding agents. Agentation connects UI annotations from a running web app to… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/agents-md-tail/icon-dark.png" /><img src="./plugins/plugins/agents-md-tail/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/agents-md-tail/">AGENTS.md Tail</a></div> | ✓ | – | – | – | 0.2.0 | Experimental context hook that keeps the active AGENTS.md instructions at the head and repeats… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/docs/icon-dark.png" /><img src="./plugins/plugins/docs/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/docs/">Ryu Docs</a></div> | ✓ | ✓ | – | – | 0.2.0 | Read-only MCP access to the Ryu documentation on docs.ryuhq.com — search the docs and pull any… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/dynamic-workflows/icon-dark.png" /><img src="./plugins/plugins/dynamic-workflows/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/dynamic-workflows/">dynamic-workflows</a></div> | ✓ | – | – | – | 0.2.0 | Run a validated, bounded fan-out of clean-context delegates. |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/expect/icon-dark.png" /><img src="./plugins/plugins/expect/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/expect/">Expect</a></div> | ✓ | – | – | – | 0.2.0 | Browser-based QA for agent code. Expect reads the current changes, creates a test plan, and runs… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/headroom/icon-dark.png" /><img src="./plugins/plugins/headroom/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/headroom/">Headroom Compression</a></div> | ✓ | – | – | – | 0.2.0 | Context compression (chopratejas/headroom): compress tool outputs, logs, files, and RAG chunks.… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/hook-observers/icon-dark.png" /><img src="./plugins/plugins/hook-observers/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/hook-observers/">Hook Observers</a></div> | ✓ | – | – | – | 0.2.0 | A worked reference for the turn-hook events Ryu can fire: five observer hooks watching… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/hook-session-context/icon-dark.png" /><img src="./plugins/plugins/hook-session-context/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/hook-session-context/">Session Context</a></div> | ✓ | – | – | – | 0.2.0 | Injects the current date and time at the start of every session, so the agent stops guessing… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/pi-monitor/icon-dark.png" /><img src="./plugins/plugins/pi-monitor/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/pi-monitor/">Monitor</a></div> | ✓ | – | – | – | 0.2.0 | Adds the monitor tool to the managed Pi agent, so it can watch a command or WebSocket in the… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/pi-shell/icon-dark.png" /><img src="./plugins/plugins/pi-shell/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/pi-shell/">Background Bash</a></div> | ✓ | – | – | – | 0.2.0 | Adds bash_background / bash_output / bash_kill to the managed Pi agent, so a long-running… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/pxpipe/icon-dark.png" /><img src="./plugins/plugins/pxpipe/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/pxpipe/">pxpipe</a></div> | ✓ | – | – | – | 0.2.0 | Token-saving loopback proxy (https://github.com/teamchong/pxpipe): it renders the bulky, static… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/rtk/icon-dark.png" /><img src="./plugins/plugins/rtk/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/rtk/">RTK (Rust Token Killer)</a></div> | ✓ | – | – | – | 0.2.0 | Run a dev command through RTK (Rust Token Killer) and get a token-compressed version of its… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/rules/icon-dark.png" /><img src="./plugins/plugins/rules/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/rules/">Rules</a></div> | ✓ | – | – | – | 0.2.0 | Discover Cursor- and Claude-style project rules and apply them to agent context, with per-agent… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/sample/icon-dark.png" /><img src="./plugins/plugins/sample/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/sample/">Research Assistant</a></div> | ✓ | – | ✓ | – | 0.2.0 | The reference plugin: a minimal example that declares one of each runnable kind — an agent, a… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/sample-widget/icon-dark.png" /><img src="./plugins/plugins/sample-widget/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/sample-widget/">Sample Widget</a></div> | ✓ | – | ✓ | – | 0.2.0 | Reference third-party MCP widget plugin. A tiny local Node MCP server (server.mjs) exposes one… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/toolsmith-example/icon-dark.png" /><img src="./plugins/plugins/toolsmith-example/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/toolsmith-example/">toolsmith-example</a></div> | ✓ | – | ✓ | – | 0.2.0 | Worked example for tools/toolsmith — a real, verified inline_deno tool. Not registered with Core… |

### Knowledge & Memory

| Plugin | Official | System | Hidden | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/honcho/icon-dark.png" /><img src="./plugins/plugins/honcho/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/honcho/">Honcho</a></div> | ✓ | – | – | – | 0.2.0 | Give the swappable `memory` layer a provider that MODELS the user instead of only storing rows,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/mem0/icon-dark.png" /><img src="./plugins/plugins/mem0/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/mem0/">Mem0</a></div> | ✓ | – | – | – | 0.2.0 | Read and write a hosted Mem0 memory project (https://mem0.ai) through the Mem0 Platform REST… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/no-more-mistakes/icon-dark.png" /><img src="./plugins/plugins/no-more-mistakes/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/no-more-mistakes/">No More Mistakes</a></div> | ✓ | – | – | – | 0.2.0 | Notices when you correct the agent, writes the lesson down as a one-line rule in a Space, and… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/shadow/icon-dark.png" /><img src="./plugins/plugins/shadow/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/shadow/">Shadow</a></div> | ✓ | ✓ | – | – | 0.2.0 | Search everything Shadow has captured (screen text, audio transcripts, input) and summarize… |

### Models

| Plugin | Official | System | Hidden | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/chatgpt-web/icon-dark.png" /><img src="./plugins/plugins/chatgpt-web/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/chatgpt-web/">ChatGPT Web</a></div> | ✓ | – | – | – | 0.2.0 | Use a ChatGPT Web subscription through Ryu's signed-in Browser app as an OpenAI-compatible model… |

### Productivity

| Plugin | Official | System | Hidden | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/action-summary/icon-dark.png" /><img src="./plugins/plugins/action-summary/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/action-summary/">Action Summary</a></div> | ✓ | – | – | – | 0.2.0 | Explains streamed thinking blocks and tool calls in one plain-language line per action, using a… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/ambient-elevator/icon-dark.png" /><img src="./plugins/plugins/ambient-elevator/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/ambient-elevator/">Ambient Elevator</a></div> | ✓ | – | – | – | 0.2.0 | Plays one low-volume elevator track while any Ryu agent is actively working, then stops when the… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/auto-continue/icon-dark.png" /><img src="./plugins/plugins/auto-continue/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/auto-continue/">Auto Continue</a></div> | ✓ | – | – | – | 0.2.0 | After each turn while armed, a local sub-agent scans the reply and the workspace for work that… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/chat-title/icon-dark.png" /><img src="./plugins/plugins/chat-title/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/chat-title/">Chat Title</a></div> | ✓ | – | – | – | 0.2.0 | Auto-renames a chat as soon as the first reply lands, then again after every N completed… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/expanded-composer/icon-dark.png" /><img src="./plugins/plugins/expanded-composer/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/expanded-composer/">Expanded Composer</a></div> | ✓ | – | – | – | 0.2.0 | Expand the current chat composer in place while keeping the same draft, attachments, and send… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/ghost-chats/icon-dark.png" /><img src="./plugins/plugins/ghost-chats/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/ghost-chats/">Temporary Chats</a></div> | ✓ | – | – | – | 0.2.0 | Start a private temporary chat that stays in the current tab and leaves no conversation history,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/goal/icon-dark.png" /><img src="./plugins/plugins/goal/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/goal/">Goal</a></div> | ✓ | – | – | – | 0.2.0 | Give the agent a goal with `/goal` or let an agent set one with `goal.set`; it keeps working… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/no-ai-slop/icon-dark.png" /><img src="./plugins/plugins/no-ai-slop/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/no-ai-slop/">No AI Slop</a></div> | ✓ | – | – | – | 0.2.0 | Bundles the `no-ai-slop` editing skill and runs it on every finished answer: a separate reviewer… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/output-styles/icon-dark.png" /><img src="./plugins/plugins/output-styles/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/output-styles/">Output Styles</a></div> | ✓ | – | – | – | 0.2.0 | The ten built-in output styles — ELI5, I have ADHD, Explanatory, Learning, Proactive, Plain… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/plan-continue/icon-dark.png" /><img src="./plugins/plugins/plan-continue/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/plan-continue/">Plan Continue</a></div> | ✓ | – | – | – | 0.2.0 | While plan mode is on and the plan has not been accepted, this injects a follow-up turn after… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/prompt-suggestions/icon-dark.png" /><img src="./plugins/plugins/prompt-suggestions/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/prompt-suggestions/">Prompt Suggestions</a></div> | ✓ | – | – | – | 0.2.0 | Fast next-prompt suggestions in the chat composer, generated by a lightweight side agent from… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/reactions/icon-dark.png" /><img src="./plugins/plugins/reactions/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/reactions/">Message Reactions</a></div> | ✓ | – | – | – | 0.2.0 | Adds emoji reactions to persisted chat messages through the shared message-action contribution… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/recap/icon-dark.png" /><img src="./plugins/plugins/recap/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/recap/">Recap</a></div> | ✓ | – | – | – | 0.2.0 | Ends a long agent turn with a short recap of what it actually did — the work, the files and… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/reconnect-retry/icon-dark.png" /><img src="./plugins/plugins/reconnect-retry/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/reconnect-retry/">Reconnect Retry</a></div> | ✓ | – | – | – | 0.2.0 | Remember chats that were running when the selected node or network went away, then retry each… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/side-chats/icon-dark.png" /><img src="./plugins/plugins/side-chats/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/side-chats/">Side Chats</a></div> | ✓ | – | – | – | 0.2.0 | Ask focused questions about the current conversation without adding another turn to the main… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/tokenmaxxing/icon-dark.png" /><img src="./plugins/plugins/tokenmaxxing/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/tokenmaxxing/">Tokenmaxxing</a></div> | ✓ | – | – | – | 0.2.0 | Opt-in notification when all delegated agents finish. |

### Research

| Plugin | Official | System | Hidden | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/advisor/icon-dark.png" /><img src="./plugins/plugins/advisor/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/advisor/">Advisor</a></div> | ✓ | – | – | – | 0.2.0 | Consult a stronger reviewer model for a second opinion — as an auto-review turn hook (toggle /… |

### Search

| Plugin | Official | System | Hidden | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/brave/icon-dark.png" /><img src="./plugins/plugins/brave/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/brave/">Brave Search</a></div> | ✓ | – | – | – | 0.2.0 | Independent web search via the Brave Search API (https://brave.com/search/api/), exposed as one… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/exa/icon-dark.png" /><img src="./plugins/plugins/exa/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/exa/">Exa Search</a></div> | ✓ | – | – | – | 0.2.0 | Neural and keyword web search via the Exa API (https://exa.ai), exposed as two declarative HTTP… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/firecrawl/icon-dark.png" /><img src="./plugins/plugins/firecrawl/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/firecrawl/">Firecrawl</a></div> | ✓ | – | – | – | 0.2.0 | Web search and page scraping via the Firecrawl v2 API (https://firecrawl.dev), exposed as two… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/parallel/icon-dark.png" /><img src="./plugins/plugins/parallel/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/parallel/">Parallel Search</a></div> | ✓ | – | – | – | 0.2.0 | Web search and content extraction via Parallel (https://parallel.ai), exposed as three… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/scrapling/icon-dark.png" /><img src="./plugins/plugins/scrapling/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/scrapling/">Scrapling</a></div> | ✓ | – | – | – | 0.2.0 | Adaptive web-page extraction via the Scrapling MCP server (https://scrapling.readthedocs.io), a… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/serper/icon-dark.png" /><img src="./plugins/plugins/serper/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/serper/">Serper</a></div> | ✓ | – | – | – | 0.2.0 | Google's own search results as JSON via the Serper API (https://serper.dev), plus single-page… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/spider/icon-dark.png" /><img src="./plugins/plugins/spider/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/spider/">Spider</a></div> | ✓ | – | – | – | 0.2.0 | High-performance web crawling and content extraction via the Spider CLI (https://spider.cloud),… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/spidercloud/icon-dark.png" /><img src="./plugins/plugins/spidercloud/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/spidercloud/">Spider Cloud</a></div> | ✓ | – | – | – | 0.2.0 | Hosted multi-page web crawling via the Spider Cloud API (https://spider.cloud), exposed as one… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/tavily/icon-dark.png" /><img src="./plugins/plugins/tavily/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/tavily/">Tavily Search</a></div> | ✓ | – | – | – | 0.2.0 | Search-and-extract for agents via the Tavily API (https://tavily.com), exposed as two… |

### Security

| Plugin | Official | System | Hidden | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/bitwarden/icon-dark.png" /><img src="./plugins/plugins/bitwarden/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/bitwarden/">Bitwarden Secrets Manager</a></div> | ✓ | – | – | – | 0.2.0 | Pull API keys from Bitwarden Secrets Manager on demand instead of storing them in plaintext —… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/double-check/icon-dark.png" /><img src="./plugins/plugins/double-check/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/double-check/">Double Check</a></div> | ✓ | – | – | – | 0.2.0 | Sends every answer to a second model for review before you act on it, so mistakes get caught by… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/firewall/icon-dark.png" /><img src="./plugins/plugins/firewall/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/firewall/">Gateway Firewall</a></div> | ✓ | – | – | – | 0.2.0 | An on/off switch over the Gateway's built-in firewall, which screens model traffic for prompt… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/observer-agents/icon-dark.png" /><img src="./plugins/plugins/observer-agents/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/observer-agents/">Observer Agents</a></div> | ✓ | – | – | – | 0.2.0 | Adds an opt-in background reviewer that watches the latest agent activity and sends concise… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/proof/icon-dark.png" /><img src="./plugins/plugins/proof/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/proof/">Proof of Work</a></div> | ✓ | – | – | – | 0.2.0 | The stricter sibling of `/goal`: an independent verifier agent has to prove with tool-gathered… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/receipts/icon-dark.png" /><img src="./plugins/plugins/receipts/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/receipts/">Receipts</a></div> | ✓ | – | – | – | 0.2.0 | Verify work with visual evidence: `/receipt <goal>` makes the agent capture a screenshot or… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/security-guidance/icon-dark.png" /><img src="./plugins/plugins/security-guidance/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/security-guidance/">Security Guidance</a></div> | ✓ | – | – | – | 0.2.0 | Scans each answer for security vulnerabilities and has a second model review the code before you… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/security-scanner/icon-dark.png" /><img src="./plugins/plugins/security-scanner/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/security-scanner/">Security Scanner</a></div> | ✓ | – | – | – | 0.2.0 | A model-agnostic security workbench for Ryu: map the architecture, hunt for vulnerabilities,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plugins/tool-firewall/icon-dark.png" /><img src="./plugins/plugins/tool-firewall/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/plugins/tool-firewall/">Tool Firewall</a></div> | ✓ | – | – | – | 0.2.0 | A worked reference for pre- and post-tool hooks: the pre hook denies any tool call whose input… |

### LSP

| Plugin | Official | System | Hidden | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/clangd-lsp/icon-dark.png" /><img src="./plugins/lsp/clangd-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/clangd-lsp/">Clangd (C/C++)</a></div> | ✓ | – | – | – | 0.2.0 | C/C++ language server (clangd) for the ryu agent: definitions, references, hover, symbols,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/csharp-lsp/icon-dark.png" /><img src="./plugins/lsp/csharp-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/csharp-lsp/">C# LSP</a></div> | ✓ | – | – | – | 0.2.0 | C# language server (csharp-ls) for the ryu agent: definitions, references, hover, symbols,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/gopls-lsp/icon-dark.png" /><img src="./plugins/lsp/gopls-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/gopls-lsp/">Go LSP</a></div> | ✓ | – | – | – | 0.2.0 | Go language server (gopls) for the ryu agent: definitions, references, hover, symbols,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/jdtls-lsp/icon-dark.png" /><img src="./plugins/lsp/jdtls-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/jdtls-lsp/">Java LSP</a></div> | ✓ | – | – | – | 0.2.0 | Java language server (Eclipse JDT.LS) for the ryu agent: definitions, references, hover,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/kotlin-lsp/icon-dark.png" /><img src="./plugins/lsp/kotlin-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/kotlin-lsp/">Kotlin LSP</a></div> | ✓ | – | – | – | 0.2.0 | Kotlin language server for the ryu agent: definitions, references, hover, symbols,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/lua-lsp/icon-dark.png" /><img src="./plugins/lsp/lua-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/lua-lsp/">Lua LSP</a></div> | ✓ | – | – | – | 0.2.0 | Lua language server (lua-language-server) for the ryu agent: definitions, references, hover,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/php-lsp/icon-dark.png" /><img src="./plugins/lsp/php-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/php-lsp/">PHP LSP</a></div> | ✓ | – | – | – | 0.2.0 | PHP language server (Intelephense) for the ryu agent: definitions, references, hover, symbols,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/pyright-lsp/icon-dark.png" /><img src="./plugins/lsp/pyright-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/pyright-lsp/">Python LSP</a></div> | ✓ | – | – | – | 0.2.0 | Python language server (Pyright) for the ryu agent: type checking plus definitions, references,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/ruby-lsp/icon-dark.png" /><img src="./plugins/lsp/ruby-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/ruby-lsp/">Ruby LSP</a></div> | ✓ | – | – | – | 0.2.0 | Ruby language server (ruby-lsp) for the ryu agent: definitions, references, hover, symbols,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/rust-analyzer-lsp/icon-dark.png" /><img src="./plugins/lsp/rust-analyzer-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/rust-analyzer-lsp/">Rust LSP</a></div> | ✓ | – | – | – | 0.2.0 | Rust language server (rust-analyzer) for the ryu agent: definitions, references, hover, symbols,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/swift-lsp/icon-dark.png" /><img src="./plugins/lsp/swift-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/swift-lsp/">Swift LSP</a></div> | ✓ | – | – | – | 0.2.0 | Swift language server (SourceKit-LSP) for the ryu agent: definitions, references, hover,… |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/lsp/typescript-lsp/icon-dark.png" /><img src="./plugins/lsp/typescript-lsp/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/lsp/typescript-lsp/">TypeScript &amp; JavaScript LSP</a></div> | ✓ | – | – | – | 0.2.0 | TypeScript/JavaScript language server for the ryu agent: definitions, references, hover,… |

## External plugins (2)

Hosted providers that connect Ryu's swappable layers to an outside service.

### Browsers

| Plugin | External | Layer | Version | What it is |
| --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/external_plugins/cloudflare-browser-run/icon-dark.png" /><img src="./plugins/external_plugins/cloudflare-browser-run/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/external_plugins/cloudflare-browser-run/">Cloudflare Browser Run</a></div> | ✓ | – | 0.2.0 | Hosted Browser Run quick actions over Cloudflare's remote OAuth MCP server. Adds URL-scoped… |

### Productivity

| Plugin | External | Layer | Version | What it is |
| --- | --- | --- | --- | --- |
| <div align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/external_plugins/composio-connect/icon-dark.png" /><img src="./plugins/external_plugins/composio-connect/icon-light.png" width="32" alt="" /></picture><br /><a href="./plugins/external_plugins/composio-connect/">Composio Connect</a></div> | ✓ | – | 0.2.0 | Connect Ryu to Composio's hosted For You MCP server with OAuth. The connection exposes… |

## Portable packages (19)

Every package is an editable folder and can also be packed as a deterministic `.ryupack` archive.

### Creative

| Package | Version | Checksum | What it is |
| --- | --- | --- | --- |
| [animator](./agents/animator/) | 0.2.0 | `fc0820e82b34…` | Expert animation director and creative technologist for technical explainers, data… |

### Design

| Package | Version | Checksum | What it is |
| --- | --- | --- | --- |
| [design-director](./agents/design-director/) | 0.2.0 | `236cbf917743…` | Expert product design director and design engineer for UI/UX, responsive systems, motion,… |

### Marketing

| Package | Version | Checksum | What it is |
| --- | --- | --- | --- |
| [brand-presence](./agents/brand-presence/) | 0.2.0 | `63d8f5cd18de…` | Starts with a brand presence check and monitors the public web for new mentions, sentiment, and… |
| [marketing-studio](./agents/marketing-studio/) | 0.2.0 | `4350e8c3b77c…` | Generates on-brand marketing content and production-ready visual directions with Hyperframes and… |

### Monitoring

| Package | Version | Checksum | What it is |
| --- | --- | --- | --- |
| [codex-quota-reset-watch](./agents/codex-quota-reset-watch/) | 0.2.0 | `b493eb6045aa…` | Checks willcodexquotareset.com every 30 minutes, remembers the last forecast, and sends a… |

### Operations

| Package | Version | Checksum | What it is |
| --- | --- | --- | --- |
| [expiry-date-tracker](./agents/expiry-date-tracker/) | 0.2.0 | `6b313aeafb8e…` | Reviews the dates in your connected documents and Spaces, then calls out what is expiring soon… |

### Security

| Package | Version | Checksum | What it is |
| --- | --- | --- | --- |
| [security-guard](./agents/security-guard/) | 0.2.0 | `444b5c1f0fe2…` | Runs a fast hourly configuration check and a deeper midnight diagnostic pass over Gateway and… |

### orchestration

| Package | Version | Checksum | What it is |
| --- | --- | --- | --- |
| [autonomous-agent](./workflows/autonomous-agent/) | 0.2.0 | `adf9fb2d73f1…` | A tool-using agent runs its own loop, wrapped in a bounded durable loop until it is done. |
| [classify-and-act](./workflows/classify-and-act/) | 0.2.0 | `c5abdced5b20…` | Classify the request, then hand it to a specialized agent per class. |
| [orchestrator-workers](./workflows/orchestrator-workers/) | 0.2.0 | `b4e3ec216ba2…` | An orchestrator LLM plans subtasks, delegates them to workers, then integrates the results. |
| [parallelization](./workflows/parallelization/) | 0.2.0 | `13120f52b734…` | Fan the task out to independent clean-context workers, then synthesize their results. |
| [prompt-chaining](./workflows/prompt-chaining/) | 0.2.0 | `e0bad33f3f86…` | Decompose a task into a fixed sequence of LLM steps, each feeding the next (outline → draft →… |
| [routing](./workflows/routing/) | 0.2.0 | `9d910c1ae021…` | Classify the input, then branch to the specialized handler for that class. |

### quality

| Package | Version | Checksum | What it is |
| --- | --- | --- | --- |
| [adversarial-verification](./workflows/adversarial-verification/) | 0.2.0 | `98a0728badf8…` | Generate an answer, have N independent verifiers vote, and accept on majority — else revise. |
| [evaluator-optimizer](./workflows/evaluator-optimizer/) | 0.2.0 | `c24555b182c6…` | Generate a draft, then iteratively critique and rewrite it over several bounded passes. |
| [fan-out-synthesize](./workflows/fan-out-synthesize/) | 0.2.0 | `2748d5502582…` | Fan work out over items to independent sub-agents, then merge their outputs into one result. |
| [generate-and-filter](./workflows/generate-and-filter/) | 0.2.0 | `eb447ce349b6…` | Generate N proposals in parallel, then score and select the best. |
| [tournament](./workflows/tournament/) | 0.2.0 | `d24a5d64430f…` | Generate N candidates in parallel, then pick a winner by pairwise comparison. |

### research

| Package | Version | Checksum | What it is |
| --- | --- | --- | --- |
| [autoresearch](./workflows/autoresearch/) | 0.2.0 | `683b409e3bce…` | Requires the Research app (@ryu/research) to be enabled — it provides the research__* tools this… |

