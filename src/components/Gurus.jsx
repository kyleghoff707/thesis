import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../theme';
import { useGurus } from '../hooks/useGurus';
import { useSettings } from '../hooks/useSettings';

// ─── Format helpers ─────────────────────────────────────────

function fmtValue(val) {
  if (val == null || isNaN(val)) return '--';
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function fmtShares(shares) {
  if (shares == null || isNaN(shares)) return '--';
  if (shares >= 1e9) return `${(shares / 1e9).toFixed(2)}B`;
  if (shares >= 1e6) return `${(shares / 1e6).toFixed(1)}M`;
  if (shares >= 1e3) return `${(shares / 1e3).toFixed(0)}K`;
  return shares.toLocaleString();
}

function fmtPct(pct) {
  if (pct == null || isNaN(pct)) return '--';
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

// Extract ticker list for a given action from activity holdings
function getTickersForAction(activity, action) {
  if (!activity?.holdings) return [];
  return activity.holdings
    .filter(h => h.action === action)
    .map(h => h.ticker)
    .filter(Boolean);
}

// Render ticker list cell content
function TickerCell({ tickers, count, color }) {
  if (!count) return <span style={{ color: C.textMuted }}>--</span>;
  if (tickers.length === 0) return <span style={{ color }}>{count}</span>;
  const MAX_SHOW = 5;
  const shown = tickers.slice(0, MAX_SHOW).join(', ');
  const more = tickers.length > MAX_SHOW ? ` +${tickers.length - MAX_SHOW}` : '';
  return (
    <span title={tickers.join(', ')} style={{ color, fontSize: 11, fontWeight: 500 }}>
      {shown}{more && <span style={{ color: C.textMuted, fontWeight: 400 }}>{more}</span>}
    </span>
  );
}

function timeAgo(timestamp) {
  if (!timestamp) return null;
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Tab definitions ────────────────────────────────────────

const TABS = [
  { key: 'latest', label: 'Latest' },
  { key: 'directory', label: 'Directory' },
  { key: 'stockLookup', label: 'Stock Lookup' },
];

// ─── Main Gurus component ───────────────────────────────────

export default function Gurus() {
  const { settings } = useSettings();
  const {
    gurus, portfolios, activities, loading, progress, error,
    fetchOne, fetchOneWithChanges, fetchAllChanges, searchStock, latestTabData,
    nportData: rawNportData, lastFetchedAt,
  } = useGurus();
  const nportData = settings.enableNport !== false ? rawNportData : {};
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('latest');
  const [loadingCik, setLoadingCik] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [directorySearch, setDirectorySearch] = useState('');

  // Merge guru list with loaded portfolio/activity data, sorted alphabetically
  const guruList = useMemo(() => {
    const portfolioMap = {};
    for (const p of portfolios) portfolioMap[p.guru.cik] = p;
    const activityMap = {};
    for (const a of activities) if (a?.guru) activityMap[a.guru.cik] = a;
    return [...gurus]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(g => ({ ...g, portfolio: portfolioMap[g.cik] || null, activity: activityMap[g.cik] || null }));
  }, [gurus, portfolios, activities]);

  const allLoaded = activities.length === gurus.length || portfolios.length === gurus.length;

  // Handle guru name click in directory — load if needed, then navigate
  const handleGuruClick = async (guru) => {
    const hasActivity = activities.some(a => a?.guru?.cik === guru.cik);
    if (!hasActivity) {
      setLoadingCik(guru.cik);
      await fetchOneWithChanges(guru);
      setLoadingCik(null);
    }
    navigate(`/gurus/${guru.cik}`);
  };

  // Search results for stock lookup
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || portfolios.length === 0) return [];
    return searchStock(searchQuery.trim());
  }, [searchQuery, portfolios, searchStock]);

  return (
    <div style={{ padding: '40px 0' }}>
      {/* ─── Header ─── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Gurus</h1>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              {allLoaded
                ? `${Math.max(activities.length, portfolios.length)} guru portfolios loaded (from latest 13F filings)`
                : `${Math.max(activities.length, portfolios.length)} of ${gurus.length} portfolios loaded`}
              {lastFetchedAt && (
                <span style={{ marginLeft: 8, opacity: 0.7 }}>
                  · Last refreshed: {timeAgo(lastFetchedAt)}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={fetchAllChanges}
          disabled={loading}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            background: loading ? C.bgHover : C.accent,
            color: loading ? C.textMuted : '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {loading ? 'Loading...' : allLoaded ? 'Refresh All' : 'Load All Portfolios'}
        </button>
      </div>

      {/* ─── Progress bar ─── */}
      {loading && progress.total > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            height: 4, borderRadius: 2, background: C.border, overflow: 'hidden', marginBottom: 6,
          }}>
            <div style={{
              height: '100%', borderRadius: 2, background: C.accent,
              width: `${(progress.current / progress.total) * 100}%`, transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ fontSize: 12, color: C.textMuted }}>
            Loading {progress.name}... ({progress.current}/{progress.total})
          </div>
        </div>
      )}

      {/* ─── Error ─── */}
      {error && (
        <div style={{
          padding: '12px 16px', background: C.redBg, color: C.red, borderRadius: 8,
          fontSize: 13, marginBottom: 12, border: `1px solid ${C.red}20`,
        }}>
          {error}
        </div>
      )}

      {/* ─── Tab bar ─── */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 20,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px', fontSize: 13,
              fontWeight: activeTab === t.key ? 600 : 500,
              color: activeTab === t.key ? C.accent : C.textSecondary,
              background: 'transparent', border: 'none',
              borderBottom: activeTab === t.key ? `2px solid ${C.accent}` : '2px solid transparent',
              cursor: 'pointer', transition: 'color .15s, border-color .15s',
              marginBottom: -1, fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Latest tab ─── */}
      {activeTab === 'latest' && (
        <LatestTab
          latestTabData={latestTabData}
          activities={activities}
          loading={loading}
          allLoaded={allLoaded}
          guruCount={gurus.length}
          onLoadAll={fetchAllChanges}
          onGuruClick={(cik) => navigate(`/gurus/${cik}`)}
        />
      )}

      {/* ─── Directory tab ─── */}
      {activeTab === 'directory' && (
        <div>
          {/* Directory search */}
          <div style={{ marginBottom: 16 }}>
            <input
              value={directorySearch}
              onChange={e => setDirectorySearch(e.target.value)}
              placeholder="Search gurus by name or fund..."
              style={{
                width: '100%', maxWidth: 400, padding: '8px 12px', fontSize: 13,
                border: `1px solid ${C.border}`, borderRadius: 6,
                background: C.bgInput, color: C.text, outline: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = C.border}
            />
          </div>
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: 8,
            overflow: 'hidden', background: C.bgCard,
          }}>
          {guruList.filter(g => {
            if (!directorySearch.trim()) return true;
            const q = directorySearch.toLowerCase();
            return g.name.toLowerCase().includes(q) || g.fund.toLowerCase().includes(q);
          }).map((guru) => {
            const isLoading = loadingCik === guru.cik;
            const portfolio = guru.portfolio;
            const activity = guru.activity;
            const data = activity || portfolio;

            return (
              <div
                key={guru.cik}
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: '10px 14px',
                  borderBottom: `1px solid ${C.borderLight}`,
                  transition: 'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Name + fund — clickable link */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    onClick={() => handleGuruClick(guru)}
                    style={{
                      fontSize: 13, fontWeight: 600, color: C.accent,
                      cursor: 'pointer', textDecoration: 'none',
                    }}
                    onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                  >
                    {guru.name}
                  </div>
                  <div style={{
                    fontSize: 12, color: C.textMuted,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {guru.fund}
                  </div>
                </div>

                {isLoading && (
                  <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 16 }}>Loading...</span>
                )}

                {data && !data.error && !isLoading && (
                  <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexShrink: 0, marginLeft: 16 }}>
                    <div style={{ textAlign: 'right', minWidth: 60 }}>
                      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Positions</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{data.positionCount}</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Value</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmtValue(data.totalValue)}</div>
                    </div>
                    {nportData[guru.cik] && (
                      <div style={{ textAlign: 'right', minWidth: 60 }}>
                        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                          Cash
                          <span style={{ fontSize: 8, background: C.accent, color: '#fff', borderRadius: 2, padding: '0px 3px', fontWeight: 700 }}>N</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>{fmtPct(nportData[guru.cik].cashPct)}</div>
                      </div>
                    )}
                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Filed</div>
                      <div style={{ fontSize: 13, color: C.textSecondary }}>{data.filing?.filingDate || data.filingDate || '--'}</div>
                    </div>
                  </div>
                )}

                {!data && !isLoading && (
                  <span
                    onClick={() => handleGuruClick(guru)}
                    style={{ fontSize: 12, color: C.textMuted, marginLeft: 16, cursor: 'pointer' }}
                  >
                    Click to load
                  </span>
                )}

                {data?.error && !isLoading && (
                  <span style={{ fontSize: 12, color: C.red, marginLeft: 16 }}>{data.error}</span>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* ─── Stock Lookup tab ─── */}
      {activeTab === 'stockLookup' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by company name (e.g. APPLE, META, BERKSHIRE)..."
              style={{
                width: '100%', maxWidth: 480, padding: '10px 14px', fontSize: 13,
                border: `1px solid ${C.border}`, borderRadius: 6,
                background: C.bgInput, color: C.text, outline: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = C.border}
            />
          </div>

          {!allLoaded && (
            <div style={{
              padding: '12px 16px', background: C.yellowBg, color: C.yellow,
              borderRadius: 8, fontSize: 13, marginBottom: 16, border: `1px solid ${C.yellow}20`,
            }}>
              Load all portfolios first to search across all {gurus.length} gurus.
              {portfolios.length > 0 && ` Currently searching ${portfolios.length} loaded portfolios.`}
            </div>
          )}

          {searchQuery.trim() && searchResults.length > 0 && (
            <div style={{
              border: `1px solid ${C.border}`, borderRadius: 8,
              overflow: 'hidden', background: C.bgCard,
            }}>
              <div style={{
                padding: '8px 14px', fontSize: 12, color: C.textMuted,
                background: C.headerBg, borderBottom: `1px solid ${C.border}`,
              }}>
                {searchResults.length} guru{searchResults.length !== 1 ? 's' : ''} holding "{searchQuery}"
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Guru', 'Fund', 'Company', 'Shares', 'Value', '% of Portfolio'].map((h, i) => (
                      <th key={h} style={{
                        textAlign: i >= 3 ? 'right' : 'left',
                        padding: '8px 14px', color: C.textMuted, fontWeight: 600,
                        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
                        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {searchResults.flatMap((result) =>
                    result.positions.map((pos, pIdx) => (
                      <tr
                        key={`${result.guru.cik}-${pos.cusip}-${pIdx}`}
                        style={{ borderBottom: `1px solid ${C.borderLight}` }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, color: C.accent }}>
                          {pIdx === 0 ? result.guru.name : ''}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: C.textMuted }}>
                          {pIdx === 0 ? result.guru.fund : ''}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 13, color: C.text }}>
                          {pos.issuer}
                          {pos.titleOfClass && pos.titleOfClass !== 'COM' && (
                            <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>{pos.titleOfClass}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 13, color: C.textSecondary, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtShares(pos.shares)}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 13, color: C.text, textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtValue(pos.value)}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 13, color: C.textSecondary, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPct(pos.portfolioPct)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {searchQuery.trim() && searchResults.length === 0 && portfolios.length > 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
              No gurus found holding "{searchQuery}" in their latest 13F filing.
            </div>
          )}

          {!searchQuery.trim() && portfolios.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '60px 24px', color: C.textMuted,
            }}>
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: 12 }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Search guru holdings</div>
              <div style={{ fontSize: 13 }}>Enter a company name to see which gurus own it.</div>
            </div>
          )}

          {portfolios.length === 0 && !loading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '60px 24px', color: C.textMuted,
            }}>
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: 12 }}>
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No portfolios loaded yet</div>
              <div style={{ fontSize: 13 }}>Click "Load All Portfolios" to fetch 13F filings for all {gurus.length} gurus.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Latest Tab Component ───────────────────────────────────

