// 13F InfoTable XML parser — extracts holdings from SEC 13F-HR filings.
// Used by both the client-side guru engine and the Worker cron job.
//
// DOMParser: in browsers this is the native DOMParser.
// In Workers/Node: use @xmldom/xmldom's DOMParser.
// Caller must provide the DOMParser implementation.

export function parseInfoTable(xmlText, DOMParserImpl) {
  const Parser = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!Parser) throw new Error('No DOMParser available');

  const parser = new Parser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const NS = '*';
  const entries = Array.from(doc.getElementsByTagNameNS(NS, 'infoTable'));
  const holdings = [];

  for (const entry of entries) {
    const getText = (tag) => {
      const el = entry.getElementsByTagNameNS(NS, tag)[0];
      return el?.textContent?.trim() || null;
    };

    const issuer = getText('nameOfIssuer');
    const shares = parseInt(getText('sshPrnamt')) || 0;
    const rawValue = parseFloat(getText('value')) || 0;

    if (!issuer || issuer === 'No Securities' || (shares === 0 && rawValue === 0)) continue;
    if (getText('putCall')) continue;

    holdings.push({
      issuer,
      titleOfClass: getText('titleOfClass'),
      cusip: getText('cusip'),
      value: rawValue,
      shares,
      shareType: getText('sshPrnamtType'),
      putCall: getText('putCall'),
      discretion: getText('investmentDiscretion'),
      votingSole: parseInt(getText('Sole')) || 0,
      votingShared: parseInt(getText('Shared')) || 0,
      votingNone: parseInt(getText('None')) || 0,
    });
  }

  // Normalize value convention: thousands vs actual dollars
  if (holdings.length > 0) {
    const impliedPrices = holdings
      .filter(h => h.shares > 0)
      .map(h => h.value / h.shares)
      .sort((a, b) => a - b);
    if (impliedPrices.length > 0) {
      const median = impliedPrices[Math.floor(impliedPrices.length / 2)];
      if (median < 1) {
        for (const h of holdings) h.value *= 1000;
      }
    }
  }

  return holdings;
}

// Aggregate holdings with same issuer (first 6 CUSIP chars = issuer ID)
export function aggregateShareClasses(holdings) {
  const byIssuer = new Map();
  const noCusip = [];

  for (const h of holdings) {
    const prefix = (h.cusip || '').slice(0, 6);
    if (!prefix) { noCusip.push(h); continue; }
    if (!byIssuer.has(prefix)) byIssuer.set(prefix, []);
    byIssuer.get(prefix).push(h);
  }

  const merged = [];
  for (const [prefix, group] of byIssuer) {
    if (group.length === 1) {
      merged.push({ ...group[0], cusip6: prefix });
      continue;
    }
    group.sort((a, b) => b.value - a.value);
    const primary = group[0];
    merged.push({
      issuer: primary.issuer,
      titleOfClass: group.map(g => g.titleOfClass).filter(Boolean).join(', '),
      cusip: primary.cusip,
      cusip6: prefix,
      value: group.reduce((s, g) => s + g.value, 0),
      shares: group.reduce((s, g) => s + g.shares, 0),
      shareType: primary.shareType,
      putCall: null,
      discretion: primary.discretion,
      votingSole: group.reduce((s, g) => s + g.votingSole, 0),
      votingShared: group.reduce((s, g) => s + g.votingShared, 0),
      votingNone: group.reduce((s, g) => s + g.votingNone, 0),
      mergedClasses: true,
      classCount: group.length,
    });
  }

  return [...merged, ...noCusip];
}

// Enrich raw holdings with portfolioPct and sort by value
export function enrichHoldings(holdings) {
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  return {
    holdings: holdings
      .map(h => ({ ...h, portfolioPct: totalValue > 0 ? (h.value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value),
    totalValue,
  };
}

// Compare current vs previous holdings by CUSIP for QoQ changes
export function computeChanges(currentHoldings, previousHoldings) {
  const prevByCusip = new Map();
  for (const h of previousHoldings) {
    prevByCusip.set(h.cusip, h);
  }

  const enriched = [];
  const seenCusips = new Set();

  for (const h of currentHoldings) {
    seenCusips.add(h.cusip);
    const prev = prevByCusip.get(h.cusip);

    if (!prev) {
      enriched.push({
        ...h, action: 'new',
        sharesChange: h.shares, pctChange: 100,
        previousShares: 0, previousValue: 0,
        portfolioPctChange: h.portfolioPct,
      });
    } else if (h.shares > prev.shares) {
      enriched.push({
        ...h, action: 'added',
        sharesChange: h.shares - prev.shares,
        pctChange: prev.shares > 0 ? ((h.shares - prev.shares) / prev.shares) * 100 : 100,
        previousShares: prev.shares, previousValue: prev.value,
        portfolioPctChange: h.portfolioPct - (prev.portfolioPct || 0),
      });
    } else if (h.shares < prev.shares) {
      enriched.push({
        ...h, action: 'reduced',
        sharesChange: h.shares - prev.shares,
        pctChange: prev.shares > 0 ? ((h.shares - prev.shares) / prev.shares) * 100 : 0,
        previousShares: prev.shares, previousValue: prev.value,
        portfolioPctChange: h.portfolioPct - (prev.portfolioPct || 0),
      });
    } else {
      enriched.push({
        ...h, action: 'held',
        sharesChange: 0, pctChange: 0,
        previousShares: prev.shares, previousValue: prev.value,
        portfolioPctChange: h.portfolioPct - (prev.portfolioPct || 0),
      });
    }
  }

  for (const [cusip, prev] of prevByCusip) {
    if (!seenCusips.has(cusip)) {
      enriched.push({
        issuer: prev.issuer, titleOfClass: prev.titleOfClass, cusip: prev.cusip,
        value: 0, shares: 0, shareType: prev.shareType, portfolioPct: 0,
        action: 'sold', sharesChange: -prev.shares, pctChange: -100,
        previousShares: prev.shares, previousValue: prev.value,
        portfolioPctChange: -(prev.portfolioPct || 0),
      });
    }
  }

  return enriched;
}
