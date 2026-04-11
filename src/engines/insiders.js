// Insider Trading Engine — fetches and parses SEC Form 4 filings
// Form 4s are filed within 2 business days of any insider transaction.
// Free, no API key needed. Same EDGAR infrastructure as guru 13F engine.

import { cacheGetAsync, cacheSet } from './cache';
import { fetchFilings, lookupCIK } from './edgar';
import { secBase, dataUrl } from './apiBase';

// ─── SEC URL helpers ────────────────────────────────────────

function secArchiveUrl(cik, accessionPath, suffix) {
  const cleanCik = String(cik).replace(/^0+/, '');
  return `${secBase()}/Archives/edgar/data/${cleanCik}/${accessionPath}/${suffix}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Constants ──────────────────────────────────────────────

const INSIDER_CACHE_V = 'v4';
const FETCH_DELAY_MS = 120;

const TRANSACTION_CODES = {
  P: { label: 'Purchase', isOpenMarket: true },
  S: { label: 'Sale', isOpenMarket: true },
  A: { label: 'Award', isOpenMarket: false },
  M: { label: 'Exercise', isOpenMarket: false },
  F: { label: 'Tax Withholding', isOpenMarket: false },
  G: { label: 'Gift', isOpenMarket: false },
  D: { label: 'Disposition', isOpenMarket: false },
  C: { label: 'Conversion', isOpenMarket: false },
  W: { label: 'Will/Descent', isOpenMarket: false },
  E: { label: 'Expiration', isOpenMarket: false },
  H: { label: 'Expiration (Long)', isOpenMarket: false },
  I: { label: 'Discretionary', isOpenMarket: false },
  J: { label: 'Other', isOpenMarket: false },
  K: { label: 'Equity Swap', isOpenMarket: false },
  U: { label: 'Tender', isOpenMarket: false },
};

// ─── Form 4 XML Parsing ─────────────────────────────────────

function getTagText(parent, tagName) {
  const NS = '*';
  const el = parent.getElementsByTagNameNS(NS, tagName)[0];
  if (!el) return null;
  // Form 4 uses <value> sub-elements for many fields
  const valueEl = el.getElementsByTagNameNS(NS, 'value')[0];
  return (valueEl?.textContent || el.textContent || '').trim() || null;
}

function getDirectText(parent, tagName) {
  const NS = '*';
  const el = parent.getElementsByTagNameNS(NS, tagName)[0];
  return el?.textContent?.trim() || null;
}

// ─── Footnote Extraction (for exercise/award price fallback) ─────

function extractFootnotes(doc) {
  const map = new Map();
  const footnoteEls = Array.from(doc.getElementsByTagNameNS('*', 'footnote'));
  for (const fn of footnoteEls) {
    const id = fn.getAttribute('id');
    if (id) {
      map.set(id, fn.textContent?.trim() || '');
    }
  }
  return map;
}

function extractPriceFromFootnote(priceEl, footnotes) {
  if (!priceEl || !footnotes || footnotes.size === 0) return null;
  const refs = Array.from(priceEl.getElementsByTagNameNS('*', 'footnoteId'));
  for (const ref of refs) {
    const id = ref.getAttribute('id');
    const text = footnotes.get(id);
    if (!text) continue;
    // Extract dollar amount from footnote text
    const match = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(price) && price > 0) return price;
    }
  }
  return null;
}

export function parseForm4Xml(xmlText, filingMeta) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const NS = '*';

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) return [];

  // Extract footnotes for price fallback on exercises/awards
  const footnotes = extractFootnotes(doc);

  // Extract reporting owner info
  const ownerEls = Array.from(doc.getElementsByTagNameNS(NS, 'reportingOwner'));
  if (ownerEls.length === 0) return [];

  const transactions = [];

  for (const ownerEl of ownerEls) {
    const ownerName = getDirectText(ownerEl, 'rptOwnerName') || 'Unknown';
    const ownerCik = getDirectText(ownerEl, 'rptOwnerCik') || '';
    const relEl = ownerEl.getElementsByTagNameNS(NS, 'reportingOwnerRelationship')[0];
    const isOfficer = getDirectText(relEl, 'isOfficer') === '1' || getDirectText(relEl, 'isOfficer') === 'true';
    const isDirector = getDirectText(relEl, 'isDirector') === '1' || getDirectText(relEl, 'isDirector') === 'true';
    const isTenPercentOwner = getDirectText(relEl, 'isTenPercentOwner') === '1' || getDirectText(relEl, 'isTenPercentOwner') === 'true';
    const officerTitle = getDirectText(relEl, 'officerTitle') || '';

    const ownerInfo = {
      ownerName: formatName(ownerName),
      ownerCik,
      isOfficer,
      isDirector,
      isTenPercentOwner,
      officerTitle: titleCase(officerTitle),
    };

    // Parse non-derivative transactions (direct stock buys/sells)
    const nonDerivTxns = Array.from(doc.getElementsByTagNameNS(NS, 'nonDerivativeTransaction'));
    for (const txn of nonDerivTxns) {
      const parsed = parseTransaction(txn, ownerInfo, filingMeta, false, footnotes);
      if (parsed) transactions.push(parsed);
    }

    // Parse derivative transactions (option exercises, etc.)
    const derivTxns = Array.from(doc.getElementsByTagNameNS(NS, 'derivativeTransaction'));
    for (const txn of derivTxns) {
      const parsed = parseTransaction(txn, ownerInfo, filingMeta, true, footnotes);
      if (parsed) transactions.push(parsed);
    }
  }

  return transactions;
}

function parseTransaction(txnEl, ownerInfo, filingMeta, isDerivative, footnotes) {
  const date = getTagText(txnEl, 'transactionDate');
  if (!date) return null;

  // Transaction coding
  const codingEl = txnEl.getElementsByTagNameNS('*', 'transactionCoding')[0];
  const code = getDirectText(codingEl, 'transactionCode') || '';
  const codeInfo = TRANSACTION_CODES[code] || { label: code || 'Unknown', isOpenMarket: false };

  // Transaction amounts
  const shares = parseFloat(getTagText(txnEl, 'transactionShares')) || 0;
  const acquiredDisposed = getTagText(txnEl, 'transactionAcquiredDisposedCode');

  // Price: preserve null (footnote-only / missing) vs 0 (genuine $0 like awards)
  const priceText = getTagText(txnEl, 'transactionPricePerShare');
  const priceNum = priceText !== null ? parseFloat(priceText) : NaN;
  let price = isNaN(priceNum) ? null : priceNum;
  let priceSource = price !== null ? 'direct' : null;

  // Sign: D = disposed (negative), A = acquired (positive)
  const signedShares = acquiredDisposed === 'D' ? -Math.abs(shares) : Math.abs(shares);

  // Post-transaction holdings
  const sharesOwnedAfter = parseFloat(getTagText(txnEl, 'sharesOwnedFollowingTransaction')) || 0;
  const ownershipType = getTagText(txnEl, 'directOrIndirectOwnership') || 'D';

  // For derivatives, get underlying security info
  let exercisePrice = null;
  let underlyingSecurity = null;
  let underlyingShares = null;
  if (isDerivative) {
    exercisePrice = parseFloat(getTagText(txnEl, 'conversionOrExercisePrice')) || null;
    underlyingSecurity = getTagText(txnEl, 'underlyingSecurityTitle');
    underlyingShares = parseFloat(getTagText(txnEl, 'underlyingSecurityShares')) || null;
  }

  // Fallback 1: Try extracting price from filing footnotes
  if (price === null) {
    const priceEl = txnEl.getElementsByTagNameNS('*', 'transactionPricePerShare')[0];
    if (priceEl && footnotes) {
      const footnotePrice = extractPriceFromFootnote(priceEl, footnotes);
      if (footnotePrice !== null) {
        price = footnotePrice;
        priceSource = 'footnote';
      }
    }
  }

  // Fallback 2: For derivative exercises, use the conversion/exercise price
  if (price === null && isDerivative && exercisePrice != null) {
    price = exercisePrice;
    priceSource = 'exercisePrice';
  }

  const totalValue = price !== null ? signedShares * price : null;

  // Compute % change in ownership
  const prevShares = sharesOwnedAfter - signedShares;
  const pctChange = prevShares !== 0 ? (signedShares / prevShares) * 100 : signedShares > 0 ? 100 : 0;

  return {
    ...ownerInfo,
    transactionDate: date,
    filingDate: filingMeta.filingDate,
    accessionNumber: filingMeta.accessionNumber,
    transactionCode: code,
    transactionLabel: codeInfo.label,
    isOpenMarket: codeInfo.isOpenMarket,
    isDerivative,
    shares: signedShares,
    pricePerShare: price,
    priceSource,
    totalValue,
    sharesOwnedAfter,
    ownershipType,
    pctChange: Math.round(pctChange * 100) / 100,
    exercisePrice,
    underlyingSecurity,
    underlyingShares,
  };
}

// ─── Name Formatting ─────────────────────────────────────────

function formatName(name) {
  if (!name) return 'Unknown';
  // SEC names are often "LAST FIRST MIDDLE" in all caps
  return name
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function titleCase(str) {
  if (!str) return '';
  return str
    .split(/\s+/)
    .map(w => {
      if (w.length <= 3 && w === w.toUpperCase()) return w; // Keep acronyms like CEO, CFO, SVP
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

// ─── Fetch Single Form 4 ────────────────────────────────────

// Form 4 filings are stored under the FILER's CIK (the insider), not the company's CIK.
// The accession number encodes the filer CIK: "0001214156-25-000055" → filer CIK "0001214156".
function filerCikFromAccession(accessionNumber) {
  const parts = accessionNumber.split('-');
  if (parts.length >= 1) return parts[0];
  return null;
}

async function findForm4Xml(filerCik, accessionNumber, primaryDocument) {
  const accPath = accessionNumber.replace(/-/g, '');

  // primaryDocument often has an XSLT prefix like "xslF345X05/wk-form4_1772148856.xml"
  // Strip the prefix to get the actual filename
  if (primaryDocument) {
    const basename = primaryDocument.includes('/') ? primaryDocument.split('/').pop() : primaryDocument;
    if (basename.endsWith('.xml')) {
      return secArchiveUrl(filerCik, accPath, basename);
    }
  }

  // Fallback: try index.json to find the XML file (index.json is on www.sec.gov)
  const indexUrl = secArchiveUrl(filerCik, accPath, 'index.json');
  try {
    const res = await fetch(indexUrl);
    if (res.ok) {
      const data = await res.json();
      const items = data?.directory?.item || [];
      const xmlFile = items.find(i =>
        /^(wk-form4|form4|doc4|primary_doc).*\.xml$/i.test(i.name)
      ) || items.find(i => i.name.endsWith('.xml') && !i.name.includes('-index'));
      if (xmlFile) return secArchiveUrl(filerCik, accPath, xmlFile.name);
    }
  } catch { /* fall through */ }

  return null;
}

async function fetchSingleForm4(filing) {
  const cacheKey = `insider-form4:${INSIDER_CACHE_V}:${filing.accessionNumber}`;
  const cached = await cacheGetAsync(cacheKey);
  if (cached) return cached;

  // Extract filer CIK from accession number (Form 4 archives are under the insider's CIK)
  const filerCik = filerCikFromAccession(filing.accessionNumber);
  if (!filerCik) return [];

  const xmlUrl = await findForm4Xml(filerCik, filing.accessionNumber, filing.primaryDocument);
  if (!xmlUrl) return [];

  const res = await fetch(xmlUrl);
  if (!res.ok) return [];

  const xmlText = await res.text();
  const transactions = parseForm4Xml(xmlText, filing);
  // Only cache non-empty results to avoid persisting bad fetches
  if (transactions.length > 0) {
    cacheSet(cacheKey, transactions, 'filings');
  }
  return transactions;
}

// ─── Batch Fetch ─────────────────────────────────────────────

async function fetchForm4Batch(filings, onProgress) {
  const all = [];
  for (let i = 0; i < filings.length; i++) {
    const txns = await fetchSingleForm4(filings[i]);
    all.push(...txns);
    if (onProgress) onProgress(i + 1, filings.length);
    if (i < filings.length - 1) await sleep(FETCH_DELAY_MS);
  }
  return all;
}

// ─── Get Form 4 Filings from Submissions ─────────────────────

function getForm4Filings(allFilings, yearsBack = 3) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - yearsBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return allFilings
    .filter(f => (f.form === '4' || f.form === '4/A') && f.filingDate >= cutoffStr)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

// ─── Deduplication (4/A amendments replace originals) ─────────

function deduplicateAmendments(transactions) {
  // Group by owner + transaction date + shares to find amendment replacements
  // 4/A filings have later filingDate for the same transactionDate + owner
  const seen = new Map();
  const result = [];

  // Sort by filingDate desc so we see amendments first
  const sorted = [...transactions].sort((a, b) =>
    b.filingDate.localeCompare(a.filingDate) || b.transactionDate.localeCompare(a.transactionDate)
  );

  for (const txn of sorted) {
    const key = `${txn.ownerCik}:${txn.transactionDate}:${txn.transactionCode}:${Math.abs(txn.shares)}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(txn);
    }
  }

  // Re-sort by transaction date desc
  return result.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
}

