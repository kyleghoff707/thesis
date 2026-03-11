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
