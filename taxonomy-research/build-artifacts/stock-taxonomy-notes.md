# Stock Taxonomy Research — Working Notes

## Session: 2026-03-17
## Goal: Survey existing taxonomy systems, design Thes1s custom taxonomy

---

## Research Sources Used

### Web Searches
- GICS methodology: msci.com, spglobal.com, classification.codes, wikipedia
- Morningstar: classification.codes, morningstar.com
- ICB: lseg.com, classification.codes, wikipedia
- Bloomberg BICS: bbhub.io, thegoldensource.com, wikipedia
- FactSet RBICS: factset.com, insight.factset.com
- Yahoo Finance: finance.yahoo.com, multiple sector pages

### Key Findings

**GICS**: 11 sectors, 25 industry groups, 74 industries, 163 sub-industries. 8-digit codes. Revenue-primary, earnings-secondary, market perception-tertiary. Annual review by MSCI/S&P committee. Single assignment per company. PROPRIETARY — not freely available.

**Morningstar**: 3 super sectors → 11 sectors → 69 industry groups → 148 industries. Uses 10-K/10-Q as primary source. Quarterly analyst review. PROPRIETARY but Yahoo Finance exposes sector+industry for free.

**ICB**: 11 industries → 20 supersectors → 45 sectors → 173 subsectors. Revenue-based from audited accounts. Annual review. Added Cannabis Producers (2019). Primarily European/global indices.

**Bloomberg BICS**: 11 sectors, up to 7 levels of depth, ~1,600+ categories. Covers 60,000+ equities. Segment-level classification. Added EV and crypto categories (2024). PROPRIETARY (Bloomberg Terminal only).

**Yahoo Finance**: Uses Morningstar's taxonomy. 11 sectors, ~145 industries. FREE via quoteSummary API. This is our primary seed source.

**FactSet RBICS**: 14 economies, 6 tiers, ~1,400 sub-industries. Multi-segment mapping with revenue weights. Covers 45,000 companies. PROPRIETARY.

### Critical Insight
Only TWO free data sources exist for company-level classification:
1. SIC codes (SEC EDGAR) — free but unreliable
2. Yahoo Finance sector/industry labels (Morningstar taxonomy) — free and high quality

Our seed strategy: Yahoo + SIC cross-reference, with 10-K NLP for edge cases.

---

## Taxonomy Design Decisions

1. **Sector names**: Morningstar-style (matches Yahoo + existing app)
2. **Code system**: 8-digit numeric (like GICS) — Sector(2) + IndustryGroup(4) + Industry(8)
3. **Sectors**: 12 (11 standard + Special Classifications)
4. **Industry Groups**: 52
5. **Industries**: 171
6. **Modern additions**: SaaS/Cloud, Cybersecurity, AI/ML, EVs, Streaming, Fintech, Blockchain/Crypto, Space, Cannabis, Renewable Energy

---

## Files Generated This Session

| File | Status | Lines |
|------|--------|-------|
| stock-taxonomy-notes.md | Complete | this file |
| taxonomy-comparison-matrix.md | Complete | 129 |
| classification-pipeline.md | Complete | 253 |
| thes1s-taxonomy-tree.json | Complete | 583 |
| taxonomy-classification-learning.md | Complete | ~270 |
| stock-taxonomy-research.md | In progress (agent) | — |
| sic-to-thes1s-crosswalk.json | In progress (agent) | — |
| stock-taxonomy-research.pdf | Pending | — |
