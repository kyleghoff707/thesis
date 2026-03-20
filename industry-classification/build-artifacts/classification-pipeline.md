# Thes1s Classification Pipeline
**Date**: 2026-03-17
**Status**: Design Complete — Implementation Pending

---

## Overview

This pipeline classifies ~8,000 actively traded US public companies into the Thes1s 3-tier taxonomy (Sector > Industry Group > Industry). It uses a multi-step approach, starting with freely available data (Yahoo Finance + SIC codes) and progressively refining with NLP analysis of SEC filings.

Each company gets:
- A Thes1s 8-digit classification code
- A confidence score (0.0 - 1.0)
- Source attribution (which step assigned the classification)
- Date of last classification

---

## Pipeline Steps

### Step 1 — Build the Universe (EDGAR Ticker Index)

**Source**: SEC EDGAR `company_tickers.json`
**URL**: `https://www.sec.gov/files/company_tickers.json`
**What it provides**: All SEC filers with CIK, ticker, and company name (~13,000 entries)

**Process**:
1. Download `company_tickers.json`
2. Filter to common equity tickers:
   - Exclude warrants (ticker ends with 'W' or 'WS')
   - Exclude units (ticker ends with 'U')
   - Exclude preferred stock (ticker ends with 'P' followed by letter)
   - Exclude rights (ticker ends with 'R' or 'RT')
   - Exclude class designators with low liquidity
3. Cross-reference with major exchange listings (NYSE, NASDAQ, AMEX)
4. Result: ~6,000-8,000 actively traded common stock tickers

**Output**: `universe.json` — list of { cik, ticker, name } for all companies to classify

**Runtime**: < 1 minute (single HTTP request + filtering)

### Step 2 — Seed from Yahoo Finance (Primary Classification)

**Source**: Yahoo Finance `quoteSummary` API via `yahoo-finance2` npm package
**What it provides**: `sector` and `industry` labels per ticker (Morningstar taxonomy)

**Process**:
1. For each ticker in universe.json:
   - Call `yf.quoteSummary(ticker, { modules: ['assetProfile'] })`
   - Extract `assetProfile.sector` and `assetProfile.industry`
2. Map Yahoo sector+industry to Thes1s code via `yahoo-to-thes1s-crosswalk.json`
3. Assign confidence based on mapping quality:
   - Direct 1:1 mapping → confidence 0.85
   - Ambiguous mapping (Yahoo industry maps to multiple Thes1s industries) → confidence 0.65
   - Yahoo returns null/empty → skip, fall through to Step 3

**Rate Limiting**:
- yahoo-finance2 handles crumb/cookie auth automatically
- Batch in groups of 50 tickers
- 500ms delay between batches
- Estimated total time: ~8,000 tickers / 50 per batch / 2 per second = ~80 batches = ~40 seconds for requests, plus latency = ~10-15 minutes total
- Note: If Yahoo rate-limits more aggressively, may need to slow to 1 request/second. Worst case: ~2-3 hours.

**Output**: Each company gets `{ thes1sCode, confidence: 0.85, source: 'yahoo', yahooSector, yahooIndustry, assignedDate }`

**Expected Coverage**: ~85-90% of universe (Yahoo covers most listed equities)

### Step 3 — Fallback from SIC Codes (Secondary Classification)

**Source**: SEC EDGAR `submissions/{CIK}.json` → `sic` field
**Applies to**: Companies NOT classified in Step 2 (Yahoo returned null)

**Process**:
1. For each unclassified company, fetch SIC code from EDGAR submissions
2. Map SIC code through `sic-to-thes1s-crosswalk.json` → Thes1s code
3. Assign confidence:
   - 4-digit SIC with direct mapping → confidence 0.5
   - 2-digit SIC major group fallback → confidence 0.3
   - No SIC match → confidence 0.1, assign to Special Classifications > Shell Companies

**Rate Limiting**: SEC EDGAR 10 req/sec with User-Agent header. For bulk, download `submissions.zip` instead.

**Output**: Each company gets `{ thes1sCode, confidence: 0.3-0.5, source: 'sic', sicCode, assignedDate }`

