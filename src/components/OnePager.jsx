import { useRef, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { C } from '../theme';
import { useOnePager } from '../hooks/useOnePager';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { useGeneratePipeline } from '../hooks/useGeneratePipeline';
import { useFinancials } from '../hooks/useFinancials';
import { formatCompanyName } from '../engines/formatCompanyName';
import SectionRenderer from './SectionRenderer.jsx';
import VerdictBadge from './VerdictBadge.jsx';
import GenerationProgressPanel from './GenerationProgressPanel';
import { formatTitle, formatRelativeTime, stateToLabel, verdictDotColor } from './reportHelpers';
import Spinner from './Spinner';
import ExportButtons from './ExportButtons';

// Title-case a snake_case section key: "company_info" → "Company Info"
function titleCase(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// --- OnePager-specific helper functions ---

// Map progress sections to display statuses
function computeSectionStatuses(progress) {
  if (!progress || !progress.sections) return {};
  const result = {};
  for (const key of Object.keys(progress.sections)) {
    result[key] = progress.sections[key].status;
  }
  return result;
}

// Compute completion percentage from section statuses + pipeline state
function computePercentage(statuses, progressState) {
  // Use section completion if any sections are complete
  const keys = Object.keys(statuses);
  if (keys.length > 0) {
    const complete = keys.filter(k => statuses[k] === 'complete').length;
    if (complete > 0) return Math.round((complete / keys.length) * 100);
  }
  // Fall back to pipeline state for progress indication
  const stateProgress = {
    'IDLE': 0,
    'DATA_ASSEMBLY': 15,
    'PRIMARY_SOURCE_READING': 30,
    'WAVE_1_RUNNING': 50,
    'WAVE_2_RUNNING': 70,
    'WAVE_3_RUNNING': 85,
    'SYNTHESIS': 92,
    'QUALITY_CHECK': 95,
    'COMPLETE': 100,
  };
  return stateProgress[progressState] || 0;
}

export default function OnePager({ getReport, updateReport, refreshReport }) {
  const { id } = useParams();
  const report = getReport ? getReport(id) : null;
  // Production: report.onePager is loaded from D1 via useResearch → GET /user/reports/:id.
  // Dev: useOnePager fetches from Vite middleware. Use report.onePager if available (production),
  // fall back to useOnePager for dev mode and progress polling.
  const { report: hookData, progress, loading, error } = useOnePager(report?.ticker);
  const onePagerData = report?.onePager || hookData;

  // Self-heal companyName if it's empty or diverges from EDGAR's authoritative
  // name. Covers the case where the user navigates straight to /one-pager
  // without visiting Toolbox (which runs the same check).
  const { company: financialsCompany, loading: financialsLoading } = useFinancials(report?.ticker);
  useEffect(() => {
    if (!financialsCompany?.name || !report || financialsLoading) return;
    const formatted = formatCompanyName(financialsCompany.name);
    if (formatted && report.companyName !== formatted && updateReport) {
      updateReport(report.id, { companyName: formatted });
    }
  }, [financialsCompany?.name, financialsLoading, report?.id, report?.companyName, updateReport]);

  // Subscribe to pipeline completion so we can refresh report.onePager from D1
  // when the Worker finishes writing to report_stages. useGeneratePipeline is
  // idempotent to call from multiple components (Toolbox already calls it).
  const { result: pipelineResult, generating, progress: pipelineProgress, liveSections, generationError } = useGeneratePipeline(report?.ticker);
  const hasCompletedSections = pipelineResult?.sections?.length > 0;
  useEffect(() => {
    if (hasCompletedSections && refreshReport && id) {
      refreshReport(id);
    }
  }, [hasCompletedSections, id, refreshReport]);

  // Mount-time refresh — handles the edge case where the pipeline completed on the
  // server while no component instance of useGeneratePipeline was mounted to observe
  // it (e.g., user was on the Reports tab during the 8-min run). Safe to call redundantly.
  useEffect(() => {
    if (refreshReport && id) refreshReport(id);
  }, [id, refreshReport]);

  // Grace period: show spinner for 5s after mount to let pipeline write progress.json
  const [graceActive, setGraceActive] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setGraceActive(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Live elapsed timer — ticks every second while pipeline is active.
  // Initialize from startedAt immediately to avoid reset flash on remount.
  const startMs = progress?.startedAt ? new Date(progress.startedAt).getTime() : null;
  const [elapsed, setElapsed] = useState(() =>
    startMs && progress?.state !== 'COMPLETE' ? Math.floor((Date.now() - startMs) / 1000) : 0
  );
  useEffect(() => {
    if (!startMs || progress?.state === 'COMPLETE') return;
    setElapsed(Math.floor((Date.now() - startMs) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startMs, progress?.state]);

  // Scroll spy for active section tracking (shared hook, D-07/D-09)
  const sectionKeysForSpy = onePagerData?.sectionKeys || onePagerData?.sections?.map(s => s.key) || [];
  const activeSection = useScrollSpy(sectionKeysForSpy, { topOffset: 100 });

  // Loading state
  if (loading && !onePagerData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 10 }}>
        <Spinner />
        <span style={{ fontSize: 13, color: C.textMuted }}>Loading report...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ fontSize: 13, color: C.red, padding: 20 }}>{error}</div>
    );
  }

  // Empty state — no report data and no progress (not generating)
  if (!onePagerData && !progress) {
    if (graceActive) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 10 }}>
          <Spinner />
          <span style={{ fontSize: 13, color: C.textMuted }}>Starting generation...</span>
        </div>
      );
    }
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '40vh',
        gap: 8,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>No One Pager generated yet</div>
        <div style={{ fontSize: 13, color: C.textMuted }}>
          Go to the Research tab and click Generate One Pager to start.
        </div>
      </div>
    );
  }

  // Compute section keys and statuses
  const sectionKeys = onePagerData?.sectionKeys || onePagerData?.sections?.map(s => s.key) || [];
  const sectionStatuses = computeSectionStatuses(progress);
  const percentage = computePercentage(sectionStatuses, progress?.state);
  const isComplete = !progress || progress.state === 'COMPLETE';

  // Build section lookup
  const sectionMap = {};
  if (onePagerData?.sections) {
    for (const s of onePagerData.sections) {
      sectionMap[s.key] = s;
    }
  }

  // Derive the list of keys to iterate — prefer onePagerData.sectionKeys, fall back to progress sections
  const displayKeys = sectionKeys.length > 0
    ? sectionKeys
    : (progress?.sections ? Object.keys(progress.sections) : []);

  // Collect all citations for the reference list
  const allCitations = [];
  const citationIds = new Set();
  if (onePagerData?.sections) {
    for (const section of onePagerData.sections) {
      if (section.citations && Array.isArray(section.citations)) {
        for (const c of section.citations) {
          if (c.id && !citationIds.has(c.id)) {
            citationIds.add(c.id);
            allCitations.push(c);
          }
        }
      }
    }
  }

  // Approval status
  const approvalStatus = report?.stageApprovals?.onePager;
  const allSectionsRendered = onePagerData?.sections?.length >= displayKeys.length && displayKeys.length > 0;
  const showApprovalBar = allSectionsRendered && isComplete && !approvalStatus;

  function handleCitationClick() {
    const el = document.getElementById('citation-references');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  function handleApprove() {
    if (!updateReport || !id || !report) return;
    updateReport(id, {
      stageApprovals: { ...report.stageApprovals, onePager: 'approved' },
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  }

  function handleReject() {
    if (!updateReport || !id || !report) return;
    const notes = window.prompt('Rejection notes (optional):') || '';
    const existingNotes = report.notes || '';
    const separator = existingNotes && notes ? '\n' : '';
    updateReport(id, {
      stageApprovals: { ...report.stageApprovals, onePager: 'rejected' },
      notes: existingNotes + separator + (notes ? `[Rejection] ${notes}` : ''),
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  }

  function handleNavClick(key) {
    const el = document.getElementById('section-' + key);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div>
      {/* A. Generation progress panel — shows during pipeline runs.
          Gated on pipelineProgress (from useGeneratePipeline, production) so it
          renders regardless of which component instance first observed completion. */}
      {(generating || pipelineProgress) && (
        <GenerationProgressPanel
          stage={pipelineProgress?.stage || 'onePager'}
          ticker={report?.ticker}
          generating={generating}
          progress={pipelineProgress}
          completedSections={liveSections}
          error={pipelineProgress?.error}
          generationError={generationError}
        />
      )}

      {/* B. Report Header (Hero) */}
      <div style={{
        marginBottom: 24,
        paddingBottom: 16,
        borderBottom: '1px solid ' + C.border,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.accent, marginBottom: 4 }}>
          {onePagerData?.ticker || report?.ticker}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.text }}>
            {formatTitle(onePagerData?.companyName || report?.companyName || '')}
          </span>
          <VerdictBadge verdict={onePagerData?.overallVerdict} size="large" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onePagerData?.generatedAt && (
            <span style={{ fontSize: 11, color: C.textMuted }}>
              Generated {formatRelativeTime(onePagerData.generatedAt)}
            </span>
          )}
          {isComplete && progress?.startedAt && (
            <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>
              {(() => {
                const totalSec = Math.floor((new Date(progress.lastUpdated || Date.now()).getTime() - new Date(progress.startedAt).getTime()) / 1000);
                const m = Math.floor(totalSec / 60);
                const s = totalSec % 60;
                return `Generated in ${m}m ${s}s`;
              })()}
            </span>
          )}
          {approvalStatus === 'approved' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>Approved</span>
          )}
          {approvalStatus === 'rejected' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.red }}>Rejected</span>
          )}
          {onePagerData && isComplete && (
            <ExportButtons ticker={report?.ticker} stage="one-pager" report={report} />
          )}
        </div>
      </div>

      {/* C. Progress Bar (visible during generation) */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              {stateToLabel(progress.state)}
            </span>
            <span style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
              {String(Math.floor(elapsed / 3600)).padStart(2, '0')}:{String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
            </span>
          </div>
        </div>
      )}

      {/* D. Two-Column Layout */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* D1. Sticky Section Nav */}
        <div style={{
          position: 'sticky',
          top: 72,
          width: 200,
          flexShrink: 0,
        }}>
          {displayKeys.map((key, idx) => {
            const section = sectionMap[key];
            const isActive = activeSection === key;
            const title = section?.title || titleCase(key);
            const truncated = title.length > 25 ? title.slice(0, 25) + '...' : title;

            return (
              <div
                key={key}
                onClick={() => handleNavClick(key)}
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
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.background = C.bgHover;
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: section ? verdictDotColor(section.verdict) : C.textMuted,
                  flexShrink: 0,
                }} />
                <span>{idx + 1}. {truncated}</span>
              </div>
            );
          })}
        </div>

        {/* D2. Content Column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* E. Section Rendering */}
          {displayKeys.map(key => {
            const section = sectionMap[key];
            const status = sectionStatuses[key];

            // Section exists — render it
            if (section) {
              return (
                <div key={key} style={{ animation: 'thesis-fadeIn 0.4s ease' }}>
                  <SectionRenderer
                    section={section}
                    sectionId={'section-' + section.key}
                    onCitationClick={handleCitationClick}
                  />
                </div>
              );
            }

            // Running placeholder
            if (status === 'running') {
              const agentRole = progress?.sections?.[key]?.agentRole || 'analyst';
              return (
                <div
                  key={key}
                  id={'section-' + key}
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
                    Agent: {agentRole} working...
                  </span>
                </div>
              );
            }

            // Failed placeholder
            if (status === 'failed') {
              return (
                <div
                  key={key}
                  id={'section-' + key}
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
                    {titleCase(key)} -- Generation failed
                  </span>
                  {progress?.sections?.[key]?.error && (
                    <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>
                      {progress.sections[key].error}
                    </div>
                  )}
                </div>
              );
            }

            // Pending placeholder
            return (
              <div
                key={key}
                id={'section-' + key}
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
                  {titleCase(key)} -- Pending...
                </span>
              </div>
            );
          })}

          {/* F. References — hidden in working view, available for future export view */}

          {/* G. Approval Bar */}
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
                <span style={{ color: C.textMuted }}> -- Review the One Pager and approve or reject to proceed.</span>
              </span>
              <button
                onClick={handleApprove}
                style={{
                  background: C.green,
                  color: '#fff',
                  padding: '8px 20px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Approve
              </button>
              <button
                onClick={handleReject}
                style={{
                  background: 'transparent',
                  color: C.red,
                  border: '1px solid ' + C.red,
                  padding: '8px 20px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const _testExports = { computeSectionStatuses };
