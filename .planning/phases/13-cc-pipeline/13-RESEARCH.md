# Phase 13: CC Pipeline - Research

**Researched:** 2026-03-29
**Domain:** Claude Code skill orchestration for Full Story generation pipeline
**Confidence:** HIGH

## Summary

Phase 13 builds a new Claude Code skill (`generate-full-story`) that orchestrates 5 sections of the Full Story stage. The architecture is directly modeled on the existing `generate-pitch-deck` SKILL.md, but simpler: no data preparation, no PSR agents, no multi-phase dependencies, and only 1 checkpoint. The core challenge is Pitch Deck inheritance -- reading prior section outputs and mapping them to the correct Full Story agents -- and ensuring checklist sections produce the scored format defined in Phase 12.

The skill reads `pitch-deck.json` as a gate check, loads Pitch Deck section data from `sections/` files for targeted inheritance (D-03, D-04), dispatches 5 agents in parallel (D-02), collects outputs, and presents a checkpoint with checklist scores. S6 (inversion_rebuttal) is a known placeholder until Phase 14 adds the debate.

**Primary recommendation:** Follow the Pitch Deck SKILL.md pattern exactly (gate check, agent config loading, prompt assembly, JSON extraction fallback, narrative recovery, checkpoint dialogue). The only structural differences are: (1) no data prep step, (2) single generation wave instead of 3 phases, (3) Pitch Deck section inheritance replaces PSR findings, (4) checklist scores in checkpoint display.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Phase 13 generates 5 sections: event_analysis (S1), meaning_checklist (S2), moat_checklist (S3), management_checklist (S4), valuation_confirmation (S5). S6 (inversion_rebuttal) is a placeholder -- not generated until Phase 14 adds the debate.
- **D-02:** All 5 sections run in parallel (they are independent deep-dives building on Pitch Deck findings). Single generation wave.
- **D-03:** Each Full Story agent receives the 2-3 Pitch Deck sections most relevant to their assignment as full JSON. Not the entire pitch-deck.json, not compressed summaries. Token-efficient, focused, matches the hedge fund model (analyst reads the prior analysis for their domain).
- **D-04:** Pitch Deck -> Full Story section mapping:
  - S1 event_analysis <- PD S9 (PEST risks) + PD S1 (radar)
  - S2 meaning_checklist <- PD S2 (simple & predictable) + PD S3 (dominance)
  - S3 moat_checklist <- PD S4 (barriers & moats) + PD S3 (dominance)
  - S4 management_checklist <- PD S6 (management) + PD S8 (balance sheet)
  - S5 valuation_confirmation <- PD S5 (FCF) + PD S7 (returns/debt) + PD S10 (valuation)
- **D-05:** The mapping is deterministic from the dispatch table. Agents cite specific findings from their inherited PD sections -- no re-deriving from scratch.
- **D-06:** One checkpoint after the S1-S5 generation wave. PM reviews all 5 section outputs before approving.
- **D-07:** PM can ask questions routed to the specialist who wrote the section (same pattern as Pitch Deck checkpoints). PM can also request section re-runs with additional guidance.
- **D-08:** Phase 14 will add a second checkpoint after the debate (S6). Phase 13's skill structure must accommodate this extension.
- **D-09:** Gate check only -- read `.thes1s/reports/{TICKER}/pitch-deck.json` and verify it exists with an approved verdict. No new DataPacket assembly, no data refresh.
- **D-10:** The existing DataPacket (assembled during Pitch Deck generation) is reused as-is. Full Story agents receive their DataPacket slices from the same file.
- **D-11:** If the gate check fails (no Pitch Deck or unapproved), the skill stops with a clear message directing the user to run the Pitch Deck first.

### Carrying Forward from Prior Phases
- One dispatch = one section = one ReportSectionSchema object (Phase 10)
- DataPacket is primary data source -- tools are supplementary (Phase 10)
- Two-pass agent pattern (prose first, structured output second) is mandatory (Phase 9)
- 6 sections defined in dispatch table, no S7/S8 (Phase 12)
- Checklist format: PASS/FAIL/PARTIAL with evidence per item, scoreDisplay summary (Phase 12)
- Debate schemas defined in Phase 12 -- used by Phase 14, not Phase 13

