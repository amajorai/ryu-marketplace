# Contributing a plugin to the Ryu marketplace

Three ways to get in front of Ryu users:

- **In-app Publish (no GitHub needed):** in Ryu, open your agent / workflow / app and hit
  **Publish**. Ryu's backend packages it and submits it for review; on approval the backend
  commits the entry to this repo for you. Best for non-developers.
- **Pull request (this guide):** edit one JSON file and open a PR. Best for developers who
  host their plugin in their own repo.
- **Host your own community marketplace (no submission at all):** keep everything in your own
  repo — tag it `ryu-marketplace` and add a `marketplace.json`. Ryu discovers it automatically
  and shows its entries grouped under your marketplace's name. See
  [Host a community marketplace](#host-a-community-marketplace) below.

## 1. Build your plugin

Your plugin lives in **your own** public git repo, with a `manifest.json` (and optionally its own
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

## Host a community marketplace

The two paths above list you in **this** repo — the reviewed, curated marketplace that ships in the
default Ryu catalog. A community marketplace is the opposite of that: you host it **yourself**, and
Ryu discovers it from your public repo instead of you submitting it anywhere.

1. **Tag your repo `ryu-marketplace`.** This is the discovery topic; add it on the repo page like
   any other topic. The topic is the whole entry — no account, no submission, no review.
2. **Add a `marketplace.json`** to the repo. Ryu looks for it at (first hit wins):

   - `.ryu-plugin/marketplace.json` — canonical, use this one
   - `.agents/plugins/marketplace.json`
   - `.claude-plugin/marketplace.json`
   - `.cursor-plugin/marketplace.json`

   Each entry in the `plugins` array becomes a listing:

   ```json
   {
     "name": "my-bazaar",
     "displayName": "My Bazaar",
     "plugins": [
       {
         "name": "thing-tool",
         "displayName": "Thing Tool",
         "description": "Does the thing.",
         "source": "you/thing-tool",
         "icon": "lucide:brain",
         "hasCompanion": false
       }
     ]
   }
   ```

   - **`source`** is where each plugin actually lives: a bare `owner/repo`, a git URL, or the
     object form `{ "repo": "owner/repo" }` / `{ "url": "…" }`. It drives the link-out / install
     handoff — entries are **browse-only** in the community feed, exactly like a topic-discovered
     plugin, and installing one is an explicit per-repo act against its own repo.
   - **`hasCompanion: true`** classifies the entry as an app; anything else is a plugin.
   - `displayName` is the pretty card title, `name` is the kebab-case identity. Optional card
     fields: `description`, `version`, `tagline`, `category`, `icon`, `iconUrl`, `homepage`.
   - Marketplace `name` / `displayName` becomes the heading under which all its entries render.

3. **How it shows up.** Every Ryu install polls the `ryu-marketplace` topic (cached 6 hours, top
   100 repos by stars). A discovered repo with a `marketplace.json` renders in the store's
   **Community Marketplaces** section — one sub-heading per marketplace, its entries inside, under
   the same "not reviewed by Ryu" notice every community listing carries. A repo tagged
   `ryu-marketplace` without a `marketplace.json` still renders, as a single listing of the repo
   itself.

Like every community listing, these are **not reviewed, not signed, not endorsed by Ryu**. Being
discovered means exactly that a public repo carries the topic. The entry's `source` repo is where
the code actually lives, so make it the thing that earns the install.
