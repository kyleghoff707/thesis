---
phase: 06-pitch-deck
plan: 06B-02
type: execute
wave: 3
depends_on: ["06A-02", "06A-03", "06A-04", "06A-05", "06A-06"]
files_modified:
  - .claude/skills/generate-section/SKILL.md
autonomous: true
requirements: [CMD-01]
must_haves:
  truths:
    - "CC skill /generate:section exists and can re-run a single section"
    - "Skill accepts TICKER, stage, and section number arguments"
    - "Skill loads existing report context (prior sections, PSR findings) before dispatching"
  artifacts:
    - path: ".claude/skills/generate-section/SKILL.md"
      provides: "Section re-run CC skill for CMD-01"
      min_lines: 100
      contains: "generate-section"
  key_links:
    - from: ".claude/skills/generate-section/SKILL.md"
      to: "agents/orchestrator/config.json"
      via: "sectionMapping lookup for agent dispatch"
      pattern: "sectionMapping"
---

<objective>
Create the /generate:section CC skill — re-runs a single section of any stage without re-running the entire pipeline. Used at checkpoints when PM says "re-run section X" and as a standalone command.

Purpose: CMD-01 enables targeted regeneration of individual sections with additional guidance, without the cost of re-running the full pipeline. Essential for the checkpoint experience where PM can redirect specific sections.
Output: .claude/skills/generate-section/SKILL.md (~150-200 lines).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/06-pitch-deck/06-CONTEXT.md

<interfaces>
From agents/orchestrator/config.json — sectionMapping:
```json
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
}
```

Section keys per stage (from progressState.js):
- onePager: [company_info, minimum_standards, meaning, growth_metrics, valuation_summary, overall_verdict]
- pitchDeck: [radar, simple_predictable, market_position, barriers_moats, fcf, management, roe_roic_debt, balance_sheet, pest, valuation]
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /generate:section CC skill for single section re-run</name>
  <files>.claude/skills/generate-section/SKILL.md</files>
  <read_first>
    .claude/skills/generate-one-pager/SKILL.md
    agents/orchestrator/config.json
    agents/orchestrator/dispatch-table.json
    src/engines/progressState.js
    src/schemas/reportSection.js
  </read_first>
  <action>
Create `.claude/skills/generate-section/` directory and write SKILL.md.

**Frontmatter:**
```yaml
~~~~
name: generate-section
description: Re-generate a specific section of a report without re-running the full pipeline
argument-hint: TICKER stage section# [guidance]
disable-model-invocation: true
~~~~
```

**Steps:**

**Step 1: Parse Arguments**
- Parse `$0` to extract: TICKER, stage (onePager/pitchDeck), sectionNumber, and optional guidance text
- Example: `/generate:section COST pitchDeck 3 "Focus more on international competitors"`
- If arguments insufficient, print usage and stop

**Step 2: Load Existing Context**
- Read agents/orchestrator/config.json to get sectionMapping for the stage
- Look up which agent handles this section number: `config.sectionMapping[stage][sectionNumber]`
- Read the agent's config.json + prompt.md + curriculum
- Read .thes1s/reports/{TICKER}/data-packet.json (DataPacket)
- Read existing section outputs from .thes1s/reports/{TICKER}/sections/*.json to provide prior context
- Read PSR findings if they exist (.thes1s/reports/{TICKER}/sections/annual-reader-insights.json, quarterly-reader-insights.json)
- Read existing report (.thes1s/reports/{TICKER}/{stage-filename}.json) for checkpoint notes

**Step 3: Prepare and Dispatch Agent**
- Slice DataPacket per agent config
- Build agent prompt: prompt.md + sliced DataPacket + curriculum + universal context + PSR findings + prior section summaries + ReportSectionSchema
- If guidance text provided, append as: "ADDITIONAL GUIDANCE FROM PM: {guidance}"
- Dispatch via Agent tool

**Step 4: Collect and Save**
- Parse agent output, validate against ReportSectionSchema
- Save to .thes1s/reports/{TICKER}/sections/{section_key}.json (overwrites previous)
- Run critic.js on the single section
- Print section verdict, confidence, red flags count, quality score

**Step 5: Update Report Assembly**
- Read the existing stage report file (one-pager.json or pitch-deck.json)
- Replace the section at the matching sectionNumber
- Rewrite the report file
- Print: "Section {number} ({key}) regenerated. Report updated."

**Contamination boundary:** Same as generate-pitch-deck — never read example files.

**Error handling:** If agent fails, retry once with error context. If still fails, print error and do not update the report.
  </action>
  <verify>
    <automated>test -f .claude/skills/generate-section/SKILL.md && wc -l .claude/skills/generate-section/SKILL.md | awk '{if ($1 >= 100) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}' && grep -c "sectionMapping" .claude/skills/generate-section/SKILL.md</automated>
  </verify>
  <acceptance_criteria>
    - .claude/skills/generate-section/SKILL.md exists with 100+ lines
    - Frontmatter contains `name: generate-section` and `disable-model-invocation: true`
    - File contains "sectionMapping" (agent lookup)
    - File contains "data-packet.json" (DataPacket loading)
    - File contains "ADDITIONAL GUIDANCE" or "guidance" (PM guidance injection)
    - File contains "sections/" (section output path)
    - File contains contamination boundary warning
    - File supports both "onePager" and "pitchDeck" stages
  </acceptance_criteria>
  <done>/generate:section skill enables targeted single-section regeneration for any stage with optional PM guidance</done>
</task>

</tasks>

<verification>
- `.claude/skills/generate-section/SKILL.md` exists with 100+ lines
- `npx vitest run` all tests pass
</verification>

<success_criteria>
The /generate:section CC skill is complete and supports re-running any section of any stage with optional PM guidance, loading existing context, and updating the assembled report.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06B-02-SUMMARY.md`
</output>
