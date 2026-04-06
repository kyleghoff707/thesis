import { useState } from 'react';
import { C } from '../theme';
import VerdictBadge from './VerdictBadge.jsx';
import ConfidenceBadge from './ConfidenceBadge.jsx';
import DirectionBadge from './DirectionBadge.jsx';
import RedFlagCallout from './RedFlagCallout.jsx';
import ReportMarkdown from './ReportMarkdown.jsx';
import { renderTextWithCitations } from './CitationTooltip.jsx';

// ─── Constants & Helpers ─────────────────────────────────────

const DEFAULT_TAB = 'bull';

const DATA_KEYS = { bull: 'bull', bear: 'bear', rebuttal: 'bull_rebuttal', judge: 'judge' };

function getStrengthStyle(strength) {
  const map = {
    strong: { bg: C.green, text: '#fff', label: 'STRONG' },
    moderate: { bg: C.yellow, text: '#fff', label: 'MODERATE' },
    weak: { bg: C.red, text: '#fff', label: 'WEAK' },
  };
  if (!strength) return { bg: C.badge, text: C.badgeText, label: '' };
  return map[strength] || { bg: C.badge, text: C.badgeText, label: strength.toUpperCase() };
}

function getSeverityStyle(severity) {
  const map = {
    thesis_killer: { bg: C.red, text: '#fff', label: 'THESIS KILLER' },
    significant: { bg: C.yellow, text: '#fff', label: 'SIGNIFICANT' },
  };
  if (!severity) return { bg: C.badge, text: C.badgeText, label: '' };
  return map[severity] || { bg: C.badge, text: C.badgeText, label: severity.toUpperCase() };
}

function getExchangeVerdictColor(verdict) {
  const map = {
    'Resolved': C.green,
    'Strong Bull': C.green,
    'Unresolved': C.yellow,
    'Strong Bear': C.red,
  };
  return map[verdict] || C.textMuted;
}

// ─── Inline Badge Components ─────────────────────────────────

function StrengthBadge({ strength }) {
  const style = getStrengthStyle(strength);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      background: style.bg,
      color: style.text,
    }}>
      {style.label}
    </span>
  );
}

function SeverityBadge({ severity }) {
  const style = getSeverityStyle(severity);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      background: style.bg,
      color: style.text,
    }}>
      {style.label}
    </span>
  );
}

// ─── Chevron ─────────────────────────────────────────────────

function Chevron({ expanded }) {
  return (
    <span style={{
      fontSize: 11,
      color: C.textMuted,
      display: 'inline-flex',
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.2s',
      flexShrink: 0,
    }}>
      &#9654;
    </span>
  );
}

// ─── Bull Content ────────────────────────────────────────────

