# Plan: Custom Stock Market Industry Taxonomy

## Context

The Thes1s app uses SEC SIC codes (designed 1937, self-reported, no modern industries) to classify companies and discover peers. `sicClassification.js` maps ~300 SIC codes across 12 sectors, but misclassifies companies like Amazon (SIC 5961 = "Catalog & Mail-Order Houses") and has zero coverage of SaaS, fintech, EVs, streaming, crypto, AI, or cybersecurity as distinct categories.

The goal: design and build a comprehensive custom 3-tier taxonomy (Sector > Industry Group > Industry) covering ~8,000 US public companies, seeded from free data, optimized for Rule One competitive analysis.

This combines two deliverables: (1) a research report investigating how existing taxonomy systems work, and (2) the actual taxonomy + implementation files.

---

## Output Directory

`~/Desktop/stock-analyzer/knowledge/taxonomy-research/`

Learning doc (Phase 4): `knowledge/taxonomy-classification-learning.md`

---

## Phase 1 — Research Report + Taxonomy Design (This Session)

**Goal**: Produce the research report, comparison matrix, and taxonomy tree design. No code changes to the app.

### Step 1: Research the 6 Major Taxonomy Systems
Web research + Claude knowledge to document each system:
- GICS (S&P/MSCI) — 4 tiers, 11→25→74→163, revenue-primary
- Morningstar — 3 Super Sectors → 11→~69→~148, analyst-reviewed quarterly
- ICB (FTSE Russell) — 4 tiers, 11→20→45→173, revenue-based
- Bloomberg BICS — research structure and differentiation
- Yahoo Finance — modified Morningstar system, ~11 sectors / ~145 industries (free!)
- FactSet RBICS — multi-segment, revenue-weighted (unique approach)

For each: tier structure, classification criteria, multi-segment handling, update frequency, free availability.

### Step 2: Build Comparison Matrix
Side-by-side table: tier depths, category counts, classification signals, modern industry coverage, where they disagree on well-known companies (Amazon, Tesla, Alphabet, Berkshire), data availability.

### Step 3: SIC vs Modern Taxonomies Analysis
What SIC gets wrong, structural limitations, concrete misclassification examples from the current app, what NAICS improves.

### Step 4: Free Data Source Catalog
Document every free source for classification: EDGAR APIs, Yahoo Finance labels, Finviz labels, 10-K text, Wikipedia. For each: endpoint, format, rate limits, coverage, reliability.

### Step 5: Design the Thes1s Taxonomy Tree
3-tier taxonomy: ~11-12 Sectors → ~55-70 Industry Groups → ~140-170 Industries.
- 8-digit numeric code system (like GICS)
- Optimized for "who competes with whom for customers/revenue"
- Modern industry coverage (SaaS, fintech, EVs, etc.)
- Edge case rules (conglomerates, SPACs, REITs, ADRs, holding companies)
- Output: `thes1s-taxonomy-tree.json`

### Step 6: Design the Classification Pipeline
Document the multi-step approach:
1. Seed from Yahoo labels + SIC crosswalk (high coverage, immediate)
2. NLP on 10-K business descriptions (for disagreements/unknowns)
3. Revenue segment analysis (for conglomerates)
4. Agent review queue (for low-confidence assignments)
5. Ongoing maintenance (new IPOs, M&A, pivots)

### Step 7: Design Output File Formats
Data structures for: taxonomy tree, company assignments, SIC crosswalk, Yahoo crosswalk.

### Step 8: Build SIC-to-Thes1s Crosswalk
Once the taxonomy tree is designed (Step 5), map all ~300 existing SIC codes from `SIC_MAP` to new Thes1s taxonomy codes. This is a direct mapping exercise — each SIC code already has a sector/industryGroup/industry, just assign the corresponding Thes1s numeric code.
- Output: `sic-to-thes1s-crosswalk.json`

### Step 9: Draft Learning Document
Write a draft `taxonomy-classification-learning.md` covering what's knowable now:
- Taxonomy structure and design rationale
- Key vocabulary and labels (complete taxonomy with codes)
- Classification decision trees per sector
- Edge case handling rules (conglomerates, SPACs, REITs, ADRs)
- Quick reference table

Mark sections that depend on the live pipeline (maintenance procedures, validation against benchmarks) as "TBD — requires pipeline implementation." Refine in a future session.
- Output: `knowledge/taxonomy-classification-learning.md`