### Claude's Discretion
- CC skill internal architecture (how the checkpoint loop works, state management)
- Exact Pitch Deck section JSON format when passed to Full Story agents (full ReportSectionSchema or extracted data+narrative)
- How the skill handles section re-runs at the checkpoint
- Progress tracking implementation (reuse progressState.js or simpler approach)
- Error handling and retry patterns
- How the placeholder S6 is represented in the output (empty section, null, or omitted entirely)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORCH-01 | Full Story CC skill orchestrates 6 sections with Pitch Deck findings inherited as context | Skill pattern, gate check, Pitch Deck inheritance mapping, agent dispatch, checkpoint design, output assembly -- all covered in Architecture Patterns below |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Claude Code skills | CC native | Skill orchestration framework | Only mechanism for multi-agent workflows in this project |
| ReportSectionSchema | Zod 4.3 | Section output validation | Existing schema from `src/schemas/reportSection.js` -- no changes needed |
| checklist-item.schema.json | JSON Schema draft-07 | Checklist data format within `data` field | Created in Phase 12 for exactly this purpose |
| progressState.js | project engine | State tracking and crash recovery | Existing engine with `fullStory` support (needs SECTION_KEYS fix) |
| contextBudget.js | project engine | Token cost tracking | Existing engine, reuse as-is |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| generate-section skill | CC native | Section re-runs at checkpoint | Already supports `fullStory` stage -- invoked when PM says "re-run section X" |
| sliceDataPacket | project utility | Agent-specific DataPacket views | Used in prompt assembly for each Full Story agent |

### Alternatives Considered
None -- the stack is fully determined by existing infrastructure. No new libraries needed.

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Skill Structure
```
.claude/skills/generate-full-story/
  SKILL.md               # ~400 lines (simpler than Pitch Deck's ~1000)
```

### Pattern 1: Full Story Skill Pipeline (7 Steps)
**What:** The end-to-end orchestration flow for the Full Story CC skill.
**When to use:** Every Full Story generation.

```
Step 1: Validate input + gate check (pitch-deck.json exists, has verdict)
Step 2: Load orchestrator config + agent configs + curriculum
Step 3: Prepare Pitch Deck inheritance (load PD sections, build per-agent context)
Step 4: Prepare DataPacket slices (reuse existing data-packet.json)
Step 5: Dispatch 5 agents sequentially (RAM constraint, same as PD)
Step 6: Checkpoint -- present findings + checklist scores + PM dialogue
Step 7: Assemble final report (full-story.json + full-story.md)
```

The key structural difference from the Pitch Deck skill: no Step 2 data preparation, no Step 3 PSR agents, and only 1 generation wave instead of 3 (meaning no inter-phase context threading between waves).

### Pattern 2: Pitch Deck Inheritance Mapping
**What:** Deterministic mapping from PD sections to FS agent context.
**When to use:** Step 3 of the skill.

The skill defines this as a constant data structure (not scattered across prompt assembly):

```javascript
// Defined at the top of the skill as a lookup table
const PD_INHERITANCE_MAP = {
  event_analysis:          ['pest', 'radar'],
  meaning_checklist:       ['simple_predictable', 'market_position'],
  moat_checklist:          ['barriers_moats', 'market_position'],
  management_checklist:    ['management', 'balance_sheet'],
  valuation_confirmation:  ['fcf', 'roe_roic_debt', 'valuation'],
};
```

For each Full Story section, the skill reads the corresponding PD section JSON files from `.thes1s/reports/{TICKER}/sections/` and includes them in the agent prompt as "Prior Pitch Deck Analysis" context.

**Format recommendation for inherited PD sections:** Pass the full `ReportSectionSchema` JSON for each inherited section. The agent receives: verdict, summary, narrative, data, citations, red flags, cross-cutting findings. This gives the Full Story agent maximum context to cite specific findings. The `narrative` field alone would lose the structured data; the `data` field alone would lose the prose reasoning.

### Pattern 3: Checklist Score Display at Checkpoint
**What:** Prominent display of checklist scores in the checkpoint summary.
**When to use:** Step 6 checkpoint.

```
================================================================
  CHECKPOINT: Full Story Deep Analysis Review
================================================================

Sections completed: 5/5 (S6 inversion_rebuttal deferred to Phase 14)

--- Section 1: Event Analysis ---
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary, first 200 chars}
  Red Flags: {count} items
  Citations: {count} sources

--- Section 2: Meaning Checklist ---
  Score: 12/15 PASS, 2 PARTIAL, 1 FAIL    <-- headline number
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary}
  Red Flags: {count} items

--- Section 3: Moat Checklist ---
  Score: 11/15 PASS, 3 PARTIAL, 1 FAIL
  ...

--- Section 4: Management Checklist ---
  Score: 10/13 PASS, 2 PARTIAL, 1 FAIL
  ...

--- Section 5: Valuation Confirmation ---
  Verdict: {verdict} | Confidence: {confidence}
  Summary: {summary}
  ...

--- Cross-Cutting Findings ---
  {aggregated from all 5 sections}

================================================================
```

