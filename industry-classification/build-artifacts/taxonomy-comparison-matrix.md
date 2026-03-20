# Taxonomy System Comparison Matrix
**Date**: 2026-03-17

## Structural Comparison

| Feature                | SIC (baseline)      | GICS                   | Morningstar            | ICB                    | Bloomberg BICS         | Yahoo Finance          | FactSet RBICS          |
|------------------------|---------------------|------------------------|------------------------|------------------------|------------------------|------------------------|------------------------|
| **Provider**           | US Government       | MSCI + S&P             | Morningstar Inc.       | FTSE Russell           | Bloomberg              | Yahoo (Morningstar)    | FactSet                |
| **Year Created**       | 1937                | 1999                   | 2010                   | 2005                   | ~2011                  | N/A                    | ~2003                  |
| **Last Major Update**  | 1987                | 2023                   | 2019 (v2)              | 2019 (v2)              | 2024                   | Follows Morningstar    | Continuous             |
| **Tier Count**         | 4                   | 4                      | 4                      | 4                      | 7                      | 2 (exposed)            | 6                      |
| **Level 1 Count**      | 10 Divisions        | 11 Sectors             | 3 Super Sectors        | 11 Industries          | 11 Sectors             | 11 Sectors             | 14 Economies           |
| **Level 2 Count**      | 83 Major Groups     | 25 Ind. Groups         | 11 Sectors             | 20 Supersectors        | ~80                    | ~145 Industries        | ~50 Sectors            |
| **Level 3 Count**      | 416 Groups          | 74 Industries          | 69 Ind. Groups         | 45 Sectors             | ~180                   | —                      | ~120 Sub-Sectors       |
| **Level 4 Count**      | 1,005 Industries    | 163 Sub-Industries     | 148 Industries         | 173 Subsectors         | ~600                   | —                      | ~350 Ind. Groups       |
| **Deepest Level**      | 1,005               | 163                    | 148                    | 173                    | ~1,600 (L7)            | ~145                   | ~1,400 (L6)            |
| **Code Format**        | 4-digit numeric     | 8-digit numeric        | 8-char alphanum        | 8-digit numeric        | Proprietary            | Text labels            | Proprietary            |
| **Primary Signal**     | Production process  | Revenue                | Revenue + Income       | Revenue                | Revenue                | Revenue + Income       | Revenue (segment)      |
| **Multi-Segment**      | No                  | No                     | No                     | No                     | Yes (L5-L7)            | No                     | Yes (weighted %)       |
| **Review Frequency**   | Never (frozen)      | Annual                 | Quarterly              | Annual                 | Continuous             | Follows Morningstar    | Continuous             |
| **Free Data?**         | YES (SEC)           | No                     | No                     | No                     | No                     | YES                    | No                     |
| **US Equity Coverage** | ~13,000 filers      | ~5,000+                | ~5,000+                | ~3,000 US              | ~8,000+ US             | ~7,000+                | ~8,000+                |
| **Used By**            | SEC, IRS            | Institutional investors, ETFs | Yahoo Finance, retail investors | FTSE indices | Bloomberg Terminal     | Retail investors       | FactSet clients        |

## Classification Criteria Comparison

| Criteria                   | SIC            | GICS           | Morningstar    | ICB            | BICS           | RBICS          |
|----------------------------|----------------|----------------|----------------|----------------|----------------|----------------|
| **Revenue (primary)**      | No             | Yes            | Yes            | Yes            | Yes            | Yes            |
| **Earnings**               | No             | Secondary      | Secondary      | No             | No             | No             |
| **Market Perception**      | No             | Tertiary       | No             | No             | Yes (L1-L3)    | No             |
| **Production Process**     | Yes (primary)  | No             | No             | No             | No             | No             |
| **Stock Co-movement**      | No             | No             | No             | No             | Yes (L1-L3)    | Yes (L1-L3)    |
| **Segment-Level Revenue**  | No             | No             | No             | No             | Yes (L5+)      | Yes            |
| **Uses 10-K/10-Q**        | No             | Yes            | Yes (primary)  | Yes            | Yes            | Yes            |
| **Analyst Review**         | No             | Annual committee | Quarterly team | Annual        | Continuous     | Continuous     |

