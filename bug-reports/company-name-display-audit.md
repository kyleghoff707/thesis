# Company Name Display Audit

**Date:** 2026-03-21
**Scope:** Company name formatting inconsistencies across the app
**Method:** Browser QA testing of 8 companies across sectors + data source analysis
**Tickers tested:** AAPL, JPM, WMT, XOM, UNH, ODFL, AMT, MU

---

## Summary

Company names display inconsistently throughout the app. The same UI surface (Competitors table, company header) shows a mix of ALL CAPS names, proper case names, mixed-case names, and names with cryptic legal suffixes. This affects readability and makes the app feel unpolished.

**Root cause confirmed:** The `thes1s-company-assignments.json` file (5,758 companies) stores names exactly as received from SEC EDGAR, with no normalization. EDGAR uses ALL CAPS for most company filings, but some newer registrants use proper case.

### Breakdown of 5,757 company names in `thes1s-company-assignments.json`

| Category | Count | % | Example |
|----------|-------|---|---------|
| **ALL CAPS + /state/ suffix** | 146 | 2% | `COSTCO WHOLESALE CORP /NEW` |
| **ALL CAPS no suffix** | 1,994 | 34% | `NVIDIA CORP`, `JPMORGAN CHASE & CO` |
| **Proper case (clean)** | 2,768 | 48% | `Apple Inc.`, `Alphabet Inc.` |
| **Mixed case** | 849 | 14% | `ELI LILLY & Co`, `SYNAPTICS Inc` |

**Additional formatting inconsistencies:**
- 174 names have `/XX/` state-of-incorporation suffixes (e.g., `/DE/`, `/NEW`, `/MA/`, `/CAN/`)
- Inconsistent suffix punctuation: some `/DE/` (both slashes), some `/DE` (no trailing slash)
- 459 names have commas before INC/CORP (e.g., `GILEAD SCIENCES, INC.`)
- "Inc" vs "Inc." — 96 use `Inc` (no period), 0 use `Inc.` among ALL CAPS names
- `AMAZON COM INC` — missing dot-com formatting

---

## Issue 1: ALL CAPS Company Names

**Severity:** Medium — Visual inconsistency, affects readability
**Affected surfaces:** Company header, Competitors tab, anywhere company names display
**Frequency:** ~39% of all companies (2,140 out of 5,757)

### Evidence by sector

**AAPL (Consumer Electronics) — Competitors tab:**
| Name as displayed | Issue |
|---|---|
| `Apple Inc.` | Proper case (good) |
| `Sonos Inc` | Proper case (good) |
| `GoPro, Inc.` | Proper case (good) |
| `UNIVERSAL ELECTRONICS INC` | ALL CAPS |
| `KOSS CORP` | ALL CAPS |
| `EMERSON RADIO CORP` | ALL CAPS |

**JPM (Banks) — Competitors tab:**
| Name as displayed | Issue |
|---|---|
| `JPMORGAN CHASE & CO` | ALL CAPS |
| `BANK OF AMERICA CORP /DE/` | ALL CAPS + suffix |
| `CITIGROUP INC` | ALL CAPS |
| `Bank of New York Mellon Corp` | Proper case (good) |
| `WELLS FARGO & COMPANY/MN` | ALL CAPS + suffix (no space before slash) |
| `ROYAL BANK OF CANADA` | ALL CAPS |
| `BANK OF MONTREAL /CAN/` | ALL CAPS + suffix |
| `CANADIAN IMPERIAL BANK OF COMMERCE /CAN/` | ALL CAPS + suffix |
| `ING GROEP NV` | ALL CAPS |
| `BARCLAYS PLC` | ALL CAPS |
| `Bank of N.T. Butterfield & Son Ltd` | Proper case (good) |
| `Banco Santander, S.A.` | Proper case (good) |
| `HSBC HOLDINGS PLC` | ALL CAPS |
| `TORONTO DOMINION BANK` | ALL CAPS |

**WMT (Retail) — Competitors tab:**
| Name as displayed | Issue |
|---|---|
| `Walmart Inc.` | Proper case (good) |
| `COSTCO WHOLESALE CORP /NEW` | ALL CAPS + suffix |
| `TARGET CORP` | ALL CAPS |
| `DOLLAR GENERAL CORP` | ALL CAPS |
| `BJ's Wholesale Club Holdings, Inc.` | Proper case (good) |
| `DOLLAR TREE, INC.` | ALL CAPS |
| `PRICESMART INC` | ALL CAPS |
| `BBB FOODS INC` | ALL CAPS |
| `Ollie's Bargain Outlet Holdings, Inc.` | Proper case (good) |

