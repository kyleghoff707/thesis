import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { C } from '../theme';
import { useFinancials } from '../hooks/useFinancials';
import { usePrices } from '../hooks/usePrices';
import { useEdgar } from '../hooks/useEdgar';
import { computeAllGrowthRates } from '../engines/growthRates';
import { computeReturnMetrics, computeDebtMetrics } from '../engines/returnMetrics';
import { computeFreeCashFlow } from '../engines/freeCashFlow';
import { computeMoatScore, computeManagementScore, computeRuleOneScore } from '../engines/ruleOneScore';
import CompanyHeader from './CompanyHeader';
import StockAtGlance from './StockAtGlance';
import ScoreTable from './ScoreTable';
import FinancialStatements from './FinancialStatements';
import GrowthAnalysis from './GrowthAnalysis';
import Filings from './Filings';
import Insiders from './Insiders';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'scores', label: 'Scores' },
  { key: 'financials', label: 'Financials' },
  { key: 'growth', label: 'Growth' },
  { key: 'filings', label: 'Filings' },
  { key: 'insiders', label: 'Insiders' },
];

export default function Toolbox({ getReport, updateReport, settings }) {
  const { id } = useParams();
  const report = getReport(id);
  const ticker = report?.ticker;

  const [activeTab, setActiveTab] = useState('overview');
  const [priceRange, setPriceRange] = useState(settings?.defaultPriceRange || '5y');
  const [statementsVersion, setStatementsVersion] = useState(settings?.defaultVersion || 'restated');
  const [dataView, setDataView] = useState(settings?.defaultView || 'annual');

  // Sync local state with settings changes (e.g., from Settings modal)
  useEffect(() => { setPriceRange(settings?.defaultPriceRange || '5y'); }, [settings?.defaultPriceRange]);
  useEffect(() => { setStatementsVersion(settings?.defaultVersion || 'restated'); }, [settings?.defaultVersion]);
  useEffect(() => { setDataView(settings?.defaultView || 'annual'); }, [settings?.defaultView]);
  const { company, loading: finLoading, error: finError } = useFinancials(ticker);
  const { prices, latest, loading: priceLoading, error: priceError } = usePrices(ticker, priceRange);
  const { edgarData, edgarStatements, edgarQuarterly, loading: edgarLoading, error: edgarError } = useEdgar(ticker, statementsVersion, dataView);

  // Update report with company name once we have it
  if (company?.name && report && !report.companyName) {
    updateReport(report.id, { companyName: company.name });
  }

  // ─── All scoring now uses EDGAR as single source of truth ───

  const fcfResult = useMemo(() => {
    if (!edgarStatements) return null;
    return computeFreeCashFlow(edgarStatements);
  }, [edgarStatements]);

  const growthRates = useMemo(() => {
    if (!edgarStatements) return null;
    return computeAllGrowthRates(edgarStatements);
  }, [edgarStatements]);

  const returns = useMemo(() => {
    if (!edgarStatements) return null;
    return computeReturnMetrics(edgarStatements);
  }, [edgarStatements]);

  const debt = useMemo(() => {
    if (!edgarStatements) return null;
    return computeDebtMetrics(edgarStatements);
  }, [edgarStatements]);

  const moat = useMemo(() => {
    if (!growthRates) return null;
    return computeMoatScore(growthRates);
  }, [growthRates]);

  const management = useMemo(() => {
    if (!returns || !debt) return null;
    return computeManagementScore(returns.averages, debt);
  }, [returns, debt]);

  const overallScore = useMemo(() => {
    if (!moat || !management) return null;
    return computeRuleOneScore(moat.moatScore, management.managementScore);
  }, [moat, management]);

  if (!report) {
    return <div style={{ color: C.textSecondary }}>Report not found.</div>;
  }

  // Build Moat rows (5 growth metrics)
  const moatRows = [
    { label: 'Book Value + Dividend + Buy Backs Growth', key: 'bvps' },
    { label: 'Earnings Growth', key: 'earnings' },
    { label: 'Total Revenue Growth', key: 'revenue' },
    { label: 'Operating Cash Flow Growth', key: 'operatingCash' },
    { label: 'Free Cash Flow Growth', key: 'fcf' },
  ].map(m => ({
    label: m.label,
    rates: growthRates?.[m.key] || {},
    score: moat?.metricScores?.[m.key],
  }));

  // Build Management rows (3 return metrics + 2 debt metrics)
  const mgmtRows = [
    { label: 'Return On Equity', key: 'roe' },
    { label: 'Return On Invested Capital', key: 'roic' },
    { label: 'Return On Assets', key: 'roa' },
  ].map(m => ({
    label: m.label,
    rates: {
      '10yr': returns?.averages?.['10yr']?.[m.key],
      '7yr': returns?.averages?.['7yr']?.[m.key],
      '5yr': returns?.averages?.['5yr']?.[m.key],
      '3yr': returns?.averages?.['3yr']?.[m.key],
      '1yr': returns?.averages?.['1yr']?.[m.key],
    },
    score: management?.metricScores?.[m.key],
  }));

  mgmtRows.push({
    label: 'Net Debt to Earnings',
    type: 'debt',
    debtValue: debt?.netDebtToEarnings,
    isNetCash: debt?.isNetCash,
    score: management?.metricScores?.netDebtToEarnings,
  });
  mgmtRows.push({
    label: 'Net Debt to Free Cash Flow',
    type: 'debt',
    debtValue: debt?.netDebtToFCF,
    isNetCash: debt?.isNetCash,
    score: management?.metricScores?.netDebtToFCF,
  });

  const loading = finLoading || priceLoading || edgarLoading;
  const error = finError || priceError || edgarError;

  return (
    <div>
      <CompanyHeader
        company={company ? { ...company, ticker } : { ticker }}
        latest={latest}
        moatScore={moat?.moatScore}
        managementScore={management?.managementScore}
        ruleOneScore={overallScore}
      />

      {/* Tab navigation */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 20,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: activeTab === t.key ? 600 : 500,
              color: activeTab === t.key ? C.accent : C.textSecondary,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === t.key ? `2px solid ${C.accent}` : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color .15s, border-color .15s',
              marginBottom: -1,
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !edgarStatements && (
        <div style={{ padding: '20px 0', color: C.textSecondary, fontSize: 13 }}>
          Loading financial data...
        </div>
      )}

      {error && (
        <div style={{
          padding: '12px 16px',
          background: C.redBg,
          color: C.red,
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 12,
          border: `1px solid ${C.red}20`,
        }}>
          {error}
        </div>
      )}

      {/* Filings tab — independent data, doesn't need edgarStatements */}
      {activeTab === 'filings' && (
        <Filings ticker={ticker} />
      )}

      {/* Insiders tab — independent data, doesn't need edgarStatements */}
      {activeTab === 'insiders' && (
        <Insiders ticker={ticker} />
      )}

      {edgarStatements && activeTab !== 'filings' && activeTab !== 'insiders' && (
        <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s', pointerEvents: loading ? 'none' : undefined }}>

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <StockAtGlance
              company={company}
              edgarStatements={edgarStatements}
              prices={prices}
              latest={latest}
              range={priceRange}
              onRangeChange={setPriceRange}
              returns={returns}
              debt={debt}
              fcfResult={fcfResult}
            />
          )}

          {/* Scores tab */}
          {activeTab === 'scores' && (
            <div>
              <ScoreTable
                sectionTitle="MOAT: Compound Growth Rate"
                rows={moatRows}
                overallLabel="Rule One Moat Score"
                overallScore={moat?.moatScore}
              />
              {!growthRates?.fcf?.['10yr'] && !edgarLoading && (
                <div style={{
                  marginTop: 4, marginBottom: 12, padding: '8px 12px',
                  background: C.yellowBg, color: C.yellow, borderRadius: 6, fontSize: 12,
                  border: `1px solid ${C.yellow}20`,
                }}>
                  FCF growth requires CapEx data from EDGAR. CapEx data may not cover enough years for 10yr CAGR.
                </div>
              )}

              <ScoreTable
                sectionTitle="Management: Average Rate Of Return"
                rows={mgmtRows}
                overallLabel="Rule One Management Score"
                overallScore={management?.managementScore}
              />
            </div>
          )}

          {/* Financials tab */}
          {activeTab === 'financials' && (
            <FinancialStatements
              edgarStatements={edgarStatements}
              edgarQuarterly={edgarQuarterly}
              latestPrice={latest?.close}
              ticker={ticker}
              version={statementsVersion}
              onVersionChange={setStatementsVersion}
              dataView={dataView}
              onDataViewChange={setDataView}
              settings={settings}
            />
          )}

          {/* Growth tab */}
          {activeTab === 'growth' && (
            <GrowthAnalysis
              growthRates={growthRates}
              series={growthRates?._series}
              settings={settings}
            />
          )}
        </div>
      )}
    </div>
  );
}
