# Thesis Competitors Tab — Agent-Based Implementation Spec

**Generated:** 2026-03-17 05:03 UTC

---

# Overview

This document defines a production-grade, agent-based system for:
- Competitor discovery
- Financial data extraction
- Data validation
- UI-safe rendering

It is designed to:
- Reduce missing data
- Prevent crashes
- Improve data reliability
- Scale efficiently

---

# System Architecture

Pipeline:

RAW → NORMALIZED → VALIDATED → UI

Each stage:
- Produces structured output
- Assigns confidence scores
- Logs errors

---

# Agent 1: Competitor Discovery Agent

## Role
Identify and rank relevant competitors using hybrid methods.

## Inputs
- Ticker
- Industry classification
- Segment revenue data
- Business descriptions

## Workflow
1. Extract SIC/NAICS
2. Parse segment revenue (XBRL)
3. Generate embeddings from business descriptions
4. Compute similarity (cosine similarity)
5. Build peer graph
6. Rank competitors

## Output Schema
```json
{
  "competitors": [
    {
      "ticker": "AAPL",
      "similarity_score": 0.87,
      "confidence": 0.82
    }
  ]
}
```

## Validation
- Flag low-confidence clusters
- Compare against known peer sets (if available)

---

# Agent 2: Financial Extraction Agent

## Role
Parse and normalize financial data from XBRL.

## Workflow
1. Parse XBRL
2. Map to canonical schema
3. Apply fallback logic
4. Output normalized dataset

## Canonical Mapping Example
- Revenue → us-gaap:Revenue, us-gaap:SalesRevenueNet
- Operating Income → derived if missing

## Output Schema
```json
{
  "metric": "Revenue",
  "value": 1000000,
  "confidence": 0.95,
  "source": "xbrl"
}
```

## Missing Data Handling
```json
{
  "value": null,
  "reason": "missing_tag",
  "confidence": 0.3
}
```

---

# Agent 3: Data Validation Agent

## Role
Ensure correctness, completeness, and consistency.

## Checks
- Revenue > 0
- Margins within bounds
- YoY sanity checks

## Cross Validation
- Compare computed vs parsed values

## Output
```json
{
  "completeness_score": 0.82,
  "reliability_score": 0.76,
  "missing_fields": [],
  "anomalies": []
}
```

---

# Agent 4: Rendering Agent

## Role
Prepare safe UI output.

## Responsibilities
- Limit dataset size
- Lazy load competitors
- Replace missing values with placeholders
- Prevent crashes

## Rules
- UI never accesses raw data
- Only validated datasets are used

---

# Bug Prevention Program

## 1. Pre-Execution Guards
- Ensure filing exists
- Check required tags
- Route to fallback if missing

## 2. Multi-Pass Validation
RAW → NORMALIZED → VALIDATED → UI

## 3. Error Typing System
- PARSE_ERROR
- MISSING_TAG
- DERIVATION_ERROR
- TIMEOUT
- OVERFLOW

## 4. Retry Strategy
1. Alternate tags
2. Derived metrics
3. Cached fallback

## 5. Data Load Controls
- Max competitors (e.g. 20)
- Pagination
- Async loading

## 6. Confidence-Based Rendering
- Hide or flag low-confidence data

---

# Key Design Principles

- Never return silent nulls
- Treat missing data as explicit signal
- Normalize aggressively
- Precompute where possible

---

# Questions for Claude (Implementation Clarifications)

1. How are competitors currently defined?
   - Static list, SIC-based, or dynamic?

2. Where does parsing occur?
   - Backend, frontend, or agent-driven?

3. Is there a canonical metric schema already implemented?

4. Is parsed data cached or recomputed per request?

5. What are the primary failure modes?
   - Missing fields, slow load, UI crashes?

---

# End of Spec
