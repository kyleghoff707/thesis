// Executive Compensation — DEF 14A proxy statement data
// Sub-tabs: Key Executives | Board of Directors
// Expandable rows with compensation breakdown, trend sparklines, CEO Pay Ratio

import { useState, Fragment, Component } from 'react';
import { C } from '../theme';

// ─── Error Boundary ────────────────────────────────────────
// Prevents render crashes from white-screening the entire app
class CompErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 0' }}>Failed to render compensation data.</div>;
    }
    return this.props.children;
  }
}

// ─── Formatting ──────────────────────────────────────────────

function fmtDollar(val) {
  if (val == null) return '—';
  const abs = Math.abs(val);
  const formatted = abs >= 1e6
    ? '$' + (abs / 1e6).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'M'
    : '$' + abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return val < 0 ? `(${formatted})` : formatted;
}

function fmtFull(val) {
  if (val == null) return '—';
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// ─── Trend Sparkline ─────────────────────────────────────────

function TrendBars({ values }) {
  const filtered = values.filter(v => v != null && v > 0);
  if (filtered.length < 2) return <div style={{ width: 80, height: 22 }} />;

  const max = Math.max(...filtered);
  if (max === 0) return <div style={{ width: 80, height: 22 }} />;

  const n = values.length;
  const W = 80, H = 22;
  const gap = 1;
  const barW = Math.max(2, (W - gap * (n - 1)) / n);

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {values.map((v, i) => {
        if (v == null || v <= 0) return null;
        const x = i * (barW + gap);
        const barH = Math.max(1, (v / max) * (H - 2));
        return <rect key={i} x={x} y={H - barH - 1} width={barW} height={barH} fill={C.accent} rx={0.5} />;
      })}
    </svg>
  );
}

// ─── Compensation Mix Bar ────────────────────────────────────

function CompMixBar({ comp }) {
  const [hovered, setHovered] = useState(null);

  if (!comp) return null;
  const salary = comp.salary ?? 0;
  const cashIncentive = (comp.bonus ?? 0) + (comp.nonEquityIncentive ?? 0);
  const equity = (comp.stockAwards ?? 0) + (comp.optionAwards ?? 0);
  const total = salary + cashIncentive + equity + (comp.otherComp ?? 0) + (comp.pensionChange ?? 0);
  if (total <= 0) return null;

  const segments = [
    { label: 'Salary', value: salary, color: C.accent },
    { label: 'Cash Incentive', value: cashIncentive, color: '#f59e0b' },
    { label: 'Equity', value: equity, color: '#8b5cf6' },
  ].filter(s => s.value > 0);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, position: 'relative' }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', background: C.borderLight }}>
        {segments.map((s, i) => (
          <div
            key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              width: `${(s.value / total) * 100}%`, height: '100%', background: s.color,
              cursor: 'default', transition: 'opacity 0.1s',
              opacity: hovered != null && hovered !== i ? 0.5 : 1,
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 10, color: C.textMuted, whiteSpace: 'nowrap' }}>
        {Math.round(equity / total * 100)}% equity
      </div>
      {hovered != null && segments[hovered] && (
        <div style={{
          position: 'absolute', bottom: 14, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 10,
        }}>
          <div style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '4px 8px', whiteSpace: 'nowrap', fontSize: 11,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: segments[hovered].color, marginRight: 5, verticalAlign: 'middle' }} />
            <span style={{ color: C.text, fontWeight: 600 }}>{segments[hovered].label}</span>
            <span style={{ color: C.textMuted, marginLeft: 6 }}>
              {fmtFull(segments[hovered].value)} ({Math.round(segments[hovered].value / total * 100)}%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CEO Pay Ratio Card ──────────────────────────────────────

function PayRatioCard({ ceoPayRatio }) {
  if (!ceoPayRatio) return null;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', borderRadius: 6,
      background: C.cardBg, border: `1px solid ${C.border}`,
      fontSize: 12,
    }}>
      <span style={{ color: C.textMuted }}>CEO Pay Ratio</span>
      <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{ceoPayRatio.ratio.toLocaleString()}:1</span>
    </div>
  );
}

// ─── Breakdown Rows (expanded detail) ────────────────────────

