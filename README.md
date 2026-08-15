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

- <img src="./plugins/advisor/icon.png" width="18" alt="" /> [`advisor`](./plugins/advisor/) — see [plugins/advisor/README.md](./plugins/advisor/README.md)
- <img src="./plugins/agent-comms/icon.png" width="18" alt="" /> [`agent-comms`](./plugins/agent-comms/) — see [plugins/agent-comms/README.md](./plugins/agent-comms/README.md)
- <img src="./plugins/agentbrowser/icon.png" width="18" alt="" /> [`agentbrowser`](./plugins/agentbrowser/) — see [plugins/agentbrowser/README.md](./plugins/agentbrowser/README.md)
- <img src="./plugins/brave/icon.png" width="18" alt="" /> [`brave`](./plugins/brave/) — see [plugins/brave/README.md](./plugins/brave/README.md)
- <img src="./plugins/bytebot/icon.png" width="18" alt="" /> [`bytebot`](./plugins/bytebot/) — see [plugins/bytebot/README.md](./plugins/bytebot/README.md)
- <img src="./plugins/chat-title/icon.png" width="18" alt="" /> [`chat-title`](./plugins/chat-title/) — see [plugins/chat-title/README.md](./plugins/chat-title/README.md)
- <img src="./plugins/double-check/icon.png" width="18" alt="" /> [`double-check`](./plugins/double-check/) — see [plugins/double-check/README.md](./plugins/double-check/README.md)
- <img src="./plugins/exa/icon.png" width="18" alt="" /> [`exa`](./plugins/exa/) — see [plugins/exa/README.md](./plugins/exa/README.md)
- <img src="./plugins/firecrawl/icon.png" width="18" alt="" /> [`firecrawl`](./plugins/firecrawl/) — see [plugins/firecrawl/README.md](./plugins/firecrawl/README.md)
- <img src="./plugins/firewall/icon.png" width="18" alt="" /> [`firewall`](./plugins/firewall/) — see [plugins/firewall/README.md](./plugins/firewall/README.md)
- <img src="./plugins/ghost/icon.png" width="18" alt="" /> [`ghost`](./plugins/ghost/) — see [plugins/ghost/README.md](./plugins/ghost/README.md)
- <img src="./plugins/goal/icon.png" width="18" alt="" /> [`goal`](./plugins/goal/) — see [plugins/goal/README.md](./plugins/goal/README.md)
- <img src="./plugins/headroom/icon.png" width="18" alt="" /> [`headroom`](./plugins/headroom/) — see [plugins/headroom/README.md](./plugins/headroom/README.md)
- <img src="./plugins/honcho/icon.png" width="18" alt="" /> [`honcho`](./plugins/honcho/) — see [plugins/honcho/README.md](./plugins/honcho/README.md)
- <img src="./plugins/hook-observers/icon.png" width="18" alt="" /> [`hook-observers`](./plugins/hook-observers/) — see [plugins/hook-observers/README.md](./plugins/hook-observers/README.md)
- <img src="./plugins/hook-session-context/icon.png" width="18" alt="" /> [`hook-session-context`](./plugins/hook-session-context/) — see [plugins/hook-session-context/README.md](./plugins/hook-session-context/README.md)
- <img src="./plugins/mem0/icon.png" width="18" alt="" /> [`mem0`](./plugins/mem0/) — see [plugins/mem0/README.md](./plugins/mem0/README.md)
- <img src="./plugins/no-ai-slop/icon.png" width="18" alt="" /> [`no-ai-slop`](./plugins/no-ai-slop/) — see [plugins/no-ai-slop/README.md](./plugins/no-ai-slop/README.md)
- <img src="./plugins/no-more-mistakes/icon.png" width="18" alt="" /> [`no-more-mistakes`](./plugins/no-more-mistakes/) — see [plugins/no-more-mistakes/README.md](./plugins/no-more-mistakes/README.md)
- <img src="./plugins/output-styles/icon.png" width="18" alt="" /> [`output-styles`](./plugins/output-styles/) — see [plugins/output-styles/README.md](./plugins/output-styles/README.md)
- <img src="./plugins/parallel/icon.png" width="18" alt="" /> [`parallel`](./plugins/parallel/) — see [plugins/parallel/README.md](./plugins/parallel/README.md)
- <img src="./plugins/pi-shell/icon.png" width="18" alt="" /> [`pi-shell`](./plugins/pi-shell/) — see [plugins/pi-shell/README.md](./plugins/pi-shell/README.md)
- <img src="./plugins/pi-subagent/icon.png" width="18" alt="" /> [`pi-subagent`](./plugins/pi-subagent/) — see [plugins/pi-subagent/README.md](./plugins/pi-subagent/README.md)
- <img src="./plugins/plan-continue/icon.png" width="18" alt="" /> [`plan-continue`](./plugins/plan-continue/) — see [plugins/plan-continue/README.md](./plugins/plan-continue/README.md)
- <img src="./plugins/proof/icon.png" width="18" alt="" /> [`proof`](./plugins/proof/) — see [plugins/proof/README.md](./plugins/proof/README.md)
- <img src="./plugins/pxpipe/icon.png" width="18" alt="" /> [`pxpipe`](./plugins/pxpipe/) — see [plugins/pxpipe/README.md](./plugins/pxpipe/README.md)
- <img src="./plugins/recap/icon.png" width="18" alt="" /> [`recap`](./plugins/recap/) — see [plugins/recap/README.md](./plugins/recap/README.md)
- <img src="./plugins/receipts/icon.png" width="18" alt="" /> [`receipts`](./plugins/receipts/) — see [plugins/receipts/README.md](./plugins/receipts/README.md)
- <img src="./plugins/rtk/icon.png" width="18" alt="" /> [`rtk`](./plugins/rtk/) — see [plugins/rtk/README.md](./plugins/rtk/README.md)
- <img src="./plugins/sample-widget/icon.png" width="18" alt="" /> [`sample-widget`](./plugins/sample-widget/) — see [plugins/sample-widget/README.md](./plugins/sample-widget/README.md)
- <img src="./plugins/sample/icon.png" width="18" alt="" /> [`sample`](./plugins/sample/) — see [plugins/sample/README.md](./plugins/sample/README.md)
- <img src="./plugins/scrapling/icon.png" width="18" alt="" /> [`scrapling`](./plugins/scrapling/) — see [plugins/scrapling/README.md](./plugins/scrapling/README.md)
- <img src="./plugins/security-guidance/icon.png" width="18" alt="" /> [`security-guidance`](./plugins/security-guidance/) — see [plugins/security-guidance/README.md](./plugins/security-guidance/README.md)
- <img src="./plugins/serper/icon.png" width="18" alt="" /> [`serper`](./plugins/serper/) — see [plugins/serper/README.md](./plugins/serper/README.md)
- <img src="./plugins/shadow/icon.png" width="18" alt="" /> [`shadow`](./plugins/shadow/) — see [plugins/shadow/README.md](./plugins/shadow/README.md)
- <img src="./plugins/spider/icon.png" width="18" alt="" /> [`spider`](./plugins/spider/) — see [plugins/spider/README.md](./plugins/spider/README.md)
- <img src="./plugins/spidercloud/icon.png" width="18" alt="" /> [`spidercloud`](./plugins/spidercloud/) — see [plugins/spidercloud/README.md](./plugins/spidercloud/README.md)
- <img src="./plugins/tavily/icon.png" width="18" alt="" /> [`tavily`](./plugins/tavily/) — see [plugins/tavily/README.md](./plugins/tavily/README.md)
- <img src="./plugins/tool-firewall/icon.png" width="18" alt="" /> [`tool-firewall`](./plugins/tool-firewall/) — see [plugins/tool-firewall/README.md](./plugins/tool-firewall/README.md)
- <img src="./plugins/toolsmith-example/icon.png" width="18" alt="" /> [`toolsmith-example`](./plugins/toolsmith-example/) — see [plugins/toolsmith-example/README.md](./plugins/toolsmith-example/README.md)
