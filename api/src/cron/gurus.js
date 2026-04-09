// Guru holdings sync — fetches latest 13F-HR filings from SEC EDGAR
// for 43 tracked value investor funds and stores holdings in D1.
//
// Schedule: monthly on the 1st at 3 AM UTC.
// 13F filings are quarterly, filed 45 days after quarter end.
// Keeps 5 years (20 quarters) of history.

import { DOMParser } from '@xmldom/xmldom';
import { parseInfoTable, aggregateShareClasses, enrichHoldings, computeChanges, GURUS } from '../../../packages/sec-parsers/index.js';

const SEC_UA = 'StockAnalyzer/1.0 kylehoff@example.com';
const FETCH_DELAY_MS = 200;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function secFetch(url, env) {
  return fetch(url, { headers: { 'User-Agent': env.SEC_USER_AGENT || SEC_UA } });
}

// Get the 2 most recent 13F-HR filing metas for a guru
async function getRecent13Fs(cik, env) {
  const paddedCik = cik.padStart(10, '0');
  const res = await secFetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, env);
  if (!res.ok) return [];

  let data;
  try { data = await res.json(); } catch { return []; }

  const recent = data.filings?.recent || {};
  const forms = recent.form || [];
  const filingDates = recent.filingDate || [];
  const accessions = recent.accessionNumber || [];
  const reportDates = recent.reportDate || [];

  // Group 13F-HR filings by reportDate (amendments override originals)
  const byReport = new Map();
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] !== '13F-HR' && forms[i] !== '13F-HR/A') continue;
    const rd = reportDates[i];
    if (!rd) continue;
    const existing = byReport.get(rd);
    // Keep the most recent filing for each report date (amendments win)
    if (!existing || filingDates[i] > existing.filingDate) {
      byReport.set(rd, {
        form: forms[i],
        filingDate: filingDates[i],
        accessionNumber: accessions[i],
        reportDate: rd,
      });
    }
  }

  // Sort by report date desc, take the 2 most recent
  return Array.from(byReport.values())
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
    .slice(0, 2);
}

// Find the infotable XML URL from a filing's index
async function getInfoTableUrl(cik, accession, env) {
  const cleanCik = cik.replace(/^0+/, '');
  const accPath = accession.replace(/-/g, '');
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${accPath}/index.json`;

  const res = await secFetch(indexUrl, env);
  let data;
  try { data = await res.json(); } catch { return null; }

  const items = data?.directory?.item || [];
  const infoFile = items.find(i =>
    /infotable/i.test(i.name) && i.name.endsWith('.xml')
  ) || items.find(i =>
    i.name.endsWith('.xml') && !i.name.includes('primary_doc') && !i.name.includes('-index')
  );

  if (!infoFile) return null;
  return `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${accPath}/${infoFile.name}`;
}

export async function syncGurus(env) {
  let processed = 0;

  for (const guru of GURUS) {
    try {
      const filingMetas = await getRecent13Fs(guru.cik, env);
      if (filingMetas.length === 0) {
        console.warn(`Guru sync: ${guru.name} — no 13F-HR filings found`);
        await sleep(FETCH_DELAY_MS);
        continue;
      }

      // Check if we already have the latest report in D1
      const latestReport = filingMetas[0].reportDate;
      const existing = await env.DB.prepare(
        'SELECT COUNT(*) as n FROM guru_holdings WHERE guru_cik = ? AND report_date = ?'
      ).bind(guru.cik, latestReport).first();

      if (existing.n > 0) {
        // Already have latest quarter
        await sleep(FETCH_DELAY_MS);
        continue;
      }

      // Fetch and parse both filings
      const parsedFilings = [];
      for (const meta of filingMetas) {
        const xmlUrl = await getInfoTableUrl(guru.cik, meta.accessionNumber, env);
        await sleep(FETCH_DELAY_MS);
        if (!xmlUrl) continue;

        const xmlRes = await secFetch(xmlUrl, env);
        if (!xmlRes.ok) continue;
        const xmlText = await xmlRes.text();

        const raw = parseInfoTable(xmlText, DOMParser);
        const aggregated = aggregateShareClasses(raw);
        const { holdings, totalValue } = enrichHoldings(aggregated);
        parsedFilings.push({ meta, holdings, totalValue });
        await sleep(FETCH_DELAY_MS);
      }

      if (parsedFilings.length === 0) continue;

      // Compute changes if we have 2 filings
      const current = parsedFilings[0];
      const previous = parsedFilings.length > 1 ? parsedFilings[1] : null;
      const holdings = previous
        ? computeChanges(current.holdings, previous.holdings)
        : current.holdings.map(h => ({ ...h, action: 'held', sharesChange: 0, pctChange: 0 }));

      // Insert into D1
      for (const h of holdings) {
        try {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO guru_holdings
            (guru_cik, guru_name, fund_name, report_date, filing_date,
             issuer, cusip, cusip6, ticker, shares, value_usd,
             portfolio_pct, share_type, action, shares_change, pct_change)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            guru.cik, guru.name, guru.fund,
            current.meta.reportDate, current.meta.filingDate,
            h.issuer, h.cusip, (h.cusip || '').slice(0, 6), h.ticker || null,
            h.shares, Math.round(h.value),
            h.portfolioPct, h.shareType, h.action || 'held',
            h.sharesChange || 0, h.pctChange || 0
          ).run();
        } catch { /* ignore duplicates */ }
      }

      processed++;
      console.log(`Guru sync: ${guru.name} — ${holdings.length} holdings for ${current.meta.reportDate}`);
    } catch (err) {
      console.warn(`Guru sync failed for ${guru.name}: ${err.message}`);
    }

    await sleep(FETCH_DELAY_MS);
  }

  // Delete holdings older than 5 years
  await env.DB.prepare(
    "DELETE FROM guru_holdings WHERE report_date < date('now', '-5 years')"
  ).run();

  await env.DB.prepare(
    'INSERT OR REPLACE INTO sync_status (job_name, last_run, last_offset, status, items_processed, error) VALUES (?, datetime(\'now\'), 0, \'complete\', ?, NULL)'
  ).bind('gurus', processed).run();

  console.log(`Guru sync complete: ${processed}/${GURUS.length} gurus updated`);
}
