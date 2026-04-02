# Domain Pitfalls: Report Stage UI Integration

**Domain:** Adding complex report viewers with real-time progress, citation systems, debate rendering, and interactive exploration to an existing React app
**Project:** Thes1s v1.3 -- Report Stage UI
**Researched:** 2026-04-01
**Overall confidence:** HIGH (grounded in existing codebase analysis, known bugs from Phase 05B, measured report sizes, and verified browser limitations)

---

## Critical Pitfalls

These cause rewrites, data loss, or fundamentally broken experiences.

### Pitfall 1: localStorage Quota Exhaustion from Report Storage

**What goes wrong:** Reports are serialized into the `stock-analyzer-reports` localStorage key alongside all other report metadata. A single Pitch Deck JSON is 414KB (MNST). A Full Story is 325KB. The combined report data for ONE company across all three stages is ~760KB. With 5-7 companies researched, the serialized reports array approaches or exceeds the 5MB localStorage limit. On Safari/iOS WebKit (which Tauri uses on macOS), the limit can be as low as 2.5MB.

**Why it happens:** The existing `useResearch.js` stores the entire reports array as one JSON blob. The `evictCaches()` fallback only removes `sa-cache:*` entries -- which have mostly already migrated to IndexedDB. Once those are gone, there is nothing left to evict and the retry fails silently (reports saved "in memory only"). The user loses report data on next app restart.

**Evidence:** Current report sizes measured from `.thes1s/reports/`:
- MNST One Pager: 21KB, Pitch Deck: 414KB, Full Story API: 325KB = **760KB per company**
- MSFT One Pager: 157KB alone
- SFM Pitch Deck pipeline output: 544KB
- 5MB / 760KB = **6.5 companies max** before quota failure

**Consequences:**
- `QuotaExceededError` thrown on `saveReports()` -- user loses all unsaved report changes
- Silent data loss: the catch block warns to console but the app continues as if save succeeded
- On app restart, reports revert to last successful save, losing potentially hours of approval decisions

**Prevention:**
- Move report content (sections, narratives, debate outputs) to IndexedDB using the existing `cacheStore.js` infrastructure. Keep only lightweight metadata (ticker, stage, verdicts, timestamps, approval status) in localStorage.
- The `IDB_PREFIXES` pattern already supports this -- add a `report:` prefix and `report-data` store name.
- Lazy-load report content from IndexedDB when navigating to a specific report, not at app startup.

**Detection:** Monitor localStorage usage in the Audit tab. Add a size warning when `stock-analyzer-reports` exceeds 2MB.

**Phase assignment:** Must be addressed in the FIRST phase of v1.3, before any report content is stored in localStorage. Retrofitting storage after reports are already saved is painful.

---

### Pitfall 2: Mutable Theme Object (C) Causes Stale Inline Styles

**What goes wrong:** The theme system uses a mutable `C` object (`Object.assign(C, source)`) that all components import by reference. Inline style objects created during render capture the current `C` values at render time. But because `C` is mutated in place (not replaced), React has no way to know theme values changed -- components that aren't re-rendered after a theme toggle will display stale colors. This is invisible for simple components that re-render anyway, but becomes visible with:
- Memoized components (`React.memo`, `useMemo`)
- Components outside the re-render tree (portals, fixed overlays)
- Cached style objects stored in refs or module-level variables

**Why it happens:** The existing Toolbox tabs re-render frequently enough that stale theme values are rare. But report viewers introduce:
- `DeepDivePanel` and `AssumptionTracker` as fixed-position portals
- Memoized section cards (performance optimization for 10+ sections)
- Cached IntersectionObserver callbacks that reference `C` values

**Consequences:** After theme toggle, slide-out panels show wrong background colors. Citation tooltips appear with light-mode colors on dark background. Debate cards show stale accent colors.

**Prevention:**
- For v1.3 components specifically: avoid caching `C` values in refs, closures, or module scope. Always read `C.*` directly in the render function.
- Do NOT memoize style objects that reference `C` -- the mutable pattern means memoization defeats theme updates.
- For portals (DeepDivePanel, AssumptionTracker): force re-render on theme change by reading `isDark` from context or a hook, even if the component doesn't directly use it.
- Long-term (out of scope for v1.3): migrate to CSS custom properties for theme values, which update globally without re-renders.

**Detection:** Manual QA: toggle theme with a slide-out panel open, with a tooltip visible, with debate view expanded.

