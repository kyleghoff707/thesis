---
phase: 06-pitch-deck
plan: 06A-01
type: execute
wave: 1
depends_on: []
files_modified:
  - agents/annual-reader/config.json
  - agents/annual-reader/writing-brief.md
  - agents/quarterly-reader/config.json
  - agents/quarterly-reader/writing-brief.md
  - agents/orchestrator/dispatch-table.json
  - agents/orchestrator/config.json
autonomous: true
requirements: [PTCH-07, PTCH-12]
must_haves:
  truths:
    - "agents/annual-reader/ directory exists with config.json and writing-brief.md"
    - "agents/quarterly-reader/ directory exists with config.json and writing-brief.md"
    - "dispatch-table.json pitchDeck.preProcessing references annual-reader and quarterly-reader (not primary-source-reader)"
    - "config.json sectionMapping unchanged (PSR agents are pre-processing, not section-producing)"
  artifacts:
    - path: "agents/annual-reader/config.json"
      provides: "Annual reader agent configuration"
      contains: "annual-reader"
    - path: "agents/annual-reader/writing-brief.md"
      provides: "Writing brief for annual-reader prompt authoring"
      contains: "10-K"
    - path: "agents/quarterly-reader/config.json"
      provides: "Quarterly reader agent configuration"
      contains: "quarterly-reader"
    - path: "agents/quarterly-reader/writing-brief.md"
      provides: "Writing brief for quarterly-reader prompt authoring"
      contains: "10-Q"
    - path: "agents/orchestrator/dispatch-table.json"
      provides: "Updated dispatch table with PSR split"
      contains: "annual-reader"
    - path: "agents/orchestrator/config.json"
      provides: "Updated orchestrator config"
  key_links:
    - from: "agents/orchestrator/dispatch-table.json"
      to: "agents/annual-reader/config.json"
      via: "preProcessing agent reference"
      pattern: "annual-reader"
    - from: "agents/orchestrator/dispatch-table.json"
      to: "agents/quarterly-reader/config.json"
      via: "preProcessing agent reference"
      pattern: "quarterly-reader"
---

<objective>
Create new agent directories for annual-reader and quarterly-reader (replacing primary-source-reader per D-08), with config.json files, writing briefs, and updated dispatch-table.json / config.json.

Purpose: Establishes the file structure and configurations that prompt authoring plans (06A-05) need, and that the CC skill (06B-01) will reference for pre-processing dispatch.
Output: 2 new agent directories with configs + briefs, updated orchestrator configs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/06-pitch-deck/06-CONTEXT.md

<interfaces>
From agents/primary-source-reader/config.json (pattern to follow):
```json
{
  "role": "primary-source-reader",
  "model": "opus",
  "curriculum": [],
  "compressionPolicy": "none",
  "universalContext": true,
  "universalContextFiles": [
    "knowledge/research-references/rule-one-fundamentals.md",
    "knowledge/research-references/tools-for-analysis.md"
  ],
  "dataPacketSlice": ["companyInfo", "classification", "financials", "ttm", "filings"],
  "tools": ["readFilingSection", "getTranscriptExcerpt"],
  "sections": { "onePager": [], "pitchDeck": [], "fullStory": [] }
}
```

From agents/writing-briefs/primary-source-reader-brief.md (pattern to split into two):
The existing brief covers the combined PSR role. Must be split into:
- annual-reader-brief.md: 10-Ks + proxies + shareholder letters + historical data verification
- quarterly-reader-brief.md: 10-Qs + transcripts + recent guidance + promise tracking
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create annual-reader and quarterly-reader agent directories with configs</name>
  <files>
    agents/annual-reader/config.json
    agents/quarterly-reader/config.json
  </files>
  <read_first>
    agents/primary-source-reader/config.json
    agents/orchestrator/dispatch-table.json
    agents/orchestrator/config.json
  </read_first>
  <action>
Create two new agent directories and their config.json files, derived from primary-source-reader/config.json per D-08.

**agents/annual-reader/config.json:**
```json
{
  "role": "annual-reader",
  "model": "opus",
  "curriculum": [],
  "compressionPolicy": "none",
  "universalContext": true,
  "universalContextFiles": [
    "knowledge/research-references/rule-one-fundamentals.md",
    "knowledge/research-references/tools-for-analysis.md"
  ],
  "dataPacketSlice": ["companyInfo", "classification", "financials", "ttm", "filings"],
  "tools": ["readFilingSection"],
  "sections": { "onePager": [], "pitchDeck": [], "fullStory": [] }
}
```
Note: annual-reader gets `readFilingSection` only (no `getTranscriptExcerpt`). Model is `opus` for large context 10-K processing.

