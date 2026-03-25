---
phase: 06-pitch-deck
plan: 06B-01
type: execute
wave: 3
depends_on: ["06A-02", "06A-03", "06A-04", "06A-05", "06A-06"]
files_modified:
  - .claude/skills/generate-pitch-deck/SKILL.md
autonomous: true
requirements: [PTCH-01, PTCH-03, PTCH-04, PTCH-06, PTCH-07]
must_haves:
  truths:
    - "CC skill /generate:pitch-deck exists and defines a complete 3-phase pipeline"
    - "Pre-processing dispatches annual-reader and quarterly-reader before generation phases"
    - "Three checkpoints exist with conversational dialogue loops"
    - "FGR derivation sub-workflow runs in Phase 3 section 10 with input-by-input PM confirmation"
    - "Inter-phase context passes Phase 1 outputs to Phase 2 agents, Phase 1+2 outputs to Phase 3 agents"
    - "Synthesis writer runs in post-processing to produce overallVerdict"
  artifacts:
    - path: ".claude/skills/generate-pitch-deck/SKILL.md"
      provides: "Complete Pitch Deck generation CC skill"
      min_lines: 500
      contains: "generate-pitch-deck"
  key_links:
    - from: ".claude/skills/generate-pitch-deck/SKILL.md"
      to: "agents/orchestrator/dispatch-table.json"
      via: "pitchDeck phase structure reference"
      pattern: "dispatch-table"
    - from: ".claude/skills/generate-pitch-deck/SKILL.md"
      to: "agents/annual-reader/prompt.md"
      via: "pre-processing agent dispatch"
      pattern: "annual-reader"
    - from: ".claude/skills/generate-pitch-deck/SKILL.md"
      to: "src/engines/critic.js"
      via: "quality check step"
      pattern: "critic"
---

<objective>
Create the /generate:pitch-deck CC skill — the complete 3-phase Pitch Deck generation pipeline with pre-processing (PSR agents), structured checkpoints with conversational dialogue, FGR derivation sub-workflow, inter-phase context passing, and quality/budget tracking.

Purpose: This is the core orchestration engine for Pitch Deck generation. It coordinates 10+ agent calls across 3 phases with PM interaction at checkpoints. Follows the generate-one-pager pattern but adds pre-processing, checkpoints, inter-phase context, and FGR derivation.
Output: .claude/skills/generate-pitch-deck/SKILL.md (~600-800 lines).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/06-pitch-deck/06-CONTEXT.md
@.planning/phases/05C-cc-skill-first-analysis/05C-03-SUMMARY.md

<interfaces>
From .claude/skills/generate-one-pager/SKILL.md (pattern to follow, 347 lines):
- Frontmatter: name, description, argument-hint, disable-model-invocation: true
- Steps: validate input, assemble DataPacket, read agent configs, prepare slices, dispatch agents, collect/validate outputs, synthesis, assemble report, quality check, budget tracking, final summary
- Agent dispatch via Agent tool with concatenated prompt (prompt.md + DataPacket slice + curriculum + schema)
- Section output saved to .thes1s/reports/{TICKER}/sections/{key}.json
- Retry-then-escalate for failed sections

From agents/orchestrator/dispatch-table.json — pitchDeck structure:
- preProcessing: data-assembly + PSR agents
- Phase 1: business-analyst (S1,S2) + competitor-evaluator (S3), checkpoint after
- Phase 2: competitor-evaluator (S4) + financial-analyst (S5,S7,S8) + management-evaluator (S6), checkpoint after
- Phase 3: risk-analyst (S9) + valuation-specialist (S10 with FGR sub-workflow), checkpoint after
- postProcessing: synthesis-writer (final polish)
- sectionKeys: [radar, simple_predictable, market_position, barriers_moats, fcf, management, roe_roic_debt, balance_sheet, pest, valuation]

From src/engines/progressState.js:
- startGeneration(ticker, 'pitchDeck') initializes progress
- updateSectionStatus(progress, key, newStatus) transitions section state
- SECTION_KEYS.pitchDeck = [radar, simple_predictable, ...]
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /generate:pitch-deck CC skill with full pipeline</name>
  <files>.claude/skills/generate-pitch-deck/SKILL.md</files>
  <read_first>
    .claude/skills/generate-one-pager/SKILL.md
    agents/orchestrator/dispatch-table.json
    agents/orchestrator/config.json
    src/schemas/reportSection.js
    src/engines/progressState.js
    .planning/phases/06-pitch-deck/06-CONTEXT.md
    .planning/phases/06-pitch-deck/06-RESEARCH.md
  </read_first>
  <action>
Create the directory `.claude/skills/generate-pitch-deck/` and write SKILL.md following the generate-one-pager pattern but with all Pitch Deck additions.

**Frontmatter:**
```
# ~~~~
name: generate-pitch-deck
description: Generate a 10-section Rule One Pitch Deck for a given stock ticker with 3-phase dispatch and PM checkpoints
argument-hint: TICKER
disable-model-invocation: true
~~~~
```

**Step structure (15+ steps):**

