# Skills Library

A unified, telemetry-free skill library for Claude Code. Organized by category with no external dependencies.

## Directory structure

```
skills/
├── CLAUDE.md                              ← you are here
├── reference-guide/                       ← full reference docs
├── code-review-and-shipping/              5 skills
├── configuration/                         1 skill (skill-updater)
├── debugging-and-investigation/           3 skills
├── design-and-branding/                   7 skills
├── image-generation/                      1 skill
├── learning-and-knowledge/                4 skills
├── meta-and-scaffolding/                  3 skills
├── planning-and-architecture/             8 skills
├── quality-assurance-and-testing/         9 skills
├── research-and-intelligence/             6 skills
├── safety-and-scope-control/              4 skills
├── security-and-ops/                      4 skills
├── session-and-documentation/             7 skills
├── social-media-and-external-data/        3 skills
├── standalone/                            10 skills
└── workflow-and-execution/                4 skills
```

Every skill is a real folder (no symlinks) containing at minimum a `SKILL.md` file. Claude Code discovers skills by recursively scanning for `SKILL.md` files — category folders are for human organization only.

## How to find and invoke skills

Every skill has a `SKILL.md` with frontmatter:

```yaml
---
name: skill-name
description: When to use this skill
---
```

The `name:` field is the invocation name (e.g., `/brainstorm`, `/tdd`, `/qa`).

## Skill inventory (~79 skills, 17 categories)

| Category | Skills |
|---|---|
| **Code Review & Shipping** | branch-completion, review, review-request, review-response, ship |
| **Configuration** | skill-updater |
| **Debugging & Investigation** | investigate, rca, systematic-debugging |
| **Design & Branding** | banner-creator, design-consultation, design-html, design-review, design-shotgun, logo-creator, plan-design-review |
| **Image Generation** | image-generator |
| **Learning & Knowledge** | domain-learning, learn, learning-pathway, repo-learning |
| **Meta & Scaffolding** | skill-builder, skill-router, skill-template |
| **Planning & Architecture** | autoplan, brainstorm, dependency-map, execute-plan, office-hours, plan-ceo-review, plan-eng-review, write-plan |
| **Quality Assurance & Testing** | benchmark, browse, canary, pipeline-validator, qa, qa-only, setup-browser-cookies, tdd, verify-completion |
| **Research & Intelligence** | demand-research, domain-search, product-analysis, research, seo, site-analysis |
| **Safety & Scope Control** | careful, freeze, guard, unfreeze |
| **Security & Ops** | codex, cso, health, setup-deploy |
| **Session & Documentation** | archive, checkpoint, document-release, migration-guide, retro, sync, technical-writer |
| **Social Media & External Data** | product-launches, reddit-search, twitter-search |
| **Standalone** | connect-chrome, devex-review, land-and-deploy, llm-council, open-browser, pair-agent, plan-devex-review, test-method-research, workflow-router, writing-skills |
| **Workflow & Execution** | campaign-runner, parallel-dispatch, parallel-execution, worktree |

## Conventions

### Naming
- Skill names are generic and descriptive — no product branding
- Cross-reference skills by plain name: `tdd`, `brainstorm`, `worktree`

### Output paths
Skills write to these project-local locations:

| Purpose | Path |
|---|---|
| QA reports | `.reports/qa/` |
| Design reports | `.reports/design/` |
| Ship logs | `.reports/ship-log.json` |
| Design specs | `docs/specs/` |
| Implementation plans | `docs/plans/` |
| Brainstorm sessions | `.brainstorm/` |
| Archives | `.archive/` |
| Retro snapshots | `.context/retros/` |

## Updating from upstream

Use the `/skill-updater` skill. It:

1. Clones the latest from upstream repos (gstack, superpowers)
2. Diffs upstream changes against local skill content
3. Screens for telemetry, analytics, and external references
4. Presents a review report — nothing is applied without your approval
5. Strips flagged patterns before applying approved changes

## What NOT to do

- Do not install gstack, superpowers, or other skill packages as monorepos
- Do not add telemetry, analytics, or phone-home mechanisms to skills
- Do not use symlinks — all skills are real directories
- Do not add namespace prefixes to skill cross-references
