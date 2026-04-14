// Worker-aware DataPacket assembly.
// Imports the frontend engine, installs a fetch interceptor that rewrites
// self-referencing proxy URLs to direct SEC/EDGAR/Finviz endpoints, then
// overrides gurus/insiders/transcripts with D1/R2 data.
//
// Why interceptor? The frontend engines call apiBase.js URL functions which
// resolve to https://api.thes1sinvesting.com/proxy/sec/... in the Worker build.
// Cloudflare Workers return 522 on self-referencing fetches to custom domains.
// The interceptor rewrites those to direct SEC URLs + adds User-Agent header.

import { assembleDataPacket as _assembleDataPacket } from '../../../src/engines/dataExport.js';

const PROXY_BASE = 'https://api.thes1sinvesting.com';
const SEC_UA = 'Thes1s/1.0 kylehoff@thes1sinvesting.com';

/**
 * Assemble a DataPacket for a given ticker in the Worker environment.
 *
 * @param {string} ticker — Stock ticker symbol
 * @param {object} env — Worker env bindings (env.DB, env.TRANSCRIPTS, env.SEC_USER_AGENT)
 * @returns {Promise<object>} DataPacket object
 */
export async function assembleDataPacket(ticker, env) {
  const upperTicker = ticker.toUpperCase();
  const userAgent = env?.SEC_USER_AGENT || SEC_UA;

  // Install fetch interceptor — rewrites self-referencing proxy URLs to direct endpoints.
  // Workers are single-threaded so no concurrency risk. Restored in finally block.
  const origFetch = globalThis.fetch;
  globalThis.fetch = createInterceptedFetch(origFetch, userAgent);

  let packet;
  try {
    packet = await _assembleDataPacket(upperTicker);
  } finally {
    globalThis.fetch = origFetch;
  }

  // Override fields with D1/R2 data — faster and more reliable than the
  // frontend's browser-path logic which skips D1 (typeof window check)
  // and falls back to slow SEC 13F parsing.
  if (env?.DB) {
    await Promise.allSettled([
      overrideGurus(packet, upperTicker, env.DB),
      overrideInsiders(packet, upperTicker, env.DB),
    ]);
  }

  if (env?.TRANSCRIPTS) {
    await overrideTranscripts(packet, upperTicker, env.TRANSCRIPTS);
  }

  return packet;
}

// ─── Fetch Interceptor ────────────────────────────────────────
// Rewrites proxy URLs to direct endpoints so the Worker doesn't
// self-reference (which returns 522 on custom domains).

function createInterceptedFetch(origFetch, userAgent) {
  return (url, opts = {}) => {
    const urlStr = typeof url === 'string' ? url : url?.url || String(url);

    // SEC proxy → direct to www.sec.gov + User-Agent
    if (urlStr.startsWith(`${PROXY_BASE}/proxy/sec/`)) {
      const directUrl = urlStr.replace(`${PROXY_BASE}/proxy/sec/`, 'https://www.sec.gov/');
      return origFetch(directUrl, withHeaders(opts, { 'User-Agent': userAgent, 'Accept': 'application/json' }));
    }

    // EDGAR proxy → direct to data.sec.gov + User-Agent
    if (urlStr.startsWith(`${PROXY_BASE}/proxy/edgar/`)) {
      const directUrl = urlStr.replace(`${PROXY_BASE}/proxy/edgar/`, 'https://data.sec.gov/');
      return origFetch(directUrl, withHeaders(opts, { 'User-Agent': userAgent, 'Accept': 'application/json' }));
    }

    // Finviz proxy → fetch HTML directly + parse (proxy does HTML→JSON conversion)
    if (urlStr.startsWith(`${PROXY_BASE}/proxy/finviz/`)) {
      const ticker = urlStr.replace(`${PROXY_BASE}/proxy/finviz/`, '');
      return fetchFinvizDirect(origFetch, ticker);
    }

    // Yahoo proxies → skip (IS_NODE already skips Yahoo in dataExport.js)
    // Alpha Vantage proxy → skip (transcript availability overridden by R2)

    // Data endpoints (D1/R2) → self-referencing but these are public routes
    // that don't trigger 522 on workers.dev. Try the workers.dev URL instead.
    if (urlStr.startsWith(`${PROXY_BASE}/data/`)) {
      const directUrl = urlStr.replace(PROXY_BASE, 'https://thes1s-api.kyleghoff707.workers.dev');
      return origFetch(directUrl, opts);
    }

    // All other URLs pass through unchanged
    return origFetch(url, opts);
  };
}

function withHeaders(opts, extraHeaders) {
  return {
    ...opts,
    headers: { ...(opts.headers || {}), ...extraHeaders },
  };
}

// ─── Finviz Direct Fetch + Parse ──────────────────────────────
// Replicates what the Worker proxy does: fetch HTML, regex-parse
// the snapshot table, return a JSON Response object.

async function fetchFinvizDirect(origFetch, ticker) {
  try {
    const res = await origFetch(`https://finviz.com/quote.ashx?t=${ticker}&p=d`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Finviz ${res.status}` }), {
        status: res.status, headers: { 'Content-Type': 'application/json' },
      });
    }
    const html = await res.text();
    const data = parseFinvizSnapshot(html);
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Same regex parser as api/src/routes/proxy.js — extract Finviz snapshot table
function parseFinvizSnapshot(html) {
  const data = {};
  const regex = /<td[^>]*class="snapshot-td2-cp"[^>]*>([^<]+)<\/td>\s*<td[^>]*class="snapshot-td2"[^>]*>(?:<[^>]+>)*([^<]+)/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const label = match[1].trim();
    const value = match[2].trim();
    if (label && value) data[label] = value;
  }
  return data;
}

// ─── D1 Override: Gurus ────────────────────────────────────────

async function overrideGurus(packet, ticker, db) {
  try {
    const rows = await db.prepare(
      `SELECT guru_cik, guru_name, fund_name, report_date, shares,
              value_usd, portfolio_pct, action, issuer
       FROM guru_holdings
       WHERE ticker = ?
       ORDER BY report_date DESC`
    ).bind(ticker).all();

    if (rows.results?.length > 0) {
      packet.gurus = {
        count: rows.results.length,
        holdings: rows.results.map(h => ({
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
        })),
      };
    }
  } catch (e) {
    packet.errors = packet.errors || [];
    packet.errors.push(`d1-gurus: ${e.message}`);
  }
}

// ─── D1 Override: Insiders ─────────────────────────────────────

async function overrideInsiders(packet, ticker, db) {
  try {
    const rows = await db.prepare(
      `SELECT * FROM insider_trades
       WHERE ticker = ?
       ORDER BY transaction_date DESC
       LIMIT 50`
    ).bind(ticker).all();

    if (rows.results?.length > 0) {
      packet.insiders = {
        summary: null,
        recentTransactions: rows.results,
      };
    }
  } catch (e) {
    packet.errors = packet.errors || [];
    packet.errors.push(`d1-insiders: ${e.message}`);
  }
}

// ─── R2 Override: Transcript Availability ──────────────────────

async function overrideTranscripts(packet, ticker, bucket) {
  try {
    const listed = await bucket.list({ prefix: `transcripts/${ticker}/` });
    if (listed.objects?.length > 0) {
      packet.transcriptAvailability = {
        available: true,
        source: 'r2',
        count: listed.objects.length,
      };
    }
  } catch (e) {
    packet.errors = packet.errors || [];
    packet.errors.push(`r2-transcripts: ${e.message}`);
  }
}
