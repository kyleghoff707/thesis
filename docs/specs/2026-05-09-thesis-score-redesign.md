# Thesis Score v2 — Methodology Redesign

**Status:** Design locked, awaiting implementation plan
**Date:** 2026-05-09
**Brainstorm pod:** #1 of 4 (per [STEPS.md](../../STEPS.md) Phase 2B)
**Author:** Kyle Hoff
**Engine file:** [src/engines/thesisScore.js](../../src/engines/thesisScore.js)

---

## Problem

The current Thesis Score (`src/engines/thesisScore.js`) is a 1:1 copy of Phil Town's Rule 1 Score from the [Rule One Toolbox](https://ruleonetoolbox.com/dashboard). The Phase 2 mass rename swapped the *name* but the *algorithm* is unchanged: same Moat/Management two-pillar decomposition, same Big-5 growth metrics, same 10/7/5/3-year period averaging, same 10%/5% thresholds, same color bands. Renaming a copy is more derivative, not less.

For Thesis to ship as a public open-source product on its own merits — without standing on Rule 1 IP — the scoring rubric needs to be **algorithmically and conceptually distinct** while remaining anchored in Buffett-style value investing.

This spec defines the v2 redesign.

---

## Non-goals

- Replace the One Pager screening UX. The score remains a single 0–100 number with green/yellow/red bands; the One Pager flow doesn't change.
- Introduce qualitative agent inputs. The score stays quantitative-only (qualitative analysis lives in agent prose, not the score).
- Bring valuation into the score. Valuation/margin-of-safety stays a separate Toolbox concern, as today.
- Change the schema field name. `thesisScore` (camelCase) stays the agent contract — only the computation changes.

---

## Design

### Score role (unchanged)

A single 0–100 composite, displayed as a green/yellow/red badge, used as the **screening gate** on the One Pager. Same role Rule 1 Score plays today — the differentiation is in what flows into it.

**Color bands (unchanged from current `badgeColor()`):**
- ≥70 → green
- 40–69 → yellow
- <40 → red

### Pillar structure (new — 4 pillars, equal-weighted)

| # | Pillar | Weight |
|---|---|---|
| 1 | Compounding | 25% |
| 2 | Capital Efficiency | 25% |
| 3 | Capital Allocation | 25% |
| 4 | Resilience | 25% |

**Final score** = unweighted average of the 4 pillar scores.

