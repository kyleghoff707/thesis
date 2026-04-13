# Phase 14: Adversarial Debate - Research

**Researched:** 2026-03-30
**Domain:** CC Skill orchestration -- sequential multi-agent debate with inter-step context passing, checkpoint UX, and re-run support
**Confidence:** HIGH

## Summary

Phase 14 implements the 4-step adversarial debate (Bull, Bear, Bull Rebuttal, Judge) plus a 5th synthesis-writer composition call that produces the final S6 (inversion_rebuttal) section in the Full Story pipeline. All foundational pieces are already built: the debate-step.schema.json defines all 4 step output formats, the dispatch-table.json has the debate configured as fullStory.phases[1] with sequential=true and agent/role/webSearch assignments, and all 4 agent prompts already contain complete debate-specific instructions (synthesis-writer lines ~393-468, risk-analyst lines ~650-713, financial-analyst lines ~706-775). The Phase 13 Full Story SKILL.md has a clearly marked Step 8 placeholder ready for implementation.

The core challenge is orchestrating 5 sequential agent calls where each step receives the prior step's output as context, then implementing a debate checkpoint (Step 9) with re-run-from-any-step capability (D-06) including PM guidance text and optional file attachments (D-07). The final synthesis-writer call (D-08) composes all 4 debate outputs into the dual-view S6 ReportSectionSchema section.

**Primary recommendation:** Replace the Step 8 placeholder in generate-full-story/SKILL.md with sequential debate dispatch instructions, add Step 9 debate checkpoint with re-run support, and update Step 7 report assembly to include the composed S6 section. All agent prompts and schemas are already built -- this phase is pure orchestration logic in the CC skill.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: S6 uses a dual-view format -- verdict summary table at top for quick scanning, full exchange-by-exchange detail below for the deep read. PM gets both views in one section.
- D-02: The verdict summary table shows: exchange number, topic, verdict (Strong Bull / Strong Bear / Unresolved), plus overall direction and unresolved count.
- D-03: Each exchange below the summary shows the full back-and-forth: Bull point -> Bear counter -> Bull rebuttal -> Judge verdict, with all citations inline.
- D-04: Bull produces 5+ thesis points from S1-S5 findings. Bear attacks each one AND adds 1-2 new attack vectors the Bull didn't address. Bull Rebuttal must address ALL points including Bear's additions. Judge scores all exchanges. Typical range: 6-9 exchanges.
- D-05: After all 4 debate steps complete, PM sees a checkpoint with: Judge's overall verdict, unresolved count, and a summary table of all exchanges (topic / verdict). PM can type an exchange number to see full detail.
- D-06: PM can re-run from any step forward -- re-running from Bear also re-runs Bull Rebuttal and Judge (downstream steps depend on upstream). Re-running just Judge re-runs only the Judge.
- D-07: PM can provide guidance text AND optional file attachments when requesting a re-run. Guidance gets injected into the re-run prompt. File content becomes additional context for the agent.
- D-08: After the 4 debate steps + Judge verdict, a 5th synthesis-writer call composes the final S6 narrative. This is a separate call from the bull/bull_rebuttal steps.
- D-09: The Judge stays focused on objective scoring only. Narrative composition is a presentation task, not a judgment task.
- D-10: Total S6 cost: 5 agent calls (bull + bear + bull_rebuttal + judge + composition). Estimated ~$2-3 for S6 alone.
- D-11: Bear operates with an activist short seller mindset -- plays to WIN, not to be fair.
- D-12: Bear performs 1+ targeted web search per bull thesis point plus 1-2 broad searches for risks the bull didn't mention. Typical total: 7-10 searches per debate.
- D-13: Bear's web search citations carry through to the final S6 narrative with full clickable URLs.
- Debate executes strictly sequentially: Bull -> Bear -> Bull Rebuttal -> Judge (Phase 12, D-09)
- Only Bear has web search enabled (Phase 12, D-07)
- 4 lightweight debate outputs compose into final S6 ReportSectionSchema (Phase 12, D-08)
- Role assignments: synthesis-writer=bull, risk-analyst=bear, synthesis-writer=bull_rebuttal, financial-analyst=judge (Phase 12, D-12)
- All debate schemas, dispatch config, and agent prompts already built in Phase 12
- Full Story skill placeholder at Step 8 ready for implementation (Phase 13)
- One dispatch = one section = one ReportSectionSchema object (Phase 10)
- DataPacket is primary data source -- tools are supplementary (Phase 10)
- Two-pass agent pattern (prose first, structured output second) is mandatory (Phase 9)

