// ─── useCompetitors Hook ───────────────────────────────────────────
// Progressive data loading for the Competitors tab.
// Phase 1: Peer discovery (Thesis taxonomy — instant in-memory)
// Phase 2: Single-year metrics (Frames API) + batch quotes (Yahoo)
// Phase 3: Multi-year scores (on-demand)

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { classifyCompany, getTierCounts } from '../engines/thesisClassification';
import { fetchPeersByTier, enrichPeersWithTickers } from '../engines/peers';
import { fetchPeerFrameData, computePeerMetrics, computePeerScores, mergeYahooData, computeCompleteness } from '../engines/peerMetrics';
import { fetchBatchQuotes } from '../engines/batchQuotes';

// The latest COMPLETE calendar year for EDGAR Frames data.
// Annual filings (10-K) are due ~60-90 days after fiscal year end.
// By April of year N, CY(N-1) is mostly complete. Before that, use CY(N-2).
function getLatestFramesYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  return month >= 3 ? year - 1 : year - 2;
}

export function useCompetitors(company) {
  const [tier, setTier] = useState(() => localStorage.getItem('sa-competitors-tier') || 'industry');
  const [peers, setPeers] = useState([]);
  const [peerMetrics, setPeerMetrics] = useState(new Map());
  const [peerScores, setPeerScores] = useState(new Map());
  const [quotes, setQuotes] = useState(new Map());
  const [loading, setLoading] = useState({ peers: false, metrics: false, scores: false });
  const [error, setError] = useState(null);
  const [scoresRequested, setScoresRequested] = useState(false);
  const [peerCompleteness, setPeerCompleteness] = useState(new Map());

  const cancelledRef = useRef(false);
  const tierRef = useRef(tier);

  // Classification from Thesis taxonomy (CIK → ticker → SIC fallback)
  const classification = company?.cik || company?.ticker || company?.sic
    ? classifyCompany(company.ticker, company.cik, company.sic, company.sicDescription)
    : null;

  // Tier counts — instant from Thesis index (no HTTP needed)
  const tierCounts = useMemo(() => getTierCounts(classification), [company?.cik]);

  // Persist tier preference
  useEffect(() => {
    localStorage.setItem('sa-competitors-tier', tier);
    tierRef.current = tier;
  }, [tier]);

  // ── Phase 1: Peer Discovery ──
  useEffect(() => {
    if (!classification) return;
    cancelledRef.current = false;
    setPeers([]);
    setPeerMetrics(new Map());
    setPeerScores(new Map());
    setQuotes(new Map());
    setError(null);
    setScoresRequested(false);
    setLoading(prev => ({ ...prev, peers: true, metrics: false, scores: false }));

    (async () => {
      try {
        const rawPeers = await fetchPeersByTier(tier, classification, company?.ticker);
        if (cancelledRef.current) return;
        const enriched = await enrichPeersWithTickers(rawPeers);
        if (cancelledRef.current) return;
        setPeers(enriched);
        setLoading(prev => ({ ...prev, peers: false }));

        // Start Phase 2 immediately
        await loadMetrics(enriched);
      } catch (err) {
        if (!cancelledRef.current) {
          setError(err.message);
          setLoading({ peers: false, metrics: false, scores: false });
        }
      }
    })();

    return () => { cancelledRef.current = true; };
  }, [company?.cik, company?.ticker, tier]);

  // ── Phase 2: Metrics (Frames + Quotes) ──
  const loadMetrics = useCallback(async (peerList) => {
    if (cancelledRef.current) return;
    setLoading(prev => ({ ...prev, metrics: true }));

    try {
      const cikSet = new Set(peerList.map(p => p.cik));
      const latestYear = getLatestFramesYear();
      // Fetch latest complete year, fall back to year before if sparse
      let frameData = await fetchPeerFrameData(cikSet, latestYear);
      if (cancelledRef.current) return;

      if (frameData.size < Math.min(5, peerList.length)) {
        const prevYear = await fetchPeerFrameData(cikSet, latestYear - 1);
        if (prevYear.size > frameData.size) frameData = prevYear;
      }
      if (cancelledRef.current) return;

      // Batch quotes for tickers that have them (limit to 200 to avoid huge requests)
      const tickers = peerList
        .filter(p => p.ticker)
        .map(p => p.ticker)
        .slice(0, 200);

      let quotesMap = new Map();
      if (tickers.length > 0) {
        quotesMap = await fetchBatchQuotes(tickers);
        if (cancelledRef.current) return;
        setQuotes(quotesMap);
      }

      // Merge Yahoo data into EDGAR gaps, then compute derived metrics
      const mergedFrameData = mergeYahooData(frameData, quotesMap, peerList);
      const metrics = computePeerMetrics(mergedFrameData);
      setPeerMetrics(metrics);
      setPeerCompleteness(computeCompleteness(mergedFrameData));
    } catch (err) {
      if (!cancelledRef.current) setError(err.message);
    } finally {
      if (!cancelledRef.current) setLoading(prev => ({ ...prev, metrics: false }));
    }
  }, []);

  // ── Phase 3: Scores (on-demand) ──
  const loadScores = useCallback(async () => {
    if (peers.length === 0 || loading.scores || peerScores.size > 0) return;
    setScoresRequested(true);
    setLoading(prev => ({ ...prev, scores: true }));

    try {
      const cikSet = new Set(peers.map(p => p.cik));
      const latestYear = getLatestFramesYear();
      const scores = await computePeerScores(cikSet, latestYear);
      if (!cancelledRef.current) setPeerScores(scores);
    } catch (err) {
      console.warn('Score computation failed:', err.message);
    } finally {
      if (!cancelledRef.current) setLoading(prev => ({ ...prev, scores: false }));
    }
  }, [peers, loading.scores, peerScores.size]);

  return {
    peers,
    peerMetrics,
    peerScores,
    peerCompleteness,
    quotes,
    tier,
    setTier,
    classification,
    tierCounts,
    loading,
    error,
    loadScores,
    scoresRequested,
  };
}
