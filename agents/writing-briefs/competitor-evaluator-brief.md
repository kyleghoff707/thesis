# Writing Brief: Competitor Evaluator

> Input document for authoring `agents/competitor-evaluator/prompt.md` via `/writing-skills`.
> This brief provides the curriculum mapping, DataPacket context, and Toolbox tool list
> needed to write a high-quality agent system prompt.

## Role Summary
Industry landscape specialist (added by CEO review as a dedicated role). Validates moat claims by researching the competitive environment from a different angle than the Business Analyst. Responsible for market position, barriers to entry, TAM analysis, and business cycle positioning.

## Model: Sonnet
Competitive landscape analysis involves pattern recognition across peer data and industry research. Sonnet handles this efficiently with its strong analytical capabilities.

## Curriculum to Embed (Full Depth -- per AGNT-03)
These files must be read and their content embedded in the prompt.md at full depth.
No compression, no summarization. The depth IS the competitive edge.

| File | Lines | ~Tokens | What It Teaches |
|------|-------|---------|-----------------|
| `knowledge/stage-2-pitch-deck/pitch-deck-I.md` | 284 | ~950 | Market dominance criteria, competitive positioning, simple & predictable |
| `knowledge/stage-2-pitch-deck/pitch-deck-II.md` | 200 | ~670 | Barriers to entry, switching costs, network effects, brand moats |
| `knowledge/stage-3-full-story/story-form-I.md` | 221 | ~740 | Moat field research methodology, 15-point moat checklist |
| `knowledge/research-references/advanced-financial-analysis.md` | 344 | ~1,150 | Cross-referenced by pitch-deck-I/II and story-form-I -- autoloaded for full context |

**Total curriculum budget:** ~3,510 tokens

## Universal Context (per AGNT-02)
Loaded into every AI agent:
- `knowledge/research-references/rule-one-fundamentals.md` (239 lines, ~800 tokens) -- R1 philosophy, investment requirements, 3 Ms
- `knowledge/research-references/tools-for-analysis.md` (231 lines, ~770 tokens) -- Practical tools, data sources
- **7 Operating Rules**: never skip stages, never assume guru = buy signal, conservative growth, test inversion, define exit before entry, document assumptions, stop when clarity fails

## DataPacket Slice
This agent receives these fields from the DataPacket:
- **peers** -- List of 15+ peer companies from SIC-based discovery with tickers and names
- **peerMetrics** -- Financial metrics for all peers (revenue, margins, growth, returns) from Frames API + Yahoo backfill
- **classification** -- Industry type and Thes1s taxonomy for sector context
- **companyInfo** -- Ticker, name, SIC, exchange, sector for identification

Always included: ticker, companyInfo, classification, caveats

## Toolbox Tools Available
- **comparePeers** -- Compare a metric across peer companies (returns percentile rank, peer values, industry average)

Also uses WebSearch via CC Agent tool for trade journals, market research, TAM studies, competitive intelligence.

## Sections This Agent Generates
| Stage | Section # | Section Name |
|-------|-----------|-------------|
| Pitch Deck | 3 | Market Position |
| Pitch Deck | 4 | Barriers & Moats |
| Full Story | 3 | Moat (validation against landscape) |

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
- **4 responsibilities**: market penetration/TAM analysis, competitive edge assessment, business cycle positioning, moat validation against landscape
- Screen 15+ competitors, not just 2-3 hand-picked (per Report Generation Requirement #15)
- Validates moat claims made by the Business Analyst -- different hat, different research approach
- Must answer: "If this moat is real, why haven't competitors eroded it?"
- Business cycle analysis: WHERE are we in the cycle for this industry? Growth, peak, contraction, trough?
- Market share ceiling: Can the company grow at the projected FGR without requiring unrealistic market dominance?
- Compare across financial AND qualitative metrics (margins + brand strength + switching costs)

## Contamination Boundary (per AGNT-04)
This agent must NEVER:
- Reference or pattern-match from LULU or other example analyses
- Access files in knowledge/stage-*/examples/ or knowledge/pre-course-examples/
- Produce output that resembles the structure of example reports

Prompt instruction to include: "Perform independent research. Do NOT reference or copy patterns from example analyses."

## Key Decisions Affecting This Agent
- KDD #12: Every section must include at least 1 red flag, even for PASS verdicts
- KDD #15: Industry-wide peer screens with 15+ companies, not just 2-3
- KDD #3: Market share ceiling analysis -- prove growth rate doesn't require unrealistic dominance
- NEW role from CEO review: explicitly separated from Business Analyst to ensure moat claims get independent validation
