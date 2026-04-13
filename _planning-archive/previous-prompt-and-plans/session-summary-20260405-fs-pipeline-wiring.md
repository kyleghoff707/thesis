# Session Summary — April 5-6, 2026
## Full Story Pipeline Wiring + Validation

### What Was Accomplished
First successful in-app Full Story pipeline run (LULU). 6/6 sections, 4/4 debate steps, 9 management promises, $13.64. Pipeline runs straight through without checkpoints (~24 min).

---

## Major Changes Made

### 1. Pre-Validation Fixes (before first pipeline run)
- **KEY_NORMALIZATION** added to FullStory.jsx (42 variant mappings) and run-full-story.js — prevents silent section drops from agent key variants
- **Story-form curriculum** added to 3 agent configs (management-evaluator, valuation-specialist, financial-analyst) — agents had no FS methodology
- **Debate dispatch failure guards** in pipelineManager.js — missing context warnings in buildDebateContext(), completion guard before synthesis-writer

### 2. Stage-Specific Prompt Overlays (7 agents)
- Created `agents/{role}/prompts/fullStory.md` overlay files for all 7 agents
- Modified `loadAgentPrompt(role, stage)` in aiResearch.js — appends overlay to base prompt when stage file exists
- Passed `stage` through all 4 `dispatchAgent()` call sites in pipelineManager.js
- Overlays are additive (base prompts already had FS content), focused on: checklist output format, debate role methodology, promise tracking contract

### 3. Promise Tracker Wiring
- Management-evaluator overlay includes exact JSON contract for `promises[]` inside `data` field
- Promise extraction in both run-full-story.js AND run-pipeline.js (dual runner fix from outside voice)
- Promises embedded inside `data` field (not top-level) because Zod strips unknown properties
- First run produced 9 management promises (KEPT/PARTIAL/BROKEN/PENDING)
- FullStory.jsx already reads `fullStoryData?.promises` — no UI changes needed

### 4. RCA Fixes (from first pipeline run)
**Single root cause:** `run-pipeline.js main()` (single-stage mode) called `process.exit(0)` at line 474 before reaching FS-specific post-processing at lines 660-758.

| Fix | What |
|-----|------|
| Fix 1 | Added `if (stage === 'fullStory')` block in main() — writes full-story-api.json, debate steps, section files, promises, quality scores |
| Fix 2 | Hoisted `composedS6` in pipelineManager.js, included in debate onWaveComplete callback — fixes `inversion_rebuttal: pending` in generation-status.json |
| Fix 3 | Added `debateOutputs` to generic pipeline-output.json write |
| Fix 4 | Removed PD's `normalizeSections()` from FS block — conflicting key mappings (e.g., `management_evaluation` → PD's `management` instead of FS's `management_checklist`) |

### 5. Generation UX Parity (FullStory.jsx ← PitchDeck.jsx)
- **Phase indicators** — 2-phase horizontal bar (Deep Analysis + The Debate) with evenly-spaced circles + connectors
- **Timer** — wall-clock elapsed (m:ss), updates every 1s
- **Progress bar** — phase-based 50/50 (Phase 1 = 0-50%, Phase 2 = 50-100%)
- **Nav dot states** — gray (pending) → teal+pulse (running) → green (complete) → verdict color
- **Section placeholders** — thin faded cards with "Pending..." / "Generating..." matching PD style
- **Export buttons** — ExportButtons component in header, visible on completion

### 6. Citation Fixes (ChecklistRenderer.jsx + DebateRenderer.jsx)
- S2-S4 (checklists) and S6 (debate) had static, non-collapsible citations with plain text sources
- Ported SectionRenderer.jsx pattern: collapse toggle with chevron + clickable URL links
- Added Primary Source Insights rendering to ChecklistRenderer.jsx (was missing entirely)

### 7. Tests
- 11 new tests: 5 overlay loading + 6 promise extraction
- All existing tests pass (52/52 pipelineManager, 11/11 fullStory, 57/57 aiResearch — pre-existing failures unchanged)

---

## Bugs Fixed