**agents/quarterly-reader/config.json:**
```json
{
  "role": "quarterly-reader",
  "model": "opus",
  "curriculum": [],
  "compressionPolicy": "none",
  "universalContext": true,
  "universalContextFiles": [
    "knowledge/research-references/rule-one-fundamentals.md",
    "knowledge/research-references/tools-for-analysis.md"
  ],
  "dataPacketSlice": ["companyInfo", "classification", "financials", "ttm", "filings", "transcripts"],
  "tools": ["readFilingSection", "getTranscriptExcerpt"],
  "sections": { "onePager": [], "pitchDeck": [], "fullStory": [] }
}
```
Note: quarterly-reader gets both tools and includes `transcripts` in its DataPacket slice.
  </action>
  <verify>
    <automated>test -f agents/annual-reader/config.json && test -f agents/quarterly-reader/config.json && node -e "const a=JSON.parse(require('fs').readFileSync('agents/annual-reader/config.json','utf8')); const q=JSON.parse(require('fs').readFileSync('agents/quarterly-reader/config.json','utf8')); console.assert(a.role==='annual-reader'); console.assert(q.role==='quarterly-reader'); console.assert(!a.tools.includes('getTranscriptExcerpt')); console.assert(q.tools.includes('getTranscriptExcerpt')); console.log('PASS')"</automated>
  </verify>
  <acceptance_criteria>
    - agents/annual-reader/config.json exists with `"role": "annual-reader"` and `"model": "opus"`
    - agents/annual-reader/config.json has tools array containing only `"readFilingSection"`
    - agents/quarterly-reader/config.json exists with `"role": "quarterly-reader"` and `"model": "opus"`
    - agents/quarterly-reader/config.json has tools array containing `"readFilingSection"` and `"getTranscriptExcerpt"`
    - agents/quarterly-reader/config.json dataPacketSlice includes `"transcripts"`
    - Both configs have `"sections": { "onePager": [], "pitchDeck": [], "fullStory": [] }` (PSR agents are pre-processing, not section-producing)
  </acceptance_criteria>
  <done>Two new agent directories exist with correct configs differentiating annual vs quarterly tools and data slices</done>
</task>

<task type="auto">
  <name>Task 2: Create writing briefs + update dispatch-table.json and config.json</name>
  <files>
    agents/annual-reader/writing-brief.md
    agents/quarterly-reader/writing-brief.md
    agents/orchestrator/dispatch-table.json
    agents/orchestrator/config.json
  </files>
  <read_first>
    agents/writing-briefs/primary-source-reader-brief.md
    agents/orchestrator/dispatch-table.json
    agents/orchestrator/config.json
    .planning/phases/06-pitch-deck/06-CONTEXT.md
  </read_first>
  <action>
**Writing briefs:** Split primary-source-reader-brief.md into two focused briefs. Place them in the agent directories (alongside config.json) AND in agents/writing-briefs/ for discoverability. Follow the existing writing brief format from agents/writing-briefs/.

**agents/annual-reader/writing-brief.md (also copy to agents/writing-briefs/annual-reader-brief.md):**
Focus areas per D-08, D-09, D-10, D-11:
- Role: Read 10 years of 10-K annual reports, proxy statements, and annual shareholder letters (when embedded in proxy)
- Reading order: Chronological — oldest first (per D-09). Agent experiences company's evolution as it happened.
- Sections to read in each 10-K: Business Description, Risk Factors, MD&A, Selected Financial Data. Use readFilingSection tool for targeted extraction (NOT full filing reads — per Pitfall 3).
- Proxy statement extraction: Board composition, executive compensation, shareholder letter if present (gold for management evaluation per CONTEXT.md specifics)
- Cross-validation: Compare SEC-derived financial metrics against DataPacket values for Rule-One-relevant fields only (per D-10). Flag discrepancies with structured report (per D-11).
- Output: Structured JSON with themes (business evolution, risk themes, competitive changes, compensation trends, data verification results)
- Acquisition history: Extract all M&A from 10-K disclosures into structured table (date, target, amount, rationale) — feeds PTCH-12
- No curriculum files — this agent reads raw filings, grounded by universal context (R1 fundamentals + tools for analysis)

