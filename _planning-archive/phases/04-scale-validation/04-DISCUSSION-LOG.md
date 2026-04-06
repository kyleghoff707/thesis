# Phase 4: Scale Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 04-scale-validation
**Areas discussed:** Success bar recalibration, Outlier handling, Validation depth

---

## Success Bar Recalibration

### Q1: Accuracy target for 50-company truth set

| Option | Description | Selected |
|--------|-------------|----------|
| 94%+ (current level) | Accept 94.8% as ceiling given methodology diffs. Focus on proving it holds at scale. | ✓ |
| 95%+ (stretch) | Squeeze out ~0.5% by investigating worst outliers. Diminishing returns risk. | |
| Lock methodology-adjusted metric | Redefine accuracy to exclude METHODOLOGY_DIFFs. Report "accuracy on fixable fields" separately. | |

**User's choice:** 94%+ (current level)
**Notes:** User acknowledged Phase 3 conclusion that remaining diffs are methodology, not bugs.

### Q2: Engine fixes in Phase 4?

| Option | Description | Selected |
|--------|-------------|----------|
| Validation only | Phase 3 did the fixing. Phase 4 just proves it works at scale. | |
| Light fixes for clear wins | If S&P 500 reveals simple fix helping 50+ companies, apply it. No deep investigations. | |
| Fix + validate iteratively | Run S&P 500 validation, fix what fails, re-validate. More work but higher quality. | ✓ |

**User's choice:** Fix + validate iteratively
**Notes:** User wants Phase 4 to be an active improvement cycle, not passive validation.

### Q3: Stop condition for iterative fixing

| Option | Description | Selected |
|--------|-------------|----------|
| Accounting identities pass | Stop when all S&P 500 companies pass structural checks. | |
| Time/effort cap | Set a cap like "3 fix rounds max." | |
| Failure rate threshold | Stop when <5% have structural failures. | |

**User's choice:** (Other) "Can't we just use FMP and/or SimFin as the new truth set? That was the point of getting those API keys"
**Notes:** User reframed the approach — use FMP as truth set for S&P 500, not just accounting identities. This is the key insight that shaped the rest of the discussion.

### Q4: Primary S&P 500 truth set source

| Option | Description | Selected |
|--------|-------------|----------|
| FMP primary | Broadest coverage, existing collector, 2 days for full fetch. | ✓ |
| Both FMP + SimFin | Cross-reference like Phase 2. More confidence, 2x API calls. | |
| Consensus (FMP + SimFin + mstarpy) | Full triangulation. Strongest signal but mstarpy fragile. | |

**User's choice:** FMP first, add SimFin and mstarpy as "possible later validation attributes"
**Notes:** Start with FMP, keep door open for multi-source later.

---

## Outlier Handling

### Q1: Companies with extremely low accuracy

| Option | Description | Selected |
|--------|-------------|----------|
| Investigate and fix | RACE at 0% likely data/mapping issue. Investigate worst outliers in fix+validate cycle. | ✓ |
| Exclude known problem tickers | Remove RACE etc from metric. Report separately as "known limitations." | |
| Accept as-is | 94.8% already accounts for these. Focus on S&P 500 scale-up. | |

**User's choice:** Investigate
**Notes:** User identified RACE as Ferrari — Italian company filing in EUR, not USD. Explains the 0% accuracy.

### Q2: Financial sector outliers (MET, WFC)

| Option | Description | Selected |
|--------|-------------|----------|
| Investigate with FMP data | Use FMP to determine if overlays are wrong or if it's just MS definitions. | ✓ |
| Accept current overlay accuracy | Phase 3 tuned overlays. Remaining diffs likely definitional. | |
| You decide based on FMP comparison | Let Claude compare against FMP and flag clear issues. | |

**User's choice:** Investigate with FMP data
**Notes:** None.

---

## Validation Depth

### Q1: Field scope for S&P 500 comparison

| Option | Description | Selected |
|--------|-------------|----------|
| Scoring-critical fields only | ~30 fields feeding Rule One scoring. Faster, cleaner signal. | |
| All mapped fields | All ~100 mapped fields. More comprehensive but noisier. | |
| Tiered: score critical + flag others | Hard-pass on scoring-critical, soft-flag on display fields. Report both. | ✓ |

**User's choice:** Tiered approach
**Notes:** Both tiers reported separately.

### Q2: Beyond S&P 500 validation

| Option | Description | Selected |
|--------|-------------|----------|
| Random 50 from US universe | Proves engine generalizes to small/mid caps. | |
| Skip beyond-S&P for now | S&P 500 sufficient for this milestone. | ✓ |
| Sector-stratified sample of 100 | Better edge case coverage but more API calls. | |

**User's choice:** S&P only. Later phase for non-S&P.
**Notes:** User explicitly deferred broader validation to a future milestone.

### Q3: FMP fetch strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Batch over 2 days with disk cache | Day 1: ~250, Day 2: ~253. 7-day TTL. | ✓ |
| Spread over 3+ days | ~170/day for safety margin. | |
| You decide | Let Claude optimize batching. | |

**User's choice:** 2-day batch with disk cache
**Notes:** None.

---

## Claude's Discretion

- S&P 500 ticker list sourcing
- Accounting identity checks to run alongside FMP comparison
- Batch scheduling and rate limiting details
- Fix prioritization within iterative cycle
- Report format

## Deferred Ideas

- Beyond-S&P validation (random 50 from US universe) — future milestone
- SimFin + mstarpy as secondary S&P 500 validation — "add later"
- Subscription cancellation timing — not discussed
