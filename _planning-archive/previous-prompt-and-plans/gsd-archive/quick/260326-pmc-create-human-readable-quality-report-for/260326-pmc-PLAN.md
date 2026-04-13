---
phase: quick
plan: 260326-pmc
type: execute
wave: 1
depends_on: []
files_modified:
  - src/engines/qualityFormatter.js
  - .claude/skills/generate-pitch-deck/SKILL.md
  - .claude/skills/generate-one-pager/SKILL.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "Running the formatter on an existing pitch-deck.quality.json produces a scannable markdown report"
    - "The markdown report shows overall score, per-section breakdown, high-severity issues, and remediation priorities"
    - "The generate-pitch-deck skill runs the formatter as a final step after quality JSON is generated"
  artifacts:
    - path: "src/engines/qualityFormatter.js"
      provides: "Quality JSON to markdown conversion utility"
      exports: ["formatQualityReport"]
    - path: ".thes1s/reports/SFM/quality/pitch-deck.quality.md"
      provides: "Example output from running formatter on existing SFM data"
  key_links:
    - from: "src/engines/qualityFormatter.js"
      to: ".thes1s/reports/{TICKER}/quality/pitch-deck.quality.json"
      via: "reads JSON, outputs .quality.md"
      pattern: "formatQualityReport"
---

<objective>
Create a human-readable quality/compliance report (.quality.md) that converts the existing quality JSON into a markdown document a PM can scan in 30 seconds.

Purpose: The quality JSON files are machine-readable but hard to quickly assess. A formatted markdown report surfaces what matters — overall score, failing sections, high-severity issues, and what to fix first.
Output: `src/engines/qualityFormatter.js` utility + updated SKILL.md files to run it after quality JSON generation.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/engines/critic.js
@.thes1s/reports/SFM/quality/pitch-deck.quality.json
@.claude/skills/generate-pitch-deck/SKILL.md (Step 14 area, lines ~1094-1126)
@.claude/skills/generate-one-pager/SKILL.md (Step 9 area, lines ~230-256)

<interfaces>
<!-- Quality JSON structure (from critic.js validateStage output): -->
```json
{
  "sections": [
    {
      "sectionKey": "radar",
      "score": 77,
      "completeness": {
        "requiredFieldsPresent": 15,
        "requiredFieldsTotal": 15,
        "narrativeLength": 5342,
        "dataFieldsPopulated": 5,
        "score": 100
      },
      "issues": [
        { "type": "citation", "severity": "high|medium|low", "message": "...", "field": "..." }
      ],
      "passed": true|false,
      "checkedAt": "ISO date"
    }
  ],
  "overallScore": 63,
  "overallPassed": false,
  "checkedAt": "ISO date"
}
```

<!-- Pitch Deck section keys and labels (from PitchDeck.jsx): -->
```js
const SECTION_DEFS = [
  { key: 'radar', label: 'Radar', phase: 1 },
  { key: 'simple_predictable', label: 'Simple & Predictable', phase: 1 },
  { key: 'market_position', label: 'Market Position', phase: 1 },
  { key: 'barriers_moats', label: 'Barriers & Moats', phase: 2 },
  { key: 'fcf', label: 'FCF', phase: 2 },
  { key: 'management', label: 'Management', phase: 2 },
  { key: 'roe_roic_debt', label: 'ROE/ROIC/Debt', phase: 2 },
  { key: 'balance_sheet', label: 'Balance Sheet', phase: 2 },
  { key: 'pest', label: 'PEST', phase: 3 },
  { key: 'valuation', label: 'Valuation', phase: 3 },
];
```

<!-- One Pager section keys (from one-pager.quality.json): -->
<!-- company_info, minimum_standards, meaning_management, growth, summary -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create qualityFormatter.js utility</name>
  <files>src/engines/qualityFormatter.js</files>
  <action>
Create `src/engines/qualityFormatter.js` with a single named export `formatQualityReport(qualityJson, options)` that converts the quality JSON structure into a concise, scannable markdown string.

**Parameters:**
- `qualityJson` — the parsed JSON object from `pitch-deck.quality.json` or `one-pager.quality.json`
- `options` — optional object: `{ ticker, stage }` where stage is 'pitch-deck' or 'one-pager' (used in the title)

**Section key to label mapping** — include a `SECTION_LABELS` map inside the file covering both Pitch Deck and One Pager keys:
```
radar -> Radar
simple_predictable -> Simple & Predictable
market_position -> Market Position
barriers_moats -> Barriers & Moats
fcf -> Free Cash Flow
management -> Management
roe_roic_debt -> ROE/ROIC/Debt
balance_sheet -> Balance Sheet
pest -> PEST Risk Analysis
valuation -> Valuation
company_info -> Company Info
minimum_standards -> Minimum Standards
meaning_management -> Meaning & Management
growth -> Growth Metrics
summary -> Summary
```
Fall back to title-casing the key if not found (split on `_`, capitalize each word).

