import { useState } from 'react';
import { C } from '../theme';
import VerdictBadge from './VerdictBadge.jsx';
import ConfidenceBadge from './ConfidenceBadge.jsx';
import RedFlagCallout from './RedFlagCallout.jsx';
import { renderTextWithCitations } from './CitationTooltip.jsx';
import ReportMarkdown from './ReportMarkdown.jsx';
// formatDataValue retained for _testExports consumers (sectionRenderer.test.js)
// fmtNum, fmtDollar, fmtPct available in reportHelpers.js if needed

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

// Formatters imported from shared reportHelpers.js (fmtNum, fmtDollar, fmtPct, formatDataValue)

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

export default function SectionRenderer({ section, sectionId, onCitationClick, notableClaims, onDeepDiveClick, glossaryTerms, onGlossaryClick, onCommentClick, commentCount }) {
  const [citationsExpanded, setCitationsExpanded] = useState(false);
  if (!section) return null;

  const hasNarrative = section.narrative && typeof section.narrative === 'string' && section.narrative.length > 0;
  const hasTables = section.tables && Array.isArray(section.tables) && section.tables.length > 0;
  const hasCrossFindings = section.crossCuttingFindings && Array.isArray(section.crossCuttingFindings) && section.crossCuttingFindings.length > 0;
  const hasCitations = section.citations && Array.isArray(section.citations) && section.citations.length > 0;

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
        scrollMarginTop: 160,
      }}
    >
      {/* 1. Section Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
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
        <h3 style={{
          fontSize: 16,
          fontWeight: 700,
          color: C.text,
          flex: 1,
          margin: 0,
        }}>
          {section.title}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <VerdictBadge verdict={section.verdict} />
          <ConfidenceBadge confidence={section.confidence} />
        </div>
      </div>

      {/* 2. Summary Callout — rendered via ReportMarkdown */}
      {section.summary && (
        <div style={{
          background: C.accentLight,
          borderLeft: '3px solid ' + C.accent,
          padding: '12px 16px',
          borderRadius: '0 8px 8px 0',
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 13,
            color: C.text,
            lineHeight: 1.6,
          }}>
            <ReportMarkdown content={section.summary} />
          </div>
        </div>
      )}

      {/* 3. Verdict Rationale (Primary Prose) */}
      {section.verdictRationale && (
        <div style={{
          fontSize: 14,
          color: C.text,
          lineHeight: 1.7,
          marginBottom: 16,
        }}>
          {renderTextWithCitations(section.verdictRationale, section.citations, onCitationClick)}
        </div>
      )}

      {/* 4. Narrative — rendered via ReportMarkdown with citation integration */}
      {hasNarrative && (
        <div style={{
          fontSize: 14,
          color: C.text,
          lineHeight: 1.7,
          marginBottom: 16,
          borderTop: '1px solid ' + C.borderLight,
          paddingTop: 12,
        }}>
          <ReportMarkdown
            content={section.narrative}
            citations={section.citations}
            onCitationClick={onCitationClick}
            notableClaims={notableClaims}
            onDeepDiveClick={onDeepDiveClick}
            glossaryTerms={glossaryTerms}
            onGlossaryClick={onGlossaryClick}
          />
        </div>
      )}

      {/* 5. Structured Data Grid — hidden from display (data preserved in report JSON for future export) */}

      {/* 6. Tables (Optional) — handles both object format (legacy) and JSON string format */}
      {hasTables && section.tables.map((rawTable, ti) => {
        // Parse string tables, pass through objects (backward compat)
        let table = rawTable;
        if (typeof rawTable === 'string') {
          try { table = JSON.parse(rawTable); } catch { return null; }
        }
        if (!table || typeof table !== 'object') return null;
        return (
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
                        background: C.bg,
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
                    {(Array.isArray(row) ? row : []).map((cell, ci) => (
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
        );
      })}

      {/* 7. Broader Linked Insights (cross-cutting findings from agent collaboration) */}
      {hasCrossFindings && (
        <div style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.textMuted,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Broader Linked Insights
          </div>
          {section.crossCuttingFindings.map((finding, fi) => {
            const isString = typeof finding === 'string';
            const text = isString ? finding : (finding.finding || finding.text || '');
            const severity = isString ? null : finding.severity;
            const source = isString ? null : finding.source;
            return (
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
                    background: getSeverityColor(severity),
                    marginTop: 5,
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 12,
                      color: C.text,
                      lineHeight: 1.5,
                    }}>
                      {text}
                    </div>
                    {source && (
                      <div style={{
                        fontSize: 11,
                        color: C.textMuted,
                        marginTop: 2,
                      }}>
                        {source}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 8. Red Flags */}
      <RedFlagCallout flags={section.redFlags} />

      {/* 9. Citations — collapsible per-section list */}
      {hasCitations && (
        <div style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid ' + C.borderLight,
        }}>
          <div
            onClick={() => setCitationsExpanded(prev => !prev)}
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: citationsExpanded ? 6 : 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              userSelect: 'none',
            }}
          >
            <span style={{
              display: 'inline-block',
              fontSize: 8,
              transition: 'transform 0.15s ease',
              transform: citationsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}>&#9654;</span>
            Citations ({section.citations.length})
          </div>
          {citationsExpanded && section.citations.map((citation, ci) => {
            const sourceText = citation.source || '';
            const detail = citation.text || citation.note || citation.title || '';
            // Detect URL in the source field
            const sourceIsUrl = /^https?:\/\//i.test(sourceText);
            // Also check for a url field on the citation object
            const linkUrl = citation.url || (sourceIsUrl ? sourceText : null);
            return (
              <div key={citation.id || ci} style={{
                fontSize: 11,
                color: C.textSecondary,
                marginBottom: 4,
                lineHeight: 1.5,
              }}>
                <span style={{ fontWeight: 600, color: C.textMuted }}>[{ci + 1}]</span>{' '}
                {sourceText && (
                  linkUrl
                    ? <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500, color: C.accent, textDecoration: 'underline' }}>{sourceText}</a>
                    : <span style={{ fontWeight: 500 }}>{sourceText}</span>
                )}
                {sourceText && detail ? ' — ' : ''}
                {detail}
              </div>
            );
          })}
        </div>
      )}

      {/* 10. Primary Source Insights */}
      {section.primarySourceInsights && Array.isArray(section.primarySourceInsights) && section.primarySourceInsights.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid ' + C.borderLight }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: C.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
          }}>
            Primary Source Insights
          </div>
          {section.primarySourceInsights.map((insight, i) => (
            <div key={i} style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4, lineHeight: 1.5, paddingLeft: 8 }}>
              {typeof insight === 'string' ? insight : (insight.text || insight.source || JSON.stringify(insight))}
            </div>
          ))}
        </div>
      )}

      {/* Comment button — bottom of section for intuitive placement */}
      {onCommentClick && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingTop: 8, borderTop: '1px solid ' + C.borderLight }}>
          <button
            onClick={(e) => { e.stopPropagation(); onCommentClick(); }}
            aria-label="Toggle section comments"
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: '1px solid ' + C.border,
              cursor: 'pointer',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              color: commentCount > 0 ? C.accent : C.textMuted,
              fontFamily: 'inherit',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            {commentCount > 0 ? `${commentCount} comment${commentCount > 1 ? 's' : ''}` : 'Add comment'}
          </button>
        </div>
      )}
    </div>
  );
}

export const _testExports = { camelToTitle, groupDataEntries };
