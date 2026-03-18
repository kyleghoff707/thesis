# Stock Market Industry Taxonomy — Research Report
**Date**: 2026-03-17
**Author**: Thes1s Research (Claude Code)
**Purpose**: Survey existing classification systems and design a custom taxonomy for Rule One investment research

---

## 1. Executive Summary

The stock market industry classification landscape is dominated by six major systems: GICS (S&P/MSCI), Morningstar Global Equity Classification, ICB (FTSE Russell), Bloomberg BICS, FactSet RBICS, and Yahoo Finance (which uses Morningstar's taxonomy). Each was built by financial data companies to serve institutional investors, and each takes a different approach to the same fundamental question: "What business is this company in?" After surveying all six systems, this report recommends building a custom Thes1s taxonomy that borrows structural ideas from GICS, aligns naming conventions with Morningstar/Yahoo (since Yahoo is our primary free data source), and adds modern industry categories that none of the legacy systems handle well — SaaS, fintech, EVs, AI/ML, cybersecurity, and renewable energy.

The current app uses `sicClassification.js`, a hand-built overlay mapping ~300 SIC codes to 12 sectors. SIC codes are a 1937 government system that the SEC still requires but that no serious investment analyst relies on for peer comparison. The proposed Thes1s taxonomy replaces this with an 11-sector, ~60 industry group, ~150 industry structure using 8-digit numeric codes. It can be seeded almost entirely from free data: Yahoo Finance provides Morningstar sector + industry labels for ~7,000 US equities, and SEC EDGAR provides SIC codes for ~13,000 filers. Cross-referencing these two sources produces a high-confidence classification for the vast majority of investable companies.

The implementation plan is phased: Phase 1 seeds the taxonomy from Yahoo + SIC cross-reference, Phase 2 adds NLP-based classification from 10-K business descriptions for edge cases, and Phase 3 adds revenue segment mapping for multi-segment companies. The entire system is designed to be maintained by a single user with AI assistance, not a team of analysts.

---

## 2. Introduction & Motivation

### 2.1 Why SIC Fails for Investment Research

Standard Industrial Classification (SIC) codes were created in 1937 by the U.S. government to track economic activity across the American economy. They were designed for statisticians measuring GDP by sector, not for investors comparing companies. The SEC adopted SIC codes for filing purposes, and every public company must report one when it files its annual 10-K. But SIC was never built for investment research, and using it for peer comparison produces misleading results.

Here are the specific problems:

**Self-reported and never updated.** Companies choose their own SIC code when they first file with the SEC. Most never change it, even as their business evolves dramatically. Amazon still files under SIC 5961 "Catalog & Mail-Order Houses" — a code that describes a Sears catalog business from the 1960s, not a cloud computing and advertising giant. Meta Platforms files under SIC 7370 "Computer Programming, Data Processing, Etc." alongside thousands of small IT consulting firms.

**No modern industries exist.** SIC codes were last meaningfully updated in 1987. The entire Software-as-a-Service industry, fintech, electric vehicles, streaming media, cryptocurrency, artificial intelligence, and cybersecurity simply do not exist in the SIC system. Every SaaS company gets lumped into "Computer Programming" or "Computer Integrated Systems Design." Every fintech company gets filed under generic banking or financial services codes.

**Single assignment only.** Each company gets exactly one SIC code, regardless of how many business lines it operates. Berkshire Hathaway (SIC 6311 "Life Insurance") owns a railroad, a utility company, See's Candies, Dairy Queen, and dozens of other businesses — but it gets one code for the insurance business that happened to be its original focus. This means SIC-based peer discovery for Berkshire returns other insurance companies, not the diversified conglomerates it actually resembles.

**Groups by production process, not competition.** SIC organizes companies by what they manufacture or how they deliver services, not by who they compete with for customers. Cloud infrastructure companies (AWS, Azure, Google Cloud) get lumped with IT consulting firms. Athletic apparel companies (Lululemon, Nike, Under Armour) get lumped with discount family clothing stores. This makes SIC useless for the competitive analysis that Rule One investing requires.

**Stale and officially replaced.** NAICS (North American Industry Classification System) replaced SIC for all U.S. government statistical purposes in 1997. But the SEC never switched — it still requires SIC codes on all filings. This means SIC codes persist in financial data despite being obsolete even by government standards.

The current Thes1s app (`sicClassification.js`) has ~300 four-digit SIC codes mapped to 12 sectors with industry group and industry labels. This is a hand-built overlay that tries to fix SIC's problems by imposing a Morningstar-style structure on top of government codes. It works for basic sector identification, but the 2-digit fallback for unmapped codes produces low-precision results, and the mapping cannot distinguish between modern sub-industries (SaaS vs. on-premise software, fintech vs. traditional banking, EV manufacturers vs. legacy auto).

### 2.2 What the Industry Standard Providers Do

Every major financial data provider has built its own proprietary taxonomy to solve SIC's limitations. Morningstar, MSCI/S&P, FTSE Russell, Bloomberg, and FactSet each employ teams of analysts who manually classify companies based on revenue sources, business descriptions, and market behavior. They review classifications quarterly or annually, reclassify companies after major M&A events, and add new industry categories as markets evolve.

The common approach across all providers:

1. **Revenue is the primary signal.** The company's largest source of revenue determines its primary classification. If Amazon gets 60% of revenue from retail, it goes in the retail sector — even though AWS is its most profitable and fastest-growing segment.

2. **Multi-tier hierarchy.** All systems use at least 4 levels of granularity, from broad sectors (11 in most systems) down to specific sub-industries (150-1,600 depending on the system).

3. **Single-company assignment.** Most systems assign each company to exactly one classification at the lowest tier. Only Bloomberg BICS and FactSet RBICS support multi-segment classification, where a single company can appear in multiple industries weighted by revenue share.

4. **Proprietary and paid.** This is the critical limitation for Thes1s. Every one of these taxonomies is copyrighted and requires a paid data subscription to access company-level classifications — with one exception: Yahoo Finance exposes Morningstar's sector and industry labels for free.

The following sections survey each system in detail, then Section 5 catalogs what free data is actually available for building our own classification.

---

## 3. Taxonomy System Survey

### 3.1 GICS (S&P/MSCI)

The Global Industry Classification Standard (GICS) is the most widely used institutional taxonomy in the world. Developed jointly by MSCI and S&P Dow Jones Indices in 1999, it is the classification system behind S&P 500 sector indices, most institutional portfolio analytics, and the vast majority of "sector rotation" strategies.

**Structure: 4 tiers**

| Tier | Count | Code Digits | Example |
|------|-------|-------------|---------|
| Sector | 11 | 2 digits (10-60) | Information Technology (45) |
| Industry Group | 25 | 4 digits | Software & Services (4510) |
| Industry | 74 | 6 digits | Systems Software (451030) |
| Sub-Industry | 163 | 8 digits | Systems Software (45103020) |

**The 11 Sectors**

| Code | Sector |
|------|--------|
| 10 | Energy |
| 15 | Materials |
| 20 | Industrials |
| 25 | Consumer Discretionary |
| 30 | Consumer Staples |
| 35 | Health Care |
| 40 | Financials |
| 45 | Information Technology |
| 50 | Communication Services |
| 55 | Utilities |
| 60 | Real Estate |

**The 25 Industry Groups** (selected detail for key sectors)

- **Energy (10)**: Energy Equipment & Services, Oil Gas & Consumable Fuels
- **Materials (15)**: Chemicals, Construction Materials, Containers & Packaging, Metals & Mining, Paper & Forest Products
- **Industrials (20)**: Capital Goods, Commercial & Professional Services, Transportation
- **Consumer Discretionary (25)**: Automobiles & Components, Consumer Durables & Apparel, Consumer Services, Consumer Discretionary Distribution & Retail
- **Consumer Staples (30)**: Consumer Staples Distribution & Retail, Food Beverage & Tobacco, Household & Personal Products
- **Health Care (35)**: Health Care Equipment & Services, Pharmaceuticals Biotechnology & Life Sciences
- **Financials (40)**: Banks, Financial Services, Insurance
- **Information Technology (45)**: Software & Services, Technology Hardware & Equipment, Semiconductors & Semiconductor Equipment
- **Communication Services (50)**: Telecommunication Services, Media & Entertainment
- **Utilities (55)**: Utilities (single industry group)
- **Real Estate (60)**: Equity Real Estate Investment Trusts (REITs), Real Estate Management & Development

**Classification Methodology**

GICS classifies each company into a single sub-industry based on three criteria, applied in order of priority:

1. **Revenue** (primary): The business segment generating the largest share of revenue determines classification. This is the dominant factor.
2. **Earnings and market perception** (secondary): When revenue is ambiguous (e.g., a company with two segments each contributing ~50%), earnings contribution and how the market perceives the company influence the decision.
3. **Committee review** (governance): A joint MSCI/S&P committee reviews all classifications annually. Companies involved in major M&A, spin-offs, or business model shifts may be reclassified mid-year.

Each company receives exactly ONE classification at the sub-industry level. There is no concept of secondary or weighted classification in GICS.

**Multi-Segment Handling**

GICS forces a single classification for every company, regardless of how diversified its business is. Berkshire Hathaway is classified in Financials > Financial Conglomerates despite owning Burlington Northern Santa Fe Railroad (transportation), Berkshire Hathaway Energy (utilities), and dozens of consumer brands. Amazon is in Consumer Discretionary > Broadline Retail despite AWS being its profit engine. This is a well-known limitation that GICS accepts as a trade-off for simplicity.

**Notable Recent Changes**

- **2018**: The Telecommunication Services sector was renamed Communication Services. Alphabet (Google), Meta (Facebook), Netflix, Electronic Arts, Take-Two Interactive, and other media/entertainment companies were moved from Information Technology to Communication Services. This was the biggest GICS restructuring in its history and reflected how these companies compete more in the attention/advertising economy than in technology infrastructure.
- **2023**: Visa and Mastercard were moved from Information Technology > Data Processing & Outsourced Services to Financials > Transaction & Payment Processing Services. This corrected a long-standing oddity where the two largest payment networks were classified alongside software companies.

**Data Availability**

GICS codes are intellectual property jointly owned by MSCI and S&P Dow Jones Indices. Company-level GICS classifications are **not freely available**. They require a paid subscription to MSCI, S&P Capital IQ, Refinitiv, or similar data platforms. Individual GICS codes sometimes appear in broker research reports or fund fact sheets, but there is no free bulk download. This is the primary reason Thes1s cannot simply adopt GICS directly.

---

### 3.2 Morningstar Global Equity Classification

Morningstar's proprietary classification system is the most relevant for Thes1s because **Yahoo Finance uses Morningstar's taxonomy**. This means every sector and industry label available for free through Yahoo's API comes from Morningstar's system.

**Structure: 4 tiers (with a unique "Super Sector" layer)**

| Tier | Count | Description |
|------|-------|-------------|
| Super Sector | 3 | Cyclical, Defensive, Sensitive |
| Sector | 11 | Matches standard sector count |
| Industry Group | ~69 | Intermediate grouping |
| Industry | ~148 | Most granular level |

The exact count of industry groups and industries varies slightly by source and version. Morningstar periodically adds industries (e.g., to cover emerging sectors) without announcing formal version numbers. The numbers above reflect the current structure as exposed through Yahoo Finance.

**The 3 Super Sectors**

This is Morningstar's most distinctive feature. Every sector is classified into one of three macro groups based on economic cycle sensitivity:

| Super Sector | Sectors Included | Economic Behavior |
|-------------|-----------------|-------------------|
| **Cyclical** | Basic Materials, Consumer Cyclical, Financial Services, Real Estate | Revenue and earnings swing significantly with economic cycles. These companies do well in expansions and poorly in recessions. |
| **Defensive** | Consumer Defensive, Healthcare, Utilities | Revenue and earnings are relatively stable regardless of economic conditions. People still buy food, medicine, and electricity in recessions. |
| **Sensitive** | Communication Services, Energy, Industrials, Technology | Revenue is somewhat cyclical but not as extreme as Cyclical sectors. These companies are sensitive to business spending and capital investment cycles. |

This super sector layer is genuinely useful for Rule One investing. When assessing a company's predictability (a core Rule One criterion), knowing whether it operates in a cyclical, defensive, or sensitive sector provides immediate context for how to interpret revenue volatility and growth rate consistency.

**The 11 Sectors (Morningstar names — these are what Yahoo Finance displays)**

| # | Morningstar Sector | GICS Equivalent |
|---|-------------------|-----------------|
| 1 | Basic Materials | Materials |
| 2 | Communication Services | Communication Services |
| 3 | Consumer Cyclical | Consumer Discretionary |
| 4 | Consumer Defensive | Consumer Staples |
| 5 | Energy | Energy |
| 6 | Financial Services | Financials |
| 7 | Healthcare | Health Care |
| 8 | Industrials | Industrials |
| 9 | Real Estate | Real Estate |
| 10 | Technology | Information Technology |
| 11 | Utilities | Utilities |

Note the naming differences from GICS: "Consumer Cyclical" vs "Consumer Discretionary," "Consumer Defensive" vs "Consumer Staples," "Financial Services" vs "Financials," "Technology" vs "Information Technology." The Thes1s app already uses Morningstar naming throughout because our SIC classification system was built to match Yahoo labels.

**Classification Methodology**

Morningstar classifies companies based on the largest sources of revenue and income, drawing from:
- 10-K and 10-Q filings (primary source)
- Company investor presentations and earnings calls
- Analyst team judgment for ambiguous cases

A dedicated Morningstar analyst team reviews classifications quarterly, which is more frequent than GICS's annual review. Companies filing 8-K reports disclosing major reorganizations may trigger immediate reclassification.

**Data Availability**

Morningstar's full 4-tier taxonomy with company-level assignments is proprietary and requires a Morningstar Direct or similar subscription. However, Yahoo Finance exposes **two of the four tiers for free**: the Sector and Industry labels. This gives us 11 sectors and ~148 industries for every stock Yahoo covers (~7,000+ US equities), accessible through the `yahoo-finance2` npm package that's already integrated into the app.

This is our single most valuable free data source for classification.

---

### 3.3 ICB (FTSE Russell)

The Industry Classification Benchmark (ICB) is maintained by FTSE Russell, a subsidiary of the London Stock Exchange Group. It is the primary classification system for European and global indices, including the FTSE 100, FTSE All-World, and Russell 2000 indices.

**Structure: 4 tiers**

| Tier | Count | Code Digits | Note |
|------|-------|-------------|------|
| Industry | 11 | 2 digits (10-65) | Confusingly, ICB calls its TOP level "Industry" |
| Supersector | 20 | 4 digits | |
| Sector | 45 | 6 digits | |
| Subsector | 173 | 8 digits | |

The naming is inverted compared to most other systems — ICB's "Industry" is the broadest level (equivalent to GICS's "Sector"), while ICB's "Subsector" is the most granular (equivalent to GICS's "Sub-Industry"). This naming convention causes endless confusion in cross-system comparisons.

