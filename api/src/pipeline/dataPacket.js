// DataPacket server assembly — builds the same DataPacket as dataExport.js
// but using Worker bindings (D1, R2, outbound fetch) instead of browser APIs.
//
// Data sources:
//   - D1: gurus, insiders, taxonomy/peers, company info
//   - R2: transcripts
//   - SEC EDGAR: financials (XBRL), company info, filings, compensation
//   - Finviz (via Worker proxy): analyst estimates, price ratios
//   - Yahoo (via Worker proxy): prices
//
// Pure computation engines are imported directly from src/engines/
// (they're pure functions with no browser deps).

const SEC_BASE = 'https://data.sec.gov';
const SEC_WWW = 'https://www.sec.gov';
const SEC_HEADERS = {
  'User-Agent': 'Thes1s/1.0 (contact@thes1sinvesting.com)',
  'Accept': 'application/json',
};

// ─── Main Assembly ──────────────────────────────────────────

/**
 * Assemble a complete DataPacket for a given ticker using Worker bindings.
 * Mirrors the shape of dataExport.js assembleDataPacket().
 *
 * @param {string} ticker
 * @param {object} env — Worker env bindings (DB, TRANSCRIPTS, etc.)
 * @returns {Promise<object>} DataPacket
 */
export async function assembleDataPacketServer(ticker, env) {
  const errors = [];
  const t = ticker.toUpperCase();

  // ── Step 1: Core data (parallel) ──

  const [companyInfoResult, financialsResult, classResult] = await Promise.allSettled([
    safeCall(() => fetchCompanyInfoSEC(t), 'companyInfo', errors),
    safeCall(() => fetchEdgarFinancialsSEC(t), 'financials', errors),
    safeCall(() => fetchClassification(t, env), 'classification', errors),
  ]);

  const companyInfo = companyInfoResult.value ?? null;
  const statements = financialsResult.value ?? null;
  const classification = classResult.value ?? { industryType: 'standard', sector: null, industryGroup: null, industry: null };

  // ── Step 2: Computed metrics (parallel, depend on financials) ──

  let growthRates = null, returnMetrics = null, debtMetrics = null, fcf = null, keyMetrics = null;

  if (statements) {
    try {
      // Import computation engines dynamically to avoid import chain issues
      // These are pure functions with no browser deps
      const [grMod, rmMod, fcfMod, kmMod] = await Promise.all([
        import('../../../src/engines/growthRates.js'),
        import('../../../src/engines/returnMetrics.js'),
        import('../../../src/engines/freeCashFlow.js'),
        import('../../../src/engines/keyMetrics.js'),
      ]);

      const step2 = await Promise.allSettled([
        safeCall(() => grMod.computeAllGrowthRates(statements), 'growthRates', errors),
        safeCall(() => rmMod.computeReturnMetrics(statements), 'returnMetrics', errors),
        safeCall(() => rmMod.computeDebtMetrics(statements), 'debtMetrics', errors),
        safeCall(() => fcfMod.computeFreeCashFlow(statements), 'freeCashFlow', errors),
        safeCall(() => kmMod.computeKeyMetrics(statements), 'keyMetrics', errors),
      ]);

      growthRates = step2[0].value ?? null;
      returnMetrics = step2[1].value ?? null;
      debtMetrics = step2[2].value ?? null;
      fcf = step2[3].value ?? null;
      keyMetrics = step2[4].value ?? null;
    } catch (err) {
      errors.push(`computeMetrics: ${err.message}`);
    }
  }

  // ── Step 3: External data (parallel) ──

  const step3 = await Promise.allSettled([
    safeCall(() => fetchGurusD1(t, env), 'gurus', errors),
    safeCall(() => fetchInsidersD1(t, env), 'insiders', errors),
    safeCall(() => fetchCompensationSEC(t), 'compensation', errors),
    safeCall(() => fetchPeersD1(t, classification, env), 'peers', errors),
    safeCall(() => fetchFinvizProxy(t, env), 'finviz', errors),
    safeCall(() => fetchPricesProxy(t, env), 'prices', errors),
    safeCall(() => fetchFilingsSEC(t), 'filings', errors),
  ]);

  const gurus = step3[0].value ?? null;
  const insiders = step3[1].value ?? null;
  const compensation = step3[2].value ?? null;
  const peers = step3[3].value ?? null;
  const finviz = step3[4].value ?? null;
  const prices = step3[5].value ?? null;
  const filings = step3[6].value ?? null;

  // Analyst estimates from Finviz (Yahoo skipped in Worker — no crumb auth)
  let analystEstimates = null;
  if (finviz?.epsNext5Y != null) {
    analystEstimates = {
      earningsTrend: null,
      financialData: null,
      recommendationTrend: null,
      growthRate: finviz.epsNext5Y,
      priceTargets: finviz.targetPrice ? { mean: finviz.targetPrice } : null,
      recommendation: finviz.recom ? { score: finviz.recom } : null,
      _source: 'finviz',
      _fetchedAt: Date.now(),
    };
  }

  // ── Step 4: Peer metrics (depends on peers + financials) ──

  let peerMetrics = null;
  if (peers && peers.length > 0 && statements) {
    try {
      const peerCIKs = new Set(peers.map(p => Number(p.cik)));
      const latestYear = statements.years?.[0] || new Date().getFullYear();
      const { computePeerScores } = await import('../../../src/engines/peerMetrics.js');
      const raw = await computePeerScores(peerCIKs, latestYear);
      peerMetrics = raw instanceof Map ? Object.fromEntries(raw) : raw;
    } catch (err) {
      errors.push(`peerMetrics: ${err.message}`);
    }
  }

  // ── Step 5: Composite scores ──

  let moatScore = null, managementScore = null, ruleOneScoreResult = null;
  try {
    const { computeMoatScore, computeManagementScore, computeRuleOneScore } =
      await import('../../../src/engines/ruleOneScore.js');
    if (growthRates) moatScore = computeMoatScore(growthRates);
    if (returnMetrics && debtMetrics) {
      managementScore = computeManagementScore(returnMetrics.averages, debtMetrics);
    }
    if (moatScore && managementScore) {
      ruleOneScoreResult = computeRuleOneScore(moatScore.moatScore, managementScore.managementScore);
    }
  } catch (err) {
    errors.push(`ruleOneScore: ${err.message}`);
  }

  // ── Derived fields ──

  const derivedDebt = deriveDebtMetrics(statements, fcf);
  const currentPrice = prices?.[0]?.close ?? finviz?.price ?? null;

  const ttm = statements?.ttm || null;
  if (ttm) {
    if (ttm.cashFlow?.net_cash_flow_from_operating_activities && !ttm.cashFlow.operating_cash_flow) {
      ttm.cashFlow.operating_cash_flow = ttm.cashFlow.net_cash_flow_from_operating_activities;
    }
    if (ttm.balance && !ttm.balance.book_value_per_share) {
      const equity = ttm.balance.stockholders_equity;
      const shares = ttm.balance.common_shares_outstanding;
      if (equity && shares) ttm.balance.book_value_per_share = equity / shares;
    }
  }

  // ── Build caveats ──

  const caveats = [];
  const type = classification.industryType;
  if (type === 'reit') {
    caveats.push('FFO is derived (not tagged in XBRL) — approximate for post-2018 years.');
    caveats.push('AFFO maintenance capex hardcoded at 15% of total capex.');
  }
  if (type === 'insurance') caveats.push('Insurance float is approximated from XBRL balance sheet items.');
  if (type === 'bank') caveats.push('Use NIM, efficiency ratio, and provision for credit losses as primary metrics.');

  // ── Assemble ──

  return {
    ticker: t,
    companyInfo,
    classification,
    currentPrice,
    financials: statements ? trimFinancials(statements, 10) : null,
    ttm,
    growthRates,
    returnMetrics: returnMetrics || null,
    debtMetrics: derivedDebt || debtMetrics || null,
    fcf,
    keyMetrics,
    ruleOneScore: {
      moat: moatScore?.moatScore ?? null,
      management: managementScore?.managementScore ?? null,
      composite: ruleOneScoreResult ?? null,
    },
    gurus,
    insiders,
    compensation,
    peers,
    peerMetrics: peerMetrics || null,
    analystEstimates,
    prices: prices ? { data: prices, currentPrice } : null,
    transcriptAvailability: { available: true, source: 'r2' },
    filings,
    caveats,
    errors: errors.length > 0 ? errors : undefined,
    assembledAt: new Date().toISOString(),
  };
}

