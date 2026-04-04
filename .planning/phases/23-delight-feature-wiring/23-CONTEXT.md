# Phase 23: Delight Feature Wiring - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire three enrichment features to report data: (1) DeepDivePanel with on-demand Claude API for notable claims, (2) Promise Tracker replacing AssumptionTracker — extracting management forward-looking statements from transcripts and tracking delivery, (3) IndustryCard glossary tooltips with pipeline-generated per-report term dictionaries. Bull/Bear toggle (DLT-04) deferred — existing DebateRenderer covers it.

</domain>

<decisions>
## Implementation Decisions

### Deep Dive Panel (DLT-01)
- **D-01:** Deep dive content generated **on-demand via Claude API** — when user clicks "Tell me more" on a notable claim, fires a live Claude API call with claim context + section data. ~3-5s latency, ~$0.02-0.05 per call.
- **D-02:** Notable claims identified by **pipeline during report generation**. Pipeline adds a `notableClaims[]` array per section with `{text, context}`. UI renders these as clickable "Tell me more" links in the narrative.
- **D-03:** Deep dive responses **saved permanently into the report JSON** — the expanded analysis becomes part of the report (like an analyst incorporating deeper research into their memo). No separate cache. User can re-read the deep dive on subsequent visits without re-triggering.
- **D-04:** **Iterative deepening** supported — after first deep dive, a "Go Deeper" button appears. Each click adds another layer of analysis, all saved to the report. 2-3 depth levels max.
- **D-05:** Deep dives available on **Pitch Deck and Full Story** only. One Pager is a quick filter — no deep dives.
- **D-06:** DeepDivePanel component already exists at `src/components/pitchDeck/DeepDivePanel.jsx` — 440px slide-out panel with overlay, Escape/click-outside close, loading spinner. Reuse as-is, just wire to data.

### Promise Tracker (replaces DLT-02)
- **D-07:** Replaces AssumptionTracker. The "assumption tracker" concept is replaced by **Management Promise Tracker** — extracts forward-looking statements from earnings call transcripts, tags each with quarter/year, and compares promises to actual results.
- **D-08:** Promise extraction happens **in the pipeline during report generation** — the Primary Source Reader agent reads cached transcripts and extracts forward-looking statements (revenue guidance, growth targets, strategic plans).
- **D-09:** Promises stored in report JSON per ticker as a `promises` data structure. Each promise: `{quote, quarterYear, category, status (KEPT/BROKEN/PENDING/PARTIAL), evidence}`.
- **D-10:** Promise Tracker rendered as a **dedicated section in Full Story** (7th section alongside Event Analysis, checklists, etc.) — not a sidebar. Integrated into the section nav and scrollspy.
- **D-11:** Available on **Full Story only** — this is the conviction stage where management credibility matters most.
- **D-12:** Individual promises displayed as **timeline cards** — chronological order, each card shows: quote, quarter/year tag, category badge, verdict badge (KEPT/BROKEN/PENDING/PARTIAL). Click to expand and see comparison evidence (what they promised vs what happened).
- **D-13:** Aggregate header uses **segmented bar + score** — same pattern as checklist aggregate header (Phase 21). Green/yellow/red proportional segments for KEPT/PARTIAL/BROKEN counts, text summary below (e.g., "8 KEPT · 2 PARTIAL · 1 BROKEN").
- **D-14:** Produces **management credibility metrics** fed into the Management section of the Full Story.

### Glossary Tooltips (DLT-03)
- **D-15:** Glossary data **generated per-report by the pipeline**. Each report's pipeline identifies industry-specific terms and financial metrics relevant to that company, generating definitions + industry benchmarks contextualized to the ticker.
- **D-16:** Term detection in narratives done by **pipeline marking** — pipeline wraps glossary terms with markers (e.g., a `glossaryTerms[]` array per section listing detected terms with positions). UI renders marked terms as dashed-underline spans.
- **D-17:** Glossary tooltips available on **Pitch Deck and Full Story** only.
- **D-18:** IndustryCard component already exists at `src/components/pitchDeck/IndustryCard.jsx` — 320px positioned popover with term, category, definition, and benchmark data. Reuse as-is.

### Bull/Bear Toggle (DLT-04) — DEFERRED
- **D-19:** Existing DebateRenderer with Bull/Bear/Rebuttal/Judge tabs (Phase 21) already delivers perspective switching. No separate report-wide toggle needed. DLT-04 deferred.

### Claude's Discretion
- How to format the "Tell me more" clickable links in narrative text (inline link, button, icon)
- Deep dive API prompt design (what context to send to Claude for the best expansion)
- Promise extraction prompt design for the Primary Source Reader
- Glossary term density limits (how many terms to mark per paragraph to avoid visual noise)
- Whether to show a small floating "Glossary" legend or just rely on hover discovery
- Timeline card expand/collapse animation approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Delight Components (reuse targets)
- `src/components/pitchDeck/DeepDivePanel.jsx` — 440px slide-out panel with overlay, Escape/click-outside close, loading spinner, string/React node content rendering
- `src/components/pitchDeck/AssumptionTracker.jsx` — Current sidebar panel to be replaced by Promise Tracker. Reference for the slide-out pattern but the component itself will be deprecated.
- `src/components/pitchDeck/IndustryCard.jsx` — 320px positioned popover with term, category, definition, benchmarks array

### Report Viewers (integration targets)
- `src/components/PitchDeck.jsx` — Already has delight feature state (deepDive, industryCard, assumptionOpen) at lines 337-340. Already renders DeepDivePanel, IndustryCard, AssumptionTracker at lines 1137-1156. Wire deep dives and glossary here.
- `src/components/FullStory.jsx` — Full Story viewer. Add deep dives, glossary, and Promise Tracker section here. Currently has 6 SECTION_DEFS — Promise Tracker becomes 7th.
- `src/components/SectionRenderer.jsx` — General-purpose section renderer. Needs to support rendering "Tell me more" links for notable claims and dashed-underline glossary terms in narrative text.

