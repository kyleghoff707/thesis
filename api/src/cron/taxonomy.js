// Smart taxonomy refresh — 6-phase weekly workflow.
// Detects IPOs, delistings, S&P 500 changes, and reclassifications.
//
// Schedule: every Sunday at 2 AM UTC.

import { classifyTicker, isNonCommonStock, MAJOR_EXCHANGES } from './crosswalk.js';
import { getYahooFinance } from '../lib/yahoo.js';

const SEC_UA = 'StockAnalyzer/1.0 kylehoff@example.com';
const YAHOO_CLASSIFY_BATCH = 30;
const YAHOO_SPOTCHECK_BATCH = 10;
const YAHOO_DELAY_MS = 500;
const EXCLUDE_RESET_INTERVAL = 4; // weeks between resetting excluded items
const EXCLUDE_RESET_BATCH = 50;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function refreshTaxonomy(env) {
  const summary = {
    tickerChanges: 0,
    newQueued: 0,
    newClassified: 0,
    newExcluded: 0,
    sp500Added: 0,
    sp500Removed: 0,
    delistingsFound: 0,
    reclassifications: 0,
    excludeResets: 0,
    errors: [],
  };

  // ═══ Phase 1: Fetch SEC Universe ═══════════════════════════════
  let secByCik;
  try {
    secByCik = await fetchSecUniverse(env);
  } catch (err) {
    console.warn('Taxonomy: SEC fetch failed:', err.message);
    await writeSyncStatus(env, 'error', summary, err.message);
    return;
  }
  console.log(`Taxonomy Phase 1: ${secByCik.size} common stocks from SEC`);

  // ═══ Phase 2: Update Existing Companies ════════════════════════
  try {
    summary.tickerChanges = await updateExisting(env, secByCik);
  } catch (err) {
    console.warn('Taxonomy Phase 2 error:', err.message);
    summary.errors.push('phase2: ' + err.message);
  }
  console.log(`Taxonomy Phase 2: ${summary.tickerChanges} ticker/name updates`);

  // ═══ Phase 3: Queue + Classify New Listings ════════════════════
  try {
    const p3 = await classifyNewListings(env, secByCik);
    summary.newQueued = p3.queued;
    summary.newClassified = p3.classified;
    summary.newExcluded = p3.excluded;
    summary.excludeResets = p3.excludeResets;
  } catch (err) {
    console.warn('Taxonomy Phase 3 error:', err.message);
    summary.errors.push('phase3: ' + err.message);
  }
  console.log(`Taxonomy Phase 3: ${summary.newQueued} queued, ${summary.newClassified} classified, ${summary.excludeResets} resets`);

  // ═══ Phase 4: S&P 500 Membership Refresh ═══════════════════════
  try {
    const p4 = await refreshSP500(env);
    summary.sp500Added = p4.added;
    summary.sp500Removed = p4.removed;
  } catch (err) {
    console.warn('Taxonomy Phase 4 error:', err.message);
    summary.errors.push('phase4: ' + err.message);
  }
  console.log(`Taxonomy Phase 4: S&P 500 +${summary.sp500Added} -${summary.sp500Removed}`);

  // ═══ Phase 5: Yahoo Spot-Check Rotation ════════════════════════
  try {
    const p5 = await spotCheckRotation(env);
    summary.delistingsFound = p5.delisted;
    summary.reclassifications = p5.reclassified;
  } catch (err) {
    console.warn('Taxonomy Phase 5 error:', err.message);
    summary.errors.push('phase5: ' + err.message);
  }
  console.log(`Taxonomy Phase 5: ${summary.delistingsFound} delistings, ${summary.reclassifications} reclassifications`);

  // ═══ Phase 6: Record Results ═══════════════════════════════════
  await writeSyncStatus(env, 'complete', summary);
  console.log('Taxonomy refresh complete:', JSON.stringify(summary));
}


// ─── Phase 1: Fetch SEC Universe ────────────────────────────────

