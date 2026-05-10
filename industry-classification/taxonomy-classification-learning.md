---
title: Thesis Taxonomy Classification Guide
date: 2026-03-18
author: Computer Learning — Claude Code
data-type: other
domain: stock market industry classification
project-folder: ~/Desktop/stock-analyzer/
---

# Claude Learning Document — Stock Market Industry Classification

## 1. Purpose & Scope

This document teaches Claude Code agents how to classify publicly traded US companies into the Thesis custom industry taxonomy. Use this guide when:

- Assigning a new company to the taxonomy
- Verifying an existing classification
- Handling edge cases (conglomerates, SPACs, REITs)
- Deciding whether a company needs reclassification
- Working on the Competitors tab or peer discovery features

The taxonomy lives at `taxonomy-research/thesis-taxonomy-tree.json`. Company assignments are at `taxonomy-research/thesis-company-assignments.json` (5,758 companies classified).

---

## 2. Domain Overview

### Why Custom Taxonomy?

The SEC's SIC codes (designed 1937) are the only freely available company-level classification data, but they're unreliable:
- Self-reported and rarely updated
- No modern industries (SaaS, fintech, EVs, crypto, AI)
- Groups by production process, not competitive dynamics
- Amazon is SIC 5961 "Catalog & Mail-Order Houses"

The Thesis taxonomy replaces SIC with a modern 3-tier system optimized for value investing research — grouping companies by **who they compete with for customers and revenue**.

### How It Relates to Existing Systems

The taxonomy is modeled after Morningstar's classification (which Yahoo Finance uses). This was deliberate:
- Yahoo Finance sector/industry labels are the primary free data source for seeding classifications
- Morningstar-style sector names (Technology, Consumer Cyclical, etc.) are already used throughout the app
- The taxonomy adds modern industry granularity that Morningstar lacks

---

## 3. Key Vocabulary & Labels

### Tier Structure

| Tier | Code Digits | Count | Example |
|------|-------------|-------|---------|
| Sector | 2 digits (10-99) | 12 | Technology (10) |
| Industry Group | 4 digits (1010-9920) | 52 | Software (1010) |
| Industry | 8 digits (10101010-99201020) | 176 | Software - SaaS & Cloud (10101030) |

### The 12 Sectors

| Code | Sector | Super Sector | Description |
|------|--------|-------------|-------------|
| 10 | Technology | Sensitive | Software, hardware, semiconductors, IT services |
| 15 | Communication Services | Sensitive | Telecom, media, internet, digital advertising |
| 20 | Consumer Cyclical | Cyclical | Auto, apparel, retail, travel, housing |
| 25 | Consumer Defensive | Defensive | Food, beverage, household products, grocery |
| 30 | Healthcare | Defensive | Pharma, biotech, medical devices, health services |
| 35 | Financial Services | Cyclical | Banks, insurance, capital markets, fintech |
| 40 | Industrials | Sensitive | Aerospace, manufacturing, transportation, business services |
| 45 | Energy | Sensitive | Oil & gas, renewable energy, energy storage |
| 50 | Basic Materials | Cyclical | Chemicals, metals, mining, building materials |
| 55 | Utilities | Defensive | Electric, gas, water, multi-utilities |
| 60 | Real Estate | Cyclical | REITs (12 subtypes), real estate services |
| 99 | Special Classifications | Other | Conglomerates, SPACs, shell companies, cannabis |

### Super Sectors (Macro-Level Economic Sensitivity)

- **Cyclical**: Performance correlates with economic cycles. Consumer Cyclical, Financial Services, Basic Materials, Real Estate.
- **Defensive**: Relatively stable regardless of economy. Consumer Defensive, Healthcare, Utilities.
- **Sensitive**: Moderate economic sensitivity. Technology, Communication Services, Industrials, Energy.

---

## 4. Interpretation Framework

### How to Classify a Company — Step by Step

When you encounter a company that needs classification, follow this process in order:

**Step 1 — Check existing assignment**
Look up the company in `thesis-company-assignments.json` by CIK or ticker. If already assigned with confidence ≥ 0.8, use the existing classification.

**Step 2 — Check Yahoo Finance label**
If the company has a Yahoo Finance sector and industry (available via `quoteSummary` → `assetProfile`), look up the Yahoo label in `yahoo-to-thesis-crosswalk.json` to get the Thesis code.

