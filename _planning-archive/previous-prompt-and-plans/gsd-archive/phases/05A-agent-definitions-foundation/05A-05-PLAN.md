---
phase: 05A-agent-definitions-foundation
plan: 05
type: execute
wave: 3
depends_on: [05A-01, 05A-04]
files_modified:
  - agents/orchestrator/config.json
  - agents/orchestrator/README.md
  - agents/orchestrator/dispatch-table.json
  - agents/writing-briefs/orchestrator-brief.md
  - src/engines/progressState.js
  - src/engines/__tests__/progressState.test.js
  - .gitignore
autonomous: true
requirements: [AGNT-05, SCHM-04]

must_haves:
  truths:
    - "Orchestrator config.json defines the dispatch table mapping sections to agents for all 3 stages"
    - "Orchestrator dispatch-table.json specifies phase groupings, parallelism rules, and checkpoint positions"
    - "progressState.js can create, read, update, and persist generation state to .thes1s/reports/{TICKER}/progress.json"
    - "Generation state persists across process restarts — read from disk produces the same state that was written"
    - "State machine transitions are validated — cannot jump from IDLE to WAVE_2_RUNNING"
  artifacts:
    - path: "agents/orchestrator/config.json"
      provides: "Orchestrator configuration with section-to-agent mapping"
      contains: "sectionMapping"
    - path: "agents/orchestrator/dispatch-table.json"
      provides: "Detailed dispatch table for all 3 stages with phases, agents, dependencies"
      contains: "pitchDeck"
    - path: "src/engines/progressState.js"
      provides: "State persistence module for generation progress"
      exports: ["createProgress", "readProgress", "updateProgress", "updateSectionStatus", "advanceState"]
    - path: "src/engines/__tests__/progressState.test.js"
      provides: "Tests for state persistence and transitions"
  key_links:
    - from: "agents/orchestrator/dispatch-table.json"
      to: "agents/*/config.json"
      via: "agent field in each dispatch entry references agent role names"
      pattern: "financial-analyst|business-analyst"
    - from: "src/engines/progressState.js"
      to: "src/schemas/progress.js"
      via: "validates progress objects against ProgressSchema before writing"
      pattern: "ProgressSchema"
    - from: "src/engines/progressState.js"
      to: ".thes1s/reports/{TICKER}/progress.json"
      via: "reads/writes JSON state files to disk"
      pattern: "\\.thes1s/reports"
---

<objective>
Define the orchestrator agent (dispatch table, phase definitions, checkpoint rules) and build the state persistence module for generation progress. The orchestrator is NOT an AI agent — it is a code-driven coordinator. Its config defines WHAT runs WHEN and HOW. The state persistence module enables crash recovery and progress tracking.

Purpose: Without the orchestrator definition, Phase 5C cannot build the CC skill (it needs to know which agents handle which sections and in what order). Without state persistence, generation cannot resume after interruption. These are the last two infrastructure pieces before the user begins authoring agent prompts.

Output: Orchestrator config + dispatch table in agents/orchestrator/, progressState.js for state persistence, and state persistence tests.
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
@.planning/phases/05A-agent-definitions-foundation/05A-04-SUMMARY.md
</context>

<interfaces>
<!-- From Plan 01 schemas and Plan 04 agent configs -->

From src/schemas/progress.js (Plan 01):
```javascript
export const ProgressSchema; // Zod schema for generation state
export function createInitialProgress(ticker, stage, sectionKeys); // Factory function
```

