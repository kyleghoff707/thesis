# Requirements: Thes1s AI Agent Workflow

**Defined:** 2026-03-24
**Core Value:** Depth of investigation that exceeds what a single human analyst can achieve in 70+ hours — delivered in minutes, with zero shortcuts on rigor.

## v1 Requirements

### Agent Infrastructure

- [x] **AGNT-01**: 9 agent role definitions in `agents/` directory — each with prompt.md (system prompt), config.json (curriculum refs, DataPacket slice, Toolbox tools, model), README.md
- [x] **AGNT-02**: Universal agent context loaded into every AI agent — `rule-one-fundamentals.md`, `tools-for-analysis.md`, 7 Operating Rules
- [x] **AGNT-03**: Agent curriculum injection at full depth — no compression, no summarization. The depth IS the competitive edge.
- [x] **AGNT-04**: Example contamination boundary — LULU examples never enter agent context during generation
- [x] **AGNT-05**: Orchestrator definition — dispatch table, phase definitions, checkpoint rules, section-to-agent mapping

### Data Layer

- [x] **DATA-01**: DataPacket assembly (`dataExport.js`) — all 20+ engine outputs into canonical JSON
- [x] **DATA-02**: Node.js data bridge (~500-800 LOC) — `import.meta.env` → dotenv, DOMParser → linkedom, Vite proxy → direct fetch, localStorage/IndexedDB → file-based JSON cache
- [x] **DATA-03**: 12+ Toolbox tools callable by agents — computeMOS, computePBT, computeTenCap, computeEquityBond, sensitivityTable, getMetric, getFinancialLine, computeGrowthRates, comparePeers, readFilingSection, getTranscriptExcerpt
- [x] **DATA-04**: DataPacket slicing — each agent gets only its relevant data slice, not the full DataPacket. Less context = better output.

### Report Schema

- [x] **SCHM-01**: Report JSON schema per section — key, title, status, confidence, verdict, verdictRationale, summary, data, narrative, citations, tables, charts, redFlags, primarySourceInsights, generatedAt, modelUsed, tokenCost
- [x] **SCHM-02**: JSON schema enforcement via Claude structured outputs (constrained decoding, not just prompting)
- [x] **SCHM-03**: Backward-compatible with existing report data model in localStorage
- [x] **SCHM-04**: Generation state persistence — `.thes1s/reports/{TICKER}/progress.json` — resume after crash/interruption

### One Pager (Stage 1)

- [x] **ONEP-01**: CC skill `/generate:one-pager` orchestrating data-assembler + financial-analyst + business-analyst + synthesis-writer
- [ ] **ONEP-02**: `OnePager.jsx` — 6-section renderer with verdict badges
- [ ] **ONEP-03**: `StatusBadge.jsx` — PASS/FAIL/REVIEW/WATCHLIST badges
- [ ] **ONEP-04**: `SectionRenderer.jsx` — reusable section display with inline citations `[1]`, `[2]`
- [ ] **ONEP-05**: Real-time progress dashboard during generation (which agent working, sections complete, ETA)
- [ ] **ONEP-06**: 80%+ section depth match vs LULU One Pager benchmark (user-verified)

### Pitch Deck (Stage 2)

- [ ] **PTCH-01**: CC skill `/generate:pitch-deck` with 3-phase agent dispatch (parallel Phase 1, sequential Phase 2, context-heavy Phase 3)
- [ ] **PTCH-02**: `PitchDeck.jsx` + 10 section sub-components
- [ ] **PTCH-03**: Structured checkpoints after each phase — findings, data gaps, questions, confidence levels
- [ ] **PTCH-04**: Conversational checkpoint dialogue — PM can ask contextual questions ("show me how you calculated that", "why deeper on A but not B?"), not just approve/redirect. Scoped to section context, not open-ended chat.
- [ ] **PTCH-05**: `SensitivityTable.jsx` — vary FGR/EPS/CapEx% across MOS/PBT/TenCap/EquityBond
- [ ] **PTCH-06**: FGR derivation workflow — 5 inputs (Historical, Market Relativity, Company Guidance, Industry CAGR, Analyst Consensus) with user confirmation
- [ ] **PTCH-07**: Primary Source Reader — 10-K text (business desc, risk factors, MD&A), transcripts (themes, tone, Q&A), proxy (comp, ownership, board), data verification against DataPacket
- [ ] **PTCH-08**: Competitor benchmarking — 15+ peers via peer metrics engine + agent qualitative analysis
- [ ] **PTCH-09**: Market share ceiling analysis — prove growth rate doesn't require unrealistic market dominance
- [ ] **PTCH-10**: Dual Owner Earnings — Rule One method AND Graham method side by side
- [ ] **PTCH-11**: Cyclical business handling — CAGR from "first positive year," multiple capex ratios (through-cycle, expansion-only)
- [ ] **PTCH-12**: Acquisition history tracking — table of all acquisitions with dates, amounts, strategic rationale
- [ ] **PTCH-13**: "Tell me more" deep-dive on any section point (targeted drill-down, not regeneration)
- [ ] **PTCH-14**: Industry context cards — pop-up glossary for industry-specific terms and KPIs
- [ ] **PTCH-15**: Assumption tracker sidebar with confidence levels — central registry, changes cascade through affected sections
- [ ] **PTCH-16**: Full parity (and deeper) vs LULU Pitch Deck benchmark (user-verified)

