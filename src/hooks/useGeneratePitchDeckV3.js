import { useState, useCallback } from 'react';
import { API_BASE } from '../engines/apiBase.js';

/**
 * v3 Pitch Deck dispatch hook. Calls the Worker start route, returns { runId, reportId, status }.
 * Does NOT poll status or render the report — Brainstorm 3 owns the live-running and completed-report UI.
 */
export function useGeneratePitchDeckV3() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = useCallback(async (ticker) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v3/pipeline/pitchdeck/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, error };
}
