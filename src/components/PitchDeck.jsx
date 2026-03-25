import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { C } from '../theme';
import { usePitchDeck } from '../hooks/usePitchDeck';
import SectionRenderer from './SectionRenderer';
import SensitivityTable from './SensitivityTable';
import VerdictBadge from './VerdictBadge';
import ConfidenceBadge from './ConfidenceBadge';
import CollapsibleSection from './CollapsibleSection';
import DeepDivePanel from './pitchDeck/DeepDivePanel';
import IndustryCard from './pitchDeck/IndustryCard';
import AssumptionTracker from './pitchDeck/AssumptionTracker';

// --- Section definitions for the Pitch Deck (10 sections, 3 phases) ---
const SECTION_DEFS = [
  { key: 'radar', label: 'Radar', phase: 1 },
  { key: 'simple_predictable', label: 'Simple & Predictable', phase: 1 },
  { key: 'market_position', label: 'Market Position', phase: 1 },
  { key: 'barriers_moats', label: 'Barriers & Moats', phase: 2 },
  { key: 'fcf', label: 'FCF', phase: 2 },
  { key: 'management', label: 'Management', phase: 2 },
  { key: 'roe_roic_debt', label: 'ROE/ROIC/Debt', phase: 2 },
  { key: 'balance_sheet', label: 'Balance Sheet', phase: 2 },
  { key: 'pest', label: 'PEST', phase: 3 },
  { key: 'valuation', label: 'Valuation', phase: 3 },
];

const PHASE_LABELS = [
  'Phase 1: Business Fundamentals',
  'Phase 2: Financial Deep-Dive',
  'Phase 3: Risk & Valuation',
];

// Phase boundary indexes: Phase 1 ends after index 2, Phase 2 after index 7
const PHASE_BOUNDARIES = [2, 7]; // checkpoint after these indexes

// --- Pure helper functions (exported via _testExports) ---

// Determine phase status (complete, active, pending) from sections
function getPhaseStatus(sections) {
  if (!sections || sections.length === 0) return ['pending', 'pending', 'pending'];

  const sectionMap = {};
  for (const s of sections) {
    sectionMap[s.key] = s;
  }

  const phases = [
    { start: 0, end: 2 },  // Phase 1: indexes 0-2
    { start: 3, end: 7 },  // Phase 2: indexes 3-7
    { start: 8, end: 9 },  // Phase 3: indexes 8-9
  ];

  return phases.map(({ start, end }) => {
    let hasAll = true;
    let hasAny = false;
    for (let i = start; i <= end; i++) {
      const def = SECTION_DEFS[i];
      if (sectionMap[def.key]) {
        hasAny = true;
      } else {
        hasAll = false;
      }
    }
    if (hasAll) return 'complete';
    if (hasAny) return 'active';
    return 'pending';
  });
}

// Build nav items from sections with verdict dot colors
function getSectionNavItems(sections) {
  const sectionMap = {};
  if (sections) {
    for (const s of sections) {
      sectionMap[s.key] = s;
    }
  }

  return SECTION_DEFS.map((def, idx) => {
    const section = sectionMap[def.key];
    return {
      key: def.key,
      label: def.label,
      index: idx + 1,
      verdict: section?.verdict || null,
    };
  });
}

// Verdict to dot color
function verdictDotColor(verdict) {
  const map = {
    PASS: C.green,
    FAIL: C.red,
    WATCHLIST: C.yellow,
    REVIEW: C.accent,
  };
  return map[verdict] || C.textMuted;
}

