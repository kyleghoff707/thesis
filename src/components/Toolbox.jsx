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
import { useGurus } from '../hooks/useGurus';
import { useInsiders } from '../hooks/useInsiders';
import { useCompensation } from '../hooks/useCompensation';
import CompanyHeader from './CompanyHeader';
import StockAtGlance from './StockAtGlance';
import ScoreTable from './ScoreTable';
import FinancialStatements from './FinancialStatements';
import GrowthAnalysis from './GrowthAnalysis';
import Filings from './Filings';
import Insiders from './Insiders';
import Valuation from './Valuation';
import CollapsibleSection from './CollapsibleSection';
import ExecutiveCompensation from './ExecutiveCompensation';
import { classifyBySIC } from '../engines/sicClassification';
import TickerDataAudit from './TickerDataAudit';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'financials', label: 'Financials' },
  { key: 'growth', label: 'Growth' },
  { key: 'valuation', label: 'Valuation' },
  { key: 'insiders', label: 'Insiders' },
  { key: 'filings', label: 'Filings' },
  { key: 'audit', label: 'Audit' },
];

export default function Toolbox({ getReport, updateReport, settings }) {
  const { id } = useParams();
  const report = getReport(id);
  const ticker = report?.ticker;

  // Remember last-viewed research for tab persistence
  useEffect(() => { if (id) localStorage.setItem('sa-last-research', id); }, [id]);

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
  const { summary: insiderSummary } = useInsiders(ticker);
  const { data: compData, loading: compLoading, error: compError } = useCompensation(ticker);
  const { activities: guruActivities } = useGurus();

  // Find gurus holding this ticker
  const gurusHoldingTicker = useMemo(() => {
    if (!ticker || guruActivities.length === 0) return [];
    const q = ticker.toUpperCase();
    const results = [];
    for (const activity of guruActivities) {
      if (!activity?.holdings) continue;
      const match = activity.holdings.find(h =>
        h.ticker?.toUpperCase() === q ||
        h.issuer?.toUpperCase().includes(q)
      );
      if (match) {
        results.push({
          guruName: activity.guru.name,
          fundName: activity.guru.fund,
          shares: match.shares,
          action: match.action,
          portfolioPct: match.portfolioPct,
        });
      }
    }
    return results.sort((a, b) => b.portfolioPct - a.portfolioPct);
  }, [ticker, guruActivities]);

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

      {/* Audit tab — independent, runs its own data fetches */}
      {activeTab === 'audit' && (
        <TickerDataAudit ticker={ticker} guruActivities={guruActivities} />
      )}

      {/* Overview tab — partially independent */}
      {activeTab === 'overview' && (
        <div>
          {/* Parts that need edgarStatements */}
          {edgarStatements && (
            <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s', pointerEvents: loading ? 'none' : undefined }}>
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

              <div style={{ marginTop: 24 }}>
                <CollapsibleSection title="Rule One Scores" defaultOpen={false}>
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
                </CollapsibleSection>

                <CollapsibleSection title="Executive Compensation" defaultOpen={false}>
                  <ExecutiveCompensation data={compData} loading={compLoading} error={compError} edgarStatements={edgarStatements} />
                </CollapsibleSection>

                <CollapsibleSection title="Industry Information" defaultOpen={false}>
                  <IndustryInformation company={company} />
                </CollapsibleSection>
              </div>
            </div>
          )}

          {/* Trading Activity — independent of edgarStatements */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Trading Activity</span>
            </div>

            {/* Insider Summary Cards */}
            <InsiderSummaryCards summary={insiderSummary} />

            {/* Guru Holdings Table */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                Guru Holdings
                {gurusHoldingTicker.length > 0 && (
                  <span style={{ fontWeight: 400, color: C.textMuted, marginLeft: 8, fontSize: 12 }}>
                    {gurusHoldingTicker.length} guru{gurusHoldingTicker.length !== 1 ? 's' : ''} hold this stock
                  </span>
                )}
              </div>
              {guruActivities.length === 0 ? (
                <div style={{ color: C.textMuted, fontSize: 12, fontStyle: 'italic', padding: '12px 0' }}>
                  No guru data loaded. Visit the Gurus tab to fetch data.
                </div>
              ) : gurusHoldingTicker.length === 0 ? (
                <div style={{ color: C.textMuted, fontSize: 12, fontStyle: 'italic', padding: '12px 0' }}>
                  No gurus currently hold {ticker}.
                </div>
              ) : (
                <div style={{
                  background: C.bgCard,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                        {['Guru', 'Fund', 'Shares Held', 'Last Quarter Action', '% of Portfolio'].map(col => (
                          <th key={col} style={{
                            padding: '8px 12px',
                            textAlign: col === 'Shares Held' || col === '% of Portfolio' ? 'right' : 'left',
                            fontWeight: 600, color: C.textSecondary, fontSize: 11,
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {gurusHoldingTicker.map((g, i) => {
                        const actionColors = { new: C.green, added: C.green, reduced: C.red, sold: C.red, held: C.textMuted };
                        const actionLabels = { new: 'New Buy', added: 'Added', reduced: 'Reduced', sold: 'Sold', held: 'Held' };
                        return (
                          <tr key={g.guruName} style={{
                            borderBottom: `1px solid ${C.border}`,
                            background: i % 2 === 0 ? 'transparent' : `${C.bgHover}40`,
                          }}>
                            <td style={{ padding: '7px 12px', fontWeight: 500, color: C.text }}>{g.guruName}</td>
                            <td style={{ padding: '7px 12px', color: C.textSecondary, fontSize: 11 }}>{g.fundName}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', color: C.text }}>
                              {g.shares?.toLocaleString() || '--'}
                            </td>
                            <td style={{ padding: '7px 12px', color: actionColors[g.action] || C.textMuted, fontWeight: 500 }}>
                              {actionLabels[g.action] || g.action || '--'}
                            </td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', color: C.text }}>
                              {g.portfolioPct != null ? `${g.portfolioPct.toFixed(2)}%` : '--'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs that need edgarStatements */}
      {edgarStatements && activeTab !== 'filings' && activeTab !== 'insiders' && activeTab !== 'overview' && activeTab !== 'audit' && (
        <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s', pointerEvents: loading ? 'none' : undefined }}>

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

          {/* Valuation tab */}
          {activeTab === 'valuation' && (
            <Valuation
              edgarStatements={edgarStatements}
              ticker={ticker}
              latest={latest}
              settings={settings}
              returns={returns}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Insider Summary Cards (lightweight version for Overview) ─────

function fmtShares(val) {
  if (val == null || isNaN(val)) return '--';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return val.toLocaleString();
}

function fmtDate(dateStr) {
  if (!dateStr) return '--';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

function InsiderSummaryCards({ summary }) {
  if (!summary) return null;

  const isNetBuyer = summary.netShares12M > 0;
  const netLabel = isNetBuyer ? 'Buying' : 'Selling';
  const netColor = isNetBuyer ? C.green : C.red;
  const hasOpenMarket90D = summary.openMarketBuyers90D > 0;

  const cards = [
    {
      label: 'Net Activity (12M)',
      value: `${netLabel} ${fmtShares(Math.abs(summary.netShares12M))}`,
      color: netColor,
    },
    {
      label: 'Open Market Purchases (90D)',
      value: `${summary.openMarketBuyers90D} insider${summary.openMarketBuyers90D !== 1 ? 's' : ''}`,
      color: hasOpenMarket90D ? C.green : C.textMuted,
    },
    {
      label: 'Unique Insiders',
      value: summary.uniqueInsiders,
      color: C.text,
    },
    {
      label: 'Last Activity',
      value: summary.lastPurchaseDate ? fmtDate(summary.lastPurchaseDate) : '--',
      color: C.green,
    },
  ];

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, width: '100%', marginBottom: -4 }}>Insider Summary</div>
      {cards.map(card => (
        <div key={card.label} style={{
          flex: '1 1 160px', minWidth: 140,
          padding: '10px 14px',
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            {card.label}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: card.color }}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Industry Information ─────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatFYEnd(fyEnd) {
  if (!fyEnd || fyEnd.length < 2) return '--';
  const month = parseInt(fyEnd.slice(0, 2));
  return MONTH_NAMES[month - 1] || '--';
}

function IndustryInformation({ company }) {
  if (!company?.sic) return null;

  const classification = classifyBySIC(company.sic, company.sicDescription);
  const cikDisplay = company.cik ? company.cik.replace(/^0+/, '') : '--';

  const InfoRow = ({ label, value, href }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: C.accent, textDecoration: 'none' }}>
          {value}
        </a>
      ) : (
        <span style={{ fontSize: 13, color: C.text }}>{value || '--'}</span>
      )}
    </div>
  );

  const websiteUrl = company.website
    ? (company.website.startsWith('http') ? company.website : `https://${company.website}`)
    : null;
  const websiteLabel = company.website
    ? company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : '--';

  return (
    <div>
      {/* Core — matches Rule One Toolbox layout */}
      <div style={{ display: 'flex', gap: 48 }}>
        <div style={{ flex: 1 }}>
          <InfoRow label="Sector" value={classification.sector} />
          <InfoRow label="Industry Group" value={classification.industryGroup} />
          <InfoRow label="Industry" value={classification.industry} />
        </div>
        <div style={{ flex: 1 }}>
          <InfoRow label="NAICS" value={classification.naics} />
          <InfoRow label="CIK Number" value={cikDisplay} />
        </div>
      </div>

      {/* Bonus — additional company details from EDGAR */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Company Details
        </div>
        <div style={{ display: 'flex', gap: 48 }}>
          <div style={{ flex: 1 }}>
            <InfoRow label="SIC Code" value={`${company.sic} — ${company.sicDescription}`} />
            <InfoRow label="State of Incorporation" value={company.stateOfIncorporation || '--'} />
          </div>
          <div style={{ flex: 1 }}>
            <InfoRow label="Fiscal Year End" value={formatFYEnd(company.fiscalYearEnd)} />
            <InfoRow label="Website" value={websiteLabel} href={websiteUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}