**Phase assignment:** Every phase. This is a per-component discipline, not a one-time fix. Add to the code review checklist.

---

### Pitfall 3: Full Story Debate Rendering Has No Precedent in the Codebase

**What goes wrong:** The adversarial debate (Bull -> Bear -> Bull Rebuttal -> Judge) is a novel UI pattern with no existing component to extend. Each debate step has different data shapes (`thesisPoints[]`, `inversions[]`, `rebuttals[]`, `exchanges[]`). The temptation is to build a generic "debate renderer" that handles all 4 steps -- but the data shapes are so different that a generic component becomes a maze of conditionals.

**Why it happens:** The debate schema has 4 distinct Zod types (`BullThesisSchema`, `BearInversionSchema`, `BullRebuttalSchema`, `JudgeVerdictSchema`) with fundamentally different content structures. Each step also has severity/strength enums that need different visual treatments (thesis_killer vs minor, strong vs weak).

**Evidence from MNST data:**
- Bull: 7 thesis points, each with `point + evidence + sourceSection`
- Bear: 7 inversions, each with `targetPoint + counterArgument + evidence + severity + sources[]`
- Bull Rebuttal: 7 rebuttals, each with `bearPoint + rebuttal + rebuttalStrength + honest`
- Judge: 7 exchanges, each with `topic + bullStrength + bearStrength + verdict + reasoning` + overallVerdict object

**Consequences:** A generic renderer either (a) loses the visual distinctiveness of each step, making the debate flat and boring, or (b) accumulates so many conditionals that it becomes unmaintainable. Neither outcome serves the user.

**Prevention:**
- Build 4 separate step-specific components: `BullThesisCard`, `BearInversionCard`, `BullRebuttalCard`, `JudgeVerdictCard`. Each is simple and focused.
- Wrap them in a `DebateRenderer` container that handles step sequencing, expand/collapse, and the overall debate narrative flow.
- The Judge verdict card is the most complex (needs visual scoring for each exchange + overall direction badge). Design it first.
- Use color coding consistently: bull = green/teal, bear = red, judge = neutral accent.

**Detection:** Code review: if any single debate component exceeds 150 lines, it is trying to do too much.

**Phase assignment:** Full Story display phase. Build debate components before the checklist components -- the debate is the novel pattern; checklists can reuse existing table rendering.

---

## Moderate Pitfalls

### Pitfall 4: Citation Tooltip Clipping at Viewport Edges

**What goes wrong:** The existing `CitationTooltip.jsx` uses `position: absolute` with `transform: translateX(-50%)` and `bottom: 100%`. This works when citations are in the middle of the content area, but clips off-screen when citations appear:
- Near the left edge of the content column (tooltip shifts left of viewport)
- Near the top of the viewport (tooltip renders above the visible area)
- Inside the sticky nav column (different stacking context)

**Why it happens:** The tooltip has no viewport collision detection. It positions itself relative to the citation marker and hopes for the best. The existing One Pager has few inline citations (the Phase 05B bug noted "citation markers not visible inline"), so the issue was never triggered.

**Evidence:** Current tooltip code: `left: '50%', transform: 'translateX(-50%)', bottom: '100%'` with `maxWidth: 300` and no flip/shift logic.

**Consequences:** Citations near edges show partially clipped tooltips. On narrow viewports, tooltips can extend off-screen entirely. Users cannot read the citation source.

**Prevention:**
- Add basic viewport boundary detection: measure tooltip rect after render, adjust position if it would clip.
- Use a portal (render tooltip at `document.body` level) to escape any `overflow: hidden` parents.
- Alternatively, switch to Floating UI (~3KB) which handles flip/shift/overflow automatically. But adding a dependency for this single component may be overkill -- a manual boundary check in `useEffect` is sufficient for the 4 tooltip positions needed (above, below, left-shift, right-shift).
- At minimum: add `right: 0` fallback when tooltip would overflow left, and `top: 100%` fallback when citation is near viewport top.

**Detection:** Manually scroll to sections where citations appear in the first or last 300px of a paragraph line.

**Phase assignment:** Shared components phase (early). Every stage renderer uses CitationTooltip -- fix once, benefit everywhere.

---

### Pitfall 5: Narrative Text Blobs -- The Markdown Rendering Gap

