# Ryu Marketplace

The catalog for **Ryu apps and plugins**.

- `.ryu-plugin/marketplace.json` — the generated index. It lists **both**
  tiers: `type: "app"` (apps-store apps, which ship from their own
  `amajorai/ryu-<app>` satellite repos) and `type: "plugin"` (declarative,
  UI-less plugins, whose source is carried here).
- `plugins/<name>/manifest.json` — the source-of-truth manifest for each
  first-party plugin. A declarative plugin IS its manifest.
- `schema/marketplace.schema.json` — the index schema.

This tree is a ONE-WAY mirror generated from the private monorepo by
`tools/mirror-plugins.sh`; do not edit it here (changes are overwritten —
edit the generator instead).

## Apps (43)

Manifest-driven feature apps, grouped by their manifest `category`.

Each ships from its own `amajorai/ryu-<app>` satellite repo (source is

not carried here); manifest-only apps are shown without a link.

### Automation

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/predict-dark.png" /><img src="./app-icons/predict-light.png" width="32" alt="" /></picture> | [`Autocomplete`](https://github.com/amajorai/ryu-predict) | Inline ghost-text autocomplete in any text field on your machine, accepted with Tab. A small… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/recipes-dark.png" /><img src="./app-icons/recipes-light.png" width="32" alt="" /></picture> | [`Recipes`](https://github.com/amajorai/ryu-recipes) | Desktop-automation recipes: record → save → replay UI action sequences. Backed by Ghost's… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/warmup-dark.png" /><img src="./app-icons/warmup-light.png" width="32" alt="" /></picture> | [`Warmup`](https://github.com/amajorai/ryu-warmup) | Starts your subscription agents' rolling usage windows on your own schedule: a one-word ping to… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/webhooks-dark.png" /><img src="./app-icons/webhooks-light.png" width="32" alt="" /></picture> | [`Webhooks`](https://github.com/amajorai/ryu-webhooks) | Inbound webhook endpoint registry: resolved public URLs, secret presence, last-delivery times,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/workflows-dark.png" /><img src="./app-icons/workflows-light.png" width="32" alt="" /></picture> | [`Workflows`](https://github.com/amajorai/ryu-workflows) | Workflows: petgraph DAG automation with triggers, durable execution, and a natural-language… |

### Browsers

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/browser-dark.png" /><img src="./app-icons/browser-light.png" width="32" alt="" /></picture> | [`Browser`](https://github.com/amajorai/ryu-browser) | A real-Chromium browser (Electron) Ryu runs as a local sidecar and exposes as the grant-gated… |

### Communication

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/mail-dark.png" /><img src="./app-icons/mail-light.png" width="32" alt="" /></picture> | [`Mail`](https://github.com/amajorai/ryu-mail) | Agent Inboxes — email as a service for agents. Runs the out-of-process ryu-mail sidecar; Core… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/meetings-dark.png" /><img src="./app-icons/meetings-light.png" width="32" alt="" /></picture> | [`Meetings`](https://github.com/amajorai/ryu-meetings) | Meeting notes: record → live transcript → AI notes, auto-saved into the Meetings Space so they… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/teams-dark.png" /><img src="./app-icons/teams-light.png" width="32" alt="" /></picture> | [`Teams`](https://github.com/amajorai/ryu-teams) | Teams: named groups of agents you can address as one. Governance shell over the in-crate teams… |

### Creative

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/canvas-dark.png" /><img src="./app-icons/canvas-light.png" width="32" alt="" /></picture> | [`Canvas`](https://github.com/amajorai/ryu-canvas) | A node board for generative media: wire up image, video, chat, text-to-speech, speech-to-text,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/whiteboard-dark.png" /><img src="./app-icons/whiteboard-light.png" width="32" alt="" /></picture> | [`Whiteboard`](https://github.com/amajorai/ryu-whiteboard) | An Excalidraw whiteboard shipped as a Ryu app: draw, diagram, and rearrange freely, with… |

### Developer Tools

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/blueprint-dark.png" /><img src="./app-icons/blueprint-light.png" width="32" alt="" /></picture> | [`Blueprint`](https://github.com/amajorai/ryu-blueprint) | Review an agent's plan before it touches a file. The agent publishes its plan over MCP;… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/finetune-dark.png" /><img src="./app-icons/finetune-light.png" width="32" alt="" /></picture> | [`Fine-tuning`](https://github.com/amajorai/ryu-finetune) | A LoRA/QLoRA training studio: launch fine-tune jobs on this node's GPU or a remote Ryu Cloud GPU… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/healing-dark.png" /><img src="./app-icons/healing-light.png" width="32" alt="" /></picture> | [`Self-Healing`](https://github.com/amajorai/ryu-healing) | Self-healing: failed runs are diagnosed by a Gateway side-model and proposed fixes are delivered… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/monitors-dark.png" /><img src="./app-icons/monitors-light.png" width="32" alt="" /></picture> | [`Monitors`](https://github.com/amajorai/ryu-monitors) | Website monitors: price, stock, keyword, content, and uptime watches with cross-device… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/simulator-dark.png" /><img src="./app-icons/simulator-light.png" width="32" alt="" /></picture> | [`Simulators`](https://github.com/amajorai/ryu-simulator) | Drive iOS Simulators (macOS + Xcode) and Android Emulators from a workspace tab. Ryu runs the… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/skill-editor-dark.png" /><img src="./app-icons/skill-editor-light.png" width="32" alt="" /></picture> | [`Skill Editor`](https://github.com/amajorai/ryu-skill-editor) | Author a user-owned Agent Skill (SKILL.md): front-matter fields (name / description / allowed… |

### Documents

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/docling-dark.png" /><img src="./app-icons/docling-light.png" width="32" alt="" /></picture> | [`Docling`](https://github.com/amajorai/ryu-docling) | Document parsing via IBM's MIT-licensed Docling — the highest-fidelity `document.parse` backend.… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/markitdown-dark.png" /><img src="./app-icons/markitdown-light.png" width="32" alt="" /></picture> | [`MarkItDown`](https://github.com/amajorai/ryu-markitdown) | Document parsing via Microsoft's MIT-licensed MarkItDown library — the default `document.parse`… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/mineru-dark.png" /><img src="./app-icons/mineru-light.png" width="32" alt="" /></picture> | [`MinerU`](https://github.com/amajorai/ryu-mineru) | Document parsing via MinerU (opendatalab) — the highest-fidelity `document.parse` backend, and… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/unstructured-dark.png" /><img src="./app-icons/unstructured-light.png" width="32" alt="" /></picture> | [`Unstructured`](https://github.com/amajorai/ryu-unstructured) | Document parsing via the Apache-2.0 Unstructured library — the broadest-coverage… |

### Knowledge & Memory

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/learning-dark.png" /><img src="./app-icons/learning-light.png" width="32" alt="" /></picture> | [`Learning`](https://github.com/amajorai/ryu-learning) | Learning loop: turn chats and runs into reusable skills, gated by the approval Inbox, with an… |

### Media & Voice

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/clips-dark.png" /><img src="./app-icons/clips-light.png" width="32" alt="" /></picture> | [`Clips`](https://github.com/amajorai/ryu-clips) | Clips: capture and browse screen/timeline clips. A Core→Shadow proxy that depends on the Shadow… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/dictation-dark.png" /><img src="./app-icons/dictation-light.png" width="32" alt="" /></picture> | **Dictation** | System-wide dictation and agent-ask via the Island companion: speak anywhere to type a… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/subtitles-dark.png" /><img src="./app-icons/subtitles-light.png" width="32" alt="" /></picture> | [`Subtitles`](https://github.com/amajorai/ryu-subtitles) | Pick a video on this machine, transcribe it locally, translate the transcript into the language… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/voice-dark.png" /><img src="./app-icons/voice-light.png" width="32" alt="" /></picture> | [`Voice`](https://github.com/amajorai/ryu-voice) | Voice data path: speech-to-text transcription (whisper.cpp) and text-to-speech (OuteTTS + the… |

### Productivity

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/activity-dark.png" /><img src="./app-icons/activity-light.png" width="32" alt="" /></picture> | [`Activity`](https://github.com/amajorai/ryu-activity) | The unified activity feed: everything happening on this node — monitor alerts, finished tasks,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/agent-status-dark.png" /><img src="./app-icons/agent-status-light.png" width="32" alt="" /></picture> | **Agent Status** | Splits your agent runs across three sidebar sections — Working, Needs input and Done — each row… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/calendar-dark.png" /><img src="./app-icons/calendar-light.png" width="32" alt="" /></picture> | [`Calendar`](https://github.com/amajorai/ryu-calendar) | The scheduled-runs calendar: every agent and workflow scheduled job projected onto Month, Week,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/crm-dark.png" /><img src="./app-icons/crm-light.png" width="32" alt="" /></picture> | [`Harbor`](https://github.com/amajorai/ryu-crm) | A CRM that starts as a data model rather than a fixed set of screens. Harbor ships the five… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/dashboards-dark.png" /><img src="./app-icons/dashboards-light.png" width="32" alt="" /></picture> | [`Dashboards`](https://github.com/amajorai/ryu-dashboards) | Dashboards: composable widget boards that assemble live views over monitors, meetings, quests,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/drafts-dark.png" /><img src="./app-icons/drafts-light.png" width="32" alt="" /></picture> | [`Drafts`](https://github.com/amajorai/ryu-drafts) | A durable outbox for messages you have not sent yet. Anything you type into a composer and walk… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/mission-control-dark.png" /><img src="./app-icons/mission-control-light.png" width="32" alt="" /></picture> | [`Mission Control`](https://github.com/amajorai/ryu-mission-control) | The project-level view over many chats: recent sessions and what each one accomplished, per-day… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/news-dark.png" /><img src="./app-icons/news-light.png" width="32" alt="" /></picture> | [`Wire`](https://github.com/amajorai/ryu-news) | Your own newsroom, running on your node. Wire pulls RSS, Atom and JSON Feed in on a schedule —… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/quests-dark.png" /><img src="./app-icons/quests-light.png" width="32" alt="" /></picture> | [`Quests`](https://github.com/amajorai/ryu-quests) | Quests: auto-detecting todos surfaced from your chats and activity, tracked as a lightweight… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/rlm-dark.png" /><img src="./app-icons/rlm-light.png" width="32" alt="" /></picture> | [`Recursive Language Model`](https://github.com/amajorai/ryu-rlm) | Answer questions about a corpus far larger than any model's context window — without putting it… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/social-dark.png" /><img src="./app-icons/social-light.png" width="32" alt="" /></picture> | [`Outpost`](https://github.com/amajorai/ryu-social) | A publishing command center for every social account you run: compose once, tailor per platform,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/timeline-dark.png" /><img src="./app-icons/timeline-light.png" width="32" alt="" /></picture> | [`Timeline`](https://github.com/amajorai/ryu-timeline) | The activity replay timeline: a CapCut-style scrubber over Shadow's captured… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/tuition-dark.png" /><img src="./app-icons/tuition-light.png" width="32" alt="" /></picture> | [`Tuition`](https://github.com/amajorai/ryu-tuition) | A tutor for one learner — you. Point it at your own syllabus, chapter or notes and it builds a… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/ugc-dark.png" /><img src="./app-icons/ugc-light.png" width="32" alt="" /></picture> | [`UGC`](https://github.com/amajorai/ryu-ugc) | Creator-marketing campaign tracker: briefs, a creator roster, post submissions with review,… |

### Research

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/research-dark.png" /><img src="./app-icons/research-light.png" width="32" alt="" /></picture> | [`Research`](https://github.com/amajorai/ryu-research) | Deep research: multi-step web research runs backed by the autoresearch sidecar, with sources,… |

### Security

| | App | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/approvals-dark.png" /><img src="./app-icons/approvals-light.png" width="32" alt="" /></picture> | [`Approvals`](https://github.com/amajorai/ryu-approvals) | Approval inbox: a human-in-the-loop queue where agent-proposed actions, edits, and fixes wait… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./app-icons/reasoning-dark.png" /><img src="./app-icons/reasoning-light.png" width="32" alt="" /></picture> | [`Automated Reasoning`](https://github.com/amajorai/ryu-reasoning) | Check an answer against a written policy with a solver instead of a second opinion. Point it at… |

## Third-party listings (GitHub topic discovery)

Third-party apps and plugins are discovered automatically from GitHub
topics — add **`ryu-app`** or **`ryu-plugin`** to your repository and it
becomes discoverable in the Ryu marketplace (desktop + web).

> Listings discovered by topic are **not reviewed** by Ryu. Install at
> your own discretion — read the manifest, check what permission grants
> it requests, and prefer repos you can audit.

## First-party plugins (40)

Declarative `@ryu/*` plugins, grouped by their manifest `category`.

### Automation

| | Plugin | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/agent-comms/icon-dark.png" /><img src="./plugins/agent-comms/icon-light.png" width="32" alt="" /></picture> | [`Switchboard`](./plugins/agent-comms/) | Lets the agents on this node talk to each other. Any agent can look up who else is here, leave… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/bytebot/icon-dark.png" /><img src="./plugins/bytebot/icon-light.png" width="32" alt="" /></picture> | [`Bytebot Desktop`](./plugins/bytebot/) | Drives a Bytebot desktop (https://github.com/bytebot-ai/bytebot) through `bytebotd`, its local… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/ghost/icon-dark.png" /><img src="./plugins/ghost/icon-light.png" width="32" alt="" /></picture> | [`Ghost`](./plugins/ghost/) | Desktop automation: 29 screen perception and input control tools. Windows-first. |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/pi-subagent/icon-dark.png" /><img src="./plugins/pi-subagent/icon-light.png" width="32" alt="" /></picture> | [`Subagents`](./plugins/pi-subagent/) | Adds the Task tool to the managed Pi agent, so it can delegate a bounded, context-isolated job… |

### Browsers

| | Plugin | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/agentbrowser/icon-dark.png" /><img src="./plugins/agentbrowser/icon-light.png" width="32" alt="" /></picture> | [`Agent Browser`](./plugins/agentbrowser/) | Browser automation via the `agent-browser` CLI's MCP server (https://agent-browser.dev).… |

### Developer Tools

| | Plugin | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/headroom/icon-dark.png" /><img src="./plugins/headroom/icon-light.png" width="32" alt="" /></picture> | [`Headroom Compression`](./plugins/headroom/) | Context compression (chopratejas/headroom): compress tool outputs, logs, files, and RAG chunks.… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/hook-observers/icon-dark.png" /><img src="./plugins/hook-observers/icon-light.png" width="32" alt="" /></picture> | [`Hook Observers`](./plugins/hook-observers/) | A worked reference for the turn-hook events Ryu can fire: five observer hooks watching… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/hook-session-context/icon-dark.png" /><img src="./plugins/hook-session-context/icon-light.png" width="32" alt="" /></picture> | [`Session Context`](./plugins/hook-session-context/) | Injects the current date and time at the start of every session, so the agent stops guessing… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/pi-shell/icon-dark.png" /><img src="./plugins/pi-shell/icon-light.png" width="32" alt="" /></picture> | [`Background Bash`](./plugins/pi-shell/) | Adds bash_background / bash_output / bash_kill to the managed Pi agent, so a long-running… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/pxpipe/icon-dark.png" /><img src="./plugins/pxpipe/icon-light.png" width="32" alt="" /></picture> | [`pxpipe`](./plugins/pxpipe/) | Token-saving loopback proxy (https://github.com/teamchong/pxpipe): it renders the bulky, static… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/rtk/icon-dark.png" /><img src="./plugins/rtk/icon-light.png" width="32" alt="" /></picture> | [`RTK (Rust Token Killer)`](./plugins/rtk/) | Run a dev command through RTK (Rust Token Killer) and get a token-compressed version of its… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/sample/icon-dark.png" /><img src="./plugins/sample/icon-light.png" width="32" alt="" /></picture> | [`Research Assistant`](./plugins/sample/) | The reference plugin: a minimal example that declares one of each runnable kind — an agent, a… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/sample-widget/icon-dark.png" /><img src="./plugins/sample-widget/icon-light.png" width="32" alt="" /></picture> | [`Sample Widget`](./plugins/sample-widget/) | Reference third-party MCP widget plugin. A tiny local Node MCP server (server.mjs) exposes one… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/toolsmith-example/icon-dark.png" /><img src="./plugins/toolsmith-example/icon-light.png" width="32" alt="" /></picture> | [`toolsmith-example`](./plugins/toolsmith-example/) | Worked example for tools/toolsmith — a real, verified inline_deno tool. Not registered with Core… |

### Knowledge & Memory

| | Plugin | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/honcho/icon-dark.png" /><img src="./plugins/honcho/icon-light.png" width="32" alt="" /></picture> | [`Honcho`](./plugins/honcho/) | Give the swappable `memory` layer a provider that MODELS the user instead of only storing rows,… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/mem0/icon-dark.png" /><img src="./plugins/mem0/icon-light.png" width="32" alt="" /></picture> | [`Mem0`](./plugins/mem0/) | Read and write a hosted Mem0 memory project (https://mem0.ai) through the Mem0 Platform REST… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/no-more-mistakes/icon-dark.png" /><img src="./plugins/no-more-mistakes/icon-light.png" width="32" alt="" /></picture> | [`No More Mistakes`](./plugins/no-more-mistakes/) | Notices when you correct the agent, writes the lesson down as a one-line rule in a Space, and… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/shadow/icon-dark.png" /><img src="./plugins/shadow/icon-light.png" width="32" alt="" /></picture> | [`Shadow`](./plugins/shadow/) | Search everything Shadow has captured (screen text, audio transcripts, input) and summarize… |

### Productivity

| | Plugin | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/chat-title/icon-dark.png" /><img src="./plugins/chat-title/icon-light.png" width="32" alt="" /></picture> | [`Chat Title`](./plugins/chat-title/) | Auto-renames a chat as soon as the first reply lands, then again after every N completed… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/goal/icon-dark.png" /><img src="./plugins/goal/icon-light.png" width="32" alt="" /></picture> | [`Goal`](./plugins/goal/) | Give the agent a goal with `/goal` and it keeps working until a judge model agrees the goal is… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/no-ai-slop/icon-dark.png" /><img src="./plugins/no-ai-slop/icon-light.png" width="32" alt="" /></picture> | [`No AI Slop`](./plugins/no-ai-slop/) | Bundles the `no-ai-slop` editing skill and runs it on every finished answer: a separate reviewer… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/output-styles/icon-dark.png" /><img src="./plugins/output-styles/icon-light.png" width="32" alt="" /></picture> | [`Output Styles`](./plugins/output-styles/) | The nine built-in output styles — ELI5, I have ADHD, Explanatory, Learning, Proactive, Plain… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/plan-continue/icon-dark.png" /><img src="./plugins/plan-continue/icon-light.png" width="32" alt="" /></picture> | [`Plan Continue`](./plugins/plan-continue/) | While plan mode is on and the plan has not been accepted, this injects a follow-up turn after… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/recap/icon-dark.png" /><img src="./plugins/recap/icon-light.png" width="32" alt="" /></picture> | [`Recap`](./plugins/recap/) | Ends a long agent turn with a short recap of what it actually did — the work, the files and… |

### Research

| | Plugin | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/advisor/icon-dark.png" /><img src="./plugins/advisor/icon-light.png" width="32" alt="" /></picture> | [`Advisor`](./plugins/advisor/) | Consult a stronger reviewer model for a second opinion — as an auto-review turn hook (toggle /… |

### Search

| | Plugin | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/brave/icon-dark.png" /><img src="./plugins/brave/icon-light.png" width="32" alt="" /></picture> | [`Brave Search`](./plugins/brave/) | Independent web search via the Brave Search API (https://brave.com/search/api/), exposed as one… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/exa/icon-dark.png" /><img src="./plugins/exa/icon-light.png" width="32" alt="" /></picture> | [`Exa Search`](./plugins/exa/) | Neural and keyword web search via the Exa API (https://exa.ai), exposed as two declarative HTTP… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/firecrawl/icon-dark.png" /><img src="./plugins/firecrawl/icon-light.png" width="32" alt="" /></picture> | [`Firecrawl`](./plugins/firecrawl/) | Web search and page scraping via the Firecrawl v2 API (https://firecrawl.dev), exposed as two… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/parallel/icon-dark.png" /><img src="./plugins/parallel/icon-light.png" width="32" alt="" /></picture> | [`Parallel Search`](./plugins/parallel/) | Web search and content extraction via Parallel (https://parallel.ai), exposed as three… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/scrapling/icon-dark.png" /><img src="./plugins/scrapling/icon-light.png" width="32" alt="" /></picture> | [`Scrapling`](./plugins/scrapling/) | Adaptive web-page extraction via the Scrapling MCP server (https://scrapling.readthedocs.io), a… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/serper/icon-dark.png" /><img src="./plugins/serper/icon-light.png" width="32" alt="" /></picture> | [`Serper`](./plugins/serper/) | Google's own search results as JSON via the Serper API (https://serper.dev), plus single-page… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/spider/icon-dark.png" /><img src="./plugins/spider/icon-light.png" width="32" alt="" /></picture> | [`Spider`](./plugins/spider/) | High-performance web crawling and content extraction via the Spider CLI (https://spider.cloud),… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/spidercloud/icon-dark.png" /><img src="./plugins/spidercloud/icon-light.png" width="32" alt="" /></picture> | [`Spider Cloud`](./plugins/spidercloud/) | Hosted multi-page web crawling via the Spider Cloud API (https://spider.cloud), exposed as one… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/tavily/icon-dark.png" /><img src="./plugins/tavily/icon-light.png" width="32" alt="" /></picture> | [`Tavily Search`](./plugins/tavily/) | Search-and-extract for agents via the Tavily API (https://tavily.com), exposed as two… |

### Security

| | Plugin | What it is |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/double-check/icon-dark.png" /><img src="./plugins/double-check/icon-light.png" width="32" alt="" /></picture> | [`Double Check`](./plugins/double-check/) | Sends every answer to a second model for review before you act on it, so mistakes get caught by… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/firewall/icon-dark.png" /><img src="./plugins/firewall/icon-light.png" width="32" alt="" /></picture> | [`Gateway Firewall`](./plugins/firewall/) | An on/off switch over the Gateway's built-in firewall, which screens model traffic for prompt… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/proof/icon-dark.png" /><img src="./plugins/proof/icon-light.png" width="32" alt="" /></picture> | [`Proof of Work`](./plugins/proof/) | The stricter sibling of `/goal`: an independent verifier agent has to prove with tool-gathered… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/receipts/icon-dark.png" /><img src="./plugins/receipts/icon-light.png" width="32" alt="" /></picture> | [`Receipts`](./plugins/receipts/) | Verify work with visual evidence: `/receipt <goal>` makes the agent capture a screenshot or… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/security-guidance/icon-dark.png" /><img src="./plugins/security-guidance/icon-light.png" width="32" alt="" /></picture> | [`Security Guidance`](./plugins/security-guidance/) | Scans each answer for security vulnerabilities and has a second model review the code before you… |
| <picture><source media="(prefers-color-scheme: dark)" srcset="./plugins/tool-firewall/icon-dark.png" /><img src="./plugins/tool-firewall/icon-light.png" width="32" alt="" /></picture> | [`Tool Firewall`](./plugins/tool-firewall/) | A worked reference for pre- and post-tool hooks: the pre hook denies any tool call whose input… |