### Full Story (Stage 3)

- [ ] **FLST-01**: CC skill `/generate:full-story` with 3-phase dispatch — sequential analysis, structured debate, strategy
- [ ] **FLST-02**: `FullStory.jsx` + scored checklists (Meaning 15pt, Moat 15pt, Management 13pt = 43 items)
- [ ] **FLST-03**: Bull/Bear/Judge structured debate — synthesis-writer (bull), risk-analyst (bear), financial-analyst (judge). Scored transcript.
- [ ] **FLST-04**: `DebateView` component — UI for debate transcript with scored rebuttals
- [ ] **FLST-05**: Management Promise Tracker — extract forward-looking statements from transcripts, tag with quarter/year, compare to actuals, produce credibility metrics
- [ ] **FLST-06**: Inversion & Rebuttal — source bear cases with evidence, document rebuttals
- [ ] **FLST-07**: Quick Bull/Bear narrative toggle — switch between thesis perspectives
- [ ] **FLST-08**: Trading Strategy + PACE Plan sections
- [ ] **FLST-09**: Conversational checkpoint dialogue (same as PTCH-04, applied to Full Story checkpoints)
- [ ] **FLST-10**: Full parity (and deeper) vs LULU Full Story benchmark (user-verified)

### Quality System

- [ ] **QUAL-01**: `critic.js` — citation validation (every claim traceable to DataPacket field path, SEC filing, or URL)
- [ ] **QUAL-02**: Completeness scoring — all required fields present per section schema
- [ ] **QUAL-03**: Confidence scoring — HIGH/MEDIUM/LOW based on data completeness and source agreement
- [ ] **QUAL-04**: Multi-source verification — financial metrics need EDGAR + peer, growth projections need CAGR + analyst + industry, moat claims need financial + qualitative evidence
- [ ] **QUAL-05**: Red flags required in every section, even passing ones
- [ ] **QUAL-06**: "Data not available" — honest gaps, never estimated numbers. If not in DataPacket, don't fabricate.
- [ ] **QUAL-07**: Retry-then-escalate failure handling — agent fails → retry once with error context → fail again → escalate to PM
- [ ] **QUAL-08**: `contextBudget.js` — token counting + budget management per agent. Measure actual usage, set budgets based on data.

### Standalone Commands

- [ ] **CMD-01**: `/generate:section TICKER stage section#` — regenerate a specific section without re-running entire stage
- [ ] **CMD-02**: `/debate TICKER` — run inversion debate standalone on any completed pitch deck
- [ ] **CMD-03**: `/fgr TICKER` — run FGR derivation workflow standalone

### Export & Polish

- [ ] **EXPT-01**: `ExportView.jsx` — branded PDF/print view (Thes1s aesthetic, charts, footnoted citations, executive summary front page)
- [ ] **EXPT-02**: `ReferenceList.jsx` — citation manager (40+ numbered references per full analysis)
- [ ] **EXPT-03**: Source preview on citation hover — actual 10-K paragraph or transcript excerpt, not just a link
- [ ] **EXPT-04**: Working view vs export view — raw checklist (color-coded status) for analysis + polished narrative for presentation
- [ ] **EXPT-05**: Version history / diff view between iterations
- [ ] **EXPT-06**: `aiResearch.js` — in-app API-driven generation (commercial path, same schemas/quality as CC skills)

## v2 Requirements (Phase 9+ — Architecture Designed Now)

### Living Intelligence

- **LIVE-01**: Living Thesis Intelligence — re-analysis triggers on new data (quarterly earnings, 10-K filing)
- **XCOM-01**: Cross-Company Intelligence — knowledge graph across analyses. 50th analysis richer than 1st.
- **CONV-01**: Conviction Scoring — Bayesian posterior updates, not binary PASS/FAIL
- **HIST-01**: Historical comparison across reports — diff view of thesis evolution over time

