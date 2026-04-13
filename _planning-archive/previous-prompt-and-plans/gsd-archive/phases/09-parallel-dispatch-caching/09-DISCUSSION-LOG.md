# Phase 9: Parallel Dispatch & Caching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 09-parallel-dispatch-caching
**Areas discussed:** Concurrency strategy, Cache architecture, Budget tracker upgrade, Manager interface

---

## Concurrency Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| All 10 at once | Fastest wall-clock, let retry handle throttling | |
| Two waves of 5 | Safer on rate limits | |
| Configurable concurrency limit | Default 5, user can tune | |
| Parallel within waves, sequential between | Preserve dispatch-table.json wave dependencies | ✓ |

**User's choice:** Parallel within waves, sequential between waves
**Notes:** User initially asked to understand the existing pitch deck order of operations. After reviewing dispatch-table.json, it was clear that waves exist for dependency reasons (PSR must run first, section 4 needs Wave 1 context, sections 9-10 need full context). User chose to preserve wave sequencing for report quality while parallelizing within each wave. Rate limits are not a practical concern at 10 requests.

---

## Cache Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Universal context + PSR prefix cached | Stack shared content first, agent-specific after | ✓ |
| Per-agent caching | Each agent caches its own curriculum | |
| No caching | Simpler but 10x cost on shared context | |

**User's choice:** Universal context + PSR findings as cached prefix, agent-specific content after
**Notes:** Straightforward approach. Universal context (Rule One fundamentals) and PSR findings are identical across all agents — caching them saves significant cost on agents 2-10 within each wave.

---

## Budget Tracker Upgrade

| Option | Description | Selected |
|--------|-------------|----------|
| Replace with actuals only | Record real API usage, no pre-flight estimates | ✓ |
| Keep both estimates and actuals | Pre-flight for cost preview, actuals for reporting | |
| Actuals only, ditch pre-flight | Already know approximate costs from testing | ✓ |

**User's choice:** Actuals only, ditch pre-flight estimates
**Notes:** User preferred simplicity. Pipeline cost is already known from testing (~$5-8). Pre-flight estimation not worth the complexity.

---

## Manager Interface

| Option | Description | Selected |
|--------|-------------|----------|
| Single function, aggregated result | Returns finished product, no intermediate visibility | |
| Single function, per-wave callbacks | onWaveComplete callback for progress + PM review | ✓ |

**User's choice:** Per-wave callbacks with PM review pause
**Notes:** User emphasized that intermediate visibility ensures accurate results. PM can actively assess quality during generation — approve, provide corrections, supply additional data, or ask for changes before the next wave fires. Matches the hedge fund model: PM reviews analyst work at each milestone.

---

## Claude's Discretion

- onWaveComplete callback payload structure
- PSR parallel vs sequential execution
- How PM feedback gets incorporated into subsequent wave context
- Cache monitoring implementation details

## Deferred Ideas

- Streaming progress UI (out of scope per REQUIREMENTS.md)
- Configurable concurrency limit (add later if needed)
- Pre-flight cost estimation (ditched for simplicity)
