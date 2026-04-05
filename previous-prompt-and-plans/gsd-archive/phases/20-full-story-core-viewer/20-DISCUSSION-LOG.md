# Phase 20: Full Story Core Viewer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 20-full-story-core-viewer
**Areas discussed:** Quality Score Display, Hero Header Content, Section Content Depth, Overall Verdict Source

---

## Quality Score Display

### Q1: How should quality scores appear on each section card?

| Option | Description | Selected |
|--------|-------------|----------|
| Header badges | Small pill badges next to section title (e.g., "Mech 100 · Method 100"). Compact, always visible. | ✓ |
| Score bar below title | Thin horizontal gradient bar under each section title. More scannable but more vertical space. | |
| Hover tooltip only | Clean cards, hover for details. Minimal noise but requires interaction. | |
| You decide | Claude picks best approach. | |

**User's choice:** Header badges (Recommended)
**Notes:** None

### Q2: Where should the overall aggregate quality score appear?

| Option | Description | Selected |
|--------|-------------|----------|
| In the hero header | Overall quality score (e.g., "Quality: 94/100") alongside verdict and confidence. | ✓ |
| Sticky nav subtitle | Quality score below the sticky section nav bar. | |
| Both hero + nav | Redundant display in both locations. | |

**User's choice:** In the hero header (Recommended)
**Notes:** None

### Q3: Should quality scores use color coding?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, traffic light | Green (90+), yellow/amber (70-89), red (<70). | ✓ |
| Neutral teal only | All scores in teal regardless of value. | |
| You decide | Claude picks based on palette. | |

**User's choice:** Yes, traffic light (Recommended)
**Notes:** None

---

## Hero Header Content

### Q4: What should anchor the Full Story hero header?

| Option | Description | Selected |
|--------|-------------|----------|
| Judge verdict banner | Use debateOutputs.judge.content.overallVerdict as hero. Direction + summary + implication. | ✓ |
| Consensus from sections | Aggregate 6 section verdicts mechanically. | |
| Minimal — ticker + quality only | Just ticker, company name, quality score, timestamp. | |

**User's choice:** Judge verdict banner (Recommended)
**Notes:** None

### Q5: Should the hero include a summary quote from the judge?

| Option | Description | Selected |
|--------|-------------|----------|
| Both summary + investmentImplication, stacked | Summary as blurb, then investmentImplication as callout box. | ✓ |
| Summary only | Just the analytical summary excerpt. | |
| Investment implication only | Skip analysis, go straight to action item. | |

**User's choice:** Both, stacked (Recommended)
**Notes:** None

---

## Section Content Depth

### Q6: How much section content should FullStory.jsx render?

| Option | Description | Selected |
|--------|-------------|----------|
| Full narrative + key extras | Full narrative + red flags + data grids + citations via SectionRenderer. | |
| Narrative only | Just markdown narrative per section. | |
| Match OnePager/PitchDeck exactly | Whatever SectionRenderer shows for those stages. | |

**User's choice:** Other — "Include all of it. The primarySourceInsights and the searchesPerformed."
**Notes:** User clarified that all data should be visible including primarySourceInsights and searchesPerformed. Quote: "adds a nice compliance layer for users." The whole point of R1 research is depth — nothing should be excluded.

---

## Overall Verdict Source

### Q7: How should the hero source the overall verdict?

| Option | Description | Selected |
|--------|-------------|----------|
| Read directly from debateOutputs | Pull from debateOutputs.judge.content.overallVerdict. Fall back to section verdicts if missing. | ✓ |
| Compute from section verdicts | Aggregate 6 section verdicts mechanically. | |
| Both — judge primary, computed fallback | Judge when available, computed as fallback. | |

**User's choice:** Read directly from debateOutputs (Recommended)
**Notes:** None

### Q8: Show both summary and investmentImplication in hero?

| Option | Description | Selected |
|--------|-------------|----------|
| Both, stacked | Summary blurb + investmentImplication callout box. | ✓ |
| Summary only | Compact hero, implication in Section 6. | |
| Investment implication only | Action item first, reasoning in sections. | |

**User's choice:** Both, stacked (Recommended)
**Notes:** None

---

## Claude's Discretion

- Sticky nav implementation details
- Loading/error/empty state patterns
- useFullStory hook polling behavior
- Layout proportions and spacing

## Deferred Ideas

None — discussion stayed within phase scope