// ─── Aggregation ─────────────────────────────────────────────

export function aggregateMonthly(transactions) {
  const months = {};

  for (const txn of transactions) {
    const month = txn.transactionDate.slice(0, 7); // YYYY-MM
    if (!months[month]) {
      months[month] = {
        month,
        purchases: 0,
        sales: 0,
        purchaseValue: 0,
        saleValue: 0,
        netShares: 0,
        transactionCount: 0,
      };
    }
    const m = months[month];
    m.transactionCount++;

    if (txn.shares > 0) {
      m.purchases += txn.shares;
      m.purchaseValue += txn.totalValue;
    } else {
      m.sales += Math.abs(txn.shares);
      m.saleValue += Math.abs(txn.totalValue);
    }
    m.netShares += txn.shares;
  }

  return Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Summary Stats ───────────────────────────────────────────

export function computeInsiderSummary(transactions) {
  const now = new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setFullYear(now.getFullYear() - 1);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(now.getDate() - 90);

  const cutoff12M = twelveMonthsAgo.toISOString().slice(0, 10);
  const cutoff90D = ninetyDaysAgo.toISOString().slice(0, 10);

  const last12M = transactions.filter(t => t.transactionDate >= cutoff12M);
  const last90D = transactions.filter(t => t.transactionDate >= cutoff90D);

  const netShares12M = last12M.reduce((sum, t) => sum + t.shares, 0);
  const netValue12M = last12M.reduce((sum, t) => sum + t.totalValue, 0);

  const buyers12M = new Set(last12M.filter(t => t.shares > 0).map(t => t.ownerCik));
  const sellers12M = new Set(last12M.filter(t => t.shares < 0).map(t => t.ownerCik));

  // Open market only (strongest signal)
  const openMarket12M = last12M.filter(t => t.isOpenMarket);
  const openMarketBuyers12M = new Set(openMarket12M.filter(t => t.shares > 0).map(t => t.ownerCik));
  const openMarketSellers12M = new Set(openMarket12M.filter(t => t.shares < 0).map(t => t.ownerCik));

  const openMarket90D = last90D.filter(t => t.isOpenMarket);
  const openMarketBuyers90D = new Set(openMarket90D.filter(t => t.shares > 0).map(t => t.ownerCik));

  // Last purchase/sale dates
  const purchases = transactions.filter(t => t.shares > 0 && t.isOpenMarket);
  const sales = transactions.filter(t => t.shares < 0 && t.isOpenMarket);
  const lastPurchaseDate = purchases.length > 0 ? purchases[0].transactionDate : null;
  const lastSaleDate = sales.length > 0 ? sales[0].transactionDate : null;

  const uniqueInsiders = new Set(transactions.map(t => t.ownerCik));

  return {
    netShares12M,
    netValue12M,
    totalBuyers12M: buyers12M.size,
    totalSellers12M: sellers12M.size,
    openMarketBuyers12M: openMarketBuyers12M.size,
    openMarketSellers12M: openMarketSellers12M.size,
    openMarketBuyers90D: openMarketBuyers90D.size,
    lastPurchaseDate,
    lastSaleDate,
    uniqueInsiders: uniqueInsiders.size,
  };
}

// ─── Cluster Detection ───────────────────────────────────────

export function detectClusters(transactions, windowDays = 5) {
  // Find windows where 3+ different insiders make open market purchases
  const openMarketBuys = transactions
    .filter(t => t.isOpenMarket && t.shares > 0)
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

  const clusterDates = new Set();

  for (let i = 0; i < openMarketBuys.length; i++) {
    const windowStart = new Date(openMarketBuys[i].transactionDate);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + windowDays);
    const windowEndStr = windowEnd.toISOString().slice(0, 10);

    const insidersInWindow = new Set();
    for (let j = i; j < openMarketBuys.length; j++) {
      if (openMarketBuys[j].transactionDate > windowEndStr) break;
      insidersInWindow.add(openMarketBuys[j].ownerCik);
    }

    if (insidersInWindow.size >= 3) {
      // Mark all transactions in this window as cluster
      for (let j = i; j < openMarketBuys.length; j++) {
        if (openMarketBuys[j].transactionDate > windowEndStr) break;
        clusterDates.add(openMarketBuys[j].transactionDate);
      }
    }
  }

  return clusterDates;
}

