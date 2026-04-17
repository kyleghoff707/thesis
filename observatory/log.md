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