### Claude's Discretion
- Internal state management for tracking debate step progress and enabling re-runs from any step
- How PM guidance text and file attachments are injected into re-run prompts
- Error handling and retry logic for individual debate steps
- How the synthesis-writer composition prompt is structured to produce the dual-view format
- Token budget allocation across the 5 agent calls

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEBATE-01 | 4-step debate executes sequentially -- Bull thesis, Bear inversion, Bull rebuttal, Judge scoring | Dispatch table already defines steps 1-4 with sequential=true and receivesContext chains. SKILL.md Step 8 placeholder ready for replacement. All agent prompts contain step-specific instructions. |
| DEBATE-02 | Every bear inversion includes evidence-backed counter-argument (web search + DataPacket citations) | Risk-analyst prompt (lines 650-713) already instructs the bear to search aggressively with 1+ search per bull point plus broad searches. The agent inherits WebSearch/WebFetch tools in CC subagent context. Bear schema has sources array for URLs. |
| DEBATE-03 | Bull rebuttal responds to each bear point with cited evidence; weak rebuttals acknowledged honestly | Synthesis-writer prompt (lines 431-468) already defines rebuttal format with rebuttalStrength (strong/moderate/weak) and honest boolean. Schema requires bearPoint + rebuttal + rebuttalStrength + honest per entry. |
| DEBATE-04 | Judge scores each exchange (Strong/Weak/Unresolved) and produces overall summary with unresolved risk count | Financial-analyst prompt (lines 706-775) already defines scoring rules, verdict logic (Strong Bull / Strong Bear / Unresolved), and overall verdict format with direction + unresolvedCount + summary + investmentImplication. |
</phase_requirements>

## Standard Stack

No new libraries needed. This phase is entirely CC skill orchestration logic -- editing SKILL.md instructions that Claude Code follows as a script. All tools and dependencies are already available in the existing infrastructure.

### Core (Already Available)
| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| Debate step schema | `agents/orchestrator/schemas/debate-step.schema.json` | Output format for all 4 debate steps | Built (Phase 12) |
| Dispatch table | `agents/orchestrator/dispatch-table.json` | fullStory.phases[1] debate config | Built (Phase 12) |
| Synthesis-writer prompt | `agents/synthesis-writer/prompt.md` lines ~393-468 | Bull thesis + Bull rebuttal instructions | Built (Phase 12) |
| Risk-analyst prompt | `agents/risk-analyst/prompt.md` lines ~650-713 | Bear inversion instructions with web search | Built (Phase 12) |
| Financial-analyst prompt | `agents/financial-analyst/prompt.md` lines ~706-775 | Judge verdict scoring instructions | Built (Phase 12) |
| ReportSectionSchema | `src/schemas/reportSection.js` | Final S6 section output format | Built (Phase 7) |
| Full Story SKILL.md | `.claude/skills/generate-full-story/SKILL.md` | Step 8 placeholder for debate | Built (Phase 13) |
| Generate Section skill | `.claude/skills/generate-section/SKILL.md` | Single-section re-run pattern | Built (Phase 13) |
| Progress state | `src/engines/progressState.js` | Section tracking with fullStory sectionKeys | Built (Phase 13) |

## Architecture Patterns

### Debate Orchestration Flow

The debate is Phase 2 of the Full Story pipeline (fullStory.phases[1] in the dispatch table). It runs after the Step 6 checkpoint approves S1-S5. The flow is:

