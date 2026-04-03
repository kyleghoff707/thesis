# Roadmap: Thes1s v1.3 — Report Stage UI

## Overview

v1.3 builds the in-app presentation layer for viewing, navigating, and interacting with AI-generated research reports across all three stages. The pipeline (v1.0-v1.2) generates JSON — this milestone makes that JSON readable, navigable, and interactive inside the desktop app. The build follows strict dependency order: fix broken foundations, extract shared infrastructure, build the FullStory viewer with its specialized renderers, wire up cross-stage navigation, and connect delight feature shells to real data.

## Milestones

- ✅ **v1.0 Agent Infrastructure & Pitch Deck Pipeline** - Phases 5A-6.3 (shipped 2026-03-27)
- ✅ **v1.1 API Migration & Pitch Deck Quality** - Phases 7-11 (shipped 2026-03-29)
- ✅ **v1.2 Full Story Pipeline** - Phases 12-17.1 (shipped 2026-04-02)
- 🚧 **v1.3 Report Stage UI** - Phases 18-23 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (18, 19, 20...): Planned milestone work
- Decimal phases (18.1, 18.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 18: Critical Bug Fixes & Storage Migration** - Fix broken PitchDeck rendering, add Full Story route, migrate report storage to IndexedDB, normalize cross-ticker schema differences (completed 2026-04-02)
- [x] **Phase 19: Shared Report Infrastructure** - Extract shared utilities, scroll spy hook, markdown renderer, and stage navigation bar to prevent triplication when FullStory is added (completed 2026-04-03)
- [x] **Phase 20: Full Story Core Viewer** - Build FullStory.jsx shell with gate check, hero header, section rendering, quality scores, and approval bar (completed 2026-04-03)
- [x] **Phase 21: Checklist & Debate Renderers** - Build ChecklistRenderer for scored checklists and DebateRenderer for adversarial debate with step-specific sub-components (completed 2026-04-03)
- [x] **Phase 22: Stage Gating & Navigation** - Wire approval gates across all stages, build ReportsList for discovery, fix route highlighting, add stage progress overview (completed 2026-04-03)
- [ ] **Phase 23: Delight Feature Wiring** - Connect DeepDivePanel, AssumptionTracker, IndustryCard, and Bull/Bear toggle to report data

## Phase Details

### Phase 18: Critical Bug Fixes & Storage Migration
**Goal**: Users can view existing pipeline output correctly and store reports at scale without data loss
**Depends on**: Nothing (first phase of v1.3)
**Requirements**: FIX-01, FIX-02, FIX-03, FIX-04
**Success Criteria** (what must be TRUE):
  1. User opens a Pitch Deck report and sees all 10 sections rendered with content (not "Pending..." for 5 of them)
  2. User can store reports for 20+ companies without silent save failures or storage quota errors
  3. User can navigate to a Full Story report URL and see content (not a 404 or blank page)
  4. User views reports for MNST, SFM, MSFT, and POOL and sees consistent section data without missing fields or key mismatches
**Plans**: 3 plans

Plans:
- [x] 18-01-PLAN.md — Fix PitchDeck section key mismatches, overall_verdict hero, Full Story Vite route + minimal viewer
- [x] 18-02-PLAN.md — Migrate report storage from localStorage to IndexedDB with auto-migration
- [x] 18-03-PLAN.md — Normalize cross-ticker schema differences in pipeline output + retroactive fix script

### Phase 19: Shared Report Infrastructure
**Goal**: Users see consistent formatting, smooth navigation, and properly rendered markdown across all report stages
**Depends on**: Phase 18
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. User sees identically formatted numbers, currencies, and percentages whether viewing a One Pager, Pitch Deck, or Full Story
  2. User scrolls through any report and sees the active section highlighted in the sidebar nav without flicker
  3. User reads report narratives and sees properly formatted headings, numbered lists, blockquotes, and inline links (not raw markdown syntax or flat text blobs)
  4. User can switch between One Pager, Pitch Deck, and Full Story stages for the same company via a persistent stage nav bar
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [x] 19-01-PLAN.md — Extract reportHelpers.js shared utilities + Spinner.jsx, refactor OnePager and PitchDeck to import from shared modules
- [ ] 19-02-PLAN.md — Build useScrollSpy hook + StageNavBar component, refactor OnePager and PitchDeck to use shared scroll spy
- [x] 19-03-PLAN.md — Install react-markdown + remark-gfm, build ReportMarkdown.jsx wrapper, refactor SectionRenderer to use it

### Phase 20: Full Story Core Viewer
**Goal**: Users can view Full Story reports in-app with the same quality as One Pager and Pitch Deck viewers
**Depends on**: Phase 19
**Requirements**: FS-01, FS-04
**Success Criteria** (what must be TRUE):
  1. User can open a Full Story report and see 6 sections rendered with hero header, sticky nav, and section content
  2. User sees a gate check blocking Full Story access when Pitch Deck has not been approved
  3. User can see mechanical and methodology quality scores per section and as an overall aggregate
  4. User can approve or reject the Full Story via an approval bar at the bottom
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [x] 20-01-PLAN.md — Wire infrastructure: quality endpoint, App.jsx route fix, SectionRenderer additions, useFullStory hook
- [x] 20-02-PLAN.md — Rewrite FullStory.jsx with gate check, hero, quality badges, sticky nav, sections, and approval bar

### Phase 21: Checklist & Debate Renderers
**Goal**: Users can read scored checklists and adversarial debates as structured, visually distinct components -- not text walls
**Depends on**: Phase 20
**Requirements**: FS-02, FS-03, FS-05
**Success Criteria** (what must be TRUE):
  1. User views a checklist section and sees each item with a PASS/FAIL/PARTIAL badge, expandable evidence, and an aggregate score header (e.g., "12/15 PASS, 2 PARTIAL, 1 FAIL")
  2. User views the adversarial debate and sees four visually distinct steps (Bull thesis, Bear inversion, Bull rebuttal, Judge verdict) with different styling per role
  3. User can navigate between debate steps via tabs or accordion controls without losing context
  4. User sees the Judge verdict with a direction banner (bullish/bearish/neutral) and per-exchange strength comparison
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [x] 21-01-PLAN.md — Extend VerdictBadge with PARTIAL + build ChecklistRenderer with aggregate bar and expandable items
- [x] 21-02-PLAN.md — Extract DirectionBadge to shared file + build DebateRenderer with 4 tabbed steps and role-colored content
- [x] 21-03-PLAN.md — Wire renderers into FullStory.jsx conditional dispatch + visual verification checkpoint

### Phase 22: Stage Gating & Navigation
**Goal**: Users can discover, navigate between, and track progress across all report stages for any company
**Depends on**: Phase 21
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04
**Success Criteria** (what must be TRUE):
  1. User cannot click into Pitch Deck until One Pager shows "Approved" status, and cannot click into Full Story until Pitch Deck shows "Approved" status
  2. User opens the Reports list and sees all companies with per-stage status indicators (generated, approved, pending) and can navigate directly to any stage
  3. User views a report and sees the correct top-nav tab highlighted (Reports tab active on report routes, Research tab on research routes)
  4. User can see at a glance which stages are complete, approved, or pending for any company
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [ ] 22-01-PLAN.md — Enhance reports API with per-stage availability + fix nav tab highlighting for report routes
- [x] 22-02-PLAN.md — Rewrite ReportsList with multi-stage pills, gate logic, and status-based navigation

### Phase 23: Delight Feature Wiring
**Goal**: Users can interact with enrichment features that deepen their understanding of the research
**Depends on**: Phase 22
**Requirements**: DLT-01, DLT-02, DLT-03, DLT-04
**Success Criteria** (what must be TRUE):
  1. User clicks "Tell me more" on a notable claim and sees expanded analysis in a slide-out panel
  2. User opens the assumption tracker sidebar and sees key assumptions with confidence levels and which sections each assumption affects
  3. User hovers an underlined industry term and sees a glossary tooltip with definition and benchmark data
  4. User can toggle between Bull and Bear narrative perspectives on the Full Story, changing the emphasis of the overall presentation
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 23-01: Wire DeepDivePanel to pre-computed deep-dive content
- [ ] 23-02: Wire AssumptionTracker to report JSON assumptions array
- [ ] 23-03: Build glossary data source and wire IndustryCard term detection
- [ ] 23-04: Build Bull/Bear narrative toggle for Full Story

## Progress

**Execution Order:**
Phases execute in numeric order: 18 → 19 → 20 → 21 → 22 → 23

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 18. Critical Bug Fixes & Storage Migration | 3/3 | Complete    | 2026-04-02 |
| 19. Shared Report Infrastructure | 2/3 | Complete    | 2026-04-03 |
| 20. Full Story Core Viewer | 2/2 | Complete    | 2026-04-03 |
| 21. Checklist & Debate Renderers | 3/3 | Complete    | 2026-04-03 |
| 22. Stage Gating & Navigation | 1/2 | Complete    | 2026-04-03 |
| 23. Delight Feature Wiring | 0/4 | Not started | - |
