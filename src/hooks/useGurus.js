import { useState, useCallback } from 'react';
import { fetchGuruHoldings, fetchAllGuruHoldings, findGurusOwning, GURUS } from '../engines/gurus';

export function useGurus() {
  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [error, setError] = useState(null);

  // Fetch a single guru's holdings
  const fetchOne = useCallback(async (guru) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGuruHoldings(guru);
      setPortfolios(prev => {
        const filtered = prev.filter(p => p.guru.cik !== guru.cik);
        return [...filtered, result];
      });
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all 41 guru portfolios (takes ~15-20 seconds)
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProgress({ current: 0, total: GURUS.length, name: '' });
    try {
      const results = await fetchAllGuruHoldings((current, total, name) => {
        setProgress({ current, total, name });
      });
      setPortfolios(results);
      return results;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Search loaded portfolios for a stock
  const searchStock = useCallback((query) => {
    return findGurusOwning(portfolios, query);
  }, [portfolios]);

  return {
    gurus: GURUS,
    portfolios,
    loading,
    progress,
    error,
    fetchOne,
    fetchAll,
    searchStock,
  };
}