**The 11 Industries with breakdown counts**

| Code | Industry | Supersectors | Sectors | Subsectors |
|------|----------|-------------|---------|-----------|
| 10 | Technology | 1 | 2 | 8 |
| 15 | Telecommunications | 1 | 2 | 3 |
| 20 | Health Care | 1 | 3 | 10 |
| 30 | Financials | 3 | 8 | 17 |
| 35 | Real Estate | 1 | 2 | 13 |
| 40 | Consumer Discretionary | 5 | 8 | 39 |
| 45 | Consumer Staples | 2 | 4 | 13 |
| 50 | Industrials | 2 | 7 | 38 |
| 55 | Basic Materials | 2 | 4 | 17 |
| 60 | Energy | 1 | 2 | 9 |
| 65 | Utilities | 1 | 3 | 6 |

**Classification Methodology**

ICB classifies companies based on revenue from audited annual accounts. Each company is reviewed annually and assigned to a single subsector. The methodology is straightforward: find the business line that generates the most revenue, and classify accordingly.

**Key Differences from GICS and Morningstar**

- **Telecommunications is separate.** ICB maintains Telecommunications as its own top-level industry, while GICS and Morningstar fold it into the broader Communication Services sector. This matters because telecom companies (AT&T, Verizon) have very different business models and competitive dynamics than digital media companies (Google, Meta).
- **Consumer Discretionary is the deepest sector.** With 5 supersectors, 8 sectors, and 39 subsectors, ICB provides by far the most detailed breakdown of consumer-facing businesses. This includes separate supersectors for Automobiles & Parts, Consumer Products & Services, Media, Retail, and Travel & Leisure.
- **Real Estate has 13 subsectors.** ICB provides more granular REIT classification than most systems, distinguishing between industrial, office, residential, retail, storage, specialty, and other REIT types.

**Recent Changes**

In a 2019 update, ICB added Cannabis Producers and Transaction Processing Services as new subsectors, reflecting the legalization of cannabis in several jurisdictions and the growing importance of payment processing as a distinct business.

**Data Availability**

ICB classifications are available for companies in FTSE indices and through FTSE Russell data products. They are **not freely available** for individual US stocks outside of index membership lists. Not usable as a primary data source for Thes1s.

---

### 3.4 Bloomberg BICS

The Bloomberg Industry Classification System (BICS) is the deepest and most sophisticated taxonomy available, but it is locked behind the Bloomberg Terminal — the most expensive data platform in finance.

**Structure: Up to 7 tiers**

| Level | Approximate Count | Description |
|-------|-------------------|-------------|
| Level 1 | 11 Sectors | Broadest grouping |
| Level 2 | ~80 Industry Groups | |
| Level 3 | ~180 Industries | |
| Level 4 | ~400 Sub-Industries | |
| Level 5 | ~700 Segments | Company segment-level |
| Level 6 | ~1,100 Sub-Segments | |
| Level 7 | ~1,600 Activities | Most granular |

Total: approximately 1,600+ categories across all levels, covering 60,000+ global equities.

**Classification Methodology**

BICS uses revenue as its primary classification signal but adds a critical innovation: **segment-level classification**. Starting at Level 5, BICS classifies individual business segments within a company, not just the company as a whole. This means Amazon has separate BICS codes for its retail operations, AWS cloud computing, advertising business, and subscription services.

BICS is also the most aggressively updated system. Bloomberg maintains a continuous review process (not quarterly or annual), reclassifying companies as their business mix shifts.

**Key Difference: Segment-Level Classification**

This is BICS's most important feature and the one most relevant to Thes1s's design goals. By classifying at the segment level, BICS can accurately represent companies like:
- **Amazon**: Retail (L5) + Cloud Computing (L5) + Digital Advertising (L5) + Subscriptions (L5)
- **Alphabet**: Digital Advertising (L5) + Cloud Computing (L5) + Hardware (L5) + Autonomous Vehicles (L5)
- **Berkshire Hathaway**: Insurance (L5) + Railroads (L5) + Utilities (L5) + Consumer Products (L5)

No other system except FactSet RBICS offers this capability.

**Recent Updates (2024)**

Bloomberg has added or expanded categories for:
- Electric Vehicle Manufacturers (separate from legacy auto)
- Cryptocurrency and Blockchain companies
- AI and Machine Learning companies
- Space and Satellite companies
- Renewable Energy subsectors

These additions reflect real market evolution that older systems like SIC and even GICS have been slow to address.

**Data Availability**

BICS is available **exclusively through the Bloomberg Terminal**, which costs approximately $24,000/year per seat. Completely proprietary, no free access of any kind. Not usable for Thes1s.

---

### 3.5 Yahoo Finance Classification

Yahoo Finance does not maintain its own classification system. It uses **Morningstar's Global Equity Classification** — the same taxonomy described in Section 3.2. This has been confirmed by matching the exact sector and industry names used on Yahoo Finance with Morningstar's published taxonomy.

**Structure: 2 tiers exposed publicly**

| Tier | Count | What Yahoo Shows |
|------|-------|-----------------|
| Sector | 11 | Morningstar sector names |
| Industry | ~148 | Morningstar industry names |

Yahoo does not expose the Super Sector or Industry Group tiers from Morningstar's full taxonomy. Users see only sector and industry for each stock.

**How to Access**

Yahoo Finance exposes classification data through its quoteSummary endpoint, specifically the `assetProfile` module:

```javascript
// Using yahoo-finance2 (already in the Thes1s app)
const data = await yahooFinance.quoteSummary('AAPL', { modules: ['assetProfile'] });
// Returns: { sector: 'Technology', industry: 'Consumer Electronics' }
```

- **Free**: No API key needed. The `yahoo-finance2` npm library handles cookie-based authentication automatically.
- **Rate limit**: Approximately 2,000 requests per hour. Sufficient for batch processing with caching.
- **Coverage**: Virtually all US-listed equities (~7,000-8,000 tickers). Some ADRs and micro-cap stocks may lack `assetProfile` data.

**The 11 Sectors** (identical to Morningstar)

1. Basic Materials
2. Communication Services
3. Consumer Cyclical
4. Consumer Defensive
5. Energy
6. Financial Services
7. Healthcare
8. Industrials
9. Real Estate
10. Technology
11. Utilities

**Sample Industries per Sector** (partial list of the ~148 total)

| Sector | Example Industries |
|--------|-------------------|
| Technology | Software - Application, Software - Infrastructure, Semiconductors, Consumer Electronics, Information Technology Services, Electronic Components, Scientific & Technical Instruments |
| Healthcare | Drug Manufacturers - General, Biotechnology, Medical Devices, Health Information Services, Healthcare Plans, Diagnostics & Research |
| Consumer Cyclical | Internet Retail, Restaurants, Apparel Retail, Auto Manufacturers, Home Improvement Retail, Leisure, Residential Construction |
| Financial Services | Banks - Diversified, Banks - Regional, Insurance - Property & Casualty, Asset Management, Credit Services, Financial Data & Stock Exchanges |
| Communication Services | Internet Content & Information, Telecom Services, Entertainment, Electronic Gaming & Multimedia, Advertising Agencies, Broadcasting |

**Why This Matters for Thes1s**

Yahoo Finance is our PRIMARY free data source for company classification. Key advantages:
1. The app already has the `yahoo-finance2` library integrated
2. Sector + industry labels are available for ~7,000 US equities
3. Morningstar's analyst team maintains accuracy (quarterly reviews)
4. The naming convention is already used throughout the Thes1s app (our SIC map uses Morningstar sector names)
5. No API key or subscription cost