**XOM (Energy) — Competitors tab:**
| Name as displayed | Issue |
|---|---|
| `EXXON MOBIL CORP` | ALL CAPS |
| `CHEVRON CORP` | ALL CAPS |
| `NATIONAL FUEL GAS CO` | ALL CAPS |
| `Shell plc` | Proper case (good) |
| `TotalEnergies SE` | CamelCase (good) |
| `PETROBRAS - PETROLEO BRASILEIRO SA` | ALL CAPS |
| `ENI SPA` | ALL CAPS |
| `SUNCOR ENERGY INC` | ALL CAPS |
| `IMPERIAL OIL LTD` | ALL CAPS |
| `CENOVUS ENERGY INC.` | ALL CAPS |
| `YPF SOCIEDAD ANONIMA` | ALL CAPS (full legal name) |
| `GAS TRANSPORTER OF THE SOUTH INC` | ALL CAPS |
| `Diversified Energy Co` | Proper case (good) |

**UNH (Healthcare) — Competitors tab:**
| Name as displayed | Issue |
|---|---|
| `UNITEDHEALTH GROUP INC` | ALL CAPS |
| `CVS HEALTH Corp` | Mixed case! (CAPS + proper) |
| `Cigna Group` | Proper case (good) |
| `Elevance Health, Inc.` | Proper case (good) |
| `CENTENE CORP` | ALL CAPS |
| `HUMANA INC` | ALL CAPS |
| `MOLINA HEALTHCARE, INC.` | ALL CAPS |
| `CLOVER HEALTH INVESTMENTS, CORP. /DE` | ALL CAPS + suffix |
| `Oscar Health, Inc.` | Proper case (good) |

**ODFL (Transportation) — Competitors tab:**
| Name as displayed | Issue |
|---|---|
| `OLD DOMINION FREIGHT LINE, INC.` | ALL CAPS |
| `XPO, Inc.` | Proper case (good) |
| `Knight-Swift Transportation Holdings Inc.` | Proper case (good) |
| `ARCBEST CORP /DE/` | ALL CAPS + suffix |
| `SAIA INC` | ALL CAPS |
| `WERNER ENTERPRISES INC` | ALL CAPS |
| `HEARTLAND EXPRESS INC` | ALL CAPS |
| `MARTEN TRANSPORT LTD` | ALL CAPS |
| `PAMT CORP` | ALL CAPS |

**AMT (REIT) — Competitors tab + header:**
| Name as displayed | Issue |
|---|---|
| `AMERICAN TOWER CORP /MA/` | ALL CAPS + suffix (also in header!) |
| `EQUINIX INC` | ALL CAPS |
| `WEYERHAEUSER CO` | ALL CAPS |
| `IRON MOUNTAIN INC` | ALL CAPS |
| `DIGITAL REALTY TRUST, INC.` | ALL CAPS |
| `CROWN CASTLE INC.` | ALL CAPS |
| `SBA COMMUNICATIONS CORP` | ALL CAPS |
| `LAMAR ADVERTISING CO/NEW` | ALL CAPS + suffix (no space) |
| `OUTFRONT Media Inc.` | Mixed case |
| `Gaming & Leisure Properties, Inc.` | Proper case (good) |
| `GLADSTONE LAND Corp` | Mixed case |
| `RAYONIER INC` | ALL CAPS |
| `EPR PROPERTIES` | ALL CAPS |
| `Power REIT` | Mixed case |