const BREAKDOWN_FIELDS = [
  { key: 'salary', label: 'Salary' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'nonEquityIncentive', label: 'Non-Equity Incentive' },
  { key: '_totalCash', label: 'Total Cash Compensation', isBold: true },
  { key: 'stockAwards', label: 'Restricted Stock Award' },
  { key: 'optionAwards', label: 'Option Award' },
  { key: '_totalEquity', label: 'Total Equity', isBold: true },
  { key: 'pensionChange', label: 'Change in Pension Value' },
  { key: 'otherComp', label: 'Other Compensation' },
  { key: 'total', label: 'Total Compensation', isBold: true },
];

function getBreakdownValue(comp, key) {
  if (!comp) return null;
  if (key === '_totalCash') return (comp.salary ?? 0) + (comp.bonus ?? 0) + (comp.nonEquityIncentive ?? 0);
  if (key === '_totalEquity') return (comp.stockAwards ?? 0) + (comp.optionAwards ?? 0);
  return comp[key] ?? null;
}

// ─── Key Executives Tab ──────────────────────────────────────

function KeyExecutivesTab({ executives, years, summary, ceoPayRatio, source, pvpData }) {
  const [expandedExec, setExpandedExec] = useState(null);
  const isXbrl = source === 'xbrl-pvp';

  if (!executives || executives.length === 0) {
    return (
      <div style={{ color: C.textMuted, fontSize: 13, fontStyle: 'italic', padding: '12px 0' }}>
        No executive compensation data found in recent proxy statements.
      </div>
    );
  }

  const displayYears = (years || []).slice(0, 5); // Show up to 5 years

  // Check if any exec has _isAverage data (XBRL NEOs show avg, not individual)
  const hasAverageData = executives.some(e =>
    Object.values(e.compensation).some(c => c._isAverage)
  );

  return (
    <div>
      {ceoPayRatio && (
        <div style={{ marginBottom: 12 }}>
          <PayRatioCard ceoPayRatio={ceoPayRatio} />
        </div>
      )}

      <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Compensation (USD)
        {isXbrl && (
          <span style={{
            marginLeft: 8, fontSize: 9, padding: '1px 5px', borderRadius: 3,
            background: `${C.accent}18`, color: C.accent, fontWeight: 600,
            letterSpacing: '0.02em', textTransform: 'uppercase',
          }}>
            Pay vs Performance
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: C.textMuted, fontWeight: 600, fontSize: 11, minWidth: 200 }}>
                Name &amp; Title
              </th>
              {displayYears.map(y => (
                <th key={y} style={{ textAlign: 'right', padding: '8px 10px', color: C.textMuted, fontWeight: 600, fontSize: 11, minWidth: 90 }}>
                  {y}
                </th>
              ))}
              <th style={{ textAlign: 'center', padding: '8px 10px', color: C.textMuted, fontWeight: 600, fontSize: 11, width: 90 }}>
                {displayYears.length}‑Year Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {executives.map((exec, idx) => {
              const isExpanded = expandedExec === idx;
              const trendValues = [...displayYears].reverse().map(y => exec.compensation[y]?.total ?? null);
              // Get most recent year's comp for mix bar
              const latestComp = displayYears.reduce((found, y) => found || exec.compensation[y], null);
              // Check if this exec has breakdown data (HTML source) vs total-only (XBRL)
              const hasBreakdown = latestComp && (latestComp.salary != null || latestComp.stockAwards != null);
              const execIsAvg = latestComp?._isAverage;

              return (
                <Fragment key={idx}>
                  {/* Main row */}
                  <tr
                    onClick={() => setExpandedExec(isExpanded ? null : idx)}
                    style={{
                      cursor: 'pointer',
                      borderBottom: isExpanded ? 'none' : `1px solid ${C.borderLight}`,
                      background: isExpanded ? `${C.accent}08` : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 10px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <span style={{ color: C.textMuted, fontSize: 10, marginTop: 3, userSelect: 'none' }}>
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, color: C.text }}>
                            {exec.name}
                            {execIsAvg && (
                              <span style={{ fontSize: 9, color: C.textMuted, fontWeight: 400, marginLeft: 6 }}>
                                (avg NEO comp)
                              </span>
                            )}
                          </div>
                          {exec.title && (
                            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{exec.title}</div>
                          )}
                          {isExpanded && hasBreakdown && <CompMixBar comp={latestComp} />}
                        </div>
                      </div>
                    </td>
                    {displayYears.map(y => (
                      <td key={y} style={{ textAlign: 'right', padding: '10px 10px', color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtFull(exec.compensation[y]?.total)}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', padding: '10px 10px' }}>
                      <TrendBars values={trendValues} />
                    </td>
                  </tr>

                  {/* Expanded breakdown rows — full breakdown for HTML source, total + actually paid for XBRL */}
                  {isExpanded && hasBreakdown && BREAKDOWN_FIELDS.map(field => {
                    const vals = displayYears.map(y => getBreakdownValue(exec.compensation[y], field.key));
                    const allNull = vals.every(v => v == null || v === 0);
                    if (allNull && !field.isBold) return null; // Skip empty non-summary rows

                    return (
                      <tr
                        key={field.key}
                        style={{
                          background: field.isBold ? `${C.accent}06` : `${C.accent}03`,
                          borderBottom: field.key === 'total' ? `2px solid ${C.accent}30` : `1px solid ${C.borderLight}`,
                        }}
                      >
                        <td style={{
                          padding: '5px 10px 5px 38px',
                          fontSize: 11,
                          color: field.isBold ? C.text : C.textMuted,
                          fontWeight: field.isBold ? 600 : 400,
                        }}>
                          {field.label}
                        </td>
                        {displayYears.map(y => (
                          <td key={y} style={{
                            textAlign: 'right', padding: '5px 10px',
                            fontSize: 11,
                            color: field.isBold ? C.text : C.textMuted,
                            fontWeight: field.isBold ? 600 : 400,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {fmtFull(getBreakdownValue(exec.compensation[y], field.key))}
                          </td>
                        ))}
                        <td />
                      </tr>
                    );
                  })}
                  {/* XBRL-only expanded detail: Total Comp + Actually Paid */}
                  {isExpanded && !hasBreakdown && [
                    { key: 'total', label: 'Total Compensation (SCT)', getValue: c => c?.total },
                    { key: 'actuallyPaid', label: 'Compensation Actually Paid', getValue: c => c?._actuallyPaid },
                  ].map(row => {
                    const vals = displayYears.map(y => row.getValue(exec.compensation[y]));
                    if (vals.every(v => v == null)) return null;
                    const isBold = row.key === 'total';
                    return (
                      <tr
                        key={row.key}
                        style={{
                          background: `${C.accent}06`,
                          borderBottom: row.key === 'actuallyPaid' ? `2px solid ${C.accent}30` : `1px solid ${C.borderLight}`,
                        }}
                      >
                        <td style={{ padding: '5px 10px 5px 38px', fontSize: 11, color: isBold ? C.text : C.textMuted, fontWeight: isBold ? 600 : 400 }}>
                          {row.label}
                        </td>
                        {displayYears.map(y => (
                          <td key={y} style={{
                            textAlign: 'right', padding: '5px 10px', fontSize: 11,
                            color: isBold ? C.text : C.textMuted, fontWeight: isBold ? 600 : 400,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {fmtFull(row.getValue(exec.compensation[y]))}
                          </td>
                        ))}
                        <td />
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}

            {/* Summary row */}
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.cardBg }}>
              <td style={{ padding: '10px 10px', fontWeight: 700, fontSize: 12, color: C.text }}>
                {hasAverageData ? 'CEO Total Compensation' : 'Total Compensation for All Key Executives'}
              </td>
              {displayYears.map(y => (
                <td key={y} style={{ textAlign: 'right', padding: '10px 10px', fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                  {hasAverageData
                    ? fmtFull(executives[0]?.compensation[y]?.total)
                    : fmtFull(summary?.totalExecComp?.[y])
                  }
                </td>
              ))}
              <td />
            </tr>

            {/* Pay vs Performance TSR row (XBRL only) */}
            {isXbrl && pvpData && (
              <tr style={{ borderTop: `1px solid ${C.borderLight}`, background: C.cardBg }}>
                <td style={{ padding: '8px 10px', fontSize: 11, color: C.textMuted }}>
                  Total Shareholder Return (vs Peer Group)
                </td>
                {displayYears.map(y => {
                  const d = pvpData[y];
                  return (
                    <td key={y} style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                      {d?.tsr != null ? (
                        <span>
                          <span style={{ color: C.text, fontWeight: 600 }}>{d.tsr.toFixed(1)}%</span>
                          {d.peerTsr != null && (
                            <span style={{ color: d.tsr >= d.peerTsr ? '#22c55e' : '#ef4444', marginLeft: 4, fontSize: 10 }}>
                              vs {d.peerTsr.toFixed(1)}%
                            </span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                  );
                })}
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isXbrl && (
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8, fontStyle: 'italic' }}>
          Data from SEC Pay vs Performance disclosure (Item 402(v)). Non-CEO values are averages across all Named Executive Officers.
          Salary/equity breakdown not available — see proxy statement for full Summary Compensation Table.
        </div>
      )}
    </div>
  );
}

// ─── Board of Directors Tab ──────────────────────────────────

function BoardTab({ directors }) {
  if (!directors || directors.length === 0) {
    return (
      <div style={{ color: C.textMuted, fontSize: 13, fontStyle: 'italic', padding: '12px 0' }}>
        No director compensation data found in recent proxy statements.
      </div>
    );
  }

  // Directors typically have a single year of data per filing
  const directorFields = [
    { key: 'feesEarned', label: 'Fees Earned / Paid in Cash' },
    { key: 'stockAwards', label: 'Stock Awards' },
    { key: 'optionAwards', label: 'Option Awards' },
    { key: 'nonEquityIncentive', label: 'Non-Equity Incentive' },
    { key: 'otherComp', label: 'All Other' },
    { key: 'total', label: 'Total' },
  ];

  // Get the most recent year across all directors
  const dirYears = new Set();
  for (const dir of directors) {
    for (const y of Object.keys(dir.compensation)) dirYears.add(parseInt(y));
  }
  const years = Array.from(dirYears).sort((a, b) => b - a);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.border}` }}>
            <th style={{ textAlign: 'left', padding: '8px 10px', color: C.textMuted, fontWeight: 600, fontSize: 11, minWidth: 180 }}>Name</th>
            {directorFields.map(f => (
              <th key={f.key} style={{ textAlign: 'right', padding: '8px 10px', color: C.textMuted, fontWeight: 600, fontSize: 11 }}>
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {directors.map((dir, idx) => {
            // Use most recent year's data
            const yearKey = years[0];
            const comp = dir.compensation[yearKey] || {};
            return (
              <tr key={idx} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ padding: '8px 10px', fontWeight: 500, color: C.text }}>{dir.name}</td>
                {directorFields.map(f => (
                  <td key={f.key} style={{
                    textAlign: 'right', padding: '8px 10px',
                    color: f.key === 'total' ? C.text : C.textMuted,
                    fontWeight: f.key === 'total' ? 600 : 400,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {fmtFull(comp[f.key])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {years.length > 0 && (
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8, fontStyle: 'italic' }}>
          Data from {years[0]} proxy statement
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function ExecutiveCompensation({ data, loading, error, edgarStatements }) {
  const [activeTab, setActiveTab] = useState('executives');

  if (loading) {
    return (
      <div style={{ color: C.textMuted, fontSize: 13, padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        Loading executive compensation...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: C.red, fontSize: 12, padding: '8px 0' }}>
        Failed to load compensation data: {error}
      </div>
    );
  }

  if (!data || (!data.executives?.length && !data.directors?.length)) {
    return (
      <div style={{ color: C.textMuted, fontSize: 13, fontStyle: 'italic', padding: '12px 0' }}>
        No DEF 14A proxy statement found for this company.
      </div>
    );
  }

  const tabs = [
    { key: 'executives', label: 'Key Executives' },
    { key: 'directors', label: 'Board of Directors' },
  ];

  // Comp-to-revenue ratio
  let compToRevenue = null;
  if (edgarStatements && data.summary?.years?.length > 0) {
    const latestYear = data.summary.years[0];
    const totalComp = data.summary.totalExecComp[latestYear];
    const revenue = edgarStatements.income?.[latestYear]?.revenue;
    if (totalComp > 0 && revenue > 0) {
      compToRevenue = { ratio: (totalComp / revenue * 100), year: latestYear };
    }
  }

  return (
    <CompErrorBoundary>
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 12 }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? C.accent : C.textMuted,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? `2px solid ${C.accent}` : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}

        {/* Comp-to-Revenue ratio (right-aligned) */}
        {compToRevenue && (
          <div style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: C.textMuted, paddingRight: 4,
          }}>
            <span>Exec Comp / Revenue:</span>
            <span style={{ fontWeight: 600, color: C.text }}>{compToRevenue.ratio.toFixed(2)}%</span>
            <span>({compToRevenue.year})</span>
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'executives' && (
        <KeyExecutivesTab
          executives={data.executives || []}
          years={data.summary?.years || []}
          summary={data.summary}
          ceoPayRatio={data.ceoPayRatio}
          source={data.source}
          pvpData={data.pvpData}
        />
      )}

      {activeTab === 'directors' && (
        <BoardTab directors={data.directors || []} />
      )}

    </div>
    </CompErrorBoundary>
  );
}
