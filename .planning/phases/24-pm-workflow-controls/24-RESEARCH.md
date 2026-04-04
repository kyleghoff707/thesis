# Phase 24: PM Workflow Controls - Research

**Researched:** 2026-04-04
**Domain:** React UI components, IndexedDB file storage, Vite middleware API endpoints, state machine integration
**Confidence:** HIGH

## Summary

Phase 24 adds three major UI capabilities: (1) a checkpoint panel where the PM reviews completed wave sections mid-pipeline, leaves per-section comments with file attachments, sees data gaps, and continues or re-runs the wave; (2) a contextual "Generate" button on CompanyHeader that triggers pipeline execution via a new Vite middleware POST endpoint; (3) cross-navigation between Research and Reports tabs. All three build on existing infrastructure -- the progress state machine already has CHECKPOINT_N states, the polling hooks already handle generation status, SectionRenderer already renders section cards, and cacheStore.js already handles IndexedDB blob storage.

The existing codebase is well-structured for this work. The primary design challenge is the checkpoint panel layout -- it must display completed section narratives, a data gaps summary, per-section toggle-to-show comment boxes with file attachment support, and Continue/Re-run action buttons. The secondary challenge is the file attachment storage in IndexedDB, which requires adding a new object store to cacheStore.js (DB_VERSION bump from 6 to 7). The generation trigger endpoint is straightforward -- the Vite middleware already serves report JSON and just needs a POST handler that spawns the pipeline process.

**Primary recommendation:** Build the checkpoint panel as a new `CheckpointPanel.jsx` component that renders between the GenerationStatusPanel and the section content. Use the existing `CollapsibleSection.jsx` expand/collapse pattern for the toggle-to-show comment boxes. Store file attachments in a new `checkpoint-attachments` IndexedDB store via cacheStore.js. Add `POST /api/thes1s/generate/:ticker/:stage` to vite.config.js that shells out to the pipeline.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** PM review happens at mid-pipeline checkpoints, not post-generation. When a wave completes, pipeline pauses and presents a checkpoint panel. PM reviews, comments, provides data, then continues or re-runs.
- **D-02:** Checkpoint UI is a dedicated checkpoint panel (not modal, not inline banner). Shows completed sections with narratives, data gaps summary, and per-section comment boxes with action buttons.
- **D-03:** Per-section feedback uses a toggle-to-show comment box -- a small comment icon/badge on each section header. Click to expand the comment area.
- **D-04:** PM can attach files (screenshots, PDFs) to section comments. Stored locally in IndexedDB. Full file picker support, not just links.
- **D-05:** Checkpoint action buttons: "Continue" (proceed to next wave) and "Re-run Wave" (agents re-generate incorporating PM feedback). PM feedback gets passed to agents on re-run.
- **D-06:** Stage-level Approve/Reject gate stays as-is -- binary approve/reject. By this point PM has already reviewed everything via checkpoints.
- **D-07:** Data gaps appear as a dedicated "Data Gaps" section at the top of the checkpoint panel, before section narratives.
- **D-08:** PM can act on data gaps -- each gap has an "Add source" button. PM pastes a URL or attaches a file. Filled gaps get fed to agents on re-run.
- **D-09:** Data gap data comes from the existing orchestrator infrastructure: checkpointRules.presentDataGaps and checkpoint.presents arrays.
- **D-10:** "Generate" button lives on the Toolbox header (CompanyHeader area), next to the ticker name.
- **D-11:** Button is contextual per stage: "Generate One Pager" -> "View One Pager" (once generated) -> "Generate Pitch Deck" -> etc.
- **D-12:** Every generation trigger shows a confirmation dialog with cost/time expectations.
- **D-13:** Generation triggered via API call -- POST /api/thes1s/generate/{ticker}/{stage}. Vite middleware spawns the pipeline process. Frontend polls for progress.
- **D-14:** Keep Research and Reports as separate tabs with improved cross-navigation.
- **D-15:** Research tab rows get a "View Reports" button. Reports tab gets a "View Toolbox" link back.

