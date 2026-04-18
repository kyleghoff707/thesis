# Observatory Log

> Append-only chronological record of pipeline runs, wiki updates, and prompt changes.
> Each entry is timestamped and linked to relevant wiki pages.

---


## [2026-04-16] run | LULU onePager | 20260415-203246-LULU-onePager
- Verdict: WATCHLIST (expected: not set) — no expected verdict
- Cost: $0.00 | Duration: 4min | Sections: 6/6
- Failures: none

## [2026-04-16] run | POOL onePager | 20260415-204150-POOL-onePager
- Verdict: PASS (expected: not set) — no expected verdict
- Cost: $0.00 | Duration: 4min | Sections: 6/6
- Failures: none

## [2026-04-16] run | UBER onePager | 20260415-204928-UBER-onePager
- Verdict: WATCHLIST (expected: not set) — no expected verdict
- Cost: $0.00 | Duration: 3min | Sections: 6/6
- Failures: none

## [2026-04-16] run | UBER pitchDeck | 20260415-205824-UBER-pitchDeck
- Verdict: WATCHLIST (expected: not set) — no expected verdict
- Cost: $0.00 | Duration: 25min | Sections: 10/11
- Failures: none

## [2026-04-16] run | UBER fullStory | 20260415-213506-UBER-fullStory
- Verdict: WATCHLIST (expected: not set) — no expected verdict
- Cost: $0.00 | Duration: 15min | Sections: 6/6
- Failures: none

## [2026-04-16] run | LULU pitchDeck | 20260415-204131-LULU-pitchDeck
- Verdict: WATCHLIST (expected: not set) — no expected verdict
- Cost: $0.00 | Duration: 58min | Sections: 10/11
- Failures: none

## [2026-04-16] run | POOL pitchDeck | 20260415-204842-POOL-pitchDeck
- Verdict: WATCHLIST (expected: not set) — no expected verdict
- Cost: $0.00 | Duration: 60min | Sections: 10/11
- Failures: none

## [2026-04-16] run | LULU fullStory | 20260415-220013-LULU-fullStory
- Verdict: WATCHLIST (expected: not set) — no expected verdict
- Cost: $0.00 | Duration: 55min | Sections: 6/6
- Failures: none

## [2026-04-16] run | POOL fullStory | 20260415-221815-POOL-fullStory
- Verdict: WATCHLIST (expected: not set) — no expected verdict
- Cost: $0.00 | Duration: 50min | Sections: 6/6
- Failures: none

## [2026-04-16] wiki-update | batch synthesis | 4 pages updated
- Tickers: LULU, POOL, UBER
- Agents: none (no agent records yet)

## [2026-04-16] post-mortem | Sprint 1 debrief — 8 issues across 9 runs

### Issue 1: Sequential dispatch (all 3 pitch deck runs) — FIXED
- **Severity:** HIGH — 2-3x longer wall time than expected
- **Affected runs:** 20260415-204131-LULU-pitchDeck (58min), 20260415-204842-POOL-pitchDeck (60min), 20260415-205824-UBER-pitchDeck (25min)
- **Root cause:** Pitch deck skill headers literally said "Dispatch Agents Sequentially" at Waves 1-3 (lines 319, 401, 496), contradicting the parallel dispatch instruction at line 108. Claude followed the header at dispatch time.
- **Fix:** Renamed headers to "PARALLEL DISPATCH" with CRITICAL callout blocks. Also strengthened full story Phase 1 parallel instructions.
- **Expected impact:** Pitch deck wall time should drop from 55-60min to 20-30min
- See [[failure-modes/sequential-dispatch]]

### Issue 2: Observatory agent records empty (all 9 runs) — FIXED
- **Severity:** HIGH — no per-agent observability data
- **Root cause:** Skills called CLI scripts for init/finalize but no CLI wrapper existed for per-agent recording. `recordAgent()` only existed on JS engine module (unusable from skill markdown). `runs/*/agents/` created but never populated.
- **Fix:** Created `scripts/observatory-record-agent.js`. Added recording steps after each wave/phase in all 3 skills.

### Issue 3: Observatory orchestrator logs empty (all 9 runs) — FIXED
- **Severity:** MEDIUM — no dispatch/retry/stall tracking
- **Root cause:** Same as Issue 2 — no CLI wrapper for `recordWave()`, `recordRetry()`, etc.
- **Fix:** Created `scripts/observatory-record-event.js` with dispatch/retry/stall/format-violation/data-gap subcommands. Wired into skills after each wave.

### Issue 4: Cost $0.00 in log.md (all 9 runs) — FIXED
- **Severity:** LOW — manifests had correct costs, only log.md was wrong
- **Root cause:** Bug in `observatory-finalize.js` line 150: used `cliCost` (always null) instead of `estimatedCost` (correctly derived from --tokens). Same bug on line 180.
- **Fix:** Changed both lines to use `estimatedCost`. Added missing `--model` flag parser.

### Issue 5: Wiki synthesis never ran / required API key — FIXED
- **Severity:** MEDIUM — no wiki pages after runs, hidden API cost
- **Root cause:** `observatorySynthesize.js` called Anthropic API directly (`new Anthropic()`, `claude-sonnet-4-6`). Skills didn't include a synthesis step. Unnecessary cost when running in Claude Code.
- **Fix:** Rewrote to be fully deterministic (template-based, $0 cost). Added synthesis step to all 3 skills. Backfilled existing 9 runs.

