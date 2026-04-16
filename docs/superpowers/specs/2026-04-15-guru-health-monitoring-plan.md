# Guru Health Monitoring — Implementation Plan

**Design spec:** `docs/superpowers/specs/2026-04-15-guru-health-monitoring-design.md`

---

## Step 1: Add `guru_health` table to schema

**File:** `api/schema.sql`

Add after the `guru_holdings` index definitions (line 96), under a new section header:

```sql
-- ═══ Guru Health Monitoring ═══════════════════════════════════

CREATE TABLE IF NOT EXISTS guru_health (
  guru_cik TEXT PRIMARY KEY,
  guru_name TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  last_report_date TEXT,
  last_checked_at TEXT NOT NULL,
  sec_filed_name TEXT,
  status TEXT DEFAULT 'ok',
  alert_sent_at TEXT,
  notes TEXT
);
```

No indexes needed — 43 rows, queried by primary key only.

**Verify:** Schema file parses cleanly.

---

## Step 2: Create `guruHealth.js` module

**New file:** `api/src/cron/guruHealth.js`

Exports one function: `checkGuruHealth(env, healthSignals)`

**`healthSignals` shape** (passed from `syncGurus`):
```js
// Map<cik, { secName: string|null, emptyFiling: boolean }>
```

**Function logic:**

1. Query D1 for most recent `report_date` per guru:
   ```sql
   SELECT guru_cik, MAX(report_date) as last_report FROM guru_holdings GROUP BY guru_cik
   ```

2. Iterate all 43 gurus from `GURUS` list. For each, determine status:
   - If `healthSignals.get(cik)?.emptyFiling` → `'empty_filing'`
   - If `healthSignals.get(cik)?.secName` exists AND doesn't match `guru.fund` (case-insensitive, trimmed) → `'name_drift'`
   - If `last_report` is missing or > 180 days old → `'stale'`
   - Otherwise → `'ok'`

3. Upsert each guru's row into `guru_health`. Key behaviors:
   - Status becomes `'ok'` → set `alert_sent_at = NULL`
   - Status was already non-ok AND `alert_sent_at` exists → preserve it (no repeat alert)
   - Status newly non-ok → `alert_sent_at` stays NULL (eligible for email)
   - Always preserve existing `notes`

   Implementation: read existing row first, then INSERT OR REPLACE with computed values. Simpler than complex CASE SQL:
   ```js
   const existing = await env.DB.prepare(
     'SELECT alert_sent_at, notes FROM guru_health WHERE guru_cik = ?'
   ).bind(cik).first();

   const alertSentAt = status === 'ok' ? null
     : (existing?.alert_sent_at ?? null);

   await env.DB.prepare(`
     INSERT OR REPLACE INTO guru_health
     (guru_cik, guru_name, fund_name, last_report_date, last_checked_at, sec_filed_name, status, alert_sent_at, notes)
     VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)
   `).bind(cik, guru.name, guru.fund, lastReport, secName, status, alertSentAt, existing?.notes ?? null).run();
   ```

4. Query for gurus needing alerts:
   ```sql
   SELECT * FROM guru_health WHERE status != 'ok' AND alert_sent_at IS NULL
   ```

5. If any results, build email body (grouped by status type) and send via Brevo:
   ```js
   await fetch('https://api.brevo.com/v3/smtp/email', {
     method: 'POST',
     headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
     body: JSON.stringify({
       sender: { name: 'Thes1s', email: 'noreply@thes1sinvesting.com' },
       to: [{ email: 'kyleghoff707@gmail.com' }],
       subject: `Thes1s Guru Health Alert — ${alerts.length} issue(s) detected`,
       textContent: emailBody,
     }),
   });
   ```

6. Update `alert_sent_at` for all alerted gurus.

7. Wrap email send in try/catch — if Brevo fails, `console.warn` and leave `alert_sent_at` NULL so it retries next month.

---

## Step 3: Modify `syncGurus` to collect health signals and call health check

**File:** `api/src/cron/gurus.js`

Three changes:

### 3a. Cache SEC filed name from `getRecent13Fs`

`getRecent13Fs` already fetches `data.sec.gov/submissions/CIK{cik}.json`. Currently it only extracts filing metadata. Modify it to also return the entity name from the response.

Change return type: instead of returning just filing metas, return `{ filings, secName }`.

```js
// In getRecent13Fs, after parsing:
const secName = data.name || null;
// ...
return { filings: Array.from(byReport.values()).sort(...).slice(0, 2), secName };
```

Update the call site in `syncGurus` to destructure:
```js
const { filings: filingMetas, secName } = await getRecent13Fs(guru.cik, env);
```

### 3b. Track empty filings

After parsing holdings, check if the array is empty:
```js
const emptyFiling = parsedFilings.length > 0 && parsedFilings[0].holdings.length === 0;
```

### 3c. Collect signals and call health check

At the top of `syncGurus`:
```js
import { checkGuruHealth } from './guruHealth.js';
const healthSignals = new Map();
```

Inside the loop, after processing each guru (before the final `await sleep`):
```js
healthSignals.set(guru.cik, { secName, emptyFiling: emptyFiling || false });
```

For gurus that are skipped (already have latest quarter), still record `secName`:
```js
healthSignals.set(guru.cik, { secName, emptyFiling: false });
```

After the sync loop, after the 5-year cleanup, before the `sync_status` update:
```js
try {
  await checkGuruHealth(env, healthSignals);
} catch (err) {
  console.warn('Guru health check failed:', err.message);
}
```

Wrapped in try/catch so health check failures don't break the sync job.

---

## Step 4: Run D1 migration

```bash
cd api && npx wrangler d1 execute thes1s --remote --command "CREATE TABLE IF NOT EXISTS guru_health (guru_cik TEXT PRIMARY KEY, guru_name TEXT NOT NULL, fund_name TEXT NOT NULL, last_report_date TEXT, last_checked_at TEXT NOT NULL, sec_filed_name TEXT, status TEXT DEFAULT 'ok', alert_sent_at TEXT, notes TEXT);"
```

---

## Step 5: Deploy and verify

1. `cd api && npx wrangler deploy`
2. Trigger a manual test by calling the guru cron (or wait for the 1st of next month)
3. Check `wrangler tail` for health check logs
4. Verify `guru_health` table populated: `wrangler d1 execute thes1s --remote --command "SELECT * FROM guru_health LIMIT 5;"`

---

## Files Changed Summary

| File | Action | Lines affected |
|------|--------|----------------|
| `api/schema.sql` | Add table | +10 lines after line 96 |
| `api/src/cron/guruHealth.js` | New file | ~100 lines |
| `api/src/cron/gurus.js` | Modify | ~15 lines changed across `getRecent13Fs` return, sync loop, health check call |

No changes to: `gurusList.js`, `wrangler.toml`, `index.js` (cron dispatcher), or any frontend code.

---

## Testing

- **Unit test `guruHealth.js`**: Mock D1 queries and Brevo fetch. Test all three detection paths + email formatting + alert dedup.
- **Manual verification**: After deploy, query `guru_health` table and confirm all 43 rows populated with `status = 'ok'` (assuming no current issues).
- **Edge case**: Temporarily add a fake guru with a stale CIK to verify the stale detection and email flow, then remove.
