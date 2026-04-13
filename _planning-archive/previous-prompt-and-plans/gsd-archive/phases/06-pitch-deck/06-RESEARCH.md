# Phase 6: Pitch Deck - Research

**Researched:** 2026-03-25
**Domain:** Multi-agent AI orchestration, CC skill authoring, React report display, Rule One Pitch Deck generation
**Confidence:** HIGH

## Summary

Phase 6 delivers the full Pitch Deck generation pipeline across 4 sub-phases (6A-6D). This is the most complex phase in the project: 5 new agent prompts authored via /writing-skills, a primary-source-reader split into annual-reader + quarterly-reader, a new CC skill (/generate:pitch-deck) with 3-phase dispatch and conversational checkpoints, a PitchDeck.jsx UI with 10 section cards and SensitivityTable.jsx, and delight features (deep-dive panel, industry cards, assumption tracker).

The foundation is solid. Phase 5A delivered the complete data layer (schemas, DataPacket, Toolbox, progress state, node adapter). Phase 5C delivered a working CC skill (/generate:one-pager) that serves as the template. Phase 5D delivered the quality system (critic.js, contextBudget.js). Phase 5B delivered the display components (SectionRenderer, VerdictBadge, ConfidenceBadge, CitationTooltip, RedFlagCallout, OnePager.jsx, useOnePager hook, Vite middleware). The COST one-pager is the reference output proving the pipeline works end-to-end.

The primary risk is agent prompt quality -- these prompts are the core product. Each of the 5 new agents must be authored via /writing-skills with full TDD methodology (baseline failure -> write prompt -> pressure test -> iterate). The secondary risk is the Pitch Deck CC skill's complexity: 3-phase dispatch with checkpoints, PSR pre-processing, FGR derivation sub-workflow, and inter-phase context passing. The one-pager skill is 346 lines; the pitch deck skill will be approximately 600-800 lines.

**Primary recommendation:** Execute sub-phases strictly in order (6A -> 6B -> 6C -> 6D). Agent prompts (6A) must be complete before the CC skill (6B) can dispatch them. The CC skill (6B) must work before the UI (6C) has data to render. Delight features (6D) are layered on top.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Split Phase 6 into 4 sub-phases: 6A (agent prompts), 6B (CC skill + generation), 6C (UI), 6D (delight features)
- **D-02:** Use /writing-skills for every new agent prompt -- read ALL reference files in the writing-skills skill directory. No shortcuts.
- **D-03:** Light update pass on existing agents (business-analyst, financial-analyst, valuation-specialist, synthesis-writer) for Pitch Deck depth. Not full rewrites.
- **D-04:** Separate CC skill /generate:pitch-deck -- new skill alongside /generate:one-pager. Each self-contained.
- **D-05:** Terminal dialogue at each checkpoint. CC skill pauses, prints structured checkpoint summary, enters conversational loop. PM types questions or 'continue'.
- **D-06:** PM can inject external data at checkpoints. Next phase's agents receive as supplementary context. PM can re-run specific sections with guidance.
- **D-07:** Questions from PM routed to the agent that produced the section. Relevant specialist answers.
- **D-08:** Replace single primary-source-reader with annual-reader (10yr 10-Ks + proxies + shareholder letters) and quarterly-reader (4+ quarters 10-Qs + transcripts).
- **D-09:** Chronological reading order (oldest first). A/B test reverse-chronological later.
- **D-10:** Both PSR agents cross-validate with financial analyst on Rule-One-relevant metrics. SEC filings are source of truth.
- **D-11:** Discrepancy handling: Flag + override. PSR flags in structured report. Corrected value becomes primary. PM sees both at checkpoint.
- **D-12:** Filings already optimized -- filingMarkdown.js converts to markdown for token reduction. Agents read markdown.
- **D-13:** Both PSR agents run in pre-processing (before 3 generation phases). All section authors have PSR findings.
- **D-14:** FGR derivation: agent-assisted, input-by-input PM confirmation. Valuation-specialist presents each of 5 inputs with evidence. PM confirms/adjusts each. Then proposes FGR Low/High range.
- **D-15:** FGR only runs within pitch deck generation (section 10, after all prior sections complete).
- **D-16:** Standalone /fgr command (CMD-03) dropped from Phase 6.
- **D-17:** Agent count changes from 9 to 10. Single primary-source-reader splits into annual-reader + quarterly-reader.

### Claude's Discretion
- CC skill internal architecture (checkpoint implementation, state management between phases)
- Exact token budget allocation per agent call
- How inter-phase context is passed (full section JSON, summaries, or both)
- PitchDeck.jsx component structure and sub-component boundaries (6C)
- SensitivityTable.jsx implementation approach
- Delight feature implementation details (6D)
- Error handling and retry patterns within generation phases