**MU (Semiconductors) — Competitors tab:**
| Name as displayed | Issue |
|---|---|
| `MICRON TECHNOLOGY INC` | ALL CAPS |
| `NVIDIA CORP` | ALL CAPS |
| `INTEL CORP` | ALL CAPS |
| `Broadcom Inc.` | Proper case (good) |
| `QUALCOMM INC/DE` | ALL CAPS + suffix (no space) |
| `ADVANCED MICRO DEVICES INC` | ALL CAPS |
| `TEXAS INSTRUMENTS INC` | ALL CAPS |
| `STMicroelectronics N.V.` | Proper case (good) |
| `NXP Semiconductors N.V.` | Proper case (good) |
| `ANALOG DEVICES INC` | ALL CAPS |
| `ON SEMICONDUCTOR CORP` | ALL CAPS |
| `Marvell Technology, Inc.` | Proper case (good) |
| `MICROCHIP TECHNOLOGY INC` | ALL CAPS |
| `SKYWORKS SOLUTIONS, INC.` | ALL CAPS |
| `ARM HOLDINGS PLC /UK` | ALL CAPS + suffix |
| `VISHAY INTERTECHNOLOGY INC` | ALL CAPS |
| `MONOLITHIC POWER SYSTEMS INC` | ALL CAPS |
| `CIRRUS LOGIC, INC.` | ALL CAPS |
| `TOWER SEMICONDUCTOR LTD` | ALL CAPS |
| `DIODES INC /DEL/` | ALL CAPS + suffix |
| `SYNAPTICS Inc` | Mixed case (CAPS + proper) |
| `SEMTECH CORP` | ALL CAPS |
| `Silicon Motion Technology CORP` | Mixed case (proper + CAPS) |
| `WOLFSPEED, INC.` | ALL CAPS |

---

## Issue 2: Legal Suffixes (/DE/, /NEW, /MA/, etc.)

**Severity:** Medium — Cryptic text, meaningless to users
**Frequency:** 174 companies (3%)

These are state-of-incorporation or country-of-organization codes that SEC EDGAR appends to distinguish legal entities. They are meaningless for investment research display.

### Suffix inventory (top 10)

| Suffix | Count | Meaning |
|--------|-------|---------|
| `/DE/` | 56 | Delaware |
| `/DE` | 16 | Delaware (inconsistent trailing slash) |
| `/MD/` | 10 | Maryland |
| `/OH/` | 6 | Ohio |
| `/NEW/` | 6 | New (reorganized entity) |
| `/PA/` | 6 | Pennsylvania |
| `/MA/` | 5 | Massachusetts |
| `/VA/` | 5 | Virginia |
| `/NV` | 4 | Nevada |
| `/NEW` | 3 | New (no trailing slash) |

### Formatting inconsistencies in suffixes

- Some have spaces before the slash: `BANK OF AMERICA CORP /DE/`
- Some don't: `QUALCOMM INC/DE`, `WELLS FARGO & COMPANY/MN`
- Some have trailing slashes: `/DE/`
- Some don't: `/DE`
- Some use country codes: `/CAN/`, `/UK`
- Some use state abbreviations: `/DE/`, `/MA/`, `/MN`
- Some use words: `/NEW`, `/NEW/`

---

## Issue 3: Mixed-Case Anomalies

**Severity:** Low-Medium — Visually jarring, inconsistent
**Frequency:** 849 companies (14%)

Names where SOME words are ALL CAPS and others are proper case. These look like partial data merges or incomplete normalization.

### Examples

| Ticker | Name | Issue |
|--------|------|-------|
| LLY | `ELI LILLY & Co` | CAPS name + lowercase "Co" |
| PG | `PROCTER & GAMBLE Co` | CAPS name + lowercase "Co" |
| CVS | `CVS HEALTH Corp` | CAPS name + proper "Corp" |
| SYNA | `SYNAPTICS Inc` | CAPS name + proper "Inc" |
| SIMO | `Silicon Motion Technology CORP` | Proper name + CAPS "CORP" |
| GLADSTONE | `GLADSTONE LAND Corp` | CAPS name + proper "Corp" |
| OUTFRONT | `OUTFRONT Media Inc.` | CAPS brand + proper "Media Inc." |
| BCC | `BOISE CASCADE Co` | CAPS name + lowercase "Co" |
| BALL | `BALL Corp` | CAPS ticker-name + proper "Corp" |
| ABAT | `AMERICAN BATTERY TECHNOLOGY Co` | CAPS name + lowercase "Co" |
| ATYR | `aTYR PHARMA INC` | lowercase prefix + CAPS |

---

## Issue 4: Company Header Shows Raw EDGAR Name

**Severity:** High — The most prominent display of the company name uses the raw, unformatted EDGAR name
**Affected surface:** Company header (top of every research page)

When loading AMT, the header displays:
```
AMT
AMERICAN TOWER CORP /MA/
$176.79
```

This is the SEC filing name, not a user-friendly display name. The header is the first thing you see and should show a clean name like "American Tower Corp".

---

## Data Source Analysis

### Where names come from

The `thes1s-company-assignments.json` file stores company names from two sources:

