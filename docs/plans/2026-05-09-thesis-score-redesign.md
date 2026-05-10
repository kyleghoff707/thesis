# Thesis Score v2 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using TDD. Each task is small and reviewable. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Per [CLAUDE.md](../../CLAUDE.md) project rules:** don't commit anything without explicit user approval; don't push to GitHub; default to deletion over preservation.

**Goal:** Replace `src/engines/thesisScore.js` (1:1 copy of Phil Town's Rule 1 Score) with the 4-pillar Buffett-flavored scoring methodology defined in [docs/specs/2026-05-09-thesis-score-redesign.md](../specs/2026-05-09-thesis-score-redesign.md).

**Architecture:** Build the v2 engine alongside v1 to validate before swapping. Once scores look right against AAPL/COST/LULU sample reports, cut over `dataExport.js` to v2 and delete v1 in one commit. UI components migrate to the new shape; agent prompts get a sweep for old field names.

**Tech Stack:** ES modules, Vitest, React + Vite, Zod schemas (loose objects).

**Spec authority:** [docs/specs/2026-05-09-thesis-score-redesign.md](../specs/2026-05-09-thesis-score-redesign.md) — do NOT redebate methodology. The spec is locked.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/engines/thesisScoreV2.js` | The new scoring engine. Computes 4 pillar scores + composite. Replaces `thesisScore.js`. |
| `src/engines/utils/consistency.js` | Shared helper: coefficient-of-variation → consistency score (0–100). Co-located so future pods can reuse. |
| `src/engines/__tests__/thesisScoreV2.test.js` | Unit tests for v2 (TDD: written before implementation). |
| `src/engines/__tests__/consistency.test.js` | Unit tests for the CV helper. |
| `scripts/validate-thesis-score-v2.mjs` | One-shot validation: runs v2 against AAPL/COST/LULU, prints pillar breakdowns. **Deleted at end of plan.** |

### Modified files

| Path | What changes |
|---|---|
| `src/engines/dataExport.js:16` | Import v2 instead of v1 |
| `src/engines/dataExport.js:145-173` | Step 5 (composite scores) — single v2 call replaces 3 v1 calls |
| `src/engines/dataExport.js:217-221` | `thesisScore` output shape: `{moat, management, composite}` → `{composite, pillars: {...}}` |
| `src/engines/peerMetrics.js` | Peer scoring uses v2 engine |
| `src/engines/critic.js:606-614` | `getDomainPatterns('thesisScore')` patterns updated for new pillar names; remove `moat score` regex |
| `src/components/ScoreTable.jsx` | Render 4 pillar rows (Compounding / Capital Efficiency / Capital Allocation / Resilience) instead of 2 (Moat / Management) |
| `src/components/CompanyHeader.jsx` | `<ScoreBadge label="Moat">` → 4 pillar badges (or compact composite-only display) |
| `src/components/Toolbox.jsx` | Score panel updated for 4 pillars |
| `src/components/Competitors.jsx` | Peer comparison shows new pillar columns |
| `src/components/GrowthAnalysis.jsx` | Score row in growth-rate table reflects new structure |
| `src/data/datapacket-slice-registry.json` | `moatScore`/`mgmtScore` slice keys → v2 pillar keys |
| `src/schemas/dataPacket.js:23` | Doc comment update (schema is `looseObject` so no shape enforcement, but docs should match) |
| `W2-PUNCHLIST.md` | POD-SCORE rows resolved (strikethrough or "DONE") |
| `STEPS.md:118` | Mark "Thesis Score" pod complete |
| `agents/**/prompt.md` | Sweep for `moatScore` / `managementScore` / `Moat Score` / `Management Score` references; replace with new pillar vocabulary |

### Test files updated

| Path | Reason |
|---|---|
| `src/engines/__tests__/dataExport.test.js` | New thesisScore output shape |
| `src/engines/__tests__/peerMetrics.test.js` | New v2 engine |
| `src/engines/__tests__/critic.test.js` | New `getDomainPatterns` regexes |
| `src/engines/__tests__/toolbox.test.js` | New score field names |
| `src/engines/__tests__/dataQualityCheckpoint.test.js` | Possible references to old field names |
| `src/utils/__tests__/sliceDataPacket.test.js` | Slice registry keys changed |

### Files deleted at end

- `src/engines/thesisScore.js` — replaced by v2
- `scripts/validate-thesis-score-v2.mjs` — temporary validation script

---

## Phases

The plan runs in 5 phases. Each phase ends with a checkpoint where the user reviews before moving on.

| Phase | Purpose | Tasks |
|---|---|---|
| 1 | Build v2 engine alongside v1 (zero production impact) | 1–7 |
| 2 | Cut dataExport over to v2 (production change) | 8–15 |
| 3 | UI migration | 16–20 |
| 4 | Agent prompt + docs sweep | 21–24 |
| 5 | Final validation + cleanup + commit | 25–28 |

---

## Phase 1: Build v2 engine

### Task 1: Add the consistency helper

**Files:**
- Create: `src/engines/utils/consistency.js`
- Test: `src/engines/__tests__/consistency.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// src/engines/__tests__/consistency.test.js
import { describe, it, expect } from 'vitest';
import { coefficientOfVariation, consistencyScore } from '../utils/consistency.js';

describe('coefficientOfVariation', () => {
  it('returns 0 for a perfectly steady series', () => {
    expect(coefficientOfVariation([0.10, 0.10, 0.10, 0.10])).toBe(0);
  });

  it('returns null for fewer than 3 data points', () => {
    expect(coefficientOfVariation([0.10])).toBeNull();
    expect(coefficientOfVariation([0.10, 0.12])).toBeNull();
  });

  it('returns null for an empty or all-null series', () => {
    expect(coefficientOfVariation([])).toBeNull();
    expect(coefficientOfVariation([null, null])).toBeNull();
  });

  it('uses absolute mean to handle negative-mean series safely', () => {
    // mean = -0.05, stdev positive → CV is positive
    const cv = coefficientOfVariation([-0.10, 0.00, -0.05]);
    expect(cv).toBeGreaterThan(0);
  });

  it('skips null entries when computing', () => {
    const cv = coefficientOfVariation([0.10, null, 0.10, 0.10]);
    expect(cv).toBe(0);
  });
});

describe('consistencyScore', () => {
  it('returns 100 for CV = 0', () => {
    expect(consistencyScore(0)).toBe(100);
  });

  it('returns 50 for CV = 0.3', () => {
    expect(consistencyScore(0.3)).toBe(50);
  });

  it('returns 0 for CV >= 0.6', () => {
    expect(consistencyScore(0.6)).toBe(0);
    expect(consistencyScore(1.0)).toBe(0);
  });

  it('returns null when CV is null', () => {
    expect(consistencyScore(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/engines/__tests__/consistency.test.js
```

Expected: FAIL with "Cannot find module '../utils/consistency.js'"

- [ ] **Step 3: Implement the helper**

```javascript
// src/engines/utils/consistency.js
// Coefficient-of-variation → 0-100 consistency score
// CV = stdev(series) / |mean(series)|
// Score: 0 CV → 100, 0.3 CV → 50, ≥0.6 CV → 0 (linear interpolation, clamped)

export function coefficientOfVariation(series) {
  const vals = series.filter(v => v != null && Number.isFinite(v));
  if (vals.length < 3) return null;

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length;
  const stdev = Math.sqrt(variance);

  const denom = Math.abs(mean);
  if (denom === 0) return stdev === 0 ? 0 : null;
  return stdev / denom;
}

export function consistencyScore(cv) {
  if (cv == null) return null;
  if (cv <= 0) return 100;
  if (cv >= 0.6) return 0;
  return Math.round(100 * (1 - cv / 0.6));
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

```bash
npx vitest run src/engines/__tests__/consistency.test.js
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Stage but do NOT commit (per CLAUDE.md — user must approve commits)**

```bash
git add src/engines/utils/consistency.js src/engines/__tests__/consistency.test.js
git status
```

---

### Task 2: Build the Compounding pillar

**Files:**
- Create: `src/engines/thesisScoreV2.js` (start)
- Test: `src/engines/__tests__/thesisScoreV2.test.js` (start)

The Compounding pillar scores BV+Div, Operating Cash Flow, and Free Cash Flow growth.

- [ ] **Step 1: Write the failing test**

```javascript
// src/engines/__tests__/thesisScoreV2.test.js
import { describe, it, expect } from 'vitest';
import { scoreCompoundingPillar } from '../thesisScoreV2.js';

describe('scoreCompoundingPillar', () => {
  it('scores a strong steady compounder near 100', () => {
    const input = {
      growthRates: {
        bvps: { '10yr': 0.13, '5yr': 0.13 },
        operatingCash: { '10yr': 0.13, '5yr': 0.13 },
        fcf: { '10yr': 0.11, '5yr': 0.11 },
      },
      // 10-year YoY series for consistency calculation
      bvpsSeries: [0.13, 0.12, 0.13, 0.14, 0.12, 0.13, 0.13, 0.12, 0.14, 0.13],
      operatingCashSeries: [0.13, 0.12, 0.14, 0.13, 0.12, 0.13, 0.14, 0.12, 0.13, 0.13],
      fcfSeries: [0.11, 0.10, 0.12, 0.11, 0.10, 0.11, 0.12, 0.11, 0.10, 0.11],
    };
    const { score } = scoreCompoundingPillar(input);
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it('scores a no-growth company near 0', () => {
    const input = {
      growthRates: {
        bvps: { '10yr': 0.02, '5yr': 0.01 },
        operatingCash: { '10yr': 0.03, '5yr': 0.02 },
        fcf: { '10yr': 0.01, '5yr': 0.00 },
      },
      bvpsSeries: [0.02, 0.01, 0.02, 0.01, 0.02, 0.02, 0.01, 0.02, 0.01, 0.02],
      operatingCashSeries: [0.03, 0.02, 0.02, 0.03, 0.02, 0.03, 0.02, 0.02, 0.03, 0.02],
      fcfSeries: [0.01, 0.00, 0.01, 0.00, 0.01, 0.01, 0.00, 0.01, 0.00, 0.01],
    };
    const { score } = scoreCompoundingPillar(input);
    expect(score).toBeLessThan(20);
  });

  it('penalizes lumpy growth even with high mean', () => {
    const steady = scoreCompoundingPillar({
      growthRates: {
        bvps: { '10yr': 0.12, '5yr': 0.12 },
        operatingCash: { '10yr': 0.12, '5yr': 0.12 },
        fcf: { '10yr': 0.10, '5yr': 0.10 },
      },
      bvpsSeries: Array(10).fill(0.12),
      operatingCashSeries: Array(10).fill(0.12),
      fcfSeries: Array(10).fill(0.10),
    });

    const lumpy = scoreCompoundingPillar({
      growthRates: {
        bvps: { '10yr': 0.12, '5yr': 0.12 },
        operatingCash: { '10yr': 0.12, '5yr': 0.12 },
        fcf: { '10yr': 0.10, '5yr': 0.10 },
      },
      bvpsSeries: [-0.20, 0.50, -0.10, 0.40, 0.05, 0.30, -0.15, 0.45, 0.10, 0.10],
      operatingCashSeries: [-0.20, 0.50, -0.10, 0.40, 0.05, 0.30, -0.15, 0.45, 0.10, 0.10],
      fcfSeries: [-0.20, 0.50, -0.10, 0.40, 0.05, 0.30, -0.15, 0.45, 0.10, 0.10],
    });

    expect(steady.score).toBeGreaterThan(lumpy.score);
  });

  it('returns null score when all metrics are missing', () => {
    const { score } = scoreCompoundingPillar({
      growthRates: { bvps: {}, operatingCash: {}, fcf: {} },
      bvpsSeries: [],
      operatingCashSeries: [],
      fcfSeries: [],
    });
    expect(score).toBeNull();
  });
});
```

- [ ] **Step 2: Run — confirm it fails**

```bash
npx vitest run src/engines/__tests__/thesisScoreV2.test.js
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the pillar**

```javascript
// src/engines/thesisScoreV2.js
// Thesis Score v2 — 4-pillar Buffett-flavored quality score
// See docs/specs/2026-05-09-thesis-score-redesign.md for methodology

import { coefficientOfVariation, consistencyScore } from './utils/consistency.js';

// ─── Per-metric scoring helpers ────────────────────────────────────

// Score a single value against threshold cutoffs.
// thresholds = { full: number, partial: number } where >= full → 100, >= partial → 50, else → 0
function scoreLevelByThreshold(value, thresholds) {
  if (value == null) return null;
  if (value >= thresholds.full) return 100;
  if (value >= thresholds.partial) return 50;
  return 0;
}

// Combine 10yr and 5yr Level scores. Uses average of both when both present;
// falls back to the available one. Returns null if both missing.
function combineLevels(score10, score5) {
  if (score10 == null && score5 == null) return null;
  if (score10 == null) return score5;
  if (score5 == null) return score10;
  return (score10 + score5) / 2;
}

// Combine Level + Consistency per spec: 70% Level + 30% Consistency.
// If consistency is null (Resilience metrics or insufficient series), returns Level alone.
function combineLevelAndConsistency(level, cons) {
  if (level == null) return null;
  if (cons == null) return level;
  return 0.7 * level + 0.3 * cons;
}

// Score a growth metric (BV+Div, OpCF, FCF) using Level + Consistency.
// thresholds: per-metric Level thresholds (e.g. { full: 0.12, partial: 0.08 })
// growthRates: { '10yr': rate, '5yr': rate, ... } from growthRates engine
// series: 10-year YoY rate series for consistency calc
function scoreGrowthMetric(growthRates, series, thresholds) {
  const level10 = scoreLevelByThreshold(growthRates?.['10yr'], thresholds);
  const level5 = scoreLevelByThreshold(growthRates?.['5yr'], thresholds);
  const level = combineLevels(level10, level5);
  if (level == null) return null;

  const cv = coefficientOfVariation(series || []);
  const cons = consistencyScore(cv);
  return Math.round(combineLevelAndConsistency(level, cons));
}

// ─── Pillar 1: Compounding ─────────────────────────────────────────

const COMPOUNDING_THRESHOLDS = {
  bvps:          { full: 0.12, partial: 0.08 }, // BV+Div growth: ≥12% / 8-12% / <8%
  operatingCash: { full: 0.12, partial: 0.08 },
  fcf:           { full: 0.10, partial: 0.06 }, // FCF tolerance one tier looser (lumpier)
};

export function scoreCompoundingPillar(input) {
  const { growthRates = {}, bvpsSeries, operatingCashSeries, fcfSeries } = input;

  const metrics = {
    bvpsGrowth:          scoreGrowthMetric(growthRates.bvps, bvpsSeries, COMPOUNDING_THRESHOLDS.bvps),
    operatingCashGrowth: scoreGrowthMetric(growthRates.operatingCash, operatingCashSeries, COMPOUNDING_THRESHOLDS.operatingCash),
    fcfGrowth:           scoreGrowthMetric(growthRates.fcf, fcfSeries, COMPOUNDING_THRESHOLDS.fcf),
  };

  const present = Object.values(metrics).filter(v => v != null);
  const score = present.length > 0
    ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
    : null;

  return { score, metrics };
}
```

- [ ] **Step 4: Run — confirm tests pass**

```bash
npx vitest run src/engines/__tests__/thesisScoreV2.test.js
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Stage**

```bash
git add src/engines/thesisScoreV2.js src/engines/__tests__/thesisScoreV2.test.js
```

---

### Task 3: Build the Capital Efficiency pillar

Adds 3 metrics: ROIC (existing), FCF/NI (cash quality — new), Gross margin trend (new).

**Files:**
- Modify: `src/engines/thesisScoreV2.js` (add `scoreCapitalEfficiencyPillar`)
- Modify: `src/engines/__tests__/thesisScoreV2.test.js` (add tests)

- [ ] **Step 1: Write the failing tests**

```javascript
// Append to src/engines/__tests__/thesisScoreV2.test.js
import { scoreCapitalEfficiencyPillar } from '../thesisScoreV2.js';

describe('scoreCapitalEfficiencyPillar', () => {
  it('scores a high-ROIC, cash-rich, margin-expanding business near 100', () => {
    const { score } = scoreCapitalEfficiencyPillar({
      returnAverages: {
        '10yr': { roic: 0.20 },
        '5yr':  { roic: 0.22 },
      },
      roicSeries: [0.20, 0.21, 0.22, 0.20, 0.22, 0.21, 0.20, 0.22, 0.21, 0.22],
      fcfNiRatios: [1.05, 1.10, 1.00, 1.08, 1.05, 1.05, 1.10, 1.05, 1.00, 1.10],
      grossMarginSlope: 0.012, // +1.2pp/yr (rising)
    });
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it('scores a leveraged-ROE-but-low-ROIC business well below 50', () => {
    const { score } = scoreCapitalEfficiencyPillar({
      returnAverages: {
        '10yr': { roic: 0.06 },
        '5yr':  { roic: 0.05 },
      },
      roicSeries: [0.06, 0.07, 0.05, 0.06, 0.06, 0.05, 0.07, 0.06, 0.05, 0.06],
      fcfNiRatios: [0.50, 0.60, 0.55, 0.50, 0.55, 0.50, 0.60, 0.50, 0.55, 0.60],
      grossMarginSlope: -0.008, // declining margin
    });
    expect(score).toBeLessThan(40);
  });

  it('flags accruals red flag (FCF/NI < 0.7) by scoring cash quality at 0', () => {
    const { metrics } = scoreCapitalEfficiencyPillar({
      returnAverages: {
        '10yr': { roic: 0.18 },
        '5yr':  { roic: 0.18 },
      },
      roicSeries: Array(10).fill(0.18),
      fcfNiRatios: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      grossMarginSlope: 0.0,
    });
    expect(metrics.cashQuality).toBeLessThan(40);
  });

  it('handles missing data with null metrics', () => {
    const { score, metrics } = scoreCapitalEfficiencyPillar({
      returnAverages: { '10yr': {}, '5yr': {} },
      roicSeries: [],
      fcfNiRatios: [],
      grossMarginSlope: null,
    });
    expect(score).toBeNull();
    expect(metrics.roic).toBeNull();
    expect(metrics.cashQuality).toBeNull();
    expect(metrics.grossMarginTrend).toBeNull();
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
npx vitest run src/engines/__tests__/thesisScoreV2.test.js -t scoreCapitalEfficiencyPillar
```

Expected: FAIL.

- [ ] **Step 3: Implement the pillar**

```javascript
// Append to src/engines/thesisScoreV2.js

// ─── Pillar 2: Capital Efficiency ──────────────────────────────────

const ROIC_THRESHOLDS = { full: 0.15, partial: 0.10 }; // ROIC ≥15% / 10-15% / <10%

// FCF/NI is a ratio (cash quality); scored against a different scale:
// ≥1.0 → 100 (earnings backed by cash), 0.7-1.0 → 50, <0.7 → 0
function scoreCashQualityRatios(ratios) {
  const valid = (ratios || []).filter(r => r != null && Number.isFinite(r));
  if (valid.length === 0) return null;

  // Use median to dampen one-off outliers (e.g. a single year with NI≈0)
  const sorted = [...valid].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const level = median >= 1.0 ? 100 : median >= 0.7 ? 50 : 0;

  // Consistency: penalize wildly varying cash conversion
  const cv = coefficientOfVariation(valid);
  const cons = consistencyScore(cv);
  return Math.round(combineLevelAndConsistency(level, cons));
}

// Gross margin trend: regression slope over 5 years (in decimal, e.g. 0.012 = +1.2pp/yr)
// Rising (>0.005) → 100, stable (-0.005 to 0.005) → 50, declining (<-0.005) → 0
function scoreGrossMarginTrend(slope) {
  if (slope == null || !Number.isFinite(slope)) return null;
  if (slope > 0.005) return 100;
  if (slope >= -0.005) return 50;
  return 0;
}

export function scoreCapitalEfficiencyPillar(input) {
  const { returnAverages = {}, roicSeries, fcfNiRatios, grossMarginSlope } = input;

  // ROIC: same Level + Consistency pattern as growth metrics
  const roicLevel = combineLevels(
    scoreLevelByThreshold(returnAverages['10yr']?.roic, ROIC_THRESHOLDS),
    scoreLevelByThreshold(returnAverages['5yr']?.roic, ROIC_THRESHOLDS),
  );
  const roicCV = coefficientOfVariation(roicSeries || []);
  const roicConsistency = consistencyScore(roicCV);
  const roicScore = roicLevel != null
    ? Math.round(combineLevelAndConsistency(roicLevel, roicConsistency))
    : null;

  const metrics = {
    roic:             roicScore,
    cashQuality:      scoreCashQualityRatios(fcfNiRatios),
    grossMarginTrend: scoreGrossMarginTrend(grossMarginSlope),
  };

  const present = Object.values(metrics).filter(v => v != null);
  const score = present.length > 0
    ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
    : null;

  return { score, metrics };
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run src/engines/__tests__/thesisScoreV2.test.js
```

Expected: PASS (all tests including Compounding).

- [ ] **Step 5: Stage**

```bash
git add src/engines/thesisScoreV2.js src/engines/__tests__/thesisScoreV2.test.js
```

---

### Task 4: Build the Capital Allocation pillar

3 metrics: shares-outstanding 5yr trend, dividend track record, reinvestment effectiveness. **This pillar has no equivalent in R1 — most differentiation lives here.**

- [ ] **Step 1: Write the failing tests**

```javascript
// Append to src/engines/__tests__/thesisScoreV2.test.js
import { scoreCapitalAllocationPillar } from '../thesisScoreV2.js';

describe('scoreCapitalAllocationPillar', () => {
  it('rewards shrinking share count (buybacks) with full credit', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: -0.05, // 5% reduction
      dividendInfo: { isPayer: false },
      reinvestmentEffectiveness: 1.05,
    });
    expect(metrics.buybackDiscipline).toBe(100);
  });

  it('penalizes share dilution', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: 0.08, // 8% dilution
      dividendInfo: { isPayer: false },
      reinvestmentEffectiveness: 0.9,
    });
    expect(metrics.buybackDiscipline).toBe(0);
  });

  it('treats non-payers as neutral (70) on dividend track record', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: -0.02,
      dividendInfo: { isPayer: false },
      reinvestmentEffectiveness: 1.0,
    });
    expect(metrics.dividendTrackRecord).toBe(70);
  });

  it('rewards consistent, FCF-covered, growing dividends with 100', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: 0,
      dividendInfo: {
        isPayer: true,
        consecutiveYearsCovered: 10,
        cagr5yr: 0.08,
        latestPayoutRatio: 0.40,
      },
      reinvestmentEffectiveness: 1.0,
    });
    expect(metrics.dividendTrackRecord).toBe(100);
  });

  it('penalizes uncovered or cut dividends with 0', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: 0,
      dividendInfo: {
        isPayer: true,
        consecutiveYearsCovered: 0,
        cagr5yr: -0.10,
        latestPayoutRatio: 1.5, // paying out more than FCF
      },
      reinvestmentEffectiveness: 1.0,
    });
    expect(metrics.dividendTrackRecord).toBe(0);
  });

  it('reinvestment effectiveness >= 1.0 → 100', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: 0,
      dividendInfo: { isPayer: false },
      reinvestmentEffectiveness: 1.2,
    });
    expect(metrics.reinvestmentEffectiveness).toBe(100);
  });

  it('reinvestment effectiveness < 0.7 → 0', () => {
    const { metrics } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: 0,
      dividendInfo: { isPayer: false },
      reinvestmentEffectiveness: 0.4,
    });
    expect(metrics.reinvestmentEffectiveness).toBe(0);
  });

  it('returns null pillar score when all metrics are missing', () => {
    const { score } = scoreCapitalAllocationPillar({
      sharesOutstanding5yrPctChange: null,
      dividendInfo: null,
      reinvestmentEffectiveness: null,
    });
    expect(score).toBeNull();
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
npx vitest run src/engines/__tests__/thesisScoreV2.test.js -t scoreCapitalAllocationPillar
```

Expected: FAIL.

- [ ] **Step 3: Implement the pillar**

```javascript
// Append to src/engines/thesisScoreV2.js

// ─── Pillar 3: Capital Allocation ──────────────────────────────────

// Shares outstanding 5yr % change: declining → 100, flat (±2%) → 50, rising → 0
function scoreBuybackDiscipline(pct5yr) {
  if (pct5yr == null) return null;
  if (pct5yr < -0.02) return 100;        // shrunk by >2%
  if (pct5yr <= 0.02) return 50;         // flat (±2%)
  return 0;                              // diluted
}

// Dividend track record:
// - Non-payer → neutral 70 (don't penalize reinvesting strategies)
// - Covered + growing 5yr CAGR + payout ratio < 70% → 100
// - Covered but flat or stagnant → 50
// - Cut, uncovered (payout > 1.0), or no consecutive coverage → 0
function scoreDividendTrackRecord(info) {
  if (!info) return null;
  if (!info.isPayer) return 70;

  const { consecutiveYearsCovered = 0, cagr5yr = 0, latestPayoutRatio = 0 } = info;

  // Failure cases
  if (latestPayoutRatio > 1.0) return 0;     // paying out more than earnings
  if (consecutiveYearsCovered < 3) return 0; // not long enough track
  if (cagr5yr < -0.05) return 0;             // cut by ≥5%/yr

  // Strong cases
  if (consecutiveYearsCovered >= 5 && cagr5yr > 0 && latestPayoutRatio < 0.7) return 100;

  // Middle: covered but flat / high payout
  return 50;
}

// Reinvestment effectiveness ratio: ≥1.0 → 100, 0.7-1.0 → 50, <0.7 → 0
function scoreReinvestmentEffectiveness(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  if (ratio >= 1.0) return 100;
  if (ratio >= 0.7) return 50;
  return 0;
}

export function scoreCapitalAllocationPillar(input) {
  const {
    sharesOutstanding5yrPctChange,
    dividendInfo,
    reinvestmentEffectiveness,
  } = input;

  const metrics = {
    buybackDiscipline:         scoreBuybackDiscipline(sharesOutstanding5yrPctChange),
    dividendTrackRecord:       scoreDividendTrackRecord(dividendInfo),
    reinvestmentEffectiveness: scoreReinvestmentEffectiveness(reinvestmentEffectiveness),
  };

  const present = Object.values(metrics).filter(v => v != null);
  const score = present.length > 0
    ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
    : null;

  return { score, metrics };
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run src/engines/__tests__/thesisScoreV2.test.js
```

Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add src/engines/thesisScoreV2.js src/engines/__tests__/thesisScoreV2.test.js
```

---

### Task 5: Build the Resilience pillar

3 metrics: Net Debt / FCF, Interest Coverage, Current Ratio. All point-in-time (no Consistency component).

- [ ] **Step 1: Write the failing tests**

```javascript
// Append to src/engines/__tests__/thesisScoreV2.test.js
import { scoreResiliencePillar } from '../thesisScoreV2.js';

describe('scoreResiliencePillar', () => {
  it('full credit for net cash + 20x interest coverage + 2.5 current ratio', () => {
    const { score } = scoreResiliencePillar({
      netDebtToFCF: -0.5, // net cash
      interestCoverage: 20,
      currentRatio: 2.5,
    });
    expect(score).toBe(100);
  });

  it('penalizes leveraged but solvent business', () => {
    const { score } = scoreResiliencePillar({
      netDebtToFCF: 5, // 5 years to pay off
      interestCoverage: 4,
      currentRatio: 0.9,
    });
    expect(score).toBeLessThan(20);
  });

  it('handles 0–2 year debt as 75 per spec', () => {
    const { metrics } = scoreResiliencePillar({
      netDebtToFCF: 1.5,
      interestCoverage: 12,
      currentRatio: 1.8,
    });
    expect(metrics.netDebtToFCF).toBe(75);
  });

  it('handles 2–4 year debt as 35 per spec', () => {
    const { metrics } = scoreResiliencePillar({
      netDebtToFCF: 3,
      interestCoverage: 8,
      currentRatio: 1.2,
    });
    expect(metrics.netDebtToFCF).toBe(35);
  });

  it('returns null pillar when all metrics missing', () => {
    const { score } = scoreResiliencePillar({
      netDebtToFCF: null,
      interestCoverage: null,
      currentRatio: null,
    });
    expect(score).toBeNull();
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
npx vitest run src/engines/__tests__/thesisScoreV2.test.js -t scoreResiliencePillar
```

Expected: FAIL.

- [ ] **Step 3: Implement the pillar**

```javascript
// Append to src/engines/thesisScoreV2.js

// ─── Pillar 4: Resilience ──────────────────────────────────────────
// Point-in-time metrics. No Consistency component (returns Level only).

// Net Debt / FCF (years): ≤0 → 100, 0-2 → 75, 2-4 → 35, >4 → 0
function scoreNetDebtToFCF(years) {
  if (years == null || !Number.isFinite(years)) return null;
  if (years <= 0) return 100;
  if (years <= 2) return 75;
  if (years <= 4) return 35;
  return 0;
}

// Interest coverage (EBIT / interest expense): ≥10 → 100, 5-10 → 50, <5 → 0
function scoreInterestCoverage(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  if (ratio >= 10) return 100;
  if (ratio >= 5) return 50;
  return 0;
}

// Current ratio: ≥1.5 → 100, 1.0-1.5 → 50, <1.0 → 0
function scoreCurrentRatio(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  if (ratio >= 1.5) return 100;
  if (ratio >= 1.0) return 50;
  return 0;
}

export function scoreResiliencePillar(input) {
  const { netDebtToFCF, interestCoverage, currentRatio } = input;

  const metrics = {
    netDebtToFCF:     scoreNetDebtToFCF(netDebtToFCF),
    interestCoverage: scoreInterestCoverage(interestCoverage),
    currentRatio:     scoreCurrentRatio(currentRatio),
  };

  const present = Object.values(metrics).filter(v => v != null);
  const score = present.length > 0
    ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
    : null;

  return { score, metrics };
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run src/engines/__tests__/thesisScoreV2.test.js
```

Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add src/engines/thesisScoreV2.js src/engines/__tests__/thesisScoreV2.test.js
```

---

### Task 6: Build the composite assembler + input adapter

The assembler takes raw engine outputs (from `dataExport.js`'s Step 2) and computes the full score. This wraps the 4 pillar functions with the data extraction logic.

- [ ] **Step 1: Write the failing tests**

```javascript
// Append to src/engines/__tests__/thesisScoreV2.test.js
import { computeThesisScoreV2 } from '../thesisScoreV2.js';

describe('computeThesisScoreV2 — composite', () => {
  it('returns null when fewer than 5 years of public history', () => {
    const result = computeThesisScoreV2({
      statements: { years: [2024, 2023, 2022, 2021] }, // only 4 years
      growthRates: {},
      returnMetrics: { averages: {} },
      fcf: {},
    });
    expect(result.composite).toBeNull();
    expect(result.reason).toMatch(/insufficient.*history/i);
  });

  it('returns full structure: composite + 4 pillars', () => {
    // Build a richly-populated synthetic input
    const result = computeThesisScoreV2(BUILD_SYNTHETIC_INPUT_HEALTHY());
    expect(result.composite).toBeGreaterThanOrEqual(70);
    expect(result.pillars).toHaveProperty('compounding');
    expect(result.pillars).toHaveProperty('capitalEfficiency');
    expect(result.pillars).toHaveProperty('capitalAllocation');
    expect(result.pillars).toHaveProperty('resilience');
    for (const p of Object.values(result.pillars)) {
      expect(p).toHaveProperty('score');
      expect(p).toHaveProperty('metrics');
    }
  });

  it('returns null composite when 2+ pillars are null', () => {
    const result = computeThesisScoreV2(BUILD_SYNTHETIC_INPUT_DATA_GAPS());
    expect(result.composite).toBeNull();
  });
});

// Helper: build synthetic input matching the dataExport.js shape.
// IMPORTANT: When implementing, refer to the real shapes by reading:
//   - src/engines/growthRates.js (computeAllGrowthRates output)
//   - src/engines/returnMetrics.js (computeReturnMetrics output)
//   - src/engines/freeCashFlow.js (computeFreeCashFlow output)
//   - src/engines/edgarFinancials.js (statements.income/balance/cashFlow shape)
function BUILD_SYNTHETIC_INPUT_HEALTHY() {
  const years = Array.from({ length: 11 }, (_, i) => 2014 + i); // 2014-2024
  return {
    statements: {
      years: [...years].reverse(), // newest first per engine convention
      income: Object.fromEntries(years.map(y => [y, {
        net_income_loss: 1000 * Math.pow(1.13, y - 2014),
        operating_income_loss: 1500 * Math.pow(1.13, y - 2014),
        interest_expense: 50,
        revenues: 5000 * Math.pow(1.13, y - 2014),
        cost_of_revenue: 3000 * Math.pow(1.13, y - 2014),
      }])),
      balance: Object.fromEntries(years.map(y => [y, {
        equity: 5000 * Math.pow(1.13, y - 2014),
        long_term_debt: 100,
        cash: 2000,
        assets: 8000 * Math.pow(1.13, y - 2014),
        common_shares_outstanding: 1000 * Math.pow(0.99, y - 2014), // shrinking 1%/yr
        current_assets: 3000,
        current_liabilities: 1500,
      }])),
      cashFlow: Object.fromEntries(years.map(y => [y, {
        net_cash_flow_from_operating_activities: 1100 * Math.pow(1.13, y - 2014),
        free_cash_flow: 900 * Math.pow(1.11, y - 2014),
        dividends_paid: 200,
      }])),
    },
    growthRates: {
      bvps:          { '10yr': 0.13, '5yr': 0.13 },
      operatingCash: { '10yr': 0.13, '5yr': 0.13 },
      fcf:           { '10yr': 0.11, '5yr': 0.11 },
    },
    returnMetrics: {
      averages: {
        '10yr': { roic: 0.20 },
        '5yr':  { roic: 0.20 },
      },
      yearly: years.map(y => ({ year: y, roic: 0.20 })),
    },
    fcf: { yearly: years.map(y => ({ year: y, fcf: 900 * Math.pow(1.11, y - 2014) })) },
  };
}

function BUILD_SYNTHETIC_INPUT_DATA_GAPS() {
  return {
    statements: { years: [2024, 2023, 2022, 2021, 2020] }, // exactly 5 years (passes history gate)
    growthRates: {}, // empty → Compounding pillar null
    returnMetrics: { averages: {} }, // empty → Capital Efficiency null
    fcf: {},
    // No shares/dividend data → Capital Allocation may be null
    // No interest/current ratio data → Resilience may be null
  };
}
```

- [ ] **Step 2: Run — confirm fail**

```bash
npx vitest run src/engines/__tests__/thesisScoreV2.test.js -t computeThesisScoreV2
```

Expected: FAIL.

- [ ] **Step 3: Implement the composite assembler**

> **CRITICAL:** Before writing this, read the actual shapes returned by `computeAllGrowthRates`, `computeReturnMetrics`, `computeFreeCashFlow`, and `fetchEdgarStatements`. The synthetic test inputs above are illustrative; the real adapter has to match the real engine outputs. Adjust field names where needed and update the synthetic helper if the real shapes differ.

```javascript
// Append to src/engines/thesisScoreV2.js

// ─── Adapters: extract pillar inputs from raw engine outputs ──────

// Build Compounding pillar input from growthRates + statements
function adaptCompoundingInput(growthRates, statements) {
  const buildSeries = (extractor) => {
    if (!statements || !Array.isArray(statements.years)) return [];
    const sorted = [...statements.years].sort((a, b) => a - b);
    const yoy = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = extractor(sorted[i - 1]);
      const curr = extractor(sorted[i]);
      if (prev && prev !== 0 && curr != null) {
        yoy.push((curr - prev) / Math.abs(prev));
      } else {
        yoy.push(null);
      }
    }
    return yoy;
  };

  // BV per share + cumulative dividends per share
  // Approximation: track equity per share (book value); add dividends from cashFlow
  const bvpsSeries = buildSeries(year => {
    const bal = statements.balance?.[year];
    if (!bal) return null;
    const equity = bal.equity_attributable_to_parent ?? bal.equity;
    const shares = bal.common_shares_outstanding;
    return (equity && shares) ? equity / shares : null;
  });

  const operatingCashSeries = buildSeries(year => {
    const cf = statements.cashFlow?.[year];
    return cf?.net_cash_flow_from_operating_activities ?? null;
  });

  const fcfSeries = buildSeries(year => {
    const cf = statements.cashFlow?.[year];
    return cf?.free_cash_flow ?? null;
  });

  return {
    growthRates: {
      bvps: growthRates?.bvps,
      operatingCash: growthRates?.operatingCash,
      fcf: growthRates?.fcf,
    },
    bvpsSeries,
    operatingCashSeries,
    fcfSeries,
  };
}

// Build Capital Efficiency input
function adaptCapitalEfficiencyInput(returnMetrics, statements) {
  const roicSeries = (returnMetrics?.yearly || [])
    .map(y => y.roic)
    .filter(v => v != null);

  // FCF/NI ratios per year
  const fcfNiRatios = [];
  if (statements && Array.isArray(statements.years)) {
    for (const year of statements.years) {
      const ni = statements.income?.[year]?.net_income_loss;
      const fcf = statements.cashFlow?.[year]?.free_cash_flow;
      if (ni && ni !== 0 && fcf != null) {
        fcfNiRatios.push(fcf / ni);
      }
    }
  }

  // Gross margin slope (5yr regression)
  const grossMarginSlope = computeGrossMarginSlope(statements, 5);

  return {
    returnAverages: returnMetrics?.averages || {},
    roicSeries,
    fcfNiRatios,
    grossMarginSlope,
  };
}

// Compute regression slope of gross margin over the most recent N years.
// Returns null if data unavailable. Slope is in decimal/year (e.g. 0.012 = +1.2pp/yr).
function computeGrossMarginSlope(statements, years = 5) {
  if (!statements || !Array.isArray(statements.years)) return null;

  const sorted = [...statements.years].sort((a, b) => a - b);
  const recent = sorted.slice(-years);

  const points = [];
  for (const y of recent) {
    const inc = statements.income?.[y];
    const rev = inc?.revenues;
    const cogs = inc?.cost_of_revenue;
    if (rev && rev !== 0 && cogs != null) {
      points.push({ x: y, y: (rev - cogs) / rev });
    }
  }
  if (points.length < 3) return null;

  // Simple linear regression slope
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
  const den = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  return den === 0 ? null : num / den;
}

// Build Capital Allocation input
function adaptCapitalAllocationInput(statements) {
  if (!statements?.years?.length) {
    return {
      sharesOutstanding5yrPctChange: null,
      dividendInfo: null,
      reinvestmentEffectiveness: null,
    };
  }

  const sorted = [...statements.years].sort((a, b) => a - b);
  const latestYear = sorted[sorted.length - 1];
  const fiveAgoYear = sorted[Math.max(0, sorted.length - 6)];

  // Shares outstanding 5yr % change
  const sharesNow = statements.balance?.[latestYear]?.common_shares_outstanding;
  const sharesThen = statements.balance?.[fiveAgoYear]?.common_shares_outstanding;
  const sharesPct = (sharesNow && sharesThen)
    ? (sharesNow - sharesThen) / sharesThen
    : null;

  // Dividend info: aggregate over the 10-year window
  const dividendInfo = buildDividendInfo(statements, sorted);

  // Reinvestment effectiveness over the 5-year window
  const reinvestmentEffectiveness = computeReinvestmentEffectiveness(statements, sorted, 5);

  return {
    sharesOutstanding5yrPctChange: sharesPct,
    dividendInfo,
    reinvestmentEffectiveness,
  };
}

function buildDividendInfo(statements, sortedYears) {
  const dividends = sortedYears.map(y => statements.cashFlow?.[y]?.dividends_paid ?? 0);
  const fcfs = sortedYears.map(y => statements.cashFlow?.[y]?.free_cash_flow ?? 0);

  const totalDividends = dividends.reduce((a, b) => a + Math.abs(b), 0);
  if (totalDividends === 0) {
    return { isPayer: false };
  }

  // Consecutive years where dividends > 0 AND FCF >= dividends
  let consecutive = 0;
  for (let i = sortedYears.length - 1; i >= 0; i--) {
    const div = Math.abs(dividends[i]);
    const fcf = fcfs[i];
    if (div > 0 && fcf >= div) consecutive++;
    else break;
  }

  // 5yr CAGR of dividends per share
  const startIdx = Math.max(0, sortedYears.length - 6);
  const startDiv = Math.abs(dividends[startIdx]);
  const endDiv = Math.abs(dividends[sortedYears.length - 1]);
  const yearsSpan = sortedYears.length - 1 - startIdx;
  const cagr5yr = (startDiv > 0 && yearsSpan > 0)
    ? Math.pow(endDiv / startDiv, 1 / yearsSpan) - 1
    : 0;

  // Latest payout ratio (div / FCF)
  const latestDiv = Math.abs(dividends[sortedYears.length - 1]);
  const latestFCF = fcfs[sortedYears.length - 1];
  const latestPayoutRatio = (latestFCF > 0) ? latestDiv / latestFCF : 1.5;

  return {
    isPayer: true,
    consecutiveYearsCovered: consecutive,
    cagr5yr,
    latestPayoutRatio,
  };
}

// Reinvestment effectiveness over an N-year window:
// numerator   = (BV per share at end + cumulative div per share) - BV per share at start
// denominator = sum over window of (NI per share - div per share)
// ratio       = numerator / denominator
function computeReinvestmentEffectiveness(statements, sortedYears, windowYears) {
  if (sortedYears.length < windowYears + 1) return null;
  const start = sortedYears[sortedYears.length - 1 - windowYears];
  const end = sortedYears[sortedYears.length - 1];

  const balStart = statements.balance?.[start];
  const balEnd = statements.balance?.[end];
  if (!balStart || !balEnd) return null;

  const sharesStart = balStart.common_shares_outstanding;
  const sharesEnd = balEnd.common_shares_outstanding;
  const equityStart = balStart.equity_attributable_to_parent ?? balStart.equity;
  const equityEnd = balEnd.equity_attributable_to_parent ?? balEnd.equity;
  if (!sharesStart || !sharesEnd || !equityStart || !equityEnd) return null;

  const bvpsStart = equityStart / sharesStart;
  const bvpsEnd = equityEnd / sharesEnd;

  const windowSlice = sortedYears.slice(-windowYears - 1);
  let cumulativeDivPerShare = 0;
  let cumulativeRetainedPerShare = 0;
  for (const y of windowSlice) {
    const cf = statements.cashFlow?.[y] || {};
    const inc = statements.income?.[y] || {};
    const bal = statements.balance?.[y] || {};
    const shares = bal.common_shares_outstanding;
    if (!shares) continue;

    const div = Math.abs(cf.dividends_paid ?? 0) / shares;
    const ni = (inc.net_income_loss ?? 0) / shares;
    cumulativeDivPerShare += div;
    cumulativeRetainedPerShare += (ni - div);
  }

  const numerator = (bvpsEnd + cumulativeDivPerShare) - bvpsStart;
  if (cumulativeRetainedPerShare <= 0) return null;
  return numerator / cumulativeRetainedPerShare;
}

// Build Resilience input
function adaptResilienceInput(statements, fcf, debtMetrics) {
  if (!statements?.years?.length) {
    return { netDebtToFCF: null, interestCoverage: null, currentRatio: null };
  }

  const latestYear = [...statements.years].sort((a, b) => b - a)[0];
  const bal = statements.balance?.[latestYear] || {};
  const inc = statements.income?.[latestYear] || {};

  // Prefer engine-derived netDebtToFCF; fall back to manual
  const netDebtToFCF = debtMetrics?.netDebtToFCF ?? null;

  // Interest coverage = EBIT / interest expense
  const ebit = inc.operating_income_loss ?? null;
  const interest = inc.interest_expense ?? null;
  const interestCoverage = (ebit != null && interest && interest !== 0)
    ? ebit / Math.abs(interest)
    : null;

  // Current ratio = current assets / current liabilities
  const ca = bal.current_assets;
  const cl = bal.current_liabilities;
  const currentRatio = (ca && cl && cl !== 0) ? ca / cl : null;

  return { netDebtToFCF, interestCoverage, currentRatio };
}

// ─── Composite ─────────────────────────────────────────────────────

const MIN_PUBLIC_YEARS = 5;

export function computeThesisScoreV2(input) {
  const { statements, growthRates, returnMetrics, fcf, debtMetrics } = input;

  // Edge case: insufficient public history
  if (!statements?.years || statements.years.length < MIN_PUBLIC_YEARS) {
    return {
      composite: null,
      reason: 'insufficient public history (<5 years)',
      pillars: null,
    };
  }

  const compounding         = scoreCompoundingPillar(adaptCompoundingInput(growthRates, statements));
  const capitalEfficiency   = scoreCapitalEfficiencyPillar(adaptCapitalEfficiencyInput(returnMetrics, statements));
  const capitalAllocation   = scoreCapitalAllocationPillar(adaptCapitalAllocationInput(statements));
  const resilience          = scoreResiliencePillar(adaptResilienceInput(statements, fcf, debtMetrics));

  const pillarScores = [
    compounding.score,
    capitalEfficiency.score,
    capitalAllocation.score,
    resilience.score,
  ];

  const present = pillarScores.filter(s => s != null);
  // Per spec: if 2+ pillars are null, return null composite (insufficient data)
  if (present.length < 3) {
    return {
      composite: null,
      reason: `${4 - present.length} pillar(s) had insufficient data`,
      pillars: { compounding, capitalEfficiency, capitalAllocation, resilience },
    };
  }

  const composite = Math.round(present.reduce((a, b) => a + b, 0) / present.length);

  return {
    composite,
    pillars: { compounding, capitalEfficiency, capitalAllocation, resilience },
  };
}

// ─── Display helpers (replace v1 cellColor / badgeColor) ───────────

// Cell color for a Level-style metric value (e.g. growth rate, ROIC)
// Caller supplies the threshold. This is more flexible than v1's hardcoded 10%/5%.
export function cellColor(value, fullThreshold, partialThreshold) {
  if (value == null) return 'gray';
  if (value >= fullThreshold) return 'green';
  if (value >= partialThreshold) return 'yellow';
  return 'red';
}

// Composite score badge color (kept identical to v1 — bands unchanged per spec)
export function badgeColor(score) {
  if (score == null) return 'gray';
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run src/engines/__tests__/thesisScoreV2.test.js
```

Expected: PASS (all suites including the composite).

> **If real engine field names differ from the synthetic test data,** update both the adapter and the test helper so they stay in sync. Read the actual `growthRates.js` / `returnMetrics.js` / `freeCashFlow.js` source to confirm.

- [ ] **Step 5: Stage**

```bash
git add src/engines/thesisScoreV2.js src/engines/__tests__/thesisScoreV2.test.js
```

---

### Task 7: Validation script — run v2 against AAPL / COST / LULU

This is a **manual checkpoint**. The user looks at the scores and decides if they pass the smell test before we cut over.

**Files:**
- Create: `scripts/validate-thesis-score-v2.mjs`

- [ ] **Step 1: Write the validation script**

```javascript
// scripts/validate-thesis-score-v2.mjs
// One-shot validation: run v2 against AAPL / COST / LULU and print pillar breakdowns.
// Compare to v1 output side-by-side. Run with: node scripts/validate-thesis-score-v2.mjs

import { fetchEdgarStatements } from '../src/engines/edgarFinancials.js';
import { computeAllGrowthRates } from '../src/engines/growthRates.js';
import { computeReturnMetrics, computeDebtMetrics } from '../src/engines/returnMetrics.js';
import { computeFreeCashFlow } from '../src/engines/freeCashFlow.js';
import { computeMoatScore, computeManagementScore, computeThesisScore } from '../src/engines/thesisScore.js';
import { computeThesisScoreV2 } from '../src/engines/thesisScoreV2.js';

const TICKERS = ['AAPL', 'COST', 'LULU'];

for (const ticker of TICKERS) {
  console.log(`\n═══ ${ticker} ═══\n`);

  const statements = await fetchEdgarStatements(ticker);
  if (!statements) { console.log('  (no statements)'); continue; }

  const growthRates = computeAllGrowthRates(statements);
  const returnMetrics = computeReturnMetrics(statements);
  const debtMetrics = computeDebtMetrics(statements);
  const fcf = computeFreeCashFlow(statements);

  // v1
  const moat = computeMoatScore(growthRates);
  const mgmt = computeManagementScore(returnMetrics.averages, debtMetrics);
  const v1 = computeThesisScore(moat?.moatScore, mgmt?.managementScore);

  // v2
  const v2 = computeThesisScoreV2({ statements, growthRates, returnMetrics, fcf, debtMetrics });

  console.log(`  v1 Thesis Score (R1 copy): ${v1}`);
  console.log(`     Moat: ${moat?.moatScore}`);
  console.log(`     Management: ${mgmt?.managementScore}`);

  console.log(`\n  v2 Thesis Score: ${v2.composite}`);
  if (v2.pillars) {
    for (const [name, pillar] of Object.entries(v2.pillars)) {
      console.log(`     ${name}: ${pillar.score}`);
      for (const [m, s] of Object.entries(pillar.metrics)) {
        console.log(`       - ${m}: ${s}`);
      }
    }
  }
  if (v2.reason) console.log(`  Reason: ${v2.reason}`);
}
```

- [ ] **Step 2: Run it**

```bash
cd /Users/kylehoff/Desktop/Thesis && node scripts/validate-thesis-score-v2.mjs 2>&1 | tee /tmp/thesis-v2-validation.txt
```

Expected: prints v1 vs v2 scores for AAPL, COST, LULU.

- [ ] **Step 3: Show output to user — manual checkpoint**

Stop here. Show the user the output. Ask:
> "Here's v1 vs v2 for AAPL/COST/LULU. Do the v2 scores feel right? Anything pop out as obviously wrong (a great company scoring red, a junk company scoring green, a pillar consistently null)? If anything's off, we adjust thresholds before cutting over."

If user wants tuning, edit thresholds in `thesisScoreV2.js` and rerun. Iterate until user approves.

**DO NOT proceed to Phase 2 without explicit user approval of the v2 scores.**

- [ ] **Step 4: Stage the validation script**

```bash
git add scripts/validate-thesis-score-v2.mjs
```

(The script gets deleted in Task 27. It stays in the working tree for now in case we re-run it.)

---

## Phase 2: Cut over to v2

> All Phase 2 tasks together form **one logical commit** ("swap thesis score to v2"). Stage as you go; commit at the end of Phase 2 with explicit user approval.

### Task 8: Update `dataExport.js` to call v2

**Files:**
- Modify: `src/engines/dataExport.js:16` (import)
- Modify: `src/engines/dataExport.js:145-173` (Step 5 score computation)
- Modify: `src/engines/dataExport.js:217-221` (output shape)

- [ ] **Step 1: Replace the import**

Change line 16:

```javascript
// OLD
import { computeMoatScore, computeManagementScore, computeThesisScore } from './thesisScore.js';

// NEW
import { computeThesisScoreV2 } from './thesisScoreV2.js';
```

- [ ] **Step 2: Replace the Step 5 composite-score block (lines 145–173)**

Replace the existing block with:

```javascript
  // ── Step 5: Composite score (Thesis Score v2) ──
  // See docs/specs/2026-05-09-thesis-score-redesign.md

  let thesisScoreResult = { composite: null, pillars: null };

  try {
    if (statements && growthRates && returnMetrics) {
      thesisScoreResult = computeThesisScoreV2({
        statements,
        growthRates,
        returnMetrics,
        fcf,
        debtMetrics,
      });
    }
  } catch (err) {
    errors.push(`thesisScore: ${err.message}`);
  }
```

- [ ] **Step 3: Replace the output shape (lines 217–221)**

Replace:

```javascript
    // OLD
    thesisScore: {
      moat: moatScore?.moatScore ?? null,
      management: managementScore?.managementScore ?? null,
      composite: thesisScoreResult ?? null,
    },
```

With:

```javascript
    // NEW
    thesisScore: {
      composite: thesisScoreResult.composite,
      pillars: thesisScoreResult.pillars,
      reason: thesisScoreResult.reason,
    },
```

- [ ] **Step 4: Stage**

```bash
git add src/engines/dataExport.js
```

(Tests fail until Task 10. That's expected — we're inside one logical commit.)

---

### Task 9: Update `peerMetrics.js` to use v2

**Files:**
- Modify: `src/engines/peerMetrics.js`

- [ ] **Step 1: Read the current peerMetrics.js**

```bash
cat src/engines/peerMetrics.js | head -100
```

Find the score computation (calls to `computeMoatScore`, `computeManagementScore`, or `computeThesisScore`).

- [ ] **Step 2: Replace v1 calls with v2**

Replace the import:

```javascript
// OLD
import { computeMoatScore, computeManagementScore } from './thesisScore.js';

// NEW
import { computeThesisScoreV2 } from './thesisScoreV2.js';
```

Replace the score computation. The exact call site varies — find the function that computes per-peer scores and have it call:

```javascript
const score = computeThesisScoreV2({
  statements: peerStatements,
  growthRates: peerGrowthRates,
  returnMetrics: peerReturnMetrics,
  fcf: peerFcf,
  debtMetrics: peerDebtMetrics,
});
// Use score.composite for the peer's overall score
// Use score.pillars.<name>.score for per-pillar peer comparisons
```

- [ ] **Step 3: Stage**

```bash
git add src/engines/peerMetrics.js
```

---

### Task 10: Update `dataExport.test.js`

**Files:**
- Modify: `src/engines/__tests__/dataExport.test.js`

- [ ] **Step 1: Read the existing test**

```bash
grep -n "thesisScore\|moatScore\|managementScore" src/engines/__tests__/dataExport.test.js
```

- [ ] **Step 2: Update assertions**

Replace assertions on the old shape (`thesisScore.moat`, `thesisScore.management`) with assertions on the new shape (`thesisScore.composite`, `thesisScore.pillars.compounding.score`, etc.).

For each assertion, the new shape mirror is:

| Old | New |
|---|---|
| `result.thesisScore.moat` | `result.thesisScore.pillars.compounding.score` |
| `result.thesisScore.management` | `result.thesisScore.pillars.capitalEfficiency.score` (or similar — depending on what the test was checking) |
| `result.thesisScore.composite` | `result.thesisScore.composite` (same key, different math) |

If a test was specifically asserting on numeric values from v1, replace with `expect(result.thesisScore.composite).toBeGreaterThanOrEqual(0)` and `.toBeLessThanOrEqual(100)` — the actual values will differ.

- [ ] **Step 3: Run — confirm pass**

```bash
npx vitest run src/engines/__tests__/dataExport.test.js
```

Expected: PASS.

- [ ] **Step 4: Stage**

```bash
git add src/engines/__tests__/dataExport.test.js
```

---

### Task 11: Update `peerMetrics.test.js`

**Files:**
- Modify: `src/engines/__tests__/peerMetrics.test.js`

- [ ] **Step 1: Read the existing test, find score-related assertions**

```bash
grep -n "moatScore\|managementScore\|thesisScore" src/engines/__tests__/peerMetrics.test.js
```

- [ ] **Step 2: Update fixtures and assertions**

Same pattern as Task 10. Replace old-shape assertions with new-shape, update any synthetic input fixtures so they include the data v2 needs (full `statements` object, not just `growthRates` + `returnAverages`).

- [ ] **Step 3: Run — confirm pass**

```bash
npx vitest run src/engines/__tests__/peerMetrics.test.js
```

Expected: PASS.

- [ ] **Step 4: Stage**

```bash
git add src/engines/__tests__/peerMetrics.test.js
```

---

### Task 12: Update `critic.js` patterns

**Files:**
- Modify: `src/engines/critic.js:606-614`
- Modify: `src/engines/__tests__/critic.test.js`

The `getDomainPatterns('thesisScore')` function returns regex patterns for detecting score claims in agent narrative. The current patterns reference "moat score" — this needs to update.

- [ ] **Step 1: Update the patterns**

Replace lines 606–614 in `src/engines/critic.js`:

```javascript
    case 'thesisScore':
      return [
        { pattern: /thesis\s+score\s+(of|is|at)\s+\d+/i, label: 'thesis score' },
        { pattern: /compounding\s+score\s+(of|is|at)\s+\d+/i, label: 'compounding score' },
        { pattern: /capital\s+efficiency\s+score\s+(of|is|at)\s+\d+/i, label: 'capital efficiency score' },
        { pattern: /capital\s+allocation\s+score\s+(of|is|at)\s+\d+/i, label: 'capital allocation score' },
        { pattern: /resilience\s+score\s+(of|is|at)\s+\d+/i, label: 'resilience score' },
      ];
```

Note: the broader R1-coded methodology checks (e.g., `barriers_moats`, `management`, `moat_checklist`) belong to brainstorm pod 4 (Full Story redesign / POD-FS) and are **out of scope here**. Don't touch them.

- [ ] **Step 2: Update critic tests**

```bash
grep -n "moat score\|management score" src/engines/__tests__/critic.test.js
```

If any tests assert on the old patterns, update them to the new pillar names.

- [ ] **Step 3: Run — confirm pass**

```bash
npx vitest run src/engines/__tests__/critic.test.js
```

Expected: PASS.

- [ ] **Step 4: Stage**

```bash
git add src/engines/critic.js src/engines/__tests__/critic.test.js
```

---

### Task 13: Update `sliceDataPacket.test.js` and slice registry

**Files:**
- Modify: `src/data/datapacket-slice-registry.json`
- Modify: `src/utils/__tests__/sliceDataPacket.test.js`

The registry has slice keys like `moatScore`/`mgmtScore`. Since v2 collapses these into `thesisScore.pillars`, the slice registry should expose `thesisScore` as one slice (covers all 4 pillars together) and remove the old keys.

- [ ] **Step 1: Read the current registry**

```bash
cat src/data/datapacket-slice-registry.json
```

- [ ] **Step 2: Remove `moatScore` / `mgmtScore` slice entries; ensure `thesisScore` is present**

Update keys so consumers request `thesisScore` and get the full new structure. Don't add per-pillar slices (slicing the score adds complexity for no caller benefit — agents can read the full thesisScore field).

- [ ] **Step 3: Update slice tests**

```bash
grep -n "moatScore\|mgmtScore" src/utils/__tests__/sliceDataPacket.test.js
```

Remove old-key tests; verify `thesisScore` is sliced correctly.

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run src/utils/__tests__/sliceDataPacket.test.js
```

- [ ] **Step 5: Stage**

```bash
git add src/data/datapacket-slice-registry.json src/utils/__tests__/sliceDataPacket.test.js
```

---

### Task 14: Update `toolbox.test.js` and `dataQualityCheckpoint.test.js`

- [ ] **Step 1: Find references**

```bash
grep -n "moatScore\|managementScore\|thesisScore.moat\|thesisScore.management" \
  src/engines/__tests__/toolbox.test.js \
  src/engines/__tests__/dataQualityCheckpoint.test.js
```

- [ ] **Step 2: Update each reference**

Same pattern as Task 10. If a test asserts on `thesisScore.moat`, update to use the new pillar field. If a test creates a fake DataPacket that passes through assertions, update the synthetic shape.

- [ ] **Step 3: Run — confirm pass**

```bash
npx vitest run src/engines/__tests__/toolbox.test.js src/engines/__tests__/dataQualityCheckpoint.test.js
```

- [ ] **Step 4: Stage**

```bash
git add src/engines/__tests__/toolbox.test.js src/engines/__tests__/dataQualityCheckpoint.test.js
```

---

### Task 15: Phase 2 checkpoint — full test suite green

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/kylehoff/Desktop/Thesis && npm test
```

Expected: ALL PASS. If anything is red, fix before proceeding.

- [ ] **Step 2: Show user the diff so far**

```bash
git diff --stat HEAD -- src/engines src/utils src/schemas src/data
```

- [ ] **Step 3: User checkpoint**

Stop here. Tell user:
> "Phase 2 done — engine swapped, tests green. UI components still render the old shape and will look broken until Phase 3. OK to proceed?"

**Don't commit yet.** Keep changes staged. We commit at end of Phase 5.

---

## Phase 3: UI migration

### Task 16: Update `ScoreTable.jsx` — render 4 pillar rows

**Files:**
- Modify: `src/components/ScoreTable.jsx`

- [ ] **Step 1: Find current usage**

```bash
grep -rn "import.*ScoreTable\|<ScoreTable" src/components 2>/dev/null
```

ScoreTable is used by Toolbox and probably GrowthAnalysis. Note callers; we'll update them in subsequent tasks.

- [ ] **Step 2: Read ScoreTable.jsx in full**

```bash
cat src/components/ScoreTable.jsx
```

- [ ] **Step 3: Update the rendering**

The component currently renders rows from `props.rows` (passed in by callers). The structure of those rows will change at the caller side (Tasks 18 and 20). For ScoreTable itself:

- Update the imports to pull `cellColor`, `badgeColor` from `../engines/thesisScoreV2` (renamed module).
- Update prop types / docstring to expect new pillar rows: `{ label, pillarKey, score, metrics: { metricName: number, ... } }`.
- The actual JSX may not need much change if it's already row-data-driven.

```javascript
// Top of file
import { cellColor, badgeColor } from '../engines/thesisScoreV2';
```

The `cellColor` signature changed (now takes thresholds explicitly). Update calls:

```javascript
// OLD
const color = scored ? cellColor(rate) : 'gray';

// NEW — caller (Toolbox / GrowthAnalysis) supplies thresholds per metric.
// ScoreTable should accept a per-row `thresholds` field and pass it to cellColor.
// If thresholds are absent, fall back to gray.
const color = (scored && row.thresholds)
  ? cellColor(rate, row.thresholds.full, row.thresholds.partial)
  : 'gray';
```

- [ ] **Step 4: Stage**

```bash
git add src/components/ScoreTable.jsx
```

(Visible in dev server only after Toolbox/GrowthAnalysis update — Tasks 18, 20.)

---

### Task 17: Update `CompanyHeader.jsx`

**Files:**
- Modify: `src/components/CompanyHeader.jsx`

- [ ] **Step 1: Read the relevant block**

```bash
grep -n "ScoreBadge\|thesisScore\|moatScore\|managementScore" src/components/CompanyHeader.jsx
```

Per W2-PUNCHLIST.md line 92–94, the header has 3 ScoreBadges: Thesis Score (large), Moat, Mgmt. Replace the two non-composite badges.

- [ ] **Step 2: Decide presentation**

Two choices:
- **(a) Composite-only**: Just one big Thesis Score badge in the header. Pillar breakdown lives in Toolbox. Cleanest header.
- **(b) Composite + 4 pillar mini-badges**: Header shows all 5 numbers. Information dense; cluttered on narrow screens.

**Recommend (a)** — pillar detail belongs in Toolbox where there's room. Header just shows the composite.

- [ ] **Step 3: Replace**

```javascript
// OLD (around line 117–120 per W2-PUNCHLIST)
<ScoreBadge label="Thesis Score" score={thesisScore} large />
<ScoreBadge label="Moat" score={moatScore} />
<ScoreBadge label="Mgmt" score={managementScore} />

// NEW — composite only
<ScoreBadge label="Thesis Score" score={dataPacket.thesisScore?.composite ?? null} large />
```

Update the prop derivation upstream so `thesisScore`, `moatScore`, `managementScore` aren't pulled from the old shape. Remove unused `moatScore` / `managementScore` destructuring.

- [ ] **Step 4: Stage**

```bash
git add src/components/CompanyHeader.jsx
```

---

### Task 18: Update `Toolbox.jsx` — score panel

**Files:**
- Modify: `src/components/Toolbox.jsx`

This is the largest UI change. Toolbox is ~700 lines (per STEPS.md it's already flagged for refactor in Phase 5 — don't refactor it now, just patch the score panel).

- [ ] **Step 1: Find the score panel**

```bash
grep -n "moatScore\|managementScore\|thesisScore\|ScoreTable" src/components/Toolbox.jsx
```

- [ ] **Step 2: Replace the score panel rows**

The old panel had 2 ScoreTable instances (Moat / Management) feeding off `growthRates` and `returnAverages` directly.

Replace with 4 ScoreTable instances, one per pillar, sourced from `dataPacket.thesisScore.pillars`:

```jsx
{thesisScore?.pillars && (
  <>
    <ScoreTable
      sectionTitle="Compounding"
      rows={[
        { label: 'BV + Dividends growth', rates: growthRates.bvps, score: thesisScore.pillars.compounding.metrics.bvpsGrowth, thresholds: { full: 0.12, partial: 0.08 } },
        { label: 'Operating Cash Flow growth', rates: growthRates.operatingCash, score: thesisScore.pillars.compounding.metrics.operatingCashGrowth, thresholds: { full: 0.12, partial: 0.08 } },
        { label: 'Free Cash Flow growth', rates: growthRates.fcf, score: thesisScore.pillars.compounding.metrics.fcfGrowth, thresholds: { full: 0.10, partial: 0.06 } },
      ]}
      overallLabel="Compounding"
      overallScore={thesisScore.pillars.compounding.score}
    />
    <ScoreTable
      sectionTitle="Capital Efficiency"
      rows={[
        { label: 'ROIC', rates: pluckRoic(returnMetrics), score: thesisScore.pillars.capitalEfficiency.metrics.roic, thresholds: { full: 0.15, partial: 0.10 } },
        { label: 'Cash quality (FCF/NI)', score: thesisScore.pillars.capitalEfficiency.metrics.cashQuality, type: 'simple' },
        { label: 'Gross margin trend', score: thesisScore.pillars.capitalEfficiency.metrics.grossMarginTrend, type: 'simple' },
      ]}
      overallLabel="Capital Efficiency"
      overallScore={thesisScore.pillars.capitalEfficiency.score}
    />
    <ScoreTable
      sectionTitle="Capital Allocation"
      rows={[
        { label: 'Buyback discipline (5yr shares trend)', score: thesisScore.pillars.capitalAllocation.metrics.buybackDiscipline, type: 'simple' },
        { label: 'Dividend track record', score: thesisScore.pillars.capitalAllocation.metrics.dividendTrackRecord, type: 'simple' },
        { label: 'Reinvestment effectiveness', score: thesisScore.pillars.capitalAllocation.metrics.reinvestmentEffectiveness, type: 'simple' },
      ]}
      overallLabel="Capital Allocation"
      overallScore={thesisScore.pillars.capitalAllocation.score}
    />
    <ScoreTable
      sectionTitle="Resilience"
      rows={[
        { label: 'Net Debt / FCF (years)', score: thesisScore.pillars.resilience.metrics.netDebtToFCF, type: 'debt', debtValue: derivedDebtMetrics?.netDebtToFCF },
        { label: 'Interest coverage', score: thesisScore.pillars.resilience.metrics.interestCoverage, type: 'simple' },
        { label: 'Current ratio', score: thesisScore.pillars.resilience.metrics.currentRatio, type: 'simple' },
      ]}
      overallLabel="Resilience"
      overallScore={thesisScore.pillars.resilience.score}
    />
  </>
)}
```

> ScoreTable currently supports `type: 'rate'` (default) and `type: 'debt'`. Add a `type: 'simple'` mode that just shows the score as a plain row (no period columns) — see Task 16 for where to wire it. For brevity use `<RateCell scored={false}>` style or a new minimal cell renderer.

- [ ] **Step 3: Add `type: 'simple'` rendering to ScoreTable** (deferred from Task 16)

In `src/components/ScoreTable.jsx`, in the rows.map block:

```javascript
{row.type === 'simple' ? (
  <td colSpan={PERIOD_COLS.length} style={{ ...cellBase, color: C.textMuted, textAlign: 'left', paddingLeft: 14 }}>
    {/* No per-period columns — single-value metric */}
  </td>
) : row.type === 'debt' ? (
  ...existing debt rendering...
) : (
  ...existing rate rendering...
)}
```

- [ ] **Step 4: Run dev server, smoke test**

```bash
npm run dev
```

Open http://localhost:5173, search a known ticker (try AAPL), verify Toolbox shows 4 pillar tables. Take a quick look — does it render? Are the numbers there?

- [ ] **Step 5: Stage**

```bash
git add src/components/Toolbox.jsx src/components/ScoreTable.jsx
```

---

### Task 19: Update `Competitors.jsx`

**Files:**
- Modify: `src/components/Competitors.jsx`

- [ ] **Step 1: Find score references**

```bash
grep -n "moatScore\|managementScore\|thesisScore\|r1Score" src/components/Competitors.jsx
```

(The W2-PUNCHLIST mentioned `r1Score` was missed in the Phase 2 rename — check if still present.)

- [ ] **Step 2: Update peer score columns**

If competitors table shows per-peer Moat/Management scores, replace with Thesis composite + (optional) the 4 pillar scores. Keep the table compact — composite + 1-2 most differentiating pillars (Compounding, Resilience) is reasonable.

- [ ] **Step 3: Smoke test in dev**

```bash
npm run dev
```

Open Competitors view. Verify peer rows render.

- [ ] **Step 4: Stage**

```bash
git add src/components/Competitors.jsx
```

---

### Task 20: Update `GrowthAnalysis.jsx`

**Files:**
- Modify: `src/components/GrowthAnalysis.jsx`

- [ ] **Step 1: Find score references**

```bash
grep -n "thesisScore\|moatScore\|managementScore" src/components/GrowthAnalysis.jsx
```

- [ ] **Step 2: Update**

GrowthAnalysis probably renders growth-rate tables with score badges. Update score field references to use `thesisScore.pillars.compounding.metrics.*`. Drop any v1-specific Moat/Management rows that no longer apply.

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

- [ ] **Step 4: Stage**

```bash
git add src/components/GrowthAnalysis.jsx
```

---

## Phase 4: Agent + docs sweep

### Task 21: Sweep `agents/` for old field names

**Files:**
- Modify: any `agents/**/prompt.md` matching old field names

- [ ] **Step 1: Find references**

```bash
grep -rn "moatScore\|managementScore\|moat\.score\|management\.score\|Moat Score\|Management Score" agents/
```

- [ ] **Step 2: For each match, decide**

Each match is one of:
- (a) **Field reference** in instructions like "use dataPacket.thesisScore.moat" → replace with new path (`thesisScore.pillars.compounding.score`, etc.).
- (b) **Methodology word** in framing like "evaluate the moat of the company" → leave alone. "Moat" as a value-investing concept is not the same as "Moat Score" as a v1 schema field. Don't over-correct.

- [ ] **Step 3: Replace field references one file at a time**

For each prompt that references a path from the old `thesisScore` shape, replace with the equivalent path in the new shape. Run a quick grep after each edit to confirm no stragglers.

- [ ] **Step 4: Stage**

```bash
git add agents/
```

---

### Task 22: Update W2-PUNCHLIST

**Files:**
- Modify: `W2-PUNCHLIST.md`

- [ ] **Step 1: Mark POD-SCORE rows resolved**

For each row tagged `[POD-SCORE]`, either:
- Strikethrough the row (`~~...~~`) with a "DONE 2026-05-09" note, OR
- Move to a "Resolved" section at the bottom

Per CLAUDE.md "default to deletion over preservation", strikethrough is cleaner — keeps the audit trail without adding sections.

- [ ] **Step 2: Stage**

```bash
git add W2-PUNCHLIST.md
```

---

### Task 23: Delete `src/engines/thesisScore.js` (the v1 engine)

> Defer this until Phase 4 so any test that secretly imports it would fail loudly. After Phase 2/3, no caller should reference it.

- [ ] **Step 1: Confirm no references**

```bash
grep -rn "from.*thesisScore['\"]" src/ --include="*.js" --include="*.jsx" | grep -v "thesisScoreV2"
```

Expected: zero matches.

- [ ] **Step 2: Delete**

```bash
git rm src/engines/thesisScore.js
```

- [ ] **Step 3: Verify build still passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

---

### Task 24: Update `STEPS.md`

**Files:**
- Modify: `STEPS.md` (lines 117–123, the brainstorm pods checklist)

- [ ] **Step 1: Mark "Thesis Score" pod complete**

Change:

```markdown
- [ ] **Thesis Score** — algorithmically different, not just renamed. Just renaming Rule One Score is *more* derivative, not less. Brainstorm should produce a new scoring rubric.
```

To:

```markdown
- [x] **Thesis Score** — locked 2026-05-09. See [docs/specs/2026-05-09-thesis-score-redesign.md](docs/specs/2026-05-09-thesis-score-redesign.md). Implementation per [docs/plans/2026-05-09-thesis-score-redesign.md](docs/plans/2026-05-09-thesis-score-redesign.md).
```

- [ ] **Step 2: Stage**

```bash
git add STEPS.md
```

---

## Phase 5: Final validation + commit

### Task 25: Full test suite

- [ ] **Step 1: Run all tests**

```bash
cd /Users/kylehoff/Desktop/Thesis && npm test 2>&1 | tee /tmp/thesis-final-test.txt
```

Expected: ALL PASS.

If any test fails, fix it. Common breakage points:
- A test fixture still has the old `thesisScore.moat` shape
- An agent fixture references a removed slice key
- A regex in critic.js test still matches "moat score"

---

### Task 26: Re-run validation script

- [ ] **Step 1: Run**

```bash
node scripts/validate-thesis-score-v2.mjs 2>&1 | tee /tmp/thesis-v2-final.txt
```

Expected: same scores as Task 7 (or improved if user requested threshold tuning).

- [ ] **Step 2: Manual UI smoke test**

```bash
npm run dev
```

Click through:
- Search for AAPL — verify CompanyHeader shows composite Thesis Score badge
- Open Toolbox — verify 4 pillar score tables render with values
- Open Competitors — verify peer scores render
- Open GrowthAnalysis — verify growth rows + score column align

Take a screenshot for the user. Anything broken: fix before commit.

---

### Task 27: Cleanup

- [ ] **Step 1: Delete validation script**

```bash
git rm scripts/validate-thesis-score-v2.mjs
```

- [ ] **Step 2: Confirm working tree state**

```bash
git status
git diff --stat HEAD
```

Show user the full change footprint.

---

### Task 28: Commit (with explicit user approval)

- [ ] **Step 1: Ask user for commit approval**

Per CLAUDE.md: "Don't commit anything without explicit user approval."

Show the user the diff stat. Ask:
> "Ready to commit Thesis Score v2? This will be a single commit covering the engine swap, UI migration, agent prompt sweep, and docs update. ~25 files. OK to proceed?"

- [ ] **Step 2: Commit on user's go-ahead**

```bash
git commit -m "$(cat <<'EOF'
feat(thesis-score): redesign scoring methodology — 4-pillar Buffett-flavored

Replaces the Rule 1 Score copy with a methodology-distinct quality score:
- 4 pillars (Compounding / Capital Efficiency / Capital Allocation / Resilience)
- Level + Consistency scoring (rewards predictability, not just average level)
- New metrics: cash quality (FCF/NI), interest coverage, current ratio,
  buyback discipline, reinvestment effectiveness
- Drops EPS, ROA, Net Debt/Earnings, R1's Big-5 averaging
- Composite range 0-100 unchanged; color bands ≥70/40-69/<40 unchanged

Resolves brainstorm pod #1 from STEPS.md Phase 2B.

Spec: docs/specs/2026-05-09-thesis-score-redesign.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify**

```bash
git log -1 --stat
```

Expected: clean commit with all files. **Do NOT push** (per Phase 1 migration rule).

---

## Self-review (run before handing the plan to an executor)

The author runs this checklist after writing the plan:

**1. Spec coverage:**
- ✅ 4 pillars implemented (Tasks 2–5)
- ✅ Level + Consistency math (Task 1 + per-pillar tasks)
- ✅ Two-period Level (10yr + 5yr) — `combineLevels` helper
- ✅ Color bands kept identical — `badgeColor` unchanged in Task 6
- ✅ Per-metric thresholds match spec table — encoded in Tasks 2/3/4/5
- ✅ Edge cases: <5yr public history → null (Task 6); non-payer neutral 70 (Task 4); missing-data exclusion (per-pillar `present` filter); negative FCF (median-of-ratios in cashQuality)
- ✅ Agent contract migration (Task 8 — output shape) and consumer sweep (Tasks 9–14, 21)
- ✅ UI migration (Tasks 16–20)
- ✅ Docs/punchlist update (Tasks 22, 24)
- ✅ Validation against AAPL/COST/LULU (Task 7, Task 26)

**2. Placeholders:** None. Each step has either runnable commands or full code.

**3. Type consistency:**
- Pillar input shapes match between adapters and pillar functions ✅
- Output shape `{ score, metrics: {...} }` consistent across all 4 pillars ✅
- `thesisScoreV2.computeThesisScoreV2` returns `{ composite, pillars: {...}, reason? }` consistently ✅

**4. Ambiguity:** The synthetic test inputs in Task 6 use field names assumed from `growthRates.js` / `returnMetrics.js` / `edgarFinancials.js`. The implementing agent must read those source files to confirm. Step 3 of Task 6 calls this out explicitly.

---

## Execution handoff

Plan saved to `docs/plans/2026-05-09-thesis-score-redesign.md` (next to the spec at `docs/specs/`).

The user's project doesn't appear to have superpowers-style executing-plans skills installed. The natural execution model here is task-by-task in this same Claude Code session, with the user reviewing at each phase checkpoint (end of Phase 1, Phase 2, Phase 3, Phase 5).

Ask the user:
> "Plan complete. Ready to start on Task 1 (the consistency helper)? Or do you want to review the plan first and edit anything?"
