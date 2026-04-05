---
phase: 05C-cc-skill-first-analysis
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - agents/valuation-specialist/prompt.md
  - agents/synthesis-writer/prompt.md
autonomous: false
requirements: [ONEP-01]
must_haves:
  truths:
    - "Valuation-specialist prompt.md contains full-depth curriculum from pitch-deck-IV.md, fgr.md, equity-bond-research.md, advanced-financial-analysis.md, and capex-cash-flow-explained.md"
    - "Synthesis-writer prompt.md contains full-depth writing principles extracted from Buffett letters in buffett_letters_claude_training_set/"
    - "Both prompts define ReportSectionSchema output format with all required fields"
    - "Both prompts include contamination boundary instructions"
    - "Both prompts include at least 1 red flag mandate per section"
  artifacts:
    - path: "agents/valuation-specialist/prompt.md"
      provides: "Production agent prompt replacing stub"
      min_lines: 100
    - path: "agents/synthesis-writer/prompt.md"
      provides: "Production agent prompt replacing stub"
      min_lines: 100
  key_links:
    - from: "agents/valuation-specialist/prompt.md"
      to: "agents/valuation-specialist/config.json"
      via: "Prompt covers all sections listed in config.json onePager field"
      pattern: "valuation_summary"
    - from: "agents/synthesis-writer/prompt.md"
      to: "agents/synthesis-writer/config.json"
      via: "Prompt covers all sections listed in config.json onePager field"
      pattern: "overall_verdict"
---

<objective>
Author production-quality agent prompts for valuation-specialist and synthesis-writer via /writing-skills, replacing the Phase 5A stubs with prompts that embed full-depth Rule One curriculum, define exact output schema, enforce contamination boundaries, and mandate red flags per section.

Purpose: The valuation-specialist produces Section 5 (Valuation Summary) and the synthesis-writer produces Section 6 (Overall Verdict) of the One Pager. These complete the 6-section set needed for full One Pager generation.