From agents/*/config.json (Plan 04) — the sections field in each config:
```
financial-analyst:   { onePager: [3,4], pitchDeck: [5,7,8], fullStory: [5] }
business-analyst:    { onePager: [1,2], pitchDeck: [1,2],   fullStory: [2,3] }
competitor-evaluator:{ onePager: [],    pitchDeck: [3,4],   fullStory: [3] }
management-evaluator:{ onePager: [],    pitchDeck: [6],     fullStory: [4] }
risk-analyst:        { onePager: [],    pitchDeck: [9],     fullStory: [1,6] }
valuation-specialist:{ onePager: [5],   pitchDeck: [10],    fullStory: [5,7] }
synthesis-writer:    { onePager: [6],   pitchDeck: [],      fullStory: [8] }
```

From gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (orchestration flows):
Stage 1 (One Pager): data-assembler -> parallel(financial-analyst, business-analyst) -> synthesis-writer
Stage 2 (Pitch Deck): data-assembler -> primary-source-reader -> PHASE 1(parallel) -> CHECKPOINT -> PHASE 2(sequential/parallel) -> CHECKPOINT -> PHASE 3 -> CHECKPOINT -> synthesis-writer
Stage 3 (Full Story): inherit pitch deck -> PHASE 1(sequential) -> CHECKPOINT -> PHASE 2 DEBATE -> CHECKPOINT -> PHASE 3(strategy) -> final assembly
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Orchestrator definition and dispatch table</name>
  <files>agents/orchestrator/config.json, agents/orchestrator/README.md, agents/orchestrator/dispatch-table.json, agents/writing-briefs/orchestrator-brief.md</files>
  <read_first>
    - gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (lines 128-205 for exact stage orchestration flows — One Pager, Pitch Deck, Full Story phase breakdowns)
    - gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (lines 206-219 for structured checkpoint format)
    - .planning/phases/05A-agent-definitions-foundation/05A-RESEARCH.md (lines 80-120 for orchestrator definition structure)
    - .planning/research/ARCHITECTURE.md (lines 400-480 for state machine and progress.json specification)
    - agents/financial-analyst/config.json (see sections field to cross-reference with dispatch table)
    - agents/business-analyst/config.json (see sections field)
    - agents/risk-analyst/config.json (see sections field)
    - agents/valuation-specialist/config.json (see sections field)
    - agents/synthesis-writer/config.json (see sections field)
  </read_first>
  <action>
    **1. Create agents/orchestrator/config.json:**

    ```json
    {
      "role": "orchestrator",
      "model": null,
      "isCodeDriven": true,
      "description": "Dispatch coordinator — NOT an AI agent. Manages phase sequencing, agent dispatch, checkpoint presentation, and state persistence. Implemented as code in CC skill (Phase 5C) and aiResearch.js (Phase 8).",
      "curriculum": ["knowledge/research-references/rule-1-workflow.md"],
      "universalContext": false,
      "dataPacketSlice": ["*"],
      "tools": [],
      "sectionMapping": {
        "onePager": {
          "1": "business-analyst",
          "2": "business-analyst",
          "3": "financial-analyst",
          "4": "financial-analyst",
          "5": "valuation-specialist",
          "6": "synthesis-writer"
        },
        "pitchDeck": {
          "1": "business-analyst",
          "2": "business-analyst",
          "3": "competitor-evaluator",
          "4": "competitor-evaluator",
          "5": "financial-analyst",
          "6": "management-evaluator",
          "7": "financial-analyst",
          "8": "financial-analyst",
          "9": "risk-analyst",
          "10": "valuation-specialist"
        },
        "fullStory": {
          "1": "risk-analyst",
          "2": "business-analyst",
          "3": "competitor-evaluator",
          "4": "management-evaluator",
          "5": "valuation-specialist",
          "6": "risk-analyst",
          "7": "valuation-specialist",
          "8": "synthesis-writer"
        }
      },
      "checkpointRules": {
        "presentFindings": true,
        "presentDataGaps": true,
        "presentQuestions": true,
        "presentConfidence": true,
        "userCanApproveRejectRedirect": true,
        "fgrRequiresConfirmation": true
      }
    }
    ```

    **IMPORTANT:** The curriculum path MUST be `knowledge/research-references/rule-1-workflow.md` (the actual file on disk). NOT `knowledge/workflow.md` (does not exist).

    **2. Create agents/orchestrator/dispatch-table.json:**

    This is the detailed phase-by-phase execution plan for all 3 stages:

    ```json
    {
      "onePager": {
        "preProcessing": [
          { "step": "data-assembly", "agent": "data-assembler", "parallel": false }
        ],
        "phases": [
          {
            "phase": 1,
            "description": "Core analysis",
            "agents": [
              { "agent": "financial-analyst", "sections": [3, 4], "parallel": true },
              { "agent": "business-analyst", "sections": [1, 2], "parallel": true },
              { "agent": "valuation-specialist", "sections": [5], "parallel": true }
            ]
          }
        ],
        "postProcessing": [
          { "step": "synthesis", "agent": "synthesis-writer", "sections": [6], "dependsOn": "all-phases" }
        ],
        "checkpoints": [],
        "sectionKeys": ["company_info", "minimum_standards", "meaning", "growth_metrics", "valuation_summary", "overall_verdict"]
      },
      "pitchDeck": {
        "preProcessing": [
          { "step": "data-assembly", "agent": "data-assembler", "parallel": false },
          { "step": "primary-source-reading", "agent": "primary-source-reader", "parallel": false, "dependsOn": "data-assembly" }
        ],
        "phases": [
          {
            "phase": 1,
            "description": "Business fundamentals",
            "agents": [
              { "agent": "business-analyst", "sections": [1, 2], "parallel": true },
              { "agent": "competitor-evaluator", "sections": [3], "parallel": true }
            ],
            "checkpoint": {
              "after": true,
              "presents": ["findings", "dataGaps", "questions", "confidence"]
            }
          },
          {
            "phase": 2,
            "description": "Financial deep-dive",
            "agents": [
              { "agent": "competitor-evaluator", "sections": [4], "parallel": false, "note": "Moat validation needs Phase 1 context" },
              { "agent": "financial-analyst", "sections": [5], "parallel": true },
              { "agent": "management-evaluator", "sections": [6], "parallel": true },
              { "agent": "financial-analyst", "sections": [7, 8], "parallel": true }
            ],
            "checkpoint": {
              "after": true,
              "presents": ["findings", "dataGaps", "questions", "confidence"]
            }
          },
          {
            "phase": 3,
            "description": "Risk and valuation (needs full context)",
            "agents": [
              { "agent": "risk-analyst", "sections": [9], "parallel": true },
              { "agent": "valuation-specialist", "sections": [10], "parallel": true, "subWorkflow": "fgr-derivation" }
            ],
            "checkpoint": {
              "after": true,
              "presents": ["findings", "fgrConfirmation", "valuationReview"]
            }
          }
        ],
        "postProcessing": [
          { "step": "synthesis", "agent": "synthesis-writer", "sections": [], "dependsOn": "all-phases", "note": "Final polish pass across all sections" }
        ],
        "sectionKeys": ["radar", "simple_predictable", "market_position", "barriers_moats", "fcf", "management", "roe_roic_debt", "balance_sheet", "pest", "valuation"]
      },
      "fullStory": {
        "preProcessing": [
          { "step": "inherit-pitch-deck", "description": "Load all Pitch Deck findings + updated DataPacket" }
        ],
        "phases": [
          {
            "phase": 1,
            "description": "Deep analysis with scored checklists",
            "agents": [
              { "agent": "risk-analyst", "sections": [1], "parallel": false, "note": "Event Analysis — sequential" },
              { "agent": "business-analyst", "sections": [2], "parallel": false, "note": "Meaning — 15pt checklist" },
              { "agent": "business-analyst", "sections": [3], "parallel": false, "note": "Moat — 15pt checklist, can be parallel with 2" },
              { "agent": "management-evaluator", "sections": [4], "parallel": false, "note": "Management — 13pt checklist" },
              { "agent": "valuation-specialist", "sections": [5], "parallel": false, "note": "Valuation Confirmation" }
            ],
            "checkpoint": {
              "after": true,
              "presents": ["findings", "checklistScores", "confidence"]
            }
          },
          {
            "phase": 2,
            "description": "THE DEBATE — adversarial analysis",
            "agents": [
              { "agent": "synthesis-writer", "role": "bull", "sections": [6], "note": "Summarizes thesis from Sections 1-5" },
              { "agent": "risk-analyst", "role": "bear", "sections": [6], "note": "Attacks every bull point with evidence" },
              { "agent": "financial-analyst", "role": "judge", "sections": [6], "note": "Scores each rebuttal, flags gaps" }
            ],
            "isDebate": true,
            "checkpoint": {
              "after": true,
              "presents": ["debateTranscript", "scoredRebuttals"]
            }
          },
          {
            "phase": 3,
            "description": "Strategy and conclusion",
            "agents": [
              { "agent": "valuation-specialist", "sections": [7], "parallel": true, "note": "Trading Strategy" },
              { "agent": "synthesis-writer", "sections": [8], "parallel": true, "note": "PACE Plan" }
            ]
          }
        ],
        "postProcessing": [
          { "step": "final-assembly", "description": "Overall thesis verdict from all sections" }
        ],
        "sectionKeys": ["event_analysis", "meaning_checklist", "moat_checklist", "management_checklist", "valuation_confirmation", "inversion_rebuttal", "trading_strategy", "pace_plan"]
      }
    }
    ```

    **3. Create agents/orchestrator/README.md:**
    - The orchestrator is code, not AI
    - Dispatch table drives all execution
    - Manages state machine (IDLE -> DATA_ASSEMBLY -> ... -> COMPLETE)
    - Presents checkpoints with findings, data gaps, questions, confidence
    - Handles retry-then-escalate failure recovery
    - Implementation lives in CC skill (Phase 5C) and aiResearch.js (Phase 8)

    **4. Create agents/writing-briefs/orchestrator-brief.md:**
    - This brief is different from the others — it's for a code module, not an AI prompt
    - Describes the orchestrator's exclusive curriculum: knowledge/research-references/rule-1-workflow.md
    - Details the dispatch table structure and how to read it
    - Explains state machine transitions
    - Explains checkpoint format (what to present, how user responds)
    - Explains retry-then-escalate flow
    - This brief will be used when building the CC skill in Phase 5C

    **5. Update EXPECTED_AGENTS in agentDefinitions test:**
    After creating the orchestrator directory, the Plan 04 agentDefinitions test expects 9 agents. Now there are 10 (orchestrator added). Update `agents/__tests__/agentDefinitions.test.js`:
    - Add `'orchestrator'` to the `EXPECTED_AGENTS` array
    - Keep `AI_AGENTS` filter as `EXPECTED_AGENTS.filter(a => a !== 'data-assembler' && a !== 'orchestrator')` since orchestrator is also not an AI agent
    - Re-run the test to confirm it passes with 10 agents
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && cat agents/orchestrator/dispatch-table.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('Stages:', Object.keys(d).join(', ')); console.log('PD phases:', d.pitchDeck.phases.length); console.log('PD sections:', d.pitchDeck.sectionKeys.length)" && echo "---" && cat agents/orchestrator/config.json | node -e "const c=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('Curriculum:', c.curriculum[0]); console.log('Exists:', require('fs').existsSync(c.curriculum[0]))"</automated>
  </verify>
  <acceptance_criteria>
    - agents/orchestrator/config.json exists with sectionMapping covering all 3 stages
    - agents/orchestrator/config.json curriculum references "knowledge/research-references/rule-1-workflow.md" (NOT "knowledge/workflow.md")
    - The curriculum path in config.json points to a file that actually exists on disk
    - agents/orchestrator/dispatch-table.json is valid JSON with keys: onePager, pitchDeck, fullStory
    - dispatch-table.json pitchDeck has exactly 3 phases with checkpoint after each
    - dispatch-table.json pitchDeck.sectionKeys has 10 entries (matching 10 Pitch Deck sections)
    - dispatch-table.json fullStory has phase 2 with isDebate: true
    - dispatch-table.json onePager sectionKeys has 6 entries
    - agents/orchestrator/README.md exists and mentions "code, not AI"
    - agents/writing-briefs/orchestrator-brief.md exists
    - config.json sectionMapping.pitchDeck has entries for sections 1-10
    - config.json sectionMapping.pitchDeck["10"] === "valuation-specialist"
    - config.json sectionMapping.fullStory["6"] === "risk-analyst"
    - config.json checkpointRules.fgrRequiresConfirmation === true
    - agents/__tests__/agentDefinitions.test.js EXPECTED_AGENTS includes 'orchestrator' (10 agents total)
    - `npx vitest run agents/__tests__/agentDefinitions.test.js` still passes with 10 agents
  </acceptance_criteria>
  <done>Orchestrator fully defined with dispatch table for all 3 stages, checkpoint rules, section-to-agent mapping, correct curriculum path, and updated agent count in tests</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Generation state persistence module</name>
  <files>src/engines/progressState.js, src/engines/__tests__/progressState.test.js, .gitignore</files>
  <read_first>
    - src/schemas/progress.js (see ProgressSchema and createInitialProgress — defines the data shape)
    - .planning/research/ARCHITECTURE.md (lines 400-480 for state machine specification and progress.json format)
    - gstack/plans/gstack-ai-agent-workflow-plan-20260323.md (lines 443-469 for progress.json example)
    - agents/orchestrator/dispatch-table.json (just created — see sectionKeys per stage for initializing progress)
    - .gitignore (current contents — need to add .thes1s/ exclusion)
  </read_first>
  <behavior>
    - Test 1: createProgress("COST", "pitchDeck") returns valid ProgressSchema object with state "IDLE"
    - Test 2: createProgress includes all 10 pitchDeck sectionKeys as "pending"
    - Test 3: writeProgress writes JSON to .thes1s/reports/COST/progress.json
    - Test 4: readProgress reads back the exact same object that was written
    - Test 5: updateSectionStatus("COST", "radar", "complete") changes radar from "pending" to "complete"
    - Test 6: advanceState("COST", "WAVE_1_RUNNING") updates state field
    - Test 7: advanceState rejects invalid transitions (IDLE -> WAVE_2_RUNNING throws)
    - Test 8: readProgress returns null for non-existent ticker
    - Test 9: deleteProgress removes the progress file
  </behavior>
  <action>
    **1. Create src/engines/progressState.js:**

    ```javascript
    // Generation State Persistence
    // Manages .thes1s/reports/{TICKER}/progress.json for crash recovery and progress tracking
    ```

    Import ProgressSchema and createInitialProgress from src/schemas/progress.js.
    Import fs (mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync) and path (join).

    **Constants:**
    ```javascript
    const THES1S_DIR = join(process.cwd(), '.thes1s');
    const REPORTS_DIR = join(THES1S_DIR, 'reports');
    ```

    **getProgressPath(ticker):**
    Returns `join(REPORTS_DIR, ticker.toUpperCase(), 'progress.json')`

    **getSectionsDir(ticker):**
    Returns `join(REPORTS_DIR, ticker.toUpperCase(), 'sections')`

    **createProgress(ticker, stage):**
    - Import sectionKeys from dispatch-table.json or hardcode the mapping:
      ```javascript
      const SECTION_KEYS = {
        onePager: ["company_info", "minimum_standards", "meaning", "growth_metrics", "valuation_summary", "overall_verdict"],
        pitchDeck: ["radar", "simple_predictable", "market_position", "barriers_moats", "fcf", "management", "roe_roic_debt", "balance_sheet", "pest", "valuation"],
        fullStory: ["event_analysis", "meaning_checklist", "moat_checklist", "management_checklist", "valuation_confirmation", "inversion_rebuttal", "trading_strategy", "pace_plan"],
      };
      ```
    - Call createInitialProgress(ticker, stage, SECTION_KEYS[stage]) from the schema module
    - Create the directory: mkdirSync(dirname(progressPath), { recursive: true })
    - Write the progress JSON
    - Return the progress object

    **readProgress(ticker):**
    - Read from getProgressPath(ticker)
    - If file doesn't exist, return null
    - Parse JSON, validate with ProgressSchema.safeParse()
    - If validation fails, log warning and return null
    - Return the validated progress object

    **writeProgress(ticker, progress):**
    - Validate with ProgressSchema.safeParse(progress)
    - If invalid, throw Error with validation details
    - mkdirSync for the directory if needed
    - writeFileSync the JSON with 2-space indent

    **updateSectionStatus(ticker, sectionKey, status, metadata = {}):**
    - Read current progress
    - Update sections[sectionKey] = { status, ...metadata }
    - Update lastUpdated to current ISO timestamp
    - Write back
    - Return updated progress

    **advanceState(ticker, newState):**
    - Read current progress
    - Validate state transition (define valid transitions):
      ```javascript
      const VALID_TRANSITIONS = {
        IDLE: ["DATA_ASSEMBLY"],
        DATA_ASSEMBLY: ["PRIMARY_SOURCE_READING", "WAVE_1_RUNNING"],
        PRIMARY_SOURCE_READING: ["WAVE_1_RUNNING"],
        WAVE_1_RUNNING: ["CHECKPOINT_1", "WAVE_2_RUNNING"],
        CHECKPOINT_1: ["WAVE_2_RUNNING"],
        WAVE_2_RUNNING: ["CHECKPOINT_2", "WAVE_3_RUNNING"],
        CHECKPOINT_2: ["WAVE_3_RUNNING"],
        WAVE_3_RUNNING: ["CHECKPOINT_3", "SYNTHESIS"],
        CHECKPOINT_3: ["SYNTHESIS"],
        SYNTHESIS: ["QUALITY_CHECK"],
        QUALITY_CHECK: ["COMPLETE"],
        COMPLETE: [],
      };
      ```
    - If transition invalid, throw Error: `Invalid state transition: ${currentState} -> ${newState}`
    - Update state and lastUpdated
    - Write back
    - Return updated progress

    **deleteProgress(ticker):**
    - Delete the progress.json file if it exists
    - Do not delete sections/ directory (section data preserved)

    **saveSectionOutput(ticker, sectionKey, sectionData):**
    - Write section JSON to .thes1s/reports/{TICKER}/sections/{sectionKey}.json
    - Create directory if needed
    - This enables crash recovery — completed sections persisted independently

    **readSectionOutput(ticker, sectionKey):**
    - Read and parse the section JSON
    - Return null if doesn't exist

    **2. Add .thes1s/ to .gitignore:**
    Append `.thes1s/` to the project .gitignore (generation artifacts should not be committed).

    **3. Create tests (src/engines/__tests__/progressState.test.js):**

    Use a temp directory for test isolation (avoid polluting the real .thes1s/ directory):
    - In beforeAll, set an environment variable or override the base path
    - Actually, since the module uses process.cwd(), use a vitest mock or create a test helper

    Simpler approach: Create progress for a test ticker like "__TEST_TICKER__" and clean up in afterAll with deleteProgress + rmdir.

    Tests:
    1. createProgress("__TEST__", "pitchDeck") — returns object with state "IDLE", 10 sections all "pending"
    2. readProgress("__TEST__") — returns the same object
    3. updateSectionStatus("__TEST__", "radar", "running") — radar status becomes "running"
    4. updateSectionStatus("__TEST__", "radar", "complete", { agentRole: "business-analyst", tokenCost: { input: 5000, output: 1200 } }) — metadata preserved
    5. advanceState("__TEST__", "DATA_ASSEMBLY") — state changes to DATA_ASSEMBLY
    6. advanceState("__TEST__", "WAVE_2_RUNNING") — throws (invalid: DATA_ASSEMBLY -> WAVE_2_RUNNING)
    7. readProgress("NONEXISTENT") — returns null
    8. deleteProgress("__TEST__") — file removed, readProgress returns null
    9. saveSectionOutput("__TEST__", "radar", { key: "radar", data: "test" }) — writes file
    10. readSectionOutput("__TEST__", "radar") — reads back the same data

    Clean up in afterAll: remove __TEST__ directory from .thes1s/reports/
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run src/engines/__tests__/progressState.test.js --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - src/engines/progressState.js exists and exports: createProgress, readProgress, writeProgress, updateSectionStatus, advanceState, deleteProgress, saveSectionOutput, readSectionOutput
    - VALID_TRANSITIONS object prevents invalid state jumps (IDLE cannot go to WAVE_2_RUNNING)
    - .gitignore contains ".thes1s/" entry
    - Tests verify round-trip persistence (create -> read returns same data)
    - Tests verify state transition validation (invalid transition throws)
    - Tests verify section status updates persist
    - `npx vitest run src/engines/__tests__/progressState.test.js` exits with code 0
    - Test cleanup removes __TEST__ artifacts (no leftover files)
  </acceptance_criteria>
  <done>State persistence module enables crash-resilient generation with validated state machine transitions and per-section output caching</done>
</task>

</tasks>

<verification>
1. `npx vitest run src/engines/__tests__/progressState.test.js agents/__tests__/agentDefinitions.test.js --reporter=verbose` — all tests pass (agentDefinitions test updated to expect 10 agents including orchestrator)
2. `cat agents/orchestrator/dispatch-table.json | python3 -m json.tool` — valid JSON
3. `cat agents/orchestrator/config.json | grep "rule-1-workflow"` — correct curriculum path
4. `npm test -- --run` — existing tests still pass
5. `grep '.thes1s/' .gitignore` — entry exists
</verification>

<success_criteria>
- Orchestrator config.json has section-to-agent mapping for all 3 stages
- Orchestrator curriculum path is knowledge/research-references/rule-1-workflow.md (verified to exist)
- Dispatch table specifies exact phase groupings, parallelism, and checkpoint positions
- progressState.js provides full CRUD for generation state with validation
- State machine transitions are enforced — invalid transitions throw
- Section outputs persist independently for crash recovery
- .thes1s/ is gitignored
- agentDefinitions test updated to expect 10 agents (including orchestrator)
- All tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/05A-agent-definitions-foundation/05A-05-SUMMARY.md`
</output>