**Step 3 — Check SIC code**
Look up the company's SIC code (from SEC EDGAR submissions) in `sic-to-thesis-crosswalk.json`.

**Step 4 — Compare sources**
- If Yahoo and SIC agree at the Industry Group level → assign with high confidence (0.95)
- If they agree at Sector but differ at Industry Group → use Yahoo classification (confidence 0.80)
- If they disagree at Sector → read the company's business description and classify manually

**Step 5 — Manual classification (when needed)**
Read the company's 10-K Item 1 (Business Description) or their website. Ask:
1. **What does this company sell?** (products/services)
2. **Who are their customers?** (consumers, businesses, governments)
3. **Who do they compete with?** (direct competitors)
4. **Where does most of their revenue come from?** (primary revenue segment)

Match the answers to the Thesis taxonomy. The primary revenue source determines the classification.

---

## 5. Classification Decision Trees

### Technology (10)
```
Does the company primarily sell software or technology services?
├── YES: Software or services
│   ├── Is it delivered via cloud/SaaS subscription? → 10101030 (SaaS & Cloud)
│   ├── Is it cybersecurity-focused? → 10101040 (Cybersecurity)
│   ├── Is it an AI/ML platform company? → 10101050 (AI & Machine Learning)
│   ├── Is it systems/infrastructure software? → 10101020 (Software - Infrastructure)
│   ├── Is it IT consulting/services? → 10501010 (IT Services)
│   ├── Is it cloud infrastructure (IaaS/PaaS)? → 10501040 (Cloud Computing Infrastructure)
│   └── Otherwise → 10101010 (Software - Application)
├── YES: Hardware
│   ├── Consumer devices (phones, laptops)? → 10201010 (Consumer Electronics)
│   ├── Servers, storage, enterprise? → 10201020 (Computer Hardware & Storage)
│   ├── Telecom equipment? → 10201030 (Communication Equipment)
│   └── Scientific instruments? → 10201040 (Scientific Instruments)
├── YES: Semiconductors
│   ├── Chip design/manufacturing? → 10301010 (Semiconductors)
│   └── Fab equipment? → 10301020 (Semiconductor Equipment)
└── YES: Components/EMS
    ├── Contract manufacturing? → 10401020 (Electronic Manufacturing Services)
    └── Components? → 10401010 (Electronic Components)
```

### Communication Services (15)
```
Is the company's primary business communication or media?
├── Telecom provider (voice, data, broadband)?
│   ├── National/global? → 15101010 (Telecom - Diversified)
│   ├── Wireless-only? → 15101020 (Telecom - Wireless)
│   └── Regional? → 15101030 (Telecom - Regional)
├── Media/entertainment content?
│   ├── Diversified media conglomerate? → 15201010 (Entertainment - Diversified)
│   ├── Streaming-first? → 15201020 (Entertainment - Streaming)
│   ├── Video games? → 15201030 (Gaming & Interactive Entertainment)
│   ├── TV/radio broadcasting? → 15201040 (Broadcasting)
│   ├── Publishing? → 15201050 (Publishing)
│   └── Ad agency/marketing? → 15201060 (Advertising & Marketing)
└── Internet/digital platform?
    ├── Search/information (Google-like)? → 15301010 (Internet Content)
    ├── Social network? → 15301020 (Social Media Platforms)
    ├── Revenue >50% from ad tech? → 15301030 (Digital Advertising)
    └── Marketplace platform (eBay-like)? → 15301040 (Online Marketplaces)
```

### Financial Services (35) — Key Distinctions
```
Is it a bank?
├── >$100B assets, global? → 35101010 (Banks - Diversified)
├── Regional, multi-state? → 35101020 (Banks - Regional)
└── Single market, small? → 35101030 (Banks - Community)

Is it insurance?
├── Life/annuities? → 35201010 (Insurance - Life)
├── P&C/auto/home? → 35201020 (Insurance - P&C)
├── Specialty lines? → 35201030 (Insurance - Specialty)
├── Reinsurance? → 35201040 (Insurance - Reinsurance)
└── Broker/distribution? → 35201050 (Insurance Brokers)

Is it fintech (digital-first)?
├── Digital payments? → 35501010 (Fintech - Digital Payments)
├── Neobank/digital bank? → 35501020 (Fintech - Digital Banking)
├── Online lending/BNPL? → 35501030 (Fintech - Lending Platforms)
└── Crypto/blockchain? → 35501040 (Fintech - Blockchain & Crypto)

Is it capital markets?
├── Asset management/funds? → 35301010 (Asset Management)
├── Investment banking? → 35301020 (Investment Banking)
├── Exchange/data? → 35301030 (Financial Exchanges & Data)
└── PE/VC? → 35301040 (Private Equity & VC)

IMPORTANT: Transaction & payment processing (V, MA) → 35401030
These are NOT fintech — they are legacy payment networks with established moats.
Fintech is reserved for digital-native disruptors.
```