### Deferred Ideas (OUT OF SCOPE)
- Standalone /fgr TICKER command (CMD-03) -- FGR without prior deep research is superficial
- A/B testing chronological vs reverse-chronological reading order
- Enforcing "at least 3 years of quarterlies" for quarterly reader
- Automated eval system -- user IS the eval for first 5-10 reports
- Token budget optimization -- measure actual costs before setting budgets
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PTCH-01 | CC skill /generate:pitch-deck with 3-phase agent dispatch | One-pager skill at .claude/skills/generate-one-pager/SKILL.md is the template. Dispatch table at agents/orchestrator/dispatch-table.json defines phases. progressState.js already supports pitchDeck stage with all 10 section keys. |
| PTCH-02 | PitchDeck.jsx + 10 section sub-components | OnePager.jsx (272 lines) is the pattern. SectionRenderer.jsx reused for all 10 sections. useOnePager.js pattern cloned for usePitchDeck.js. UI-SPEC defines layout, nav, and phase progress indicator. |
| PTCH-03 | Structured checkpoints after each phase | ProgressSchema already has checkpoints array. Dispatch table defines checkpoint.presents per phase. CC skill implements terminal dialogue loop. |
| PTCH-04 | Conversational checkpoint dialogue | CC skill pauses execution, prints findings, enters while loop for PM input. Questions routed to agent via Agent tool. This is CC skill logic, not UI. |
| PTCH-05 | SensitivityTable.jsx | valuation.js sensitivityTable() function already exists (line 259). UI component wraps it with MOS-proximity coloring per UI-SPEC. Props interface defined in UI-SPEC. |
| PTCH-06 | FGR derivation workflow (5 inputs, PM confirmation) | fgr.js has createFGR() and computeFGR(). Valuation-specialist curriculum includes fgr.md. CC skill implements input-by-input flow in section 10 generation. |
| PTCH-07 | Primary Source Reader (10-K, transcripts, proxy, data verification) | Split into annual-reader + quarterly-reader per D-08. filingMarkdown.js and transcripts.js provide the tools. readFilingSection and getTranscriptExcerpt are toolbox tools. Writing briefs exist. |
| PTCH-08 | Competitor benchmarking (15+ peers) | Competitor-evaluator config has peers/peerMetrics DataPacket slice + comparePeers tool. peerMetrics.js, peers.js, batchQuotes.js all functional. Writing brief mandates 15+ companies. |
| PTCH-09 | Market share ceiling analysis | Competitor-evaluator writing brief includes this. Agent must prove growth rate does not require unrealistic market dominance. |
| PTCH-10 | Dual Owner Earnings (Rule One + Graham) | computeTenCap() in valuation.js accepts method: "ruleOne" or "graham". Toolbox exposes this. Valuation-specialist handles both. |
| PTCH-11 | Cyclical business handling | Financial-analyst and valuation-specialist curricula cover CAGR from first positive year. Agent prompts must explicitly address this. |
| PTCH-12 | Acquisition history tracking | Business-analyst and management-evaluator cover M&A. Table format in ReportSectionSchema tables array. |
| PTCH-13 | "Tell me more" deep-dive (Phase 6D) | DeepDivePanel design contract in UI-SPEC. Slide-out panel, 440px, AI generates expanded analysis on demand. |
| PTCH-14 | Industry context cards (Phase 6D) | IndustryCard design contract in UI-SPEC. Popover with term, definition, industry benchmark. Agents mark glossary terms during generation. |
| PTCH-15 | Assumption tracker sidebar (Phase 6D) | AssumptionTracker design contract in UI-SPEC. 360px sidebar, confidence bars, cascade indicators. Read-only in 6D. |
| PTCH-16 | Full parity vs LULU Pitch Deck benchmark (user-verified) | LULU example at knowledge/stage-2-pitch-deck/. Contamination boundary prevents agents from accessing it. PM compares output manually. |
| CMD-01 | /generate:section TICKER stage section# (re-run specific section) | CC skill can re-dispatch a single agent for a specific section. Re-uses same prompt + DataPacket + prior context. |
| CMD-03 | /fgr TICKER (standalone FGR) | DEFERRED per D-16. Not in Phase 6 scope. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Inline styles only** -- mutable C palette from src/theme.js. No CSS files, no Tailwind, no CSS-in-JS.
- **Functional components + hooks** -- no class components.
- **2-space indentation**, single quotes, semicolons, trailing commas.
- **Error resilience** -- engines return null on failure, hooks follow { data, loading, error } pattern.
- **CC skill architecture** -- disable-model-invocation: true, Agent tool for subagent dispatch.
- **Writing-skills TDD** -- every new agent prompt via /writing-skills with full reference reading.
- **LULU contamination boundary** -- agents NEVER access example files during generation.
- **Report storage** -- .thes1s/reports/{TICKER}/ directory, JSON + markdown outputs.
- **Vite middleware** -- thes1sReportsPlugin serves report data to browser. Must extend for pitch-deck.json.
- **Quality system** -- critic.js runs after generation, informational not blocking.
- **Budget tracking** -- contextBudget.js measures cost, never enforces.
- **GSD workflow** -- use /gsd:quick, /gsd:debug, or /gsd:execute-phase for all changes.

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI components | Already installed, functional components + hooks |
| Vite | 7.3.1 | Dev server + bundler | Already installed, custom middleware for report serving |
| @anthropic-ai/sdk | 0.78.0 | Claude API client | Already installed, used by companyAdapter.js and planned aiResearch.js |
| Zod | 4.3+ | Schema validation | Already installed, ReportSectionSchema, DataPacketSchema, ProgressSchema |
| Recharts | 3.8.0 | Charts (price, growth) | Already installed, for chart configs in section data |
| Vitest | 4.1.0 | Unit testing | Already installed, 856 tests passing |

