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

// ─── Data Grid Formatters ────────────────────────────────────

// Abbreviate large numbers: 1,234,567,890 → "1.23B"
function fmtNum(n) {
  if (n == null || isNaN(n)) return '--';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
  return sign + abs.toFixed(2);
}

function fmtDollar(n) {
  if (n == null || isNaN(n)) return '--';
  return '$' + fmtNum(n);
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '--';
  // If value is already in percentage form (e.g., 45.2), display as-is
  // If value is in decimal form (e.g., 0.452), multiply by 100
  const val = Math.abs(n) < 1 && Math.abs(n) > 0 ? n * 100 : n;
  return val.toFixed(1) + '%';
}

// Dollar-related key patterns
const DOLLAR_KEYS = /revenue|income|debt|assets|cash|capex|market_cap|book_value|earnings|fcf|price|cost|expense|profit|ebitda|ebit|sales|liabilities|equity|dividend|owner_earnings|sticker|buy_price/i;
// Percentage-related key patterns
const PCT_KEYS = /margin|ratio|yield|growth|return|pct|rate|roe|roic|roa|cagr/i;

// Format data value based on key and type — applies smart formatting
function formatDataValue(key, value) {
  if (value == null) return '--';
  if (value === '--' || value === '') return '--';

  const keyLower = (key || '').toLowerCase();
  const isFGR = keyLower.includes('fgr');
  const isPrice = keyLower.includes('price');

  // Range object with low/high
  if (typeof value === 'object' && value.low != null && value.high != null) {
    if (isFGR) {
      return `${(value.low * 100).toFixed(1)}% - ${(value.high * 100).toFixed(1)}%`;
    }
    return `$${value.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - $${value.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Single number — apply smart formatting based on key patterns
  if (typeof value === 'number') {
    if (isFGR) return `${(value * 100).toFixed(1)}%`;
    if (isPrice) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (DOLLAR_KEYS.test(keyLower)) return fmtDollar(value);
    if (PCT_KEYS.test(keyLower)) return fmtPct(value);
    if (Math.abs(value) > 1000) return fmtNum(value);
    return value.toFixed(2);
  }

  // String
  if (typeof value === 'string') return value;

  return '--';
}

// ─── Markdown Parsing ────────────────────────────────────────

// Parse basic markdown into React elements for narrative display
function parseMarkdown(text) {
  if (!text) return null;

  // Split into paragraphs on double newlines
  const blocks = text.split(/\n{2,}/);
  const elements = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi].trim();
    if (!block) continue;

    // Check for ## or ### heading (full block is a heading)
    if (block.startsWith('### ')) {
      elements.push(
        <div key={`h3-${bi}`} style={{
          fontSize: 14,
          fontWeight: 700,
          color: C.text,
          marginTop: bi > 0 ? 16 : 0,
          marginBottom: 8,
        }}>
          {block.slice(4)}
        </div>
      );
      continue;
    }
    if (block.startsWith('## ')) {
      elements.push(
        <div key={`h2-${bi}`} style={{
          fontSize: 15,
          fontWeight: 700,
          color: C.text,
          marginTop: bi > 0 ? 20 : 0,
          marginBottom: 10,
        }}>
          {block.slice(3)}
        </div>
      );
      continue;
    }

    // Check if block is a bullet list (all lines start with - )
    const lines = block.split('\n');
    const isBulletList = lines.every(line => line.trim().startsWith('- '));

    if (isBulletList) {
      elements.push(
        <div key={`ul-${bi}`} style={{ marginBottom: 12 }}>
          {lines.map((line, li) => (
            <div key={li} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              marginBottom: 4,
            }}>
              <span style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: C.textMuted,
                marginTop: 7,
                flexShrink: 0,
              }} />
              <span style={{ flex: 1 }}>{renderInline(line.trim().slice(2))}</span>
            </div>
          ))}
        </div>
      );
      continue;
    }

    // Regular paragraph — handle mixed content (some lines may be headings or bullets)
    // For simplicity, render as paragraph with inline bold handling
    elements.push(
      <p key={`p-${bi}`} style={{ margin: 0, marginBottom: 12 }}>
        {renderInline(block)}
      </p>
    );
  }

  return elements;
}

// Render inline markdown: **bold** handling, preserve [N] citation markers
function renderInline(text) {
  if (!text) return null;

  // Split on **bold** markers
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// Parse summary text — detect if it contains bullet points
function parseSummary(text) {
  if (!text) return null;

  const lines = text.split('\n').filter(l => l.trim());
  const hasBullets = lines.some(l => l.trim().startsWith('- '));

  if (hasBullets) {
    return lines.map((line, li) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        return (
          <div key={li} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginBottom: 4,
          }}>
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: C.textMuted,
              marginTop: 7,
              flexShrink: 0,
            }} />
            <span style={{ flex: 1 }}>{renderInline(trimmed.slice(2))}</span>
          </div>
        );
      }
      // Non-bullet lines in a mixed summary
      return <div key={li} style={{ marginBottom: 4 }}>{renderInline(trimmed)}</div>;
    });
  }

  // Plain text summary — render with inline bold
  return <span>{renderInline(text)}</span>;
}

// ─── Data Grid Grouping ──────────────────────────────────────

// Group data entries by category if more than 8 entries
function groupDataEntries(data) {
  const entries = Object.entries(data);
  if (entries.length <= 8) return [{ category: null, entries }];

  const groups = {};
  for (const [key, value] of entries) {
    // Use first word of the title as category
    const title = camelToTitle(key);
    const firstWord = title.split(' ')[0];
    if (!groups[firstWord]) groups[firstWord] = [];
    groups[firstWord].push([key, value]);
  }

  // If grouping results in only 1 group, don't categorize
  const groupKeys = Object.keys(groups);
  if (groupKeys.length <= 1) return [{ category: null, entries }];

  return groupKeys.map(cat => ({
    category: cat,
    entries: groups[cat],
  }));
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
  const hasCitations = section.citations && Array.isArray(section.citations) && section.citations.length > 0;

  // Group data entries for display
  const dataGroups = hasData ? groupDataEntries(section.data) : [];

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

      {/* 2. Summary Callout — with bullet detection */}
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
            {parseSummary(section.summary)}
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

      {/* 4. Narrative — with markdown parsing */}
      {hasNarrative && (
        <div style={{
          fontSize: 13,
          color: C.text,
          lineHeight: 1.7,
          marginBottom: 16,
          borderTop: '1px solid ' + C.borderLight,
          paddingTop: 12,
        }}>
          {parseMarkdown(section.narrative)}
        </div>
      )}

      {/* 5. Structured Data Grid — with smart formatting and grouping */}
      {hasData && dataGroups.map((group, gi) => (
        <div key={gi} style={{ marginBottom: 16 }}>
          {group.category && (
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 8,
              marginTop: gi > 0 ? 12 : 0,
            }}>
              {group.category}
            </div>
          )}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}>
            {group.entries.map(([key, value]) => (
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
        </div>
      ))}

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

      {/* 9. Citations — visible per-section list */}
      {hasCitations && (
        <div style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid ' + C.borderLight,
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 6,
          }}>
            Citations
          </div>
          {section.citations.map((citation, ci) => (
            <div key={citation.id || ci} style={{
              fontSize: 11,
              color: C.textSecondary,
              marginBottom: 4,
              lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: 600, color: C.textMuted }}>[{ci + 1}]</span>{' '}
              {citation.source && <span style={{ fontWeight: 500 }}>{citation.source}</span>}
              {citation.source && (citation.text || citation.note || citation.title) ? ' — ' : ''}
              {citation.text || citation.note || citation.title || ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const _testExports = { camelToTitle, formatDataValue, parseMarkdown, parseSummary, groupDataEntries };