**Expected Coverage**: Catches remaining 10-15% of universe

### Step 4 — Cross-Reference Validation

**Process**: For companies classified by BOTH Yahoo (Step 2) and SIC (Step 3):
1. Compare Yahoo-derived Thes1s code vs SIC-derived Thes1s code
2. If they agree at Industry Group level → boost confidence to 0.95
3. If they agree at Sector level but disagree at Industry Group → keep Yahoo classification, confidence 0.80
4. If they disagree at Sector level → flag for review, confidence 0.40

**Output**: Updated confidence scores. Flagged companies list for Step 5.

### Step 5 — NLP Classification via 10-K Analysis (Future Enhancement)

**Source**: SEC EDGAR 10-K filings, Item 1 (Business Description)
**Applies to**: Flagged companies from Step 4 (sector-level disagreements)
**Status**: NOT IMPLEMENTED — requires Claude API integration

**Proposed Process**:
1. Fetch latest 10-K for each flagged company via EDGAR
2. Extract Item 1 (Business Description) — first 2,000 words
3. Send to Claude API with classification prompt:
   ```
   Given this company's business description, classify it into the Thes1s taxonomy.
   Choose the most appropriate industry from the following list: [all ~150 industries with definitions]
   Return: { thes1sCode, reasoning }
   ```
4. If AI classification agrees with Yahoo → accept Yahoo classification, boost confidence
5. If AI classification agrees with SIC → accept SIC classification
6. If AI suggests a third option → add to review queue

**Estimated Cost**: ~$0.02-0.05 per company (claude-sonnet-4-20250514, ~2K input + 200 output tokens). For ~500 flagged companies: ~$10-25.

### Step 6 — Revenue Segment Analysis (Future Enhancement)

**Source**: SEC EDGAR 10-K revenue segment disclosures
**Applies to**: Companies flagged as conglomerates or multi-segment
**Status**: NOT IMPLEMENTED

**Proposed Process**:
1. Identify companies with segment disclosures (XBRL tag: `SegmentReportingDisclosure`)
2. Extract segment names and revenue amounts
3. Map each segment to a Thes1s industry
4. Store primary classification (largest segment) + secondary classifications (other segments with revenue %)

### Step 7 — Agent Review Queue (Future Enhancement)

**Applies to**: Companies with confidence < 0.5 after all automated steps
**Status**: NOT IMPLEMENTED — requires UI in Audit tab

**Proposed Process**:
1. Present company in Thes1s Audit tab with:
   - Company name and ticker
   - SIC code and description
   - Yahoo sector/industry
   - AI suggestion (if available)
   - Current confidence score
   - Link to 10-K filing
2. User reviews and manually selects correct Thes1s classification
3. Manual assignments get confidence 1.0 and source 'manual'

---

## Confidence Score Definitions

| Score Range | Meaning | Source |
|-------------|---------|--------|
| 0.95 - 1.00 | Very High — Yahoo + SIC agree, or manually verified | Cross-reference or manual |
| 0.80 - 0.94 | High — Yahoo classification, same sector as SIC | Yahoo primary |
| 0.65 - 0.79 | Medium — Yahoo classification, ambiguous mapping | Yahoo with caveat |
| 0.40 - 0.64 | Low — SIC-only, or Yahoo/SIC disagree at sector level | SIC fallback or flagged |
| 0.10 - 0.39 | Very Low — SIC major group fallback only | SIC 2-digit |
| 0.00 - 0.09 | Unclassified — no data available | Default/shell |

---

## Output File: thes1s-company-assignments.json

