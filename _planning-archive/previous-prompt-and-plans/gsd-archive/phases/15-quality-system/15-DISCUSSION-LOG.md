# Phase 15: Quality System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 15-quality-system
**Areas discussed:** Checklist methodology approach, Completeness formula adjustment, Debate methodology scope, Non-standard verdict handling
**Mode:** --auto (recommended defaults selected, then user requested manual continuation)

---

## Pre-Discussion (Conversational)

Before invoking /gsd:discuss-phase, the user and Claude had a detailed conversation covering all Phase 15 angles. The auto-mode selections below reflect decisions aligned in that conversation.

---

## Checklist Methodology Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Data field only (structural) | Check item counts, verdicts, evidence in structured data | |
| Narrative only (regex) | Check methodology terms in prose, like Pitch Deck | |
| Both (structural + content) | Structural feeds mechanical score, narrative feeds methodology score | Yes |

**User's choice:** Both -- structural checks on data for mechanical, regex on narrative for methodology
**Notes:** Preserves the two-score separation proven in Pitch Deck. Checklist items have structured data that deserves its own checks beyond just narrative.

---

## Completeness Formula Adjustment

| Option | Description | Selected |
|--------|-------------|----------|
| Keep uniform weights | Same 40/25/20/15 formula for all section types | |
| Adjust per section type | Checklist: data 40%, narrative 15%. Debate/standard: current weights | Yes |
| Separate formulas | Completely different scoring per type | |

**User's choice:** Adjust per section type
**Notes:** Checklist sections' value is in their structured data field (15 items with verdicts/evidence), not narrative length. Debate sections have 35K-char narratives so current weights work fine.

---

## Debate Methodology Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Process rigor only | Check coverage, citations, honesty -- not outcome | Yes |
| Outcome quality | Penalize high unresolved counts | |
| Both process + outcome | Combined scoring | |

**User's choice:** Process rigor only
**Notes:** An honest "5 unresolved risks" is higher quality than a rubber-stamp "0 unresolved" with thin evidence. Real hedge fund quality is about the rigor of the investigation, not the outcome.

---

## Non-Standard Verdict Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Reject non-standard | Flag as high-severity issue | |
| Accept with mapping | Map CONTEXT->PARTIAL, WATCHLIST->PARTIAL, flag as low-severity | Yes |
| Accept silently | Treat all non-standard as PARTIAL, no flag | |

**User's choice:** Accept with mapping
**Notes:** Real SFM Management checklist has CONTEXT and WATCHLIST verdicts. Agent output polymorphism is a known pattern (feedback memory). Critic must be robust to variation.

---

## Claude's Discretion

- Exact regex patterns for all 33 methodology checks
- Polymorphic data parsing helpers
- Test file strategy (extend existing vs new file)
- qualityFormatter.js rendering for checklist/debate sections

## Deferred Ideas

- AI evaluator agent (~$2-3/eval) -- deeper quality analysis beyond regex
- Cross-stage inheritance checks -- defer to Phase 17
- Quality dashboard in UI -- deferred from Phase 05D
