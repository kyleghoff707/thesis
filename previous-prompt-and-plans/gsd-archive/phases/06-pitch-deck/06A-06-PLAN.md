---
phase: 06-pitch-deck
plan: 06A-06
type: execute
wave: 2
depends_on: [06A-01]
files_modified:
  - agents/annual-reader/prompt.md
  - agents/quarterly-reader/prompt.md
autonomous: true
requirements: [PTCH-07]
must_haves:
  truths:
    - "annual-reader prompt.md is a full prompt (300+ lines)"
    - "quarterly-reader prompt.md is a full prompt (300+ lines)"
    - "annual-reader reads chronologically oldest-first (per D-09)"
    - "quarterly-reader tracks management promises vs actuals"
  artifacts:
    - path: "agents/annual-reader/prompt.md"
      provides: "Full annual-reader agent prompt for 10-K processing"
      min_lines: 300
    - path: "agents/quarterly-reader/prompt.md"
      provides: "Full quarterly-reader agent prompt for 10-Q + transcript processing"
      min_lines: 300
  key_links:
    - from: "agents/annual-reader/prompt.md"
      to: "src/engines/filingMarkdown.js"
      via: "readFilingSection tool reference"
      pattern: "readFilingSection"
    - from: "agents/quarterly-reader/prompt.md"
      to: "src/engines/transcripts.js"
      via: "getTranscriptExcerpt tool reference"
      pattern: "getTranscriptExcerpt"
---

<objective>
Author both Primary Source Reader agent prompts via /writing-skills: annual-reader (10-K, proxy, shareholder letters) and quarterly-reader (10-Q, earnings transcripts). These are new agents replacing the single primary-source-reader stub.

Purpose: PSR agents are the foundation of Pitch Deck quality — they read actual SEC filings and transcripts to ground all downstream analysis in primary sources. The annual-reader provides 10-year historical context; the quarterly-reader provides recent narrative and management credibility tracking. Per D-02, both authored via /writing-skills.
Output: Two full prompt.md files (300+ lines each).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/06-pitch-deck/06-CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author annual-reader prompt via /writing-skills</name>
  <files>agents/annual-reader/prompt.md</files>
  <read_first>
    agents/annual-reader/config.json
    agents/annual-reader/writing-brief.md
    agents/primary-source-reader/prompt.md
    agents/business-analyst/prompt.md
    .claude/skills/writing-skills/SKILL.md
    knowledge/research-references/rule-one-fundamentals.md
    knowledge/stage-2-pitch-deck/template.md
  </read_first>
  <action>
Use /writing-skills to author the annual-reader prompt. Full TDD process:

1. **Read ALL writing-skills reference files** (per D-02):
   - .claude/skills/writing-skills/SKILL.md
   - .claude/skills/writing-skills/anthropic-best-practices.md
   - .claude/skills/writing-skills/testing-skills-with-subagents.md
   - .claude/skills/writing-skills/persuasion-principles.md
   - .claude/skills/writing-skills/graphviz-conventions.dot
   - .claude/skills/writing-skills/examples/ (all files)

2. **Read the annual-reader writing brief** at agents/annual-reader/writing-brief.md (created in 06A-01)

3. **RED phase:** There is no existing prompt to test against (new agent). Run a baseline prompt to establish what a generic agent produces without specific instructions.

