# Project Research Summary

**Project:** Thes1s v1.3 — Report Stage UI
**Domain:** AI-generated investment research report viewer (multi-stage, interactive, desktop)
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

Thes1s v1.3 is not a greenfield project — it is a completion effort on a substantially built report viewing system. OnePager.jsx (557 lines), PitchDeck.jsx (~1100 lines), SectionRenderer.jsx (594 lines), and 6 shared badge/panel/citation components are already production-ready. The remaining work is well-scoped: FullStory.jsx with debate rendering and scored checklists, stage gating wiring, a section-key mismatch fix in PitchDeck, and navigation improvements. No new dependencies are required. Every interaction pattern needed — scroll spy, citation tooltips, slide-out panels, collapsible sections, polling progress hooks — is already built and working.

The recommended approach is to build in strict dependency order: fix existing bugs first (PitchDeck section key mismatches, missing Vite middleware entry for full-story), then extract shared utilities (reportHelpers.js, useScrollSpy hook, Spinner component), then build the FullStory viewer with its two novel sub-components (ChecklistRenderer and DebateRenderer), and finally enhance the ReportsList navigation layer. This order avoids building new features on top of broken foundations and prevents duplication of patterns that are about to be extracted.

The three critical risks are: (1) localStorage quota exhaustion — report JSON files are large (414KB for pitch deck alone), requiring report content to move to IndexedDB before any UI stores report data; (2) the mutable C theme object causing stale inline styles in memoized or portal components, requiring per-component discipline rather than a one-time fix; and (3) the adversarial debate having no rendering precedent in the codebase, requiring 4 step-specific sub-components rather than one generic renderer. A moderate but high-impact risk — the custom markdown parser covers only 3 patterns while agent narratives use ~10 — should be resolved early by adopting react-markdown or extending the parser before any stage viewer is considered complete.

## Key Findings

### Recommended Stack

No new dependencies are required for v1.3. The existing stack (React 19.2, Vite 7, Tauri 2, Recharts, inline styles via mutable C palette) fully covers every feature in scope. The research explicitly evaluated and rejected component libraries (Radix, Headless UI), animation libraries (Framer Motion), CSS frameworks (Tailwind), state managers (Zustand), tooltip libraries (Tippy.js, Floating UI), and virtual scrolling (react-window). All are unnecessary given existing patterns.

The one exception worth deciding: `react-markdown` (~12KB gzipped) would replace the custom `parseMarkdown()` in SectionRenderer, which only handles headings, bold, and bullet lists — but agent narratives contain numbered lists, blockquotes, inline links, nested bullets, and code spans that the parser drops silently. PITFALLS.md recommends adopting it in the shared components phase. If the zero-new-deps principle is firm, the custom parser must be extended to cover all ~10 patterns. The decision must be made before Phase 2 starts.

**Core technologies (no changes):**
- React 19.2.0: UI framework, functional components + hooks — already installed
- react-router-dom 7.13.1: Route-based stage navigation — already installed
- Vite 7.3.1 + custom middleware: Serves report JSON from .thes1s/reports/ filesystem — already configured
- idb 8.0.3: IndexedDB for report content storage (must replace localStorage approach) — already installed
- Recharts 3.8.0: Charts in report sections — already installed

**Code-level improvements (no npm installs):**
- Extract `useScrollSpy(sectionKeys)` hook with debounce — shared across OP/PD/FS
- Extract `reportHelpers.js` — formatTitle, formatRelativeTime, stateToLabel, verdictDotColor
- Extract `Spinner.jsx` shared component
- Add `PARTIAL` verdict to VerdictBadge
- Build `DebateRenderer.jsx` with 4 step-specific sub-components

### Expected Features

The feature landscape is divided between already-shipped items and remaining builds. The table stakes list is 15/20 complete.

**Must have — already done:**
- Section-by-section rendering with verdict/confidence badges (SectionRenderer)
- Sticky sidebar navigation with scroll-spy (OnePager, PitchDeck)
- Inline citation markers with hover tooltips (CitationTooltip)
- Consolidated reference list per report (OnePager)
- Real-time generation progress with per-section status (useOnePager, usePitchDeck)
- Red flag callouts per section (RedFlagCallout)
- Dark/light theme support across all existing components