This replaces R1's flat Moat (50%) + Management (50%) split. The 4-pillar shape mirrors Buffett's emphasis areas — owner economics, capital productivity, capital stewardship, and balance-sheet durability — without adopting his (or Phil Town's) framework labels verbatim.

### Metric stack (12 metrics, 3 per pillar)

#### Pillar 1 — Compounding

What the business has compounded for owners over time.

| Metric | Source | Notes |
|---|---|---|
| BV + Dividends growth | `growthRates.bvps` (extended to add dividends per share) | Buffettology's preferred "owner's growth" — captures BV reinvestment AND cash returned to shareholders. |
| Operating Cash Flow growth | `growthRates.operatingCash` | Harder to manipulate than NI. The "Big 4" anchor metric per [knowledge/research-references/fgr.md](../../../stock-analyzer/knowledge/research-references/fgr.md). |
| Free Cash Flow growth | `growthRates.fcf` | The deployable cash. Connects to valuation pillar (FCF is the foundation per Buffett). |

**Dropped from R1's Big 5:**
- **EPS growth** — distorted by buybacks. A company with flat NI but 5% buybacks will show fake EPS growth. Capital Allocation pillar handles buybacks directly.
- **Revenue growth** — not a compounding metric (it's a pricing-power / market-position signal). Including it as compounding double-counts what OpCF/FCF growth already capture downstream.

#### Pillar 2 — Capital Efficiency

How productive the business is with each dollar of invested capital.

| Metric | Source | Notes |
|---|---|---|
| ROIC | `returnAverages.roic` | Level matters most. Buffett's primary lens for "great business." |
| FCF / Net Income (cash quality / accruals) | derived from `freeCashFlow` and `netIncome` | **NEW vs R1.** Ratio ≥1 means earnings are backed by cash; <0.7 is an accruals red flag. Catches companies whose reported earnings outpace their actual cash generation. |
| Gross margin trend | derived from income-statement series (5yr slope) | **NEW vs R1.** Rising/stable = pricing power; falling = competitive pressure or input-cost squeeze. |

**Dropped from R1's Management:**
- **ROA** — noise. Mostly redundant with ROIC for capital-light businesses, and misleading for capital-heavy ones.
- **ROE** — rewards leverage. A company that buys back stock with debt can juice ROE without improving the business. ROIC + the Resilience pillar's debt metrics handle this more honestly.

#### Pillar 3 — Capital Allocation (entirely new vs R1)

Whether management is creating value with the cash the business throws off.

| Metric | Source | Notes |
|---|---|---|
| Shares outstanding 5-year trend | derived from `sharesOutstanding` series | Declining shares (buybacks) = good. Dilution = bad. R1 has nothing here. |
| Dividend track record | derived from `dividendsPaid` series + FCF | Consistent payout, growing, FCF-covered → 100. Cut or uncovered → 0. **Non-dividend-payers get a neutral 70** (don't penalize companies that reinvest instead — that's a legitimate strategy). |
| Reinvestment effectiveness | derived (see formula below) | Does retained cash actually compound book value? Cleanest available proxy for "ROIC of incremental capital" without fragile per-year math. |

**Reinvestment effectiveness formula:**

```
Over the 5-year window:
  retainedPerShare = sum of (NI per share − dividend per share) for the 5 years
  bvPlusDivGrowthPerShare = (BV per share at end + cumulative div per share) − BV per share at start
  reinvestmentEffectiveness = bvPlusDivGrowthPerShare / retainedPerShare
```

Interpretation: a value of 1.0 means each $1 retained added $1 to (BV + cumulative dividends). >1.0 means retained capital compounded above book (margin expansion or revaluation effects); <1.0 means capital was destroyed relative to retention.

This pillar is the largest single point of differentiation from R1, which has no capital-allocation signal at all.

#### Pillar 4 — Resilience

Can the business survive a downturn without permanent impairment of capital? "Don't lose money" embedded in the score.

| Metric | Source | Notes |
|---|---|---|
| Net Debt / FCF (years to pay off) | `debtMetrics.netDebtToFCF` | **Threshold tightened from R1's 3 years to 2 years** for full credit. ≤0 (net cash) → 100; 0–2 yrs → 75; 2–4 yrs → 35; >4 yrs → 0. |
| Interest coverage (EBIT ÷ interest expense) | derived from income statement | **NEW vs R1.** ≥10× → 100; 5–10× → 50; <5× → 0. Captures fragility under earnings stress. |
| Current ratio (Current Assets ÷ Current Liabilities) | derived from balance sheet | **NEW vs R1.** Buffett benchmark per [knowledge/research-references/advanced-financial-analysis.md](../../../stock-analyzer/knowledge/research-references/advanced-financial-analysis.md) — "2:1 conservative, 1:1 acceptable." ≥1.5 → 100; 1.0–1.5 → 50; <1.0 → 0. |

**Dropped from R1's Management:**
- **Net Debt / Earnings** — kept Net Debt / FCF instead. NI-based debt ratios are gameable; FCF-based aren't. Having both is redundant.

### Per-metric scoring formula

For each of the 12 metrics:

```
metricScore = 0.7 × Level + 0.3 × Consistency
```

#### Level component (0–100)

`Level` = average of:
- **10-year score**: metric over the 10-year period scored against Level thresholds (below)
- **5-year score**: same metric over the 5-year period scored against Level thresholds

Two periods (long-term + recent) replace R1's four-period (10/7/5/3) averaging. Captures both "good for a long time" and "still good now."

**Level threshold table (Buffett-flavored, distinct from R1's 10%/5%):**

| Pillar / Metric | 100 (full credit) | 50 (partial) | 0 (fail) |
|---|---|---|---|
| BV+Div growth | ≥12% | 8–12% | <8% |
| OpCF growth | ≥12% | 8–12% | <8% |
| FCF growth | ≥10% | 6–10% | <6% |
| ROIC | ≥15% | 10–15% | <10% |
| FCF / NI | ≥1.0 | 0.7–1.0 | <0.7 |
| Gross margin trend | rising | stable (±0.5pp/yr) | declining |
| Shares outstanding 5yr | declining | flat (±2%) | rising |
| Dividend track record | covered + growing | covered + flat / non-payer (neutral 70) | cut or uncovered |
| Reinvestment effectiveness | ≥1.0 | 0.7–1.0 | <0.7 |
| Net Debt / FCF | ≤0 (net cash) | 0–2 yrs (75) / 2–4 yrs (35) | >4 yrs |
| Interest coverage | ≥10× | 5–10× | <5× |
| Current ratio | ≥1.5 | 1.0–1.5 | <1.0 |

These thresholds are the defaults locked by this spec. Tuning happens in the implementation phase against the validation set (LULU, AAPL, COST, plus any agent-flagged outliers).

#### Consistency component (0–100)

For metrics where consistency is meaningful (the 9 non-Resilience metrics — debt and coverage ratios are point-in-time, not series), compute the **coefficient of variation (CV)** of the year-over-year values over the 10-year history:

```
CV = stdev(yoy values) / |mean(yoy values)|
Consistency = clamp(100 × (1 - CV / 0.6), 0, 100)
```

| CV | Consistency |
|---|---|
| 0.0 (perfectly steady) | 100 |
| 0.3 (moderate volatility) | 50 |
| 0.6+ (high volatility) | 0 |

This is the formal mechanism that lets the score reward predictability — a company growing 12/13/12/14% scores better than one growing −10/+50/−20/+40% with the same average. R1's score has nothing equivalent.

For Resilience metrics: `Consistency` = 100 (treat as a constant; the metric is point-in-time). Effectively `metricScore = Level` for those three.

### Pillar score formula

```
pillarScore = average of metricScores (excluding nulls)
```

If all 3 metrics in a pillar are null, the pillar is null and contributes nothing to the final.

### Final score formula

```
thesisScore = average of (Compounding, Capital Efficiency, Capital Allocation, Resilience)
            (excluding nulls)
```

If 2+ pillars are null, return `null` (insufficient data to score).

### Edge cases

| Situation | Behavior | Rationale |
|---|---|---|
| <5 years public history | Return `null` | Don't score immature companies. Today's engine returns a noisy partial score in this case. |
| Non-dividend-payer | 70 (neutral) on Dividend track record | Reinvestment is a legitimate strategy; don't penalize. |
| Missing metric (data gap) | Excluded from pillar average (not zeroed) | Today's engine has the right behavior here; preserve it. |
| Negative FCF in some years | Use absolute value for FCF growth scoring; flag in Capital Efficiency if median FCF is negative | A company with structurally negative FCF should fail Compounding regardless of growth rate. |
| Net cash position | Net Debt / FCF → 100 (full credit), even if FCF is small | Net cash is the strongest possible balance sheet signal. |

---

## What's distinctly NOT Rule 1

Side-by-side comparison of fingerprints:

| Dimension | Rule 1 Score | Thesis Score v2 |
|---|---|---|
| Pillar count | 2 (Moat / Management) | 4 (Compounding / Capital Efficiency / Capital Allocation / Resilience) |
| Pillar names | "Moat" + "Management" (Phil Town's 5 Ms framework) | None of those terms |
| Compounding metrics | BVPS, EPS, Revenue, OpCF, FCF growth (5) | BV+Div, OpCF, FCF growth (3) — drops EPS, Revenue |
| Capital metrics | ROE, ROIC, ROA | ROIC + cash quality (FCF/NI) + margin trend |
| Buyback / dividend signal | None | First-class pillar (Capital Allocation) |
| Cash quality (accruals) | Ignored | First-class metric (FCF/NI) |
| Interest coverage | Ignored | First-class metric |
| Current ratio | Ignored | First-class metric |
| Time treatment | Avg of 10/7/5/3yr periods | 10yr + 5yr Level + 10yr Consistency (CV-based) |
| Consistency / volatility signal | None — averaging conceals volatility | First-class 30% weight on every series-based metric |
| Level thresholds | 10% / 5% (Phil Town's "10/10/10 rule") | Per-metric Buffett-flavored cutpoints (12%, 15%, 1.0×, 1.5×, 2yrs, 10×, etc.) |
| Pillar weighting | 50 / 50 | 25 / 25 / 25 / 25 |
| Color bands | ≥70 / 40–69 / <40 | ≥70 / 40–69 / <40 (kept identical for migration ease) |

The color bands are the only intentional carry-over. Everything else has been redesigned.

---

## Open items deferred to implementation

These don't change the methodology; they're spec-level details that get resolved when writing the engine:

1. **Validation set.** Run the v2 engine against LULU, AAPL, COST (the sample reports) plus 5–10 known-tough cases (e.g., a strong-but-leveraged company, a great compounder with bumpy years, a young company missing data). Confirm the scores feel right; tune thresholds within the locked structure if needed.
2. **Schema migration.** `dataExport.js` exposes `thesisScore`, `moatScore`, `managementScore` to agents. The v2 engine will need to expose `thesisScore` (final), and the four pillar scores. Agent prompts that reference `moatScore` / `managementScore` need to migrate.
3. **UI migration.** [src/components/ScoreTable.jsx](../../src/components/ScoreTable.jsx), [src/components/Toolbox.jsx](../../src/components/Toolbox.jsx), [src/components/CompanyHeader.jsx](../../src/components/CompanyHeader.jsx), [src/components/Competitors.jsx](../../src/components/Competitors.jsx), [src/components/GrowthAnalysis.jsx](../../src/components/GrowthAnalysis.jsx) all consume the score. The 4-pillar structure replaces 2-pillar; tables and badges expand accordingly. (Toolbox is already flagged for refactor in [STEPS.md](../../STEPS.md) Phase 5 — the redesign can be the forcing function.)
4. **Tour/glossary copy.** [W2-PUNCHLIST.md](../../W2-PUNCHLIST.md) has methodology-laden strings tagged `POD-SCORE` that need rewriting with the v2 vocabulary (Compounding / Capital Efficiency / Capital Allocation / Resilience instead of Moat / Management).
5. **Tests.** `src/engines/__tests__/` has tests on the current score; need rewrites for the v2 structure.

---

## Decisions log (for the record)

The methodology was locked over a brainstorm session on 2026-05-09 with the following choices:

1. **Score role:** Screening gate (single 0–100 number, same UI role as today)
2. **Pillar structure:** 4 pillars — Compounding / Capital Efficiency / Capital Allocation / Resilience
3. **Scoring style:** Level + Consistency hybrid (70% / 30%)
4. **Metric stack:** 12 metrics, 3 per pillar (approved as-proposed)
5. **Pillar weights:** Equal (25% each)
6. **Period treatment:** Two-period — 10yr Level + 5yr Level, averaged
7. **Color bands:** Keep R1's bands (≥70/40-69/<40) — differentiation lives upstream

---

## Disclaimer note

This score is a quantitative summary of historical financial behavior. It is **not** a buy/sell signal. Per the locked disclaimer ([STEPS.md](../../STEPS.md) Appendix A): nothing produced by Thesis constitutes investment advice. The score is one input — alongside qualitative analysis (Pitch Deck, Full Story), valuation, and the user's own circle of competence — into an investment decision.
