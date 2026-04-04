import { useState, useCallback } from 'react';

// Hook for triggering pipeline generation via POST endpoint.
// Polling is NOT handled here — the existing usePitchDeck/useOnePager/useFullStory
// hooks already poll progress. The caller starts polling after triggerGeneration
// returns { started: true }.
// Returns { triggerGeneration, generating, generationError }.
export function useGeneratePipeline(ticker) {
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);

  const triggerGeneration = useCallback(async (stage) => {
    if (!ticker || !stage) {
      setGenerationError('Missing ticker or stage');
      return { started: false, error: true };
    }

    setGenerating(true);
    setGenerationError(null);

    try {
      const res = await fetch(
        `/api/thes1s/reports/${encodeURIComponent(ticker)}/generate/${encodeURIComponent(stage)}`,
        { method: 'POST' },
      );

      if (res.status === 202) {
        // Generation started successfully
        setGenerating(false);
        return { started: true };
      }

      if (res.status === 501) {
        // Not implemented yet — pipeline CLI not ready
        const data = await res.json().catch(() => ({}));
        setGenerationError(data.message || 'Pipeline not implemented yet');
        setGenerating(false);
        return { started: false, notImplemented: true };
      }

      // Other error responses
      const data = await res.json().catch(() => ({}));
      setGenerationError(data.error || `Generation failed: ${res.status}`);
      setGenerating(false);
      return { started: false, error: true };
    } catch (e) {
      setGenerationError('Generation request failed: ' + e.message);
      setGenerating(false);
      return { started: false, error: true };
    }
  }, [ticker]);

  return { triggerGeneration, generating, generationError };
}