### Consumer Cyclical (20) vs Consumer Defensive (25)
```
Key question: Would demand drop significantly in a recession?
├── YES (discretionary spending) → Consumer Cyclical (20)
│   Examples: Cars, fashion, restaurants, hotels, electronics, furniture
└── NO (essential spending) → Consumer Defensive (25)
    Examples: Groceries, toothpaste, toilet paper, baby formula, tobacco

Retail classification:
├── Sells primarily food/groceries → 25 (Consumer Defensive)
│   ├── Supermarket chain → 25301010 (Grocery)
│   ├── Warehouse club (COST, BJ) → 25301020 (Warehouse & Club)
│   └── Pharmacy chain → 25301030 (Pharmacy)
└── Sells primarily discretionary goods → 20 (Consumer Cyclical)
    ├── Broad selection (AMZN, WMT, TGT) → 20301010 (Broadline & E-Commerce)
    ├── Home improvement (HD, LOW) → 20301030 (Home Improvement)
    ├── Discount/dollar (DLTR, DG) → 20301040 (Discount Stores)
    └── Specialty focus → 20301020 (Specialty Retail)
```

### Energy (45) — Modern Categories
```
Oil & gas? → 4510 group
├── Integrated major (XOM, CVX)? → 45101010
├── E&P pure play? → 45101020
├── Refiner? → 45101030
├── Pipeline/midstream? → 45101040
├── Oilfield services (SLB, HAL)? → 45101050
└── Drilling contractor? → 45101060

Renewable energy? → 4520 group
├── Solar (FSLR, ENPH)? → 45201010
├── Wind? → 45201020
├── Equipment/components? → 45201030
└── Hydrogen/fuel cells? → 45201040

NOTE: Utility-scale renewable operators that are structured
as utilities → 55401010 (Renewable Utilities), NOT Energy sector.
The distinction: Energy companies SELL energy products/equipment.
Utility companies DISTRIBUTE energy to end consumers.
```

---

## 6. Categorization Schema

The complete taxonomy is defined in `taxonomy-research/thesis-taxonomy-tree.json`. Each entry has:
- `code`: 8-digit numeric identifier
- `name`: Human-readable industry name
- `description`: What companies belong here, with examples

When classifying, always assign to the most specific (8-digit) level. The sector (2-digit) and industry group (4-digit) are derived from the code prefix.

---

## 7. Edge Cases & Ambiguities

### Conglomerates (Berkshire Hathaway, 3M, Honeywell)
- Classify by **dominant revenue segment**
- Set `flags: ["conglomerate"]` in the assignment
- If no segment dominates (all roughly equal), use:
  - Financial holding → 35601010 (Financial Conglomerates)
  - Industrial holding → 40201020 (Industrial Conglomerates)
  - Mixed → 99101010 (Conglomerates)

### Platform Companies (Amazon, Alphabet, Meta)
- Amazon: Classify as 20301010 (Broadline & E-Commerce) — retail is still majority of revenue. Flag as `["multi-segment"]`.
- Alphabet: Classify as 15301030 (Digital Advertising Platforms) — 80%+ revenue from ads.
- Meta: Classify as 15301020 (Social Media Platforms) — primary business is social networking with ad monetization.

### SPACs & Blank Check Companies
- Pre-merger: 99101020 (Blank Check / SPAC)
- Post-merger: Reclassify to the operating company's industry
- Detection: SIC 6770 ("Blank Checks") or company name contains "Acquisition Corp"

### REITs
- Always under Real Estate (60), even if the underlying properties serve another sector
- Data center REITs → 60101060, NOT Technology
- Healthcare REITs → 60101050, NOT Healthcare
- The REIT structure (tax pass-through) determines the sector, not the tenant industry

