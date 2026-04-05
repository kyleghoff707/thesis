import { useState, useEffect, useMemo } from 'react';
import { C } from '../theme';
import { fetchFilings } from '../engines/edgar';
import { cacheGetAsync, cacheClear } from '../engines/cache';
import { fetchFilingMarkdown } from '../engines/filingMarkdown';
import { fetchTranscript, fetchTranscriptForFiling, checkTranscriptCache, isEarningsFiling, clearTranscriptCache } from '../engines/transcripts';

// ─── Constants ──────────────────────────────────────────────

const FORM_DESCRIPTIONS = {
  '10-K': 'Annual Report',
  '10-K/A': 'Annual Report (Amended)',
  '10-KSB': 'Annual Report (Small Business)',
  '10-Q': 'Quarterly Report',
  '10-Q/A': 'Quarterly Report (Amended)',
  '8-K': 'Current Report',
  '8-K/A': 'Current Report (Amended)',
  'DEF 14A': 'Proxy Statement',
  'DEFA14A': 'Additional Proxy Material',
  'DEF 14C': 'Information Statement',
  'PRE 14A': 'Preliminary Proxy Statement',
  '4': 'Insider Ownership Change',
  '4/A': 'Insider Ownership Change (Amended)',
  '3': 'Initial Insider Ownership',
  '3/A': 'Initial Insider Ownership (Amended)',
  '5': 'Annual Insider Ownership',
  '5/A': 'Annual Insider Ownership (Amended)',
  'SC 13G': 'Beneficial Ownership (>5%)',
  'SC 13G/A': 'Beneficial Ownership (Amended)',
  'SC 13D': 'Beneficial Ownership (Activist)',
  'SC 13D/A': 'Beneficial Ownership (Amended)',
  'S-1': 'Registration Statement',
  'S-1/A': 'Registration Statement (Amended)',
  'S-3': 'Shelf Registration',
  'S-8': 'Employee Benefit Plan Registration',
  '20-F': 'Annual Report (Foreign)',
  '20-F/A': 'Annual Report (Foreign, Amended)',
  '6-K': 'Report of Foreign Issuer',
  '13F-HR': 'Institutional Holdings Report',
  '13F-HR/A': 'Institutional Holdings (Amended)',
  '144': 'Notice of Proposed Sale of Securities',
};

// 8-K item descriptions
const ITEM_DESCRIPTIONS = {
  '1.01': 'Entry into Material Agreement',
  '1.02': 'Termination of Material Agreement',
  '1.03': 'Bankruptcy or Receivership',
  '2.01': 'Completion of Acquisition/Disposition',
  '2.02': 'Results of Operations and Financial Condition',
  '2.03': 'Creation of Direct Financial Obligation',
  '2.04': 'Triggering Events (Acceleration of Obligations)',
  '2.05': 'Costs of Exit or Disposal Activities',
  '2.06': 'Material Impairments',
  '3.01': 'Delisting / Transfer of Listing',
  '3.02': 'Unregistered Sales of Equity Securities',
  '3.03': 'Material Modification to Rights of Holders',
  '4.01': 'Changes in Registrant\'s Certifying Accountant',
  '4.02': 'Non-Reliance on Previously Issued Financial Statements',
  '5.01': 'Changes in Control of Registrant',
  '5.02': 'Departure/Election of Directors or Officers',
  '5.03': 'Amendments to Articles of Incorporation or Bylaws',
  '5.04': 'Temporary Suspension of Trading Under Employee Plan',
  '5.05': 'Amendments to Code of Ethics',
  '5.06': 'Change in Shell Company Status',
  '5.07': 'Submission of Matters to a Vote of Security Holders',
  '5.08': 'Shareholder Nominations',
  '7.01': 'Regulation FD Disclosure',
  '8.01': 'Other Events',
  '9.01': 'Financial Statements and Exhibits',
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'annual', label: 'Annual', forms: new Set(['10-K', '10-K/A', '10-KSB', '20-F', '20-F/A']) },
  { key: 'quarterly', label: 'Quarterly', forms: new Set(['10-Q', '10-Q/A']) },
  { key: 'current', label: 'Current', forms: new Set(['8-K', '8-K/A', '6-K', '6-K/A']) },
  { key: 'proxy', label: 'Proxy', forms: new Set(['DEF 14A', 'DEFA14A', 'DEF 14C', 'PRE 14A']) },
  { key: 'insider', label: 'Insider', forms: new Set(['3', '3/A', '4', '4/A', '5', '5/A']) },
  { key: 'ownership', label: 'Ownership', forms: new Set(['SC 13G', 'SC 13G/A', 'SC 13D', 'SC 13D/A']) },
];

