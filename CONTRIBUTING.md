# Contributing a plugin to the Ryu marketplace

Two ways to get listed:

- **In-app Publish (no GitHub needed):** in Ryu, open your agent / workflow / app and hit
  **Publish**. Ryu's backend packages it and submits it for review; on approval the backend
  commits the entry to this repo for you. Best for non-developers.
- **Pull request (this guide):** edit one JSON file and open a PR. Best for developers who
  host their plugin in their own repo.

## 1. Build your plugin

Your plugin lives in **your own** public git repo, with a `plugin.json` (and optionally its own
`marketplace.json` if you want to host a marketplace too). Scaffold one with
`bunx create-ryu-app`, or follow the Ryu SDK docs.

## 2. Add an entry

Fork this repo and add one object to the `plugins` array in
[`.ryu-plugin/marketplace.json`](./.ryu-plugin/marketplace.json):

```jsonc
{
  "name": "my-plugin",                 // kebab-case, no spaces — the identity
  "displayName": "My Plugin",          // pretty name shown in the UI
  "id": "com.you.my-plugin",           // optional Ryu extension (stable reverse-DNS)
  "version": "1.0.0",
  "tagline": "One line, under ~40 chars",
  "description": "What it does, who it's for.",
  "source": "you/my-plugin",           // your public repo (owner/repo or a git URL)
  "developer": "Your name or org",
  "category": "Productivity",
  "keywords": ["example"],
  "capabilities": ["Read"],            // human-readable; keep honest
  "iconUrl": "https://raw.githubusercontent.com/you/my-plugin/HEAD/icon.png",
  "screenshots": ["https://raw.githubusercontent.com/you/my-plugin/HEAD/shots/1.png"],
  "examplePrompts": ["do the thing for me"],
  "homepage": "https://your.site"
}
```

- **`name`** must be kebab-case and unique within this marketplace. It is also the skill
  namespace prefix. Keep entries **alphabetical by `name`**.
- **`displayName`** is the pretty label; **`id`** (optional) is a stable reverse-DNS id.

## 3. Assets (optional)

Put an icon and screenshots either in your own repo (raw URLs, as above) or under
`plugins/<name>/` in this repo:

```
plugins/my-plugin/icon.png
plugins/my-plugin/screenshots/1.png
```

- **icon**: 512×512 PNG, transparent background preferred.
- **screenshots**: 16:10, at most 8, each under ~1 MB.

## 4. Open the PR

CI validates the manifest against `schema/marketplace.schema.json` and checks that `source`
resolves. Once it's green and a maintainer reviews it, your plugin ships in the default Ryu
catalog.

## Rules

- No secrets, no telemetry-by-default, no obfuscated code.
- All URLs must be `http(s)` — a `javascript:`/`data:` URL is rejected.
- `capabilities` must reflect what the plugin actually does (they map to permission grants).
- Malware, scrapers that violate ToS, and impersonation get rejected.