async function fetchSecUniverse(env) {
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': env.SEC_USER_AGENT || SEC_UA },
  });
  if (!res.ok) throw new Error(`SEC returned ${res.status}`);

  const data = await res.json();
  const secByCik = new Map();

  for (const entry of Object.values(data)) {
    const cik = String(entry.cik_str).padStart(10, '0');
    const ticker = entry.ticker;

    // Skip non-common stock (warrants, units, rights, preferred)
    if (isNonCommonStock(ticker)) continue;

    // Deduplicate by CIK (keep first)
    if (!secByCik.has(cik)) {
      secByCik.set(cik, { ticker, name: entry.title });
    }
  }

  return secByCik;
}


// ─── Phase 2: Update Existing Companies ─────────────────────────

async function updateExisting(env, secByCik) {
  const { results: existing } = await env.DB.prepare(
    'SELECT cik, ticker, name, status FROM company_assignments'
  ).all();

  let updates = 0;

  for (const row of existing) {
    const sec = secByCik.get(row.cik);
    if (!sec) continue;

    const changes = [];
    if (sec.ticker !== row.ticker && sec.ticker) changes.push('ticker');
    if (sec.name !== row.name && sec.name) changes.push('name');

    if (changes.length > 0) {
      await env.DB.prepare(
        "UPDATE company_assignments SET ticker = ?, name = ?, updated_at = datetime('now') WHERE cik = ?"
      ).bind(sec.ticker || row.ticker, sec.name || row.name, row.cik).run();
      updates++;
      console.log(`Taxonomy: updated ${row.ticker} — ${changes.join(', ')}`);
    }
  }

  return updates;
}


// ─── Phase 3: Queue + Classify New Listings ─────────────────────

async function classifyNewListings(env, secByCik) {
  const result = { queued: 0, classified: 0, excluded: 0, excludeResets: 0 };

  // Load existing CIKs from both tables
  const { results: existingRows } = await env.DB.prepare(
    'SELECT cik FROM company_assignments'
  ).all();
  const existingCiks = new Set(existingRows.map(r => r.cik));

  const { results: queueRows } = await env.DB.prepare(
    'SELECT cik FROM classification_queue'
  ).all();
  const queueCiks = new Set(queueRows.map(r => r.cik));

  // Find genuinely new CIKs
  const newCiks = [];
  for (const [cik, data] of secByCik) {
    if (!existingCiks.has(cik) && !queueCiks.has(cik)) {
      newCiks.push({ cik, ...data });
    }
  }

  // Insert new CIKs into queue
  for (const entry of newCiks) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO classification_queue (cik, ticker, name, status) VALUES (?, ?, ?, 'pending')"
    ).bind(entry.cik, entry.ticker, entry.name).run();
    result.queued++;
  }

  // Every 4 weeks: reset oldest excluded items to re-check for uplists
  const { results: [syncRow] } = await env.DB.prepare(
    "SELECT last_offset FROM sync_status WHERE job_name = 'taxonomy'"
  ).all();
  const runCount = (syncRow?.last_offset || 0) + 1;

  if (runCount % EXCLUDE_RESET_INTERVAL === 0) {
    const { results: excludedRows } = await env.DB.prepare(
      "SELECT cik FROM classification_queue WHERE status = 'excluded' ORDER BY updated_at ASC LIMIT ?"
    ).bind(EXCLUDE_RESET_BATCH).all();

    for (const row of excludedRows) {
      await env.DB.prepare(
        "UPDATE classification_queue SET status = 'pending', retry_count = 0, updated_at = datetime('now') WHERE cik = ?"
      ).bind(row.cik).run();
      result.excludeResets++;
    }
  }

  // Classify pending tickers via Yahoo Finance
  const { results: pending } = await env.DB.prepare(
    "SELECT cik, ticker, name, retry_count FROM classification_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?"
  ).bind(YAHOO_CLASSIFY_BATCH).all();

  let yf;
  try { yf = await getYahooFinance(); } catch { return result; }

  for (const entry of pending) {
    try {
      const data = await yf.quoteSummary(entry.ticker, { modules: ['assetProfile', 'price'] });
      const classification = classifyTicker(data.assetProfile, data.price);

      if (classification.status === 'classified') {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO company_assignments (cik, ticker, name, sector, industry_group, industry, thes1s_code, exchange, confidence, yahoo_sector, yahoo_industry, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))"
        ).bind(
          entry.cik, entry.ticker, entry.name,
          classification.sector, classification.industryGroup, classification.industry,
          classification.thes1sCode, classification.exchange,
          classification.confidence, classification.yahooSector, classification.yahooIndustry
        ).run();

        await env.DB.prepare(
          "UPDATE classification_queue SET status = 'classified', updated_at = datetime('now') WHERE cik = ?"
        ).bind(entry.cik).run();
        result.classified++;
      } else if (classification.status === 'excluded') {
        await env.DB.prepare(
          "UPDATE classification_queue SET status = 'excluded', exclude_reason = ?, updated_at = datetime('now') WHERE cik = ?"
        ).bind(classification.reason, entry.cik).run();
        result.excluded++;
      } else {
        // unmapped
        const newRetry = (entry.retry_count || 0) + 1;
        const newStatus = newRetry >= 3 ? 'error' : 'pending';
        await env.DB.prepare(
          "UPDATE classification_queue SET status = ?, retry_count = ?, updated_at = datetime('now') WHERE cik = ?"
        ).bind(newStatus, newRetry, entry.cik).run();
      }
    } catch (err) {
      // Yahoo error (rate limit, network, etc.) — skip remaining
      console.warn(`Taxonomy: Yahoo error on ${entry.ticker}:`, err.message);
      break;
    }

    await sleep(YAHOO_DELAY_MS);
  }

  return result;
}


