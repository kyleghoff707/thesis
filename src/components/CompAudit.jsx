import { useState, useCallback } from 'react';
import { C } from '../theme';
import VALIDATION_COMPANIES from '../data/validationCompanies';
import { auditCompensation } from '../engines/compensation';

export default function CompAudit() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: VALIDATION_COMPANIES.length, ticker: '' });

  const run = useCallback(async () => {
    setRunning(true);
    setResults(null);
    const res = await auditCompensation(VALIDATION_COMPANIES, (current, total, ticker) => {
      setProgress({ current, total, ticker });
    });
    setResults(res);
    setRunning(false);
  }, []);

  const passed = results?.filter(r => r.status === 'PASS') || [];
  const warned = results?.filter(r => r.status === 'WARN') || [];
  const failed = results?.filter(r => r.status === 'FAIL') || [];

  // Group failures by category
  const failuresByCategory = {};
  for (const r of failed) {
    const cat = r.category || 'UNKNOWN';
    if (!failuresByCategory[cat]) failuresByCategory[cat] = [];
    failuresByCategory[cat].push(r);
  }

  const passRate = results ? Math.round((passed.length / results.length) * 100) : 0;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Compensation Audit</h2>
      <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
        Validates executive compensation parsing across {VALIDATION_COMPANIES.length} companies — checks DEF 14A
        filing discovery, table detection, column matching, and parse quality.
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
        {running ? `Checking ${progress.current}/${progress.total} — ${progress.ticker}...` : 'Run Audit'}
      </button>

      {running && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            height: 4, borderRadius: 2, background: C.border, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2, background: C.accent,
              width: `${(progress.current / progress.total) * 100}%`,
              transition: 'width 0.2s ease',
            }} />
          </div>
        </div>
      )}

      {results && (
        <>
          {/* Summary */}
          <div style={{
            display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center',
            padding: '12px 16px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
          }}>
            <Stat label="Pass" value={passed.length} color="#16a34a" />
            <Stat label="Partial" value={warned.length} color={warned.length > 0 ? '#d97706' : C.textMuted} />
            <Stat label="Fail" value={failed.length} color={failed.length > 0 ? '#dc2626' : C.textMuted} />
            <Stat label="Rate" value={`${passRate}%`} color={passRate >= 80 ? '#16a34a' : passRate >= 60 ? '#d97706' : '#dc2626'} />
            <Stat label="Total" value={results.length} color={C.text} />
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `comp-audit-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{
                marginLeft: 'auto', background: 'none', border: `1px solid ${C.border}`,
                borderRadius: 5, padding: '5px 12px', fontSize: 11, fontWeight: 600,
                color: C.accent, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Download JSON
            </button>
          </div>

          {/* Failures grouped by category */}
          {failed.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#dc2626', marginBottom: 10 }}>
                Failures ({failed.length})
              </h3>
              {Object.entries(failuresByCategory).map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.04em', color: C.textMuted, marginBottom: 6,
                  }}>
                    {CATEGORY_LABELS[cat] || cat} ({items.length})
                  </div>
                  {items.map(r => <CompanyRow key={r.ticker} r={r} />)}
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {warned.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d97706', marginBottom: 10 }}>
                Partial ({warned.length})
              </h3>
              {warned.map(r => <CompanyRow key={r.ticker} r={r} />)}
            </div>
          )}

          {/* Passed */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#16a34a', marginBottom: 10 }}>
              Passed ({passed.length})
            </h3>
            {passed.map(r => <CompanyRow key={r.ticker} r={r} />)}
          </div>
        </>
      )}

      {/* Troubleshooting guide — always visible */}
      <TroubleshootingGuide />
    </div>
  );
}

// ─── Category labels ─────────────────────────────────────────

const CATEGORY_LABELS = {
  NO_CIK: 'No CIK Found',
  NO_FILINGS: 'No DEF 14A Filings',
  FETCH_FAILED: 'Fetch Failed',
  TABLE_NOT_FOUND: 'Table Not Found',
  HEADER_MISMATCH: 'Header Mismatch',
  PARSE_EMPTY: 'Parse Empty',
  XBRL_FALLBACK: 'XBRL Fallback',
  ERROR: 'Error',
};

// ─── Sub-components ──────────────────────────────────────────

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

function CompanyRow({ r }) {
  const [expanded, setExpanded] = useState(false);
  const icon = r.status === 'PASS' ? '\u2705' : r.status === 'WARN' ? '\u26A0\uFE0F' : '\u274C';
  const bgColor = r.status === 'PASS'
    ? 'rgba(22,163,74,0.04)'
    : r.status === 'WARN'
      ? 'rgba(217,119,6,0.06)'
      : 'rgba(220,38,38,0.06)';
  const borderColor = r.status === 'PASS'
    ? 'rgba(22,163,74,0.1)'
    : r.status === 'WARN'
      ? 'rgba(217,119,6,0.15)'
      : 'rgba(220,38,38,0.15)';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '8px 12px', marginBottom: 4, borderRadius: 6,
      background: bgColor, border: `1px solid ${borderColor}`,
    }}>
      <span style={{ fontSize: 13, width: 18, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.ticker}</span>
          <span style={{ fontSize: 11, color: C.textMuted }}>{r.name}</span>
          {r.category && (r.status !== 'PASS' || r.category === 'XBRL_FALLBACK') && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
              background: r.category === 'XBRL_FALLBACK' ? `${C.accent}18` : r.status === 'WARN' ? 'rgba(217,119,6,0.12)' : 'rgba(220,38,38,0.1)',
              color: r.category === 'XBRL_FALLBACK' ? C.accent : r.status === 'WARN' ? '#d97706' : '#dc2626',
            }}>
              {CATEGORY_LABELS[r.category] || r.category}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.textMuted, marginTop: 2 }}>
          <span>{r.filingCount} DEF 14A{r.filingCount !== 1 ? 's' : ''}</span>
          {r.execCount > 0 && <span>{r.execCount} execs</span>}
          {r.yearCount > 0 && <span>{r.yearCount} years</span>}
          {r.directorCount > 0 && <span>{r.directorCount} directors</span>}
          {r.hasCeoPayRatio && <span style={{ color: C.accent }}>CEO Pay Ratio</span>}
        </div>
        {r.issues.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {r.issues.map((issue, i) => (
              <div key={i} style={{ fontSize: 12, color: r.category === 'XBRL_FALLBACK' ? C.accent : r.status === 'WARN' ? '#d97706' : '#dc2626', padding: '1px 0' }}>
                {issue}
              </div>
            ))}
          </div>
        )}
        {r.diagnostics && (
          <div style={{ marginTop: 4 }}>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 11, color: C.accent, fontWeight: 500,
              }}
            >
              {expanded ? '\u25BC' : '\u25B6'} Diagnostics
            </button>
            {expanded && (
              <div style={{
                marginTop: 6, padding: '8px 10px', borderRadius: 4,
                background: C.bg, border: `1px solid ${C.border}`,
                fontSize: 11, lineHeight: 1.7, color: C.textSecondary,
              }}>
                <div><strong>Tables in document:</strong> {r.diagnostics.totalTables}</div>
                <div><strong>Tables with SCT heading:</strong> {r.diagnostics.tablesWithSCTHeading}</div>
                <div><strong>Pass 2 tables tried:</strong> {r.diagnostics.pass2Attempts}</div>
                {r.diagnostics.candidateHeadings.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <strong>Sample heading texts near tables:</strong>
                    {r.diagnostics.candidateHeadings.slice(0, 5).map((h, i) => (
                      <div key={i} style={{
                        padding: '2px 6px', marginTop: 2, borderRadius: 3,
                        background: C.bgCard, fontFamily: 'monospace', fontSize: 10,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </div>
                    ))}
                  </div>
                )}
                {r.diagnostics.headerMatchAttempts.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <strong>Header match attempts ({r.diagnostics.headerMatchAttempts.length}):</strong>
                    {r.diagnostics.headerMatchAttempts.map((a, i) => (
                      <div key={i} style={{
                        padding: '4px 6px', marginTop: 2, borderRadius: 3,
                        background: a.matched ? 'rgba(22,163,74,0.06)' : C.bgCard,
                        border: a.matched ? '1px solid rgba(22,163,74,0.15)' : 'none',
                      }}>
                        <div>{a.contentCellCount} cells, {a.matchCount} matched{a.matched ? ' \u2714' : ''}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.textMuted }}>
                          [{a.headerTexts.join(' | ')}]
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Troubleshooting Guide ──────────────────────────────────

const code = { fontSize: 11, padding: '2px 5px', borderRadius: 3, fontFamily: 'monospace' };

function TroubleshootingGuide() {
  return (
    <div style={{ marginTop: 40, paddingTop: 28, borderTop: `1px solid ${C.border}` }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>
        Troubleshooting Guide
      </h3>

      <GuideSection title="What This Audit Checks" number="1">
        <p style={{ marginBottom: 8 }}>
          For each of the {VALIDATION_COMPANIES.length} validation companies, the audit tests the full
          compensation parsing pipeline:
        </p>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 4 }}><strong>CIK resolution</strong> — Can the ticker be mapped to an SEC CIK number?</li>
          <li style={{ marginBottom: 4 }}><strong>Filing discovery</strong> — Does the company have DEF 14A (proxy statement) filings?</li>
          <li style={{ marginBottom: 4 }}><strong>Fetch success</strong> — Can the proxy HTML be retrieved from SEC EDGAR?</li>
          <li style={{ marginBottom: 4 }}><strong>Table discovery</strong> — Can the Summary Compensation Table be located in the HTML?</li>
          <li style={{ marginBottom: 4 }}><strong>Column matching</strong> — Do the table headers match expected patterns (salary, bonus, stock awards, etc.)?</li>
          <li style={{ marginBottom: 4 }}><strong>Parse quality</strong> — Are executives and compensation values correctly extracted?</li>
          <li style={{ marginBottom: 4 }}><strong>Director table</strong> — Is the Director Compensation Table found and parsed?</li>
          <li><strong>CEO Pay Ratio</strong> — Is the pay ratio extracted from the document text?</li>
        </ul>
      </GuideSection>

      <GuideSection title="When to Run This Audit" number="2">
        <li>After modifying the compensation parser (<code style={{ ...code, background: C.bg }}>compensation.js</code>)</li>
        <li>When a specific company shows "No Executive Compensation data found"</li>
        <li>When investigating whether a parsing change improved or regressed coverage</li>
        <li>Periodically to establish a baseline pass rate across diverse company types</li>
      </GuideSection>

      <GuideSection title="Understanding the Results" number="3">
        <div style={{ marginBottom: 10 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>Status categories:</strong>
        </div>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 6 }}>
            <strong style={{ color: '#16a34a' }}>PASS</strong> — Full compensation data extracted (3+ executives, 2+ years)
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong style={{ color: '#d97706' }}>PARTIAL</strong> — Data extracted but incomplete (fewer executives or years than expected)
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong style={{ color: '#dc2626' }}>TABLE_NOT_FOUND</strong> — No table with "Summary Compensation Table"
            heading found in the proxy HTML. The document has tables, but none matched the heading search.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong style={{ color: '#dc2626' }}>HEADER_MISMATCH</strong> — A table with the right heading was found,
            but the column headers didn't match expected patterns. The company uses non-standard column labels.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong style={{ color: '#dc2626' }}>PARSE_EMPTY</strong> — Table found and headers matched, but the
            row parser failed to extract any executives. Likely a rowspan, name detection, or layout issue.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong style={{ color: '#dc2626' }}>NO_FILINGS</strong> — No DEF 14A proxy statements found in EDGAR.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong style={{ color: '#dc2626' }}>FETCH_FAILED</strong> — HTTP error fetching the proxy HTML (403, 404, etc.).
          </li>
          <li>
            <strong style={{ color: '#dc2626' }}>ERROR</strong> — Unexpected exception during processing.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Common Failure Patterns" number="4">
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>TABLE_NOT_FOUND (most common)</strong>
          <p style={{ margin: '4px 0' }}>
            The proxy HTML has tables, but none have "Summary Compensation Table" or "Summary of Compensation"
            in the nearby heading text. Some companies use different heading conventions or embed the table
            without a preceding heading.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>To investigate:</strong> Expand the Diagnostics section to see what heading texts
            were found near tables. This reveals what text the company actually uses.
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>HEADER_MISMATCH</strong>
          <p style={{ margin: '4px 0' }}>
            A table with the right heading was found, but the column headers don't match expected patterns.
            Some companies use different column labels ("Base Salary" vs "Salary", "Performance Bonus" vs
            "Non-Equity Incentive Plan Compensation") or split headers across multiple rows.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>To investigate:</strong> Expand Diagnostics to see the actual header cell texts and match counts.
          </p>
        </div>
        <div>
          <strong style={{ color: C.text, fontSize: 12 }}>PARSE_EMPTY</strong>
          <p style={{ margin: '4px 0' }}>
            The table and headers were found, but no executives were extracted. This usually means the
            row structure is different than expected — name cells without rowspan, unusual title/name
            formatting, or nested layout tables contaminating the data rows.
          </p>
        </div>
      </GuideSection>

      <GuideSection title="How to Fix Parsing Failures" number="5">
        <div style={{ marginBottom: 10 }}>
          Based on the failure category, add the appropriate fix to{' '}
          <code style={{ ...code, background: C.bg }}>src/engines/compensation.js</code>:
        </div>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>TABLE_NOT_FOUND:</strong> Add the company's actual heading text to the search patterns in{' '}
            <code style={{ ...code, background: C.bg }}>findSummaryCompensationTable()</code>. Look at the
            <code style={{ ...code, background: C.bg }}>isSCT</code> condition and add new{' '}
            <code style={{ ...code, background: C.bg }}>heading.includes('...')</code> checks.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>HEADER_MISMATCH:</strong> Add new pattern entries to{' '}
            <code style={{ ...code, background: C.bg }}>EXEC_COLUMN_PATTERNS</code>. Each entry has a{' '}
            <code style={{ ...code, background: C.bg }}>patterns</code> array — add the company's column text as a
            new pattern string.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>PARSE_EMPTY:</strong> This requires deeper investigation — open the proxy HTML in
            browser DevTools and inspect the table structure. Look for unusual rowspan patterns,
            name cells that don't pass <code style={{ ...code, background: C.bg }}>looksLikeName()</code>,
            or nested tables inside data cells.
          </li>
          <li>
            <strong>After any fix:</strong> Re-run this audit to verify the fix improves coverage without
            breaking other companies.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Investigating a Specific Company" number="6">
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            Go to EDGAR: search the company's CIK at{' '}
            <code style={{ ...code, background: C.bg }}>sec.gov/cgi-bin/browse-edgar</code>
          </li>
          <li style={{ marginBottom: 8 }}>
            Find the most recent DEF 14A filing in the filing list
          </li>
          <li style={{ marginBottom: 8 }}>
            Open the primary document (the HTML file, not the index page)
          </li>
          <li style={{ marginBottom: 8 }}>
            Search for "Summary Compensation Table" in the document — note the exact heading text
          </li>
          <li style={{ marginBottom: 8 }}>
            Inspect the table HTML structure in DevTools:
            <ul style={{ paddingLeft: 16, marginTop: 4 }}>
              <li>How many header rows?</li>
              <li>Do name cells use rowspan?</li>
              <li>Are there spacer cells between value columns?</li>
              <li>Are there nested layout tables wrapping the data table?</li>
            </ul>
          </li>
          <li>
            Compare what you find against the parsing logic in{' '}
            <code style={{ ...code, background: C.bg }}>compensation.js</code> to identify the mismatch
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="Quick File Reference" number="7">
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 12,
        }}>
          <span style={{ fontWeight: 600, color: C.text }}>Compensation engine</span>
          <code style={{ ...code, background: C.bg }}>src/engines/compensation.js</code>
          <span style={{ fontWeight: 600, color: C.text }}>Audit function</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>export async function auditCompensation</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>Table discovery</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>findSummaryCompensationTable</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>Column patterns</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>EXEC_COLUMN_PATTERNS</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>Heading patterns</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>isSCT</code> in findSummaryCompensationTable</span>
          <span style={{ fontWeight: 600, color: C.text }}>Validation companies</span>
          <code style={{ ...code, background: C.bg }}>src/data/validationCompanies.js</code>
          <span style={{ fontWeight: 600, color: C.text }}>UI component</span>
          <code style={{ ...code, background: C.bg }}>src/components/CompAudit.jsx</code>
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