### Platform

- **EVAL-01**: Automated eval system — build after 5-10 manual evals define "good"
- **STIK-01**: stickeR1 evaluation loop integration
- **MULT-01**: Multi-user backend, auth, billing

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated buy/sell signals | PM makes decisions, not the tool. Legal liability. |
| Real-time price alerts / trading | Research tool, not trading platform. stickeR1 handles portfolio. |
| Batch generation (50 companies) | Rule One is deep, not wide. Quality over quantity. $400-600 per batch. |
| Social/crowd-sourced research | Independent analysis. Crowded trades reduce returns. |
| Fine-tuned/custom LLM | Curriculum injection is more flexible. Foundation models improve quarterly. |
| Alternative data (satellite, sentiment) | Fundamental analysis, not quant trading. |
| General-purpose stock chat | Structured workflow with scoped checkpoints, not open-ended chat. |
| Automated portfolio rebalancing | stickeR1's job. Clean separation: Thes1s = research, stickeR1 = portfolio. |
| Sell-side BUY/HOLD/SELL ratings | Rule One uses PASS/FAIL, not 3-tier. Sell-side ratings have known buy bias. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AGNT-01 | Phase 5A | Complete |
| AGNT-02 | Phase 5A | Complete |
| AGNT-03 | Phase 5A | Complete |
| AGNT-04 | Phase 5A | Complete |
| AGNT-05 | Phase 5A | Complete |
| DATA-01 | Phase 5A | Complete |
| DATA-02 | Phase 5A | Complete |
| DATA-03 | Phase 5A | Complete |
| DATA-04 | Phase 5A | Complete |
| SCHM-01 | Phase 5A | Complete |
| SCHM-02 | Phase 5A | Complete |
| SCHM-03 | Phase 5A | Complete |
| SCHM-04 | Phase 5A | Complete |
| ONEP-01 | Phase 5C | Complete |
| ONEP-02 | Phase 5B | Pending |
| ONEP-03 | Phase 5B | Pending |
| ONEP-04 | Phase 5B | Pending |
| ONEP-05 | Phase 5B | Pending |
| ONEP-06 | Phase 5C | Pending |
| PTCH-01 | Phase 6 | Pending |
| PTCH-02 | Phase 6 | Pending |
| PTCH-03 | Phase 6 | Pending |
| PTCH-04 | Phase 6 | Pending |
| PTCH-05 | Phase 6 | Pending |
| PTCH-06 | Phase 6 | Pending |
| PTCH-07 | Phase 6 | Pending |
| PTCH-08 | Phase 6 | Pending |
| PTCH-09 | Phase 6 | Pending |
| PTCH-10 | Phase 6 | Pending |
| PTCH-11 | Phase 6 | Pending |
| PTCH-12 | Phase 6 | Pending |
| PTCH-13 | Phase 6 | Pending |
| PTCH-14 | Phase 6 | Pending |
| PTCH-15 | Phase 6 | Pending |
| PTCH-16 | Phase 6 | Pending |
| FLST-01 | Phase 7 | Pending |
| FLST-02 | Phase 7 | Pending |
| FLST-03 | Phase 7 | Pending |
| FLST-04 | Phase 7 | Pending |
| FLST-05 | Phase 7 | Pending |
| FLST-06 | Phase 7 | Pending |
| FLST-07 | Phase 7 | Pending |
| FLST-08 | Phase 7 | Pending |
| FLST-09 | Phase 7 | Pending |
| FLST-10 | Phase 7 | Pending |
| QUAL-01 | Phase 5D | Pending |
| QUAL-02 | Phase 5D | Pending |
| QUAL-03 | Phase 5D | Pending |
| QUAL-04 | Phase 5D | Pending |
| QUAL-05 | Phase 5D | Pending |
| QUAL-06 | Phase 5D | Pending |
| QUAL-07 | Phase 5D | Pending |
| QUAL-08 | Phase 5D | Pending |
| CMD-01 | Phase 6 | Pending |
| CMD-02 | Phase 7 | Pending |
| CMD-03 | Phase 6 | Pending |
| EXPT-01 | Phase 8 | Pending |
| EXPT-02 | Phase 8 | Pending |
| EXPT-03 | Phase 8 | Pending |
| EXPT-04 | Phase 8 | Pending |
| EXPT-05 | Phase 8 | Pending |
| EXPT-06 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 62 total
- Mapped to phases: 62
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 — traceability updated with per-requirement phase mappings*
