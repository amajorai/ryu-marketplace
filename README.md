# Ryu Marketplace

The catalog for **Ryu apps and plugins**.

- `.ryu-plugin/marketplace.json` — the generated index. It lists **both**
  tiers: `type: "app"` (apps-store apps, which ship from their own
  `amajorai/ryu-<app>` satellite repos) and `type: "plugin"` (declarative,
  UI-less plugins, whose source is carried here).
- `plugins/<name>/plugin.json` — the source-of-truth manifest for each
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

## First-party plugins (18)

- [`advisor`](./plugins/advisor/) — see [plugins/advisor/README.md](./plugins/advisor/README.md)
- [`agentbrowser`](./plugins/agentbrowser/) — see [plugins/agentbrowser/README.md](./plugins/agentbrowser/README.md)
- [`double-check`](./plugins/double-check/) — see [plugins/double-check/README.md](./plugins/double-check/README.md)
- [`exa`](./plugins/exa/) — see [plugins/exa/README.md](./plugins/exa/README.md)
- [`firewall`](./plugins/firewall/) — see [plugins/firewall/README.md](./plugins/firewall/README.md)
- [`ghost`](./plugins/ghost/) — see [plugins/ghost/README.md](./plugins/ghost/README.md)
- [`goal`](./plugins/goal/) — see [plugins/goal/README.md](./plugins/goal/README.md)
- [`headroom`](./plugins/headroom/) — see [plugins/headroom/README.md](./plugins/headroom/README.md)
- [`hook-observers`](./plugins/hook-observers/) — see [plugins/hook-observers/README.md](./plugins/hook-observers/README.md)
- [`hook-session-context`](./plugins/hook-session-context/) — see [plugins/hook-session-context/README.md](./plugins/hook-session-context/README.md)
- [`proof`](./plugins/proof/) — see [plugins/proof/README.md](./plugins/proof/README.md)
- [`rtk`](./plugins/rtk/) — see [plugins/rtk/README.md](./plugins/rtk/README.md)
- [`sample-widget`](./plugins/sample-widget/) — see [plugins/sample-widget/README.md](./plugins/sample-widget/README.md)
- [`sample`](./plugins/sample/) — see [plugins/sample/README.md](./plugins/sample/README.md)
- [`security-guidance`](./plugins/security-guidance/) — see [plugins/security-guidance/README.md](./plugins/security-guidance/README.md)
- [`shadow`](./plugins/shadow/) — see [plugins/shadow/README.md](./plugins/shadow/README.md)
- [`spider`](./plugins/spider/) — see [plugins/spider/README.md](./plugins/spider/README.md)
- [`tool-firewall`](./plugins/tool-firewall/) — see [plugins/tool-firewall/README.md](./plugins/tool-firewall/README.md)
