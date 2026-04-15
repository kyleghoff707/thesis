# Browser-Side DataPacket Assembly Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move DataPacket assembly and filing content preparation from the Worker (which hits 30s CPU limits) to the browser (which has no limits), making the Worker a thin relay to Managed Agents.

**Architecture:** Browser calls `assembleDataPacket()` + `fetchFilingMarkdownBatch()` + `extractAllSections()` (all already exist and work in-browser), packages the result, POSTs it to the Worker. Worker receives the pre-assembled payload, creates a Managed Agent session, sends the data as the initial message, and returns a runId. Polling is unchanged.

**Tech Stack:** React hooks, existing browser engines (`dataExport.js`, `filingMarkdown.js`, `filingSections.js`), Cloudflare Workers (relay only), Managed Agents API.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/hooks/useAssembleData.js` | **Create** | Browser-side DataPacket + filing content assembly hook |
| `src/hooks/useGeneratePipeline.js` | **Modify** | Add assembly step before dispatch; send payload in POST body |
| `src/components/GenerateButton.jsx` | **Modify** | Wire assembly progress into UX (optional progress indicator) |
| `src/schemas/dataPacket.js` | **Modify** | Remove `analystEstimates`, `prices`, `currentPrice` from schema |
| `api/src/routes/pipeline.js` | **Modify** | `handleRun` for pitchDeck: receive payload from browser, relay to agent |
| `src/engines/dataExport.js` | No change | Already works in browser, already exports `assembleDataPacket()` |
| `src/engines/filingMarkdown.js` | No change | Already works in browser, already exports `fetchFilingMarkdownBatch()` |
| `src/engines/filingSections.js` | No change | Already works in browser, already exports `extractAllSections()` |

---

## Task 1: Browser Assembly Hook

**Files:**
- Create: `src/hooks/useAssembleData.js`
- Test: `src/engines/__tests__/dataExport.test.js` (existing — verify it still passes)

This hook calls the existing browser engines to assemble a DataPacket and filing content. Both functions already exist and are battle-tested — this hook just orchestrates them for the pipeline.

- [ ] **Step 1: Create the assembly hook**

```js
// src/hooks/useAssembleData.js
// Orchestrates browser-side DataPacket + filing content assembly for the pipeline.
// Calls existing engines: assembleDataPacket() + fetchFilingMarkdownBatch() + extractAllSections().
// The Worker never runs these — it receives the finished result.

import { useState, useCallback } from 'react';
import { assembleDataPacket } from '../engines/dataExport';
import { fetchFilingMarkdownBatch } from '../engines/filingMarkdown';
import { extractAllSections, SECTION_MAP_10K, SECTION_MAP_10Q } from '../engines/filingSections';

const MAX_10K = 5;
const MAX_10Q = 4;
const SECTION_LIMIT_10K = 40_000;
const SECTION_LIMIT_10Q = 15_000;

function selectFilings(filings) {
  if (!Array.isArray(filings) || filings.length === 0) return [];
  const tenKs = [];
  const tenQs = [];
  for (const f of filings) {
    if (f.primaryDocument?.endsWith('.xml')) continue;
    if (f.form === '10-K' && tenKs.length < MAX_10K) tenKs.push(f);
    else if (f.form === '10-Q' && tenQs.length < MAX_10Q) tenQs.push(f);
  }
  return [...tenKs, ...tenQs];
}

