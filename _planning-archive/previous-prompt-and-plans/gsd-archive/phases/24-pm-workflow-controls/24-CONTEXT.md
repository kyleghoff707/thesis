# Phase 24: PM Workflow Controls - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the PM's interactive control surface for the research pipeline: (1) mid-pipeline checkpoint UI where the PM reviews completed wave sections, leaves per-section comments, attaches files, sees data gaps, and can continue or re-run the wave; (2) in-app research initiation via contextual "Generate" buttons on the Toolbox header with cost/time confirmation dialogs; (3) cross-tab navigation between Research and Reports tabs.

</domain>

<decisions>
## Implementation Decisions

### PM Checkpoint Review (Mid-Pipeline)
- **D-01:** PM review happens at **mid-pipeline checkpoints**, not post-generation. When a wave completes (e.g., PD Wave 1 sections 1-4), the pipeline pauses and presents a checkpoint panel. The PM reviews, comments, provides data, then continues or re-runs. By the time the stage-level Approve/Reject gate appears, the PM has already refined every wave.
- **D-02:** Checkpoint UI is a **dedicated checkpoint panel** (not modal, not inline banner). Shows completed sections with narratives, data gaps summary, and per-section comment boxes with action buttons.
- **D-03:** Per-section feedback uses a **toggle-to-show comment box** — a small comment icon/badge on each section header. Click to expand the comment area. Keeps the reading view clean but commenting is one click away.
- **D-04:** PM can **attach files** (screenshots, PDFs) to section comments. Stored locally in IndexedDB. Full file picker support, not just links.
- **D-05:** Checkpoint action buttons: **"Continue"** (satisfied, proceed to next wave) and **"Re-run Wave"** (agents re-generate incorporating PM feedback). PM feedback (comments + attachments + filled data gaps) gets passed to agents on re-run.
- **D-06:** The stage-level Approve/Reject gate (after all waves complete) stays as-is — binary approve/reject. By this point the PM has already reviewed everything via checkpoints, so approval is a formality.

### Data Gap Transparency
- **D-07:** Data gaps appear as a **dedicated "Data Gaps" section at the top of the checkpoint panel**, before section narratives. Lists what agents couldn't access: API failures, missing data sources, ticker-specific gaps.
- **D-08:** PM can **act on data gaps** — each gap has an "Add source" button. PM pastes a URL or attaches a file (e.g., earnings transcript PDF, analyst report). Filled gaps get fed to agents on re-run.
- **D-09:** Data gap data comes from the existing orchestrator infrastructure: `checkpointRules.presentDataGaps: true` and `checkpoint.presents: ["dataGaps"]` in the dispatch table. Phase 24 builds the UI that surfaces this data.

### Research Initiation UX
- **D-10:** "Generate" button lives on the **Toolbox header** (CompanyHeader area), next to the ticker name. Natural flow: explore data → decide to research → click generate.
- **D-11:** Button is **contextual per stage**: "Generate One Pager" → "View One Pager" (once generated) → "Generate Pitch Deck" (once OP approved) → "View Pitch Deck" → "Generate Full Story" (once PD approved) → "View Full Story". Always shows the next logical action.
- **D-12:** Every generation trigger shows a **confirmation dialog** with cost/time expectations. One Pager dialog explains this is the beginning of a 3-stage pipeline (OP → PD → FS). Each stage's dialog includes estimated cost and time. The intent is to prevent casual/accidental generation — only serious investment targets.
- **D-13:** Generation triggered via **API call** — POST `/api/thes1s/generate/{ticker}/{stage}`. Vite middleware spawns the pipeline process. Frontend polls for progress using existing polling infrastructure.

### Research ↔ Reports Tab Navigation
- **D-14:** Keep Research and Reports as **separate tabs** with improved cross-navigation. Research = data exploration, Reports = AI-generated research. Different purposes, different data sources.
- **D-15:** Research tab rows get a **"View Reports" button** (plural, future-proofing for multi-report per ticker). Navigates to the Reports page filtered to that ticker. Reports tab gets a "View Toolbox" link back.

### Claude's Discretion
- Checkpoint panel layout and styling details (consistent with existing card patterns)
- Comment box expand/collapse animation approach
- File attachment thumbnail/preview rendering in comments
- Data gap severity/categorization visual treatment
- Confirmation dialog exact copy and cost estimates
- How PM feedback gets serialized and passed to agent re-runs
- Progress/loading states during generation after button click
- "View Reports" button styling and placement in ResearchList rows

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Orchestrator Checkpoint Infrastructure (existing backend)
- `agents/orchestrator/config.json` — Section-to-agent mapping, `checkpointRules` (presentFindings, presentDataGaps, presentQuestions, presentConfidence)
- `agents/orchestrator/dispatch-table.json` — Phase-by-phase execution with `checkpoint.after: true` and `checkpoint.presents` arrays per wave
- `agents/orchestrator/README.md` — State machine (WAVE_N_RUNNING → CHECKPOINT_N), checkpoint format documentation

