---
phase: quick
plan: 260326-pmc
subsystem: engines/quality
tags: [quality, formatting, reporting, skill-update]
dependency_graph:
  requires: [src/engines/critic.js]
  provides: [src/engines/qualityFormatter.js]
  affects: [.claude/skills/generate-pitch-deck/SKILL.md, .claude/skills/generate-one-pager/SKILL.md]
tech_stack:
  added: []
  patterns: [named-export-utility, json-to-markdown-formatter]
key_files:
  created: [src/engines/qualityFormatter.js]
  modified: [.claude/skills/generate-pitch-deck/SKILL.md, .claude/skills/generate-one-pager/SKILL.md]
decisions:
  - Used em-dashes (--) instead of en-dashes for markdown compatibility in remediation lines
  - focusNote derives dominant problem area from completeness score + issue type counts
  - Kept .thes1s output gitignored -- quality.md is generated alongside quality.json at runtime
metrics:
  duration: 3min
  completed: "2026-03-27"
  tasks: 3
  files: 3
---

# Quick Task 260326-pmc: Human-Readable Quality Report Formatter

Quality JSON to markdown conversion utility that turns machine-readable critic.js output into a PM-scannable report with overall score, section breakdown table, high-severity issue listing, and remediation priorities sorted by urgency.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create qualityFormatter.js utility | 0dea04a | src/engines/qualityFormatter.js |
| 2 | Update SKILL.md files to produce .quality.md | 3e5624d | .claude/skills/generate-pitch-deck/SKILL.md, .claude/skills/generate-one-pager/SKILL.md |
| 3 | Generate SFM quality report to validate end-to-end | (validation only) | .thes1s/reports/SFM/quality/pitch-deck.quality.md (gitignored) |

## What Was Built

### qualityFormatter.js (`src/engines/qualityFormatter.js`)

Single named export `formatQualityReport(qualityJson, options)` that converts the quality JSON structure from `critic.js` into a concise markdown string. Output structure:

1. **Header** -- Overall score, pass/fail status, generation timestamp
2. **Section Breakdown Table** -- All sections with score, completeness %, pass/fail, issue counts by severity
3. **High-Severity Issues** -- Explicit listing of must-fix issues grouped by section
4. **Remediation Priority** -- All sections sorted by urgency (lowest score first, high-issue-count tiebreaker) with focus notes
5. **Methodology** -- Scoring weights and issue type definitions

Supports both Pitch Deck (10 sections) and One Pager (5 sections) with a `SECTION_LABELS` map and fallback title-casing.

### SKILL.md Updates

Both `generate-pitch-deck` and `generate-one-pager` skills now:
- Import and run `formatQualityReport` after generating `quality.json`
- Write `.quality.md` alongside `.quality.json` in the quality directory
- List both files in their final summary output sections

## Validation Results

- SFM Pitch Deck: 83-line markdown report, 10 sections, score 63/100 FAIL -- readable in 30 seconds
- CEG One Pager: Cross-stage compatibility confirmed, 5 sections, score 75/100 FAIL -- correct labels for one-pager section keys

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
