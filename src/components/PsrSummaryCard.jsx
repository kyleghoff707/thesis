import { useState, useEffect } from 'react';
import { C } from '../theme';

export default function PsrSummaryCard({ ticker }) {
  const [summary, setSummary] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    fetch(`/api/thesis/reports/${encodeURIComponent(ticker)}/psr-summary`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setSummary(d))
      .catch(() => {});
  }, [ticker]);

  if (!summary) return null;

  const { completed, failed, total, agents, transcripts } = summary;
  const allGood = failed === 0;
  const statusColor = allGood ? C.green : C.yellow;

  // Count annual vs quarterly agents
  const annualAgents = (agents || []).filter(a => a.label?.includes('annual'));
  const annualComplete = annualAgents.filter(a => a.status === 'complete').length;
  const quarterlyAgents = (agents || []).filter(a => a.label?.includes('quarterly') || a.label?.includes('transcript'));
  const quarterlyComplete = quarterlyAgents.filter(a => a.status === 'complete').length;

  return (
    <div style={{
      border: '1px solid ' + (allGood ? C.green : C.border),
      borderRadius: 8,
      background: C.bgCard,
      padding: '16px 20px',
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {allGood
              ? <polyline points="20 6 9 17 4 12" />
              : <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>
            }
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            Primary Source Reading Complete
          </span>
        </div>
        <span style={{ fontSize: 12, color: statusColor, fontWeight: 600 }}>
          {completed}/{total} agents completed
        </span>
      </div>

      {/* Description — what the PSR agents actually did */}
      <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6, marginBottom: failed > 0 ? 8 : 0 }}>
        {annualAgents.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: annualComplete === annualAgents.length ? C.green : C.yellow, marginRight: 6 }}>
              {annualComplete === annualAgents.length ? '\u2713' : '\u26A0'}
            </span>
            {annualComplete}/{annualAgents.length} annual readers each analyzed a full 10-K annual report ({annualAgents.length} years of SEC filings)
          </div>
        )}
        {quarterlyAgents.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: quarterlyComplete === quarterlyAgents.length ? C.green : C.yellow, marginRight: 6 }}>
              {quarterlyComplete === quarterlyAgents.length ? '\u2713' : '\u26A0'}
            </span>
            {quarterlyComplete}/{quarterlyAgents.length} quarterly readers analyzed recent 10-Q filings and earnings call transcripts
          </div>
        )}
        {transcripts && (
          <div>
            <span style={{ color: transcripts.available ? C.green : C.yellow, marginRight: 6 }}>
              {transcripts.available ? '\u2713' : '\u26A0'}
            </span>
            {transcripts.available
              ? `${transcripts.count} earnings call transcript${transcripts.count !== 1 ? 's' : ''} loaded and analyzed`
              : 'No earnings call transcripts available -- analysis based on SEC filings only'}
          </div>
        )}
      </div>

      {/* Expand/collapse toggle */}
      <div
        onClick={() => setExpanded(prev => !prev)}
        style={{ fontSize: 11, color: C.accent, cursor: 'pointer', marginTop: 6, fontWeight: 600 }}
      >
        {expanded ? 'Hide details' : 'Show filing details'}
      </div>

      {/* Filing detail list */}
      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + C.borderLight }}>
          {(agents || []).flatMap((a, i) => {
            const icon = a.status === 'complete' ? '\u2713' : '\u2717';
            const color = a.status === 'complete' ? C.green : C.red;
            const inner = a.label?.match(/\((.+)\)/)?.[1] || a.label;

            // Split comma-separated items into individual rows
            const items = inner.split(',').map(s => s.trim()).filter(Boolean);
            return items.map((item, j) => {
              // Determine type from the item content
              let type = '10-Q';
              if (item.startsWith('10-K')) type = '10-K';
              else if (item.includes('transcript') || /^\d{4}Q\d$/.test(item)) type = 'Transcript';
              // Clean up the display text
              const display = item.replace('transcripts: ', '');
              return (
                <div key={`${i}-${j}`} style={{
                  fontSize: 11,
                  color: C.textSecondary,
                  padding: '2px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{ color, flexShrink: 0 }}>{icon}</span>
                  <span style={{ color: C.textMuted, width: 70, flexShrink: 0 }}>{type}</span>
                  <span>{display}</span>
                </div>
              );
            });
          })}
        </div>
      )}

      {/* Failure details */}
      {failed > 0 && (
        <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid ' + C.borderLight }}>
          {agents.filter(a => a.status === 'failed').map((agent, i) => (
            <div key={i} style={{
              fontSize: 11,
              color: C.red,
              padding: '2px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span>&#x2717;</span>
              <span>{agent.label}</span>
              <span style={{ color: C.textMuted }}>{agent.error?.substring(0, 80)}{agent.error?.length > 80 ? '...' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
