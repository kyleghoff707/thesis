// SEC Form 4 XML parser — extracts insider transactions from Form 4 filings.
// Used by both the client-side insider engine and the Worker cron job.
//
// DOMParser: in browsers this is the native DOMParser.
// In Workers/Node: use @xmldom/xmldom's DOMParser.
// Caller must provide the DOMParser implementation.

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

function getTagText(parent, tagName) {
  const NS = '*';
  const el = parent.getElementsByTagNameNS(NS, tagName)[0];
  if (!el) return null;
  const valueEl = el.getElementsByTagNameNS(NS, 'value')[0];
  return (valueEl?.textContent || el.textContent || '').trim() || null;
}

function getDirectText(parent, tagName) {
  const NS = '*';
  const el = parent.getElementsByTagNameNS(NS, tagName)[0];
  return el?.textContent?.trim() || null;
}

function extractFootnotes(doc) {
  const map = new Map();
  const footnoteEls = Array.from(doc.getElementsByTagNameNS('*', 'footnote'));
  for (const fn of footnoteEls) {
    const id = fn.getAttribute('id');
    if (id) map.set(id, fn.textContent?.trim() || '');
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
    const match = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(price) && price > 0) return price;
    }
  }
  return null;
}

function formatName(name) {
  if (!name) return 'Unknown';
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
      if (w.length <= 3 && w === w.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function parseTransaction(txnEl, ownerInfo, filingMeta, isDerivative, footnotes) {
  const date = getTagText(txnEl, 'transactionDate');
  if (!date) return null;

  const codingEl = txnEl.getElementsByTagNameNS('*', 'transactionCoding')[0];
  const code = getDirectText(codingEl, 'transactionCode') || '';
  const codeInfo = TRANSACTION_CODES[code] || { label: code || 'Unknown', isOpenMarket: false };

  const shares = parseFloat(getTagText(txnEl, 'transactionShares')) || 0;
  const acquiredDisposed = getTagText(txnEl, 'transactionAcquiredDisposedCode');

  const priceText = getTagText(txnEl, 'transactionPricePerShare');
  const priceNum = priceText !== null ? parseFloat(priceText) : NaN;
  let price = isNaN(priceNum) ? null : priceNum;
  let priceSource = price !== null ? 'direct' : null;

  const signedShares = acquiredDisposed === 'D' ? -Math.abs(shares) : Math.abs(shares);

  const sharesOwnedAfter = parseFloat(getTagText(txnEl, 'sharesOwnedFollowingTransaction')) || 0;
  const ownershipType = getTagText(txnEl, 'directOrIndirectOwnership') || 'D';

  let exercisePrice = null;
  let underlyingSecurity = null;
  let underlyingShares = null;
  if (isDerivative) {
    exercisePrice = parseFloat(getTagText(txnEl, 'conversionOrExercisePrice')) || null;
    underlyingSecurity = getTagText(txnEl, 'underlyingSecurityTitle');
    underlyingShares = parseFloat(getTagText(txnEl, 'underlyingSecurityShares')) || null;
  }

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

  if (price === null && isDerivative && exercisePrice != null) {
    price = exercisePrice;
    priceSource = 'exercisePrice';
  }

  const totalValue = price !== null ? signedShares * price : null;

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

export function parseForm4Xml(xmlText, filingMeta, DOMParserImpl) {
  const Parser = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!Parser) throw new Error('No DOMParser available');

  const parser = new Parser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const NS = '*';

  const parseError = doc.querySelector?.('parsererror');
  if (parseError) return [];

  const footnotes = extractFootnotes(doc);

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

    const nonDerivTxns = Array.from(doc.getElementsByTagNameNS(NS, 'nonDerivativeTransaction'));
    for (const txn of nonDerivTxns) {
      const parsed = parseTransaction(txn, ownerInfo, filingMeta, false, footnotes);
      if (parsed) transactions.push(parsed);
    }

    const derivTxns = Array.from(doc.getElementsByTagNameNS(NS, 'derivativeTransaction'));
    for (const txn of derivTxns) {
      const parsed = parseTransaction(txn, ownerInfo, filingMeta, true, footnotes);
      if (parsed) transactions.push(parsed);
    }
  }

  return transactions;
}

// Deduplicate Form 4/A amendments — amendments replace originals
// Group by: ownerCik + transactionDate + transactionCode + abs(shares)
export function deduplicateAmendments(transactions) {
  const groups = new Map();
  for (const txn of transactions) {
    const key = `${txn.ownerCik}|${txn.transactionDate}|${txn.transactionCode}|${Math.abs(txn.shares)}`;
    const existing = groups.get(key);
    if (!existing || txn.filingDate > existing.filingDate) {
      groups.set(key, txn);
    }
  }
  return Array.from(groups.values());
}

export { TRANSACTION_CODES };