### Output Files (Phase 1)
```
knowledge/taxonomy-research/
  stock-taxonomy-research.md        — Full research report
  stock-taxonomy-research.pdf       — PDF version (reportlab)
  stock-taxonomy-notes.md           — Research scratchpad
  taxonomy-comparison-matrix.md     — System comparison table
  thes1s-taxonomy-tree.json         — The taxonomy definition
  sic-to-thes1s-crosswalk.json     — SIC → Thes1s mapping
  classification-pipeline.md        — Pipeline documentation

knowledge/
  taxonomy-classification-learning.md — Draft Claude learning doc
```

---

## Phase 2 — Yahoo Crosswalk + Batch Classification (Future Session)

### Pre-work: Patch 5 Missing Industries into Taxonomy Tree

The gap analysis identified 5 Yahoo Finance industries with no Thes1s counterpart — all in Industrials. Add them to `thes1s-taxonomy-tree.json`:

| Yahoo Industry | Proposed Thes1s Placement | Code |
|---|---|---|
| Farm & Heavy Construction Machinery | Industrials > Industrial Manufacturing | 40201020 |
| Industrial Distribution | Industrials > Business Services | 40501040 |
| Tools & Accessories | Industrials > Industrial Manufacturing | 40201030 |
| Airports & Air Services | Industrials > Transportation | 40301060 |
| Infrastructure Operations | Industrials > Construction & Engineering | 40401030 |

This bumps the taxonomy from 171 → 176 industries. Update metadata counts in the JSON accordingly.

### Step 1: Build Yahoo-to-Thes1s Crosswalk

**Input**: `yahoo-finance-taxonomy.json` (145 exact Yahoo labels) + `thes1s-taxonomy-tree.json` (176 industries after patch)

**Output**: `yahoo-to-thes1s-crosswalk.json`

For each of the 145 Yahoo `{ sector, industry }` pairs, assign:
- **`thes1sCode`** — the 8-digit Thes1s industry code
- **`mappingType`** — `"exact"` (name match), `"rename"` (clear 1:1 but different name), or `"split"` (Yahoo industry maps to multiple Thes1s industries)
- **`splitOptions`** — (only for `"split"` type) array of possible Thes1s codes. The first is the default; companies in split categories get `needsReview: true`

Based on the gap analysis:
- ~57 exact matches → trivial
- ~50 renames → straightforward (e.g., "Computer Hardware" → "Computer Hardware & Storage")
- ~10 splits → Yahoo "Software - Application" defaults to Thes1s `10101010` but could be SaaS (`10101030`), Cybersecurity (`10101040`), or AI/ML (`10101050`). These get flagged for NLP refinement in a future phase.
- ~26 Thes1s industries have no Yahoo source at all (SaaS, Fintech, EV, Cannabis, etc.) — these won't populate from the crosswalk, only from NLP or manual assignment later

### Step 2: Build Batch Classification Script

**Output**: `scripts/classify-universe.js` (standalone Node script, runs outside the app)

The script implements pipeline Steps 1-4 from `classification-pipeline.md`:

1. **Build Universe** — Download EDGAR `company_tickers.json`, filter to ~8,000 common stock tickers. Output: `pipeline/universe.json`

2. **Yahoo Seed** — For each ticker, fetch `quoteSummary` via `yahoo-finance2`, extract sector/industry, map through crosswalk. Output: `pipeline/yahoo-seed.json`
   - Batch in groups of 50, 500ms delay between batches
   - **Incremental persistence**: write to disk every 100 tickers (crash recovery)
   - Check for existing output before re-running (skip completed steps)
   - Estimated runtime: 10-15 min optimistic, 2-3 hours worst case

3. **SIC Fallback** — For tickers Yahoo missed (~10-15%), use `sic-to-thes1s-crosswalk.json`. Output: `pipeline/sic-fallback.json`

4. **Cross-Reference** — Merge Yahoo + SIC results. Boost confidence when both agree. Flag sector-level disagreements. Output: `thes1s-company-assignments.json`

### Step 3: Run + Validate

- Execute the script, monitor for rate limiting
- Validate output:
  - Spot-check 10-20 well-known companies (AAPL, AMZN, TSLA, LULU, NFLX, BRK, GOOGL, V, EQIX, XOM)
  - Count companies per industry — flag any with <5 (thin industry validation)
  - Verify no orphaned tickers (every ticker gets a classification or explicit "unclassified")
  - Summary stats: coverage %, confidence distribution, Yahoo vs SIC agreement rate
  - **Distribution sanity check**: Generate a summary table of company counts per sector and per industry group. Compare sector distribution against Yahoo's market weight percentages from `yahoo-finance-taxonomy.json`. The distributions won't match exactly (market weight is by market cap, our count is by number of companies), but gross mismatches signal a crosswalk bug — e.g., if Financial Services has 40% of companies but only 7.6% of Yahoo's market weight, that's expected (many small banks). But if Technology has 5% of companies, something is broken.

