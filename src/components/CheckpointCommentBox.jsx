import { useState, useRef } from 'react';
import { C } from '../theme';

function fmtFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function CheckpointCommentBox({ sectionKey, comment, attachments, onSave, onAttach, onRemoveAttachment }) {
  const [text, setText] = useState(comment?.text || '');
  const [error, setError] = useState(null);
  const [focused, setFocused] = useState(false);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);

  const allAttachments = attachments || comment?.attachments || [];

  function handleAutoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const rows = Math.min(8, Math.max(3, Math.ceil(el.scrollHeight / 20)));
    el.rows = rows;
    el.style.height = '';
  }

  function handleFileSelect(e) {
    setError(null);
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        setError('File exceeds 10MB limit. Choose a smaller file or compress it first.');
        continue;
      }
      if (onAttach) onAttach(sectionKey, file);
    }
    e.target.value = '';
  }

  return (
    <div style={{
      border: '1px solid ' + C.border,
      borderRadius: 8,
      background: C.bgCard,
      padding: '12px 16px',
      marginBottom: 16,
      marginTop: -4,
    }}>
      <textarea
        ref={textareaRef}
        rows={3}
        value={text}
        onChange={e => { setText(e.target.value); handleAutoGrow(); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Leave feedback for the analyst team..."
        style={{
          background: C.bgInput || C.bg,
          border: '1px solid ' + (focused ? C.accent : C.border),
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 13,
          color: C.text,
          width: '100%',
          resize: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          lineHeight: 1.5,
        }}
      />

      {allAttachments.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {allAttachments.map(att => (
            <span key={att.id} style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: C.badge,
              borderRadius: 4,
              padding: '4px 8px',
              gap: 6,
              marginRight: 6,
              marginTop: 4,
            }}>
              <span style={{ fontSize: 11, color: C.text, fontWeight: 400 }}>{att.name}</span>
              <span style={{ fontSize: 10, color: C.textMuted }}>({fmtFileSize(att.size)})</span>
              <span
                onClick={() => onRemoveAttachment && onRemoveAttachment(sectionKey, att.id)}
                style={{
                  fontSize: 14,
                  color: C.textMuted,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
                onMouseEnter={e => { e.target.style.color = C.red; }}
                onMouseLeave={e => { e.target.style.color = C.textMuted; }}
              >
                ×
              </span>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{error}</div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
      }}>
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            background: 'transparent',
            border: '1px solid ' + C.border,
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            color: C.textSecondary,
            padding: '8px 16px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Attach File
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <button
          onClick={() => onSave && onSave(sectionKey, text)}
          style={{
            background: C.accent,
            color: '#fff',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Save Comment
        </button>
      </div>
    </div>
  );
}