The main limitation: Yahoo only gives us 2 of Morningstar's 4 tiers. We get sector and industry but not the intermediate industry group. This is why the Thes1s taxonomy must define its own industry group layer to bridge between Yahoo's broad sectors and specific industries.

---

### 3.6 FactSet RBICS

The Revenue-Based Industry Classification System (RBICS) is FactSet's answer to the single-classification limitation of GICS and Morningstar. It is the most methodologically sophisticated system for handling multi-segment companies.

**Structure: 6 tiers**

| Tier | Approximate Count | Description |
|------|-------------------|-------------|
| Economy | 14 | 12 anchor economies + 2 specialty |
| Sector | ~50 | |
| Sub-Sector | ~120 | |
| Industry Group | ~350 | |
| Industry | ~800 | |
| Sub-Industry | ~1,400 | |

**The 14 Economies** (top level)

RBICS uses a unique top-level concept called "Economies" rather than sectors. The 12 anchor economies are: Consumer Non-Cyclicals, Consumer Cyclicals, Energy, Finance, Healthcare, Industrials, Materials, Non-Energy Minerals, Real Estate, Technology, Telecommunications, Utilities. The 2 specialty economies are: Government Activity and Not Classified.

**Key Innovation: Revenue-Weighted Multi-Segment Mapping**

RBICS's defining feature is that it maps every company to MULTIPLE sub-industries, each weighted by the percentage of revenue that segment contributes. This is fundamentally different from every other system except Bloomberg BICS.

For example, Amazon under RBICS:
- ~60% Online/E-Commerce Retail
- ~17% Cloud Computing & Data Services
- ~8% Digital Advertising Services
- ~7% Subscription Services (Prime)
- ~5% Physical Retail (Whole Foods)
- ~3% Other (devices, etc.)

This mapping is called "RBICS with Revenue" and covers approximately 45,000 companies globally. Each company's reported business segments (from 10-K filings) are standardized into the lowest RBICS levels with revenue percentages.

**Methodology: Bottom-Up + Top-Down**

RBICS uses a hybrid approach:
- **Bottom-up for Levels 4-6** (Industry Group through Sub-Industry): Companies are classified by the specific products and services they sell. This is purely revenue-based.
- **Top-down for Levels 1-3** (Economy through Sub-Sector): Higher-level groupings are informed by market behavior and stock co-movement, not just business description. This means companies that trade similarly get grouped together at the sector level, even if their specific products differ.

**Data Availability**

RBICS is proprietary and requires a FactSet subscription. Pricing varies but typically starts at several thousand dollars per year for institutional clients. No free access.

**Why It Matters for Thes1s**

We cannot use RBICS data directly, but its multi-segment concept is worth adopting. Even with free data sources, we can build a simplified version:
1. Use Yahoo's single classification as the primary assignment
2. In Phase 3 (future), extract revenue segment disclosures from 10-K filings
3. Map each segment to a Thes1s industry, creating primary + secondary classifications with approximate revenue weights
4. This enables much better peer comparison for conglomerates and multi-segment companies

---

## 4. Comparative Analysis

### 4.1 Structural Comparison Matrix

| Feature | GICS | Morningstar | ICB | BICS | Yahoo | RBICS |
|---------|------|-------------|-----|------|-------|-------|
| **Provider** | MSCI + S&P | Morningstar | FTSE Russell | Bloomberg | Yahoo (Morningstar) | FactSet |
| **Year Created** | 1999 | ~2010 | 2005 (current form) | ~2011 | N/A (uses Morningstar) | ~2003 |
| **Tier Count** | 4 | 4 | 4 | 7 | 2 (exposed) | 6 |
| **Sectors** | 11 | 11 (+ 3 Super) | 11 | 11 | 11 | 14 |
| **Industry Groups** | 25 | ~69 | 20 (Supersectors) | ~80 (L2) | — | ~50 |
| **Industries** | 74 | ~148 | 45 | ~180 (L3) | ~148 | ~800 |
| **Most Granular** | 163 Sub-Ind. | ~148 Industries | 173 Subsectors | ~1,600 (L7) | ~148 | ~1,400 |
| **Primary Signal** | Revenue | Revenue + Income | Revenue | Revenue | Revenue + Income | Revenue (segment-level) |
| **Multi-Segment** | No (single) | No (single) | No (single) | Yes (segment) | No (single) | Yes (weighted %) |
| **Review Frequency** | Annual | Quarterly | Annual | Continuous | Follows Morningstar | Continuous |
| **Free Data?** | No | No | No | No | **YES** | No |
| **US Coverage** | ~5,000+ | ~5,000+ | ~3,000 US | ~8,000+ US | ~7,000+ | ~8,000+ |
| **Global Coverage** | ~50,000 | ~40,000+ | ~70,000+ | ~60,000+ | ~50,000+ | ~45,000+ |
| **Update Lag** | Annual cycle | Quarterly | Annual cycle | Real-time | Quarterly | Real-time |

**Key Takeaway**: Yahoo Finance is the only system that provides free company-level classifications with acceptable accuracy and coverage. Every other system requires a paid subscription ranging from hundreds to tens of thousands of dollars per year.

### 4.2 Classification Criteria Differences

All six systems agree that **revenue is the most important signal** for classifying a company. But they diverge on secondary criteria and edge case handling:

**Revenue-first systems (GICS, ICB, RBICS)**
These systems look primarily at where a company's revenue comes from. If 55% of revenue is from cloud computing and 45% from advertising, the company goes in cloud computing. This approach is objective and reproducible but can produce counterintuitive results — a company perceived by the market as a "tech company" might get classified in Consumer Discretionary if most of its revenue comes from retail sales.

**Revenue + earnings + perception (Morningstar, BICS)**
These systems supplement revenue analysis with earnings contribution and market perception. If a company's most profitable segment is different from its largest revenue segment, the profitable segment may get more weight. If Wall Street overwhelmingly treats a company as a "tech stock" (analyst coverage, ETF inclusion, trading correlations), that perception influences classification. This approach better matches how investors actually think about companies but introduces subjectivity.

**Revenue at segment level (BICS, RBICS)**
Bloomberg and FactSet go further by classifying individual business segments within a company, not just the company as a whole. This is the most accurate approach for multi-segment companies but requires vastly more data collection and maintenance effort.

**For Rule One investing**, revenue-based classification is the right approach. Rule One analysis focuses on competitive dynamics — who competes for the same customers, who has the same cost structures, who faces the same barriers to entry. Revenue source is the best proxy for competitive positioning. Market perception (stock correlations) is less useful because Rule One explicitly rejects the efficient market hypothesis.

### 4.3 Multi-Segment Handling Approaches

How each system handles a company like Amazon (retail + cloud + advertising + streaming + logistics):

| System | Approach | Amazon Classification |
|--------|----------|----------------------|
| **GICS** | Single classification by dominant revenue | Consumer Discretionary > Broadline Retail |
| **Morningstar** | Single classification by revenue + earnings | Consumer Cyclical > Internet Retail |
| **ICB** | Single classification by revenue | Consumer Discretionary > General Retailers |
| **BICS** | Multi-segment at L5+ | Retail (L5) + Cloud (L5) + Advertising (L5) + ... |
| **Yahoo** | Single classification (Morningstar) | Consumer Cyclical > Internet Retail |
| **RBICS** | Revenue-weighted multi-segment | Retail 60%, Cloud 17%, Advertising 8%, ... |

**The fundamental trade-off**: Single-classification systems are simpler to build, query, and maintain. Multi-segment systems are more accurate but require 5-10x more data collection, more complex data models, and ongoing revenue segment tracking.

**Recommendation for Thes1s**: Start with single classification (like GICS/Morningstar). This is what Yahoo data provides, and it covers 90% of use cases. Add an optional secondary classification field for multi-segment companies in a future phase when 10-K revenue segment parsing is implemented. Flag known conglomerates with `isConglomerate: true` so the UI can display a warning that peer comparison may be incomplete.

### 4.4 Modern Industry Coverage

One of the most important criteria for a useful taxonomy is whether it properly handles industries that have emerged in the last 10-20 years. Here is how each system covers modern industries:

| Modern Industry | SIC | GICS | Morningstar | ICB | BICS | RBICS |
|----------------|-----|------|-------------|-----|------|-------|
| SaaS / Cloud Software | No | Partial | Yes | Partial | Yes | Yes |
| Fintech / Digital Payments | No | Yes (2023) | Yes | Partial | Yes | Yes |
| Electric Vehicles | No | Partial | Partial | Partial | Yes (2024) | Yes |
| Streaming Media | No | Yes | Yes | Partial | Yes | Yes |
| Cryptocurrency / Blockchain | No | No | Partial | Partial | Yes (2024) | Partial |
| AI / Machine Learning | No | No | No | No | Yes (2024) | Partial |
| Cannabis | No | No | Partial | Yes (2019) | Partial | Partial |
| Cybersecurity | No | Partial | Yes | Partial | Yes | Yes |
| Space / Aerospace (commercial) | Partial | Yes | Yes | Yes | Yes | Yes |
| Renewable Energy | No | Yes | Yes | Partial | Yes | Yes |
| Gig Economy / Sharing | No | No | Partial | No | Yes | Partial |
| BNPL (Buy Now Pay Later) | No | No | No | No | Yes | Partial |
| Telemedicine / Digital Health | No | No | Partial | No | Yes | Partial |
| Edge Computing | No | No | No | No | Yes | No |
| Quantum Computing | No | No | No | No | Partial | No |

**Key observations**:
- **SIC covers almost nothing modern.** It is a 1937 system last updated in 1987. Everything since the internet was invented is missing.
- **GICS is conservative but improving.** The 2018 Communication Services restructuring and 2023 Visa/Mastercard reclassification show GICS is willing to evolve, but slowly.
- **Morningstar/Yahoo is good for established modern industries.** SaaS, fintech, cybersecurity, and streaming all have dedicated industries. But truly emerging categories (AI, blockchain, quantum) are not yet broken out.
- **Bloomberg BICS leads in emerging industry coverage.** Its 2024 updates added EV, crypto, and AI categories. This is the advantage of a continuous review process backed by a large analyst team.
- **No system covers AI/ML as a separate industry yet.** This is the biggest gap across all taxonomies. AI companies are currently classified under Software, Semiconductors, or IT Services depending on their primary product.

**For Thes1s**: We should include explicit industries for SaaS/Cloud, Fintech (with sub-categories), EV Manufacturers, Streaming, Cybersecurity, AI/ML, Cannabis, and Renewable Energy. These are industries where a Rule One investor needs peer comparisons that legacy taxonomies cannot provide.

### 4.5 Where Systems Disagree (Case Studies)

The most revealing way to evaluate classification systems is to look at specific companies where the systems assign different labels. These disagreements highlight each system's priorities and blind spots.

#### Amazon (AMZN)