1. **SEC EDGAR** — Uses the legal entity name from SEC filings. These are almost always ALL CAPS with optional state/country suffixes. ~39% of entries.
2. **Yahoo Finance** — Uses proper title case, consumer-friendly names. ~48% of entries.
3. **Mixed/partial** — Some entries appear to have been partially updated. ~14% of entries.

### Why the inconsistency exists

The company assignments file was built by scraping multiple sources (SEC EDGAR company tickers endpoint, Yahoo Finance). Each source formats names differently:

- SEC EDGAR: `NVIDIA CORP`, `BANK OF AMERICA CORP /DE/`
- Yahoo Finance: `Apple Inc.`, `Broadcom Inc.`

The file stores whichever name was received first or last, with no normalization step.

### Which names are affected

Cross-referencing the app display with the data file confirms a **1:1 match** — every ALL CAPS or suffixed name in the Competitors tab comes directly from the `name` field in `thes1s-company-assignments.json`. The app displays these names verbatim with no formatting applied.

---

## Recommended Fix Approach

Three distinct sub-problems to solve:

### 1. Title-case normalization
Convert ALL CAPS names to proper title case. Requires a smart function that handles:
- Common words (Inc, Corp, Co, Ltd, LLC, PLC, SA, SE, NV, AG)
- Acronyms that should stay caps (IBM, AMD, UPS, AT&T, CVS, HSBC)
- Brand-specific casing (eBay, iPhone — though these rarely come from EDGAR)
- Prepositions/articles (of, the, and, &)

### 2. Strip legal suffixes
Remove `/DE/`, `/NEW`, `/MA/`, `/CAN/`, etc. from display names. These are SEC filing artifacts with no user value.

### 3. Determine where to apply
Two options:
- **Option A:** Normalize at the data level — clean up `thes1s-company-assignments.json` once and write cleaned names back. Pros: fixes everywhere at once. Cons: lose original EDGAR names (could keep as separate field).
- **Option B:** Normalize at display time — add a formatting function that cleans names before rendering. Pros: preserves raw data, can be applied selectively. Cons: must be applied everywhere names display.

---

## Screenshots

| File | Description |
|------|-------------|
| `screenshots/aapl-competitors.png` | AAPL Competitors tab showing name mix |
| `screenshots/jpm-competitors.png` | JPM Competitors tab — mostly ALL CAPS |
| `screenshots/wmt-competitors.png` | WMT Competitors tab — CAPS with /NEW suffix |
| `screenshots/mu-competitors.png` | MU Competitors tab — long list of CAPS names |
| `screenshots/amt-overview.png` | AMT header showing "AMERICAN TOWER CORP /MA/" |
| `screenshots/amt-header.png` | AMT overview page |

---

## Health Assessment

This is a **cosmetic/UX consistency issue**, not a functional bug. No data is wrong — the names are accurate SEC filing names. But displaying raw SEC EDGAR legal entity names in a user-facing investment research app creates a jarring, inconsistent experience that undermines the app's polish.

**Scope of impact:** Every company loaded has a ~50% chance of showing an ALL CAPS or suffixed name somewhere in the UI. The Competitors tab is the most affected because it shows 10-30+ company names at once, making the inconsistency impossible to miss.

---

## Fix Implemented — 2026-03-21

**Approach chosen:** Option B — display-time formatting. Raw EDGAR data is preserved; formatting is applied only when rendering.

### New utility: `src/engines/formatCompanyName.js`

A single `formatCompanyName(name)` function that:

1. **Strips legal suffixes** — regex `/\s*\/[A-Za-z]+\/?\s*$/` removes any `/XX/` or `/XX` pattern at the end of a name. Handles all variants: with/without leading space, with/without trailing slash, attached to last word (`INC/DE`).

2. **Detects ALL CAPS names** — counts the fraction of letter-containing words that are fully uppercase. If ≥50% of words are ALL CAPS, the name gets full title-case conversion.

3. **Title-cases with intelligence:**
   - Known acronyms stay uppercase (40+ entries: IBM, AMD, CVS, HSBC, ARM, PLC, LLC, REIT, etc.)
   - Common suffixes normalize to standard casing (CORP→Corp, INC→Inc, CO→Co, LTD→Ltd, COMPANY→Company)
   - Prepositions lowercase unless first word (of, the, and, for, in, on, at, etc.)
   - Words already mixed-case are preserved as-is (e.g., "TotalEnergies", "Corp", "Co")

4. **Handles partial-caps names** — names that are mostly proper case but have one ALL CAPS suffix (e.g., "Silicon Motion Technology CORP") get only the suffix normalized.