The checklist score is extracted from the section's `data` field (JSON string containing checklist items with `summary.scoreDisplay`). Parse it for display.

### Pattern 4: Extensible Skill Structure for Phase 14
**What:** How the skill accommodates the debate phase without rewriting.
**When to use:** Structural decision at skill creation time.

The skill should have clearly demarcated sections:
1. **Phase 1: Deep Analysis** (S1-S5) -- implemented in Phase 13
2. **Phase 2: Debate** (S6) -- placeholder comment block in Phase 13, implemented in Phase 14

```markdown
## Step 7: Phase 2 -- THE DEBATE (Phase 14)

> This section is not yet implemented. Phase 14 will add the 4-step adversarial
> debate (Bull -> Bear -> Bull Rebuttal -> Judge) that produces S6 (inversion_rebuttal).
> Until then, S6 is omitted from the Full Story output.
> The checkpoint after the debate will be added as Step 8.
```

### Pattern 5: Section File Naming Convention
**What:** Where Full Story section files are stored on disk.
**When to use:** Section output persistence.

Based on existing patterns (One Pager sections saved as `sections/{key}.json` like `sections/company_info.json`), the Full Story sections should follow the same convention but with stage-prefixed names to avoid collisions:

```
.thes1s/reports/{TICKER}/sections/fullStory-S1-event_analysis.json
.thes1s/reports/{TICKER}/sections/fullStory-S2-meaning_checklist.json
.thes1s/reports/{TICKER}/sections/fullStory-S3-moat_checklist.json
.thes1s/reports/{TICKER}/sections/fullStory-S4-management_checklist.json
.thes1s/reports/{TICKER}/sections/fullStory-S5-valuation_confirmation.json
```

The CONTEXT.md mentions this convention. The existing Pitch Deck sections in the `sections/` directory use plain `{key}.json` naming (e.g., `company_info.json`). Since Full Story and One Pager section keys don't overlap (different keys), plain naming would also work. However, the stage-prefixed convention is cleaner for a directory that will contain sections from all 3 stages.

**Recommendation:** Use the stage-prefixed naming (`fullStory-S{N}-{key}.json`) as specified in CONTEXT.md. This is forward-looking and avoids any ambiguity.

### Anti-Patterns to Avoid
- **Re-running data assembly:** The Full Story does NOT re-assemble the DataPacket. It reads the existing one from `.thes1s/reports/{TICKER}/data-packet.json`. Attempting to re-run `prepare-data.js` would be wasteful and could produce different data.
- **Passing the entire pitch-deck.json to every agent:** D-03 explicitly says each agent gets only the 2-3 relevant PD sections. Passing the entire pitch deck would waste tokens and dilute focus.
- **Generating S6 as a placeholder section:** The CONTEXT says S6 is deferred. Do not generate a stub section with empty content -- just omit it from the output. The `full-story.json` should have 5 sections in Phase 13, extended to 6 in Phase 14.
- **Multi-wave dispatch for independent sections:** D-02 says all 5 sections are independent. Do not create artificial phase dependencies between them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DataPacket slicing | Custom field extraction | `sliceDataPacket()` from `src/schemas/dataPacket.js` | Already handles always-included fields, null safety |
| Section output validation | Manual JSON field checking | ReportSectionSchema Zod validation | 17+ fields with type constraints, min array sizes |
| Progress tracking | Custom state files | `progressState.js` (createProgress, advanceState, etc.) | Existing state machine with crash recovery |
| Token cost tracking | Manual calculation | `contextBudget.js` (createBudgetTracker) | Model pricing, per-agent tracking, summary aggregation |
| Section re-runs | Custom re-dispatch logic | `/generate:section` skill | Already supports `fullStory` stage with PM guidance |
| Checklist data parsing | Custom JSON parsing | Parse `data` field per `checklist-item.schema.json` | Schema-defined structure with summary.scoreDisplay |

**Key insight:** Phase 13 builds a SKILL.md orchestration file. Almost all the infrastructure code it calls already exists. The skill is a procedural script that wires together existing engines and patterns.

## Common Pitfalls