### Claude's Discretion
- Checkpoint panel layout and styling details (consistent with existing card patterns)
- Comment box expand/collapse animation approach
- File attachment thumbnail/preview rendering in comments
- Data gap severity/categorization visual treatment
- Confirmation dialog exact copy and cost estimates
- How PM feedback gets serialized and passed to agent re-runs
- Progress/loading states during generation after button click
- "View Reports" button styling and placement in ResearchList rows

### Deferred Ideas (OUT OF SCOPE)
- Merging Research and Reports into a single tab
- Multi-report per ticker (multiple reports at different times)
- Terminal/CLI live view of orchestrator progress
- Batch generation from Research list
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI layer | Already installed, functional components + hooks |
| react-router-dom | 7.13.1 | Navigation between Research/Reports | Already installed, useNavigate for cross-tab links |
| idb | 8.0.3 | IndexedDB wrapper for file attachment storage | Already installed, cacheStore.js pattern established |
| uuid | 13.0.0 | Unique IDs for comments and attachments | Already installed, used in useResearch.js |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.0 | Unit tests for new components | Already installed, 25+ engine tests + 12 component tests |
| jsdom | 29.0.1 | DOM environment for component logic tests | Already installed |

### Alternatives Considered
No new dependencies needed. All capabilities can be built with the existing stack.

## Architecture Patterns

### Recommended Component Structure
```
src/
├── components/
│   ├── CheckpointPanel.jsx          # NEW: Mid-pipeline review panel
│   ├── CheckpointCommentBox.jsx     # NEW: Per-section toggle comment with file attachments
│   ├── DataGapsPanel.jsx            # NEW: Data gap summary with "Add source" actions
│   ├── GenerateButton.jsx           # NEW: Contextual generate/view button for CompanyHeader
│   ├── ConfirmGenerateDialog.jsx    # NEW: Cost/time confirmation modal
│   ├── CompanyHeader.jsx            # MODIFY: Add GenerateButton
│   ├── SectionRenderer.jsx          # MODIFY: Add comment icon to section headers
│   ├── ResearchList.jsx             # MODIFY: Add "View Reports" button
│   ├── ReportsList.jsx              # MODIFY: Add "View Toolbox" link
│   └── PitchDeck.jsx                # MODIFY: Integrate CheckpointPanel at CHECKPOINT_N states
├── hooks/
│   ├── useCheckpoint.js             # NEW: Checkpoint data fetching + comment/attachment CRUD
│   └── useGeneratePipeline.js       # NEW: POST trigger + polling integration
├── engines/
│   └── cacheStore.js                # MODIFY: Add 'checkpoint-attachments' store (DB_VERSION 7)
```

### Pattern 1: Checkpoint Panel as State-Driven Component
**What:** The checkpoint panel appears when `progress.state` matches `CHECKPOINT_N`. It reads completed sections from the report data, data gaps from a new checkpoint endpoint, and manages comment/attachment state in IndexedDB.
**When to use:** During mid-pipeline generation, between wave completions.
**Example:**
```jsx
// CheckpointPanel receives progress state and renders conditionally
function CheckpointPanel({ ticker, progress, sections, onContinue, onRerun }) {
  // Only render at checkpoint states
  const isCheckpoint = /^CHECKPOINT_\d+$/.test(progress?.state);
  if (!isCheckpoint) return null;
  
  const checkpointNum = parseInt(progress.state.replace('CHECKPOINT_', ''));
  // ... render data gaps, completed sections, comment boxes, action buttons
}
```

