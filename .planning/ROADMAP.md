# Roadmap: Thes1s v1.2 — Full Story Pipeline

## Overview

Build the Full Story (Stage 3) pipeline end-to-end using the same proven playbook as the Pitch Deck: CC skill first to validate quality, then API migration for mechanical compliance. The dispatch table and agent prompts are updated first to support Full Story sections. The scored checklist format (43 items across 3 checklists) and the adversarial debate (4-step Bull/Bear/Rebuttal/Judge) are architecturally novel -- each gets its own phase. Quality scoring extends critic.js with Full Story methodology checks. API migration reuses the proven aiResearch.js infrastructure. End-to-end validation tests the complete One Pager to Pitch Deck to Full Story pipeline on a real ticker.

## Milestones

- v1.0 Agent Infrastructure & Pitch Deck Pipeline (shipped 2026-03-27) -- see MILESTONES.md
- v1.1 API Migration & Pitch Deck Quality (shipped 2026-03-29) -- see MILESTONES.md

<details>
<summary>v1.1 API Migration & Pitch Deck Quality (Phases 7-11) -- SHIPPED 2026-03-29</summary>

### Phase 7: Schema & SDK Foundation
**Goal**: ReportSectionSchema produces valid structured output JSON via the Claude API -- verified with a live smoke test
**Plans:** 2 plans

Plans:
- [x] 07-01-PLAN.md -- Schema modification + critic backward compatibility
- [x] 07-02-PLAN.md -- SDK upgrade + live two-stage smoke test

### Phase 8: Core Agent Dispatch
**Goal**: A single analysis agent produces a complete, quality section via direct Claude API call with web search and structured output
**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md -- Test scaffold, mock fixture, and contextBudget model ID fix
- [x] 08-02-PLAN.md -- aiResearch.js dispatch engine + live integration test

### Phase 9: Parallel Dispatch & Caching
**Goal**: Multiple agents run concurrently with shared prompt caching, and every API call's cost is tracked
**Plans:** 3 plans

Plans:
- [x] 09-01-PLAN.md -- Cache monitor + budget tracker rewrite + Opus pricing fix
- [x] 09-02-PLAN.md -- Cache-enabled dispatch with cache_control breakpoints + Opus pricing fix
- [x] 09-03-PLAN.md -- Pipeline manager with wave-based parallel dispatch

### Phase 10: Pipeline Integration & Prompt Fixes
**Goal**: The full 10-section Pitch Deck generates end-to-end via API with mechanical compliance on every section
**Plans**: 3 plans

Plans:
- [x] 10-01-PLAN.md -- Field path generator + PSR findings formatter
- [x] 10-02-PLAN.md -- Dispatch table split + prompt audit
- [x] 10-03-PLAN.md -- Pipeline runner + live validation

### Phase 11: Validation
**Goal**: The pipeline produces hedge-fund-quality Pitch Decks that meet cost and runtime targets on multiple tickers
**Plans:** 2 plans

Plans:
- [x] 11-01-PLAN.md -- Methodology scoring in critic.js
- [x] 11-02-PLAN.md -- Second ticker pipeline run + validation

</details>

## Phases

**Phase Numbering:**
- Continues from v1.1 (Phases 7-11 archived above)
- Integer phases (12, 13, 14, 15, 16, 17): Planned milestone work
- Decimal phases (12.1, 12.2): Urgent insertions if needed (marked with INSERTED)

- [x] **Phase 12: Full Story Foundation** - Dispatch table updates, agent prompt additions, and checklist scoring format design (completed 2026-03-29)
- [ ] **Phase 13: CC Pipeline** - Full Story CC skill orchestrates 6 sections with Pitch Deck inheritance
- [ ] **Phase 14: Adversarial Debate** - 4-step sequential debate (Bull/Bear/Rebuttal/Judge) with cited evidence
- [ ] **Phase 15: Quality System** - Full Story methodology checks in critic.js with dual scoring
- [ ] **Phase 16: API Migration** - Migrate Full Story from CC to Claude API dispatch with structured outputs
- [ ] **Phase 17: End-to-End Validation** - Complete pipeline validation (OP + PD + FS) on a real ticker

## Phase Details

### Phase 12: Full Story Foundation
**Goal**: The dispatch table, agent prompts, and checklist scoring format are ready for Full Story generation -- all infrastructure before the first section generates
**Depends on**: Phase 11 (v1.1 API infrastructure proven)
**Requirements**: ORCH-02, ORCH-03, ORCH-04
**Success Criteria** (what must be TRUE):
  1. Dispatch table includes all Full Story sections with correct agent assignments -- trading_strategy and pace_plan are removed, S3 ownership uses competitor-evaluator, and the 4-step debate sequence is defined
  2. Each agent prompt file contains Full Story-specific instructions for its assigned sections (financial-analyst for event analysis, business-analyst for meaning checklist, etc.)
  3. Checklist output format is designed and documented -- each of 43 items (Meaning 15, Moat 15, Management 13) has a structured schema with item name, pass/fail/partial verdict, evidence text, and confidence score
**Plans:** 2/2 plans complete

Plans:
- [x] 12-01-PLAN.md -- Dispatch table + agent configs + checklist/debate schema design
- [x] 12-02-PLAN.md -- Agent prompt updates for Full Story sections and debate roles