## Modern Industry Coverage

| Industry Category                    | SIC                    | GICS                            | Morningstar                    | ICB              | BICS                  | RBICS          |
|--------------------------------------|------------------------|---------------------------------|--------------------------------|------------------|-----------------------|----------------|
| SaaS / Cloud Software                | No category            | Partial (Application Software)  | Yes (Software - Application)   | Partial          | Yes (dedicated)       | Yes            |
| Cloud Infrastructure                 | No category            | Partial (IT Services)           | Partial                        | Partial          | Yes                   | Yes            |
| Fintech / Digital Payments           | No category            | Yes (2023: Transaction Processing) | Yes                         | Partial          | Yes                   | Yes            |
| Electric Vehicles                    | No (lumped with Auto)  | Partial (Automobiles)           | Partial (Auto Manufacturers)   | Partial          | Yes (2024 update)     | Yes            |
| Streaming / Digital Media            | No category            | Yes (Interactive Media)         | Yes (Entertainment)            | Partial          | Yes                   | Yes            |
| Cryptocurrency / Blockchain          | No category            | No                              | Partial                        | Partial          | Yes (2024 update)     | Partial        |
| Artificial Intelligence / ML         | No category            | No                              | No                             | No               | Yes (2024 update)     | Partial        |
| Cybersecurity                        | No category            | Partial                         | Yes                            | Partial          | Yes                   | Yes            |
| Cannabis                             | No category            | No                              | No                             | Yes (2019: Cannabis Producers) | Partial | Partial        |
| Renewable Energy                     | No category            | Yes (since 2023)                | Yes                            | Partial          | Yes                   | Yes            |
| Space / Satellites                   | Partial (3761, 3812)   | Yes (Aerospace & Defense)       | Yes                            | Yes              | Yes                   | Yes            |
| E-Commerce / Online Retail           | No (5961 Catalog)      | Yes (Broadline Retail)          | Yes (Internet Retail)          | Partial          | Yes                   | Yes            |
| Digital Advertising                  | No category            | Yes (Interactive Media)         | Yes                            | Partial          | Yes                   | Yes            |
| Sharing Economy / Gig Platforms      | No category            | Partial                         | Partial                        | No               | Yes                   | Partial        |
| SPAC / Blank Check                   | No category            | Financials                      | No dedicated                   | No dedicated     | Yes                   | Partial        |

## Where Systems Disagree — Company Case Studies

### Amazon (AMZN)

| System           | Classification                                              | Comment                                                              |
|------------------|-------------------------------------------------------------|----------------------------------------------------------------------|
| SIC              | 5961 - Catalog & Mail-Order Houses                          | Absurdly outdated. Groups with HSN and QVC.                          |
| GICS             | Consumer Discretionary > Broadline Retail                   | Ignores AWS (~17% revenue, ~62% operating income)                    |
| Morningstar/Yahoo| Consumer Cyclical > Internet Retail                         | Better name, same single-assignment problem                          |
| ICB              | Consumer Discretionary > General Retailers                  | Generic                                                              |
| BICS             | Multi-segment at L5+                                        | E-commerce, Cloud, Advertising, Streaming each classified separately |
| RBICS            | Retail 60%, Cloud 17%, Advertising 8%                       | Most accurate representation of actual business                      |

### Tesla (TSLA)

| System           | Classification                                              | Comment                                                              |
|------------------|-------------------------------------------------------------|----------------------------------------------------------------------|
| SIC              | 3711 - Motor Vehicles & Passenger Car Bodies                | Technically correct for manufacturing, misses energy/AI              |
| GICS             | Consumer Discretionary > Automobiles                        | Standard auto classification                                         |
| Morningstar/Yahoo| Consumer Cyclical > Auto Manufacturers                      | No EV distinction                                                    |
| BICS             | Dedicated EV category (2024)                                | Distinguishes EVs from traditional auto                              |
| RBICS            | Automotive, Energy Storage, Solar                           | Multi-segment capture                                                |

