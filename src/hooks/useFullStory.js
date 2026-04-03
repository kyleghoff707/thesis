import { useState, useEffect, useRef } from 'react';

// Hook for fetching Full Story report data + quality scores,
// polling generation progress, and polling generation-status.json.
// Returns { report, quality, progress, generationStatus, loading, error }.
// When generation is in progress, polls every 2s.
// On completion, waits 500ms then re-fetches report + quality.
export function useFullStory(ticker) {
  const [report, setReport] = useState(null);
  const [quality, setQuality] = useState(null);
  const [progress, setProgress] = useState(null);
  const [generationStatus, setGenerationStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;

    async function fetchReport() {
      try {
        const res = await fetch(`/api/thes1s/reports/${encodeURIComponent(ticker)}/full-story`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setReport(data);
        }
      } catch (e) {
        if (!cancelled) console.warn('useFullStory: report fetch failed:', e.message);
      }
    }

    async function fetchQuality() {
      try {
        const res = await fetch(`/api/thes1s/reports/${encodeURIComponent(ticker)}/full-story-quality`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setQuality(data);
        }
        // Silently degrade if quality not found (404) — older reports may not have it
      } catch (e) {
        if (!cancelled) console.warn('useFullStory: quality fetch failed:', e.message);
      }
    }

    async function fetchProgress() {
      try {
        const res = await fetch(`/api/thes1s/reports/${encodeURIComponent(ticker)}/progress`);
        if (cancelled) return null;
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setProgress(data);
          return data;
        }
        return null;
      } catch (e) {
        if (!cancelled) console.warn('useFullStory: progress fetch failed:', e.message);
        return null;
      }
    }

    async function fetchGenerationStatus() {
      try {
        const res = await fetch(`/api/thes1s/reports/${encodeURIComponent(ticker)}/generation-status`);
        if (cancelled) return null;
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setGenerationStatus(data);
          return data;
        }
        return null;
      } catch (e) {
        if (!cancelled) console.warn('useFullStory: generation status fetch failed:', e.message);
        return null;
      }
    }

    async function pollAll() {
      if (cancelled) return;
      const [prog, genStatus] = await Promise.all([fetchProgress(), fetchGenerationStatus()]);
      if (cancelled) return;

      const progressActive = prog && prog.state !== 'COMPLETE';
      const genStatusActive = genStatus && genStatus.state !== 'COMPLETE';

      if (progressActive || genStatusActive) {
        pollRef.current = setTimeout(pollAll, 2000);
      } else if ((prog && prog.state === 'COMPLETE') || (genStatus && genStatus.state === 'COMPLETE')) {
        // Generation just completed — wait briefly then re-fetch report + quality
        pollRef.current = setTimeout(async () => {
          if (!cancelled) {
            await Promise.all([fetchReport(), fetchQuality()]);
          }
        }, 500);
      }
    }

    // FIX vs usePitchDeck: Capture init results to avoid double-fetch.
    // usePitchDeck calls fetchProgress + fetchGenerationStatus inside init(),
    // then re-fetches them in init().then() to decide whether to poll.
    // Instead, capture the Promise.all results and use them directly.
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const [, , prog, genStatus] = await Promise.all([
          fetchReport(),
          fetchQuality(),
          fetchProgress(),
          fetchGenerationStatus(),
        ]);
        // Use captured results to decide whether to start polling
        // (no second fetch needed)
        if (!cancelled) {
          const progressActive = prog && prog.state !== 'COMPLETE';
          const genStatusActive = genStatus && genStatus.state !== 'COMPLETE';
          if (progressActive || genStatusActive) {
            pollRef.current = setTimeout(pollAll, 2000);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [ticker]);

  if (!ticker) return { report: null, quality: null, progress: null, generationStatus: null, loading: false, error: null };

  return { report, quality, progress, generationStatus, loading, error };
}
