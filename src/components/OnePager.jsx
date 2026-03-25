import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { C } from '../theme';
import { useOnePager } from '../hooks/useOnePager';
import SectionRenderer from './SectionRenderer.jsx';
import VerdictBadge from './VerdictBadge.jsx';

// --- Pure helper functions (exported via _testExports for testing) ---

// Strip /NEW, /DE, /OLD suffixes and title-case the result
function formatTitle(name) {
  if (!name) return '';
  // Remove trailing / followed by common suffixes (case-insensitive)
  const cleaned = name.replace(/\s*\/(NEW|DE|OLD)\s*$/i, '').trim();
  // Title case: capitalize first letter of each word, lowercase the rest
  return cleaned
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Return human-readable relative time from ISO date string
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

// Map progress state enum to human-readable label
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

// Map progress sections to display statuses
function computeSectionStatuses(progress) {
  if (!progress || !progress.sections) return {};
  const result = {};
  for (const key of Object.keys(progress.sections)) {
    result[key] = progress.sections[key].status;
  }
  return result;
}

// Compute completion percentage from section statuses
function computePercentage(statuses) {
  const keys = Object.keys(statuses);
  if (keys.length === 0) return 0;
  const complete = keys.filter(k => statuses[k] === 'complete').length;
  return Math.round((complete / keys.length) * 100);
}

// Verdict to dot color mapping
function verdictDotColor(verdict) {
  const map = {
    PASS: C.green,
    FAIL: C.red,
    WATCHLIST: C.yellow,
    REVIEW: C.accent,
  };
  return map[verdict] || C.textMuted;
}

// Inline spinner keyframes injection (once)
let spinnerInjected = false;
function injectSpinnerStyle() {
  if (spinnerInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes thes1s-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes thes1s-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
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

export default function OnePager({ getReport, updateReport }) {
  const { id } = useParams();
  const report = getReport ? getReport(id) : null;
  const { report: onePagerData, progress, loading, error } = useOnePager(report?.ticker);
  const [activeSection, setActiveSection] = useState(null);
  const observerRef = useRef(null);

  // Inject spinner/fadeIn keyframes once
  useEffect(() => {
    injectSpinnerStyle();
  }, []);

  // IntersectionObserver for active section tracking
  useEffect(() => {
    if (!onePagerData?.sections) return;

    const sectionKeys = onePagerData.sectionKeys || onePagerData.sections.map(s => s.key);
    const elements = sectionKeys
      .map(key => document.getElementById('section-' + key))
      .filter(Boolean);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the most visible entry
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
  }, [onePagerData]);

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
          Run /generate:one-pager {report?.ticker || 'TICKER'} to create one.
        </div>
      </div>
    );
  }

  // Compute section keys and statuses
  const sectionKeys = onePagerData?.sectionKeys || onePagerData?.sections?.map(s => s.key) || [];
  const sectionStatuses = computeSectionStatuses(progress);
  const percentage = computePercentage(sectionStatuses);
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
          {approvalStatus === 'approved' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>Approved</span>
          )}
          {approvalStatus === 'rejected' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.red }}>Rejected</span>
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
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            {stateToLabel(progress.state)}
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
            const title = section?.title || key.replace(/_/g, ' ');
            const truncated = title.length > 25 ? title.slice(0, 25) + '...' : title;

            return (
              <div
                key={key}
                onClick={() => handleNavClick(key)}
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
                  fontWeight: isActive ? 600 : 400,
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
                <div key={key} style={{ animation: 'thes1s-fadeIn 0.4s ease' }}>
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
                    scrollMarginTop: 120,
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
                    scrollMarginTop: 120,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>
                    {key.replace(/_/g, ' ')} -- Generation failed
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
                  scrollMarginTop: 120,
                }}
              >
                <span style={{ fontSize: 13, color: C.textMuted }}>
                  {key.replace(/_/g, ' ')} -- Pending...
                </span>
              </div>
            );
          })}

          {/* F. Citation Reference List */}
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

export const _testExports = { formatTitle, formatRelativeTime, stateToLabel, computeSectionStatuses };