**Must have — not yet built:**
- Full Story viewer (FullStory.jsx) — only stage without a display component
- Scored checklist rendering: Meaning 15pt, Moat 15pt, Management 13pt (ChecklistRenderer)
- Adversarial debate rendering: Bull/Bear/Rebuttal/Judge 4-step exchange (DebateRenderer)
- PitchDeck approval gate wiring (approval bar exists, gate logic not wired to FullStory)
- Stage navigation between OP/PD/FS (StageNavBar component)
- ReportsList showing all 3 stages per ticker

**Should have (differentiators — shell built, not wired):**
- "Tell me more" deep-dive panel (DeepDivePanel.jsx built, needs content integration)
- Assumption tracker sidebar (AssumptionTracker.jsx built, needs data wiring from report JSON)
- Industry glossary popups (IndustryCard.jsx built, needs glossary data + term detection)
- Sensitivity table in Valuation section (SensitivityTable.jsx built, needs data wiring)
- Real-time progress dashboard generalized for all three stages (GenerationStatusPanel in PD, needs extraction)

**Defer (v2+):**
- Bull/Bear narrative toggle (expensive if dual-generation; cheap "filter view" variant is V1 candidate)
- On-demand "Tell me more" via live Claude API calls (pre-computed deep-dives recommended for V1)
- Editable assumption tracker with re-scoring
- Version diff view between report iterations
- Keyboard navigation between sections (J/K keys)
- Tauri production report serving (currently dev-only via Vite middleware)

**Anti-features (never build):**
- Inline editing of report content (destroys audit trail and citation reliability)
- Token-by-token streaming text rendering (pipeline produces complete JSON objects, not streams)
- Multi-tab simultaneous report viewing
- Drag-and-drop section reordering (violates curriculum sequence)

### Architecture Approach

The architecture follows strict separation between pipeline (CLI) and viewer (browser): the pipeline writes JSON files to `.thes1s/reports/{TICKER}/`, Vite middleware serves them at `/api/thes1s/reports/`, React hooks poll for progress and fetch completed reports, and stage viewer components render via SectionRenderer and stage-specific sub-components. No WebSocket, no file watcher, no global state library. Routing places data exploration (Toolbox) at `/research/:id` and report stages at `/research/:id/one-pager|pitch-deck|full-story` as sibling routes.

Two structural fixes are needed immediately: (1) five section key mismatches in PitchDeck's SECTION_DEFS prevent 5 of 10 sections from rendering — the component expects `simple_predictable` but the pipeline outputs `simple_and_predictable`, and similar mismatches for `barriers_moats`, `pest`, `valuation`, and `roe_roic_debt`; (2) the Vite middleware `fileMap` has no entry for `full-story-api.json`, so the full-story API endpoint returns 404. Both are small fixes but block all downstream work.

**Major components to build or modify:**
1. `FullStory.jsx` — Stage 3 viewer: 6 sections, gate check on PD approval, hero header, scroll spy, approval bar; coordinates ChecklistRenderer and DebateRenderer
2. `fullStory/ChecklistRenderer.jsx` — Scored checklists (15+15+13 items) with verdict counts, expand/collapse evidence, color-coded item borders; handles `section.data.items[]` which SectionRenderer's KV grid cannot
3. `fullStory/DebateRenderer.jsx` — 4-step adversarial debate with BullThesisCard, BearInversionCard, BullRebuttalCard, JudgeVerdictCard sub-components; includes verdict summary table at top
4. `StageNavBar.jsx` — Sub-nav shared across all three stage routes: stage tabs with lock icons, approval badges, link back to Toolbox data view
5. `useFullStory.js` — Polling hook for full-story-api.json (clone of usePitchDeck pattern, trivial)
6. `reportHelpers.js` — Extracted shared utilities removing duplication between OP/PD/FS components

### Critical Pitfalls

