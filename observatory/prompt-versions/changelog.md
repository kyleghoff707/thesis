---
type: prompt-changelog
lastUpdated: 2026-04-16T14:30:00Z
tags: [prompts, changelog]
---

# Prompt Version Changelog

> Reverse chronological record of all agent prompt changes with measured impact.

---

## 2026-04-16 — All agents: model assignment change (EXP-001)

- **Change**: Switched all agents from mixed opus/sonnet to all-sonnet
- **Agents affected**: quarterly-reader (PD), risk-analyst (PD+FS), valuation-specialist (PD)
- **Motivation**: Sprint 1 produced 8/9 WATCHLIST verdicts. Hypothesis: opus on risk-analyst ("demolish the bull case") and valuation-specialist produces systematically conservative FGRs and buy prices. See [[experiments/doe-log]] EXP-001.
- **Before runs**: Sprint 1 — 20260415-* (LULU, POOL, UBER — 9 runs, mixed opus/sonnet)
- **After runs**: Sprint 2 — pending
- **Impact**: _Pending — awaiting Sprint 2 runs_

## 2026-04-16 — All skills: parallel dispatch fix

- **Change**: Renamed pitch deck Wave 1-3 headers from "Dispatch Agents Sequentially" to "PARALLEL DISPATCH" with CRITICAL callout blocks. Strengthened full story Phase 1 parallel instructions.
- **Motivation**: All 3 pitch deck runs took 55-60min instead of expected 20-25min. Root cause: Claude followed the "Sequentially" header at dispatch time.
- **Before runs**: Sprint 1 — 20260415-204131-LULU-pitchDeck (58min), 20260415-204842-POOL-pitchDeck (60min)
- **After runs**: Sprint 2 — pending
- **Impact**: _Pending — expect 2-3x wall time reduction_

## 2026-04-16 — All skills: observatory recording added

- **Change**: Added per-agent recording (observatory-record-agent.js), orchestrator event recording (observatory-record-event.js), and wiki synthesis step after finalize in all 3 skills.
- **Motivation**: Sprint 1 had zero agent-level data — agents/ directories empty, orchestrator.json empty. No per-agent observability.
- **Impact**: Non-blocking addition. Should not affect verdicts or quality.
