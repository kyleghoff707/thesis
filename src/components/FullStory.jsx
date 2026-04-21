import { useMemo, useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { C } from '../theme';
import { useFullStory } from '../hooks/useFullStory';
import { useGeneratePipeline } from '../hooks/useGeneratePipeline';
import ConfirmGenerateDialog from './ConfirmGenerateDialog';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { generateDeepDive } from '../engines/deepDive';
import SectionRenderer from './SectionRenderer';
import ChecklistRenderer from './ChecklistRenderer.jsx';
import DebateRenderer from './DebateRenderer.jsx';
import PromiseTracker from './PromiseTracker.jsx';
import DeepDivePanel from './pitchDeck/DeepDivePanel.jsx';
import IndustryCard from './pitchDeck/IndustryCard.jsx';
import DirectionBadge from './DirectionBadge.jsx';
import VerdictBadge from './VerdictBadge';
import ConfidenceBadge from './ConfidenceBadge';
import ExportButtons from './ExportButtons';
import { formatTitle, formatRelativeTime, verdictDotColor } from './reportHelpers';
import Spinner from './Spinner';
import PsrSummaryCard from './PsrSummaryCard';

// Map AI-produced key variants to canonical keys (mirrors KEY_NORMALIZATION in run-full-story.js)
const KEY_ALIASES = {
  // Section 1: Event Analysis
  event: 'event_analysis',
  eventAnalysis: 'event_analysis',
  'event-analysis': 'event_analysis',
  event_context: 'event_analysis',
  event_analysis_section: 'event_analysis',

  // Section 2: Meaning Checklist
  meaning: 'meaning_checklist',
  meaningChecklist: 'meaning_checklist',
  'meaning-checklist': 'meaning_checklist',
  meaning_check: 'meaning_checklist',
  meaning_analysis: 'meaning_checklist',

  // Section 3: Moat Checklist
  moat: 'moat_checklist',
  moatChecklist: 'moat_checklist',
  'moat-checklist': 'moat_checklist',
  moat_check: 'moat_checklist',
  moat_analysis: 'moat_checklist',

  // Section 4: Management Checklist
  management: 'management_checklist',
  managementChecklist: 'management_checklist',
  'management-checklist': 'management_checklist',
  management_check: 'management_checklist',
  management_evaluation: 'management_checklist',

  // Section 5: Valuation Confirmation
  valuation: 'valuation_confirmation',
  valuationConfirmation: 'valuation_confirmation',
  'valuation-confirmation': 'valuation_confirmation',
  valuation_confirm: 'valuation_confirmation',
  valuation_analysis: 'valuation_confirmation',
  valuation_summary: 'valuation_confirmation',

  // Section 6: Inversion & Rebuttal
  inversion: 'inversion_rebuttal',
  rebuttal: 'inversion_rebuttal',
  inversionRebuttal: 'inversion_rebuttal',
  'inversion-rebuttal': 'inversion_rebuttal',
  inversion_and_rebuttal: 'inversion_rebuttal',
  debate: 'inversion_rebuttal',
};

// --- Section definitions for the Full Story (7 sections: 6 original + Promise Tracker) ---
const SECTION_DEFS = [
  { key: 'event_analysis', label: 'Event Analysis', phase: 1 },
  { key: 'meaning_checklist', label: 'Meaning Checklist', phase: 1 },
  { key: 'moat_checklist', label: 'Moat Checklist', phase: 1 },
  { key: 'management_checklist', label: 'Management Checklist', phase: 1 },
  { key: 'valuation_confirmation', label: 'Valuation Confirmation', phase: 1 },
  { key: 'inversion_rebuttal', label: 'Inversion & Rebuttal', phase: 2 },
  { key: 'promise_tracker', label: 'Management Promise Tracker', phase: null },
];

const FS_PHASE_LABELS = [
  'Phase 1: Deep Analysis',
  'Phase 2: The Debate',
];

// FS-specific state labels (override PD-centric defaults)
function fsStateToLabel(state) {
  const map = {
    IDLE: 'Preparing...',
    DATA_ASSEMBLY: 'Assembling data...',
    PRIMARY_SOURCE_READING: 'Reading primary sources...',
    WAVE_1_RUNNING: 'Phase 1: Deep Analysis...',
    WAVE_2_RUNNING: 'Phase 2: The Debate...',
    SYNTHESIS: 'Writing synthesis...',
    QUALITY_CHECK: 'Quality check...',
    COMPLETE: 'Complete',
  };
  return map[state] || 'Working...';
}

// Format elapsed milliseconds as m:ss
function fmtElapsed(ms) {
  if (ms == null || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// Compute phase statuses from section completion + progress state
// Returns ['complete'|'active'|'pending', 'complete'|'active'|'pending']
function getPhaseStatuses(sectionMap, progressState) {
  const phase1Keys = ['event_analysis', 'meaning_checklist', 'moat_checklist', 'management_checklist', 'valuation_confirmation'];
  const phase1Done = phase1Keys.every(k => sectionMap[k]);
  const phase1Any = phase1Keys.some(k => sectionMap[k]);

  const phase2Done = !!sectionMap['inversion_rebuttal'];

  let p1 = 'pending', p2 = 'pending';

  if (phase1Done) {
    p1 = 'complete';
    if (phase2Done) p2 = 'complete';
    else if (progressState === 'WAVE_2_RUNNING' || progressState === 'SYNTHESIS') p2 = 'active';
    else p2 = 'pending';
  } else if (phase1Any || progressState === 'WAVE_1_RUNNING' || progressState === 'PRIMARY_SOURCE_READING') {
    p1 = 'active';
  } else if (progressState === 'DATA_ASSEMBLY' || progressState === 'IDLE') {
    p1 = 'active';
  }

  if (progressState === 'COMPLETE') {
    p1 = 'complete';
    p2 = 'complete';
  }

  return [p1, p2];
}

// --- Pure helper: traffic-light color for quality scores ---
function qualityColor(score) {
  if (score == null) return C.textMuted;
  if (score >= 90) return C.green;
  if (score >= 70) return C.yellow;
  return C.red;
}

// --- Inline sub-component: per-section quality badge (Mech N . Method N) ---
function QualityBadge({ mechanical, methodology }) {
  if (mechanical == null && methodology == null) return null;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 10px',
      borderRadius: 9999,
      fontSize: 10,
      fontWeight: 600,
      background: C.badge,
      color: C.badgeText,
    }}>
      {mechanical != null && (
        <span style={{ color: qualityColor(mechanical) }}>Mech {mechanical}</span>
      )}
      {mechanical != null && methodology != null && (
        <span style={{ color: C.textMuted }}>&middot;</span>
      )}
      {methodology != null && (
        <span style={{ color: qualityColor(methodology) }}>Method {methodology}</span>
      )}
    </span>
  );
}

