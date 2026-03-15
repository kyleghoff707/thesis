import { useState, useEffect, useMemo, useCallback } from 'react';
import { C } from '../theme';
import { usePrices } from '../hooks/usePrices';
import { useAnalystData } from '../hooks/useAnalystData';
import { computeMOS, computePBT, computeTenCap, computeEquityBond, computePretaxEquityBond, computeBondComparison, fcfPerShare as computeFcfPerShare, yearsToPayback, suggestFuturePE, estimateMaintenanceCapEx } from '../engines/valuation';
import { computeFCFRatio } from '../engines/returnMetrics';
import { buildGrowthAnalysisSeries, compute3YearSmoothedRates, computeWeightedAvgGrowthRate } from '../engines/growthRates';
import ValuationCalculators from './ValuationCalculators';
import ValuationInputs from './ValuationInputs';
import GrowthRateAnalysis from './GrowthRateAnalysis';
import HistoricalBuyPrices from './HistoricalBuyPrices';

const VALUATION_STORAGE_PREFIX = 'sa-valuation:';

function saveValuationToStorage(ticker, state) {
  if (!ticker) return;
  const data = {
    ...state,
    excludedYears: Array.from(state.excludedYears || []),
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(VALUATION_STORAGE_PREFIX + ticker, JSON.stringify(data));
}

function loadValuationFromStorage(ticker) {
  if (!ticker) return null;
  try {
    const raw = localStorage.getItem(VALUATION_STORAGE_PREFIX + ticker);
    if (!raw) return null;
    const data = JSON.parse(raw);
    data.excludedYears = new Set(data.excludedYears || []);
    return data;
  } catch { return null; }
}

const SUB_TABS = [
  { key: 'growthRates', label: 'Growth Rate Analysis' },
  { key: 'inputs', label: 'Valuation Inputs' },
  { key: 'calculators', label: 'Valuation Calculators' },
  { key: 'priceVsValue', label: 'Price vs Value' },
];

// Month abbreviation → 0-indexed month number
const MONTH_MAP = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

// Shared helper: get fiscal year date range for a given year
function getFYDateRange(year, fiscalMonths) {
  const fyEndMonthAbbr = fiscalMonths?.[year];
  const fyEndMonth = fyEndMonthAbbr ? MONTH_MAP[fyEndMonthAbbr] : 11;
  const endDate = `${year}-${String(fyEndMonth + 1).padStart(2, '0')}-31`;
  const startMonth = (fyEndMonth + 1) % 12;
  const startYear = year - 1;
  const startDate = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-01`;
  return { startDate, endDate };
}

// Compute per-year High PE from prices + EPS
function computeHistoricalHighPE(edgarStatements, prices) {
  if (!edgarStatements || !prices || prices.length === 0) return {};
  const { years, income, fiscalMonths } = edgarStatements;
  const result = {};

  for (const year of years) {
    if (year === 'TTM') continue;
    const eps = income[year]?.diluted_earnings_per_share;
    if (!eps || eps <= 0) continue;

    const { startDate, endDate } = getFYDateRange(year, fiscalMonths);
    const fyPrices = prices.filter(p => p.date >= startDate && p.date <= endDate);
    if (fyPrices.length === 0) continue;

    const highPrice = Math.max(...fyPrices.map(p => p.high ?? p.adjustedClose ?? p.close));
    result[year] = Math.round((highPrice / eps) * 100) / 100;
  }
  return result;
}

// Compute per-year Average PE from prices + EPS
// Uses mean daily closing price / EPS — much more conservative than high PE
function computeHistoricalAvgPE(edgarStatements, prices) {
  if (!edgarStatements || !prices || prices.length === 0) return {};
  const { years, income, fiscalMonths } = edgarStatements;
  const result = {};

  for (const year of years) {
    if (year === 'TTM') continue;
    const eps = income[year]?.diluted_earnings_per_share;
    if (!eps || eps <= 0) continue;

    const { startDate, endDate } = getFYDateRange(year, fiscalMonths);
    const fyPrices = prices.filter(p => p.date >= startDate && p.date <= endDate);
    if (fyPrices.length === 0) continue;

    const avgPrice = fyPrices.reduce((sum, p) => sum + (p.adjustedClose ?? p.close), 0) / fyPrices.length;
    result[year] = Math.round((avgPrice / eps) * 100) / 100;
  }
  return result;
}

export default function Valuation({ edgarStatements, ticker, latest, settings, returns }) {
  const [subTab, setSubTab] = useState('growthRates');

  // Fetch full price history for historical PE
  const { prices: allPrices } = usePrices(ticker, 'max');

  // Fetch analyst consensus estimates from Yahoo Finance + Finviz + GuruFocus
  const { data: analystData, loading: analystLoading, refetch: refetchAnalyst, analystGR: computedAnalystGR, analystGRSource } = useAnalystData(ticker);

  // ─── Valuation state ─────────────────────────────────────

  // TTM or fallback to latest annual year
  const ttm = edgarStatements?.ttm;
  const latestYear = edgarStatements?.years?.[0];
  const ttmIncome = ttm?.income || (latestYear ? edgarStatements.income[latestYear] : {});
  const ttmCashFlow = ttm?.cashFlow || (latestYear ? edgarStatements.cashFlow[latestYear] : {});
  const ttmBalance = ttm?.balance || (latestYear ? edgarStatements.balance[latestYear] : {});
  const hasTTM = !!ttm;

  const defaultEPS = ttmIncome?.diluted_earnings_per_share ?? null;

  const [epsTTM, setEpsTTM] = useState(null);
  const [fgrSource, setFgrSource] = useState('analyst');
  const [analystGR, setAnalystGR] = useState('');
  const [customGR, setCustomGR] = useState('');
  const [maintenancePct, setMaintenancePct] = useState(0.70);
  const [futurePEOverride, setFuturePEOverride] = useState(null);
  const [mosDiscount, setMosDiscount] = useState(0.50);
  const [marr, setMarr] = useState(0.15);
  const [pbtYears, setPbtYears] = useState(8);
  const [fcfRatioOverride, setFcfRatioOverride] = useState(null);
  const [excludedYears, setExcludedYears] = useState(new Set());
  const [excludedYears10Cap, setExcludedYears10Cap] = useState(new Set());
  const [excludedYearsMOS, setExcludedYearsMOS] = useState(new Set());
  const [excludedYearsEB, setExcludedYearsEB] = useState(new Set());
  // Per-cell exclusion for Growth Rate Analysis (Set of "metricKey:year" strings)
  const [excludedGrowthPoints, setExcludedGrowthPoints] = useState(new Set());

  // 10 Cap field overrides (auto-fill from EDGAR, user can edit)
  const [tenCapCFOOverride, setTenCapCFOOverride] = useState(null);
  const [tenCapCapExOverride, setTenCapCapExOverride] = useState(null);
  const [tenCapTaxOverride, setTenCapTaxOverride] = useState(null);
  const [tenCapSharesOverride, setTenCapSharesOverride] = useState(null);
  const [tenCapMaintCapExOverride, setTenCapMaintCapExOverride] = useState(null);

  // PBT FCF Per Share override
  const [pbtFCFPerShareOverride, setPbtFCFPerShareOverride] = useState(null);

  // Equity Bond — Method A (Pretax) overrides
  const [ptebPretaxEPSOverride, setPtebPretaxEPSOverride] = useState(null);
  const [ptebGrowthRateOverride, setPtebGrowthRateOverride] = useState(null);
  const [ptebPEOverride, setPtebPEOverride] = useState(null);
  const [ptebCorpBondYield, setPtebCorpBondYield] = useState(null);

  // Equity Bond — Method B (BVPS Growth) overrides
  const [ebBvpsOverride, setEbBvpsOverride] = useState(null);
  const [ebRoeOverride, setEbRoeOverride] = useState(null);
  const [ebRetainedRatioOverride, setEbRetainedRatioOverride] = useState(null);
  const [ebAvgPEOverride, setEbAvgPEOverride] = useState(null);

  // Bond Comparison fields (manual entry)
  const [ebTBillYield, setEbTBillYield] = useState(null);
  const [ebCorpBondYield, setEbCorpBondYield] = useState(null);

  // Hero box method selection (which methods contribute to hero buy price)
  const ALL_HERO_KEYS = ['10 Cap', 'MOS', 'PBT', 'Equity Bond'];
  const [heroEnabled, setHeroEnabled] = useState(() => new Set(ALL_HERO_KEYS));

  // All growth-type metrics eligible for composite GR (excludes return metrics).
  // Market Cap excluded — requires price data not available in this context.
  const ALL_GROWTH_KEYS = ['bookValue', 'bvPlusDiv', 'earnings', 'pretaxEarnings', 'operatingCash', 'revenue', 'fcf', 'retainedEarnings'];
  const DEFAULT_COMPOSITE_KEYS = ['bvPlusDiv', 'earnings', 'operatingCash', 'revenue'];
  const [compositeMetrics, setCompositeMetrics] = useState(() => new Set(DEFAULT_COMPOSITE_KEYS));

  // Save indicator
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saved' | 'loaded'

  // Load saved valuation when ticker changes, or reset to defaults
  useEffect(() => {
    const saved = loadValuationFromStorage(ticker);
    if (saved) {
      setEpsTTM(saved.epsTTM ?? (defaultEPS != null ? Math.round(defaultEPS * 100) / 100 : null));
      setFgrSource(saved.fgrSource ?? 'analyst');
      setAnalystGR(saved.analystGR ?? '');
      setCustomGR(saved.customGR ?? '');
      setMaintenancePct(saved.maintenancePct ?? 0.70);
      setFuturePEOverride(saved.futurePEOverride ?? null);
      setMosDiscount(saved.mosDiscount ?? 0.50);
      setMarr(saved.marr ?? 0.15);
      setPbtYears(saved.pbtYears ?? 8);
      setFcfRatioOverride(saved.fcfRatioOverride ?? null);
      setExcludedYears(saved.excludedYears instanceof Set ? saved.excludedYears : new Set());
      setExcludedYears10Cap(saved.excludedYears10Cap ? new Set(saved.excludedYears10Cap) : new Set());
      setExcludedYearsMOS(saved.excludedYearsMOS ? new Set(saved.excludedYearsMOS) : new Set());
      setExcludedYearsEB(saved.excludedYearsEB ? new Set(saved.excludedYearsEB) : new Set());
      setExcludedGrowthPoints(saved.excludedGrowthPoints ? new Set(saved.excludedGrowthPoints) : new Set());
      setTenCapCFOOverride(saved.tenCapCFOOverride ?? null);
      setTenCapCapExOverride(saved.tenCapCapExOverride ?? null);
      setTenCapTaxOverride(saved.tenCapTaxOverride ?? null);
      setTenCapSharesOverride(saved.tenCapSharesOverride ?? null);
      setTenCapMaintCapExOverride(saved.tenCapMaintCapExOverride ?? null);
      setPbtFCFPerShareOverride(saved.pbtFCFPerShareOverride ?? null);
      // Equity Bond — Method A (Pretax)
      setPtebPretaxEPSOverride(saved.ptebPretaxEPSOverride ?? null);
      setPtebGrowthRateOverride(saved.ptebGrowthRateOverride ?? null);
      setPtebPEOverride(saved.ptebPEOverride ?? null);
      const savedCorpYield = saved.ptebCorpBondYield ?? saved.ebCorpBondYield ?? null;
      setPtebCorpBondYield(savedCorpYield);
      // Equity Bond — Method B (BVPS Growth)
      setEbBvpsOverride(saved.ebBvpsOverride ?? null);
      setEbRoeOverride(saved.ebRoeOverride ?? null);
      setEbRetainedRatioOverride(saved.ebRetainedRatioOverride ?? null);
      setEbAvgPEOverride(saved.ebAvgPEOverride ?? null);
      // Bond Comparison
      setEbTBillYield(saved.ebTBillYield ?? null);
      setEbCorpBondYield(savedCorpYield);
      setHeroEnabled(saved.heroEnabled ? new Set(saved.heroEnabled) : new Set(ALL_HERO_KEYS));
      setSaveStatus('loaded');
      setTimeout(() => setSaveStatus(null), 2000);
    } else {
      if (defaultEPS != null) setEpsTTM(Math.round(defaultEPS * 100) / 100);
      setFgrSource('analyst');
      setAnalystGR('');
      setCustomGR('');
      setMaintenancePct(0.70);
      setFuturePEOverride(null);
      setMosDiscount(0.50);
      setMarr(0.15);
      setPbtYears(8);
      setFcfRatioOverride(null);
      setExcludedYears(new Set());
      setExcludedYears10Cap(new Set());
      setExcludedYearsMOS(new Set());
      setExcludedYearsEB(new Set());
      setExcludedGrowthPoints(new Set());
      setTenCapCFOOverride(null);
      setTenCapCapExOverride(null);
      setTenCapTaxOverride(null);
      setTenCapSharesOverride(null);
      setTenCapMaintCapExOverride(null);
      setPbtFCFPerShareOverride(null);
      setPtebPretaxEPSOverride(null);
      setPtebGrowthRateOverride(null);
      setPtebPEOverride(null);
      setPtebCorpBondYield(null);
      setEbBvpsOverride(null);
      setEbRoeOverride(null);
      setEbRetainedRatioOverride(null);
      setEbAvgPEOverride(null);
      setEbTBillYield(null);
      setEbCorpBondYield(null);
      setHeroEnabled(new Set(ALL_HERO_KEYS));
      setSaveStatus(null);
    }
  }, [ticker, defaultEPS]);

  // Auto-populate analyst GR from fresh data — always use latest from Finviz/GF/Yahoo
  useEffect(() => {
    if (computedAnalystGR != null) {
      setAnalystGR(String(Math.round(computedAnalystGR * 100) / 100));
    }
  }, [computedAnalystGR]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save handler
  const handleSave = useCallback(() => {
    saveValuationToStorage(ticker, {
      epsTTM, fgrSource, analystGR, customGR, maintenancePct,
      futurePEOverride, mosDiscount, marr, pbtYears, fcfRatioOverride,
      excludedYears,
      excludedYears10Cap: [...excludedYears10Cap],
      excludedYearsMOS: [...excludedYearsMOS],
      excludedYearsEB: [...excludedYearsEB],
      excludedGrowthPoints: [...excludedGrowthPoints],
      tenCapCFOOverride, tenCapCapExOverride, tenCapTaxOverride,
      tenCapSharesOverride, tenCapMaintCapExOverride,
      pbtFCFPerShareOverride,
      ptebPretaxEPSOverride, ptebGrowthRateOverride, ptebPEOverride, ptebCorpBondYield,
      ebBvpsOverride, ebRoeOverride, ebRetainedRatioOverride, ebAvgPEOverride,
      ebTBillYield, ebCorpBondYield,
      heroEnabled: [...heroEnabled],
    });
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(null), 2000);
  }, [ticker, epsTTM, fgrSource, analystGR, customGR, maintenancePct,
    futurePEOverride, mosDiscount, marr, pbtYears, fcfRatioOverride,
    excludedYears, excludedYears10Cap, excludedYearsMOS, excludedYearsEB, excludedGrowthPoints,
    tenCapCFOOverride, tenCapCapExOverride, tenCapTaxOverride,
    tenCapSharesOverride, tenCapMaintCapExOverride, pbtFCFPerShareOverride,
    ptebPretaxEPSOverride, ptebGrowthRateOverride, ptebPEOverride, ptebCorpBondYield,
    ebBvpsOverride, ebRoeOverride, ebRetainedRatioOverride, ebAvgPEOverride,
    ebTBillYield, ebCorpBondYield, heroEnabled]);

  // ─── Computed values ──────────────────────────────────────

  // Build total-dollar series and compute weighted average growth rates
  // Uses the same formulas as the Growth Rate Analysis tab (verified against Toolbox)
  const analysisSeries = useMemo(() => {
    if (!edgarStatements) return null;
    return buildGrowthAnalysisSeries(edgarStatements);
  }, [edgarStatements]);

  const weightedAvgs = useMemo(() => {
    if (!analysisSeries) return {};
    const result = {};
    // Compute weighted averages for ALL growth-type metrics so any can be toggled into composite
    for (const key of ALL_GROWTH_KEYS) {
      let series = analysisSeries[key];
      if (series && series.length > 0) {
        // Filter out individually excluded data points
        if (excludedGrowthPoints.size > 0) {
          series = series.filter(d => !excludedGrowthPoints.has(`${key}:${d.year}`));
        }
        const smoothed = compute3YearSmoothedRates(series);
        result[key] = computeWeightedAvgGrowthRate(smoothed);
      }
    }
    return result;
  }, [analysisSeries, excludedGrowthPoints]);

  // Composite GR = simple average of selected metric weighted averages
  const compositeGR = useMemo(() => {
    const vals = [...compositeMetrics]
      .map(k => weightedAvgs[k])
      .filter(v => v != null);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [weightedAvgs, compositeMetrics]);

  // Active FGR based on radio selection
  const activeFGR = useMemo(() => {
    if (fgrSource === 'analyst') {
      const v = parseFloat(analystGR);
      return isNaN(v) ? null : v / 100;
    }
    if (fgrSource === 'composite') return compositeGR;
    if (fgrSource === 'custom') {
      const v = parseFloat(customGR);
      return isNaN(v) ? null : v / 100;
    }
    return null;
  }, [fgrSource, analystGR, compositeGR, customGR]);

  // Historical High PE per year (used for MOS future PE cap)
  const historicalPE = useMemo(() => {
    return computeHistoricalHighPE(edgarStatements, allPrices);
  }, [edgarStatements, allPrices]);

  const historicalHighPE = useMemo(() => {
    const vals = Object.values(historicalPE);
    return vals.length > 0 ? Math.max(...vals) : null;
  }, [historicalPE]);

  // Historical Average PE per year (mean daily close / EPS — more conservative)
  const historicalAvgPEPerYear = useMemo(() => {
    return computeHistoricalAvgPE(edgarStatements, allPrices);
  }, [edgarStatements, allPrices]);

  // Default Future PE = 2×FGR capped at historical high
  const defaultFuturePE = useMemo(() => {
    if (activeFGR == null) return null;
    return suggestFuturePE(activeFGR, historicalHighPE);
  }, [activeFGR, historicalHighPE]);

  const effectiveFuturePE = futurePEOverride ?? defaultFuturePE;

  // Update futurePE default when FGR changes (reset override)
  useEffect(() => {
    setFuturePEOverride(null);
  }, [activeFGR]);

  // FCF Ratio (computed from historical data, excludable years)
  const fcfRatioData = useMemo(() => {
    if (!edgarStatements) return { yearly: [], average: null };
    return computeFCFRatio(edgarStatements, excludedYears);
  }, [edgarStatements, excludedYears]);

  const effectiveFCFRatio = fcfRatioOverride ?? fcfRatioData.average;

  // ─── Calculator results ───────────────────────────────────

  // 10 Cap — default values from EDGAR (used for auto-fill)
  const tenCapDefaults = useMemo(() => {
    const opCF = ttmCashFlow?.net_cash_flow_from_operating_activities ?? null;
    const capEx = ttmCashFlow?.capital_expenditures ?? null;
    const tax = ttmIncome?.income_tax ?? null;
    const shares = ttmBalance?.shares_outstanding ?? (latestYear ? edgarStatements?.balance[latestYear]?.shares_outstanding : null);
    return { opCF, capEx, tax, shares };
  }, [ttmCashFlow, ttmIncome, ttmBalance, latestYear, edgarStatements]);

  // 10 Cap — effective values (override ?? default)
  const tenCapData = useMemo(() => {
    const opCF = tenCapCFOOverride ?? tenCapDefaults.opCF;
    const capEx = tenCapCapExOverride ?? tenCapDefaults.capEx;
    const tax = tenCapTaxOverride ?? tenCapDefaults.tax;
    const shares = tenCapSharesOverride ?? tenCapDefaults.shares;
    if (opCF == null || shares == null) return null;

    const autoMaintCapEx = estimateMaintenanceCapEx(capEx, maintenancePct);
    const maintCapEx = tenCapMaintCapExOverride ?? autoMaintCapEx;
    const result = computeTenCap({
      operatingCashFlow: opCF,
      maintenanceCapEx: maintCapEx,
      taxProvision: tax,
      sharesOutstanding: shares,
    });

    return {
      ...result,
      operatingCashFlow: opCF,
      capitalExpenditures: capEx,
      maintenancePct,
      maintenanceCapEx: maintCapEx,
      autoMaintenanceCapEx: autoMaintCapEx,
      taxProvision: tax,
      sharesOutstanding: shares,
    };
  }, [tenCapDefaults, tenCapCFOOverride, tenCapCapExOverride, tenCapTaxOverride, tenCapSharesOverride, tenCapMaintCapExOverride, maintenancePct]);

  // Current price (needed by Equity Bond + PBT at current price)
  const currentPrice = latest?.price ?? latest?.close ?? null;

  // ─── Equity Bond defaults & results ──────────────────────

  // "Historically reasonable" PE — mean of per-year AVERAGE P/Es (avg daily close / EPS).
  // Much more conservative than the old approach (mean of HIGH P/Es), which consistently
  // overshoots because it averages peak valuations from each year.
  const historicalAvgPE = useMemo(() => {
    const vals = Object.values(historicalAvgPEPerYear).filter(v => v != null && v > 0 && isFinite(v));
    return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  }, [historicalAvgPEPerYear]);

  // Method A (Pretax) defaults
  const ptebDefaults = useMemo(() => {
    if (!edgarStatements) return { pretaxEPS: null, pretaxGrowthRate: null, avgPE: null };

    const { years, income, balance } = edgarStatements;
    const sortedYears = years.filter(y => y !== 'TTM').sort((a, b) => a - b);

    // Pretax EPS from latest annual year (not TTM — pretax method uses prior year)
    const latBal = latestYear ? balance[latestYear] : {};
    const latInc = latestYear ? income[latestYear] : {};
    const pretaxInc = latInc?.income_before_tax;
    const shares = latBal?.shares_outstanding;
    const pretaxEPS = (pretaxInc && shares && shares > 0) ? Math.round((pretaxInc / shares) * 100) / 100 : null;

    // Pretax EPS CAGR from historical series
    let pretaxGrowthRate = null;
    const pretaxSeries = [];
    for (const year of sortedYears) {
      const inc = income[year]?.income_before_tax;
      const sh = balance[year]?.shares_outstanding;
      if (inc && inc > 0 && sh && sh > 0) {
        pretaxSeries.push({ year, value: inc / sh });
      }
    }
    if (pretaxSeries.length >= 2) {
      const first = pretaxSeries[0];
      const last = pretaxSeries[pretaxSeries.length - 1];
      const n = last.year - first.year;
      if (n > 0 && first.value > 0) {
        pretaxGrowthRate = Math.round((Math.pow(last.value / first.value, 1 / n) - 1) * 10000) / 10000;
      }
    }

    return { pretaxEPS, pretaxGrowthRate, avgPE: historicalAvgPE };
  }, [edgarStatements, ttmIncome, ttmBalance, latestYear, historicalAvgPE]);

  // Equity Bond 3yr averages (most recent 3 non-excluded years)
  const eb3yrAvg = useMemo(() => {
    if (!edgarStatements) return { bvps: null, roe: null, dps: null, retainedRatio: null, avgPE: null };

    const { years, income, balance } = edgarStatements;
    const activeYears = years.filter(y => y !== 'TTM' && !excludedYearsEB.has(y));
    const recent3 = activeYears.slice(0, 3);
    if (recent3.length === 0) return { bvps: null, roe: null, dps: null, retainedRatio: null, avgPE: null };

    // BVPS
    const bvpsVals = recent3.map(y => {
      const eq = balance[y]?.equity_attributable_to_parent ?? balance[y]?.equity;
      const sh = balance[y]?.shares_outstanding;
      return (eq != null && sh && sh > 0) ? eq / sh : null;
    }).filter(v => v != null);
    const bvps = bvpsVals.length > 0 ? Math.round((bvpsVals.reduce((a, b) => a + b, 0) / bvpsVals.length) * 100) / 100 : null;

    // ROE
    const roeMap = {};
    for (const entry of (returns?.yearly || [])) roeMap[entry.year] = entry.roe;
    const roeVals = recent3.map(y => roeMap[y]).filter(v => v != null && isFinite(v));
    const roe = roeVals.length > 0 ? Math.round((roeVals.reduce((a, b) => a + b, 0) / roeVals.length) * 10000) / 10000 : null;

    // DPS
    const dpsVals = recent3.map(y => income[y]?.dividends_per_share ?? 0);
    const dps = dpsVals.length > 0 ? Math.round((dpsVals.reduce((a, b) => a + b, 0) / dpsVals.length) * 100) / 100 : null;

    // Retained Ratio
    const rrVals = recent3.map(y => {
      const eps = income[y]?.diluted_earnings_per_share;
      const d = income[y]?.dividends_per_share;
      if (eps && eps > 0) {
        const payout = d ? Math.abs(d) / eps : 0;
        return Math.max(0, Math.min(1, 1 - payout));
      }
      return null;
    }).filter(v => v != null);
    const retainedRatio = rrVals.length > 0 ? Math.round((rrVals.reduce((a, b) => a + b, 0) / rrVals.length) * 10000) / 10000 : null;

    // Avg PE
    const peVals = recent3.map(y => historicalAvgPEPerYear?.[y]).filter(v => v != null && v > 0 && isFinite(v));
    const avgPE = peVals.length > 0 ? Math.round((peVals.reduce((a, b) => a + b, 0) / peVals.length) * 100) / 100 : null;

    return { bvps, roe, dps, retainedRatio, avgPE };
  }, [edgarStatements, excludedYearsEB, returns, historicalAvgPEPerYear]);

  // Method B (BVPS Growth) defaults — uses 3yr avg from Equity Bond Inputs
  const ebDefaults = useMemo(() => ({
    bvps: eb3yrAvg.bvps,
    avgROE: eb3yrAvg.roe,
    retainedRatio: eb3yrAvg.retainedRatio,
    avgPE: eb3yrAvg.avgPE,
  }), [eb3yrAvg]);

  // Method A result
  const ptebResult = useMemo(() => {
    const pretaxEPS = ptebPretaxEPSOverride ?? ptebDefaults.pretaxEPS;
    const growthRate = ptebGrowthRateOverride ?? ptebDefaults.pretaxGrowthRate;
    const avgPE = ptebPEOverride ?? ptebDefaults.avgPE;
    if (pretaxEPS == null) return null;
    return computePretaxEquityBond({
      pretaxEPS,
      pretaxGrowthRate: growthRate,
      corpBondYield: ptebCorpBondYield,
      historicalPE: avgPE,
      marr,
      years: 10,
      currentPrice,
    });
  }, [ptebPretaxEPSOverride, ptebGrowthRateOverride, ptebPEOverride, ptebDefaults, ptebCorpBondYield, marr, currentPrice]);

  // Method B result
  const ebResult = useMemo(() => {
    const bvps = ebBvpsOverride ?? ebDefaults.bvps;
    const roe = ebRoeOverride ?? ebDefaults.avgROE;
    const retainedRatio = ebRetainedRatioOverride ?? ebDefaults.retainedRatio;
    const avgPE = ebAvgPEOverride ?? ebDefaults.avgPE;
    if (bvps == null || roe == null || retainedRatio == null || avgPE == null) return null;
    return computeEquityBond({
      bvps, roe, retainedRatio, historicalPE: avgPE, marr, years: 10, currentPrice,
    });
  }, [ebBvpsOverride, ebRoeOverride, ebRetainedRatioOverride, ebAvgPEOverride, ebDefaults, marr, currentPrice]);

  // Bond Comparison result
  const bondComparisonResult = useMemo(() => {
    if (epsTTM == null || currentPrice == null) return null;
    return computeBondComparison({
      eps: epsTTM,
      marketPrice: currentPrice,
      tbillYield: ebTBillYield,
      corpBondYield: ebCorpBondYield,
    });
  }, [epsTTM, currentPrice, ebTBillYield, ebCorpBondYield]);

  // MOS
  const mosResult = useMemo(() => {
    if (epsTTM == null || activeFGR == null || effectiveFuturePE == null) return null;
    return computeMOS({
      eps: epsTTM,
      fgr: activeFGR,
      futurePE: effectiveFuturePE,
      marr,
      years: 10,
    });
  }, [epsTTM, activeFGR, effectiveFuturePE, marr]);

  // PBT
  const pbtFCFPerShareComputed = useMemo(() => {
    if (epsTTM == null || effectiveFCFRatio == null) return null;
    return computeFcfPerShare({ fcfRatio: effectiveFCFRatio, eps: epsTTM });
  }, [epsTTM, effectiveFCFRatio]);

  const pbtFCFPerShare = pbtFCFPerShareOverride ?? pbtFCFPerShareComputed;

  const pbtResult = useMemo(() => {
    if (pbtFCFPerShare == null || activeFGR == null) return null;
    return computePBT({ fcfPerShare: pbtFCFPerShare, fgr: activeFGR, targetYears: pbtYears });
  }, [pbtFCFPerShare, activeFGR, pbtYears]);

  // PBT at current price
  const pbtAtCurrentPrice = useMemo(() => {
    if (pbtFCFPerShare == null || activeFGR == null || currentPrice == null) return null;
    return yearsToPayback({ fcfPerShare: pbtFCFPerShare, fgr: activeFGR, price: currentPrice });
  }, [pbtFCFPerShare, activeFGR, currentPrice]);

  // Toggle year exclusion
  const toggleExcludedYear = (year) => {
    setExcludedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
    // Reset FCF ratio override when exclusion changes
    setFcfRatioOverride(null);
  };

  const toggleExcludedYear10Cap = (year) => {
    setExcludedYears10Cap(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const toggleExcludedYearMOS = (year) => {
    setExcludedYearsMOS(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const toggleExcludedYearEB = (year) => {
    setExcludedYearsEB(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  // ─── Render ───────────────────────────────────────────────

  return (
    <div>
      {/* Sub-tab navigation */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 20,
        alignItems: 'center',
      }}>
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            style={{
              padding: '8px 18px',
              fontSize: 12,
              fontWeight: subTab === t.key ? 600 : 500,
              color: subTab === t.key ? C.accent : C.textSecondary,
              background: 'transparent',
              border: 'none',
              borderBottom: subTab === t.key ? `2px solid ${C.accent}` : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color .15s, border-color .15s',
              marginBottom: -1,
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, marginBottom: -1 }}>
          {saveStatus === 'loaded' && (
            <span style={{
              fontSize: 11,
              color: C.accent,
              fontWeight: 500,
            }}>
              Loaded from save
            </span>
          )}
        </div>
      </div>

      {subTab === 'growthRates' && (
        <GrowthRateAnalysis
          edgarStatements={edgarStatements}
          allPrices={allPrices}
          returns={returns}
          analystGR={analystGR}
          weightedAvgs={weightedAvgs}
          compositeGR={compositeGR}
          compositeMetrics={compositeMetrics}
          excludedDataPoints={excludedGrowthPoints}
          onToggleDataPoint={(key) => {
            setExcludedGrowthPoints(prev => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          }}
          onClearExcludedDataPoints={() => setExcludedGrowthPoints(new Set())}
          onToggleCompositeMetric={(key) => {
            setCompositeMetrics(prev => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          }}
          onSaveComposite={() => {
            setFgrSource('composite');
            setSubTab('calculators');
          }}
        />
      )}

      {subTab === 'calculators' && (
        <ValuationCalculators
          currentPrice={currentPrice}
          tenCapData={tenCapData}
          tenCapDefaults={tenCapDefaults}
          mosResult={mosResult}
          pbtResult={pbtResult}
          pbtFCFPerShare={pbtFCFPerShare}
          pbtFCFPerShareComputed={pbtFCFPerShareComputed}
          pbtAtCurrentPrice={pbtAtCurrentPrice}
          epsTTM={epsTTM}
          setEpsTTM={setEpsTTM}
          fgrSource={fgrSource}
          setFgrSource={setFgrSource}
          analystGR={analystGR}
          setAnalystGR={setAnalystGR}
          compositeGR={compositeGR}
          customGR={customGR}
          setCustomGR={setCustomGR}
          activeFGR={activeFGR}
          maintenancePct={maintenancePct}
          setMaintenancePct={setMaintenancePct}
          futurePE={effectiveFuturePE}
          setFuturePE={setFuturePEOverride}
          mosDiscount={mosDiscount}
          setMosDiscount={setMosDiscount}
          marr={marr}
          setMarr={setMarr}
          pbtYears={pbtYears}
          setPbtYears={setPbtYears}
          effectiveFCFRatio={effectiveFCFRatio}
          fcfRatioOverride={fcfRatioOverride}
          setFcfRatioOverride={setFcfRatioOverride}
          fcfRatioComputed={fcfRatioData.average}
          hasTTM={hasTTM}
          // 10 Cap override setters
          setTenCapCFO={setTenCapCFOOverride}
          setTenCapCapEx={setTenCapCapExOverride}
          setTenCapTax={setTenCapTaxOverride}
          setTenCapShares={setTenCapSharesOverride}
          setTenCapMaintCapEx={setTenCapMaintCapExOverride}
          // PBT FCF Per Share override
          setPbtFCFPerShare={setPbtFCFPerShareOverride}
          // Equity Bond
          ebResult={ebResult}
          ebDefaults={ebDefaults}
          setEbBvps={setEbBvpsOverride}
          setEbRoe={setEbRoeOverride}
          setEbRetainedRatio={setEbRetainedRatioOverride}
          setEbAvgPE={setEbAvgPEOverride}
          heroEnabled={heroEnabled}
          setHeroEnabled={setHeroEnabled}
          onSave={handleSave}
          saveStatus={saveStatus}
          analystData={analystData}
          analystLoading={analystLoading}
          refetchAnalyst={refetchAnalyst}
          analystGRSource={analystGRSource}
        />
      )}

      {subTab === 'inputs' && (
        <ValuationInputs
          edgarStatements={edgarStatements}
          historicalPE={historicalPE}
          historicalAvgPE={historicalAvgPEPerYear}
          excludedYears={excludedYears}
          toggleExcludedYear={toggleExcludedYear}
          excludedYears10Cap={excludedYears10Cap}
          toggleExcludedYear10Cap={toggleExcludedYear10Cap}
          excludedYearsMOS={excludedYearsMOS}
          toggleExcludedYearMOS={toggleExcludedYearMOS}
          excludedYearsEB={excludedYearsEB}
          toggleExcludedYearEB={toggleExcludedYearEB}
          eb3yrAvg={eb3yrAvg}
          fcfRatioData={fcfRatioData}
          settings={settings}
          hasTTM={hasTTM}
          returns={returns}
        />
      )}

      {subTab === 'priceVsValue' && (
        <HistoricalBuyPrices
          edgarStatements={edgarStatements}
          allPrices={allPrices}
          returns={returns}
          historicalPE={historicalPE}
          historicalAvgPE={historicalAvgPEPerYear}
          analysisSeries={analysisSeries}
          compositeMetrics={compositeMetrics}
          maintenancePct={maintenancePct}
          marr={marr}
          pbtYears={pbtYears}
        />
      )}
    </div>
  );
}
