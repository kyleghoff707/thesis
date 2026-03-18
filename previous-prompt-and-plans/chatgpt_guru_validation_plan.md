You're thinking about this exactly the right way. When **multiple
independent sites agree but your app differs**, the fastest way to find
the bug is **structured cross-source validation**.

Right now your Guru engine is already well built (multi-filing fetch,
change detection, CUSIP matching, etc.) --- but the validation layer is
missing. What you need is essentially a **Layer-4 validation system
specifically for 13F data**, similar to what you built for EDGAR
financials.

Below is the implementation plan I would recommend.

------------------------------------------------------------------------

# Root Cause Hypotheses (Why Thes1s Differs)

Before designing validation, it's worth identifying the **likely failure
points**.

### 1️⃣ 13F position filtering differences

Many guru sites **exclude certain securities**.

Examples commonly removed:

-   options
-   warrants
-   ADR duplicates
-   preferred shares
-   small "de minimis" positions
-   positions \< \$1k
-   positions without ticker

Your engine includes **all entries from `infoTable`**, so your position
count will often be larger.

------------------------------------------------------------------------

### 2️⃣ Multiple share classes

CUSIP → ticker resolution can collapse or expand holdings.

Example:

GOOGL\
GOOG

Sites may combine them.

Your engine resolves tickers via **fuzzy issuer name matching**, which
may create mismatches.

------------------------------------------------------------------------

### 3️⃣ Amendments (13F-HR/A)

Your engine prefers amendments over originals.

But many websites **ignore amendments**, so your numbers might actually
be **more correct**.

------------------------------------------------------------------------

### 4️⃣ Value normalization

Your system detects thousands vs dollars automatically.

If a site assumes the wrong convention, portfolio values will differ.

------------------------------------------------------------------------

### 5️⃣ Filing selection

Some sites use:

-   latest filing
-   latest reportDate
-   latest amendment

These are not always the same.

------------------------------------------------------------------------

# What To Build: Guru Validation System

Add a **4th validation layer** specifically for the Guru tab.

Architecture:

Layer 1 --- EDGAR identity checks\
Layer 2 --- Statements vs yfinance\
Layer 3 --- Key metrics vs yfinance\
Layer 4 --- Guru 13F validation

------------------------------------------------------------------------

# Layer 4: Guru Validation Engine

File:

validation/layer4_gurus.js

Output:

validation/reports/guru-validation.json

------------------------------------------------------------------------

# Validation Strategy

We validate **4 things per guru**

  Check             Purpose
  ----------------- ---------------------
  Filing match      Same report quarter
  Position count    \# holdings
  Top holdings      major positions
  Portfolio value   total value

------------------------------------------------------------------------

# Source Hierarchy

Use **multiple public sources**.

### Tier 1 (best)

Direct EDGAR derived datasets:

  Source                Why
  --------------------- --------------------
  SEC 13F XML           canonical
  WhaleWisdom CSV       raw filing mirrors
  SEC 13F API mirrors   direct parse

------------------------------------------------------------------------

### Tier 2 (aggregators)

These all use the same base data but different cleaning.

  Site              Reliability
  ----------------- -------------
  WhaleWisdom       excellent
  Dataroma          very good
  GuruFocus         good
  ValueSider        good
  StockCircle       good
  RuleOne Toolbox   decent

------------------------------------------------------------------------

# How Agents Should Validate

Each guru should run **three comparisons**.

------------------------------------------------------------------------

# 1️⃣ Position Count Validation

Example output:

Guru: Seth Klarman\
Quarter: 2025-09-30

Thes1s: 38 positions\
WhaleWisdom: 36 positions\
GuruFocus: 36 positions\
ValueSider: 36 positions

Then list **extra positions**.

Extra in Thes1s:

CUSIP: 12345ABC\
Issuer: XYZ Corp Warrants

------------------------------------------------------------------------

# 2️⃣ Holdings Diff

Compare top 20 holdings.

Example:

Buffett Q3 2025

MATCHED: AAPL BAC KO AXP

MISSING: OXY (present on other sites)

EXTRA: XYZ Preferred

------------------------------------------------------------------------

