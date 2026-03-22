# Skills Directory

Claude Code discovers skills at `.claude/skills/{name}/SKILL.md`. This directory contains both gstack skills (installed as symlinks) and custom project skills (real directories).

## Custom Skills (project-specific)

| Skill | Description |
|---|---|
| `computer-learning/` | Teach Claude to interpret domain-specific data (images, papers, etc.) |
| `research-dive/` | Structured research deep dives with PDF + markdown output |
| `rca/` | Root cause analysis — structured debugging with ranked solutions |

## gstack Skills (symlinks → `gstack/`)

All other entries are symlinks pointing into the `gstack/` directory (the gstack repo). They exist because Claude Code only discovers skills one level deep — the symlinks are required plumbing.

| Symlink | Points To | What It Does |
|---|---|---|
| `benchmark/` | `gstack/benchmark` | Performance regression detection |
| `browse/` | `gstack/browse` | Headless browser for QA and dogfooding |
| `canary/` | `gstack/canary` | Post-deploy canary monitoring |
| `careful/` | `gstack/careful` | Destructive command warnings |
| `codex/` | `gstack/codex` | Multi-AI second opinion (OpenAI Codex) |
| `design-consultation/` | `gstack/design-consultation` | Design system creation |
| `design-review/` | `gstack/design-review` | Visual QA + auto-fix |
| `document-release/` | `gstack/document-release` | Post-ship documentation sync |
| `freeze/` | `gstack/freeze` | Lock edits to one directory |
| `guard/` | `gstack/guard` | Full safety mode (careful + freeze) |
| `gstack-upgrade/` | `gstack/gstack-upgrade` | Self-updater |
| `investigate/` | `gstack/investigate` | Systematic root-cause debugging |
| `land-and-deploy/` | `gstack/land-and-deploy` | Merge PR + verify production |
| `office-hours/` | `gstack/office-hours` | Brainstorming / design doc |
| `plan-ceo-review/` | `gstack/plan-ceo-review` | CEO/founder strategy review |
| `plan-design-review/` | `gstack/plan-design-review` | Designer plan review |
| `plan-eng-review/` | `gstack/plan-eng-review` | Eng manager architecture review |
| `qa/` | `gstack/qa` | QA testing + auto-fix |
| `qa-only/` | `gstack/qa-only` | QA testing (report only) |
| `retro/` | `gstack/retro` | Weekly engineering retrospective |
| `review/` | `gstack/review` | Pre-landing PR review |
| `setup-browser-cookies/` | `gstack/setup-browser-cookies` | Import browser cookies |
| `setup-deploy/` | `gstack/setup-deploy` | Configure deployment settings |
| `ship/` | `gstack/ship` | Ship workflow (test, review, PR) |
| `unfreeze/` | `gstack/unfreeze` | Remove edit restrictions |
| `debug/` | `~/.claude/skills/gstack/debug` | Legacy alias for investigate |

## Adding New Skills

Create a new directory here with a `SKILL.md` file. Custom skills are real directories — don't symlink them into gstack.