**Step 1: Validate Input + Gate Check**
- Uppercase ticker, create output dirs (.thes1s/reports/{TICKER}/, sections/, quality/)
- **Gate check:** Read .thes1s/reports/{TICKER}/one-pager.json. If it does not exist OR report.overallVerdict is not set, print "One Pager must be approved before generating a Pitch Deck." and stop. Per CONTEXT.md gate lock.

**Step 2: Assemble DataPacket**
- Same as one-pager: `node --loader ./scripts/node-esm-loader.js scripts/assemble-data.js {TICKER}`
- Read data-packet.json, log errors, verify minimum data present

**Step 3: Pre-Processing — Annual Reader + Quarterly Reader (per D-08, D-13)**
- Read annual-reader config + prompt
- Read quarterly-reader config + prompt
- Prepare DataPacket slices for each
- Dispatch BOTH PSR agents in parallel via Agent tool (they can run concurrently since both depend only on DataPacket, not each other)
- Annual reader receives: prompt.md + DataPacket slice + universal context + instruction to read 10 years of 10-Ks chronologically
- Quarterly reader receives: prompt.md + DataPacket slice + universal context + instruction to read 4+ quarters of 10-Qs and transcripts chronologically
- Collect PSR outputs: parse structured JSON from each agent
- Save PSR findings to .thes1s/reports/{TICKER}/sections/annual-reader-insights.json and quarterly-reader-insights.json
- Merge into combined psrFindings object for downstream agents

**Step 4: Read Agent Configurations**
- Read dispatch-table.json pitchDeck config
- For each agent in all 3 phases + postProcessing, read config.json + prompt.md + curriculum
- Read ReportSectionSchema from src/schemas/reportSection.js

**Step 5: Phase 1 — Business Fundamentals (parallel dispatch)**
- Dispatch in parallel:
  - business-analyst: sections radar (1), simple_predictable (2)
  - competitor-evaluator: section market_position (3)
- Each agent receives: prompt.md + sliced DataPacket + curriculum + universal context + PSR findings (from Step 3) + ReportSectionSchema
- Collect and validate outputs (same retry-then-escalate as one-pager)
- Save sections to .thes1s/reports/{TICKER}/sections/{key}.json

**Step 6: Checkpoint 1 — Business Fundamentals Review (per D-05, D-06, D-07)**
Print structured checkpoint summary:
```
=== CHECKPOINT 1: Business Fundamentals ===
Sections completed: radar, simple_predictable, market_position
[Per section: verdict, confidence, summary snippet, red flags count]
Data gaps discovered: [list]
Questions for PM: [list generated by agents]
Cross-cutting findings: [list]
```
Enter conversational dialogue loop:
- Print: "Type a question, paste data, say 're-run section X', or 'continue' to advance."
- If PM types a question: identify which section it relates to, dispatch the responsible agent (per D-07, from sectionMapping) with the question + original context + section output as follow-up. Print the agent's answer.
- If PM says "re-run section X": re-dispatch that section's agent (this is CMD-01 in action). Replace the section output.
- If PM pastes data: store as supplementaryContext for Phase 2 agents
- If PM says "continue": save checkpoint state (dataGaps, pmNotes, sectionConfidence) and advance
- Store checkpoint in report: { afterPhase: 1, dataGaps, pmNotes, sectionConfidence }

**Step 7: Phase 2 — Financial Deep-Dive (mixed dispatch)**
Prepare inter-phase context: collect Phase 1 section summaries + verdicts + red flags + key data points. Format as "Prior Analysis Context" for Phase 2 agents.
Dispatch:
  - competitor-evaluator: section barriers_moats (4) — needs Phase 1 market_position context, so dispatch FIRST
  - After barriers_moats completes, dispatch in parallel:
    - financial-analyst: sections fcf (5), roe_roic_debt (7), balance_sheet (8)
    - management-evaluator: section management (6)
- Each agent receives: prompt.md + sliced DataPacket + curriculum + PSR findings + Phase 1 context + supplementaryContext (from checkpoint) + ReportSectionSchema
- Collect, validate, save

**Step 8: Checkpoint 2 — Financial Deep-Dive Review**
Same conversational dialogue pattern as Step 6 but for Phase 2 sections.

**Step 9: Phase 3 — Risk & Valuation**
Prepare inter-phase context: Phase 1 + Phase 2 section summaries + verdicts + red flags.
Dispatch in parallel:
  - risk-analyst: section pest (9)
  - valuation-specialist: section valuation (10) — this triggers the FGR sub-workflow

Both receive: prompt.md + sliced DataPacket + curriculum + PSR findings + Phase 1+2 context + supplementaryContext + ReportSectionSchema

**Step 10: FGR Derivation Sub-Workflow (per D-14, D-15)**
After valuation-specialist produces initial section 10 output, extract the FGR derivation data. Present to PM input by input:
```
=== FGR DERIVATION ===
Input 1: Historical Composite
  Value: 12.3%
  Source: DataPacket BVPS+Div CAGR 10yr
  Confidence: HIGH
  Reasoning: {agent's reasoning}

  Confirm or adjust (enter value or 'ok'):
```
Repeat for all 5 inputs. After PM confirms all 5:
```
Proposed FGR Range: 10% - 14%
Based on: {weighted average logic}
Confirm (ok/adjust):
```
If PM adjusts any input, re-run the valuation calculations with updated FGR and regenerate sensitivity tables. Save final FGR derivation to report.