### Existing Patterns (for Promise Tracker section)
- `src/components/ChecklistRenderer.jsx` — Phase 21 checklist renderer with segmented aggregate bar. Promise Tracker aggregate header should follow same pattern.
- `src/components/VerdictBadge.jsx` — PASS/FAIL/WATCHLIST badges. Reuse or extend for KEPT/BROKEN/PENDING/PARTIAL promise statuses.
- `src/components/DebateRenderer.jsx` — Phase 21 debate renderer. Reference for structured data rendering in Full Story sections.

### Pipeline (data source)
- `.thes1s/reports/SFM/full-story-api.json` — Current Full Story data shape. Pipeline needs to add: `notableClaims[]` per section, `promises[]` top-level, `glossaryTerms[]` per section.
- `.thes1s/reports/SFM/pipeline-output.json` — Pitch Deck pipeline output. Needs `notableClaims[]` and `glossaryTerms[]` per section.

### Claude API Integration
- `src/engines/config.js` — API key configuration (`VITE_CLAUDE_KEY`)
- `src/engines/companyAdapter.js` — Existing Claude API call pattern (Layer 3 XBRL classification). Reference for how the app calls Claude directly.

### Transcript Data
- `src/engines/transcripts.js` — Earnings call transcript engine (Finnhub + Alpha Vantage, IndexedDB cache). Source data for Promise Tracker extraction.

### CEO Plan (Promise Tracker origin)
- `gstack/plans/gstack-ai-agent-workflow-ceo-plan-20260323.md` — Section 7: Management Promise Tracker specification. Lines 122-130 define the feature requirements.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **DeepDivePanel** — Fully built slide-out panel. Accepts `{isOpen, onClose, title, content, loading}`. Handles animation, focus trap, Escape key. Ready for wiring.
- **IndustryCard** — Fully built positioned popover. Accepts `{isOpen, onClose, term, category, definition, benchmarks, position}`. Handles click-outside. Ready for wiring.
- **AssumptionTracker** — Will be replaced by Promise Tracker. The slide-out pattern (overlay, close button, Escape) can be referenced but the component itself is deprecated by this phase.
- **ChecklistRenderer aggregate bar** — Segmented green/yellow/red bar pattern. Reuse for Promise Tracker credibility header.
- **VerdictBadge** — PASS/FAIL/WATCHLIST pill badges. Extend or create similar for KEPT/BROKEN/PENDING/PARTIAL.
- **PitchDeck.jsx delight state** — Already has `useState` for deepDive, industryCard, assumptionOpen at lines 337-340. Pattern to follow for FullStory.jsx.

### Established Patterns
- **Inline styles with C palette** — All styling via mutable C object from theme.js.
- **Report JSON mutation** — Reports stored in IndexedDB via `idbSet` with 10-year TTL (Phase 18). Deep dive responses will be written back to report JSON via `updateReport`.
- **Claude API from browser** — `companyAdapter.js` uses `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`. Same pattern for deep dive API calls.
- **Section rendering dispatch** — FullStory.jsx conditionally renders ChecklistRenderer or DebateRenderer based on section key (Phase 21 D-15). Promise Tracker will be another conditional branch.

### Integration Points
- **FullStory.jsx SECTION_DEFS** — Add Promise Tracker as 7th entry. Conditional rendering in the section loop.
- **SectionRenderer narrative** — Must be enhanced to render "Tell me more" links (from notableClaims[]) and dashed-underline glossary terms (from glossaryTerms[]).
- **Pipeline prompts** — Need additions to extract notableClaims[], glossaryTerms[], and promises[]. Affects agent prompt files in `.claude/agents/` or `src/engines/aiResearch.js`.
- **useFullStory hook** — May need to handle report JSON updates when deep dives are saved back.
- **usePitchDeck hook** — Same deep dive save-back pattern needed.

</code_context>

<specifics>
## Specific Ideas

- Deep dives are like a PM telling an analyst to dig deeper — the expanded analysis gets incorporated into the report permanently, not shown once and discarded. Iterative deepening means the PM can keep pushing for more depth.
- Promise Tracker is the "single most differentiated feature" per CEO plan — no existing tool tracks management promises vs delivery across earnings calls. This is a hedge fund killer feature.
- Promise Tracker renders as a Full Story section (not a sidebar) so it's part of the natural report reading flow, integrated with scroll spy and section nav.
- Glossary tooltips should feel ambient — dashed underlines that don't distract from reading but are there when you need context on an unfamiliar term.

</specifics>

<deferred>
## Deferred Ideas

- **Bull/Bear toggle (DLT-04)** — Existing DebateRenderer with Bull/Bear/Rebuttal/Judge tabs already delivers perspective switching. No separate report-wide toggle needed.
- **AssumptionTracker (original DLT-02)** — Replaced by Promise Tracker. The assumption tracking concept is less valuable than management promise tracking. AssumptionTracker component can be deprecated.
- **Deep dives on One Pager** — One Pager is a quick filter screen. Deep dives deferred to PD + FS only.
- **Glossary on One Pager** — Same rationale. PD + FS only.
- **Promise Tracker on Pitch Deck** — Full Story only for now. Could extend to PD management section in future milestone.
- **Promise credibility feeding into Rule One Score** — Promise Tracker produces credibility metrics. Could influence the overall management score in ruleOneScore.js in a future phase.

</deferred>

---

*Phase: 23-delight-feature-wiring*
*Context gathered: 2026-04-03*