### Supporting (Already Available)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| idb | 8.0.3 | IndexedDB wrapper | Filing markdown cache, transcript cache |
| Turndown + GFM | 7.2.2 | HTML to markdown | SEC filing conversion for PSR agents |
| Cheerio | 1.2.0 | HTML parsing | Finviz, filing parsing |

**No new npm packages required for Phase 6.** All dependencies already exist.

## Architecture Patterns

### Sub-Phase Build Order

```
6A: Agent Prompts (5 new + 4 updates)
  ├── 5 new agents via /writing-skills: competitor-evaluator, management-evaluator,
  │   risk-analyst, annual-reader, quarterly-reader
  ├── 4 light updates: business-analyst, financial-analyst, valuation-specialist, synthesis-writer
  ├── Update dispatch-table.json: annual-reader + quarterly-reader replace primary-source-reader
  ├── Update config.json: sectionMapping for pitch deck with new agents
  └── New agent dirs: agents/annual-reader/, agents/quarterly-reader/

6B: CC Skill + Generation Pipeline
  ├── .claude/skills/generate-pitch-deck/SKILL.md (~600-800 lines)
  ├── Pre-processing: data assembly + annual-reader + quarterly-reader (sequential)
  ├── Phase 1 (parallel): business-analyst (S1,S2) + competitor-evaluator (S3)
  ├── Checkpoint 1: terminal dialogue
  ├── Phase 2 (mixed): competitor-evaluator (S4) + financial-analyst (S5,S7,S8) + management-evaluator (S6)
  ├── Checkpoint 2: terminal dialogue
  ├── Phase 3: risk-analyst (S9) + valuation-specialist (S10 with FGR sub-workflow)
  ├── Checkpoint 3: FGR confirmation + valuation review
  ├── Post-processing: synthesis-writer (final polish)
  ├── Quality check + budget tracking
  └── CMD-01: /generate:section support

6C: PitchDeck.jsx + UI Components
  ├── PitchDeck.jsx: 10-section report viewer with phase progress + sticky nav
  ├── SensitivityTable.jsx: 2D matrix varying assumptions, MOS proximity coloring
  ├── usePitchDeck.js: Hook mirroring useOnePager pattern
  ├── Vite middleware: extend thes1sReportsPlugin for pitch-deck.json + progress
  ├── Routes: /research/:id/pitch-deck
  └── UI polish fixes from 05B/05D polish notes (shared SectionRenderer improvements)

6D: Delight Features
  ├── DeepDivePanel.jsx: slide-out "Tell me more" AI analysis
  ├── IndustryCard.jsx: glossary popover for industry terms
  ├── AssumptionTracker.jsx: sidebar with confidence bars (read-only)
  └── LULU parity verification (user-verified)
```

### Recommended File Structure (New Files)

```
agents/
├── annual-reader/
│   ├── prompt.md          # NEW: authored via /writing-skills
│   ├── config.json        # NEW: based on primary-source-reader config
│   └── writing-brief.md   # NEW: derived from primary-source-reader-brief.md
├── quarterly-reader/
│   ├── prompt.md          # NEW: authored via /writing-skills
│   ├── config.json        # NEW: based on primary-source-reader config
│   └── writing-brief.md   # NEW: separate focus from annual-reader
├── competitor-evaluator/
│   └── prompt.md          # REPLACE stub with real prompt
├── management-evaluator/
│   └── prompt.md          # REPLACE stub with real prompt
├── risk-analyst/
│   └── prompt.md          # REPLACE stub with real prompt
├── business-analyst/
│   └── prompt.md          # UPDATE for deeper Pitch Deck sections
├── financial-analyst/
│   └── prompt.md          # UPDATE for deeper Pitch Deck sections
├── valuation-specialist/
│   └── prompt.md          # UPDATE for FGR sub-workflow
├── synthesis-writer/
│   └── prompt.md          # UPDATE for Pitch Deck polish pass
├── orchestrator/
│   ├── dispatch-table.json # UPDATE: annual-reader + quarterly-reader
│   └── config.json         # UPDATE: pitchDeck sectionMapping
├── writing-briefs/
│   ├── annual-reader-brief.md     # NEW
│   └── quarterly-reader-brief.md  # NEW

.claude/skills/
├── generate-pitch-deck/
│   └── SKILL.md           # NEW: ~600-800 lines

src/components/
├── PitchDeck.jsx          # NEW: master layout with 10 sections
├── SensitivityTable.jsx   # NEW: 2D assumption matrix
├── pitchDeck/
│   ├── DeepDivePanel.jsx  # NEW (6D): slide-out AI analysis
│   ├── IndustryCard.jsx   # NEW (6D): glossary popover
│   └── AssumptionTracker.jsx # NEW (6D): assumption sidebar

src/hooks/
├── usePitchDeck.js        # NEW: report loading + progress polling
```