| System | Classification |
|--------|---------------|
| SIC | 5961 "Catalog & Mail-Order Houses" |
| GICS | Consumer Discretionary > Broadline Retail |
| Morningstar/Yahoo | Consumer Cyclical > Internet Retail |
| RBICS | Multi-segment: Retail ~60%, Cloud ~17%, Advertising ~8%, Subscriptions ~7% |

**Analysis**: SIC's classification is absurd — Amazon is not a mail-order catalog business. GICS and Morningstar both classify by dominant revenue (retail), which is technically correct but misleading for investors. AWS alone generates more operating income than the entire retail business. An investor comparing Amazon to Walmart and Target (GICS peers) misses the cloud competition with Microsoft and Google. RBICS's multi-segment approach is the most accurate but requires segment-level data.

**Thes1s solution**: Classify Amazon as Consumer Cyclical > Retail > Retail - Broadline / E-Commerce (primary). Flag as `isConglomerate: true` with secondary classification in Technology > IT Services > Cloud Computing Infrastructure.

#### Tesla (TSLA)

| System | Classification |
|--------|---------------|
| SIC | 3711 "Motor Vehicles & Passenger Car Bodies" |
| GICS | Consumer Discretionary > Automobiles |
| Morningstar/Yahoo | Consumer Cyclical > Auto Manufacturers |
| BICS | Has separate EV classification since 2024 |

**Analysis**: All legacy systems classify Tesla with traditional automakers (Ford, GM, Toyota). This is defensible on revenue — Tesla's revenue is overwhelmingly from vehicle sales. But Tesla also competes in energy storage (vs. Enphase, SunPower), solar (vs. First Solar), and autonomous driving / AI (vs. Waymo, Cruise). For peer benchmarking purposes, comparing Tesla's margins to legacy automakers is useful but incomplete.

**Thes1s solution**: Classify Tesla as Consumer Cyclical > Auto & Vehicles > Auto Manufacturers - Electric Vehicles. The explicit EV sub-industry allows peer comparison with Rivian, Lucid, and other EV pure-plays while keeping Tesla in the broader auto sector for traditional comparisons.

#### Alphabet / Google (GOOGL)

| System | Classification |
|--------|---------------|
| SIC | 7370 "Computer Programming, Data Processing, Etc." |
| GICS | Communication Services > Interactive Media & Services (moved from IT in 2018) |
| Morningstar/Yahoo | Communication Services > Internet Content & Information |

**Analysis**: The 2018 GICS reclassification of Alphabet from IT to Communication Services was controversial. The argument: Alphabet's revenue is 80%+ advertising, which makes it a media/advertising company, not a technology company. Counter-argument: Alphabet's competitive advantage is technology (search algorithm, AI, cloud infrastructure), not media content. For Rule One moat analysis, Alphabet's moats are network effects and switching costs — patterns more common in technology than in media.

**Thes1s solution**: Classify as Communication Services > Internet & Digital Media > Digital Advertising Platforms. This puts Alphabet in the same peer group as Meta (its closest competitor for digital advertising dollars) while distinguishing it from traditional media and telecom.

#### Berkshire Hathaway (BRK.A / BRK.B)

| System | Classification |
|--------|---------------|
| SIC | 6311 "Life Insurance" |
| GICS | Financials > Financial Conglomerates |
| Morningstar/Yahoo | Financial Services > Insurance - Diversified |

**Analysis**: Berkshire Hathaway is the ultimate classification challenge. It owns GEICO (insurance), BNSF Railway (transportation), Berkshire Hathaway Energy (utilities), Dairy Queen (restaurants), See's Candies (food), Precision Castparts (aerospace), and a massive public equity portfolio. No single industry captures Berkshire's business. SIC's "Life Insurance" code is particularly misleading — Berkshire is primarily a property & casualty insurer, not a life insurer.

**Thes1s solution**: Classify as Special Classifications > Holding Companies & Conglomerates > Conglomerates. Flag as `isConglomerate: true`. The Special Classifications sector is specifically designed for companies that cannot be meaningfully placed in a single industry.

#### Lululemon (LULU)

| System | Classification |
|--------|---------------|
| SIC | 5651 "Family Clothing Stores" |
| GICS | Consumer Discretionary > Apparel, Accessories & Luxury Goods |
| Morningstar/Yahoo | Consumer Cyclical > Apparel Retail |

**Analysis**: SIC groups Lululemon with Target and TJ Maxx — stores that sell clothing to families. GICS puts it in the manufacturing/brand-owner category alongside luxury brands. Morningstar puts it in the retail category. None of these produce the peer group a Rule One investor needs. Lululemon competes with Nike, Adidas, and Under Armour for athletic/lifestyle apparel customers. Its moat analysis should be compared against these athletic brands, not against general retailers or luxury goods companies.

**Thes1s solution**: Classify as Consumer Cyclical > Apparel & Luxury > Apparel - Athletic & Lifestyle (20201010). This industry code groups Lululemon with Nike, Adidas, Under Armour, and other athletic/lifestyle brands — the true competitive set.

---

## 5. Free Data Source Catalog

### 5.1 SEC EDGAR APIs and Data

All SEC EDGAR data is free and publicly available with no API key required. The only requirement is a properly formatted `User-Agent` header identifying the requester. Rate limit: 10 requests per second.

| Source | URL / Endpoint | What It Provides | Format |
|--------|---------------|-----------------|--------|
| Company Tickers | `https://www.sec.gov/files/company_tickers.json` | All tickers with CIK numbers and company names (~13,000 entries). This is the universe of SEC filers. | JSON |
| Submissions | `https://data.sec.gov/submissions/CIK{cik10}.json` | SIC code, SIC description, company name, filing history, stock exchange, state of incorporation, fiscal year end | JSON |
| Frames API | `https://data.sec.gov/api/xbrl/frames/us-gaap/{tag}/{unit}/CY{year}.json` | Financial data for ALL companies reporting a given metric in a given year. Used for peer metric comparison. | JSON |
| Company Facts | `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik10}.json` | Complete XBRL financial history for one company — every metric they've ever reported. | JSON |
| Full-Text Search | `https://efts.sec.gov/LATEST/search-index?q={query}&dateRange=custom&startdt=...` | Search across all SEC filing text. Can find 10-K business descriptions by keyword. | JSON |
| Browse EDGAR | `https://www.sec.gov/cgi-bin/browse-edgar?SIC={sic}&action=getcompany` | All companies filing under a given SIC code. Returns company list with CIK, name, state. | HTML/ATOM |
| Bulk Submissions | `https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip` | Complete metadata for all ~13,000 filers in one download (~600MB). Includes SIC codes. | ZIP containing JSON |

**Key for taxonomy building**:
- `company_tickers.json` gives us the complete universe of tickers to classify
- `submissions/{CIK}.json` gives SIC codes and descriptions for every filer
- Bulk download avoids per-company rate limiting for the initial seed
- Full-Text Search can locate 10-K Item 1 (Business Description) for NLP-based classification in Phase 2

### 5.2 Yahoo Finance Data

Free via the `yahoo-finance2` npm package, which is already integrated into the Thes1s app.

| Endpoint | What It Provides | Rate Limit | Notes |
|----------|-----------------|-----------|-------|
| `quoteSummary` (assetProfile module) | Sector, Industry, Company Description, Number of Employees, Website, Address, Officers | ~2,000/hour | Primary source for classification |
| `quoteSummary` (financialData module) | Revenue, earnings, margins, analyst targets, price metrics | ~2,000/hour | Useful for validation |
| `quote` (batch) | Market cap, P/E, EPS, book value, dividend yield, shares outstanding | ~2,000/hour | Already used by `batchQuotes.js` |
| `chart` | Historical price data (daily/weekly/monthly) | Generous | Already used by `prices.js` |

**Coverage**: ~7,000-8,000 US equities. Good coverage of all NYSE, NASDAQ, and AMEX listed stocks. Some gaps:
- Very small micro-cap stocks may lack `assetProfile` data
- Some ADRs (foreign companies listed in the US) have incomplete profiles
- Recently listed companies (IPOs within last few weeks) may not have sector/industry populated yet
- Delisted companies are not accessible

**Example response** from `quoteSummary('LULU', { modules: ['assetProfile'] })`:
```
{
  sector: "Consumer Cyclical",
  industry: "Apparel Retail",
  longBusinessSummary: "lululemon athletica inc. designs and distributes athletic apparel...",
  fullTimeEmployees: 38000,
  website: "https://www.lululemon.com",
  ...
}
```

### 5.3 Other Free Sources

| Source | What It Provides | URL | Access Method | Notes |
|--------|-----------------|-----|--------------|-------|
| **Finviz** | Sector, industry labels, 100+ screening metrics for ~8,000 US equities | `finviz.com/quote.ashx?t={TICKER}` | HTML scraping via Cheerio (already in deps) | Uses a Morningstar-like taxonomy. Good for cross-validation. |
| **Wikipedia** | Company descriptions, industry lists, competitor tables | Various pages | Manual or API | Useful for validation and edge case research, not bulk classification |
| **NAICS Crosswalk** | Official SIC-to-NAICS mapping tables | `census.gov/naics` | CSV download | Government-published crosswalk. Useful for bridging SIC to a somewhat more modern system, but NAICS has similar problems to SIC for investment analysis. |
| **SEC Full-Text Search** | 10-K business descriptions (Item 1) | `efts.sec.gov/LATEST/search-index` | JSON API | Can extract the business description section from annual filings for NLP-based classification. Covered in Section 5.1 but worth highlighting as a classification source. |
| **OpenFIGI** | Financial Instrument Global Identifier mapping | `openfigi.com/api` | REST API (free tier: 20/min) | Maps tickers to global identifiers. Not directly useful for classification but helpful for cross-referencing international securities. |

### 5.4 Data Quality and Coverage Assessment

| Source | Coverage | Accuracy | Freshness | Cost | Integration Effort |
|--------|----------|----------|-----------|------|-------------------|
| SEC SIC codes | ~13,000 filers | Low (self-reported, stale) | Poor (companies rarely update SIC) | Free | Already integrated |
| Yahoo sector/industry | ~7,000 equities | High (Morningstar analyst-maintained) | Good (quarterly review) | Free | Already integrated |
| Finviz sector/industry | ~8,000 equities | High | Good | Free (scraping) | Moderate (already have Cheerio) |
| 10-K business descriptions | ~8,000 annual filers | Very high (company-written) | Annual (10-K filing) | Free | Moderate (text extraction + NLP) |
| NAICS crosswalk | N/A (mapping table) | Moderate | Static | Free | Low |

**Assessment and recommendation**: The optimal seed strategy is **Yahoo + SIC cross-reference**:

1. Yahoo provides high-accuracy Morningstar classifications for ~7,000 equities. This covers every company a Rule One investor would reasonably research (all large-cap, nearly all mid-cap, most small-cap).
2. SIC provides classifications for the remaining ~6,000 filers that Yahoo doesn't cover. These are mostly micro-cap, OTC, and inactive companies — low priority for research but worth including for completeness.
3. Cross-referencing: Where both Yahoo and SIC data are available, agreement between the two sources produces high confidence (0.9). Disagreement flags the company for manual review.
4. The app already has both data sources integrated (`yahoo-finance2` for Yahoo, EDGAR submissions API for SIC), so the implementation cost is primarily in building the crosswalk mapping tables.

---

