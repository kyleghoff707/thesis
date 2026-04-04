import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../theme';
import Spinner from './Spinner';
import ConfirmGenerateDialog from './ConfirmGenerateDialog';

// Determine button state from report + stage availability + generating flag
// Pure function — exported via _testExports for testing
function getButtonState(ticker, report, stageAvailability, generating) {
  if (generating) return { label: 'Generating...', action: 'disabled', stage: null, style: 'disabled' };

  const approvals = report?.stageApprovals || {};
  const avail = stageAvailability || {};
  const reportId = report?.id;

  // Walk through stages in order
  if (!avail.onePager) return { label: 'Generate One Pager', action: 'generate', stage: 'one-pager', style: 'primary' };
  if (approvals.onePager !== 'approved') return { label: 'View One Pager', action: 'view', stage: 'one-pager', route: `/research/${reportId}/one-pager`, style: 'ghost' };

  if (!avail.pitchDeck) return { label: 'Generate Pitch Deck', action: 'generate', stage: 'pitch-deck', style: 'primary' };
  if (approvals.pitchDeck !== 'approved') return { label: 'View Pitch Deck', action: 'view', stage: 'pitch-deck', route: `/research/${reportId}/pitch-deck`, style: 'ghost' };

  if (!avail.fullStory) return { label: 'Generate Full Story', action: 'generate', stage: 'full-story', style: 'primary' };
  // FS exists (generated or approved)
  return { label: 'View Full Story', action: 'view', stage: 'full-story', route: `/research/${reportId}/full-story`, style: 'ghost' };
}

export default function GenerateButton({ ticker, report, stageAvailability, generating, onGenerate }) {
  const navigate = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [hovered, setHovered] = useState(false);

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
        {showDialog && (
          <ConfirmGenerateDialog
            ticker={ticker}
            stage={state.stage}
            onConfirm={() => {
              setShowDialog(false);
              if (onGenerate) onGenerate(state.stage);
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
      {state.label}
    </button>
  );
}

export const _testExports = { getButtonState };