### Pattern 1: CC Skill with Multi-Phase Dispatch

**What:** The generate-pitch-deck CC skill orchestrates 10+ agent calls across 3 phases with checkpoints between each.

**When to use:** For the pitch deck generation pipeline.

**Key differences from one-pager skill:**
1. Pre-processing step includes annual-reader + quarterly-reader (not in one-pager)
2. 3 phases with checkpoints (one-pager has 1 phase, no checkpoints)
3. FGR derivation sub-workflow in Phase 3 section 10
4. Inter-phase context passing (Phase 2 agents see Phase 1 outputs)
5. Conversational checkpoint dialogue (terminal loop, not just approve/reject)

**Skill structure (from generate-one-pager pattern):**
```markdown
---
name: generate-pitch-deck
description: Generate a 10-section Rule One Pitch Deck for a given stock ticker
argument-hint: TICKER
disable-model-invocation: true
---

# Generate Pitch Deck

## Step 1: Validate Input + Gate Check
## Step 2: Assemble DataPacket
## Step 3: Pre-Processing (Annual Reader + Quarterly Reader)
## Step 4: Read Agent Configurations
## Step 5: Phase 1 — Business Fundamentals (parallel dispatch)
## Step 6: Checkpoint 1 — Present findings, conversational dialogue
## Step 7: Phase 2 — Financial Deep-Dive (mixed parallel/sequential)
## Step 8: Checkpoint 2 — Present findings, conversational dialogue
## Step 9: Phase 3 — Risk & Valuation (parallel + FGR sub-workflow)
## Step 10: Checkpoint 3 — FGR confirmation + valuation review
## Step 11: Synthesis Writer — Final polish pass
## Step 12: Assemble Final Report
## Step 13: Quality Check
## Step 14: Budget Tracking
## Step 15: Print Final Summary
```

### Pattern 2: Checkpoint Dialogue Loop

**What:** After each generation phase, the CC skill pauses and enters a conversational loop with the PM.

**When to use:** Checkpoints 1, 2, and 3 in the pitch deck pipeline.

**Implementation approach:**
```
1. Print structured checkpoint summary:
   - Sections completed in this phase
   - Per-section verdicts + confidence levels
   - Data gaps discovered
   - Questions for PM
   - Cross-cutting findings

2. Enter dialogue loop:
   - PM can type a question -> route to relevant agent via Agent tool
   - PM can paste data -> store as supplementaryContext for next phase
   - PM can say "re-run section X" -> re-dispatch that agent (CMD-01)
   - PM can say "continue" -> advance to next phase

3. Store checkpoint state:
   - Save PM notes, injected data, confidence snapshot
   - Include in report JSON for audit trail
```

### Pattern 3: Primary Source Reader Pre-Processing

**What:** Two specialized PSR agents run before all 3 generation phases, producing structured findings that feed downstream agents.

**When to use:** Pre-processing step, after DataPacket assembly.

**Annual Reader flow:**
1. Receive DataPacket slice + readFilingSection tool
2. Read 10 years of 10-Ks chronologically (oldest first per D-09)
3. Read proxy statements (extract shareholder letters when present)
4. Cross-validate key financials against DataPacket (D-10)
5. Output: annual-reader-insights.json (business evolution, risk themes, compensation, data verification)

**Quarterly Reader flow:**
1. Receive DataPacket slice + readFilingSection + getTranscriptExcerpt tools
2. Read 4+ quarters of 10-Qs chronologically
3. Read 4+ quarters of earnings call transcripts
4. Track management promises vs actuals
5. Output: quarterly-reader-insights.json (recent trends, guidance, tone shifts, promise tracker)

**Both outputs merge into PSR findings that all Phase 1/2/3 agents receive.**

### Pattern 4: FGR Derivation Sub-Workflow

**What:** Within section 10 (Valuation), the valuation-specialist runs an interactive FGR derivation.

**When to use:** Phase 3, section 10 only (per D-15).

**Flow:**
1. Valuation-specialist gathers evidence for each of 5 FGR inputs
2. For each input, presents: value, source, confidence, reasoning
3. PM confirms or adjusts each input
4. Agent proposes FGR Low/High range
5. PM approves final range
6. Range feeds all 4 valuation calculators
7. Sensitivity tables computed using sensitivityTable() from valuation.js

### Pattern 5: Reusing Phase 5B Components

**What:** PitchDeck.jsx reuses SectionRenderer, VerdictBadge, ConfidenceBadge, CitationTooltip, RedFlagCallout from Phase 5B.

**When to use:** All 10 sections of the Pitch Deck use SectionRenderer.

**New additions for PitchDeck.jsx (beyond OnePager.jsx):**
1. Phase progress indicator (3 phases, done/active/pending states)
2. 10-item sticky nav (vs 6 for one-pager)
3. Checkpoint summary blocks between phase groups
4. SensitivityTable instances in section 10
5. FGR derivation display in section 10
6. Approval gate for Stage 2 (unlocks Full Story)

### Anti-Patterns to Avoid