function buildFilingContent(selectedFilings, markdownMap) {
  const filingContent = {};
  for (const filing of selectedFilings) {
    const result = markdownMap.get(filing.accessionNumber);
    if (!result?.markdown) continue;

    const formType = filing.form === '10-Q' ? '10-Q' : '10-K';
    const sections = extractAllSections(result.markdown, formType);
    const limit = formType === '10-Q' ? SECTION_LIMIT_10Q : SECTION_LIMIT_10K;

    // Truncate oversized sections
    for (const key of Object.keys(sections)) {
      if (sections[key] && sections[key].length > limit) {
        sections[key] = sections[key].slice(0, limit) +
          `\n\n[TRUNCATED — full section available in ${formType} filing]`;
      }
    }

    const charCount = Object.values(sections).reduce((sum, s) => sum + (s?.length || 0), 0);
    const key = `${filing.form}-${filing.filingDate}`;
    filingContent[key] = {
      form: filing.form,
      filingDate: filing.filingDate,
      sections,
      charCount,
      fromCache: result.fromCache || false,
    };
  }
  return filingContent;
}

export function useAssembleData() {
  const [phase, setPhase] = useState(null);   // null | 'dataPacket' | 'filings' | 'done' | 'error'
  const [progress, setProgress] = useState(null); // { phase, detail, pct }
  const [error, setError] = useState(null);

  const assemble = useCallback(async (ticker) => {
    setPhase('dataPacket');
    setError(null);
    setProgress({ phase: 'dataPacket', detail: 'Assembling financial data...', pct: 0 });

    try {
      // Phase 1: DataPacket (financials, compensation, gurus, insiders, scores)
      const dataPacket = await assembleDataPacket(ticker);
      setProgress({ phase: 'dataPacket', detail: 'Financial data ready', pct: 50 });

      // Phase 2: Filing content (10-K/10-Q markdown + section extraction)
      setPhase('filings');
      const cik = dataPacket.companyInfo?.cik;
      const selectedFilings = selectFilings(dataPacket.filings);

      // Add CIK to each filing (fetchFilingMarkdown needs it)
      const filingsWithCik = selectedFilings.map(f => ({ ...f, cik }));

      setProgress({ phase: 'filings', detail: `Converting ${filingsWithCik.length} filings...`, pct: 55 });

      const markdownMap = await fetchFilingMarkdownBatch(filingsWithCik, (done, total) => {
        const pct = 55 + Math.round((done / total) * 35);
        setProgress({ phase: 'filings', detail: `Filing ${done}/${total}...`, pct });
      });

      const filingContent = buildFilingContent(selectedFilings, markdownMap);
      setProgress({ phase: 'filings', detail: 'Sections extracted', pct: 95 });

      // Package the full payload for the Worker
      const payload = {
        dataPacket,
        filingContent,
        assembledAt: new Date().toISOString(),
      };

      setPhase('done');
      setProgress({ phase: 'done', detail: 'Ready to dispatch', pct: 100 });
      return payload;

    } catch (err) {
      setPhase('error');
      setError(err.message);
      setProgress(null);
      throw err;
    }
  }, []);

  return { assemble, phase, progress, error };
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npm test -- --run`
Expected: 1600 tests pass (no changes to existing engines)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAssembleData.js
git commit -m "feat: browser-side DataPacket + filing assembly hook"
```

---

## Task 2: Modify Pipeline Hook to Send Assembled Data

**Files:**
- Modify: `src/hooks/useGeneratePipeline.js` (lines 149-204)

Currently `triggerGeneration(stage, dataPacket, reportId)` accepts a `dataPacket` param but it's always `null` and never sent in the POST body. For Pitch Deck, we'll call `useAssembleData` first, then POST the assembled payload.

- [ ] **Step 1: Add payload to POST body for Pitch Deck**

In `src/hooks/useGeneratePipeline.js`, modify the production POST block (line 199-204) to include the payload when provided:

```js
// Current (line 199-204):
const res = await fetch(`${API_BASE}/api/pipeline/run`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ ticker, stage: pipelineStage, reportId }),
});

// New:
const res = await fetch(`${API_BASE}/api/pipeline/run`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    ticker,
    stage: pipelineStage,
    reportId,
    ...(dataPacket && { payload: dataPacket }),
  }),
});
```

This is backward-compatible — One Pager sends no payload (as before). Pitch Deck sends the assembled payload.

- [ ] **Step 2: Verify existing tests pass**

Run: `npm test -- --run`
Expected: 1600 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGeneratePipeline.js
git commit -m "feat: send assembled payload in pipeline dispatch POST body"
```

---

## Task 3: Wire Assembly into Generate Button Flow

**Files:**
- Modify: `src/components/GenerateButton.jsx`
- Reference: `src/hooks/useAssembleData.js` (from Task 1)

The Generate Button currently calls `onGenerate(stage, null, reportId)`. For Pitch Deck, it needs to run assembly first, then pass the result. The UX shows assembly progress before the agent dispatch starts.

- [ ] **Step 1: Add assembly step for Pitch Deck**

In `GenerateButton.jsx`, import and use the assembly hook. When stage is `pitch-deck`, run assembly before calling `onGenerate`:

```js
// In GenerateButton.jsx, add import:
import { useAssembleData } from '../hooks/useAssembleData';

// Inside the component, add:
const { assemble, phase: assemblyPhase, progress: assemblyProgress, error: assemblyError } = useAssembleData();

// Modify the onConfirm handler (the function called when ConfirmGenerateDialog confirms):
const handleConfirm = async () => {
  if (stage === 'pitch-deck') {
    try {
      const payload = await assemble(ticker);
      onGenerate(stage, payload, reportId);
    } catch (err) {
      // Assembly error is shown via assemblyError state
      return;
    }
  } else {
    // One Pager and Full Story — no browser assembly needed
    onGenerate(stage, null, reportId);
  }
};
```

- [ ] **Step 2: Add assembly progress display**

Show the assembly phase in the UI while it runs (before agent dispatch starts). This goes in the same area that shows "Generating..." status:

```js
// In the rendering section, add before the existing generation status:
{assemblyPhase && assemblyPhase !== 'done' && assemblyPhase !== 'error' && (
  <div style={{ padding: '8px 12px', background: C.surface, borderRadius: 6, fontSize: 13 }}>
    {assemblyProgress?.detail || 'Preparing data...'}
  </div>
)}
{assemblyError && (
  <div style={{ padding: '8px 12px', background: C.errorBg, color: C.error, borderRadius: 6, fontSize: 13 }}>
    Assembly failed: {assemblyError}
  </div>
)}
```

- [ ] **Step 3: Test manually in dev server**

Run: `npm run dev`
Navigate to any company's Toolbox. Open browser console. Verify the Generate Pitch Deck button (if visible) triggers assembly. The POST will still get a 501 from the Worker — that's expected. We're verifying the browser assembly runs.

- [ ] **Step 4: Commit**

```bash
git add src/components/GenerateButton.jsx
git commit -m "feat: wire browser assembly into Pitch Deck generate flow"
```

---

## Task 4: Worker Receives and Relays Payload

**Files:**
- Modify: `api/src/routes/pipeline.js` (lines 128-138 — the pitchDeck 501 block)

Replace the 501 stub with real logic: receive the browser-assembled payload from the POST body, create a Managed Agent session, send the payload as the initial message.

- [ ] **Step 1: Replace pitchDeck 501 block with relay logic**

In `api/src/routes/pipeline.js`, replace the `if (stage === 'pitchDeck')` block (lines 128-138):

```js
  // ── Stage: Pitch Deck ──────────────────────────────────────
  if (stage === 'pitchDeck') {
    // Browser assembles the DataPacket + filing content and sends it in the POST body.
    // Worker just relays to the Managed Agent — no server-side assembly, no CPU pressure.
    const payload = body.payload;
    if (!payload?.dataPacket) {
      return json({ error: 'Pitch Deck requires assembled payload in request body. Browser must call assembleDataPacket() first.' }, 400);
    }

    // TODO: When callable_agents access is granted, create coordinator session here.
    // For now, create a single-agent session with the Pitch Deck coordinator prompt.
    // The coordinator will eventually dispatch specialists via callable_agents.

    let sessionId;
    try {
      const session = await anthropicFetch(`${ANTHROPIC_API}/v1/sessions`, 'POST', {
        agent: env.MA_PD_COORDINATOR || env.MA_ONE_PAGER_AGENT_ID, // fallback to One Pager until coordinator is live
        environment_id: env.MA_ENVIRONMENT_ID,
      }, env);
      sessionId = session.id;
    } catch (err) {
      return json({ error: 'Failed to create agent session', detail: err.message }, 500);
    }

    // Build the initial message with DataPacket + filing content
    const messageText = buildPitchDeckMessage(ticker, payload);

    try {
      await anthropicFetch(`${ANTHROPIC_API}/v1/sessions/${sessionId}/events`, 'POST', {
        events: [{
          type: 'user.message',
          content: [{ type: 'text', text: messageText }],
        }],
      }, env);
    } catch (err) {
      return json({ error: 'Failed to send message to agent', detail: err.message }, 500);
    }

    // Create pipeline run record
    const runId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO pipeline_runs (id, user_id, report_id, ticker, stage, status, session_id, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'running', ?, datetime('now'), datetime('now'))`
    ).bind(runId, user.id, reportId || null, ticker.toUpperCase(), stage, sessionId).run();

    return json({ runId, status: 'running', ticker: ticker.toUpperCase(), stage }, 200);
  }
```

- [ ] **Step 2: Add the message builder function**

Add `buildPitchDeckMessage()` before the Helpers section in `pipeline.js`:

```js
// ─── Pitch Deck Message Builder ─────────────────────────────
// Serializes the browser-assembled payload into a text message for the coordinator agent.
// The coordinator receives this as its initial context, then dispatches specialists.

function buildPitchDeckMessage(ticker, payload) {
  const dp = payload.dataPacket;
  const fc = payload.filingContent || {};
  const sections = [];

  sections.push(`# Pitch Deck Research: ${ticker.toUpperCase()}`);
  sections.push(`Company: ${dp.companyInfo?.name || ticker}`);
  sections.push(`Assembled: ${payload.assembledAt}\n`);

  // DataPacket summary (the coordinator routes data slices to specialists)
  sections.push('## DataPacket');
  sections.push('```json');
  sections.push(JSON.stringify(dp, null, 0)); // compact JSON to save tokens
  sections.push('```\n');

  // Filing content (for PSR reader agents)
  if (Object.keys(fc).length > 0) {
    sections.push('## Filing Content');
    for (const [key, filing] of Object.entries(fc)) {
      sections.push(`### ${key}`);
      for (const [sectionName, content] of Object.entries(filing.sections || {})) {
        sections.push(`#### ${sectionName}`);
        sections.push(content);
      }
    }
  }

  return sections.join('\n');
}
```

- [ ] **Step 3: Add MA_PD_COORDINATOR to wrangler.toml vars**

In `api/wrangler.toml`, add under `[vars]`:

```toml
MA_PD_COORDINATOR = "agent_011Ca37DJEQBPbm6rKET3fMs"
```

(This is the coordinator agent ID from CLAUDE.md.)

- [ ] **Step 4: Deploy Worker and verify**

```bash
cd api && npx wrangler deploy
```

Expected: deploys successfully. The Pitch Deck route now accepts a payload and creates a session.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/pipeline.js api/wrangler.toml
git commit -m "feat: Worker receives browser-assembled payload, relays to Managed Agent"
```

---

## Task 5: Update DataPacket Schema

**Files:**
- Modify: `src/schemas/dataPacket.js`

Remove fields we cleaned up earlier (`analystEstimates`, `prices`, `currentPrice`, `events`).

- [ ] **Step 1: Remove stale fields from schema**

In `src/schemas/dataPacket.js`, remove these lines from the schema:

```js
// Remove these 4 lines:
currentPrice: z.number().nullable().optional(),
analystEstimates: z.looseObject({}).nullable().optional(),
events: z.looseObject({}).nullable().optional(),
prices: z.looseObject({}).nullable().optional(),
```

- [ ] **Step 2: Run tests**

Run: `npm test -- --run`
Expected: 1600 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/schemas/dataPacket.js
git commit -m "chore: remove stale fields from DataPacket schema"
```

---

## Task 6: Remove Worker Assembly from Pipeline Hot Path

**Files:**
- Modify: `api/src/routes/pipeline.js` — remove `includeFilings` from `handleRun` path
- Keep: `handleAssembleData` and `handleAssembleFilings` endpoints (debugging/admin tools)

The `handleAssembleData` and `handleAssembleFilings` endpoints stay in the codebase for diagnostics but are no longer called by the production pipeline.

- [ ] **Step 1: Add comments marking debug-only endpoints**

In `api/src/routes/pipeline.js`, update the comments for the assemble routes:

```js
  // POST /api/pipeline/assemble-data/:ticker — DEBUG/ADMIN ONLY
  // Assembles DataPacket server-side. NOT used in production pipeline
  // (browser assembles and POSTs the result). Kept for diagnostics.
  const assembleMatch = path.match(/^\/api\/pipeline\/assemble-data\/([A-Za-z0-9.-]+)$/);
```

```js
  // POST /api/pipeline/assemble-filings/:ticker — DEBUG/ADMIN ONLY
  // Assembles filing content server-side. NOT used in production pipeline.
  const filingsMatch = path.match(/^\/api\/pipeline\/assemble-filings\/([A-Za-z0-9.-]+)$/);
```

- [ ] **Step 2: Deploy**

```bash
cd api && npx wrangler deploy
```

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/pipeline.js
git commit -m "docs: mark server-side assembly endpoints as debug-only"
```

---

## Task 7: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open browser, navigate to a company Toolbox**

Navigate to any S&P 500 company (e.g., AAPL, HSY, CMI).

- [ ] **Step 3: Open browser console, trigger Pitch Deck generation**

Click the Generate Pitch Deck button. Watch the console for:
1. `assembleDataPacket()` call starting
2. Filing markdown batch processing
3. POST to `/api/pipeline/run` with full payload
4. Response with `runId` (or 501 if callable_agents still blocked)

- [ ] **Step 4: Verify payload size**

In the Network tab, check the POST body size. Expected: 1-3MB JSON. If it's over 5MB, the DataPacket may need trimming for token budget.

- [ ] **Step 5: Verify Worker receives payload**

```bash
cd api && npx wrangler tail
```

Watch for the incoming POST request. Verify the Worker logs show the DataPacket fields, not assembly errors.

- [ ] **Step 6: Run full test suite**

```bash
npm test -- --run
```

Expected: 1600 tests pass

- [ ] **Step 7: Commit final state**

```bash
git add -A
git commit -m "feat: browser-side assembly pipeline — end-to-end verified"
```

---

## What This Does NOT Change

- **One Pager pipeline** — untouched. Still sends a text prompt, no DataPacket. The agent uses `web_search`.
- **Toolbox data display** — untouched. Each tab still calls individual engines directly.
- **Server-side assembly endpoints** — kept for debugging (`/api/pipeline/assemble-data`, `/api/pipeline/assemble-filings`).
- **R2 filing cache** — still populated. The browser's `fetchFilingMarkdown()` caches in IndexedDB (browser-local). The Worker's filing cron populates R2 (server-side). Both caches coexist independently.
- **Polling/status/export routes** — untouched. Same polling loop, same status endpoint.

## What This Unlocks

- Pitch Deck pipeline can dispatch to Managed Agents (once `callable_agents` access is granted)
- Zero Worker CPU for DataPacket assembly
- Scales to any number of concurrent users (each browser does its own assembly)
- Browser assembly progress visible in UI (user sees "Assembling financial data... Converting filings...")
