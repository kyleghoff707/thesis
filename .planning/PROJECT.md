# Thes1s Normalization Engine

## What This Is

A production-grade financial data normalization engine that extracts, normalizes, and validates SEC EDGAR XBRL data to match Morningstar's institutional-grade accuracy — without paying for Morningstar's data. Covers all ~5,758 US-listed equities. This is the data foundation that the AI agent team builds investment theses from — if the financial data is wrong, the analysis is wrong.

## Core Value

98%+ accuracy match to Morningstar across all US-listed equities, achieved by triangulating our XBRL output against FMP, SimFin, and mstarpy — then fixing the normalization rules so we never need paid sources again.

## Requirements

### Validated

- ✓ Three-layer XBRL engine (static tags → taxonomy hierarchy → AI classification) — existing
- ✓ Industry overlays for bank/REIT/insurance — existing
- ✓ ~40 derived fields with provenance tracking — existing
- ✓ 50-company Morningstar truth set (annual, restated) — existing
- ✓ ~91% accuracy on truth set (annual financials) — existing (attempt #2)
- ✓ 96.1% XBRL tag coverage on S&P 500 scoring-critical fields — existing (attempt #1)
- ✓ API connections to FMP, SimFin, mstarpy, EODHD all working — existing
- ✓ 5,758 US-listed companies classified in Thes1s taxonomy — existing

### Active

- [ ] Production-grade comparison harness with proper fiscal year alignment, field mapping, and sign conventions
- [ ] Multi-source triangulation engine (FMP + SimFin + mstarpy + our engine vs Morningstar truth)
- [ ] 98%+ accuracy on the 50-company Morningstar truth set
- [ ] 98%+ accuracy on S&P 500 companies
- [ ] 98%+ accuracy across all US-listed equities
- [ ] Improved XBRL normalization rules derived from triangulation findings
- [ ] Executive compensation normalization (FMP has good data — secondary priority)
- [ ] Automated validation pipeline for ongoing accuracy monitoring (new earnings, spinoffs, IPOs, accounting changes)

### Out of Scope

- OTC stocks — non-standard filings, low value
- International equities — different filing standards (IFRS vs US-GAAP)
- UI changes — no component/hook work, that's the AI agent buildout in the other workspace
- Real-time data — this is about historical financial statement accuracy
- Quarterly financials — focus on annual first (quarterly is a separate milestone)

## Context

### This Is Attempt #3

Two previous attempts at normalization optimization:

1. **Attempt #1 — XBRL tag coverage** (March 2026): Built three-layer engine, mapped thousands of tags, achieved "96% on scoring-critical fields for S&P 500." But when compared against actual Morningstar numbers, the values were still off. **Lesson: high XBRL tag coverage ≠ accurate normalized numbers.** Using XBRL tags as the optimization target was wrong.

2. **Attempt #2 — Morningstar truth set** (March 2026): Downloaded actual MS data for 50 companies, compared directly. Got to ~91% accuracy. Better, but fragile — likely breaks for companies outside the truth set. **Lesson: need multi-source triangulation, not just one-to-one comparison.**

3. **Attempt #3 — This project**: Triangulate across FMP + SimFin + mstarpy to reverse-engineer Morningstar's normalization methodology. When 3 sources agree and we don't, that's a normalization bug. When sources disagree, investigate why.

Previous plans preserved at:
- `gstack/plans/gstack-xbrl-annual-normalization-eng-plan-20260319.md`
- `gstack/plans/gstack-xbrl-engine-strategy-eng-plan-20260318.md`
- `gstack/plans/gstack-xbrl-morningstar-engine-ceo-plan-20260318.md`
- `gstack/plans/gstack-xbrl-quarterly-validation-eng-plan-20260320.md`

### Data Sources

| Source | Cost | Rate Limit | History | Strengths |
|--------|------|------------|---------|-----------|
| **FMP** | $20/mo | 250/day | 5 years | Normalizes same EDGAR XBRL — direct comparison reveals normalization diffs |
| **SimFin** | $15/mo | 2,000/day | 10 years | Every value traced to source filing, separate bank/insurance templates |
| **mstarpy** | Free | N/A | 10+ years | Actual Morningstar data from morningstar.com (fragile scraper) |
| **EODHD** | Paid (existing) | 100,000/day | Varies | Fundamentals data, already have subscription |
| **SEC EDGAR** | Free | 10 req/sec | All history | Raw XBRL source — what our engine normalizes |

### Existing Test Infrastructure

`validation/scripts/test-api-sources.mjs` connects to all APIs and compares against the truth set. APIs work, data comes back, but comparison logic has bugs:
- Fiscal year alignment is naive (breaks for non-calendar FY: LULU, COST, NKE)
- SimFin field name mapping incomplete for cash flow
- Sign convention differences not handled
- Reported accuracy scores are test harness bugs, not data quality issues

### The Bigger Picture

Two competitive moats for Thes1s:
1. **This project** — Internal SEC data normalization engines producing institutional-grade financial data without paid external sources. Nobody has this.
2. **AI agent team** (parallel workspace) — Professional investment theses in minutes using Rule One methodology. Both moats reinforce each other.

## Constraints

- **No UI work**: Only touch `validation/`, `src/engines/`, `src/data/`. Components, hooks, and agents are off-limits (parallel AI agent buildout).
- **API rate limits**: FMP 250/day, SimFin 2,000/day. Must design comparison pipeline to work within limits.
- **Fragile mstarpy**: Scraper could break anytime. Use it while it works, don't depend on it long-term.
- **Cost ceiling**: FMP ($20/mo) + SimFin ($15/mo) are temporary. Goal is to eliminate both once normalization rules are solid.
- **User is not a programmer**: Explain findings, strategies, and decisions in plain English.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Triangulate against 3 sources (not just MS truth set) | Single-source comparison can't distinguish MS quirks from our bugs. Consensus of 3 sources is more reliable | — Pending |
| Three-phase accuracy rollout (truth set → S&P 500 → full market) | Each phase validates before expanding scope. Prevents boiling the ocean | — Pending |
| Fix test harness before triangulation | Can't improve what you can't measure. Current harness reports wrong scores | — Pending |
| Exec comp is secondary priority | FMP has good data, but financial statement accuracy is the foundation | — Pending |
| Fixes go to existing engine or new layer — case by case | Some bugs are taxonomy fixes (edgarFinancials.js), some may need post-processing | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-25 after initialization*