// ─── Main Entry Point ────────────────────────────────────────

// Map D1 snake_case row to frontend camelCase transaction shape
function mapD1Trade(row) {
  const code = row.transaction_code || '';
  const codeInfo = TRANSACTION_CODES[code] || { label: code, isOpenMarket: false };
  const shares = row.shares || 0;
  const sharesAfter = row.shares_owned_after || 0;
  // Compute pctChange: how much did their position change?
  const sharesBefore = sharesAfter - shares;
  const pctChange = sharesBefore > 0 ? (shares / sharesBefore) * 100 : (shares > 0 ? 100 : 0);
  return {
    ownerName: row.owner_name,
    ownerCik: row.owner_cik,
    isOfficer: !!row.is_officer,
    isDirector: !!row.is_director,
    officerTitle: row.officer_title || '',
    transactionDate: row.transaction_date,
    filingDate: row.filing_date,
    accessionNumber: row.accession_number,
    transactionCode: code,
    transactionLabel: codeInfo.label,
    isOpenMarket: !!row.is_open_market,
    isDerivative: !!row.is_derivative,
    shares,
    pricePerShare: row.price_per_share,
    totalValue: row.total_value,
    sharesOwnedAfter: sharesAfter,
    ownershipType: 'D',
    pctChange,
    isCluster: false,
  };
}

