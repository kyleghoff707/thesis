import { useState, useEffect, useRef } from 'react';

// Hook for fetching One Pager report data and polling generation progress.
// Returns { report, progress, loading, error }.
// When progress.state !== 'COMPLETE', polls every 2s.
// On completion, waits 500ms then re-fetches the report.
export function useOnePager(ticker) {
  const [report, setReport] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;

    async function fetchReport() {
      try {
        const res = await fetch(`/api/thes1s/reports/${encodeURIComponent(ticker)}/one-pager`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setReport(data);
        }
      } catch (e) {
        if (!cancelled) console.warn('useOnePager: report fetch failed:', e.message);
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
        if (!cancelled) console.warn('useOnePager: progress fetch failed:', e.message);
        return null;
      }
    }

    async function pollProgress() {
      if (cancelled) return;
      const prog = await fetchProgress();
      if (cancelled) return;
      if (prog && prog.state !== 'COMPLETE') {
        pollRef.current = setTimeout(pollProgress, 2000);
      } else if (prog && prog.state === 'COMPLETE') {
        // Generation just completed — wait briefly then re-fetch the report
        pollRef.current = setTimeout(async () => {
          if (!cancelled) await fetchReport();
        }, 500);
      }
    }

    async function init() {
      setLoading(true);
      setError(null);
      try {
        // Fetch report and progress in parallel
        await Promise.all([fetchReport(), fetchProgress()]);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init().then(() => {
      // After initial fetch, start polling if generation is in progress
      if (!cancelled) {
        // Re-read progress from state won't work (closure), so check again
        fetchProgress().then(prog => {
          if (!cancelled && prog && prog.state !== 'COMPLETE') {
            pollRef.current = setTimeout(pollProgress, 2000);
          }
        });
      }
    });

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [ticker]);

  if (!ticker) return { report: null, progress: null, loading: false, error: null };

  return { report, progress, loading, error };
}
