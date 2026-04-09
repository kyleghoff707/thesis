import { useState, useCallback, useEffect } from 'react';

const IS_DEV = import.meta.env.DEV;

// Hook for triggering pipeline generation.
// Dev mode: POST to Vite middleware (spawns Node.js CLI pipeline).
// Production: runs pipeline engines directly in the browser.
//
// Returns { triggerGeneration, generating, generationError, result }.
// - result is null until generation completes (production path only).
// - In dev mode, result stays null (callers poll via usePitchDeck/useOnePager/useFullStory).
export function useGeneratePipeline(ticker) {
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);
  const [result, setResult] = useState(null);

  // Warn before tab close during generation
  useEffect(() => {
    if (!generating) return;
    const handler = (e) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [generating]);

  const triggerGeneration = useCallback(async (stage, dataPacket) => {
    if (!ticker || !stage) {
      setGenerationError('Missing ticker or stage');
      return { started: false, error: true };
    }

    setGenerating(true);
    setGenerationError(null);
    setResult(null);

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

    // ─── Production: run pipeline engines directly in browser ───
    try {
      // Map URL stage names to pipeline stage names
      const stageMap = { 'one-pager': 'onePager', 'pitch-deck': 'pitchDeck', 'full-story': 'fullStory' };
      const pipelineStage = stageMap[stage] || stage;

      let output;

      if (pipelineStage === 'onePager') {
        // Dynamic import to code-split the pipeline engines
        const { generateOnePager } = await import('../engines/onePagerGenerator.js');
        const genResult = await generateOnePager(dataPacket);
        if (genResult.error) throw new Error(genResult.error);
        output = genResult;
      } else {
        const { runPipeline } = await import('../engines/pipelineManager.js');
        const genResult = await runPipeline(pipelineStage, dataPacket);
        if (genResult.errors?.length > 0) {
          console.warn('Pipeline completed with errors:', genResult.errors);
        }
        output = genResult;
      }

      setResult(output);
      setGenerating(false);
      return { started: true, completed: true, output };
    } catch (e) {
      setGenerationError('Pipeline generation failed: ' + e.message);
      setGenerating(false);
      return { started: false, error: true };
    }
  }, [ticker]);

  return { triggerGeneration, generating, generationError, result };
}
