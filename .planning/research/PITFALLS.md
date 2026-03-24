# Domain Pitfalls

**Domain:** Multi-agent AI investment analysis (Rule One methodology)
**Project:** Thes1s — 9-agent research pipeline generating One Pager / Pitch Deck / Full Story
**Researched:** 2026-03-24
**Overall confidence:** HIGH (grounded in project-specific prototype failures, industry research, and XBRL engine experience)

---

## Critical Pitfalls

Mistakes that cause rewrites, lost user trust, or fundamentally broken output. Each of these has been observed in the wild — either in this project's prototype testing or documented across the multi-agent AI industry.

---

### Pitfall 1: Example Contamination — "The LULU Echo"

**What goes wrong:** Agents with example outputs in their context (or accessible through any path) pattern-match from the example instead of performing independent analysis. The LULU prototype pitch deck proved this: the agent regurgitated the LULU example structure, phrasing, and analytical framing rather than doing fresh research. TSCO (no example available) produced different but worse output — confirming agents lean on examples as a crutch.

**Why it happens:** LLMs are powerful pattern-matchers. When they see a completed example alongside a template, the path of least resistance is to fill in the template by adapting the example rather than reasoning from data. This is especially dangerous with investment analysis because the output *looks* independent — same section headings, different numbers — but the analytical logic, emphasis, and conclusions mirror the example rather than emerging from the company's actual data.

**Consequences:**
- Output appears competent but is actually derivative — a sophisticated "find and replace" of LULU details with the new company's details
- Industry-specific nuances get missed because the agent applies athleisure framing to, say, a semiconductor company
- The portfolio manager (user) might not catch it if they haven't memorized the LULU example
- Every company starts to read like LULU with different numbers — homogeneous, unconvincing output

**Warning signs:**
- Similar sentence structures across reports for different companies
- The same moat framework applied regardless of industry (e.g., "brand moat" attributed to a B2B company)
- Identical section ordering emphasis when different companies would naturally emphasize different strengths
- Phrases that match the example verbatim with only company names swapped