### ADRs (American Depositary Receipts)
- Classify by business activity, NOT by country of domicile
- Toyota → Auto Manufacturers (20101010), even though it's Japanese
- Set `flags: ["adr"]` in the assignment

### Newly IPO'd Companies
- Use Yahoo Finance classification as seed (usually available within days of listing)
- If no Yahoo data, use SIC code from SEC filing
- If still ambiguous, read the S-1 (IPO prospectus) business description
- Assign low confidence (0.5) until first 10-K is available

### Business Model Transitions
- **Default rule**: Reclassify when new revenue source exceeds 40% for 2 consecutive years, OR exceeds 50% in a single year
- **Manual override**: Reclassify immediately when the transition is clearly underway and the market perceives the company as competing in the new industry. Set `manualOverride: true` with documented rationale. Valid triggers: legacy business shutdown announced, new segment growing >3x legacy, or 2+ major taxonomy providers have reclassified.
- Example: Netflix transitioned from DVD rental to streaming — streaming subscribers surpassed DVD by ~2010, revenue crossed over ~2012. Under manual override, reclassification could have happened as early as 2010.
- When reclassifying, update the assignment with new code, date, and note explaining the change

### Companies That Straddle Two Sectors
- Common examples: Medical device companies (Healthcare vs Technology), Fintech (Financial Services vs Technology)
- Rule: **Follow the revenue**. If >50% of revenue comes from financial products/services → Financial Services. If >50% from technology products → Technology.
- Borderline cases: Default to the sector where the company's COMPETITORS are classified

---

## 8. Project-Specific Instructions

### File Locations in the Thesis Codebase

| File | Purpose | Location |
|------|---------|----------|
| Taxonomy tree (definition) | The taxonomy structure itself | `taxonomy-research/thesis-taxonomy-tree.json` |
| Company assignments | Every company's classification | `taxonomy-research/thesis-company-assignments.json` |
| SIC crosswalk | SIC → Thesis mapping | `taxonomy-research/sic-to-thesis-crosswalk.json` |
| Yahoo crosswalk | Yahoo label → Thesis mapping | `taxonomy-research/yahoo-to-thesis-crosswalk.json` |
| SIC engine (legacy fallback) | SIC-based classification, used as fallback | `src/engines/sicClassification.js` |
| Thesis classification engine | Primary classification (CIK → ticker → SIC fallback) | `src/engines/thesisClassification.js` |
| Peer discovery | In-memory lookup from Thesis assignments (instant) | `src/engines/peers.js` |
| Competitors UI | Displays peer benchmarks | `src/components/Competitors.jsx` |
| Competitors hook | Progressive loading: peers → metrics → scores | `src/hooks/useCompetitors.js` |
| Batch classification script | Standalone Node script for seeding assignments | `scripts/classify-universe.js` |

### How to Add a New Company

1. Look up Yahoo Finance sector/industry via `quoteSummary`
2. Map through `yahoo-to-thesis-crosswalk.json`
3. Look up SIC from EDGAR submissions
4. Map through `sic-to-thesis-crosswalk.json`
5. If both agree → assign with confidence 0.95
6. If they disagree → read 10-K business description and decide manually
7. Add entry to `thesis-company-assignments.json`

### How to Propose a Taxonomy Structure Change

Taxonomy structure changes (adding/removing/renaming industries) are significant and should be:
1. Documented with rationale (why is this change needed?)
2. Checked for impact (how many companies would need reclassification?)
3. Approved by the user before implementation
4. Applied to all affected files: taxonomy tree, crosswalks, company assignments

**Never automatically change the taxonomy structure.** Only the user can approve structural changes.

### Validation Procedures

**Spot-check protocol** — After any bulk classification run or crosswalk change, verify these 20 companies land correctly:

| Ticker | Expected Industry | Why it's a good canary |
|--------|-------------------|----------------------|
| AAPL | Computer Hardware & Storage | Hardware, not software |
| GOOGL | Digital Advertising Platforms | Not "Internet Content" |
| AMZN | Broadline & E-Commerce | Not "Cloud Computing" |
| TSLA | Auto Manufacturers - EV | Distinct from traditional auto |
| MSFT | Software - Infrastructure | Not SaaS (mostly enterprise licensing) |
| NVDA | Semiconductors | Not AI/ML |
| JPM | Banks - Diversified | Not "Financial Services" broadly |
| V | Transaction & Payment Processing | Not fintech |
| LULU | Retail - Apparel & Accessories* | *Ideally Athletic & Lifestyle, but needs NLP |
| ODFL | Trucking | Not "Transportation" broadly |
| BRK-B | Conglomerates | Not Insurance |
| WMT | Broadline & E-Commerce | Not "Discount Stores" |
| COST | Retail - Discount & Dollar Stores* | *Ideally Warehouse & Club, but needs NLP |
| EQIX | REIT - Data Center | Not Technology |
| XOM | Oil & Gas Integrated | Not Energy broadly |
| UNH | Healthcare Plans | Not Insurance |
| META | Social Media Platforms | Not "Digital Advertising" |
| NFLX | Entertainment - Diversified* | *Ideally Streaming, but needs NLP |
| HD | Home Improvement Retail | Not "Specialty Retail" |
| PG | Household Products | Consumer Defensive, not Cyclical |

*Items marked with * are known misclassifications awaiting NLP refinement.

**Distribution sanity check** — After bulk runs, generate company counts per sector. Compare against Yahoo's market weight percentages. Gross mismatches signal crosswalk bugs. Expected patterns:
- Financial Services having many companies but low market weight (many small banks) — normal
- Technology having fewer companies but high market weight — normal
- Healthcare/Biotech having 600+ companies in one group — genuinely that many public biotechs

### Maintenance: Adding New Companies

When a user searches a ticker not in the assignments file:
1. The app falls back to SIC classification via `classifyBySIC_legacy()`
2. This gives usable sector/industryGroup/industry labels for display
3. But peer discovery may return fewer/different results since the company isn't in the Thesis index

To add a new company to the assignments file:
1. Look up Yahoo Finance sector/industry via the batch script: `node scripts/classify-universe.js --step 2`
2. Or manually add an entry to `thesis-company-assignments.json`:
```json
{
  "ticker": "NEWCO",
  "name": "New Company Inc.",
  "cik": "0001234567",
  "exchange": "NMS",
  "exchangeName": "NasdaqGS",
  "thesisCode": "10101010",
  "sector": "Technology",
  "industryGroup": "Software",
  "industry": "Software - Application",
  "confidence": 0.85,
  "source": "manual",
  "yahooSector": "Technology",
  "yahooIndustry": "Software - Application",
  "needsReview": false,
  "flags": []
}
```
3. Rebuild the app (`npm run build`) to include the updated JSON

### Maintenance: Bulk Reclassification

To reclassify companies from one industry to another (e.g., after identifying all cybersecurity companies):
1. Query the assignments file for candidates: filter by current industry + flags
2. Update each entry's `thesisCode`, `sector`, `industryGroup`, `industry`
3. Set `source: "manual-override"` and add a flag explaining the change
4. **Critical**: Only reclassify if the target industry has enough peers (5+). Moving a company to a 1-company industry makes the Competitors tab useless for that ticker.

### Audit Tab Integration (Future)

The existing Audit tab has 5 audit systems (validation, guru, ticker, N-PORT, compensation). A future "Classification Audit" panel could:
- Show companies flagged `needsReview: true` (currently 490)
- Display confidence scores with color coding (red < 0.65, yellow 0.65-0.84, green 0.85+)
- Allow one-click reclassification with dropdown of industries in the same sector
- Show peer count per industry to highlight thin groups

---

## 9. Real-World Learnings (from Pipeline + Integration)

These are lessons learned from building and deploying the classification pipeline across 5,758 companies and integrating into the Competitors tab.

### Don't Manually Override Without Peers

Moving a single company to the "correct" granular industry (e.g., LULU → "Apparel - Athletic & Lifestyle") leaves it with 0 peers if no other companies are classified there yet. The Competitors tab becomes useless. **Rule: never reclassify a company unless the target industry has at least 5 peers.**

This is why LULU stays in "Retail - Apparel & Accessories" (32 peers) even though it more accurately belongs in "Apparel - Athletic & Lifestyle." The fix is batch NLP reclassification — move NKE, ONON, UAA, COLM, etc. all at once, then move LULU.

### Biotechnology Concentration

