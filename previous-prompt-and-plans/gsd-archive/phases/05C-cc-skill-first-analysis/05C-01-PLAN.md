---
phase: 05C-cc-skill-first-analysis
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - agents/business-analyst/prompt.md
  - agents/financial-analyst/prompt.md
autonomous: false
requirements: [ONEP-01]
must_haves:
  truths:
    - "Business-analyst prompt.md contains full-depth curriculum from one-pager.md, pitch-deck-I.md, story-form-I.md, and advanced-financial-analysis.md"
    - "Financial-analyst prompt.md contains full-depth curriculum from advanced-financial-analysis.md, fgr.md, and capex-cash-flow-explained.md"
    - "Both prompts define ReportSectionSchema output format with all required fields"
    - "Both prompts include contamination boundary instructions"
    - "Both prompts include at least 1 red flag mandate per section"
  artifacts:
    - path: "agents/business-analyst/prompt.md"
      provides: "Production agent prompt replacing stub"
      min_lines: 100
    - path: "agents/financial-analyst/prompt.md"
      provides: "Production agent prompt replacing stub"
      min_lines: 100
  key_links:
    - from: "agents/business-analyst/prompt.md"
      to: "agents/business-analyst/config.json"
      via: "Prompt covers all sections listed in config.json onePager field"
      pattern: "company_info|minimum_standards"
    - from: "agents/financial-analyst/prompt.md"
      to: "agents/financial-analyst/config.json"
      via: "Prompt covers all sections listed in config.json onePager field"
      pattern: "meaning|growth_metrics"
---

<objective>
Author production-quality agent prompts for business-analyst and financial-analyst via /writing-skills, replacing the Phase 5A stubs with prompts that embed full-depth Rule One curriculum, define exact output schema, enforce contamination boundaries, and mandate red flags per section.