- **Single mega-prompt for all sections:** Each section gets a focused agent with sliced DataPacket. Never dump everything into one prompt.
- **Summarizing curriculum for token savings:** Per D-02 and AGNT-03, curriculum is embedded at full depth. No compression, no summarization.
- **Skipping /writing-skills for new agents:** Every new prompt MUST go through the TDD methodology. Baseline failure -> write -> pressure test -> iterate.
- **Building a generic chat interface:** Checkpoints are scoped to the generation context. Questions are routed to specific agents. Not open-ended chat.
- **Making quality checks blocking:** Per D-04 from Phase 5D, quality is informational. Report saves first, quality runs after.
- **Estimating financial data:** Per agent rules, "Data not available" for anything not in DataPacket. Never fabricate numbers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DataPacket assembly | Custom data fetching | `assembleDataPacket()` in dataExport.js | 20+ engines already orchestrated with error resilience |
| Valuation calculations | Custom MOS/PBT/TenCap/EquityBond math | `computeMOS()`, `computePBT()`, etc. in valuation.js | Proven, tested pure math functions |
| Sensitivity tables | Custom grid computation | `sensitivityTable()` in valuation.js | Already supports all 4 methods with parameterized axes |
| FGR structure | Custom FGR object | `createFGR()` / `computeFGR()` in fgr.js | Handles 5 inputs, qualitative marketRelativity |
| Section rendering | Custom section cards | `SectionRenderer.jsx` from Phase 5B | Handles narrative, data grids, citations, red flags |
| Report JSON loading | Custom fetch logic | `useOnePager.js` pattern cloned to `usePitchDeck.js` | Progress polling, parallel fetch, cancellation |
| Citation validation | Custom quality checks | `critic.js` from Phase 5D | Per-section quality with 4-factor scoring |
| Token tracking | Custom cost estimation | `contextBudget.js` from Phase 5D | chars/4 estimation + model pricing |
| Filing markdown | Custom HTML parsing | `filingMarkdown.js` + `transcripts.js` | Turndown conversion + IndexedDB caching |
| Progress state machine | Custom state tracking | `progressState.js` from Phase 5A | Validated transitions, crash recovery, section status |

**Key insight:** The entire data layer (20+ engines) and quality system are complete. Phase 6 is 100% about the intelligence layer (agent prompts + orchestration) and presentation layer (UI). Zero engine work needed.

## Common Pitfalls

### Pitfall 1: Agent Prompt Depth Insufficient for Pitch Deck
**What goes wrong:** Agent prompts written for one-pager depth (brief, surface-level) produce shallow Pitch Deck sections that fail LULU parity.
**Why it happens:** One-pager sections are 1-2 paragraphs. Pitch Deck sections are 2-5 pages each. The prompts must explicitly demand deeper investigation.
**How to avoid:** Each agent prompt must reference the specific Pitch Deck template questions (from knowledge/stage-2-pitch-deck/template.md). The /writing-skills TDD cycle catches this -- pressure test with a real ticker and compare depth to LULU benchmark.
**Warning signs:** Section narratives under 500 words, fewer than 5 citations per section, generic claims without specific data.

### Pitfall 2: Inter-Phase Context Drift
**What goes wrong:** Phase 2 agents don't see Phase 1 outputs, producing disconnected analysis. Phase 3 ignores earlier findings.
**Why it happens:** Each agent gets a fresh context window. If Phase 1 outputs are not explicitly injected into Phase 2 prompts, agents cannot reference them.
**How to avoid:** CC skill must collect Phase 1 section summaries + verdicts + red flags and include them in Phase 2 agent prompts as "Prior Analysis Context." Same for Phase 2 -> Phase 3.
**Warning signs:** Phase 2 sections contradict Phase 1 findings. Phase 3 valuation ignores moat weaknesses identified in Phase 1.

### Pitfall 3: PSR Token Budget Explosion
**What goes wrong:** Annual reader tries to read 10 full 10-Ks (200K+ tokens each), exceeding context window and budget.
**Why it happens:** 10-K filings are massive. Even converted to markdown, a single 10-K can be 100K-200K tokens.
**How to avoid:** PSR agents must use readFilingSection tool to read SPECIFIC SECTIONS (business description, risk factors, MD&A, compensation) rather than entire filings. The tool returns targeted excerpts. Prompt must instruct: "Read sections, not entire filings."
**Warning signs:** Agent context fills before processing recent filings. Cost per company exceeds $10.

### Pitfall 4: Checkpoint Dialogue Breaks CC Skill Flow
**What goes wrong:** After a checkpoint, the CC skill loses track of generated sections or agent outputs, causing Phase 2 to start from scratch.
**Why it happens:** CC skill state is ephemeral within the conversation. If checkpoint dialogue creates too many turns, earlier context can fall off.
**How to avoid:** Save all section outputs to .thes1s/reports/{TICKER}/sections/ immediately after each agent completes. After checkpoint, re-read section JSONs from disk rather than relying on conversation context. progressState.js supports this pattern.
**Warning signs:** Sections generated in Phase 1 are "forgotten" in Phase 2. Agent receives empty prior context.

