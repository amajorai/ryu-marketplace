# Ryu Marketplace

The official, open catalog for [Ryu](https://github.com/amajorai/ryu) — agents, apps, skills,
workflows, tools, and MCP servers.

A marketplace is **just a git repo** with a `marketplace.json` manifest, the same
industry-standard shape Claude Code and Codex use. Ryu reads this repo directly, so:

- **This repo is the default catalog** shipped with Ryu.
- **Anyone can host their own** marketplace the same way — a public repo with a
  `marketplace.json` — and add it in Ryu by URL (`owner/repo` or a direct
  `https://…/marketplace.json`).
- **Anyone can get listed here** — either open a PR (devs, see
  [CONTRIBUTING.md](./CONTRIBUTING.md)) or use the in-app **Publish** flow (no GitHub account
  needed; Ryu's backend submits it for you after review).

## Manifest path

The canonical manifest is [`.ryu-plugin/marketplace.json`](./.ryu-plugin/marketplace.json).
When Ryu resolves any marketplace repo it tries, in order:

1. `.ryu-plugin/marketplace.json` — Ryu-native
2. `.agents/plugins/marketplace.json` — the vendor-neutral cross-tool path
3. `.claude-plugin/marketplace.json` — Claude/Codex legacy path (ecosystem compat)

So a repo authored for Claude Code or Codex resolves unchanged, and a Ryu repo carries Ryu's
own branding.

## Layout

```
.ryu-plugin/marketplace.json       # the catalog manifest (list of plugins)
plugins/<name>/                    # optional per-plugin assets (icon.png, screenshots/…)
schema/marketplace.schema.json     # JSON Schema for the manifest (editor hints / CI)
```

## Identity: `name`, `displayName`, `id`

Field names follow the Claude Code / Codex standard, with one Ryu extension:

- **`name`** — the identity. **kebab-case, no spaces** (e.g. `chart-studio`). Also the skill
  namespace prefix. This is what other tools key on.
- **`displayName`** — the pretty name shown in the UI (e.g. `Chart Studio`).
- **`id`** — *(Ryu extension, optional)* a stable reverse-DNS id (e.g. `io.ryu.chart-studio`)
  Ryu uses for internal mapping. Non-Ryu tools ignore it.

## What an entry looks like

```jsonc
{
  "name": "translator",                    // kebab-case identity
  "displayName": "Translator",
  "id": "com.acme.translator",             // optional Ryu extension
  "version": "1.2.0",
  "tagline": "Translate anything, anywhere",
  "description": "A longer description shown on the detail page.",
  "source": "acme/ryu-translator",          // owner/repo, a git URL, an object, or "builtin"
  "developer": "Acme",
  "category": "Productivity",
  "keywords": ["translation", "language"],
  "capabilities": ["Read", "Interactive"],
  "iconUrl": "https://raw.githubusercontent.com/acme/ryu-translator/HEAD/icon.png",
  "screenshots": ["https://…/1.png", "https://…/2.png"],
  "examplePrompts": ["translate this page to Japanese"],
  "homepage": "https://acme.example",
  "privacyPolicyUrl": "https://acme.example/privacy",
  "termsOfServiceUrl": "https://acme.example/terms"
}
```

Everything except `name` + `source` is optional.

### `source`

- `owner/repo` or a full git URL — Ryu fetches the plugin (and any `plugin.json` / bundled
  skills, MCP servers, workflows, tools, agents) from that repo.
- An object, Claude/Codex-style: `{ "source": "github", "repo": "owner/repo", "ref"?: "…" }`.
- `"builtin"` — a first-party item bundled with Ryu itself (Ghost, Shadow, the widget apps).
  Listed here for a rich catalog entry; Ryu serves it locally and offline.

## Paid items

This repo hosts **free / open** listings. Paid distribution (one-time or subscription, with
Stripe Connect payouts to sellers) is handled by the Ryu control plane — sell via the Ryu
in-app publish flow. See the Ryu docs.

## License

Catalog metadata in this repo is MIT. Each listed plugin carries its own license in its own
repo.
