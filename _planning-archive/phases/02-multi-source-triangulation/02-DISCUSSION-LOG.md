# Phase 2: Multi-Source Triangulation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 02-multi-source-triangulation
**Areas discussed:** Rate Limit Strategy, mstarpy Integration, Consensus Logic, Root Cause Auto-Tagging

---

## Rate Limit Strategy

**FMP cache TTL:**

| Option | Description | Selected |
|--------|-------------|----------|
| Aggressive disk cache | Cache forever, never re-fetch unless manually cleared | |
| Time-based cache | Cache for 7 days, auto-refresh | ✓ |
| You decide | Claude picks | |

**User's choice:** Time-based (7 days) — in case companies report earnings during buildout.
**Notes:** User commented: "if we haven't done this in a week we're doing our jobs wrong"

**Fetch order:**

| Option | Description | Selected |
|--------|-------------|----------|
| All 50 at once | Single run, ~150 FMP calls | ✓ |
| Incremental batches | 10 per run over 5 days | |
| You decide | | |

**User's choice:** All 50 at once

---

## mstarpy Integration

**Bridge approach:**

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-fetch to JSON | Python script saves to JSON, JS reads cached files | ✓ |
| Subprocess bridge | JS spawns Python per ticker at runtime | |
| You decide | | |

**User's choice:** Pre-fetch to JSON

**Fragility fallback:**

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful degradation | Missing mstarpy = triangulate with FMP + SimFin only | ✓ |
| Hard requirement | Require all sources or block | |
| You decide | | |

**User's choice:** Graceful degradation

---

## Consensus Logic

**Agreement threshold:**

| Option | Description | Selected |
|--------|-------------|----------|
| Within 1% | Sources within 1% of each other "agree" | ✓ |
| Same tolerance tiers as Phase 1 | Use 5-tier system | |
| You decide | | |

**User's choice:** Within 1% (after explanation with AAPL Revenue + Other Non-Cash Items examples)
**Notes:** User initially said "not sure where to go with this one" — Claude explained with concrete examples, user then approved the recommended approach.

**Partial data handling:**

| Option | Description | Selected |
|--------|-------------|----------|
| 2-source = LIKELY_BUG | Lower confidence, still flag | ✓ |
| Require 3 sources | Only flag with 3-source consensus | |
| You decide | | |

**User's choice:** 2-source = LIKELY_BUG (after explanation)

---

## Root Cause Auto-Tagging

| Option | Description | Selected |
|--------|-------------|----------|
| Pattern matching | Deterministic rules: sign_flip, fy_offset, scale_error, tag_miss, derivation_error | ✓ |
| AI-assisted | Use Claude API for ambiguous cases | |
| You decide | | |

**User's choice:** Pattern matching
**Notes:** User pointed to `knowledge-ref/intel-reports/` and `knowledge-ref/engineering/edgar-xbrl-taxonomy.md` as reference material from attempts 1 and 2. Added as canonical refs.

---

## Claude's Discretion

- SimFin bank/insurance template field mapping
- FMP field name mapping specifics
- mstarpy Python pre-fetch script structure
- fix-recommendations.json structure
- EODHD usage decision

## Deferred Ideas

- EODHD as 4th triangulation source
- AI-assisted root cause analysis for ambiguous cases
