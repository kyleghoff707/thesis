---
phase: 05A-agent-definitions-foundation
plan: 04
type: execute
wave: 3
depends_on: [05A-01, 05A-03]
files_modified:
  - agents/data-assembler/config.json
  - agents/data-assembler/README.md
  - agents/primary-source-reader/config.json
  - agents/primary-source-reader/README.md
  - agents/financial-analyst/config.json
  - agents/financial-analyst/README.md
  - agents/business-analyst/config.json
  - agents/business-analyst/README.md
  - agents/competitor-evaluator/config.json
  - agents/competitor-evaluator/README.md
  - agents/management-evaluator/config.json
  - agents/management-evaluator/README.md
  - agents/risk-analyst/config.json
  - agents/risk-analyst/README.md
  - agents/valuation-specialist/config.json
  - agents/valuation-specialist/README.md
  - agents/synthesis-writer/config.json
  - agents/synthesis-writer/README.md
  - agents/writing-briefs/financial-analyst-brief.md
  - agents/writing-briefs/business-analyst-brief.md
  - agents/writing-briefs/competitor-evaluator-brief.md
  - agents/writing-briefs/management-evaluator-brief.md
  - agents/writing-briefs/risk-analyst-brief.md
  - agents/writing-briefs/valuation-specialist-brief.md
  - agents/writing-briefs/synthesis-writer-brief.md
  - agents/writing-briefs/primary-source-reader-brief.md
  - agents/__tests__/agentDefinitions.test.js
autonomous: true
requirements: [AGNT-01, AGNT-02, AGNT-03, AGNT-04]

must_haves:
  truths:
    - "Each of the 9 agent directories exists with config.json and README.md"
    - "Every config.json specifies model, curriculum paths, dataPacketSlice, tools, universalContext, exampleContamination exclusions, and section assignments"
    - "No config.json references any LULU example path (contamination boundary)"
    - "All config.json files reference valid curriculum file paths that exist in the knowledge/ directory"
    - "Universal context flag is true for all AI agents (financial-analyst through synthesis-writer) and false for data-assembler"
    - "Writing briefs exist for all 8 AI agents, providing curriculum mapping and DataPacket context for /writing-skills authoring"
  artifacts:
    - path: "agents/financial-analyst/config.json"
      provides: "Machine-readable config for financial analyst agent"
      contains: "dataPacketSlice"
    - path: "agents/writing-briefs/financial-analyst-brief.md"
      provides: "Input brief for /writing-skills prompt.md authoring"
      contains: "Curriculum Mapping"
    - path: "agents/__tests__/agentDefinitions.test.js"
      provides: "Structural validation tests for all agent definitions"
  key_links:
    - from: "agents/*/config.json"
      to: "knowledge/research-references/*.md"
      via: "curriculum array references existing curriculum files"
      pattern: "knowledge/"
    - from: "agents/*/config.json"
      to: "src/engines/toolbox.js"
      via: "tools array matches TOOL_DEFINITIONS names"
      pattern: "computeMOS|comparePeers|getMetric"
    - from: "agents/*/config.json"
      to: "src/schemas/dataPacket.js"
      via: "dataPacketSlice field names match DataPacket top-level keys"
      pattern: "financials|growthRates|returnMetrics"
---

<objective>
Create the agents/ directory structure with all 9 agent role definitions (config.json + README.md) and writing briefs that prepare the user for authoring prompt.md files via /writing-skills. The config.json files are the machine-readable contracts that the orchestrator and executor will consume. The writing briefs provide the curriculum mapping, DataPacket slice context, Toolbox tool list, and section assignments that the user needs to author high-quality agent prompts.

Purpose: Agent definitions are the bridge between the architecture plan and real AI execution. Each config.json encodes WHAT an agent can access (data, tools, curriculum). Each writing brief gives the user everything they need to write the prompt.md (the HOW — Rule One methodology applied to this specific role). The user authors prompt.md files personally via /writing-skills, not an executor agent.

