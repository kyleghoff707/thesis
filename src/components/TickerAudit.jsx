import { useState, useCallback } from 'react';
import { C } from '../theme';
import { GURUS, loadCachedActivities, resolveTickersForHoldings } from '../engines/gurus';

export default function TickerAudit() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });

  const run = useCallback(async () => {
    setRunning(true);
    setResults(null);

    const activities = loadCachedActivities();
    if (activities.length === 0) {
      setResults({ error: 'No cached guru data found. Visit the Gurus tab and load data first.' });
      setRunning(false);
      return;
    }

    setProgress({ current: 0, total: activities.length, name: '' });

    let totalHoldings = 0;
    let totalResolved = 0;
    let totalFailed = 0;
    const failures = [];

    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
      const guruName = activity.guru?.name || 'Unknown';
      setProgress({ current: i + 1, total: activities.length, name: guruName });

      if (!activity.holdings || activity.holdings.length === 0) continue;

      // Strip existing tickers to force fresh resolution
      const stripped = activity.holdings
        .filter(h => h.action !== 'sold')
        .map(h => ({ ...h, ticker: undefined }));

      const resolved = await resolveTickersForHoldings(stripped);
      const failed = resolved.filter(h => !h.ticker);
      const succeeded = resolved.filter(h => h.ticker);

      totalHoldings += resolved.length;
      totalResolved += succeeded.length;
      totalFailed += failed.length;

      if (failed.length > 0) {
        failures.push({
          guru: guruName,
          cik: activity.guru?.cik,
          total: resolved.length,
          resolved: succeeded.length,
          failed: failed.map(h => ({
            issuer: h.issuer,
            cusip: h.cusip,
            value: h.value,
            portfolioPct: h.portfolioPct,
          })),
        });
      }
    }

    setResults({
      gurusChecked: activities.length,
      totalHoldings,
      totalResolved,
      totalFailed,
      rate: totalHoldings > 0 ? ((totalResolved / totalHoldings) * 100).toFixed(1) : '0',
      failures,
    });
    setRunning(false);
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Ticker Resolution Audit</h2>
      <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
        Re-resolves all tickers across {GURUS.length} gurus to find holdings that fail to match a ticker symbol.
        Uses cached guru data — visit the Gurus tab first to load data.
      </p>

      <button
        onClick={run}
        disabled={running}
        style={{
          background: C.accent, color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: running ? 'wait' : 'pointer',
          opacity: running ? 0.7 : 1, marginBottom: 20,
        }}
      >
        {running ? `Checking ${progress.current}/${progress.total} — ${progress.name}...` : 'Run Ticker Audit'}
      </button>

      {running && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, background: C.accent,
              width: `${(progress.current / progress.total) * 100}%`,
              transition: 'width 0.2s ease',
            }} />
          </div>
        </div>
      )}

      {results?.error && (
        <div style={{
          padding: '12px 16px', background: 'rgba(220,38,38,0.06)',
          border: '1px solid rgba(220,38,38,0.15)', borderRadius: 8,
          fontSize: 13, color: '#dc2626',
        }}>
          {results.error}
        </div>
      )}

      {results && !results.error && (
        <>
          {/* Summary stats */}
          <div style={{
            display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap',
            padding: '12px 16px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
          }}>
            <Stat label="Gurus" value={results.gurusChecked} color={C.text} />
            <Stat label="Holdings" value={results.totalHoldings} color={C.text} />
            <Stat label="Resolved" value={results.totalResolved} color="#16a34a" />
            <Stat label="Failed" value={results.totalFailed} color={results.totalFailed > 0 ? '#dc2626' : C.textMuted} />
            <Stat label="Rate" value={results.rate + '%'} color={parseFloat(results.rate) >= 99 ? '#16a34a' : parseFloat(results.rate) >= 95 ? '#ca8a04' : '#dc2626'} />
          </div>

          {/* Failures */}
          {results.failures.length > 0 ? (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#dc2626', marginBottom: 10 }}>
                Unresolved ({results.totalFailed} across {results.failures.length} gurus)
              </h3>
              {results.failures.map(f => (
                <div key={f.cik} style={{
                  padding: '10px 12px', marginBottom: 6, borderRadius: 6,
                  background: 'rgba(220,38,38,0.04)',
                  border: '1px solid rgba(220,38,38,0.12)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{f.guru}</span>
                    <span style={{ fontSize: 11, color: C.textMuted }}>
                      {f.resolved}/{f.total} resolved ({f.failed.length} failed)
                    </span>
                  </div>
                  {f.failed.map((h, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'baseline', gap: 10,
                      fontSize: 12, color: C.textSecondary, padding: '2px 0 2px 12px',
                    }}>
                      <span style={{ fontWeight: 500, color: C.text, minWidth: 200 }}>{h.issuer}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.textMuted, minWidth: 90 }}>
                        {h.cusip}
                      </span>
                      <span style={{ minWidth: 80 }}>
                        {h.portfolioPct > 0 ? h.portfolioPct.toFixed(2) + '%' : '—'}
                      </span>
                      <span style={{ fontSize: 11, color: C.textMuted }}>
                        CUSIP prefix: {(h.cusip || '').slice(0, 6)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{
                marginTop: 16, padding: '10px 14px', borderRadius: 6,
                background: C.bgCard, border: `1px solid ${C.border}`,
                fontSize: 12, color: C.textMuted, lineHeight: 1.6,
              }}>
                <strong style={{ color: C.text }}>To fix a missing ticker:</strong> Add the 6-char CUSIP prefix
                to <code style={{ fontSize: 11, padding: '1px 4px', background: C.bg, borderRadius: 3 }}>
                CUSIP_TICKER_OVERRIDES</code> in{' '}
                <code style={{ fontSize: 11, padding: '1px 4px', background: C.bg, borderRadius: 3 }}>
                src/engines/gurus.js</code>.
                Example: <code style={{ fontSize: 11, padding: '1px 4px', background: C.bg, borderRadius: 3 }}>
                'ABC123': 'TICK'</code>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '16px', borderRadius: 8, textAlign: 'center',
              background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.15)',
              fontSize: 14, fontWeight: 600, color: '#16a34a',
            }}>
              All tickers resolved successfully!
            </div>
          )}
        </>
      )}

      {/* Troubleshooting guide — always visible */}
      <TroubleshootingGuide />
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 55 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

const code = { fontSize: 11, padding: '2px 5px', borderRadius: 3, fontFamily: 'monospace' };

function TroubleshootingGuide() {
  return (
    <div style={{
      marginTop: 40, paddingTop: 28, borderTop: `1px solid ${C.border}`,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>
        Troubleshooting Guide
      </h3>

      {/* When to run */}
      <GuideSection title="When to Run This Audit" number="1">
        <li>After loading guru data for the first time (Gurus tab, "Load All")</li>
        <li>After a new quarterly 13F filing cycle (usually mid-February, mid-May, mid-August, mid-November — about 45 days after quarter end)</li>
        <li>If you notice a holding in a guru portfolio showing an issuer name instead of a ticker symbol (e.g., "OCCIDENTAL PETE CORP" instead of "OXY")</li>
        <li>After updating the app code (to verify nothing regressed)</li>
      </GuideSection>

      {/* Understanding failures */}
      <GuideSection title="Understanding the Results" number="2">
        <li><strong>99%+ rate is normal.</strong> A small number of failures is expected — ETFs, index funds, foreign ADRs, and private trusts don't appear in EDGAR's US equity ticker index.</li>
        <li><strong>ETFs/Funds</strong> (iShares, Vanguard, SPDR, etc.) — these are not individual stocks and won't resolve. Ignore them.</li>
        <li><strong>Foreign/ADR</strong> (e.g., "Bayer AG Spons ADR", Canadian companies) — foreign companies trade under different rules. Most won't resolve. Ignore them unless it's a major US-listed ADR.</li>
        <li><strong>US stocks that should resolve but don't</strong> — this is the fixable category. Usually caused by the SEC 13F filing using a different name than EDGAR (abbreviations, compound words, location suffixes).</li>
      </GuideSection>

      {/* How to fix */}
      <GuideSection title="How to Fix a Missing Ticker" number="3">
        <p style={{ marginBottom: 10 }}>
          If you see a US stock that should have a ticker but doesn't, follow these steps:
        </p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 10 }}>
            <strong>Get the CUSIP prefix.</strong> It's shown in the audit results next to each failed holding.
            It's the first 6 characters of the full CUSIP number (e.g., <code style={{ ...code, background: C.bg }}>829933</code> from <code style={{ ...code, background: C.bg }}>829933100</code>).
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>Find the correct ticker symbol.</strong> Search the company name on any financial site
            (Yahoo Finance, Google Finance, etc.) to confirm the ticker. For example, "SIRIUSXM HOLDINGS INC"
            trades as <code style={{ ...code, background: C.bg }}>SIRI</code>.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>Open the file</strong> <code style={{ ...code, background: C.bg }}>src/engines/gurus.js</code> in
            any text editor. Search for <code style={{ ...code, background: C.bg }}>CUSIP_TICKER_OVERRIDES</code> — it's
            near the top of the "Ticker Resolution" section (around line 900).
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>Add one line</strong> inside the curly braces. Format:
            <div style={{
              marginTop: 6, padding: '8px 12px', borderRadius: 6,
              background: C.bg, border: `1px solid ${C.border}`,
              fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
            }}>
              {'\'829933\': \'SIRI\',   // SiriusXM Holdings'}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              The format is: 6-char CUSIP prefix (in quotes), colon, ticker symbol (in quotes), comma.
              The comment after // is optional but helpful for future reference.
            </div>
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>Save the file.</strong> If the dev server is running, the change takes effect immediately.
            Clear the guru's cached data (or all guru caches) by running "Load All" on the Gurus tab again.
          </li>
          <li>
            <strong>Re-run this audit</strong> to confirm the ticker now resolves.
          </li>
        </ol>
      </GuideSection>

      {/* Why tickers fail */}
      <GuideSection title="Why Tickers Fail to Resolve" number="4">
        <p style={{ marginBottom: 8 }}>
          The app resolves tickers through a 4-tier matching system. A failure means all 4 tiers couldn't find a match:
        </p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 6 }}>
            <strong>CUSIP cache</strong> — checks if this CUSIP was already resolved in a previous session (stored in localStorage).
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>CUSIP overrides</strong> — checks the hardcoded CUSIP_TICKER_OVERRIDES map for known edge cases (the map you edit manually).
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Exact name match</strong> — normalizes the 13F issuer name (expands SEC abbreviations like PETE→PETROLEUM, strips suffixes like INC/CORP, normalizes punctuation) and looks for an exact match in EDGAR's ticker index.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Prefix match</strong> — checks if the normalized 13F name starts with (or is a prefix of) an EDGAR name. Catches cases like "ALPHABET" matching "ALPHABET INC CL A".
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Token overlap</strong> — splits both names into words, finds the overlap, and accepts if 50%+ of tokens match. Catches word-order differences ("DISNEY WALT" vs "WALT DISNEY") and dropped connector words ("BANK AMERICA" vs "BANK OF AMERICA").
          </li>
        </ol>
        <p style={{ marginTop: 10 }}>
          Common reasons all tiers fail:
        </p>
        <ul style={{ paddingLeft: 20, margin: '6px 0 0 0' }}>
          <li style={{ marginBottom: 4 }}><strong>Compound names</strong> — "SIRIUSXM" (one word) vs "Sirius XM" (two words in EDGAR)</li>
          <li style={{ marginBottom: 4 }}><strong>Brand vs legal name</strong> — "WABTEC" (brand) vs "Westinghouse Air Brake Technologies" (legal name in EDGAR)</li>
          <li style={{ marginBottom: 4 }}><strong>Location suffixes</strong> — "TOWNEBANK PORTSMOUTH VA" adds a city/state the EDGAR name doesn't have</li>
          <li style={{ marginBottom: 4 }}><strong>Spaced initials</strong> — "F N B CORP" with spaces between single letters vs "FNB" in EDGAR</li>
          <li style={{ marginBottom: 4 }}><strong>ETFs/funds</strong> — "ISHARES TR" is a trust wrapper, not a single stock in EDGAR's equity index</li>
          <li style={{ marginBottom: 4 }}><strong>Foreign/OTC</strong> — Canadian stocks, ADRs, and micro-cap OTC names often aren't in EDGAR's ticker index</li>
        </ul>
      </GuideSection>

      {/* SEC abbreviations */}
      <GuideSection title="Adding New SEC Abbreviations" number="5">
        <p style={{ marginBottom: 8 }}>
          If you see a pattern where the 13F uses a shortened word (not a one-off company name issue), you can add it
          to the abbreviation expansion map so ALL gurus benefit automatically. This is better than a CUSIP override
          when the abbreviation is used across multiple companies.
        </p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            Open <code style={{ ...code, background: C.bg }}>src/engines/gurus.js</code> and search
            for <code style={{ ...code, background: C.bg }}>SEC_ABBREVIATIONS</code>.
          </li>
          <li style={{ marginBottom: 8 }}>
            Add a new entry. Format:
            <div style={{
              marginTop: 6, padding: '8px 12px', borderRadius: 6,
              background: C.bg, border: `1px solid ${C.border}`,
              fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
            }}>
              ABBR: 'FULL WORD',
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              Example: the SEC writes "PETE" for "PETROLEUM", so the map
              has <code style={{ ...code, background: C.bg }}>PETE: 'PETROLEUM'</code>.
              Both sides are uppercase. The expansion runs on every issuer name before matching.
            </div>
          </li>
          <li>
            Save the file and re-run the audit. Any holding that was failing because of that abbreviation
            should now resolve automatically — across all gurus, current and future.
          </li>
        </ol>
      </GuideSection>

      {/* Cache clearing */}
      <GuideSection title="Clearing Cached Data" number="6">
        <p style={{ marginBottom: 8 }}>
          The app caches ticker resolutions so it doesn't re-resolve every time. If you fix a ticker
          but the old (wrong) result is still showing, you may need to clear the cache:
        </p>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Easiest: re-fetch the guru.</strong> Go to the Gurus tab, find the guru in the Directory,
            and click their name to reload their portfolio. The app will re-resolve tickers on fetch.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Nuclear option: clear all guru caches.</strong> Open browser DevTools (Cmd+Option+I),
            go to the Console tab, and paste:
            <div style={{
              marginTop: 6, padding: '8px 12px', borderRadius: 6,
              background: C.bg, border: `1px solid ${C.border}`,
              fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
            }}>
              {`Object.keys(localStorage).filter(k => k.startsWith('guru-') || k.startsWith('sa-cusip-ticker')).forEach(k => localStorage.removeItem(k));`}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              Then reload the page and go to Gurus → "Load All" to re-fetch everything with fresh ticker resolution.
            </div>
          </li>
        </ul>
      </GuideSection>

      {/* File reference */}
      <GuideSection title="Quick File Reference" number="7">
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px',
          fontSize: 12,
        }}>
          <span style={{ fontWeight: 600, color: C.text }}>Ticker resolution engine</span>
          <code style={{ ...code, background: C.bg }}>src/engines/gurus.js</code>
          <span style={{ fontWeight: 600, color: C.text }}>CUSIP overrides map</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>CUSIP_TICKER_OVERRIDES</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>SEC abbreviation map</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>SEC_ABBREVIATIONS</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>Name normalization</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>function normalizeIssuer</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>CLI audit script</span>
          <code style={{ ...code, background: C.bg }}>validation/scripts/audit-ticker-resolution.mjs</code>
          <span style={{ fontWeight: 600, color: C.text }}>Guru list (43 CIKs)</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>export const GURUS</code></span>
        </div>
      </GuideSection>
    </div>
  );
}

function GuideSection({ title, number, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h4 style={{
        fontSize: 13, fontWeight: 600, color: C.accent, marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', background: C.accent, color: '#fff',
          fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>{number}</span>
        {title}
      </h4>
      <div style={{
        fontSize: 12, color: C.textSecondary, lineHeight: 1.7,
        paddingLeft: 28,
      }}>
        {Array.isArray(children) || (children && children.type === 'li')
          ? <ul style={{ paddingLeft: 16, margin: 0 }}>{children}</ul>
          : children
        }
      </div>
    </div>
  );
}