function BullContent({ data, onCitationClick }) {
  const [expanded, setExpanded] = useState(new Set());
  const content = data?.content;
  if (!content) return null;

  const toggle = (idx) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div>
      {content.overallThesis && (
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}>
          <ReportMarkdown content={content.overallThesis} />
        </div>
      )}
      {(content.thesisPoints || []).map((point, idx) => (
        <div key={idx}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggle(idx)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(idx))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              borderBottom: '1px solid ' + C.borderLight,
              padding: '8px 0',
            }}
          >
            <span style={{ fontSize: 13, color: C.text, flex: 1 }}>
              {point.point}
            </span>
            <Chevron expanded={expanded.has(idx)} />
          </div>
          {expanded.has(idx) && (
            <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7, padding: '8px 0 4px 20px' }}>
              {point.evidence}
              {point.sourceSection && (
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                  Source: {point.sourceSection}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Bear Content ────────────────────────────────────────────

function BearContent({ data, onCitationClick }) {
  const [expanded, setExpanded] = useState(new Set());
  const content = data?.content;
  if (!content) return null;

  const toggle = (idx) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div>
      {content.overallBearCase && (
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}>
          <ReportMarkdown content={content.overallBearCase} />
        </div>
      )}
      {(content.inversions || []).map((inversion, idx) => (
        <div key={idx}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggle(idx)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(idx))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              borderBottom: '1px solid ' + C.borderLight,
              padding: '8px 0',
            }}
          >
            <SeverityBadge severity={inversion.severity} />
            <span style={{ fontSize: 13, color: C.text, flex: 1 }}>
              {inversion.counterArgument}
            </span>
            <Chevron expanded={expanded.has(idx)} />
          </div>
          {expanded.has(idx) && (
            <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7, padding: '8px 0 4px 20px' }}>
              {inversion.evidence}
              {inversion.sources?.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {inversion.sources.map((src, si) => (
                    <div key={si} style={{ fontSize: 11, color: C.textMuted }}>
                      {typeof src === 'string' ? src : src.source || src.text || JSON.stringify(src)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Rebuttal Content ────────────────────────────────────────

function RebuttalContent({ data, onCitationClick }) {
  const [expanded, setExpanded] = useState(new Set());
  const content = data?.content;
  if (!content) return null;

  const toggle = (idx) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div>
      {(content.rebuttals || []).map((rebuttal, idx) => (
        <div key={idx}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggle(idx)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(idx))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              borderBottom: '1px solid ' + C.borderLight,
              padding: '8px 0',
            }}
          >
            <StrengthBadge strength={rebuttal.rebuttalStrength} />
            <span style={{ fontSize: 13, color: C.text, flex: 1 }}>
              {rebuttal.bearPoint}
            </span>
            {rebuttal.honest === false && (
              <span style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>
                Point conceded
              </span>
            )}
            <Chevron expanded={expanded.has(idx)} />
          </div>
          {expanded.has(idx) && (
            <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7, padding: '8px 0 4px 20px' }}>
              {rebuttal.rebuttal}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Exchange Row ────────────────────────────────────────────

function ExchangeRow({ exchange, isExpanded, onToggle }) {
  return (
    <div style={{
      border: '1px solid ' + C.borderLight,
      borderRadius: 6,
      marginBottom: 8,
      padding: '8px 12px',
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
        }}
      >
        <StrengthBadge strength={exchange.bullStrength} />
        <span style={{
          flex: 1,
          textAlign: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: getExchangeVerdictColor(exchange.verdict),
        }}>
          {exchange.verdict}
        </span>
        <StrengthBadge strength={exchange.bearStrength} />
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
        {exchange.topic}
      </div>
      {isExpanded && (
        <div style={{
          fontSize: 13,
          color: C.textSecondary,
          lineHeight: 1.7,
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid ' + C.borderLight,
        }}>
          {exchange.reasoning}
        </div>
      )}
    </div>
  );
}

// ─── Judge Content ───────────────────────────────────────────

function JudgeContent({ data, onCitationClick }) {
  const [expanded, setExpanded] = useState(new Set());
  const content = data?.content;
  if (!content) return null;

  const toggle = (idx) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const overallVerdict = content.overallVerdict;

  return (
    <div>
      {/* Exchanges first, verdict at bottom (D-14) */}
      {(content.exchanges || []).map((exchange, idx) => (
        <ExchangeRow
          key={idx}
          exchange={exchange}
          isExpanded={expanded.has(idx)}
          onToggle={() => toggle(idx)}
        />
      ))}

      {/* Overall Verdict */}
      {overallVerdict && (
        <div style={{
          borderTop: '2px solid ' + C.border,
          marginTop: 16,
          paddingTop: 16,
        }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 8,
          }}>
            Overall Verdict
          </div>
          <DirectionBadge direction={overallVerdict.direction} />
          {overallVerdict.summary && (
            <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7, marginTop: 8 }}>
              {overallVerdict.summary}
            </div>
          )}
          {overallVerdict.investmentImplication && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginTop: 12 }}>
                Investment Implication
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginTop: 4 }}>
                {overallVerdict.investmentImplication}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function DebateRenderer({ section, sectionId, debateOutputs, onCitationClick }) {
  if (!section) return null;

  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [citationsExpanded, setCitationsExpanded] = useState(false);

  // Tab definitions inside the component (C is mutable)
  const DEBATE_TABS = [
    { key: 'bull', label: 'Bull', color: C.green },
    { key: 'bear', label: 'Bear', color: C.red },
    { key: 'rebuttal', label: 'Rebuttal', color: C.accent },
    { key: 'judge', label: 'Judge', color: C.textMuted },
  ];

  const activeTabDef = DEBATE_TABS.find(t => t.key === activeTab);
  const activeTabColor = activeTabDef ? activeTabDef.color : C.textMuted;
  const activeData = debateOutputs ? debateOutputs[DATA_KEYS[activeTab]] : null;

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
      {/* 1. Section Header -- replicate SectionRenderer */}
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

      {/* 3. Verdict Rationale */}
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

      {/* 4. Empty Debate State */}
      {!debateOutputs ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>
            Debate Not Available
          </div>
          <div style={{ fontSize: 13, color: C.textMuted }}>
            Adversarial debate data has not been generated for this report.
          </div>
        </div>
      ) : (
        <>
          {/* 5. Tab Bar */}
          <div style={{
            display: 'flex',
            gap: 0,
            borderBottom: '2px solid ' + C.border,
            marginBottom: 16,
          }}>
            {DEBATE_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 20px',
                  fontSize: 12,
                  fontWeight: activeTab === tab.key ? 700 : 400,
                  color: activeTab === tab.key ? tab.color : C.textMuted,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab.key ? '2px solid ' + tab.color : '2px solid transparent',
                  cursor: 'pointer',
                  marginBottom: -2,
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 6. Active Content Area */}
          <div style={{
            borderLeft: '3px solid ' + activeTabColor,
            paddingLeft: 16,
          }}>
            {!activeData ? (
              <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: C.textMuted }}>
                Data for this debate step is not available.
              </div>
            ) : activeTab === 'bull' ? (
              <BullContent data={activeData} onCitationClick={onCitationClick} />
            ) : activeTab === 'bear' ? (
              <BearContent data={activeData} onCitationClick={onCitationClick} />
            ) : activeTab === 'rebuttal' ? (
              <RebuttalContent data={activeData} onCitationClick={onCitationClick} />
            ) : activeTab === 'judge' ? (
              <JudgeContent data={activeData} onCitationClick={onCitationClick} />
            ) : null}
          </div>
        </>
      )}

      {/* 7. Red Flags */}
      <RedFlagCallout flags={section.redFlags} />

      {/* 8. Citations */}
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
    </div>
  );
}

export const _testExports = { DATA_KEYS, getStrengthStyle, getSeverityStyle, getExchangeVerdictColor, DEFAULT_TAB };