### Issue 6: UBER orchestrator truncation (pitch deck + full story) — MONITORING
- **Severity:** HIGH — 75-97% content loss on 1 of 3 runs
- **Affected runs:** 20260415-205824-UBER-pitchDeck, 20260415-213506-UBER-fullStory
- **Root cause:** Orchestrator wrote abbreviated summaries to disk instead of full agent output. Agents produced 10-50KB each; orchestrator reconstructed compact JSON from memory. All 4 debate steps missing. Pitch deck: 3.7K chars vs 50-80K expected.
- **Status:** NOT FIXED — occurred on 1/3 runs with identical instructions. Monitoring for recurrence.
- See [[tickers/UBER]] Known Issues

### Issue 7: known-verdicts.json empty — FIXED
- **Severity:** LOW — no verdict accuracy calibration possible
- **Fix:** Populated with LULU=BUY, POOL=BUY, UBER=BUY

### Issue 8: Permission prompts during autonomous runs — FIXED
- **Severity:** LOW — interrupted autonomous execution
- **Root cause:** `WebFetch` only whitelisted for specific domains. Research agents fetching arbitrary finance/news sites triggered approval prompts.
- **Fix:** Added broad `WebFetch` permission to settings.local.json

## [2026-04-16] wiki-update | 2 pages updated
- Updated: [[tickers/POOL]], [[patterns/verdict-accuracy]]

## [2026-04-16] run | NKE onePager | 20260416-073716-NKE-onePager
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $0.77 | Duration: 4min | Sections: 6/6
- Failures: none

## [2026-04-16] wiki-update | 3 pages updated
- Updated: [[tickers/NKE]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-16] run | UBER onePager | 20260416-073658-UBER-onePager
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $0.75 | Duration: 4min | Sections: 6/6
- Failures: none

## [2026-04-16] run | POOL onePager | 20260416-073647-POOL-onePager
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $0.73 | Duration: 4min | Sections: 6/6
- Failures: none

## [2026-04-16] wiki-update | 3 pages updated
- Updated: [[tickers/UBER]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-16] wiki-update | 3 pages updated
- Updated: [[tickers/POOL]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-16] run | SFM onePager | 20260416-073723-SFM-onePager
- Verdict: PASS (expected: BUY) — MISMATCH
- Cost: $0.91 | Duration: 5min | Sections: 6/6
- Failures: none

## [2026-04-16] wiki-update | 3 pages updated
- Updated: [[tickers/SFM]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-16] run | LULU onePager | 20260416-073658-LULU-onePager
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $0.80 | Duration: 5min | Sections: 6/6
- Failures: none

## [2026-04-16] wiki-update | 3 pages updated
- Updated: [[tickers/LULU]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-16] run | POOL pitchDeck | 20260416-074532-POOL-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $3.90 | Duration: 60min | Sections: 10/11
- Failures: none

## [2026-04-16] wiki-update | 2 pages updated
- Updated: [[tickers/POOL]], [[patterns/verdict-accuracy]]

## [2026-04-16] run | UBER pitchDeck | 20260416-074526-UBER-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $9.36 | Duration: 80min | Sections: 10/11
- Failures: none

## [2026-04-16] run | NKE pitchDeck | 20260416-074337-NKE-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $8.93 | Duration: 47min | Sections: 10/11
- Failures: none

## [2026-04-16] wiki-update | 2 pages updated
- Updated: [[tickers/NKE]], [[patterns/verdict-accuracy]]

## [2026-04-16] run | UBER fullStory | 20260416-083535-UBER-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $3.90 | Duration: 77min | Sections: 5/6
- Failures: none

## [2026-04-16] run | SFM pitchDeck | 20260416-074720-SFM-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $6.24 | Duration: 70min | Sections: 10/11
- Failures: none

## [2026-04-16] run | LULU pitchDeck | 20260416-074734-LULU-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $7.02 | Duration: 90min | Sections: 10/11
- Failures: none

## [2026-04-16] wiki-update | 2 pages updated
- Updated: [[tickers/LULU]], [[patterns/verdict-accuracy]]

## [2026-04-16] run | POOL fullStory | 20260416-083203-POOL-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $3.12 | Duration: 90min | Sections: 6/6
- Failures: none

## [2026-04-16] wiki-update | 2 pages updated
- Updated: [[tickers/POOL]], [[patterns/verdict-accuracy]]

## [2026-04-17] run | SFM fullStory | 20260416-112225-SFM-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $3.90 | Duration: 100min | Sections: 6/6
- Failures: none

## [2026-04-17] run | LULU fullStory | 20260416-115440-LULU-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $3.90 | Duration: 60min | Sections: 6/6
- Failures: none

## [2026-04-17] run | NKE fullStory | 20260416-084749-NKE-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $7.10 | Duration: 90min | Sections: 6/6
- Failures: none

## [2026-04-17] wiki-update | 12 pages updated
- Updated: [[tickers/UBER]], [[agents/annual-reader]], [[agents/quarterly-reader]], [[agents/business-analyst]], [[agents/competitor-market-position]], [[agents/competitor-moats]], [[agents/financial-analyst]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]], [[patterns/verdict-accuracy]]

