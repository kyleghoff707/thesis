// Stage navigation tab bar — switches between One Pager, Pitch Deck, Final Thesis
// Tabs lock/unlock based on stageApprovals gate conditions (D-04, D-05, D-06)

import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { C } from '../theme';

const STAGES = [
  { key: 'one-pager', label: 'One Pager', gate: null },
  { key: 'pitch-deck', label: 'Pitch Deck', gate: 'onePager' },
  { key: 'final-thesis', label: 'Final Thesis', gate: 'pitchDeck' },
];

// Tooltip text for locked stages
const GATE_TOOLTIPS = {
  onePager: 'Approve One Pager to unlock Pitch Deck',
  pitchDeck: 'Approve Pitch Deck to unlock Final Thesis',
};

// Lock icon SVG (12x12px closed padlock)
function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export default function StageNavBar({ stageApprovals }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid ' + C.border,
      marginBottom: 24,
    }}>
      {STAGES.map(stage => {
        const isActive = currentPath.endsWith('/' + stage.key);
        const isLocked = stage.gate && stageApprovals?.[stage.gate] !== 'approved';

        return (
          <button
            key={stage.key}
            disabled={isLocked}
            onClick={() => !isLocked && navigate(`/research/${id}/${stage.key}`)}
            title={isLocked ? GATE_TOOLTIPS[stage.gate] : ''}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid ' + C.accent : '2px solid transparent',
              color: isLocked ? C.textMuted : isActive ? C.accent : C.text,
              fontWeight: isActive ? 600 : 400,
              fontSize: 13,
              cursor: isLocked ? 'not-allowed' : 'pointer',
              opacity: isLocked ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'inherit',
            }}
          >
            {isLocked && <LockIcon />}
            {stage.label}
          </button>
        );
      })}
    </div>
  );
}

export const _testExports = { STAGES };