## 6. Thes1s Taxonomy Design

### 6.1 Design Principles

The Thes1s taxonomy is purpose-built for Rule One investment research. It is not trying to replicate GICS or Morningstar — it borrows from both while optimizing for the specific needs of a single-user research app. Six design principles guide every decision:

1. **Competitive grouping.** Companies are grouped by who they compete with for customers and revenue, not by production process (SIC), stock behavior (RBICS Level 1-3), or government economic tracking. The test: "Would a Rule One investor compare these two companies as peers?" If yes, they belong in the same industry.

2. **Morningstar-aligned naming.** Sector names match Morningstar/Yahoo conventions (Technology, Consumer Cyclical, Consumer Defensive, Financial Services, Healthcare, etc.). The app already uses these names throughout the UI, and Yahoo data maps directly. No renaming tax.

3. **GICS-like structure.** Three tiers with numeric codes, cleanly hierarchical. Each company gets exactly one primary classification. Simple to implement, query, and display.

4. **Modern industry coverage.** Explicit categories for SaaS, fintech (with sub-categories), EVs, streaming, cybersecurity, AI/ML, cannabis, blockchain/crypto, space, and renewable energy. These industries exist today and have publicly traded companies competing within them. A taxonomy that ignores them is a taxonomy that fails investors.

5. **Rule One optimized.** Granularity is tuned for two specific use cases: (a) peer benchmarking — each industry should have roughly 5-30 public companies for meaningful comparison, and (b) moat analysis — industries are grouped by competitive dynamics so that moat patterns (switching costs, network effects, brand, cost advantages) are shared within a group.

6. **Buildable from free data.** Every company must be classifiable using only freely available data (Yahoo sector/industry + SIC code + 10-K business description). No dependency on paid data subscriptions.

### 6.2 Tier Structure and Category Counts

| Tier | Code Digits | Count | Description |
|------|-------------|-------|-------------|
| **Sector** | Digits 1-2 (10-99) | 12 | 11 standard sectors + 1 Special Classifications |
| **Industry Group** | Digits 1-4 (1010-9999) | 59 | Intermediate grouping within sectors |
| **Industry** | Digits 1-8 (10101010-99999999) | 152 | Most granular level — the peer comparison unit |

Why 3 tiers instead of 4 (like GICS)? Three tiers match the app's existing data model (`sector` / `industryGroup` / `industry`) and avoid unnecessary complexity. The Thes1s taxonomy's ~150 industries are comparable in count to Morningstar's ~148, which is the right granularity for a single-user research app. GICS's 163 sub-industries add marginal value at the cost of more complex crosswalk maintenance.

### 6.3 Complete Taxonomy Tree

This is the core deliverable of this report. Every publicly traded US company should map to one of the following industries.

---

#### Technology (10)

##### Software (1010)
- Software - Application (10101010)
- Software - Infrastructure (10101020)
- Software - SaaS / Cloud (10101030)
- Software - Cybersecurity (10101040)
- Software - AI & Machine Learning (10101050)

##### Hardware (1020)
- Consumer Electronics (10201010)
- Computer Hardware (10201020)
- Computer Storage & Peripherals (10201030)
- Communication Equipment (10201040)
- Scientific & Technical Instruments (10201050)

##### Semiconductors (1030)
- Semiconductors (10301010)
- Semiconductor Equipment & Materials (10301020)

##### Electronic Components (1040)
- Electronic Components (10401010)
- Electronic Manufacturing Services (10401020)

##### IT Services (1050)
- Information Technology Services (10501010)
- Internet Services & Infrastructure (10501020)
- Data Processing & Outsourced Services (10501030)
- Cloud Computing Infrastructure (10501040)

##### Technology Distributors (1060)
- Technology Distributors (10601010)

**Technology total**: 6 industry groups, 18 industries

---

#### Communication Services (15)

##### Telecom (1510)
- Telecom - Diversified (15101010)
- Telecom - Wireless (15101020)
- Telecom - Regional (15101030)

##### Media & Entertainment (1520)
- Entertainment - Diversified (15201010)
- Entertainment - Streaming (15201020)
- Gaming & Interactive Entertainment (15201030)
- Broadcasting - TV & Radio (15201040)
- Publishing (15201050)
- Advertising & Marketing (15201060)

##### Internet & Digital Media (1530)
- Internet Content & Information (15301010)
- Social Media Platforms (15301020)
- Digital Advertising Platforms (15301030)
- Online Marketplaces (15301040)

**Communication Services total**: 3 industry groups, 13 industries

---

#### Consumer Cyclical (20)

##### Auto & Vehicles (2010)
- Auto Manufacturers (20101010)
- Auto Manufacturers - Electric Vehicles (20101020)
- Auto Parts & Equipment (20101030)
- Auto Dealerships (20101040)
- Recreational Vehicles (20101050)

##### Apparel & Luxury (2020)
- Apparel - Athletic & Lifestyle (20201010)
- Apparel - Fashion & Luxury (20201020)
- Apparel - Casual & Mass Market (20201030)
- Footwear & Accessories (20201040)
- Textile Manufacturing (20201050)

##### Retail (2030)
- Retail - Broadline / E-Commerce (20301010)
- Retail - Specialty (20301020)
- Retail - Home Improvement (20301030)
- Retail - Discount & Dollar Stores (20301040)
- Retail - Apparel & Accessories (20301050)

##### Travel & Leisure (2040)
- Lodging & Resorts (20401010)
- Restaurants & Dining (20401020)
- Travel & Booking Services (20401030)
- Leisure Products & Activities (20401040)
- Casinos & Gaming (20401050)

##### Housing & Construction (2050)
- Homebuilders (20501010)
- Building Products & Materials (20501020)
- Furnishings & Home Decor (20501030)

##### Consumer Durables (2060)
- Household Appliances (20601010)
- Tools & Hardware (20601020)
- Consumer Electronics Products (20601030)

##### Education (2070)
- Education & Training Services (20701010)

**Consumer Cyclical total**: 7 industry groups, 24 industries

---

#### Consumer Defensive (25)

##### Food & Beverage (2510)
- Beverages - Non-Alcoholic (25101010)
- Beverages - Alcoholic (25101020)
- Food - Packaged & Processed (25101030)
- Food - Confectioners & Snacks (25101040)
- Food - Meat & Dairy (25101050)

##### Household & Personal Products (2520)
- Household Products (25201010)
- Personal Products & Cosmetics (25201020)
- Tobacco (25201030)

##### Retail - Defensive (2530)
- Retail - Grocery & Supermarkets (25301010)
- Retail - Warehouse & Club (25301020)
- Retail - Pharmacy & Drug Stores (25301030)
- Retail - Convenience Stores (25301040)

##### Agriculture & Farm Products (2540)
- Agricultural Products (25401010)
- Agricultural Inputs (25401020)

**Consumer Defensive total**: 4 industry groups, 14 industries

---

#### Healthcare (30)

##### Pharmaceuticals (3010)
- Drug Manufacturers - Major (30101010)
- Drug Manufacturers - Specialty & Generic (30101020)

##### Biotechnology (3020)
- Biotechnology (30201010)

##### Medical Devices & Equipment (3030)
- Medical Devices (30301010)
- Medical Instruments & Supplies (30301020)

##### Healthcare Services (3040)
- Healthcare Providers & Facilities (30401010)
- Health Information Technology (30401020)
- Healthcare Plans & Insurance (30401030)
- Medical Distribution (30401040)

##### Diagnostics & Research (3050)
- Diagnostics & Research (30501010)
- Life Science Tools & Services (30501020)

**Healthcare total**: 5 industry groups, 11 industries

---

#### Financial Services (35)

##### Banks (3510)
- Banks - Diversified (35101010)
- Banks - Regional (35101020)
- Banks - Community (35101030)

##### Insurance (3520)
- Insurance - Life (35201010)
- Insurance - Property & Casualty (35201020)
- Insurance - Specialty (35201030)
- Insurance - Reinsurance (35201040)
- Insurance Brokers & Services (35201050)

##### Capital Markets (3530)
- Asset Management (35301010)
- Investment Banking & Brokerage (35301020)
- Financial Exchanges & Marketplaces (35301030)
- Private Equity & Venture Capital (35301040)

##### Diversified Financials (3540)
- Credit Services & Lending (35401010)
- Financial Data & Services (35401020)
- Transaction & Payment Processing (35401030)
- Consumer Finance (35401040)

##### Fintech (3550)
- Fintech - Digital Payments (35501010)
- Fintech - Digital Banking (35501020)
- Fintech - Lending Platforms (35501030)
- Fintech - Blockchain & Crypto (35501040)

##### Financial Conglomerates (3560)
- Financial Conglomerates (35601010)

**Financial Services total**: 6 industry groups, 21 industries

---

#### Industrials (40)

##### Aerospace & Defense (4010)
- Aerospace & Defense (40101010)
- Defense Electronics & Systems (40101020)
- Space & Satellite (40101030)

##### Industrial Manufacturing (4020)
- Specialty Industrial Machinery (40201010)
- Industrial Conglomerates (40201020)
- Electrical Equipment (40201030)
- Metal Fabrication (40201040)

##### Transportation (4030)
- Airlines (40301010)
- Railroads (40301020)
- Trucking & Freight (40301030)
- Marine Shipping (40301040)
- Logistics & Supply Chain (40301050)
- Air Freight & Delivery (40301060)

##### Construction & Engineering (4040)
- Engineering & Construction Services (40401010)
- Infrastructure & Heavy Construction (40401020)

##### Business Services (4050)
- Consulting & Professional Services (40501010)
- Staffing & Employment Services (40501020)
- Commercial Services & Supplies (40501030)
- Security & Protection Services (40501040)

##### Environmental Services (4060)
- Waste Management (40601010)
- Environmental Services & Remediation (40601020)
- Water Treatment & Utilities (40601030)

##### Rental & Leasing (4070)
- Rental & Leasing Services (40701010)

**Industrials total**: 7 industry groups, 21 industries

---

#### Energy (45)

##### Oil & Gas (4510)
- Oil & Gas - Integrated Majors (45101010)
- Oil & Gas - Exploration & Production (45101020)
- Oil & Gas - Refining & Marketing (45101030)
- Oil & Gas - Midstream (45101040)
- Oil & Gas - Equipment & Services (45101050)
- Oil & Gas - Drilling (45101060)

##### Renewable Energy (4520)
- Solar (45201010)
- Wind (45201020)
- Renewable Energy Equipment (45201030)
- Hydrogen & Fuel Cells (45201040)

##### Energy Storage (4530)
- Batteries & Energy Storage (45301010)

##### Coal & Consumable Fuels (4540)
- Coal & Consumable Fuels (45401010)

**Energy total**: 4 industry groups, 12 industries

---

#### Basic Materials (50)

##### Chemicals (5010)
- Chemicals - Specialty (50101010)
- Chemicals - Diversified (50101020)
- Chemicals - Agricultural (50101030)

##### Metals & Mining (5020)
- Gold Mining (50201010)
- Silver & Precious Metals Mining (50201020)
- Copper & Base Metals Mining (50201030)
- Steel (50201040)
- Aluminum (50201050)
- Other Industrial Metals & Mining (50201060)

