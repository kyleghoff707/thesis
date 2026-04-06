import { useState } from 'react';
import { C } from '../theme';
import VerdictBadge from './VerdictBadge.jsx';
import ConfidenceBadge from './ConfidenceBadge.jsx';
import RedFlagCallout from './RedFlagCallout.jsx';
import ReportMarkdown from './ReportMarkdown.jsx';
import { renderTextWithCitations } from './CitationTooltip.jsx';

// Compute proportional bar segments from summary counts
function computeBarSegments(summary) {
  if (!summary) return [];
  const segments = [];
  if (summary.passCount > 0) segments.push({ flex: summary.passCount, color: C.green, label: 'pass' });
  if (summary.partialCount > 0) segments.push({ flex: summary.partialCount, color: C.yellow, label: 'partial' });
  if (summary.failCount > 0) segments.push({ flex: summary.failCount, color: C.red, label: 'fail' });
  return segments;
}

// Format summary counts as display text with middot separators
function formatScoreText(summary) {
  if (!summary) return '';
  return `${summary.passCount} PASS \u00B7 ${summary.partialCount} PARTIAL \u00B7 ${summary.failCount} FAIL`;
}

export default function ChecklistRenderer({ section, sectionId, onCitationClick }) {
  if (!section) return null;

  const [expanded, setExpanded] = useState(new Set());
  const [citationsExpanded, setCitationsExpanded] = useState(false);

  function toggle(num) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  }

  const items = section.data?.items || [];
  const hasItems = items.length > 0;
  const segments = computeBarSegments(section.data?.summary);
  const scoreText = formatScoreText(section.data?.summary);
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
      {/* Section Header — matches SectionRenderer exactly */}
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

      {/* Summary Callout — matches SectionRenderer */}
      {section.summary && (
        <div style={{
          background: C.accentLight,
          borderLeft: '3px solid ' + C.accent,
          padding: '12px 16px',
          borderRadius: '0 8px 8px 0',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            <ReportMarkdown content={section.summary} />
          </div>
        </div>
      )}

      {/* Verdict Rationale */}
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

      {/* Aggregate Bar */}
      {segments.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex',
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            background: C.borderLight,
          }}>
            {segments.map((seg, i) => (
              <div key={i} style={{ flex: seg.flex, background: seg.color }} />
            ))}
          </div>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.textSecondary,
            marginTop: 8,
          }}>
            {scoreText}
          </div>
        </div>
      )}

      {/* Checklist Items */}
      {hasItems ? items.map(item => {
        const isExpanded = expanded.has(item.number);
        return (
          <div key={item.number} style={{ borderBottom: '1px solid ' + C.borderLight, padding: '8px 0' }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(item.number)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(item.number); } }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
            >
              <VerdictBadge verdict={item.verdict} />
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.textMuted,
                minWidth: 24,
              }}>
                #{item.number}
              </span>
              <span style={{
                fontSize: 13,
                color: C.text,
                flex: 1,
              }}>
                {item.item}
              </span>
              <ConfidenceBadge confidence={item.confidence} />
              <span style={{
                fontSize: 11,
                color: C.textMuted,
                transition: 'transform 0.2s',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}>
                {'\u25B6'}
              </span>
            </div>
            {isExpanded && (
              <div style={{
                padding: '8px 0 4px 44px',
                fontSize: 13,
                color: C.textSecondary,
                lineHeight: 1.7,
              }}>
                {item.evidence}
              </div>
            )}
          </div>
        );
      }) : (
        <div style={{
          textAlign: 'center',
          padding: '32px 0',
          fontSize: 13,
          color: C.textMuted,
        }}>
          Checklist data has not been generated for this section.
        </div>
      )}

      {/* Red Flags */}
      <RedFlagCallout flags={section.redFlags} />

      {/* Citations (collapsible, clickable links) */}
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
            const sourceIsUrl = /^https?:\/\//i.test(sourceText);
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
                {sourceText && (citation.text || citation.note || citation.title) ? ' — ' : ''}
                {citation.text || citation.note || citation.title || ''}
              </div>
            );
          })}
        </div>
      )}

      {/* Primary Source Insights (matches SectionRenderer pattern) */}
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
    </div>
  );
}

export const _testExports = { computeBarSegments, formatScoreText };