**Markdown output structure:**

```markdown
# Quality Report: {TICKER} {Stage Title}

**Score: {overallScore}/100** | **Status: {PASS/FAIL}** | **Generated: {checkedAt formatted as YYYY-MM-DD HH:MM}**

---

## Section Breakdown

| # | Section | Score | Completeness | Pass | High | Med | Low |
|---|---------|-------|-------------|------|------|-----|-----|
| 1 | Radar | 77 | 100% | No | 1 | 1 | 7 |
| ... |

---

## High-Severity Issues

> These must be addressed before the report is considered reliable.

**1. Radar** (score: 77)
- [search_compliance] Section "Radar: Business Model..." has zero web-sourced citations. Web research is required for independent verification.

**2. FCF** (score: 59)
- [search_compliance] Section "Free Cash Flow..." reports zero web searches...
- [search_compliance] Section "Free Cash Flow..." has zero web-sourced citations...

(Only sections with high-severity issues appear here. If none, print "No high-severity issues found.")

---

## Remediation Priority

Sections ranked by urgency (lowest score + most high-severity issues first):

1. **Management** (score: 42) — 0 high issues, completeness 69%. Focus: missing required fields (9/15 present).
2. **Valuation** (score: 47) — 2 high issues, completeness 67%. Focus: web search compliance.
3. **PEST** (score: 50) — 2 high issues, completeness 97%. Focus: web search compliance.
...

(List ALL sections sorted by score ascending. Include a 1-line "Focus" note derived from: if completeness < 80% mention missing fields, if high issues > 0 mention their type, if many low issues mention citation cleanup.)

---

## Methodology

Quality scores are computed by the Thes1s critic engine (`src/engines/critic.js`). Scoring weights:
- 40% required field presence
- 25% narrative depth
- 20% citation quality
- 15% data field population

Issue types: `citation` (source quality), `search_compliance` (web research requirements), `confidence` (claim-source alignment).
Severity levels: `high` (must fix), `medium` (should fix), `low` (nice to fix).
```

**Implementation notes:**
- Follow codebase conventions: named export, 2-space indent, single quotes, guard clause at top (`if (!qualityJson || !qualityJson.sections) return '# Quality Report\n\nNo quality data available.\n';`)
- Use `export function formatQualityReport(qualityJson, options = {})` — not default export
- The function returns a string. It does NOT read/write files — that is the caller's responsibility.
- Sort remediation by score ascending, then by high issue count descending as tiebreaker.
- For the "Focus" line: inspect `completeness.score < 80` for field gaps, count issues by type to find the dominant problem area.
- Format `checkedAt` using simple Date parsing — no external deps.
- Keep the total output concise — the point is 30-second scanning.
  </action>
  <verify>
    <automated>node -e "
      import { formatQualityReport } from './src/engines/qualityFormatter.js';
      import { readFileSync } from 'fs';
      const q = JSON.parse(readFileSync('.thes1s/reports/SFM/quality/pitch-deck.quality.json', 'utf8'));
      const md = formatQualityReport(q, { ticker: 'SFM', stage: 'pitch-deck' });
      console.log(md.substring(0, 200));
      const hasScore = md.includes('Score:');
      const hasTable = md.includes('| # |');
      const hasRemediation = md.includes('Remediation');
      console.log('Has score:', hasScore, 'Has table:', hasTable, 'Has remediation:', hasRemediation);
      if (!hasScore || !hasTable || !hasRemediation) process.exit(1);
    "
    </automated>
  </verify>
  <done>formatQualityReport converts any quality JSON into a structured markdown string with overall score, section table, high-severity issue listing, remediation priorities, and methodology note.</done>
</task>

<task type="auto">
  <name>Task 2: Update generate-pitch-deck and generate-one-pager SKILLs to produce .quality.md</name>
  <files>.claude/skills/generate-pitch-deck/SKILL.md, .claude/skills/generate-one-pager/SKILL.md</files>
  <action>
**generate-pitch-deck/SKILL.md** — In Step 14 (Quality Check), after the existing `writeFileSync` that saves `pitch-deck.quality.json` (around line 1106), add a new block that imports `formatQualityReport` and writes the markdown:

Insert this code block immediately after the existing quality JSON write and console.log lines, but INSIDE the same `node --import` script block (before the closing `"`). Add these lines after the existing `console.log` statements around line 1114:

```js
  // Generate human-readable quality report
  const { formatQualityReport } = await import('./src/engines/qualityFormatter.js');
  const qualityMd = formatQualityReport(quality, { ticker: '{TICKER}', stage: 'pitch-deck' });
  writeFileSync('.thes1s/reports/{TICKER}/quality/pitch-deck.quality.md', qualityMd);
  console.log('Quality report written: .thes1s/reports/{TICKER}/quality/pitch-deck.quality.md');
```