1. **localStorage quota exhaustion** — Report JSON is large: OP 21KB–157KB, PD 414KB–544KB, FS 325KB per company. At 6-7 companies, the 5MB localStorage limit (2.5MB on macOS WebKit/Tauri) is exhausted. The existing `evictCaches()` fallback only removes `sa-cache:*` entries which have already migrated to IndexedDB, so on exhaustion there is nothing left to evict and saves fail silently. Report content must move to IndexedDB via existing cacheStore.js before any UI stores report data. Only lightweight metadata (ticker, stage, verdicts, timestamps, approvals) stays in localStorage. This must be resolved in Phase 1.

2. **Mutable theme object causes stale inline styles** — The C palette is mutated in place via `Object.assign(C, source)`; React cannot detect the mutation. Portal components (DeepDivePanel, AssumptionTracker) and any memoized section cards will display wrong colors after a theme toggle. Prevention requires per-component discipline: never cache C values in refs or closures; always read `C.*` directly at render time; force portal re-renders by reading `isDark` from a hook. This is an ongoing discipline, not a one-time fix.

3. **Adversarial debate has no rendering precedent** — The 4 debate steps have fundamentally different data shapes (thesisPoints, inversions, rebuttals, exchanges). A single generic renderer becomes a maze of conditionals. The correct approach: 4 step-specific components (BullThesisCard, BearInversionCard, BullRebuttalCard, JudgeVerdictCard) wrapped in a DebateRenderer container. Build Judge first — it is the most complex visual challenge (per-exchange bull/bear strength comparison + overall verdict direction banner).

4. **Custom markdown parser covers only 3 patterns** — Agent narratives use headings, numbered lists, blockquotes, inline links, code spans, and nested bullets. The existing `parseMarkdown()` drops all of these as flat paragraph text. The Phase 05B notes called this "unreadable text blobs." Decide at Phase 2: adopt react-markdown or extend the custom parser. Either choice is valid, but the decision cannot be deferred.

5. **PitchDeck SECTION_DEFS key mismatches (5 of 10)** — `simple_predictable` vs `simple_and_predictable`, `barriers_moats` vs `barriers_and_moats`, `roe_roic_debt` vs no equivalent (merged into other sections by pipeline), `pest` vs `pest_risks`, `valuation` vs `valuation_summary`. This is a P0 bug that causes half the PD sections to show "Pending..." despite being fully generated. Fix before anything else.

## Implications for Roadmap

Based on research, the build must follow strict dependency order: foundations before features, bugs fixed before new components, shared utilities extracted before all three stage viewers duplicate them.

### Phase 1: Critical Bug Fixes and Storage Architecture

**Rationale:** The PitchDeck key mismatch (5/10 sections broken) and missing full-story Vite middleware entry block all downstream work. The localStorage quota risk must be resolved before any UI stores report content, or data loss becomes inevitable at 6+ companies. Fix foundations before building anything new.

**Delivers:** PitchDeck renders all 10 sections correctly. Full Story API endpoint is live (`'full-story': 'full-story-api.json'` in Vite fileMap). Report content storage migrated to IndexedDB with only metadata in localStorage. No risk of silent data loss at scale.

**Addresses:** PitchDeck section rendering (table stakes — PARTIAL), localStorage quota exhaustion (Critical Pitfall 1), full-story API prerequisite

**Avoids:** Building FullStory on top of a broken PitchDeck. Exhausting storage at 6 companies.

**Research flag:** Standard patterns — IndexedDB via cacheStore.js already exists, key renames are trivial. No research phase needed.

---

### Phase 2: Shared Infrastructure Extraction

**Rationale:** OnePager and PitchDeck have 6+ identical functions (formatTitle, formatRelativeTime, stateToLabel, Spinner, injectSpinnerStyle, verdictDotColor) plus near-identical approval bar, sticky nav, and progress bar JSX. Adding FullStory on top creates a third copy of every bug. Extract shared utilities while there are only two components to align.

**Delivers:** `reportHelpers.js` module, shared `Spinner.jsx`, `useScrollSpy(sectionKeys)` hook with 50ms debounce, `StageNavBar.jsx` sub-navigation component, CSS animation keyframe singleton. Decision and implementation: react-markdown adoption OR custom parser extension. `useFullStory.js` hook (clone of usePitchDeck pattern).

