// React hook for Yahoo Finance analyst estimates.
// Auto-fetches on ticker change, returns consensus data for FGR and context panel.

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAnalystEstimates, clearAnalystCache } from '../engines/analystEstimates';

export function useAnalystEstimates(ticker) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);

  const doFetch = useCallback((t) => {
    if (!t) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    cancelRef.current = false;
    setLoading(true);
    setError(null);

    fetchAnalystEstimates(t)
      .then(result => {
        if (cancelRef.current) return;
        setData(result);
      })
      .catch(err => {
        if (cancelRef.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelRef.current) setLoading(false);
      });
  }, []);

  // Auto-fetch on ticker change
  useEffect(() => {
    setData(null);
    doFetch(ticker);
    return () => { cancelRef.current = true; };
  }, [ticker, doFetch]);

  // Manual refetch — clears cache first
  const refetch = useCallback(() => {
    clearAnalystCache(ticker);
    doFetch(ticker);
  }, [ticker, doFetch]);

  return { data, loading, error, refetch };
}
