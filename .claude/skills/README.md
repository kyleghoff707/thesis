# Thesis Skills

Four Claude Code skills power the Thesis investment-research pipeline. They live here as real folders (each with a `SKILL.md`) so Claude Code can discover and invoke them.

## The skills

| Skill | Invocation | Purpose |
|---|---|---|
| **analyze** | `/analyze TICKER` | Runs the full 3-stage pipeline end-to-end (One Pager → Pitch Deck → Final Thesis). The normal entry point. |
| **generate-one-pager** | `/generate-one-pager TICKER` | Stage 1 — single-agent quick screen with a pass/fail verdict. |
| **generate-pitch-deck** | `/generate-pitch-deck TICKER` | Stage 2 — 12-section research case dispatched across 5 parallel waves of subagents. |
| **generate-final-thesis** | `/generate-final-thesis TICKER` | Stage 3 — 7-section conviction document with adversarial bull/bear debate. |

Each stage gates the next. `analyze` orchestrates all three; the individual `generate-*` skills exist so you can re-run a single stage without restarting the pipeline.

## How invocation works

Each skill has a `SKILL.md` with frontmatter declaring its name, argument hint, and behavior. Claude Code discovers `SKILL.md` files recursively under `.claude/skills/` — the folder name doesn't need to match the skill name (though here they do).

```yaml
---
name: analyze
description: Run the full 3-stage Thesis pipeline for a ticker
argument-hint: TICKER
disable-model-invocation: true
---
```

`disable-model-invocation: true` means the skill only fires from an explicit slash command — the model won't auto-invoke it.

## Output paths

The skills write to:

| Purpose | Path |
|---|---|
| Generated reports (PDF, DOCX, JSON) | `~/thesis/reports/{TICKER}/` |
| Engine HTTP cache | `~/thesis/cache/` |
| User config | `~/thesis/config.json` |

Nothing is written inside the repo directory.