## [2026-04-17] wiki-update | 9 pages updated
- Updated: [[tickers/UBER]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst]], [[agents/synthesis-writer]], [[patterns/verdict-accuracy]]

## [2026-04-17] post-mortem | Sprint 2 debrief — 5 tickers, 15 runs, 4 key learnings

**EXP-001 result:** REJECTED. All-sonnet produced identical verdict distribution to mixed opus/sonnet (89% → 93% WATCHLIST). Model is not the driver. See [[experiments/doe-log]] and [[patterns/model-independence]].

### 4 Methodology Learnings

1. **Model independence** ([[patterns/model-independence]]): Opus vs Sonnet makes zero difference on verdicts. Conservatism is prompt-driven, not model-driven. Sonnet is the correct default (cheaper, same output).

2. **Valuation drives verdict** ([[patterns/valuation-drives-verdict]]): Business quality sections mostly PASS (POOL had 7/10 PASS). Overall verdict follows valuation, not quality. This is actually correct Rule One behavior — great company at wrong price = WATCHLIST.

3. **Debate downgrades verdict** ([[patterns/debate-downgrades-verdict]]): Full story adversarial debate has structural asymmetry — bear mandated to demolish, bull merely summarizes. SFM went PASS → WATCHLIST through debate. Verdicts can only stay flat or downgrade, never upgrade.

4. **Orchestrator truncation is systemic** ([[patterns/orchestrator-truncation]]): 4/5 full stories had data loss in Sprint 2. UBER and LULU critical (stub outputs), POOL and SFM moderate (1-line debate summaries). Only NKE produced complete output (237K). This is now confirmed as a pattern, not a one-off.

### Mechanical Issues Persisting from Sprint 1

- **Parallel dispatch fix did NOT work** — LULU pitch deck went from 58min to 90min. UBER from 25min to 80min. Headers renamed but orchestrators still dispatch sequentially.
- **Observatory recording only works for one-pager** — pitch deck and full story agent files still empty. Recording steps not being executed.
- **Wiki synthesis inconsistent** — some ticker pages incomplete or stale

## [2026-04-17] wiki-update | 16 pages updated
- Updated: [[tickers/LULU]], [[agents/annual-reader-fy2022]], [[agents/annual-reader-fy2023]], [[agents/annual-reader-fy2024]], [[agents/annual-reader-fy2025]], [[agents/annual-reader-fy2026]], [[agents/quarterly-reader]], [[agents/business-analyst]], [[agents/competitor-market-position]], [[agents/competitor-moats]], [[agents/financial-analyst]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]], [[patterns/verdict-accuracy]]

## [2026-04-17] wiki-update | 12 pages updated
- Updated: [[tickers/LULU]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst-judge]], [[agents/risk-analyst-bear]], [[agents/synthesis-writer-bull]], [[agents/synthesis-writer-compose]], [[agents/synthesis-writer-rebuttal]], [[patterns/verdict-accuracy]]

## [2026-04-17] wiki-update | 12 pages updated
- Updated: [[tickers/NKE]], [[agents/annual-reader]], [[agents/quarterly-reader]], [[agents/business-analyst]], [[agents/competitor-market-position]], [[agents/competitor-moats]], [[agents/financial-analyst]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]], [[patterns/verdict-accuracy]]

## [2026-04-17] wiki-update | 16 pages updated
- Updated: [[tickers/SFM]], [[agents/annual-reader-fy2021]], [[agents/annual-reader-fy2022]], [[agents/annual-reader-fy2023]], [[agents/annual-reader-fy2024]], [[agents/annual-reader-fy2025]], [[agents/quarterly-reader]], [[agents/business-analyst]], [[agents/competitor-market-position]], [[agents/competitor-moats]], [[agents/financial-analyst]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]], [[patterns/verdict-accuracy]]

## [2026-04-17] wiki-update | 12 pages updated
- Updated: [[tickers/NKE]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst-judge]], [[agents/risk-analyst-bear]], [[agents/synthesis-writer-bull]], [[agents/synthesis-writer-compose]], [[agents/synthesis-writer-rebuttal]], [[patterns/verdict-accuracy]]

## [2026-04-17] wiki-update | 12 pages updated
- Updated: [[tickers/SFM]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst-judge]], [[agents/risk-analyst-bear]], [[agents/synthesis-writer-bull]], [[agents/synthesis-writer-compose]], [[agents/synthesis-writer-rebuttal]], [[patterns/verdict-accuracy]]

## [2026-04-17] sprint-3-prep | 7 changes for Sprint 3 — reduce conservatism-bias

### Mechanical Changes (4)

**MC-1: Observatory recording REQUIRED** — Removed all "non-blocking" language from observatory steps in all 3 skills. Changed to "MUST run" + retry-once. Sprint 2 showed 0/5 pitch deck + 0/5 full story agent recordings because orchestrators deprioritized optional steps.
- Regression signal: agent files empty in `observatory/runs/*/agents/` for pitch deck or full story runs

