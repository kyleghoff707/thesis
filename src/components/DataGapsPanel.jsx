import { useState, useRef } from 'react';
import { C } from '../theme';

const SEVERITY_COLORS = { high: C.red, medium: C.yellow, low: C.green };

export default function DataGapsPanel({ gaps, onSaveResponse }) {
  const [expandedGap, setExpandedGap] = useState(null);
  const [urlInputs, setUrlInputs] = useState({});
  const fileRefs = useRef({});

  if (!gaps || gaps.length === 0) return null;

  return (
    <div style={{
      border: '1px solid ' + C.border,
      borderRadius: 8,
      background: C.bgCard,
      padding: '16px 20px',
      marginBottom: 20,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: C.textMuted,
        marginBottom: 12,
      }}>
        Data Gaps ({gaps.length})
      </div>
      {gaps.map((gap, i) => (
        <div key={gap.id || i}>
          <div style={{
            display: 'flex',
            gap: 10,
            padding: '10px 0',
            borderBottom: i < gaps.length - 1 ? '1px solid ' + C.borderLight : 'none',
          }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: SEVERITY_COLORS[gap.severity] || C.textMuted,
              marginTop: 5,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                {gap.description}
              </div>
              {gap.source && (
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  {gap.source}
                </div>
              )}
            </div>
            <span
              onClick={() => setExpandedGap(prev => prev === gap.id ? null : gap.id)}
              style={{
                fontSize: 12,
                color: C.accent,
                cursor: 'pointer',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                alignSelf: 'flex-start',
                marginTop: 2,
              }}
            >
              Add source
            </span>
          </div>
          {expandedGap === gap.id && (
            <div style={{ padding: '12px 0 12px 18px' }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Paste URL:</div>
              <input
                type="text"
                value={urlInputs[gap.id] || ''}
                onChange={e => setUrlInputs(prev => ({ ...prev, [gap.id]: e.target.value }))}
                placeholder="Paste URL to data source..."
                style={{
                  background: C.bgInput || C.bg,
                  border: '1px solid ' + C.border,
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 13,
                  color: C.text,
                  width: '100%',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', margin: '8px 0' }}>
                — or —
              </div>
              <button
                onClick={() => fileRefs.current[gap.id]?.click()}
                style={{
                  background: 'transparent',
                  border: '1px solid ' + C.border,
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.textSecondary,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Attach File
              </button>
              <input
                ref={el => { fileRefs.current[gap.id] = el; }}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx"
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files?.length && onSaveResponse) {
                    onSaveResponse(gap.id, 'file', e.target.files[0]);
                    setExpandedGap(null);
                  }
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  onClick={() => {
                    if (onSaveResponse && urlInputs[gap.id]) {
                      onSaveResponse(gap.id, 'url', urlInputs[gap.id]);
                    }
                    setExpandedGap(null);
                  }}
                  style={{
                    background: C.accent,
                    color: '#fff',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 11,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
