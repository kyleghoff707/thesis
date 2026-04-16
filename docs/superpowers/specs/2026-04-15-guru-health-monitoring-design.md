# Guru Health Monitoring — Design Spec

**Date:** 2026-04-15
**Status:** Draft
**Scope:** Backend-only (Worker cron + D1 + Brevo email)

---

## Problem

The guru tracking system has 43 value investor funds hardcoded in `packages/sec-parsers/gurusList.js`. The monthly cron syncs their 13F holdings into D1 — but has no awareness of real-world changes:

- **Fund closure / retirement** — a guru stops filing 13Fs. The cron silently skips them forever. Historical data ages out after 5 years with no notification.
- **Fund name change** — the SEC filing name drifts from our hardcoded label. D1 records carry stale names.
- **Fund wind-down** — a guru files a 13F with 0 holdings (liquidation signal). The cron processes it normally with no flag.

None of these scenarios produce errors. They degrade data quality silently.

## Solution

Add a health check pass to the existing monthly guru sync cron (`0 3 1 * *`). After the normal sync loop completes, run three detection checks against all 43 gurus. Store health status in a new `guru_health` D1 table. When issues are detected, send a single email digest via Brevo.

No new cron triggers. No frontend changes. No changes to the GURUS list structure.

---

## Detection Checks

### 1. Stale Filing

**Logic:** Query each guru's most recent `report_date` from `guru_holdings` in D1. If the gap between that date and today exceeds 180 days (2 quarters), flag as stale.

**Why 180 days:** 13F filings are quarterly, due 45 days after quarter end. A 180-day threshold means 2 full quarters missed — accounts for late filers and SEC extensions without false positives.

**Trigger example:** "Warren Buffett (Berkshire Hathaway) — last filed 2025-09-30 (198 days ago)"

### 2. Name Drift

**Logic:** During the sync loop, `getRecent13Fs()` already fetches each guru's EDGAR submissions JSON (`data.sec.gov/submissions/CIK{cik}.json`). Extract the `name` field from that response and compare it to the hardcoded `fund` string in `gurusList.js`. If they don't match (case-insensitive, trimmed), flag as name drift.

**Implementation detail:** Cache the SEC-reported name during the sync pass so the health check doesn't need extra API calls. Store it in the `guru_health` table as `sec_filed_name`.

**Trigger example:** "Bill Ackman — SEC name 'Pershing Square Holdings Ltd' does not match tracked name 'Pershing Square Capital Management'"

### 3. Empty Filing

**Logic:** If a guru files a 13F-HR that, after parsing and aggregation, contains 0 holdings, flag as empty filing. This is a strong signal of fund wind-down or liquidation.

**Implementation detail:** Track this during the sync loop. If `holdings.length === 0` after `enrichHoldings(aggregateShareClasses(raw))`, record the flag.

**Trigger example:** "Punch Card Management filed a 13F for 2026-03-31 with 0 positions"

---

## D1 Schema

New table `guru_health`, added to `api/schema.sql`:

```sql
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

| Column | Purpose |
|--------|---------|
| `guru_cik` | Primary key, matches `GURUS[].cik` |
| `guru_name` | Guru's display name from `gurusList.js` |
| `fund_name` | Fund name from `gurusList.js` |
| `last_report_date` | Most recent `report_date` from `guru_holdings` |
| `last_checked_at` | Timestamp of last health check run |
| `sec_filed_name` | Name from SEC EDGAR submissions JSON |
| `status` | One of: `'ok'`, `'stale'`, `'name_drift'`, `'empty_filing'` |
| `alert_sent_at` | When the last alert email was sent for this guru (prevents repeats) |
| `notes` | Freeform annotation (e.g., "confirmed closed 2026-06") |

**Behaviors:**
- One row per guru, upserted on every sync run.
- `status` resets to `'ok'` if the issue resolves (e.g., a late filer finally files).
- `alert_sent_at` prevents repeat emails. Only emails once per issue. If status returns to `'ok'` and re-triggers later, `alert_sent_at` is cleared so a new email fires.
- `notes` is for manual annotation via D1 console. Not read by any automated logic.

---

## Execution Flow

All of this runs inside the existing `syncGurus()` function in `api/src/cron/gurus.js`, after the sync loop completes.

### Step 1 — Collect health signals during sync

Modify the sync loop to cache two pieces of data per guru:
- **SEC filed name** — extracted from the EDGAR submissions JSON already fetched by `getRecent13Fs()`
- **Empty filing flag** — set when a parsed filing yields 0 holdings

These are collected into a `Map<cik, { secName, emptyFiling }>` during the existing loop. No extra API calls.

### Step 2 — Run health checks

After the sync loop, call `checkGuruHealth(env, healthSignals)` (from the new `guruHealth.js` module). This function:

1. Queries D1 for each guru's most recent `report_date`:
   ```sql
   SELECT guru_cik, MAX(report_date) as last_report
   FROM guru_holdings
   GROUP BY guru_cik
   ```
2. Iterates through all 43 gurus from the `GURUS` list
3. For each guru, determines status:
   - If `healthSignals` has `emptyFiling = true` → status = `'empty_filing'`
   - If SEC name doesn't match hardcoded fund name → status = `'name_drift'`
   - If `last_report` is missing or > 180 days ago → status = `'stale'`
   - Otherwise → status = `'ok'`
4. Priority: `empty_filing` > `name_drift` > `stale` (one status per guru, most severe wins)

### Step 3 — Upsert `guru_health` table

For each guru, upsert their row:
```sql
INSERT OR REPLACE INTO guru_health
  (guru_cik, guru_name, fund_name, last_report_date, last_checked_at, sec_filed_name, status, alert_sent_at, notes)
