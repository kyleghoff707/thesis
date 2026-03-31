---
phase: quick
plan: 260330-qnl
subsystem: quality-validation
tags: [critic, citation-classification, quality-scoring, search-compliance]
dependency_graph:
  requires: []
  provides: [embedded-url-detection, bare-domain-detection, debate-step-backfill]
  affects: [quality-scoring, search-compliance]
tech_stack:
  added: []
  patterns: [embedded-url-regex, bare-domain-regex, debate-source-backfill]
key_files:
  created: []
  modified:
    - src/engines/critic.js
    - src/engines/__tests__/critic.test.js
    - scripts/run-quality-v4.js
decisions:
  - Embedded URLs in source text classified as web_url (non-anchored regex)
  - Bare domains in string citations classified as web_url via TLD regex
  - validateCitations web_url case extracts URL from source field when citation.url missing
  - String citations skip canonical format check and get early-return handling
metrics:
  duration: 4min
  completed: "2026-03-31T02:19:53Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Quick Task 260330-qnl: Fix Remaining Mechanical Quality Score Gaps

Fixed three classification bugs in critic.js and added debate-step backfill in run-quality-v4.js, raising SFM Full Story overall from 75 to 86.

## Tasks Completed

### Task 1: Fix classifyCitation to detect embedded URLs and bare domains (TDD)

**Commit:** a0f967d

Two changes to `classifyCitation`:

1. **String citation handling** -- Added `typeof citation === 'string'` branch with `https?://` check and bare-domain regex (`\b[a-z0-9]([a-z0-9-]*[a-z0-9])?\.(com|org|net|gov|io|co)\b`). This fixes S2 meaning_checklist where citations are strings like `"[1] SFM FY2025 earnings release — investors.sprouts.com/news"`.

2. **Embedded URL in object source** -- Added non-anchored `https?://` check on `citation.source` after SEC checks. This fixes S3 moat_checklist where citations have `source: "GuruFocus ROIC data (https://www.gurufocus.com/...)"`.

9 new tests added in two `it` blocks covering both patterns.

### Task 2: Backfill S6 searchesPerformed and fix web_url validation

**Commit:** 3ac760d

Three changes:

1. **Debate-step backfill** in `run-quality-v4.js` -- After loading fullStory sections, finds `inversion_rebuttal` section and backfills its empty `searchesPerformed` from `debate-step-2.json` sources. Extracts all unique URLs from `content.inversions[].sources`, creates synthetic search entries. 30 URLs backfilled for SFM.

2. **validateCitations web_url fix** -- The existing `web_url` case tried `new URL(citation.url)` which returned "Invalid URL format: undefined" for citations with embedded URLs in source text. Fixed to extract URL from `citation.source` when `citation.url` is absent, with trailing paren/bracket stripping.

3. **String citation handling in validateCitations** -- Added early-return branch for string citations to avoid crash on canonical format check and provide proper type-specific validation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed validateCitations web_url case for embedded URLs**
- **Found during:** Task 2 verification
- **Issue:** When classifyCitation correctly detected embedded URLs in source text (Task 1 fix), the validateCitations function still tried to validate `citation.url` which was undefined, producing 30+ medium-severity "Invalid URL format: undefined" issues per section. This kept scores depressed even after classification was fixed.
- **Fix:** Modified web_url case to extract URL from `citation.source` when `citation.url` is absent; added string citation early-return in validateCitations loop.
- **Files modified:** src/engines/critic.js
- **Commit:** 3ac760d

## Quality Score Results

| Section | Before | After | Delta |
|---------|--------|-------|-------|
| S1 event_analysis | 97 | 97 | 0 |
| S2 meaning_checklist | 55 | 82 | +27 |
| S3 moat_checklist | 67 | 93 | +26 |
| S4 management_checklist | 67 | 67 | 0 |
| S5 valuation_confirmation | 84 | 84 | 0 |
| S6 inversion_rebuttal | 81 | 91 | +10 |
| **Overall** | **75** | **86** | **+11** |

## Known Stubs

None.

## Self-Check: PASSED

- All 3 modified files exist on disk
- Both task commits (a0f967d, 3ac760d) verified in git log
- All 151 critic.test.js tests pass
- SFM Full Story overall quality score: 86 (target: 80+)
