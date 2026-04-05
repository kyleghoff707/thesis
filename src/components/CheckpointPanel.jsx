import { useState } from 'react';
import { C } from '../theme';
import { useCheckpoint } from '../hooks/useCheckpoint';
import DataGapsPanel from './DataGapsPanel';
import SectionRenderer from './SectionRenderer';
import CheckpointCommentBox from './CheckpointCommentBox';
import Spinner from './Spinner';

function fmtElapsed(ms) {
  if (ms == null || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function CheckpointPanel({ ticker, checkpointNum, sections, dataGaps, totalSections, elapsedMs, onContinue, onRerun }) {
  const [openCommentKey, setOpenCommentKey] = useState(null);
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    comments, loading, error,
    saveComment, addAttachment, removeAttachment,
    saveDataGapResponse, submitCheckpoint,
  } = useCheckpoint(ticker, checkpointNum);

  async function handleContinue() {
    setSubmitting(true);
    try {
      await submitCheckpoint('continue');
      if (onContinue) onContinue();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRerun() {
    setSubmitting(true);
    try {
      await submitCheckpoint('rerun');
      if (onRerun) onRerun();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      border: '1px solid ' + C.border,
      borderRadius: 8,
      background: C.bgCard,
      padding: '16px 20px',
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid ' + C.border,
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.text }}>
          Checkpoint Review — Wave {checkpointNum}
        </div>
        <div style={{ fontSize: 13, color: C.textSecondary }}>
          {fmtElapsed(elapsedMs)} | {sections?.length || 0}/{totalSections || 0} sections
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 20, justifyContent: 'center' }}>
          <Spinner size={20} />
          <span style={{ fontSize: 13, color: C.textMuted }}>Loading checkpoint...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ fontSize: 13, color: C.red, padding: '8px 0' }}>{error}</div>
      )}

      {/* Completed Sections */}
      {sections && sections.length > 0 && (
        <>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: C.textMuted,
            marginBottom: 12,
          }}>
            Completed Sections
          </div>
          {sections.map(section => {
            const key = section.key || section.sectionKey || section.title;
            const commentData = comments?.[key];
            const commentCount = (commentData?.text ? 1 : 0) + (commentData?.attachments?.length || 0);
            return (
              <div key={key}>
                <SectionRenderer
                  section={section}
                  sectionId={`checkpoint-${key}`}
                  onCommentClick={() => setOpenCommentKey(prev => prev === key ? null : key)}
                  commentCount={commentCount}
                />
                {openCommentKey === key && (
                  <CheckpointCommentBox
                    sectionKey={key}
                    comment={commentData || null}
                    attachments={commentData?.attachments || []}
                    onSave={saveComment}
                    onAttach={addAttachment}
                    onRemoveAttachment={removeAttachment}
                  />
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Action Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 12,
        padding: '16px 0 0',
        borderTop: '1px solid ' + C.border,
        marginTop: 16,
      }}>
        {!confirmRerun ? (
          <>
            <button
              onClick={() => setConfirmRerun(true)}
              disabled={submitting}
              style={{
                background: 'transparent',
                color: C.red,
                border: '1px solid ' + C.red,
                padding: '8px 24px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: submitting ? 'default' : 'pointer',
                fontFamily: 'inherit',
                opacity: submitting ? 0.5 : 1,
              }}
            >
              Re-run Wave {checkpointNum}
            </button>
            <button
              onClick={handleContinue}
              disabled={submitting}
              style={{
                background: C.green,
                color: '#fff',
                border: 'none',
                padding: '8px 24px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: submitting ? 'default' : 'pointer',
                fontFamily: 'inherit',
                opacity: submitting ? 0.9 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {submitting && <Spinner size={14} />}
              {submitting ? 'Advancing...' : (checkpointNum >= 3 ? 'Continue to Completion' : `Continue to Wave ${checkpointNum + 1}`)}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: C.textSecondary, flex: 1, lineHeight: 1.5, alignSelf: 'center' }}>
              This will re-generate all sections in Wave {checkpointNum} using your feedback. Previously generated content for this wave will be replaced.
            </div>
            <button
              onClick={() => setConfirmRerun(false)}
              style={{
                background: 'transparent',
                color: C.textSecondary,
                border: '1px solid ' + C.border,
                padding: '8px 20px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Keep Current
            </button>
            <button
              onClick={handleRerun}
              disabled={submitting}
              style={{
                background: C.red,
                color: '#fff',
                border: 'none',
                padding: '8px 20px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: submitting ? 'default' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {submitting && <Spinner size={14} />}
              Re-run Wave {checkpointNum}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