Biotechnology has ~598 companies in one industry — genuinely that many publicly traded biotechs. The Competitors tab will show ~600 peers for any biotech company, which is too many for useful benchmarking. Future refinements:
- Filter by market cap range (nano-cap biotechs aren't comparable to large-cap)
- Sub-group by stage (pre-revenue/clinical vs commercial-stage)
- The industry group level ("Biotechnology & Pharma") is even larger

### Yahoo's Split Mapping Problem

~10 Yahoo industries map to multiple Thesis industries (e.g., Yahoo "Software - Application" could be Thesis Application, SaaS, Cybersecurity, or AI/ML). These split mappings produce 492 `needsReview` companies with confidence 0.65. They're assigned to the default (most common) Thesis industry, which is usually correct for 70-80% of cases but wrong for notable companies.

The 8 most impactful splits to resolve via NLP:
1. **Software - Application** → separate SaaS, Cybersecurity, AI companies
2. **Software - Infrastructure** → separate Cybersecurity (CRWD, PANW, ZS, FTNT)
3. **Entertainment** → separate Streaming (NFLX, DIS+, ROKU)
4. **Specialty Retail** → separate E-Commerce pure plays
5. **Apparel Retail** → separate Athletic/Lifestyle brands (LULU, NKE)
6. **Discount Stores** → separate Warehouse/Club (COST, BJ)
7. **Drug Manufacturers** → separate Biotech vs Pharma
8. **Insurance - Diversified** → separate Conglomerates (BRK already fixed)

### SIC Fallback Accuracy

The SIC fallback (for companies not in the 5,758 assignments) uses sector names matching Morningstar/Thesis (Technology, Consumer Cyclical, etc.), so sector-level peer discovery still works. But SIC industryGroup/industry names differ from Thesis, so industry-level peers won't be found for fallback companies. This affects ~2,300 EDGAR filers that are OTC, foreign, or delisted — unlikely to be searched by the user.

### Bundle Size

The company assignments JSON is 2.9MB, adding ~2.9MB to the Vite bundle (570KB gzipped). For a Tauri desktop app this is fine — loads from local disk, not network. If it becomes a concern, options:
- Strip unused fields (yahooSector, yahooIndustry, flags) — saves ~30%
- Dynamic import — lazy-load on first Competitors tab visit
- Compress to binary format

---

## 10. Quick Reference

### Classification Confidence Levels

| Signal | Classification Approach | Confidence |
|--------|------------------------|-----------|
| Yahoo + SIC agree at Industry Group | Use shared classification | 0.95 |
| Yahoo + SIC agree at Sector only | Use Yahoo classification | 0.80 |
| Yahoo only (no SIC match) | Use Yahoo classification | 0.85 |
| SIC only (no Yahoo data) | Use SIC crosswalk | 0.50 |
| SIC 2-digit fallback only | Use SIC major group | 0.30 |
| Manual/agent classification | Use 10-K business description | 0.70-0.90 |
| User-verified | Manually approved | 1.00 |

### Common Misclassifications to Watch For

| Company | Wrong Classification | Correct Classification | Why |
|---------|---------------------|----------------------|-----|
| Amazon | Catalog/Mail-Order (SIC) | Broadline & E-Commerce | SIC is 40 years stale |
| Visa/Mastercard | Technology | Financial Services > Transaction Processing | Revenue is from payment processing fees, not tech |
| Tesla | Auto Manufacturers | Auto Manufacturers - EV (if >50% EV) | Distinct competitive dynamics from traditional auto |
| Alphabet | Computer Programming (SIC) | Digital Advertising Platforms | Revenue is 80%+ advertising |
| Data center REITs | Technology | Real Estate > REIT - Data Center | REIT tax structure governs classification |
| Netflix | Entertainment - Diversified | Entertainment - Streaming | Streaming-first business model |

### Sector Name Mapping (Morningstar ↔ GICS)

| Thesis / Morningstar | GICS Equivalent |
|---------------------|-----------------|
| Technology | Information Technology |
| Consumer Cyclical | Consumer Discretionary |
| Consumer Defensive | Consumer Staples |
| Financial Services | Financials |
| Healthcare | Health Care |
| Communication Services | Communication Services |
| Industrials | Industrials |
| Energy | Energy |
| Basic Materials | Materials |
| Utilities | Utilities |
| Real Estate | Real Estate |
