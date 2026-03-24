# Feature Landscape

**Domain:** AI-powered investment research report generation (Rule One methodology)
**Researched:** 2026-03-24

## Competitive Context

The AI financial analysis space breaks into four tiers:

1. **Enterprise research terminals** (AlphaSense, Rogo, Bloomberg) — $10K+/yr, institutional focus, 500M+ document indices, but NO methodology-opinionated analysis. They answer "what happened?" not "should I invest?"
2. **AI thesis generators** (Portrait Analytics, Energent.ai, Fiscal.ai/FinChat) — Produce investment memos and one-pagers, but with generic frameworks. None follow a specific investment philosophy (Rule One, Buffettology, etc.) with curriculum-depth rigor.
3. **Open-source multi-agent frameworks** (TradingAgents, FinRobot, ai-hedge-fund) — Research prototypes with bull/bear debates and specialized agent roles. Technically interesting but not production-ready for report generation. Trading-focused, not thesis-focused.
4. **General AI + financial data** (ChatGPT + FinanceBench, Claude with SEC filings) — Flexible but shallow. No citation grounding, no structured gating, no methodology enforcement.

**Where Thes1s sits:** Between tiers 2 and 3 — a methodology-driven multi-agent system that produces hedge-fund-quality investment theses for a specific philosophy (Rule One). This niche is unoccupied. Every competitor is either methodology-agnostic or trading-focused.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or amateurish.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Section-by-section report generation** | Every AI report tool generates structured sections. Users expect complete coverage of the methodology's required sections (10 pitch deck sections, 8 full story sections). | Med | Foundation of the product. Each section = one agent output. |
| **Inline citations with source links** | 38% of executives report wrong decisions from hallucinated AI output (Deloitte 2024). Portrait Analytics, Rogo, AlphaSense all cite sources. Uncited claims = amateur. | Med | Academic-style `[1]`, `[2]` numbered refs. Every claim traceable to DataPacket field path, SEC filing, or URL. 40+ refs per full analysis (per user's ODFL example). |
| **Data grounding (no hallucinated numbers)** | Table stakes for ANY financial AI tool. GPT-4 still hallucinates 18-28% of citations. Financial numbers must come from verified data engines, never generated. | High | "If not in DataPacket, say 'Data not available.' NEVER estimate." This is the core trust mechanism. |
| **Pass/Fail verdicts per section** | User's own workflow has section-level conclusions. Professional investment memos have explicit go/no-go at each gate. Without verdicts, the report is a description, not a decision tool. | Low | PASS / FAIL / WATCHLIST / REVIEW per section. Synthesis writer aggregates into overall verdict. |
| **Gated stage progression** | One Pager (filter) -> Pitch Deck (research) -> Full Story (conviction). This IS the Rule One methodology. Skipping stages violates the philosophy and wastes money on bad companies. | Med | Stage 1 must be approved before Stage 2 unlocks. Each stage has human approval gate. |
| **Sensitivity tables for valuations** | Every professional valuation includes sensitivity analysis. Single-point estimates are amateur. User's own analyses always present ranges. AlphaSpread, Portrait Analytics all include scenario analysis. | Med | Vary FGR, EPS, CapEx % across MOS/PBT/TenCap/EquityBond. Matrix grid showing buy price ranges under different assumptions. |
| **Valuation as price ranges** | Professional work product always presents ranges, not single numbers. The user explicitly requires Low/High inputs for FGR, Maintenance CapEx %, and Historical Avg P/E. | Low | Hero box shows full range across all enabled methods. Conservative to optimistic. |
| **Competitor benchmarking** | User's own research always compares 2-3+ competitors minimum (ODFL compared 15). Professional memos always contextualize metrics against peers. Industry context without peers is meaningless. | Med | Leverage existing Competitors tab engine (SIC peers, 22 metrics). Agents get peer data in DataPacket + can drill with `comparePeers()` tool. |
| **Red flag identification** | Professional analysts always document concerns — even when the thesis is bullish. User's own EW analysis had red flags despite working at the company. Omitting risks = confirmation bias. | Low | Every section must identify at least one concern. Separate red flags section aggregated from all agents. |
| **Real-time generation progress** | Users waiting 15-30 min for a pitch deck need progress feedback. AlphaSense shows processing status. Energent shows agent status. Silence during generation = broken. | Med | Show which agent is working, which sections complete, estimated time remaining. Phase checkpoint notifications. |
| **Structured checkpoint reviews** | Human-in-the-loop is standard practice (EU AI Act mandates it for high-risk finance AI by Aug 2026). Portrait Analytics, Rogo all include human review steps. | Med | After each phase: present findings, data gaps, questions, confidence levels. User responds with answers, corrections, or "proceed." |
| **Confidence scoring per section** | Professional memos rate conviction levels. AlphaSense and Portrait Analytics both include confidence indicators. Without confidence, user can't distinguish strong from weak analysis. | Low | HIGH / MEDIUM / LOW per section based on data completeness and source agreement. |
| **Export to PDF** | Professional investment memos are distributed as PDFs. This is the product demo format. Without clean export, the tool looks like a prototype. | Med | Branded Thes1s layout. Charts, tables, footnoted citations. Not an HTML-to-PDF dump — a designed document. |

---

## Differentiators

Features that set Thes1s apart. Not expected from generic tools, but high value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Rule One methodology enforcement** | NO competitor follows a specific investment philosophy with curriculum-depth rigor. Every AI tool is methodology-agnostic. Thes1s agents are trained on the actual Rule One curriculum files, follow the 7 Operating Rules, and the methodology drives every section structure and verdict criterion. This is the moat. | High | Curriculum injected at full depth into each agent's context. Not compressed, not summarized. The depth IS the competitive advantage. |
| **Management Promise Tracker** | Extract forward-looking statements from earnings call transcripts, tag with quarter/year, compare to actual results over time. No AI research tool does this. Hudson Labs and Verity summarize transcripts; nobody tracks promises longitudinally. This produces a management credibility score that directly feeds the Management section. | High | Primary Source Reader extracts promises. Stored in report data model. Compared across quarters. Unique feature — validates "does management deliver?" which is a core Rule One question. |
| **Primary Source Reader (10-K text analysis)** | Most AI tools extract numbers from APIs. Thes1s reads the actual 10-K text — business description, risk factors, competitive positioning, MD&A. This is what real analysts do. Numbers tell you what happened; the 10-K tells you why. | High | ~200K+ input tokens for a full 10-K. Cost driver but quality differentiator. Cross-checks DataPacket financials against actual filing. 10-K is always source of truth. |
| **Bull/Bear/Judge structured debate** | TradingAgents (UCLA/MIT research) proved multi-agent bull/bear debate produces better outcomes than single-perspective analysis. Thes1s implements this in the Full Story stage. Bull builds the case, Bear attacks every point with evidence, Judge scores each rebuttal. | Med | Risk Analyst as Bear, Synthesis Writer as Bull, Financial Analyst as Judge. Produces a scored debate transcript that directly feeds the Inversion & Rebuttal section. |
| **FGR derivation workflow** | FGR (Future Growth Rate) is the most important assumption in the entire analysis. It feeds all 4 valuation methods. Thes1s treats it as a structured 5-input workflow (Historical, Market Relativity, Company Guidance, Industry CAGR, Analyst Consensus) with user confirmation. No other tool has this. | Med | Valuation Specialist walks through 5 inputs, shows data for each, proposes FGR range, user confirms before valuation proceeds. FGR confirmation IS a checkpoint. |
| **Toolbox tools for iterative agent exploration** | Agents don't just read a static data dump. They can call `computeMOS()` with different assumptions, `getFinancialLine()` to drill into specific years, `comparePeers()` to check metrics. This mirrors how a real analyst uses the Toolbox — the analysis drives what data you look at next. | High | 12+ callable functions. Agents use them like a Ruler flips between tabs. The investigation is iterative, not linear. |
| **Industry-specific KPIs and context cards** | User's MU analysis tracked ASP and cost-per-bit (semiconductor KPIs). User's SFM analysis used new store count x avg cost for maintenance capex. Generic benchmarks (gross margin >= 40%) mislead. Industry context cards explain what metrics matter in each industry. | Med | Industry overlays already exist in the XBRL engine (bank, REIT, insurance). Extend to agent prompts with industry-specific curriculum and pop-up glossary for terms. |
| **10-K Data Verification** | Primary Source Reader cross-checks key DataPacket financials (revenue, net income, total assets, debt, FCF) against actual 10-K text. Flags discrepancies BEFORE analysis begins. No other tool validates its own data layer. | Med | Trust but verify. XBRL extraction is 96.1% accurate for scoring-critical fields — but the remaining 3.9% matters for specific companies. Verification catches the gaps. |
| **"Tell me more" deep-dive** | Click any section point and the agent researches deeper. Not regeneration — targeted drill-down with additional context. Professional analysts follow threads; AI should too. | Low | Small-effort, high-delight. Spawns focused sub-query with section context. |
| **Watchlist/No-Buy as valid outcomes** | User's ODFL analysis concluded "great company, too expensive" — a disciplined outcome. Most AI tools assume the goal is to buy. Thes1s treats WATCHLIST and NO BUY as legitimate, respected conclusions. The tool helps you decide, not sell you on buying. | Low | Built into verdict system. WATCHLIST means "monitor for better entry." NO BUY means "thesis broken." Both get full reports — the work product has value regardless of conclusion. |
| **Cyclical business handling** | User's MU analysis used CAGR from "first positive year" to handle cyclical earnings. Generic tools average all years including troughs, producing misleading growth rates. | Low | Financial Analyst agent must detect cyclicality and adjust growth calculations. Exclude trough years from CAGR. Present multiple capex ratios (through-cycle, expansion-only). |
| **Source preview on citation hover** | Hover over `[7]` and see the actual 10-K paragraph or transcript excerpt. Not just a link — the source text itself. This is what makes citations trustworthy vs decorative. | Med | Requires storing source snippets alongside citations. Pre-fetched during generation, not loaded on hover. |
| **Assumption tracker sidebar** | Track every assumption across the analysis: FGR value, maintenance capex %, P/E ratio, growth ceiling, moat durability. Each with confidence level. Changes to assumptions cascade through affected sections. | Med | Central assumption registry. Valuation sections reference it. User can override any assumption and see impact. |
| **Version history / diff view** | Re-generate a section with different assumptions and compare side by side. Track how the thesis evolves over time (quarterly re-analysis). | Med | Git-like diffing for report sections. Useful for Living Thesis (Phase 9+) but valuable even in v1 for iteration. |

---

## Anti-Features

Features to explicitly NOT build. Each would seem logical but is wrong for this product.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Automated buy/sell signals** | Rule One methodology requires the PM to make the decision. Automated signals bypass human judgment and create legal liability. LiarLiar.ai and Kavout do this — wrong fit for a thesis tool. | Present all data + verdict. User decides. The tool is an analyst team, not a robo-advisor. |
| **Real-time price alerts / trading integration** | This is a research tool, not a trading platform. Price monitoring belongs in stickeR1 (the portfolio tracker). Mixing research and trading dilutes both. | Keep scope to report generation. stickeR1 handles the portfolio side. |
| **Batch generation (analyze 50 companies at once)** | Rule One is deep, not wide. Each company gets 40+ hours of equivalent research. Batch mode incentivizes shallow analysis, which defeats the purpose. Cost would be $400-600 per batch. | One company at a time. Quality over quantity. The One Pager exists as the fast filter. |
| **Crowd-sourced / social research** | "What other users think" introduces noise and herding. Hedge fund analysts explicitly avoid consensus views because crowded trades reduce returns. | Independent analysis. No social features. The PM's conviction must be their own. |
| **Sell-side style "BUY/HOLD/SELL" rating** | Sell-side ratings are famously biased (historically heavy "BUY" skew). Rule One doesn't use a 3-tier rating — it uses PASS/FAIL with a binary invest/don't-invest gate. | PASS / FAIL / WATCHLIST verdict system aligned to Rule One methodology. |
| **Fine-tuned / custom-trained LLM** | Fine-tuning creates a maintenance burden and locks you to a model version. Claude and GPT improve every quarter. Prompt engineering with curriculum injection is more flexible, cheaper, and stays current. | Use foundation models (Claude Sonnet/Opus) with curriculum-injected prompts. Agent definitions in `agents/` directory are editable text files, not model weights. |
| **Alternative data (satellite imagery, social sentiment, credit card data)** | Kavout uses parking lot satellite data. This is quantitative trading, not fundamental analysis. Rule One is about understanding the business, not finding statistical edges. | Stick to SEC filings, earnings transcripts, financial data, industry research. The data sources in Rule One methodology: EDGAR, analyst estimates, earnings calls, industry journals. |
| **Automated portfolio rebalancing** | Portfolio management is stickeR1's job. Thes1s generates the thesis that informs the buy decision. Combining both creates a monolithic tool that does neither well. | Clean separation: Thes1s = research/conviction. stickeR1 = portfolio/tracking. |
| **General-purpose AI chat about stocks** | FinChat/Fiscal.ai is a chat interface for financial questions. Thes1s is a structured research workflow. Chat mode dilutes the methodology and produces shallow, ad-hoc answers. | Structured report generation following the 3-stage gated workflow. The "Tell me more" deep-dive is scoped to section context, not open-ended chat. |
| **Automated eval system (v1)** | The temptation is to build automated quality scoring from day one. But you don't know what "good" looks like yet. The user IS the eval system for the first 5-10 reports. Building eval infrastructure before understanding quality criteria wastes effort. | Manual LULU benchmark first. User reviews like a PM reviews analyst work. What the user learns becomes the spec for automated eval later. |

---

## Feature Dependencies

```
DataPacket assembly ─────────────┬──> One Pager generation
                                 │
Primary Source Reader ───────────┤
                                 ├──> Pitch Deck generation
Toolbox tools ───────────────────┤
                                 ├──> Full Story generation
Report JSON schema ──────────────┘
                                 │
Section rendering (OnePager.jsx) ──> StatusBadge / Progress dashboard
                                 │
Pitch Deck sections ─────────────┬──> Sensitivity tables
                                 ├──> FGR derivation workflow
                                 ├──> Assumption tracker
                                 └──> Industry context cards

Full Story sections ─────────────┬──> Bull/Bear/Judge debate
                                 ├──> Management Promise Tracker
                                 └──> Scored checklists (43 items)

Citation system ─────────────────┬──> Source preview on hover
                                 ├──> Reference list (export)
                                 └──> 10-K Data Verification (pre-analysis)

Export/PDF ──────────────────────┬──> Version history / diff view
                                 └──> (requires all rendering complete)

One Pager approved ──────────────> Pitch Deck unlocked
Pitch Deck approved ─────────────> Full Story unlocked
```

**Critical path:** DataPacket + Report Schema + Agent Definitions -> One Pager generation -> validation against LULU benchmark -> all subsequent features.

---

## MVP Recommendation

**Prioritize (Phase 5):**
1. DataPacket assembly + Report JSON schema (data foundation)
2. Agent definitions for 2-3 core roles (Financial Analyst, Business Analyst, Synthesis Writer)
3. One Pager generation with inline citations (prove the architecture works)
4. Section-level verdicts (PASS/FAIL/REVIEW)
5. Basic progress feedback during generation

**Phase 6 (Pitch Deck):**
1. All 9 agent roles active (multi-agent validated as necessary)
2. Structured checkpoints with human review
3. Sensitivity tables + FGR derivation workflow
4. Competitor benchmarking (leverage existing engine)
5. Primary Source Reader (10-K text + transcripts)

**Phase 7 (Full Story):**
1. Bull/Bear/Judge debate
2. Management Promise Tracker
3. Scored checklists (Meaning 15pt, Moat 15pt, Management 13pt)
4. Inversion & Rebuttal with evidence

**Phase 8 (Polish):**
1. PDF export (branded, professional)
2. Citation hover preview
3. Version history / diff view
4. Assumption tracker sidebar

**Defer to Phase 9+:**
- Living Thesis Intelligence (re-analysis on new data)
- Cross-Company Intelligence (knowledge graph)
- Conviction Scoring (Bayesian updates)
- Historical comparison across reports
- Multi-user backend

**Defer indefinitely (anti-features):**
- Automated signals, batch processing, social features, fine-tuned models, alternative data, portfolio rebalancing, general chat

---

## What Separates Professional from Amateur

Based on competitive analysis and hedge fund analyst standards, these are the hallmarks of professional investment research that Thes1s must achieve:

| Professional | Amateur |
|-------------|---------|
| Every number has a source citation | Numbers appear without attribution |
| Verdict is explicit: PASS, FAIL, WATCHLIST | Vague "this looks good" conclusions |
| Bear case is as strong as bull case | Only positive points, risks mentioned in passing |
| Sensitivity ranges, not point estimates | Single buy price number |
| Industry-contextual benchmarks | Generic "gross margin > 40%" rules |
| Management credibility scored against track record | "Management seems competent" |
| Competitive landscape with 5-15 peers | 1-2 hand-picked competitors |
| Assumptions explicitly listed and testable | Assumptions buried in narrative |
| Cyclical businesses handled differently | Straight-line growth for everything |
| "Data not available" stated honestly | Made-up or estimated numbers |
| Watchlist/No-buy is a respected outcome | Every analysis concludes "buy" |
| Red flags in every section, even bullish ones | Concerns only in a risk section |

---

## Sources

- [Rogo AI - Series C, institutional outputs](https://rogo.ai/) -- MEDIUM confidence
- [Portrait Analytics - equity research AI with thesis monitoring](https://www.portraitanalytics.ai/) -- MEDIUM confidence
- [AlphaSense - 500M document index, Deep Research, Financial Data](https://www.alpha-sense.com/) -- HIGH confidence (PR + product pages)
- [FinChat/Fiscal.ai - AI-powered financial research terminal](https://www.wallstreetzen.com/blog/finchat-io-fiscal-ai-review/) -- MEDIUM confidence
- [TradingAgents - UCLA/MIT multi-agent framework with bull/bear debate](https://arxiv.org/abs/2412.20138) -- HIGH confidence (peer-reviewed)
- [FinRobot - open-source AI agent platform for finance](https://github.com/AI4Finance-Foundation/FinRobot) -- HIGH confidence (GitHub, ArXiv)
- [Energent.ai - AI investment thesis and analysis](https://www.energent.ai/use-cases/en/investment-thesis) -- LOW confidence (self-reported benchmarks)
- [Hudson Labs - earnings call AI tools](https://www.hudson-labs.com/post/top-6-ai-tools-for-summarizing-earnings-calls) -- MEDIUM confidence
- [Verity Platform - AI earnings call analysis](https://verityplatform.com/) -- MEDIUM confidence
- [Alpha Spread - automated intrinsic valuation](https://www.alphaspread.com/) -- MEDIUM confidence
- [Daloopa - hedge fund investment memo standards](https://daloopa.com/blog/analyst-best-practices/hedge-fund-investment-memo-example) -- MEDIUM confidence
- [AI-Assisted Value Investing HITL Framework](https://www.mdpi.com/2079-9292/15/6/1155) -- HIGH confidence (peer-reviewed journal)
- [MIT ContextCite - citation attribution tool](https://news.mit.edu/2024/citation-tool-contextcite-new-approach-trustworthy-ai-generated-content-1209) -- HIGH confidence
- [Deloitte 2024 - 38% of executives made wrong decisions from AI hallucinations](https://infomineo.com/artificial-intelligence/stop-ai-hallucinations-detection-prevention-verification-guide-2025/) -- MEDIUM confidence (secondary source)
