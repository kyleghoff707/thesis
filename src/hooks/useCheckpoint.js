import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { idbGet, idbSet, idbDelete } from '../engines/cacheStore';

const ATTACHMENT_STORE = 'checkpoint-attachments';
const ATTACHMENT_TTL = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years

// Hook for checkpoint comment/attachment/data-gap CRUD with dual IndexedDB + disk persistence.
// Returns { comments, dataGapResponses, attachments, loading, error,
//   saveComment, removeComment, addAttachment, removeAttachment, saveDataGapResponse, submitCheckpoint }
export function useCheckpoint(ticker, checkpointNum) {
  const [comments, setComments] = useState({});
  const [dataGapResponses, setDataGapResponses] = useState({});
  const [attachments, setAttachments] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Local IndexedDB key for in-progress edits
  const idbKey = ticker && checkpointNum != null
    ? `checkpoint:${ticker}:${checkpointNum}`
    : null;

  // Load checkpoint data on mount
  useEffect(() => {
    if (!ticker || checkpointNum == null) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Fetch server-side state and local IndexedDB state in parallel
        const [serverRes, localData] = await Promise.all([
          fetch(`/api/thes1s/reports/${encodeURIComponent(ticker)}/checkpoint/${checkpointNum}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
          idbGet(ATTACHMENT_STORE, idbKey),
        ]);
        if (cancelled) return;

        // Merge: local takes precedence for in-progress edits
        const serverComments = serverRes?.comments || {};
        const serverGaps = serverRes?.dataGapResponses || {};
        const localComments = localData?.comments || {};
        const localGaps = localData?.dataGapResponses || {};

        const merged = {
          comments: { ...serverComments, ...localComments },
          dataGapResponses: { ...serverGaps, ...localGaps },
        };

        setComments(merged.comments);
        setDataGapResponses(merged.dataGapResponses);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [ticker, checkpointNum, idbKey]);

  // Persist current state to IndexedDB (fire-and-forget)
  const persistLocal = useCallback((nextComments, nextGaps) => {
    if (!idbKey) return;
    idbSet(ATTACHMENT_STORE, idbKey, {
      comments: nextComments,
      dataGapResponses: nextGaps,
    }, ATTACHMENT_TTL);
  }, [idbKey]);

  // Save or update a comment for a section
  const saveComment = useCallback((sectionKey, text) => {
    setComments(prev => {
      const next = {
        ...prev,
        [sectionKey]: {
          ...prev[sectionKey],
          text,
          attachments: prev[sectionKey]?.attachments || [],
          createdAt: prev[sectionKey]?.createdAt || new Date().toISOString(),
        },
      };
      persistLocal(next, dataGapResponses);
      return next;
    });
  }, [persistLocal, dataGapResponses]);

  // Remove a comment for a section
  const removeComment = useCallback((sectionKey) => {
    setComments(prev => {
      const next = { ...prev };
      delete next[sectionKey];
      persistLocal(next, dataGapResponses);
      return next;
    });
  }, [persistLocal, dataGapResponses]);

  // Add a file attachment to a section comment
  const addAttachment = useCallback(async (sectionKey, file) => {
    // Validate file size: 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10MB limit');
      return null;
    }

    const id = uuidv4();
    try {
      const buffer = await file.arrayBuffer();
      // Store binary data in IndexedDB
      await idbSet(ATTACHMENT_STORE, `att:${id}`, {
        name: file.name,
        type: file.type,
        size: file.size,
        ticker,
        checkpointPhase: checkpointNum,
        sectionKey,
        buffer,
      }, ATTACHMENT_TTL);

      const ref = { id, name: file.name, type: file.type, size: file.size };

      // Update attachments map for display
      setAttachments(prev => ({ ...prev, [id]: ref }));

      // Add attachment ref to the section comment
      setComments(prev => {
        const existing = prev[sectionKey] || { text: '', attachments: [], createdAt: new Date().toISOString() };
        const next = {
          ...prev,
          [sectionKey]: {
            ...existing,
            attachments: [...(existing.attachments || []), ref],
          },
        };
        persistLocal(next, dataGapResponses);
        return next;
      });

      return id;
    } catch (e) {
      setError('Failed to store attachment: ' + e.message);
      return null;
    }
  }, [ticker, checkpointNum, persistLocal, dataGapResponses]);

  // Remove an attachment from a section comment
  const removeAttachment = useCallback(async (sectionKey, attachmentId) => {
    // Remove from IndexedDB
    await idbDelete(ATTACHMENT_STORE, `att:${attachmentId}`);

    // Remove from attachments map
    setAttachments(prev => {
      const next = { ...prev };
      delete next[attachmentId];
      return next;
    });

    // Remove ref from section comment
    setComments(prev => {
      const existing = prev[sectionKey];
      if (!existing) return prev;
      const next = {
        ...prev,
        [sectionKey]: {
          ...existing,
          attachments: (existing.attachments || []).filter(a => a.id !== attachmentId),
        },
      };
      persistLocal(next, dataGapResponses);
      return next;
    });
  }, [persistLocal, dataGapResponses]);

  // Save a data gap response
  const saveDataGapResponse = useCallback((gapId, responseType, value, attachmentRefs = []) => {
    setDataGapResponses(prev => {
      const next = {
        ...prev,
        [gapId]: {
          response: responseType,
          value,
          attachments: attachmentRefs,
        },
      };
      persistLocal(comments, next);
      return next;
    });
  }, [persistLocal, comments]);

  // Submit checkpoint feedback to server (persist to disk)
  const submitCheckpoint = useCallback(async (action) => {
    if (!ticker || checkpointNum == null) return null;

    const feedback = {
      checkpointPhase: checkpointNum,
      comments,
      dataGapResponses,
      action,
      timestamp: new Date().toISOString(),
    };

    // Collect attachment binary data for base64 encoding
    const allAttachmentRefs = [];
    for (const comment of Object.values(comments)) {
      if (comment.attachments) {
        allAttachmentRefs.push(...comment.attachments);
      }
    }

    // Read attachment buffers from IndexedDB and convert to base64
    const attachmentPayloads = [];
    for (const ref of allAttachmentRefs) {
      try {
        const stored = await idbGet(ATTACHMENT_STORE, `att:${ref.id}`);
        if (stored && stored.buffer) {
          const bytes = new Uint8Array(stored.buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          attachmentPayloads.push({
            id: ref.id,
            name: ref.name,
            base64data: btoa(binary),
          });
        }
      } catch {
        // Skip attachments that can't be read
      }
    }

    if (attachmentPayloads.length > 0) {
      feedback.attachments = attachmentPayloads;
    }

    try {
      const res = await fetch(`/api/thes1s/reports/${encodeURIComponent(ticker)}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || `Submit failed: ${res.status}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      setError('Submit failed: ' + e.message);
      return null;
    }
  }, [ticker, checkpointNum, comments, dataGapResponses]);

  return {
    comments,
    dataGapResponses,
    attachments,
    loading,
    error,
    saveComment,
    removeComment,
    addAttachment,
    removeAttachment,
    saveDataGapResponse,
    submitCheckpoint,
  };
}
