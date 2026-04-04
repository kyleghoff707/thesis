import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { C } from '../theme';
import { useFullStory } from '../hooks/useFullStory';
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
import { formatTitle, formatRelativeTime, verdictDotColor } from './reportHelpers';
import Spinner from './Spinner';

// --- Section definitions for the Full Story (7 sections: 6 original + Promise Tracker) ---
const SECTION_DEFS = [
  { key: 'event_analysis', label: 'Event Analysis' },
  { key: 'meaning_checklist', label: 'Meaning Checklist' },
  { key: 'moat_checklist', label: 'Moat Checklist' },
  { key: 'management_checklist', label: 'Management Checklist' },
  { key: 'valuation_confirmation', label: 'Valuation Confirmation' },
  { key: 'inversion_rebuttal', label: 'Inversion & Rebuttal' },
  { key: 'promise_tracker', label: 'Management Promise Tracker' },
];

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
  const { report: fullStoryData, quality, progress, loading, error } = useFullStory(ticker);

  const sectionIds = useMemo(() => SECTION_DEFS.map(d => d.key), []);
  const activeSection = useScrollSpy(sectionIds);

  // Map sections by key for O(1) lookup
  const sectionMap = useMemo(() => {
    const m = {};
    if (fullStoryData?.sections) {
      for (const s of fullStoryData.sections) m[s.key] = s;
    }
    return m;
  }, [fullStoryData]);

  // Map quality by sectionKey for O(1) lookup
  const qualityMap = useMemo(() => {
    const m = {};
    if (quality?.sections) {
      for (const qs of quality.sections) m[qs.sectionKey] = qs;
    }
    return m;
  }, [quality]);

  // Nav items with verdict dots (Promise Tracker has no verdict)
  const navItems = useMemo(() => SECTION_DEFS.map((def, idx) => ({
    key: def.key,
    label: def.label,
    index: idx + 1,
    verdict: def.key === 'promise_tracker' ? null : (sectionMap[def.key]?.verdict || null),
  })), [sectionMap]);

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

  // --- Empty State ---
  if (!fullStoryData && !progress) {
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
          No Full Story generated yet
        </div>
        <div style={{ fontSize: 13, fontWeight: 400, color: C.textMuted }}>
          Run the Full Story pipeline for {ticker} to create one. The Pitch Deck must be approved first.
        </div>
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

        {/* Row 3: Stage label, timestamp, quality, approval status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary }}>
            Stage 3: Full Story
          </span>
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

      {/* B. Two-Column Layout */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* B1. Sticky Section Nav (200px) */}
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

            if (!section) return null;

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
