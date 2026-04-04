# Phase 23: Delight Feature Wiring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 23-delight-feature-wiring
**Areas discussed:** Deep dive data source, Assumptions/Promise Tracker data source, Glossary & term detection, Bull/Bear toggle behavior

---

## Deep Dive Data Source

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-computed in pipeline | Add deep-dives field per section during generation. ~$0.50-1.00 extra per report. | |
| On-demand Claude API call | Live Claude API call when user clicks. 3-5s latency, ~$0.02-0.05 per click. | ✓ |
| Extract from existing data | Repurpose primarySourceInsights/crossCuttingFindings. Zero cost but less targeted. | |

**User's choice:** On-demand Claude API call
**Notes:** User wants targeted, contextual deep dives generated fresh when needed.

### Follow-up: Trigger Point Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Pipeline marks notable claims | Pipeline adds notableClaims[] per section. Deterministic. | ✓ |
| Client-side heuristic | UI scans for bold text, numbers, patterns. No pipeline change but less precise. | |
| Every paragraph clickable | Any paragraph can trigger a deep dive. Simple but may generate low-value expansions. | |

**User's choice:** Pipeline marks notable claims
**Notes:** None

### Follow-up: Report Stage Scope

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 stages | Deep dives on OP, PD, and FS. | |
| Pitch Deck + Full Story only | Skip One Pager (quick filter). | ✓ |
| Full Story only | Narrowest scope. | |

**User's choice:** Pitch Deck + Full Story only
**Notes:** None

### Follow-up: Caching

| Option | Description | Selected |
|--------|-------------|----------|
| IndexedDB cache | 24hr TTL, instant on repeat clicks. | |
| Cache in report JSON | Permanent, saved as part of report. | ✓ |
| No caching | Always fresh, always costs. | |

**User's choice:** Save to report JSON (permanent)
**Notes:** User explained the mental model: "It would be akin to a PM asking an analyst to go deeper into a certain analysis. The analyst would incorporate their new research into the overall report so that the PM can re-read the same analysis again." Deep dives become permanent additions to the report.

### Follow-up: Iterative Deepening

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — iterative deepening | "Go Deeper" button after first deep dive. 2-3 depth levels. | ✓ |
| Single expansion only | One click per claim. | |

**User's choice:** Iterative deepening
**Notes:** None

---

## Assumptions / Promise Tracker Data Source

**Major scope change:** User clarified that "assumption tracker" was originally intended to be the **Management Promise Tracker** from the CEO plan. The Promise Tracker is a substantially different and more valuable feature.

| Option | Description | Selected |
|--------|-------------|----------|
| Pipeline pre-computes assumptions | Generic assumption extraction. | |
| Derive from valuation inputs | FGR, capex %, P/E choices. | |
| Hybrid pipeline + valuation | Both types combined. | |

**User's choice:** None of the above — redirected to Promise Tracker
**Notes:** User opened `gstack/plans/gstack-ai-agent-workflow-ceo-plan-20260323.md` and pointed to Section 7: Management Promise Tracker. Forward-looking statements from earnings calls, tagged by quarter/year, compared to actuals.

### Follow-up: Promise Tracker Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to future milestone | Keep Phase 23 focused on wiring. | |
| Replace DLT-02 with Promise Tracker | Accept bigger phase scope. | ✓ |
| Stub the UI only | Build shell, defer pipeline work. | |

**User's choice:** Replace DLT-02 with Promise Tracker
**Notes:** None

### Follow-up: Extraction Location

| Option | Description | Selected |
|--------|-------------|----------|
| Pipeline agent extracts during generation | Primary Source Reader extracts promises. | ✓ |
| Standalone engine | New promiseTracker.js outside pipeline. | |
| On-demand Claude API | Live extraction from UI. | |

**User's choice:** Pipeline agent extracts during generation
**Notes:** None

### Follow-up: Report Stage Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Pitch Deck + Full Story | Both have management sections. | |
| Full Story only | Conviction stage — credibility matters most. | ✓ |
| All 3 stages | Even OP could show credibility score. | |

**User's choice:** Full Story only
**Notes:** None

### Follow-up: UI Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Slide-out sidebar | Like AssumptionTracker pattern. | |
| Dedicated tab/section in Full Story | 7th section, integrated with nav. | ✓ |
| Floating panel (draggable) | Resizable, positionable. | |

**User's choice:** Dedicated section in Full Story
**Notes:** User wants it part of the natural report reading flow.

### Follow-up: Promise Display

| Option | Description | Selected |
|--------|-------------|----------|
| Timeline cards | Chronological cards with verdict badges. Expandable. | ✓ |
| Table format | Dense rows with columns. | |
| Grouped by category | Headers for Revenue/Strategic/Growth. | |

**User's choice:** Timeline cards
**Notes:** None

### Follow-up: Aggregate Score

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented bar + score | Same as checklist aggregate (Phase 21). KEPT/PARTIAL/BROKEN segments. | ✓ |
| Single credibility score | One number or grade. | |
| No aggregate | Just the list. | |

**User's choice:** Segmented bar + score
**Notes:** None

---

## Glossary & Term Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Static JSON dictionary | Curated ~100-200 terms. Ships with app. | |
| Pipeline generates per-report | Industry-specific terms per ticker. | ✓ |
| Hybrid static + pipeline | Universal terms + per-report additions. | |

**User's choice:** Pipeline generates per-report
**Notes:** User wanted context on what the glossary feature actually is before deciding. After explanation (dashed-underline terms in narrative with hover popover showing definition + benchmarks), chose pipeline-generated.

### Follow-up: Term Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Pipeline marks terms in narrative | Pipeline adds glossaryTerms[] per section. | ✓ |
| Client-side string matching | UI scans against dictionary. May have false positives. | |

**User's choice:** Pipeline marks terms in narrative
**Notes:** None

### Follow-up: Report Stage Scope

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 stages | Glossary on OP, PD, FS. | |
| Pitch Deck + Full Story only | Skip One Pager. | ✓ |
| Full Story only | Narrowest scope. | |

**User's choice:** Pitch Deck + Full Story only
**Notes:** None

---

## Bull/Bear Toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Reweight section emphasis | Toggle shifts visual emphasis. | |
| Swap narrative text entirely | Two complete narratives. | |
| Filter/highlight only | Color/opacity changes only. | |

**User's choice:** Skip entirely
**Notes:** "The current bull/bear debate already does this well." DebateRenderer with Bull/Bear/Rebuttal/Judge tabs (Phase 21) covers the perspective-switching need. DLT-04 deferred.

---

## Claude's Discretion

- Deep dive API prompt design
- Promise extraction prompt design
- Glossary term density limits
- "Tell me more" link styling
- Timeline card animations

## Deferred Ideas

- Bull/Bear toggle (DLT-04) — existing DebateRenderer covers it
- AssumptionTracker (original concept) — replaced by Promise Tracker
- Deep dives on One Pager
- Glossary on One Pager
- Promise Tracker on Pitch Deck
- Promise credibility feeding into Rule One Score
