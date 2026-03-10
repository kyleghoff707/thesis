
# Morningstar Financial Statements: "As Originally Reported" vs "Restated"

## Overview

Morningstar provides two versions of historical financial statements:

1. **As Originally Reported**
2. **Restated**

Both originate from the same source — **SEC EDGAR filings** — but they represent **two different interpretations of the financial history of a company**.

Understanding the difference is critical when building a financial data engine based on EDGAR XBRL data.

---

# 1. As Originally Reported

## Definition

**As Originally Reported** financial statements represent the numbers **exactly as they appeared in the company’s filings at the time they were filed** with the SEC.

They are taken directly from:

- 10‑K filings
- 10‑Q filings
- EDGAR XBRL data

Morningstar does **minimal transformation** to these numbers.

These statements reflect the **true historical record of reporting**.

---

## Characteristics

### 1. Numbers match the original SEC filings

For example:

| Year | Revenue |
|-----|--------|
| 2018 | $265.6B |
| 2019 | $260.1B |

If the company later restates the 2018 numbers, the **original version will still show the old value**.

---

### 2. No retroactive adjustments

If a company later:

- changes accounting policies
- restates revenue
- reclassifies operating expenses

those changes **do not affect the original statements**.

The numbers remain exactly as originally filed.

---

### 3. Best representation of raw EDGAR data

For systems that rely on **XBRL extraction**, the *As Reported* version is usually closest to what you will see in the EDGAR API.

---

### 4. Useful for forensic analysis

Analysts sometimes prefer this version because it shows:

- what management originally reported
- whether restatements occurred later

---

# 2. Restated Financial Statements

## Definition

**Restated financial statements adjust historical numbers to reflect the most recent accounting presentation**.

Morningstar retroactively applies corrections and classification changes to earlier periods.

This creates a **consistent time series of financial data**.

---

## Why Restatements Occur

Companies restate financials for several reasons.

### 1. Accounting Standard Changes

Example:

**ASC 606 Revenue Recognition (2018)**

Companies changed how revenue was recognized.

Many companies restated earlier years to match the new standard.

---

### 2. Error Corrections

Example:

- revenue recognized incorrectly
- expenses misclassified
- inventory accounting errors

The company may revise several prior years.

---

### 3. Segment Reclassification

Companies often reorganize business segments.

When this happens they sometimes restate prior periods so comparisons remain valid.

---

### 4. Mergers and acquisitions

Large acquisitions can cause:

- pro‑forma restatements
- reclassification of expenses
- goodwill adjustments

---

### 5. Balance sheet restructuring

Examples include:

- operating leases moved to liabilities (ASC 842)
- pension accounting changes
- tax law changes

---

# 3. Example

Imagine a company reported:

| Year | Revenue (Original) |
|----|----|
| 2020 | $100 |
| 2021 | $110 |
| 2022 | $120 |

Later they discover a revenue recognition issue.

They restate 2020 and 2021.

Restated version:

| Year | Revenue (Restated) |
|----|----|
| 2020 | $95 |
| 2021 | $105 |
| 2022 | $120 |

The **original version remains unchanged**, but the **restated version reflects corrected history**.

---

# 4. Why Morningstar Provides Both

Morningstar serves two different analytical needs.

## Original Statements

Best for:

- forensic accounting
- audit trail analysis
- verifying filings against EDGAR
- building raw financial data engines

## Restated Statements

Best for:

- long‑term trend analysis
- growth calculations
- financial modeling
- valuation models

Because restated data ensures **comparability across years**.

---

# 5. Implications for an EDGAR-Based Financial Engine

If your application pulls data directly from **EDGAR XBRL**, you are effectively working with:

**As Originally Reported data**.

EDGAR does not automatically restate prior periods.

Instead:

- each filing contains its own historical numbers
- sometimes companies include restated values
- sometimes they do not

Therefore your engine must handle:

- inconsistent historical values
- tag changes over time
- classification differences

---

# 6. How Professional Data Providers Handle This

Major providers build **normalization layers** on top of EDGAR.

Examples include:

- Morningstar
- FactSet
- Bloomberg
- S&P Capital IQ

Their systems perform:

### 1. Tag normalization

Example:

RevenueFromContractWithCustomerExcludingAssessedTax  
Revenues  
SalesRevenueNet  

All mapped to:

Revenue

---

### 2. Historical restatement logic

They rebuild historical statements to maintain consistency.

---

### 3. Derived calculations

Examples:

Gross Profit = Revenue - COGS  
Free Cash Flow = Operating CF - CapEx

---

### 4. Time series reconciliation

They ensure the numbers align across:

- income statement
- balance sheet
- cash flow

---

# 7. Recommended Approach for a Custom EDGAR Engine

For most independent financial engines the best approach is:

### Use EDGAR as the primary source

This ensures:

- transparency
- free data access
- regulatory accuracy

---

### Normalize terminology via taxonomy mapping

Example:

Revenue  
COGS  
Operating Income  
Net Income  

mapped from multiple XBRL tags.

---

### Compute derived metrics yourself

Examples:

Gross Profit  
Free Cash Flow  
Margins  
Return ratios

---

### Avoid aggressive restatement logic initially

True restatement engines are extremely complex.

Instead:

- rely on the most recent filing’s historical numbers
- allow your engine to update when companies revise history.

---

# Summary

| Feature | Original | Restated |
|------|------|------|
| Source | Raw SEC filings | Adjusted dataset |
| Historical consistency | Low | High |
| Accounting updates reflected | No | Yes |
| Best for | EDGAR-based systems | Trend analysis |
| Complexity | Simple | Complex |

---

**Key takeaway:**

"As Originally Reported" reflects the **true historical filings**, while "Restated" represents **analyst-normalized financial history**.

For an EDGAR-driven financial engine, **original filings should be the foundation**, with normalization handled in the taxonomy layer.
