# Phase 11: Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 11-validation
**Areas discussed:** Quality scoring calibration, Methodology scoring, Validation strategy

---

## Pre-Discussion: V4 Quality Report

Ran quality check on V4 API pipeline output (SFM). Initial score was 9/100 due to missing DataPacket — copied V3's data-packet.json back (same ticker, same engines). Re-scored at 87/100.

Discovered bug: `resolveDataPath` in critic.js couldn't handle array bracket notation (`gurus.holdings[0].guru.name`). Fixed with bracket-to-index splitting. Management section went from 0 (14 high-severity) to 77 (0 high).

**Final V4 score: 94/100, all 11 sections pass, zero high-severity issues.**

---

## Quality Scoring — Beyond Mechanical Compliance

| Option | Description | Selected |
|--------|-------------|----------|
| Option A: Rubric-based scoring (automated) | Extend critic.js with Rule One methodology checks — keyword/element detection per section | |
| Option B: PM evaluation checklist (manual) | Structured checklist the PM works through when reading output — judgment-based quality bar | |
| Option C: AI evaluator agent | Critic agent reads sections with curriculum, scores methodology. ~$2-3/eval | |
| Hybrid: A now, B ongoing, C later | Build automated checks now, PM evaluates as reports are generated, AI evaluator when satisfied with quality | ✓ |

**User's choice:** All three are good, but AI evaluator is deferred. Build A now, follow B as pipeline develops. Implement light AI evaluator later when significantly satisfied with output quality — focused on catching hallucinations.

---

## Methodology Score Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Light | Keyword detection — does the section mention FGR, MOS, etc.? | |
| Medium | Structural checks — are all 5 FGR inputs present with values? All 4 methods computed? | ✓ |
| Deep | Qualitative checks — do FGR inputs cite different sources? Conservative estimates used? | |

**User's choice:** Medium depth. Specific enough to catch skipped steps, not so granular it requires prose parsing.

---

## Score Separation

| Option | Description | Selected |
|--------|-------------|----------|
| Blended | Single overall score combining mechanical + methodology | |
| Separate | Two independent scores — mechanical (pipeline health) vs methodology (analysis quality) | ✓ |

**User's choice:** Separate scores. Don't muddy the water — different concerns, different remediation paths.

---

## Validation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Rerun SFM with filing content | Re-validate SFM with the Phase 10 filing content fix | |
| Accept current score, move to second ticker | SFM already scores 94, validate filing fix on the second ticker | ✓ |

**User's choice:** No need to burn $10 re-validating what already scores 94. Filing content fix gets validated on the second ticker run.

---

## Claude's Discretion

- Exact methodology checklist items per section
- Weighting of critical vs supplementary elements
- Second ticker selection
- Test file structure

## Deferred Ideas

- AI evaluator agent — implement later when PM is satisfied with quality, focused on hallucination detection
- UI integration + delight features — v1.2 milestone
- One Pager simplification — v1.2 milestone
- Full Story pipeline — v1.2 milestone
