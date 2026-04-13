# UX Migration Log — Managed Agents Pipeline

Tracks UX fixes discovered while migrating the pipeline from browser/Worker orchestration to Managed Agents. Future sessions should check this list when wiring up Pitch Deck and Full Story stages.

## One Pager Fixes (2026-04-13)

### 1. Report not showing in Reports tab
**Symptom:** Pipeline completed successfully, D1 has sections_json, but Reports tab shows no report.
**Root cause:** `handleStatus` SELECT query missing `report_id` column → `run.report_id` was always undefined → `report_stages` INSERT was skipped.
**Fix:** Added `report_id` to the SELECT in `api/src/routes/pipeline.js`.
**Watch for PD/FS:** Any new columns added to pipeline_runs must also be selected in handleStatus.

### 2. Reports list pills greyed out (stage not detected)
**Symptom:** CMG shows in Reports tab but "ONE PAGER" pill is greyed out / pending.
**Root cause:** `GET /user/reports` endpoint didn't include a `stages` object with `{ onePager: true }`. Frontend checks `tickerObj.stages.onePager === true` to enable pill.
**Fix:** Added `report_stages` query to `api/src/routes/user.js` → builds `stages: { onePager: true }` map.
**Watch for PD/FS:** Same pattern applies — pills check `stages.pitchDeck` and `stages.fullStory`.

### 3. "No One Pager generated yet" on pill click
**Symptom:** Clicking the One Pager pill shows "Generating..." briefly then "No One Pager generated yet" despite data being in D1.
**Root cause:** `useOnePager` hook fetches from `/api/thes1s/reports/{ticker}/one-pager` — a Vite dev middleware endpoint that doesn't exist in production. The report data was already loaded via `getReport(id)` from `useResearch` (which calls `GET /user/reports/:id`), but the hook overwrote it with null.
**Fix:** OnePager component now uses `report.onePager` (from the already-loaded report object) as primary data source, falling back to `useOnePager` hook for dev mode.
**Watch for PD/FS:** `usePitchDeck` and `useFullStory` hooks have the same pattern — they fetch from `/api/thes1s/reports/{ticker}/pitch-deck` and `/full-story` which are also Vite-only endpoints. Apply the same fix: use `report.pitchDeck` / `report.fullStory` in production.

### 4. Timer resets on tab navigation
**Symptom:** Navigating away from Research tab and back resets the generation timer to 00:00:00.
**Root cause:** `elapsed` state initialized to 0 on mount. When component remounts (navigate away/back), it flashes 0 before recalculating from `progress.startedAt`.
**Fix:** Initialize `elapsed` from `startedAt` immediately using lazy initializer: `useState(() => startMs ? Math.floor(...) : 0)`.
**Watch for PD/FS:** Same timer pattern exists in PitchDeck and FullStory components. Apply same fix.

### 5. Managed Agents API field name: `agent` not `agent_id`
**Symptom:** "Failed to create agent session" error.
**Root cause:** Session creation API expects `{ agent: "agent_01..." }` not `{ agent_id: "agent_01..." }`.
**Fix:** Changed field name in `api/src/routes/pipeline.js`.
**Watch for PD/FS:** Already fixed globally — single code path for session creation.

### 6. Authentication error on deploy
**Symptom:** "Failed to create agent session" — authentication_error from Anthropic API.
**Root cause:** Wrong API key pasted into `wrangler secret put`. Key in `.env.local` (VITE_CLAUDE_KEY) worked; Worker secret was different.
**Fix:** Re-set the secret with the correct key.
**Watch for PD/FS:** Non-issue — key is set once.

## Patterns to Watch for Pitch Deck / Full Story

1. **Stage hooks fetch from Vite-only endpoints** — `usePitchDeck.js` and `useFullStory.js` use `/api/thes1s/reports/{ticker}/pitch-deck` etc. These don't exist in production. Fix: read from `report.pitchDeck` / `report.fullStory` first.

2. **Progress polling from Vite-only endpoints** — hooks also poll `/api/thes1s/reports/{ticker}/progress` and `/generation-status`. These need Worker equivalents or the pipeline status endpoint needs to return compatible progress data.

3. **Section key mismatches** — Managed Agent output may use different section keys than the app expects. The One Pager agent produced `management_kpis` which wasn't in the original 6-section schema. Renderers need to handle flexible section lists.

4. **Timer remount flash** — PitchDeck.jsx and FullStory.jsx have the same timer pattern. Apply the lazy initializer fix.

5. **report_stages write** — Always ensure the `report_id` flows through to the save logic. The status endpoint must SELECT it from pipeline_runs.