```
Step 8: THE DEBATE (5 sequential agent calls)
  8a: Bull Thesis (synthesis-writer)
      Input:  All S1-S5 section outputs + DataPacket
      Output: debate-step-1.json (thesisPoints + overallThesis)

  8b: Bear Inversion (risk-analyst) [WEB SEARCH ENABLED]
      Input:  debate-step-1.json + DataPacket
      Output: debate-step-2.json (inversions with sources + overallBearCase)

  8c: Bull Rebuttal (synthesis-writer)
      Input:  debate-step-1.json + debate-step-2.json + S1-S5 outputs
      Output: debate-step-3.json (rebuttals with strength ratings)

  8d: Judge Verdict (financial-analyst)
      Input:  debate-step-1.json + debate-step-2.json + debate-step-3.json + S1-S5 outputs
      Output: debate-step-4.json (exchanges with verdicts + overallVerdict)

  8e: Composition (synthesis-writer)
      Input:  All 4 debate-step-*.json files + S1-S5 summaries
      Output: fullStory-S6-inversion_rebuttal.json (ReportSectionSchema)

Step 9: DEBATE CHECKPOINT
  Present Judge verdict + summary table
  PM dialogue loop: view exchanges, re-run from any step, provide files
  "continue" -> proceed to report assembly update
```

### File Layout (Intermediate + Final)

```
.thes1s/reports/{TICKER}/
  sections/
    fullStory-S1-event_analysis.json        (existing from Phase 13)
    fullStory-S2-meaning_checklist.json      (existing from Phase 13)
    fullStory-S3-moat_checklist.json         (existing from Phase 13)
    fullStory-S4-management_checklist.json   (existing from Phase 13)
    fullStory-S5-valuation_confirmation.json (existing from Phase 13)
    fullStory-S6-inversion_rebuttal.json     (NEW -- final composed S6)
    debate-step-1.json                       (NEW -- Bull thesis)
    debate-step-2.json                       (NEW -- Bear inversion)
    debate-step-3.json                       (NEW -- Bull rebuttal)
    debate-step-4.json                       (NEW -- Judge verdict)
  full-story.json                            (UPDATED -- status: complete, 6/6 sections)
  full-story.md                              (UPDATED -- includes S6 narrative)
```

### Pattern 1: Sequential Dispatch with Context Accumulation

Each debate step receives all prior step outputs as context, following the receivesContext specification in the dispatch table:

```
Step 1 (bull):           receives S1-S5 section outputs
Step 2 (bear):           receives debate-step-1.json
Step 3 (bull_rebuttal):  receives debate-step-1.json + debate-step-2.json
Step 4 (judge):          receives debate-step-1.json + debate-step-2.json + debate-step-3.json
Step 5 (composition):    receives all 4 debate step files
```

Each step's prompt is constructed by:
1. Reading the agent's prompt.md (already contains debate-specific instructions)
2. Reading the agent's curriculum files and universal context
3. Including the DataPacket slice for the agent
4. Appending the accumulated debate context (prior step outputs)
5. Including the ReportSectionSchema (composition step only)
6. Including the debate-step.schema.json definition for the step's role

**Debate context injection format:**
```
## Prior Debate Steps

### Step 1: Bull Thesis
{JSON content of debate-step-1.json}

### Step 2: Bear Inversion
{JSON content of debate-step-2.json}

### Step 3: Bull Rebuttal
{JSON content of debate-step-3.json}
```

### Pattern 2: Debate Re-Run with Cascade

The re-run logic must cascade downstream: re-running step N also re-runs all steps > N because they depend on step N's output. This is the critical complexity of the debate re-run pattern.

**Re-run cascade rules (from D-06):**
| Re-run from | Also re-runs | Steps executed |
|-------------|--------------|----------------|
| Bull (step 1) | Bear + Bull Rebuttal + Judge + Composition | 5 calls |
| Bear (step 2) | Bull Rebuttal + Judge + Composition | 4 calls |
| Bull Rebuttal (step 3) | Judge + Composition | 3 calls |
| Judge (step 4) | Composition only | 2 calls |
| Composition (step 5) | Nothing | 1 call |

**Re-run prompt injection (D-07):**
When PM requests a re-run with guidance and/or file attachments:
```
## PM RE-RUN GUIDANCE

The Portfolio Manager has requested this debate step be re-run with the following direction:

{PM guidance text}

## PM-PROVIDED SOURCE MATERIAL

{File contents read from the provided path(s)}

Incorporate this guidance and source material into your analysis. The PM has
specifically chosen to provide this -- it overrides your default research scope
for this step.
```

### Pattern 3: Dual-View S6 Composition

The 5th agent call (synthesis-writer in composition mode) receives all 4 debate step outputs and produces a ReportSectionSchema-conformant S6 section with a dual-view format:

