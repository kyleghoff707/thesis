---
phase: 06-pitch-deck
plan: 06A-02
type: execute
wave: 1
depends_on: []
files_modified:
  - agents/business-analyst/prompt.md
  - agents/financial-analyst/prompt.md
  - agents/valuation-specialist/prompt.md
  - agents/synthesis-writer/prompt.md
autonomous: true
requirements: [PTCH-10, PTCH-11, PTCH-12]
must_haves:
  truths:
    - "All 4 existing agent prompts contain Pitch Deck-specific depth instructions"
    - "financial-analyst prompt addresses cyclical business handling (CAGR from first positive year)"
    - "valuation-specialist prompt addresses dual owner earnings (Rule One + Graham methods)"
    - "business-analyst prompt addresses acquisition history tracking"
    - "synthesis-writer prompt addresses multi-phase polish and overall verdict assembly"
  artifacts:
    - path: "agents/business-analyst/prompt.md"
      provides: "Updated business analyst prompt with Pitch Deck depth"
      contains: "acquisition"
    - path: "agents/financial-analyst/prompt.md"
      provides: "Updated financial analyst prompt with cyclical handling"
      contains: "cyclical"
    - path: "agents/valuation-specialist/prompt.md"
      provides: "Updated valuation specialist with dual owner earnings"
      contains: "graham"
    - path: "agents/synthesis-writer/prompt.md"
      provides: "Updated synthesis writer for Pitch Deck polish"
      contains: "pitchDeck"
  key_links:
    - from: "agents/valuation-specialist/prompt.md"
      to: "src/engines/valuation.js"
      via: "computeTenCap method parameter reference"
      pattern: "graham"
---

<objective>
Light update pass on 4 existing agent prompts (business-analyst, financial-analyst, valuation-specialist, synthesis-writer) to ensure they handle deeper Pitch Deck sections. Not full rewrites — targeted additions per D-03.

Purpose: Existing prompts were authored for One Pager depth (1-2 paragraphs per section). Pitch Deck sections are 2-5 pages each. The prompts need explicit instructions for deeper investigation, cyclical handling, dual owner earnings, acquisition tracking, and multi-phase synthesis.
Output: 4 updated prompt.md files with Pitch Deck-specific instructions appended/integrated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/06-pitch-deck/06-CONTEXT.md
@agents/orchestrator/dispatch-table.json

<interfaces>
From agents/orchestrator/config.json — pitch deck section mapping:
```json
"pitchDeck": {
  "1": "business-analyst",     // Radar
  "2": "business-analyst",     // Simple & Predictable
  "3": "competitor-evaluator", // Market Position
  "4": "competitor-evaluator", // Barriers & Moats
  "5": "financial-analyst",    // FCF
  "6": "management-evaluator", // Management
  "7": "financial-analyst",    // ROE/ROIC/Debt
  "8": "financial-analyst",    // Balance Sheet
  "9": "risk-analyst",         // PEST
  "10": "valuation-specialist" // Valuation
}
```