### Pattern 2: Toggle-to-Show Comment Box (D-03)
**What:** A small comment icon in each section header. Click toggles a comment area with textarea + file picker. Uses the same expand/collapse animation pattern as CollapsibleSection.
**When to use:** On every section card during checkpoint review.
**Example:**
```jsx
// Comment icon in SectionRenderer header
<button onClick={toggleComment} style={{ ... }}>
  <CommentIcon />
  {commentCount > 0 && <span>{commentCount}</span>}
</button>
// Expand reveals textarea + file attachment area
{commentOpen && (
  <div style={{ height, transition: 'height 0.25s ease' }}>
    <textarea ... />
    <FileAttachmentArea attachments={attachments} onAttach={handleAttach} />
  </div>
)}
```

### Pattern 3: File Attachment Storage in IndexedDB (D-04)
**What:** File attachments stored as ArrayBuffer in a new `checkpoint-attachments` IndexedDB store. Each attachment gets a UUID key. Comments reference attachment IDs.
**When to use:** When PM attaches files to section comments or data gap responses.
**Example:**
```jsx
// Store file as blob in IndexedDB
async function storeAttachment(file) {
  const id = uuidv4();
  const buffer = await file.arrayBuffer();
  await idbSet('checkpoint-attachments', id, {
    name: file.name,
    type: file.type,
    size: file.size,
    data: buffer,
  }, ATTACHMENT_TTL);
  return { id, name: file.name, type: file.type, size: file.size };
}
```

### Pattern 4: Contextual Generate Button (D-10, D-11)
**What:** A button in CompanyHeader that changes label based on pipeline state. Uses existing polling hooks to determine current stage and generation status.
**When to use:** On the Toolbox (Research) tab, next to the ticker name.
**Example:**
```jsx
// Determine button label from report state
function getButtonState(report, hasOnePager, hasPitchDeck, hasFullStory) {
  if (!hasOnePager) return { label: 'Generate One Pager', action: 'generate', stage: 'onePager' };
  if (report?.stageApprovals?.onePager !== 'approved') return { label: 'View One Pager', action: 'view', stage: 'onePager' };
  if (!hasPitchDeck) return { label: 'Generate Pitch Deck', action: 'generate', stage: 'pitchDeck' };
  // ... etc
}
```

### Pattern 5: Vite Middleware POST Endpoint (D-13)
**What:** New POST handler in `thes1sReportsPlugin` that spawns the pipeline process. Responds immediately with 202 Accepted. Frontend then polls existing progress/generation-status endpoints.
**When to use:** When "Generate" button triggers after confirmation dialog.
**Example:**
```js
// In vite.config.js thes1sReportsPlugin
if (req.method === 'POST' && parts[1] === 'generate') {
  const ticker = parts[0].toUpperCase();
  const stage = parts[2]; // 'one-pager' | 'pitch-deck' | 'full-story'
  // Spawn pipeline process (child_process.spawn or exec)
  // Return 202 immediately -- frontend polls for progress
  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'started', ticker, stage }));
}
```

### Pattern 6: Checkpoint Data Persistence
**What:** PM comments, attachments, and data gap responses are stored in the report's checkpoint data within the progress schema. The `checkpoints` array in `ProgressSchema` already has `userInput: z.looseObject({})` which can hold comment and attachment reference data.
**When to use:** When PM saves comments or provides data gap responses during checkpoint review.