### Pitfall 1: progressState.js SECTION_KEYS is Stale
**What goes wrong:** `progressState.js` line 16 still has 8 Full Story section keys including `trading_strategy` and `pace_plan` which were removed in Phase 12 (D-10).
**Why it happens:** Phase 12 updated the dispatch table and agent prompts but did not update progressState.js constants.
**How to avoid:** Update `SECTION_KEYS.fullStory` to match the 6-key dispatch table: `['event_analysis', 'meaning_checklist', 'moat_checklist', 'management_checklist', 'valuation_confirmation', 'inversion_rebuttal']`.
**Warning signs:** `createProgress(ticker, 'fullStory')` creates sections for 8 keys instead of 6.

### Pitfall 2: No pitch-deck.json Exists Yet
**What goes wrong:** The gate check reads `pitch-deck.json` but no ticker in `.thes1s/reports/` has this file. The Pitch Deck CC skill writes it (Step 13 of PD skill), but all existing runs used the API pipeline which writes `pipeline-output.json`.
**Why it happens:** The CC skill and API pipeline are separate execution paths with different output formats.
**How to avoid:** For Phase 13 testing, either: (a) run the Pitch Deck CC skill first to produce `pitch-deck.json`, or (b) accept `pipeline-output.json` as a fallback in the gate check (read it, check for `overallVerdict`). Recommendation: support both formats in the gate check since the API pipeline will eventually replace the CC skill (Phase 16).
**Warning signs:** Gate check fails on every ticker because `pitch-deck.json` doesn't exist.

### Pitfall 3: Pitch Deck Section Files Not Saved Individually
**What goes wrong:** The skill tries to read `sections/pitchDeck-S1-radar.json` but these files don't exist. The CC skill saves sections as `sections/{key}.json` (plain keys). The API pipeline saves all sections inside `pipeline-output.json`.
**Why it happens:** Two different output conventions exist.
**How to avoid:** The skill should read PD sections from whatever format exists. For CC-generated PD: look for `sections/{key}.json` files. For API-generated PD: extract sections from `pipeline-output.json` by matching `key` fields. The inheritance mapping (D-04) references section keys, not file paths, so either source works.
**Warning signs:** Empty Pitch Deck context passed to agents because section files weren't found.

### Pitfall 4: RAM Constraint Requires Sequential Dispatch
**What goes wrong:** Dispatching all 5 agents simultaneously causes memory pressure and crashes.
**Why it happens:** Each CC subagent consumes significant RAM. The Pitch Deck skill explicitly dispatches agents "one at a time" (sequential, not parallel) despite sections being logically independent.
**How to avoid:** Despite D-02 saying sections "run in parallel" (logically independent), the CC skill must dispatch them sequentially due to the same RAM constraint the Pitch Deck skill faces. This is a CC execution constraint, not a logical dependency. The API migration (Phase 16) will enable true parallel dispatch.
**Warning signs:** CC crashes or hangs during multi-agent dispatch.

### Pitfall 5: Checklist Data Buried in JSON String
**What goes wrong:** The checkpoint display shows generic section info but not checklist scores, because the checklist data is inside the `data` field which is a JSON string (not a parsed object).
**Why it happens:** Per Phase 12 D-02, checklist data lives in the `data` field of ReportSectionSchema, which is serialized as a JSON string. The skill must `JSON.parse(section.data)` to extract `summary.scoreDisplay`.
**How to avoid:** After collecting each section output, parse the `data` field for checklist sections (S2, S3, S4) to extract the `scoreDisplay` string. Non-checklist sections (S1, S5) don't have this field.
**Warning signs:** Checkpoint shows "Data: [object Object]" or no score information for checklist sections.

### Pitfall 6: State Machine Transitions May Not Match Full Story Flow
**What goes wrong:** The `VALID_TRANSITIONS` in progressState.js are designed for the Pitch Deck's 3-wave flow. Full Story's single-wave flow may need different transitions.
**Why it happens:** Progress schema was designed for Pitch Deck complexity.
**How to avoid:** The Full Story flow maps to existing states: `IDLE -> WAVE_1_RUNNING -> CHECKPOINT_1 -> COMPLETE`. Alternatively, skip the state machine entirely and use simpler generation-status.json tracking (just `startSection`/`completeSection` calls). The progress state machine is mainly for crash recovery, which is less critical for a single-wave pipeline.
**Warning signs:** `advanceState()` throws "Invalid state transition" errors.

## Code Examples

