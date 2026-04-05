import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { C } from '../theme';
import { usePitchDeck } from '../hooks/usePitchDeck';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { useGeneratePipeline } from '../hooks/useGeneratePipeline';
import SectionRenderer from './SectionRenderer';
import SensitivityTable from './SensitivityTable';
import VerdictBadge from './VerdictBadge';
import ConfidenceBadge from './ConfidenceBadge';
import CollapsibleSection from './CollapsibleSection';
import { generateDeepDive } from '../engines/deepDive';
import DeepDivePanel from './pitchDeck/DeepDivePanel';
import IndustryCard from './pitchDeck/IndustryCard';
import { formatTitle, formatRelativeTime, stateToLabel, verdictDotColor } from './reportHelpers';
import Spinner from './Spinner';
import ConfirmGenerateDialog from './ConfirmGenerateDialog';
import ExportButtons from './ExportButtons';
import PsrSummaryCard from './PsrSummaryCard';

// Map AI-produced key variants to canonical keys (mirrors KEY_NORMALIZATION in run-pipeline.js)
const KEY_ALIASES = {
  radar_section: 'radar', initial_awareness: 'radar', event_context: 'radar',
  simple_and_predictable: 'simple_predictable', simple_predictability: 'simple_predictable', business_model: 'simple_predictable',
  market_position_analysis: 'market_position', competitive_position: 'market_position', dominant_market_position: 'market_position',
  barriers_and_moats: 'barriers_moats', moats: 'barriers_moats', moat_analysis: 'barriers_moats', barriers_to_entry: 'barriers_moats', barriers: 'barriers_moats',
  fcf_analysis: 'fcf', free_cash_flow: 'fcf', owner_earnings: 'fcf', fcf_owner_earnings: 'fcf',
  management_analysis: 'management', management_talent: 'management', management_integrity: 'management', management_evaluation: 'management',
  roe_roic_roa_debt: 'roe_roic_debt', roe_roic: 'roe_roic_debt', capital_structure: 'roe_roic_debt', return_metrics: 'roe_roic_debt',
  balance_sheet_analysis: 'balance_sheet', balance_sheet_deep_dive: 'balance_sheet',
  pest_risks: 'pest', pest_analysis: 'pest', pest_risk_analysis: 'pest', risk_analysis: 'pest',
  valuation_summary: 'valuation', valuation_analysis: 'valuation', valuation_section: 'valuation',
};

// --- Section definitions for the Pitch Deck (9 content sections, 3 phases) ---
// overall_verdict is rendered as a hero banner, not a numbered section
const SECTION_DEFS = [
  { key: 'radar', label: 'Radar', phase: 1 },
  { key: 'simple_predictable', label: 'Simple & Predictable', phase: 1 },
  { key: 'market_position', label: 'Market Position', phase: 1 },
  { key: 'barriers_moats', label: 'Barriers & Moats', phase: 2 },
  { key: 'fcf', label: 'FCF', phase: 2 },
  { key: 'management', label: 'Management', phase: 2 },
  { key: 'roe_roic_debt', label: 'ROE/ROIC & Debt', phase: 2 },
  { key: 'balance_sheet', label: 'Balance Sheet', phase: 2 },
  { key: 'pest', label: 'PEST Risks', phase: 3 },
  { key: 'valuation', label: 'Valuation', phase: 3 },
];

const PHASE_LABELS = [
  'Phase 1: Business Fundamentals',
  'Phase 2: Financial Deep-Dive',
  'Phase 3: Risk & Valuation',
  'Final: Synthesis',
];

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