// ─── Phase 4: S&P 500 Membership Refresh ────────────────────────

async function refreshSP500(env) {
  const result = { added: 0, removed: 0 };

  const res = await fetch('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies', {
    headers: { 'User-Agent': 'Thes1s/1.0 (investment research)' },
  });
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);
  const html = await res.text();

  // Extract tickers from the first wikitable
  const tickers = parseWikipediaSP500(html);
  if (tickers.length < 400) {
    console.warn(`Taxonomy: Wikipedia returned only ${tickers.length} tickers, skipping S&P 500 update`);
    return result;
  }

  const wikiSet = new Set(tickers);

  // Load current S&P 500 members
  const { results: currentSP } = await env.DB.prepare(
    'SELECT ticker FROM company_assignments WHERE is_sp500 = 1'
  ).all();
  const currentSet = new Set(currentSP.map(r => r.ticker));

  // Additions
  for (const ticker of wikiSet) {
    if (!currentSet.has(ticker)) {
      await env.DB.prepare(
        "UPDATE company_assignments SET is_sp500 = 1, updated_at = datetime('now') WHERE ticker = ?"
      ).bind(ticker).run();
      result.added++;
      console.log(`Taxonomy: S&P 500 added ${ticker}`);
    }
  }

  // Removals
  for (const ticker of currentSet) {
    if (!wikiSet.has(ticker)) {
      await env.DB.prepare(
        "UPDATE company_assignments SET is_sp500 = 0, updated_at = datetime('now') WHERE ticker = ?"
      ).bind(ticker).run();
      result.removed++;
      console.log(`Taxonomy: S&P 500 removed ${ticker}`);
    }
  }

  return result;
}

