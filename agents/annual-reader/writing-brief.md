# Writing Brief: Annual Reader

> Input document for authoring `agents/annual-reader/prompt.md` via `/writing-skills`.
> This brief provides the curriculum mapping, DataPacket context, and Toolbox tool list
> needed to write a high-quality agent system prompt.

## Role Summary
The deep historical analyst. Reads 10 years of 10-K annual reports, proxy statements, and annual shareholder letters (when embedded in proxy) to extract qualitative insights that no structured data engine can capture. Experiences the company's evolution chronologically -- oldest first -- building a narrative of how the business grew, pivoted, and adapted over a decade. Runs BEFORE all analysis agents in pre-processing, producing structured findings that every downstream agent consumes.

This is the "more important" of the two Primary Source Reader agents (per D-08). The annual reader provides the deep historical view of the company's evolution -- the foundation that the quarterly reader's recent-quarter narrative builds upon.

## Model: Opus
200K+ token 10-K filings require the largest context window and strongest reasoning. Extraction quality from primary sources directly determines downstream analysis quality. Reading 10 years of annual filings demands sustained attention and cross-referencing across a large context.

## Curriculum to Embed (Full Depth -- per AGNT-03)
No dedicated curriculum files -- this agent reads raw filings, not analysis methodology. Its job is extraction and verification, not interpretation.

| File | Lines | ~Tokens | What It Teaches |
|------|-------|---------|-----------------|
| (none) | -- | -- | Agent reads raw SEC filings directly |

## Universal Context (per AGNT-02)
Loaded into every AI agent:
- `knowledge/research-references/rule-one-fundamentals.md` (239 lines, ~800 tokens) -- R1 philosophy, investment requirements, 3 Ms
- `knowledge/research-references/tools-for-analysis.md` (231 lines, ~770 tokens) -- Practical tools, data sources
- **7 Operating Rules**: never skip stages, never assume guru = buy signal, conservative growth, test inversion, define exit before entry, document assumptions, stop when clarity fails

## DataPacket Slice
This agent receives these fields from the DataPacket:
- **companyInfo** -- Ticker, name, SIC code, exchange, sector, industry
- **classification** -- Industry type (bank/reit/insurance/standard) for context
- **financials** -- Full financial statements for cross-checking against 10-K text
- **ttm** -- Trailing twelve months data for current period verification
- **filings** -- Filing index (accession numbers, dates, types) for readFilingSection tool calls

Always included: ticker, companyInfo, classification, caveats

## Toolbox Tools Available
- **readFilingSection** -- Read a specific section from a 10-K, 10-Q, 8-K, or DEF 14A filing. Returns markdown text. Use for targeted extraction of specific sections (NOT full filing reads -- per Pitfall 3).

Note: This agent does NOT have `getTranscriptExcerpt`. Earnings call transcripts are the quarterly reader's domain.

## Sections This Agent Generates
| Stage | Section # | Section Name |
|-------|-----------|-------------|
| (none) | -- | Pre-processing: produces annualReaderFindings in primarySourceInsights |

This agent does not generate report sections. It produces structured extraction output consumed by all downstream agents.

## Reading Strategy
**Chronological order -- oldest first (per D-09).** The agent experiences the company's evolution as it happened. This means:
1. Start with the oldest available 10-K (up to 10 years back)
2. Read forward through each subsequent annual filing
3. Track how the business description, risk factors, competitive position, and management discussion evolve year over year
4. For each year, also check the corresponding proxy statement (DEF 14A) for shareholder letter, board composition, and compensation

**Targeted section reading (per Pitfall 3):** Use `readFilingSection` for specific sections within each filing. Do NOT attempt to read entire 10-Ks at once. Focus on:
- **Business Description** (Item 1) -- What the company does, how it makes money, segments
- **Risk Factors** (Item 1A) -- What could go wrong, how risks evolve over time
- **MD&A** (Item 7) -- Management's narrative on performance, strategy, outlook
- **Selected Financial Data** (Item 6, when available) -- Historical financial highlights

**Proxy statement extraction (DEF 14A):**
- Board composition and changes over time
- Executive compensation structure and trends
- Annual shareholder letter (when present -- gold for management evaluation)
- Related-party transactions

## Output Format
The Annual Reader outputs structured findings as part of `primarySourceInsights`:

- **businessEvolution** -- How the business model changed over the decade (segments added/dropped, revenue mix shifts, geographic expansion)
- **riskThemes** -- Recurring and emerging risk factors, with timeline of when risks appeared/disappeared
- **competitiveChanges** -- How the company's stated competitive position evolved (moat signals)
- **managementNarrative** -- Key themes from MD&A across years (consistency of messaging, strategic pivots)
- **compensationTrends** -- How executive compensation evolved (alignment with shareholder value)
- **boardComposition** -- Board changes, independence, tenure, expertise mix
- **shareholderLetters** -- Key themes from shareholder letters when present (management candor, vision)
- **acquisitionHistory** -- Structured table of all M&A from 10-K disclosures: date, target, amount, rationale (feeds PTCH-12)
- **dataVerification** -- Cross-check results: DataPacket financials vs 10-K text for Rule-One-relevant fields (revenue, net income, total assets, debt, FCF). Flag discrepancies with structured report (per D-10, D-11). SEC-derived values become "primary source values" for downstream agents.

## Cross-Validation (per D-10, D-11)
Compare SEC-derived financial metrics against DataPacket values for Rule-One-relevant fields only:
- Revenue, net income, total assets, total debt, free cash flow, shares outstanding
- Flag discrepancies in a structured report
- The corrected SEC-derived value becomes the "primary source value" for downstream agents
- DataPacket value preserved for audit trail
- PM sees both values at checkpoint

## Critical Rules for This Agent
- Every quantitative claim MUST cite a DataPacket field path or a filing section reference
- "Data not available" for anything not found in filings -- NEVER estimate
- Use `readFilingSection` for targeted extraction -- do NOT read entire filings
- Read chronologically (oldest to newest) per D-09
- Extract direct quotes with filing year and section references
- Distinguish between management claims and verifiable facts
- Track business model evolution -- note when company descriptions change significantly
- Flag when risk factors appear or disappear (new risks are signals)
- Acquisition history must include all M&A, not just major ones

## Contamination Boundary (per AGNT-04)
This agent must NEVER:
- Reference or pattern-match from LULU or other example analyses
- Access files in knowledge/stage-*/examples/ or knowledge/pre-course-examples/
- Produce output that resembles the structure of example reports

Prompt instruction to include: "Perform independent research. Do NOT reference or copy patterns from example analyses."

## Key Decisions Affecting This Agent
- D-08: Primary Source Reader split into annual-reader and quarterly-reader. Annual reader is the "more important" of the two -- deep historical view.
- D-09: Chronological reading order -- oldest first. Agent experiences company evolution as it happened.
- D-10: Cross-validate with financial analyst on Rule-One-relevant metrics only (not every line item).
- D-11: Discrepancy handling: flag + override. SEC-derived value becomes primary source value. DataPacket value preserved for audit.
- D-12: Filings already optimized via filingMarkdown.js (HTML to markdown for token efficiency).
- D-13: Runs in pre-processing (before the 3 generation phases). All section authors have findings available.
- Cost driver: ~200K+ input tokens per 10-K. Budget accordingly for 10 years of annual filings.
