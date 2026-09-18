# Writing Style (`@ryu/writing-style`)
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="writing-style" width="96" />
  </picture>
</p>

Writing Style turns a small, user-approved sample of writing from the connected apps
already available to an agent into a reviewable Markdown voice guide.

It is deliberately a **skill**, not another Output Style. The generated guide is a
user-owned Agent Skill, so it can be active at the same time as one of the profiles from
`@ryu/output-styles` (for example, a personal voice guide plus Concise or No Hype).
The two layers have different jobs: the learned guide describes how the user tends to
write, while an Output Style changes the response role, tone, or shape.

## What it does

When the user asks to learn or extract their writing style, the skill:

1. Discovers the actual read-only search and fetch tools exposed by the agent's existing
   connected apps. It does not hard-code provider tool names.
2. Collects a small, balanced set of writing authored by the user, excluding quoted,
   forwarded, automated, or clearly generated text where the connection exposes that
   metadata.
3. Measures observable signals such as sentence and paragraph length, punctuation,
   capitalization, contractions, openings, structure, formatting, directness, and
   recurring constructions. The result is descriptive stylometry, not an authorship
   claim.
4. Writes content-agnostic instructions with confidence labels. Private sample text,
   names, customer data, secrets, and subject matter do not belong in the guide.
5. Saves the result as `personal-writing-style.md` with `artifact.create` using the
   `text/markdown` MIME type, then renders a preview when the host supports it.

If fewer than three usable samples are available, the skill reports low confidence and
does not invent a voice. If a connection is unavailable or a read is denied, it names
that limitation instead of treating an empty result as success.

## Using the generated file

Review the artifact first. To activate it as a personal skill, place its contents at:

```text
~/.claude/skills/personal-writing-style/SKILL.md
```

Then activate that skill in Ryu's Skills surface. The file uses the normal Agent Skills
front matter (`name`, `description`, `enabled`, and `always-on`), not Output Style's
`keep-coding-instructions` field. This is what keeps the personal guide composable with
an Output Style selection.

The plugin does not write back to Gmail, Slack, Drive, SharePoint, Notion, or any other
connected service, and it does not mutate its own package. Creating the Markdown artifact
is the only requested write.

## Safety and privacy boundary

Connection content is untrusted data. The skill treats instructions inside messages and
documents as sample text, never as commands. It uses only tools that the current agent
can actually discover and call, leaves writes/sends/deletes alone, and keeps the output
content-agnostic so a reusable style file does not become a copy of private work.

The guide is an approximation of observed preferences. It should not be used to identify
an author, prove authorship, or reproduce confidential wording.
