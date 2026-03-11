import { useState, useCallback, useRef } from 'react';
import { C } from '../theme';
import { fetchEdgarStatements, fetchEdgarQuarterly } from '../engines/edgarFinancials';
import { validateCompany } from '../engines/validation';
import VALIDATION_COMPANIES from '../data/validationCompanies';

const STATUS_COLORS = {
  PASS: { bg: C.scoreBgGreen, text: '#fff' },
  WARNINGS: { bg: C.scoreBgYellow, text: '#fff' },
  FAIL: { bg: C.scoreBgRed, text: '#fff' },
  SKIP: { bg: C.badge, text: C.badgeText },
};

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || { bg: C.badge, text: C.badgeText };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 700,
      background: colors.bg,
      color: colors.text,
    }}>
      {status}
    </span>
  );
}

function IdentityRow({ check }) {
  const color = check.status === 'pass' ? C.green : check.status === 'fail' ? C.red : C.textMuted;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, color, padding: '2px 0' }}>
      <span style={{ width: 16 }}>{check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '–'}</span>
      <span style={{ flex: 1 }}>{check.name}</span>
      {check.diff != null && <span style={{ opacity: 0.7 }}>${(check.diff / 1e6).toFixed(1)}M diff</span>}
    </div>
  );
}

function FramesRow({ field, yearData }) {
  const years = Object.keys(yearData).sort((a, b) => b - a);
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 2 }}>{field}</div>
      {years.map(yr => {
        const d = yearData[yr];
        const color = d.status === 'match' ? C.green : d.status === 'warning' ? C.yellow : d.status === 'error' ? C.red : C.textMuted;
        return (
          <div key={yr} style={{ display: 'flex', gap: 8, fontSize: 11, color, paddingLeft: 16 }}>
            <span style={{ width: 40 }}>{yr}</span>
            <span style={{ width: 60, textAlign: 'right' }}>{d.status}</span>
            {d.pctDiff != null && <span style={{ opacity: 0.7 }}>{d.pctDiff}%</span>}
          </div>
        );
      })}
    </div>
  );
}

