# Ryu Marketplace

The official, open catalog for [Ryu](https://github.com/amajorai/ryu) — agents, apps, skills, tools, and MCP servers.

A marketplace is **just a git repo** with a `.claude-plugin/marketplace.json` manifest, the same
industry-standard format Claude Code and Codex use. Ryu reads this repo directly, so:

- **This repo is the default catalog** shipped with Ryu.
- **Anyone can host their own** marketplace the same way — a public repo with a
  `.claude-plugin/marketplace.json` — and add it in Ryu by URL (`owner/repo` or a direct
  `https://…/marketplace.json`).
- **Anyone can get listed here** by opening a pull request (see [CONTRIBUTING.md](./CONTRIBUTING.md)).

## Layout

```
.claude-plugin/marketplace.json   # the catalog manifest (list of plugins)
plugins/<id>/                      # optional per-plugin assets (icon.png, screenshots/…)
schema/marketplace.schema.json     # JSON Schema for the manifest (optional, for editor hints)
```

## What the manifest looks like

Each entry in `plugins[]` describes one installable item. Field names follow the Claude
`.claude-plugin/marketplace.json` standard (`name`, `source`, `description`, `version`,
`homepage`, `category`, `keywords`) plus Ryu extensions for a richer detail preview
(`tagline`, `iconUrl`, `screenshots`, `developer`, `capabilities`, `examplePrompts`, `setup`,
`privacyPolicyUrl`, `termsOfServiceUrl`). Everything except `name` + `source` is optional.

```jsonc
{
  "id": "com.acme.translator",
  "name": "Translator",
  "version": "1.2.0",
  "tagline": "Translate anything, anywhere",
  "description": "A longer description shown on the detail page.",
  "source": "acme/ryu-translator",        // owner/repo, a git URL, or "builtin"
  "developer": "Acme",
  "category": "Productivity",
  "keywords": ["translation", "language"],
  "capabilities": ["Read", "Interactive"],
  "iconUrl": "https://raw.githubusercontent.com/acme/ryu-translator/HEAD/icon.png",
  "screenshots": ["https://…/1.png", "https://…/2.png"],
  "examplePrompts": ["translate this page to Japanese", "detect the language of this text"],
  "homepage": "https://acme.example",
  "privacyPolicyUrl": "https://acme.example/privacy",
  "termsOfServiceUrl": "https://acme.example/terms"
}
```

### `source`

- `owner/repo` or a full git URL — Ryu fetches the plugin (and any `plugin.json` /
  bundled skills, MCP servers, tools, agents) from that repo.
- `"builtin"` — a first-party item bundled with Ryu itself (Ghost, Shadow, the widget
  apps). Listed here for a rich catalog entry; Ryu serves it locally and offline.

## Paid items

This repo hosts **free / open** listings. Paid distribution (one-time or subscription, with
Stripe Connect payouts to sellers) is handled by the Ryu control plane, not this repo —
sell via the Ryu marketplace publish flow. See the Ryu docs.

## License

Catalog metadata in this repo is MIT. Each listed plugin carries its own license in its own
repo.
