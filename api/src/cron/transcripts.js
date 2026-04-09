// Transcript sync — fetches earnings call transcripts from Alpha Vantage
// and stores them in R2. Goal: always have the latest 4 quarterly transcripts
// for all S&P 500 companies.
//
// Rate limits: 25 calls/day per AV key × 2 keys = 50/day.
// Schedule: every 3 hours, 6 calls per run = 48/day.
// Full S&P 500 backfill: ~500 tickers × 4 quarters = ~2000 calls = ~42 days.

import { formatAlphaVantageTranscript } from '../../../packages/sec-parsers/index.js';

const CALLS_PER_RUN = 6;
const MAX_DAILY_CALLS = 48;
const QUARTERS_TO_KEEP = 4;

// Get the last N expected quarters (e.g., 2026Q1, 2025Q4, 2025Q3, 2025Q2)
function getExpectedQuarters(count = 4) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  // If we're in month 1 of a quarter, the previous quarter's transcript may not be out yet
  let currentQ = Math.ceil(currentMonth / 3);
  let year = currentYear;

  // Start from previous quarter (current quarter's transcript likely not available yet)
  currentQ -= 1;
  if (currentQ <= 0) { currentQ = 4; year -= 1; }

  const quarters = [];
  for (let i = 0; i < count; i++) {
    quarters.push({ year, quarter: currentQ });
    currentQ -= 1;
    if (currentQ <= 0) { currentQ = 4; year -= 1; }
  }
  return quarters;
}

export async function syncTranscripts(env) {
  // 1. Check daily call counter
  const statusRow = await env.DB.prepare(
    'SELECT * FROM sync_status WHERE job_name = ?'
  ).bind('transcripts').first();

  const today = new Date().toISOString().slice(0, 10);
  const lastRunDate = statusRow?.last_run?.slice(0, 10);
  let dailyCalls = (lastRunDate === today) ? (statusRow?.items_processed || 0) : 0;

  if (dailyCalls >= MAX_DAILY_CALLS) {
    console.log(`Transcript sync: daily limit reached (${dailyCalls}/${MAX_DAILY_CALLS}). Skipping.`);
    return;
  }

  // 2. Load S&P 500 tickers from D1 (only companies flagged as S&P 500)
  const { results: companies } = await env.DB.prepare(
    'SELECT ticker FROM company_assignments WHERE ticker IS NOT NULL AND is_sp500 = 1 ORDER BY ticker'
  ).all();
  const tickers = companies.map(c => c.ticker);

  if (tickers.length === 0) {
    console.log('Transcript sync: no tickers in company_assignments. Seed taxonomy first.');
    return;
  }

  // 3. Resume from last offset (round-robin through ticker list)
  let offset = statusRow?.last_offset || 0;
  if (offset >= tickers.length) offset = 0;

  const expectedQuarters = getExpectedQuarters(QUARTERS_TO_KEEP);
  let callsMade = 0;

  // 4. Process tickers starting from offset
  for (let i = 0; i < tickers.length && callsMade < CALLS_PER_RUN; i++) {
    const idx = (offset + i) % tickers.length;
    const ticker = tickers[idx];

    // Check which quarters are already in R2
    const listed = await env.TRANSCRIPTS.list({ prefix: `transcripts/${ticker}/` });
    const existingKeys = new Set(listed.objects.map(o => o.key));

    for (const { year, quarter } of expectedQuarters) {
      if (callsMade >= CALLS_PER_RUN) break;
      if (dailyCalls + callsMade >= MAX_DAILY_CALLS) break;

      const r2Key = `transcripts/${ticker}/${year}/Q${quarter}.json`;
      if (existingKeys.has(r2Key)) continue; // Already have it

      // Fetch from Alpha Vantage
      const avKey = callsMade % 2 === 0 ? env.ALPHA_VANTAGE_KEY : env.ALPHA_VANTAGE_KEY_2;
      if (!avKey) {
        console.warn('Transcript sync: no ALPHA_VANTAGE_KEY configured. Set via wrangler secret put.');
        break;
      }

      const quarterStr = `${year}Q${quarter}`;
      const url = `https://www.alphavantage.co/query?function=EARNINGS_CALL_TRANSCRIPT&symbol=${ticker}&quarter=${quarterStr}&apikey=${avKey}`;

      try {
        const res = await fetch(url);
        const data = await res.json();

        // Check for rate limit response
        if (data.Note || data.Information) {
          console.warn(`Transcript sync: AV rate limit hit after ${callsMade} calls. Stopping run.`);
          break;
        }

        if (data['Error Message'] || !data.transcript || data.transcript.length === 0) {
          // No transcript available for this quarter (not an error, just not filed yet)
          callsMade++;
          continue;
        }

        // Format and store
        const text = formatAlphaVantageTranscript(data);
        const stored = {
          text,
          meta: {
            source: 'alpha_vantage',
            quarter: quarterStr,
            year,
            quarterNum: quarter,
            fetchedAt: new Date().toISOString(),
          },
        };

        await env.TRANSCRIPTS.put(r2Key, JSON.stringify(stored));
        console.log(`Stored transcript: ${ticker} ${quarterStr}`);
        callsMade++;
      } catch (err) {
        console.warn(`Transcript fetch failed for ${ticker} ${quarterStr}: ${err.message}`);
        callsMade++;
      }
    }

    // 5. If ticker has more than QUARTERS_TO_KEEP transcripts, delete oldest
    const afterList = await env.TRANSCRIPTS.list({ prefix: `transcripts/${ticker}/` });
    if (afterList.objects.length > QUARTERS_TO_KEEP) {
      const sorted = afterList.objects
        .map(o => ({ key: o.key, ...parseR2Key(o.key) }))
        .filter(o => o.year)
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.quarter - b.quarter);

      while (sorted.length > QUARTERS_TO_KEEP) {
        const oldest = sorted.shift();
        await env.TRANSCRIPTS.delete(oldest.key);
        console.log(`Deleted old transcript: ${oldest.key}`);
      }
    }
  }

  // 6. Update sync_status
  const newOffset = (offset + CALLS_PER_RUN) % tickers.length;
  const newDailyCalls = dailyCalls + callsMade;

  await env.DB.prepare(
    'INSERT OR REPLACE INTO sync_status (job_name, last_run, last_offset, status, items_processed, error) VALUES (?, datetime(\'now\'), ?, \'complete\', ?, NULL)'
  ).bind('transcripts', newOffset, newDailyCalls).run();

  console.log(`Transcript sync: ${callsMade} calls made, offset ${offset}→${newOffset}, daily total ${newDailyCalls}/${MAX_DAILY_CALLS}`);
}

function parseR2Key(key) {
  const match = key.match(/transcripts\/[A-Z.]+\/(\d{4})\/Q(\d)\.json/);
  if (!match) return {};
  return { year: parseInt(match[1]), quarter: parseInt(match[2]) };
}
