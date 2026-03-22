# gstack Visibility Redirect — Implementation Summary

**Date:** 2026-03-22
**Scope:** Audit all gstack file-saving pathways, redirect outputs to visible project directory without corrupting inter-skill workflows

---

## The Problem

gstack saves artifacts (plans, test outcomes, QA reports, review logs, screenshots, design audits) across multiple hidden locations:

| Hidden Location | What Was Saved There |
|---|---|
| `~/.gstack/projects/$SLUG/` | Plans, test plans, test outcomes, design audits, review logs — the inter-skill handoff hub |
| `~/.gstack/analytics/` | Skill usage log, eureka moments, spec review metrics |
| `.gstack/` (project root, gitignored) | QA reports + screenshots, design review screenshots, browse logs, canary/benchmark/deploy reports |
| `.context/retros/` | Retro JSON snapshots |

As a user, you had no visibility into what gstack was producing or where. Files accumulated in hidden directories that required terminal commands to discover. The `/qa` skill quietly created a `.gstack/` folder in the project root. Plans written by `/plan-eng-review` landed in `~/.gstack/projects/` where no file browser would show them.

We had a partial fix: CLAUDE.md instructions redirected *some* artifacts to `previous-prompt-and-plans/` with symlinks back to `~/.gstack/`. But this only covered plan/design artifacts written via Claude's Write tool — it didn't intercept skills that write to `.gstack/` (QA, browse, canary) or binaries that write to `~/.gstack/` (review logs).

---

## The Solution

### Unified `gstack/` folder in the project root

```
gstack/
├── plans/              — Eng plans, CEO plans (from /plan-eng-review, /plan-ceo-review)
├── test-plans/         — Test plans (from /plan-eng-review)
├── test-outcomes/      — QA test results (from /qa)
├── reviews/            — Review log copies (from /review, /ship — binary writes to ~/.gstack, we sync)
├── design/             — Design consultations and audits (from /office-hours, /design-consultation, /design-review)
├── investigations/     — RCA reports and bug investigations (from /investigate)
├── qa-reports/         — QA reports + screenshots (from /qa, /qa-only)
├── design-reports/     — Design review screenshots (from /design-review)
├── canary-reports/     — Post-deploy monitoring (from /canary)
├── benchmark-reports/  — Performance baselines (from /benchmark)
├── deploy-reports/     — Deploy verification (from /land-and-deploy)
├── retros/             — Weekly retrospective snapshots (from /retro)
└── browse-logs/        — Browser console + network logs (from /browse)
```

### Three redirect mechanisms

1. **CLAUDE.md instructions** — For artifacts written by Claude via the Write tool (plans, test plans, test outcomes, design docs, investigations). Claude reads CLAUDE.md at conversation start and writes directly to `gstack/{subfolder}/` instead of `~/.gstack/projects/$SLUG/`. A symlink is created back in `~/.gstack/projects/$SLUG/` so inter-skill glob lookups still work.

2. **`.gstack/` symlinks** — For artifacts written by skills to the project-local `.gstack/` directory (QA reports, design screenshots, canary/benchmark/deploy reports, browse logs). Each `.gstack/{name}` subdirectory is a symlink pointing to `gstack/{name}`, so skill writes land in the visible folder automatically without any code changes.

3. **Review log sync** — For the `main-reviews.jsonl` file written by the `gstack-review-log` binary (hardcoded to `~/.gstack/projects/$SLUG/`, cannot be redirected). After any review-producing skill, we copy the log to `gstack/reviews/`.

### What stays in hidden directories (cannot be moved)

- `~/.gstack/projects/$SLUG/main-reviews.jsonl` — Binary writes here (we copy)
- `~/.gstack/projects/$SLUG/*.md` symlinks — Inter-skill lookup hub (points back to our `gstack/` files)
- `~/.gstack/analytics/` — Skill usage telemetry, eureka moments (binary writes)
- `~/.gstack/config.yaml`, `sessions/`, flag files — Runtime internals

### What's git-tracked vs gitignored

**Tracked** (small, high-value): Plans, test plans, test outcomes, review logs, QA report markdown, investigation reports, design docs, retro snapshots, security audit.

**Gitignored** (large, regenerated): `qa-reports/screenshots/`, `design-reports/screenshots/`, `investigations/screenshots/`, `canary-reports/baselines/`, `canary-reports/screenshots/`, `benchmark-reports/baselines/`, `deploy-reports/*.png`, `browse-logs/`.