### Report Stage Viewers (modify targets for checkpoint UI)
- `src/components/OnePager.jsx` — Stage 1 viewer with approval bar (lines 383-430). Current approval: handleApprove/handleReject with window.prompt
- `src/components/PitchDeck.jsx` — Stage 2 viewer with GenerationStatusPanel (lines 111-325). Already has live progress grid with section status, agent names, phase labels
- `src/components/FullStory.jsx` — Stage 3 viewer with quality scores
- `src/components/StageNavBar.jsx` — Gate locking logic, STAGES array, GATE_TOOLTIPS

### Progress/Polling Infrastructure (existing patterns to reuse)
- `src/hooks/usePitchDeck.js` — Polls `/api/thes1s/reports/{ticker}/generation-status` every 2s (line 77), progress polling (line 68)
- `src/hooks/useOnePager.js` — Progress polling with 2s interval
- `src/hooks/useFullStory.js` — Progress + generation-status polling
- `src/engines/progressState.js` — Progress state machine

### Research Initiation Entry Points (modify targets)
- `src/components/CompanyHeader.jsx` — Ticker name, company info display. Target for "Generate" button placement
- `src/components/Toolbox.jsx` — Main research container, orchestrates all hooks
- `src/components/ResearchList.jsx` — Research pipeline table. Target for "View Reports" button
- `src/components/ReportsList.jsx` — Generated reports list with stage pills. Target for "View Toolbox" link

### Data Model
- `src/hooks/useResearch.js` — Report CRUD, `stageApprovals` field (lines 81-85), IndexedDB persistence
- `src/engines/cacheStore.js` — IndexedDB wrapper for file attachment storage

### Vite Middleware (API endpoint target)
- `vite.config.js` — Custom middleware plugins, existing `/api/thes1s/reports` endpoint. Target for new POST `/api/thes1s/generate/{ticker}/{stage}` endpoint

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PitchDeck.jsx` GenerationStatusPanel — Already renders live section status grid with checkmarks, agent names, duration. Pattern reference for checkpoint panel
- `SectionRenderer.jsx` — Renders section cards. Will need the toggle-to-show comment icon added to section headers
- `CollapsibleSection.jsx` — Existing expand/collapse pattern that can inform comment box toggle
- `StageNavBar.jsx` gate logic — Pattern for checking `stageApprovals` conditions
- `cacheStore.js` IndexedDB — Already handles large blob storage (EDGAR facts, guru filings). Can store file attachments

### Established Patterns
- Polling: 2-second interval polling for progress/generation-status via custom hooks
- Inline styles with mutable `C` palette object (dark/light theme)
- `{ data, loading, error }` hook return pattern
- Fire-and-forget async writes for responsive UI (useResearch.js)

### Integration Points
- CompanyHeader.jsx — "Generate" button placement
- Vite middleware — New POST endpoint for triggering pipeline
- Report JSON schema — PM comments and attachments need storage fields
- Orchestrator dispatch table — Checkpoint state transitions need frontend counterpart
- Progress state machine — New CHECKPOINT_N states need UI representation

</code_context>

<specifics>
## Specific Ideas

- Confirmation dialog should set expectations: "This kicks off an AI research pipeline that takes ~5-10 minutes and costs ~$2-3. The One Pager is a screening filter — only generate for companies you're seriously considering as investment targets."
- One Pager confirmation should mention the full pipeline: "You are beginning a 3-stage research process (One Pager → Pitch Deck → Full Story). The whole pipeline takes much longer — by design."
- Each stage confirmation includes its own cost/time estimate
- "View Reports" button is plural — future-proofing for multiple reports per ticker at different points in time
- PM checkpoint review is the hedge fund model: the PM doesn't just read the final output, they steer the analysis at every checkpoint, providing additional data sources and corrections before the next wave

</specifics>

<deferred>
## Deferred Ideas

- Merging Research and Reports into a single tab — considered but deferred. Keep separate with cross-navigation for now.
- Multi-report per ticker (generating multiple reports at different times) — "View Reports" (plural) anticipates this but implementation deferred.
- Terminal/CLI live view of orchestrator progress — already covered by in-app progress UI.
- Batch generation from Research list — PM can only trigger one at a time from Toolbox header.

</deferred>

---

*Phase: 24-pm-workflow-controls*
*Context gathered: 2026-04-04*