// ─── SEC EDGAR Fetchers ─────────────────────────────────────

async function secFetch(url) {
  const resp = await fetch(url, { headers: SEC_HEADERS });
  if (!resp.ok) throw new Error(`SEC ${resp.status}: ${url}`);
  return resp.json();
}

async function fetchCompanyInfoSEC(ticker) {
  // Get CIK from ticker map
  const tickers = await secFetch(`${SEC_BASE}/files/company_tickers.json`);
  let cik = null, name = null, exchange = null;
  for (const entry of Object.values(tickers)) {
    if (entry.ticker === ticker) {
      cik = String(entry.cik_str).padStart(10, '0');
      name = entry.title;
      break;
    }
  }
  if (!cik) return null;

  // Get company submissions for SIC, fiscal year, etc.
  const subs = await secFetch(`${SEC_BASE}/submissions/CIK${cik}.json`);
  return {
    ticker,
    name: subs.name || name,
    sic: subs.sic || '',
    sicDescription: subs.sicDescription || '',
    exchange: subs.exchanges?.[0] || exchange || '',
    cik: cik.replace(/^0+/, ''),
    stateOfIncorporation: subs.stateOfIncorporation || '',
    fiscalYearEnd: subs.fiscalYearEnd || '',
  };
}

async function fetchEdgarFinancialsSEC(ticker) {
  // This is the most complex engine — ~2000 lines in edgarFinancials.js
  // For now, dynamically import the existing engine.
  // It uses fetch() internally which works in Workers for SEC URLs.
  // The engine uses apiBase.js for URL resolution — we need to handle that.
  //
  // TODO: This import chain pulls in apiBase.js, config.js, cacheStore.js
  // which have browser dependencies. For now, we'll try the dynamic import
  // and catch failures. Step 4 (engine adapter) will properly break the chain.
  try {
    const { fetchEdgarStatements } = await import('../../../src/engines/edgarFinancials.js');
    return await fetchEdgarStatements(ticker);
  } catch (err) {
    // Expected to fail until Step 4 adapter is built
    throw new Error(`edgarFinancials import failed (needs adapter): ${err.message}`);
  }
}