### Display points updated (12 total across 8 components)

| # | Component | Line | Expression | Source |
|---|-----------|------|------------|--------|
| 1 | `CompanyHeader.jsx` | 88 | `formatCompanyName(company?.name)` | SEC EDGAR submissions API |
| 2 | `Competitors.jsx` | 629 | `formatCompanyName(peer.name)` | `thes1s-company-assignments.json` |
| 3 | `ResearchList.jsx` | 125 | `formatCompanyName(report.companyName)` | Stored in localStorage |
| 4 | `Watchlists.jsx` | 321 | `formatCompanyName(item.companyName)` | Search results |
| 5 | `Toolbox.jsx` | 92 | `formatCompanyName(company.name)` | Stored at report creation |
| 6 | `Toolbox.jsx` | 446 | `formatCompanyName(company?.name)` | Passed to FinancialStatements CSV |
| 7 | `GuruPortfolio.jsx` | 233 | `formatCompanyName(r.data.issuer)` | 13F tooltip |
| 8 | `GuruPortfolio.jsx` | 871 | `formatCompanyName(item.name)` | N-PORT fund holdings |
| 9 | `GuruPortfolio.jsx` | 938 | `formatCompanyName(h.issuer)` | 13F holdings table |
| 10 | `GuruPortfolio.jsx` | 1025 | `formatCompanyName(holding.issuer)` | Historical activity header |
| 11 | `Gurus.jsx` | 423 | `formatCompanyName(pos.issuer)` | Guru position table |
| 12 | `Gurus.jsx` | 727 | `formatCompanyName(buy.issuer)` | Buy signal table |
| 13 | `Gurus.jsx` | 802 | `formatCompanyName(hold.issuer)` | Hold signal table |

### Before → After

| Before (raw EDGAR) | After (formatted) |
|-----|------|
| `AMERICAN TOWER CORP /MA/` | `American Tower Corp` |
| `BANK OF AMERICA CORP /DE/` | `Bank of America Corp` |
| `COSTCO WHOLESALE CORP /NEW` | `Costco Wholesale Corp` |
| `QUALCOMM INC/DE` | `Qualcomm Inc` |
| `WELLS FARGO & COMPANY/MN` | `Wells Fargo & Company` |
| `DIGITAL REALTY TRUST, INC.` | `Digital Realty Trust, Inc.` |
| `CVS HEALTH Corp` | `CVS Health Corp` |
| `ELI LILLY & Co` | `Eli Lilly & Co` |
| `Silicon Motion Technology CORP` | `Silicon Motion Technology Corp` |
| `Apple Inc.` | `Apple Inc.` (unchanged) |
| `NXP Semiconductors N.V.` | `NXP Semiconductors N.V.` (unchanged) |

### Test coverage

23 regression tests in `src/engines/__tests__/formatCompanyName.test.js` covering:
- Edge cases (null, undefined, empty string)
- Already-proper-case names (8 cases — no change)
- ALL CAPS → title case (8 cases)
- ALL CAPS with commas before suffixes (6 cases)
- Legal suffix stripping: with space, without space, /NEW variants (8 cases)
- Preposition lowercasing (3 cases)
- Known acronym preservation (7 cases: CVS, ARM, SBA, BBB, ING, EPR, HSBC)
- Mixed-case anomalies (7 cases)
- Real-world examples from every sector in the bug report (30+ cases)

All 404 project tests pass. Production build compiles.

### Known limitations

The function is algorithmic and handles any company name from any source. However:

- **Brand-specific CamelCase** — names like "JPMorgan" or "UnitedHealth" come out as "Jpmorgan" and "Unitedhealth" from ALL CAPS input. Deriving the correct CamelCase from ALL CAPS is impossible without a brand name lookup table. These names display correctly when they come from Yahoo Finance (proper case source), but the EDGAR source loses this information.
- **Acronym list is curated, not exhaustive** — the `KEEP_UPPERCASE` set has ~40 entries. A new company with a 4+ letter acronym not in the list (e.g., a hypothetical "ABCD Corp") would get title-cased to "Abcd Corp". 2-3 letter acronyms are well-covered. The list can be extended as needed.
- **aTYR-style brands** — names that intentionally start with a lowercase letter (e.g., "aTYR PHARMA INC") get title-cased to "Atyr Pharma Inc". These are extremely rare (~1 in 5,000).
