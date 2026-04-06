# Phase 1: Comparison Harness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 01-comparison-harness
**Areas discussed:** Existing Scripts, Fiscal Year Strategy, Field Mapping Design, Output Format

---

## Existing Scripts

| Option | Description | Selected |
|--------|-------------|----------|
| Copy and fix | Bring old scripts over, fix known bugs | |
| Start fresh | Build new all-JS pipeline from scratch | |
| Copy as reference only | Bring for reference, build new alongside | ✓ |

**User's choice:** Copy as reference only
**Notes:** Old scripts had structural issues (mixed Python/JS, buggy FY alignment). Copied to `validation/scripts/reference/` for context.

**Follow-up: Copy scripts now?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, copy them now | Copy to validation/scripts/reference/ | ✓ |
| No, I'll share when needed | Paste relevant parts later | |

**User's choice:** Yes, copy them now

---

## Fiscal Year Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| EDGAR FY-end resolver | Deterministic resolver using entityFiscalYearEnd | |
| Per-source offset table | Hard-code known offsets per source | |
| You decide | Claude picks best approach | ✓ |

**User's choice:** You decide (Claude's discretion)
**Notes:** Claude will choose the best approach based on existing codebase. EDGAR entityFiscalYearEnd is the likely primary resolver.

---

## Field Mapping Design

**Structure question:**

| Option | Description | Selected |
|--------|-------------|----------|
| Single JSON config | One field-mapping.json for all sources | ✓ |
| Per-source adapters | Separate adapter modules per source | |
| You decide | Claude picks | |

**User's choice:** Single JSON config

**Unmapped fields question:**

| Option | Description | Selected |
|--------|-------------|----------|
| Ignore for now | Focus on 87 mapped fields | |
| Map the important ones | Identify relevant ones manually | |
| You decide | Claude categorizes and recommends | ✓ |

**User's choice:** You decide (Claude's discretion)

---

## Output Format

**Format question:**

| Option | Description | Selected |
|--------|-------------|----------|
| Console summary + JSON detail | Clean console + detailed JSON | ✓ |
| Markdown report | .md report with tables | |
| Both | Console + markdown + JSON | |

**User's choice:** Console summary + JSON detail

**Granularity question:**

| Option | Description | Selected |
|--------|-------------|----------|
| Company score + top 3 failures | Quick to scan | ✓ |
| Full field-by-field diff | Comprehensive but verbose | |
| Tiered (summary + --verbose) | Default summary, flag for detail | |

**User's choice:** Company score + top 3 failures

---

## Claude's Discretion

- Fiscal year alignment implementation approach
- Unmapped field categorization and mapping priority
- All technical implementation details

## Deferred Ideas

None