**S6 narrative structure (D-01, D-02, D-03):**
```markdown
## Verdict Summary

| # | Topic | Verdict | Bull Strength | Bear Strength |
|---|-------|---------|---------------|---------------|
| 1 | {topic} | Strong Bull | strong | weak |
| 2 | {topic} | Strong Bear | moderate | strong |
...

**Overall Direction:** {Bull/Bear/Mixed}
**Unresolved Risks:** {count}
**Investment Implication:** {one-liner from Judge}

---

## Exchange Detail

### Exchange 1: {topic}

**Bull:** {thesis point with evidence and source section}

**Bear:** {counter-argument with cited evidence}
Sources: {URLs from bear's sources array}

**Bull Rebuttal:** {rebuttal} (Strength: {rating})
{If honest=true: "Note: The bull acknowledges this bear point as stronger."}

**Judge Verdict:** {verdict} -- {reasoning}

---

### Exchange 2: {topic}
...
```

The composition prompt must instruct the synthesis-writer to:
1. Build the summary table from Judge's exchanges array
2. Build the exchange detail from all 4 step outputs matched by topic
3. Ensure all bear citation URLs are preserved as clickable links
4. Set the section's `verdict` based on Judge's overallVerdict.direction:
   - Bull -> PASS
   - Bear -> FAIL
   - Mixed -> WATCHLIST (or PASS/FAIL depending on unresolvedCount per prompt's verdict logic)

### Pattern 4: Debate Checkpoint (Step 9)

The debate checkpoint presents results in a compact format (D-05):

```
================================================================
  DEBATE CHECKPOINT: Inversion & Rebuttal
================================================================

Overall Verdict: {direction} ({unresolvedCount} unresolved risks)
Investment Implication: {investmentImplication}

Exchange Summary:
  #1 {topic}: {verdict}
  #2 {topic}: {verdict}
  ...

================================================================
```

PM dialogue loop commands:
- **Number (e.g., "1" or "exchange 3"):** Show full detail for that exchange
- **"re-run from bull":** Re-run from step 1 (all 5 steps)
- **"re-run from bear":** Re-run from step 2 (4 steps)
- **"re-run from rebuttal":** Re-run from step 3 (3 steps)
- **"re-run judge":** Re-run from step 4 (2 steps: judge + composition)
- **"re-run composition":** Re-run just step 5 (1 step)
- **With guidance:** "re-run from bear: focus on regulatory risk from the recent FDA warning letter"
- **With file:** "re-run from bear with file: /path/to/short-seller-report.pdf"
- **"continue":** Accept debate results and advance to report assembly

### Pattern 5: Report Assembly Update

After debate checkpoint approval, Step 7 (report assembly) needs updating:
1. Read the composed S6 section from `fullStory-S6-inversion_rebuttal.json`
2. Insert S6 into the sections array of `full-story.json`
3. Update status from "partial" to "complete" and completedSections from 5 to 6
4. Remove the `pendingPhase` field
5. Derive `overallVerdict` from the 6 sections' verdicts (logic TBD -- likely majority-based or weighted)
6. Update `full-story.md` to include the S6 narrative in the markdown report

### Anti-Patterns to Avoid
- **Running debate steps in parallel:** The dispatch table specifies sequential=true. Each step depends on prior output. Parallel execution would produce empty/wrong results.
- **Giving all debate agents web search:** Only the Bear (risk-analyst, step 2) has webSearch=true. Bull, Bull Rebuttal, and Judge work from existing findings.
- **Merging Judge and composition:** D-09 explicitly separates scoring (Judge) from narrative composition (synthesis-writer). Combining them would compromise Judge impartiality.
- **Skipping intermediate file saves:** Each debate step output must be saved to `debate-step-{N}.json` immediately after completion. This enables re-run-from-any-step without regenerating earlier steps.
- **Using ReportSectionSchema for intermediate steps:** Only the final composed S6 uses ReportSectionSchema. The 4 debate steps use the lightweight debate-step.schema.json format.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debate step schema validation | Custom JSON validators | Validate against debate-step.schema.json structure manually (check required fields) | Schema already defines all field types and enums |
| Agent prompt construction | New prompt assembly logic | Follow exact same pattern from Phase 13 Step 5 (agent prompt + curriculum + DataPacket slice + context) | Consistency with existing pipeline |
| Section re-run | Custom re-run logic | Extend the existing checkpoint dialogue pattern from generate-full-story Step 6 | Consistent PM experience |
| Progress tracking | New state system | Use existing progressState.js (already has fullStory sectionKeys including inversion_rebuttal) | Already built and tested |

## Common Pitfalls

### Pitfall 1: Debate Context Grows Large
**What goes wrong:** By step 4 (Judge), the context includes all 3 prior step outputs plus S1-S5 sections. This could exceed agent context limits or degrade quality from context overload.
**Why it happens:** Each debate step is a full JSON object with arrays of thesis points, inversions, rebuttals, and their evidence.
**How to avoid:** For steps 3 and 4, include full debate step outputs but only summaries of S1-S5 sections (verdict + summary + red flags, not full narrative). The debate steps themselves ARE the relevant context. Estimate: Bull (~2KB) + Bear (~5KB with sources) + Rebuttal (~3KB) + Judge (~3KB) = ~13KB of debate context, well within limits.
**Warning signs:** Agent responses that seem to ignore earlier debate points or repeat S1-S5 findings instead of engaging with the debate.

### Pitfall 2: Bear Web Search Budget Insufficient
**What goes wrong:** D-12 specifies 7-10 searches per debate, but the Bear agent might not execute enough searches if the prompt doesn't emphasize the minimum.
**Why it happens:** CC subagents may conserve tool calls unless explicitly instructed to search aggressively.
**How to avoid:** The risk-analyst prompt already says "Use it aggressively" and specifies search patterns (lines 706-711). The CC dispatch should include an explicit instruction like: "You MUST perform at least 1 targeted web search per bull thesis point being attacked, PLUS 1-2 broad searches. This is a minimum, not a guideline."
**Warning signs:** Bear output with fewer than 5 entries in the sources arrays, or generic "risks" without URL citations.

### Pitfall 3: File Attachment Handling on Re-Run
**What goes wrong:** PM provides a file path for a re-run (D-07), but the CC skill doesn't read the file content before injecting it into the prompt.
**Why it happens:** The skill script must explicitly read the file using the Read tool before appending its content to the re-run prompt. A file path alone is useless to the subagent.
**How to avoid:** When PM says "re-run from bear with file: /path/to/report.pdf", the skill must: (1) Read the file content, (2) Include the full content in the prompt under "PM-PROVIDED SOURCE MATERIAL", (3) Re-dispatch from the specified step with cascade.
**Warning signs:** Agent output that doesn't reference the provided source material at all.

### Pitfall 4: Composition Step Loses Bear Citations
**What goes wrong:** The final S6 narrative omits or mangles the Bear's web search URLs (D-13 requires full clickable URLs).
**Why it happens:** The synthesis-writer composing S6 may summarize or paraphrase bear points, dropping the specific sources array.
**How to avoid:** The composition prompt must explicitly instruct: "For every bear inversion, include the FULL URLs from the bear's sources array. These must appear as clickable links in the narrative. The PM will one-click verify these -- never drop a URL." Also validate the output: count URLs in S6 narrative vs URLs in debate-step-2.json sources arrays.
**Warning signs:** S6 narrative with no URLs or only DataPacket references.

### Pitfall 5: Report Assembly Overwrites Rather Than Extends
**What goes wrong:** After the debate, report assembly creates a new full-story.json instead of inserting S6 into the existing one.
**Why it happens:** The current Step 7 assembles 5 sections. Phase 14 needs to either re-run Step 7 with 6 sections or append S6 to the existing report.
**How to avoid:** After debate checkpoint approval, the SKILL.md should: (1) Read existing full-story.json, (2) Insert S6 into the sections array, (3) Update status/completedSections/overallVerdict fields, (4) Write back. Not rebuild from scratch.
**Warning signs:** full-story.json with only S6, or missing checklist scores from S2-S4.

### Pitfall 6: CC Skill Step Numbering Confusion
**What goes wrong:** Adding Steps 8 and 9 (debate + checkpoint) disrupts the existing Step 7 (report assembly). The report assembly logic needs to run both after Step 6 checkpoint (partial, 5/6 sections) and after Step 9 checkpoint (complete, 6/6 sections).
**Why it happens:** Step 7 currently produces a "partial" report. After the debate, a second report assembly pass is needed to produce the "complete" report.
**How to avoid:** Structure as: Step 7 = partial assembly (existing), Step 8 = debate, Step 9 = debate checkpoint, Step 10 = final assembly update (insert S6 + update status). Or alternatively, modify Step 7 to be "assemble whatever sections exist" and run it after both checkpoints.
**Warning signs:** SKILL.md with unclear step ordering or duplicate assembly logic.

## Code Examples

### Debate Step Dispatch (CC Skill Pattern)

For each debate step, the SKILL.md instructs Claude Code to dispatch a subagent. Here is the pattern for step 2 (Bear) as it would appear in the SKILL.md:

```
### Step 8b: Bear Inversion (risk-analyst) [WEB SEARCH ENABLED]

Read debate-step-1.json:
- Read `.thes1s/reports/{TICKER}/sections/debate-step-1.json`
- Extract the thesisPoints array -- these are the specific targets the Bear will attack

Read the risk-analyst agent configuration:
1. `agents/risk-analyst/config.json` -- model, curriculum, dataPacketSlice, tools
2. `agents/risk-analyst/prompt.md` -- full agent prompt (includes Bear Inversion instructions)
3. Each curriculum file listed in config
4. Universal context files (rule-one-fundamentals.md, tools-for-analysis.md)

Build the bear dispatch prompt:
1. Agent prompt.md (system)
2. DataPacket slice (from risk-analyst config -- companyInfo, events, analystEstimates, classification)
3. Curriculum files
4. Universal context files
5. Bull thesis context:
   ```
   ## Bull Thesis (Step 1 Output -- YOUR TARGET)

   The synthesis-writer produced the following bull case for {TICKER}.
   Your job is to demolish every point with cited evidence.

   {JSON content of debate-step-1.json}
   ```
6. debate-step.schema.json definition for BearInversion role

Task instruction: "You are the BEAR in the adversarial debate for {TICKER}. Attack every
bull thesis point with web-searched, cited evidence. Add 1-2 new attack vectors the bull
conveniently omitted. Output a JSON object matching the BearInversion format. You MUST
perform at least 1 web search per bull thesis point plus 1-2 broad searches."

Dispatch via Agent tool. The risk-analyst inherits WebSearch and WebFetch tools.

After completion:
1. Extract JSON from response (look for ```json block or raw JSON object)
2. Validate required fields: step=2, role="bear", agent="risk-analyst",
   content.inversions (array, non-empty), content.overallBearCase (string)