**Addresses:** Duplicated helpers (Minor Pitfall 10), animation keyframe duplication (Minor Pitfall 12), scroll spy flicker (Moderate Pitfall 6), route navigation confusion (Moderate Pitfall 9), markdown rendering gap (Moderate Pitfall 5)

**Avoids:** Three-way duplication when FullStory is added. Building FullStory with a scroll spy that flickers. Shipping "unreadable text blobs" in report narratives.

**Research flag:** No research phase needed. If react-markdown is adopted, 30-minute spike to verify `components` prop works with inline C palette styles.

---

### Phase 3: FullStory Core Viewer

**Rationale:** FullStory is the only stage with no display component. Until it exists, Full Story pipeline output is JSON files no one can read in-app. Build the shell first (gate check, hero, sticky nav, sections via SectionRenderer, approval bar), then specialize.

**Delivers:** `FullStory.jsx` with gate check on PD approval, hero header, sticky nav, 6 sections rendered via SectionRenderer (functional but not specialized for checklists yet), approval bar. `App.jsx` route wired, replacing StagePlaceholder. Empty state handles loading flash correctly (`!loading` guard).

**Addresses:** Full Story display (table stakes — NOT BUILT), FS stage gating, loading flash bug (Minor Pitfall 13)

**Avoids:** Building checklist/debate renderers before the container component exists to host them.

**Research flag:** Standard patterns. FullStory JSON schema fully documented in ARCHITECTURE.md. No research needed.

---

### Phase 4: Specialized Renderers (ChecklistRenderer + DebateRenderer)

**Rationale:** These are the novel rendering challenges that differentiate Full Story. ChecklistRenderer handles `section.data.items[]` — a structured checklist format that SectionRenderer's KV-pair data grid cannot render correctly. DebateRenderer handles the 4-step adversarial exchange — the crown jewel of Full Story output that must not be a text wall.

**Delivers:** `fullStory/ChecklistRenderer.jsx` — scored checklist display: item rows with verdict badges, aggregate score header (X/Y PASS, Z PARTIAL, W FAIL), expand/collapse evidence, color-coded left borders (red = FAIL, yellow = PARTIAL, green = PASS). `fullStory/DebateRenderer.jsx` — verdict summary table + exchange accordion: BullThesisCard, BearInversionCard (severity badges), BullRebuttalCard (strength + honest flag), JudgeVerdictCard (direction banner); integrated into FullStory.jsx replacing SectionRenderer for checklist sections.

**Addresses:** Scored checklist rendering (table stakes — NOT BUILT), adversarial debate rendering (table stakes — NOT BUILT), checklist zero-column table edge case (Minor Pitfall 11), debate rendering complexity (Critical Pitfall 3)

**Avoids:** Generic debate renderer with conditionals for 4 incompatible schemas. Modifying SectionRenderer for one-off use cases.

**Research flag:** No research phase needed. All data schemas are fully documented (ARCHITECTURE.md lines 218-230, PITFALLS.md Pitfall 3 analysis). Build Judge card first — it has the most complex visual scoring requirements and sets the pattern.

---

### Phase 5: Navigation and ReportsList Polish

**Rationale:** The discovery and navigation layer should reflect all three stages. Currently ReportsList only surfaces One Pager routes. Users have no in-app way to navigate between stages. This phase completes the navigation model across the entire reporting workflow.

**Delivers:** ReportsList.jsx updated to show all 3 stages per ticker (OP/PD/FS status badges, stage completion indicators, quality scores if available, navigation to correct stage). StageNavBar integrated into OnePager, PitchDeck, FullStory. PitchDeck approval bar wired to FullStory gate. Route top-nav highlighting fixed (Reports tab active on /reports, Research active on /research/:id routes). Loading flash guard added where missing.

**Addresses:** Report navigation for all stages (table stakes — PARTIAL), PD approval gate (table stakes — PARTIAL), route fragmentation (Moderate Pitfall 9), loading flash (Minor Pitfall 13)

**Avoids:** Users stranded in One Pager with no in-app path to Pitch Deck or Full Story.