function parseWikipediaSP500(html) {
  // Find the first wikitable and extract tickers from the first column
  const tableMatch = html.match(/<table[^>]*class="wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return [];

  const tickers = [];
  // Match each row's first <td> which contains the ticker wrapped in <a>
  const rowRegex = /<tr[^>]*>\s*<td[^>]*>(?:<a[^>]*>)?([A-Z.]+)(?:<\/a>)?/g;
  let match;
  while ((match = rowRegex.exec(tableMatch[1])) !== null) {
    // Normalize: BRK.B -> BRK-B
    tickers.push(match[1].replace('.', '-'));
  }
  return tickers;
}


// ─── Phase 5: Yahoo Spot-Check Rotation ─────────────────────────

async function spotCheckRotation(env) {
  const result = { delisted: 0, reclassified: 0, checked: 0 };

  const { results: oldest } = await env.DB.prepare(
    "SELECT cik, ticker, yahoo_sector, yahoo_industry FROM company_assignments WHERE status = 'active' ORDER BY updated_at ASC LIMIT ?"
  ).bind(YAHOO_SPOTCHECK_BATCH).all();

  if (oldest.length === 0) return result;

  let yf;
  try { yf = await getYahooFinance(); } catch { return result; }

  for (const row of oldest) {
    try {
      const data = await yf.quoteSummary(row.ticker, { modules: ['assetProfile', 'price'] });

      // Delisting check
      const quoteType = data.price?.quoteType;
      const exchange = data.price?.exchange;
      if (!quoteType || (exchange && !MAJOR_EXCHANGES.has(exchange))) {
        await env.DB.prepare(
          "UPDATE company_assignments SET status = 'delisted', delisted_at = datetime('now'), updated_at = datetime('now') WHERE cik = ?"
        ).bind(row.cik).run();
        result.delisted++;
        console.log(`Taxonomy: delisted ${row.ticker} (quoteType=${quoteType}, exchange=${exchange})`);
      } else {
        // Reclassification check
        const newSector = data.assetProfile?.sector;
        const newIndustry = data.assetProfile?.industry;
        if (newSector && newIndustry && (newSector !== row.yahoo_sector || newIndustry !== row.yahoo_industry)) {
          const reclass = classifyTicker(data.assetProfile, data.price);
          if (reclass.status === 'classified') {
            await env.DB.prepare(
              "UPDATE company_assignments SET sector = ?, industry_group = ?, industry = ?, thes1s_code = ?, confidence = ?, yahoo_sector = ?, yahoo_industry = ?, updated_at = datetime('now') WHERE cik = ?"
            ).bind(
              reclass.sector, reclass.industryGroup, reclass.industry,
              reclass.thes1sCode, reclass.confidence,
              reclass.yahooSector, reclass.yahooIndustry, row.cik
            ).run();
            result.reclassified++;
            console.log(`Taxonomy: reclassified ${row.ticker} from ${row.yahoo_sector}|${row.yahoo_industry} to ${newSector}|${newIndustry}`);
          }
        }

        // Advance rotation (update timestamp even if nothing changed)
        await env.DB.prepare(
          "UPDATE company_assignments SET updated_at = datetime('now') WHERE cik = ?"
        ).bind(row.cik).run();
      }

      result.checked++;
    } catch (err) {
      console.warn(`Taxonomy: spot-check error on ${row.ticker}:`, err.message);
      // Still advance the rotation to avoid getting stuck on a broken ticker
      await env.DB.prepare(
        "UPDATE company_assignments SET updated_at = datetime('now') WHERE cik = ?"
      ).bind(row.cik).run();
      result.checked++;
    }

    await sleep(YAHOO_DELAY_MS);
  }

  return result;
}


// ─── Helpers ────────────────────────────────────────────────────

async function writeSyncStatus(env, status, summary, error = null) {
  const runCount = summary._runCount || 0;
  await env.DB.prepare(
    "INSERT OR REPLACE INTO sync_status (job_name, last_run, last_offset, status, items_processed, error) VALUES ('taxonomy', datetime('now'), ?, ?, ?, ?)"
  ).bind(
    runCount + 1,
    status,
    JSON.stringify(summary).length > 500 ? summary.newClassified : 0,
    error || JSON.stringify(summary)
  ).run();
}