### Gate Check Pattern (from Pitch Deck skill)
```markdown
## Step 1: Gate Check

Read `.thes1s/reports/{TICKER}/pitch-deck.json`. Verify:
1. The file exists
2. Parse it and check that `overallVerdict` is set (not null, not undefined)

If either check fails, also check `.thes1s/reports/{TICKER}/pipeline-output.json`
as a fallback (API pipeline output format).

If both fail, print:
  Gate check FAILED: Pitch Deck must be completed before generating a Full Story.
  Run /generate:pitch-deck {TICKER} first.
And stop execution.
```

### Pitch Deck Inheritance Assembly
```markdown
## Step 3: Prepare Pitch Deck Inheritance

For each Full Story section, read its inherited Pitch Deck sections.

PD_INHERITANCE_MAP:
  event_analysis:         [pest (S9), radar (S1)]
  meaning_checklist:      [simple_predictable (S2), market_position (S3)]
  moat_checklist:         [barriers_moats (S4), market_position (S3)]
  management_checklist:   [management (S6), balance_sheet (S8)]
  valuation_confirmation: [fcf (S5), roe_roic_debt (S7), valuation (S10)]

For each PD section key in the map:
1. Read `.thes1s/reports/{TICKER}/sections/{key}.json`
2. If not found, try extracting from `pipeline-output.json` or `pitch-deck.json`
3. Format as:

## Prior Pitch Deck Analysis

### {PD Section Title} (Section {N})
Verdict: {verdict} | Confidence: {confidence}

Summary: {summary}

Key Findings:
{narrative excerpt or data highlights}

Red Flags:
- {red flags list}

Citations:
- {citations list}
```

### Agent Dispatch Pattern (per agent)
```markdown
Dispatch the {agent-name} for Section {N} ({key}).

Prompt assembly (concatenated in order):
1. Agent prompt.md content
2. Sliced DataPacket as fenced JSON code block
3. Curriculum files from config.json
4. Universal context files (if universalContext: true)
5. ReportSectionSchema definition with output instruction
6. Inherited Pitch Deck section context (formatted per inheritance map)
7. PSR findings (annual + quarterly) if they exist
8. Task instruction: "Analyze {TICKER} and produce section {N} ({key}) as a JSON
   object conforming to ReportSectionSchema. Build on the Pitch Deck findings
   provided -- cite specific findings, do not re-derive from scratch. Return the
   single JSON object."
```

### Checklist Score Extraction
```javascript
// After collecting section output, extract checklist score for display
const section = JSON.parse(readFileSync(sectionPath, 'utf8'));
if (['meaning_checklist', 'moat_checklist', 'management_checklist'].includes(section.key)) {
  try {
    const checklistData = JSON.parse(section.data);
    const { passCount, failCount, partialCount, totalItems, scoreDisplay } = checklistData.summary;
    console.log(`Score: ${scoreDisplay}`);  // e.g., "12/15 PASS, 2 PARTIAL, 1 FAIL"
  } catch (e) {
    console.warn(`Could not parse checklist data for ${section.key}`);
  }
}
```

### Final Report Assembly
```json
{
  "ticker": "COST",
  "companyName": "Costco Wholesale Corporation",
  "stage": "fullStory",
  "generatedAt": "2026-03-29T...",
  "status": "partial",
  "completedSections": 5,
  "totalSections": 6,
  "pendingPhase": "Phase 14 debate (S6 inversion_rebuttal)",
  "sections": [
    { "key": "event_analysis", "sectionNumber": 1, ... },
    { "key": "meaning_checklist", "sectionNumber": 2, ... },
    { "key": "moat_checklist", "sectionNumber": 3, ... },
    { "key": "management_checklist", "sectionNumber": 4, ... },
    { "key": "valuation_confirmation", "sectionNumber": 5, ... }
  ],
  "checklistScores": {
    "meaning": "12/15 PASS, 2 PARTIAL, 1 FAIL",
    "moat": "11/15 PASS, 3 PARTIAL, 1 FAIL",
    "management": "10/13 PASS, 2 PARTIAL, 1 FAIL"
  },
  "sectionKeys": ["event_analysis", "meaning_checklist", "moat_checklist", "management_checklist", "valuation_confirmation", "inversion_rebuttal"],
  "overallVerdict": null,
  "pitchDeckVerdict": "PASS"
}
```

Note: `overallVerdict` is null in Phase 13 because the Full Story verdict requires the complete debate (S6). The pitch deck verdict is stored for reference.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API pipeline (aiResearch.js) | CC skill orchestration | Phase 10 (v1.1) | CC skills are the primary generation path; API migration is Phase 16 |
| 8 Full Story sections | 6 sections (removed S7/S8) | Phase 12 | trading_strategy and pace_plan removed -- PM decides trading tactics |
| Generic section format | Checklist scoring schema | Phase 12 | Meaning/Moat/Management sections have structured PASS/FAIL/PARTIAL items |

