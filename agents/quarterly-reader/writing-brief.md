# Writing Brief: Quarterly Reader

> Input document for authoring `agents/quarterly-reader/prompt.md` via `/writing-skills`.
> This brief provides the curriculum mapping, DataPacket context, and Toolbox tool list
> needed to write a high-quality agent system prompt.

## Role Summary
The recent-quarter narrative analyst. Reads at least 4 quarters of 10-Q reports and at least 4 quarters of earnings call transcripts to capture the company's most recent trajectory -- guidance changes, management tone shifts, promise fulfillment, and emerging trends. Runs BEFORE all analysis agents in pre-processing (parallel with the annual reader, both depending on data assembly), producing structured findings that every downstream agent consumes.

Where the annual reader provides the 10-year historical foundation, the quarterly reader provides the "what's happening now" layer -- the most recent narrative arc that section authors need for timely analysis.

## Model: Opus
Earnings call transcripts combined with quarterly filings require large context and strong reasoning. The agent must track management promises across quarters, detect tone shifts, and reconcile guidance changes -- all tasks requiring sustained analytical attention.

## Curriculum to Embed (Full Depth -- per AGNT-03)
No dedicated curriculum files -- this agent reads raw filings and transcripts, not analysis methodology. Its job is extraction and verification, not interpretation.

| File | Lines | ~Tokens | What It Teaches |
|------|-------|---------|-----------------|
| (none) | -- | -- | Agent reads raw SEC filings and transcripts directly |

## Universal Context (per AGNT-02)
Loaded into every AI agent:
- `knowledge/research-references/rule-one-fundamentals.md` (239 lines, ~800 tokens) -- R1 philosophy, investment requirements, 3 Ms
- `knowledge/research-references/tools-for-analysis.md` (231 lines, ~770 tokens) -- Practical tools, data sources
- **7 Operating Rules**: never skip stages, never assume guru = buy signal, conservative growth, test inversion, define exit before entry, document assumptions, stop when clarity fails

## DataPacket Slice
This agent receives these fields from the DataPacket:
- **companyInfo** -- Ticker, name, SIC code, exchange, sector, industry
- **classification** -- Industry type (bank/reit/insurance/standard) for context
- **financials** -- Full financial statements for cross-checking against 10-Q text
- **ttm** -- Trailing twelve months data for current period verification
- **filings** -- Filing index (accession numbers, dates, types) for readFilingSection tool calls
- **transcripts** -- Transcript availability and cached transcript data for getTranscriptExcerpt tool calls

Always included: ticker, companyInfo, classification, caveats

## Toolbox Tools Available
- **readFilingSection** -- Read a specific section from a 10-K, 10-Q, 8-K, or DEF 14A filing. Returns markdown text. Use for targeted extraction of specific sections.
- **getTranscriptExcerpt** -- Get an earnings call transcript excerpt by quarter and topic. Returns relevant passages.

## Sections This Agent Generates
| Stage | Section # | Section Name |
|-------|-----------|-------------|
| (none) | -- | Pre-processing: produces quarterlyReaderFindings in primarySourceInsights |

This agent does not generate report sections. It produces structured extraction output consumed by all downstream agents.

## Reading Strategy
**Chronological order -- oldest first (per D-09).** Read the oldest available quarter first and work forward to the most recent:
1. Start with the oldest available 10-Q (at least 4 quarters back)
2. For each quarter, read the 10-Q first, then the corresponding earnings call transcript
3. Track how guidance, tone, and themes evolve quarter over quarter
4. Note when management introduces new topics or drops previously emphasized themes

**10-Q sections to focus on:**
- **MD&A** -- Management's narrative on quarterly performance, forward-looking statements
- **Risk Factors** -- Changes from annual filing (new risks, removed risks)
- **Financial Statements Notes** -- Recent events, acquisitions, legal proceedings

**Transcript analysis:**
- Management prepared remarks -- tone, confidence level, key themes
- Forward-looking statements -- specific guidance (revenue, EPS, margins, growth targets)
- Q&A section -- what analysts are asking (reveals market concerns), management's candor in responses
- Guidance changes -- upgraded, maintained, or lowered from prior quarter