async function fetchCompensationSEC(ticker) {
  // Similar to above — complex HTML parsing engine
  try {
    const { fetchCompensation } = await import('../../../src/engines/compensation.js');
    return await fetchCompensation(ticker);
  } catch (err) {
    throw new Error(`compensation import failed (needs adapter): ${err.message}`);
  }
}

async function fetchFilingsSEC(ticker) {
  const info = await fetchCompanyInfoSEC(ticker);
  if (!info?.cik) return null;

  const cik = info.cik.padStart(10, '0');
  const subs = await secFetch(`${SEC_BASE}/submissions/CIK${cik}.json`);
  const recent = subs.filings?.recent;
  if (!recent) return null;

  const FORMS = new Set(['10-K', '10-Q', '8-K', 'DEF 14A']);
  const MAX = 20;
  const counts = {};
  const results = [];

  for (let i = 0; i < (recent.form?.length || 0); i++) {
    const form = recent.form[i];
    if (!FORMS.has(form)) continue;
    counts[form] = (counts[form] || 0) + 1;
    if (counts[form] > MAX) continue;
    results.push({
      form,
      filingDate: recent.filingDate[i],
      accessionNumber: recent.accessionNumber[i],
      primaryDocument: recent.primaryDocument?.[i] || '',
    });
  }

  return results.length > 0 ? results : null;
}

// ─── D1 Fetchers ────────────────────────────────────────────