function LatestTab({ latestTabData, activities, loading, allLoaded, guruCount, onLoadAll, onGuruClick }) {
  const [activitySort, setActivitySort] = useState({ key: 'name', asc: true });
  const [buysSort, setBuysSort] = useState({ key: 'guruCount', asc: false });
  const [holdingsSort, setHoldingsSort] = useState({ key: 'guruCount', asc: false });

  const sortedActivities = useMemo(() => {
    if (!latestTabData?.guruActivities) return [];
    const copy = [...latestTabData.guruActivities];
    copy.sort((a, b) => {
      let av, bv;
      switch (activitySort.key) {
        case 'name': av = a.guru?.name || ''; bv = b.guru?.name || '';
          return activitySort.asc ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'date': av = a.reportDate || ''; bv = b.reportDate || '';
          return activitySort.asc ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'new': av = a.newBuys || 0; bv = b.newBuys || 0; break;
        case 'added': av = a.added || 0; bv = b.added || 0; break;
        case 'reduced': av = a.reduced || 0; bv = b.reduced || 0; break;
        case 'sold': av = a.soldOut || 0; bv = b.soldOut || 0; break;
        default: av = 0; bv = 0;
      }
      if (typeof av === 'string') return 0;
      return activitySort.asc ? av - bv : bv - av;
    });
    return copy;
  }, [latestTabData, activitySort]);

  const sortedBuys = useMemo(() => {
    if (!latestTabData?.topBuys) return [];
    const copy = [...latestTabData.topBuys];
    copy.sort((a, b) => {
      let av, bv;
      switch (buysSort.key) {
        case 'totalValuePurchased': av = a.totalValuePurchased || 0; bv = b.totalValuePurchased || 0; break;
        case 'maxPortfolioPct': av = a.maxPortfolioPct || 0; bv = b.maxPortfolioPct || 0; break;
        case 'guruCount': av = a.guruCount || 0; bv = b.guruCount || 0; break;
        default: av = 0; bv = 0;
      }
      return buysSort.asc ? av - bv : bv - av;
    });
    return copy;
  }, [latestTabData, buysSort]);

  const sortedHoldings = useMemo(() => {
    if (!latestTabData?.topHoldings) return [];
    const copy = [...latestTabData.topHoldings];
    copy.sort((a, b) => {
      let av, bv;
      switch (holdingsSort.key) {
        case 'totalValue': av = a.totalValue || 0; bv = b.totalValue || 0; break;
        case 'maxPortfolioPct': av = a.maxPortfolioPct || 0; bv = b.maxPortfolioPct || 0; break;
        case 'guruCount': av = a.guruCount || 0; bv = b.guruCount || 0; break;
        default: av = 0; bv = 0;
      }
      return holdingsSort.asc ? av - bv : bv - av;
    });
    return copy;
  }, [latestTabData, holdingsSort]);

  const handleSort = (key) => {
    if (activitySort.key === key) setActivitySort({ key, asc: !activitySort.asc });
    else setActivitySort({ key, asc: key === 'name' });
  };

  const handleBuysSort = (key) => {
    if (buysSort.key === key) setBuysSort({ key, asc: !buysSort.asc });
    else setBuysSort({ key, asc: false });
  };

  const handleHoldingsSort = (key) => {
    if (holdingsSort.key === key) setHoldingsSort({ key, asc: !holdingsSort.asc });
    else setHoldingsSort({ key, asc: false });
  };

  if (!latestTabData && !loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '60px 24px', color: C.textMuted,
      }}>
        <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: 12 }}>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Load portfolios to see latest activity</div>
        <div style={{ fontSize: 13, marginBottom: 16 }}>
          Click "Load All Portfolios" to fetch 13F filings and compare quarter-over-quarter changes.
        </div>
      </div>
    );
  }

  const ACTIVITY_COLS = [
    { key: 'name', label: 'Guru Name', align: 'left' },
    { key: 'date', label: 'Portfolio Date', align: 'left' },
    { key: 'new', label: 'New Buy', align: 'left' },
    { key: 'added', label: 'Added', align: 'left' },
    { key: 'reduced', label: 'Reduced', align: 'left' },
    { key: 'sold', label: 'Sold Out', align: 'left' },
    { key: 'filed', label: 'Last Updated', align: 'right' },
  ];

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* Left: Guru Activity Table */}
      <div style={{ flex: '1 1 60%', minWidth: 0, overflowX: 'auto' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 12px', letterSpacing: '0.01em' }}>
          Latest Quarter Guru Activity
        </h3>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8,
          overflow: 'hidden', background: C.bgCard,
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {ACTIVITY_COLS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => col.key !== 'filed' && handleSort(col.key)}
                    style={{
                      textAlign: col.align, padding: '8px 12px',
                      color: C.textMuted, fontWeight: 600, fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      background: C.headerBg, borderBottom: `1px solid ${C.border}`,
                      cursor: col.key !== 'filed' ? 'pointer' : 'default',
                      userSelect: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}
                    {activitySort.key === col.key && (
                      <span style={{ marginLeft: 4, fontSize: 10 }}>{activitySort.asc ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedActivities.map((act) => (
                <tr
                  key={act.guru?.cik}
                  style={{ borderBottom: `1px solid ${C.borderLight}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '7px 12px' }}>
                    <span
                      onClick={() => onGuruClick(act.guru?.cik)}
                      style={{ fontSize: 13, fontWeight: 600, color: C.accent, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                    >
                      {act.guru?.name}
                    </span>
                  </td>
                  <td style={{ padding: '7px 12px', fontSize: 12, color: C.textSecondary }}>
                    {act.reportDate || '--'}
                  </td>
                  <td style={{ padding: '7px 12px' }}>
                    <TickerCell tickers={getTickersForAction(act, 'new')} count={act.newBuys} color="#16a34a" />
                  </td>
                  <td style={{ padding: '7px 12px' }}>
                    <TickerCell tickers={getTickersForAction(act, 'added')} count={act.added} color="#16a34a" />
                  </td>
                  <td style={{ padding: '7px 12px' }}>
                    <TickerCell tickers={getTickersForAction(act, 'reduced')} count={act.reduced} color="#dc2626" />
                  </td>
                  <td style={{ padding: '7px 12px' }}>
                    <TickerCell tickers={getTickersForAction(act, 'sold')} count={act.soldOut} color="#dc2626" />
                  </td>
                  <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right', color: C.textMuted }}>
                    {act.filingDate || '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: Top 10 Quarter Buys + Top 10 Guru Holdings */}
      <div style={{ flex: '0 0 38%', minWidth: 320 }}>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, fontStyle: 'italic' }}>
          Based on each guru's latest 13F filing
        </div>
        {/* Top 10 Quarter Buys */}
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 12px', letterSpacing: '0.01em' }}>
          Top 10 Quarter Buys
          {latestTabData && (
            <span style={{ fontWeight: 400, fontSize: 12, color: C.textMuted, marginLeft: 8 }}>
              {activities.length} of {guruCount} Gurus Reporting
            </span>
          )}
        </h3>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8,
          overflow: 'hidden', background: C.bgCard,
        }}>
          {sortedBuys.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    { key: null, label: '#', align: 'left' },
                    { key: null, label: 'Company', align: 'left' },
                    { key: 'totalValuePurchased', label: 'Value Purchased', align: 'right' },
                    { key: 'maxPortfolioPct', label: 'Max % Portfolio', align: 'right' },
                    { key: 'guruCount', label: "# Guru's", align: 'right' },
                  ].map(col => (
                    <th
                      key={col.label}
                      onClick={col.key ? () => handleBuysSort(col.key) : undefined}
                      style={{
                        textAlign: col.align,
                        padding: '8px 10px', color: C.textMuted, fontWeight: 600,
                        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
                        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
                        whiteSpace: 'nowrap',
                        cursor: col.key ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                    >
                      {col.label}
                      {buysSort.key === col.key && (
                        <span style={{ marginLeft: 4, fontSize: 10 }}>{buysSort.asc ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedBuys.map((buy, idx) => (
                  <tr
                    key={buy.cusip}
                    style={{ borderBottom: `1px solid ${C.borderLight}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '7px 10px', fontSize: 12, color: C.textMuted, fontWeight: 600 }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{buy.issuer}</div>
                      {buy.ticker && <div style={{ fontSize: 12, color: C.accent }}>{buy.ticker}</div>}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', color: '#16a34a', fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmtValue(buy.totalValuePurchased)}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', color: C.textSecondary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmtPct(buy.maxPortfolioPct)}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', color: C.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {buy.guruCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
              {allLoaded ? 'No new buys detected this quarter.' : 'Load all portfolios to see top buys.'}
            </div>
          )}
        </div>

        {/* Top 10 Guru Holdings */}
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '24px 0 12px', letterSpacing: '0.01em' }}>
          Top 10 Guru Holdings
        </h3>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8,
          overflow: 'hidden', background: C.bgCard,
        }}>
          {sortedHoldings.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    { key: null, label: '#', align: 'left' },
                    { key: null, label: 'Company', align: 'left' },
                    { key: 'totalValue', label: 'Total Value*', align: 'right' },
                    { key: 'maxPortfolioPct', label: 'Max % Portfolio', align: 'right' },
                    { key: 'guruCount', label: "# Guru's", align: 'right' },
                  ].map(col => (
                    <th
                      key={col.label}
                      onClick={col.key ? () => handleHoldingsSort(col.key) : undefined}
                      style={{
                        textAlign: col.align,
                        padding: '8px 10px', color: C.textMuted, fontWeight: 600,
                        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
                        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
                        whiteSpace: 'nowrap',
                        cursor: col.key ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                    >
                      {col.label}
                      {holdingsSort.key === col.key && (
                        <span style={{ marginLeft: 4, fontSize: 10 }}>{holdingsSort.asc ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedHoldings.map((hold, idx) => (
                  <tr
                    key={hold.cusip}
                    style={{ borderBottom: `1px solid ${C.borderLight}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '7px 10px', fontSize: 12, color: C.textMuted, fontWeight: 600 }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{hold.issuer}</div>
                      {hold.ticker && <div style={{ fontSize: 12, color: C.accent }}>{hold.ticker}</div>}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', color: C.text, fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmtValue(hold.totalValue)}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', color: C.textSecondary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmtPct(hold.maxPortfolioPct)}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', color: C.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {hold.guruCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
              Load all portfolios to see top holdings.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
