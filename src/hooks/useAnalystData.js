// Combined hook for multi-source analyst data (Yahoo + Finviz + GuruFocus).
// Fires all 3 fetches in parallel on ticker change, derives composite analyst GR.
// Backward-compatible with existing analystData shape consumed by ValuationCalculators.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchAnalystEstimates, clearAnalystCache } from '../engines/analystEstimates';
import { fetchFinvizData, clearFinvizCache } from '../engines/finviz';
import { fetchGuruFocusData, clearGuruFocusCache } from '../engines/gurufocus';

export function useAnalystData(ticker) {
  const [yahoo, setYahoo] = useState(null);
  const [finviz, setFinviz] = useState(null);
  const [gurufocus, setGurufocus] = useState(null);
  const [loading, setLoading] = useState({ yahoo: false, finviz: false, gurufocus: false });
  const cancelRef = useRef(false);

  const doFetch = useCallback((t) => {
    if (!t) {
      setYahoo(null);
      setFinviz(null);
      setGurufocus(null);
      setLoading({ yahoo: false, finviz: false, gurufocus: false });
      return;
    }

    cancelRef.current = false;
    setLoading({ yahoo: true, finviz: true, gurufocus: true });

    // Fire all 3 in parallel — each resolves independently
    fetchAnalystEstimates(t)
      .then(result => { if (!cancelRef.current) setYahoo(result); })
      .catch(() => {})
      .finally(() => { if (!cancelRef.current) setLoading(prev => ({ ...prev, yahoo: false })); });

    fetchFinvizData(t)
      .then(result => { if (!cancelRef.current) setFinviz(result); })
      .catch(() => {})
      .finally(() => { if (!cancelRef.current) setLoading(prev => ({ ...prev, finviz: false })); });

    fetchGuruFocusData(t)
      .then(result => { if (!cancelRef.current) setGurufocus(result); })
      .catch(() => {})
      .finally(() => { if (!cancelRef.current) setLoading(prev => ({ ...prev, gurufocus: false })); });
  }, []);

  // Auto-fetch on ticker change
  useEffect(() => {
    setYahoo(null);
    setFinviz(null);
    setGurufocus(null);
    doFetch(ticker);
    return () => { cancelRef.current = true; };
  }, [ticker, doFetch]);

  // Derived: composite analyst growth rate
  // Priority: Finviz 5Y EPS growth (true long-term) > GF analyst estimate > Yahoo next FY
  const analystGR = useMemo(() => {
    if (finviz?.epsNext5Y != null) return finviz.epsNext5Y;
    if (gurufocus?.analystEstimate != null) return gurufocus.analystEstimate;
    if (yahoo?.growthRate != null) return yahoo.growthRate;
    return null;
  }, [yahoo, finviz, gurufocus]);

  // Derived: which source provided the primary GR
  const analystGRSource = useMemo(() => {
    if (finviz?.epsNext5Y != null) return 'finviz';
    if (gurufocus?.analystEstimate != null) return 'gurufocus';
    if (yahoo?.growthRate != null) return 'yahoo';
    return null;
  }, [yahoo, finviz, gurufocus]);

  // Derived: combined data object (backward-compatible with old analystData shape)
  const data = useMemo(() => {
    if (!yahoo && !finviz && !gurufocus) return null;
    return {
      // Backward compat — existing Yahoo fields
      growthRate: analystGR,
      growthRateCurrentYear: yahoo?.growthRateCurrentYear ?? null,
      growthRateNextYear: yahoo?.growthRateNextYear ?? null,
      epsEstimates: yahoo?.epsEstimates ?? null,
      revenueEstimates: yahoo?.revenueEstimates ?? null,
      priceTargets: yahoo?.priceTargets ?? null,
      recommendation: yahoo?.recommendation ?? null,
      upgrades: yahoo?.upgrades ?? null,
      numberOfAnalysts: yahoo?.numberOfAnalysts ?? null,
      // Multi-source data
      sources: { yahoo, finviz, gurufocus },
      analystGRSource,
      _fetchedAt: Math.max(
        yahoo?._fetchedAt ?? 0,
        finviz?._fetchedAt ?? 0,
        gurufocus?._fetchedAt ?? 0,
      ),
    };
  }, [yahoo, finviz, gurufocus, analystGR, analystGRSource]);

  // Any source still loading
  const anyLoading = loading.yahoo || loading.finviz || loading.gurufocus;

  // Refetch — clears all caches, re-fetches all
  const refetch = useCallback(() => {
    clearAnalystCache(ticker);
    clearFinvizCache(ticker);
    clearGuruFocusCache(ticker);
    doFetch(ticker);
  }, [ticker, doFetch]);

  return {
    data,
    loading: anyLoading,
    loadingDetail: loading,
    refetch,
    analystGR,
    analystGRSource,
  };
}
