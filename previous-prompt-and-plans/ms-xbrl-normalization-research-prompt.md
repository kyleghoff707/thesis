# Research Prompt: Morningstar XBRL Normalization Methodology

## Context

We're building a financial data engine ("Thes1s") that reads SEC EDGAR XBRL filings and produces standardized financial statements (income statement, balance sheet, cash flow statement). Our accuracy target is Morningstar's standardized output — if we match Morningstar, we match the Rule One Toolbox (which is a presentation layer on Morningstar data).

We have a 50-company test suite comparing our engine output to Morningstar golden fixtures across ~87 mapped fields x 5 years. Current accuracy: **86.4% match rate** (12,941/14,979 comparisons). The remaining 1,894 failures are **not tag coverage gaps** — they are structural mismatches where our engine and Morningstar derive different numbers from the same underlying XBRL data.

**We need to understand HOW Morningstar transforms raw XBRL into their standardized output** — their normalization rules, aggregation logic, and classification decisions — so we can replicate that transformation.

---

## Part 1: Morningstar's XBRL Normalization Methodology

Research how Morningstar (and similar financial data providers like S&P Capital IQ, Refinitiv, FactSet) normalize raw SEC XBRL data into standardized financial statements. This is the foundational understanding we need.

### 1.1 — The Normalization Problem

Raw XBRL filings are not standardized. Two companies in the same industry can use completely different XBRL tags for the same economic concept. For example:
- Apple might report `OperatingIncomeLoss` directly
- Another company might not have that tag at all, requiring derivation from components

Financial data providers solve this by building a **normalization layer** that maps the ~15,000+ US-GAAP XBRL tags into a fixed template of ~100-300 standardized line items.

**Research questions:**
- What is the general architecture of a financial data normalization system? (tag mapping, derivation rules, classification logic, hierarchy resolution)
- How do providers handle the "same concept, different tags" problem at scale?
- How do they handle tags that don't exist in XBRL but appear on their standardized template? (i.e., derived/computed fields)
- What role do XBRL calculation linkbases, presentation linkbases, and definition linkbases play in normalization?
- How do providers handle XBRL tags that represent overlapping or nested concepts? (e.g., `StockholdersEquity` vs `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest`)

### 1.2 — Morningstar's Specific Approach

Morningstar publishes standardized financial statements with a fixed template regardless of company or industry. Their income statement always has the same line items (Total Revenue, Cost of Revenue, Gross Profit, SGA, R&D, Operating Income, etc.), even when the underlying XBRL uses different tags per company.

**Research questions:**
- How does Morningstar's normalization template work? What are the standard line items for IS, BS, CF?
- Does Morningstar use a static tag-to-field mapping, or do they use calculation linkbase relationships, or both?
- How does Morningstar handle "restated" vs "as-reported" financials? (Our fixtures use restated values — how does restatement affect the normalization?)
- What is Morningstar's hierarchy when multiple XBRL tags could map to the same standardized field?
- Does Morningstar ever SUM multiple XBRL tags into a single standardized field? If so, which fields and under what conditions?
- How does Morningstar compute "Other" line items (Other Operating Expenses, Other Investing Activities, Other Financing Activities)? Are these residuals (Total - sum of named items) or direct tag lookups?

### 1.3 — Industry-Specific Normalization

Morningstar uses the same template for all companies but the underlying XBRL varies dramatically by industry. Banks don't have "Cost of Revenue." REITs have FFO. Insurance companies have premiums and claims.