---

## The Thinking

### Principle: Visibility Without Corruption

gstack has a deliberate inter-skill dependency chain:

```
/office-hours → /plan-ceo-review → /plan-eng-review → /qa → /review → /ship → /retro
     ↓                ↓                  ↓              ↓       ↓         ↓
  design doc     CEO handoff        test plan      test outcome  review log  retro snapshot
```

Each skill discovers the previous skill's output via glob patterns against `~/.gstack/projects/$SLUG/` (e.g., `ls -t ~/.gstack/projects/$SLUG/*-test-plan-*.md`). Breaking these lookups would break the workflow.

The solution preserves the chain by keeping symlinks in `~/.gstack/projects/$SLUG/` that point to the real files in `gstack/`. Skills glob `~/.gstack/projects/$SLUG/`, follow symlinks, and find the files. The files live in the project directory where you can see them.

### Why symlinks for `.gstack/` subdirectories

Skills like `/qa` have hardcoded paths (`REPORT_DIR=".gstack/qa-reports"`). These are in gstack's SKILL.md files and would be overwritten on upgrades. Instead of fighting the skill definitions, we make `.gstack/qa-reports` a symlink to `gstack/qa-reports/`. The skill writes to its expected path; the files land where we want them.

### Why copy (not redirect) for review logs

The `gstack-review-log` and `gstack-review-read` binaries are compiled executables with hardcoded paths. No config flags, no env vars. The only option is to copy after each write. The copy in `gstack/reviews/` gives you visibility; the original in `~/.gstack/` keeps the binaries working.

### Post-upgrade resilience

CLAUDE.md includes a post-upgrade health check that runs automatically after `/gstack-upgrade`:
- Verifies all `.gstack/` symlinks are intact (skill updates could replace symlinks with real directories)
- Detects new `.gstack/` subdirectories from new skills (and creates symlinks + gitignore entries)
- Reports changes to the user with explanation of how they affect the redirect

---

## Audit Method

This implementation was based on a deep audit of every gstack skill:

1. **Read every SKILL.md** (25+ skills in `~/.claude/skills/gstack/`) to extract every file write operation, path template, and cross-skill read dependency
2. **Mapped the full dependency chain** — which skill produces what file, which skill reads it, via what glob pattern
3. **Identified three write mechanisms** — Claude Write tool (redirectable via CLAUDE.md), skill-hardcoded paths (redirectable via symlinks), compiled binaries (copy only)
4. **Tested all symlinks** — Verified every symlink in `~/.gstack/projects/$SLUG/` resolves to a real file
5. **Verified build + tests pass** — No broken references in the codebase

### Key files examined

| Location | Purpose |
|---|---|
| `~/.claude/skills/gstack/*/SKILL.md` | All 25+ skill definitions (file write paths, cross-skill reads) |
| `~/.claude/skills/gstack/SKILL.md.tmpl` | Master template (shared preamble, telemetry, session tracking) |
| `~/.claude/skills/gstack/bin/gstack-*` | Binary tools (review-log, review-read, slug, config, telemetry-log) |
| `~/.gstack/` | Home directory structure (config, analytics, projects, sessions) |
| `.gstack/` | Project-local runtime directory (QA reports, screenshots, browse logs) |

---

## Applying This Pattern to Other Agentic Workflows

This same audit-and-redirect approach works for any agentic workflow package:

1. **Audit** — Read every skill/agent definition. Extract all file write paths. Map cross-skill dependencies (what reads what).
2. **Categorize writes** — Which are redirectable (text files written by the LLM), which are hardcoded (skill-level paths), which are binary (compiled tools).
3. **Create a visible folder** — `{workflow-name}/` in the project root with categorized subfolders.
4. **Redirect** — CLAUDE.md instructions for LLM writes, symlinks for hardcoded paths, copy-sync for binary writes.
5. **Preserve the chain** — Symlinks back to the workflow's expected locations so inter-step lookups still work.
6. **Gitignore selectively** — Track plans/reports/logs, ignore screenshots/binaries/caches.
7. **Add upgrade resilience** — Post-upgrade health check to detect broken symlinks or new output directories.

The goal is always the same: **see everything the workflow produces, without breaking the workflow that produces it.**