**MC-2: Full-fidelity output saving CRITICAL RULE** — Added prominent rule block at top of pitch-deck and full-story skills banning stub saves. Minimum size thresholds: 5KB for sections, 2KB for debate steps. Sprint 2 had 4/5 full stories truncated (LULU 2KB, UBER 3.3KB, POOL/SFM debate steps 1-line).
- Regression signal: section files under 5KB, debate-step files under 2KB, full-story.json under 50KB

**MC-3: DataPacket slicing script** — Created `scripts/slice-datapacket.js` so orchestrators can slice with one bash call instead of manual field extraction. All 5 Sprint 2 orchestrators independently skipped slicing due to cognitive load. Added CRITICAL RULE to both skills.
- Regression signal: orchestrator passes full DataPacket file path to agents instead of embedding sliced JSON

**MC-4: DataPacket slicing CRITICAL RULE** — Added "MUST NOT pass the full DataPacket file path" mandate to pitch-deck and full-story skills. Script handles extraction automatically.
- Regression signal: agents receive 200KB DataPacket instead of 40-130KB slices

### Methodology Changes (3) — EXP-002

**MT-1: "Conservative bias is non-negotiable" → "Evidence-based analysis is non-negotiable"** — Changed in valuation-specialist (PD+FS) prompt.md + managed-agent.yaml. Removes the mandate to "round down" when uncertain.
- Regression signal: FGR ranges stay at Sprint 2 levels (LULU 6-10%) instead of rising

**MT-2: FGR Attack Methodology → FGR Stress Test** — Changed in risk-analyst (PD+FS) prompt.md + managed-agent.yaml. Risk analyst now assesses both directions (too conservative AND too aggressive) instead of only constructing downside counter-arguments.
- Regression signal: risk analyst still only attacks FGR downward without considering upside

**MT-3: "Optimism is the enemy of good investing" removed (5 instances)** — Replaced across valuation-specialist, risk-analyst, financial-analyst, synthesis-writer (PD+FS). New language: "The goal is accuracy, not conservatism. An FGR that is too low is just as wrong as one that is too high."
- Regression signal: any agent output containing "optimism is the enemy" (would indicate stale prompt)

## [2026-04-17] run | POOL onePager | 20260416-194150-POOL-onePager
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $0.89 | Duration: 3min | Sections: 6/6
- Failures: none

## [2026-04-17] run | SFM onePager | 20260416-194200-SFM-onePager
- Verdict: PASS (expected: BUY) — MISMATCH
- Cost: $1.15 | Duration: 3min | Sections: 6/6
- Failures: none

## [2026-04-17] wiki-update | 3 pages updated
- Updated: [[tickers/POOL]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-17] wiki-update | 3 pages updated
- Updated: [[tickers/SFM]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-17] run | LULU onePager | 20260416-194202-LULU-onePager
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $0.00 | Duration: 7min | Sections: 6/6
- Failures: none

## [2026-04-17] wiki-update | 3 pages updated
- Updated: [[tickers/LULU]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-17] run | SFM pitchDeck | 20260416-195002-SFM-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $10.92 | Duration: 50min | Sections: 10/11
- Failures: none

## [2026-04-17] wiki-update | 10 pages updated
- Updated: [[tickers/SFM]], [[agents/business-analyst]], [[agents/competitor-market-position]], [[agents/competitor-moats]], [[agents/financial-analyst]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]], [[patterns/verdict-accuracy]]

## [2026-04-17] run | LULU pitchDeck | 20260416-195056-LULU-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $7.80 | Duration: 42min | Sections: 10/11
- Failures: none

## [2026-04-17] wiki-update | 12 pages updated
- Updated: [[tickers/LULU]], [[agents/annual-reader]], [[agents/quarterly-reader]], [[agents/business-analyst]], [[agents/competitor-market-position]], [[agents/competitor-moats]], [[agents/financial-analyst]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]], [[patterns/verdict-accuracy]]

## [2026-04-17] run | POOL pitchDeck | 20260416-194956-POOL-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $12.48 | Duration: 27min | Sections: 10/11
- Failures: none

## [2026-04-17] wiki-update | 12 pages updated
- Updated: [[tickers/POOL]], [[agents/annual-reader]], [[agents/quarterly-reader]], [[agents/business-analyst]], [[agents/competitor-market-position]], [[agents/competitor-moats]], [[agents/financial-analyst]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]], [[patterns/verdict-accuracy]]

## [2026-04-17] run | SFM fullStory | 20260416-205941-SFM-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $7.02 | Duration: 58min | Sections: 6/6
- Failures: none

## [2026-04-17] wiki-update | 12 pages updated
- Updated: [[tickers/SFM]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst-judge]], [[agents/risk-analyst-bear]], [[agents/synthesis-writer-bull]], [[agents/synthesis-writer-compose]], [[agents/synthesis-writer-rebuttal]], [[patterns/verdict-accuracy]]

## [2026-04-17] run | LULU fullStory | 20260416-210309-LULU-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $4.68 | Duration: 33min | Sections: 6/6
- Failures: none

## [2026-04-17] wiki-update | 12 pages updated
- Updated: [[tickers/LULU]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst-judge]], [[agents/risk-analyst-bear]], [[agents/synthesis-writer-bull]], [[agents/synthesis-writer-compose]], [[agents/synthesis-writer-rebuttal]], [[patterns/verdict-accuracy]]