**Step 11: Checkpoint 3 — Risk & Valuation Review**
Same conversational pattern. Additionally presents:
- FGR derivation summary (all 5 inputs with PM-confirmed values)
- Sensitivity table previews (text-format matrix)
- Buy price ranges per method

**Step 12: Synthesis Writer — Final Polish (postProcessing)**
Dispatch synthesis-writer with Opus model. Receives ALL 10 section outputs + PSR findings + checkpoint notes. Task: review for cross-section consistency, produce overallVerdict, polish low-quality sections.

**Step 13: Assemble Final Report**
Collect all 10 sections + checkpoints + fgrDerivation + sensitivityTables + assumptions into pitch-deck.json:
```json
{
  "ticker": "TICKER",
  "companyName": "...",
  "stage": "pitchDeck",
  "generatedAt": "ISO timestamp",
  "sections": [/* 10 ReportSectionSchema objects */],
  "overallVerdict": "PASS|FAIL|WATCHLIST",
  "sectionKeys": ["radar", "simple_predictable", ...],
  "checkpoints": [/* 3 checkpoint objects */],
  "fgrDerivation": { "finalLow": 0.10, "finalHigh": 0.14, "inputs": [...] },
  "sensitivityTables": { "mos": {...}, "pbt": {...}, "tenCap": {...}, "equityBond": {...} },
  "assumptions": [/* key assumptions with confidence */]
}
```
Write to .thes1s/reports/{TICKER}/pitch-deck.json + pitch-deck.md

**Step 14: Quality Check**
Same pattern as one-pager: run critic.js validateStage on pitch-deck sections. Save to quality/pitch-deck.quality.json.

**Step 15: Budget Tracking**
Same pattern as one-pager: createBudgetTracker, record per-agent. Save to budget.json (appended, not overwritten).

**Step 16: Print Final Summary**
Sections completed, overall verdict, total citations, total red flags, quality score, estimated cost, output file paths.

**Contamination Boundary:**
Same CRITICAL constraint: NEVER read from knowledge/stage-*/examples/ or knowledge/pre-course-examples/.

**Error Resilience:**
Same principle: partial results over nothing. If a phase fails entirely, skip to next phase with available context.

**Progress Display:**
Log each step with phase/section context: "Step 5: Phase 1 — Dispatching business-analyst for radar, simple_predictable..." etc.

The complete SKILL.md should be 600-800 lines.
  </action>
  <verify>
    <automated>test -f .claude/skills/generate-pitch-deck/SKILL.md && wc -l .claude/skills/generate-pitch-deck/SKILL.md | awk '{if ($1 >= 500) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}' && grep -c "disable-model-invocation: true" .claude/skills/generate-pitch-deck/SKILL.md && grep -c "annual-reader" .claude/skills/generate-pitch-deck/SKILL.md && grep -c "checkpoint" .claude/skills/generate-pitch-deck/SKILL.md && grep -c "FGR" .claude/skills/generate-pitch-deck/SKILL.md</automated>
  </verify>
  <acceptance_criteria>
    - .claude/skills/generate-pitch-deck/SKILL.md exists with 500+ lines
    - Frontmatter contains `name: generate-pitch-deck` and `disable-model-invocation: true`
    - File contains "annual-reader" and "quarterly-reader" (PSR pre-processing)
    - File contains "Checkpoint 1" and "Checkpoint 2" and "Checkpoint 3" (3 checkpoints)
    - File contains "FGR" and "derivation" (FGR sub-workflow)
    - File contains "Phase 1" and "Phase 2" and "Phase 3" (3-phase dispatch)
    - File contains "continue" (checkpoint dialogue loop)
    - File contains "one-pager.json" (gate check)
    - File contains "pitch-deck.json" (output file)
    - File contains "critic" or "quality" (quality check step)
    - File contains "budget" or "contextBudget" (budget tracking step)
    - File contains contamination boundary warning
  </acceptance_criteria>
  <done>Complete /generate:pitch-deck CC skill with 3-phase dispatch, PSR pre-processing, 3 conversational checkpoints, FGR derivation, inter-phase context, and quality/budget tracking</done>
</task>

</tasks>

<verification>
- `.claude/skills/generate-pitch-deck/SKILL.md` exists and is 500+ lines
- Frontmatter is valid YAML
- All 16 steps are present
- `npx vitest run` all tests pass (no regressions)
</verification>

<success_criteria>
The /generate:pitch-deck CC skill is complete and ready for execution. It implements the full Pitch Deck generation pipeline per the dispatch table, with PSR pre-processing, 3-phase dispatch, conversational checkpoints, FGR derivation, inter-phase context passing, and quality/budget tracking.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06B-01-SUMMARY.md`
</output>