3. Verify each inversion has: targetPoint, counterArgument, evidence, severity, sources
4. Save to `.thes1s/reports/{TICKER}/sections/debate-step-2.json`

Log:
  Step 8b: Bear Inversion complete
    Inversions: {count} (attacking {bull_point_count} bull points + {new_count} new vectors)
    Thesis killers: {count matching severity=thesis_killer}
    Web searches: {estimated from sources array length}
    Sources cited: {total unique URLs across all inversions}
```

### Composition Step Prompt Structure

The 5th agent call (synthesis-writer for composition) needs a specific prompt to produce the dual-view S6 format:

```
## Composition Task

You are composing the final Inversion & Rebuttal section (S6) of the Full Story for {TICKER}.

You receive the complete output from all 4 debate steps. Your job is to compose these into
a single ReportSectionSchema section with a DUAL-VIEW narrative format:

### View 1: Verdict Summary Table (TOP of narrative)

Create a markdown table with columns: #, Topic, Verdict, Bull Strength, Bear Strength
Populate from the Judge's exchanges array. Add a summary row with:
- Overall Direction: {from judge.overallVerdict.direction}
- Unresolved Risks: {from judge.overallVerdict.unresolvedCount}
- Investment Implication: {from judge.overallVerdict.investmentImplication}

