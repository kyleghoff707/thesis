import { useState, useCallback } from 'react';
import { C } from '../theme';
import { GURUS } from '../engines/gurus';
import { auditNport } from '../engines/nport';

export default function NportAudit() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: GURUS.length, name: '' });

  const run = useCallback(async () => {
    setRunning(true);
    setResults(null);
    const res = await auditNport(GURUS, (current, total, name) => {
      setProgress({ current, total, name });
    });
    setResults(res);
    setRunning(false);
  }, []);

  const configured = results?.filter(r => r.hasConfig) || [];
  const unconfigured = results?.filter(r => !r.hasConfig) || [];
  const configuredOk = configured.filter(r => r.ok);
  const configuredIssues = configured.filter(r => !r.ok);
  const discoveries = unconfigured.filter(r => r.discoveries.length > 0);
  const noNport = unconfigured.filter(r => r.discoveries.length === 0);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>N-PORT Audit</h2>
      <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
        Validates N-PORT fund mappings for configured gurus and scans all {GURUS.length} gurus for undiscovered N-PORT filings.
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
          <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
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
            display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap',
            padding: '12px 16px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
          }}>
            <Stat label="Configured" value={configured.length} color={C.accent} />
            <Stat label="Valid" value={configuredOk.length} color="#16a34a" />
            <Stat label="Issues" value={configuredIssues.length} color={configuredIssues.length > 0 ? '#dc2626' : C.textMuted} />
            <Stat label="Discoveries" value={discoveries.length} color={discoveries.length > 0 ? '#d97706' : C.textMuted} />
            <Stat label="No N-PORT" value={noNport.length} color={C.textMuted} />
          </div>

          {/* Configured gurus with issues */}
          {configuredIssues.length > 0 && (
            <Section title="Configured — Issues" count={configuredIssues.length} color="#dc2626">
              {configuredIssues.map(r => <GuruRow key={r.cik} r={r} />)}
            </Section>
          )}

          {/* Discoveries */}
          {discoveries.length > 0 && (
            <Section title="Discoveries" count={discoveries.length} color="#d97706">
              {discoveries.map(r => <GuruRow key={r.cik} r={r} />)}
            </Section>
          )}

          {/* Configured gurus — clean */}
          {configuredOk.length > 0 && (
            <Section title="Configured — Valid" count={configuredOk.length} color="#16a34a">
              {configuredOk.map(r => <GuruRow key={r.cik} r={r} />)}
            </Section>
          )}

          {/* Unconfigured with no N-PORT — collapsed by default */}
          {noNport.length > 0 && (
            <CollapsibleSection title={`No N-PORT (${noNport.length})`} color={C.textMuted}>
              {noNport.map(r => <GuruRow key={r.cik} r={r} />)}
            </CollapsibleSection>
          )}
        </>
      )}

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

function Section({ title, count, color, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color, marginBottom: 10 }}>
        {title} ({count})
      </h3>
      {children}
    </div>
  );
}

function CollapsibleSection({ title, color, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 24 }}>
      <h3
        onClick={() => setOpen(!open)}
        style={{
          fontSize: 14, fontWeight: 600, color, marginBottom: 10,
          cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ fontSize: 10, transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
        {title}
      </h3>
      {open && children}
    </div>
  );
}

