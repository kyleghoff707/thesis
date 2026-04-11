import { useState, useCallback, useEffect, useRef } from 'react';

const IS_DEV = import.meta.env.DEV;
const API_BASE = import.meta.env.VITE_API_URL || '';

// Hook for triggering pipeline generation.
// Dev mode: POST to Vite middleware (spawns Node.js CLI pipeline).
// Production: POST to Worker API → Durable Object runs pipeline server-side.
//   Frontend polls GET /api/pipeline/status/:runId every 3s for progress.
//
// Returns { triggerGeneration, generating, generationError, result, progress }.
export function useGeneratePipeline(ticker) {
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const pollRef = useRef(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const triggerGeneration = useCallback(async (stage, dataPacket, reportId) => {
    if (!ticker || !stage) {
      setGenerationError('Missing ticker or stage');
      return { started: false, error: true };
    }

    setGenerating(true);
    setGenerationError(null);
    setResult(null);
    setProgress(null);

    // ─── Dev mode: POST to Vite middleware (CLI pipeline) ───
    if (IS_DEV) {
      try {
        const res = await fetch(
          `/api/thes1s/reports/${encodeURIComponent(ticker)}/generate/${encodeURIComponent(stage)}`,
          { method: 'POST' },
        );

        if (res.status === 202) {
          setGenerating(false);
          return { started: true };
        }

        if (res.status === 501) {
          const data = await res.json().catch(() => ({}));
          setGenerationError(data.message || 'Pipeline not implemented yet');
          setGenerating(false);
          return { started: false, notImplemented: true };
        }

        const data = await res.json().catch(() => ({}));
        setGenerationError(data.error || `Generation failed: ${res.status}`);
        setGenerating(false);
        return { started: false, error: true };
      } catch (e) {
        setGenerationError('Generation request failed: ' + e.message);
        setGenerating(false);
        return { started: false, error: true };
      }
    }

    // ─── Production: POST to Worker → poll for progress ───

    // Map URL stage names to pipeline stage names
    const stageMap = { 'one-pager': 'onePager', 'pitch-deck': 'pitchDeck', 'full-story': 'fullStory' };
    const pipelineStage = stageMap[stage] || stage;

    try {
      // Start pipeline on server
      const res = await fetch(`${API_BASE}/api/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ticker, stage: pipelineStage, reportId }),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        setGenerationError(`Pipeline already running for ${data.activeRun?.ticker || ticker}`);
        setGenerating(false);
        return { started: false, error: true };
      }

      if (res.status === 402) {
        setGenerationError('Billing not active. Set up payment method first.');
        setGenerating(false);
        return { started: false, error: true };
      }

      if (res.status === 429) {
        setGenerationError('Monthly spending limit reached.');
        setGenerating(false);
        return { started: false, error: true };
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGenerationError(data.error || `Failed to start pipeline: ${res.status}`);
        setGenerating(false);
        return { started: false, error: true };
      }

      const { runId } = await res.json();

      // Poll for progress every 3 seconds
      return new Promise((resolve) => {
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 20; // ~60s of offline = give up

        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/api/pipeline/status/${runId}`, {
              credentials: 'include',
            });
            if (!statusRes.ok) {
              consecutiveErrors++;
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                clearInterval(pollRef.current);
                pollRef.current = null;
                setGenerationError('Lost connection to server. Pipeline may still be running. Refresh to check.');
                setGenerating(false);
                resolve({ started: true, completed: false, error: true });
              }
              return;
            }

            consecutiveErrors = 0; // Reset on success
            const status = await statusRes.json();
            setProgress(status);

            // Terminal states: stop polling
            if (['completed', 'completed_with_errors', 'failed'].includes(status.status)) {
              clearInterval(pollRef.current);
              pollRef.current = null;

              if (status.status === 'failed') {
                setGenerationError(status.error || 'Pipeline failed');
                setGenerating(false);
                resolve({ started: true, completed: false, error: true });
              } else {
                // Parse sections from the pipeline run
                let sections = [];
                try {
                  sections = status.sections_json ? JSON.parse(status.sections_json) : [];
                } catch {}

                setResult({ sections, status: status.status, budget: status.budget });
                setGenerating(false);
                resolve({ started: true, completed: true, output: { sections } });
              }
            }
          } catch {
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setGenerationError('Lost connection to server. Pipeline may still be running. Refresh to check.');
              setGenerating(false);
              resolve({ started: true, completed: false, error: true });
            }
          }
        }, 3000);
      });

    } catch (e) {
      setGenerationError('Failed to start pipeline: ' + e.message);
      setGenerating(false);
      return { started: false, error: true };
    }
  }, [ticker]);

  return { triggerGeneration, generating, generationError, result, progress };
}