### Alphabet (GOOGL)

| System           | Classification                                              | Comment                                                              |
|------------------|-------------------------------------------------------------|----------------------------------------------------------------------|
| SIC              | 7370 - Computer Programming, Data Processing                | Misses the advertising business model entirely                       |
| GICS             | Communication Services > Interactive Media                  | Moved from IT in 2018. Controversial.                                |
| Morningstar/Yahoo| Communication Services > Internet Content & Information     | Reasonable for search/YouTube                                        |
| BICS             | Multi-segment: Advertising, Cloud, Hardware                 | Better capture of revenue streams                                    |

### Berkshire Hathaway (BRK.B)

| System           | Classification                                              | Comment                                                              |
|------------------|-------------------------------------------------------------|----------------------------------------------------------------------|
| SIC              | 6311 - Life Insurance                                       | Only captures insurance arm                                          |
| GICS             | Financials > Financial Conglomerates                        | At least acknowledges conglomerate nature                            |
| Morningstar/Yahoo| Financial Services > Insurance - Diversified                | Slightly misleading                                                  |
| RBICS            | Insurance, Rail, Utilities, Consumer                        | Most accurate multi-segment view                                     |

### Lululemon (LULU)

| System           | Classification                                              | Comment                                                              |
|------------------|-------------------------------------------------------------|----------------------------------------------------------------------|
| SIC              | 5651 - Family Clothing Stores                               | Groups with Target, TJX — wrong peer group                          |
| GICS             | Consumer Discretionary > Apparel & Luxury Goods             | Good but very broad category                                         |
| Morningstar/Yahoo| Consumer Cyclical > Apparel Retail                          | Better, but still broad                                              |
| Ideal peers      | NKE, ADDYY, UAA, DECK, ONON                                | Athletic/lifestyle apparel companies                                 |

## Multi-Segment Handling Comparison

| Approach              | Systems                          | How It Works                                                    | Pros                                    | Cons                                          |
|-----------------------|----------------------------------|-----------------------------------------------------------------|-----------------------------------------|-----------------------------------------------|
| **Single Assignment** | SIC, GICS, Morningstar, ICB, Yahoo | Company gets ONE classification based on dominant revenue      | Simple, clean hierarchy                 | Misrepresents diversified companies           |
| **Segment-Level**     | BICS (L5-L7)                     | Each business segment classified independently                  | Accurate for conglomerates              | Complex, harder to use for peer comparison    |
| **Revenue-Weighted**  | RBICS                            | Company mapped to multiple industries with % weights            | Most accurate representation            | Complex, requires revenue disclosure data     |

## Data Availability Summary

| System           | Free Company-Level Data? | How to Access                            | Cost           |
|------------------|--------------------------|------------------------------------------|----------------|
| SIC              | YES                      | SEC EDGAR submissions endpoint           | Free           |
| GICS             | NO                       | MSCI/S&P license required                | $10,000+/yr    |
| Morningstar      | NO                       | Morningstar Direct subscription          | $15,000+/yr    |
| ICB              | NO                       | FTSE Russell data license                | $5,000+/yr     |
| BICS             | NO                       | Bloomberg Terminal                       | $24,000+/yr    |
| Yahoo (Morningstar) | YES                   | yahoo-finance2 npm package, quoteSummary API | Free       |
| RBICS            | NO                       | FactSet subscription                     | $10,000+/yr    |
| Finviz           | YES (scraping)           | HTML parsing from finviz.com             | Free           |

**Bottom line for Thes1s**: Only SIC (via SEC) and Yahoo Finance (via quoteSummary) provide free company-level classification data. These two sources form the foundation of our seed strategy.
