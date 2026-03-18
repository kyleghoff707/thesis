# Thes1s Validation Expansion Plan

## Quarterly Support + Additional Validation Layers

Date: 2026-03-10

------------------------------------------------------------------------

# Overview

The Thes1s EDGAR engine has already passed extensive validation across
three layers:

1.  Layer 1 -- Internal EDGAR validation (identities, completeness,
    derived fields)
2.  Layer 2 -- Financial statement comparison against external sources
3.  Layer 3 -- Derived metric comparison against external sources

Two additional validation improvements are recommended to further harden
the system:

1.  Quarterly Consistency Validation
2.  Cross‑Statement Consistency Validation

In addition, the Thes1s UI should begin fully supporting quarterly
financial data, since the dropdown already exists but currently does not
populate.

This document provides a practical implementation plan for Claude Code.

------------------------------------------------------------------------

# Goals

## Validation Goals

Add two additional safety checks:

• Quarterly roll‑up validation\
• Cross‑statement consistency validation

These detect:

• incorrect XBRL context selection\
• incorrect period selection\
• missing quarter values\
• duplicate fact usage\
• cash flow inconsistencies\
• retained earnings reconciliation issues

## Product Goal

Enable quarterly financial data support in the Thes1s UI.

This allows:

• TTM metrics\
• quarterly trend analysis\
• better external validation\
• improved growth calculations

------------------------------------------------------------------------

# Part 1 --- Quarterly Data Support

## Current State

The UI dropdown already includes a Quarterly option, but it is not
populated because:

• the EDGAR engine currently extracts annual data only\
• quarterly contexts are ignored

------------------------------------------------------------------------

## Implementation Strategy

Extend the EDGAR extraction engine to include:

annual financials\
quarterly financials

Quarterly data should be stored alongside annual data in the exported
JSON.

------------------------------------------------------------------------

## Step 1 --- Extend EDGAR Extraction

File:

src/engines/edgarFinancials.js

Add a new extraction path:

extractQuarterlyFact()

Logic:

1.  Identify contexts where: fp = Q1, Q2, Q3

2.  Extract quarterly values for tags including:

• revenue\
• net_income\
• operating_cash_flow\
• capex\
• total_assets\
• equity\
• shares_outstanding\
• eps_diluted

3.  Store in a new structure:

quarterly: 2024Q1: {...} 2024Q2: {...} 2024Q3: {...} 2024Q4: {...}

------------------------------------------------------------------------

## Step 2 --- Update JSON Exporter

File:

validation/scripts/export-financials.mjs

Add quarterly output to:

validation/data/thesis/{TICKER}.json

Example structure:

ticker: AAPL\
annual: {...}\
quarterly: 2024Q1: {...} 2024Q2: {...}

------------------------------------------------------------------------

## Step 3 --- UI Integration

File:

src/components/Financials.jsx

When dropdown = Quarterly

Display the last 8 quarters.

Sorting:

latest → oldest

------------------------------------------------------------------------

## Step 4 --- Derived Quarterly Metrics

Add optional metrics:

TTM Revenue\
TTM Net Income\
TTM EPS\
TTM Free Cash Flow

Calculation:

TTM = sum(last 4 quarters)

------------------------------------------------------------------------

# Part 2 --- Quarterly Consistency Validation

## Purpose

Detect context errors and missing data.

Example:

FY Revenue ≠ Q1 + Q2 + Q3 + Q4

------------------------------------------------------------------------

## Validation Rule

FY value ≈ sum of quarterly values

Tolerance:

±3%

------------------------------------------------------------------------

## Implementation

Create new validation script:

validation/layer4_quarterly_consistency.py

Pseudo‑logic:

for ticker in tickers: annual_revenue = FY value quarterly_sum = Q1 +
Q2 + Q3 + Q4 diff = abs(annual_revenue - quarterly_sum) / annual_revenue

    if diff > 0.03:
        flag discrepancy

Run this check for:

• Revenue\
• Net Income\
• Operating Cash Flow\
• CapEx

------------------------------------------------------------------------

# Part 3 --- Cross‑Statement Consistency Validation

## Purpose

Detect extraction errors across statements.

------------------------------------------------------------------------

## Check 1 --- Net Income Consistency

Net income appears in:

Income Statement\
Cash Flow Statement

Validation:

NetIncome_income_statement ≈ NetIncome_cash_flow

Tolerance:

±1%

------------------------------------------------------------------------

## Check 2 --- Retained Earnings Reconciliation

Accounting identity:

Ending Retained Earnings = Beginning Retained Earnings + Net Income -
Dividends ± adjustments

Implementation:

validation/layer5_retained_earnings.py

Tolerance:

±5%

------------------------------------------------------------------------

## Check 3 --- Cash Flow Change in Cash

Identity:

CFO + CFI + CFF = Net Change in Cash

Validation:

calculated_change = operating + investing + financing

Tolerance:

±1%

------------------------------------------------------------------------

# Part 4 --- Validation Report Integration

Extend existing report generator:

validation/generate_report.py

Add outputs:

quarterly_consistency_results.csv\
cross_statement_results.csv

Output fields:

ticker\
year\
check_type\
expected_value\
observed_value\
difference_percent\
status

------------------------------------------------------------------------

# Part 5 --- Development Order

Claude Code should implement in this order:

1.  Quarterly EDGAR extraction\
2.  Quarterly UI support\
3.  Quarterly roll‑up validator\
4.  Cross‑statement validators\
5.  Extend validation reports

------------------------------------------------------------------------

# Final Result

After these additions, Thes1s will have:

Layer 1 -- EDGAR internal validation\
Layer 2 -- External statement validation\
Layer 3 -- External metric validation\
Layer 4 -- Quarterly roll‑up validation\
Layer 5 -- Cross‑statement consistency validation

This creates a five‑layer validation framework comparable to
institutional financial data pipelines.

The next major step after this phase is implementing:

GAAP Taxonomy Graph Validator\
Taxonomy Consensus Engine
