import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  fetchGuruHoldings, fetchAllGuruHoldings, findGurusOwning,
  loadCachedPortfolios, loadCachedActivities,
  fetchGuruWithChanges, fetchAllWithChanges, aggregateTopBuys, aggregateTopHoldings,
  fetchGuruHistory, buildHoldingHistory, resolveTickersForHoldings,
  fetchPortfolioValueHistory,
  GURUS,
} from '../engines/gurus';

export function useGurus() {
  const [portfolios, setPortfolios] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [error, setError] = useState(null);

  // Hydrate from cache on mount (instant, no network calls)
  useEffect(() => {
    const cachedPortfolios = loadCachedPortfolios();
    if (cachedPortfolios.length > 0) setPortfolios(cachedPortfolios);

    const cachedActivities = loadCachedActivities();
    if (cachedActivities.length > 0) setActivities(cachedActivities);
  }, []);

  // Fetch a single guru's holdings (legacy — no change detection)
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

  // Fetch a single guru with change detection (2 filings)
  const fetchOneWithChanges = useCallback(async (guru) => {
    setLoading(true);
    setError(null);
    try {
      const activity = await fetchGuruWithChanges(guru);
      if (activity) {
        // Resolve tickers
        activity.holdings = await resolveTickersForHoldings(activity.holdings);

        setActivities(prev => {
          const filtered = prev.filter(a => a.guru.cik !== guru.cik);
          return [...filtered, activity];
        });
        // Also update portfolios for Stock Lookup compat
        setPortfolios(prev => {
          const filtered = prev.filter(p => p.guru.cik !== guru.cik);
          return [...filtered, {
            guru: activity.guru, filing: activity.filing,
            holdings: activity.holdings, totalValue: activity.totalValue,
            positionCount: activity.positionCount,
          }];
        });
      }
      return activity;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all gurus with change detection
  const fetchAllChanges = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProgress({ current: 0, total: GURUS.length, name: '' });
    try {
      const results = await fetchAllWithChanges((current, total, name) => {
        setProgress({ current, total, name });
      });

      // Resolve tickers for all activities
      for (const activity of results) {
        if (activity?.holdings) {
          activity.holdings = await resolveTickersForHoldings(activity.holdings);
        }
      }

      setActivities(results);
      // Also update portfolios for Stock Lookup
      setPortfolios(results.filter(a => a?.holdings).map(a => ({
        guru: a.guru, filing: a.filing,
        holdings: a.holdings, totalValue: a.totalValue,
        positionCount: a.positionCount,
      })));
      return results;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all (legacy — no change detection)
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

  // Fetch holding history for expandable rows (on-demand)
  const fetchHistory = useCallback(async (guru, cusip) => {
    const historyData = await fetchGuruHistory(guru);
    return buildHoldingHistory(historyData.filings, cusip);
  }, []);

  // Fetch portfolio value history (for portfolio value chart)
  const fetchPortfolioHistory = useCallback(async (guru, maxQuarters = 20) => {
    return await fetchPortfolioValueHistory(guru, maxQuarters);
  }, []);

  // Derived data for Latest tab
  const latestTabData = useMemo(() => {
    if (activities.length === 0) return null;
    return {
      guruActivities: [...activities].sort((a, b) =>
        (b.reportDate || '').localeCompare(a.reportDate || '')
      ),
      topBuys: aggregateTopBuys(activities),
      topHoldings: aggregateTopHoldings(activities),
    };
  }, [activities]);

  return {
    gurus: GURUS,
    portfolios,
    activities,
    loading,
    progress,
    error,
    fetchOne,
    fetchOneWithChanges,
    fetchAll,
    fetchAllChanges,
    searchStock,
    fetchHistory,
    fetchPortfolioHistory,
    latestTabData,
  };
}
