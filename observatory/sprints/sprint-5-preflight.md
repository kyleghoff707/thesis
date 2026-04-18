---
type: sprint-preflight
sprint: 5
lastUpdated: 2026-04-18T22:00:00Z
baselineCommit: 878fe13
changeCommits: [878fe13, 06d07f8, 1bc7b0a, 9add989]
tags: [sprint-5, regression-watch, preflight]
---

# Sprint 5 Pre-Flight — Regression Watchlist

> Comprehensive index of every change made between Sprint 4 wrap-up and Sprint 5 launch. Each entry pairs the change with the regression signal that would prove it broke something. After the first Sprint 5 runs, walk this list against the observatory data and flag anything that fired.
>
> **Headline expectation:** zero regressions. Verdict accuracy, section-level PASS counts, judge directional histograms, and FGR ranges should match Sprint 4 within noise. Wall time should drop ~10 min from PSR parallelization. Format violations should drop from 11+ per run to <3.

---

## Quick rollback reference

| Layer | Rollback command |
|---|---|
| All Sprint 5 prep | `git checkout 878fe13` (full reset to Sprint 4 wrap-up baseline) |
| Skill orchestrator cleanup only | `git checkout 878fe13 -- .claude/skills/` |
| PSR parallelization only | `git checkout 06d07f8 -- .claude/skills/generate-pitch-deck/SKILL.md` |
| Agent prompt edits only | `git checkout 878fe13~1 -- agents-v2/` (back to pre-no-preamble) |

---

## Change Catalog

### 1. MC-5 fullStory sweep script + Step 8.5 rewrite

- **What:** New script `scripts/observatory-sweep-debate.js` (175 lines) that scans saved debate-step-*.json artifacts and emits format-violation events for: weak-strength bull rebuttals, factual-error acknowledgments, judge schema drift (missing pointNumber/judgeScore), missing/miscounted scoreboard, stub files (<2KB), markdown-fence wrap survival. Step 8.5 in `generate-full-story/SKILL.md` rewritten as two-part sweep (scripted + orchestrator-memory residual checklist).
- **Why:** All 3 Sprint 4 fullStory orchestrators independently confirmed they skipped Step 8.5 entirely (clean-run bias, frame-bucketing, sweep-skip). Empty `formatViolations` arrays were corrupting DOE conclusions — the agents looked cleaner than reality.
- **Expected effect:** Sprint 5 fullStory `formatViolations` arrays populate non-empty when violations occur. Script prints `logged N events` line so orchestrator can attest it ran. POOL backfill found 3 events the script catches 1 of (under-logging is OK; false positives are not).
- **Files affected:** `scripts/observatory-sweep-debate.js` (new), `.claude/skills/generate-full-story/SKILL.md` Step 8.5
- **Regression signal:** A Sprint 5 fullStory orchestrator.json with `formatViolations: []` AND `retries: []` AND `stallsDetected: []` — empty arrays mean either every agent ran perfectly clean (unlikely) OR sweep was skipped again. Cross-check by reading the run's debate-step-*.json files manually for the 6 patterns the script detects.
- **Acceptance:** Sprint 5 fullStory runs produce non-zero formatViolations OR explicit `Observatory sweep: logged 0 events` evidence in the run log.

### 2. Skill orchestrator prompt cleanup (-960 lines)