**Research flag:** Standard React Router patterns. StageNavBar design is specified in ARCHITECTURE.md.

---

### Phase 6: Delight Feature Wiring

**Rationale:** Three delight feature shells are built but contain no data (DeepDivePanel, AssumptionTracker, IndustryCard). This phase connects them to report JSON and builds the missing glossary data source.

**Delivers:** AssumptionTracker wired to `assumptions` array from report JSON. IndustryCard backed by static glossary JSON (~100 financial terms) with term detection added to narrative rendering. DeepDivePanel populated with pre-computed deep-dive content from pipeline. Citation tooltip viewport boundary detection (prevents clipping at edges). Sensitivity table wired to PD valuation section data. Polling interval tuned to 3-5 seconds with COMPLETE guard to prevent poll chatter. Tauri production gap documented as known limitation.

**Addresses:** Assumption tracker (differentiator), industry glossary (differentiator), citation clipping (Moderate Pitfall 4), poll chatter (Moderate Pitfall 8), data formatting inconsistency (Moderate Pitfall 7), Tauri production gap documented (Minor Pitfall 14)

**Avoids:** On-demand live Claude API calls for deep-dive in V1 (expensive, adds latency; pre-computed is sufficient). Delight features that exist as dead UI with no data.

**Research flag:** Glossary data source decision needed at Phase 6 start (static JSON vs DataPacket extraction, 30-minute decision). Deep-dive content strategy must be confirmed (pre-computed recommended).

---

### Phase Ordering Rationale

- Phase 1 first because PitchDeck has a P0 bug (5/10 sections broken) and localStorage exhaustion causes silent data loss — both are worse to fix later.
- Phase 2 before Phase 3 because extracting shared utilities while there are 2 components is far cheaper than extracting from 3. Adding FullStory to a duplicated codebase means 9 copies of the same helpers.
- Phase 3 before Phase 4 because the FullStory shell container must exist before specialized renderers can be integrated and tested.
- Phase 4 before Phase 5 because navigation polish only matters when all three stages have working viewers to navigate between.
- Phase 6 last because delight features enhance a functional product — they are not blocking for core report consumption.

### Research Flags

Phases with standard patterns (no research-phase needed):
- **Phase 1:** Key renames and IndexedDB storage follow existing cacheStore.js conventions exactly.
- **Phase 2:** Extraction refactors are well-understood. react-markdown adoption needs a 30-minute spike at most.
- **Phase 3:** JSON schema fully documented, hook is a clone, gate logic follows existing PD-gates-OP pattern.
- **Phase 4:** Data schemas fully documented. Debate decomposition strategy documented. No unknowns.
- **Phase 5:** Standard React Router + component integration. StageNavBar design specified.

Phases with decisions needed (not a research phase, but a deliberate choice before building):
- **Phase 2:** react-markdown vs custom parser extension — must decide before Phase 2 starts.
- **Phase 6:** Glossary data source (static JSON vs DataPacket extraction) and deep-dive content strategy (pre-computed vs live API) — both 30-minute decisions, not research phases.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Assessed against working production codebase. Every feature evaluated against 30+ existing components. Zero new dependencies confirmed necessary. |
| Features | HIGH | Table stakes inventory cross-referenced against actual component files with LOC counts and status verification. Differentiator shells confirmed present via codebase inspection. |
| Architecture | HIGH | Direct inspection of all 13 listed components, App.jsx routing, vite.config.js middleware, pipeline JSON outputs for MNST/SFM/MSFT/POOL. Critical data mismatches documented with exact fix instructions. |
| Pitfalls | HIGH | Critical pitfalls grounded in measured data (report file sizes from filesystem), Phase 05B known bugs, and verified browser storage limits. Not hypothetical — the localStorage math was done. |

**Overall confidence:** HIGH

### Gaps to Address

- **react-markdown vs custom parser decision:** PITFALLS.md recommends adoption; STACK.md says no new deps. Resolve at Phase 2 start. Either choice requires explicit commitment — the current custom parser is insufficient and cannot be left as-is.