**Research questions:**
- How does Morningstar handle bank/financial company normalization? Banks report Net Interest Income, Provision for Credit Losses, Non-Interest Income, Non-Interest Expense — how do these map to the standard IS template (Revenue, COGS, Gross Profit, Operating Income)?
- How does Morningstar define "Revenue" for banks? (Is it Net Interest Income + Non-Interest Income? Just total interest income? Something else?)
- How does Morningstar handle REIT-specific items? (FFO, NOI, Funds Available for Distribution — are these on the standardized template or separate?)
- How does Morningstar handle insurance companies? (Net Premiums Earned, Claims/Losses, Investment Income — how do these map to Revenue, COGS, etc.?)
- For non-standard industries, does Morningstar reclassify XBRL items? (e.g., does a bank's "Provision for Credit Losses" show up under "Cost of Revenue" or somewhere else on the standardized template?)

### 1.4 — Sign Conventions and Presentation

XBRL has specific sign conventions (debits positive, credits negative for certain concepts), but Morningstar's presentation may flip signs for user readability.

**Research questions:**
- What sign convention does Morningstar use for expenses? (positive = expense increases, or negative = reduces income?)
- How does Morningstar handle XBRL's `negatedLabel` and balance-type attributes?
- For cash flow items, does Morningstar follow XBRL's convention (outflows negative) or does it use absolute values with labels?
- How does Morningstar handle the negate convention for working capital changes? (e.g., "Change in Receivables" — is an increase in receivables shown as negative cash impact or positive?)

---

## Part 2: Specific Structural Mismatches to Investigate

These are the 5 field categories where our engine diverges from Morningstar. For each, we need to understand exactly what Morningstar is doing that we're not.

### 2.1 — Intangible Assets (149 failures / 35 companies)

**Our approach:** Extract `IntangibleAssetsNetExcludingGoodwill` from XBRL. If that tag is null, sum `FiniteLivedIntangibleAssetsNet` + `IndefiniteLivedIntangibleAssetsExcludingGoodwill`.

**The mismatch:** For many companies, our value differs significantly from Morningstar's "Intangibles other than Goodwill." Example: AMAT 2021 — MS shows 2,041M, our engine shows 104M. The standard XBRL tags don't add up to MS's number.

**Research questions:**
- What XBRL tags does Morningstar aggregate into "Intangibles other than Goodwill"?
- Does MS include items beyond the standard intangible asset tags? (e.g., capitalized software costs via `CapitalizedComputerSoftwareNet`, technology-based intangibles, customer relationship intangibles, in-process R&D?)
- Is MS using the XBRL calculation linkbase to find all descendants of a parent "intangible assets" concept?
- For a company like AMAT that shows 2,041M in MS but only 104M in `IntangibleAssetsNetExcludingGoodwill` — what accounts for the ~1,937M gap? What specific XBRL tags would make up that difference?
- Does the answer change depending on the industry?

### 2.2 — Accrued Liabilities (143 failures / 31 companies)

**Our approach:** Extract `AccruedLiabilitiesCurrent`, falling back to `EmployeeRelatedLiabilitiesCurrent`.

**The mismatch:** Many companies report only a combined `AccountsPayableAndAccruedLiabilitiesCurrent` tag in XBRL — they don't break out accrued liabilities separately. Our engine already uses that combined tag as a fallback for `accounts_payable`, creating a circular dependency: we can't derive accrued = combined - AP because our AP IS the combined value.

**Research questions:**
- How does Morningstar split the combined `AccountsPayableAndAccruedLiabilitiesCurrent` into separate "Trade/Accounts Payable" and "Accrued Expenses" line items when the company doesn't file them separately?
- Does MS use additional data sources beyond the primary XBRL tags? (e.g., footnote disclosures, dimensional XBRL data, prior-period breakdowns?)
- When a company only reports the combined tag, does MS actually show a split — or do they show the combined value under one field and null under the other?
- Is there a hierarchy of XBRL tags MS uses for accrued liabilities that goes beyond `AccruedLiabilitiesCurrent`? (e.g., `OtherAccruedLiabilitiesCurrent`, `AccruedInsuranceLiabilitiesCurrent`, `TaxesPayableCurrent`, `InterestPayableCurrent`, `AccruedBonusesCurrent`, `AccruedSalariesCurrent`)
- Does the answer differ for financial vs non-financial companies?

### 2.3 — Operating Income/Loss (49 failures / 22 companies)

**Our approach:** Extract `OperatingIncomeLoss` directly from XBRL. If null, derive as: `income_before_tax + interest_expense - other_income_expense` (Path 1) or `gross_profit - SGA - R&D - D&A - other_operating_expenses` (Path 2).

**The mismatch:** Most of the 49 failures are companies that DO have the `OperatingIncomeLoss` tag — but MS reports a different number. This means MS is either: (a) reclassifying items in/out of "operating," (b) using a different XBRL tag, or (c) computing operating income from components even when the direct tag exists.

**Research questions:**
- Does Morningstar ALWAYS compute operating income from components (Revenue - COGS - OpEx), or does it use the `OperatingIncomeLoss` tag when available?
- If MS computes from components, what items does it include/exclude from "operating expenses"? Specifically:
  - Restructuring charges — operating or non-operating?
  - Impairment charges (goodwill, asset) — operating or non-operating?
  - Merger/acquisition costs — operating or non-operating?
  - Litigation settlements — operating or non-operating?
  - Gain/loss on sale of assets — operating or non-operating?
- Does MS apply a consistent definition of "operating" across all companies, or does it vary by industry?
- For companies where XBRL's `OperatingIncomeLoss` includes items that MS excludes (or vice versa), how does MS handle the reclassification?
- Is there a published or documented Morningstar methodology for operating income normalization?

### 2.4 — Depreciation & Amortization (62 failures / 8 companies)

**Our approach:** Extract `DepreciationDepletionAndAmortization` from the cash flow statement. This is the comprehensive "reconciliation" D&A number.

**The mismatch:** 8 companies (including CRM, INTU, MSFT, WFC) show significant D&A differences. These are acquisition-heavy companies that report intangible amortization as a SEPARATE cash flow line item from D&A. The XBRL `DepreciationDepletionAndAmortization` tag may or may not include that separate amortization — it depends on how the company files.

**Research questions:**
- Does Morningstar's "Depreciation & Amortization" on the cash flow statement ALWAYS include amortization of intangible assets? Or is it just depreciation of tangible assets + depletion?
- When a company reports `DepreciationDepletionAndAmortization` AND a separate `AmortizationOfIntangibleAssets` on their XBRL cash flow, does MS sum them or use one?
- How does MS handle companies like CRM that report D&A and intangible amortization as completely separate CF line items? Does MS aggregate them into a single "Depreciation & Amortization, Reconciled" number?
- What specific XBRL tags does MS aggregate into their D&A line? Is there a published list?
- Does this differ between the cash flow D&A and the income statement D&A?

### 2.5 — Residual "Other" Fields (other_financing: 136, other_investing: 133, other_income_expense: 93, other_noncash_items: 52)

**Our approach:** We tried computing these as residuals (Total - sum of named items) but it amplified errors in the named items, producing wildly wrong values. We currently extract them from direct XBRL tags (e.g., `OtherNonoperatingIncomeExpense`, `OtherOperatingActivities`).

**The mismatch:** MS clearly uses a residual computation for these fields — they represent "everything else not captured by the named line items." But our residual computation fails because our named items aren't accurate enough.

**Research questions:**
- Does Morningstar compute "Other" fields as residuals (Total - Σ named items), or do they have direct tag mappings?
- If residuals: what specific named items does MS subtract to arrive at each "Other" field? For example, for "Other Investing Activities," does MS subtract capex + acquisitions + dispositions + investment purchases + investment sales from total investing cash flow? What exactly is in that subtraction list?
- If residuals: how does MS handle the error amplification problem? Do they have quality checks or clamps?
- Are there XBRL tags that represent "Other" categories that MS uses as a cross-check? (e.g., `OtherInvestingActivitiesNet`, `PaymentsForOtherInvestingActivities`, `ProceedsFromOtherInvestingActivities`)
- For "Other Income/Expense" specifically: how does MS compute this? Is it `PreTaxIncome - OperatingIncome - InterestExpense + InterestIncome`? Or is it a direct tag lookup?

---

## Part 3: Cross-Cutting Questions

### 3.1 — The Calculation Linkbase Question

XBRL filings include calculation linkbases that define mathematical relationships between tags (e.g., "Assets = Current Assets + Noncurrent Assets"). These linkbases are company-specific and filed with each 10-K.

**Research questions:**
- Do financial data providers like Morningstar use per-filing calculation linkbases to normalize data?
- Could a "follow the calc linkbase" approach solve our intangible assets problem? (i.e., find all children of the intangible assets parent concept in the calc linkbase, sum them)
- What are the limitations of relying on calculation linkbases? (e.g., not all relationships are in the linkbase, circular references, inconsistent filing practices)

### 3.2 — Dimensional XBRL Data

XBRL supports "dimensions" (axes and members) that provide additional context. For example, a company might report total intangible assets AND a dimensional breakdown by type (customer relationships, technology, trade names, etc.).

**Research questions:**
- Does Morningstar use dimensional XBRL data for normalization?
- Could dimensional data help us split combined tags (like `AccountsPayableAndAccruedLiabilitiesCurrent`) that we currently can't decompose?
- What are the most common dimensional breakdowns in XBRL filings?

### 3.3 — XBRL Extensions and Custom Tags

Companies can create custom XBRL tags (extensions) when no standard US-GAAP tag fits. These appear with the company's own prefix instead of `us-gaap:`.

**Research questions:**
- How does Morningstar handle company-specific extension tags?
- Do extension tags contribute to the intangible assets or accrued liabilities gaps we're seeing?
- What percentage of meaningful financial data lives in extension tags vs standard US-GAAP tags?

---

## Desired Output Format

Structure the research as a technical reference document with:

1. **Executive summary** — 1 paragraph on how MS normalization works at a high level
2. **Normalization architecture** — the general approach (tag mapping, derivation, residuals, linkbase usage)
3. **Industry-specific handling** — banks, REITs, insurance (how standard template maps to non-standard XBRL)
4. **Field-by-field analysis** — for each of our 5 problem areas: what MS likely does, what we should do differently, specific XBRL tags involved
5. **Recommended fixes** — prioritized, actionable changes to our engine based on the findings
6. **Sources** — citations for any Morningstar documentation, SEC guidance, XBRL specifications, or academic papers referenced

Focus on actionable understanding, not theory. We need to know specifically what tags to look for, what to sum, what to derive, and in what order — so we can translate findings directly into code changes.