### Pitfall 5: FGR Derivation Producing Superficial Results
**What goes wrong:** Valuation-specialist presents generic FGR inputs without company-specific evidence. PM has nothing meaningful to confirm or challenge.
**Why it happens:** Agent doesn't have access to prior section findings when deriving FGR. Or prompt doesn't require specific evidence per input.
**How to avoid:** FGR runs in Phase 3 AFTER all prior sections complete (per D-15). Agent receives: all 9 prior section summaries, PSR findings, full DataPacket. Prompt must require: specific data source, confidence justification, and reasoning for each of the 5 inputs.
**Warning signs:** FGR inputs are round numbers without sourcing. "Historical composite: 12%" with no breakdown of Big 4 rates.

### Pitfall 6: SensitivityTable MOS-Proximity Coloring Breaks on Edge Cases
**What goes wrong:** Color coding shows incorrect buy/sell signals when current price is null or buy prices are negative.
**Why it happens:** Not all valuation methods produce positive prices for all input combinations. Current price may not be available.
**How to avoid:** Guard against null/negative values: `if (cellValue == null || cellValue <= 0) return default styling`. If currentPrice is null, skip color coding entirely.
**Warning signs:** Green cells for clearly overvalued stocks, negative price cells with green background.

### Pitfall 7: Phase 5B UI Polish Debt Ignored
**What goes wrong:** PitchDeck.jsx inherits the same UI issues documented in 05B and 05D polish notes (unformatted data grids, unreadable text blobs, invisible citations).
**Why it happens:** SectionRenderer.jsx improvements deferred from Phase 5B are still pending.
**How to avoid:** Apply SectionRenderer fixes (data formatting, markdown parsing, citation visibility) in Phase 6C as shared improvements that benefit both OnePager and PitchDeck.
**Warning signs:** Pitch Deck sections show raw JSON in data grids, wall-of-text narratives without structure.

## Code Examples

### Existing sensitivityTable() API (valuation.js)

```javascript
// Source: src/engines/valuation.js line 259
export function sensitivityTable({ method, baseInputs, param1, param2 }) {
  // method: 'mos' | 'pbt' | 'tenCap' | 'equityBond'
  // baseInputs: { fgr, eps, futurePE, marr, ... }
  // param1: { key: 'fgr', values: [0.08, 0.10, 0.12, 0.14, 0.16] }
  // param2: { key: 'eps', values: [5.00, 5.50, 6.00, 6.50, 7.00] }
  // Returns: 2D array of buy prices
}
```

### Existing createFGR() structure (fgr.js)

```javascript
// Source: src/engines/fgr.js
export function createFGR() {
  return {
    rearViewMirror: { value: null, source: '', notes: '' },
    marketRelativity: { value: null, source: '', notes: '' },
    companyGuidance: { value: null, source: '', notes: '' },
    sectorIndustry: { value: null, source: '', notes: '' },
    analysts: { value: null, source: '', notes: '' },
  };
}
// marketRelativity is qualitative -- not included in numeric average
```

### Existing report JSON structure (from COST one-pager)

```javascript
// Source: .thes1s/reports/COST/one-pager.json
{
  "ticker": "COST",
  "companyName": "Costco Wholesale Corporation",
  "stage": "onePager",
  "generatedAt": "2026-03-25T01:14:24.986Z",
  "sections": [
    {
      "key": "company_info",
      "title": "Company Information",
      "sectionNumber": 1,
      "status": "pass",
      "confidence": "HIGH",
      "verdict": "PASS",
      "verdictRationale": "...",
      "summary": "...",
      "data": { /* section-specific structured data */ },
      "narrative": "...",
      "citations": [{ "id": 1, "source": "...", "url": "", "note": "..." }],
      "redFlags": ["..."],
      "primarySourceInsights": [],
      "crossCuttingFindings": [],
      "generatedAt": "...",
      "modelUsed": "claude-sonnet-4-20250514",
      "tokenCost": { "input": 0, "output": 0 }
    }
    // ... 6 sections total for one-pager
  ],
  "overallVerdict": "PASS",
  "sectionKeys": [...]
}
```

### Pitch Deck report JSON extension (additional fields)

```javascript
// Pitch Deck extends the one-pager pattern with:
{
  "stage": "pitchDeck",
  "sections": [/* 10 ReportSectionSchema objects */],
  "checkpoints": [
    {
      "afterPhase": 1,
      "dataGaps": ["No company guidance found for FY2027"],
      "pmNotes": "Focus on international expansion",
      "sectionConfidence": { "radar": "HIGH", "simple_predictable": "HIGH", "market_position": "MEDIUM" }
    }
    // ... 3 checkpoints
  ],
  "fgrDerivation": {
    "finalLow": 0.10,
    "finalHigh": 0.14,
    "inputs": [
      { "name": "Historical Composite", "value": 0.123, "confidence": "HIGH", "source": "..." }
      // ... 5 inputs
    ]
  },
  "sensitivityTables": {
    "mos": { "rowLabel": "FGR (%)", "colLabel": "EPS ($)", "rows": [...], "cols": [...], "cells": [[...]] },
    "pbt": { ... },
    "tenCap": { ... },
    "equityBond": { ... }
  },
  "assumptions": [
    { "key": "fgrLow", "label": "FGR Low", "value": "10%", "confidence": "HIGH", "source": "...", "affectsSections": ["valuation"] }
    // ... more assumptions
  ]
}
```

