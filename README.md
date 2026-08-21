# Ryu Marketplace

The catalog for **Ryu apps, plugins, and portable packages**.

- `.ryu-plugin/marketplace.json` — the generated index. It lists **both**
  tiers: `type: "app"` (apps-store apps, which ship from their own
  `amajorai/ryu-<app>` satellite repos) and `type: "plugin"` (declarative,
  UI-less plugins, whose source is carried here).
  Portable packages are listed in `entries`/`packages` and live under
  `agents/`, `workflows/`, `themes/`, `spaces/`, `profiles/`, and `bundles/`.
- `plugins/<name>/manifest.json` — the source-of-truth manifest for each
  local first-party plugin; `external_plugins/<name>/manifest.json` is the
  matching root for hosted/external providers. A declarative plugin IS its manifest.
- `schema/marketplace.schema.json` — the index schema.

This tree is a ONE-WAY mirror generated from the private monorepo by
`tools/mirror-plugins.sh`; do not edit it here (changes are overwritten —
edit the generator instead).

## Apps (47)

Manifest-driven feature apps, grouped by their manifest `category`.

Each ships from its own `amajorai/ryu-<app>` satellite repo (source is

not carried here).

### Automation

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/predict-dark.png" /><img src="./app-icons/predict-light.png" width="32" alt="" /></picture> | [Autocomplete](https://github.com/amajorai/ryu-predict) | ✓ | – | – | 0.2.0 | Inline ghost-text autocomplete in any text field on your machine, accepted with Tab. A small… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/recipes-dark.png" /><img src="./app-icons/recipes-light.png" width="32" alt="" /></picture> | [Recipes](https://github.com/amajorai/ryu-recipes) | ✓ | – | – | 0.2.0 | Desktop-automation recipes: record → save → replay UI action sequences. Backed by Ghost's… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/warmup-dark.png" /><img src="./app-icons/warmup-light.png" width="32" alt="" /></picture> | [Warmup](https://github.com/amajorai/ryu-warmup) | ✓ | – | – | 0.2.0 | Starts your subscription agents' rolling usage windows on your own schedule: a one-word ping to… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/webhooks-dark.png" /><img src="./app-icons/webhooks-light.png" width="32" alt="" /></picture> | [Webhooks](https://github.com/amajorai/ryu-webhooks) | ✓ | – | – | 0.2.0 | Inbound webhook endpoint registry: resolved public URLs, signing-secret configuration,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/workflows-dark.png" /><img src="./app-icons/workflows-light.png" width="32" alt="" /></picture> | [Workflows](https://github.com/amajorai/ryu-workflows) | ✓ | – | – | 0.2.0 | Workflows: petgraph DAG automation with triggers, durable execution, and a natural-language… |

### Browsers

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/browser-dark.png" /><img src="./app-icons/browser-light.png" width="32" alt="" /></picture> | [Browser](https://github.com/amajorai/ryu-browser) | ✓ | ✓ | – | 0.2.0 | A real-Chromium browser (Electron) Ryu runs as a local sidecar and exposes as the grant-gated… |

### Communication

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/mail-dark.png" /><img src="./app-icons/mail-light.png" width="32" alt="" /></picture> | [Mail](https://github.com/amajorai/ryu-mail) | ✓ | – | – | 0.2.0 | Agent Inboxes — email as a service for agents. Runs the out-of-process ryu-mail sidecar; Core… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/meetings-dark.png" /><img src="./app-icons/meetings-light.png" width="32" alt="" /></picture> | [Meetings](https://github.com/amajorai/ryu-meetings) | ✓ | – | – | 0.2.0 | Meeting notes: record → live transcript → AI notes, auto-saved into the Meetings Space so they… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/teams-dark.png" /><img src="./app-icons/teams-light.png" width="32" alt="" /></picture> | [Teams](https://github.com/amajorai/ryu-teams) | ✓ | – | – | 0.2.0 | Teams: named groups of agents you can address as one. Governance shell over the in-crate teams… |

### Creative

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/canvas-dark.png" /><img src="./app-icons/canvas-light.png" width="32" alt="" /></picture> | [Canvas](https://github.com/amajorai/ryu-canvas) | ✓ | – | – | 0.2.0 | A node board for generative media: wire up image, video, chat, text-to-speech, speech-to-text,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/reelfarm-dark.png" /><img src="./app-icons/reelfarm-light.png" width="32" alt="" /></picture> | [Sprout Studio](https://github.com/amajorai/ryu-reelfarm) | ✓ | – | – | 0.2.0 | A Ryu-native local-first creator workspace: turn a point of view into an AI-assisted short-form… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/whiteboard-dark.png" /><img src="./app-icons/whiteboard-light.png" width="32" alt="" /></picture> | [Whiteboard](https://github.com/amajorai/ryu-whiteboard) | ✓ | – | – | 0.2.0 | An Excalidraw whiteboard shipped as a Ryu app: draw, diagram, and rearrange freely, with… |

### Developer Tools

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/blueprint-dark.png" /><img src="./app-icons/blueprint-light.png" width="32" alt="" /></picture> | [Blueprint](https://github.com/amajorai/ryu-blueprint) | ✓ | – | – | 0.2.0 | Review an agent's plan before it touches a file. The agent publishes its plan over MCP;… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/desktop-dark.png" /><img src="./app-icons/desktop-light.png" width="32" alt="" /></picture> | [Virtual Desktop](https://github.com/amajorai/ryu-desktop) | ✓ | – | – | 0.2.0 | An interactive virtual desktop for any Ryu node — cloud-managed, self-hosted, or local. The… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/finetune-dark.png" /><img src="./app-icons/finetune-light.png" width="32" alt="" /></picture> | [Fine-tuning](https://github.com/amajorai/ryu-finetune) | ✓ | – | – | 0.2.0 | A LoRA/QLoRA training studio: launch fine-tune jobs on this node's GPU or a remote Ryu Cloud GPU… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/healing-dark.png" /><img src="./app-icons/healing-light.png" width="32" alt="" /></picture> | [Self-Healing](https://github.com/amajorai/ryu-healing) | ✓ | – | – | 0.2.0 | Self-healing: failed runs are diagnosed by a Gateway side-model and proposed fixes are delivered… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/monitors-dark.png" /><img src="./app-icons/monitors-light.png" width="32" alt="" /></picture> | [Monitors](https://github.com/amajorai/ryu-monitors) | ✓ | – | – | 0.2.0 | Website monitors: price, stock, keyword, content, and uptime watches with cross-device… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/pull-requests-dark.png" /><img src="./app-icons/pull-requests-light.png" width="32" alt="" /></picture> | [Pull Requests](https://github.com/amajorai/ryu-pull-requests) | ✓ | – | – | 0.2.0 | A focused GitHub work inbox for Ryu. Browse pull requests and issues across repositories,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/simulator-dark.png" /><img src="./app-icons/simulator-light.png" width="32" alt="" /></picture> | [Simulators](https://github.com/amajorai/ryu-simulator) | ✓ | – | – | 0.2.0 | Drive iOS Simulators (macOS + Xcode) and Android Emulators from a workspace tab. Ryu runs the… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/skill-editor-dark.png" /><img src="./app-icons/skill-editor-light.png" width="32" alt="" /></picture> | [Skill Editor](https://github.com/amajorai/ryu-skill-editor) | ✓ | – | – | 0.2.0 | Author a user-owned Agent Skill (SKILL.md): front-matter fields (name / description / allowed… |

### Documents

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/docling-dark.png" /><img src="./app-icons/docling-light.png" width="32" alt="" /></picture> | [Docling](https://github.com/amajorai/ryu-docling) | ✓ | – | – | 0.2.0 | Document parsing via IBM's MIT-licensed Docling — the highest-fidelity `document.parse` backend.… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/markitdown-dark.png" /><img src="./app-icons/markitdown-light.png" width="32" alt="" /></picture> | [MarkItDown](https://github.com/amajorai/ryu-markitdown) | ✓ | – | – | 0.2.0 | Document parsing via Microsoft's MIT-licensed MarkItDown library — the default `document.parse`… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/mineru-dark.png" /><img src="./app-icons/mineru-light.png" width="32" alt="" /></picture> | [MinerU](https://github.com/amajorai/ryu-mineru) | ✓ | – | – | 0.2.0 | Document parsing via MinerU (opendatalab) — the highest-fidelity `document.parse` backend, and… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/unstructured-dark.png" /><img src="./app-icons/unstructured-light.png" width="32" alt="" /></picture> | [Unstructured](https://github.com/amajorai/ryu-unstructured) | ✓ | – | – | 0.2.0 | Document parsing via the Apache-2.0 Unstructured library — the broadest-coverage… |

### Games

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/token-table-dark.png" /><img src="./app-icons/token-table-light.png" width="32" alt="" /></picture> | [Token Table](https://github.com/amajorai/ryu-token-table) | ✓ | – | – | 0.2.0 | A cosmetic six-max no-limit Texas Hold'em table with simulated tokens, deterministic server-side… |

### Knowledge & Memory

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/learning-dark.png" /><img src="./app-icons/learning-light.png" width="32" alt="" /></picture> | [Learning](https://github.com/amajorai/ryu-learning) | ✓ | – | – | 0.2.0 | Learning loop: turn chats and runs into reusable skills, gated by the approval Inbox, with an… |

### Media & Voice

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/clips-dark.png" /><img src="./app-icons/clips-light.png" width="32" alt="" /></picture> | [Clips](https://github.com/amajorai/ryu-clips) | ✓ | – | – | 0.2.0 | Clips: capture and browse screen/timeline clips. A Core→Shadow proxy that depends on the Shadow… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/dictation-dark.png" /><img src="./app-icons/dictation-light.png" width="32" alt="" /></picture> | [Dictation](https://github.com/amajorai/ryu-dictation) | ✓ | – | – | 0.2.0 | System-wide dictation and agent-ask via the Island companion: speak anywhere to type a… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/subtitles-dark.png" /><img src="./app-icons/subtitles-light.png" width="32" alt="" /></picture> | [Subtitles](https://github.com/amajorai/ryu-subtitles) | ✓ | – | – | 0.2.0 | Pick a video on this machine, transcribe it locally, translate the transcript into the language… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/voice-dark.png" /><img src="./app-icons/voice-light.png" width="32" alt="" /></picture> | [Voice](https://github.com/amajorai/ryu-voice) | ✓ | – | – | 0.2.0 | Voice data path: speech-to-text transcription (whisper.cpp) and text-to-speech (OuteTTS + the… |

### Productivity

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/activity-dark.png" /><img src="./app-icons/activity-light.png" width="32" alt="" /></picture> | [Activity](https://github.com/amajorai/ryu-activity) | ✓ | – | – | 0.2.0 | The unified activity feed: everything happening on this node — monitor alerts, finished tasks,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/agent-status-dark.png" /><img src="./app-icons/agent-status-light.png" width="32" alt="" /></picture> | [Agent Status](https://github.com/amajorai/ryu-agent-status) | ✓ | – | – | 0.2.0 | Splits your agent runs across three sidebar sections — Working, Needs input and Done — each row… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/calendar-dark.png" /><img src="./app-icons/calendar-light.png" width="32" alt="" /></picture> | [Calendar](https://github.com/amajorai/ryu-calendar) | ✓ | – | – | 0.2.0 | The scheduled-runs calendar: every agent and workflow scheduled job projected onto Month, Week,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/crm-dark.png" /><img src="./app-icons/crm-light.png" width="32" alt="" /></picture> | [Harbor](https://github.com/amajorai/ryu-crm) | ✓ | – | – | 0.2.0 | A CRM that starts as a data model rather than a fixed set of screens. Harbor ships the five… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/dashboards-dark.png" /><img src="./app-icons/dashboards-light.png" width="32" alt="" /></picture> | [Dashboards](https://github.com/amajorai/ryu-dashboards) | ✓ | – | – | 0.2.0 | Dashboards: composable widget boards that assemble live views over monitors, meetings, quests,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/drafts-dark.png" /><img src="./app-icons/drafts-light.png" width="32" alt="" /></picture> | [Drafts](https://github.com/amajorai/ryu-drafts) | ✓ | – | – | 0.2.0 | A durable outbox for messages you have not sent yet. Anything you type into a composer and walk… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/mission-control-dark.png" /><img src="./app-icons/mission-control-light.png" width="32" alt="" /></picture> | [Mission Control](https://github.com/amajorai/ryu-mission-control) | ✓ | – | – | 0.2.0 | The project-level view over many chats: recent sessions and what each one accomplished, per-day… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/news-dark.png" /><img src="./app-icons/news-light.png" width="32" alt="" /></picture> | [Wire](https://github.com/amajorai/ryu-news) | ✓ | – | – | 0.2.0 | Your own newsroom, running on your node. Wire pulls RSS, Atom and JSON Feed in on a schedule —… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/quests-dark.png" /><img src="./app-icons/quests-light.png" width="32" alt="" /></picture> | [Quests](https://github.com/amajorai/ryu-quests) | ✓ | – | – | 0.2.0 | Quests: auto-detecting todos surfaced from your chats and activity, tracked as a lightweight… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/rlm-dark.png" /><img src="./app-icons/rlm-light.png" width="32" alt="" /></picture> | [Recursive Language Model](https://github.com/amajorai/ryu-rlm) | ✓ | – | – | 0.2.0 | Answer questions about a corpus far larger than any model's context window — without putting it… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/social-dark.png" /><img src="./app-icons/social-light.png" width="32" alt="" /></picture> | [Outpost](https://github.com/amajorai/ryu-social) | ✓ | – | – | 0.2.0 | A publishing command center for every social account you run: compose once, tailor per platform,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/timeline-dark.png" /><img src="./app-icons/timeline-light.png" width="32" alt="" /></picture> | [Timeline](https://github.com/amajorai/ryu-timeline) | ✓ | – | – | 0.2.0 | The activity timeline with Replay lanes and a chronological History view over Shadow's captured… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/tuition-dark.png" /><img src="./app-icons/tuition-light.png" width="32" alt="" /></picture> | [Tuition](https://github.com/amajorai/ryu-tuition) | ✓ | – | – | 0.2.0 | A tutor for one learner — you. Point it at your own syllabus, chapter or notes and it builds a… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/ugc-dark.png" /><img src="./app-icons/ugc-light.png" width="32" alt="" /></picture> | [UGC](https://github.com/amajorai/ryu-ugc) | ✓ | – | – | 0.2.0 | Creator-marketing campaign tracker: briefs, a creator roster, post submissions with review,… |

### Research

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/research-dark.png" /><img src="./app-icons/research-light.png" width="32" alt="" /></picture> | [Research](https://github.com/amajorai/ryu-research) | ✓ | – | – | 0.2.0 | Deep research: multi-step web research runs backed by the autoresearch sidecar, with sources,… |

### Security

| | App | Official | System | Hidden | Version | What it is |
| --- | --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/approvals-dark.png" /><img src="./app-icons/approvals-light.png" width="32" alt="" /></picture> | [Approvals](https://github.com/amajorai/ryu-approvals) | ✓ | – | – | 0.2.0 | Approval inbox: a human-in-the-loop queue where agent-proposed actions, edits, and fixes wait… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/reasoning-dark.png" /><img src="./app-icons/reasoning-light.png" width="32" alt="" /></picture> | [Automated Reasoning](https://github.com/amajorai/ryu-reasoning) | ✓ | – | – | 0.2.0 | Check an answer against a written policy with a solver instead of a second opinion. Point it at… |

## Third-party listings (GitHub topic discovery)

Third-party apps and plugins are discovered automatically from GitHub
topics — add **`ryu-app`** or **`ryu-plugin`** to your repository and it
becomes discoverable in the Ryu marketplace (desktop + web).

> Listings discovered by topic are **not reviewed** by Ryu. Install at
> your own discretion — read the manifest, check what permission grants
> it requests, and prefer repos you can audit.

## First-party plugins (0)

Declarative `@ryu/*` plugins, grouped by their manifest `category`.

## External plugins (1)

Hosted providers that connect Ryu's swappable layers to an outside service.

### Browsers

| | Plugin | External | Layer | Version | What it is |
| --- | --- | --- | --- | --- | --- |

| <picture><source media="(prefers-color-scheme: dark)" srcset="./external_plugins/cloudflare-browser-run/icon-dark.png" /><img src="./external_plugins/cloudflare-browser-run/icon-light.png" width="32" alt="" /></picture> | [Cloudflare Browser Run](./external_plugins/cloudflare-browser-run/) | ✓ | – | 0.2.0 | Hosted Browser Run quick actions over Cloudflare's remote OAuth MCP server. Adds URL-scoped… |

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

