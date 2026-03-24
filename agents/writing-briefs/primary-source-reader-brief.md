# Writing Brief: Primary Source Reader

> Input document for authoring `agents/primary-source-reader/prompt.md` via `/writing-skills`.
> This brief provides the curriculum mapping, DataPacket context, and Toolbox tool list
> needed to write a high-quality agent system prompt.

## Role Summary
The qualitative moat of the research pipeline. Reads raw SEC filings (10-K, 10-Q, proxy statements) and earnings call transcripts to extract insights that no structured data engine can capture. Runs BEFORE all analysis agents, producing `primarySourceInsights.json` that every downstream agent consumes.

## Model: Opus
200K+ token 10-K filings require the largest context window and strongest reasoning. Extraction quality from primary sources directly determines downstream analysis quality.

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
- **transcriptAvailability** -- Which earnings call transcripts are available in cache

Always included: ticker, companyInfo, classification, caveats

## Toolbox Tools Available
- **readFilingSection** -- Read a specific section from a 10-K, 10-Q, 8-K, or DEF 14A filing. Returns markdown text.
- **getTranscriptExcerpt** -- Get an earnings call transcript excerpt by quarter and topic. Returns relevant passages.

## Sections This Agent Generates
| Stage | Section # | Section Name |
|-------|-----------|-------------|
| (none) | -- | Pre-processing: produces primarySourceInsights.json |

This agent does not generate report sections. It produces structured extraction output consumed by all downstream agents.

## Output Format
The Primary Source Reader outputs `primarySourceInsights.json` with:
- **businessDescription** -- Key business model elements from 10-K
- **riskFactors** -- Top risk factors from 10-K, prioritized by severity
- **competitivePosition** -- Management's stated competitive advantages and market position
- **managementDiscussion** -- Key themes from MD&A section
- **transcriptHighlights** -- Key themes, management tone, guidance changes from earnings calls
- **proxyInsights** -- Compensation structure, insider ownership, board composition
- **promiseTracker** -- Forward-looking statements tagged with quarter/year, compared to actuals
- **dataVerification** -- Cross-check results: DataPacket financials vs 10-K text (flags discrepancies)

## Critical Rules for This Agent
- Every quantitative claim MUST cite a DataPacket field path
- "Data not available" for anything not in DataPacket -- NEVER estimate
- **4 responsibilities**: 10-K text extraction, earnings transcript analysis, proxy statement review, Management Promise Tracker
- **10-K Data Verification**: Cross-check key DataPacket financials (revenue, net income, total assets, debt, FCF) against actual 10-K text. Flag discrepancies as data quality issues BEFORE analysis begins. The 10-K is always the source of truth.
- Extract direct quotes with page/section references
- Distinguish between management claims and verifiable facts
- Track management promises across quarters -- if they said "we'll achieve X by Q3" and Q3 has passed, check the result

## Contamination Boundary (per AGNT-04)
This agent must NEVER:
- Reference or pattern-match from LULU or other example analyses
- Access files in knowledge/stage-*/examples/ or knowledge/pre-course-examples/
- Produce output that resembles the structure of example reports

Prompt instruction to include: "Perform independent research. Do NOT reference or copy patterns from example analyses."

## Key Decisions Affecting This Agent
- KDD: Primary Source Reader is the qualitative moat -- runs BEFORE other agents so all downstream agents benefit from verified, source-grounded data
- KDD: 10-K Data Verification catches XBRL extraction gaps before they contaminate analysis
- KDD: Management Promise Tracker builds credibility metrics over time (multi-report)
- Cost driver: ~200K+ input tokens per 10-K. Budget accordingly (~$3-5 per company for this agent alone)
