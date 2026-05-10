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

// Maps tab keys to the agent's debate-step keys in finalThesisData.debate.
const DATA_KEYS = { bull: 'step1Bull', bear: 'step2Bear', rebuttal: 'step3Rebuttal', judge: 'step4Judge' };

// Badge ink — picks a contrasting text color that works in both themes.
// scoreBgGreen/Yellow/Red are static saturated tones (don't shift between themes)
// so #fff stays high-contrast on them in either palette.
const BADGE_INK = '#ffffff';

function getStrengthStyle(strength) {
  const map = {
    strong:   { bg: C.scoreBgGreen,  text: BADGE_INK, label: 'STRONG' },
    moderate: { bg: C.scoreBgYellow, text: BADGE_INK, label: 'MODERATE' },
    weak:     { bg: C.scoreBgRed,    text: BADGE_INK, label: 'WEAK' },
  };
  if (!strength) return { bg: C.badge, text: C.badgeText, label: '' };
  const key = String(strength).toLowerCase();
  return map[key] || { bg: C.badge, text: C.badgeText, label: String(strength).toUpperCase() };
}

function getSeverityStyle(severity) {
  const map = {
    thesis_killer: { bg: C.scoreBgRed,    text: BADGE_INK, label: 'THESIS KILLER' },
    significant:   { bg: C.scoreBgYellow, text: BADGE_INK, label: 'SIGNIFICANT' },
  };
  if (!severity) return { bg: C.badge, text: C.badgeText, label: '' };
  const key = String(severity).toLowerCase();
  return map[key] || { bg: C.badge, text: C.badgeText, label: String(severity).toUpperCase().replace(/_/g, ' ') };
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

// ─── Tab Overview Callout ────────────────────────────────────
// Consistent opener used by Bull/Bear/Rebuttal tabs so the eye registers the same
// rhythm regardless of which side is showing. The colored left border carries the
// stance signal; the body text is plain weight (no hero treatment).
function OverviewCallout({ label, color, children }) {
  if (!children) return null;
  return (
    <div style={{
      borderLeft: '3px solid ' + color,
      background: C.bg,
      padding: '10px 14px',
      borderRadius: '0 6px 6px 0',
      marginBottom: 16,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.65 }}>
        {children}
      </div>
    </div>
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
      <OverviewCallout label="Bull Thesis" color={C.green}>
        {content.overallThesis && <ReportMarkdown content={content.overallThesis} />}
      </OverviewCallout>
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
              {point.point || point.title || point.claim}
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
      <OverviewCallout label="Bear Inversion" color={C.red}>
        {(content.overallBearCase || content.overallInversion) && (
          <ReportMarkdown content={content.overallBearCase || content.overallInversion} />
        )}
      </OverviewCallout>
      {(content.inversions || content.thesisInversions || []).map((inversion, idx) => {
        const headerText = inversion.counterArgument || inversion.bullClaim || inversion.counterEvidence;
        const bodyText = inversion.evidence || inversion.counterEvidence;
        const sources = inversion.sources || inversion.citations;
        return (
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
                {headerText}
              </span>
              <Chevron expanded={expanded.has(idx)} />
            </div>
            {expanded.has(idx) && (
              <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7, padding: '8px 0 4px 20px' }}>
                {bodyText}
                {Array.isArray(sources) && sources.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {sources.map((src, si) => (
                      <div key={si} style={{ fontSize: 11, color: C.textMuted }}>
                        {typeof src === 'string' ? src : src.source || src.text || JSON.stringify(src)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
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
      <OverviewCallout label="Rebuttal" color={C.accent}>
        {content.overallRebuttal && <ReportMarkdown content={content.overallRebuttal} />}
      </OverviewCallout>
      {(content.rebuttals || []).map((rebuttal, idx) => {
        const strength = rebuttal.rebuttalStrength || rebuttal.strength;
        const headerText = rebuttal.bearPoint || rebuttal.bearInversion;
        const bodyText = rebuttal.rebuttal || rebuttal.counterArgument;
        const concession = rebuttal.concession;
        // Honest concession indicator: legacy boolean OR a non-trivial concession string.
        const conceded = rebuttal.honest === false || (typeof concession === 'string' && concession.trim().length > 0);
        return (
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
              <StrengthBadge strength={strength} />
              <span style={{ fontSize: 13, color: C.text, flex: 1 }}>
                {headerText}
              </span>
              {conceded && (
                <span style={{ fontSize: 11, color: C.yellow, fontWeight: 700 }}>
                  Concession
                </span>
              )}
              <Chevron expanded={expanded.has(idx)} />
            </div>
            {expanded.has(idx) && (
              <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7, padding: '8px 0 4px 20px' }}>
                {bodyText}
                {typeof concession === 'string' && concession.trim().length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + C.borderLight }}>
                    <span style={{ fontWeight: 700, color: C.textMuted, fontSize: 12 }}>Concession: </span>
                    {concession}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Exchange Row ────────────────────────────────────────────

function ExchangeRow({ exchange, isExpanded, onToggle }) {
  // Agent emits: bullClaim, bearInversion, bullRebuttal, judgeScore, severityFromBear, reasoning, pointNumber.
  // Legacy shape used: bullStrength, bearStrength, verdict, topic, reasoning.
  const verdictText = exchange.verdict || exchange.judgeScore;
  // severityFromBear uses the severity scale (significant / thesis_killer), not the strength scale.
  const bearSeverity = exchange.severityFromBear || exchange.bearSeverity;
  const summary = exchange.bullClaim
    ? exchange.bullClaim.slice(0, 140) + (exchange.bullClaim.length > 140 ? '…' : '')
    : (exchange.topic || '');
  const pointLabel = exchange.pointNumber != null ? `Point ${exchange.pointNumber}` : null;
  return (
    <div style={{
      border: '1px solid ' + C.borderLight,
      borderRadius: 6,
      marginBottom: 8,
      padding: '10px 12px',
      background: C.bg,
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {pointLabel && (
            <div style={{
              fontSize: 10, fontWeight: 700, color: C.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginBottom: 2,
            }}>
              {pointLabel}
            </div>
          )}
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
            {summary}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingTop: pointLabel ? 14 : 0 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: getExchangeVerdictColor(verdictText),
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            {verdictText}
          </span>
          {bearSeverity && <SeverityBadge severity={bearSeverity} />}
          <Chevron expanded={isExpanded} />
        </div>
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
          {exchange.bullClaim && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: C.green, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bull: </span>
              {exchange.bullClaim}
            </div>
          )}
          {exchange.bearInversion && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: C.red, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bear: </span>
              {exchange.bearInversion}
            </div>
          )}
          {exchange.bullRebuttal && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: C.accent, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rebuttal: </span>
              {exchange.bullRebuttal}
            </div>
          )}
          {exchange.reasoning && (
            <div>
              <span style={{ fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Judge: </span>
              {exchange.reasoning}
            </div>
          )}
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

  // overallVerdict may be an object ({direction, summary, investmentImplication}) or a bare string ("MIXED").
  // When it's a string, fall back to sibling fields the agent emits at the judge top level.
  const rawVerdict = content.overallVerdict;
  const overallVerdict = (rawVerdict && typeof rawVerdict === 'object')
    ? rawVerdict
    : ((rawVerdict || content.overallDirection || content.overallSummary || content.investmentImplication) ? {
        direction: typeof rawVerdict === 'string' ? rawVerdict : (content.overallDirection || content.verdictDirection),
        summary: content.overallSummary || content.verdictRationale || content.verdictDirectionRationale,
        investmentImplication: content.investmentImplication,
      } : null);

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

      {/* Overall Verdict — verdict-shaped card after exchanges so the call feels earned */}
      {overallVerdict && (
        <div style={{
          borderLeft: '3px solid ' + C.textSecondary,
          background: C.bg,
          padding: '12px 16px',
          borderRadius: '0 6px 6px 0',
          marginTop: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 10,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: C.textSecondary,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Overall Verdict
            </div>
            <DirectionBadge direction={overallVerdict.direction} />
          </div>
          {overallVerdict.summary && (
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.65 }}>
              {overallVerdict.summary}
            </div>
          )}
          {overallVerdict.investmentImplication && (
            <div style={{
              marginTop: 12, paddingTop: 10,
              borderTop: '1px solid ' + C.borderLight,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: C.accent,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                marginBottom: 4,
              }}>
                Investment Implication
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.65 }}>
                {overallVerdict.investmentImplication}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function DebateRenderer({ section, sectionId, debate, onCitationClick }) {
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
  const activeData = debate ? debate[DATA_KEYS[activeTab]] : null;

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
      {!debate ? (
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

          {/* 6. Active Content Area — stance is signaled by the inner OverviewCallout's colored border, no outer rule */}
          <div>
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
