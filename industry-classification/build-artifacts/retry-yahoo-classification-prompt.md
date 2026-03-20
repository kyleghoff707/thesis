# Retry Yahoo Classification — Prompt for Future Claude

## Context

We're in **Phase 2** of building a custom stock market taxonomy for the Thes1s app. The full plan is at `~/.claude/plans/radiant-inventing-octopus.md`.

Phase 2 has 3 deliverables:
1. **Taxonomy patch** — Done. Added 5 missing Industrials industries to `thes1s-taxonomy-tree.json` (171 → 176).
2. **Yahoo-to-Thes1s crosswalk** — Done. `yahoo-to-thes1s-crosswalk.json` maps all 145 Yahoo Finance industries to Thes1s codes.
3. **Batch classification of ~10,000 US public companies** — Partially done. This is what needs retrying.

## What happened

We ran `scripts/classify-universe.js` which executes a 3-step pipeline:

1. **Step 1 (Build Universe)** — Downloaded EDGAR `company_tickers.json`, filtered to 10,045 common stock tickers. Output: `taxonomy-research/pipeline/universe.json`. **Complete.**

2. **Step 2 (Yahoo Classification)** — Fetched sector/industry labels from Yahoo Finance via `yahoo-finance2` for each ticker, mapped through the crosswalk. **Partially complete.** Classified 6,522 tickers. Yahoo rate-limited us twice — we ran the initial batch and one retry. Output: `taxonomy-research/pipeline/yahoo-seed.json`.

3. **Step 3 (Build Assignments)** — Built final assignments from Yahoo results. Companies Yahoo classified get their Thes1s codes; unclassified companies are marked `pending-yahoo-retry` with `thes1sCode: null`. **Complete** but needs rebuilding after retry.

### Bug fix during this session
The Step 1 ticker filter was too aggressive — it excluded legitimate tickers like AAPL (caught by preferred stock filter matching "PL" suffix) and LULU (caught by unit filter matching "U" suffix). Fixed to only filter tickers with explicit separator-based suffixes (e.g., `BRK/PA`, `ACHR/WS`). Universe went from 8,257 → 10,045 tickers after the fix.

### Current state
- **6,522 classified** via Yahoo (80.8% of the 8,069 unique CIK entries)
- **1,547 pending retry** — breakdown:
  - 820 unclassified (new tickers from filter fix, never attempted)
  - 544 yahoo-error (rate limited)
  - 172 yahoo-missing (Yahoo has no sector/industry data — likely shells/SPACs)
  - 11 yahoo-unmapped (Yahoo returned labels not in our crosswalk)
- No SIC fallback — we decided to keep it clean, Yahoo-only

### Known minor issue
GOOGL and JPM show "NOT FOUND" in validation spot check even though they're classified in yahoo-seed. This is a CIK deduplication issue — GOOG and GOOGL share the same CIK (0001652044), so when Step 3 iterates the universe, whichever ticker is processed last for that CIK wins. The `entries.find(e => e.ticker === 'GOOGL')` lookup fails because the entry has `ticker: 'GOOG'`. Same for JPM vs JPM class shares. Not a data loss issue — the classification is there, just keyed under the other ticker. Can be fixed by preferring the shorter/primary ticker when deduplicating.

## What to do

Just run the retry:

```
node scripts/classify-universe.js --retry-yahoo
```

This will:
1. Load existing `yahoo-seed.json`
2. Find all entries with `source: "yahoo-error"`, `"yahoo-unmapped"`, or `"yahoo-missing"`
3. Also find tickers in `universe.json` not yet in yahoo-seed (the 820 new ones)
4. Re-run only those ~1,547 tickers through Yahoo Finance
5. Merge successful results back into `yahoo-seed.json`
6. Rebuild the final assignments file
7. Run validation automatically

After it completes, check:
- Coverage should be 90%+ at the classified level
- Spot-check the 20 well-known companies
- Check the 11 "unmapped" entries — Yahoo returned labels not in the crosswalk, may need crosswalk additions
- Consider fixing the CIK dedup issue (prefer shorter ticker when multiple share a CIK)

If Yahoo rate-limits again mid-retry, just run `--retry-yahoo` again later — it's idempotent.

Validation only (no Yahoo calls):
```
node scripts/classify-universe.js --validate
```

## Key files

```
scripts/classify-universe.js                           — The classification script
taxonomy-research/pipeline/universe.json     — 10,045 tickers (fixed filters)
taxonomy-research/pipeline/yahoo-seed.json   — Yahoo results (6,522 classified + failures)
taxonomy-research/pipeline/assignments-build.json — Step 3 build output
taxonomy-research/thes1s-company-assignments.json — Final output (6,522 classified, 1,547 pending)
taxonomy-research/yahoo-to-thes1s-crosswalk.json — Yahoo → Thes1s mapping (145 entries)
taxonomy-research/thes1s-taxonomy-tree.json       — The taxonomy (176 industries)
```

## Important note about yahoo-finance2

The library requires instantiation (not a default import):
```js
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
```
The script already has this fix.