async function fetchGurusD1(ticker, env) {
  const rows = await env.DB.prepare(
    `SELECT guru_cik, guru_name, fund_name, issuer, shares, value_usd,
            portfolio_pct, action, report_date
     FROM guru_holdings WHERE ticker = ?
     ORDER BY report_date DESC LIMIT 50`
  ).bind(ticker).all();

  if (!rows.results?.length) return { count: 0, holdings: [] };

  const holders = rows.results.map(h => ({
    guru: { name: h.guru_name, cik: h.guru_cik, fund: h.fund_name },
    positions: [{
      issuer: h.issuer || ticker,
      ticker,
      shares: h.shares,
      value: h.value_usd,
      portfolioPct: h.portfolio_pct,
      action: h.action,
    }],
    totalPortfolioValue: null,
  }));

  // Deduplicate by guru CIK (take most recent)
  const seen = new Set();
  const unique = holders.filter(h => {
    if (seen.has(h.guru.cik)) return false;
    seen.add(h.guru.cik);
    return true;
  });

  return { count: unique.length, holdings: unique };
}

async function fetchInsidersD1(ticker, env) {
  const rows = await env.DB.prepare(
    `SELECT owner_name, owner_cik, is_officer, is_director, officer_title,
            transaction_date, transaction_code, is_open_market, is_derivative,
            shares, price_per_share, total_value, shares_owned_after
     FROM insider_trades WHERE ticker = ?
     ORDER BY transaction_date DESC LIMIT 100`
  ).bind(ticker).all();

  const txns = (rows.results || []).map(r => ({
    ownerName: r.owner_name,
    ownerCik: r.owner_cik,
    isOfficer: !!r.is_officer,
    isDirector: !!r.is_director,
    officerTitle: r.officer_title,
    transactionDate: r.transaction_date,
    transactionCode: r.transaction_code,
    isOpenMarket: !!r.is_open_market,
    isDerivative: !!r.is_derivative,
    shares: r.shares,
    pricePerShare: r.price_per_share,
    totalValue: r.total_value,
    sharesOwnedAfter: r.shares_owned_after,
  }));

  // Compute summary
  const buys = txns.filter(t => t.transactionCode === 'P');
  const sells = txns.filter(t => t.transactionCode === 'S');

  return {
    summary: {
      totalBuys: buys.length,
      totalSells: sells.length,
      netBuyers: new Set(buys.map(t => t.ownerCik)).size,
      netSellers: new Set(sells.map(t => t.ownerCik)).size,
    },
    recentTransactions: txns.slice(0, 50),
  };
}

async function fetchPeersD1(ticker, classification, env) {
  const rows = await env.DB.prepare(
    `SELECT cik, ticker, name FROM company_assignments
     WHERE industry = ? AND ticker != ? AND status = 'active'
     ORDER BY is_sp500 DESC, name ASC LIMIT 20`
  ).bind(classification.industry || '', ticker).all();

  return rows.results?.length > 0 ? rows.results : [];
}

async function fetchClassification(ticker, env) {
  const row = await env.DB.prepare(
    `SELECT sector, industry_group, industry, sic_code FROM company_assignments WHERE ticker = ?`
  ).bind(ticker).first();

  if (!row) return { industryType: 'standard', sector: null, industryGroup: null, industry: null };

  // Classify industry type from SIC code
  const sic = row.sic_code || '';
  let industryType = 'standard';
  if (/^6[0-2]/.test(sic)) industryType = 'bank';
  else if (/^63/.test(sic)) industryType = 'insurance';
  else if (/^65/.test(sic)) industryType = 'reit';

  return {
    industryType,
    sicCode: sic,
    sector: row.sector,
    industryGroup: row.industry_group,
    industry: row.industry,
  };
}

// ─── Proxy Fetchers (via Worker's own proxy routes) ─────────