**What goes wrong:** The existing `SectionRenderer.jsx` has a `parseMarkdown()` function that handles basic patterns: `##`/`###` headings, `**bold**`, and `- ` bullet lists. But agent-generated narratives (especially Pitch Deck and Full Story) contain richer markdown that this parser drops:
- Numbered lists (`1. `, `2. `)
- Nested bullets
- `> ` blockquotes
- Tables in markdown format
- Inline `code` references to financial terms
- `[link text](url)` links (from web search citations)

The existing parser falls through to rendering these as flat paragraph text, producing the "unreadable text blobs" noted in Phase 05B.

**Why it happens:** The custom parser was built for One Pager output (simple prose with occasional bullets). Pitch Deck narratives are 5,000-7,000 characters with structured formatting. Full Story narratives reach 7,330 characters (measured from MNST meaning_checklist).

**Consequences:** Narratives that agents carefully structured with headings, lists, and emphasis render as wall-of-text paragraphs. The investment thesis is hard to scan. Users skip the narrative entirely and rely only on verdict badges and summaries.

**Prevention:**
- Replace the custom `parseMarkdown()` with `react-markdown` (~12KB gzipped). It converts markdown to React elements natively without `dangerouslySetInnerHTML`, maintaining XSS safety.
- Use the `components` prop to apply inline styles matching the `C` palette (react-markdown lets you override every element's rendering).
- This is the single highest-impact UI improvement -- narratives are the core product output.
- Do NOT try to extend the custom parser incrementally. The existing code handles 3 patterns; markdown has ~30. Each added pattern introduces edge cases with the others. Use the library.

**Detection:** Render any Pitch Deck section narrative. If you see `###` or `1.` or `>` as literal text, the parser failed.

**Phase assignment:** Shared components phase (early). Must be resolved before any stage renderer is considered complete. Every section uses the narrative renderer.

---

### Pitfall 6: IntersectionObserver Scroll Spy Fires Excessive State Updates

**What goes wrong:** The existing OnePager uses an IntersectionObserver with `threshold: 0.3` to track which section is visible. With 6 sections, this works fine. But the Pitch Deck has 10 sections, and the Full Story has 6 sections plus debate steps (potentially 10+ observed elements). Each intersection change triggers `setActiveSection()`, which re-renders the sticky nav, which is fine -- but the observer fires for EVERY element that enters or exits the threshold, not just the "most visible" one.

**Why it happens:** The observer callback iterates entries and picks the one with the highest `intersectionRatio`. But when scrolling fast, multiple entries fire in rapid succession. Each `setActiveSection()` call triggers a re-render of the nav. With 10+ sections, fast scrolling creates a flicker effect in the nav highlighting.

**Evidence:** Current code in OnePager.jsx lines 130-158. The rootMargin is `-80px 0px -60% 0px`, which creates a small "active zone" in the top 40% of the viewport. Sections that scroll past the zone quickly still trigger entry/exit callbacks.

**Consequences:** Nav highlight flickers during fast scrolling. On sections with many subsections (debate steps), the observer may never settle on the correct active section because elements enter and exit the threshold zone faster than React re-renders.

**Prevention:**
- Debounce the `setActiveSection()` call with a 50-100ms `requestAnimationFrame` or `setTimeout`. Only commit the last value.
- Use a single observer instance shared across all stage renderers (the existing OnePager and PitchDeck each create their own observer with the same logic duplicated).
- Extract a `useScrollSpy(sectionIds)` hook that returns `activeSection`. Encapsulates the observer lifecycle, debouncing, and cleanup. Reuse across all three stage renderers.

**Detection:** Open Pitch Deck or Full Story. Scroll rapidly up/down. Watch the sticky nav -- if highlighting jumps between non-adjacent sections, the observer is firing too fast.

**Phase assignment:** Shared components phase. Build `useScrollSpy` before any stage renderer.

---

### Pitfall 7: Data Formatting Inconsistency Between SectionRenderer and Toolbox

**What goes wrong:** The SectionRenderer has its own `fmtNum`, `fmtDollar`, `fmtPct` formatters (lines 43-65) and a `formatDataValue` function that uses regex key matching (`DOLLAR_KEYS`, `PCT_KEYS`) to guess the format. But the Toolbox's `FinancialStatements.jsx` uses different formatters from `keyMetrics.js`. The same field (e.g., `revenue`, `netIncome`) can display differently depending on which tab you view it in.

**Why it happens:** The SectionRenderer was built independently and couldn't import Toolbox formatters without creating a circular dependency. The regex-based key matching (`/revenue|income|debt|.../i`) is fragile -- agent-generated data uses different key names than the XBRL engine. For example, agents might output `netRevenue` or `totalRevenue` which the regex catches, but `topLineGrowth` (a percentage) might not match the `PCT_KEYS` pattern.

**Evidence from Phase 05B bug:** "Raw numbers with no formatting: `432040000000.00` instead of `$432B`." The `formatDataValue` function handles dollar amounts correctly for keys matching `DOLLAR_KEYS`, but the agent output uses keys like `tenYearRevenue` which the regex misses.

**Consequences:** Financial data looks unprofessional. Users see `432040000000.00` in one view and `$432.0B` in another. Undermines trust in the analysis.

**Prevention:**
- Extract a shared `formatters.js` module with all formatting functions. Both SectionRenderer and FinancialStatements import from it.
- Augment the regex approach with explicit format hints from the schema. Agent output data already has typed values -- extend the schema to include a `format` field per data key (`'dollar' | 'percent' | 'number' | 'text' | 'year'`).
- Until schema changes land: improve the regex fallback to catch more patterns, and add a `fmtAuto(key, value)` function that combines heuristics + type checking.

**Detection:** Open any report section. If any number displays with more than 2 decimal places or exceeds 6 digits without abbreviation, the formatter missed it.

**Phase assignment:** Shared components phase. The formatter module should exist before any section renderer is built.

---

### Pitfall 8: Polling Progress Creates Network Chatter During Generation

**What goes wrong:** Both `useOnePager.js` and `usePitchDeck.js` poll the Vite middleware every 2 seconds for progress updates. The middleware reads files from disk on every request. During generation (which can take 5-14 minutes), this creates 150-420 HTTP requests per generation run. With Full Story added, a `useFullStory` hook would add another polling loop.

If the user navigates away from the report and back, the hook re-initializes and starts polling again. If multiple reports are being viewed (switching between tabs), multiple polling loops run simultaneously.

**Why it happens:** Without WebSockets or SSE (no server to maintain connections), file-based polling via Vite middleware is the only option. The 2-second interval was chosen as a balance between responsiveness and overhead.

**Consequences:**
- Vite dev server handles 150-420 file reads per generation (plus normal dev traffic)
- Multiple simultaneous polls if user navigates between reports
- After generation completes, the poll continues for one more cycle before stopping (the `COMPLETE` check happens after the fetch, not before)
- Tauri production build has no Vite middleware -- the polling endpoints return 404

**Prevention:**
- Increase poll interval to 3-5 seconds. The user does not need sub-second progress granularity for a 5-14 minute pipeline.
- Add a guard: if `progress.state === 'COMPLETE'`, stop polling immediately. Do not fetch one more time.
- Ensure hooks clean up polling on unmount AND on ticker change (the existing `cancelled` flag handles unmount, but not ticker change within the same component mount).
- For Tauri production: the polling approach needs a different transport. Options: (a) file watcher via Tauri's fs API, (b) Tauri IPC events from the Rust side watching the reports directory, (c) accept that real-time progress only works in dev mode for now.
- Long-term: implement SSE via the Vite middleware for one-way progress streaming. Single HTTP connection, no polling.

**Detection:** Open browser DevTools Network tab during generation. Count requests to `/api/thes1s/reports/*/progress`. If you see more than 1 request per 3 seconds, polling is too aggressive.

**Phase assignment:** Infrastructure/shared phase. Fix before building the Full Story hook, which would be the third concurrent polling loop.

---

### Pitfall 9: Report Route Structure Fragments the Navigation Model

**What goes wrong:** The current routing adds report stage views at `/research/:id/one-pager`, `/research/:id/pitch-deck`, `/research/:id/full-story`. This creates a navigation ambiguity: the Toolbox lives at `/research/:id`, and the report stages are siblings. The user must mentally model "am I looking at the data (Toolbox) or the analysis (report stage)?" But the top nav only shows "Research" as active for all of these.

**Why it happens:** Report stage routes were added incrementally alongside the existing Toolbox route. The Phase 05B bug noted: "Clicking COST in Reports tab navigates to `/research/:id/one-pager` which highlights 'Research' in the top nav instead of 'Reports'." The nav highlighting issue is a symptom of the deeper problem: the route structure doesn't clearly separate data exploration (Toolbox) from report viewing (stages).

**Consequences:**
- Users get lost: "How do I get back to the financials?" after reading the One Pager
- The Reports tab at `/reports` lists tickers but navigates to `/research/:id/one-pager` -- crossing tab boundaries
- Deep links to specific sections (e.g., `/research/:id/pitch-deck#valuation`) need scroll-to behavior that conflicts with the Toolbox tab state
- Stage gating logic lives in multiple places (App.jsx route guards + component-level checks)

**Prevention:**
- Add a sub-navigation within the research view that shows: Toolbox | One Pager | Pitch Deck | Full Story. This keeps the user in the `/research/:id` context with clear tab switching.
- Move stage gating into the sub-nav: locked tabs show a lock icon and disabled state. Clicking a locked tab shows a tooltip explaining the prerequisite.
- Alternatively, add report stages as tabs within the Toolbox itself (extending the existing 8-tab bar to 11 tabs). This is simpler but makes the tab bar crowded.
- Whichever approach: ensure the top-level nav consistently highlights "Research" when viewing any research-related route, and "Reports" when viewing the reports listing.

**Detection:** Navigate: Reports -> click ticker -> One Pager -> try to get back to Financials tab. Count the number of clicks/back-button presses needed.

**Phase assignment:** First phase. Route structure is foundational. Adding more stage views on top of a confusing route model makes the problem exponentially worse.

---

## Minor Pitfalls

### Pitfall 10: Duplicated Helper Functions Across Stage Components

**What goes wrong:** `OnePager.jsx` and `PitchDeck.jsx` both define `formatTitle()`, `formatRelativeTime()`, `stateToLabel()`, `verdictDotColor()`, `injectSpinnerStyle()`, and `Spinner`. These are copy-pasted between files. When a bug is fixed in one, the other is forgotten.

**Prevention:** Extract shared helpers into a `reportUtils.js` module. Extract `Spinner` into a shared component. Both components import from the shared module. The `_testExports` pattern already exists for testing -- use it for the shared module too.

**Phase assignment:** Shared components phase (first).

---

### Pitfall 11: Checklist Table Rendering with Zero-Column Headers

**What goes wrong:** The MNST Full Story checklist tables have `headers: []` (0 columns) but rows with data. This is a bug in the agent output, but the renderer must handle it gracefully. The current `SectionRenderer` table rendering assumes `table.headers` is populated and iterates headers to build `<th>` elements. With empty headers, the table renders a `<thead>` with an empty `<tr>` but data rows below -- visually confusing.

**Evidence:** MNST meaning_checklist: "Meaning Checklist Score Summary, 15 rows x 0 cols".

**Prevention:**
- Add a guard: if `table.headers.length === 0`, attempt to infer headers from the first row's structure, or skip the `<thead>` entirely.
- Better: update agent prompts to always include headers. But defensive rendering is required regardless -- agents are not deterministic.
- For checklist data specifically (`data.items[]` with `number, item, verdict, evidence, confidence`): build a dedicated `ChecklistRenderer` component that renders checklist items as styled cards with verdict indicators, not as generic tables.

**Phase assignment:** Full Story display phase. The ChecklistRenderer is specific to scored checklists.

---

### Pitfall 12: CSS Animation Keyframes Injected Multiple Times

**What goes wrong:** Both `OnePager.jsx` and `PitchDeck.jsx` inject `@keyframes thes1s-spin` and `@keyframes thes1s-fadeIn` via `document.createElement('style')` with a module-level `spinnerInjected` flag. But each file has its own flag -- so the same keyframes are injected twice (once per component that mounts first). Adding a Full Story component would inject them a third time.

**Prevention:** Move keyframe injection to `theme.js` (called once at app startup via `applyTheme`), or extract a `useAnimationStyles()` hook with a global singleton flag. A simpler approach: define the keyframes in a minimal CSS file (the only one in the project) that Vite bundles automatically.

**Phase assignment:** Shared components phase.

---

### Pitfall 13: No Loading State for Large Report JSON Fetch

**What goes wrong:** Pitch Deck JSON is 414KB, Full Story is 325KB. On first load (no cache), the `fetch()` + `JSON.parse()` takes noticeable time (100-300ms on fast disk, potentially longer via Vite middleware). During this time, the component shows either a blank screen or a brief flash of the "No report generated yet" empty state before the data arrives.

**Prevention:** The existing hooks have `loading` state, but the components check `if (!report && !progress)` for the empty state. This means during the initial fetch (loading=true, report=null, progress=null), the empty state flashes briefly. Fix: check `if (!report && !progress && !loading)` for the empty state. The loading=true state should show a skeleton or spinner, never the "no report" message.

**Phase assignment:** Every stage renderer. But the pattern is simple -- just add `!loading` to the empty state guard.

---

### Pitfall 14: Tauri Production Build Has No Report Serving Middleware

**What goes wrong:** All report fetching goes through Vite middleware (`/api/thes1s/reports/...`). In production (Tauri `.app` bundle), Vite is not running. The middleware endpoints return nothing. Reports cannot be loaded.

**Why it happens:** The Vite middleware approach was built for development. The Tauri production path was deferred ("Polish phase" in CLAUDE.md). But v1.3 is building the UI that depends on this middleware.

**Prevention:**
- For v1.3: document that report viewing requires `npm run dev` or `npm run tauri:dev`. Do not promise Tauri production report viewing yet.
- Long-term: use Tauri's `fs` plugin to read report JSON files directly from the filesystem, or implement Tauri IPC commands that the frontend calls instead of HTTP fetch.
- The report data could also be loaded via `fetch('file://...')` in Tauri's webview (CSP is disabled per tauri.conf.json), but this is fragile and not recommended.

**Phase assignment:** Out of scope for v1.3. Document as a known limitation. Address in the Polish milestone.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Storage layer (first) | localStorage quota (Pitfall 1) | Move report content to IndexedDB before building any UI |
| Shared components | Theme stale refs (Pitfall 2) | Code review checklist: "Does this component read C.* at render time?" |
| Shared components | Markdown rendering (Pitfall 5) | Install react-markdown, replace custom parser |
| Shared components | Formatter inconsistency (Pitfall 7) | Extract shared formatters.js |
| Shared components | Scroll spy perf (Pitfall 6) | Build useScrollSpy hook with debounce |
| Shared components | Duplicated helpers (Pitfall 10) | Extract reportUtils.js |
| Route structure | Navigation confusion (Pitfall 9) | Design sub-nav before building views |
| One Pager polish | Citation clipping (Pitfall 4) | Add viewport boundary detection |
| Pitch Deck display | Loading flash (Pitfall 13) | Guard empty state with !loading |
| Full Story display | Debate rendering (Pitfall 3) | Build 4 step-specific components |
| Full Story display | Checklist tables (Pitfall 11) | Build dedicated ChecklistRenderer |
| Real-time progress | Poll chatter (Pitfall 8) | Increase interval, add completion guard |
| Production build | No middleware (Pitfall 14) | Document as known limitation |

---

## Severity Summary

| Severity | Count | Key Items |
|----------|-------|-----------|
| Critical | 3 | localStorage quota, mutable theme stale refs, debate rendering complexity |
| Moderate | 6 | Citation clipping, markdown rendering gap, scroll spy perf, formatter inconsistency, poll chatter, route fragmentation |
| Minor | 4 | Duplicated helpers, checklist table edge case, animation keyframe duplication, loading flash |

---

## Sources

- Existing codebase analysis: `src/hooks/useResearch.js`, `src/theme.js`, `src/components/SectionRenderer.jsx`, `src/components/CitationTooltip.jsx`, `src/components/OnePager.jsx`, `src/components/PitchDeck.jsx`
- Phase 05B UI Polish Notes: `.planning/phases/05B-one-pager-display-components/05B-UI-POLISH-NOTES.md`
- Report size measurements: `.thes1s/reports/` (MNST, SFM, MSFT, POOL)
- Schema definitions: `src/schemas/reportSection.js`, `src/schemas/debateStep.js`, `src/schemas/progress.js`
- [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [LogRocket: Why you shouldn't use inline styling in production React apps](https://blog.logrocket.com/why-you-shouldnt-use-inline-styling-in-production-react-apps/)
- [React-Markdown on npm](https://www.npmjs.com/package/react-markdown)
- [Floating UI: The Modern Positioning Engine](https://converter.brightcoding.dev/blog/floating-ui-the-modern-positioning-engine-every-developer-needs)
- [Strapi: React Markdown Complete Guide 2025](https://strapi.io/blog/react-markdown-complete-guide-security-styling)
- [Maxime Heckel: Scrollspy Demystified](https://blog.maximeheckel.com/posts/scrollspy-demystified/)