VALUES (?, ?, ?, ?, datetime('now'), ?, ?,
  CASE WHEN ? = 'ok' THEN NULL
       WHEN (SELECT alert_sent_at FROM guru_health WHERE guru_cik = ?) IS NOT NULL
            AND (SELECT status FROM guru_health WHERE guru_cik = ?) != 'ok'
       THEN (SELECT alert_sent_at FROM guru_health WHERE guru_cik = ?)
       ELSE NULL END,
  (SELECT notes FROM guru_health WHERE guru_cik = ?))
```

Logic:
- Status becomes `'ok'` → clear `alert_sent_at` (eligible for future alerts)
- Status was already non-ok and alert already sent → preserve `alert_sent_at` (no repeat)
- Status newly non-ok → `alert_sent_at` is NULL (eligible for email)
- `notes` always preserved from existing row

### Step 4 — Send email digest

Query for all gurus needing alerts:
```sql
SELECT * FROM guru_health WHERE status != 'ok' AND alert_sent_at IS NULL
```

If the result set is non-empty, send one Brevo email:

- **To:** `kyleghoff707@gmail.com`
- **From:** same sender as invite emails
- **Subject:** `Thes1s Guru Health Alert — {count} issue(s) detected`
- **Body:** Plain text, grouped by issue type:

```
STALE FILING
  Warren Buffett (Berkshire Hathaway) — last filed 2025-09-30 (198 days ago)

NAME DRIFT
  Bill Ackman — SEC name "Pershing Square Holdings Ltd" ≠ tracked "Pershing Square Capital Management"

EMPTY FILING
  Punch Card Management — filed 13F for 2026-03-31 with 0 positions

---
Issues resolve automatically when the guru's next filing is detected.
Manual notes can be added via D1 console: guru_health.notes
```

After sending, update `alert_sent_at` for all alerted gurus:
```sql
UPDATE guru_health SET alert_sent_at = datetime('now') WHERE guru_cik IN (...)
```

One email per month max (cron is monthly). No spam.

---

## Files Changed

| File | Change |
|------|--------|
| `api/src/cron/guruHealth.js` | **New.** Exports `checkGuruHealth(env, healthSignals)`. Contains detection logic, D1 upserts, and Brevo email. |
| `api/src/cron/gurus.js` | **Modified.** Cache SEC filed name + empty filing flag during sync loop. Call `checkGuruHealth()` after loop completes. |
| `api/schema.sql` | **Modified.** Add `guru_health` table definition. |

No changes to:
- `packages/sec-parsers/gurusList.js` — stays hardcoded
- `api/wrangler.toml` — no new cron trigger, no new bindings
- Any frontend code

---

## Brevo Integration

The Worker already has `BREVO_API_KEY` as a secret and sends invite emails via `api.brevo.com/v3/smtp/email`. The health alert uses the same pattern:

```js
await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: {
    'api-key': env.BREVO_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sender: { name: 'Thes1s', email: 'noreply@thes1sinvesting.com' },
    to: [{ email: 'kyleghoff707@gmail.com' }],
    subject: `Thes1s Guru Health Alert — ${issues.length} issue(s) detected`,
    textContent: emailBody,
  }),
});
```

---

## D1 Migration

Run once after deploy:

```bash
cd api && npx wrangler d1 execute thes1s --remote --command "CREATE TABLE IF NOT EXISTS guru_health (guru_cik TEXT PRIMARY KEY, guru_name TEXT NOT NULL, fund_name TEXT NOT NULL, last_report_date TEXT, last_checked_at TEXT NOT NULL, sec_filed_name TEXT, status TEXT DEFAULT 'ok', alert_sent_at TEXT, notes TEXT);"
```

---

## Edge Cases

| Case | Handling |
|------|----------|
| Guru never had holdings in D1 (new to list) | `last_report_date` is NULL → status is `'ok'`, no stale alert. Picks up normally once their first filing syncs. |
| Multiple issues for one guru | Most severe wins: `empty_filing` > `name_drift` > `stale` |
| SEC submissions endpoint down | `secName` is null → name drift check skipped, other checks still run |
| Brevo API fails | `console.warn`, `alert_sent_at` stays NULL → retries next month |
| Guru legitimately winds down | Add note via D1 console. Alert fires once, then `alert_sent_at` prevents repeats |
| Name drift is just formatting (e.g., "LLC" vs "L.L.C.") | Comparison is case-insensitive and trimmed. Minor formatting diffs may still trigger — acceptable, user investigates once and it won't re-alert |

---

## What This Does NOT Do

- **No admin UI** — guru management still requires code changes
- **No auto-discovery** — doesn't find new gurus to track
- **No auto-remediation** — flags issues, doesn't fix them
- **No frontend display** — email only, no Gurus tab integration
- **No alert history table** — the email is the record

These are intentional scope limits. Any of them could be added later without changing this design.