4. **GREEN phase:** Author full prompt covering:
   - **Role:** Primary Source Reader — Annual Filing Specialist. Reads SEC annual filings to extract deep historical context.
   - **Filing scope:** 10 years of 10-K annual reports + proxy statements (DEF 14A) + annual shareholder letters (when embedded in proxy)
   - **Reading order:** Chronological — oldest first (per D-09). The agent experiences the company's evolution as it happened. Start with the oldest available 10-K and work forward year by year.
   - **Targeted section reading (CRITICAL per Pitfall 3):** Use the readFilingSection tool to extract SPECIFIC SECTIONS of each 10-K:
     - Item 1: Business Description (evolution of business model, new segments, geographic expansion)
     - Item 1A: Risk Factors (what risks appeared, disappeared, escalated year over year)
     - Item 7: MD&A (management's discussion of performance, strategy changes, key metrics commentary)
     - Item 6: Selected Financial Data (when available — discontinued after 2021 SEC rule change)
   - DO NOT read entire 10-K filings. Each 10-K is 100-200K tokens. Reading targeted sections keeps each at 10-30K tokens.
   - **Proxy statement extraction:** Board composition changes, executive compensation trends, shareholder letter content (gold for management evaluation per CONTEXT.md)
   - **Cross-validation (per D-10):** For each year, compare SEC-derived financial metrics against DataPacket values for Rule-One-relevant fields: revenue, net income, EPS, book value, total debt, FCF. Flag discrepancies with specific values.
   - **Discrepancy handling (per D-11):** When SEC value differs from DataPacket value, produce a structured discrepancy report: { field, year, secValue, dataPacketValue, delta, source (exact 10-K section), recommendation }. The SEC value becomes the "primary source value."
   - **Acquisition history:** Extract ALL M&A disclosures: date, target company, purchase price, strategic rationale, integration status (for PTCH-12)
   - **Output format:** Structured JSON with:
     - businessEvolution: array of year-by-year themes
     - riskTrajectory: how risk factors changed over 10 years
     - competitiveChanges: market position shifts
     - compensationTrends: executive pay trajectory
     - dataVerification: array of discrepancy reports
     - acquisitions: array of M&A events
     - keyInsights: 5-10 most important findings across all filings
   - **No curriculum files** — this agent reads raw filings, grounded only by universal context
   - **Tool:** readFilingSection only

5. **REFACTOR:** Pressure test. Verify the prompt produces structured output, not a generic summary.
  </action>
  <verify>
    <automated>wc -l agents/annual-reader/prompt.md | awk '{if ($1 >= 300) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <acceptance_criteria>
    - agents/annual-reader/prompt.md is 300+ lines
    - File contains "chronological" or "oldest first" (D-09 reading order)
    - File contains "readFilingSection" (tool reference)
    - File contains "10-K" (filing type)
    - File contains "proxy" or "DEF 14A" (proxy statement extraction)
    - File contains "cross-valid" or "discrepancy" (D-10/D-11 verification)
    - File contains "acquisition" (M&A extraction for PTCH-12)
    - File does NOT contain "getTranscriptExcerpt" (annual-reader has no transcript access)
  </acceptance_criteria>
  <done>annual-reader has a full production prompt for chronological 10-K processing with targeted section reading, cross-validation, and acquisition extraction</done>
</task>

<task type="auto">
  <name>Task 2: Author quarterly-reader prompt via /writing-skills</name>
  <files>agents/quarterly-reader/prompt.md</files>
  <read_first>
    agents/quarterly-reader/config.json
    agents/quarterly-reader/writing-brief.md
    agents/annual-reader/prompt.md
    .claude/skills/writing-skills/SKILL.md
    knowledge/research-references/rule-one-fundamentals.md
    knowledge/stage-2-pitch-deck/template.md
  </read_first>
  <action>
Use /writing-skills to author the quarterly-reader prompt. Full TDD process:

1. **Read ALL writing-skills reference files** (per D-02) — same as Task 1.

2. **Read the quarterly-reader writing brief** at agents/quarterly-reader/writing-brief.md (created in 06A-01)

3. **RED phase:** Baseline test with generic agent.

4. **GREEN phase:** Author full prompt covering:
   - **Role:** Primary Source Reader — Quarterly Filing & Transcript Specialist. Reads recent 10-Qs and earnings call transcripts to extract current narrative and management credibility.
   - **Filing scope:** At least 4 quarters of 10-Q reports + at least 4 quarters of earnings call transcripts
   - **Reading order:** Chronological — oldest first (per D-09)
   - **10-Q sections to read** (via readFilingSection tool):
     - MD&A (quarterly performance discussion, strategy updates, guidance changes)
     - Risk Factors (only if changed from annual — 10-Q risk sections often say "no material changes")
     - Financial Statement Notes (for recent events: acquisitions, restructuring, legal settlements)
   - **Earnings transcript analysis** (via getTranscriptExcerpt tool):
     - Management tone: confident/cautious/evasive? Quantify with examples.
     - Forward-looking statements: Extract exact quotes with quarter/year tags
     - Guidance changes: Track guidance revisions across quarters (raised, lowered, maintained, removed)
     - Q&A quality: Does management give direct answers or deflect? Which analysts ask the hardest questions?
   - **Promise tracking:** Extract management's forward-looking statements from each quarter. For promises from earlier quarters, check if subsequent quarters show fulfillment or broken promises. Output structured array:
     - { quarter, year, promise (exact quote), category (growth/margin/capex/M&A/other), status (fulfilled/broken/pending/revised), evidence }
   - **Graceful transcript absence:** If no transcript API keys are configured, operate with 10-Qs only. Note explicitly: "Earnings call transcripts unavailable — analysis based on 10-Q filings only."
   - **Cross-validation (per D-10):** Compare recent quarterly financials against DataPacket TTM values
   - **Discrepancy handling (per D-11):** Same structured format as annual-reader
   - **Output format:** Structured JSON with:
     - recentTrends: quarter-by-quarter narrative arc
     - guidanceTrajectory: how guidance evolved over 4+ quarters
     - toneShifts: notable changes in management communication style
     - promiseTracker: array of forward-looking statements with fulfillment status
     - dataVerification: discrepancy reports
     - keyInsights: 5-10 most important recent findings
   - **Tools:** readFilingSection + getTranscriptExcerpt

5. **REFACTOR:** Pressure test. Verify promise tracker produces structured entries, not just summaries.
  </action>
  <verify>
    <automated>wc -l agents/quarterly-reader/prompt.md | awk '{if ($1 >= 300) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <acceptance_criteria>
    - agents/quarterly-reader/prompt.md is 300+ lines
    - File contains "chronological" or "oldest first" (D-09 reading order)
    - File contains "readFilingSection" and "getTranscriptExcerpt" (both tools)
    - File contains "10-Q" (filing type)
    - File contains "transcript" (earnings call analysis)
    - File contains "promise" or "forward-looking" (promise tracking)
    - File contains "tone" (management tone analysis)
    - File contains "unavailable" or "graceful" (transcript absence handling)
  </acceptance_criteria>
  <done>quarterly-reader has a full production prompt for chronological 10-Q + transcript processing with promise tracking and graceful API absence handling</done>
</task>

</tasks>

<verification>
- `wc -l agents/annual-reader/prompt.md agents/quarterly-reader/prompt.md` shows 300+ lines each
- `npx vitest run` all tests pass
</verification>

<success_criteria>
Both PSR agent prompts are full production prompts (300+ lines each) authored via /writing-skills TDD methodology, with chronological reading order, targeted section extraction, cross-validation, and role-specific specializations (annual: 10-K + proxy + M&A; quarterly: 10-Q + transcripts + promise tracking).
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06A-06-SUMMARY.md`
</output>
