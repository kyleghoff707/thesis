# Writing Brief: Financial Analyst

> Input document for authoring `agents/financial-analyst/prompt.md` via `/writing-skills`.
> This brief provides the curriculum mapping, DataPacket context, and Toolbox tool list
> needed to write a high-quality agent system prompt.

## Role Summary
The numbers agent. Analyzes all quantitative financial data -- growth rates, return metrics, free cash flow, balance sheet strength, and debt levels -- to assess whether a company meets Rule One financial standards. Produces the financial foundation that every other agent builds upon.

## Model: Sonnet
Financial analysis is pattern-heavy computation with well-defined formulas and thresholds. Sonnet handles this efficiently at lower cost, and this is the most frequently called agent role across all three stages.

## Curriculum to Embed (Full Depth -- per AGNT-03)
These files must be read and their content embedded in the prompt.md at full depth.
No compression, no summarization. The depth IS the competitive edge.

| File | Lines | ~Tokens | What It Teaches |
|------|-------|---------|-----------------|
| `knowledge/research-references/advanced-financial-analysis.md` | 344 | ~1,150 | Deep financial analysis methodology, ratio interpretation, industry-specific analysis |
| `knowledge/research-references/fgr.md` | 153 | ~510 | FGR methodology, Big 4 growth rates, 5 perspectives for growth estimation |
| `knowledge/research-references/capex-cash-flow-explained.md` | 222 | ~740 | CapEx analysis, maintenance vs growth capex, Owner Earnings calculation |

**Total curriculum budget:** ~2,400 tokens (well within limits)

## Universal Context (per AGNT-02)
Loaded into every AI agent:
- `knowledge/research-references/rule-one-fundamentals.md` (239 lines, ~800 tokens) -- R1 philosophy, investment requirements, 3 Ms
- `knowledge/research-references/tools-for-analysis.md` (231 lines, ~770 tokens) -- Practical tools, data sources
- **7 Operating Rules**: never skip stages, never assume guru = buy signal, conservative growth, test inversion, define exit before entry, document assumptions, stop when clarity fails

## DataPacket Slice
This agent receives these fields from the DataPacket:
- **financials** -- Full income, balance, cash flow statements with 10+ years of annual data
- **ttm** -- Trailing twelve months for all financial line items
- **growthRates** -- Pre-computed CAGR for Big 4 (BVPS+Div, Earnings, OpCash, Revenue) across 10/7/5/3/1yr
- **returnMetrics** -- ROE, ROIC, ROA annual values and averages
- **debtMetrics** -- Debt/equity, interest coverage, debt/EBITDA
- **fcf** -- Free cash flow, FCF ratio, owner earnings, capex breakdown
- **keyMetrics** -- P/E, P/B, dividend yield, payout ratio, shares outstanding, market cap

Always included: ticker, companyInfo, classification, caveats

## Toolbox Tools Available
- **getMetric** -- Retrieve any metric from DataPacket using dot-notation path (e.g., "growthRates.earnings.5yr")
- **getFinancialLine** -- Retrieve a specific line item across years (e.g., income/revenues for 2024, 2023, 2022)
- **computeGrowthRates** -- Compute CAGR for any numeric series across standard periods, with optional year exclusion
- **computeMOS** -- Compute Margin of Safety buy price (EPS, FGR, Future P/E, MARR)
- **computePBT** -- Compute Payback Time price (FCF per share, FGR, target years)
- **computeTenCap** -- Compute Ten Cap/Owner Earnings price (CFO, maintenance capex, tax, shares)
- **computeEquityBond** -- Compute Equity Bond buy price (BVPS, ROE, retained ratio, historical P/E)
- **sensitivityTable** -- Generate 2D valuation sensitivity table varying two parameters
- **comparePeers** -- Compare a metric across peer companies (percentile rank, industry average)

## Sections This Agent Generates
| Stage | Section # | Section Name |
|-------|-----------|-------------|
| One Pager | 3 | Meaning/Management KPIs (financial portion) |
| One Pager | 4 | Growth Metrics |
| Pitch Deck | 5 | Free Cash Flow |
| Pitch Deck | 7 | ROE/ROIC/ROA & Debt |
| Pitch Deck | 8 | Balance Sheet |
| Full Story | 5 | Valuation Confirmation (financial inputs) |

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
- **Industry branching**: If classification is REIT, use FFO/AFFO/NAV instead of standard metrics. If bank, use NIM/efficiency ratio. If insurance, use combined ratio/float.
- Always compare metrics to industry peers via comparePeers, not just absolute thresholds
- Gross margin >= 40% is a starting point, not a rule -- interpret within industry context
- When growth rates are inconsistent across periods, explain WHY (acquisition? COVID? cyclical?)
- For cyclical businesses, use CAGR from "first positive year" and present multiple capex ratios
- Present dual Owner Earnings: Rule One method AND Graham method side by side
- Red flags section must identify at least one concern, even for passing companies

## Contamination Boundary (per AGNT-04)
This agent must NEVER:
- Reference or pattern-match from LULU or other example analyses
- Access files in knowledge/stage-*/examples/ or knowledge/pre-course-examples/
- Produce output that resembles the structure of example reports

Prompt instruction to include: "Perform independent research. Do NOT reference or copy patterns from example analyses."

## Key Decisions Affecting This Agent
- KDD #12: Every section must include at least 1 red flag, even for PASS verdicts
- KDD #9: Industry-contextual benchmarks -- interpret metrics within the company's industry, not absolute thresholds
- KDD #11: Dual Owner Earnings calculation (Rule One + Graham methods)
- KDD #17: Cyclical business handling with adjusted CAGR and multiple capex ratios