Output: Two production prompt.md files reviewed and approved by the user.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05C-cc-skill-first-analysis/05C-CONTEXT.md
@.planning/phases/05C-cc-skill-first-analysis/05C-RESEARCH.md
@.planning/phases/05A-agent-definitions-foundation/05A-04-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author valuation-specialist prompt.md via /writing-skills</name>
  <files>agents/valuation-specialist/prompt.md</files>
  <read_first>
    agents/writing-briefs/valuation-specialist-brief.md
    agents/valuation-specialist/config.json
    .claude/skills/writing-skills/SKILL.md
    .claude/skills/writing-skills/anthropic-best-practices.md
    .claude/skills/writing-skills/testing-skills-with-subagents.md
    .claude/skills/writing-skills/persuasion-principles.md
    .claude/skills/writing-skills/graphviz-conventions.dot
    knowledge/stage-2-pitch-deck/pitch-deck-IV.md
    knowledge/research-references/fgr.md
    knowledge/research-references/equity-bond-research.md
    knowledge/research-references/advanced-financial-analysis.md
    knowledge/research-references/capex-cash-flow-explained.md
    knowledge/research-references/rule-one-fundamentals.md
    knowledge/research-references/tools-for-analysis.md
    src/schemas/reportSection.js
  </read_first>
  <action>
    Invoke /writing-skills to author agents/valuation-specialist/prompt.md. The process:

    1. Read the writing brief at agents/writing-briefs/valuation-specialist-brief.md FIRST — this is the roadmap.

    2. Read ALL /writing-skills reference files (per D-02):
       - .claude/skills/writing-skills/SKILL.md (TDD methodology)
       - .claude/skills/writing-skills/anthropic-best-practices.md (Anthropic prompt engineering)
       - .claude/skills/writing-skills/testing-skills-with-subagents.md (pressure testing)
       - .claude/skills/writing-skills/persuasion-principles.md (communication principles)
       - .claude/skills/writing-skills/graphviz-conventions.dot (flowchart style)
       - .claude/skills/writing-skills/examples/ directory (example skills for reference)

    3. Read ALL curriculum files at full depth (no compression per AGNT-03):
       - knowledge/stage-2-pitch-deck/pitch-deck-IV.md (Valuation methodology, 4 calculator formulas)
       - knowledge/research-references/fgr.md (FGR derivation, 5 inputs, Big 4)
       - knowledge/research-references/equity-bond-research.md (3 Equity Bond variants, worked examples)
       - knowledge/research-references/advanced-financial-analysis.md (cross-referenced by pitch-deck-IV)
       - knowledge/research-references/capex-cash-flow-explained.md (Ten Cap Owner Earnings, maintenance capex)

    4. Read universal context files and ReportSectionSchema.

    5. Draft the prompt.md with these sections:
       - Role definition: valuation specialist — the "what should I pay?" agent
       - Curriculum at full depth: embed content from all 5 curriculum files (heaviest curriculum of any agent per brief)
       - DataPacket slice documentation: growthRates, returnMetrics, fcf, analystEstimates, ttm, currentPrice, keyMetrics — describe each field structure and how to extract values
       - Toolbox tools: computeMOS (EPS, FGR, Future P/E, MARR), computePBT (FCF/share, FGR, years), computeTenCap (CFO, maint capex, tax, shares), computeEquityBond (BVPS, ROE, retained ratio, hist P/E), sensitivityTable (2D parameter variation) — document exact calling conventions with parameter names and types
       - Output schema: Full ReportSectionSchema
       - One Pager section instructions: Section 5 (Valuation Summary) with key "valuation_summary"
       - Section 5 data requirements: quick buy price RANGE from each of the 4 methods (MOS, PBT, Ten Cap, Equity Bond), current price vs buy range comparison, preliminary FGR estimate from available data
       - NOTE: For One Pager, this is a QUICK valuation summary — not the full FGR derivation workflow (that is Pitch Deck Section 10). Use historical growth rates as FGR proxy. Use Sonnet model per D-10 (overrides config.json "opus" setting for One Pager stage).
       - Buy prices as RANGES (Low FGR to High FGR), not single numbers
       - Future P/E capped at 2x FGR or historical high P/E (whichever is lower)
       - Citation requirements: every valuation input traces to DataPacket field path
       - Red flag mandate: at least 1 per section (e.g., "current price 40% above buy range")
       - Contamination boundary: explicit instruction to never reference examples
       - Conservative estimates: Operating Rule #3 — always prefer conservative growth assumptions
       - Honest gaps: "Data not available" — never estimate missing inputs

    6. Ensure prompt does NOT contain "LULU" or reference any example analyses.

    The prompt replaces the existing stub at agents/valuation-specialist/prompt.md.
  </action>
  <verify>
    <automated>grep -c "DRAFT" agents/valuation-specialist/prompt.md | grep "^0$" && wc -l agents/valuation-specialist/prompt.md | awk '{if ($1 >= 100) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <acceptance_criteria>
    - agents/valuation-specialist/prompt.md exists and is >= 100 lines
    - File does NOT contain "DRAFT" or "STUB"
    - File contains "ReportSectionSchema" or "report section" (output format)
    - File contains "valuation_summary" (One Pager section key)
    - File contains "contamination" or "NEVER reference" (contamination boundary)
    - File contains "red flag" or "redFlag" (red flag mandate)
    - File contains "DataPacket" (DataPacket slice documented)
    - File does NOT contain "LULU" or "lululemon"
    - File contains "MOS" or "Margin of Safety" (valuation method 1)
    - File contains "PBT" or "Payback Time" (valuation method 2)
    - File contains "Ten Cap" or "Owner Earnings" (valuation method 3)
    - File contains "Equity Bond" (valuation method 4)
    - File contains "FGR" or "Future Growth Rate" (growth rate estimation)
    - File contains "range" or "RANGE" (buy prices as ranges, not singles)
  </acceptance_criteria>
  <done>Valuation-specialist prompt.md is a production prompt with full-depth curriculum from 5 files, all 4 valuation calculator methodologies, ReportSectionSchema output format, contamination boundary, red flag mandate, and buy price RANGE presentation.</done>