Output: 9 agent directories (each with config.json + README.md), 8 writing briefs (one per AI agent — data-assembler has no prompt.md since it's pure code), and structural validation tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md
@gstack/plans/gstack-ai-agent-workflow-plan-20260323.md

@.planning/phases/05A-agent-definitions-foundation/05A-01-SUMMARY.md
@.planning/phases/05A-agent-definitions-foundation/05A-03-SUMMARY.md
</context>

<interfaces>
<!-- From architecture plan — exact agent specifications -->

From gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (Agent Team table):

| Role | Model | Curriculum | DataPacket Slice | Tools | Sections |
|------|-------|------------|-----------------|-------|----------|
| Data Assembler | N/A | None | Produces full | Engine APIs | Pre-processing |
| Primary Source Reader | Opus | None (reads raw filings) | companyInfo, filings | readFilingSection, getTranscriptExcerpt | Pre-processing |
| Financial Analyst | Sonnet | advanced-financial-analysis.md, fgr.md, capex-cash-flow-explained.md | financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics | getMetric, getFinancialLine, computeGrowthRates, computeMOS, computePBT, computeTenCap, computeEquityBond, sensitivityTable, comparePeers | OP:3-4, PD:5,7,8, FS:5 |
| Business Analyst | Sonnet | pitch-deck-I.md (sec 1-3), one-pager.md, story-form-I.md | companyInfo, classification, ruleOneScore, peers | WebSearch | OP:1-2, PD:1-2, FS:2-3 |
| Competitor Evaluator | Sonnet | pitch-deck-I.md (dominance), pitch-deck-II.md (barriers), story-form-I.md (moat) | peers, peerMetrics, classification | comparePeers, WebSearch | PD:3-4, FS:3 |
| Management Evaluator | Sonnet | pitch-deck-II.md (mgmt section) | compensation, insiders, gurus | WebSearch | PD:6, FS:4 |
| Risk Analyst | Opus | pitch-deck-III.md, story-form-II.md | companyInfo, events, analystEstimates, classification | WebSearch | PD:9, FS:1,6 |
| Valuation Specialist | Opus | pitch-deck-IV.md, fgr.md, equity-bond-research.md | growthRates, returnMetrics, fcf, analystEstimates, ttm, currentPrice | computeMOS, computePBT, computeTenCap, computeEquityBond, sensitivityTable, WebSearch | PD:10, FS:5,7 |
| Synthesis Writer | Opus | buffett_writing_principles.md + Buffett letter | All section summaries | None | Final polish |

Universal context (ALL AI agents): rule-one-fundamentals.md, tools-for-analysis.md, 7 Operating Rules

From src/engines/toolbox.js (Plan 03):
```javascript
export const TOOL_DEFINITIONS; // Array of {name, description, input_schema}
// Tool names: computeMOS, computePBT, computeTenCap, computeEquityBond,
// sensitivityTable, getMetric, getFinancialLine, computeGrowthRates,
// comparePeers, readFilingSection, getTranscriptExcerpt, fcfPerShare, yearsToPayback
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Create all 9 agent config.json and README.md files</name>
  <files>agents/data-assembler/config.json, agents/data-assembler/README.md, agents/primary-source-reader/config.json, agents/primary-source-reader/README.md, agents/financial-analyst/config.json, agents/financial-analyst/README.md, agents/business-analyst/config.json, agents/business-analyst/README.md, agents/competitor-evaluator/config.json, agents/competitor-evaluator/README.md, agents/management-evaluator/config.json, agents/management-evaluator/README.md, agents/risk-analyst/config.json, agents/risk-analyst/README.md, agents/valuation-specialist/config.json, agents/valuation-specialist/README.md, agents/synthesis-writer/config.json, agents/synthesis-writer/README.md</files>
  <read_first>
    - gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (lines 70-106 for agent team table with exact curriculum, DataPacket slices, tools, and sections per role)
    - .planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md (lines 140-217 for agent definition format and config.json structure)
    - .planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md (lines 620-634 for Agent Role Summary table)
    - knowledge/research-references/rule-one-fundamentals.md (first 5 lines — verify file exists)
    - knowledge/research-references/tools-for-analysis.md (first 5 lines — verify file exists)
    - knowledge/research-references/advanced-financial-analysis.md (first 5 lines — verify file exists)
    - knowledge/research-references/fgr.md (first 5 lines — verify file exists)
    - knowledge/research-references/capex-cash-flow-explained.md (first 5 lines — verify file exists)
    - knowledge/research-references/equity-bond-research.md (first 5 lines — verify file exists)
    - knowledge/stage-1-one-pager/one-pager.md (first 5 lines — verify file exists)
    - knowledge/stage-2-pitch-deck/pitch-deck-I.md (first 5 lines — verify file exists)
    - knowledge/stage-2-pitch-deck/pitch-deck-II.md (first 5 lines — verify file exists)
    - knowledge/stage-2-pitch-deck/pitch-deck-III.md (first 5 lines — verify file exists)
    - knowledge/stage-2-pitch-deck/pitch-deck-IV.md (first 5 lines — verify file exists)
    - knowledge/stage-3-full-story/story-form-I.md (first 5 lines — verify file exists)
    - knowledge/stage-3-full-story/story-form-II.md (first 5 lines — verify file exists)
  </read_first>
  <action>
    Create the `agents/` directory with 9 subdirectories:

    **For EACH agent role**, create `config.json` with this exact structure:

    ```json
    {
      "role": "<role-name>",
      "model": "<sonnet|opus|null>",
      "curriculum": [
        "<relative path from project root to each curriculum file>"
      ],
      "universalContext": true|false,
      "universalContextFiles": [
        "knowledge/research-references/rule-one-fundamentals.md",
        "knowledge/research-references/tools-for-analysis.md"
      ],
      "dataPacketSlice": ["<field1>", "<field2>"],
      "tools": ["<tool1>", "<tool2>"],
      "exampleContamination": {
        "exclude": [
          "knowledge/stage-1-one-pager/examples/",
          "knowledge/stage-2-pitch-deck/examples/",
          "knowledge/stage-3-full-story/examples/",
          "knowledge/pre-course-examples/"
        ]
      },
      "sections": {
        "onePager": [],
        "pitchDeck": [],
        "fullStory": []
      }
    }
    ```

    **Exact values per agent (from architecture plan lines 70-106 and research lines 620-634):**

    **1. data-assembler/config.json:**
    - model: null (no AI — pure code, runs dataExport.js)
    - curriculum: []
    - universalContext: false
    - dataPacketSlice: ["*"] (produces the full DataPacket)
    - tools: [] (uses engine APIs directly, not Toolbox)
    - sections: {} (pre-processing, no report sections)

    **2. primary-source-reader/config.json:**
    - model: "opus" (200K+ token 10-K input needs strongest reasoning)
    - curriculum: [] (reads raw filings, no curriculum — its job is extraction, not analysis)
    - universalContext: true
    - dataPacketSlice: ["companyInfo", "classification", "financials", "ttm", "transcriptAvailability"]
    - tools: ["readFilingSection", "getTranscriptExcerpt"]
    - sections: { onePager: [], pitchDeck: [], fullStory: [] } (pre-processing)

    **3. financial-analyst/config.json:**
    - model: "sonnet"
    - curriculum: ["knowledge/research-references/advanced-financial-analysis.md", "knowledge/research-references/fgr.md", "knowledge/research-references/capex-cash-flow-explained.md"]
    - universalContext: true
    - dataPacketSlice: ["financials", "ttm", "growthRates", "returnMetrics", "debtMetrics", "fcf", "keyMetrics"]
    - tools: ["getMetric", "getFinancialLine", "computeGrowthRates", "computeMOS", "computePBT", "computeTenCap", "computeEquityBond", "sensitivityTable", "comparePeers"]
    - sections: { onePager: [3, 4], pitchDeck: [5, 7, 8], fullStory: [5] }

    **4. business-analyst/config.json:**
    - model: "sonnet"
    - curriculum: ["knowledge/stage-2-pitch-deck/pitch-deck-I.md", "knowledge/stage-1-one-pager/one-pager.md", "knowledge/stage-3-full-story/story-form-I.md"]
    - universalContext: true
    - dataPacketSlice: ["companyInfo", "classification", "ruleOneScore", "peers"]
    - tools: [] (uses WebSearch via CC Agent tool, not Toolbox)
    - sections: { onePager: [1, 2], pitchDeck: [1, 2], fullStory: [2, 3] }

    **5. competitor-evaluator/config.json:**
    - model: "sonnet"
    - curriculum: ["knowledge/stage-2-pitch-deck/pitch-deck-I.md", "knowledge/stage-2-pitch-deck/pitch-deck-II.md", "knowledge/stage-3-full-story/story-form-I.md"]
    - universalContext: true
    - dataPacketSlice: ["peers", "peerMetrics", "classification", "companyInfo"]
    - tools: ["comparePeers"]
    - sections: { onePager: [], pitchDeck: [3, 4], fullStory: [3] }

    **6. management-evaluator/config.json:**
    - model: "sonnet"
    - curriculum: ["knowledge/stage-2-pitch-deck/pitch-deck-II.md"]
    - universalContext: true
    - dataPacketSlice: ["compensation", "insiders", "gurus", "companyInfo"]
    - tools: [] (uses WebSearch)
    - sections: { onePager: [], pitchDeck: [6], fullStory: [4] }

    **7. risk-analyst/config.json:**
    - model: "opus" (adversarial thinking needs strongest reasoning)
    - curriculum: ["knowledge/stage-2-pitch-deck/pitch-deck-III.md", "knowledge/stage-3-full-story/story-form-II.md"]
    - universalContext: true
    - dataPacketSlice: ["companyInfo", "events", "analystEstimates", "classification"]
    - tools: [] (uses WebSearch)
    - sections: { onePager: [], pitchDeck: [9], fullStory: [1, 6] }

    **8. valuation-specialist/config.json:**
    - model: "opus" (complex multi-variable FGR derivation + sensitivity)
    - curriculum: ["knowledge/stage-2-pitch-deck/pitch-deck-IV.md", "knowledge/research-references/fgr.md", "knowledge/research-references/equity-bond-research.md"]
    - universalContext: true
    - dataPacketSlice: ["growthRates", "returnMetrics", "fcf", "analystEstimates", "ttm", "currentPrice", "keyMetrics"]
    - tools: ["computeMOS", "computePBT", "computeTenCap", "computeEquityBond", "sensitivityTable"]
    - sections: { onePager: [5], pitchDeck: [10], fullStory: [5, 7] }

    **9. synthesis-writer/config.json:**
    - model: "opus" (best writing quality for Buffett-style narrative)
    - curriculum: ["knowledge/research-references/buffett_writing_principles.md"]
    - universalContext: true
    - dataPacketSlice: [] (receives section summaries, not raw DataPacket)
    - tools: []
    - sections: { onePager: [6], pitchDeck: [], fullStory: [8] } (final polish pass)

    Note: Check if `knowledge/research-references/buffett_writing_principles.md` exists. If NOT, check for similar files in knowledge/research-references/ (e.g., the Buffett letters directory). Use the actual path that exists. If no standalone file exists, reference the Buffett letters directory path.

    **README.md for each agent:**
    Short human-readable description (5-10 lines). Include:
    - Role name and one-sentence description
    - Model selection rationale (why opus/sonnet for this role)
    - Which sections this agent generates
    - Which stages (One Pager, Pitch Deck, Full Story) it participates in
    - Note: "prompt.md will be authored via /writing-skills by the user"

    **CRITICAL: Example contamination boundary (per AGNT-04):**
    Every config.json with `universalContext: true` MUST have the `exampleContamination.exclude` array listing all example directories. Verify no curriculum path in ANY config.json points to an examples/ directory or contains "LULU" in the path.
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && ls agents/*/config.json | wc -l && grep -r "LULU" agents/*/config.json; echo "Exit: $?"</automated>
  </verify>
  <acceptance_criteria>
    - 9 directories exist under agents/: data-assembler, primary-source-reader, financial-analyst, business-analyst, competitor-evaluator, management-evaluator, risk-analyst, valuation-specialist, synthesis-writer
    - Each directory contains config.json and README.md (18 files total)
    - `grep -r "LULU" agents/*/config.json` returns no matches (contamination boundary)
    - `grep -r "examples/" agents/*/config.json` only appears in exampleContamination.exclude arrays, never in curriculum arrays
    - financial-analyst/config.json contains "advanced-financial-analysis.md" in curriculum array
    - valuation-specialist/config.json contains "equity-bond-research.md" in curriculum array
    - primary-source-reader/config.json has model "opus"
    - financial-analyst/config.json has model "sonnet"
    - data-assembler/config.json has model null and universalContext false
    - Every config.json with universalContext true references rule-one-fundamentals.md and tools-for-analysis.md in universalContextFiles
    - All curriculum file paths in config.json point to files that actually exist (can be verified with ls)
  </acceptance_criteria>
  <done>All 9 agent directories created with correct config.json (model, curriculum, DataPacket slice, tools, contamination boundary, section assignments) and README.md</done>
</task>

<task type="auto">
  <name>Task 2: Create writing briefs for /writing-skills authoring</name>
  <files>agents/writing-briefs/financial-analyst-brief.md, agents/writing-briefs/business-analyst-brief.md, agents/writing-briefs/competitor-evaluator-brief.md, agents/writing-briefs/management-evaluator-brief.md, agents/writing-briefs/risk-analyst-brief.md, agents/writing-briefs/valuation-specialist-brief.md, agents/writing-briefs/synthesis-writer-brief.md, agents/writing-briefs/primary-source-reader-brief.md</files>
  <read_first>
    - gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (lines 70-127 for detailed role descriptions, especially Primary Source Reader and Competitor Evaluator)
    - gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (lines 283-318 for quality assurance and report schema)
    - .planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md (lines 140-184 for prompt.md format)
    - .planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md (lines 594-634 for curriculum inventory with line counts and token estimates)
    - .planning/REQUIREMENTS.md (lines 10-15 for AGNT-01 through AGNT-05 requirements)
    - .claude/skills/writing-skills/SKILL.md (first 50 lines — understand the TDD process the user will follow)
    - knowledge/research-references/rule-one-fundamentals.md (first 20 lines — see what universal context contains)
    - knowledge/research-references/tools-for-analysis.md (first 20 lines — see what universal context contains)
    - agents/financial-analyst/config.json (just created — verify curriculum and tools to include in brief)
  </read_first>
  <action>
    Create `agents/writing-briefs/` directory with one brief per AI agent (8 briefs — data-assembler excluded since it has no prompt.md).

    **Each writing brief follows this template:**

    ```markdown
    # Writing Brief: {Agent Role Name}

    > Input document for authoring `agents/{role}/prompt.md` via `/writing-skills`.
    > This brief provides the curriculum mapping, DataPacket context, and Toolbox tool list
    > needed to write a high-quality agent system prompt.

    ## Role Summary
    {1-2 sentence description of what this agent does and why it exists}

    ## Model: {sonnet|opus}
    {Why this model — cost/capability tradeoff}

    ## Curriculum to Embed (Full Depth — per AGNT-03)
    These files must be read and their content embedded in the prompt.md at full depth.
    No compression, no summarization. The depth IS the competitive edge.

    | File | Lines | ~Tokens | What It Teaches |
    |------|-------|---------|-----------------|
    | {path} | {N} | {~M} | {description} |

    ## Universal Context (per AGNT-02)
    Loaded into every AI agent:
    - `knowledge/research-references/rule-one-fundamentals.md` (239 lines, ~800 tokens) — R1 philosophy, investment requirements, 3 Ms
    - `knowledge/research-references/tools-for-analysis.md` (231 lines, ~770 tokens) — Practical tools, data sources
    - **7 Operating Rules**: never skip stages, never assume guru = buy signal, conservative growth, test inversion, define exit before entry, document assumptions, stop when clarity fails

    ## DataPacket Slice
    This agent receives these fields from the DataPacket:
    {List each field with a 1-line description of what it contains}

    Always included: ticker, companyInfo, classification, caveats

    ## Toolbox Tools Available
    {List each tool with its description from TOOL_DEFINITIONS}
    OR "None (uses WebSearch via CC Agent tool for qualitative research)"

    ## Sections This Agent Generates
    | Stage | Section # | Section Name |
    |-------|-----------|-------------|
    | {stage} | {N} | {name} |

    ## Output Format
    Every section must conform to ReportSectionSchema (from src/schemas/reportSection.js):
    - key, title, sectionNumber, status, confidence, verdict, verdictRationale
    - summary (1-2 sentences for downstream agents)
    - narrative (Buffett-style prose)
    - citations (every claim traced to DataPacket path or source)
    - redFlags (at least 1, even for PASS — per KDD #12)
    - data (section-specific structured metrics)

    ## Critical Rules for This Agent
    {Role-specific rules from the architecture plan}
    - Every quantitative claim MUST cite a DataPacket field path
    - "Data not available" for anything not in DataPacket — NEVER estimate
    - {Role-specific additions}

    ## Contamination Boundary (per AGNT-04)
    This agent must NEVER:
    - Reference or pattern-match from LULU or other example analyses
    - Access files in knowledge/stage-*/examples/ or knowledge/pre-course-examples/
    - Produce output that resembles the structure of example reports

    Prompt instruction to include: "Perform independent research. Do NOT reference or copy patterns from example analyses."

    ## Key Decisions Affecting This Agent
    {Relevant KDDs from the architecture plan}
    ```

    **Agent-specific content for each brief:**

    **primary-source-reader-brief.md:**
    - The qualitative moat — reads BEFORE other agents
    - 4 responsibilities: 10-K text extraction, earnings transcript analysis, proxy statement review, Management Promise Tracker
    - 10-K Data Verification: cross-check DataPacket financials against actual 10-K text
    - Produces primarySourceInsights.json consumed by all downstream agents
    - No analysis curriculum — extraction and verification role
    - Tools: readFilingSection, getTranscriptExcerpt
    - Special: processes 200K+ token 10-K text (why it uses Opus with 1M context)

    **financial-analyst-brief.md:**
    - Numbers role: growth, returns, FCF, balance sheet
    - Curriculum: advanced-financial-analysis.md (344 lines), fgr.md (153 lines), capex-cash-flow-explained.md (222 lines)
    - 9 Toolbox tools — the most tools of any agent
    - Industry branching: "If classification is REIT, use FFO/AFFO/NAV. If bank, use NIM/efficiency ratio."
    - Sections: OP 3-4, PD 5/7/8, FS 5

    **business-analyst-brief.md:**
    - Qualitative role: business model, moat identification
    - Curriculum: pitch-deck-I.md sections 1-3 (284 lines), one-pager.md (302 lines), story-form-I.md (221 lines)
    - No Toolbox tools — uses WebSearch for qualitative research
    - Identifies the moat; Competitor Evaluator validates it
    - Sections: OP 1-2, PD 1-2, FS 2-3

    **competitor-evaluator-brief.md:**
    - Industry landscape specialist (NEW role from CEO review)
    - Curriculum: pitch-deck-I.md (dominance), pitch-deck-II.md (barriers), story-form-I.md (moat field research)
    - Tool: comparePeers (plus WebSearch)
    - 4 responsibilities: market penetration/TAM, competitive edge, business cycle position, moat validation against landscape
    - Validates Business Analyst's moat claims — different hat, different research approach
    - Sections: PD 3-4, FS 3

    **management-evaluator-brief.md:**
    - CEO assessment, insider activity, compensation analysis
    - Curriculum: pitch-deck-II.md management section (200 lines)
    - No Toolbox tools — uses WebSearch
    - DataPacket slice: compensation, insiders, gurus
    - Sections: PD 6, FS 4

    **risk-analyst-brief.md:**
    - Adversarial thinking role (why Opus)
    - Curriculum: pitch-deck-III.md (145 lines), story-form-II.md (306 lines)
    - No Toolbox tools — uses WebSearch
    - Must construct COMPELLING counter-arguments, not straw men
    - In Full Story: attacks bull case as Bear in structured debate
    - Sections: PD 9, FS 1/6

    **valuation-specialist-brief.md:**
    - FGR derivation (5 inputs, user confirmation), 4 valuation methods, sensitivity tables, growth ceiling
    - Curriculum: pitch-deck-IV.md (360 lines), fgr.md (153 lines), equity-bond-research.md (400 lines) — heaviest curriculum budget (~4,610 tokens)
    - 5 Toolbox tools (all valuation calculators + sensitivity)
    - FGR sub-workflow: 5 inputs (Historical, Market Relativity, Company Guidance, Industry CAGR, Analyst Consensus)
    - Sections: OP 5, PD 10, FS 5/7

    **synthesis-writer-brief.md:**
    - Buffett-style narrative, final verdicts, overall thesis
    - Curriculum: buffett_writing_principles.md (219 lines) + Buffett letters reference
    - No Toolbox tools, no raw DataPacket — receives all section summaries
    - Must weave findings into cohesive narrative, not just concatenate
    - In Full Story: argues bull case in structured debate
    - Sections: OP 6, PD final polish, FS 8
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && ls agents/writing-briefs/*.md | wc -l && grep -l "Curriculum to Embed" agents/writing-briefs/*.md | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - agents/writing-briefs/ directory contains exactly 8 .md files (one per AI agent)
    - Each brief contains sections: Role Summary, Model, Curriculum to Embed, Universal Context, DataPacket Slice, Toolbox Tools Available, Sections This Agent Generates, Output Format, Critical Rules, Contamination Boundary
    - financial-analyst-brief.md lists 9 tools in Toolbox Tools section
    - valuation-specialist-brief.md mentions FGR derivation with 5 inputs
    - primary-source-reader-brief.md mentions 10-K Data Verification and Management Promise Tracker
    - competitor-evaluator-brief.md mentions moat validation against landscape
    - synthesis-writer-brief.md mentions Buffett-style narrative
    - Each brief contains "Perform independent research. Do NOT reference or copy patterns from example analyses."
    - No brief references LULU in curriculum or instructions
  </acceptance_criteria>
  <done>8 writing briefs prepared with complete context for /writing-skills authoring of each agent's prompt.md</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Structural validation tests for agent definitions</name>
  <files>agents/__tests__/agentDefinitions.test.js</files>
  <read_first>
    - agents/financial-analyst/config.json (see structure to validate)
    - agents/data-assembler/config.json (see null model case)
    - src/engines/__tests__/edgarFinancials.test.js (first 20 lines — vitest patterns)
    - src/engines/toolbox.js (see TOOL_DEFINITIONS — need to validate agent tools against this list)
  </read_first>
  <behavior>
    - Test 1: All 9 agent directories exist under agents/
    - Test 2: Each agent directory has config.json
    - Test 3: Each agent directory has README.md
    - Test 4: Each config.json has required fields: role, model, curriculum, universalContext, dataPacketSlice, tools, exampleContamination, sections
    - Test 5: No config.json curriculum array contains paths with "LULU" or "examples/"
    - Test 6: All curriculum file paths in all config.json files reference files that exist on disk
    - Test 7: All AI agents (not data-assembler) have universalContext: true
    - Test 8: data-assembler has universalContext: false and model: null
    - Test 9: All tool names in config.json tools arrays are valid (exist in TOOL_DEFINITIONS or are empty)
    - Test 10: exampleContamination.exclude includes at least 3 exclusion paths for all AI agents
    - Test 11: No two agents have the exact same sections assignment (each has a unique role)
  </behavior>
  <action>
    Create `agents/__tests__/agentDefinitions.test.js` with vitest tests:

    Use `fs.readdirSync` and `fs.readFileSync` to read agent directories and config files dynamically. This makes the tests resilient to adding/removing agents.

    ```javascript
    import { describe, it, expect } from 'vitest';
    import { readdirSync, readFileSync, existsSync } from 'fs';
    import { join } from 'path';

    const AGENTS_DIR = join(process.cwd(), 'agents');
    const EXPECTED_AGENTS = [
      'data-assembler', 'primary-source-reader', 'financial-analyst',
      'business-analyst', 'competitor-evaluator', 'management-evaluator',
      'risk-analyst', 'valuation-specialist', 'synthesis-writer'
    ];
    const AI_AGENTS = EXPECTED_AGENTS.filter(a => a !== 'data-assembler');
    ```

    Test each agent's config.json:
    - Parse JSON, verify all required keys present
    - Verify curriculum paths resolve to real files
    - Verify no LULU contamination
    - Verify tools are from the known tool list (import TOOL_DEFINITIONS from toolbox.js and check)

    For the curriculum file existence check, use `existsSync(join(process.cwd(), path))` for each curriculum entry.

    For the tool validation, import TOOL_DEFINITIONS from `../../src/engines/toolbox.js` and verify every tool name in an agent's config.json `tools` array exists in TOOL_DEFINITIONS.map(t => t.name).
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run agents/__tests__/agentDefinitions.test.js --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - agents/__tests__/agentDefinitions.test.js exists with at least 10 test cases
    - `npx vitest run agents/__tests__/agentDefinitions.test.js --reporter=verbose` exits with code 0
    - Tests verify all 9 directories exist, all configs have required fields, no LULU contamination, all curriculum files exist
    - Test output includes descriptions mentioning "contamination", "curriculum", "universalContext"
  </acceptance_criteria>
  <done>Structural validation tests confirm all 9 agent definitions are correctly formed, contamination-free, and reference valid files</done>
</task>

</tasks>

<verification>
1. `npx vitest run agents/__tests__/agentDefinitions.test.js --reporter=verbose` — all structural tests pass
2. `grep -r "LULU" agents/*/config.json` — zero matches (contamination boundary)
3. `ls agents/*/config.json | wc -l` — outputs 9
4. `ls agents/writing-briefs/*.md | wc -l` — outputs 8
5. `npm test -- --run` — existing tests still pass
</verification>

<success_criteria>
- 9 agent directories with config.json + README.md
- 8 writing briefs with complete curriculum mapping and role context
- All config.json files have correct model, curriculum, DataPacket slice, tools, contamination boundary
- Structural validation tests pass
- No LULU contamination in any agent file
- All curriculum paths point to existing files
</success_criteria>

<output>
After completion, create `.planning/phases/05A-agent-definitions-foundation/05A-04-SUMMARY.md`
</output>