### View 2: Exchange Detail (BELOW the table)

For each exchange (matched across all 4 debate steps by topic):
1. Bull: The thesis point with evidence and source section
2. Bear: The counter-argument with ALL URLs from the bear's sources array (CLICKABLE LINKS)
3. Bull Rebuttal: The rebuttal text with strength rating. If honest=true, note it explicitly.
4. Judge: The verdict and reasoning

### Section-Level Fields

- key: "inversion_rebuttal"
- sectionNumber: 6
- verdict: {derive from Judge's overallVerdict -- Bull->PASS, Bear->FAIL, Mixed->WATCHLIST}
- verdictRationale: {from judge.overallVerdict.summary, condensed}
- confidence: {derive from unresolved count -- 0-1 unresolved=HIGH, 2-3=MEDIUM, 4+=LOW}
- summary: 1-2 sentence summary of debate outcome
- redFlags: Extract from bear inversions with severity=thesis_killer or significant
- citations: Merge all bear source URLs + DataPacket references from all steps
- searchesPerformed: Copy from bear's implied searches (reconstruct from sources)
```

### Debate Checkpoint Display

```
================================================================
  DEBATE CHECKPOINT: Inversion & Rebuttal (S6)
================================================================

Overall Verdict: {direction} ({unresolvedCount} unresolved risks)
Investment Implication: {investmentImplication}

--- Exchange Summary ---

  #1 {topic}: {verdict}
  #2 {topic}: {verdict}
  #3 {topic}: {verdict}
  #4 {topic}: {verdict}
  #5 {topic}: {verdict}
  #6 {topic}: {verdict}

--- Debate Cost ---
  Bull: {token estimate}
  Bear: {token estimate}
  Rebuttal: {token estimate}
  Judge: {token estimate}
  Composition: {token estimate}
  Total S6: {sum}

================================================================

Review the debate results. You can:
  - Type an exchange number (e.g., "3") to see the full exchange detail
  - Say "re-run from bull" to restart the entire debate
  - Say "re-run from bear" to re-run bear + rebuttal + judge + composition
  - Say "re-run from rebuttal" to re-run rebuttal + judge + composition
  - Say "re-run judge" to re-run judge + composition
  - Add guidance: "re-run from bear: focus on tariff risk and supply chain"
  - Add a file: "re-run from bear with file: ~/Desktop/short-report.pdf"
  - Say "continue" to accept and assemble the final report
  - Say "stop" to pause (debate step files are already saved)

Your input:
```

### Re-Run Cascade Logic

```
Parse PM re-run request:
  - Extract target step: "bull" -> 1, "bear" -> 2, "rebuttal" -> 3, "judge" -> 4, "composition" -> 5
  - Extract optional guidance: text after ":"
  - Extract optional file path: text after "with file:"

If file path provided:
  - Read file content using Read tool
  - Store as pmSourceMaterial

Steps to execute: range from target step to 5 (composition)

For each step in execution range:
  - Load the agent config for this step's agent
  - Build prompt with:
    - Agent prompt.md + curriculum + DataPacket slice
    - All prior debate step files (read from disk -- some may be from previous run)
    - PM guidance (if provided and this is the targeted step)
    - PM source material (if provided and this is the targeted step)
  - Dispatch agent
  - Validate output
  - Save to debate-step-{N}.json (overwrites previous)
  - Log progress

After all steps in range complete:
  - Re-compose S6 (if composition was in range, this already happened)
  - Re-display the debate checkpoint with updated results
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-pass risk section | Multi-agent adversarial debate | Phase 12 (D-06 through D-12) | 4-step debate produces deeper risk analysis than a single risk-analyst pass |
| Monolithic section generation | Lightweight intermediate steps + composition | Phase 12 (D-08) | Debate steps are cheap/fast; composition produces the polished output |
| Fixed pipeline (no re-runs) | Re-run from any step with cascade | Phase 14 (D-06) | PM can iterate on specific debate quality issues without full pipeline re-run |

## Open Questions

1. **Overall Verdict Derivation After S6**
   - What we know: S6 (inversion_rebuttal) verdict is derived from Judge's overall direction (Bull->PASS, Bear->FAIL, Mixed->WATCHLIST). The full-story.json overallVerdict is currently null.
   - What's unclear: How should the Full Story overallVerdict be derived from all 6 sections? Is it majority-rules across S1-S6 verdicts, or is S6 weighted more heavily as the "final test"?
   - Recommendation: Use the Judge's verdict logic already defined in the prompt: PASS if Bull direction with 0-2 unresolved, FAIL if Bear direction or 4+ unresolved or any thesis_killer survived, WATCHLIST if Mixed with 3 unresolved. This is the Full Story overallVerdict -- the debate IS the final conviction gate.

2. **Token Budget for Bear's Web Searches**
   - What we know: Bear needs 7-10 web searches (D-12). Each WebSearch call returns results that consume input tokens. The CC subagent has implicit limits.
   - What's unclear: Whether a CC subagent will reliably execute 7-10 web searches before producing its output, or if it will shortcut to fewer searches.
   - Recommendation: Include an explicit minimum instruction in the dispatch ("You MUST perform at minimum 7 web searches") and validate the output by checking sources arrays. If total unique URLs < 5, flag at the checkpoint.

3. **How Composition Step Matches Topics Across Steps**
   - What we know: Bull produces thesisPoints, Bear produces inversions (with targetPoint), Rebuttal addresses each bearPoint, Judge scores by topic.
   - What's unclear: The topics may not be identical strings across steps. The composition step needs to correlate them.
   - Recommendation: Match by position (exchange #1 = bull point #1 = bear inversion #1 = rebuttal #1 = judge exchange #1) for points that directly correspond. Bear's "new attack vectors" (1-2 extras per D-04) are appended at the end with no corresponding bull thesis point. The composition prompt should handle both cases.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | implicit (vitest auto-detects from `package.json`) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEBATE-01 | 4 debate steps execute sequentially with context passing | manual-only | N/A -- CC skill orchestration, verified by pipeline run | N/A |
| DEBATE-02 | Bear inversions have web search citations and DataPacket refs | manual-only | N/A -- verify by inspecting debate-step-2.json sources arrays | N/A |
| DEBATE-03 | Bull rebuttal addresses each bear point with honest acknowledgment | manual-only | N/A -- verify by inspecting debate-step-3.json rebuttals array | N/A |
| DEBATE-04 | Judge produces verdict per exchange + overall summary with unresolved count | manual-only | N/A -- verify by inspecting debate-step-4.json exchanges + overallVerdict | N/A |

**Justification for manual-only:** This phase modifies a CC skill (SKILL.md) -- a markdown script that Claude Code follows step by step. The debate is executed by dispatching Claude subagents, not by running unit-testable code. Validation requires running the full pipeline against a real ticker and inspecting output files. There is no code function to unit test.

### Sampling Rate
- **Per task commit:** `npm test` (ensure no regression in existing 173 tests)
- **Per wave merge:** Full pipeline run: `/generate:full-story {TICKER}` on a ticker with existing Pitch Deck
- **Phase gate:** Inspect debate-step-{1-4}.json files and fullStory-S6-inversion_rebuttal.json for schema conformance, citation presence, and narrative quality

### Wave 0 Gaps
None -- no new test infrastructure needed. This phase produces CC skill instructions, not testable code. Validation is through pipeline execution.

## Sources

### Primary (HIGH confidence)
- `agents/orchestrator/schemas/debate-step.schema.json` -- complete 4-step schema read directly
- `agents/orchestrator/dispatch-table.json` -- fullStory.phases[1] debate config read directly
- `agents/synthesis-writer/prompt.md` -- Bull + Bull Rebuttal instructions read at lines 393-468
- `agents/risk-analyst/prompt.md` -- Bear Inversion instructions read at lines 650-713
- `agents/financial-analyst/prompt.md` -- Judge Verdict instructions read at lines 706-775
- `.claude/skills/generate-full-story/SKILL.md` -- Step 8 placeholder and existing checkpoint pattern
- `.claude/skills/generate-pitch-deck/SKILL.md` -- Checkpoint dialogue loop pattern
- `.claude/skills/generate-section/SKILL.md` -- Section re-run pattern
- `.planning/phases/14-adversarial-debate/14-CONTEXT.md` -- All locked decisions (D-01 through D-13)
- `.planning/phases/12-full-story-foundation/12-CONTEXT.md` -- Debate schema decisions (D-06 through D-12)
- `.planning/phases/13-cc-pipeline/13-CONTEXT.md` -- CC skill architecture decisions
- `knowledge/stage-3-full-story/story-form-II.md` -- Inversion & Rebuttal curriculum (Section 6)

### Secondary (MEDIUM confidence)
- Agent config files (synthesis-writer, risk-analyst, financial-analyst) -- model assignments, tool access, curriculum

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components already built, verified by reading source files directly
- Architecture: HIGH -- orchestration pattern follows established CC skill conventions from Phases 10/13
- Pitfalls: HIGH -- derived from direct analysis of existing code patterns and known CC skill limitations

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- all referenced files are built and tested)