##### Building Materials (5030)
- Building Materials (50301010)
- Lumber & Wood Production (50301020)

##### Paper & Packaging (5040)
- Paper & Forest Products (50401010)
- Packaging & Containers (50401020)

**Basic Materials total**: 4 industry groups, 14 industries

---

#### Utilities (55)

##### Electric Utilities (5510)
- Electric Utilities - Regulated (55101010)
- Electric Utilities - Independent Power Producers (55101020)

##### Gas Utilities (5520)
- Gas Utilities (55201010)

##### Multi-Utilities (5530)
- Multi-Utilities (55301010)

##### Water Utilities (5540)
- Water Utilities (55401010)

##### Renewable Utilities (5550)
- Renewable Utilities (55501010)

**Utilities total**: 5 industry groups, 6 industries

---

#### Real Estate (60)

##### REITs (6010)
- REIT - Residential (60101010)
- REIT - Office (60101020)
- REIT - Industrial (60101030)
- REIT - Retail (60101040)
- REIT - Healthcare (60101050)
- REIT - Data Center (60101060)
- REIT - Hotel & Resort (60101070)
- REIT - Specialty (60101080)
- REIT - Diversified (60101090)
- REIT - Self-Storage (60101100)
- REIT - Mortgage (60101110)
- REIT - Timber (60101120)
- REIT - Infrastructure (60101130)

##### Real Estate Services (6020)
- Real Estate Services & Brokerage (60201010)
- Real Estate Development (60201020)
- Real Estate Operating Companies (60201030)

**Real Estate total**: 2 industry groups, 16 industries

---

#### Special Classifications (99)

##### Holding Companies & Conglomerates (9910)
- Conglomerates (99101010)
- Blank Check / SPAC (99101020)
- Shell Companies (99101030)

##### Cannabis (9920)
- Cannabis - Cultivation & Retail (99201010)
- Cannabis - Pharmaceuticals (99201020)

**Special Classifications total**: 2 industry groups, 5 industries

---

#### Taxonomy Summary

| Sector | Code | Industry Groups | Industries |
|--------|------|----------------|------------|
| Technology | 10 | 6 | 18 |
| Communication Services | 15 | 3 | 13 |
| Consumer Cyclical | 20 | 6 | 25 |
| Consumer Defensive | 25 | 4 | 12 |
| Healthcare | 30 | 5 | 11 |
| Financial Services | 35 | 6 | 21 |
| Industrials | 40 | 7 | 21 |
| Energy | 45 | 3 | 12 |
| Basic Materials | 50 | 4 | 13 |
| Utilities | 55 | 4 | 6 |
| Real Estate | 60 | 2 | 14 |
| Special Classifications | 99 | 2 | 5 |
| **TOTAL** | | **52** | **171** |

Final counts: **12 sectors**, **52 industry groups**, **171 industries**.

Note: The count exceeds the initial ~150 target because Real Estate REITs (13 sub-types), Financial Services (21 industries including fintech), and the explicit modern industry additions (SaaS, cybersecurity, AI, EV, cannabis, crypto, space, streaming, etc.) each add categories that are essential for accurate peer comparison.

**Thin industry risk**: Some modern categories (Hydrogen & Fuel Cells, Space & Satellite, Cannabis sub-types, Fintech - Blockchain & Crypto) may have fewer than 5 US-listed public companies as of 2026. During Phase 2 batch classification, any industry with fewer than 5 assigned companies should be flagged for possible consolidation into its parent industry group. For peer comparison purposes, thin industries should fall back to the industry group level (4-digit code) rather than the industry level (8-digit code) to ensure useful peer groups. This is a validation step, not a design flaw — the taxonomy keeps these categories separate because the companies in them genuinely don't compete with their parent group peers.

### 6.4 Code System

The Thes1s taxonomy uses an 8-digit numeric code system. The code is hierarchical — you can determine a company's sector and industry group by reading just the first 2 or 4 digits.

**Code structure**:
```
[SS][GG][IIII]
 |   |    |
 |   |    └── Industry (4 digits, sequential within group)
 |   └─────── Industry Group (2 digits, sequential within sector)
 └─────────── Sector (2 digits: 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 99)
```

**Digit breakdown**:
- **Digits 1-2 (Sector)**: Values 10 through 99. Spaced at intervals of 5 (10, 15, 20, 25, ...) to match Morningstar's 11-sector structure, with gaps for future expansion. 99 is reserved for Special Classifications.
- **Digits 3-4 (Industry Group)**: Values 10 through 70+ within each sector. Spaced at intervals of 10 (10, 20, 30, ...) for future expansion.
- **Digits 5-8 (Industry)**: Values 1010 through 9999 within each group. Spaced at intervals of 10 (1010, 1020, 1030, ...) for future expansion.

**Examples**:

| Company | Thes1s Code | Decoded |
|---------|------------|---------|
| Lululemon (LULU) | 20201010 | Consumer Cyclical (20) > Apparel & Luxury (2020) > Apparel - Athletic & Lifestyle (20201010) |
| Apple (AAPL) | 10201010 | Technology (10) > Hardware (1020) > Consumer Electronics (10201010) |
| NVIDIA (NVDA) | 10301010 | Technology (10) > Semiconductors (1030) > Semiconductors (10301010) |
| Netflix (NFLX) | 15201020 | Communication Services (15) > Media & Entertainment (1520) > Entertainment - Streaming (15201020) |
| Tesla (TSLA) | 20101020 | Consumer Cyclical (20) > Auto & Vehicles (2010) > Auto Manufacturers - Electric Vehicles (20101020) |
| JPMorgan (JPM) | 35101010 | Financial Services (35) > Banks (3510) > Banks - Diversified (35101010) |
| CrowdStrike (CRWD) | 10101040 | Technology (10) > Software (1010) > Software - Cybersecurity (10101040) |
| Berkshire (BRK) | 99101010 | Special Classifications (99) > Holding Companies & Conglomerates (9910) > Conglomerates (99101010) |
| Enphase (ENPH) | 45201010 | Energy (45) > Renewable Energy (4520) > Solar (45201010) |
| Coinbase (COIN) | 35501040 | Financial Services (35) > Fintech (3550) > Fintech - Blockchain & Crypto (35501040) |

**Gap-based numbering**: Industry codes within a group are spaced at intervals of 10 (1010, 1020, 1030, ...). This leaves room to insert new industries between existing ones without renumbering. For example, if a new software category emerges between SaaS/Cloud (10101030) and Cybersecurity (10101040), it could be assigned code 10101035.

### 6.5 Edge Case Handling Rules

Every classification system encounters companies that do not fit neatly into a single category. The following rules provide clear, consistent handling for the most common edge cases.

#### Conglomerates

**Rule**: Classify by the dominant revenue segment. Set `isConglomerate: true` in the company record. Store a `secondaryClassification` (Thes1s code) for the second-largest segment.

**UI behavior**: When `isConglomerate: true`, the company header in the Toolbox shows both the primary and secondary classifications. The Competitors tab uses the primary classification for peer discovery but shows a note: "This is a conglomerate. Peers are based on the {primary industry} segment only."

**Examples**:
- **Berkshire Hathaway**: Primary = 99101010 (Conglomerates). Secondary = 35201020 (Insurance - P&C). The Special Classifications sector is appropriate because Berkshire's business is so diversified that no single industry captures it.
- **Amazon**: Primary = 20301010 (Retail - Broadline / E-Commerce). Secondary = 10501040 (Cloud Computing Infrastructure).
- **Alphabet**: Primary = 15301030 (Digital Advertising Platforms). Secondary = 10501040 (Cloud Computing Infrastructure).

#### SPACs and Blank Check Companies

**Rule**: Classify as 99101020 (Blank Check / SPAC) until the de-SPAC merger closes. After closing, reclassify based on the target company's business.

**Trigger for reclassification**: When an 8-K filing announces the completion of a business combination, the SPAC's classification should be updated to reflect the target company's industry.

#### REITs

