// Taxonomy refresh — keeps S&P 500 company_assignments current.
// Fetches SEC's full company list, detects ticker/name changes and new listings.
//
// Schedule: monthly on the 1st at 2 AM UTC.

const SEC_UA = 'StockAnalyzer/1.0 kylehoff@example.com';

export async function refreshTaxonomy(env) {
  // 1. Fetch SEC company list (all ~13,000 public companies)
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': env.SEC_USER_AGENT || SEC_UA },
  });
  if (!res.ok) {
    console.warn(`Taxonomy refresh: SEC company list fetch failed (${res.status})`);
    return;
  }

  let secData;
  try { secData = await res.json(); } catch { return; }

  // Build CIK→{ticker, name} map from SEC data
  const secByCik = new Map();
  for (const entry of Object.values(secData)) {
    const cik = String(entry.cik_str).padStart(10, '0');
    secByCik.set(cik, { ticker: entry.ticker, name: entry.title });
  }

  // 2. Load existing company_assignments from D1
  const { results: existing } = await env.DB.prepare(
    'SELECT cik, ticker, name FROM company_assignments'
  ).all();

  let updates = 0;

  // 3. Check for ticker/name changes in existing assignments
  for (const row of existing) {
    const sec = secByCik.get(row.cik);
    if (!sec) continue; // Company not in SEC list (may have delisted)

    const changes = [];
    if (sec.ticker !== row.ticker && sec.ticker) {
      changes.push(`ticker: ${row.ticker}→${sec.ticker}`);
    }
    if (sec.name !== row.name && sec.name) {
      changes.push(`name changed`);
    }

    if (changes.length > 0) {
      await env.DB.prepare(
        'UPDATE company_assignments SET ticker = ?, name = ?, updated_at = datetime(\'now\') WHERE cik = ?'
      ).bind(sec.ticker || row.ticker, sec.name || row.name, row.cik).run();
      updates++;
      console.log(`Taxonomy: updated ${row.ticker} — ${changes.join(', ')}`);
    }
  }

  await env.DB.prepare(
    'INSERT OR REPLACE INTO sync_status (job_name, last_run, last_offset, status, items_processed, error) VALUES (?, datetime(\'now\'), 0, \'complete\', ?, NULL)'
  ).bind('taxonomy', updates).run();

  console.log(`Taxonomy refresh complete: ${updates} companies updated`);
}
