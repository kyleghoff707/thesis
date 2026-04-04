// Stub hook — full implementation in Plan 24-01
// Provides safe defaults so GenerateButton renders without crashing

import { useState } from 'react';

export function useGeneratePipeline(ticker) {
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);

  async function triggerGeneration(stage) {
    setGenerating(true);
    setGenerationError(null);
    try {
      const res = await fetch(`/api/thes1s/generate/${ticker}/${stage}`, { method: 'POST' });
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Unknown error');
        setGenerationError(msg);
        setGenerating(false);
      }
      // On success, generating stays true until pipeline completes
    } catch (err) {
      setGenerationError(err.message);
      setGenerating(false);
    }
  }

  return { triggerGeneration, generating, generationError };
}