// --- Main component ---
export default function FullStory({ getReport, updateReport }) {
  const CHECKLIST_KEYS = new Set(['meaning_checklist', 'moat_checklist', 'management_checklist']);

  const { id } = useParams();
  const report = getReport ? getReport(id) : null;
  const ticker = report?.ticker;
  const { report: hookData, quality, progress: rawProgress, generationStatus: rawGenStatus, loading, error, startPolling } = useFullStory(ticker);
  // Production: report.fullStory is loaded from D1 via useResearch → GET /user/reports/:id.
  // Dev: hookData comes from the Vite middleware. Prefer D1 data when present.
  const fullStoryData = report?.fullStory || hookData;
  const { triggerGeneration, generating } = useGeneratePipeline(ticker);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [graceActive, setGraceActive] = useState(false);

  // Filter out stale progress/generationStatus from other stages
  const progress = rawProgress?.stage === 'fullStory' ? rawProgress : null;
  const generationStatus = rawGenStatus?.stage === 'fullStory' ? rawGenStatus : null;

  // Timer: wall-clock elapsed during generation
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef(null);
  const progressState = progress?.state;
  const isGenerating = progress && progressState !== 'COMPLETE';

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!isGenerating) return;
    const startedAt = progress?.startedAt || generationStatus?.startedAt;
    if (!startedAt) return;
    const startTime = new Date(startedAt).getTime();
    function tick() { setElapsedMs(Date.now() - startTime); }
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isGenerating, progress?.startedAt, generationStatus?.startedAt]);

  // Section progress status from generation-status.json (for nav dots + placeholders)
  const sectionProgress = useMemo(() => {
    const result = {};
    if (generationStatus?.sections) {
      for (const key of Object.keys(generationStatus.sections)) {
        const canonical = KEY_ALIASES[key] || key;
        result[canonical] = generationStatus.sections[key].status;
      }
    }
    if (progress?.sections) {
      for (const key of Object.keys(progress.sections)) {
        const canonical = KEY_ALIASES[key] || key;
        if (!result[canonical]) result[canonical] = progress.sections[key].status;
      }
    }
    return result;
  }, [generationStatus, progress]);

  // Phase-based progress: Phase 1 = 0-50%, Phase 2 = 50-100%
  const phase1Keys = ['event_analysis', 'meaning_checklist', 'moat_checklist', 'management_checklist', 'valuation_confirmation'];
  const phase1Complete = phase1Keys.filter(k => sectionProgress[k] === 'complete').length;
  const phase2Complete = sectionProgress['inversion_rebuttal'] === 'complete' ? 1 : 0;
  const progressPct = isGenerating
    ? Math.round((phase1Complete / phase1Keys.length) * 50 + phase2Complete * 50)
    : 0;

  const sectionIds = useMemo(() => SECTION_DEFS.map(d => d.key), []);
  const activeSection = useScrollSpy(sectionIds);

  // Map sections by key for O(1) lookup (normalize AI key variants)
  const sectionMap = useMemo(() => {
    const m = {};
    if (generationStatus?.completedSections) {
      for (const s of generationStatus.completedSections) {
        if (s.key) {
          const canonical = KEY_ALIASES[s.key] || s.key;
          m[canonical] = { ...s, key: canonical };
        }
      }
    }
    if (fullStoryData?.sections) {
      for (const s of fullStoryData.sections) {
        const canonical = KEY_ALIASES[s.key] || s.key;
        m[canonical] = { ...s, key: canonical };
      }
    }
    return m;
  }, [fullStoryData, generationStatus]);

  // Phase statuses for indicators (computed once, not per-render-iteration)
  const phaseStatuses = useMemo(() => getPhaseStatuses(sectionMap, progressState), [sectionMap, progressState]);

  // Map quality by sectionKey for O(1) lookup
  const qualityMap = useMemo(() => {
    const m = {};
    if (quality?.sections) {
      for (const qs of quality.sections) m[qs.sectionKey] = qs;
    }
    return m;
  }, [quality]);

  // Nav items with verdict dots + progress status (Promise Tracker has no verdict)
  const navItems = useMemo(() => SECTION_DEFS.map((def, idx) => ({
    key: def.key,
    label: def.label,
    index: idx + 1,
    verdict: def.key === 'promise_tracker' ? null : (sectionMap[def.key]?.verdict || null),
    status: sectionProgress[def.key] || null,
  })), [sectionMap, sectionProgress]);

  // Deep dive state
  const [deepDive, setDeepDive] = useState({
    isOpen: false,
    title: '',
    content: null,
    loading: false,
    depth: 0,
    maxDepth: 3,
    error: null,
    sectionKey: null,
    claimIndex: null,
  });

  // Glossary state
  const [industryCard, setIndustryCard] = useState({
    isOpen: false,
    term: '',
    category: '',
    definition: '',
    benchmarks: [],
    position: { top: 0, left: 0 },
  });

  // Saved deep dives from report envelope
  const savedDeepDives = report?.deepDives || {};

  // Judge verdict — direct read from debateOutputs
  const verdict = fullStoryData?.debateOutputs?.judge?.content?.overallVerdict;

  // Company name fallback: report.companyName > fullStoryData.ticker > ''
  const companyName = report?.companyName || fullStoryData?.ticker || '';

  // Timestamp uses completedAt (the API JSON field name)
  const timestamp = fullStoryData?.completedAt;

  // Completion state
  const isComplete = !progress || progress.state === 'COMPLETE';
  const allSectionsRendered = fullStoryData?.sections?.length >= 6;
  const approvalStatus = report?.stageApprovals?.fullStory;
  const showApprovalBar = allSectionsRendered && isComplete && !approvalStatus;
  const pitchDeckApproved = report?.stageApprovals?.pitchDeck === 'approved';

  // --- Handlers ---
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

  // Deep dive click handler — shows cached dives or fires API call
  async function handleDeepDiveClick(sectionKey, claimIndex, claim, sectionNarrative) {
    const diveKey = `${sectionKey}:${claimIndex}`;
    const existingDives = savedDeepDives[diveKey] || [];

    // If we already have deep dives saved, show them immediately
    if (existingDives.length > 0) {
      const combinedContent = existingDives.map(d => d.content).join('\n\n---\n\n');
      setDeepDive({
        isOpen: true,
        title: 'Deep Dive',
        content: combinedContent,
        loading: false,
        depth: existingDives.length,
        maxDepth: 3,
        error: null,
        sectionKey,
        claimIndex,
      });
      return;
    }

    // Fire new deep dive API call
    setDeepDive({
      isOpen: true,
      title: 'Deep Dive',
      content: null,
      loading: true,
      depth: 0,
      maxDepth: 3,
      error: null,
      sectionKey,
      claimIndex,
    });

    const result = await generateDeepDive({
      claim,
      sectionContext: sectionNarrative || '',
      ticker: ticker,
      previousDives: [],
    });

    if (result.error) {
      setDeepDive(prev => ({ ...prev, loading: false, error: result.error }));
      return;
    }

    // Save to report envelope via updateReport
    const newDive = { depth: 1, content: result.content, generatedAt: new Date().toISOString() };
    const updatedDives = { ...savedDeepDives, [diveKey]: [newDive] };
    if (updateReport && id) {
      updateReport(id, { deepDives: updatedDives });
    }

    setDeepDive(prev => ({
      ...prev,
      loading: false,
      content: result.content,
      depth: 1,
    }));
  }

  // Go Deeper handler — appends deeper analysis to existing dives
  async function handleGoDeeper() {
    const { sectionKey, claimIndex } = deepDive;
    if (!sectionKey || claimIndex == null) return;

    const diveKey = `${sectionKey}:${claimIndex}`;
    const existingDives = savedDeepDives[diveKey] || [];
    const section = sectionMap[sectionKey];
    const claim = section?.notableClaims?.[claimIndex];
    if (!claim) return;

    setDeepDive(prev => ({ ...prev, loading: true, error: null }));

    const result = await generateDeepDive({
      claim,
      sectionContext: section?.narrative || '',
      ticker: ticker,
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
    setDeepDive(prev => ({
      ...prev,
      loading: false,
      content: combinedContent,
      depth: updatedDiveArray.length,
    }));
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
      stageApprovals: { ...report.stageApprovals, fullStory: 'approved' },
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  }

  function handleReject() {
    if (!updateReport || !id || !report) return;
    const notes = window.prompt('Why are you rejecting the Full Story? (optional)') || '';
    const existingNotes = report.notes || '';
    const separator = existingNotes && notes ? '\n' : '';
    updateReport(id, {
      stageApprovals: { ...report.stageApprovals, fullStory: 'rejected' },
      notes: existingNotes + separator + (notes ? `[Rejection] ${notes}` : ''),
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  }

  // --- Loading State ---
  if (loading && !fullStoryData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 10 }}>
        <Spinner />
        <span style={{ fontSize: 13, color: C.textMuted }}>Loading report...</span>
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div style={{ padding: 20, color: C.red, fontSize: 13 }}>
        {error}
      </div>
    );
  }

  // --- Gate Check (Pitch Deck not approved) ---
  if (!pitchDeckApproved && !fullStoryData && !progress) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '40vh',
        gap: 8,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
          Pitch Deck must be approved first
        </div>
        <div style={{ fontSize: 13, fontWeight: 400, color: C.textMuted }}>
          Approve the Pitch Deck before viewing the Full Story.
        </div>
      </div>
    );
  }

  // --- Grace period (pipeline starting, progress files not yet created) ---
  if (graceActive && !fullStoryData && !progress) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 10 }}>
        <Spinner />
        <span style={{ fontSize: 13, color: C.textMuted }}>Starting generation...</span>
      </div>
    );
  }

  // --- Empty State ---
  if (!fullStoryData && !progress) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '40vh',
        gap: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
          No Full Story generated yet
        </div>
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
          {generating ? 'Generating...' : 'Generate Full Story'}
        </button>
        {showGenerateDialog && (
          <ConfirmGenerateDialog
            ticker={ticker}
            stage="full-story"
            onConfirm={() => {
              setShowGenerateDialog(false);
              setGraceActive(true);
              setTimeout(() => setGraceActive(false), 5000);
              triggerGeneration('full-story', null, report?.id);
            }}
            onCancel={() => setShowGenerateDialog(false)}
          />
        )}
      </div>
    );
  }

  // --- Fallback verdict (D-09): most common section verdict when no judge ---
  let fallbackVerdict = null;
  if (!verdict && fullStoryData?.sections) {
    const verdicts = fullStoryData.sections.map(s => s.verdict).filter(Boolean);
    const counts = {};
    for (const v of verdicts) counts[v] = (counts[v] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    fallbackVerdict = sorted[0]?.[0] || null;
  }

  // --- Main Render ---
  return (
    <div>
      {/* A. Hero Header */}
      <div style={{
        marginBottom: 24,
        paddingBottom: 16,
        borderBottom: '1px solid ' + C.border,
      }}>
        {/* Row 1: Ticker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>
            {fullStoryData?.ticker || report?.ticker}
          </span>
        </div>

        {/* Row 2: Company name + direction badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: C.text }}>
            {formatTitle(companyName)}
          </span>
          {verdict
            ? <DirectionBadge direction={verdict.direction} />
            : fallbackVerdict && <VerdictBadge verdict={fallbackVerdict} size="large" />
          }
        </div>

        {/* Row 3: Stage label, timestamp, quality, approval status, export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary }}>
            Stage 3: Full Story
          </span>
          {fullStoryData && isComplete && (
            <ExportButtons ticker={ticker} stage="full-story" />
          )}
          {timestamp && (
            <span style={{ fontSize: 11, fontWeight: 400, color: C.textMuted }}>
              Generated {formatRelativeTime(timestamp)}
            </span>
          )}
          {quality && (
            <span style={{ fontSize: 11, fontWeight: 400, color: qualityColor(quality.overallScore) }}>
              Quality: {quality.overallScore}/100 (Method: {quality.overallMethodologyScore})
            </span>
          )}
          {approvalStatus === 'approved' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>Approved</span>
          )}
          {approvalStatus === 'rejected' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.red }}>Rejected</span>
          )}
        </div>

        {/* Row 4: Investment Implication callout box (only when judge verdict exists) */}
        {verdict && (
          <div style={{
            background: C.bgHover,
            borderRadius: 8,
            padding: 16,
            marginTop: 12,
            borderLeft: '4px solid ' + (verdict.direction === 'Bull' ? C.green : verdict.direction === 'Bear' ? C.red : C.yellow),
          }}>
            <div style={{ fontSize: 13, fontWeight: 400, color: C.textSecondary, lineHeight: 1.6, marginBottom: 8 }}>
              {verdict.summary}
            </div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: C.textMuted,
              letterSpacing: '0.04em',
              marginBottom: 4,
            }}>
              Investment Implication
            </div>
            <div style={{ fontSize: 13, fontWeight: 400, color: C.text, lineHeight: 1.6 }}>
              {verdict.investmentImplication}
            </div>
          </div>
        )}
      </div>

      {/* Generation Progress: bar + state label + timer + phase indicators */}
      {isGenerating && (
        <div style={{ marginBottom: 24 }}>
          {/* Progress bar */}
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
              width: progressPct + '%',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              {fsStateToLabel(progressState)}
            </span>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              {fmtElapsed(elapsedMs)} elapsed
            </span>
          </div>

          {/* Phase indicators (2 phases, evenly spaced like PD) */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', height: 64, marginTop: 16, gap: 0 }}>
            {FS_PHASE_LABELS.map((label, idx) => {
              const status = phaseStatuses[idx];
              const isLast = idx === FS_PHASE_LABELS.length - 1;
              const circleColor = status === 'complete' ? C.green : status === 'active' ? C.accent : C.border;
              const circleFill = status === 'complete' || status === 'active' ? circleColor : 'transparent';
              const connectorColor = status === 'complete' ? C.green : C.border;
              const connectorBorder = status === 'complete' ? `2px solid ${connectorColor}` : `2px dashed ${connectorColor}`;

              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', flex: isLast ? 0 : 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: `2px solid ${circleColor}`,
                      background: circleFill,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      animation: status === 'active' ? 'thes1s-pulse 2s ease-in-out infinite' : 'none',
                    }}>
                      {status === 'complete' && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6L5 9L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: status === 'active' ? C.accent : status === 'complete' ? C.green : C.textMuted, fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                      {label}
                    </span>
                  </div>
                  {!isLast && (
                    <div style={{ flex: 1, borderTop: connectorBorder, marginTop: 12, marginLeft: 8, marginRight: 8 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PSR Summary Card — shown above sections when report is complete */}
      {(!progress || progress.state === 'COMPLETE') && fullStoryData && (
        <PsrSummaryCard ticker={ticker} />
      )}

      {/* B. Two-Column Layout */}
      <div className="thes1s-two-col" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* B1. Sticky Section Nav (200px) */}
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
                  background: item.verdict ? verdictDotColor(item.verdict)
                    : item.status === 'complete' ? C.green
                    : item.status === 'running' ? C.accent
                    : C.border,
                  flexShrink: 0,
                  animation: item.status === 'running' ? 'thes1s-pulse 2s ease-in-out infinite' : 'none',
                }} />
                <span>{item.index}. {truncated}</span>
              </div>
            );
          })}
        </div>

        {/* B2. Content Column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {SECTION_DEFS.map((def) => {
            const section = sectionMap[def.key];
            const qs = qualityMap[def.key];

            // Promise Tracker — data comes from fullStoryData.promises, not sections array
            if (def.key === 'promise_tracker') {
              const promises = fullStoryData?.promises || [];
              if (!promises.length && !fullStoryData) return null;
              return (
                <div key={def.key} id={'section-' + def.key}>
                  {qs && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8, position: 'relative', zIndex: 1, paddingRight: 8 }}>
                      <QualityBadge mechanical={qs.score} methodology={qs.methodology?.score} />
                    </div>
                  )}
                  <PromiseTracker promises={promises} sectionId={'section-' + def.key} />
                </div>
              );
            }

            // Section placeholder during generation (matches PD thin/faded style)
            if (!section) {
              if (!isGenerating) return null;
              const secStatus = sectionProgress[def.key];
              if (secStatus === 'failed') {
                return (
                  <div key={def.key} id={'section-' + def.key} style={{
                    border: '1px solid ' + C.red,
                    borderRadius: 8,
                    padding: '16px 20px',
                    marginBottom: 20,
                    background: C.bgCard,
                    minHeight: 60,
                    scrollMarginTop: 160,
                  }}>
                    <span style={{ fontSize: 13, color: C.red }}>{def.label} -- Failed</span>
                  </div>
                );
              }
              return (
                <div key={def.key} id={'section-' + def.key} style={{
                  border: '1px solid ' + C.border,
                  borderRadius: 8,
                  padding: '16px 20px',
                  marginBottom: 20,
                  background: C.bgCard,
                  opacity: 0.4,
                  minHeight: 60,
                  scrollMarginTop: 160,
                }}>
                  <span style={{ fontSize: 13, color: C.textMuted }}>
                    {def.label} -- {secStatus === 'running' ? 'Generating...' : 'Pending...'}
                  </span>
                </div>
              );
            }

            let content;
            if (CHECKLIST_KEYS.has(def.key)) {
              content = (
                <ChecklistRenderer
                  section={section}
                  sectionId={'section-' + def.key}
                  onCitationClick={handleCitationClick}
                />
              );
            } else if (def.key === 'inversion_rebuttal') {
              content = (
                <DebateRenderer
                  section={section}
                  sectionId={'section-' + def.key}
                  debateOutputs={fullStoryData?.debateOutputs}
                  onCitationClick={handleCitationClick}
                />
              );
            } else {
              content = (
                <SectionRenderer
                  section={section}
                  sectionId={'section-' + def.key}
                  onCitationClick={handleCitationClick}
                  notableClaims={section.notableClaims}
                  onDeepDiveClick={(claimIdx) => handleDeepDiveClick(def.key, claimIdx, section.notableClaims?.[claimIdx], section.narrative)}
                  glossaryTerms={section.glossaryTerms}
                  onGlossaryClick={handleGlossaryClick}
                />
              );
            }

            return (
              <div key={def.key}>
                {/* Quality badge — positioned above section card, right-aligned */}
                {qs && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8, position: 'relative', zIndex: 1, paddingRight: 8 }}>
                    <QualityBadge mechanical={qs.score} methodology={qs.methodology?.score} />
                  </div>
                )}
                {content}
              </div>
            );
          })}

          {/* C. Approval Bar */}
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
                <span style={{ fontWeight: 700 }}>Ready for approval</span>
                <span style={{ color: C.textMuted }}> -- Review the Full Story and approve or reject.</span>
              </span>
              <button
                onClick={handleApprove}
                style={{
                  background: C.green,
                  color: '#fff',
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Approve Full Story
              </button>
              <button
                onClick={handleReject}
                style={{
                  background: 'transparent',
                  color: C.red,
                  border: '1px solid ' + C.red,
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Reject Full Story
              </button>
            </div>
          )}
        </div>
      </div>

      {/* D. Deep Dive Panel overlay */}
      <DeepDivePanel
        isOpen={deepDive.isOpen}
        onClose={() => setDeepDive(prev => ({ ...prev, isOpen: false }))}
        title={deepDive.title}
        content={deepDive.content}
        loading={deepDive.loading}
        depth={deepDive.depth}
        maxDepth={deepDive.maxDepth}
        onGoDeeper={handleGoDeeper}
        error={deepDive.error}
      />

      {/* E. Industry Card glossary popover */}
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

export const _testExports = { SECTION_DEFS, qualityColor };
