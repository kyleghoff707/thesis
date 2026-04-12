import { useState, useEffect, useRef } from 'react';
import { C } from '../theme';

// Section display names by stage
const PITCH_DECK_SECTIONS = [
  'Radar', 'Simple & Predictable', 'Market Position', 'Barriers & Moats',
  'FCF', 'Management', 'ROE/ROIC & Debt', 'Balance Sheet', 'PEST Risks', 'Valuation',
];

const FULL_STORY_SECTIONS = [
  'Event Analysis', 'Meaning (15pt)', 'Moat (15pt)', 'Management (13pt)',
  'Valuation Confirmation', 'Inversion & Rebuttal',
];

const DEBATE_STEPS = [
  { label: 'Bull thesis', agent: 'synthesis-writer' },
  { label: 'Bear inversion', agent: 'risk-analyst' },
  { label: 'Bull rebuttal', agent: 'synthesis-writer' },
  { label: 'Judge verdict', agent: 'financial-analyst' },
  { label: 'Composition', agent: 'synthesis-writer' },
];

// Map agent role to short display name
function agentDisplayName(role) {
  const names = {
    'business-analyst': 'business-analyst',
    'competitor-evaluator': 'competitor-eval',
    'financial-analyst': 'financial-analyst',
    'management-evaluator': 'mgmt-evaluator',
    'risk-analyst': 'risk-analyst',
    'valuation-specialist': 'valuation-spec',
    'synthesis-writer': 'synthesis-writer',
    'annual-reader': 'annual-reader',
    'quarterly-reader': 'quarterly-reader',
  };
  return names[role] || role || '';
}

// Format elapsed time as MM:SS
function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Format cost in dollars
function formatCost(sections) {
  if (!sections || sections.length === 0) return null;
  let totalInput = 0, totalOutput = 0;
  for (const s of sections) {
    if (s?.tokenCost) {
      totalInput += s.tokenCost.input || 0;
      totalOutput += s.tokenCost.output || 0;
    }
  }
  const cost = (totalInput * 3 / 1_000_000) + (totalOutput * 15 / 1_000_000);
  if (cost < 0.01) return null;
  return `$${cost.toFixed(2)}`;
}

