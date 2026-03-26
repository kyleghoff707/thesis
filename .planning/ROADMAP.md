# Roadmap: Thes1s AI Agent Workflow

## Overview

Transform Thes1s from a financial data toolbox into a hedge-fund-quality AI research operation. Seven phases across five milestones take the project from agent definitions through a 3-stage gated report pipeline (One Pager, Pitch Deck, Full Story) to polished export. Build order validates AI output quality before UI investment: foundation first (5A), then real analysis (5C), then display (5B), then quality guardrails (5D), then the hard stuff (6, 7), then polish (8). Every milestone gate is user-verified against the LULU benchmark.

## Milestones

- **Milestone 1: Agent Definitions & Foundation** - Phase 5A
- **Milestone 2: One Pager Pipeline** - Phases 5C, 5B, 5D
- **Milestone 3: Pitch Deck** - Phase 6
- **Milestone 4: Full Story** - Phase 7
- **Milestone 5: Polish & Delight** - Phase 8

## Phases

**Phase Numbering:**
- Phases use 5A/5B/5C/5D for the One Pager sub-phases, then 6/7/8 for subsequent stages
- Execution order: 5A -> 5C -> 5B -> 5D -> 6 -> 7 -> 8 (5C before 5B is intentional)

- [ ] **Phase 5A: Agent Definitions & Foundation** - 9 agent roles, DataPacket assembly, report schema, Node.js data bridge
- [ ] **Phase 5C: CC Skill + First Analysis** - One Pager generation via CC skill, first real LULU benchmark comparison
- [ ] **Phase 5B: One Pager Display Components** - OnePager.jsx, StatusBadge.jsx, SectionRenderer.jsx, progress dashboard
- [ ] **Phase 5D: Quality System** - critic.js citation validation, completeness scoring, context budget management
- [ ] **Phase 6: Pitch Deck** - Multi-agent orchestration, 10 sections, checkpoints, sensitivity tables, deep-dive features
- [ ] **Phase 7: Full Story & Debate** - Bull/Bear/Judge debate, scored checklists, Management Promise Tracker, trading strategy
- [ ] **Phase 8: Polish & Export** - PDF export, citation system, working vs export view, version history, in-app API generation

## Phase Details

### Phase 5A: Agent Definitions & Foundation
**Goal**: The entire agent infrastructure exists and is verified correct -- 9 agent roles defined with curriculum, DataPacket assembles all engine output into canonical JSON, report schema enforces structured output, and Node.js bridge enables engines to run outside the browser
**Depends on**: Nothing (first phase -- builds on existing Phases 1-4 data engines)
**Requirements**: AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, DATA-01, DATA-02, DATA-03, DATA-04, SCHM-01, SCHM-02, SCHM-03, SCHM-04
**Success Criteria** (what must be TRUE):
  1. User can read each of the 9 agent definitions in `agents/` and verify they correctly encode Rule One methodology for their role (curriculum refs, DataPacket slice, Toolbox tools)
  2. Running `dataExport.js` for any ticker produces a complete DataPacket JSON with output from all 20+ engines
  3. Report JSON schema validates a sample section object and rejects malformed output (Zod enforcement works)
  4. Node.js data bridge runs the same engines that work in-browser, producing identical DataPacket output from the command line
  5. Generation state can be saved to and resumed from `.thes1s/reports/{TICKER}/progress.json`
**Plans:** 5 plans

Plans:
- [x] 05A-01-PLAN.md — Zod schemas (report section, DataPacket, progress) + dependency install
- [x] 05A-02-PLAN.md — Node.js data bridge (nodeAdapter.js with browser API shims)
- [x] 05A-03-PLAN.md — DataPacket assembly (dataExport.js) + Toolbox tool wrappers (toolbox.js)
- [x] 05A-04-PLAN.md — Agent config.json files (9 roles) + writing briefs for /writing-skills
- [x] 05A-05-PLAN.md — Orchestrator definition (dispatch table) + generation state persistence