### Phase 13: CC Pipeline
**Goal**: The Full Story generates end-to-end as a CC skill, producing 5 sections (S1-S5) that inherit Pitch Deck findings as context (S6 debate deferred to Phase 14)
**Depends on**: Phase 12
**Requirements**: ORCH-01
**Success Criteria** (what must be TRUE):
  1. Running the Full Story CC skill on a ticker with an existing Pitch Deck produces 5 sections (event analysis, meaning checklist, moat checklist, management checklist, valuation confirmation) without manual intervention -- S6 (inversion and rebuttal) is a placeholder for Phase 14
  2. Each generated section references specific findings from the Pitch Deck (not re-deriving from scratch) -- visible as citations pointing to prior Pitch Deck section data
  3. Checklist sections produce the scored format defined in Phase 12 -- each checklist item has a verdict and evidence, with total scores tallied
**Plans:** 2 plans

Plans:
- [ ] 13-01-PLAN.md -- Fix progressState.js stale section keys + update generate-section skill
- [ ] 13-02-PLAN.md -- Create generate-full-story CC skill (gate check, PD inheritance, 5-agent dispatch, checkpoint, report assembly)

### Phase 14: Adversarial Debate
**Goal**: The inversion and rebuttal section executes a 4-step adversarial debate that stress-tests the investment thesis from both sides
**Depends on**: Phase 13
**Requirements**: DEBATE-01, DEBATE-02, DEBATE-03, DEBATE-04
**Success Criteria** (what must be TRUE):
  1. The debate executes 4 steps in sequence -- Bull thesis summarizes the investment case, Bear inversion challenges it, Bull rebuttal responds, Judge scores each exchange -- with each step receiving the prior step's output as context
  2. Bear inversion points include web search citations and DataPacket references as evidence (not unsupported assertions)
  3. Bull rebuttal addresses each bear point individually, with cited counter-evidence where available and honest acknowledgment where the bear case is strong
  4. Judge produces a structured verdict for each exchange (Strong Bull / Strong Bear / Unresolved) plus an overall summary with total unresolved risk count
**Plans**: TBD

### Phase 15: Quality System
**Goal**: critic.js scores Full Story sections with methodology checks derived from the Rule One Stage 3 curriculum, matching the dual-scoring pattern proven on Pitch Decks
**Depends on**: Phase 13 (needs generated Full Story output to score)
**Requirements**: QUAL-01, QUAL-03
**Success Criteria** (what must be TRUE):
  1. critic.js includes Full Story methodology checks derived from story-form-I.md and story-form-II.md -- covering event analysis depth, checklist completeness, valuation confirmation rigor, and debate quality
  2. Full Story sections produce dual quality scores (mechanical + methodology) in the same format as Pitch Deck scoring -- scores are comparable across stages
  3. Running the quality scorer on a generated Full Story produces actionable feedback identifying specific methodology gaps (not just pass/fail)
**Plans**: TBD

### Phase 16: API Migration
**Goal**: The Full Story pipeline runs via Claude API dispatch using the proven aiResearch.js infrastructure, with structured output enforcement on all section types including debates and checklists
**Depends on**: Phase 14 (debate pattern proven in CC), Phase 15 (quality scoring ready)
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. All Full Story sections dispatch through aiResearch.js using the same pattern as Pitch Deck -- including wave-based parallelism for independent sections and sequential execution for the debate
  2. Structured output schemas enforce canonical formats for standard sections, checklist sections (43-item scored format), and debate sections (4-step exchange with judge verdict) -- no post-hoc parsing required
  3. Cost per Full Story is benchmarked and combined pipeline cost (OP + PD + FS) is measured against the $8-12 target ceiling, with per-section cost breakdown from the budget tracker
**Plans**: TBD

### Phase 17: End-to-End Validation
**Goal**: At least 1 ticker runs through the complete 3-stage pipeline (One Pager to Pitch Deck to Full Story) with passing quality scores at every stage
**Depends on**: Phase 16
**Requirements**: QUAL-02
**Success Criteria** (what must be TRUE):
  1. A single ticker completes the full pipeline (One Pager generation, Pitch Deck generation, Full Story generation) in one session with no manual data entry or intervention between stages
  2. Each stage's output passes quality scoring -- One Pager passes, Pitch Deck scores 85+ (mechanical + methodology), Full Story scores comparably
  3. The Full Story output demonstrates clear inheritance from the Pitch Deck -- checklist items reference Pitch Deck findings, valuation confirmation uses the same assumptions, debate addresses the same thesis
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 12 -> 13 -> 14 -> 15 -> 16 -> 17

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 7. Schema & SDK Foundation | v1.1 | 2/2 | Complete | 2026-03-28 |
| 8. Core Agent Dispatch | v1.1 | 2/2 | Complete | 2026-03-28 |
| 9. Parallel Dispatch & Caching | v1.1 | 3/3 | Complete | 2026-03-29 |
| 10. Pipeline Integration & Prompt Fixes | v1.1 | 3/3 | Complete | 2026-03-29 |
| 11. Validation | v1.1 | 2/2 | Complete | 2026-03-29 |
| 12. Full Story Foundation | v1.2 | 1/2 | Complete    | 2026-03-29 |
| 13. CC Pipeline | v1.2 | 0/2 | Planned | - |
| 14. Adversarial Debate | v1.2 | 0/? | Not started | - |
| 15. Quality System | v1.2 | 0/? | Not started | - |
| 16. API Migration | v1.2 | 0/? | Not started | - |
| 17. End-to-End Validation | v1.2 | 0/? | Not started | - |