export default function GenerationProgressPanel({ stage, ticker, generating, progress, completedSections, error, generationError }) {
  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (generating && !startRef.current) {
      startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
    }
    if (!generating && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [generating]);

  // Reset on new generation
  useEffect(() => {
    if (generating) {
      startRef.current = Date.now();
      setElapsed(0);
    }
  }, [generating, ticker]);

  if (!generating && !progress) return null;

  const status = progress?.status || 'queued';
  const currentWave = progress?.currentWave || 0;
  const totalWaves = progress?.totalWaves || 0;
  const progressData = progress?.progress || {};
  const isComplete = ['completed', 'completed_with_errors', 'failed'].includes(status);
  const hasErrors = status === 'completed_with_errors' || status === 'failed';

  // Stage-specific config
  const sectionNames = stage === 'pitchDeck' ? PITCH_DECK_SECTIONS
    : stage === 'fullStory' ? FULL_STORY_SECTIONS
    : [];
  const totalSections = sectionNames.length || 1;
  const completedCount = completedSections?.length || 0;
  const pct = Math.min(100, Math.round((completedCount / totalSections) * 100));

  // Phase label
  let phaseLabel = '';
  if (status === 'queued') phaseLabel = 'Starting...';
  else if (status === 'assembling' || progressData.status === 'assembling') phaseLabel = 'Assembling data...';
  else if (progressData.status === 'running' || status === 'running') {
    if (stage === 'onePager') {
      phaseLabel = 'Analyzing...';
    } else if (stage === 'pitchDeck') {
      const phaseNames = ['Business Fundamentals', 'Financial Deep-Dive', 'Risk & Valuation', 'Synthesis'];
      const waveIdx = Math.max(0, Math.min((currentWave || 1) - 1, phaseNames.length - 1));
      phaseLabel = `Phase ${currentWave || 1} of ${totalWaves || 4} — ${phaseNames[waveIdx]}`;
    } else if (stage === 'fullStory') {
      const phaseNames = ['Deep Analysis', 'The Debate'];
      const waveIdx = Math.max(0, Math.min((currentWave || 1) - 1, phaseNames.length - 1));
      phaseLabel = `Phase ${currentWave || 1} of ${totalWaves || 2} — ${phaseNames[waveIdx]}`;
    }
  } else if (progressData.status === 'completed') phaseLabel = 'Complete';

  // Cost
  const cost = formatCost(completedSections);

  // Completion banner
  if (isComplete && !generating) {
    const bannerColor = hasErrors ? C.yellow : C.green;
    const bannerBg = hasErrors ? (C.yellow + '15') : (C.green + '15');
    return (
      <div style={{
        padding: '10px 14px',
        marginBottom: 16,
        borderRadius: 6,
        border: `1px solid ${bannerColor}`,
        background: bannerBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 13,
      }}>
        <span style={{ color: bannerColor, fontWeight: 500 }}>
          {hasErrors ? 'Completed with errors' : 'Complete'} in {formatElapsed(elapsed)}
          {completedCount > 0 && ` — ${completedCount} sections`}
          {cost && ` — ${cost}`}
        </span>
        {error && (
          <span style={{ color: C.red, fontSize: 12, marginLeft: 12 }}>
            {typeof error === 'string' ? error : 'Some sections failed'}
          </span>
        )}
      </div>
    );
  }

  // Not generating and not complete — nothing to show
  if (!generating) return null;

  // ── One Pager (compact) ──
  if (stage === 'onePager') {
    return (
      <div style={{
        padding: '12px 14px',
        marginBottom: 16,
        borderRadius: 6,
        border: `1px solid ${C.border}`,
        background: C.card,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>
            Generating One Pager for {ticker}
          </span>
          <span style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>
            {formatElapsed(elapsed)}
          </span>
        </div>
        {/* Progress bar */}
        <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{
            height: '100%',
            width: status === 'running' ? '60%' : '20%',
            background: C.accent,
            borderRadius: 2,
            transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ fontSize: 12, color: C.secondary }}>
          {phaseLabel}
          {generationError && <span style={{ color: C.red, marginLeft: 8 }}>{generationError}</span>}
        </div>
      </div>
    );
  }

  // ── Pitch Deck / Full Story (full panel) ──
  return (
    <div style={{
      marginBottom: 16,
      borderRadius: 6,
      border: `1px solid ${C.border}`,
      background: C.card,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>
          Generating {stage === 'pitchDeck' ? 'Pitch Deck' : 'Full Story'} for {ticker}
        </span>
        <span style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* Progress bar + phase */}
      <div style={{ padding: '8px 14px' }}>
        <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: C.accent,
            borderRadius: 2,
            transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: C.accent }}>{phaseLabel}</span>
          <span style={{ color: C.muted }}>{completedCount}/{totalSections} done</span>
        </div>
      </div>

      {/* Section grid */}
      <div style={{ padding: '4px 14px 8px' }}>
        {sectionNames.map((name, i) => {
          const sectionNum = i + 1;
          const section = completedSections?.find(s =>
            s.sectionNumber === sectionNum || s.title?.includes(name.split(' ')[0])
          );
          const isCompleted = !!section;
          const isRunning = !isCompleted && status === 'running' && sectionNum > completedCount && sectionNum <= completedCount + 3;
          const isFailed = section?.status === 'failed' || section?.error;

          return (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '3px 0',
              fontSize: 12,
              opacity: !isCompleted && !isRunning ? 0.4 : 1,
            }}>
              {/* Status icon */}
              <span style={{
                width: 14,
                height: 14,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8,
                fontSize: 10,
                flexShrink: 0,
              }}>
                {isFailed ? (
                  <span style={{ color: C.red }}>✗</span>
                ) : isCompleted ? (
                  <span style={{ color: C.accent }}>✓</span>
                ) : isRunning ? (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: C.yellow,
                    animation: 'pulse 1.5s infinite',
                    display: 'inline-block',
                  }} />
                ) : (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    border: `1px solid ${C.muted}`,
                    display: 'inline-block',
                  }} />
                )}
              </span>

              {/* Section name */}
              <span style={{
                color: isCompleted ? C.text : isRunning ? C.yellow : C.muted,
                fontWeight: isRunning ? 500 : 400,
                flex: 1,
              }}>
                {sectionNum}. {name}
              </span>

              {/* Right side: verdict/agent/duration */}
              <span style={{ color: C.muted, fontSize: 11, marginLeft: 8 }}>
                {isFailed ? (
                  <span style={{ color: C.red }}>failed</span>
                ) : isCompleted && section?.verdict ? (
                  <span style={{
                    color: section.verdict === 'PASS' ? C.green
                      : section.verdict === 'CONCERN' ? C.yellow
                      : section.verdict === 'FAIL' ? C.red : C.muted,
                  }}>
                    {section.verdict}
                  </span>
                ) : isRunning ? (
                  <span style={{ color: C.yellow }}>
                    {agentDisplayName(section?.modelUsed)}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}

        {/* Debate steps (Full Story only) */}
        {stage === 'fullStory' && currentWave >= 2 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.secondary, fontWeight: 500, marginBottom: 4 }}>
              THE DEBATE
            </div>
            {DEBATE_STEPS.map((step, i) => {
              const debateProgress = progressData.debate;
              const currentStep = progressData.step || 0;
              const isDone = debateProgress && i + 1 < currentStep;
              const isCurrent = debateProgress && i + 1 === currentStep;

              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px 0',
                  fontSize: 12,
                  opacity: !isDone && !isCurrent ? 0.4 : 1,
                }}>
                  <span style={{ width: 14, marginRight: 8, textAlign: 'center', fontSize: 10 }}>
                    {isDone ? <span style={{ color: C.accent }}>✓</span>
                      : isCurrent ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.yellow, display: 'inline-block' }} />
                      : <span style={{ width: 8, height: 8, borderRadius: '50%', border: `1px solid ${C.muted}`, display: 'inline-block' }} />}
                  </span>
                  <span style={{ color: isDone ? C.text : isCurrent ? C.yellow : C.muted, flex: 1 }}>
                    {step.label}
                  </span>
                  <span style={{ color: C.muted, fontSize: 11 }}>
                    {(isDone || isCurrent) ? agentDisplayName(step.agent) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer: cost + error */}
      <div style={{
        padding: '6px 14px',
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11,
      }}>
        <span style={{ color: C.muted }}>
          {cost ? `Cost: ${cost}` : 'Estimating cost...'}
        </span>
        {generationError && (
          <span style={{ color: C.red }}>{generationError}</span>
        )}
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