### Phase 5C: CC Skill + First Analysis
**Goal**: A real One Pager is generated for a test ticker via CC skill, and the output quality is validated against the LULU benchmark -- proving the agent architecture works before any UI is built
**Depends on**: Phase 5A
**Requirements**: ONEP-01, ONEP-06
**Success Criteria** (what must be TRUE):
  1. User can run `/generate:one-pager {TICKER}` and receive a complete 6-section One Pager with verdict badges, citations, and red flags
  2. Generated One Pager achieves 80%+ section depth match vs the LULU One Pager benchmark (user-verified comparison)
  3. Every quantitative claim in the output traces to a DataPacket field path or external source -- no fabricated numbers
  4. LULU examples are confirmed absent from agent context during generation (contamination boundary holds)
**Plans:** 4 plans

Plans:
- [x] 05C-01-PLAN.md — Author business-analyst + financial-analyst prompts via /writing-skills
- [x] 05C-02-PLAN.md — Author valuation-specialist + synthesis-writer prompts via /writing-skills
- [x] 05C-03-PLAN.md — CLI DataPacket assembly script + CC skill orchestrator
- [ ] 05C-04-PLAN.md — First generation run + LULU benchmark comparison

### Phase 5B: One Pager Display Components
**Goal**: Users can view, navigate, and approve generated One Pagers inside the Thes1s desktop app with real-time generation progress
**Depends on**: Phase 5C (display components render what the CC skill actually produces)
**Requirements**: ONEP-02, ONEP-03, ONEP-04, ONEP-05
**Success Criteria** (what must be TRUE):
  1. User can view a generated One Pager in-app with all 6 sections rendered, inline citations clickable, and verdict badges (PASS/FAIL/REVIEW/WATCHLIST) visible
  2. During generation, a progress dashboard shows which agent is working, which sections are complete, and estimated time remaining
  3. User can approve or reject the One Pager at the gate, and the decision persists in the report data model
  4. Section renderer handles all report schema fields: narrative, tables, charts, red flags, citations, confidence levels
**Plans:** 3 plans

Plans:
- [x] 05B-01-PLAN.md — Vite middleware data bridge + useOnePager hook + VerdictBadge + ConfidenceBadge
- [x] 05B-02-PLAN.md — SectionRenderer + CitationTooltip + RedFlagCallout sub-components
- [x] 05B-03-PLAN.md — OnePager page component + route wiring + visual verification

**UI hint**: yes

### Phase 5D: Quality System
**Goal**: Every generated section passes automated quality checks -- citations validated, completeness scored, confidence justified, and token budgets measured
**Depends on**: Phase 5C (needs real generated output to validate against)
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06, QUAL-07, QUAL-08
**Success Criteria** (what must be TRUE):
  1. `critic.js` validates that every claim in a generated section traces to a DataPacket field path, SEC filing, or URL -- and flags any untraceable claims
  2. Completeness scoring reports which required fields are present vs missing per section, with a percentage score
  3. Confidence levels (HIGH/MEDIUM/LOW) are justified by data completeness and source agreement -- not arbitrary
  4. Agent failure triggers retry-then-escalate: one retry with error context, then escalation to user if still failing
  5. `contextBudget.js` measures actual token usage per agent call and reports totals per generation run
**Plans:** 3 plans

Plans:
- [x] 05D-01-PLAN.md — critic.js validation engine (citation, completeness, confidence, multi-source, red flags, data gaps)
- [x] 05D-02-PLAN.md — contextBudget.js token estimation and cost tracking
- [ ] 05D-03-PLAN.md — Quality system integration into CC skill + failure recovery

