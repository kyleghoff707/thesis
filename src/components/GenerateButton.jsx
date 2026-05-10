import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../theme';
import Spinner from './Spinner';
import ConfirmGenerateDialog from './ConfirmGenerateDialog';
import { useAssembleData } from '../hooks/useAssembleData';
import { sliceDataPacket } from '../utils/sliceDataPacket';

// Determine button state from report + stage availability + generating flag
// Pure function — exported via _testExports for testing
function getButtonState(ticker, report, stageAvailability, generating) {
  if (generating) {
    // Determine which stage is being generated so we can link to it
    const approvals = report?.stageApprovals || {};
    const avail = stageAvailability || {};
    const reportId = report?.id;
    if (!avail.onePager) return { label: 'Generating One Pager...', action: 'view', stage: 'one-pager', route: `/research/${reportId}/one-pager`, style: 'generating' };
    if (approvals.onePager === 'approved' && !avail.pitchDeck) return { label: 'Generating Pitch Deck...', action: 'view', stage: 'pitch-deck', route: `/research/${reportId}/pitch-deck`, style: 'generating' };
    if (approvals.pitchDeck === 'approved' && !avail.finalThesis) return { label: 'Generating Final Thesis...', action: 'view', stage: 'final-thesis', route: `/research/${reportId}/final-thesis`, style: 'generating' };
    return { label: 'Generating...', action: 'disabled', stage: null, style: 'disabled' };
  }

  const approvals = report?.stageApprovals || {};
  const avail = stageAvailability || {};
  const reportId = report?.id;

  // Walk through stages in order
  if (!avail.onePager) return { label: 'Generate One Pager', action: 'generate', stage: 'one-pager', style: 'primary' };
  if (approvals.onePager !== 'approved') return { label: 'View One Pager', action: 'view', stage: 'one-pager', route: `/research/${reportId}/one-pager`, style: 'ghost' };

  if (!avail.pitchDeck) return { label: 'Generate Pitch Deck', action: 'generate', stage: 'pitch-deck', style: 'primary' };
  if (approvals.pitchDeck !== 'approved') return { label: 'View Pitch Deck', action: 'view', stage: 'pitch-deck', route: `/research/${reportId}/pitch-deck`, style: 'ghost' };

  if (!avail.finalThesis) return { label: 'Generate Final Thesis', action: 'generate', stage: 'final-thesis', style: 'primary' };
  // FS exists (generated or approved)
  return { label: 'View Final Thesis', action: 'view', stage: 'final-thesis', route: `/research/${reportId}/final-thesis`, style: 'ghost' };
}

export default function GenerateButton({ ticker, report, stageAvailability, generating, onGenerate }) {
  const navigate = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const { assemble, assembleOnePager, phase: assemblyPhase, progress: assemblyProgress, error: assemblyError } = useAssembleData();

  const reportId = report?.id;
  const state = getButtonState(ticker, report, stageAvailability, generating);

  // Disabled / generating state
  if (state.action === 'disabled') {
    return (
      <button
        disabled
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: C.badge,
          color: C.badgeText,
          border: 'none',
          cursor: 'default',
          opacity: 0.7,
          padding: '8px 20px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'inherit',
        }}
      >
        <Spinner size={12} />
        {state.label}
      </button>
    );
  }

  // Generate action — opens confirmation dialog
  if (state.action === 'generate') {
    return (
      <>
        <button
          onClick={() => setShowDialog(true)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            background: hovered ? C.accentHover : C.accent,
            color: '#fff',
            padding: '8px 20px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            fontFamily: 'inherit',
            transition: 'background .15s',
          }}
        >
          {state.label}
        </button>
        {assembling && assemblyProgress?.detail && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.textSecondary }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Spinner size={10} />
              {assemblyProgress.detail}
            </span>
          </div>
        )}
        {assemblyError && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>
            {assemblyError}
          </div>
        )}
        {showDialog && (
          <ConfirmGenerateDialog
            ticker={ticker}
            stage={state.stage}
            onConfirm={async () => {
              setShowDialog(false);
              if (!onGenerate) return;

              if (state.stage === 'pitch-deck') {
                setAssembling(true);
                try {
                  const payload = await assemble(ticker);
                  setAssembling(false);
                  onGenerate(state.stage, payload, report?.id);
                } catch {
                  setAssembling(false);
                  // assemblyError is already set by the hook
                }
              } else if (state.stage === 'one-pager') {
                // Assemble DataPacket, slice to one-pager fields, forward as payload.
                // On failure, fall back silently to ticker-only (preserves pre-slicing behavior).
                setAssembling(true);
                try {
                  const { dataPacket } = await assembleOnePager(ticker);
                  const sliced = sliceDataPacket(dataPacket, 'one-pager');
                  setAssembling(false);
                  onGenerate(state.stage, { dataPacket: sliced }, report?.id);
                } catch (err) {
                  console.warn('[one-pager] DataPacket assembly failed — falling back to ticker-only:', err?.message || err);
                  setAssembling(false);
                  onGenerate(state.stage, null, report?.id);
                }
              } else {
                onGenerate(state.stage, null, report?.id);
              }
            }}
            onCancel={() => setShowDialog(false)}
          />
        )}
      </>
    );
  }

  // View action — navigates to report
  return (
    <button
      onClick={() => navigate(state.route)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: hovered ? C.accentLight : 'transparent',
        border: '1px solid ' + C.accent,
        color: C.accent,
        padding: '8px 20px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all .15s',
      }}
    >
      {state.style === 'generating' && <Spinner size={12} />}
      {state.label}
    </button>
  );
}

export const _testExports = { getButtonState };
