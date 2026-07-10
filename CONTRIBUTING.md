# Contributing a plugin to the Ryu marketplace

Getting listed is a pull request. No account, no gatekeeper API — just edit one JSON file.

## 1. Build your plugin

Your plugin lives in **your own** public git repo, with a `plugin.json` (and optionally a
`.claude-plugin/marketplace.json` if you want to host your own marketplace too). Scaffold one
with `bunx create-ryu-app`, or follow the Ryu SDK docs.

## 2. Add an entry

Fork this repo and add one object to the `plugins` array in
[`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json):

```jsonc
{
  "id": "com.you.my-plugin",          // reverse-DNS, globally unique
  "name": "My Plugin",
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

Keep entries **alphabetical by `id`** within the array.

## 3. Assets (optional)

Put an icon and screenshots either in your own repo (link via raw URLs, as above) or under
`plugins/<id>/` in this repo:

```
plugins/com.you.my-plugin/icon.png
plugins/com.you.my-plugin/screenshots/1.png
```

- **icon**: 512×512 PNG, transparent background preferred.
- **screenshots**: 16:10, at most 8, each under ~1 MB.

## 4. Open the PR

CI validates the manifest against `schema/marketplace.schema.json` and checks that `source`
resolves. Once it's green and a maintainer reviews it, your plugin ships in the default Ryu
catalog.

## Rules

- No secrets, no telemetry-by-default, no obfuscated code.
- `capabilities` must reflect what the plugin actually does (they map to permission grants).
- Malware, scrapers that violate ToS, and impersonation get rejected.