From src/engines/valuation.js — dual owner earnings:
```javascript
export function computeTenCap({ cfo, capex, tax, shares, maintenanceCapexPct = 0.7, method = 'ruleOne' })
// method: 'ruleOne' | 'graham'
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update business-analyst and financial-analyst prompts for Pitch Deck depth</name>
  <files>
    agents/business-analyst/prompt.md
    agents/financial-analyst/prompt.md
  </files>
  <read_first>
    agents/business-analyst/prompt.md
    agents/financial-analyst/prompt.md
    agents/business-analyst/config.json
    agents/financial-analyst/config.json
    knowledge/stage-2-pitch-deck/template.md
    .planning/phases/06-pitch-deck/06-CONTEXT.md
  </read_first>
  <action>
**This is a LIGHT update pass (per D-03), not a full rewrite.** Read each prompt fully first, then ADD targeted sections. Do not delete or restructure existing content.

**business-analyst/prompt.md — ADD a "## Pitch Deck Depth" section covering:**
- Sections 1 (Radar) and 2 (Simple & Predictable) require 2-5 pages each for Pitch Deck, not 1-2 paragraphs
- Radar section must include: management backgrounds, competitive position statement, 3-5 year growth thesis
- Simple & Predictable must prove the business model can be explained in 1 paragraph AND that revenue/earnings are predictable (no single-product dependency, cyclicality assessment)
- Acquisition history: Extract ALL M&A from DataPacket and PSR findings into a structured table with columns: Date, Target, Amount, Strategic Rationale, Outcome (if visible from subsequent years). This feeds PTCH-12.
- When PSR findings are available (from annual-reader/quarterly-reader pre-processing), incorporate business evolution themes, risk trajectory, and competitive landscape changes
- Minimum narrative length: 500+ words per section for Pitch Deck (vs 100-200 for One Pager)
- Minimum citations: 5+ per section for Pitch Deck

**financial-analyst/prompt.md — ADD a "## Pitch Deck Depth" section covering:**
- Sections 5 (FCF), 7 (ROE/ROIC/Debt), 8 (Balance Sheet) require deep quantitative analysis for Pitch Deck
- FCF section: 10-year FCF history, CapEx breakdown (maintenance vs growth), FCF yield vs peers, FCF conversion rate (FCF/Net Income)
- ROE/ROIC/Debt section: 10-year trend, decomposition (DuPont for ROE), debt-to-equity trajectory, interest coverage, comparison to cost of capital
- Balance Sheet section: Working capital trend, current ratio, goodwill-to-assets ratio, off-balance-sheet items, lease obligations
- **Cyclical business handling (PTCH-11):** When a company shows cyclical earnings (negative years interspersed with positive), compute CAGR from "first positive year" rather than simple endpoint CAGR. Also compute through-cycle averages (peak-to-peak, trough-to-trough). Flag cyclicality explicitly.
- Multiple capex ratios for cyclicals: through-cycle average, expansion-only periods, maintenance-only estimate
- When PSR findings are available, cross-reference SEC-derived financial metrics and note any discrepancies
- Minimum narrative length: 500+ words per section for Pitch Deck
- Minimum citations: 5+ per section for Pitch Deck
  </action>
  <verify>
    <automated>grep -c "Pitch Deck Depth" agents/business-analyst/prompt.md && grep -c "Pitch Deck Depth" agents/financial-analyst/prompt.md && grep -c "acquisition" agents/business-analyst/prompt.md && grep -c "cyclical" agents/financial-analyst/prompt.md</automated>
  </verify>
  <acceptance_criteria>
    - agents/business-analyst/prompt.md contains a "## Pitch Deck Depth" section
    - agents/business-analyst/prompt.md contains "acquisition" (PTCH-12 coverage)
    - agents/business-analyst/prompt.md total line count is within +30 to +80 of original 539 lines (additions, not rewrites)
    - agents/financial-analyst/prompt.md contains a "## Pitch Deck Depth" section
    - agents/financial-analyst/prompt.md contains "cyclical" and "first positive year" (PTCH-11 coverage)
    - agents/financial-analyst/prompt.md total line count is within +30 to +80 of original 648 lines
    - Both files still contain all original content (no deletions)
  </acceptance_criteria>
  <done>Both agent prompts have explicit Pitch Deck depth instructions without breaking existing One Pager behavior</done>
</task>

<task type="auto">
  <name>Task 2: Update valuation-specialist and synthesis-writer prompts for Pitch Deck</name>
  <files>
    agents/valuation-specialist/prompt.md
    agents/synthesis-writer/prompt.md
  </files>
  <read_first>
    agents/valuation-specialist/prompt.md
    agents/synthesis-writer/prompt.md
    agents/valuation-specialist/config.json
    agents/synthesis-writer/config.json
    knowledge/stage-2-pitch-deck/template.md
    knowledge/research-references/equity-bond-research.md
    .planning/phases/06-pitch-deck/06-CONTEXT.md
  </read_first>
  <action>
**Light update pass (per D-03). ADD targeted sections, do not restructure existing content.**

**valuation-specialist/prompt.md — ADD a "## Pitch Deck Depth" section covering:**
- Section 10 (Valuation) is the capstone — 5+ pages of analysis for Pitch Deck
- **Dual Owner Earnings (PTCH-10):** Present BOTH Rule One method AND Graham method side by side. Use the computeTenCap tool with `method: 'ruleOne'` AND `method: 'graham'`. Show both calculations with explanations of why they differ.
- **FGR derivation awareness:** When operating in Pitch Deck mode, the CC skill will run an interactive FGR derivation sub-workflow. The agent should present each of the 5 FGR inputs with specific evidence:
  1. Historical Composite: DataPacket growth rates (BVPS+Div, Earnings, OpCash, Revenue)
  2. Market Relativity: Cumulative stockholder return vs S&P 500
  3. Company Guidance: Extracted from PSR findings (management forward-looking statements)
  4. Industry CAGR: From PSR findings or analyst data
  5. Analyst Consensus: From DataPacket analystEstimates
  Each input must include: specific value, data source reference, confidence level (HIGH/MEDIUM/LOW), and reasoning.
- Sensitivity tables: Use the sensitivityTable tool to compute buy price matrices for all 4 methods (MOS, PBT, Ten Cap, Equity Bond). Vary FGR and the method-specific key input (EPS for MOS/PBT, CapEx% for Ten Cap, P/E for Equity Bond).
- Market share ceiling analysis: Use Competitors tab data (comparePeers tool) to prove that the assumed growth rate does not require the company to capture an unrealistic share of its addressable market.
- Present buy price RANGES (Low/High from FGR range) for all 4 methods, not single prices.

**synthesis-writer/prompt.md — ADD a "## Pitch Deck Synthesis" section covering:**
- When operating on pitchDeck stage (10 sections), the synthesis-writer receives ALL 10 section outputs
- Role: Review all sections for internal consistency, cross-section contradictions, and narrative coherence
- Produce an overallVerdict (PASS/FAIL/WATCHLIST) based on the weight of evidence across all 10 sections
- Polish any sections where quality score is low (if quality data is available from prior critic.js run)
- Do NOT add an 11th section — the synthesis produces the overallVerdict and updates narratives within existing sections
- For Pitch Deck, weigh moat assessment (sections 3-4) and financial health (sections 5-8) more heavily than Radar (section 1) in overall verdict
- Reference specific section findings in the verdict rationale (e.g., "Section 7 shows declining ROIC but Section 4 demonstrates durable moat — weight moat more heavily given...")
  </action>
  <verify>
    <automated>grep -c "Pitch Deck Depth" agents/valuation-specialist/prompt.md && grep -c "Pitch Deck Synthesis" agents/synthesis-writer/prompt.md && grep -c "graham" agents/valuation-specialist/prompt.md && grep -c "overallVerdict" agents/synthesis-writer/prompt.md</automated>
  </verify>
  <acceptance_criteria>
    - agents/valuation-specialist/prompt.md contains "## Pitch Deck Depth" section
    - agents/valuation-specialist/prompt.md contains "graham" (PTCH-10 dual owner earnings)
    - agents/valuation-specialist/prompt.md contains "sensitivityTable" (sensitivity table usage)
    - agents/valuation-specialist/prompt.md contains "market share ceiling" (PTCH-09 support)
    - agents/valuation-specialist/prompt.md total line count is within +40 to +100 of original 451 lines
    - agents/synthesis-writer/prompt.md contains "## Pitch Deck Synthesis" section
    - agents/synthesis-writer/prompt.md contains "overallVerdict" and "pitchDeck"
    - agents/synthesis-writer/prompt.md total line count is within +20 to +60 of original 330 lines
  </acceptance_criteria>
  <done>Valuation specialist handles dual owner earnings, FGR derivation, and sensitivity tables. Synthesis writer handles 10-section Pitch Deck polish and overall verdict.</done>
</task>

</tasks>

<verification>
- All 4 prompt files parse without errors: `wc -l agents/*/prompt.md` shows increased line counts
- `npx vitest run` all existing tests pass (no regressions)
- `grep "Pitch Deck" agents/business-analyst/prompt.md agents/financial-analyst/prompt.md agents/valuation-specialist/prompt.md agents/synthesis-writer/prompt.md` shows matches in all 4
</verification>

<success_criteria>
All 4 existing agent prompts have targeted Pitch Deck depth additions covering cyclical handling (PTCH-11), dual owner earnings (PTCH-10), acquisition tracking (PTCH-12), and multi-section synthesis. No existing One Pager behavior broken.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06A-02-SUMMARY.md`
</output>