## [2026-04-17] run | POOL fullStory | 20260416-210339-POOL-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $5.46 | Duration: 25min | Sections: 6/6
- Failures: none

## [2026-04-17] wiki-update | 12 pages updated
- Updated: [[tickers/POOL]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst-judge]], [[agents/risk-analyst-bear]], [[agents/synthesis-writer-bull]], [[agents/synthesis-writer-compose]], [[agents/synthesis-writer-rebuttal]], [[patterns/verdict-accuracy]]

## [2026-04-17] run | TSCO onePager | 20260417-071237-TSCO-onePager
- Verdict: WATCHLIST (expected: not set) — no expected verdict
- Cost: $0.70 | Duration: 3min | Sections: 6/6
- Failures: none

## [2026-04-17] wiki-update | 3 pages updated
- Updated: [[tickers/TSCO]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-17] sprint-4-prep | 2 mechanical changes for Sprint 4

**MC-5: Orchestrator event-logging — reactive code blocks + retrospective sweep** — All 3 pipeline skills (one-pager, pitch-deck, full-story) updated to force observatory event logging into orchestrator behavior. Root cause (all 3 Sprint 3 orchestrators converged on same diagnosis in verbatim debriefs): narrative prose instructions get weighted less than code blocks; orchestrators in "get it done" mode treat mid-wave problem-solving as silent cleanup rather than loggable telemetry. Silent success looks like clean telemetry — but the empty `retries: []`, `stallsDetected: []`, `formatViolations: []` arrays in Sprint 3 actually hid 3+ retries, 2+ stalls, and 6+ format violations per full story run. DOE experiments reading cleaner-than-reality telemetry would conclude "prompts produce clean output" when the orchestrator was smoothing over mess.

**Two-layer fix:**
- *Reactive layer:* Explicit `node scripts/observatory-record-event.js` code blocks injected inline at the JSON Extraction Fallback Chain, Narrative Recovery, and Retry Logic sections of pitch-deck and full-story skills. Each trigger point now has a ready-to-run command next to the narrative description. Verification counts: 10 event-log code blocks each in pitch-deck and full-story; 2 in the lighter-weight one-pager.
- *Retrospective layer:* New "Pre-Finalize Event Sweep" step inserted before `observatory-finalize.js` in all 3 skills. Enumerates each event class (retry, stall, format-violation, data-gap) as an explicit yes/no checklist the orchestrator must answer honestly before sealing the run. Fits natural end-of-pipeline bookkeeping mode better than "log during the wave" mid-dispatch.

Regression signal: if Sprint 4 pitch deck or full story runs complete with empty arrays across all four orchestrator event types, either the sweep is being skipped OR every agent genuinely produced clean output on first attempt. Cross-check against `observatory/runs/*/agents/*.json` toolUses for retry signals. TSCO one-pager smoke test (20260417-071237) completed with no violations or retries logged — plausible for a clean single-agent run but confirm by reading the TSCO orchestrator.json against the run transcript.

