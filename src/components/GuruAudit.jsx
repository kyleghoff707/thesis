import { useState, useCallback } from 'react';
import { C } from '../theme';
import { GURUS, auditGurus } from '../engines/gurus';

export default function GuruAudit() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: GURUS.length, name: '' });

  const run = useCallback(async () => {
    setRunning(true);
    setResults(null);
    const res = await auditGurus((current, total, name) => {
      setProgress({ current, total, name });
    });
    setResults(res);
    setRunning(false);
  }, []);

  const clean = results?.filter(r => r.ok) || [];
  const issues = results?.filter(r => !r.ok) || [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Guru Audit</h2>
      <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
        Validates all {GURUS.length} guru CIKs against EDGAR — checks fund names, filing freshness, and portfolio status.
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
        {running ? `Checking ${progress.current}/${progress.total} — ${progress.name}...` : 'Run Audit'}
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
            display: 'flex', gap: 16, marginBottom: 24,
            padding: '12px 16px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
          }}>
            <Stat label="Clean" value={clean.length} color="#16a34a" />
            <Stat label="Issues" value={issues.length} color={issues.length > 0 ? '#dc2626' : C.textMuted} />
            <Stat label="Total" value={results.length} color={C.text} />
          </div>

          {/* Issues first */}
          {issues.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#dc2626', marginBottom: 10 }}>
                Issues ({issues.length})
              </h3>
              {issues.map(r => (
                <GuruRow key={r.cik} r={r} />
              ))}
            </div>
          )}

          {/* Clean */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#16a34a', marginBottom: 10 }}>
              Clean ({clean.length})
            </h3>
            {clean.map(r => (
              <GuruRow key={r.cik} r={r} />
            ))}
          </div>
        </>
      )}

      {/* Troubleshooting guide — always visible */}
      <TroubleshootingGuide />
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

