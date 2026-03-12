// React hook for insider trading data (Form 4 filings)
// Auto-fetches last 12 months on ticker change, with option to load full history.

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchInsiderTransactions } from '../engines/insiders';

export function useInsiders(ticker) {
  const [transactions, setTransactions] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [yearsLoaded, setYearsLoaded] = useState(0);
  const cancelRef = useRef(false);

  // Phase 1: Auto-fetch last 12 months on ticker change
  useEffect(() => {
    if (!ticker) {
      setTransactions([]);
      setMonthlyData([]);
      setSummary(null);
      setHasMore(false);
      setYearsLoaded(0);
      return;
    }

    cancelRef.current = false;
    setLoading(true);
    setError(null);
    setProgress({ current: 0, total: 0 });

    fetchInsiderTransactions(ticker, {
      yearsBack: 1,
      onProgress: (current, total) => {
        if (!cancelRef.current) setProgress({ current, total });
      },
    })
      .then(result => {
        if (cancelRef.current) return;
        setTransactions(result.transactions);
        setMonthlyData(result.monthlyAggregates);
        setSummary(result.summary);
        setYearsLoaded(1);
        // Check if there are older filings available
        setHasMore(result.allForm4Filings.length > result.transactions.length);
      })
      .catch(err => {
        if (!cancelRef.current) setError(err.message);
      })
      .finally(() => {
        if (!cancelRef.current) {
          setLoading(false);
          setProgress({ current: 0, total: 0 });
        }
      });

    return () => { cancelRef.current = true; };
  }, [ticker]);

  // Phase 2: Load full history on demand
  const loadFullHistory = useCallback(async () => {
    if (!ticker || loadingMore) return;

    setLoadingMore(true);
    setError(null);
    setProgress({ current: 0, total: 0 });

    try {
      const result = await fetchInsiderTransactions(ticker, {
        yearsBack: 3,
        onProgress: (current, total) => setProgress({ current, total }),
      });
      setTransactions(result.transactions);
      setMonthlyData(result.monthlyAggregates);
      setSummary(result.summary);
      setYearsLoaded(3);
      setHasMore(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [ticker, loadingMore]);

  return {
    transactions,
    monthlyData,
    summary,
    loading,
    loadingMore,
    progress,
    error,
    hasMore,
    yearsLoaded,
    loadFullHistory,
  };
}