Purpose: These two agents produce 4 of the 6 One Pager sections (Company Info, Minimum Standards, Meaning/Management KPIs, Growth Metrics). Without real prompts, the CC skill has no way to generate a One Pager.

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
  <name>Task 1: Author business-analyst prompt.md via /writing-skills</name>
  <files>agents/business-analyst/prompt.md</files>
  <read_first>
    agents/writing-briefs/business-analyst-brief.md
    agents/business-analyst/config.json
    .claude/skills/writing-skills/SKILL.md
    .claude/skills/writing-skills/anthropic-best-practices.md
    .claude/skills/writing-skills/testing-skills-with-subagents.md
    .claude/skills/writing-skills/persuasion-principles.md
    .claude/skills/writing-skills/graphviz-conventions.dot
    knowledge/stage-1-one-pager/one-pager.md
    knowledge/stage-2-pitch-deck/pitch-deck-I.md
    knowledge/stage-3-full-story/story-form-I.md
    knowledge/research-references/advanced-financial-analysis.md
    knowledge/research-references/rule-one-fundamentals.md
    knowledge/research-references/tools-for-analysis.md
    src/schemas/reportSection.js
  </read_first>
  <action>
    Invoke /writing-skills to author agents/business-analyst/prompt.md. The process:

    1. Read the writing brief at agents/writing-briefs/business-analyst-brief.md FIRST — this is the roadmap for prompt authoring.

    2. Read ALL /writing-skills reference files (per D-02):
       - .claude/skills/writing-skills/SKILL.md (TDD methodology)
       - .claude/skills/writing-skills/anthropic-best-practices.md (Anthropic prompt engineering)
       - .claude/skills/writing-skills/testing-skills-with-subagents.md (pressure testing)
       - .claude/skills/writing-skills/persuasion-principles.md (communication principles)
       - .claude/skills/writing-skills/graphviz-conventions.dot (flowchart style)
       - .claude/skills/writing-skills/examples/ directory (example skills for reference)

    3. Read ALL curriculum files referenced in the brief at full depth (no compression, no summarization per AGNT-03):
       - knowledge/stage-1-one-pager/one-pager.md (One Pager methodology, minimum standards)
       - knowledge/stage-2-pitch-deck/pitch-deck-I.md (Market dominance, competitive positioning)
       - knowledge/stage-3-full-story/story-form-I.md (Meaning 15pt checklist, moat research)
       - knowledge/research-references/advanced-financial-analysis.md (deep financial analysis)

    4. Read universal context files:
       - knowledge/research-references/rule-one-fundamentals.md
       - knowledge/research-references/tools-for-analysis.md

    5. Read ReportSectionSchema from src/schemas/reportSection.js to understand the exact JSON output contract.

    6. Draft the prompt.md with these sections:
       - Role definition: qualitative business evaluator for Rule One investment analysis
       - Curriculum at full depth: embed content from all 4 curriculum files (no compression)
       - DataPacket slice documentation: companyInfo, classification, ruleOneScore, peers — describe each field and how to reference values
       - Output schema: ReportSectionSchema fields — key, title, sectionNumber, status (pass/fail/review/pending), confidence (HIGH/MEDIUM/LOW), verdict (PASS/FAIL/WATCHLIST/null), verdictRationale, summary, data, narrative, citations, tables, charts, redFlags (min 1), primarySourceInsights, generatedAt, modelUsed, tokenCost
       - One Pager section instructions: Section 1 (Company Info) and Section 2 (Minimum Standards) with exact section keys "company_info" and "minimum_standards"
       - Citation requirements: every quantitative claim traces to DataPacket field path (e.g., "dataPacket.companyInfo.marketCap" or "dataPacket.ruleOneScore.overall")
       - Red flag mandate: at least 1 red flag per section, even for PASS (per KDD #12)
       - Contamination boundary: "Perform independent research. Do NOT reference or copy patterns from example analyses. Never access files in knowledge/stage-*/examples/ or knowledge/pre-course-examples/"
       - Industry-contextual analysis: moat strength varies by industry (per KDD #9)
       - Moat identification: identify type (brand, secret, toll, switching, network) with evidence
       - "Simple and predictable" test: can you explain how the company makes money in one paragraph? If not, FAIL.
       - Honest gaps: "Data not available" for anything not in DataPacket — NEVER estimate (per QUAL-06)

    7. Ensure the prompt does NOT reference LULU or any example analyses anywhere.

    The prompt replaces the existing stub at agents/business-analyst/prompt.md.
  </action>
  <verify>
    <automated>grep -c "DRAFT" agents/business-analyst/prompt.md | grep "^0$" && wc -l agents/business-analyst/prompt.md | awk '{if ($1 >= 100) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <acceptance_criteria>
    - agents/business-analyst/prompt.md exists and is >= 100 lines
    - File does NOT contain "DRAFT" or "STUB" (stub marker removed)
    - File contains "ReportSectionSchema" or "report section" (output format documented)
    - File contains "company_info" and "minimum_standards" (One Pager section keys)
    - File contains "contamination" or "NEVER reference" (contamination boundary present)
    - File contains "red flag" or "redFlag" (red flag mandate present)
    - File contains "DataPacket" (DataPacket slice documented)
    - File does NOT contain "LULU" or "lululemon" (contamination-free)
    - File contains content from one-pager.md curriculum (e.g., "Minimum Standards" methodology)
    - File contains content from pitch-deck-I.md curriculum (e.g., moat types or market dominance)
  </acceptance_criteria>
  <done>Business-analyst prompt.md is a production prompt with full-depth curriculum, ReportSectionSchema output format, contamination boundary, red flag mandate, and section-specific instructions for company_info and minimum_standards.</done>
</task>

<task type="auto">
  <name>Task 2: Author financial-analyst prompt.md via /writing-skills</name>
  <files>agents/financial-analyst/prompt.md</files>
  <read_first>
    agents/writing-briefs/financial-analyst-brief.md
    agents/financial-analyst/config.json
    .claude/skills/writing-skills/SKILL.md
    .claude/skills/writing-skills/anthropic-best-practices.md
    .claude/skills/writing-skills/testing-skills-with-subagents.md
    .claude/skills/writing-skills/persuasion-principles.md
    .claude/skills/writing-skills/graphviz-conventions.dot
    knowledge/research-references/advanced-financial-analysis.md
    knowledge/research-references/fgr.md
    knowledge/research-references/capex-cash-flow-explained.md
    knowledge/research-references/rule-one-fundamentals.md
    knowledge/research-references/tools-for-analysis.md
    src/schemas/reportSection.js
  </read_first>
  <action>
    Invoke /writing-skills to author agents/financial-analyst/prompt.md. The process:

    1. Read the writing brief at agents/writing-briefs/financial-analyst-brief.md FIRST — this is the roadmap.

    2. Read ALL /writing-skills reference files (per D-02):
       - .claude/skills/writing-skills/SKILL.md
       - .claude/skills/writing-skills/anthropic-best-practices.md
       - .claude/skills/writing-skills/testing-skills-with-subagents.md
       - .claude/skills/writing-skills/persuasion-principles.md
       - .claude/skills/writing-skills/graphviz-conventions.dot
       - .claude/skills/writing-skills/examples/ directory

    3. Read ALL curriculum files at full depth (no compression per AGNT-03):
       - knowledge/research-references/advanced-financial-analysis.md (deep financial analysis, ratio interpretation)
       - knowledge/research-references/fgr.md (FGR methodology, Big 4, 5 perspectives)
       - knowledge/research-references/capex-cash-flow-explained.md (CapEx analysis, Owner Earnings)

    4. Read universal context files and ReportSectionSchema.

    5. Draft the prompt.md with these sections:
       - Role definition: quantitative financial analyst for Rule One investment analysis — the "numbers agent"
       - Curriculum at full depth: embed content from all 3 curriculum files
       - DataPacket slice documentation: financials (income/balance/cashFlow with 10+ years), ttm, growthRates (Big 4 across 10/7/5/3/1yr), returnMetrics (ROE/ROIC/ROA), debtMetrics, fcf, keyMetrics — describe each field structure
       - Toolbox tools: getMetric (dot-notation), getFinancialLine (line item across years), computeGrowthRates (CAGR), computeMOS, computePBT, computeTenCap, computeEquityBond, sensitivityTable, comparePeers — document calling conventions for each
       - Output schema: Full ReportSectionSchema with all fields
       - One Pager section instructions: Section 3 (Meaning/Management KPIs — financial portion) with key "meaning" and Section 4 (Growth Metrics) with key "growth_metrics"
       - Section 3 data requirements: ROE, ROIC, Net-Debt to Earnings, Net-Debt to FCF, Rule One Score components
       - Section 4 data requirements: multi-year table with BVPS+Div, Earnings, OpCash, Revenue, FCF, ROE, ROIC, ROA growth rates across 10/7/5/3/1yr periods
       - Citation requirements: every quantitative claim traces to DataPacket field path
       - Red flag mandate: at least 1 per section, even for PASS
       - Industry branching: REIT (FFO/AFFO/NAV), bank (NIM/efficiency), insurance (combined ratio/float) — per classification field
       - Cyclical handling: CAGR from "first positive year," multiple capex ratios
       - Dual Owner Earnings: Rule One method AND Graham method side by side (per KDD #11)
       - Contamination boundary: explicit instruction to never reference examples
       - Honest gaps: "Data not available" — never estimate

    6. Ensure prompt does NOT contain "LULU" or reference any example analyses.

    The prompt replaces the existing stub at agents/financial-analyst/prompt.md.
  </action>
  <verify>
    <automated>grep -c "DRAFT" agents/financial-analyst/prompt.md | grep "^0$" && wc -l agents/financial-analyst/prompt.md | awk '{if ($1 >= 100) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <acceptance_criteria>
    - agents/financial-analyst/prompt.md exists and is >= 100 lines
    - File does NOT contain "DRAFT" or "STUB"
    - File contains "ReportSectionSchema" or "report section" (output format)
    - File contains "meaning" and "growth_metrics" (One Pager section keys)
    - File contains "contamination" or "NEVER reference" (contamination boundary)
    - File contains "red flag" or "redFlag" (red flag mandate)
    - File contains "DataPacket" (DataPacket slice documented)
    - File does NOT contain "LULU" or "lululemon"
    - File contains "ROE" and "ROIC" (return metrics covered)
    - File contains "REIT" or "bank" or "industry" (industry branching present)
    - File contains "Owner Earnings" or "dual" (dual OE methodology)
    - File contains FGR-related content (Big 4 growth rates, CAGR periods)
  </acceptance_criteria>
  <done>Financial-analyst prompt.md is a production prompt with full-depth curriculum, ReportSectionSchema output format, contamination boundary, red flag mandate, industry branching, dual Owner Earnings, and section-specific instructions for meaning and growth_metrics.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: User reviews business-analyst and financial-analyst prompts</name>
  <files>agents/business-analyst/prompt.md, agents/financial-analyst/prompt.md</files>
  <action>
    Present both prompt.md files to the user for review. The user reads each prompt and verifies:
    1. agents/business-analyst/prompt.md: full-depth curriculum embedded, ReportSectionSchema output format, section keys company_info and minimum_standards, contamination boundary, red flag mandate, moat types documented
    2. agents/financial-analyst/prompt.md: full-depth curriculum embedded, DataPacket slice matches config.json, section keys meaning and growth_metrics, industry branching (REIT/bank/insurance), dual Owner Earnings, growth metrics table format
    User confirms whether a Sonnet model receiving these prompts + DataPacket would produce high-quality One Pager sections.
  </action>
  <verify>
    <automated>wc -l agents/business-analyst/prompt.md agents/financial-analyst/prompt.md | tail -1 | awk '{if ($1 >= 200) print "PASS"; else print "FAIL"}'</automated>
  </verify>
  <done>User has reviewed and approved both prompt.md files as production-quality agent prompts.</done>
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
- Existing agent definition tests still pass: npm test -- --run agents/__tests__/agentDefinitions.test.js
</verification>

<success_criteria>
1. Business-analyst prompt.md replaces stub with production prompt containing full-depth curriculum from 4 files
2. Financial-analyst prompt.md replaces stub with production prompt containing full-depth curriculum from 3 files
3. Both prompts define ReportSectionSchema output format with all required fields
4. User has reviewed and approved both prompts (checkpoint passed)
5. No LULU contamination in either prompt
</success_criteria>

<output>
After completion, create `.planning/phases/05C-cc-skill-first-analysis/05C-01-SUMMARY.md`
</output>