### useOnePager pattern (to clone for usePitchDeck)

```javascript
// Source: src/hooks/useOnePager.js
// Key pattern: fetch report + progress in parallel, poll every 2s during generation
export function useOnePager(ticker) {
  // Returns { report, progress, loading, error }
  // Polls /api/thes1s/reports/{ticker}/progress every 2s
  // On COMPLETE: re-fetches /api/thes1s/reports/{ticker}/one-pager
  // usePitchDeck will fetch /api/thes1s/reports/{ticker}/pitch-deck instead
}
```

### Dispatch table structure (existing, needs update)

```javascript
// Source: agents/orchestrator/dispatch-table.json
// pitchDeck.preProcessing currently references "primary-source-reader"
// Must be updated to:
"preProcessing": [
  { "step": "data-assembly", "agent": "data-assembler", "parallel": false },
  { "step": "annual-reading", "agent": "annual-reader", "parallel": false, "dependsOn": "data-assembly" },
  { "step": "quarterly-reading", "agent": "quarterly-reader", "parallel": true, "dependsOn": "data-assembly" }
]
// Note: annual-reader and quarterly-reader can run in parallel after data-assembly
```

### Agent config pattern for new agents

```javascript
// annual-reader config.json (derived from primary-source-reader)
{
  "role": "annual-reader",
  "model": "opus",  // Large context for 10-K processing
  "curriculum": [],  // No methodology curriculum -- reads raw filings
  "compressionPolicy": "none",
  "universalContext": true,
  "universalContextFiles": [
    "knowledge/research-references/rule-one-fundamentals.md",
    "knowledge/research-references/tools-for-analysis.md"
  ],
  "dataPacketSlice": ["companyInfo", "classification", "financials", "ttm"],
  "tools": ["readFilingSection"],
  "sections": { "onePager": [], "pitchDeck": [], "fullStory": [] }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single primary-source-reader | annual-reader + quarterly-reader (D-08) | Phase 6 | Better separation of concerns: 10yr deep history vs recent quarterly narrative |
| No checkpoints | 3 structured checkpoints with conversational dialogue | Phase 6 | PM can redirect, inject data, challenge findings between phases |
| FGR as single number | FGR Low/High range from 5-input derivation with PM confirmation | Phase 6 | More defensible valuations with documented assumptions |
| 1-phase dispatch (one-pager) | 3-phase dispatch with inter-phase context (pitch deck) | Phase 6 | Later phases benefit from earlier findings, enables progressive refinement |

## Open Questions

1. **Token budget for PSR agents**
   - What we know: A single 10-K can be 100-200K tokens. Annual reader processes 10 years.
   - What's unclear: Actual token consumption when using readFilingSection (targeted sections) vs full filings.
   - Recommendation: Measure during first real generation run. Start with targeted sections (business desc, risk factors, MD&A, compensation). If budget allows, expand scope.

2. **Inter-phase context size**
   - What we know: Phase 2 agents need Phase 1 outputs for context.
   - What's unclear: Whether to pass full section JSON or summaries-only. Full sections could be 5-10K tokens each (3 sections = 15-30K).
   - Recommendation: Pass section summaries (1-2 sentences each per ReportSectionSchema) + verdicts + red flags. Save full sections to disk; agents can request specifics via tools if needed.

3. **Checkpoint dialogue routing to agents**
   - What we know: PM questions should go to the agent that produced the section (D-07).
   - What's unclear: How to preserve the agent's context window for follow-up questions (agent has already finished).
   - Recommendation: Re-invoke the agent with original prompt + section output + PM question as follow-up context. This is a fresh call, not a continuation. Include the agent's own section output so it has context.

4. **Synthesis writer's role in Pitch Deck**
   - What we know: dispatch-table.json shows synthesis-writer in postProcessing with note "Final polish pass across all sections."
   - What's unclear: Whether synthesis-writer rewrites all 10 narratives or just adds a conclusion. ReportSectionSchema doesn't have a "conclusion" section for pitch deck.
   - Recommendation: Synthesis-writer reviews all 10 sections and produces the overallVerdict + polishes any sections where quality score is low. Does not add an 11th section.

5. **Writing briefs for annual-reader and quarterly-reader**
   - What we know: primary-source-reader-brief.md exists but covers the combined role.
   - What's unclear: Exact split of responsibilities between annual and quarterly.
   - Recommendation: Split the brief into two focused documents. Annual = 10-Ks + proxies + shareholder letters + historical data verification. Quarterly = 10-Qs + transcripts + recent guidance + promise tracking. Both get readFilingSection; only quarterly gets getTranscriptExcerpt.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Data assembly, ESM loader | Yes | 24.13.1 | -- |
| npm | Package management | Yes | 11.8.0 | -- |
| Vitest | Testing | Yes | 4.1.0 | -- |
| Claude API key | Agent dispatch | Yes | In .env.local | -- |
| EDGAR API | Financial data | Yes | Free, rate-limited | -- |
| Finnhub key | Transcripts | Conditional | In .env.local if set | Alpha Vantage |
| Alpha Vantage key | Transcripts (fallback) | Conditional | In .env.local if set | None (transcripts optional) |

**Missing dependencies with no fallback:** None -- all required infrastructure is available.

**Missing dependencies with fallback:** Transcript APIs are conditional. If neither Finnhub nor Alpha Vantage keys are set, the quarterly-reader operates without transcripts (10-Q only). The prompt should handle this gracefully.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | vitest.config.js (inferred from vite.config.js) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PTCH-01 | CC skill dispatches 3 phases with correct agents | manual-only | Manual: run /generate:pitch-deck on test ticker | N/A (CC skill) |
| PTCH-02 | PitchDeck.jsx renders 10 sections from report JSON | unit | `npx vitest run src/components/__tests__/pitchDeck.test.js -x` | Wave 0 |
| PTCH-03 | Checkpoint data stored in report JSON | unit | `npx vitest run src/schemas/__tests__/pitchDeckReport.test.js -x` | Wave 0 |
| PTCH-05 | SensitivityTable computes and renders correctly | unit | `npx vitest run src/components/__tests__/sensitivityTable.test.js -x` | Wave 0 |
| PTCH-06 | FGR derivation summary renders 5 inputs | unit | `npx vitest run src/components/__tests__/pitchDeck.test.js -x` | Wave 0 |
| PTCH-07 | PSR agents produce structured insights JSON | manual-only | Manual: run generation, inspect insights files | N/A (CC skill) |
| PTCH-10 | Dual owner earnings (ruleOne + graham methods) | unit | `npx vitest run src/engines/__tests__/valuation.test.js -x` | Exists (valuation.js tests) |
| CMD-01 | Section re-run dispatches single agent | manual-only | Manual: run /generate:section | N/A (CC skill) |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green + manual LULU parity comparison before /gsd:verify-work

### Wave 0 Gaps
- [ ] `src/components/__tests__/pitchDeck.test.js` -- covers PTCH-02 (10 sections render), PTCH-06 (FGR display)
- [ ] `src/components/__tests__/sensitivityTable.test.js` -- covers PTCH-05 (matrix computation, color coding, edge cases)
- [ ] `src/schemas/__tests__/pitchDeckReport.test.js` -- covers PTCH-03 (checkpoint schema, fgrDerivation, assumptions)
- [ ] `src/hooks/__tests__/usePitchDeck.test.js` -- covers report loading + progress polling

## Sources

### Primary (HIGH confidence)
- `.claude/skills/generate-one-pager/SKILL.md` -- 346-line CC skill, verified working pattern for pitch deck skill
- `agents/orchestrator/dispatch-table.json` -- Pitch Deck dispatch: 3 phases, agent assignments, checkpoints
- `agents/orchestrator/config.json` -- Section-to-agent mapping, checkpoint rules
- `src/engines/valuation.js` -- MOS, PBT, TenCap, EquityBond, sensitivityTable() implementations
- `src/engines/fgr.js` -- FGR 5-input structure + computation
- `src/schemas/reportSection.js` -- ReportSectionSchema (Zod v4, JSON Schema output)
- `src/schemas/progress.js` -- ProgressSchema with pitchDeck stage support
- `src/engines/progressState.js` -- State machine with pitchDeck section keys
- `src/components/OnePager.jsx` -- Working report viewer (pattern for PitchDeck.jsx)
- `src/hooks/useOnePager.js` -- Report loading hook (pattern for usePitchDeck.js)
- `src/components/SectionRenderer.jsx` -- Reusable section display component
- `.thes1s/reports/COST/one-pager.json` -- Working output proving pipeline end-to-end
- All 8 agent config.json files -- Model, curriculum, DataPacket slice, tools
- All writing briefs in agents/writing-briefs/ -- Requirements for new prompts
- `gstack/plans/gstack-ai-agent-workflow-plan-20260323.md` -- Authoritative architecture plan
- `.planning/phases/06-pitch-deck/06-CONTEXT.md` -- 17 locked decisions
- `.planning/phases/06-pitch-deck/06-UI-SPEC.md` -- Complete UI design contract

### Secondary (MEDIUM confidence)
- Agent prompt quality expectations based on business-analyst.md (539 lines) and financial-analyst.md (648 lines) as depth benchmarks

### Tertiary (LOW confidence)
- Token budget estimates for PSR agents (theoretical until measured -- Open Question 1)
- Pitch Deck CC skill line count estimate (600-800 lines -- extrapolation from one-pager at 346 lines with 3x complexity)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed and verified
- Architecture: HIGH -- dispatch table, schemas, state machine, and one-pager skill pattern all exist and are proven
- Agent prompts: MEDIUM -- writing briefs exist but actual prompts need authoring via /writing-skills; quality depends on TDD iteration
- UI components: HIGH -- OnePager.jsx pattern proven, SectionRenderer reusable, UI-SPEC complete
- Pitfalls: HIGH -- based on actual Phase 5C experience generating COST one-pager + documented polish notes
- CC skill complexity: MEDIUM -- checkpoint dialogue and inter-phase context are new patterns not yet proven

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable architecture, no fast-moving dependencies)
