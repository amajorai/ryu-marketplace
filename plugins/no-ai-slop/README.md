# No AI Slop (`@ryu/no-ai-slop`)
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="no-ai-slop" width="96" />
  </picture>
</p>

Runs the bundled [`no-ai-slop`](https://github.com/petergyang/no-ai-slop) editing skill
against every finished answer. A separate reviewer reads the reply with a **fresh
context**, names the AI-slop patterns it can point at, and the agent rewrites the answer
to fix them. A clean answer produces nothing at all — no note, no extra turn.

There is also a **No AI slop output style** in `@ryu/output-styles`, built from the same
rules. It is the prevention half: one prompt block that shapes the answer as it is
written, at no extra turn and no extra agent. This plugin is the review half — it reads
what was actually produced and only reports what it can point at. They compose; picking
the style does not disable this hook.

## How one turn goes

1. The assistant finishes a turn. The `post_assistant_turn` hook fires.
2. Cheap gates first, before any spend: no assistant message, or under 240 characters of
   prose once code fences are stripped, and the hook returns `{kind:"none"}`.
3. `host.runAgent({ preset: "summarise" })` spawns the reviewer. It gets the skill's rules
   and the draft — and nothing else. It never sees the conversation that produced the
   draft, so it cannot inherit its habits or its self-justification. That is the whole
   reason each pass is a fresh context rather than a second opinion from the same thread.
4. Clean (`SLOP: none`) → `{kind:"none"}`, silently.
5. Otherwise the hook returns `{kind:"continue", …}`: the findings are injected as a
   follow-up turn and the agent rewrites its own answer in the transcript.

## Settings

| Preference | Default | What it does |
| --- | --- | --- |
| `no-ai-slop-passes` | `1` | Review passes per answer. Each is a new reviewer with no memory of the last. `0` turns automatic review off. |
| `no-ai-slop-mode` | `revise` | `revise` rewrites the answer. `report` leaves it alone and surfaces the findings as a note. |

The composer **"+" menu** carries a `No AI slop` toggle (flag `io.ryu.no-ai-slop`). It is
the manual trigger: with `no-ai-slop-passes` at `0` it still runs one pass on that turn,
and it drops the prose floor from 240 characters to 40 so a short reply can be checked on
purpose.

## Why it cannot loop

A `continue` directive injects a user turn, which runs another assistant turn, which fires
this same hook — so the guard is the feature, not a detail. Three independent stops:

1. **The pass counter.** Every injected turn starts with the literal
   `No-AI-slop review (pass`. The hook counts consecutive newest-first user turns that
   start with it and stops once that count reaches the configured passes. The scan halts
   at the first real user message, so the budget resets by itself on the next question.
   It is derived from the transcript alone — no stored state to go stale, and it survives
   a restart mid-loop.
2. **A clean verdict.** The reviewer saying `SLOP: none` ends the chain early, and
   `report` mode never issues a `continue` in the first place.
3. **Core's own cap.** `MAX_CONTINUE_TURNS` is 25 for the whole conversation, shared with
   every other looping plugin (`/goal`, `/proof`). The hook clamps `passes` to 12 so a
   large setting degrades to fewer passes instead of a loop that stops mid-rewrite.

The terminating branches return `none` or `note` — never a final `continue` — so a spent
budget cannot re-arm itself.

## Why the skill text is inlined

The rules live as a `RULES` constant in `hooks/review.js`, not in a `SKILL.md` beside it.
A built-in plugin ships only its manifest: its package directory does not exist on the
user's machine (the same reason `apps/core/src/plugin_manifest/builtin_code.rs` embeds
the hook body), and the sandbox has no filesystem to read from anyway. One copy, so there
is nothing to drift.

## Cost

The hook has no `match` gate — it must see every completed turn — so it pays a sandbox
spawn per answer, and a sub-agent call per answer that clears the prose floor. That is why
it is absent from `CORE_DEFAULT_ON`: it ships installed but off, like `@ryu/recap`.

## Tests

```bash
node --test plugins-store/no-ai-slop/plugin.test.mjs
```