async function fetchFinvizProxy(ticker, env) {
  // Call the Worker's own proxy handler directly (internal fetch)
  // Finviz proxy is at /proxy/finviz/:ticker on the Worker itself
  try {
    const resp = await fetch(`https://finviz.com/quote.ashx?t=${ticker}&ty=c&ta=1&p=d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!resp.ok) return null;

    const html = await resp.text();
    // Parse key fields from Finviz snapshot table using regex
    // (DOMParser not available in Workers without linkedom)
    const extract = (label) => {
      const re = new RegExp(`>${label}</td><td[^>]*class="snapshot-td2"[^>]*><b>([^<]+)</b>`, 'i');
      const m = html.match(re);
      return m ? m[1].trim() : null;
    };

    const parsePct = (v) => v && v !== '-' ? parseFloat(v.replace('%', '')) : null;
    const parseNum = (v) => v && v !== '-' ? parseFloat(v.replace(/,/g, '')) : null;

    return {
      epsNext5Y: parsePct(extract('EPS next 5Y')),
      epsThisY: parsePct(extract('EPS this Y')),
      epsNextY: parsePct(extract('EPS next Y')),
      epsPast5Y: parsePct(extract('EPS past 5Y')),
      salesPast5Y: parsePct(extract('Sales past 5Y')),
      forwardPE: parseNum(extract('Forward P/E')),
      peg: parseNum(extract('PEG')),
      targetPrice: parseNum(extract('Target Price')),
      recom: parseNum(extract('Recom')),
      shortFloat: parsePct(extract('Short Float')),
      insiderOwnership: parsePct(extract('Insider Own')),
      instOwnership: parsePct(extract('Inst Own')),
      price: parseNum(extract('Price')),
      roe: parsePct(extract('ROE')),
      roic: parsePct(extract('ROIC')),
      roa: parsePct(extract('ROA')),
      _fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function fetchPricesProxy(ticker, env) {
  // Use Yahoo Chart via Worker's proxy route
  try {
    const now = Math.floor(Date.now() / 1000);
    const tenYearsAgo = now - 10 * 365.25 * 24 * 3600;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${Math.floor(tenYearsAgo)}&period2=${now}&interval=1d&includeAdjustedClose=true`;

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!resp.ok) return null;

    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp) return null;

    const timestamps = result.timestamp;
    const quotes = result.indicators?.quote?.[0] || {};
    const adjClose = result.indicators?.adjclose?.[0]?.adjclose;

    const prices = [];
    for (let i = timestamps.length - 1; i >= 0 && prices.length < 2600; i--) {
      if (quotes.close?.[i] != null) {
        prices.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          close: quotes.close[i],
          open: quotes.open?.[i] ?? null,
          high: quotes.high?.[i] ?? null,
          low: quotes.low?.[i] ?? null,
          adjclose: adjClose?.[i] ?? null,
          volume: quotes.volume?.[i] ?? null,
        });
      }
    }

    return prices; // Most recent first
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────

function trimFinancials(statements, maxYears) {
  const years = (statements.years || []).slice(0, maxYears);
  const pick = (obj) => {
    if (!obj) return {};
    const out = {};
    for (const y of years) { if (obj[y] !== undefined) out[y] = obj[y]; }
    return out;
  };
  return {
    years,
    income: pick(statements.income),
    balance: pick(statements.balance),
    cashFlow: pick(statements.cashFlow),
  };
}

function deriveDebtMetrics(statements, fcf) {
  if (!statements) return null;
  const latestYear = statements.years?.[0];
  if (!latestYear) return null;

  const balance = statements.balance?.[latestYear] || {};
  const income = statements.income?.[latestYear] || {};
  const cf = statements.cashFlow?.[latestYear] || {};

  const totalDebt = balance.total_debt || 0;
  const cash = balance.cash_and_short_term_investments || balance.cash || 0;
  const netDebt = totalDebt - cash;
  const netIncome = income.net_income_loss || 0;
  const freeCashFlow = cf.free_cash_flow || 0;

  return {
    totalDebt,
    cash,
    netDebt,
    netDebtToEarnings: netIncome !== 0 ? netDebt / netIncome : null,
    netDebtToFCF: freeCashFlow !== 0 ? netDebt / freeCashFlow : null,
    isNetCash: netDebt < 0,
  };
}

async function safeCall(fn, label, errors) {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${err.message}`);
    return null;
  }
}