- **Glossary data source for IndustryCard:** Static JSON (~100 hand-crafted financial terms) vs extracting from DataPacket industry data. Resolve at Phase 6 start. Recommendation: static JSON for V1 (known scope, zero API cost).

- **Deep-dive content strategy:** Pre-computed during pipeline generation (cheaper) vs on-demand live Claude API calls (~$0.10/query, richer). Resolve before Phase 6. Recommendation: pre-computed for V1.

- **Pipeline output consistency across tickers:** MNST was deeply inspected for schema verification. SFM, POOL, and MSFT may have different section key patterns or missing fields. Phase 1 should include cross-ticker verification of pipeline JSON schemas before fixing SECTION_DEFS.

- **PitchDeck companyName and overallVerdict gap:** pitch-deck.json lacks these top-level fields that one-pager.json provides. Component accesses them and gets `undefined`. Either add to pipeline output or add fallback logic in component. Pipeline-side fix preferred for consistent schema across stages.

- **Tauri production report serving:** All report fetching depends on Vite middleware that does not run in the Tauri production `.app` bundle. This is a known limitation, documented as out-of-scope for v1.3. Must be addressed before the app ships as a standalone Tauri build (Tauri fs plugin or IPC commands).

- **Chart rendering gap:** `section.charts[]` exists in the section schema but SectionRenderer does not render charts. Recharts integration for embedded report charts is future scope — not blocking for v1.3.

## Sources

### Primary (HIGH confidence)

- Thes1s codebase direct inspection: OnePager.jsx (557 LOC), PitchDeck.jsx (~1100 LOC), SectionRenderer.jsx (594 LOC), CitationTooltip.jsx, VerdictBadge.jsx, ConfidenceBadge.jsx, RedFlagCallout.jsx, SensitivityTable.jsx, DeepDivePanel.jsx, AssumptionTracker.jsx, IndustryCard.jsx, ReportsList.jsx, useOnePager.js, usePitchDeck.js, App.jsx, vite.config.js, theme.js, package.json
- Pipeline output inspection: MNST, SFM, MSFT, POOL report JSON (one-pager.json, pitch-deck.json, full-story-api.json, debate-step-*.json)
- Schema definitions: `src/schemas/reportSection.js`, `src/schemas/debateStep.js`, `src/schemas/progress.js`
- Phase 05B UI Polish Notes: `.planning/phases/05B-one-pager-display-components/05B-UI-POLISH-NOTES.md`
- Report file sizes: measured from `.thes1s/reports/` (MNST PD: 414KB, SFM PD: 544KB, MNST FS: 325KB, MSFT OP: 157KB)
- [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

### Secondary (MEDIUM confidence)

- [ShapeofAI — Citation UI Patterns](https://www.shapeof.ai/patterns/citations) — Citation variant design, inline marker best practices
- [Hebbia — Equity Research Report Patterns](https://www.hebbia.com/resources/equity-research-report) — Source-linked citations, audit trail requirements
- [Scrollspy Demystified](https://blog.maximeheckel.com/posts/scrollspy-demystified/) — IntersectionObserver implementation patterns with rootMargin
- [AG-UI Real-Time Streaming Guide](https://medium.datadriveninvestor.com/production-grade-agentic-apps-with-ag-ui-real-time-streaming-guide-2026-5331c452684a) — Progressive rendering, start/completion event patterns
- [React v19 changelog](https://react.dev/blog/2024/12/05/react-19) — New APIs assessed for applicability (none required for v1.3)
- [The Inferential Investor — Bull & Bear Investment Case Workups](https://www.inferentialinvestor.com/p/bull-and-bear-investment-case-workups) — Structured opposing arguments with explicit verdict calls

### Tertiary (LOW confidence)

- [react-markdown npm](https://www.npmjs.com/package/react-markdown) — Cited as alternative to custom parser; adoption decision unresolved
- [Floating UI positioning engine](https://converter.brightcoding.dev/blog/floating-ui-the-modern-positioning-engine-every-developer-needs) — Assessed for citation tooltip clipping; manual boundary detection recommended instead

---
*Research completed: 2026-04-01*
*Ready for roadmap: yes*