### Output Files (Phase 2)
```
knowledge/taxonomy-research/
  thes1s-taxonomy-tree.json          — Updated (176 industries)
  yahoo-to-thes1s-crosswalk.json     — 145 Yahoo → Thes1s mappings
  thes1s-company-assignments.json    — ~8,000 company classifications
  pipeline/
    universe.json                     — Filtered EDGAR ticker list
    yahoo-seed.json                   — Raw Yahoo fetch results
    sic-fallback.json                 — SIC-based classifications
    cross-reference.json              — Merged + boosted results

scripts/
  classify-universe.js               — Standalone batch classification script
```

### Risks
| Risk | Mitigation |
|------|-----------|
| Yahoo rate-limits aggressively | Incremental persistence; restart from last checkpoint |
| Split mappings produce wrong defaults | `needsReview: true` flag; NLP refinement in future phase |
| Thin industries (<5 companies) | Fall back to industry group level for peer comparison |
| Script crashes mid-run | Intermediate files per step; skip completed steps on restart |

---

## Phase 3 — Code Integration (Future Session)

### Step 1: Build `thes1sClassification.js`
Drop-in replacement for `sicClassification.js`. Same exported API plus new functions:
- `classifyCompany(ticker, cik, sicCode)` → `{ sector, industryGroup, industry, thes1sCode }`
- `getCompaniesForTier(tier, value)` → `Set<{ ticker, cik }>`
- Backward compat: `classifyBySIC()` and `getSICCodesForTier()` still work

### Step 2: Rewrite Peer Discovery
Current: `peers.js` queries SEC browse-edgar by SIC code (slow, many HTTP requests).
New: In-memory lookup against prebuilt company assignments index (instant).

### Step 3: Update Consumers
- `useCompetitors.js` — switch import, simplify Phase 1
- `Competitors.jsx` — tier selector uses taxonomy labels
- `Toolbox.jsx` — display Thes1s classification in Overview

**Critical files to modify**:
- `src/engines/sicClassification.js` (keep as fallback)
- `src/engines/peers.js` (rewrite peer discovery)
- `src/hooks/useCompetitors.js` (import switch)
- `src/components/Toolbox.jsx` (display update)

---

## Phase 4 — Learning Doc Refinement + Polish (Future Session)

- Finalize `taxonomy-classification-learning.md` — fill in TBD sections once pipeline is running
- Maintenance procedures, validation against benchmarks
- Edge case handling refinements from real-world testing

---

## Key Architecture Insight

The biggest win: **peer discovery becomes instant**. Today, finding peers for one company requires dozens of HTTP requests to SEC (one per SIC code in the tier). With a prebuilt company-to-taxonomy index, it's a single in-memory filter. The Competitors tab Phase 1 goes from seconds of loading to milliseconds.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Yahoo rate-limits batch fetch | Run as overnight Node script; SIC fallback for failures |
| Yahoo taxonomy doesn't map cleanly | ~145 industries close to our ~150 target; mostly 1:1 |
| Company assignments JSON too large | ~800KB for 8K entries — acceptable; can compress keys |
| Breaking existing Competitors tab | Keep `sicClassification.js` as fallback; feature flag |
| Taxonomy design groups companies poorly | Start from GICS/Morningstar; validate with known peers |

---

## Scope for THIS Session

**Phase 1 only** — Research report, comparison matrix, taxonomy tree design, classification pipeline design, PDF generation. No code changes to the app. This is the foundation everything else builds on.

**Decisions locked in**:
- Sector names: Morningstar-style (Technology, Consumer Cyclical, Consumer Defensive — matches current app)
- Output directory: `knowledge/taxonomy-research/`
- SIC crosswalk: built this session (Step 8) since it's a direct mapping once taxonomy tree exists
- Learning doc: draft this session (Step 9) with TBD sections for pipeline-dependent content
- Learning doc location: `knowledge/taxonomy-classification-learning.md`

---

## Verification

- Taxonomy tree JSON validates (well-formed, no orphan codes)
- Comparison matrix covers all 6 systems
- Research report addresses all 7 research questions from the prompt
- Taxonomy has ~11-12 sectors, ~55-70 industry groups, ~140-170 industries
- Spot-check: Amazon, Tesla, Alphabet, Berkshire, LULU all land in sensible industries
- PDF generates cleanly from reportlab