function GuruRow({ r }) {
  const hasIssues = r.issues.length > 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '8px 12px', marginBottom: 4, borderRadius: 6,
      background: hasIssues ? 'rgba(220,38,38,0.06)' : 'rgba(22,163,74,0.04)',
      border: `1px solid ${hasIssues ? 'rgba(220,38,38,0.15)' : 'rgba(22,163,74,0.1)'}`,
    }}>
      <span style={{ fontSize: 13, width: 18, flexShrink: 0, marginTop: 1 }}>
        {hasIssues ? '⚠️' : '✅'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.name}</span>
          <span style={{ fontSize: 11, color: C.textMuted }}>{r.fund}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.textMuted, marginTop: 2 }}>
          {r.reportDate && <span>Report: {r.reportDate}</span>}
          {r.positions != null && <span>{r.positions} positions</span>}
          {r.edgarName && r.edgarName !== r.fund && (
            <span>EDGAR: "{r.edgarName}"</span>
          )}
        </div>
        {hasIssues && (
          <div style={{ marginTop: 4 }}>
            {r.issues.map((issue, i) => (
              <div key={i} style={{ fontSize: 12, color: '#dc2626', padding: '1px 0' }}>
                {issue}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Troubleshooting Guide ──────────────────────────────────────────

const code = { fontSize: 11, padding: '2px 5px', borderRadius: 3, fontFamily: 'monospace' };

function TroubleshootingGuide() {
  return (
    <div style={{ marginTop: 40, paddingTop: 28, borderTop: `1px solid ${C.border}` }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>
        Troubleshooting Guide
      </h3>

      <GuideSection title="When to Run This Audit" number="1">
        <li>After updating the guru list (adding or removing a guru)</li>
        <li>If a guru's portfolio suddenly shows 0 positions or fails to load</li>
        <li>Every few months to check that all 43 guru CIKs are still active and filing 13Fs</li>
        <li>If you suspect a fund has changed its name, merged, or migrated to a new entity</li>
      </GuideSection>

      <GuideSection title="Understanding the Results" number="2">
        <p style={{ marginBottom: 8 }}>
          The audit checks each of the 43 gurus against live EDGAR data. Three things are validated:
        </p>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 6 }}>
            <strong>Fund name match</strong> — Compares the fund name stored in our guru list against the name
            EDGAR has on file. Names are fuzzy-matched (strips legal suffixes like LLC, LP, Inc, common words
            like "Capital", "Management", "Partners"). A mismatch means the entity may have renamed or we have
            the wrong CIK.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Filing freshness</strong> — Checks that the most recent 13F filing is less than 180 days old.
            If a fund hasn't filed in over 6 months, they may have stopped filing (closed fund, switched entity,
            fell below the $100M AUM threshold, or switched to a different filing type).
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Portfolio status</strong> — Fetches the actual infotable XML and counts positions. Flags
            empty portfolios ("No Securities") which could indicate the fund has exited all positions or the
            filing is a shell.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Common Issues and How to Fix Them" number="3">
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>Name mismatch</strong>
          <p style={{ margin: '4px 0' }}>
            This means the fund name we have stored doesn't match what EDGAR shows. Usually harmless — funds
            often have slightly different legal names vs common names. But if the EDGAR name is completely
            different, the CIK may have been reassigned or the fund restructured.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>To fix:</strong> Open <code style={{ ...code, background: C.bg }}>src/engines/gurus.js</code>,
            search for <code style={{ ...code, background: C.bg }}>export const GURUS</code>, find the guru entry,
            and update the <code style={{ ...code, background: C.bg }}>fund</code> field to match the EDGAR name.
            If the entire entity changed, you'll need to update the <code style={{ ...code, background: C.bg }}>cik</code> too.
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>Stale filing (over 180 days)</strong>
          <p style={{ margin: '4px 0' }}>
            13F filings are due 45 days after each quarter end (mid-Feb, mid-May, mid-Aug, mid-Nov). If a guru
            hasn't filed in 6+ months, something changed. Common reasons:
          </p>
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <li>Fund closed or wound down</li>
            <li>Fund dropped below the $100M AUM threshold (no longer required to file 13F)</li>
            <li>Fund migrated to a new legal entity with a different CIK (this is the most common fixable case)</li>
            <li>Manager retired or fund restructured</li>
          </ul>
          <p style={{ margin: '4px 0' }}>
            <strong>To investigate:</strong> Go to EDGAR directly — search the guru's name at{' '}
            <code style={{ ...code, background: C.bg }}>sec.gov/cgi-bin/browse-edgar</code>{' '}
            and look for a newer entity filing 13F-HR forms. If you find one, update the CIK in the GURUS array.
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>No 13F filings found</strong>
          <p style={{ margin: '4px 0' }}>
            The CIK exists on EDGAR but has never filed a 13F. This means we have the wrong CIK entirely.
            The person/fund may file under a different entity.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>To fix:</strong> Search EDGAR for the correct filing entity. Many managers file under
            their fund management company, not their personal name. Look for 13F-HR forms specifically.
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>Empty portfolio ("No Securities")</strong>
          <p style={{ margin: '4px 0' }}>
            The filing exists but contains no holdings. This could mean the fund has liquidated all positions,
            or it's a confidential treatment filing where holdings will be disclosed later via an amendment (13F-HR/A).
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>Action:</strong> Wait a quarter and re-check. If still empty after 2 quarters, the fund
            may have closed. Consider removing the guru from the list or replacing with their new entity.
          </p>
        </div>
        <div>
          <strong style={{ color: C.text, fontSize: 12 }}>EDGAR returned 404 or error</strong>
          <p style={{ margin: '4px 0' }}>
            The CIK doesn't exist on EDGAR at all. This is a data entry error — the CIK number is wrong.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>To fix:</strong> Look up the correct CIK on EDGAR's company search page. CIKs are 10-digit
            numbers, zero-padded (e.g., <code style={{ ...code, background: C.bg }}>0001067983</code> for
            Berkshire Hathaway).
          </p>
        </div>
      </GuideSection>

      <GuideSection title="How to Add a New Guru" number="4">
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 10 }}>
            <strong>Find the CIK.</strong> Go to EDGAR's company search{' '}
            (<code style={{ ...code, background: C.bg }}>sec.gov/cgi-bin/browse-edgar</code>).
            Search for the fund management company name (not the manager's personal name). Look for an entity
            that files <code style={{ ...code, background: C.bg }}>13F-HR</code> forms. The CIK is in the URL and
            page header. Zero-pad it to 10 digits.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>Get the fund name.</strong> Use the exact name shown on EDGAR's entity page (the "Company Name" field).
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>Add the entry.</strong> Open <code style={{ ...code, background: C.bg }}>src/engines/gurus.js</code>,
            search for <code style={{ ...code, background: C.bg }}>export const GURUS</code>, and add a new object:
            <div style={{
              marginTop: 6, padding: '8px 12px', borderRadius: 6,
              background: C.bg, border: `1px solid ${C.border}`,
              fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
            }}>
              {'{ name: \'Manager Name\', fund: \'Fund Legal Name\', cik: \'0001234567\' },'}
            </div>
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>(Optional) Add N-PORT data.</strong> If the fund is a registered mutual fund or ETF, it also
            files N-PORT forms (monthly portfolio data including cash positions). Add{' '}
            <code style={{ ...code, background: C.bg }}>fundCik</code> and{' '}
            <code style={{ ...code, background: C.bg }}>seriesId</code> fields. The fundCik is the CIK of the trust
            (which may differ from the management company CIK). The seriesId is in the N-PORT filing XML.
          </li>
          <li>
            <strong>Run this audit</strong> to verify the new guru's CIK resolves correctly and has recent filings.
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="How to Remove or Replace a Guru" number="5">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>To remove:</strong> Open <code style={{ ...code, background: C.bg }}>src/engines/gurus.js</code>,
            find the guru entry in the <code style={{ ...code, background: C.bg }}>GURUS</code> array, and delete the
            entire object (the line starting with {'{'} and ending with {'}'}). Save the file.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>To replace (entity migration):</strong> Don't delete — just update the{' '}
            <code style={{ ...code, background: C.bg }}>cik</code> and{' '}
            <code style={{ ...code, background: C.bg }}>fund</code> fields to point to the new entity. This is common
            when a manager moves to a new fund (e.g., Guy Spier moved from Aquamarine Capital to Aquamarine Zurich AG).
          </li>
          <li>
            <strong>Clear cached data</strong> after any change — the old CIK's cached data won't match.
            Open browser DevTools Console and run:
            <div style={{
              marginTop: 6, padding: '8px 12px', borderRadius: 6,
              background: C.bg, border: `1px solid ${C.border}`,
              fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
            }}>
              {`Object.keys(localStorage).filter(k => k.startsWith('guru-')).forEach(k => localStorage.removeItem(k));`}
            </div>
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Known Entity Migrations (Historical)" number="6">
        <p style={{ marginBottom: 8 }}>
          These gurus have changed filing entities in the past. If they do it again, the same pattern will
          apply — find the new CIK, update the entry, clear cache.
        </p>
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: 12,
        }}>
          <span style={{ fontWeight: 600, color: C.text }}>Guy Spier</span>
          <span style={{ color: C.textMuted }}>Aquamarine Capital (old) → Aquamarine Zurich AG (current, 2023)</span>
          <span style={{ fontWeight: 600, color: C.text }}>Jeffrey Ubben</span>
          <span style={{ color: C.textMuted }}>Inclusive Capital Partners (old) → ValueAct Holdings (current)</span>
          <span style={{ fontWeight: 600, color: C.text }}>David Einhorn</span>
          <span style={{ color: C.textMuted }}>Greenlight Capital (old) → DME Capital Management (current)</span>
        </div>
      </GuideSection>

      <GuideSection title="Quick File Reference" number="7">
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 12,
        }}>
          <span style={{ fontWeight: 600, color: C.text }}>Guru list (43 entries)</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>export const GURUS</code> in <code style={{ ...code, background: C.bg }}>src/engines/gurus.js</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>Audit function</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>export async function auditGurus</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>Staleness threshold</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>STALE_DAYS</code> (currently 180 days)</span>
          <span style={{ fontWeight: 600, color: C.text }}>Name matching logic</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>normalizeForAudit</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>CLI version</span>
          <code style={{ ...code, background: C.bg }}>validation/scripts/audit-gurus.mjs</code>
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