Also update the Step 16 final summary output (around line 1265) to add the `.quality.md` file in the "Output Files" listing:
```
  Quality:       .thes1s/reports/{TICKER}/quality/pitch-deck.quality.json
                 .thes1s/reports/{TICKER}/quality/pitch-deck.quality.md
```

**generate-one-pager/SKILL.md** — Apply the same pattern to the one-pager quality step. Find the `writeFileSync` that saves `one-pager.quality.json` (around line 236) and add after the existing console.log lines:

```js
  // Generate human-readable quality report
  const { formatQualityReport } = await import('./src/engines/qualityFormatter.js');
  const qualityMd = formatQualityReport(quality, { ticker: '{TICKER}', stage: 'one-pager' });
  writeFileSync('.thes1s/reports/{TICKER}/quality/one-pager.quality.md', qualityMd);
  console.log('Quality report written: .thes1s/reports/{TICKER}/quality/one-pager.quality.md');
```

Also update the final summary output to include the `.quality.md` path alongside the `.quality.json` entry.

**Important:** Both SKILL files use `--import ./scripts/node-esm-loader.js` for the quality step, so `await import()` for the formatter will work with the custom ESM loader. Use dynamic `await import()` (not top-level import) since the formatter is being added to an existing inline script.
  </action>
  <verify>
    <automated>grep -c "qualityFormatter" .claude/skills/generate-pitch-deck/SKILL.md && grep -c "qualityFormatter" .claude/skills/generate-one-pager/SKILL.md && grep -c "quality.md" .claude/skills/generate-pitch-deck/SKILL.md</automated>
  </verify>
  <done>Both SKILL.md files produce a .quality.md file alongside the .quality.json after quality checks. The final summary sections list both output files.</done>
</task>

<task type="auto">
  <name>Task 3: Generate SFM quality report from existing data to validate end-to-end</name>
  <files>.thes1s/reports/SFM/quality/pitch-deck.quality.md</files>
  <action>
Run the formatter on the existing SFM pitch-deck quality JSON to produce a real output file and verify it reads well:

```bash
node --import ./scripts/node-esm-loader.js -e "
  import { formatQualityReport } from './src/engines/qualityFormatter.js';
  import { readFileSync, writeFileSync } from 'fs';
  const q = JSON.parse(readFileSync('.thes1s/reports/SFM/quality/pitch-deck.quality.json', 'utf8'));
  const md = formatQualityReport(q, { ticker: 'SFM', stage: 'pitch-deck' });
  writeFileSync('.thes1s/reports/SFM/quality/pitch-deck.quality.md', md);
  console.log(md);
"
```

Review the output for readability:
- Overall score and pass/fail are immediately visible at top
- Section table fits in a terminal without horizontal scrolling
- High-severity issues are listed explicitly with section context
- Remediation list is sorted by urgency (lowest scores first)
- Total output is under ~100 lines for a 10-section report

If the output needs minor formatting tweaks (alignment, wording), adjust `qualityFormatter.js` accordingly.

Also run on the CEG one-pager quality JSON if it exists to confirm cross-stage compatibility:
```bash
node --import ./scripts/node-esm-loader.js -e "
  import { formatQualityReport } from './src/engines/qualityFormatter.js';
  import { readFileSync } from 'fs';
  const q = JSON.parse(readFileSync('.thes1s/reports/CEG/quality/one-pager.quality.json', 'utf8'));
  const md = formatQualityReport(q, { ticker: 'CEG', stage: 'one-pager' });
  console.log(md.substring(0, 500));
"
```
  </action>
  <verify>
    <automated>test -f .thes1s/reports/SFM/quality/pitch-deck.quality.md && head -5 .thes1s/reports/SFM/quality/pitch-deck.quality.md | grep -q "Quality Report"</automated>
  </verify>
  <done>Real .quality.md file exists at .thes1s/reports/SFM/quality/pitch-deck.quality.md, starts with the expected header, and the content is scannable in 30 seconds.</done>
</task>

</tasks>

<verification>
1. `src/engines/qualityFormatter.js` exists with named export `formatQualityReport`
2. Running it on SFM quality JSON produces valid, readable markdown
3. Both SKILL.md files reference the formatter and produce .quality.md output
4. Output includes: overall score, section table, high-severity issues, remediation priorities, methodology note
</verification>

<success_criteria>
- qualityFormatter.js converts any quality JSON (pitch-deck or one-pager) into a PM-scannable markdown report
- Both generate-pitch-deck and generate-one-pager skills produce .quality.md alongside .quality.json
- The markdown report surfaces the right information hierarchy: score first, then failing sections, then specific issues, then what to fix
</success_criteria>

<output>
After completion, create `.planning/quick/260326-pmc-create-human-readable-quality-report-for/260326-pmc-SUMMARY.md`
</output>