## Promise Tracking
The quarterly reader's signature capability. Extract forward-looking statements and track their fulfillment:
1. For each quarter, extract all forward-looking statements (guidance, targets, strategic commitments)
2. Tag each promise with quarter/year and category (financial, strategic, operational)
3. When subsequent quarters are available, check whether promises were fulfilled
4. Output a structured promise-tracker array: `{ promise, quarter, category, status, evidence }`
5. Status values: "fulfilled", "partially fulfilled", "missed", "pending", "modified"

This feeds directly into management evaluation -- consistency between words and actions is a core Rule One signal.

## Graceful Transcript Absence
If neither `VITE_ALPHA_VANTAGE_KEY` nor `VITE_ALPHA_VANTAGE_KEY_2` is set in the user's environment:
- Operate with 10-Qs only -- do not fail
- Note the gap explicitly in findings: "Earnings call transcripts not available. Analysis based on 10-Q filings only. Transcript analysis (management tone, Q&A themes, guidance tracking) could not be performed."
- Promise tracking will be limited to written guidance in 10-Q MD&A sections

## Output Format
The Quarterly Reader outputs structured findings as part of `primarySourceInsights`:

- **recentTrends** -- Key business trends from the most recent quarters (revenue trajectory, margin direction, segment performance)
- **guidanceTrajectory** -- How management guidance evolved quarter over quarter (upgrades, maintains, downgrades)
- **toneShifts** -- Notable changes in management tone or emphasis (confidence, caution, new themes)
- **promiseTracker** -- Structured array of forward-looking statements with fulfillment status (per Promise Tracking section above)
- **analystConcerns** -- Recurring themes from Q&A sections (what the Street is worried about)
- **recentEvents** -- Acquisitions, legal proceedings, executive changes, restructurings from 10-Q notes
- **dataVerification** -- Cross-check results: DataPacket financials vs 10-Q text for quarterly data. Same structured format as annual reader (per D-10, D-11).

## Cross-Validation (per D-10, D-11)
Compare SEC-derived financial metrics against DataPacket values for Rule-One-relevant fields:
- Quarterly revenue, net income, and any metrics that differ from annual figures
- Flag discrepancies in a structured report
- The corrected SEC-derived value becomes the "primary source value" for downstream agents
- DataPacket value preserved for audit trail
- PM sees both values at checkpoint

## Critical Rules for This Agent
- Every quantitative claim MUST cite a DataPacket field path or a filing/transcript section reference
- "Data not available" for anything not found in filings/transcripts -- NEVER estimate
- Use `readFilingSection` for targeted section extraction, `getTranscriptExcerpt` for transcript passages
- Read chronologically (oldest to newest) per D-09
- Track management promises across quarters -- if they said "we'll achieve X by Q3" and Q3 has passed, check the result
- Distinguish between management claims and verifiable facts
- Detect tone shifts -- when management suddenly becomes cautious or changes emphasis, flag it
- If transcripts are unavailable, operate gracefully with 10-Qs only and document the gap
- Extract direct quotes with quarter/year references

## Contamination Boundary (per AGNT-04)
This agent must NEVER:
- Reference or pattern-match from LULU or other example analyses
- Access files in knowledge/stage-*/examples/ or knowledge/pre-course-examples/
- Produce output that resembles the structure of example reports

Prompt instruction to include: "Perform independent research. Do NOT reference or copy patterns from example analyses."

## Key Decisions Affecting This Agent
- D-08: Primary Source Reader split into annual-reader and quarterly-reader. Quarterly reader covers recent quarters and transcripts.
- D-09: Chronological reading order -- oldest first. Agent experiences quarterly evolution as it happened.
- D-10: Cross-validate on Rule-One-relevant financial metrics only (not every line item).
- D-11: Discrepancy handling: flag + override. SEC-derived value becomes primary source value.
- D-12: Filings already optimized via filingMarkdown.js (HTML to markdown for token efficiency).
- D-13: Runs in pre-processing (parallel with annual reader, both after data assembly). All section authors have findings available.
- Transcript availability depends on user API keys (Alpha Vantage free tier, 2-key failover). Agent must handle absence gracefully.