### Phase 6: Pitch Deck
**Goal**: Users can generate a 10-section Pitch Deck through multi-agent orchestration with structured checkpoints, achieving full parity with the LULU Pitch Deck benchmark in depth and rigor
**Depends on**: Phase 5D (quality guardrails must exist before scaling to 15+ AI calls)
**Requirements**: PTCH-01, PTCH-02, PTCH-03, PTCH-04, PTCH-05, PTCH-06, PTCH-07, PTCH-08, PTCH-09, PTCH-10, PTCH-11, PTCH-12, PTCH-13, PTCH-14, PTCH-15, PTCH-16, CMD-01, CMD-03
**Success Criteria** (what must be TRUE):
  1. User can run `/generate:pitch-deck {TICKER}` and receive a 10-section Pitch Deck with 3-phase generation (parallel Phase 1, sequential Phase 2, context-heavy Phase 3) and structured checkpoints after each phase
  2. At each checkpoint, user can ask contextual questions ("show me how you calculated that", "why deeper on A but not B?"), provide missing data, redirect analysis, or approve -- not just click "next"
  3. FGR derivation workflow walks the user through 5 inputs (Historical, Market Relativity, Company Guidance, Industry CAGR, Analyst Consensus) with user confirmation before valuation calculations proceed
  4. Sensitivity tables vary FGR/EPS/CapEx% across all 4 valuation methods (MOS, PBT, Ten Cap, Equity Bond) and display buy price ranges
  5. Generated Pitch Deck achieves full parity (and deeper) vs LULU Pitch Deck benchmark -- every section as thorough, with competitor benchmarking (15+ peers), market share ceiling analysis, and dual owner earnings (user-verified)
**Plans:** 2/12 plans executed
**UI hint**: yes

Plans:
- [x] 06A-01-PLAN.md — New PSR agent directories (annual-reader + quarterly-reader) + configs + briefs + dispatch-table update
- [x] 06A-02-PLAN.md — Light update pass on 4 existing agent prompts for Pitch Deck depth
- [x] 06A-03-PLAN.md — Author competitor-evaluator prompt via /writing-skills
- [x] 06A-04-PLAN.md — Author management-evaluator prompt via /writing-skills
- [x] 06A-05-PLAN.md — Author risk-analyst prompt via /writing-skills
- [x] 06A-06-PLAN.md — Author annual-reader + quarterly-reader prompts via /writing-skills
- [x] 06B-01-PLAN.md — /generate:pitch-deck CC skill (3-phase dispatch + checkpoints + PSR + FGR)
- [x] 06B-02-PLAN.md — /generate:section CC skill (CMD-01 single section re-run)
- [x] 06C-01-PLAN.md — SectionRenderer UI debt fixes + usePitchDeck hook + Vite middleware
- [x] 06C-02-PLAN.md — PitchDeck.jsx + SensitivityTable.jsx + routes + visual verification
- [x] 06D-01-PLAN.md — DeepDivePanel + IndustryCard + AssumptionTracker delight features
- [ ] 06D-02-PLAN.md — LULU parity verification (generation run + PM comparison)

### Phase 06.2: Data Pipeline Hardening — Make DataPacket assembly, guru prefetch, and filing pre-processing bulletproof for any company (INSERTED)

**Goal:** Make the data pipeline bulletproof for any company -- form-aware filing extraction (10-K and 10-Q), expanded filing depth (5 10-Ks, 8 10-Qs), guru prefetch CUSIP-to-ticker resolution, analyst estimates fallback chain, DataPacket parallelization, and a data quality checkpoint that gates agent dispatch
**Requirements**: DPH-01, DPH-02, DPH-03, DPH-04, DPH-05, DPH-06, DPH-07
**Depends on:** Phase 6
**Plans:** 3 plans

Plans:
- [ ] 06.2-01-PLAN.md — Form-aware filing section extraction (SECTION_MAP_10K/10Q) + preprocess-filings.js depth expansion
- [ ] 06.2-02-PLAN.md — Guru prefetch ticker resolution fix + DataPacket retry/fallback/parallelization
- [ ] 06.2-03-PLAN.md — Data quality checkpoint script + SKILL.md pipeline integration

### Phase 06.1: Pipeline Hardening (INSERTED)

**Goal:** Make the Pitch Deck generation pipeline production-grade by fixing all 42 engineering issues from the COST debrief -- DataPacket 90%+ populated in Node.js, filing pre-processing to markdown, automated CC orchestration, web search enforcement, and PM progress visibility
**Requirements**: D-01-a through D-01-j, D-02-a through D-02-d, D-03-a, D-04-a through D-04-c, D-05-a, D-06-a through D-06-c, D-07-a through D-07-d, D-08
**Depends on:** Phase 6
**Plans:** 5/5 plans complete