### Anti-Patterns to Avoid
- **Don't use a modal for the checkpoint panel.** D-02 explicitly says "dedicated checkpoint panel, not modal." Modals block interaction with the rest of the page. The checkpoint panel is the primary content during review.
- **Don't store file attachment binary data in localStorage.** localStorage has a 5-10MB limit and can only store strings. IndexedDB handles binary blobs natively.
- **Don't build a WebSocket connection for progress.** The existing 2-second polling pattern works and is established in all three stage hooks. Adding WebSocket would be premature complexity.
- **Don't modify the progress state machine transitions.** The CHECKPOINT_N states already exist in `VALID_TRANSITIONS`. The UI just needs to render differently when the state is CHECKPOINT_N.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Expand/collapse animation | Custom CSS transitions from scratch | Reuse CollapsibleSection.jsx pattern | requestAnimationFrame + scrollHeight measurement already handles edge cases |
| File picker UI | Custom drag-and-drop + file browser | Native `<input type="file" multiple>` + styled wrapper | Native file picker handles permissions, multiple files, file type filtering |
| Binary blob storage | Custom localStorage base64 encoding | IndexedDB via cacheStore.js idbSet/idbGet | IndexedDB natively stores ArrayBuffer without encoding overhead |
| Polling for generation progress | Custom setInterval logic | Reuse useOnePager/usePitchDeck polling pattern | Established 2s polling with cancellation, completion detection, and re-fetch |
| UUID generation | Math.random() hack | uuid v13.0.0 (already installed) | Proper RFC4122 UUIDs, consistent with useResearch.js |

**Key insight:** Almost every infrastructure piece needed already exists. The polling pattern, IndexedDB storage, expand/collapse animation, and progress state machine are all established. Phase 24 is about wiring new UI components to existing infrastructure.

## Common Pitfalls

### Pitfall 1: IndexedDB Version Bump Race Condition
**What goes wrong:** Adding a new object store (`checkpoint-attachments`) requires bumping `DB_VERSION` from 6 to 7 in cacheStore.js. If the upgrade handler is wrong, all existing stores get wiped.
**Why it happens:** The `upgrade` callback in `openDB()` only runs when version changes. The current code creates stores that don't exist yet, which is correct. But if you accidentally change the store list or the upgrade logic, existing data is at risk.
**How to avoid:** Keep the existing `upgrade` function pattern: iterate `STORES` array, skip stores that already exist (`if (!db.objectStoreNames.contains(store))`). Just add the new store name to the `STORES` array.
**Warning signs:** Test with a browser that already has the DB at version 6. Verify all existing stores survive the upgrade.

### Pitfall 2: Checkpoint State Detection
**What goes wrong:** The progress.json file may not exist at checkpoint time if the pipeline process manages state differently than expected.
**Why it happens:** The pipeline currently writes progress.json to `.thes1s/reports/{TICKER}/`. But checkpoint data (PM comments, data gap responses) needs to be stored somewhere the pipeline can read it back on re-run. If stored only in IndexedDB (browser-side), the pipeline (server-side Node.js) cannot access it.
**How to avoid:** Store checkpoint feedback in BOTH locations: (1) IndexedDB for immediate UI state, and (2) a new `checkpoint-{N}.json` file in `.thes1s/reports/{TICKER}/` via a POST endpoint so the pipeline can read it. The POST endpoint writes the feedback to disk; the pipeline reads it on re-run.
**Warning signs:** "Re-run Wave" produces the same output as the first run because agent prompts don't include PM feedback.

### Pitfall 3: File Attachment Size Limits
**What goes wrong:** PM attaches a 50MB PDF and IndexedDB write fails silently or fills up storage quota.
**Why it happens:** IndexedDB has a storage quota (typically 50% of disk for the origin, but browsers vary). Large files can hit this limit.
**How to avoid:** Add a file size limit (e.g., 10MB per file, 50MB total per checkpoint). Show a clear error message if the limit is exceeded. For the pipeline to access attachments, they also need to be written to disk via the POST endpoint.
**Warning signs:** `idbSet` call resolves without error but data is not retrievable.