export async function fetchInsiderTransactions(ticker, options = {}) {
  const { yearsBack = 1, onProgress } = options;

  // Try D1 first (single API call vs 20-50 SEC EDGAR XML fetches)
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(dataUrl(`/insiders/${ticker.toUpperCase()}?years=${yearsBack}`));
      if (res.ok) {
        const data = await res.json();
        if (data.trades && data.trades.length > 0) {
          const transactions = data.trades.map(mapD1Trade);
          const monthlyAggregates = aggregateMonthly(transactions);
          const summary = computeInsiderSummary(transactions);
          const clusterDates = detectClusters(transactions);
          for (const txn of transactions) {
            txn.isCluster = clusterDates.has(txn.transactionDate);
          }
          // Signal that more history may be available if loading 1yr
          const allForm4Filings = yearsBack <= 1
            ? [...transactions, { stub: true }]
            : transactions;
          return { transactions, monthlyAggregates, summary, allForm4Filings };
        }
      }
    } catch { /* fall through to SEC EDGAR */ }
  }

  const cik = await lookupCIK(ticker);
  if (!cik) return { transactions: [], monthlyAggregates: [], summary: null, allForm4Filings: [] };

  // Get all filings (cached by fetchFilings)
  const allFilings = await fetchFilings(ticker);
  const form4Filings = getForm4Filings(allFilings, yearsBack);

  if (form4Filings.length === 0) {
    return { transactions: [], monthlyAggregates: [], summary: null, allForm4Filings: getForm4Filings(allFilings, 10) };
  }

  // Batch fetch and parse Form 4 XMLs (each filing uses filer CIK from accession number)
  const rawTransactions = await fetchForm4Batch(form4Filings, onProgress);

  // Deduplicate amendments
  const transactions = deduplicateAmendments(rawTransactions);

  // Aggregate and compute summary
  const monthlyAggregates = aggregateMonthly(transactions);
  const summary = computeInsiderSummary(transactions);
  const clusterDates = detectClusters(transactions);

  // Tag transactions with cluster membership
  for (const txn of transactions) {
    txn.isCluster = clusterDates.has(txn.transactionDate);
  }

  // Count all Form 4 filings (up to 10 years) to know if there's more to load
  const allForm4Filings = getForm4Filings(allFilings, 10);

  return { transactions, monthlyAggregates, summary, allForm4Filings };
}
