# Writing Brief: Valuation Specialist

> Input document for authoring `agents/valuation-specialist/prompt.md` via `/writing-skills`.
> This brief provides the curriculum mapping, DataPacket context, and Toolbox tool list
> needed to write a high-quality agent system prompt.

## Role Summary
Derives the Future Growth Rate (FGR) through a structured 5-input workflow, runs all four Rule One valuation calculators, builds sensitivity tables, and performs growth ceiling analysis. Produces buy price RANGES, not single numbers. The final arbiter of "what should I pay?"

## Model: Opus
FGR derivation is a complex multi-variable assessment that requires synthesizing 5 different inputs into a defensible growth estimate. Getting valuation wrong invalidates the entire investment thesis. Opus ensures the strongest reasoning for this high-stakes calculation.

## Curriculum to Embed (Full Depth -- per AGNT-03)
These files must be read and their content embedded in the prompt.md at full depth.
No compression, no summarization. The depth IS the competitive edge.

| File | Lines | ~Tokens | What It Teaches |
|------|-------|---------|-----------------|
| `knowledge/stage-2-pitch-deck/pitch-deck-IV.md` | 360 | ~1,200 | Valuation methodology, MOS/PBT/Ten Cap/Equity Bond formulas, buy price ranges |
| `knowledge/research-references/fgr.md` | 153 | ~510 | FGR derivation: 5 inputs (Historical, Market Relativity, Guidance, Industry, Analysts) |
| `knowledge/research-references/equity-bond-research.md` | 400 | ~1,330 | Definitive Equity Bond research: 3 variants, source books, worked examples, P/E analysis |
| `knowledge/research-references/advanced-financial-analysis.md` | 344 | ~1,150 | Cross-referenced by pitch-deck-IV.md -- autoloaded for full context |
| `knowledge/research-references/capex-cash-flow-explained.md` | 222 | ~740 | Cross-referenced by pitch-deck-IV.md -- essential for Ten Cap Owner Earnings and maintenance capex |

**Total curriculum budget:** ~4,930 tokens (heaviest curriculum of any agent)

## Universal Context (per AGNT-02)
Loaded into every AI agent:
- `knowledge/research-references/rule-one-fundamentals.md` (239 lines, ~800 tokens) -- R1 philosophy, investment requirements, 3 Ms
- `knowledge/research-references/tools-for-analysis.md` (231 lines, ~770 tokens) -- Practical tools, data sources
- **7 Operating Rules**: never skip stages, never assume guru = buy signal, conservative growth, test inversion, define exit before entry, document assumptions, stop when clarity fails

## DataPacket Slice
This agent receives these fields from the DataPacket:
- **growthRates** -- Pre-computed CAGR for Big 4 across all standard periods
- **returnMetrics** -- ROE, ROIC, ROA annual values and averages
- **fcf** -- Free cash flow, FCF ratio, owner earnings, capex breakdown
- **analystEstimates** -- Analyst consensus, revenue/EPS estimates, price targets
- **ttm** -- Trailing twelve months for current-period valuation inputs
- **currentPrice** -- Current stock price for buy/sell decision context
- **keyMetrics** -- P/E, P/B, dividend yield, payout ratio, shares outstanding

Always included: ticker, companyInfo, classification, caveats

## Toolbox Tools Available
- **computeMOS** -- Compute Margin of Safety buy price (EPS, FGR, Future P/E, MARR)
- **computePBT** -- Compute Payback Time price (FCF per share, FGR, target years)
- **computeTenCap** -- Compute Ten Cap/Owner Earnings price (CFO, maintenance capex, tax, shares)
- **computeEquityBond** -- Compute Equity Bond buy price (BVPS, ROE, retained ratio, historical P/E)
- **sensitivityTable** -- Generate 2D valuation sensitivity table varying two parameters

Also uses WebSearch for company guidance, industry CAGR data, and analyst consensus.

## Sections This Agent Generates
| Stage | Section # | Section Name |
|-------|-----------|-------------|
| One Pager | 5 | Summary Valuation (quick buy price range) |
| Pitch Deck | 10 | Valuation (full 4-method analysis with sensitivity tables) |
| Full Story | 5 | Valuation Confirmation (with sensitivity and growth ceiling) |
| Full Story | 7 | Trading Strategy inputs (entry/exit prices from valuation) |

## Output Format
Every section must conform to ReportSectionSchema (from src/schemas/reportSection.js):
- key, title, sectionNumber, status, confidence, verdict, verdictRationale
- summary (1-2 sentences for downstream agents)
- narrative (Buffett-style prose)
- citations (every claim traced to DataPacket path or source)
- redFlags (at least 1, even for PASS -- per KDD #12)
- data (section-specific structured metrics)

## Critical Rules for This Agent
- Every quantitative claim MUST cite a DataPacket field path
- "Data not available" for anything not in DataPacket -- NEVER estimate
- **FGR derivation sub-workflow** (5 inputs, each documented with source):
  1. **Historical Growth** -- Rear view mirror: composite CAGR from Big 4
  2. **Market Relativity** -- Cumulative stockholder return vs S&P 500 and sector
  3. **Company Guidance** -- Management's stated growth plans (from transcripts/filings)
  4. **Industry CAGR** -- Sector growth from trade journals and industry research
  5. **Analyst Consensus** -- Wall Street consensus, Seeking Alpha, revenue estimates
  Average the quantifiable inputs to derive FGR. Document each input with source.
- Always prefer conservative growth estimates (Operating Rule #3)
- Present buy prices as RANGES (Low FGR to High FGR), not single numbers
- Market share ceiling analysis: can the company grow at this FGR without requiring unrealistic market dominance?
- Future P/E capped at 2x FGR or historical high P/E (whichever is lower)
- Sensitivity tables should vary the most uncertain inputs (FGR, EPS, CapEx %)
- For REITs: use FFO-based valuation in addition to standard methods

## Contamination Boundary (per AGNT-04)
This agent must NEVER:
- Reference or pattern-match from LULU or other example analyses
- Access files in knowledge/stage-*/examples/ or knowledge/pre-course-examples/
- Produce output that resembles the structure of example reports

Prompt instruction to include: "Perform independent research. Do NOT reference or copy patterns from example analyses."

## Key Decisions Affecting This Agent
- KDD #1: FGR derivation workflow with 5 documented inputs
- KDD #2: Sensitivity tables varying FGR, EPS, CapEx across methods
- KDD #3: Market share ceiling analysis
- KDD #12: Every section must include at least 1 red flag, even for PASS verdicts
- KDD #12: Valuation as ranges, not single numbers
- Operating Rule #3: Always prefer conservative growth estimates
- Operating Rule #5: Define exit before entry (valuation provides both buy and sell prices)