**Rule**: All REITs go in Real Estate (60) > REITs (6010), with the specific REIT subtype determined by the primary property type. REITs that invest in a mix of property types go to REIT - Diversified (60101090). Mortgage REITs (which don't own physical property but invest in mortgage-backed securities) go to REIT - Mortgage (60101110).

**Exception**: Healthcare REITs that primarily operate healthcare facilities (rather than just owning the real estate) may be classified in Healthcare > Healthcare Services instead. Use the revenue test: if >50% of revenue comes from healthcare services (not rent), classify in Healthcare.

#### ADRs (American Depositary Receipts)

**Rule**: Classify by business activity, not by country of domicile. A Chinese technology company trading in the US as an ADR gets classified in the Technology sector based on what it does, same as a US-domiciled tech company. Set `isADR: true` in the company record.

**Examples**:
- **Taiwan Semiconductor (TSM)**: 10301010 (Semiconductors). `isADR: true`.
- **Alibaba (BABA)**: 20301010 (Retail - Broadline / E-Commerce). `isADR: true`.
- **Toyota (TM)**: 20101010 (Auto Manufacturers). `isADR: true`.

#### Holding Companies

**Rule**: Distinguish between financial holding companies and operating holding companies.
- **Financial holding companies** (pure investment vehicles, no operating businesses): Classify as 35601010 (Financial Conglomerates) or 99101010 (Conglomerates) depending on portfolio diversity.
- **Operating holding companies** (own and operate businesses through subsidiaries): Classify by the dominant operating segment's industry.

#### Recently IPO'd Companies

**Rule**: Use Yahoo Finance classification as the initial seed. If Yahoo does not yet have sector/industry data (common in the first few weeks after IPO), use the SIC code from the S-1 registration statement as a temporary classification. Flag as `needsReview: true` and revisit after the first 10-K filing.

#### Business Model Transitions

**Default rule**: Reclassify when a new revenue source exceeds 40% of total revenue for two consecutive fiscal years, OR exceeds 50% in a single fiscal year.

**Manual override**: A company can be reclassified immediately (without waiting for the revenue threshold) when a business model transition is clearly underway and the market already perceives the company as competing in the new industry. This requires setting `manualOverride: true` and documenting the rationale in the company assignment. Examples of valid override triggers: announced shutdown of legacy business, dominant revenue growth rate in new segment (>3x legacy), or industry reclassification by two or more major taxonomy providers (GICS, Morningstar, ICB).

**Examples**:
- **Netflix**: Was correctly classified as Consumer Cyclical > Retail (DVD rental by mail) before ~2012. The transition to streaming happened fast — streaming revenue crossed 50% around 2011-2012, but the market perceived Netflix as a streaming company well before that. Under the manual override rule, Netflix could have been reclassified to Communication Services > Entertainment - Streaming as early as 2010 when streaming subscribers surpassed DVD subscribers, even before the revenue crossover.
- **Microsoft**: Has shifted from Software - Application (Office licenses) toward Cloud Computing Infrastructure (Azure + Office 365). If Azure + cloud subscriptions exceed 40% of revenue for two consecutive years, reclassification would be warranted. As of 2026, Microsoft is still primarily classified as Software, but the trajectory suggests a reclassification may be approaching.

#### Multi-Listing / Dual-Class Shares

**Rule**: All share classes of the same company get the same classification. GOOGL and GOOG both get code 15301030. BRK.A and BRK.B both get code 99101010. Only the primary ticker (typically the most-traded share class) appears in peer comparison lists.

---

## 7. Classification Pipeline Design

### 7.1 Seed Phase (SIC + Yahoo Cross-Reference)

The seed phase creates the initial classification for every company using freely available data. This is the only phase needed for launch — Phases 7.2 through 7.5 are future enhancements.

**Step 1: Load the universe of companies**

Download `company_tickers.json` from SEC EDGAR. This file contains ~13,000 entries with ticker, CIK, and company name. Filter out:
- Warrants (tickers ending in "W" or containing ".WS")
- Units (tickers ending in "U" or containing ".UN")
- Preferred shares (tickers ending in ".PR" or containing "-P")
- Rights (tickers ending in "R" where it's clearly a right, not a regular ticker)

After filtering, expect ~9,000-10,000 common equity tickers.

**Step 2: Batch-fetch Yahoo sector and industry**

For each ticker, call `quoteSummary(ticker, { modules: ['assetProfile'] })` and extract `sector` and `industry`. With rate limiting at ~2,000/hour and caching, this initial batch takes ~5 hours for the full universe. Results are cached in IndexedDB to avoid re-fetching.

Expected coverage: ~7,000 tickers will have Yahoo data. ~2,000-3,000 will not (micro-caps, OTC stocks, very recent listings).

**Step 3: Map Yahoo labels through crosswalk**

Create a `yahoo-to-thes1s-crosswalk.json` file that maps each Yahoo `{ sector, industry }` pair to a Thes1s 8-digit code. Since Yahoo uses Morningstar's ~148 industries and the Thes1s taxonomy has ~171 industries, most mappings will be 1-to-1. Some Yahoo industries will split into multiple Thes1s industries (e.g., Yahoo's "Software - Application" may split into Thes1s's "Software - Application" vs "Software - SaaS / Cloud").

For split mappings, the crosswalk assigns a default Thes1s code. Companies in ambiguous categories are flagged for review.

**Step 4: Fetch SIC codes for remaining companies**

For companies where Yahoo data is unavailable, fetch the SIC code from EDGAR `submissions/{CIK}.json`. Map SIC through `sic-to-thes1s-crosswalk.json`.

**Step 5: Cross-reference and assign confidence**

| Scenario | Confidence | Action |
|----------|-----------|--------|
| Yahoo and SIC agree on sector | 0.9 (high) | Accept Yahoo classification |
| Yahoo available, SIC unavailable | 0.8 (good) | Accept Yahoo classification |
| Yahoo and SIC disagree on sector | 0.6 (medium) | Accept Yahoo, flag for review |
| SIC only, no Yahoo data | 0.3 (low) | Accept SIC-mapped classification, flag for review |
| Neither Yahoo nor SIC available | 0.0 | Classify as "Unclassified", flag for review |

**Step 6: Output**

Store results in `thes1s-company-assignments.json`:
```json
{
  "AAPL": {
    "cik": "0000320193",
    "name": "Apple Inc.",
    "thes1sCode": "10201010",
    "sector": "Technology",
    "industryGroup": "Hardware",
    "industry": "Consumer Electronics",
    "confidence": 0.9,
    "source": "yahoo+sic",
    "yahooSector": "Technology",
    "yahooIndustry": "Consumer Electronics",
    "sicCode": "3571",
    "needsReview": false,
    "isConglomerate": false,
    "isADR": false,
    "lastUpdated": "2026-03-17"
  }
}
```

### 7.2 NLP Phase (Future — Phase 2)

For companies flagged for review (confidence < 0.7 or disagreement between sources), use Claude AI to classify based on business descriptions.

**Process**:
1. Fetch the company's latest 10-K filing from EDGAR Full-Text Search
2. Extract Item 1 (Business Description) — typically the first 2,000-5,000 words of the filing after the table of contents
3. Send to Claude API with a classification prompt:

```
Given this business description from a 10-K filing, classify this company
into the most appropriate Thes1s industry. Choose from the following options:
[list of ~171 industries with codes and descriptions]

Business description:
{extracted text}

Respond with:
- thes1sCode: the 8-digit code
- reasoning: 1-2 sentences explaining why
- confidence: 0.0-1.0
- alternateCode: second-best option if applicable
```

4. Compare AI classification with the seed classification
5. If they agree: raise confidence to 0.85, accept
6. If they disagree: keep both in the record, escalate to review queue

**Cost estimate**: At ~$0.003 per classification (claude-sonnet-4-20250514, ~500 input tokens + ~100 output tokens), classifying 2,000 flagged companies costs approximately $6.

### 7.3 Revenue Segment Phase (Future — Phase 3)

For conglomerates and multi-segment companies, extract revenue segment data from 10-K filings to enable multi-classification.

**Process**:
1. Identify companies with significant revenue diversification (candidates: companies flagged as conglomerates, companies where Yahoo and SIC disagree, companies in the S&P 500 with diversified business descriptions)
2. Fetch the latest 10-K from EDGAR
3. Extract the revenue segment disclosure (typically in Note 14-18 of the financial statements, or in Item 1 under "Segments")
4. Parse segment names and revenue amounts
5. Map each segment to a Thes1s industry code
6. Store as primary (largest segment) + secondary (second-largest segment) classifications with approximate revenue percentages

**Data model extension**:
```json
{
  "AMZN": {
    "thes1sCode": "20301010",
    "isConglomerate": true,
    "segments": [
      { "name": "Online Stores", "thes1sCode": "20301010", "revenuePercent": 42 },
      { "name": "AWS", "thes1sCode": "10501040", "revenuePercent": 17 },
      { "name": "Advertising", "thes1sCode": "15301030", "revenuePercent": 8 },
      { "name": "Subscription Services", "thes1sCode": "15201020", "revenuePercent": 7 },
      { "name": "Physical Stores", "thes1sCode": "25301010", "revenuePercent": 4 },
      { "name": "Third-Party Seller Services", "thes1sCode": "15301040", "revenuePercent": 22 }
    ]
  }
}
```

### 7.4 Agent Review Queue (Future)

Companies that cannot be confidently classified by automated methods go into a review queue, displayed in the Thes1s app's Audit tab.

**Queue display**:
- Company name and ticker
- Current SIC code and description
- Yahoo sector/industry (if available)
- AI suggestion and confidence (if NLP phase completed)
- Thes1s taxonomy dropdown for manual assignment
- "Approve" and "Skip" buttons

**Priority ranking**: Companies in the user's watchlist or active research reports are prioritized. Companies with no research activity are low priority.

**Expected volume**: After the seed phase, approximately 500-2,000 companies will be flagged for review. Most of these will be micro-cap or OTC companies that are unlikely to be researched. For a typical Rule One investor researching 20-50 companies per year, the relevant review queue is probably 5-10 companies.

### 7.5 Ongoing Maintenance Protocol

**New IPOs** (checked monthly):
1. Refresh `company_tickers.json` from EDGAR
2. Identify new tickers not in the assignment file
3. Fetch Yahoo sector/industry for new tickers
4. Map through crosswalk and add to assignments
5. Flag for review if Yahoo data is not yet available

**Delistings and M&A** (checked quarterly):
1. Compare current EDGAR ticker list with previous version
2. Tickers that disappear are likely delisted or acquired
3. Mark as `status: "delisted"` or `status: "acquired"` in the assignment file
4. Do not delete — keep for historical peer comparison

**Business pivots** (checked annually):
1. For companies in active research reports, re-fetch Yahoo sector/industry annually
2. If Yahoo's classification has changed, flag for review
3. Apply the reclassification rules (40% for 2 years, or 50% in 1 year, or manual override) before reclassifying — see Section 6.5 "Business Model Transitions"

**Taxonomy structure changes** (as needed):
1. New industries are added manually when a critical mass of public companies compete in a space not covered by existing industries
2. Industries are never deleted — they can be marked `deprecated: true` and companies migrated to a replacement
3. Industry groups and sectors are extremely stable; changes should be rare (once per year at most)
4. All structural changes are versioned so that historical comparisons remain valid

---

## 8. Implementation Roadmap

### 8.1 Data Files and Formats

The Thes1s taxonomy system requires four data files, all stored as JSON in the `src/data/` directory:

**File 1: `thes1s-taxonomy.json`** — The taxonomy tree structure

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-03-17",
  "sectors": [
    {
      "code": "10",
      "name": "Technology",
      "superSector": "Sensitive",
      "industryGroups": [
        {
          "code": "1010",
          "name": "Software",
          "industries": [
            {
              "code": "10101010",
              "name": "Software - Application",
              "description": "Companies developing and selling application software for business or consumer use. Includes ERP, CRM, productivity, design, and vertical-specific applications.",
              "exampleCompanies": ["ADBE", "CRM", "INTU", "SAP"]
            },
            {
              "code": "10101020",
              "name": "Software - Infrastructure",
              "description": "Companies developing operating systems, database management, middleware, development tools, and systems software.",
              "exampleCompanies": ["MSFT", "ORCL", "MDB", "SNOW"]
            }
          ]
        }
      ]
    }
  ]
}
```

**File 2: `thes1s-company-assignments.json`** — Per-company classifications

```json
{
  "lastUpdated": "2026-03-17",
  "companies": {
    "AAPL": {
      "cik": "0000320193",
      "name": "Apple Inc.",
      "thes1sCode": "10201010",
      "confidence": 0.9,
      "source": "yahoo+sic",
      "sicCode": "3571",
      "needsReview": false,
      "isConglomerate": false,
      "isADR": false,
      "secondaryCode": null,
      "lastUpdated": "2026-03-17"
    }
  }
}
```

**File 3: `yahoo-to-thes1s-crosswalk.json`** — Mapping from Yahoo labels to Thes1s codes

```json
{
  "mappings": [
    {
      "yahooSector": "Technology",
      "yahooIndustry": "Consumer Electronics",
      "thes1sCode": "10201010",
      "notes": "Direct mapping"
    },
    {
      "yahooSector": "Technology",
      "yahooIndustry": "Software - Application",
      "thes1sCode": "10101010",
      "notes": "SaaS companies in this Yahoo category may better fit 10101030. Flag for review if company description mentions 'subscription' or 'cloud-based'."
    }
  ]
}
```

**File 4: `sic-to-thes1s-crosswalk.json`** — Mapping from SIC codes to Thes1s codes

```json
{
  "mappings": {
    "3571": { "thes1sCode": "10201010", "confidence": 0.7 },
    "7372": { "thes1sCode": "10101010", "confidence": 0.5, "notes": "SIC 7372 covers all prepackaged software. May be SaaS, infrastructure, or application." },
    "5961": { "thes1sCode": "20301010", "confidence": 0.6, "notes": "SIC 5961 is catalog/mail-order. Most modern companies here are e-commerce." }
  }
}
```

### 8.2 Migration from sicClassification.js

The migration replaces `sicClassification.js` with `thes1sClassification.js` while maintaining backward compatibility. No existing component should break.

**Migration strategy**:

1. **Create `thes1sClassification.js`** alongside `sicClassification.js` (do not delete the old file initially)
2. **Import both data files** (taxonomy tree and company assignments)
3. **Export all existing functions** with the same signatures — `classifyBySIC()` and `getSICCodesForTier()` continue to work
4. **Add new functions** for Thes1s-code-based classification (see API design below)
5. **Update components one at a time** to use the new API where it adds value (Competitors tab, CompanyHeader, ScoreTable)
6. **Once all components are migrated**, remove the backward-compatible wrappers

**What changes for existing features**:
- **CompanyHeader**: Can show Thes1s industry name instead of SIC-mapped industry. Falls back to SIC mapping if company is not in the assignment file.
- **Competitors tab**: Can discover peers by Thes1s industry code instead of SIC code. Produces more accurate peer groups because the Thes1s taxonomy groups competitors correctly (LULU with NKE, not with TGT).
- **Audit tab**: New "Classification Audit" section showing companies flagged for review.
- **ScoreTable**: No change needed (uses sector-level data, which is the same in both systems).

### 8.3 API Design for thes1sClassification.js

```javascript
// ─── New Thes1s API ──────────────────────────────────────────────────

/**
 * Classify a company using the Thes1s taxonomy.
 * Checks company assignments first, falls back to Yahoo → SIC.
 * @param {string} ticker - Stock ticker symbol
 * @param {string} cik - SEC CIK number (optional, for SIC fallback)
 * @param {string} sicCode - SIC code (optional, for SIC fallback)
 * @returns {{ sector, industryGroup, industry, thes1sCode, confidence, source }}
 */
export function classifyCompany(ticker, cik, sicCode) { }

/**
 * Get all companies classified in a given tier.
 * @param {'sector'|'industryGroup'|'industry'} tier
 * @param {string} value - The tier value (e.g., "Technology" or "Software" or "10101010")
 * @returns {Array<{ ticker, cik, name, thes1sCode }>}
 */
export function getCompaniesForTier(tier, value) { }

/**
 * Get the full taxonomy tree for UI rendering (dropdowns, trees, etc.).
 * @returns {{ sectors: Array<{ code, name, superSector, industryGroups: [...] }> }}
 */
export function getTaxonomyTree() { }

/**
 * Get peer companies for a given ticker.
 * Returns companies in the same industry, sorted by market cap.
 * @param {string} ticker
 * @param {object} options - { sameIndustry: true, sameGroup: false, sameSector: false, limit: 20 }
 * @returns {Array<{ ticker, name, thes1sCode, industry }>}
 */
export function getPeers(ticker, options) { }

/**
 * Look up taxonomy details for a Thes1s code.
 * @param {string} code - 2, 4, or 8-digit Thes1s code
 * @returns {{ sector, industryGroup, industry, description, exampleCompanies }}
 */
export function lookupCode(code) { }

/**
 * Get the Super Sector for a given sector.
 * @param {string} sectorName - e.g., "Technology"
 * @returns {'Cyclical'|'Defensive'|'Sensitive'}
 */
export function getSuperSector(sectorName) { }


// ─── Backward Compatible API (same as sicClassification.js) ──────────

/**
 * Classify by SIC code (legacy compatibility).
 * Delegates to the SIC-to-Thes1s crosswalk.
 */
export function classifyBySIC(sicCode, sicDescription) { }

/**
 * Get SIC codes matching a tier value (legacy compatibility).
 * Translates Thes1s tier → SIC codes via reverse crosswalk.
 */
export function getSICCodesForTier(tier, value) { }
```

### 8.4 Testing and Validation Strategy

Testing proceeds in four phases, from quick sanity checks to comprehensive validation.

**Phase 1: Spot-check 50 well-known companies**

Manually verify classification for a diverse set of companies across all sectors:

| Company | Ticker | Expected Thes1s Code | Expected Industry |
|---------|--------|---------------------|-------------------|
| Apple | AAPL | 10201010 | Consumer Electronics |
| Microsoft | MSFT | 10101020 | Software - Infrastructure |
| NVIDIA | NVDA | 10301010 | Semiconductors |
| CrowdStrike | CRWD | 10101040 | Software - Cybersecurity |
| Snowflake | SNOW | 10101030 | Software - SaaS / Cloud |
| Alphabet | GOOGL | 15301030 | Digital Advertising Platforms |
| Meta | META | 15301020 | Social Media Platforms |
| Netflix | NFLX | 15201020 | Entertainment - Streaming |
| Disney | DIS | 15201010 | Entertainment - Diversified |
| Amazon | AMZN | 20301010 | Retail - Broadline / E-Commerce |
| Tesla | TSLA | 20101020 | Auto Manufacturers - EV |
| Nike | NKE | 20201010 | Apparel - Athletic & Lifestyle |
| Lululemon | LULU | 20201010 | Apparel - Athletic & Lifestyle |
| Starbucks | SBUX | 20401020 | Restaurants & Dining |
| Home Depot | HD | 20301030 | Retail - Home Improvement |
| Coca-Cola | KO | 25101010 | Beverages - Non-Alcoholic |
| Procter & Gamble | PG | 25201010 | Household Products |
| Costco | COST | 25301020 | Retail - Warehouse & Club |
| Walmart | WMT | 25301010 | Retail - Grocery & Supermarkets |
| Johnson & Johnson | JNJ | 30101010 | Drug Manufacturers - Major |
| UnitedHealth | UNH | 30401030 | Healthcare Plans & Insurance |
| Abbott Labs | ABT | 30301010 | Medical Devices |
| JPMorgan Chase | JPM | 35101010 | Banks - Diversified |
| Visa | V | 35401030 | Transaction & Payment Processing |
| Berkshire Hathaway | BRK.B | 99101010 | Conglomerates |
| Lockheed Martin | LMT | 40101010 | Aerospace & Defense |
| Union Pacific | UNP | 40301020 | Railroads |
| Old Dominion | ODFL | 40301030 | Trucking & Freight |
| ExxonMobil | XOM | 45101010 | Oil & Gas - Integrated Majors |
| NextEra Energy | NEE | 55501010 | Renewable Utilities |
| Prologis | PLD | 60101030 | REIT - Industrial |
| Equinix | EQIX | 60101060 | REIT - Data Center |

**Phase 2: Verify SIC crosswalk coverage**

Run all ~300 SIC codes currently in `sicClassification.js` through the `sic-to-thes1s-crosswalk.json` and verify:
- Every SIC code maps to a valid Thes1s code
- The mapped Thes1s industry is sensible (not grossly wrong)
- Confidence scores are appropriate (high for clear mappings, low for ambiguous ones)

**Phase 3: Compare Thes1s vs Yahoo labels**

For a sample of 500 companies, compare the Thes1s classification with Yahoo's raw sector/industry:
- At the sector level: should agree >95% of the time
- At the industry level: should agree >85% of the time (disagreements are expected where Thes1s has more specific industries, e.g., SaaS vs general software)
- Document all disagreements and verify they are intentional (Thes1s being more specific) rather than bugs in the crosswalk

**Phase 4: Peer group validation**

For 10 test companies across different sectors, run the Competitors tab and verify:
1. The peer group contains companies that a Rule One investor would recognize as competitors
2. No obviously wrong peers are included (e.g., a restaurant company in a tech peer group)
3. The peer group has 5-30 members (not too few for comparison, not too many to be meaningful)
4. Known competitors are included (e.g., LULU's peers include NKE, ADDYY, UAA)

Test companies: LULU, ODFL, EW (Edwards Lifesciences), SFM (Sprouts), NVDA, JPM, COST, NEE, AMZN, CRWD.

---

## 9. References & Sources

### Industry Classification Systems

1. **GICS Methodology** — MSCI and S&P Dow Jones Indices. "Global Industry Classification Standard (GICS) Methodology." Updated annually. https://www.msci.com/our-solutions/indexes/gics

2. **Morningstar Global Equity Classification Structure** — Morningstar, Inc. "Morningstar Equity Research Methodology." https://www.morningstar.com/

3. **ICB Ground Rules** — FTSE Russell (London Stock Exchange Group). "Industry Classification Benchmark (ICB)." https://www.lseg.com/en/ftse-russell/industry-classification-benchmark-icb

4. **Bloomberg BICS** — Bloomberg L.P. "Bloomberg Industry Classification System." Bloomberg Terminal documentation. https://www.bloomberg.com/professional/

5. **FactSet RBICS** — FactSet Research Systems. "Revenue-Based Industry Classification System (RBICS) Methodology." https://www.factset.com/marketplace/catalog/product/factset-rbics

6. **Fidelity GICS Guide** — Fidelity Investments. "Understanding GICS: The Global Industry Classification Standard." https://www.fidelity.com/

7. **Classification Codes Database** — Independent reference for classification systems. https://classification.codes/

### SEC and Regulatory Data

8. **SEC EDGAR API Documentation** — U.S. Securities and Exchange Commission. "EDGAR Application Programming Interfaces." https://www.sec.gov/search-filings/edgar-application-programming-interfaces

9. **SEC EDGAR Company Tickers** — `https://www.sec.gov/files/company_tickers.json`

10. **SEC EDGAR XBRL Frames API** — `https://data.sec.gov/api/xbrl/frames/`

11. **SIC Code Manual** — U.S. Department of Labor, Occupational Safety and Health Administration. "Standard Industrial Classification (SIC) System." https://www.osha.gov/data/sic-manual

12. **NAICS to SIC Crosswalk** — U.S. Census Bureau. "North American Industry Classification System." https://www.census.gov/naics/

### Financial Data Providers

13. **Yahoo Finance** — Yahoo Inc. Sector and industry data accessible via `yahoo-finance2` npm package. https://finance.yahoo.com/

14. **Finviz** — Financial Visualizations Inc. Stock screener with sector/industry data. https://finviz.com/

### Background and Analysis

15. **Wikipedia: Global Industry Classification Standard** — https://en.wikipedia.org/wiki/Global_Industry_Classification_Standard

16. **Wikipedia: Industry Classification Benchmark** — https://en.wikipedia.org/wiki/Industry_Classification_Benchmark

17. **Wikipedia: Standard Industrial Classification** — https://en.wikipedia.org/wiki/Standard_Industrial_Classification

18. **GICS 2018 Restructuring** — "Communication Services: GICS Changes." MSCI, September 2018. Documented the reclassification of Facebook, Alphabet, and Netflix from Information Technology to Communication Services.

19. **GICS 2023 Update** — "Transaction & Payment Processing Services." S&P Dow Jones Indices, March 2023. Documented the reclassification of Visa and Mastercard from IT to Financials.

### Existing Thes1s App Code

20. **sicClassification.js** — `src/engines/sicClassification.js`. Current SIC-based classification with ~300 codes mapped to 12 sectors.

21. **peers.js** — `src/engines/peers.js`. SIC-based peer discovery (browse-edgar + Frames fallback).

22. **peerMetrics.js** — `src/engines/peerMetrics.js`. Peer metrics via Frames API + derived metrics + Yahoo backfill.

23. **batchQuotes.js** — `src/engines/batchQuotes.js`. Yahoo batch quotes with per-ticker caching.

24. **Competitors.jsx** — `src/components/Competitors.jsx`. Competitor benchmarking UI with SIC-based peer discovery.

---

*End of report. This document should be treated as a living reference — update it as the taxonomy is implemented and real-world edge cases are discovered.*