**MC-6: One-pager DataPacket slicing (EXP-005 implementation)** — [scripts/slice-datapacket.js](../scripts/slice-datapacket.js#L42) `one-pager` registry entry tightened from 16 fields to 11 (drops insiders/filings/compensation/peers/peerMetrics/ruleOneScore; keeps gurus per user direction). [.claude/skills/generate-one-pager/SKILL.md](../.claude/skills/generate-one-pager/SKILL.md) Step 3 now runs the slice; Step 4 embeds sliced JSON with a prompt-level note directing agent to web search for narrative context. Measured: 137KB → 90KB (34% reduction, ~12K tokens saved per run). See [[experiments/doe-log]] EXP-005.

TSCO smoke test (20260417-071237-TSCO-onePager): $0.70, 3min, 6/6 sections — on par with Sprint 3 one-pager baseline ($0.73-1.15, 3-5min). First data point suggests the slice didn't degrade output quality or meaningfully change cost in Claude Code subagent mode (as expected — web search is free here). Production cost delta (where web search is $0.01/call) will require reading `toolUses` from `observatory/runs/20260417-071237-TSCO-onePager/agents/one-pager.json`.

**MC-7: Pitch deck 10/11 schema drift — fix contract, add drift detection** — The persistent "10/11 sections" pattern across all 3 Sprint 3 pitch decks was a schema drift between three artifacts (all 3 Sprint 3 orchestrators independently converged on this diagnosis in verbatim debriefs):
- Pitch-deck SKILL.md Step 12 template said `sections: [/* 10 objects */]` with synthesis flattened into top-level `overallVerdict`/`verdictRationale`/`synthesisNarrative` fields
- Synthesis-writer agent self-declares `sectionNumber: 11, key: "overall_verdict"`
- observatory-finalize.js line 115 hardcoded `sectionsExpected: 11` for pitchDeck stage
- PDF generators at [scripts/pdf/*.py](../scripts/pdf/) already call `data.get_section('overall_verdict')` — they expect it in sections[] not top-level

The skill template was the root lie: it said 10, everything else said 11. Orchestrators in "follow the recipe" mode produced 10, the validator reported "10/11", and no run ever investigated because the count was printed as ambient info, not a blocker. 3 silent replications across Sprint 3.

**Two-part fix:**
- [generate-pitch-deck/SKILL.md Step 12](../.claude/skills/generate-pitch-deck/SKILL.md) — template rewritten to say `11 ReportSectionSchema objects` with the full section list enumerated S1-S11, and a CRITICAL warning explaining the Sprint 3 bug. The top-level `overallVerdict`/`verdictRationale`/`synthesisNarrative` fields are preserved as explicit MIRRORS of section 11 (consumers that skim top-level still work), but the `sections[]` array is now the source of truth.
- [generate-pitch-deck/SKILL.md Step 14.4](../.claude/skills/generate-pitch-deck/SKILL.md) — new "Section Count Contract Check" step before finalize. Runs a one-liner that asserts `sections.length === 11 && max(sectionNumber) === 11 && some(key === 'overall_verdict')`; exits non-zero and instructs the orchestrator to go back and fix Step 12 if any condition fails.
- [scripts/observatory-finalize.js:130-150](../scripts/observatory-finalize.js#L130-L150) — section count drift now auto-logs a format-violation event (`agent: "orchestrator", violation: "section count drift: produced X, expected Y"`) when `sections.length !== sectionsExpected`. Makes future drift loud via the same stream as all other format violations, instead of burying it in manifest.pipelineMetrics.

Regression signal: Sprint 4 pitch decks should report `11/11 sections` in log.md. If any Sprint 4 pitch deck reports `10/11` or `12/11`, the contract check at Step 14.4 should have already blocked it — so an "N/11 where N≠11" run means either the check was skipped OR a new drift mode emerged.

**MC-8: Per-agent usage data — token/cost/web-search capture** — TSCO smoke-test post-mortem surfaced that every agent record's `usage` block was storing zero for inputTokens, outputTokens, cost, AND webSearches despite the subagent producing a valid `<usage>` block. Root cause (TSCO agent debrief, verbatim): "I passed exactly what the skill's Step 5 code block shows. Nothing more. That's my reasoning — I followed the literal template, didn't question it, and assumed the per-agent observability gap was intentional because manifest.json already holds aggregate cost." The skill's record-agent template omitted `--tokens`, `--cost`, `--web-searches`, so the script's flag parsers never fired.

**Two-part fix:**
- [scripts/observatory-record-agent.js](../scripts/observatory-record-agent.js) — added `--web-searches N` flag, added auto-compute of `--cost` from tokens + web_searches (Sonnet: $3/M input + $15/M output + $0.01/search; Opus: $15/M + $75/M; 60/40 split when only total tokens given). Populates `usage.webSearches` with the flag value.
- Every record-agent invocation across all 3 skills now passes `--tokens {AGENT_TOTAL_TOKENS} --web-searches {AGENT_WEB_SEARCHES}`. One-pager: 1 call. Pitch-deck: 7 calls (Waves 1-4). Full-story: 10 calls (Phase 1 + 5 debate steps). Each skill has a shared "Per-Agent Usage Parsing" reference explaining how to extract values from each subagent's `<usage>` block, including how to estimate web_search count by role when only `tool_uses` total is visible.

Regression signal: Sprint 4 per-agent records should have non-zero `usage.cost` and `usage.webSearches`. `usage.cost == 0` for any non-zero-token agent means the orchestrator omitted `--tokens`. Cross-check via `cat observatory/runs/{RUN_ID}/agents/*.json | jq '.usage'`. This is specifically the instrument EXP-005 needs — without web_search count, the one-pager slicing impact on production cost cannot be measured.

## [2026-04-17] sprint-4-prep | EXP-003 — symmetric debate framework

Sprint 3 showed full-story verdicts exactly mirrored pitch deck verdicts for all 3 tickers (LULU/POOL/SFM) with no upgrades and no downgrades. Business quality sections recognized the quality (POOL: 4 PASS, SFM: 5 PASS of 10), but valuation + PEST always vetoed the overall verdict. Pattern [[patterns/bear-bull-asymmetry]] identified the debate framework as the remaining high-leverage lever. Audit found 6 structural asymmetries across 5 agent prompts + 3 skills + 1 coordinator. EXP-003 treats all 6 simultaneously — full rationale and per-lever breakdown in [[experiments/doe-log]] EXP-003 and [[prompt-versions/changelog]].

**Six treated asymmetries:**
1. **Web search asymmetry (A)** — Bear had web search in every role (PEST pitch deck + Phase 1 event analysis + Phase 2 Bear debate); Bull and Rebuttal had none. Fix: Bull and Rebuttal now have web search with directed search menus (Bull: positive catalysts, insider buying, guru activity, analyst upgrades, third-party validation; Rebuttal: verify bear citations, find already-priced-in context, surface counter-evidence, check materiality).
2. **Mandate asymmetry (C)** — "demolish or fail trying" × 3, "make reader genuinely uncomfortable," "lead with what keeps you up at night" all softened to "pressure-test with evidence," "surface material concerns clearly and specifically," "lead with the most material, evidence-backed risk." Keeps the rigor, removes the performance mandate.
3. **Volume asymmetry** — unchanged structurally (bear still addresses every point with evidence); web search symmetry evens the evidence base.
4. **Judge rubric asymmetry (B)** — the actual scoring bug. Strong Bull required bear to be weak; Strong Bear only required bull unable to rebut. Overall Bear verdict triggered by "any thesis_killer item is Strong Bear" while Bull required majority AND zero thesis_killers. Fix: made Strong Bull/Strong Bear definitions symmetric (both require specific evidence + opposing side's weakness); overall Bear now requires ≥2 thesis-killer items that are BOTH newly-discovered AND unrebutted (was: any single thesis_killer sufficient).
5. **Materiality filter (D)** — new. Judge now classifies each bear point on two axes before scoring: severity (thesis-killing / material but manageable / speculative or already priced in) × novelty (newly-discovered / already-priced-in / known-and-managed). Only (thesis-killing OR material) AND (newly-discovered OR not-yet-priced-in) bear points carry significant verdict weight. Addresses the "every company has legitimate bear cases but most aren't disqualifying" problem.
6. **Rebuttal framing asymmetry (E)** — Rebuttal previously mandated honest acknowledgment when bear was strong. Fix: symmetric mandate — must also honestly flag when bear attack is weak, speculative, already priced in, or immaterial. "Performative fairness" out; accurate characterization in both directions in.
7. **Residual conservatism (F)** — Sprint 3 EXP-002 leftovers. Three instances of "Always prefer conservative growth estimates/assumptions" in risk-analyst prompts softened to "Lean toward conservative ... when evidence is genuinely mixed — conservatism is a tiebreaker, not a ceiling" (per user direction to keep risk-analyst's natural bearish disposition without the blanket override).

**Files changed:** 9 total.
- Prompts (5): [risk-analyst-fullstory/prompt.md](../agents-v2/risk-analyst-fullstory/prompt.md) (6 edits), [risk-analyst-pitchdeck/prompt.md](../agents-v2/risk-analyst-pitchdeck/prompt.md) (4 edits), [synthesis-writer-fullstory/prompt.md](../agents-v2/synthesis-writer-fullstory/prompt.md) (4 edits), [financial-analyst-fullstory/prompt.md](../agents-v2/financial-analyst-fullstory/prompt.md) (2 edits — rubric + materiality filter), [coordinator-fullstory/prompt.md](../agents-v2/coordinator-fullstory/prompt.md) (2 edits — D-07 web search rule updated for production parity)
- Skills (2): [generate-full-story/SKILL.md](../.claude/skills/generate-full-story/SKILL.md) (Web Search Rule updated + per-role instructions + web_searches estimation heuristics), [generate-pitch-deck/SKILL.md](../.claude/skills/generate-pitch-deck/SKILL.md) (PEST dispatch instruction cleaned)
- Architecture (1): [agents-v2/ORCHESTRATION.md](../agents-v2/ORCHESTRATION.md) — D-07 architecture doc updated
- Observatory: [doe-log.md](experiments/doe-log.md) EXP-003 with full control/treatment matrix, [changelog.md](prompt-versions/changelog.md) detailed entry, [bear-bull-asymmetry.md](patterns/bear-bull-asymmetry.md) status ACTIVE

**Known open item:** managed-agent.yaml files (production config for Managed Agents) still contain old prompt text. User confirmed managed-agents-to-claude-code-skill parity sync is deferred to end of sprints — tracked for post-sprint work.

**Sprint 4 expected results:**
- Full-story verdict distribution shifts — expecting at least 1 PASS across POOL/SFM/LULU where pitch deck already produced 4-5 PASS sections
- Judge `exchangeScores.direction` histogram — expecting more Strong Bull entries relative to Sprint 3's 0
- FGR ranges and calculated buy prices — expecting modest continued rise vs Sprint 3 as the bear→synthesis cascade is less pessimistic
- Combined with MC-7 price-conditional matching (not yet wired — future work), verdict accuracy vs known-verdicts should finally register non-zero
- Cost impact: Bull + Rebuttal web search adds ~$0.02-0.08/run in production (2-4 searches × $0.01 × 2 roles), minimal in Claude Code subagent mode where web search is free

**Regression signals:**
- If Sprint 4 full-story verdicts still exactly mirror pitch deck verdicts 3/3, EXP-003 didn't move the needle — parked EXP-G (weight debate by section verdicts) becomes next lever
- If Bull starts surfacing pump-coverage noise (Seeking Alpha hype, low-quality sources), tighten Bull's search prompts in Sprint 5
- If Judge materiality classifications are consistently "newly-discovered" (bear always wins the novelty axis), the filter isn't constraining — need to sharpen the "already priced in" criteria
- Any `"optimism is the enemy"` appearance in Sprint 4 agent output means prompt caching or stale agent dispatch — verify skill file on disk vs what subagent received

**Deferred to Sprint 5+:** EXP-004 (wonderful-company premium — flat 50% MOS → quality-weighted), EXP-G (structural: weight debate outcome by pitch deck section verdicts). Both parked, tracked in patterns/ and doe-log.

## [2026-04-17] run | LULU onePager | 20260417-081604-LULU-onePager
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $0.70 | Duration: 5min | Sections: 6/6
- Failures: none

## [2026-04-17] wiki-update | 3 pages updated
- Updated: [[tickers/LULU]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-18] run | LULU pitchDeck | 20260417-082354-LULU-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $9.75 | Duration: 570min | Sections: 11/11
- Failures: 10

## [2026-04-18] wiki-update | 15 pages updated
- Updated: [[tickers/LULU]], [[agents/annual-reader]], [[agents/quarterly-reader]], [[agents/business-analyst]], [[agents/competitor-market-position]], [[agents/competitor-moats]], [[agents/financial-analyst]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]], [[failure-modes/format-violations]], [[failure-modes/retries]], [[failure-modes/stalls]], [[patterns/verdict-accuracy]]

## [2026-04-18] run | SFM onePager | 20260417-174638-SFM-onePager
- Verdict: PASS (expected: BUY) — MISMATCH
- Cost: $0.74 | Duration: 6min | Sections: 6/6
- Failures: 2

## [2026-04-18] wiki-update | 4 pages updated
- Updated: [[tickers/SFM]], [[agents/one-pager]], [[failure-modes/format-violations]], [[patterns/verdict-accuracy]]

## [2026-04-18] run | LULU fullStory | 20260417-175335-LULU-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $7.57 | Duration: 30min | Sections: 6/6
- Failures: none

## [2026-04-18] wiki-update | 12 pages updated
- Updated: [[tickers/LULU]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst-judge]], [[agents/risk-analyst-bear]], [[agents/synthesis-writer-bull]], [[agents/synthesis-writer-compose]], [[agents/synthesis-writer-rebuttal]], [[patterns/verdict-accuracy]]

## [2026-04-18] run | POOL onePager | 20260417-182604-POOL-onePager
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $0.74 | Duration: 3min | Sections: 6/6
- Failures: none

## [2026-04-18] wiki-update | 3 pages updated
- Updated: [[tickers/POOL]], [[agents/one-pager]], [[patterns/verdict-accuracy]]

## [2026-04-18] run | SFM pitchDeck | 20260417-175437-SFM-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $12.07 | Duration: 44min | Sections: 11/11
- Failures: 13

## [2026-04-18] wiki-update | 13 pages updated
- Updated: [[tickers/SFM]], [[agents/annual-reader]], [[agents/quarterly-reader]], [[agents/business-analyst]], [[agents/competitor-market-position]], [[agents/competitor-moats]], [[agents/financial-analyst]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]], [[failure-modes/format-violations]], [[patterns/verdict-accuracy]]

## [2026-04-18] run | POOL pitchDeck | 20260417-183135-POOL-pitchDeck
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $13.23 | Duration: 44min | Sections: 11/11
- Failures: 1

## [2026-04-18] wiki-update | 17 pages updated
- Updated: [[tickers/POOL]], [[agents/annual-reader-FY2021]], [[agents/annual-reader-FY2022]], [[agents/annual-reader-FY2023]], [[agents/annual-reader-FY2024]], [[agents/annual-reader-FY2025]], [[agents/quarterly-reader]], [[agents/business-analyst]], [[agents/competitor-market-position]], [[agents/competitor-moats]], [[agents/financial-analyst]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/synthesis-writer]], [[failure-modes/format-violations]], [[patterns/verdict-accuracy]]

## [2026-04-18] run | SFM fullStory | 20260417-185013-SFM-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $7.98 | Duration: 31min | Sections: 6/6
- Failures: none

## [2026-04-18] wiki-update | 9 pages updated
- Updated: [[tickers/SFM]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst]], [[agents/synthesis-writer]], [[patterns/verdict-accuracy]]

## [2026-04-18] run | POOL fullStory | 20260417-192126-POOL-fullStory
- Verdict: WATCHLIST (expected: BUY) — MISMATCH
- Cost: $9.39 | Duration: 29min | Sections: 6/6
- Failures: 1

## [2026-04-18] wiki-update | 13 pages updated
- Updated: [[tickers/POOL]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst-judge]], [[agents/risk-analyst-bear]], [[agents/synthesis-writer-bull]], [[agents/synthesis-writer-compose]], [[agents/synthesis-writer-rebuttal]], [[failure-modes/format-violations]], [[patterns/verdict-accuracy]]

## [2026-04-18] wiki-update | 13 pages updated
- Updated: [[tickers/LULU]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst-judge]], [[agents/risk-analyst-bear]], [[agents/synthesis-writer-bull]], [[agents/synthesis-writer-compose]], [[agents/synthesis-writer-rebuttal]], [[failure-modes/format-violations]], [[patterns/verdict-accuracy]]

## [2026-04-18] wiki-update | 13 pages updated
- Updated: [[tickers/POOL]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst-judge]], [[agents/risk-analyst-bear]], [[agents/synthesis-writer-bull]], [[agents/synthesis-writer-compose]], [[agents/synthesis-writer-rebuttal]], [[failure-modes/format-violations]], [[patterns/verdict-accuracy]]

## [2026-04-18] wiki-update | 10 pages updated
- Updated: [[tickers/SFM]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst]], [[agents/synthesis-writer]], [[failure-modes/format-violations]], [[failure-modes/data-gaps]]

## [2026-04-18] wiki-update | 11 pages updated
- Updated: [[tickers/SFM]], [[agents/business-analyst]], [[agents/competitor-evaluator]], [[agents/management-evaluator]], [[agents/risk-analyst]], [[agents/valuation-specialist]], [[agents/financial-analyst]], [[agents/synthesis-writer]], [[failure-modes/format-violations]], [[failure-modes/data-gaps]], [[patterns/verdict-accuracy]]