const PAGE_SIZE = 50;

// ─── Helpers ────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

function filingUrl(cik, accessionNumber, primaryDocument) {
  const accPath = accessionNumber.replace(/-/g, '');
  if (primaryDocument) {
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accPath}/${primaryDocument}`;
  }
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accPath}/`;
}

function formColor(form) {
  if (form.startsWith('10-K') || form === '20-F') return C.accent;
  if (form.startsWith('10-Q')) return C.green;
  if (form.startsWith('8-K')) return C.yellow;
  if (form === 'DEF 14A' || form === 'DEFA14A' || form === 'PRE 14A') return C.textSecondary;
  if (form === '4' || form === '3' || form === '5') return C.red;
  return C.text;
}

function describeItems(itemStr) {
  if (!itemStr) return null;
  const items = itemStr.split(',').map(s => s.trim()).filter(Boolean);
  return items.map(item => ITEM_DESCRIPTIONS[item] || item).join('; ');
}

function formatCharCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M chars`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K chars`;
  return `${n} chars`;
}

// ─── Component ──────────────────────────────────────────────

export default function Filings({ ticker }) {
  const [filings, setFilings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [year, setYear] = useState('all');
  const [showCount, setShowCount] = useState(PAGE_SIZE);
  const [cachedMap, setCachedMap] = useState(new Map()); // accessionNumber → charCount
  const [converting, setConverting] = useState(new Set()); // accession numbers currently converting
  const [convertError, setConvertError] = useState(null); // { accession, message }
  const [preview, setPreview] = useState(null); // { form, date, markdown, charCount }
  const [transcriptMap, setTranscriptMap] = useState(new Map()); // accession → transcript entry
  const [transcriptCached, setTranscriptCached] = useState(new Map()); // accession → { charCount }
  const [transcriptFetching, setTranscriptFetching] = useState(new Set());
  const [transcriptError, setTranscriptError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchFilings(ticker)
      .then(data => { if (!cancelled) setFilings(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [ticker]);

  // Reset pagination when filter or year changes
  useEffect(() => { setShowCount(PAGE_SIZE); }, [filter, year]);

  // Available years (from filingDate), sorted descending
  const availableYears = useMemo(() => {
    const years = new Set();
    for (const f of filings) {
      if (f.filingDate) years.add(f.filingDate.slice(0, 4));
    }
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [filings]);

  // Apply both form type filter and year filter
  const filtered = useMemo(() => {
    let result = filings;
    if (filter !== 'all') {
      const filterDef = FILTERS.find(f => f.key === filter);
      result = result.filter(f => filterDef?.forms?.has(f.form));
    }
    if (year !== 'all') {
      result = result.filter(f => f.filingDate?.startsWith(year));
    }
    return result;
  }, [filings, filter, year]);

  // Compute counts per filter (respects year selection)
  const filterCounts = useMemo(() => {
    const base = year === 'all' ? filings : filings.filter(f => f.filingDate?.startsWith(year));
    const counts = { all: base.length };
    for (const f of FILTERS) {
      if (f.key !== 'all') {
        counts[f.key] = base.filter(fl => f.forms.has(fl.form)).length;
      }
    }
    return counts;
  }, [filings, year]);

  const visible = filtered.slice(0, showCount);

  // Check which visible filings have cached markdown in IndexedDB
  useEffect(() => {
    if (visible.length === 0) return;
    let cancelled = false;
    (async () => {
      const newMap = new Map(cachedMap);
      let changed = false;
      for (const f of visible) {
        if (newMap.has(f.accessionNumber)) continue;
        const ext = f.primaryDocument?.split('.').pop()?.toLowerCase();
        if (ext === 'xml') continue;
        const cacheKey = `filing-md:v1:${f.accessionNumber}`;
        const hit = await cacheGetAsync(cacheKey);
        if (cancelled) return;
        if (hit) {
          newMap.set(f.accessionNumber, hit.length);
          changed = true;
        }
      }
      if (changed && !cancelled) setCachedMap(new Map(newMap));
    })();
    return () => { cancelled = true; };
  }, [visible.length, showCount, filter, year, filings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check cache for all earnings filings (Alpha Vantage cached transcripts)
  useEffect(() => {
    if (!ticker || !filings.length) return;
    let cancelled = false;

    checkTranscriptCache(ticker, filings)
      .then(cached => { if (!cancelled) setTranscriptCached(cached); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [ticker, filings]);

  // Convert a single filing to markdown
  async function handleConvert(filing) {
    const accn = filing.accessionNumber;
    setConverting(prev => new Set(prev).add(accn));
    setConvertError(null);
    try {
      const result = await fetchFilingMarkdown(filing);
      if (result.skipped) {
        setConvertError({ accession: accn, message: result.reason });
      } else if (result.markdown) {
        // Update cached map
        setCachedMap(prev => {
          const next = new Map(prev);
          next.set(accn, result.charCount);
          return next;
        });
        // Show preview
        setPreview({
          filing,
          form: filing.form,
          date: filing.filingDate,
          markdown: result.markdown,
          charCount: result.charCount,
          fromCache: result.fromCache,
        });
      }
    } catch (err) {
      setConvertError({ accession: accn, message: err.message });
    } finally {
      setConverting(prev => {
        const next = new Set(prev);
        next.delete(accn);
        return next;
      });
    }
  }

  // View cached markdown
  async function handleViewCached(filing) {
    const cacheKey = `filing-md:v1:${filing.accessionNumber}`;
    const markdown = await cacheGetAsync(cacheKey);
    if (markdown) {
      setPreview({
        filing,
        form: filing.form,
        date: filing.filingDate,
        markdown,
        charCount: markdown.length,
        fromCache: true,
      });
    }
  }

  // Clear cache and reconvert a filing
  async function handleReconvert(filing) {
    cacheClear(`filing-md:v1:${filing.accessionNumber}`);
    setCachedMap(prev => {
      const next = new Map(prev);
      next.delete(filing.accessionNumber);
      return next;
    });
    setPreview(null);
    await handleConvert(filing);
  }

  // Fetch or view a transcript
  async function handleTranscript(filing) {
    const entry = transcriptMap.get(filing.accessionNumber);
    const isCached = transcriptCached.has(filing.accessionNumber);
    const accn = filing.accessionNumber;

    if (!isCached) {
      setTranscriptFetching(prev => new Set(prev).add(accn));
    }
    setTranscriptError(null);

    try {
      // Use matched entry if available, otherwise auto-derive quarter from filing date
      const result = entry
        ? await fetchTranscript(ticker, entry)
        : await fetchTranscriptForFiling(ticker, filing);
      if (result.found) {
        if (!isCached) {
          setTranscriptCached(prev => {
            const next = new Map(prev);
            next.set(accn, { charCount: result.charCount });
            return next;
          });
        }
        setPreview({
          filing,
          form: filing.form,
          date: filing.filingDate,
          markdown: result.text,
          charCount: result.charCount,
          fromCache: result.fromCache,
          isTranscript: true,
          transcriptMeta: result.meta,
        });
      } else {
        setTranscriptError({ accession: accn, message: result.reason });
      }
    } catch (err) {
      setTranscriptError({ accession: accn, message: err.message });
    } finally {
      if (!isCached) {
        setTranscriptFetching(prev => {
          const next = new Set(prev);
          next.delete(accn);
          return next;
        });
      }
    }
  }

  // Clear cache and re-fetch a transcript
  async function handleRefetchTranscript(filing) {
    const entry = transcriptMap.get(filing.accessionNumber);
    if (entry) {
      clearTranscriptCache(ticker, entry.year, entry.quarter);
    } else if (filing.reportDate) {
      // Derive quarter for AV-cached transcripts
      const [y, m] = filing.reportDate.split('-').map(Number);
      const isAnnual = filing.form?.startsWith('10-K') || filing.form?.startsWith('20-F') || filing.form === '10-KSB';
      clearTranscriptCache(ticker, y, isAnnual ? 4 : Math.ceil(m / 3));
    }
    setTranscriptCached(prev => {
      const next = new Map(prev);
      next.delete(filing.accessionNumber);
      return next;
    });
    setPreview(null);
    await handleTranscript(filing);
  }

  if (loading) {
    return <div style={{ color: C.textSecondary, fontSize: 13, padding: '20px 0' }}>Loading filings...</div>;
  }

  if (error) {
    return (
      <div style={{
        padding: '12px 16px', background: C.redBg, color: C.red,
        borderRadius: 8, fontSize: 13, border: `1px solid ${C.red}20`,
      }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Markdown preview modal */}
      {preview && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setPreview(null)}
        >
          <div
            style={{
              background: C.bg, borderRadius: 12,
              width: '80%', maxWidth: 900, maxHeight: '85vh',
              display: 'flex', flexDirection: 'column',
              border: `1px solid ${C.border}`,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              padding: '14px 20px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>
                  {preview.isTranscript
                    ? `${preview.transcriptMeta?.title || 'Earnings Call Transcript'} — ${formatDate(preview.date)}`
                    : `${preview.form} — ${formatDate(preview.date)}`
                  }
                </span>
                <span style={{ color: C.textMuted, fontSize: 12, marginLeft: 12 }}>
                  {formatCharCount(preview.charCount)}
                  {preview.fromCache && ' (from cache)'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {preview.filing && (
                  <button
                    onClick={() => preview.isTranscript
                      ? handleRefetchTranscript(preview.filing)
                      : handleReconvert(preview.filing)
                    }
                    style={{
                      background: 'none', border: `1px solid ${C.border}`,
                      borderRadius: 4, color: C.textSecondary, fontSize: 11,
                      cursor: 'pointer', padding: '4px 10px',
                      fontFamily: 'inherit', transition: 'all .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; }}
                  >
                    {preview.isTranscript ? 'Re-fetch' : 'Reconvert'}
                  </button>
                )}
                <button
                  onClick={() => setPreview(null)}
                  style={{
                    background: 'none', border: 'none', color: C.textSecondary,
                    fontSize: 18, cursor: 'pointer', padding: '4px 8px',
                    fontFamily: 'inherit',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            {/* Modal body */}
            <div style={{
              padding: 20, overflow: 'auto', flex: 1,
            }}>
              <pre style={{
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                fontSize: 12, lineHeight: 1.5,
                color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                margin: 0,
              }}>
                {preview.markdown}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Convert error toast */}
      {convertError && (
        <div style={{
          padding: '8px 14px', marginBottom: 12,
          background: C.redBg, color: C.red,
          borderRadius: 6, fontSize: 12, border: `1px solid ${C.red}20`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>Conversion failed: {convertError.message}</span>
          <button
            onClick={() => setConvertError(null)}
            style={{
              background: 'none', border: 'none', color: C.red,
              cursor: 'pointer', fontSize: 14, padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Transcript error toast */}
      {transcriptError && (
        <div style={{
          padding: '8px 14px', marginBottom: 12,
          background: C.redBg, color: C.red,
          borderRadius: 6, fontSize: 12, border: `1px solid ${C.red}20`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>Transcript fetch failed: {transcriptError.message}</span>
          <button
            onClick={() => setTranscriptError(null)}
            style={{
              background: 'none', border: 'none', color: C.red,
              cursor: 'pointer', fontSize: 14, padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter pills + year dropdown */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {FILTERS.map(f => {
          const count = filterCounts[f.key] || 0;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                color: active ? '#fff' : C.textSecondary,
                background: active ? C.accent : C.badge,
                border: 'none',
                borderRadius: 20,
                cursor: count > 0 || f.key === 'all' ? 'pointer' : 'default',
                opacity: count === 0 && f.key !== 'all' ? 0.5 : 1,
                fontFamily: 'inherit',
                transition: 'all .15s',
              }}
              disabled={count === 0 && f.key !== 'all'}
            >
              {f.label} ({count})
            </button>
          );
        })}

        {availableYears.length > 1 && (
          <>
            <div style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />
            <select
              value={year}
              onChange={e => setYear(e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                color: C.text,
                background: C.bgInput,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                fontFamily: 'inherit',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All Years</option>
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Filings table */}
      {filtered.length === 0 ? (
        <div style={{ color: C.textSecondary, fontSize: 13, padding: '20px 0' }}>
          No filings found{filter !== 'all' ? ' for this category' : ''}.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                  <th style={{
                    textAlign: 'left', padding: '8px 12px', fontWeight: 600,
                    color: C.textSecondary, fontSize: 11, textTransform: 'uppercase',
                    letterSpacing: '0.04em', width: 100,
                  }}>Form</th>
                  <th style={{
                    textAlign: 'left', padding: '8px 12px', fontWeight: 600,
                    color: C.textSecondary, fontSize: 11, textTransform: 'uppercase',
                    letterSpacing: '0.04em', width: 120,
                  }}>Filed</th>
                  <th style={{
                    textAlign: 'left', padding: '8px 12px', fontWeight: 600,
                    color: C.textSecondary, fontSize: 11, textTransform: 'uppercase',
                    letterSpacing: '0.04em', width: 120,
                  }}>Reporting For</th>
                  <th style={{
                    textAlign: 'left', padding: '8px 12px', fontWeight: 600,
                    color: C.textSecondary, fontSize: 11, textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>Description</th>
                  <th style={{
                    textAlign: 'center', padding: '8px 12px', fontWeight: 600,
                    color: C.textSecondary, fontSize: 11, width: 60,
                  }}>MD</th>
                  <th style={{
                    textAlign: 'center', padding: '8px 12px', fontWeight: 600,
                    color: C.textSecondary, fontSize: 11, width: 90,
                  }}></th>
                  <th style={{
                    textAlign: 'center', padding: '8px 12px', fontWeight: 600,
                    color: C.textSecondary, fontSize: 11, width: 36,
                  }}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((f, i) => {
                  const isCached = cachedMap.has(f.accessionNumber);
                  const isConverting = converting.has(f.accessionNumber);
                  const charCount = cachedMap.get(f.accessionNumber);
                  const ext = f.primaryDocument?.split('.').pop()?.toLowerCase();
                  const isXml = ext === 'xml';

                  return (
                    <tr
                      key={`${f.accessionNumber}-${i}`}
                      style={{ borderBottom: `1px solid ${C.borderLight}` }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: formColor(f.form) }}>
                          {f.form}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: C.textSecondary, whiteSpace: 'nowrap' }}>
                        {formatDate(f.filingDate)}
                      </td>
                      <td style={{ padding: '8px 12px', color: C.textSecondary, whiteSpace: 'nowrap' }}>
                        {formatDate(f.reportDate)}
                      </td>
                      <td style={{ padding: '8px 12px', color: C.text }}>
                        {f.description || FORM_DESCRIPTIONS[f.form] || ''}
                        {f.items && (
                          <span
                            style={{ color: C.textMuted, marginLeft: 8, fontSize: 11 }}
                            title={describeItems(f.items)}
                          >
                            Items: {f.items}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {isConverting ? (
                          <span style={{ color: C.textMuted, fontSize: 11 }}>...</span>
                        ) : isCached ? (
                          <button
                            onClick={() => handleViewCached(f)}
                            title={`View markdown (${formatCharCount(charCount)})`}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '2px 6px', borderRadius: 4,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <span style={{
                              display: 'inline-block', width: 7, height: 7,
                              borderRadius: '50%', background: C.green,
                            }} />
                            <span style={{ color: C.textMuted, fontSize: 10 }}>
                              {formatCharCount(charCount)}
                            </span>
                          </button>
                        ) : isXml ? (
                          <span style={{ color: C.textMuted, fontSize: 10 }}>XML</span>
                        ) : (
                          <button
                            onClick={() => handleConvert(f)}
                            title="Convert to markdown"
                            style={{
                              background: 'none', border: `1px solid ${C.border}`,
                              borderRadius: 4, cursor: 'pointer', padding: '2px 8px',
                              color: C.textSecondary, fontSize: 10,
                              fontFamily: 'inherit',
                              transition: 'all .15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; }}
                          >
                            MD
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {isEarningsFiling(f.form) ? (
                          transcriptFetching.has(f.accessionNumber) ? (
                            <span style={{ color: C.textMuted, fontSize: 11 }}>...</span>
                          ) : transcriptCached.has(f.accessionNumber) ? (
                            <button
                              onClick={() => handleTranscript(f)}
                              title={`View transcript (${formatCharCount(transcriptCached.get(f.accessionNumber).charCount)})`}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '2px 6px', borderRadius: 4,
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <span style={{
                                display: 'inline-block', width: 7, height: 7,
                                borderRadius: '50%', background: C.green,
                              }} />
                              <span style={{ color: C.textMuted, fontSize: 10 }}>
                                {formatCharCount(transcriptCached.get(f.accessionNumber).charCount)}
                              </span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleTranscript(f)}
                              title="Fetch earnings call transcript"
                              style={{
                                background: 'none', border: `1px solid ${C.border}`,
                                borderRadius: 4, cursor: 'pointer', padding: '2px 8px',
                                color: C.textSecondary, fontSize: 10,
                                fontFamily: 'inherit',
                                transition: 'all .15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; }}
                            >
                              Transcript
                            </button>
                          )
                        ) : null}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <a
                          href={filingUrl(f.cik, f.accessionNumber, f.primaryDocument)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: C.accent,
                            textDecoration: 'none',
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                          title="Open on SEC EDGAR"
                        >
                          ↗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer: count + show more */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', padding: '12px 0',
          }}>
            <span style={{ color: C.textMuted, fontSize: 12 }}>
              Showing {visible.length} of {filtered.length} filings
            </span>
            {showCount < filtered.length && (
              <button
                onClick={() => setShowCount(c => c + PAGE_SIZE)}
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  color: C.accent,
                  background: 'transparent',
                  border: `1px solid ${C.accent}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Show More
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