### Pitfall 4: CompanyHeader Prop Drilling for Generate Button
**What goes wrong:** The "Generate" button needs to know the report's stage approvals, whether reports exist on disk, and the current generation status. CompanyHeader currently receives only company, latest price, and scores.
**Why it happens:** CompanyHeader is rendered by Toolbox.jsx, which already has access to the report object. But it doesn't have generation status.
**How to avoid:** Two options: (1) Pass additional props through Toolbox (simpler, consistent with existing pattern), or (2) Create GenerateButton as a separate component that Toolbox renders alongside CompanyHeader (avoids bloating CompanyHeader's API). Option 2 is cleaner -- Toolbox already orchestrates all data.
**Warning signs:** CompanyHeader becomes a "god component" with too many unrelated props.

### Pitfall 5: Cross-Navigation Report Lookup
**What goes wrong:** ResearchList's "View Reports" button needs to know if reports exist for that ticker. But ResearchList only has the report object (from useResearch), which tracks stage approvals, not file existence on disk.
**Why it happens:** Report file existence is checked by ReportsList via `GET /api/thes1s/reports` (which scans .thes1s/reports/ directories). ResearchList doesn't make this call.
**How to avoid:** Either (1) add a lightweight check -- `GET /api/thes1s/reports/{ticker}/exists` -- or (2) navigate to Reports tab filtered by ticker regardless, and let ReportsList show the appropriate empty state.
**Warning signs:** "View Reports" button shows for tickers that have no generated reports.

## Code Examples

### Existing Pattern: CollapsibleSection Expand/Collapse
```jsx
// Source: src/components/CollapsibleSection.jsx (lines 10-35)
// Uses requestAnimationFrame for reflow, scrollHeight measurement, CSS transition
const [open, setOpen] = useState(defaultOpen);
const contentRef = useRef(null);
const [height, setHeight] = useState(defaultOpen ? 'auto' : 0);

useEffect(() => {
  if (open) {
    const contentHeight = contentRef.current.scrollHeight;
    setOverflow('hidden');
    setHeight(contentHeight);
    const timer = setTimeout(() => { setHeight('auto'); setOverflow('visible'); }, 280);
    return () => clearTimeout(timer);
  } else {
    const contentHeight = contentRef.current.scrollHeight;
    setHeight(contentHeight);
    setOverflow('hidden');
    requestAnimationFrame(() => { requestAnimationFrame(() => { setHeight(0); }); });
  }
}, [open]);
```

### Existing Pattern: SectionRenderer Header (where comment icon goes)
```jsx
// Source: src/components/SectionRenderer.jsx (lines 104-142)
// Section header with number badge, title, verdict+confidence badges
// Comment icon would be inserted into the badge row (line 138 area)
<div style={{ display: 'flex', alignItems: 'center', gap: 10, ... }}>
  {section.sectionNumber != null && <span ...>{section.sectionNumber}</span>}
  <span style={{ flex: 1 }}>{section.title}</span>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <VerdictBadge verdict={section.verdict} />
    <ConfidenceBadge confidence={section.confidence} />
    {/* NEW: Comment icon would go here */}
  </div>
</div>
```

### Existing Pattern: Polling Hook (useOnePager)
```jsx
// Source: src/hooks/useOnePager.js (lines 7-99)
// 2-second polling with cancellation, completion detection, re-fetch on complete
const pollRef = useRef(null);
async function pollProgress() {
  if (cancelled) return;
  const prog = await fetchProgress();
  if (prog && prog.state !== 'COMPLETE') {
    pollRef.current = setTimeout(pollProgress, 2000);
  } else if (prog && prog.state === 'COMPLETE') {
    pollRef.current = setTimeout(async () => {
      if (!cancelled) await fetchReport();
    }, 500);
  }
}
```

### Existing Pattern: IndexedDB Store Registration
```jsx
// Source: src/engines/cacheStore.js (lines 9-10)
const DB_VERSION = 6;
const STORES = ['edgar-facts', 'edgar-statements', 'guru-data', 'nport-data',
  'filing-markdown', 'insider-data', 'comp-data', 'transcript-data', 'reports'];
// To add file attachment store: bump DB_VERSION to 7, add 'checkpoint-attachments' to STORES array
// The upgrade handler (lines 20-27) already handles this: iterates STORES and creates missing stores
```

### Existing Pattern: Vite Middleware API Endpoint
```js
// Source: vite.config.js (lines 444-533)
// thes1sReportsPlugin mounts at /api/thes1s/reports
// URL parsing: urlPath = req.url.replace(/^\//,'').split('?')[0]
// Parts: ['TICKER', 'one-pager'] or ['TICKER', 'generate', 'one-pager']
// POST handling would check req.method and route accordingly
```

### Existing Pattern: CompanyHeader Layout
```jsx
// Source: src/components/CompanyHeader.jsx (lines 47-125)
// Left side: company info + price. Right side: score badges.
// GenerateButton placement: in the right side flex container, before or after score badges
// Or as a separate component rendered by Toolbox.jsx below CompanyHeader
```

### Existing Pattern: Progress State Machine
```js
// Source: src/engines/progressState.js (lines 22-33)
// VALID_TRANSITIONS includes CHECKPOINT_N states
// WAVE_1_RUNNING -> ['CHECKPOINT_1', 'WAVE_2_RUNNING']
// CHECKPOINT_1 -> ['WAVE_2_RUNNING']
// UI needs to detect CHECKPOINT_N and show the checkpoint panel
```

### Existing Pattern: ResearchList Row
```jsx
// Source: src/components/ResearchList.jsx (lines 109-211)
// Table rows with ticker, company, stage badge, score, date, delete button
// "View Reports" button goes in the action column (before delete)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLI-only generation (`/generate:one-pager COST`) | In-app generation via "Generate" button | Phase 24 (now) | PM can trigger pipelines from the UI |
| Post-generation review only | Mid-pipeline checkpoint review | Phase 24 (now) | PM steers analysis at every wave, not just end |
| Separate Research/Reports with no cross-links | Cross-navigation buttons | Phase 24 (now) | Natural flow between data exploration and AI reports |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 + jsdom 29.0.1 |
| Config file | Inline in package.json (no separate vitest.config.js) |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01/D-02 | Checkpoint panel renders at CHECKPOINT_N states | unit | `npm test -- --run src/components/__tests__/checkpointPanel.test.js` | No -- Wave 0 |
| D-03 | Toggle-to-show comment box expand/collapse | unit | `npm test -- --run src/components/__tests__/checkpointCommentBox.test.js` | No -- Wave 0 |
| D-04 | File attachment storage in IndexedDB | unit | `npm test -- --run src/engines/__tests__/checkpointAttachments.test.js` | No -- Wave 0 |
| D-05 | Continue/Re-run button actions | unit | `npm test -- --run src/components/__tests__/checkpointPanel.test.js` | No -- Wave 0 |
| D-07/D-08 | Data gaps panel rendering and "Add source" | unit | `npm test -- --run src/components/__tests__/dataGapsPanel.test.js` | No -- Wave 0 |
| D-10/D-11 | Contextual generate button label logic | unit | `npm test -- --run src/components/__tests__/generateButton.test.js` | No -- Wave 0 |
| D-13 | POST endpoint spawns pipeline | unit | `npm test -- --run src/engines/__tests__/generateEndpoint.test.js` | No -- Wave 0 |
| D-15 | Cross-navigation between Research/Reports | unit | `npm test -- --run src/components/__tests__/crossNavigation.test.js` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/__tests__/checkpointPanel.test.js` -- covers D-01, D-02, D-05
- [ ] `src/components/__tests__/checkpointCommentBox.test.js` -- covers D-03
- [ ] `src/engines/__tests__/checkpointAttachments.test.js` -- covers D-04
- [ ] `src/components/__tests__/dataGapsPanel.test.js` -- covers D-07, D-08
- [ ] `src/components/__tests__/generateButton.test.js` -- covers D-10, D-11
- [ ] `src/components/__tests__/crossNavigation.test.js` -- covers D-14, D-15

## Data Model Extensions

### Checkpoint Feedback Schema (new)
The ProgressSchema already has a `checkpoints` array with `userInput: z.looseObject({})`. The PM feedback structure within `userInput` should be:

```js
// Per-checkpoint feedback (stored in progress.json checkpoints array)
{
  phase: 1,
  status: 'approved', // 'approved' | 'waiting' | 'rejected'
  userInput: {
    comments: {
      // keyed by section key
      'radar': {
        text: 'Consider adding TAM analysis...',
        attachments: [
          { id: 'uuid', name: 'tam-report.pdf', type: 'application/pdf', size: 245000 }
        ],
        createdAt: '2026-04-04T10:30:00Z',
      },
    },
    dataGapResponses: {
      // keyed by gap ID
      'gap-1': {
        response: 'url', // 'url' | 'file' | 'text'
        value: 'https://seekingalpha.com/article/...',
        attachments: [],
      },
    },
    action: 'continue', // 'continue' | 'rerun'
  },
  timestamp: '2026-04-04T10:35:00Z',
}
```

### File Attachment IndexedDB Record
```js
// Stored in 'checkpoint-attachments' store
{
  key: 'uuid',              // attachment ID
  data: {
    name: 'earnings.pdf',
    type: 'application/pdf',
    size: 245000,
    ticker: 'COST',
    checkpointPhase: 1,
    sectionKey: 'radar',    // or 'data-gap-1' for data gap attachments
    buffer: ArrayBuffer,    // raw file data
  },
  expiresAt: ...,           // 10 year TTL (same as reports)
  fetchedAt: ...,
}
```

### Report Data Model Extension
The existing report object in useResearch.js does not need schema changes. Checkpoint data lives in the progress.json file and in the checkpoint-attachments IndexedDB store. The report's `stageApprovals` and `notes` fields are unchanged.

### New Vite Middleware Endpoints
```
POST /api/thes1s/generate/:ticker/:stage    -- Trigger pipeline generation
GET  /api/thes1s/reports/:ticker/checkpoint  -- Read checkpoint feedback from disk
POST /api/thes1s/reports/:ticker/checkpoint  -- Write checkpoint feedback to disk
```

### Checkpoint Feedback Persistence (Two-Location Strategy)
PM feedback needs to be accessible from both browser (for UI) and server (for pipeline re-run):
1. **Browser-side (IndexedDB):** Immediate read/write for UI responsiveness. Comment text, attachment refs, data gap responses stored in `useCheckpoint` hook state.
2. **Server-side (disk):** Written via POST endpoint to `.thes1s/reports/{TICKER}/checkpoint-{N}.json`. Pipeline reads this file when re-running a wave.
3. **File attachments:** Binary data in IndexedDB + copied to `.thes1s/reports/{TICKER}/attachments/{uuid}` via POST endpoint so pipeline agents can reference them.

## Key Integration Points

### 1. CompanyHeader + GenerateButton
Toolbox.jsx currently renders `<CompanyHeader company={...} latest={...} moatScore={...} managementScore={...} ruleOneScore={...} />`. The GenerateButton should be rendered separately by Toolbox, not inside CompanyHeader, to avoid prop drilling. Toolbox already has access to the `report` object and can determine the correct button state.

### 2. PitchDeck.jsx + CheckpointPanel
PitchDeck.jsx already polls `generation-status.json` and renders `GenerationStatusPanel` during active generation. When progress state is `CHECKPOINT_N`, instead of (or in addition to) the status panel, render the `CheckpointPanel`. The checkpoint panel replaces the "generating" view with a "review" view.

### 3. SectionRenderer + Comment Icon
SectionRenderer.jsx needs a new optional prop (e.g., `onCommentClick`, `commentCount`) to render the comment icon in the header. This prop is only passed during checkpoint review, not during normal report viewing.

### 4. ResearchList + "View Reports" Button
ResearchList.jsx table gets a new column or button in the action area. Uses `useNavigate` to go to `/reports` filtered by ticker (or just `/reports` since the list is small enough to scan).

### 5. ReportsList + "View Toolbox" Link
ReportsList.jsx ticker cards get a link that navigates to `/research/{report.id}`. This requires finding the report ID for a given ticker, which ReportsList already does via `findReport(ticker)`.

### 6. Progress State Machine Awareness
The UI must handle the full state machine flow:
- `WAVE_N_RUNNING` -- show GenerationStatusPanel (existing)
- `CHECKPOINT_N` -- show CheckpointPanel (new)
- PM clicks "Continue" -- POST to advance state, resume polling
- PM clicks "Re-run Wave" -- POST with feedback, pipeline re-runs wave, resume polling

## Open Questions

1. **Pipeline spawning mechanism**
   - What we know: The pipeline currently runs via Claude Code skills (`/generate:one-pager COST`). The Vite middleware can use `child_process.spawn` to run a Node.js script.
   - What's unclear: Exactly which script to spawn and with what arguments. The pipeline manager (`pipelineManager`) may not have a standalone CLI entry point yet.
   - Recommendation: Create a minimal `scripts/generate.js` entry point that the POST endpoint spawns. This script imports the pipeline manager and runs the specified stage. If the pipeline manager isn't ready for programmatic invocation yet, the POST endpoint can return 501 Not Implemented with a message pointing to the CLI skill, and Phase 24 focuses on the UI/checkpoint infrastructure.

2. **Checkpoint data gaps format**
   - What we know: The dispatch table specifies `checkpoint.presents: ["findings", "dataGaps", "questions", "confidence"]`. The orchestrator config has `checkpointRules.presentDataGaps: true`.
   - What's unclear: The exact JSON schema of data gaps. No existing checkpoint data files were found in `.thes1s/reports/`.
   - Recommendation: Define the data gap schema as: `{ id, type: 'api_failure' | 'missing_data' | 'access_denied', description, source, severity: 'high' | 'medium' | 'low' }`. Store in checkpoint-N.json alongside section results.

3. **Reports existence check for "View Reports" button**
   - What we know: ResearchList has the report object with stageApprovals. ReportsList fetches `/api/thes1s/reports` to check file existence.
   - What's unclear: Should "View Reports" appear for all tickers, or only those with generated reports?
   - Recommendation: Show for all tickers. If no reports exist, the Reports tab shows its empty state. This avoids an extra API call and matches the natural exploration flow.

## Sources

### Primary (HIGH confidence)
- `src/components/SectionRenderer.jsx` -- Current section header layout, integration point for comment icons
- `src/components/CollapsibleSection.jsx` -- Expand/collapse animation pattern to reuse
- `src/components/PitchDeck.jsx` -- GenerationStatusPanel pattern, checkpoint state handling
- `src/engines/cacheStore.js` -- IndexedDB store registration pattern, DB version management
- `src/engines/progressState.js` -- State machine transitions, CHECKPOINT_N states, generation-status writer
- `src/schemas/progress.js` -- ProgressSchema with checkpoints array and userInput field
- `agents/orchestrator/dispatch-table.json` -- Checkpoint configuration per phase
- `agents/orchestrator/config.json` -- checkpointRules, section-to-agent mapping
- `agents/orchestrator/README.md` -- Checkpoint format documentation
- `vite.config.js` -- thes1sReportsPlugin middleware pattern

### Secondary (MEDIUM confidence)
- `src/hooks/useOnePager.js`, `usePitchDeck.js` -- Polling patterns, established 2s interval
- `src/components/ResearchList.jsx`, `ReportsList.jsx` -- Cross-navigation target components
- `src/components/CompanyHeader.jsx` -- Generate button placement target

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns established in codebase
- Architecture: HIGH -- all integration points verified by reading source code
- Pitfalls: HIGH -- based on direct code analysis and understanding of existing patterns

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable -- internal codebase patterns, no external API changes)