Plans:
- [x] 06.1-01-PLAN.md — DataPacket Node.js fixes (DOMParser, IndexedDB, Vite middleware shims, cache routing, filing assembler)
- [x] 06.1-02-PLAN.md — Filing tools + PSR optimization (filingSections.js, readFilingSection, getTranscriptExcerpt)
- [x] 06.1-03-PLAN.md — CC orchestration automation (SKILL.md: file write fallback, retry, progress writes, filing pre-processing)
- [x] 06.1-04-PLAN.md — Quality enforcement (searchesPerformed schema, Required Searches prompts, critic.js audit)
- [ ] 06.1-05-PLAN.md — PM experience (generation-status.json middleware, usePitchDeck extension, status panel UI)

### Phase 7: Full Story & Debate
**Goal**: Users can generate the deepest analysis stage with Bull/Bear/Judge adversarial debate, scored checklists (43 items), and Management Promise Tracker -- achieving full parity with the LULU Full Story benchmark
**Depends on**: Phase 6 (Full Story inherits all Pitch Deck findings and agent maturity)
**Requirements**: FLST-01, FLST-02, FLST-03, FLST-04, FLST-05, FLST-06, FLST-07, FLST-08, FLST-09, FLST-10, CMD-02
**Success Criteria** (what must be TRUE):
  1. User can run `/generate:full-story {TICKER}` and receive an 8-section Full Story with 3-phase dispatch (sequential analysis, structured debate, strategy) and checkpoints
  2. Bull/Bear/Judge debate produces genuine adversarial analysis -- synthesis-writer argues the bull case, risk-analyst attacks with evidence, financial-analyst scores each rebuttal -- with a scored transcript viewable in DebateView
  3. Scored checklists (Meaning 15pt, Moat 15pt, Management 13pt = 43 items) produce item-level scores with evidence citations, not just checkmarks
  4. Management Promise Tracker extracts forward-looking statements from earnings call transcripts, tags them by quarter/year, and compares promises to actual results with credibility metrics
  5. Generated Full Story achieves full parity (and deeper) vs LULU Full Story benchmark (user-verified)
**Plans**: TBD
**UI hint**: yes

### Phase 8: Polish & Export
**Goal**: Generated reports are presentation-ready with branded PDF export, academic-style citations, version history, and in-app API generation for the commercial path
**Depends on**: Phase 7 (polish layer needs all three stages complete and quality-proven)
**Requirements**: EXPT-01, EXPT-02, EXPT-03, EXPT-04, EXPT-05, EXPT-06
**Success Criteria** (what must be TRUE):
  1. User can export any completed report as a branded PDF with Thes1s aesthetic, embedded charts, footnoted citations, and executive summary front page
  2. Citation hover shows the actual source text (10-K paragraph, transcript excerpt) -- not just a link
  3. User can toggle between working view (raw checklist with color-coded status) and export view (polished narrative) for any report
  4. Version history shows diffs between report iterations, so the user can see what changed after regenerating a section
  5. In-app "Generate" button triggers the same pipeline via `aiResearch.js` (Claude API direct), producing identical quality to the CC skill path
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute: 5A -> 5C -> 5B -> 5D -> 6 -> 06.1 -> 06.2 -> 7 -> 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 5A. Agent Definitions & Foundation | M1 | 0/5 | Planning complete | - |
| 5C. CC Skill + First Analysis | M2 | 0/4 | Planning complete | - |
| 5B. One Pager Display Components | M2 | 0/3 | Planning complete | - |
| 5D. Quality System | M2 | 0/3 | Planning complete | - |
| 6. Pitch Deck | M3 | 2/12 | In Progress|  |
| 06.1. Pipeline Hardening | M3 | 4/5 | Complete    | 2009-03-26 |
| 06.2. Data Pipeline Hardening | M3 | 0/3 | Planning complete | - |
| 7. Full Story & Debate | M4 | 0/? | Not started | - |
| 8. Polish & Export | M5 | 0/? | Not started | - |
