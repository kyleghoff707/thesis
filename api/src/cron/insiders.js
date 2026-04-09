// Insider trades sync — fetches new Form 4 filings from SEC EDGAR
// for S&P 500 companies and stores transactions in D1.
//
// Schedule: daily at 6 AM UTC. Processes 50 tickers per run.
// Full S&P 500 rotation: ~10 days.
// Keeps last 40 transactions per company.

import { DOMParser } from '@xmldom/xmldom';
import { parseForm4Xml, deduplicateAmendments } from '../../../packages/sec-parsers/index.js';

const TICKERS_PER_RUN = 50;
const MAX_TRANSACTIONS_PER_TICKER = 40;
const SEC_UA = 'StockAnalyzer/1.0 kylehoff@example.com';
const FETCH_DELAY_MS = 120;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function secFetch(url, env) {
  const res = await fetch(url, {
    headers: { 'User-Agent': env.SEC_USER_AGENT || SEC_UA },
  });
  return res;
}

export async function syncInsiders(env) {
  // 1. Load S&P 500 tickers with CIKs
  const { results: companies } = await env.DB.prepare(
    'SELECT ticker, cik FROM company_assignments WHERE ticker IS NOT NULL ORDER BY ticker'
  ).all();

  if (companies.length === 0) {
    console.log('Insider sync: no companies in taxonomy. Seed first.');
    return;
  }

  // 2. Resume from offset
  const statusRow = await env.DB.prepare(
    'SELECT * FROM sync_status WHERE job_name = ?'
  ).bind('insiders').first();

  let offset = statusRow?.last_offset || 0;
  if (offset >= companies.length) offset = 0;

  let processed = 0;

  // 3. Process tickers
  for (let i = 0; i < TICKERS_PER_RUN && (offset + i) < companies.length; i++) {
    const { ticker, cik } = companies[offset + i];
    if (!cik) continue;

    try {
      // Get company filings from EDGAR
      const cleanCik = cik.replace(/^0+/, '') || cik;
      const paddedCik = cik.padStart(10, '0');
      const subsUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
      const subsRes = await secFetch(subsUrl, env);
      if (!subsRes.ok) { await sleep(FETCH_DELAY_MS); continue; }

      // SEC returns text/html for JSON — use try/catch, not content-type guard
      let subsData;
      try { subsData = await subsRes.json(); } catch { await sleep(FETCH_DELAY_MS); continue; }

      // Filter Form 4 filings
      const recent = subsData.filings?.recent || {};
      const forms = recent.form || [];
      const filingDates = recent.filingDate || [];
      const accessions = recent.accessionNumber || [];
      const primaryDocs = recent.primaryDocument || [];

      // Get last filing date we have in D1
      const lastRow = await env.DB.prepare(
        'SELECT MAX(filing_date) as last_date FROM insider_trades WHERE ticker = ?'
      ).bind(ticker).first();
      const lastDate = lastRow?.last_date || '2020-01-01';

      let newTransactions = [];

      for (let j = 0; j < forms.length; j++) {
        if (forms[j] !== '4' && forms[j] !== '4/A') continue;
        if (filingDates[j] <= lastDate) continue; // Already have this filing

        const accession = accessions[j];
        const filerCik = accession.split('-')[0];
        const accPath = accession.replace(/-/g, '');

        // Find the Form 4 XML file
        let xmlUrl = null;
        const primaryDoc = primaryDocs[j];
        if (primaryDoc) {
          const basename = primaryDoc.includes('/') ? primaryDoc.split('/').pop() : primaryDoc;
          if (basename.endsWith('.xml')) {
            xmlUrl = `https://www.sec.gov/Archives/edgar/data/${filerCik}/${accPath}/${basename}`;
          }
        }

        if (!xmlUrl) {
          // Fallback: index.json
          const indexUrl = `https://www.sec.gov/Archives/edgar/data/${filerCik}/${accPath}/index.json`;
          try {
            const indexRes = await secFetch(indexUrl, env);
            let indexData;
            try { indexData = await indexRes.json(); } catch { continue; }
            const items = indexData?.directory?.item || [];
            const xmlFile = items.find(i =>
              /^(wk-form4|form4|doc4|primary_doc).*\.xml$/i.test(i.name)
            ) || items.find(i => i.name.endsWith('.xml') && !i.name.includes('-index'));
            if (xmlFile) {
              xmlUrl = `https://www.sec.gov/Archives/edgar/data/${filerCik}/${accPath}/${xmlFile.name}`;
            }
          } catch { /* skip */ }
          await sleep(FETCH_DELAY_MS);
        }

        if (!xmlUrl) continue;

        // Fetch and parse XML
        try {
          const xmlRes = await secFetch(xmlUrl, env);
          if (!xmlRes.ok) continue;
          const xmlText = await xmlRes.text();

          const filingMeta = {
            filingDate: filingDates[j],
            accessionNumber: accession,
          };

          const transactions = parseForm4Xml(xmlText, filingMeta, DOMParser);
          newTransactions.push(...transactions);
        } catch (err) {
          console.warn(`Form 4 parse failed for ${ticker} ${accession}: ${err.message}`);
        }

        await sleep(FETCH_DELAY_MS);

        // Limit filings per ticker to prevent runaway
        if (newTransactions.length > 100) break;
      }

      // Deduplicate amendments
      newTransactions = deduplicateAmendments(newTransactions);

      // Insert into D1
      for (const txn of newTransactions) {
        try {
          await env.DB.prepare(`
            INSERT OR IGNORE INTO insider_trades
            (company_cik, ticker, accession_number, owner_name, owner_cik,
             is_officer, is_director, officer_title,
             transaction_date, filing_date, transaction_code,
             is_open_market, is_derivative,
             shares, price_per_share, total_value, shares_owned_after)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            cik, ticker, txn.accessionNumber,
            txn.ownerName, txn.ownerCik,
            txn.isOfficer ? 1 : 0, txn.isDirector ? 1 : 0, txn.officerTitle,
            txn.transactionDate, txn.filingDate, txn.transactionCode,
            txn.isOpenMarket ? 1 : 0, txn.isDerivative ? 1 : 0,
            txn.shares, txn.pricePerShare, txn.totalValue, txn.sharesOwnedAfter
          ).run();
        } catch { /* ignore duplicates */ }
      }

      // Enforce 40-transaction limit per ticker
      const countRow = await env.DB.prepare(
        'SELECT COUNT(*) as n FROM insider_trades WHERE ticker = ?'
      ).bind(ticker).first();

      if (countRow.n > MAX_TRANSACTIONS_PER_TICKER) {
        await env.DB.prepare(`
          DELETE FROM insider_trades WHERE ticker = ? AND id NOT IN (
            SELECT id FROM insider_trades WHERE ticker = ?
            ORDER BY transaction_date DESC LIMIT ?
          )
        `).bind(ticker, ticker, MAX_TRANSACTIONS_PER_TICKER).run();
      }

      processed++;
      if (newTransactions.length > 0) {
        console.log(`Insider sync: ${ticker} — ${newTransactions.length} new transactions`);
      }
    } catch (err) {
      console.warn(`Insider sync failed for ${ticker}: ${err.message}`);
    }

    await sleep(FETCH_DELAY_MS);
  }

  // Update sync_status
  const newOffset = offset + TICKERS_PER_RUN;
  await env.DB.prepare(
    'INSERT OR REPLACE INTO sync_status (job_name, last_run, last_offset, status, items_processed, error) VALUES (?, datetime(\'now\'), ?, \'complete\', ?, NULL)'
  ).bind('insiders', newOffset, processed).run();

  console.log(`Insider sync: ${processed} tickers processed, offset ${offset}→${newOffset}`);
}