// Strip /NEW, /DE, /OLD suffixes and title-case
function formatTitle(name) {
  if (!name) return '';
  const cleaned = name.replace(/\s*\/(NEW|DE|OLD)\s*$/i, '').trim();
  return cleaned
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Human-readable relative time from ISO date string
function formatRelativeTime(isoDate) {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Map progress state to label
function stateToLabel(state) {
  const map = {
    IDLE: 'Preparing...',
    DATA_ASSEMBLY: 'Assembling data...',
    PRIMARY_SOURCE_READING: 'Reading primary sources...',
    WAVE_1_RUNNING: 'Generating sections...',
    CHECKPOINT_1: 'Checkpoint...',
    WAVE_2_RUNNING: 'Generating sections...',
    CHECKPOINT_2: 'Checkpoint...',
    WAVE_3_RUNNING: 'Generating sections...',
    CHECKPOINT_3: 'Checkpoint...',
    SYNTHESIS: 'Writing synthesis...',
    QUALITY_CHECK: 'Quality check...',
    COMPLETE: 'Complete',
  };
  return map[state] || 'Working...';
}

// Inline spinner keyframes injection (once)
let spinnerInjected = false;
function injectSpinnerStyle() {
  if (spinnerInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes thes1s-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes thes1s-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes thes1s-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  `;
  document.head.appendChild(style);
  spinnerInjected = true;
}

function Spinner({ size = 20 }) {
  return (
    <div style={{
      width: size,
      height: size,
      border: '2px solid ' + C.border,
      borderTopColor: C.accent,
      borderRadius: '50%',
      animation: 'thes1s-spin 1s linear infinite',
    }} />
  );
}

// --- Main Component ---

export default function PitchDeck({ getReport, updateReport }) {
  const { id } = useParams();
  const report = getReport ? getReport(id) : null;
  const { report: pitchDeckData, progress, loading, error } = usePitchDeck(report?.ticker);
  const [activeSection, setActiveSection] = useState(null);
  const observerRef = useRef(null);

  // Delight feature state
  const [deepDive, setDeepDive] = useState({ isOpen: false, title: '', content: null, loading: false });
  const [industryCard, setIndustryCard] = useState({ isOpen: false, term: '', category: '', definition: '', benchmarks: [], position: { top: 0, left: 0 } });
  const [assumptionOpen, setAssumptionOpen] = useState(false);

  // Inject keyframes once
  useEffect(() => {
    injectSpinnerStyle();
  }, []);

  // IntersectionObserver for active section tracking
  useEffect(() => {
    if (!pitchDeckData?.sections) return;

    const sectionKeys = SECTION_DEFS.map(d => d.key);
    const elements = sectionKeys
      .map(key => document.getElementById('section-' + key))
      .filter(Boolean);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!best || entry.intersectionRatio > best.intersectionRatio) {
              best = entry;
            }
          }
        }
        if (best) {
          const key = best.target.id.replace('section-', '');
          setActiveSection(key);
        }
      },
      { threshold: 0.3, rootMargin: '-80px 0px -60% 0px' },
    );

    elements.forEach(el => observer.observe(el));
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [pitchDeckData]);

  // Phase statuses
  const phaseStatuses = useMemo(() => {
    return getPhaseStatus(pitchDeckData?.sections || []);
  }, [pitchDeckData]);

  // Nav items
  const navItems = useMemo(() => {
    return getSectionNavItems(pitchDeckData?.sections || []);
  }, [pitchDeckData]);

  // Section lookup map
  const sectionMap = useMemo(() => {
    const map = {};
    if (pitchDeckData?.sections) {
      for (const s of pitchDeckData.sections) {
        map[s.key] = s;
      }
    }
    return map;
  }, [pitchDeckData]);

  // Collect all citations for reference list
  const allCitations = useMemo(() => {
    const citations = [];
    const ids = new Set();
    if (pitchDeckData?.sections) {
      for (const section of pitchDeckData.sections) {
        if (section.citations && Array.isArray(section.citations)) {
          for (const c of section.citations) {
            if (c.id && !ids.has(c.id)) {
              ids.add(c.id);
              citations.push(c);
            }
          }
        }
      }
    }
    return citations;
  }, [pitchDeckData]);

  // Progress section statuses
  const sectionStatuses = useMemo(() => {
    if (!progress || !progress.sections) return {};
    const result = {};
    for (const key of Object.keys(progress.sections)) {
      result[key] = progress.sections[key].status;
    }
    return result;
  }, [progress]);

  // Completion
  const isComplete = !progress || progress.state === 'COMPLETE';
  const allSectionsRendered = pitchDeckData?.sections?.length >= 10;
  const approvalStatus = report?.stageApprovals?.pitchDeck;
  const showApprovalBar = allSectionsRendered && isComplete && !approvalStatus;

  // Progress percentage
  const percentage = useMemo(() => {
    const keys = Object.keys(sectionStatuses);
    if (keys.length === 0) return 0;
    const complete = keys.filter(k => sectionStatuses[k] === 'complete').length;
    return Math.round((complete / keys.length) * 100);
  }, [sectionStatuses]);

  // One Pager gate check
  const onePagerApproved = report?.stageApprovals?.onePager === 'approved';

  // Handlers
  function handleNavClick(key) {
    const el = document.getElementById('section-' + key);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  function handleNavKeyDown(e, key) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNavClick(key);
    }
  }

  function handleCitationClick() {
    const el = document.getElementById('citation-references');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  function handleApprove() {
    if (!updateReport || !id || !report) return;
    updateReport(id, {
      stageApprovals: { ...report.stageApprovals, pitchDeck: 'approved' },
      currentStage: 3,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  }

  function handleReject() {
    if (!updateReport || !id || !report) return;
    const notes = window.prompt('Rejection notes (optional):') || '';
    const existingNotes = report.notes || '';
    const separator = existingNotes && notes ? '\n' : '';
    updateReport(id, {
      stageApprovals: { ...report.stageApprovals, pitchDeck: 'rejected' },
      notes: existingNotes + separator + (notes ? `[Rejection] ${notes}` : ''),
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  }

  // --- Loading State ---
  if (loading && !pitchDeckData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 10 }}>
        <Spinner />
        <span style={{ fontSize: 13, color: C.textMuted }}>Loading Pitch Deck...</span>
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div style={{ fontSize: 13, color: C.red, padding: 20 }}>
        Failed to load Pitch Deck. Check that the report file exists at .thes1s/reports/{report?.ticker || 'TICKER'}/pitch-deck.json and try refreshing.
      </div>
    );
  }

  // --- Gate Lock (One Pager not approved) ---
  if (!onePagerApproved && !pitchDeckData && !progress) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '40vh',
        gap: 8,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
          One Pager must be approved before generating a Pitch Deck.
        </div>
      </div>
    );
  }

  // --- Empty State ---
  if (!pitchDeckData && !progress) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '40vh',
        gap: 8,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>No Pitch Deck generated yet</div>
        <div style={{ fontSize: 13, color: C.textMuted }}>
          Run /generate:pitch-deck {report?.ticker || 'TICKER'} to create one. The One Pager must be approved first.
        </div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div>
      {/* A. Report Hero */}
      <div style={{
        marginBottom: 24,
        paddingBottom: 16,
        borderBottom: '1px solid ' + C.border,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>
            {pitchDeckData?.ticker || report?.ticker}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: C.text }}>
            {formatTitle(pitchDeckData?.companyName || report?.companyName || '')}
          </span>
          <VerdictBadge verdict={pitchDeckData?.overallVerdict} size="large" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary }}>
            Stage 2: Pitch Deck
          </span>
          {pitchDeckData?.generatedAt && (
            <span style={{ fontSize: 11, color: C.textMuted }}>
              Generated {formatRelativeTime(pitchDeckData.generatedAt)}
            </span>
          )}
          {pitchDeckData?.assumptions && pitchDeckData.assumptions.length > 0 && (
            <button
              onClick={() => setAssumptionOpen(true)}
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: assumptionOpen ? C.accent : C.textSecondary,
                background: assumptionOpen ? C.accentLight : C.badge,
                borderRadius: 6,
                padding: '4px 12px',
                textTransform: 'uppercase',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Assumptions ({pitchDeckData.assumptions.length})
            </button>
          )}
          {approvalStatus === 'approved' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>Approved</span>
          )}
          {approvalStatus === 'rejected' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.red }}>Rejected</span>
          )}
        </div>
      </div>

      {/* B. Phase Progress Indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        height: 64,
        marginBottom: 16,
        gap: 0,
      }}>
        {PHASE_LABELS.map((label, pi) => {
          const status = phaseStatuses[pi];
          const isLast = pi === PHASE_LABELS.length - 1;

          let circleColor = C.border;
          let circleFill = 'transparent';
          let connectorStyle = '2px dashed ' + C.border;
          let pulseAnim = 'none';

          if (status === 'complete') {
            circleColor = C.green;
            circleFill = C.green;
            connectorStyle = '2px solid ' + C.green;
          } else if (status === 'active') {
            circleColor = C.accent;
            circleFill = C.accent;
            pulseAnim = 'thes1s-pulse 2s ease-in-out infinite';
            // Left connector solid, right dashed (handled by previous being complete)
          }

          return (
            <div key={pi} style={{
              display: 'flex',
              alignItems: 'flex-start',
              flex: isLast ? 0 : 1,
            }}>
              {/* Phase circle + label */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                minWidth: 120,
              }}>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: `2px solid ${circleColor}`,
                  background: circleFill,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: pulseAnim,
                }}>
                  {status === 'complete' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.textSecondary,
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  lineHeight: 1.4,
                  maxWidth: 130,
                }}>
                  {label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div style={{
                  flex: 1,
                  height: 0,
                  borderTop: status === 'complete' ? '2px solid ' + C.green : connectorStyle,
                  marginTop: 12, // center on circle
                  minWidth: 32,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar (during generation) */}
      {progress && progress.state !== 'COMPLETE' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            height: 4,
            background: C.border,
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              background: C.accent,
              borderRadius: 2,
              width: percentage + '%',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            {stateToLabel(progress.state)}
          </div>
        </div>
      )}

      {/* C. Two-Column Layout */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* C1. Sticky Section Nav (200px) */}
        <div style={{
          position: 'sticky',
          top: 72,
          width: 200,
          flexShrink: 0,
        }}>
          {navItems.map((item) => {
            const isActive = activeSection === item.key;
            const truncated = item.label.length > 20 ? item.label.slice(0, 20) + '...' : item.label;

            return (
              <div
                key={item.key}
                role="button"
                tabIndex={0}
                onClick={() => handleNavClick(item.key)}
                onKeyDown={(e) => handleNavKeyDown(e, item.key)}
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  color: isActive ? C.text : C.textSecondary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 6,
                  transition: 'all 0.15s',
                  background: isActive ? C.bgHover : 'transparent',
                  fontWeight: isActive ? 700 : 400,
                  outline: 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.background = C.bgHover;
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
                onFocus={e => {
                  e.currentTarget.style.boxShadow = `0 0 0 2px ${C.accent}`;
                }}
                onBlur={e => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: verdictDotColor(item.verdict),
                  flexShrink: 0,
                }} />
                <span>{item.index}. {truncated}</span>
              </div>
            );
          })}
        </div>

        {/* C2. Content Column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {SECTION_DEFS.map((def, idx) => {
            const section = sectionMap[def.key];
            const status = sectionStatuses[def.key];

            return (
              <div key={def.key}>
                {/* Render section or placeholder */}
                {section ? (
                  <div style={{ animation: 'thes1s-fadeIn 0.4s ease' }}>
                    <SectionRenderer
                      section={section}
                      sectionId={'section-' + def.key}
                      onCitationClick={handleCitationClick}
                    />
                  </div>
                ) : status === 'running' ? (
                  <div
                    id={'section-' + def.key}
                    style={{
                      border: '1px solid ' + C.border,
                      borderRadius: 8,
                      padding: '16px 20px',
                      marginBottom: 20,
                      background: C.bgCard,
                      opacity: 0.6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 80,
                      scrollMarginTop: 120,
                    }}
                  >
                    <Spinner />
                    <span style={{ fontSize: 13, color: C.textMuted }}>
                      Agent: {progress?.sections?.[def.key]?.agentRole || 'analyst'} working...
                    </span>
                  </div>
                ) : status === 'failed' ? (
                  <div
                    id={'section-' + def.key}
                    style={{
                      border: '1px solid ' + C.red,
                      borderRadius: 8,
                      padding: '16px 20px',
                      marginBottom: 20,
                      background: C.redBg,
                      scrollMarginTop: 120,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>
                      {def.label} -- Generation failed
                    </span>
                    {progress?.sections?.[def.key]?.error && (
                      <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>
                        {progress.sections[def.key].error}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    id={'section-' + def.key}
                    style={{
                      border: '1px solid ' + C.border,
                      borderRadius: 8,
                      padding: '16px 20px',
                      marginBottom: 20,
                      background: C.bgCard,
                      opacity: 0.4,
                      minHeight: 60,
                      scrollMarginTop: 120,
                    }}
                  >
                    <span style={{ fontSize: 13, color: C.textMuted }}>
                      {def.label} -- Pending...
                    </span>
                  </div>
                )}

                {/* Checkpoint display blocks after Phase 1 (index 2) and Phase 2 (index 7) */}
                {PHASE_BOUNDARIES.includes(idx) && pitchDeckData?.checkpoints && (() => {
                  const phaseNum = idx === 2 ? 1 : 2;
                  const checkpoint = pitchDeckData.checkpoints.find(cp => cp.afterPhase === phaseNum);
                  if (!checkpoint) return null;

                  return (
                    <div style={{
                      position: 'relative',
                      marginTop: 24,
                      marginBottom: 24,
                      borderTop: '1px solid ' + C.border,
                      paddingTop: 16,
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: -10,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: C.bg,
                        padding: '0 12px',
                        fontSize: 13,
                        fontWeight: 700,
                        color: C.textSecondary,
                      }}>
                        {PHASE_LABELS[phaseNum - 1]}
                      </div>

                      {/* Data gaps */}
                      {checkpoint.dataGaps && checkpoint.dataGaps.length > 0 && (
                        <div style={{ marginTop: 8, marginBottom: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>
                            Data Gaps
                          </div>
                          {checkpoint.dataGaps.map((gap, gi) => (
                            <div key={gi} style={{ fontSize: 12, color: C.textSecondary, marginBottom: 2, paddingLeft: 12 }}>
                              - {gap}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* PM notes */}
                      {checkpoint.pmNotes && (
                        <div style={{
                          marginTop: 8,
                          padding: '8px 12px',
                          background: C.accentLight,
                          borderLeft: '3px solid ' + C.accent,
                          borderRadius: '0 6px 6px 0',
                          fontSize: 12,
                          color: C.text,
                          fontStyle: 'italic',
                        }}>
                          PM: {checkpoint.pmNotes}
                        </div>
                      )}

                      {/* Section confidence snapshot */}
                      {checkpoint.sectionConfidence && (
                        <div style={{
                          marginTop: 8,
                          display: 'flex',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}>
                          {Object.entries(checkpoint.sectionConfidence).map(([key, conf]) => (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: C.textMuted }}>
                                {key.replace(/_/g, ' ')}:
                              </span>
                              <ConfidenceBadge confidence={conf} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* Section 10 extras: FGR Derivation + Sensitivity Tables */}
          {sectionMap['valuation'] && (
            <div style={{ marginTop: 8 }}>
              {/* FGR Derivation */}
              {pitchDeckData?.fgrDerivation && (
                <CollapsibleSection
                  title="FGR Derivation"
                  defaultOpen={false}
                  badge={
                    pitchDeckData.fgrDerivation.finalLow != null && pitchDeckData.fgrDerivation.finalHigh != null ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>
                        {(pitchDeckData.fgrDerivation.finalLow * 100).toFixed(0)}% - {(pitchDeckData.fgrDerivation.finalHigh * 100).toFixed(0)}%
                      </span>
                    ) : null
                  }
                >
                  {/* Final range */}
                  {pitchDeckData.fgrDerivation.finalLow != null && (
                    <div style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: C.accent,
                      marginBottom: 12,
                    }}>
                      Final: {(pitchDeckData.fgrDerivation.finalLow * 100).toFixed(1)}% - {(pitchDeckData.fgrDerivation.finalHigh * 100).toFixed(1)}%
                    </div>
                  )}

                  {/* 5 inputs */}
                  {pitchDeckData.fgrDerivation.inputs && pitchDeckData.fgrDerivation.inputs.map((input, ii) => (
                    <div key={ii} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                      padding: '6px 0',
                      borderBottom: ii < pitchDeckData.fgrDerivation.inputs.length - 1 ? '1px solid ' + C.borderLight : 'none',
                    }}>
                      <span style={{ fontSize: 13, color: C.textMuted, width: 20, textAlign: 'right' }}>
                        {ii + 1}.
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 400, color: C.text, flex: 1 }}>
                        {input.name}:{' '}
                        <span style={{ fontWeight: 600 }}>
                          {input.valueLow != null && input.valueHigh != null
                            ? `${(input.valueLow * 100).toFixed(1)}% - ${(input.valueHigh * 100).toFixed(1)}%`
                            : input.value != null
                              ? `${(input.value * 100).toFixed(1)}%`
                              : '--'
                          }
                        </span>
                      </span>
                      <ConfidenceBadge confidence={input.confidence} />
                    </div>
                  ))}

                  {/* Source info */}
                  {pitchDeckData.fgrDerivation.inputs && pitchDeckData.fgrDerivation.inputs.map((input, ii) => (
                    input.source ? (
                      <div key={`src-${ii}`} style={{ fontSize: 10, color: C.textMuted, marginBottom: 2, paddingLeft: 28 }}>
                        Source: {input.source}
                      </div>
                    ) : null
                  ))}
                </CollapsibleSection>
              )}

              {/* Sensitivity Tables */}
              {pitchDeckData?.sensitivityTables && (
                <div style={{ marginTop: 16 }}>
                  {['mos', 'pbt', 'tenCap', 'equityBond'].map(method => {
                    const table = pitchDeckData.sensitivityTables[method];
                    if (!table) return null;

                    const methodLabels = {
                      mos: 'MOS Buy Price Sensitivity',
                      pbt: 'PBT Payback Time',
                      tenCap: 'Ten Cap Price Sensitivity',
                      equityBond: 'Equity Bond Price Sensitivity',
                    };

                    return (
                      <div key={method} style={{ marginBottom: 16 }}>
                        <CollapsibleSection
                          title={methodLabels[method] || method}
                          defaultOpen={false}
                        >
                          <SensitivityTable
                            title={methodLabels[method]}
                            rowLabel={table.rowLabel}
                            colLabel={table.colLabel}
                            rowValues={table.rows}
                            colValues={table.cols}
                            computeCell={(row, col) => {
                              // Look up from pre-computed cells matrix
                              if (!table.cells) return null;
                              const ri = table.rows.indexOf(row);
                              const ci = table.cols.indexOf(col);
                              if (ri < 0 || ci < 0) return null;
                              return table.cells[ri]?.[ci] ?? null;
                            }}
                            formatRow={v => typeof v === 'number' && v < 1 ? `${(v * 100).toFixed(0)}%` : String(v)}
                            formatCol={v => typeof v === 'number' ? `$${v.toFixed(2)}` : String(v)}
                            formatCell={v => typeof v === 'number' ? `$${Math.round(v)}` : String(v)}
                            currentRow={table.currentRow}
                            currentCol={table.currentCol}
                            currentPrice={table.currentPrice}
                          />
                        </CollapsibleSection>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* D. References */}
          {allCitations.length > 0 && (
            <div id="citation-references" style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid ' + C.border,
            }}>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.text,
                marginBottom: 12,
              }}>
                References
              </div>
              {allCitations.map((citation, idx) => (
                <div key={citation.id} style={{
                  fontSize: 12,
                  color: C.textSecondary,
                  marginBottom: 6,
                  lineHeight: 1.5,
                }}>
                  <span style={{ fontWeight: 600, color: C.textMuted }}>[{idx + 1}]</span>{' '}
                  {citation.source && <span style={{ fontWeight: 500 }}>{citation.source}: </span>}
                  {citation.text || citation.title || ''}
                </div>
              ))}
            </div>
          )}

          {/* E. Approval Bar */}
          {showApprovalBar && (
            <div style={{
              background: C.bgCard,
              border: '1px solid ' + C.border,
              borderRadius: 8,
              padding: '16px 20px',
              marginTop: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}>
              <span style={{ fontSize: 13, color: C.text, flex: 1 }}>
                <span style={{ fontWeight: 600 }}>Ready for approval</span>
                <span style={{ color: C.textMuted }}> -- Review the Pitch Deck and approve or reject to proceed to Full Story.</span>
              </span>
              <button
                onClick={handleApprove}
                style={{
                  background: C.green,
                  color: '#fff',
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Approve Pitch Deck
              </button>
              <button
                onClick={handleReject}
                style={{
                  background: 'transparent',
                  color: C.red,
                  border: '1px solid ' + C.red,
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Reject Pitch Deck
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delight features — slide-out panels + popover */}
      <DeepDivePanel
        isOpen={deepDive.isOpen}
        onClose={() => setDeepDive(d => ({ ...d, isOpen: false }))}
        title={deepDive.title}
        content={deepDive.content}
        loading={deepDive.loading}
      />
      <IndustryCard
        isOpen={industryCard.isOpen}
        onClose={() => setIndustryCard(c => ({ ...c, isOpen: false }))}
        term={industryCard.term}
        category={industryCard.category}
        definition={industryCard.definition}
        benchmarks={industryCard.benchmarks}
        position={industryCard.position}
      />
      <AssumptionTracker
        isOpen={assumptionOpen}
        onClose={() => setAssumptionOpen(false)}
        assumptions={pitchDeckData?.assumptions || []}
      />
    </div>
  );
}

export const _testExports = { getPhaseStatus, getSectionNavItems, formatTitle, formatRelativeTime };