## Open Questions

1. **Gate check format compatibility**
   - What we know: The skill gate-checks `pitch-deck.json`, but no ticker has this file yet. SFM has `pipeline-output.json` (API pipeline format).
   - What's unclear: Should the skill support both formats, or should we require running the PD CC skill first?
   - Recommendation: Support both formats. The gate check should try `pitch-deck.json` first, then fall back to `pipeline-output.json`. Both contain `overallVerdict` and section data. This makes testing practical without a full PD CC skill run.

2. **Pitch Deck section file location**
   - What we know: CC-generated One Pager sections are in `sections/{key}.json`. PD CC skill would save to `sections/{key}.json`. API pipeline bundles sections in `pipeline-output.json`.
   - What's unclear: For PD inheritance, should we read from individual section files or from the bundled report?
   - Recommendation: Read from `pitch-deck.json` sections array (or `pipeline-output.json` sections array) rather than individual files. This is guaranteed to exist if the gate check passes, whereas individual section files may not exist for API pipeline runs.

3. **Overall verdict in Phase 13**
   - What we know: The Full Story's overall verdict depends on all 6 sections including the debate. Phase 13 only generates 5.
   - What's unclear: Should `overallVerdict` be set to null, or should we compute a preliminary verdict from S1-S5?
   - Recommendation: Set `overallVerdict` to null with `status: "partial"` and note that Phase 14 will complete the verdict. The PM reads individual section verdicts and checklist scores at the checkpoint. A premature overall verdict would be misleading.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `vitest.config.js` or inline in `package.json` |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORCH-01a | progressState.js SECTION_KEYS updated (6 keys, not 8) | unit | `npm test -- --run src/engines/__tests__/progressState.test.js` | Existing (needs new test case) |
| ORCH-01b | Gate check validates pitch-deck.json format | manual | Manual: run `/generate:full-story TICKER` without PD | N/A (CC skill) |
| ORCH-01c | 5 sections generate with correct keys and schema | manual | Manual: run full skill, validate output files | N/A (CC skill) |
| ORCH-01d | Checklist sections have scored data field | manual | Manual: inspect section JSON `data` field | N/A (CC skill) |
| ORCH-01e | Checkpoint displays checklist scores | manual | Manual: observe checkpoint output | N/A (CC skill) |

### Sampling Rate
- **Per task commit:** `npm test -- --run` (existing tests pass)
- **Per wave merge:** Full test suite + manual skill run on 1 ticker
- **Phase gate:** Full Story generates 5 sections for at least 1 ticker with checklist scores visible

### Wave 0 Gaps
- [ ] `src/engines/__tests__/progressState.test.js` -- add test for fullStory SECTION_KEYS (6 keys)
- [ ] No automated tests for CC skill execution (inherent to CC skill architecture -- skills are tested by running them)

## Sources

### Primary (HIGH confidence)
- `.claude/skills/generate-pitch-deck/SKILL.md` -- ~1000 lines, complete pipeline pattern
- `.claude/skills/generate-one-pager/SKILL.md` -- simpler pipeline pattern
- `.claude/skills/generate-section/SKILL.md` -- section re-run pattern
- `agents/orchestrator/dispatch-table.json` -- fullStory section structure and agent mapping
- `agents/orchestrator/config.json` -- sectionMapping.fullStory
- `agents/orchestrator/schemas/checklist-item.schema.json` -- checklist scoring format
- `agents/orchestrator/schemas/debate-step.schema.json` -- Phase 14 reference
- `src/schemas/reportSection.js` -- ReportSectionSchema (Zod)
- `src/engines/progressState.js` -- state machine and section tracking
- `src/schemas/progress.js` -- ProgressSchema definition
- All agent `config.json` and `prompt.md` files -- Full Story sections already defined

### Secondary (MEDIUM confidence)
- `.thes1s/reports/SFM/` -- existing report structure (API pipeline format)
- `.thes1s/reports/POOL/` -- existing One Pager report structure (CC skill format)
- `.thes1s/reports/MSFT/` -- existing One Pager with individual section files

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all infrastructure exists, no new libraries
- Architecture: HIGH -- direct replication of proven Pitch Deck CC skill pattern
- Pitfalls: HIGH -- identified from direct code inspection of existing files and formats

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- internal architecture, no external dependencies)
