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

## Third-party listings (GitHub topic discovery)

Third-party apps and plugins are discovered automatically from GitHub
topics — add **`ryu-app`** or **`ryu-plugin`** to your repository and it
becomes discoverable in the Ryu marketplace (desktop + web).

> Listings discovered by topic are **not reviewed** by Ryu. Install at
> your own discretion — read the manifest, check what permission grants
> it requests, and prefer repos you can audit.

## First-party plugins (40)

| | Plugin | What it is |
| --- | --- | --- |
| <img src="./plugins/advisor/icon.png" width="32" alt="" /> | [`advisor`](./plugins/advisor/) | Consult a stronger reviewer model for a second opinion — as an auto-review turn hook (toggle /… |
| <img src="./plugins/agent-comms/icon.png" width="32" alt="" /> | [`agent-comms`](./plugins/agent-comms/) | Lets the agents on this node talk to each other. Any agent can look up who else is here, leave… |
| <img src="./plugins/agentbrowser/icon.png" width="32" alt="" /> | [`agentbrowser`](./plugins/agentbrowser/) | Browser automation via the `agent-browser` CLI's MCP server (https://agent-browser.dev).… |
| <img src="./plugins/brave/icon.png" width="32" alt="" /> | [`brave`](./plugins/brave/) | Independent web search via the Brave Search API (https://brave.com/search/api/), exposed as one… |
| <img src="./plugins/bytebot/icon.png" width="32" alt="" /> | [`bytebot`](./plugins/bytebot/) | Drives a Bytebot desktop (https://github.com/bytebot-ai/bytebot) through `bytebotd`, its local… |
| <img src="./plugins/chat-title/icon.png" width="32" alt="" /> | [`chat-title`](./plugins/chat-title/) | Auto-renames a chat as soon as the first reply lands, then again after every N completed… |
| <img src="./plugins/double-check/icon.png" width="32" alt="" /> | [`double-check`](./plugins/double-check/) | Sends every answer to a second model for review before you act on it, so mistakes get caught by… |
| <img src="./plugins/exa/icon.png" width="32" alt="" /> | [`exa`](./plugins/exa/) | Neural and keyword web search via the Exa API (https://exa.ai), exposed as two declarative HTTP… |
| <img src="./plugins/firecrawl/icon.png" width="32" alt="" /> | [`firecrawl`](./plugins/firecrawl/) | Web search and page scraping via the Firecrawl v2 API (https://firecrawl.dev), exposed as two… |
| <img src="./plugins/firewall/icon.png" width="32" alt="" /> | [`firewall`](./plugins/firewall/) | An on/off switch over the Gateway's built-in firewall, which screens model traffic for prompt… |
| <img src="./plugins/ghost/icon.png" width="32" alt="" /> | [`ghost`](./plugins/ghost/) | Desktop automation: 29 screen perception and input control tools. Cross-platform (Windows,… |
| <img src="./plugins/goal/icon.png" width="32" alt="" /> | [`goal`](./plugins/goal/) | Give the agent a goal with `/goal` and it keeps working until a judge model agrees the goal is… |
| <img src="./plugins/headroom/icon.png" width="32" alt="" /> | [`headroom`](./plugins/headroom/) | Context compression (chopratejas/headroom): compress tool outputs, logs, files, and RAG chunks.… |
| <img src="./plugins/honcho/icon.png" width="32" alt="" /> | [`honcho`](./plugins/honcho/) | Give the swappable `memory` layer a provider that MODELS the user instead of only storing rows,… |
| <img src="./plugins/hook-observers/icon.png" width="32" alt="" /> | [`hook-observers`](./plugins/hook-observers/) | A worked reference for the turn-hook events Ryu can fire: five observer hooks watching… |
| <img src="./plugins/hook-session-context/icon.png" width="32" alt="" /> | [`hook-session-context`](./plugins/hook-session-context/) | Injects the current date and time at the start of every session, so the agent stops guessing… |
| <img src="./plugins/mem0/icon.png" width="32" alt="" /> | [`mem0`](./plugins/mem0/) | Read and write a hosted Mem0 memory project (https://mem0.ai) through the Mem0 Platform REST… |
| <img src="./plugins/no-ai-slop/icon.png" width="32" alt="" /> | [`no-ai-slop`](./plugins/no-ai-slop/) | Bundles the `no-ai-slop` editing skill and runs it on every finished answer: a separate reviewer… |
| <img src="./plugins/no-more-mistakes/icon.png" width="32" alt="" /> | [`no-more-mistakes`](./plugins/no-more-mistakes/) | Notices when you correct the agent, writes the lesson down as a one-line rule in a Space, and… |
| <img src="./plugins/output-styles/icon.png" width="32" alt="" /> | [`output-styles`](./plugins/output-styles/) | The nine built-in output styles — ELI5, I have ADHD, Explanatory, Learning, Proactive, Plain… |
| <img src="./plugins/parallel/icon.png" width="32" alt="" /> | [`parallel`](./plugins/parallel/) | Web search and content extraction via Parallel (https://parallel.ai), exposed as three… |
| <img src="./plugins/pi-shell/icon.png" width="32" alt="" /> | [`pi-shell`](./plugins/pi-shell/) | Adds bash_background / bash_output / bash_kill to the managed Pi agent, so a long-running… |
| <img src="./plugins/pi-subagent/icon.png" width="32" alt="" /> | [`pi-subagent`](./plugins/pi-subagent/) | Adds the Task tool to the managed Pi agent, so it can delegate a bounded, context-isolated job… |
| <img src="./plugins/plan-continue/icon.png" width="32" alt="" /> | [`plan-continue`](./plugins/plan-continue/) | While plan mode is on and the plan has not been accepted, this injects a follow-up turn after… |
| <img src="./plugins/proof/icon.png" width="32" alt="" /> | [`proof`](./plugins/proof/) | The stricter sibling of `/goal`: an independent verifier agent has to prove with tool-gathered… |
| <img src="./plugins/pxpipe/icon.png" width="32" alt="" /> | [`pxpipe`](./plugins/pxpipe/) | Token-saving loopback proxy (https://github.com/teamchong/pxpipe): it renders the bulky, static… |
| <img src="./plugins/recap/icon.png" width="32" alt="" /> | [`recap`](./plugins/recap/) | Ends a long agent turn with a short recap of what it actually did — the work, the files and… |
| <img src="./plugins/receipts/icon.png" width="32" alt="" /> | [`receipts`](./plugins/receipts/) | Verify work with visual evidence: `/receipt <goal>` makes the agent capture a screenshot or… |
| <img src="./plugins/rtk/icon.png" width="32" alt="" /> | [`rtk`](./plugins/rtk/) | Run a dev command through RTK (Rust Token Killer) and get a token-compressed version of its… |
| <img src="./plugins/sample/icon.png" width="32" alt="" /> | [`sample`](./plugins/sample/) | The reference plugin: a minimal example that declares one of each runnable kind — an agent, a… |
| <img src="./plugins/sample-widget/icon.png" width="32" alt="" /> | [`sample-widget`](./plugins/sample-widget/) | Reference third-party MCP widget plugin. A tiny local Node MCP server (server.mjs) exposes one… |
| <img src="./plugins/scrapling/icon.png" width="32" alt="" /> | [`scrapling`](./plugins/scrapling/) | Adaptive web-page extraction via the Scrapling MCP server (https://scrapling.readthedocs.io), a… |
| <img src="./plugins/security-guidance/icon.png" width="32" alt="" /> | [`security-guidance`](./plugins/security-guidance/) | Scans each answer for security vulnerabilities and has a second model review the code before you… |
| <img src="./plugins/serper/icon.png" width="32" alt="" /> | [`serper`](./plugins/serper/) | Google's own search results as JSON via the Serper API (https://serper.dev), plus single-page… |
| <img src="./plugins/shadow/icon.png" width="32" alt="" /> | [`shadow`](./plugins/shadow/) | Search everything Shadow has captured (screen text, audio transcripts, input) and summarize… |
| <img src="./plugins/spider/icon.png" width="32" alt="" /> | [`spider`](./plugins/spider/) | High-performance web crawling and content extraction via the Spider CLI (https://spider.cloud),… |
| <img src="./plugins/spidercloud/icon.png" width="32" alt="" /> | [`spidercloud`](./plugins/spidercloud/) | Hosted multi-page web crawling via the Spider Cloud API (https://spider.cloud), exposed as one… |
| <img src="./plugins/tavily/icon.png" width="32" alt="" /> | [`tavily`](./plugins/tavily/) | Search-and-extract for agents via the Tavily API (https://tavily.com), exposed as two… |
| <img src="./plugins/tool-firewall/icon.png" width="32" alt="" /> | [`tool-firewall`](./plugins/tool-firewall/) | A worked reference for pre- and post-tool hooks: the pre hook denies any tool call whose input… |
| <img src="./plugins/toolsmith-example/icon.png" width="32" alt="" /> | [`toolsmith-example`](./plugins/toolsmith-example/) | Worked example for tools/toolsmith — a real, verified inline_deno tool. Not registered with Core… |