**agents/quarterly-reader/writing-brief.md (also copy to agents/writing-briefs/quarterly-reader-brief.md):**
Focus areas per D-08, D-09, D-10, D-11:
- Role: Read at least 4 quarters of 10-Q reports + at least 4 quarters of earnings call transcripts
- Reading order: Chronological — oldest first (per D-09)
- 10-Q sections: MD&A, Risk Factors (changes from annual), Financial Statements (notes for recent events)
- Transcript analysis: Management tone, forward-looking statements, guidance changes, Q&A themes
- Promise tracking: Extract forward-looking statements, tag by quarter/year. Compare promises to subsequent results when visible in later quarters. Output structured promise-tracker array.
- Cross-validation: Same as annual-reader (per D-10, D-11) for quarterly data
- Graceful transcript absence: If neither Finnhub nor Alpha Vantage keys are set, operate with 10-Qs only. Note the gap.
- Output: Structured JSON with recent trends, guidance trajectory, tone shifts, promise tracker, data verification
- Tools: readFilingSection + getTranscriptExcerpt

**dispatch-table.json update:** Replace the single `primary-source-reader` in pitchDeck.preProcessing with:
```json
"preProcessing": [
  { "step": "data-assembly", "agent": "data-assembler", "parallel": false },
  { "step": "annual-reading", "agent": "annual-reader", "parallel": false, "dependsOn": "data-assembly" },
  { "step": "quarterly-reading", "agent": "quarterly-reader", "parallel": true, "dependsOn": "data-assembly" }
]
```
Note: annual-reader and quarterly-reader CAN run in parallel (both depend on data-assembly, not on each other). The `parallel: true` on quarterly-reader signals this.

**config.json update:** No changes to sectionMapping needed (PSR agents are pre-processing, not section-producing). But ensure the file is valid JSON after any formatting changes.
  </action>
  <verify>
    <automated>test -f agents/annual-reader/writing-brief.md && test -f agents/quarterly-reader/writing-brief.md && test -f agents/writing-briefs/annual-reader-brief.md && test -f agents/writing-briefs/quarterly-reader-brief.md && node -e "const dt=JSON.parse(require('fs').readFileSync('agents/orchestrator/dispatch-table.json','utf8')); const pp=dt.pitchDeck.preProcessing; console.assert(pp.some(s=>s.agent==='annual-reader'), 'annual-reader missing'); console.assert(pp.some(s=>s.agent==='quarterly-reader'), 'quarterly-reader missing'); console.assert(!pp.some(s=>s.agent==='primary-source-reader'), 'primary-source-reader still present'); console.log('PASS')"</automated>
  </verify>
  <acceptance_criteria>
    - agents/annual-reader/writing-brief.md exists and contains "10-K" and "chronological"
    - agents/quarterly-reader/writing-brief.md exists and contains "10-Q" and "transcript"
    - agents/writing-briefs/annual-reader-brief.md exists (copy)
    - agents/writing-briefs/quarterly-reader-brief.md exists (copy)
    - dispatch-table.json pitchDeck.preProcessing contains objects with agent "annual-reader" and "quarterly-reader"
    - dispatch-table.json pitchDeck.preProcessing does NOT contain "primary-source-reader"
    - dispatch-table.json onePager and fullStory sections are UNCHANGED
    - config.json parses as valid JSON
  </acceptance_criteria>
  <done>Writing briefs ready for /writing-skills prompt authoring. Dispatch table reflects the PSR split. Orchestrator config unchanged for section mappings.</done>
</task>

</tasks>

<verification>
- `node -e "JSON.parse(require('fs').readFileSync('agents/orchestrator/dispatch-table.json','utf8'))"` exits 0 (valid JSON)
- `node -e "JSON.parse(require('fs').readFileSync('agents/orchestrator/config.json','utf8'))"` exits 0 (valid JSON)
- `ls agents/annual-reader/ agents/quarterly-reader/` shows config.json and writing-brief.md in each
- `npx vitest run` all existing tests pass (no regressions)
</verification>

<success_criteria>
Two new PSR agent directories fully configured, writing briefs ready for /writing-skills authoring, dispatch table updated for the annual-reader + quarterly-reader split.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06A-01-SUMMARY.md`
</output>
