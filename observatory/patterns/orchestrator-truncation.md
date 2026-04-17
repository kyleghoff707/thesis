---
type: pattern
pattern: orchestrator-truncation
lastUpdated: 2026-04-17T02:00:00Z
confidence: high
runsSampled: 15
tags: [pattern, truncation, data-loss, full-story, mechanical]
---

## Observation

Orchestrator context pressure causes systematic data loss during output saving. This is **not a one-off** — it occurred in 4 of 5 full story runs in Sprint 2 and 1 of 3 in Sprint 1. NKE is the only ticker across both sprints with a fully complete pipeline output (237K full story, all debate steps intact).

**Sprint 2 severity by ticker:**

| Ticker | Full Story Size | Debate Steps | Severity |
|--------|----------------|-------------|----------|
| NKE | 237K (2,687 lines) | 4/4 complete (99-126 lines each) | None |
| SFM | 16K (291 lines) | 4/4 exist but **1-line summaries** | Moderate |
| POOL | 4.6K (97 lines) | 4/4 exist but **1-line summaries** | Moderate |
| UBER | 3.3K (71 lines) | **0/4 — sections/ empty** | Critical |
| LULU | 2K (68 lines) | **0/4 — missing entirely** | Critical |

**Sprint 1:** UBER had same pattern (3.7K pitch deck, 1.2K full story, 0 debate steps). LULU and POOL were unaffected in Sprint 1.

## Evidence

- UBER: 2 sprints, 2 critical truncations. sections/ directory empty both times. Orchestrator never saved individual section files.
- LULU: New in Sprint 2. 68-line full story with "N/A" placeholder verdicts. Healthy 247K pitch deck, so data assembly is fine — truncation happens at full story orchestration.
- POOL/SFM: Debate step files exist but contain single-line JSON summaries instead of full thesis/evidence/confidence objects. Orchestrator compressed output to manage context.
- NKE: Fully complete. Produced last (longest wall time). May have benefited from being run by a different Claude instance or having more favorable context conditions.

## Hypothesis

The orchestrator (Claude Code instance running the /generate-full-story skill) faces context pressure after accumulating 5 Phase 1 agent outputs (10-50KB each) plus the pitch deck inheritance data. By the time Phase 2 (debate) runs, the orchestrator is deep in its context window and takes shortcuts when saving:

1. **Critical truncation** (UBER, LULU): Orchestrator writes stub/placeholder JSON instead of actual agent output
2. **Moderate truncation** (POOL, SFM): Orchestrator writes 1-line summary per debate step instead of full content
3. **No truncation** (NKE): Orchestrator maintains fidelity — possibly due to instance-level variance or more efficient context usage

This correlates with the observation that parallel dispatch isn't working — sequential dispatch means more context accumulation before the save steps.

## Recommended Action

- **Short-term:** Have subagents write their own output to disk (self-save pattern) rather than returning it to the orchestrator for saving. The subagent has full context of what it generated.
- **Short-term:** Add file-size verification after each save — if a full-story section is under 5KB, flag as likely truncated
- **Long-term:** Fix parallel dispatch so context accumulation is reduced (parallel agents don't add to sequential context pressure)
- **Tracking:** Monitor NKE as the benchmark — its output profile (237K full story, complete debate steps) is the target for all tickers
