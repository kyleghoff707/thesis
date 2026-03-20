# TODOS

## P2 — Direct XBRL/iXBRL Instance Document Parsing

**What:** Parse XBRL instance documents directly from EDGAR filings for real-time financial data, bypassing the companyfacts API.

**Why:** The companyfacts API has a 24-72 hour delay after a filing. Morningstar gets data within hours because they parse filings directly. This also enables Layer 3 per-company adapters to read calculation/presentation linkbases from the same filing package.

**Pros:** Real-time data availability, full filing structure access, enables per-company adapter generation, eliminates SEC API lag.

**Cons:** iXBRL is inline HTML with embedded XBRL tags — parsing is non-trivial. The SEC is also transitioning filing formats (iXBRL becoming standard). Many edge cases with company-specific extensions. High engineering effort.

**Context:** Build AFTER the three-layer engine (Layers 1-3) is production-stable. Layer 3 adapter work will naturally lead into this since both require downloading filing packages from EDGAR. The companyfacts API is sufficient for a research tool (not a trading tool) — 24-72hr delay is acceptable.

**Effort:** XL (human: ~6-8 weeks) → with CC+gstack: L (~6-8 hours)

**Depends on:** Layer 3 (per-company filing adapters) being built and validated first.

**Source:** CEO Plan Review 2026-03-18 (Expansion #4, deferred)

## P2 — Full Morningstar Field Parity (~145 additional fields)

**What:** Expand the XBRL engine from ~85 extracted fields to all ~230 Morningstar standardized fields. Includes debt maturity schedules, PP&E sub-breakdowns (land, buildings, machinery), lease obligation details, supplemental items (tax paid, interest paid), and normalized income.

**Why:** AI report generation needs comprehensive financial data. "Tell me about AAPL's debt maturity profile" requires the debt-due-in-Year-1/2/3/4/5/Beyond fields. The field mapping table from the accuracy phase documents exactly which fields are missing and what XBRL tags they need.

**Pros:** Complete MS parity eliminates trust gap ("if any field is missing, users won't trust ANY number"). Enables richer AI analysis. The field mapping table IS the spec — implementation is mechanical.

**Cons:** ~145 new XBRL tag definitions to add and validate. Some fields (debt maturity schedules) may not have direct XBRL equivalents. Industry-specific fields (bank NII breakdown, insurance premium details) need overlay extensions.

**Context:** The accuracy phase produces a field mapping table with ~145 entries marked "not yet mapped." Each entry documents the Morningstar field name, expected values for 50 companies, and the gap. Implementation = add XBRL tags to taxonomy, run accuracy tests, iterate. The field mapping table is the input; `npm test` catching regressions is the safety net.

**Effort:** L (human: ~2 weeks) → with CC+gstack: M (~2 hours)

**Depends on:** XBRL engine accuracy phase complete (annual data matches MS for existing ~85 fields).

**Source:** Eng Review 2026-03-19

## P2 — Layer 2 Rebuild (Value-Verified Synonym Tags)

**What:** Rebuild the taxonomy hierarchy (Layer 2) as a curated list of value-verified synonym tags, guided by accuracy test failures. Unlike the original Layer 2 (which used the full FASB calc linkbase with 1,937 descendant tags including sub-components), the new version would only include tags proven to produce correct aggregate values for specific companies.

**Why:** Layer 2 was disconnected because it injected sub-component tags that overrode correct aggregate tags (NCL regression, D&A regression). But some companies use non-standard XBRL tags that Layer 1 doesn't cover. A value-verified Layer 2 gives coverage without regression risk.

**Pros:** Recovers coverage for edge-case companies. Data-driven (only adds tags where tests prove they work). No regression risk (every tag verified against MS truth set).

**Cons:** Requires manual curation per field. May be unnecessary if Layer 1 + accuracy-guided tag additions handle most gaps. The disconnected Layer 2 files (taxonomyResolver.js, taxonomy-hierarchy.json) are still in the codebase but the new approach would likely be a simpler structure.

**Context:** After Phase B engine fixes, the accuracy test suite will show which fields still fail for which companies. If the failures are because the company uses a non-standard XBRL tag not in Layer 1, that's a candidate for the curated Layer 2. If Layer 1 + direct tag additions handle all 50 companies, this TODO can be closed as "not needed."

**Effort:** M (human: ~1 week) → with CC+gstack: S (~1 hour)

**Depends on:** XBRL engine accuracy phase complete. Accuracy test failures analyzed.

**Source:** Eng Review 2026-03-19

## P2 — Quarterly Data Extraction + TTM Validation

**What:** Validate quarterly extraction and TTM (Trailing Twelve Months) computation against Morningstar quarterly data. The engine already has quarterly extraction code (`fetchEdgarQuarterly`, `computeTTM`) but it hasn't been validated against a truth set.

**Why:** TTM values feed the valuation calculators (MOS, PBT, Ten Cap) and are shown in the Financials tab. Quarterly data enables more granular growth analysis. Without validation, TTM values could be silently wrong.

**Pros:** Completes the financial data pipeline (annual + quarterly + TTM). Enables accurate valuation calculations. Unlocks quarterly trend analysis for AI reports.

**Cons:** Requires downloading quarterly Morningstar CSVs for a subset of companies (manual, ~20 min). Quarterly XBRL de-cumulation logic has known edge cases (fiscal year crossovers, Q4 vs FY overlap). More complex than annual validation.

**Context:** The quarterly extraction code exists but uses the same XBRL extraction pattern as annual. De-cumulation (subtracting prior quarter YTD to get individual quarter) is the main complexity. TTM = prior FY + current YTD - prior same-quarter YTD. Both depend on correct annual data being the baseline, so this phase must complete first.

**Effort:** L (human: ~2 weeks) → with CC+gstack: M (~3 hours)

**Depends on:** XBRL engine accuracy phase complete (annual data validated). User downloads quarterly Morningstar CSVs for at least 10-15 companies.

**Source:** Eng Review 2026-03-19

## P3 — Financial Statement Taxonomy Mapping Skill

**What:** Build a reusable Claude Code skill that encodes deep knowledge of financial statement accounting — how Morningstar standardizes XBRL data, how fields map across different industry types, sign conventions, hierarchy relationships, and derivation formulas. Invocable during future XBRL engine work, AI report generation, and financial data debugging.

**Why:** The field mapping table from the accuracy phase captures the WHAT (which MS field → which Thes1s field → which XBRL tags). A skill encodes the WHY — the accounting logic behind the mappings. Future conversations don't need to re-derive financial accounting knowledge from scratch. It's the difference between a lookup table and an expert you can ask questions.

**Pros:** Reusable across all future financial data work (engine expansion, AI report prompts, debugging discrepancies, quarterly validation). Reduces context window pressure — the skill carries the knowledge so CLAUDE.md doesn't have to. Makes the "~145 missing fields" expansion faster since the skill already understands the accounting patterns.

**Cons:** Requires the field mapping table to be complete and validated first — building the skill on wrong mappings would encode wrong knowledge. Skill maintenance as accounting standards evolve.

**Context:** The accuracy phase produces the field mapping table (all ~230 MS fields documented). That table IS the seed data for the skill. The skill wraps it with: (1) industry-specific accounting conventions (how banks report revenue vs retailers), (2) sign convention rules, (3) derivation formula logic, (4) common XBRL tag patterns per industry, (5) known gotchas (spin-offs, restatements, FY offsets).

**Effort:** M (human: ~1 week) → with CC+gstack: S (~1-2 hours)

**Depends on:** XBRL engine accuracy phase complete. Field mapping table validated against 50 companies. Successful Morningstar match confirms the mappings are correct.

**Source:** Eng Review 2026-03-19 (user request, pending successful mapping)