```json
{
  "metadata": {
    "version": "1.0.0",
    "generatedDate": "2026-03-17",
    "totalCompanies": 7842,
    "pipeline": {
      "step2_yahoo": 6700,
      "step3_sic": 890,
      "step4_crossref_boosted": 5200,
      "step5_nlp": 0,
      "step6_segments": 0,
      "step7_manual": 0,
      "unclassified": 252
    }
  },
  "assignments": {
    "0000320193": {
      "ticker": "AAPL",
      "name": "Apple Inc.",
      "thes1sCode": "10201020",
      "sector": "Technology",
      "industryGroup": "Hardware",
      "industry": "Computer Hardware",
      "confidence": 0.95,
      "source": "yahoo+sic",
      "yahooSector": "Technology",
      "yahooIndustry": "Consumer Electronics",
      "sicCode": "3571",
      "assignedDate": "2026-03-17",
      "flags": []
    },
    "0001018724": {
      "ticker": "AMZN",
      "name": "Amazon.com Inc.",
      "thes1sCode": "20301010",
      "sector": "Consumer Cyclical",
      "industryGroup": "Retail",
      "industry": "Retail - Broadline / E-Commerce",
      "confidence": 0.80,
      "source": "yahoo",
      "yahooSector": "Consumer Cyclical",
      "yahooIndustry": "Internet Retail",
      "sicCode": "5961",
      "assignedDate": "2026-03-17",
      "flags": ["multi-segment", "conglomerate"]
    }
  }
}
```

---

## Intermediate Persistence & Crash Recovery

Each pipeline step persists its output to a separate JSON file before the next step begins. This allows restarting from any step if the pipeline fails mid-run.

| Step | Intermediate Output File | Description |
|------|--------------------------|-------------|
| Step 1 | `pipeline/universe.json` | Filtered ticker list (~8,000 entries) |
| Step 2 | `pipeline/yahoo-seed.json` | Yahoo sector/industry per ticker + mapped Thes1s codes |
| Step 3 | `pipeline/sic-fallback.json` | SIC-based classifications for tickers Yahoo missed |
| Step 4 | `pipeline/cross-reference.json` | Merged + boosted results from Steps 2-3 |
| Final | `thes1s-company-assignments.json` | Canonical output — merged from all steps |

**How crash recovery works**:
- Before starting a step, check if its output file already exists. If yes, skip to the next step.
- To force a re-run of a step, delete its output file (or pass a `--force-step N` flag).
- Each intermediate file includes a `completedAt` timestamp and `itemCount` so you can verify it's complete (not a partial write from a crash).
- Step 2 (Yahoo batch fetch) is the most crash-prone due to rate limiting. It should persist results incrementally — write every 100 tickers to disk so a crash only loses the last batch, not the whole run.

---

## Maintenance Protocol

### New IPOs
- **Detection**: Compare EDGAR ticker index against current universe weekly
- **Classification**: Run Steps 2-4 for new tickers
- **Timeline**: Classify within 1 week of listing

### Delistings
- **Detection**: Ticker disappears from EDGAR index or Yahoo returns delisted status
- **Action**: Mark as `isDelisted: true` in assignments. Keep for historical reference.

### M&A / Acquisitions
- **Detection**: Target company filings cease + 8-K acquisition announcement
- **Action**: Remove target from active assignments. Update acquirer's classification if business model changes significantly.

### Business Model Pivots
- **Detection**: Quarterly comparison of Yahoo sector/industry vs stored classification
- **Trigger**: If Yahoo reclassifies a company, flag for review
- **Action**: Re-run Step 2 + Step 4 for flagged companies quarterly

### Taxonomy Structure Updates
- **Frequency**: As needed (new industries emerge, markets evolve)
- **Process**: Manual only — add new industries, update crosswalks, reclassify affected companies
- **Example**: If "Quantum Computing" becomes a viable industry with 5+ public companies, add it under Technology > Software or create a new Industry Group

---

## Estimated Timeline

| Step | Effort | Dependencies | Status |
|------|--------|-------------|--------|
| Step 1 (Universe) | 30 minutes | None | Ready to implement |
| Step 2 (Yahoo Seed) | 2-4 hours (mostly runtime) | Crosswalk files | Ready to implement |
| Step 3 (SIC Fallback) | 1 hour | Crosswalk files | Ready to implement |
| Step 4 (Cross-Reference) | 30 minutes | Steps 2+3 complete | Ready to implement |
| Step 5 (NLP) | 1-2 sessions | Claude API integration | Future |
| Step 6 (Segments) | 2-3 sessions | XBRL parsing | Future |
| Step 7 (Review Queue) | 1 session | Audit UI | Future |