# 3️⃣ Portfolio Value Comparison

Example:

Thes1s: \$287,349,000,000\
WhaleWisdom: \$287,350,000,000\
Diff: 0.0003%

Large differences usually indicate **value normalization errors**.

------------------------------------------------------------------------

# 4️⃣ Quarter Alignment Check

Verify:

-   reportDate
-   filingDate
-   accessionNumber

Sometimes sites accidentally show the **previous quarter**.

------------------------------------------------------------------------

# Implementation Plan

## Step 1 --- Export Guru Data

Add a batch exporter similar to your financial validation.

validation/scripts/export-gurus.mjs

Output:

validation/data/thes1s/gurus/

Each file:

{ "guru": "Warren Buffett", "cik": "0001067983", "reportDate":
"2025-09-30", "totalValue": 287349000000, "positions": \[ { "cusip":
"...", "issuer": "...", "ticker": "...", "shares": 0, "value": 0 } \] }

------------------------------------------------------------------------

## Step 2 --- Download Reference Data

Best source:

WhaleWisdom CSV exports

Example:

https://whalewisdom.com/filer/berkshire-hathaway-inc

Store in:

validation/data/reference/

------------------------------------------------------------------------

## Step 3 --- Build Diff Engine

validation/layer4_gurus.mjs

Pseudo-logic:

for guru in GURUS:

load thes1s data\
load reference data

compare: position count top holdings total value

output mismatches

------------------------------------------------------------------------

# What the Report Should Show

Example:

# Guru Validation Report

Total gurus tested: 43

## Position Count

Exact match: 31 ±1 position: 8 Large mismatch: 4

Common causes: - warrants included - ADR duplicates - preferred shares

## Top Holdings

Exact match: 96%

## Portfolio Value

Avg diff: 0.03% Max diff: 1.2%

------------------------------------------------------------------------

# Automated Debugging

When a mismatch appears, automatically show the cause.

Example:

Mismatch cause: WARRANT SECURITY

CUSIP: 123456AB\
Issuer: Tesla Motors Warrants

Included in Thes1s\
Excluded by WhaleWisdom

------------------------------------------------------------------------

# Validation UI (Inside Thes1s)

Add a new tool page.

/guru-validation

Display:

## Guru Positions Match

Buffett 45 vs 45 ✓ Klarman 38 vs 36 ⚠ Pabrai 12 vs 12 ✓

Click → show diff.

------------------------------------------------------------------------

# Additional Internal Checks

These catch **real bugs**.

### 1️⃣ CUSIP duplication

Check:

unique(CUSIP)

------------------------------------------------------------------------

### 2️⃣ Portfolio % sum

Σ portfolioPct = 100 ± 0.1

------------------------------------------------------------------------

### 3️⃣ Value consistency

value ≈ shares × avg price

------------------------------------------------------------------------

### 4️⃣ Sold position detection

Verify that sold positions are **not included in totals**.

------------------------------------------------------------------------

# Important: Why Websites Can't Be Scraped

Most of those sites:

-   block bots
-   require login
-   have Cloudflare

So the correct approach is:

download datasets → validate offline

------------------------------------------------------------------------

# The Best External Validation Source

Use **WhaleWisdom raw filings**.

They mirror the **exact XML filings**, meaning:

SEC XML\
vs\
Thes1s parse

If these match → your parser is correct.

------------------------------------------------------------------------

# Quick Test You Should Run Immediately

Take **one guru** (Buffett) and manually compare:

-   reportDate
-   positionCount
-   top holdings

If Thes1s differs, inspect the raw XML.

------------------------------------------------------------------------

# My Strong Suspicion

The mismatch is very likely one of these:

1️⃣ warrants/options included\
2️⃣ multiple share classes\
3️⃣ ADR duplicates

This is extremely common.

------------------------------------------------------------------------

# Possible Future Improvements

1️⃣ A complete Guru validation architecture like your financial
validation system.\
2️⃣ A script that instantly finds the exact holdings causing the
differences.\
3️⃣ A CUSIP normalization system that makes Thes1s match the major sites
almost perfectly.

Together these would make the **Guru tab essentially bulletproof.**