- **What:** Stripped non-essential prose from all three skill files: `generate-one-pager/SKILL.md` (295→222), `generate-pitch-deck/SKILL.md` (1331→829, before PSR change), `generate-full-story/SKILL.md` (1132→747). Total -35%, 960 lines.
- **Why:** PM observation that 90+ min wall time correlated with skills being long enough to overload orchestrators. Doctrine: tell LLMs exactly what to do; extra explanation invites shortcuts.
- **Expected effect:** Orchestrators complete pipelines without confusion or step-skipping. No methodology or behavior change. Possibly modest wall-time reduction from less context to process.
- **Files affected:** `.claude/skills/generate-one-pager/SKILL.md`, `.claude/skills/generate-pitch-deck/SKILL.md`, `.claude/skills/generate-full-story/SKILL.md`
- **Regression signal:** Step skipping (e.g., MC-7 contract check fails because orchestrator skipped Step 14.4; PDF generation step skipped; observatory recording skipped per wave). Cross-check via `git diff 878fe13..HEAD -- .claude/skills/` to find what was removed if a specific behavior broke.
- **Acceptance:** All 18 skill steps execute on a Sprint 5 pitch deck or full story run (visible in the orchestrator's bash command stream). Section count contract holds (11/11). Observatory finalize runs.

### 3. PSR parallelization (pitch-deck Step 3)

- **What:** Annual readers + quarterly batches now dispatch in a SINGLE message. Previously annual readers ran first, then quarterly readers received annual findings as context. CRITICAL block in Step 3b explicitly demands parallel single-message dispatch and names the anti-pattern.
- **Why:** Wall-time bottleneck. Sequential annual-then-quarterly cost ~10 min and provided zero quality benefit since both agents extract independently.
- **Expected effect:** Pitch deck wall time drops ~10 min. PSR section quality unchanged. Cross-period reconciliation (annual long-term promises ↔ quarterly short-term execution) now happens in merge step (3c) via new `promiseReconciliation[]` array in `psrFindings`.
- **Files affected:** `.claude/skills/generate-pitch-deck/SKILL.md` Step 3 (Step 3a unchanged, Step 3b rewritten, old Step 3c removed, Step 3d renamed to 3c with new merge logic)
- **Regression signal:** (1) Sprint 5 pitch deck Wave 0 `dispatch` event shows `parallel: false` OR shows two separate Wave 0 dispatches (annual then quarterly) → orchestrator regressed to old sequential pattern. (2) `psrFindings.promiseReconciliation` missing or empty → merge step skipped the cross-check. (3) Quarterly reader output mentions "annual findings" or "the annual reader said" → quarterly reader was passed annual context against the new instruction.
- **Acceptance:** Wave 0 dispatch event has `parallel: true` with all annual + quarterly agents in one record. Pitch deck wall time drops measurably (target -10 min). PSR-derived section quality (PSR section verdict counts, citation density) within ±10% of Sprint 4 baseline.

### 4. Bull source-quality gate (synthesis-writer-fullstory)

- **What:** Added two paragraphs in `agents-v2/synthesis-writer-fullstory/prompt.md` after the Bull web-search section: prefer primary sources (SEC filings, press releases, transcripts, dated analyst publications) over content aggregators (ibtimes, *.fool, generic Seeking Alpha listicles, undated "10 stocks Buffett is buying" articles); name analyst firm + date + direction explicitly. Plus Rule One Operating Rule #2 enforcement: guru ownership is context, NOT confirmation; cannot be a thesis-strength point.
- **Why:** EXP-003 gave Bull web search for the first time. Sprint 4 backfill found 5 Bull factual errors across LULU + POOL: T5 used Phil Town/Burry guru ownership as conviction evidence (Rule One #2 violation), T4 made unsupported forward-math claims, T3 omitted On Holding's 62.8% gross margin, plus Wells Fargo direction error and ibtimes.com.au source quality.
- **Expected effect:** Sprint 5 fullStory Bull thesis points no longer cite guru ownership as conviction. Analyst-action citations name firm + date + direction. Rebuttal `rebuttalStrength: "weak"` count on Bull-error class points should drop from ~3/run to <1.
- **Files affected:** `agents-v2/synthesis-writer-fullstory/prompt.md` (lines 113-117)
- **Regression signal:** Sprint 5 Bull thesis JSON contains a `thesisPoint` with guru ownership as primary evidence (e.g. "Phil Town holds 26%") OR contains an analyst-action paraphrase without firm/date/direction OR cites a content-aggregator URL (ibtimes, fool, undated articles).
- **Acceptance:** Sprint 5 Bull thesis points all source-quality compliant. Rebuttal weak-strength count drops vs Sprint 4 baseline (Sprint 4 LULU: R4 weak; SFM: R6 strong + several moderate; POOL: 0 weak; Sprint 5 target: 0-1 weak per run).

### 5. No-preamble rule (17 agent prompts)

- **What:** Strengthened the "Return ONLY the JSON" instruction across 17 JSON-returning agent prompts. Added: first character must be `{` or `[`, last character must be `}` or `]`; named forbidden examples ("Now I have all the data...", "Let me compile...", "I now have enough data..."); observability note that violations are now logged.
- **Why:** Sprint 4 backfill found 11+ "preamble before JSON" violations across all Phase 1 sonnet agents. The previous instruction "no commentary outside the JSON" was being parsed as "no inline comments" rather than "no text before/after JSON."
- **Expected effect:** `formatViolations` count for "preamble" violations drops from 11+ per pitchDeck/fullStory run to <3.
- **Files affected:** All 17 agents in `agents-v2/` that return JSON: business-analyst (PD+FS), competitor-evaluator-market-position-pitchdeck, competitor-evaluator-moats-pitchdeck, competitor-evaluator-fullstory, financial-analyst (PD+FS), management-evaluator (PD+FS), risk-analyst (PD+FS), valuation-specialist (PD+FS), synthesis-writer (PD+FS), annual-reader, quarterly-reader, one-pager
- **Regression signal:** A Sprint 5 saved section JSON file that, when read raw, starts with text other than `{` or `[`. Or observatory format-violations page shows preamble violations >3 per run.
- **Acceptance:** Total `formatViolations` count per Sprint 5 run is <3 (was 11+). All saved section files start with `{`.

### 6. Judge schema requirement (financial-analyst-fullstory)

- **What:** Added explicit schema requirement in `agents-v2/financial-analyst-fullstory/prompt.md` Output Format section: top-level `overallDirection` (NOT nested under `overallVerdict`); per-exchange `pointNumber`, `judgeScore`, `severityFromBear` populated.
- **Why:** Sprint 4 LULU + SFM judges produced `pointNumber: null` and `judgeScore: null` on every exchange. LULU additionally caused a silent assembly bug — `exchangeCount: 0` in full-story.json despite 11 actual exchanges, because the judge wrapped the payload in an unexpected `content: {}` structure.
- **Expected effect:** Sprint 5 judge `exchanges[]` array has populated `pointNumber` and `judgeScore` on every entry. `severityFromBear` populated. Top-level `overallDirection` field present (not nested).
- **Files affected:** `agents-v2/financial-analyst-fullstory/prompt.md` (Output Format section, ~310)
- **Regression signal:** Sprint 5 `debate-step-4-judge.json` with `judgeScore: null` or `pointNumber: null` on any exchange. OR `overallDirection` only found nested under `overallVerdict`. OR `full-story.json` shows `exchangeCount: 0` despite the judge file having multiple exchanges.
- **Acceptance:** Judge schema drift count in MC-5 sweep output is 0. Full-story.json `debateOutcome.exchangeCount` matches actual judge exchanges count.

### 7. Write-tool prohibition for debate roles

- **What:** Added explicit instruction in `agents-v2/risk-analyst-fullstory/prompt.md` (Bear) and `agents-v2/synthesis-writer-pitchdeck/prompt.md` (debate roles): return JSON inline; do NOT use the Write tool to save debate-step-*.json or inversion_rebuttal.json directly.
- **Why:** Sprint 4 SFM Bear used Write tool to save debate-step-2-bear.json directly; Compose used Write tool to save inversion_rebuttal.json directly. Orchestrator verified files existed but couldn't extract JSON from response, breaking the JSON Extraction Fallback Chain pipeline.
- **Expected effect:** Sprint 5 debate agents return JSON in their response body. Orchestrator's JSON Extraction Fallback Chain operates normally. No "protocol violation: used Write tool" format-violations.
- **Files affected:** `agents-v2/risk-analyst-fullstory/prompt.md`, `agents-v2/synthesis-writer-pitchdeck/prompt.md`
- **Regression signal:** Sprint 5 format-violations contains "protocol violation: used Write tool". OR debate-step JSON files exist on disk but the orchestrator's response shows no extracted JSON.
- **Acceptance:** Zero "protocol violation" format-violations in Sprint 5 fullStory runs.

### 8. PDF rendering fallback fix

- **What:** Added `full-story.json` fallback path in `scripts/pdf/report_data_reader.py` stage loader. Reader was only checking `full-story-api.json` and silently producing 2-page PDFs (title + empty citations) when only `full-story.json` existed.
- **Why:** LULU full-story PDF was rendering as 2 pages despite 36-page expected output. Root cause: orchestrator wrote `full-story.json` per skill spec; reader's fallback chain was incomplete.
- **Expected effect:** Sprint 5 full-story PDFs render with full content (~30-40 pages typical). No silent 2-page outputs.
- **Files affected:** `scripts/pdf/report_data_reader.py` (lines 60-63, fallback added)
- **Regression signal:** Sprint 5 full-story PDF file size <50KB (Sprint 4 backfilled LULU: 224KB / 36 pages).
- **Acceptance:** All Sprint 5 full-story PDFs >100KB, render >20 pages.

### 9. Methodology decisions (no code change)

- **What:** Two pattern statuses changed by PM directive: `bear-bull-asymmetry` ACTIVE → MITIGATED (EXP-003 worked); `wonderful-company-premium` PARKED → REJECTED (50% MOS is Rule One non-negotiable cutoff). EXP-004 explicitly not pursued.
- **Why:** Sprint 4 EXP-003 achieved Bull-leaning judge directional histograms across all 3 tickers. Methodology is locked in — no further debate-framework or MOS-adjustment experiments planned.
- **Expected effect:** No verdict-mapping changes. Verdicts remain price-conditional (great company at wrong price = WATCHLIST is correct Rule One behavior). Verdict accuracy under strict equality stays ~0%, BUT judge directional histograms should remain Bull-leaning on POOL/SFM/LULU.
- **Files affected:** `observatory/patterns/bear-bull-asymmetry.md`, `observatory/patterns/wonderful-company-premium.md`
- **Regression signal:** Sprint 5 judge directional histograms revert to bear-dominant (more Strong Bear than Strong Bull on POOL/SFM/LULU) — would indicate prompt-cache or stale agent dispatch reverting EXP-003.
- **Acceptance:** Sprint 5 fullStory judge histograms remain Bull-leaning: POOL ≥2 Strong Bull / ≤1 Strong Bear, SFM ≥2 Strong Bull / ≤1 Strong Bear, LULU ≥3 Strong Bull / ≤3 Strong Bear.

### 10. .thes1s working state nuke

- **What:** Removed all per-ticker working files and the 66MB cache. Preserved 43 archived runs across 6 tickers.
- **Why:** Clean slate before Sprint 5. Stale data-packets, sections, transcripts could confuse runs.
- **Expected effect:** First Sprint 5 run on any ticker rebuilds DataPacket, filings-md, transcripts from scratch. Archive history fully available for comparison.
- **Files affected:** `.thes1s/cache/` (deleted, regenerable), `.thes1s/reports/{TICKER}/` (working files deleted, archive/ preserved)
- **Regression signal:** Pipeline failures on first Sprint 5 run citing missing data-packet.json or sections/. Should not happen — prepare-data.js rebuilds everything.
- **Acceptance:** First Sprint 5 run on each of LULU/POOL/SFM completes prepare-data.js without errors.

---

## Cross-cutting acceptance gates (run after first Sprint 5 pipeline)

| Gate | How to check | Pass condition |
|---|---|---|
| **Verdict accuracy** | `node scripts/observatory-query.js --verdict-accuracy` | Same as Sprint 4: ~0% under strict equality, but judge directional Bull-leaning |
| **Section PASS counts** | per-ticker verdict-check.json sectionVerdicts | POOL ≥3 PASS, SFM ≥6 PASS, LULU ≥1 PASS (Sprint 4 baseline) |
| **Wall time** | manifest.json totalWallTimeSeconds | Pitch deck drops ~10 min vs Sprint 4 baseline (PSR parallelization effect) |
| **Format violations** | orchestrator.json formatViolations array length | <3 per pitch deck / fullStory run (was 11-13 in Sprint 4) |
| **Judge schema** | debate-step-4-judge.json exchanges[] | All exchanges have non-null pointNumber + judgeScore |
| **Bull source quality** | debate-step-1-bull.json thesisPoints | No guru-as-conviction; analyst actions cite firm + date + direction |
| **PSR parallel** | orchestrator.json dispatches[] for Wave 0 | One record with parallel: true containing all annual + quarterly agents |
| **PDF rendering** | full-story.pdf file size | >100KB |
| **MC-5 sweep ran** | run log mentions "Observatory sweep: logged N events" | Line present in run output |

If any gate fails, cross-reference the change catalog above to identify the suspect change. Use the per-change rollback in the Quick rollback reference table.

---

## What we did NOT change (regression-watch baseline)

These are stable from Sprint 4 — if behavior here changes in Sprint 5, the cause is NOT in this debrief:

- DataPacket assembly logic (`scripts/assemble-data.js`, `api/src/assembly/`)
- DataPacket slicing rules (`scripts/slice-datapacket.js`)
- Observatory init / record-agent / record-event / finalize / synthesize scripts
- Quality engine (`src/engines/critic.js`)
- Budget tracker (`src/engines/contextBudget.js`)
- All XBRL extraction logic and overlays
- All financial scoring algorithms (FGR, MOS, PBT, Ten Cap, Equity Bond)
- known-verdicts.json
- All wave/phase task instructions in skills (only inter-step prose was cleaned)
- All FGR derivation methodology
- All pitch deck section schemas
- All full story checklist scoring

If a verdict shift occurs in Sprint 5, the most likely causes (in order of probability):
1. Bull source-quality gate (#4) — could legitimately reduce Bull thesis strength
2. PSR parallelization (#3) — if cross-period reconciliation in merge step is incomplete
3. No-preamble rule (#5) — unlikely to affect content but possible if agents over-correct
4. Skill orchestrator cleanup (#2) — possible step-skipping side effects

If a verdict shift occurs and none of those four are the cause, look outside this debrief.
