import { useState, useCallback, useEffect, useRef } from 'react';

const IS_DEV = import.meta.env.DEV;
const API_BASE = import.meta.env.VITE_API_URL || '';
const MAX_CONSECUTIVE_ERRORS = 20; // ~60s of offline = give up

// Hook for triggering pipeline generation.
// Dev mode: POST to Vite middleware (spawns Node.js CLI pipeline).
// Production: POST to Worker API → Durable Object runs pipeline server-side.
//   Frontend polls GET /api/pipeline/status/:runId every 3s for progress.
//   Active runId stored in sessionStorage for auto-resume on page reload.
//
// Returns { triggerGeneration, generating, generationError, result, progress }.
export function useGeneratePipeline(ticker) {
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [liveSections, setLiveSections] = useState([]);
  // v3 streaming fields — only populated when polling /api/v3/pipeline/status.
  // For v1 polling these stay at their initial values (no-op), since the v1
  // status response doesn't include these fields.
  const [liveAgents, setLiveAgents] = useState([]);
  const [livePhase, setLivePhase] = useState({ phase: null, label: null });
  const [heartbeatAt, setHeartbeatAt] = useState(null);
  const [liveTokens, setLiveTokens] = useState({ input: 0, output: 0, cached: 0 });
  const [liveCostUsd, setLiveCostUsd] = useState(0);
  const [failedSections, setFailedSections] = useState(null);
  const pollRef = useRef(null);

  // ─── Shared polling logic ────────────────────────────────

  const startPolling = useCallback((runId, resolve) => {
    let consecutiveErrors = 0;

    const poll = async () => {
      try {
        const statusRes = await fetch(`${API_BASE}/api/pipeline/status/${runId}`, {
          credentials: 'include',
        });
        if (!statusRes.ok) {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            pollRef.current = null;
            sessionStorage.removeItem(`pipeline:${ticker}`);
            setGenerationError('Lost connection to server. Pipeline may still be running. Refresh to check.');
            setGenerating(false);
            if (resolve) resolve({ started: true, completed: false, error: true });
            return;
          }
          pollRef.current = setTimeout(poll, 3000);
          return;
        }

        consecutiveErrors = 0;
        const status = await statusRes.json();
        setProgress(status);

        // v3 streaming fields — present only when polling /api/v3/pipeline/status.
        // For v1, these are all undefined → setters are skipped.
        if (status.agents !== undefined) setLiveAgents(status.agents);
        if (status.phase !== undefined) setLivePhase({ phase: status.phase, label: status.phaseLabel });
        if (status.heartbeatAt !== undefined) setHeartbeatAt(status.heartbeatAt);
        if (status.tokens !== undefined) setLiveTokens(status.tokens);
        if (status.costUsd !== undefined) setLiveCostUsd(status.costUsd);
        if (status.failedSections !== undefined) setFailedSections(status.failedSections);

        // Parse sections_json for live rendering (updates on every poll)
        if (status.sections_json) {
          try {
            const parsed = JSON.parse(status.sections_json);
            if (Array.isArray(parsed)) setLiveSections(parsed);
          } catch {}
        }

        // Terminal states: stop polling
        if (['completed', 'completed_with_errors', 'failed'].includes(status.status)) {
          pollRef.current = null;
          sessionStorage.removeItem(`pipeline:${ticker}`);

          if (status.status === 'failed') {
            setGenerationError(status.error || 'Pipeline failed');
            setGenerating(false);
            if (resolve) resolve({ started: true, completed: false, error: true });
          } else {
            let sections = [];
            try {
              sections = status.sections_json ? JSON.parse(status.sections_json) : [];
            } catch {}

            setResult({ sections, status: status.status, budget: status.budget });
            setGenerating(false);
            if (resolve) resolve({ started: true, completed: true, output: { sections } });
          }
          return;
        }

        // Schedule next poll
        pollRef.current = setTimeout(poll, 3000);
      } catch {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          pollRef.current = null;
          sessionStorage.removeItem(`pipeline:${ticker}`);
          setGenerationError('Lost connection to server. Pipeline may still be running. Refresh to check.');
          setGenerating(false);
          if (resolve) resolve({ started: true, completed: false, error: true });
          return;
        }
        pollRef.current = setTimeout(poll, 3000);
      }
    };

    pollRef.current = setTimeout(poll, 1000);
  }, [ticker]);

  // ─── Cleanup on unmount ──────────────────────────────────

  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  // ─── Auto-resume on page reload ──────────────────────────
  // Two-step recovery:
  //   1. sessionStorage key — fastest; set by triggerGeneration on start.
  //   2. Server fallback — `/api/pipeline/active/:ticker` finds a non-terminal
  //      run for this user+ticker. Handles the case where a sibling hook
  //      (e.g., Toolbox's) cleared sessionStorage before this hook mounted.

  useEffect(() => {
    if (IS_DEV || !ticker) return;

    let cancelled = false;
    (async () => {
      try {
        let activeRunId = sessionStorage.getItem(`pipeline:${ticker}`);

        if (!activeRunId) {
          // Fallback: ask the server if a run is active for this ticker.
          try {
            const activeRes = await fetch(`${API_BASE}/api/pipeline/active/${encodeURIComponent(ticker)}`, {
              credentials: 'include',
            });
            if (activeRes.ok) {
              const data = await activeRes.json();
              if (data?.active && data.runId) {
                activeRunId = data.runId;
                sessionStorage.setItem(`pipeline:${ticker}`, activeRunId);
              }
            }
          } catch {
            // Network/404 — fine, means no active run.
          }
        }

        if (!activeRunId || cancelled) return;

        const statusRes = await fetch(`${API_BASE}/api/pipeline/status/${activeRunId}`, {
          credentials: 'include',
        });
        if (!statusRes.ok || cancelled) {
          sessionStorage.removeItem(`pipeline:${ticker}`);
          return;
        }

        const status = await statusRes.json();
        if (['queued', 'assembling', 'running'].includes(status.status)) {
          // Pipeline still running — resume polling
          setGenerating(true);
          setProgress(status);
          startPolling(activeRunId);
        } else {
          // Terminal state — show result
          sessionStorage.removeItem(`pipeline:${ticker}`);
          if (status.status === 'failed') {
            setGenerationError(status.error || 'Pipeline failed');
          } else if (status.sections_json) {
            let sections = [];
            try { sections = JSON.parse(status.sections_json); } catch {}
            setResult({ sections, status: status.status, budget: status.budget });
          }
        }
      } catch {
        // Network error on mount — not critical
      }
    })();

    return () => { cancelled = true; };
  }, [ticker, startPolling]);

  // ─── Trigger generation ──────────────────────────────────

  const triggerGeneration = useCallback(async (stage, dataPacket, reportId) => {
    if (!ticker || !stage) {
      setGenerationError('Missing ticker or stage');
      return { started: false, error: true };
    }

    setGenerating(true);
    setGenerationError(null);
    setResult(null);
    setProgress(null);
    setLiveSections([]);

    // ─── Dev mode: POST to Vite middleware (CLI pipeline) ───
    if (IS_DEV) {
      try {
        const res = await fetch(
          `/api/thesis/reports/${encodeURIComponent(ticker)}/generate/${encodeURIComponent(stage)}`,
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

    const stageMap = { 'one-pager': 'onePager', 'pitch-deck': 'pitchDeck', 'full-story': 'fullStory' };
    const pipelineStage = stageMap[stage] || stage;

    try {
      const res = await fetch(`${API_BASE}/api/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticker,
          stage: pipelineStage,
          reportId,
          ...(dataPacket && { payload: dataPacket }),
        }),
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

      // Save runId for auto-resume on page reload
      sessionStorage.setItem(`pipeline:${ticker}`, runId);

      // Start polling (returns a Promise that resolves on completion)
      return new Promise((resolve) => {
        startPolling(runId, resolve);
      });

    } catch (e) {
      setGenerationError('Failed to start pipeline: ' + e.message);
      setGenerating(false);
      return { started: false, error: true };
    }
  }, [ticker, startPolling]);

  return {
    triggerGeneration,
    generating,
    generationError,
    result,
    progress,
    liveSections,        // v1 only

    // v3 additions (no-op for v1 polling)
    liveAgents,
    livePhase,
    heartbeatAt,
    liveTokens,
    liveCostUsd,
    failedSections,
  };
}
