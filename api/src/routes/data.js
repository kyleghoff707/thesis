// Shared data routes — transcripts (R2), gurus, insiders, taxonomy (D1)
// All populated by cron jobs. Read-only for users.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleData(request, env, path) {
  // ─── Transcripts (R2) ────────────────────────────────────────

  // GET /data/transcripts/:ticker/:year/Q:quarter
  const transcriptMatch = path.match(/^\/data\/transcripts\/([A-Z]+)\/(\d{4})\/Q(\d)$/);
  if (transcriptMatch) {
    const [, ticker, year, quarter] = transcriptMatch;
    const key = `transcripts/${ticker}/${year}/Q${quarter}.json`;
    const obj = await env.TRANSCRIPTS.get(key);
    if (!obj) return json({ error: 'Transcript not found' }, 404);
    const data = await obj.json();
    return json({ data, meta: { freshness: obj.uploaded, source: 'r2' } });
  }

  // GET /data/transcripts/:ticker — list available transcripts
  const transcriptListMatch = path.match(/^\/data\/transcripts\/([A-Z]+)$/);
  if (transcriptListMatch) {
    const ticker = transcriptListMatch[1];
    const list = await env.TRANSCRIPTS.list({ prefix: `transcripts/${ticker}/` });
    const available = list.objects.map(obj => {
      const parts = obj.key.match(/transcripts\/[A-Z]+\/(\d{4})\/Q(\d)\.json/);
      return parts ? { year: parseInt(parts[1]), quarter: parseInt(parts[2]) } : null;
    }).filter(Boolean);
    return json({ ticker, transcripts: available });
  }

  // ─── Gurus (D1) ──────────────────────────────────────────────

  // GET /data/gurus — latest activity for all gurus (summary only)
  if (path === '/data/gurus') {
    const { results } = await env.DB.prepare(`
      SELECT guru_cik, guru_name, fund_name, report_date, filing_date,
             COUNT(*) as position_count, SUM(value_usd) as total_value
      FROM guru_holdings
      WHERE report_date = (SELECT MAX(report_date) FROM guru_holdings gh2 WHERE gh2.guru_cik = guru_holdings.guru_cik)
      GROUP BY guru_cik
      ORDER BY total_value DESC
    `).all();
    return json({ gurus: results });
  }

  // GET /data/gurus/all — all guru holdings grouped into activities (for frontend)
  if (path === '/data/gurus/all') {
    const { results } = await env.DB.prepare(`
      SELECT guru_cik, guru_name, fund_name, report_date, filing_date,
             issuer, cusip, cusip6, ticker, shares, value_usd,
             portfolio_pct, share_type, action, shares_change, pct_change
      FROM guru_holdings
      WHERE report_date = (
        SELECT MAX(report_date) FROM guru_holdings gh2
        WHERE gh2.guru_cik = guru_holdings.guru_cik
      )
      ORDER BY guru_cik, value_usd DESC
    `).all();

    const byGuru = new Map();
    for (const row of results) {
      if (!byGuru.has(row.guru_cik)) {
        byGuru.set(row.guru_cik, {
          guru: { name: row.guru_name, fund: row.fund_name, cik: row.guru_cik },
          reportDate: row.report_date,
          filingDate: row.filing_date,
          holdings: [],
          totalValue: 0,
        });
      }
      const entry = byGuru.get(row.guru_cik);
      entry.holdings.push({
        issuer: row.issuer,
        cusip: row.cusip,
        cusip6: row.cusip6,
        ticker: row.ticker,
        shares: row.shares,
        value: row.value_usd,
        portfolioPct: row.portfolio_pct,
        shareType: row.share_type,
        action: row.action,
        sharesChange: row.shares_change,
        pctChange: row.pct_change,
      });
      entry.totalValue += row.value_usd;
    }

    const activities = Array.from(byGuru.values()).map(a => ({
      ...a,
      positionCount: a.holdings.length,
      newBuys: a.holdings.filter(h => h.action === 'new').length,
      added: a.holdings.filter(h => h.action === 'added').length,
      reduced: a.holdings.filter(h => h.action === 'reduced').length,
      soldOut: a.holdings.filter(h => h.action === 'sold').length,
      held: a.holdings.filter(h => h.action === 'held').length,
      filing: { reportDate: a.reportDate, filingDate: a.filingDate },
    }));

    return json({ activities });
  }

  // GET /data/gurus/:cik — single guru with holdings
  const guruMatch = path.match(/^\/data\/gurus\/(\d+)$/);
  if (guruMatch) {
    const cik = guruMatch[1];
    const { results } = await env.DB.prepare(
      'SELECT * FROM guru_holdings WHERE guru_cik = ? ORDER BY report_date DESC, value_usd DESC LIMIT 500'
    ).bind(cik).all();
    return json({ holdings: results });
  }

  // GET /data/gurus/ticker/:ticker — which gurus hold this ticker
  const guruTickerMatch = path.match(/^\/data\/gurus\/ticker\/([A-Z]+)$/);
  if (guruTickerMatch) {
    const ticker = guruTickerMatch[1];
    const { results } = await env.DB.prepare(`
      SELECT guru_cik, guru_name, fund_name, report_date, shares, value_usd, portfolio_pct, action
      FROM guru_holdings
      WHERE ticker = ? AND report_date = (SELECT MAX(report_date) FROM guru_holdings gh2 WHERE gh2.guru_cik = guru_holdings.guru_cik)
      ORDER BY value_usd DESC
    `).bind(ticker).all();
    return json({ ticker, holders: results });
  }

  // ─── Insiders (D1) ───────────────────────────────────────────

  // GET /data/insiders/:ticker?years=2
  const insiderMatch = path.match(/^\/data\/insiders\/([A-Z]+)$/);
  if (insiderMatch) {
    const ticker = insiderMatch[1];
    const url = new URL(request.url);
    const years = parseInt(url.searchParams.get('years') || '2');
    const cutoff = new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { results } = await env.DB.prepare(
      'SELECT * FROM insider_trades WHERE ticker = ? AND transaction_date >= ? ORDER BY transaction_date DESC'
    ).bind(ticker, cutoff).all();
    return json({ ticker, trades: results });
  }

  // ─── Taxonomy (D1) ───────────────────────────────────────────

  // GET /data/taxonomy/classify/:ticker
  const classifyMatch = path.match(/^\/data\/taxonomy\/classify\/([A-Z.]+)$/);
  if (classifyMatch) {
    const ticker = classifyMatch[1];
    const row = await env.DB.prepare(
      'SELECT * FROM company_assignments WHERE ticker = ?'
    ).bind(ticker).first();
    if (!row) return json({ error: 'Ticker not found in taxonomy' }, 404);
    return json({ classification: row });
  }

  // GET /data/taxonomy/peers/:ticker?tier=industry
  const peersMatch = path.match(/^\/data\/taxonomy\/peers\/([A-Z.]+)$/);
  if (peersMatch) {
    const ticker = peersMatch[1];
    const url = new URL(request.url);
    const tier = url.searchParams.get('tier') || 'industry';

    const company = await env.DB.prepare(
      'SELECT sector, industry_group, industry FROM company_assignments WHERE ticker = ?'
    ).bind(ticker).first();
    if (!company) return json({ error: 'Ticker not found' }, 404);

    const tierColumn = tier === 'sector' ? 'sector' : tier === 'industryGroup' ? 'industry_group' : 'industry';
    const tierValue = company[tierColumn];

    const { results } = await env.DB.prepare(
      `SELECT cik, ticker, name, sector, industry_group, industry FROM company_assignments WHERE ${tierColumn} = ? AND ticker != ? ORDER BY name LIMIT 100`
    ).bind(tierValue, ticker).all();
    return json({ ticker, tier, peers: results });
  }

  return json({ error: 'Not found' }, 404);
}
