#!/usr/bin/env node
// CLI: node --loader ./scripts/node-esm-loader.js scripts/prefetch-gurus.js TICKER
// Fetches all 43 guru 13F portfolios, finds which ones hold the given ticker.
// Caching happens in the gurus engine layer; this script just kicks the prefetch.
//
// Output: JSON to stdout with { portfolioCount, holdingGurus: [...] }
// Also re-runs assemble-data.js to pick up cached guru data in the DataPacket.

import '../src/engines/nodeAdapter.js';
import { fetchAllGuruHoldings, findGurusOwning, resolveTickersForHoldings } from '../src/engines/gurus.js';

const ticker = process.argv[2]?.toUpperCase();

if (!ticker) {
  console.error('Usage: node scripts/prefetch-gurus.js <TICKER>');
  process.exit(1);
}

async function main() {
  console.log(`Fetching guru portfolios (43 gurus, ~2-3 min first time, cached after)...`);

  const portfolios = await fetchAllGuruHoldings((done, total, name) => {
    if (done % 5 === 0 || done === total) {
      console.log(`  ${done}/${total} gurus fetched (${name})`);
    }
  });

  const validPortfolios = portfolios.filter(p => p.holdings && p.holdings.length > 0);
  console.log(`Guru pre-fetch complete: ${validPortfolios.length}/${portfolios.length} portfolios with holdings`);

  // Resolve CUSIP -> ticker for each portfolio (per D-07)
  console.log('Resolving CUSIP identifiers to ticker symbols...');
  let resolvedCount = 0;
  for (const p of validPortfolios) {
    if (p.holdings && p.holdings.some(h => !h.ticker && h.cusip)) {
      p.holdings = await resolveTickersForHoldings(p.holdings);
      resolvedCount++;
    }
  }
  if (resolvedCount > 0) {
    console.log(`  Resolved tickers for ${resolvedCount} portfolios`);
  }

  // Find which gurus hold this ticker
  const holdings = findGurusOwning(portfolios, ticker);
  console.log(`${holdings.length} guru(s) hold ${ticker}:`);
  for (const h of holdings) {
    const totalValue = h.positions.reduce((sum, p) => sum + (p.value || 0), 0);
    console.log(`  - ${h.guru.name}: $${(totalValue / 1e6).toFixed(1)}M`);
  }

  // Output summary as JSON for pipeline consumption
  const summary = {
    portfolioCount: validPortfolios.length,
    totalGurus: portfolios.length,
    holdingGurus: holdings.map(h => ({
      name: h.guru.name,
      cik: h.guru.cik,
      positions: h.positions.length,
      totalValue: h.positions.reduce((sum, p) => sum + (p.value || 0), 0),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(`Guru pre-fetch failed: ${err.message}`);
  // Non-fatal — pipeline continues without guru data
  process.exit(0);
});
