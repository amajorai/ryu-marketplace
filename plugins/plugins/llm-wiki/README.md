# LLM Wiki (`@ryu/llm-wiki`)

LLM Wiki turns the Karpathy-style interlinked research wiki into a Ryu-native
Agent Skill. The durable store is a user-owned Ryu Space, not a hidden local
directory, so Space permissions, semantic retrieval, backlinks, and the normal
Ryu document lifecycle remain in charge.

## What it does

When the skill is active, the agent can:

- initialize or resume a named Space with `SCHEMA.md`, `index.md`, and `log.md`;
- capture URL, paper, transcript, and pasted sources as immutable Markdown files;
- create entity, concept, comparison, and filed-query pages with YAML frontmatter;
- preserve `[[wikilinks]]`, source provenance, confidence, and contradictions;
- answer from Space search results and file durable syntheses; and
- audit broken links, missing index entries, weak confidence signals, and source drift
  when the available Space read surface is sufficient.

The skill uses Ryu's existing `spaces.*` and web tools. It does not read or write a
`WIKI_PATH`, create a second database, ask for a Space token, or treat fetched pages
as instructions. If a host only exposes Space search/list/create operations, the
skill reports that limitation instead of silently duplicating or claiming to update
an existing document.

## Package layout

```text
manifest.json
skills/
└── llm-wiki/
    └── SKILL.md
plugin.json                 # generated Agent Plugins projection
plugin.test.mjs             # package contract test
```

The native manifest is the source of truth. The bundled skill is materialized into
the shared Agent Skills directory when the plugin is enabled and is removed only if
the plugin owns that installed copy.

## Permissions

- `spaces:docs` — resolve and work in the user's Ryu Space.
- Existing web search/extraction providers remain swappable and are used only when
  the calling agent already has them enabled.

The skill never treats a missing Space or web provider as an empty successful result.