1. **full-story-api.json never written** — main() exited before FS post-processing (Fix 1)
2. **debateOutputs missing** — not in generic pipeline-output.json field list (Fix 3)
3. **Promises not extracted** — extraction code in runAllStages() only, never reached by main() (Fix 1)
4. **inversion_rebuttal stuck pending** — S6 not passed to onWaveComplete (Fix 2)
5. **PD normalizeSections conflicting with FS keys** — removed from FS block (Fix 4)
6. **No generation UX** — blank screen during 25-min pipeline run (Generation UX Parity)
7. **Citations broken in S2-S4 and S6** — static list, no collapse, no clickable links (Citation Fixes)
8. **PSR insights missing from S2-S4** — ChecklistRenderer didn't render primarySourceInsights
9. **phaseStatuses temporal dead zone** — useMemo declared before sectionMap dependency
10. **getPhaseStatuses dead branch** — `else p2 = 'active'` should be `'pending'`

---

## Pipeline Run Results

### Run 1 (broken post-processing)
- 6/6 sections, 0 errors, $13.78, ~26 min
- All data produced correctly but post-processing failed (RCA root cause)
- 8 promises extracted (data was there, extraction code never ran)

### Run 2 (all fixes applied)
- 6/6 sections, 0 errors, $13.64, ~24 min
- full-story-api.json written ✓, debateOutputs present ✓, 9 promises ✓
- Quality scores written ✓, debate-step-{1-4}.json ✓, generation-status complete ✓

---

## Reviews Completed

| Review | Status | Findings |
|--------|--------|----------|
| /plan-eng-review | CLEAR | 4 issues resolved (overlay scope, promise location, tests, dual runner) |
| /plan-design-review (1st) | CLEAR | No UI scope (promise tracker already built) |
| /plan-design-review (2nd) | CLEAR | 8 parity fixes spec'd (icons, placeholders, progress bar, citations) |
| /investigate | DONE | Single root cause: main() exits before FS post-processing |
| /review | CLEAN | 3 informational auto-fixed (phase computation, dead branch, PD normalization conflict) |
| /design-review | DONE_WITH_CONCERNS | Headless browser can't access localStorage state |
| Outside voice | 1 critical (dual runner), 4 medium/low incorporated |
| Adversarial review | 12 findings, 3 real+fixed, 9 acknowledged |

---

## Cost Summary

| Stage | Run 1 | Run 2 |
|-------|-------|-------|
| Full Story | $13.78 | $13.64 |
| Total (OP+PD+FS) | — | ~$28-30 |
| Target ceiling | $15 (PD+FS) | Exceeded |

---

## Known Issues / TODOs

1. **Cost above ceiling** — $13.64 per FS run vs $15 target for PD+FS combined. PSR re-reading (7 agents) is the main driver. Could reuse PD's PSR findings instead.
2. **Promise Tracker nav dot** — gray (no verdict), by design. Could add green-when-populated.
3. **3 copies of KEY_NORMALIZATION** — run-full-story.js, run-pipeline.js, FullStory.jsx. Eng review deferred shared module extraction.
4. **Headless browser can't QA localStorage-dependent pages** — /design-review blocked by gate check. Need /setup-browser-cookies or localStorage injection.
5. **Curriculum filtering by stage** — agents load all curriculum regardless of stage. Deferred.

---

## Files Changed

| File | What changed |
|------|-------------|
| `src/engines/aiResearch.js` | loadAgentPrompt(role, stage) with overlay loading |
| `src/engines/pipelineManager.js` | stage threading, debate guards, composedS6 in onWaveComplete |
| `scripts/run-pipeline.js` | FS post-processing in main(), debateOutputs in generic write, promise extraction |
| `scripts/run-full-story.js` | KEY_NORMALIZATION, promise extraction, stale searchesPerformed removed |
| `src/components/FullStory.jsx` | Generation UX (phases, timer, bar, dots, placeholders, export), KEY_ALIASES |
| `src/components/ChecklistRenderer.jsx` | Citation collapse + links, Primary Source Insights |
| `src/components/DebateRenderer.jsx` | Citation collapse + links |
| `src/engines/__tests__/aiResearch.test.js` | 11 new tests (overlay loading + promise extraction) |
| `agents/*/config.json` | Story-form curriculum added to 3 agents |
| `agents/*/prompts/fullStory.md` | 7 new overlay files |
