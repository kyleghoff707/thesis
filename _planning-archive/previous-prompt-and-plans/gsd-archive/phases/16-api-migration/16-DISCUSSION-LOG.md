# Phase 16: API Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 16-api-migration
**Areas discussed:** Debate dispatch architecture, S6 composition strategy, Cost management, Quality parity validation

---

## Debate Dispatch Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Extend pipelineManager (Recommended) | Add `if (wave.isDebate)` branch for sequential steps. Keeps all dispatch in one file. | ✓ |
| Separate debateDispatcher.js | New file for debate orchestration. Cleaner separation but duplicates plumbing. | |
| You decide | Claude's discretion | |

**User's choice:** Extend pipelineManager
**Notes:** None — straightforward decision to keep dispatch logic consolidated.

---

## S6 Composition Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 5th AI call — synthesis-writer (Recommended) | Matches CC pattern (91/100 quality). Extra ~$0.50-1 cost. | ✓ |
| Deterministic code composition | Concatenate + aggregate programmatically. Cheaper but lower narrative quality. | |
| Hybrid — code for data, AI for narrative | Code computes structure, AI generates prose. More complex. | |

**User's choice:** 5th AI call — synthesis-writer
**Notes:** Preserves the proven CC quality pattern.

---

## Cost Management

| Option | Description | Selected |
|--------|-------------|----------|
| Raise ceiling to $15 (Recommended) | $15 for 3 stages of hedge-fund-grade analysis is still a fraction of 70+ hours manual work. | ✓ |
| Optimize to stay under $12 | Use Sonnet everywhere except bear. Cut synthesis call. Risk quality regression. | |
| Two-tier pricing | Quick mode (~$8) vs Deep mode (~$15). More complexity. | |

**User's choice:** Raise ceiling to $15
**Notes:** Original $8-12 target was set before Full Story scope was clear.

---

## Quality Parity Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Re-run SFM, compare scores (Recommended) | Same validation pattern as Pitch Deck migration. Accept within 5 points of CC baseline. | ✓ |
| Auto quality after every run | Integrate scorer into pipeline. More infrastructure. | |
| Defer to Phase 17 | Do quality comparison in E2E validation phase instead. | |

**User's choice:** Re-run SFM, compare scores
**Notes:** Quality validation within Phase 16, not deferred.

---

## Claude's Discretion

- Model selection per agent/step (Opus vs Sonnet)
- DebateStepSchema Zod definition
- max_tokens per step
- Cache strategy for debate context passing

## Deferred Ideas

None
