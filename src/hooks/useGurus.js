import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  fetchGuruHoldings, fetchAllGuruHoldings, findGurusOwning,
  loadCachedPortfolios, loadCachedActivities,
  fetchGuruWithChanges, fetchAllWithChanges, aggregateTopBuys, aggregateTopHoldings,
  fetchGuruHistory, buildHoldingHistory, resolveTickersForHoldings,
  fetchPortfolioValueHistory,
  GURUS,
} from '../engines/gurus';
import { fetchNportData, loadCachedNportSummaries } from '../engines/nport';

export function useGurus() {
  const [portfolios, setPortfolios] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [error, setError] = useState(null);
  const [nportData, setNportData] = useState({});
  const [nportLoading, setNportLoading] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  // Hydrate from IndexedDB cache on mount
  useEffect(() => {
    async function hydrate() {
      const [cachedPortfolios, cachedActivities, cachedNport] = await Promise.all([
        loadCachedPortfolios(),
        loadCachedActivities(),
        loadCachedNportSummaries(GURUS),
      ]);
      if (cachedPortfolios.length > 0) setPortfolios(cachedPortfolios);
      if (cachedActivities.length > 0) {
        setActivities(cachedActivities);
        // Use the most recent activity's filing date as lastFetchedAt proxy
        const dates = cachedActivities.map(a => a.filingDate).filter(Boolean).sort();
        if (dates.length > 0) setLastFetchedAt(new Date(dates[dates.length - 1]).getTime());
      }
      if (Object.keys(cachedNport).length > 0) setNportData(cachedNport);
    }
    hydrate();
  }, []);

  // Fetch N-PORT data for all gurus that have fundCik
  const fetchNportForAll = useCallback(async () => {
    const gurusWithFund = GURUS.filter(g => g.fundCik);
    if (gurusWithFund.length === 0) return;

    setNportLoading(true);
    const results = { ...nportData };

    for (const guru of gurusWithFund) {
      try {
        const data = await fetchNportData(guru);
        if (data) results[guru.cik] = data;
      } catch (err) {
        console.warn(`N-PORT fetch failed for ${guru.name}:`, err.message);
      }
    }

    setNportData(results);
    setNportLoading(false);
    return results;
  }, [nportData]);

  // Fetch N-PORT for a single guru
  const fetchNportForOne = useCallback(async (guru) => {
    if (!guru.fundCik) return null;
    try {
      const data = await fetchNportData(guru);
      if (data) {
        setNportData(prev => ({ ...prev, [guru.cik]: data }));
      }
      return data;
    } catch (err) {
      console.warn(`N-PORT fetch failed for ${guru.name}:`, err.message);
      return null;
    }
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
      setLastFetchedAt(Date.now());
      // Fetch N-PORT data in background if available
      if (guru.fundCik) fetchNportForOne(guru);
      return activity;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchNportForOne]);

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
      setLastFetchedAt(Date.now());
      // Also update portfolios for Stock Lookup
      setPortfolios(results.filter(a => a?.holdings).map(a => ({
        guru: a.guru, filing: a.filing,
        holdings: a.holdings, totalValue: a.totalValue,
        positionCount: a.positionCount,
      })));

      // Fetch N-PORT data as a second pass (non-blocking)
      fetchNportForAll();

      return results;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [fetchNportForAll]);

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
    nportData,
    nportLoading,
    lastFetchedAt,
    fetchOne,
    fetchOneWithChanges,
    fetchAll,
    fetchAllChanges,
    fetchNportForOne,
    fetchNportForAll,
    searchStock,
    fetchHistory,
    fetchPortfolioHistory,
    latestTabData,
  };
}
