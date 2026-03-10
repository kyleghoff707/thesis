import { useState, useCallback, useRef } from 'react';
import { C } from '../theme';
import { fetchEdgarStatements } from '../engines/edgarFinancials';
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
          const result = await validateCompany(ticker, statements, { skipFrames });
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
  }, [results, skipFrames]);

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
    </div>
  );
}

const smallBtn = {
  padding: '4px 10px', fontSize: 11, background: 'transparent',
  color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
};