function GuruRow({ r }) {
  const hasIssues = r.issues.length > 0;
  const hasDiscoveries = r.discoveries.length > 0;
  const isClean = !hasIssues && !hasDiscoveries;

  let bgColor, borderColor;
  if (hasIssues) {
    bgColor = 'rgba(220,38,38,0.06)';
    borderColor = 'rgba(220,38,38,0.15)';
  } else if (hasDiscoveries) {
    bgColor = 'rgba(217,119,6,0.06)';
    borderColor = 'rgba(217,119,6,0.15)';
  } else {
    bgColor = 'rgba(22,163,74,0.04)';
    borderColor = 'rgba(22,163,74,0.1)';
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '8px 12px', marginBottom: 4, borderRadius: 6,
      background: bgColor, border: `1px solid ${borderColor}`,
    }}>
      <span style={{ fontSize: 13, width: 18, flexShrink: 0, marginTop: 1 }}>
        {hasIssues ? '\u26a0\ufe0f' : hasDiscoveries ? '\u{1F50D}' : '\u2705'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.name}</span>
          <span style={{ fontSize: 11, color: C.textMuted }}>{r.fund}</span>
          {r.hasConfig && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
              background: C.accent + '20', color: C.accent,
            }}>N-PORT</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.textMuted, marginTop: 2, flexWrap: 'wrap' }}>
          {r.seriesName && <span>Series: {r.seriesName}</span>}
          {r.reportDate && <span>Report: {r.reportDate}</span>}
          {r.trustName && <span>Trust: {r.trustName}</span>}
          {r.hasConfig && <span>Series ID: {r.seriesId}</span>}
          {r.nportCount > 0 && <span>{r.nportCount} filing(s)</span>}
        </div>
        {hasIssues && (
          <div style={{ marginTop: 4 }}>
            {r.issues.map((issue, i) => (
              <div key={i} style={{ fontSize: 12, color: '#dc2626', padding: '1px 0' }}>{issue}</div>
            ))}
          </div>
        )}
        {hasDiscoveries && (
          <div style={{ marginTop: 4 }}>
            {r.discoveries.map((d, i) => (
              <div key={i} style={{ fontSize: 12, color: '#d97706', padding: '1px 0' }}>{d}</div>
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

      <GuideSection title="What This Audit Checks" number="1">
        <li><strong>Configured gurus (13)</strong> — Validates that the trust CIK exists, the series ID matches recent NPORT-P filings, and filings are fresh (within 90 days).</li>
        <li><strong>All other gurus (30)</strong> — Scans each guru's management company CIK for any NPORT-P filings. If found, it's flagged as a discovery — the guru may have a registered fund we haven't mapped yet.</li>
      </GuideSection>

      <GuideSection title="When to Run This Audit" number="2">
        <li>After adding a new guru to check if they file N-PORT</li>
        <li>If a guru's cash position data stops appearing</li>
        <li>Every few months to catch new fund registrations or series changes</li>
        <li>If a trust reorganizes or merges fund series</li>
      </GuideSection>

      <GuideSection title="Understanding Results" number="3">
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>Configured — Valid</strong>
          <p style={{ margin: '4px 0' }}>
            The trust CIK exists, the series ID is found in recent filings, and filings are fresh. Everything is working.
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: '#dc2626', fontSize: 12 }}>Configured — Issues</strong>
          <p style={{ margin: '4px 0' }}>
            Something is wrong with a configured mapping. The trust CIK may be invalid, the series ID may not match
            any recent filings, or filings may be stale. See specific issue text for details.
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: '#d97706', fontSize: 12 }}>Discoveries</strong>
          <p style={{ margin: '4px 0' }}>
            A guru without N-PORT config has NPORT-P filings under their management company CIK. This could mean they
            manage a registered mutual fund or ETF. Consider adding <code style={{ ...code, background: C.bg }}>fundCik</code> and{' '}
            <code style={{ ...code, background: C.bg }}>seriesId</code> to their GURUS entry to get cash position data.
          </p>
        </div>
        <div>
          <strong style={{ color: C.textMuted, fontSize: 12 }}>No N-PORT</strong>
          <p style={{ margin: '4px 0' }}>
            No NPORT-P filings found under this guru's CIK. Expected for hedge funds and other non-registered
            investment vehicles. These gurus only have 13F data.
          </p>
        </div>
      </GuideSection>

      <GuideSection title="How to Add N-PORT for a Discovery" number="4">
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 10 }}>
            <strong>Note the series ID</strong> from the discovery message (e.g., <code style={{ ...code, background: C.bg }}>S000065131</code>).
            If the trust has multiple series, you'll need to identify which fund belongs to the guru.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>Determine the fund CIK.</strong> If the discovery was found under the guru's management CIK, the
            <code style={{ ...code, background: C.bg }}>fundCik</code> may be the same CIK, or it may be a separate trust CIK.
            Check the N-PORT XML filing header for the trust entity CIK.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>Update the guru entry</strong> in <code style={{ ...code, background: C.bg }}>src/engines/gurus.js</code>.
            Add <code style={{ ...code, background: C.bg }}>fundCik</code> and <code style={{ ...code, background: C.bg }}>seriesId</code> fields:
            <div style={{
              marginTop: 6, padding: '8px 12px', borderRadius: 6,
              background: C.bg, border: `1px solid ${C.border}`,
              fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
            }}>
              {"{ name: 'Guru', fund: '...', cik: '...', fundCik: '0001234567', seriesId: 'S000012345' },"}
            </div>
          </li>
          <li>
            <strong>Re-run this audit</strong> to verify the new mapping resolves correctly.
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="Common Issues" number="5">
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>Series not found in recent filings</strong>
          <p style={{ margin: '4px 0' }}>
            The trust still files NPORT-P but the specific series ID doesn't match. This happens when a trust
            reorganizes, merges, or closes a fund series. Look at the trust's recent NPORT-P filings on EDGAR
            to find the new series ID.
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: C.text, fontSize: 12 }}>Trust CIK returned 404</strong>
          <p style={{ margin: '4px 0' }}>
            The trust CIK no longer exists on EDGAR. The trust may have been dissolved or merged into another entity.
            Search EDGAR for the fund name to find the new trust CIK.
          </p>
        </div>
        <div>
          <strong style={{ color: C.text, fontSize: 12 }}>Stale N-PORT filings</strong>
          <p style={{ margin: '4px 0' }}>
            N-PORT is filed monthly (within 60 days of month-end). If the latest filing is over 90 days old,
            the fund may have closed, deregistered, or fallen below the reporting threshold. Check EDGAR directly.
          </p>
        </div>
      </GuideSection>

      <GuideSection title="Limitations" number="6">
        <li>
          <strong>Discovery only checks the management company CIK.</strong> Some trusts file under a completely
          different CIK (e.g., a separate trust entity). These won't be discovered automatically — they need to be
          found manually on EDGAR and added with the correct <code style={{ ...code, background: C.bg }}>fundCik</code>.
        </li>
        <li>
          <strong>Multi-series trusts.</strong> If a trust has multiple fund series, the audit only extracts the
          series ID from the most recent filing's XML. You may need to manually check other series if the guru
          manages multiple funds under one trust.
        </li>
      </GuideSection>

      <GuideSection title="Quick File Reference" number="7">
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 12,
        }}>
          <span style={{ fontWeight: 600, color: C.text }}>N-PORT engine</span>
          <code style={{ ...code, background: C.bg }}>src/engines/nport.js</code>
          <span style={{ fontWeight: 600, color: C.text }}>Guru list (fundCik/seriesId)</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>fundCik</code> in <code style={{ ...code, background: C.bg }}>src/engines/gurus.js</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>Audit function</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>export async function auditNport</code> in <code style={{ ...code, background: C.bg }}>src/engines/nport.js</code></span>
          <span style={{ fontWeight: 600, color: C.text }}>Staleness threshold</span>
          <span style={{ color: C.textMuted }}>Search for <code style={{ ...code, background: C.bg }}>NPORT_STALE_DAYS</code> (currently 90 days)</span>
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