// --- Format elapsed milliseconds as mm:ss ---
function fmtElapsed(ms) {
  if (ms == null || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// Convert kebab-case agent name to Title Case
function agentDisplayName(name) {
  if (!name) return '';
  return name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// --- Generation Status Panel ---
// Shows real-time pipeline progress during Pitch Deck generation
function GenerationStatusPanel({ generationStatus, ticker }) {
  const [elapsedMs, setElapsedMs] = useState(0);

  // Track elapsed generation time — simple wall-clock from startedAt
  useEffect(() => {
    const state = generationStatus?.state;
    const startedAt = generationStatus?.startedAt;

    if (!state || state === 'COMPLETE' || !startedAt) {
      setElapsedMs(generationStatus?.activeMs || 0);
      return;
    }

    const startTime = new Date(startedAt).getTime();
    function tick() {
      setElapsedMs(Date.now() - startTime);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [generationStatus?.state, generationStatus?.startedAt]);

  if (!generationStatus) return null;

  const { state, sections, completedCount, totalSections, currentAgent, phases } = generationStatus;
  const completed = completedCount || 0;
  const total = totalSections || 10;
  const pct = total > 0 ? (completed / total) * 100 : 0;
  const isComplete = state === 'COMPLETE';

  // Find active phase
  const activePhase = phases?.find(p => p.status === 'active');
  const activePhaseLabel = activePhase ? PHASE_LABELS[activePhase.phase - 1] : null;

  // Completed summary banner
  if (isComplete) {
    return (
      <div style={{
        background: C.bgCard,
        border: '1px solid ' + C.green,
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
          Generation complete -- {total}/{total} sections in {fmtElapsed(generationStatus.elapsedMs || elapsedMs)}
        </span>
      </div>
    );
  }

  // Active generation panel
  return (
    <div style={{
      background: C.bgCard,
      border: '1px solid ' + C.border,
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
          Generating Pitch Deck for {ticker}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>
          {completed}/{total} sections
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 8,
        background: C.bg,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 8,
      }}>
        <div style={{
          height: '100%',
          background: C.accent,
          borderRadius: 4,
          width: pct + '%',
          transition: 'width 0.5s ease',
        }} />
      </div>

      {/* Phase + elapsed */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        fontSize: 11,
        color: C.textMuted,
      }}>
        <span>{activePhaseLabel || stateToLabel(state)}</span>
        <span>{fmtElapsed(elapsedMs)} elapsed</span>
      </div>

      {/* Section status grid */}
      {sections && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}>
          {SECTION_DEFS.map(def => {
            const sec = sections[def.key];
            if (!sec) return null;

            const secStatus = sec.status || 'pending';
            const isRunning = secStatus === 'running';
            const isDone = secStatus === 'complete';
            const duration = sec.durationMs ? Math.round(sec.durationMs / 1000) : null;

            // Icon styles
            let iconColor = C.textMuted;
            let iconBg = 'transparent';
            let iconBorder = C.border;
            let animation = 'none';

            if (isDone) {
              iconColor = '#fff';
              iconBg = C.accent;
              iconBorder = C.accent;
            } else if (isRunning) {
              iconColor = C.yellow;
              iconBg = C.yellowBg;
              iconBorder = C.yellow;
              animation = 'thes1s-pulse 2s ease-in-out infinite';
            }

            return (
              <div key={def.key} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
              }}>
                {/* Status icon */}
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '2px solid ' + iconBorder,
                  background: iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  animation: animation,
                }}>
                  {isDone && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {isRunning && (
                    <div style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: C.yellow,
                    }} />
                  )}
                </div>

                {/* Label + duration/agent */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    color: isDone ? C.text : isRunning ? C.text : C.textMuted,
                    fontWeight: isRunning ? 600 : 400,
                  }}>
                    {def.label}
                    {isDone && duration != null && (
                      <span style={{ color: C.textMuted, fontWeight: 400 }}> ({duration}s)</span>
                    )}
                  </div>
                  {isRunning && sec.agent && (
                    <div style={{ fontSize: 10, color: C.textMuted }}>
                      {agentDisplayName(sec.agent)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Current agent footer */}
      {currentAgent && (
        <div style={{
          marginTop: 12,
          paddingTop: 8,
          borderTop: '1px solid ' + C.borderLight,
          fontSize: 11,
          color: C.textMuted,
        }}>
          Current: {agentDisplayName(currentAgent)}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export default function PitchDeck({ getReport, updateReport }) {
  const { id } = useParams();
  const report = getReport ? getReport(id) : null;
  const { report: pitchDeckData, progress: rawProgress, generationStatus: rawGenStatus, loading, error, startPolling } = usePitchDeck(report?.ticker);
  const { triggerGeneration, generating } = useGeneratePipeline(report?.ticker);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [graceActive, setGraceActive] = useState(false);

  // Filter out stale progress/generationStatus from other stages (e.g. One Pager)
  const progress = rawProgress?.stage === 'pitchDeck' ? rawProgress : null;
  const generationStatus = rawGenStatus?.stage === 'pitchDeck' ? rawGenStatus : null;

  // Scroll spy for active section tracking (shared hook, D-07/D-09)
  const sectionKeysForSpy = SECTION_DEFS.map(d => d.key);
  const activeSection = useScrollSpy(sectionKeysForSpy, { topOffset: 100 });

  // Delight feature state
  const [deepDive, setDeepDive] = useState({
    isOpen: false, title: '', content: null, loading: false,
    depth: 0, maxDepth: 3, error: null, sectionKey: null, claimIndex: null,
  });
  const [industryCard, setIndustryCard] = useState({ isOpen: false, term: '', category: '', definition: '', benchmarks: [], position: { top: 0, left: 0 } });

  // Saved deep dives from report envelope
  const savedDeepDives = report?.deepDives || {};

  // Phase statuses — prefer generationStatus.phases during generation, fall back to report data
  const phaseStatuses = useMemo(() => {
    let statuses;
    if (generationStatus?.phases) {
      statuses = generationStatus.phases.map(p => p.status || 'pending');
    } else {
      statuses = getPhaseStatus(pitchDeckData?.sections || []);
    }
    // Add synthesis phase status (4th phase)
    const progressState = progress?.state || '';
    if (progressState === 'COMPLETE' || pitchDeckData) {
      statuses[3] = 'complete';
    } else if (progressState === 'SYNTHESIS' || /QUALITY|WRITING/.test(progressState)) {
      statuses[3] = 'active';
    } else if (statuses[2] === 'complete') {
      statuses[3] = 'active';
    } else {
      statuses[3] = 'pending';
    }
    return statuses;
  }, [pitchDeckData, generationStatus, progress?.state]);

  // Nav items
  const navItems = useMemo(() => {
    return getSectionNavItems(pitchDeckData?.sections || []);
  }, [pitchDeckData]);

  // Section lookup map — merge live completedSections during generation, normalize keys
  const sectionMap = useMemo(() => {
    const map = {};
    // Load completed sections from generation-status.json (live during generation)
    if (generationStatus?.completedSections) {
      for (const s of generationStatus.completedSections) {
        if (s.key) {
          const canonical = KEY_ALIASES[s.key] || s.key;
          map[canonical] = { ...s, key: canonical };
        }
      }
    }
    // Final report data overrides live data
    if (pitchDeckData?.sections) {
      for (const s of pitchDeckData.sections) {
        const canonical = KEY_ALIASES[s.key] || s.key;
        map[canonical] = { ...s, key: canonical };
      }
    }
    return map;
  }, [pitchDeckData, generationStatus?.completedSections]);

  // Extract overall_verdict for hero rendering (not a numbered section)
  const overallVerdict = useMemo(() => {
    if (!pitchDeckData?.sections) return null;
    return pitchDeckData.sections.find(s => s.key === 'overall_verdict') || null;
  }, [pitchDeckData]);

  // allCitations removed — References section hidden in working view

  // Progress section statuses — normalize AI key variants to canonical keys
  const sectionStatuses = useMemo(() => {
    if (!progress || !progress.sections) return {};
    const result = {};
    for (const key of Object.keys(progress.sections)) {
      const canonical = KEY_ALIASES[key] || key;
      result[canonical] = progress.sections[key].status;
    }
    // Also check generationStatus.sections for completed sections with variant keys
    if (generationStatus?.sections) {
      for (const key of Object.keys(generationStatus.sections)) {
        const canonical = KEY_ALIASES[key] || key;
        if (generationStatus.sections[key].status === 'complete') {
          result[canonical] = 'complete';
        }
      }
    }
    return result;
  }, [progress, generationStatus]);

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
    // No-op — References section hidden in working view
  }

  // Deep dive click handler — shows cached dives or fires API call
  async function handleDeepDiveClick(sectionKey, claimIndex, claim, sectionNarrative) {
    const diveKey = `pd:${sectionKey}:${claimIndex}`;
    const existingDives = savedDeepDives[diveKey] || [];

    if (existingDives.length > 0) {
      const combinedContent = existingDives.map(d => d.content).join('\n\n---\n\n');
      setDeepDive({
        isOpen: true, title: 'Deep Dive', content: combinedContent, loading: false,
        depth: existingDives.length, maxDepth: 3, error: null, sectionKey, claimIndex,
      });
      return;
    }

    setDeepDive({
      isOpen: true, title: 'Deep Dive', content: null, loading: true,
      depth: 0, maxDepth: 3, error: null, sectionKey, claimIndex,
    });

    const result = await generateDeepDive({
      claim,
      sectionContext: sectionNarrative || '',
      ticker: report?.ticker,
      previousDives: [],
    });

    if (result.error) {
      setDeepDive(prev => ({ ...prev, loading: false, error: result.error }));
      return;
    }

    const newDive = { depth: 1, content: result.content, generatedAt: new Date().toISOString() };
    const updatedDives = { ...savedDeepDives, [diveKey]: [newDive] };
    if (updateReport && id) {
      updateReport(id, { deepDives: updatedDives });
    }

    setDeepDive(prev => ({ ...prev, loading: false, content: result.content, depth: 1 }));
  }

  // Go Deeper handler — appends deeper analysis to existing dives
  async function handleGoDeeper() {
    const { sectionKey, claimIndex } = deepDive;
    if (!sectionKey || claimIndex == null) return;

    const diveKey = `pd:${sectionKey}:${claimIndex}`;
    const existingDives = savedDeepDives[diveKey] || [];
    const section = sectionMap[sectionKey];
    const claim = section?.notableClaims?.[claimIndex];
    if (!claim) return;

    setDeepDive(prev => ({ ...prev, loading: true, error: null }));

    const result = await generateDeepDive({
      claim,
      sectionContext: section?.narrative || '',
      ticker: report?.ticker,
      previousDives: existingDives,
    });

    if (result.error) {
      setDeepDive(prev => ({ ...prev, loading: false, error: result.error }));
      return;
    }

    const newDive = { depth: existingDives.length + 1, content: result.content, generatedAt: new Date().toISOString() };
    const updatedDiveArray = [...existingDives, newDive];
    const updatedDives = { ...savedDeepDives, [diveKey]: updatedDiveArray };
    if (updateReport && id) {
      updateReport(id, { deepDives: updatedDives });
    }

    const combinedContent = updatedDiveArray.map(d => d.content).join('\n\n---\n\n');
    setDeepDive(prev => ({ ...prev, loading: false, content: combinedContent, depth: updatedDiveArray.length }));
  }

  // Glossary term click handler — opens IndustryCard popover below term
  function handleGlossaryClick(termObj, e) {
    const rect = e.target.getBoundingClientRect();
    setIndustryCard({
      isOpen: true,
      term: termObj.term,
      category: termObj.category,
      definition: termObj.definition,
      benchmarks: termObj.benchmarks || [],
      position: {
        top: rect.bottom + 8 + window.scrollY,
        left: rect.left + window.scrollX,
      },
    });
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

  // --- Grace period (pipeline starting, progress files not yet created) ---
  if (graceActive && !pitchDeckData && !progress) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 10 }}>
        <Spinner />
        <span style={{ fontSize: 13, color: C.textMuted }}>Starting generation...</span>
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
        gap: 16,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>No Pitch Deck generated yet</div>
        <button
          onClick={() => setShowGenerateDialog(true)}
          disabled={generating}
          style={{
            background: generating ? C.badge : C.accent,
            color: '#fff',
            padding: '8px 20px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: generating ? 'default' : 'pointer',
            border: 'none',
            fontFamily: 'inherit',
            opacity: generating ? 0.7 : 1,
            transition: 'background .15s',
          }}
          onMouseEnter={e => { if (!generating) e.currentTarget.style.background = C.accentHover; }}
          onMouseLeave={e => { if (!generating) e.currentTarget.style.background = C.accent; }}
        >
          {generating ? 'Generating...' : 'Generate Pitch Deck'}
        </button>
        {showGenerateDialog && (
          <ConfirmGenerateDialog
            ticker={report?.ticker}
            stage="pitch-deck"
            onConfirm={() => {
              setShowGenerateDialog(false);
              setGraceActive(true);
              setTimeout(() => setGraceActive(false), 5000);
              triggerGeneration('pitch-deck').then(() => startPolling());
            }}
            onCancel={() => setShowGenerateDialog(false)}
          />
        )}
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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>
            {formatTitle(pitchDeckData?.companyName || report?.companyName || '')}
          </h1>
          <VerdictBadge verdict={pitchDeckData?.overallVerdict} size="large" />
          {/* Generate button — shown when no generation is in progress and no completed data */}
          {!pitchDeckData && !progress && !generating && (
            <button
              onClick={() => setShowGenerateDialog(true)}
              style={{
                background: C.accent,
                color: '#fff',
                padding: '6px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                fontFamily: 'inherit',
                transition: 'background .15s',
                marginLeft: 4,
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.accentHover}
              onMouseLeave={e => e.currentTarget.style.background = C.accent}
            >
              Generate Pitch Deck
            </button>
          )}
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
          {approvalStatus === 'approved' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>Approved</span>
          )}
          {approvalStatus === 'rejected' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.red }}>Rejected</span>
          )}
          {pitchDeckData && isComplete && (
            <ExportButtons ticker={report?.ticker} stage="pitch-deck" />
          )}
        </div>
      </div>

      {/* Generate Pitch Deck confirmation dialog (main render) */}
      {showGenerateDialog && (
        <ConfirmGenerateDialog
          ticker={report?.ticker}
          stage="pitch-deck"
          onConfirm={() => {
            setShowGenerateDialog(false);
            triggerGeneration('pitch-deck');
          }}
          onCancel={() => setShowGenerateDialog(false)}
        />
      )}

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

      {/* Generation Status Panel — shown during active generation */}
      {generationStatus && progress?.state !== 'COMPLETE' && (
        <GenerationStatusPanel
          generationStatus={generationStatus}
          ticker={pitchDeckData?.ticker || report?.ticker}
        />
      )}

      {/* C. Two-Column Layout */}
      <div className="thes1s-two-col" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* C1. Sticky Section Nav (200px) */}
        <div className="thes1s-section-nav" style={{
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
                  padding: '8px 12px',
                  fontSize: 12,
                  color: isActive ? C.accent : C.textSecondary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 8,
                  transition: 'all 0.15s',
                  background: isActive ? C.bgHover : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  borderLeft: isActive ? '3px solid ' + C.accent : '3px solid transparent',
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
          {/* PSR Summary Card — shown above sections when report is complete */}
          {isComplete && pitchDeckData && (
            <PsrSummaryCard ticker={report?.ticker} />
          )}

          {/* Hero summary banner for overall_verdict */}
          {overallVerdict && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              background: C.bgCard,
              border: '1px solid ' + C.border,
              borderRadius: 8,
              padding: 20,
              marginBottom: 24,
            }}>
              <div style={{ flexShrink: 0 }}>
                <VerdictBadge verdict={overallVerdict.verdict} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                  Overall Verdict
                </div>
                {overallVerdict.verdictRationale && (
                  <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.5 }}>
                    {overallVerdict.verdictRationale}
                  </div>
                )}
              </div>
            </div>
          )}

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
                      notableClaims={section.notableClaims}
                      onDeepDiveClick={(claimIdx) => handleDeepDiveClick(def.key, claimIdx, section.notableClaims?.[claimIdx], section.narrative)}
                      glossaryTerms={section.glossaryTerms}
                      onGlossaryClick={handleGlossaryClick}
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
                      scrollMarginTop: 160,
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
                      scrollMarginTop: 160,
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
                      scrollMarginTop: 160,
                    }}
                  >
                    <span style={{ fontSize: 13, color: C.textMuted }}>
                      {def.label} -- Pending...
                    </span>
                  </div>
                )}

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

          {/* D. References — hidden in working view, available for future export view */}

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
                  padding: '14px 24px',
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
                  padding: '14px 24px',
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

      {/* Delight features — slide-out panel + popover */}
      <DeepDivePanel
        isOpen={deepDive.isOpen}
        onClose={() => setDeepDive(d => ({ ...d, isOpen: false }))}
        title={deepDive.title}
        content={deepDive.content}
        loading={deepDive.loading}
        depth={deepDive.depth}
        maxDepth={deepDive.maxDepth}
        onGoDeeper={handleGoDeeper}
        error={deepDive.error}
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
    </div>
  );
}

export const _testExports = { getPhaseStatus, getSectionNavItems };