</task>

<task type="auto">
  <name>Task 2: Author synthesis-writer prompt.md via /writing-skills</name>
  <files>agents/synthesis-writer/prompt.md</files>
  <read_first>
    agents/writing-briefs/synthesis-writer-brief.md
    agents/synthesis-writer/config.json
    .claude/skills/writing-skills/SKILL.md
    .claude/skills/writing-skills/anthropic-best-practices.md
    .claude/skills/writing-skills/testing-skills-with-subagents.md
    .claude/skills/writing-skills/persuasion-principles.md
    .claude/skills/writing-skills/graphviz-conventions.dot
    knowledge/research-references/rule-one-fundamentals.md
    knowledge/research-references/tools-for-analysis.md
    src/schemas/reportSection.js
  </read_first>
  <action>
    Invoke /writing-skills to author agents/synthesis-writer/prompt.md. The process:

    1. Read the writing brief at agents/writing-briefs/synthesis-writer-brief.md FIRST — this is the roadmap.

    2. Read ALL /writing-skills reference files (per D-02):
       - .claude/skills/writing-skills/SKILL.md
       - .claude/skills/writing-skills/anthropic-best-practices.md
       - .claude/skills/writing-skills/testing-skills-with-subagents.md
       - .claude/skills/writing-skills/persuasion-principles.md
       - .claude/skills/writing-skills/graphviz-conventions.dot
       - .claude/skills/writing-skills/examples/ directory

    3. Read ALL Buffett letters in the curriculum directory at full depth (per AGNT-03):
       - List and read every file in knowledge/research-references/buffett_letters_claude_training_set/
       - Extract writing principles: clear prose, specific numbers, intellectual honesty, conversational tone, humor, analogies, admitting mistakes
       - Note: buffett_writing_principles.md does not exist as standalone file (per 05A-04-SUMMARY decision). Extract principles directly from the letters.

    4. Read universal context files and ReportSectionSchema.

    5. Draft the prompt.md with these sections:
       - Role definition: synthesis writer — the "voice of the final report." Weaves analyst findings into cohesive Buffett-style narrative and delivers final investment verdict.
       - Writing style principles: extracted from Buffett letters — clear, direct, conversational, specific numbers, intellectual honesty, humor and metaphor, admit uncertainty
       - Input format: this agent receives NO raw DataPacket. It receives section outputs from the 3 analyst agents:
         * Section summaries (1-2 sentences each)
         * Section verdicts (PASS/FAIL/WATCHLIST per section)
         * Section confidence scores (HIGH/MEDIUM/LOW)
         * Red flags from each section
         * Citation lists from each section
         * Section data objects
       - Output schema: Full ReportSectionSchema
       - One Pager section instructions: Section 6 (Overall Verdict) with key "overall_verdict"
       - Section 6 requirements:
         * Synthesize, do NOT concatenate — weave findings into a cohesive story, not a list of what each analyst found
         * Final PASS/FAIL/WATCHLIST verdict that follows logically from section verdicts
         * If sections disagree (great moat but bad management), acknowledge tension explicitly
         * "Watchlist" is a valid outcome: "Great company but overpriced" is a legitimate conclusion
         * Opening must hook the reader — start with most compelling or surprising finding
         * Cite inherited citations from analyst sections (propagate, don't invent)
       - Red flag mandate: at least 1 per section, even for PASS — synthesize red flags from all analyst sections plus add any cross-cutting concerns
       - Contamination boundary: explicit instruction to never reference examples
       - Honest gaps: OK to say "I don't know yet" or "this needs more data"
       - Operating Rule #7: Stop when clarity fails — if you can't explain it simply, reject it

    6. Ensure prompt does NOT contain "LULU" or reference any example analyses.

    The prompt replaces the existing stub at agents/synthesis-writer/prompt.md.
  </action>
  <verify>
    <automated>grep -c "DRAFT" agents/synthesis-writer/prompt.md | grep "^0$" && wc -l agents/synthesis-writer/prompt.md | awk '{if ($1 >= 100) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <acceptance_criteria>
    - agents/synthesis-writer/prompt.md exists and is >= 100 lines
    - File does NOT contain "DRAFT" or "STUB"
    - File contains "ReportSectionSchema" or "report section" (output format)
    - File contains "overall_verdict" (One Pager section key)
    - File contains "contamination" or "NEVER reference" (contamination boundary)
    - File contains "red flag" or "redFlag" (red flag mandate)
    - File does NOT contain "LULU" or "lululemon"
    - File contains "Buffett" (writing style principles)
    - File contains "synthesize" or "weave" (not concatenate mandate)
    - File contains "PASS" and "FAIL" and "WATCHLIST" (verdict options)
    - File contains "verdict" and "rationale" (verdict justification required)
    - File contains "section summaries" or "analyst" (input from other agents documented)
  </acceptance_criteria>
  <done>Synthesis-writer prompt.md is a production prompt with Buffett-style writing principles, input format documenting section outputs from other agents, ReportSectionSchema output format, contamination boundary, red flag mandate, and instructions for weaving a cohesive verdict narrative.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: User reviews valuation-specialist and synthesis-writer prompts</name>
  <files>agents/valuation-specialist/prompt.md, agents/synthesis-writer/prompt.md</files>
  <action>
    Present both prompt.md files to the user for review. The user reads each prompt and verifies:
    1. agents/valuation-specialist/prompt.md: full-depth curriculum from 5 files, all 4 valuation methods (MOS, PBT, Ten Cap, Equity Bond), FGR estimation for One Pager, buy prices as RANGES, DataPacket slice matches config.json, tool calling conventions documented
    2. agents/synthesis-writer/prompt.md: Buffett writing principles from actual letters, input format documents receiving other agents' section outputs (not raw DataPacket), synthesis mandate (weave not concatenate), PASS/FAIL/WATCHLIST verdict logic, handles section disagreement
    User confirms whether these prompts would produce high-quality One Pager sections.
  </action>
  <verify>
    <automated>wc -l agents/valuation-specialist/prompt.md agents/synthesis-writer/prompt.md | tail -1 | awk '{if ($1 >= 200) print "PASS"; else print "FAIL"}'</automated>
  </verify>
  <done>User has reviewed and approved both prompt.md files. All 4 One Pager agents now have production prompts ready for CC skill orchestration.</done>
</task>

</tasks>

<verification>
After user approval:
- Both prompt.md files are >= 100 lines (not stubs)
- Neither contains "DRAFT" or "STUB"
- Both contain ReportSectionSchema output format
- Both contain contamination boundary
- Both contain red flag mandate
- Neither references LULU or example analyses
- All 4 One Pager agent prompts now exist as production prompts (combined with Plan 01)
- Existing agent definition tests still pass: npm test -- --run agents/__tests__/agentDefinitions.test.js
</verification>

<success_criteria>
1. Valuation-specialist prompt.md replaces stub with production prompt containing full-depth curriculum from 5 files and all 4 valuation methods
2. Synthesis-writer prompt.md replaces stub with production prompt containing Buffett writing principles and synthesis methodology
3. Both prompts define ReportSectionSchema output format with all required fields
4. User has reviewed and approved both prompts (checkpoint passed)
5. No LULU contamination in either prompt
6. Combined with Plan 01: all 4 One Pager agents have production prompts ready for CC skill orchestration
</success_criteria>

<output>
After completion, create `.planning/phases/05C-cc-skill-first-analysis/05C-02-SUMMARY.md`
</output>
