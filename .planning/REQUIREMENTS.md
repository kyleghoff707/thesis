# Requirements: Thes1s v1.3 Report Stage UI

**Defined:** 2026-04-01
**Core Value:** Depth of investigation that exceeds what a single human analyst can achieve in 70+ hours — delivered in minutes, with zero shortcuts on rigor.

## v1.3 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Foundation & Fixes

- [x] **FIX-01**: User can view Pitch Deck sections correctly after pipeline run (fix section key mismatch — 5 of 10 keys don't match pipeline output)
- [x] **FIX-02**: User can store reports for 20+ companies without hitting browser storage limits (migrate report storage from localStorage to IndexedDB)
- [x] **FIX-03**: User can load Full Story reports in the app (add Full Story route to Vite middleware)
- [x] **FIX-04**: User can view reports for any ticker with consistent section data (normalize cross-ticker schema differences in pipeline output)

### Shared Infrastructure

- [x] **INFRA-01**: User sees consistently formatted numbers, currencies, and percentages across all report stages (extract shared formatting utilities)
- [ ] **INFRA-02**: User sees active section highlighted in nav while scrolling through any report (shared scroll spy hook)
- [x] **INFRA-03**: User sees properly rendered markdown content in report narratives (shared markdown renderer replacing raw text blobs)
- [ ] **INFRA-04**: User can navigate between One Pager, Pitch Deck, and Full Story stages for the same company via a stage nav bar

### Full Story Viewer

- [x] **FS-01**: User can view Full Story report with 6 sections, gate check enforcing Pitch Deck approval, and approval bar
- [x] **FS-02**: User can view scored checklists (Meaning 15pt, Moat 15pt, Management 13pt) with item-level PASS/FAIL/PARTIAL indicators and aggregate scores
- [x] **FS-03**: User can view the adversarial debate (Bull → Bear → Bull Rebuttal → Judge) with distinct visual treatment per step
- [x] **FS-04**: User can see quality scores (mechanical and methodology) per section and overall
- [x] **FS-05**: User can navigate between debate steps via tabs or accordion controls

### Stage Gating & Navigation

- [ ] **NAV-01**: User cannot access Pitch Deck until One Pager is approved, and cannot access Full Story until Pitch Deck is approved
- [ ] **NAV-02**: User can discover and navigate between all generated reports across all stages from a reports list
- [ ] **NAV-03**: User sees correct nav highlighting when viewing reports (fix route/tab highlighting bugs)
- [ ] **NAV-04**: User can see a stage progress overview per company (which stages are complete, approved, or pending)

### Delight Features

- [ ] **DLT-01**: User can click "Tell me more" on notable claims to see expanded AI analysis in a slide-out panel
- [ ] **DLT-02**: User can view all key assumptions with confidence levels in a sidebar, seeing which sections each assumption affects
- [ ] **DLT-03**: User can hover underlined industry terms to see glossary definitions with benchmarks
- [ ] **DLT-04**: User can toggle between Bull and Bear narrative perspectives on the Full Story

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Export & Publishing

- **EXP-01**: User can trigger report generation from within the app (in-browser API calls)
- **EXP-02**: User can view version history and diff between report iterations
- **EXP-03**: User can preview source text on citation hover (10-K paragraph, transcript excerpt)

### Advanced Intelligence

- **INT-01**: User can see Management Promise Tracker (CEO promises vs delivery across earnings calls)
- **INT-02**: User can compare reports across companies (cross-company intelligence)
- **INT-03**: User can see conviction scoring with Bayesian updates over time

## Out of Scope

| Feature | Reason |
|---------|--------|
| Inline report editing | Reports are AI-generated; re-run sections instead of editing |
| Token-by-token streaming | Polling-based progress is sufficient; streaming adds complexity without value for section-level granularity |
| Drag-and-drop section reordering | Section order follows Rule One methodology — not user-configurable |
| Real-time collaboration | Single-user desktop app |
| Custom themes beyond dark/light | Existing C palette is sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | Phase 18 | Complete |
| FIX-02 | Phase 18 | Complete |
| FIX-03 | Phase 18 | Complete |
| FIX-04 | Phase 18 | Complete |
| INFRA-01 | Phase 19 | Complete |
| INFRA-02 | Phase 19 | Pending |
| INFRA-03 | Phase 19 | Complete |
| INFRA-04 | Phase 19 | Pending |
| FS-01 | Phase 20 | Complete |
| FS-02 | Phase 21 | Complete |
| FS-03 | Phase 21 | Complete |
| FS-04 | Phase 20 | Complete |
| FS-05 | Phase 21 | Complete |
| NAV-01 | Phase 22 | Pending |
| NAV-02 | Phase 22 | Pending |
| NAV-03 | Phase 22 | Pending |
| NAV-04 | Phase 22 | Pending |
| DLT-01 | Phase 23 | Pending |
| DLT-02 | Phase 23 | Pending |
| DLT-03 | Phase 23 | Pending |
| DLT-04 | Phase 23 | Pending |

**Coverage:**
- v1.3 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after roadmap creation*