**Prevention:**
1. **Hard architectural boundary**: LULU examples must NEVER enter agent context — not in system prompts, not in curriculum files loaded by agents, not accessible via Toolbox tools. The architecture plan already mandates this (KDD #15). Enforce it in `agents/` config files with explicit exclusion rules.
2. **Template without examples**: Agents receive the template structure and curriculum (methodology) but never a completed example. The curriculum files (pitch-deck-I.md through IV.md) teach the *method* without showing a completed analysis.
3. **Post-generation contamination check**: The `critic.js` quality system should include a similarity check — if section phrasing scores above a threshold against the LULU benchmark, flag for regeneration.
4. **Industry-specific framing**: The DataPacket should include SIC classification and industry type so agents frame their analysis in industry-appropriate terms from the start.

**Detection:** Run the first 5 generated reports through a manual comparison against LULU examples. If any section reads like an adapted LULU section, the contamination boundary has leaked.

**Phase:** Address in Phase 5A (agent definitions) and Phase 5D (quality system). This is the single most important guardrail to get right before any generation runs.

---

### Pitfall 2: Citation Fabrication and Broken Reference Chains

**What goes wrong:** Agents generate convincing citations that don't exist, misattribute data to the wrong source, or create circular reference chains where citations point to other generated content rather than primary sources. Research shows hallucinated citation rates across LLMs range from 14% to 95%, and 50-90% of LLM responses are not fully supported by cited sources.

**Why it happens:** LLMs don't have an index of source material — they generate plausible-sounding references based on patterns in training data. When an agent writes "Revenue grew 18.2% [EDGAR, 10-year CAGR]," it may have pulled a plausible-but-wrong number, cited the right source for the wrong metric, or cited a source that doesn't contain that specific data point. The problem compounds across 9 agents: if Agent A fabricates a citation and Agent B references Agent A's output, the fabrication propagates through the report.

**Consequences:**
- User trusts a claim, makes an investment decision, then discovers the supporting data doesn't exist
- A single fabricated citation undermines trust in the entire report
- Reference chains become untraceable — you can't verify claim X because it cites section Y which cites a DataPacket field that doesn't say what was claimed
- Professional credibility destroyed if reports are shared or used for commercial licensing

**Warning signs:**
- Citations that reference DataPacket fields but the actual DataPacket value differs from what's quoted
- Round numbers in citations (revenue of "exactly $10B" when the real number is $9.837B)
- Citations to "10-K filing" without a specific page, section, or paragraph reference
- Multiple citations from the same source all supporting the agent's pre-formed conclusion

**Prevention:**
1. **DataPacket field paths as citations**: The architecture already mandates that every quantitative claim cites a DataPacket field path (e.g., `DataPacket.growthRates.revenue.10yr`). The `critic.js` validator should resolve each field path and verify the cited value matches the actual value.
2. **Two-tier citation system**: Tier 1 = DataPacket references (machine-verifiable, auto-validated). Tier 2 = external references (web search, 10-K text, transcripts — requires URL and can be spot-checked). Never accept Tier 2 citations without a URL or specific document reference.
3. **Citation resolution in `critic.js`**: For every citation in a section, resolve it: Does the DataPacket field exist? Does the value match? Does the URL return content? Does the quoted text appear in the source? Failed citations get flagged and the section marked for review.
4. **No implicit citations**: Agents must cite every quantitative claim. "Revenue has been growing steadily" is rejected — it must be "Revenue grew at a 10-year CAGR of 18.2% [DataPacket.growthRates.revenue.10yr]."

**Detection:** Build citation validation into the quality pipeline as an automated gate. No section passes without 100% Tier 1 citation resolution. Tier 2 citations get a spot-check rate (verify 3 random external citations per section).

**Phase:** Address in Phase 5A (citation format in report JSON schema) and Phase 5D (critic.js validation). This must be automated — manual citation checking across 40+ references per report is unsustainable.

---

### Pitfall 3: The "Impressive But Wrong" Trap

**What goes wrong:** AI generates fluent, confident, Buffett-style prose that reads beautifully but contains analytical errors that only an expert would catch. Harvard Business School research found that AI-generated investment articles were rated as "impressive" by researchers but inferior to human analysis on deeper scrutiny. The most dangerous outputs aren't obviously wrong — they're subtly, systematically wrong.

**Why it happens:** LLMs are optimized for fluency, not accuracy. They can write a compelling narrative about why a company has a wide moat while getting the competitive dynamics fundamentally wrong. The Buffett-style tone (conversational, confident, specific numbers) actually makes errors harder to spot because the writing *sounds* authoritative.

**Consequences:**
- User invests based on a thesis that sounds rock-solid but crumbles under expert questioning
- Red flags get buried in confident prose ("Operating margins are strong at 15%" when the industry average is 30%)
- The writing quality creates a false sense of verification — "it's well-written so it must be well-researched"
- Specific failure modes: wrong comparisons (comparing a REIT's FFO to an industrial's earnings), misapplied benchmarks (applying consumer-discretionary margins to a utility), inverted conclusions (declaring a 2x debt-to-earnings ratio "conservative" when 1x is the industry norm)

**Warning signs:**
- Sections that read smoothly but lack specific negative findings — everything sounds positive
- Benchmarks stated without industry context ("Gross margin of 25% is healthy" — not for SaaS)
- Confidence assessments that are uniformly HIGH across all sections (statistically implausible for any company)
- Narrative that covers every section but doesn't go deep on any — "adequate across the board" syndrome

**Prevention:**
1. **Mandatory red flags**: The architecture already requires every section to identify at least one concern, even for passing sections (KDD #12). Enforce this in the JSON schema — a section without `redFlags` is structurally invalid.
2. **Industry-aware benchmarks**: The DataPacket includes SIC classification and peer metrics. Agent prompts must specify: "Compare all metrics to industry peers, not absolute thresholds. A 25% gross margin is excellent for grocery but poor for software."
3. **Adversarial review by Risk Analyst**: The Risk Analyst agent exists specifically to attack the thesis. Its prompt should include: "Your job is to find what's wrong. Assume the other agents are being too optimistic. Challenge every PASS verdict with specific evidence."
4. **Expert-level questioning in prompts**: Add to agent prompts: "Before concluding, ask yourself: Would a hedge fund PM with 20 years of experience accept this reasoning? What would they challenge?"
5. **User checkpoint framing**: At each checkpoint, present findings with explicit "things that might be wrong" alongside the analysis, not just a polished summary.

**Detection:** The first 5-10 reports are manually evaluated by the user (the eval strategy from KDD #22). The user's Rule One training is the validator. If the user is catching errors that agents missed, the prompt engineering needs tightening.

**Phase:** Address in Phase 5A (agent prompt design), Phase 5D (quality system), and ongoing through manual evaluation in Phases 5C through 7.

---

### Pitfall 4: Inter-Agent Incoherence — "The Left Hand Doesn't Know What the Right Hand Wrote"

**What goes wrong:** Different agents produce sections that contradict each other because they don't share sufficient context. The Financial Analyst says debt is manageable; the Risk Analyst says debt is a critical concern. The Business Analyst praises the moat; the Competitor Evaluator says the moat is eroding. Industry research confirms this: the MAST study found coordination breakdowns cause 36.9% of all multi-agent failures, and a cybersecurity example showed a threat rated "High" on one page while the same model called the same issue "adequately mitigated" two pages later.

**Why it happens:** Each of the 9 agents gets fresh context (a design feature for cost control and focus). But "fresh context" means Agent 7 doesn't know what Agent 3 concluded. The DataPacket provides shared data, but agents interpret the same data differently. A Financial Analyst seeing 15% ROE might say "strong returns" while a Management Evaluator seeing the same 15% ROE in the context of 30% historical average says "declining quality." Both are right in their local context, but the reader sees a contradiction.

**Consequences:**
- The portfolio manager reads contradictory assessments and loses trust in the entire report
- The Synthesis Writer has to paper over contradictions, producing a muddled final thesis
- Section-level verdicts (PASS/FAIL) can conflict with each other and with the overall verdict
- The Bull/Bear debate in Stage 3 becomes incoherent if the "Bull" agent contradicts its own earlier sections

**Warning signs:**
- Same metric described positively in one section and negatively in another
- Section verdicts that don't add up (6 sections PASS, 2 FAIL, but overall verdict is PASS without explaining away the failures)
- The Synthesis Writer inventing hedging language ("While there are some concerns...") to smooth over contradictions rather than addressing them
- Risk section identifies threats that the Valuation section ignores entirely

**Prevention:**
1. **Section summaries as inter-agent context**: The report JSON schema includes a `summary` field per section ("1-2 sentence summary for downstream agents"). Phase 2 agents must receive Phase 1 summaries. Phase 3 agents must receive Phase 1 + Phase 2 summaries. The Synthesis Writer receives all summaries.
2. **Shared verdict protocol**: Define explicit rules for how section verdicts combine into stage verdicts. "If any section is FAIL, the stage verdict cannot be PASS — it can only be WATCHLIST or CONDITIONAL PASS. The Synthesis Writer must explicitly address every FAIL section."
3. **Contradiction detection in `critic.js`**: After all sections are generated, run a coherence check: extract all quantitative claims and verdicts, flag any metric described differently across sections. This is a simple rule-based check, not an AI task.
4. **Orchestrator as context bridge**: The orchestrator passes not just section summaries but also key metrics interpretations between phases. "Financial Analyst rated ROE as DECLINING from 30% to 15%. Use this interpretation as the starting point."

**Detection:** Read the generated report end-to-end looking specifically for contradictions. The Synthesis Writer section is the canary — if it's full of hedging language, the upstream agents produced incoherent inputs.

**Phase:** Address in Phase 5A (report JSON schema with section summaries), Phase 6 (orchestration of multi-phase Pitch Deck), and Phase 7 (Full Story with inherited context).

---

### Pitfall 5: Context Engineering Failure — Too Much or Too Little

**What goes wrong:** Agents get either (a) so much context that they lose focus and key information drowns in noise, or (b) so little context that they hallucinate to fill gaps. Anthropic's own context engineering guidance emphasizes scoping context minimally — every model call sees only what it needs. Industry research confirms: by month 3 of production, teams send 5x the context they planned, with the model spending 70% of tokens reading instead of reasoning.

**Why it happens:** The temptation is to give every agent "everything" — the full DataPacket, all curriculum files, all operating rules, previous sections, peer data, transcripts. But a Valuation Specialist doesn't need the entire 10-K Business Description, and a Business Analyst doesn't need 10 years of cash flow line items. Conversely, stripping context too aggressively means agents lack information they actually need and either skip important analysis or hallucinate to fill the gap.

**Consequences:**
- Overstuffed context: Agent ignores important data because it's buried in 200K tokens of semi-relevant information. "Lost in the middle" problem — models struggle with information in the middle of long contexts.
- Understuffed context: Agent writes confidently about topics it has no data for, generating plausible but fabricated analysis
- Cost explosion: Every unnecessary token in context multiplies across 9 agents and 30+ API calls
- Quality unpredictability: Sometimes the model attends to the right context, sometimes it doesn't — results vary run to run

**Warning signs:**
- Agent outputs that are verbose but shallow — lots of words, little insight (too much context, model is summarizing rather than analyzing)
- Agent outputs that make specific claims not supported by the DataPacket (too little context)
- Dramatic quality differences between runs for the same company (context attention is non-deterministic)
- Token costs significantly exceeding estimates (context bloat)

**Prevention:**
1. **DataPacket slicing per agent**: The architecture plan already specifies that each agent gets a DataPacket "slice" relevant to its role. The Data Assembler should produce per-role slices, not a monolithic blob. Financial Analyst gets financial statements, growth rates, return metrics, FCF, and debt. Business Analyst gets company info, classification, business description from 10-K. Valuation Specialist gets everything the Financial Analyst gets plus analyst estimates and historical prices.
2. **Curriculum slicing per agent**: Each agent gets only the curriculum files relevant to its role (already defined in the architecture table). Never load all 8 curriculum files into one agent.
3. **Context budget tracking**: `contextBudget.js` (Phase 5D) should track input tokens per agent call. Set soft limits per role (e.g., Financial Analyst: 50K input tokens, Primary Source Reader: 200K). Alert when an agent exceeds its budget.
4. **Stable prefix / variable suffix**: Structure context so system instructions and curriculum are at the top (stable, cacheable) and DataPacket slices and previous section summaries are at the bottom (variable). This enables prompt caching (90% cost reduction on cached prefixes).

**Detection:** Compare agent outputs across multiple companies. If a particular agent consistently produces shallow output, it's likely overstuffed. If it consistently invents data, it's understuffed. Token cost monitoring reveals bloat.

**Phase:** Address in Phase 5A (DataPacket slicing, agent config definitions) and Phase 5D (contextBudget.js).

---

### Pitfall 6: Financial Domain Blindness — Wrong Assumptions, Wrong Industry

**What goes wrong:** Agents apply standard financial analysis to companies that require industry-specific treatment. REITs get valued on P/E instead of FFO/AFFO. Banks get analyzed on gross margin instead of net interest margin and efficiency ratio. Insurance companies get FCF analysis when float and combined ratio are what matter. Cyclical businesses get linear growth projections. XBRL data from the three-layer engine is misinterpreted by agents who don't understand the extraction nuances.

**Why it happens:** LLMs have broad knowledge of financial analysis but shallow knowledge of industry-specific methodology. Rule One methodology itself has industry-specific adaptations that aren't in generic financial training data. The existing XBRL engine already handles industry overlays (bank, REIT, insurance), but agents receiving the DataPacket need to know *how* to interpret the overlay-specific fields. Furthermore, XBRL.org research shows that even the best AI models achieve only 17% accuracy when linking extracted numbers to correct US-GAAP taxonomy concepts.

**Consequences:**
- A REIT analysis that uses P/E ratio instead of FFO yield produces wildly wrong valuation conclusions
- Bank analysis that ignores NIM, provision for credit losses, and the interest rate cycle misses the most important dynamics
- Growth projections for cyclical businesses that extrapolate the peak produce dangerously optimistic buy prices
- XBRL-derived numbers used without understanding the CLAUDE.md caveats (FFO is approximate post-2018, insurance float can't be reconstructed from us-gaap tags, AFFO maintenance capex is hardcoded at 15%)

**Warning signs:**
- Valuation Specialist using MOS/PBT on a REIT without mentioning FFO/AFFO/NAV
- Financial Analyst reporting "N/A" for industry-specific fields instead of using the overlay data
- Growth rates extrapolated linearly for a cyclical business without discussing the cycle
- DataPacket fields from industry overlays (NIM, FFO, combined ratio) absent from analysis

**Prevention:**
1. **Industry classifier in DataPacket**: The DataPacket already includes `classification` which maps to `industryClassifier.js` output (bank/reit/insurance/standard). Agent prompts must branch on this: "If classification is REIT, use FFO/AFFO/NAV as primary valuation metrics. P/E is secondary."
2. **Industry-specific curriculum extensions**: Create brief addenda to curriculum files for non-standard industries: `pitch-deck-IV-reit-addendum.md`, `pitch-deck-IV-bank-addendum.md`. These override generic valuation methodology for those sectors.
3. **DataPacket caveats section**: Include a `caveats` array in the DataPacket that surfaces known limitations: "FFO is derived, not tagged in XBRL — approximate for post-2018 years", "Insurance float is approximated from balance sheet items", "Maintenance capex hardcoded at 15% — adjust per REIT subtype." Agents must acknowledge and surface caveats in their output.
4. **Cyclical business detection**: The DataPacket should flag cyclical industries (SIC-based). For cyclical companies, growth rate calculations should use CAGR from "first positive year" as documented in the user's research patterns, and valuation should include cycle-aware sensitivity analysis.

**Detection:** Generate reports for at least one company in each category (standard, REIT, bank, insurance, cyclical) during validation. Compare agent output to what the industry-specific CLAUDE.md documentation says the analysis should look like.

**Phase:** Address in Phase 5A (DataPacket caveats, agent config branching on industry type) and Phase 6 (Pitch Deck valuation section with industry-aware logic).

---

## Moderate Pitfalls

Issues that cause quality degradation, user frustration, or cost overruns but don't fundamentally break the product.

---

### Pitfall 7: Cost Explosion — The Token Tax of 9 Agents

**What goes wrong:** The full pipeline targets $8-12 per company, but costs balloon to $20-40+ because: agents use more context than budgeted, the Primary Source Reader processes a 200K+ token 10-K, retry loops on failed generations multiply costs, and Toolbox tool calls add round-trips. Industry research shows production teams routinely send 5x the context they planned within 3 months.

**Why it happens:** Multi-agent systems have a multiplicative cost structure. Each unnecessary token in shared context (curriculum, operating rules) gets multiplied across every agent. The Primary Source Reader is the biggest wildcard — a full 10-K can be 200K+ tokens, and each earnings transcript adds 15-30K tokens. If agents use Toolbox tools iteratively (calling `computeMOS()` with 10 different FGR values), each tool call is an additional API round-trip.

**Warning signs:**
- Per-company costs exceeding $15 for a full pipeline
- Primary Source Reader consuming more than 50% of total pipeline cost
- Agents making more than 3 Toolbox tool calls per section (diminishing returns)
- Identical curriculum text loaded into 8+ agents (redundant cost)

**Prevention:**
1. **Model routing by task complexity**: Use Sonnet for most sections, Opus only for FGR derivation, valuation synthesis, debate, final narrative, and primary source reading (already planned).
2. **10-K chunking**: Don't feed the entire 10-K to the Primary Source Reader. Extract relevant sections (Business Description, Risk Factors, MD&A, Financial Statements notes) and discard boilerplate (legal disclaimers, exhibit lists).
3. **Prompt caching**: Structure all agent prompts with stable prefixes (system instructions, curriculum) and variable suffixes (DataPacket, section context). Cached prefixes cost 90% less. With 9 agents sharing similar curriculum, this is a significant saving.
4. **Tool call budgets**: Set a soft limit of 5 Toolbox tool calls per agent per section. After 5 calls, the agent must proceed with available data. This prevents agents from entering explore-everything loops.
5. **Token budgets per role**: Track and alert on per-role token consumption. Set initial budgets generously, then tighten based on real data from the first 5-10 reports.

**Detection:** Token cost monitoring per agent per section from the first report. Build a cost dashboard before scaling to production.

**Phase:** Phase 5D (contextBudget.js token tracking), ongoing optimization through Phases 6-8.

---

### Pitfall 8: Checkpoint Fatigue — Too Many Interruptions

**What goes wrong:** The architecture defines 3-4 checkpoints per Pitch Deck and 3 per Full Story. But if each checkpoint requires the user to read, evaluate, respond to questions, provide missing data, and approve before agents continue, the "15-30 minute" Pitch Deck becomes a 2-hour attention marathon. The user abandons the workflow mid-generation because the interruptions feel like busywork rather than value-added review.

**Why it happens:** The PM/Analyst model assumes the user wants to review at every phase boundary. But investment analysis has natural stopping points — the user cares most about (1) the overall thesis direction early on, (2) the FGR confirmation, and (3) the final output. Being asked "which market size source do you trust?" when they just want to see the valuation can feel like friction, not collaboration.

**Warning signs:**
- User starts clicking "proceed" without reading checkpoint summaries
- Average time between checkpoint presentation and user response grows (they're context-switching away)
- User feedback at checkpoints is increasingly minimal ("looks good, proceed")
- User requests to "just generate the whole thing and let me review at the end"

**Prevention:**
1. **Two checkpoint tiers**: Tier 1 (mandatory) = data gaps where agents literally cannot proceed without user input (paywalled data, conflicting sources that require judgment). Tier 2 (optional) = progress updates the user can skip with a single "proceed." Default to Tier 2 unless there's a genuine blocker.
2. **Batch questions**: Instead of asking one question per checkpoint, batch all questions from all Phase agents into a single checkpoint. "Here are 5 things we need your input on" is better than 5 separate interruptions.
3. **Auto-proceed with defaults**: For common decisions (which market size source, which growth period to emphasize), agents should propose a default and proceed unless the user objects. "Using IBISWorld TAM of $45B (proceed in 30 seconds unless you override)."
4. **FGR confirmation is sacred**: The FGR checkpoint is non-negotiable — it drives all 4 valuation methods. Make this the ONE checkpoint that truly blocks and requires active user engagement. Everything else can be review-after-generation.

**Detection:** Track checkpoint response times and response depth. If the user is spending <30 seconds per checkpoint, the checkpoints aren't adding value.

**Phase:** Phase 6 (Pitch Deck checkpoint design) and Phase 7 (Full Story checkpoint design).

---

### Pitfall 9: State Loss — Generation Progress Evaporates on Crash

**What goes wrong:** A Pitch Deck generation is 15-30 minutes and 15+ API calls. If the process crashes after Phase 2 (8 sections complete), all progress is lost and the user must restart from scratch. In CC mode, if the conversation context is lost (timeout, browser crash, context window exceeded), all generated sections vanish.

**Why it happens:** The architecture uses `.thes1s/reports/{TICKER}/progress.json` for state persistence, but the implementation must be rigorous about writing state after every section completion, not just at phase boundaries. In CC mode specifically, generated content exists in the conversation context — if that context is lost before being written to the report data model, the work disappears.

**Warning signs:**
- User reports having to restart generation after a crash
- Partially completed reports in the data model (some sections present, others missing)
- Duplicate generation costs when the same sections are re-generated
- User reluctance to start Full Story generation because they fear losing 30 minutes of progress

**Prevention:**
1. **Write-after-every-section**: The orchestrator must write each section to `progress.json` immediately upon completion, not in batch at the end. Each section is independently stored and independently regenerable.
2. **Resume command**: `/generate:resume COST` should pick up where the last run left off, loading all completed sections from `progress.json` and continuing with the next unfinished section.
3. **Section-level idempotency**: Regenerating a section should produce a new version without destroying the previous one. Keep a version history per section so the user can compare.
4. **CC mode persistence**: In CC mode, the orchestrator should write sections to disk files (JSON) as they're generated, not just hold them in conversation context. If the conversation dies, the files survive.

**Detection:** Simulate crashes at various points in the pipeline during testing. Verify that resume produces correct output.

**Phase:** Phase 5A (progress.json schema with per-section state) and Phase 6 (resume command implementation).

---

### Pitfall 10: Shallow Analysis Syndrome — "Good Enough" Output

**What goes wrong:** Agents produce analysis that covers every required section but doesn't go deep on any of them. Every section is 200 words of competent but surface-level commentary. The Business Analyst says "the company has a brand moat" without explaining why competitors can't replicate it. The Financial Analyst says "ROE is strong" without explaining the capital structure driving it. The result is a report that technically fills every field in the JSON schema but fails to deliver the depth that is Thes1s's core value proposition.

**Why it happens:** LLMs default to breadth over depth. Given 10 sections to fill, the model allocates roughly equal attention to each rather than going deep where the analysis warrants it. Additionally, when agents are asked to produce structured JSON output, they focus on filling every required field rather than reasoning deeply about any particular one. The `narrative` field gets a paragraph; the `data` field gets numbers. Neither gets the 3-page deep dive the topic deserves.

**Warning signs:**
- Every section has roughly the same word count (200-300 words)
- Narrative uses generic phrases: "strong growth trajectory," "solid fundamentals," "competitive position"
- No section contains a surprising or non-obvious insight
- The Synthesis Writer's overall narrative reads like a concatenation of section summaries rather than an integrated thesis

**Prevention:**
1. **Depth prompts per section**: Instead of "Analyze free cash flow," prompt with: "Explain why FCF deviated from earnings in each year where the FCF ratio was below 0.8 or above 1.2. What specific capital allocation decisions drove the deviation? How does this compare to the 3 closest peers?" Force agents to explain mechanisms, not just state observations.
2. **Minimum insight requirements**: Each section must contain at least one non-obvious finding — something that wouldn't be apparent from a 30-second glance at the data. "Revenue grew 18% CAGR" is obvious. "Revenue growth accelerated from 12% to 24% after the acquisition of Mirror in 2020, but organic growth was only 15% — the headline number overstates the organic business strength" is an insight.
3. **Investigation prompts**: Agent prompts should include: "When you find something unexpected or concerning, use Toolbox tools to investigate further before concluding. Don't just note the anomaly — explain it."
4. **Word count floors per section**: The Pitch Deck sections should have minimum narrative lengths. Radar: 500 words. FCF Analysis: 800 words. Valuation: 1,200 words. These aren't arbitrary — they reflect the depth required for hedge fund-quality output.

**Detection:** Word count per section and "insight density" (number of non-obvious findings). If every section has exactly the same depth, the analysis is shallow.

**Phase:** Phase 5A (agent prompt design with depth requirements), Phase 5C (first real analysis benchmark), ongoing refinement.

---

## Minor Pitfalls

Issues that cause friction or minor quality problems but are recoverable.

---

### Pitfall 11: JSON Schema Fragility

**What goes wrong:** Agents produce output that doesn't conform to the report JSON schema — missing required fields, wrong data types, malformed citations arrays, narrative text where structured data is expected. The architecture plan acknowledges this risk (KDD #20, Eng Review Finding #9) but it remains a common failure mode.

**Prevention:** Use Claude's JSON mode or structured output mode for all agent responses. Define the schema in `agents/` config files. Build schema validation into the orchestrator that rejects non-conforming output and retries with the validation error as feedback.

**Phase:** Phase 5A (schema definition) and Phase 5D (schema validation in quality pipeline).

---

### Pitfall 12: Toolbox Tool Abuse — Agent Goes Exploring

**What goes wrong:** An agent with access to Toolbox tools enters an exploration loop — calling `getMetric()` for every possible metric, running `sensitivityTable()` with dozens of parameter combinations, reading every filing section. The agent is "investigating" but generating no output, burning tokens and time.

**Prevention:** Tool call budgets per agent (5 calls soft limit). Prompt agents with specific investigation goals: "Use `computeMOS()` to test FGR at your estimated Low and High values, plus the median. Three calls, not thirty."

**Phase:** Phase 5D (tool call tracking in contextBudget.js).

---

### Pitfall 13: Primary Source Reader Bottleneck

**What goes wrong:** The Primary Source Reader processes the 10-K, transcripts, and proxy before other agents can start (it runs first by design). If it's slow (200K+ tokens of 10-K processing), the entire pipeline stalls waiting for it. If it produces low-quality summaries, all downstream agents inherit degraded context.

**Prevention:** Run the Primary Source Reader in parallel with Phase 1 agents (Business Analyst sections that don't depend on 10-K text). Only Phase 2+ agents that need Primary Source Reader output wait for it. Set a 10-K extraction scope — Business Description, Risk Factors, MD&A, and Selected Financial Data — not the entire filing.

**Phase:** Phase 6 (Pitch Deck orchestration with Primary Source Reader parallelization).

---

### Pitfall 14: FGR Derivation Deadlock

**What goes wrong:** The FGR workflow requires 5 inputs (rear view mirror, market relativity, company guidance, sector/industry, analysts) and user confirmation. If the Valuation Specialist can't find company guidance or sector CAGR data, it blocks on a question to the user. The user doesn't have that data readily available. The pipeline stalls at the FGR checkpoint indefinitely.

**Prevention:** The Valuation Specialist should always propose a FGR range using the inputs it can find (historical growth rates, analyst estimates). When company guidance or sector CAGR is unavailable, flag it as "data gap" but proceed with a wider FGR range. The user can narrow the range at the checkpoint rather than needing to provide the missing input from scratch.

**Phase:** Phase 6 (Pitch Deck valuation section) and Phase 7 (Full Story valuation confirmation).

---

### Pitfall 15: Synthesis Writer Produces AI Slop

**What goes wrong:** The Synthesis Writer receives all section outputs and produces a polished narrative. But "polished" degrades into corporate-speak: "In conclusion, LULU represents a compelling investment opportunity with a strong competitive moat, talented management, and attractive valuation." This is the exact output style that makes the portfolio manager's eyes glaze over.

**Prevention:** The Buffett writing curriculum (`buffett_writing_principles.md` + Buffett letter examples) must be loaded into the Synthesis Writer's context with explicit anti-patterns: "Never use: 'compelling opportunity,' 'well-positioned,' 'going forward,' 'strong fundamentals.' Write as if explaining to a smart friend why you'd bet $100K of your own money on this company. If you wouldn't bet, say so."

**Phase:** Phase 5A (Synthesis Writer agent definition with anti-slop constraints).

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation | Severity |
|-------|---------------|------------|----------|
| 5A (Foundation) | Example contamination leaks into agent definitions | Audit every file reference in agent configs against LULU example paths | Critical |
| 5A (Foundation) | DataPacket slicing too coarse (every agent gets everything) | Define per-role DataPacket slices in agent config.json from day 1 | Critical |
| 5A (Foundation) | JSON schema too loose (agents interpret fields differently) | Use strict JSON schema with required fields, enum types, and examples per field | Moderate |
| 5C (First Analysis) | "Impressive but wrong" — first output looks great but has subtle errors | Compare section-by-section against user's manual LULU analysis. Look for *what's missing*, not just what's present. | Critical |
| 5D (Quality System) | Citation validation catches format errors but misses semantic errors (correctly formatted citation to wrong data) | Validate citation *values*, not just citation *existence* — resolve the DataPacket field path and compare | Critical |
| 6 (Pitch Deck) | Inter-agent incoherence across 3 phases of generation | Section summaries passed between phases. Contradiction detection in critic.js. | Critical |
| 6 (Pitch Deck) | Checkpoint fatigue kills user engagement | Two-tier checkpoints. Batch questions. Auto-proceed with defaults. | Moderate |
| 6 (Pitch Deck) | Financial domain blindness — REIT/bank analysis uses standard metrics | Industry-type branching in agent prompts based on DataPacket classification | Critical |
| 7 (Full Story) | Bull/Bear debate becomes theater — agents argue politely without real adversarial challenge | Risk Analyst prompt: "You are paid to find problems. Your credibility depends on finding weaknesses the Bull missed." | Moderate |
| 7 (Full Story) | State loss during 30-60 minute Full Story generation | Write-after-every-section to progress.json. Resume command. | Moderate |
| 8 (Polish) | Citation references don't survive formatting for PDF export | Citation IDs must be stable across JSON, working view, and export view | Minor |
| 8 (Polish) | Version history grows unbounded for iteratively refined reports | Cap at 5 versions per section, with user-initiated snapshots for permanent saves | Minor |

---

## Anti-Patterns to Avoid

These are tempting architectural choices that seem reasonable but lead to the pitfalls above.

### Anti-Pattern: "Give Every Agent Everything"
**Temptation:** Load the full DataPacket, all curriculum files, and all previous sections into every agent for maximum context.
**Reality:** Agents drown in context, costs explode, and output quality decreases because the model can't focus. Use scoped DataPacket slices and role-specific curriculum.

### Anti-Pattern: "One Big Prompt Instead of Specialized Agents"
**Temptation:** The prototype showed that One Pagers work with a single agent — maybe we can push that further with better prompts?
**Reality:** The prototype also proved this fails for Pitch Decks. Quality degrades fast. The 9-agent architecture exists because it was empirically validated, not because it's theoretically elegant.

### Anti-Pattern: "Validate After All Sections Are Complete"
**Temptation:** Run all agents, assemble the full report, then validate.
**Reality:** A citation error in Section 1 propagates through Sections 2-10 if the Synthesis Writer references it. Validate per-section, not per-report. Catch errors before they compound.

### Anti-Pattern: "Trust the Model to Self-Correct"
**Temptation:** Add a prompt instruction: "Review your output for errors before finalizing."
**Reality:** LLMs rarely catch their own systematic errors through self-review alone. The Risk Analyst as an adversarial reviewer is more effective than asking each agent to self-critique. External validation (critic.js, user review) catches what self-review misses.

### Anti-Pattern: "Skip Manual Eval Because It Doesn't Scale"
**Temptation:** Build automated eval from day 1 so every report gets graded.
**Reality:** You don't know what "good" looks like yet. The user's manual evaluation of the first 5-10 reports IS the eval spec. Building automated eval before understanding quality criteria means automating the wrong checks. KDD #22 gets this right.

---

## Sources

**Project-specific evidence:**
- Prototype validation results (2026-03-23): LULU pitch deck example contamination, TSCO quality degradation confirmed in `gstack/plans/gstack-ai-agent-workflow-plan-20260323.md`
- User feedback on prototype findings: `~/.claude/projects/-Users-kylehoff-Desktop-stock-analyzer/memory/feedback_prototype_findings.md`
- XBRL engine caveats (FFO, float, maintenance capex): `CLAUDE.md` XBRL Taxonomy Conventions section

**Industry research (MEDIUM confidence — WebSearch verified across multiple sources):**
- [Multi-agent 17x error trap (Towards Data Science)](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/) — Error multiplication in multi-agent systems
- [Multi-agent workflow failures (GitHub Blog)](https://github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/) — Communication and schema failures
- [Context engineering for agents (Anthropic)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Context scoping best practices
- [MAST study: Why Do Multi-Agent LLM Systems Fail? (arXiv 2503.13657)](https://arxiv.org/html/2503.13657v1) — 1,642 execution traces, 36.9% coordination failures
- [LLM citation hallucination rates (CoreProse)](https://www.coreprose.com/kb-incidents/why-llms-invent-academic-citations-and-how-to-stop-ghost-references) — 14-95% hallucinated citation rates
- [XBRL + AI accuracy (XBRL.org)](https://www.xbrl.org/how-well-do-ai-models-like-gpt-4-understand-xbrl-data/) — 17% accuracy on US-GAAP concept linking
- [AI financial advice quality (HBS Working Knowledge)](https://www.library.hbs.edu/working-knowledge/ai-can-churn-out-financial-advice-but-does-it-help-investors) — AI articles rated inferior to human analysis
- [AI investment analysis fluency trap (PureMath.ai)](https://www.puremath.ai/post/the-illusion-of-ai-intelligence-why-generalist-llms-struggle-under-expert-scrutiny) — "Impressive but wrong" phenomenon
- [Multi-agent coordination strategies (Galileo)](https://galileo.ai/blog/multi-agent-coordination-strategies) — Shared context objects for coherence
- [AI agent cost optimization (Moltbook)](https://moltbook-ai.com/posts/ai-agent-cost-optimization-2026) — 60-80% cost reduction strategies
- [Token optimization (Redis)](https://redis.io/blog/llm-token-optimization-speed-up-apps/) — Prompt caching and semantic caching
- [Checkpoint/restore for AI agents (Eunomia)](https://eunomia.dev/blog/2025/05/11/checkpointrestore-systems-evolution-techniques-and-applications-in-ai-agents/) — State persistence patterns
- [AI agent checkpointing (Zylos Research)](https://zylos.ai/research/2026-03-04-ai-agent-workflow-checkpointing-resumability) — Resumability requirements