function CompanyResult({ result, expanded, onToggle }) {
  const s = result.summary;
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
          cursor: 'pointer', background: expanded ? C.bgHover : 'transparent',
          fontSize: 13,
        }}
      >
        <span style={{ width: 60, fontWeight: 700 }}>{result.ticker}</span>
        <StatusBadge status={s.overallStatus} />
        <span style={{ flex: 1, color: C.textSecondary, fontSize: 11 }}>
          Identity {s.identityPassRate}% · Completeness {s.completenessScore}% · Derived {s.derivedMatchRate}% · Frames {s.framesMatchRate}%
          {s.yoyFlagsCount > 0 && ` · ${s.yoyFlagsCount} YoY flags`}
          {s.retainedEarningsWarnings > 0 && ` · ${s.retainedEarningsWarnings} RE warnings`}
          {s.quarterlyRollupMatchRate != null && ` · Qtr ${s.quarterlyRollupMatchRate}%`}
        </span>
        <span style={{ color: C.textMuted, fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '8px 12px 12px 24px', background: C.bgCard }}>
          {/* Identity Checks — show only first year in detail, summary for rest */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>Accounting Identities</div>
            {result.years.slice(0, 3).map(yr => (
              <div key={yr}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textSecondary, marginTop: 4 }}>{yr}</div>
                {(result.identityChecks[yr] || []).map((check, i) => (
                  <IdentityRow key={i} check={check} />
                ))}
              </div>
            ))}
            {result.years.length > 3 && (
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                + {result.years.length - 3} more years (all {s.identityPassRate}% pass)
              </div>
            )}
          </div>

          {/* Completeness — show only missing fields */}
          {Object.entries(result.completeness).some(([, v]) => v.missing > 0) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>Missing Data</div>
              {Object.entries(result.completeness)
                .filter(([, v]) => v.missing > 0)
                .map(([field, v]) => (
                  <div key={field} style={{ fontSize: 11, color: C.yellow }}>
                    {field}: missing {v.missingYears.join(', ')}
                  </div>
                ))
              }
            </div>
          )}

          {/* Derived Field Mismatches */}
          {result.derivedChecks.filter(c => c.status !== 'match').length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>Derived Field Issues</div>
              {result.derivedChecks.filter(c => c.status !== 'match').map((c, i) => (
                <div key={i} style={{ fontSize: 11, color: c.status === 'warning' ? C.yellow : C.red }}>
                  {c.field} ({c.year}): derived={fmt(c.derived)} expected={fmt(c.expected)} diff={fmt(c.diff)}
                </div>
              ))}
            </div>
          )}

          {/* YoY Flags */}
          {result.yoyFlags.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>Year-over-Year Flags</div>
              {result.yoyFlags.map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: C.yellow }}>
                  {f.field} ({f.year}): {f.pctChange != null ? `${f.pctChange}% change` : 'sign flip'} ({fmt(f.prior)} → {fmt(f.current)})
                </div>
              ))}
            </div>
          )}

          {/* Quarterly Roll-Up */}
          {result.quarterlyRollupChecks?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>
                Quarterly Roll-Up (Q1+Q2+Q3+Q4 ≈ FY)
                <span style={{ fontWeight: 400, color: C.textMuted, marginLeft: 8 }}>
                  {result.quarterlyRollupChecks.filter(c => c.status === 'match').length} match / {result.quarterlyRollupChecks.length} checks
                  {result.summary.quarterlyRollupMatchRate != null && ` (${result.summary.quarterlyRollupMatchRate}%)`}
                </span>
              </div>
              {result.quarterlyRollupChecks.filter(c => c.status !== 'match').map((c, i) => {
                const color = c.status === 'warning' ? C.yellow : C.red;
                return (
                  <div key={i} style={{ fontSize: 11, color, paddingLeft: 16 }}>
                    {c.label} ({c.fy}): {c.type === 'flow'
                      ? `Sum ${fmt(c.quarterSum)} vs Annual ${fmt(c.annualVal)}`
                      : `Q4 ${fmt(c.q4Val)} vs Annual ${fmt(c.annualVal)}`
                    } ({c.pctDiff}% diff, {c.quartersAvailable || 'n/a'} qtrs)
                  </div>
                );
              })}
              {result.quarterlyRollupChecks.every(c => c.status === 'match') && (
                <div style={{ fontSize: 11, color: C.green, paddingLeft: 16 }}>All checks match within tolerance</div>
              )}
            </div>
          )}

          {/* Retained Earnings Reconciliation */}
          {result.retainedEarningsChecks?.length > 0 && result.retainedEarningsChecks.some(c => c.status === 'warning') && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>
                Retained Earnings Reconciliation
                <span style={{ fontWeight: 400, color: C.textMuted, marginLeft: 8 }}>
                  ({result.retainedEarningsChecks.filter(c => c.status === 'warning').length} warnings / {result.retainedEarningsChecks.length} years)
                </span>
              </div>
              {result.retainedEarningsChecks.filter(c => c.status === 'warning').map((c, i) => (
                <div key={i} style={{ fontSize: 11, color: C.yellow, paddingLeft: 16 }}>
                  {c.year}: Begin RE {fmt(c.beginRE)} + NI {fmt(c.ni)} − Div {fmt(c.dividendsPaid)} = Expected {fmt(c.expectedEndRE)} vs Actual {fmt(c.endRE)} (diff {fmt(c.diff)})
                </div>
              ))}
            </div>
          )}

          {/* Frames Cross-Check */}
          {Object.keys(result.framesChecks).length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>Frames API Cross-Check</div>
              {Object.entries(result.framesChecks).map(([field, yearData]) => (
                <FramesRow key={field} field={field} yearData={yearData} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmt(val) {
  if (val == null) return '–';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return typeof val === 'number' ? val.toFixed(2) : String(val);
}

// ─── Aggregate Summary ───────────────────────────────────────────────

function AggregateSummary({ results }) {
  if (results.length === 0) return null;

  const pass = results.filter(r => r.summary.overallStatus === 'PASS').length;
  const warn = results.filter(r => r.summary.overallStatus === 'WARNINGS').length;
  const fail = results.filter(r => r.summary.overallStatus === 'FAIL').length;
  const skip = results.filter(r => r.summary.overallStatus === 'SKIP').length;

  // Exclude SKIP from averages (they have 0% rates that would drag down the numbers)
  const scored = results.filter(r => r.summary.overallStatus !== 'SKIP');
  const avgIdentity = scored.length > 0 ? Math.round(scored.reduce((s, r) => s + r.summary.identityPassRate, 0) / scored.length) : 0;
  const avgFrames = scored.length > 0 ? Math.round(scored.reduce((s, r) => s + r.summary.framesMatchRate, 0) / scored.length) : 0;
  const avgCompleteness = scored.length > 0 ? Math.round(scored.reduce((s, r) => s + r.summary.completenessScore, 0) / scored.length) : 0;

  const withQuarterly = scored.filter(r => r.summary.quarterlyRollupMatchRate != null);
  const avgQuarterly = withQuarterly.length > 0 ? Math.round(withQuarterly.reduce((s, r) => s + r.summary.quarterlyRollupMatchRate, 0) / withQuarterly.length) : null;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 12, marginBottom: 16, padding: 12, background: C.bgCard, borderRadius: 8,
      border: `1px solid ${C.border}`,
    }}>
      <MetricCard label="Companies" value={results.length} />
      <MetricCard label="Pass" value={pass} color={C.green} />
      <MetricCard label="Warnings" value={warn} color={C.yellow} />
      <MetricCard label="Fail" value={fail} color={C.red} />
      {skip > 0 && <MetricCard label="Skipped" value={skip} />}
      <MetricCard label="Avg Identity" value={`${avgIdentity}%`} />
      <MetricCard label="Avg Frames" value={`${avgFrames}%`} />
      <MetricCard label="Avg Completeness" value={`${avgCompleteness}%`} />
      {avgQuarterly != null && <MetricCard label="Avg Qtr Roll-Up" value={`${avgQuarterly}%`} />}
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || C.text }}>{value}</div>
      <div style={{ fontSize: 11, color: C.textSecondary }}>{label}</div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

const RESULTS_KEY = 'validation-results-l1';

function loadResults() {
  try {
    return JSON.parse(localStorage.getItem(RESULTS_KEY)) || {};
  } catch { return {}; }
}

function saveResults(results) {
  try {
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  } catch { /* localStorage full */ }
}

export default function Validation() {
  const [results, setResults] = useState(() => loadResults());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, ticker: '' });
  const [expandedTicker, setExpandedTicker] = useState(null);
  const [filter, setFilter] = useState('all');
  const [skipFrames, setSkipFrames] = useState(false);
  const [includeQuarterly, setIncludeQuarterly] = useState(false);
  const abortRef = useRef(false);

  const resultsList = Object.values(results).sort((a, b) => {
    const order = { FAIL: 0, WARNINGS: 1, PASS: 2, SKIP: 3 };
    return (order[a.summary.overallStatus] ?? 3) - (order[b.summary.overallStatus] ?? 3);
  });

  const filtered = filter === 'all' ? resultsList
    : filter === 'issues' ? resultsList.filter(r => r.summary.overallStatus !== 'PASS')
    : resultsList.filter(r => r.summary.overallStatus === filter);

  const runValidation = useCallback(async (tickers) => {
    setRunning(true);
    abortRef.current = false;
    const updated = { ...results };

    for (let i = 0; i < tickers.length; i++) {
      if (abortRef.current) break;

      const ticker = tickers[i];
      setProgress({ current: i + 1, total: tickers.length, ticker });

      try {
        const statements = await fetchEdgarStatements(ticker);
        if (!statements || !statements.years || statements.years.length === 0) {
          updated[ticker] = {
            ticker, timestamp: new Date().toISOString(), years: [],
            identityChecks: {}, completeness: {}, derivedChecks: [], yoyFlags: [], framesChecks: {},
            summary: { identityPassRate: 0, completenessScore: 0, derivedMatchRate: 0, framesMatchRate: 0,
              framesWarnings: 0, framesErrors: 0, yoyFlagsCount: 0, overallStatus: 'SKIP' },
            error: 'No EDGAR data available (delisted or CIK not found)',
          };
        } else {
          let quarterlyData = null;
          if (includeQuarterly) {
            const qResult = await fetchEdgarQuarterly(ticker);
            quarterlyData = qResult?.quarterly || null;
          }
          const result = await validateCompany(ticker, statements, { skipFrames, quarterlyData });
          updated[ticker] = result;
        }
      } catch (err) {
        console.error(`Validation failed for ${ticker}:`, err);
        updated[ticker] = {
          ticker, timestamp: new Date().toISOString(), years: [],
          identityChecks: {}, completeness: {}, derivedChecks: [], yoyFlags: [], framesChecks: {},
          summary: { identityPassRate: 0, completenessScore: 0, derivedMatchRate: 0, framesMatchRate: 0,
            framesWarnings: 0, framesErrors: 0, yoyFlagsCount: 0, overallStatus: 'SKIP' },
          error: err.message,
        };
      }

      setResults({ ...updated });
      saveResults(updated);
    }

    setRunning(false);
  }, [results, skipFrames, includeQuarterly]);

  const runAll = () => {
    const unvalidated = VALIDATION_COMPANIES
      .map(c => c.ticker)
      .filter(t => !results[t]);
    if (unvalidated.length === 0) {
      // Re-run all
      runValidation(VALIDATION_COMPANIES.map(c => c.ticker));
    } else {
      runValidation(unvalidated);
    }
  };

  const runSingle = (ticker) => {
    runValidation([ticker]);
  };

  const clearResults = () => {
    setResults({});
    localStorage.removeItem(RESULTS_KEY);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `validation-l1-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validated = Object.keys(results).length;
  const total = VALIDATION_COMPANIES.length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>
          EDGAR Validation — Layer 1
        </h2>
        <span style={{ fontSize: 12, color: C.textSecondary }}>
          {validated}/{total} companies validated
        </span>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <button
          onClick={runAll}
          disabled={running}
          style={{
            padding: '6px 16px', fontSize: 13, fontWeight: 600,
            background: C.accent, color: '#fff', border: 'none',
            borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer',
            opacity: running ? 0.6 : 1,
          }}
        >
          {running ? `Running... ${progress.current}/${progress.total} (${progress.ticker})` : validated < total ? `Run Remaining (${total - validated})` : `Re-run All (${total})`}
        </button>

        {running && (
          <button
            onClick={() => { abortRef.current = true; }}
            style={{
              padding: '6px 12px', fontSize: 12, background: C.red, color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
            }}
          >
            Stop
          </button>
        )}

        <select
          onChange={(e) => { if (e.target.value) runSingle(e.target.value); e.target.value = ''; }}
          disabled={running}
          style={{
            padding: '6px 8px', fontSize: 12, background: C.bgInput,
            color: C.text, border: `1px solid ${C.border}`, borderRadius: 6,
          }}
        >
          <option value="">Run single...</option>
          {VALIDATION_COMPANIES.map(c => (
            <option key={c.ticker} value={c.ticker}>{c.ticker} — {c.name}</option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.textSecondary }}>
          <input
            type="checkbox"
            checked={skipFrames}
            onChange={(e) => setSkipFrames(e.target.checked)}
            disabled={running}
          />
          Skip Frames API (faster)
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.textSecondary }}>
          <input
            type="checkbox"
            checked={includeQuarterly}
            onChange={(e) => setIncludeQuarterly(e.target.checked)}
            disabled={running}
          />
          Include Quarterly Roll-Up
        </label>

        <div style={{ flex: 1 }} />

        <button onClick={exportJSON} style={smallBtn} disabled={validated === 0}>Export JSON</button>
        <button onClick={clearResults} style={{ ...smallBtn, color: C.red }} disabled={running}>Clear</button>
      </div>

      {/* Filter */}
      {validated > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {['all', 'issues', 'PASS', 'WARNINGS', 'FAIL', 'SKIP'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: filter === f ? C.accent : 'transparent',
                color: filter === f ? '#fff' : C.textSecondary,
                border: `1px solid ${filter === f ? C.accent : C.border}`,
                borderRadius: 4, cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {f === 'issues' ? 'Issues Only' : f}
            </button>
          ))}
        </div>
      )}

      {/* Aggregate */}
      <AggregateSummary results={resultsList} />

      {/* Results */}
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
        background: C.bg,
      }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            {validated === 0 ? 'No validation results yet. Click "Run" to start.' : 'No results match this filter.'}
          </div>
        )}
        {filtered.map(r => (
          <CompanyResult
            key={r.ticker}
            result={r}
            expanded={expandedTicker === r.ticker}
            onToggle={() => setExpandedTicker(expandedTicker === r.ticker ? null : r.ticker)}
          />
        ))}
      </div>

      {/* Troubleshooting guide — always visible */}
      <ValidationGuide />
    </div>
  );
}

const smallBtn = {
  padding: '4px 10px', fontSize: 11, background: 'transparent',
  color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
};

// ─── Troubleshooting Guide ──────────────────────────────────────────

const guideCode = { fontSize: 11, padding: '2px 5px', borderRadius: 3, fontFamily: 'monospace' };

function ValidationGuide() {
  return (
    <div style={{ marginTop: 40, paddingTop: 28, borderTop: `1px solid ${C.border}` }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>
        Troubleshooting Guide
      </h3>

      <GuideSection title="What This Validation Does" number="1">
        <p style={{ marginBottom: 8 }}>
          This is Layer 1 validation — it checks that the financial data pulled from SEC EDGAR is internally
          consistent. It does NOT compare against external sources (that's Layer 2/3, which run as Python scripts).
          Seven checks are performed per company:
        </p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 6 }}>
            <strong>Accounting identities</strong> — Verifies fundamental equations hold: Assets = Liabilities + Equity,
            Current + Non-Current = Total, Gross Profit = Revenue - COGS, etc. Uses $1M tolerance for rounding.
            A 1% tolerance is used for A=L+E to account for mezzanine equity.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Data completeness</strong> — Checks that 14 critical fields are present across all years:
            Revenue, Net Income, Operating Income, Gross Profit, EPS, Assets, Equity, Liabilities,
            Current Assets, Current Liabilities, Shares Outstanding, Operating Cash Flow, CapEx, FCF.
            Long-term debt is intentionally excluded — null means zero debt, not missing.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Derived field consistency</strong> — Verifies auto-computed fields (FCF, EBIT, EBITDA, Net Debt,
            Working Capital, Invested Capital, etc.) match the formula using their component values.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Year-over-year sanity</strong> — Flags dramatic changes (Revenue/Assets/Equity changing by more than
            50% year-over-year, or sign flips). These aren't necessarily errors — M&A, divestitures, and
            accounting changes cause legitimate jumps.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Frames API cross-check</strong> — Compares 9 key values against EDGAR's aggregated Frames API
            (a separate EDGAR endpoint that reports all companies' values for a given tag/year). This catches
            data extraction bugs where our code might pull the wrong filing period. Can be skipped via checkbox
            for faster runs.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Retained earnings reconciliation</strong> — Checks that Beginning RE + Net Income - Dividends Paid
            ≈ Ending RE (10% tolerance). Warnings are expected for companies with stock buybacks, comprehensive
            income adjustments, or goodwill write-downs — these reduce RE without flowing through the NI/dividend path.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Quarterly roll-up</strong> (optional checkbox) — Verifies that Q1+Q2+Q3+Q4 sums match annual
            values. For flow items (Revenue, Net Income, Cash Flow), quarters should sum to the full year.
            For balance sheet items, Q4 should match the annual value. Requires quarterly data fetch (slower).
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="When to Run" number="2">
        <li>After making changes to the EDGAR financial statement engine (<code style={{ ...guideCode, background: C.bg }}>edgarFinancials.js</code>)</li>
        <li>After adding new XBRL tags to the taxonomy</li>
        <li>After modifying derived field calculations (FCF, EBIT, debt, etc.)</li>
        <li>When investigating a company whose numbers look wrong in the Toolbox</li>
        <li>Periodically (every few months) to catch any regressions</li>
      </GuideSection>

      <GuideSection title="Understanding the Status Badges" number="3">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 6 }}>
            <strong style={{ color: '#16a34a' }}>PASS</strong> — All identity checks pass (100%), Frames match rate
            ≥95%, no warnings. The data is clean.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong style={{ color: '#ca8a04' }}>WARNINGS</strong> — Identity checks pass but something else flagged:
            Frames match rate between 80-95%, some YoY flags (>3), or Frames warnings. Usually caused by
            non-calendar fiscal years confusing the Frames API, or legitimate business events (M&A, restructuring).
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong style={{ color: '#dc2626' }}>FAIL</strong> — Identity pass rate below 90% OR Frames match rate
            below 80%. This could indicate a real data bug. Click to expand and check which specific checks failed.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>SKIP</strong> — No EDGAR data available (delisted company, wrong CIK, or the company never
            filed XBRL statements). Can be safely ignored.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Common Issues and What They Mean" number="4">
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>Frames API mismatches (low Frames %)</strong>
          <p style={{ margin: '4px 0' }}>
            The Frames API reports data by calendar year, but many companies have non-calendar fiscal years
            (e.g., AAPL ends in September, SFM ends in January). Our engine maps by fiscal year while Frames
            maps by calendar year — this creates a systematic offset for ~30% of companies. This is expected
            behavior, not a bug. Use "Skip Frames" checkbox for a faster, local-only validation pass.
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>Retained earnings warnings</strong>
          <p style={{ margin: '4px 0' }}>
            RE warnings are expected for companies that do heavy stock buybacks (AAPL, MSFT), because buybacks reduce
            retained earnings directly without flowing through net income. Comprehensive income adjustments
            (currency translation, pension adjustments, unrealized gains/losses) also cause RE divergence.
            An 83% pass rate across 89 companies is normal.
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>YoY flags</strong>
          <p style={{ margin: '4px 0' }}>
            Year-over-year flags indicate dramatic changes (50%+ jump or sign flip). These are informational,
            not errors. Common causes: acquisitions (RTX/Raytheon merger), spinoffs (GE Aerospace), restructuring
            charges, pandemic effects (2020-2021), and one-time write-downs. Check the company's history
            before assuming it's a data issue.
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>Missing data fields</strong>
          <p style={{ margin: '4px 0' }}>
            Some fields may be missing for older years. The XBRL taxonomy changed over time (e.g., ASC 606
            revenue transition in 2018, ASC 842 lease accounting in 2019). The EDGAR engine uses fallback
            tags to handle most transitions, but some companies have gaps in their earliest years.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>If a critical field is missing for recent years:</strong> This likely needs a new XBRL tag
            added to the taxonomy. Check what tag the company uses in their 10-K filing (EDGAR viewer shows
            the XBRL tags) and add it to the appropriate fallback chain in{' '}
            <code style={{ ...guideCode, background: C.bg }}>edgarFinancials.js</code>.
          </p>
        </div>
        <div>
          <strong style={{ color: C.text, fontSize: 12 }}>Quarterly roll-up mismatches</strong>
          <p style={{ margin: '4px 0' }}>
            Quarterly roll-up errors are most common in older-year cash flow sub-totals (Financing CF, Investing CF)
            and companies affected by mergers. Revenue and Net Income have near-perfect roll-up rates (99%+).
            A 98.6% match rate across 89 companies / 12,037 checks is the expected baseline.
          </p>
        </div>
      </GuideSection>

      <GuideSection title="How to Investigate a Failure" number="5">
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Click the company row</strong> to expand and see the detailed breakdown — which identity
            checks failed, which years, and by how much.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Check if it's a known pattern.</strong> Non-calendar FY companies consistently have low
            Frames scores. Companies with mergers/spinoffs have YoY flags. This is expected.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Look at the actual numbers.</strong> Open the company in the Research tab, go to Financials,
            and look at the specific year/field that failed. Switch between Original and Restated versions —
            sometimes the issue only appears in one version.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Check the raw EDGAR filing.</strong> Go to EDGAR, find the company's 10-K filing for the
            failing year, and look at the specific XBRL tag value. Compare to what the app extracted. If they
            differ, the tag mapping may need updating.
          </li>
          <li>
            <strong>If it's a real bug:</strong> The fix is usually in{' '}
            <code style={{ ...guideCode, background: C.bg }}>edgarFinancials.js</code> — either adding a new XBRL
            tag to a taxonomy entry's fallback chain, fixing a derived field formula, or adjusting how
            fiscal year mapping works for that company's filing pattern.
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="Adding New Companies to the Test List" number="6">
        <p style={{ marginBottom: 8 }}>
          The test list is in{' '}
          <code style={{ ...guideCode, background: C.bg }}>src/data/validationCompanies.js</code>.
          To add a company:
        </p>
        <div style={{
          marginTop: 6, marginBottom: 10, padding: '8px 12px', borderRadius: 6,
          background: C.bg, border: `1px solid ${C.border}`,
          fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
        }}>
          {"{ ticker: 'XYZ', name: 'Company Name', categories: ['user'], fyEnd: 'Dec', notes: '' },"}
        </div>
        <p>
          Categories are informational tags used for grouping. Common ones:{' '}
          <code style={{ ...guideCode, background: C.bg }}>user</code> (your research companies),{' '}
          <code style={{ ...guideCode, background: C.bg }}>mega-tech</code>,{' '}
          <code style={{ ...guideCode, background: C.bg }}>healthcare</code>,{' '}
          <code style={{ ...guideCode, background: C.bg }}>retail</code>,{' '}
          <code style={{ ...guideCode, background: C.bg }}>non-calendar-fy</code>,{' '}
          <code style={{ ...guideCode, background: C.bg }}>splits</code>.
          Set <code style={{ ...guideCode, background: C.bg }}>fyEnd</code> to the month abbreviation the company's
          fiscal year ends (e.g., "Sep" for Apple, "Jan" for SFM).
        </p>
      </GuideSection>

      <GuideSection title="Layer 2 and Layer 3 Validation (Python)" number="7">
        <p style={{ marginBottom: 8 }}>
          This in-app tool only runs Layer 1 (self-consistency). Two additional validation layers exist as
          Python scripts that compare against external data sources:
        </p>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 6 }}>
            <strong>Layer 2</strong> (<code style={{ ...guideCode, background: C.bg }}>validation/layer2_statements.py</code>)
            — Compares 50 financial statement fields against Yahoo Finance (yfinance). Last run: 77.1% exact
            match, 82% within 5% across 89 companies.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Layer 3</strong> (<code style={{ ...guideCode, background: C.bg }}>validation/layer3_metrics.py</code>)
            — Compares 11 derived metrics (P/E, current ratio, ROE, etc.) against yfinance TTM data. Lower
            match rates are expected since our metrics are annual FY vs their TTM values.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>To run them:</strong> You need Python with yfinance installed. From the project root:
            <div style={{
              marginTop: 6, padding: '8px 12px', borderRadius: 6,
              background: C.bg, border: `1px solid ${C.border}`,
              fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6,
            }}>
              {'node validation/scripts/bundle.mjs\nnode validation/scripts/export-financials.mjs\npython validation/layer2_statements.py\npython validation/layer3_metrics.py'}
            </div>
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Quick File Reference" number="8">
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 12,
        }}>
          <span style={{ fontWeight: 600, color: C.text }}>Validation engine</span>
          <code style={{ ...guideCode, background: C.bg }}>src/engines/validation.js</code>
          <span style={{ fontWeight: 600, color: C.text }}>EDGAR financial engine</span>
          <code style={{ ...guideCode, background: C.bg }}>src/engines/edgarFinancials.js</code>
          <span style={{ fontWeight: 600, color: C.text }}>Frames cross-check</span>
          <code style={{ ...guideCode, background: C.bg }}>src/engines/edgarFrames.js</code>
          <span style={{ fontWeight: 600, color: C.text }}>Test company list</span>
          <code style={{ ...guideCode, background: C.bg }}>src/data/validationCompanies.js</code>
          <span style={{ fontWeight: 600, color: C.text }}>Key metrics engine</span>
          <code style={{ ...guideCode, background: C.bg }}>src/engines/keyMetrics.js</code>
          <span style={{ fontWeight: 600, color: C.text }}>CLI batch exporter</span>
          <code style={{ ...guideCode, background: C.bg }}>validation/scripts/export-financials.mjs</code>
          <span style={{ fontWeight: 600, color: C.text }}>CLI bundle builder</span>
          <code style={{ ...guideCode, background: C.bg }}>validation/scripts/bundle.mjs</code>
          <span style={{ fontWeight: 600, color: C.text }}>Layer 2 (Python)</span>
          <code style={{ ...guideCode, background: C.bg }}>validation/layer2_statements.py</code>
          <span style={{ fontWeight: 600, color: C.text }}>Layer 3 (Python)</span>
          <code style={{ ...guideCode, background: C.bg }}>validation/layer3_metrics.py</code>
          <span style={{ fontWeight: 600, color: C.text }}>Validation reports</span>
          <code style={{ ...guideCode, background: C.bg }}>validation/reports/</code>
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
