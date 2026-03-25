import { C } from '../theme';
import VerdictBadge from './VerdictBadge.jsx';
import ConfidenceBadge from './ConfidenceBadge.jsx';
import RedFlagCallout from './RedFlagCallout.jsx';
import { renderTextWithCitations } from './CitationTooltip.jsx';

// Known financial acronyms for title formatting
const ACRONYMS = {
  mos: 'MOS',
  pbt: 'PBT',
  fgr: 'FGR',
  pe: 'P/E',
  eps: 'EPS',
  fcf: 'FCF',
  roe: 'ROE',
  roic: 'ROIC',
  roa: 'ROA',
};

// Convert camelCase key to Title Case with acronym handling
function camelToTitle(str) {
  if (!str) return '';
  // Insert space before each uppercase letter that follows a lowercase letter
  // Also handle sequences of uppercase letters (e.g., FGR) by inserting space before
  // a sequence of uppercase letters that precede a lowercase letter
  const spaced = str
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // lowercase followed by uppercase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'); // consecutive uppercase before lowercase transition

  // Capitalize first letter of each word, then apply acronym map
  const words = spaced.split(' ').map(word => {
    const lower = word.toLowerCase();
    if (ACRONYMS[lower]) return ACRONYMS[lower];
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  return words.join(' ');
}

// Format data value based on key and type
function formatDataValue(key, value) {
  if (value == null) return '--';

  const keyLower = key.toLowerCase();
  const isFGR = keyLower.includes('fgr');
  const isPrice = keyLower.includes('price');

  // Range object with low/high
  if (typeof value === 'object' && value.low != null && value.high != null) {
    if (isFGR) {
      return `${(value.low * 100).toFixed(1)}% - ${(value.high * 100).toFixed(1)}%`;
    }
    return `$${value.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - $${value.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Single number
  if (typeof value === 'number') {
    if (isFGR) return `${(value * 100).toFixed(1)}%`;
    if (isPrice) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return value.toFixed(2);
  }

  // String
  if (typeof value === 'string') return value;

  return '--';
}

// Severity color dot mapping
function getSeverityColor(severity) {
  const map = {
    high: C.red,
    medium: C.yellow,
    low: C.green,
  };
  return map[severity] || C.textMuted;
}

export default function SectionRenderer({ section, sectionId, onCitationClick }) {
  if (!section) return null;

  const hasData = section.data && typeof section.data === 'object' && Object.keys(section.data).length > 0;
  const hasNarrative = section.narrative && typeof section.narrative === 'string' && section.narrative.length > 0;
  const hasTables = section.tables && Array.isArray(section.tables) && section.tables.length > 0;
  const hasCrossFindings = section.crossCuttingFindings && Array.isArray(section.crossCuttingFindings) && section.crossCuttingFindings.length > 0;

  return (
    <div
      id={sectionId}
      style={{
        border: '1px solid ' + C.border,
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 20,
        background: C.bgCard,
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)',
        scrollMarginTop: 120,
      }}
    >
      {/* 1. Section Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid ' + C.border,
        paddingBottom: 12,
        marginBottom: 16,
      }}>
        {section.sectionNumber != null && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: C.badge,
            color: C.badgeText,
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {section.sectionNumber}
          </span>
        )}
        <span style={{
          fontSize: 16,
          fontWeight: 700,
          color: C.text,
          flex: 1,
        }}>
          {section.title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <VerdictBadge verdict={section.verdict} />
          <ConfidenceBadge confidence={section.confidence} />
        </div>
      </div>

      {/* 2. Summary Callout */}
      {section.summary && (
        <div style={{
          background: C.accentLight,
          borderLeft: '3px solid ' + C.accent,
          padding: '10px 14px',
          borderRadius: '0 6px 6px 0',
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 13,
            color: C.text,
            lineHeight: 1.6,
          }}>
            {section.summary}
          </div>
        </div>
      )}

      {/* 3. Verdict Rationale (Primary Prose) */}
      {section.verdictRationale && (
        <div style={{
          fontSize: 13,
          color: C.text,
          lineHeight: 1.7,
          marginBottom: 16,
        }}>
          {renderTextWithCitations(section.verdictRationale, section.citations, onCitationClick)}
        </div>
      )}

      {/* 4. Narrative (Optional) */}
      {hasNarrative && (
        <div style={{
          fontSize: 13,
          color: C.text,
          lineHeight: 1.7,
          marginBottom: 16,
          borderTop: '1px solid ' + C.borderLight,
          paddingTop: 12,
        }}>
          {renderTextWithCitations(section.narrative, section.citations, onCitationClick)}
        </div>
      )}

      {/* 5. Structured Data Grid */}
      {hasData && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}>
          {Object.entries(section.data).map(([key, value]) => (
            <div key={key} style={{
              background: C.bgCard,
              border: '1px solid ' + C.border,
              borderRadius: 6,
              padding: '10px 12px',
            }}>
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                color: C.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 4,
              }}>
                {camelToTitle(key)}
              </div>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.text,
              }}>
                {formatDataValue(key, value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6. Tables (Optional) */}
      {hasTables && section.tables.map((table, ti) => (
        <div key={ti} style={{ marginBottom: 16 }}>
          {table.title && (
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: C.text,
              marginBottom: 8,
            }}>
              {table.title}
            </div>
          )}
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
          }}>
            {table.headers && (
              <thead>
                <tr>
                  {table.headers.map((header, hi) => (
                    <th key={hi} style={{
                      padding: '8px 12px',
                      borderBottom: '2px solid ' + C.border,
                      fontSize: 12,
                      fontWeight: 600,
                      color: C.textMuted,
                      textAlign: 'left',
                    }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {table.rows && table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid ' + C.borderLight,
                      fontSize: 12,
                      color: C.text,
                    }}>
                      {cell != null ? cell : '--'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* 7. Cross-Cutting Findings */}
      {hasCrossFindings && (
        <div style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.textMuted,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Cross-Cutting Findings
          </div>
          {section.crossCuttingFindings.map((finding, fi) => (
            <div key={fi} style={{
              background: C.bg,
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 6,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: getSeverityColor(finding.severity),
                  marginTop: 5,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 12,
                    color: C.text,
                    lineHeight: 1.5,
                  }}>
                    {finding.finding}
                  </div>
                  {finding.source && (
                    <div style={{
                      fontSize: 11,
                      color: C.textMuted,
                      marginTop: 2,
                    }}>
                      {finding.source}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 8. Red Flags */}
      <RedFlagCallout flags={section.redFlags} />
    </div>
  );
}

export const _testExports = { camelToTitle, formatDataValue };
