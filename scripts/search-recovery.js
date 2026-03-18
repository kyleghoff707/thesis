#!/usr/bin/env node

/**
 * search-recovery.js — Recover failed Yahoo tickers using yahoo-finance2 search() endpoint
 *
 * The search() endpoint is a different API path than quoteSummary() and has its own
 * rate limit pool. It returns sector/industry/exchange but with slightly different
 * label formatting (shorter names, em-dashes). This script:
 *   1. Fetches all yahoo-error tickers via search()
 *   2. Normalizes labels to match our Yahoo crosswalk
 *   3. Updates yahoo-seed.json + rebuilds assignments
 *
 * Usage: node scripts/search-recovery.js
 *        node scripts/search-recovery.js --dry-run   # Just show label mismatches
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TAXONOMY_DIR = path.join(ROOT, 'knowledge', 'taxonomy-research');
const PIPELINE_DIR = path.join(TAXONOMY_DIR, 'pipeline');

const BATCH_DELAY_MS = 300;
const DRY_RUN = process.argv.includes('--dry-run');

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// Major US exchange codes
const MAJOR_EXCHANGES = new Set(['NMS', 'NGM', 'NCM', 'NYQ', 'ASE', 'PCX', 'BTS']);

// --- Search label → Yahoo crosswalk label normalization ---
// The search() endpoint uses abbreviated industry names. This map converts them
// to the full Yahoo labels used in our crosswalk.
const SEARCH_INDUSTRY_TO_YAHOO = {
  // These will be populated after the dry run identifies mismatches
  'Apparel Retail': 'Apparel Retail',
  'Oil & Gas Integrated': 'Oil & Gas Integrated',
  'Banks—Diversified': 'Banks - Diversified',
  'Banks—Regional': 'Banks - Regional',
  'Insurance—Diversified': 'Insurance - Diversified',
  'Insurance—Life': 'Insurance - Life',
  'Insurance—Property & Casualty': 'Insurance - Property & Casualty',
  'Insurance—Specialty': 'Insurance - Specialty',
  'Insurance—Reinsurance': 'Insurance - Reinsurance',
  'Discount Stores': 'Discount Stores',
  'Home Improvement Retail': 'Home Improvement Retail',
  'Entertainment': 'Entertainment',
};

function normalizeIndustry(searchIndustry) {
  if (!searchIndustry) return null;
  // Check explicit mapping first
  if (SEARCH_INDUSTRY_TO_YAHOO[searchIndustry]) {
    return SEARCH_INDUSTRY_TO_YAHOO[searchIndustry];
  }
  // Auto-normalize: replace em-dashes with " - "
  return searchIndustry.replace(/—/g, ' - ');
}

async function main() {
  const crosswalk = loadJSON(path.join(TAXONOMY_DIR, 'yahoo-to-thes1s-crosswalk.json'));
  const taxonomy = loadJSON(path.join(TAXONOMY_DIR, 'thes1s-taxonomy-tree.json'));

  // Build lookups
  const yahooCrosswalkMap = new Map();
  crosswalk.mappings.forEach(m => {
    yahooCrosswalkMap.set(`${m.yahooSector}|${m.yahooIndustry}`, m);
  });

  const codeToTaxonomy = new Map();
  taxonomy.sectors.forEach(s => {
    s.industryGroups.forEach(g => {
      g.industries.forEach(i => {
        codeToTaxonomy.set(i.code, {
          sector: s.name, industryGroup: g.name, industry: i.name
        });
      });
    });
  });

  // Load yahoo-seed and find error tickers
  const yahooFile = path.join(PIPELINE_DIR, 'yahoo-seed.json');
  const yahooData = loadJSON(yahooFile);
  const results = yahooData.results;

  const errorTickers = Object.entries(results)
    .filter(([, r]) => r.source === 'yahoo-error')
    .map(([cik, r]) => ({ cik, ticker: r.ticker, name: r.name }));

  log(`Found ${errorTickers.length} yahoo-error tickers to recover via search()`);

  let recovered = 0;
  let excluded = 0;
  let noData = 0;
  let failed = 0;
  let unmapped = 0;
  const unmappedLabels = new Map(); // track unique unmapped labels

  for (let i = 0; i < errorTickers.length; i++) {
    const { cik, ticker, name } = errorTickers[i];

    try {
      const searchResult = await yahooFinance.search(ticker);
      const match = searchResult?.quotes?.find(q => q.symbol === ticker && q.quoteType === 'EQUITY');

      if (!match) {
        noData++;
        continue; // leave existing yahoo-error entry
      }

      const exchange = match.exchange || null;
      const exchangeName = match.exchDisp || null;

      // Exchange filter
      if (exchange && !MAJOR_EXCHANGES.has(exchange)) {
        if (!DRY_RUN) {
          results[cik] = {
            ticker, name, exchange, exchangeName, quoteType: 'EQUITY',
            yahooSector: match.sector, yahooIndustry: match.industry,
            thes1sCode: null, confidence: 0, source: 'yahoo-excluded-exchange',
            error: `Non-major exchange: ${exchange} (${exchangeName})`
          };
        }
        excluded++;
        continue;
      }

      if (!match.sector || !match.industry) {
        noData++;
        continue;
      }

      // Normalize the search label to match our crosswalk
      const normalizedIndustry = normalizeIndustry(match.industry);
      const yahooKey = `${match.sector}|${normalizedIndustry}`;
      const mapping = yahooCrosswalkMap.get(yahooKey);

      if (!mapping) {
        unmapped++;
        const label = `${match.sector}|${match.industry}`;
        unmappedLabels.set(label, (unmappedLabels.get(label) || 0) + 1);
        if (!DRY_RUN) {
          results[cik] = {
            ticker, name, exchange, exchangeName, quoteType: 'EQUITY',
            yahooSector: match.sector, yahooIndustry: match.industry,
            thes1sCode: null, confidence: 0, source: 'search-unmapped',
            error: `No crosswalk for normalized: ${yahooKey} (raw: ${match.industry})`
          };
        }
        continue;
      }

      // Classified!
      const taxInfo = codeToTaxonomy.get(mapping.thes1sCode);
      if (!DRY_RUN) {
        results[cik] = {
          ticker, name, exchange, exchangeName, quoteType: 'EQUITY',
          yahooSector: match.sector, yahooIndustry: normalizedIndustry,
          thes1sCode: mapping.thes1sCode,
          sector: taxInfo?.sector || mapping.thes1sSector,
          industryGroup: taxInfo?.industryGroup || '',
          industry: taxInfo?.industry || mapping.thes1sIndustry,
          confidence: mapping.mappingType === 'split' ? 0.65 : 0.85,
          mappingType: mapping.mappingType,
          needsReview: mapping.mappingType === 'split',
          source: 'yahoo-search'
        };
      }
      recovered++;

    } catch (err) {
      failed++;
    }

    // Rate limiting
    if ((i + 1) % 10 === 0) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }

    // Progress
    if ((i + 1) % 50 === 0 || i === errorTickers.length - 1) {
      log(`  Progress: ${i + 1}/${errorTickers.length} — ${recovered} recovered, ${excluded} excluded, ${unmapped} unmapped, ${noData} no data, ${failed} failed`);
    }
  }

  log(`\nSearch recovery complete:`);
  log(`  Recovered: ${recovered}`);
  log(`  Excluded (non-major exchange): ${excluded}`);
  log(`  Unmapped: ${unmapped}`);
  log(`  No data: ${noData}`);
  log(`  Failed: ${failed}`);

  if (unmappedLabels.size > 0) {
    log(`\n--- Unmapped Labels (need crosswalk entries) ---`);
    for (const [label, count] of [...unmappedLabels.entries()].sort((a, b) => b[1] - a[1])) {
      log(`  ${label} (${count} tickers)`);
    }
  }

  if (DRY_RUN) {
    log('\n[DRY RUN — no files modified]');
    return;
  }

  // Save updated yahoo-seed
  const totalClassified = Object.values(results).filter(r => r.thes1sCode).length;
  yahooData.results = results;
  yahooData.classified = totalClassified;
  yahooData.lastSearchRecovery = new Date().toISOString();
  yahooData.completedAt = new Date().toISOString();
  fs.writeFileSync(yahooFile, JSON.stringify(yahooData, null, 2));
  log(`Updated yahoo-seed.json (${totalClassified} total classified)`);

  // Rebuild assignments
  log('\nRebuilding assignments...');
  const universeData = loadJSON(path.join(PIPELINE_DIR, 'universe.json'));

  const assignments = {};
  let classifiedCount = 0;
  let excludedExchange = 0;
  let pendingRetry = 0;

  for (const company of universeData.companies) {
    const yr = results[company.cik];

    if (yr?.thes1sCode) {
      assignments[company.cik] = {
        ticker: company.ticker, name: company.name, cik: company.cik,
        exchange: yr.exchange, exchangeName: yr.exchangeName,
        thes1sCode: yr.thes1sCode, sector: yr.sector,
        industryGroup: yr.industryGroup, industry: yr.industry,
        confidence: yr.confidence, source: yr.source,
        yahooSector: yr.yahooSector, yahooIndustry: yr.yahooIndustry,
        needsReview: yr.needsReview || false, flags: []
      };
      classifiedCount++;
    } else if (yr?.source?.includes('excluded-exchange')) {
      excludedExchange++;
    } else if (yr?.source?.includes('excluded-type')) {
      // skip
    } else {
      assignments[company.cik] = {
        ticker: company.ticker, name: company.name, cik: company.cik,
        exchange: yr?.exchange || null, exchangeName: yr?.exchangeName || null,
        thes1sCode: null, sector: null, industryGroup: null, industry: null,
        confidence: 0, source: yr?.source || 'unclassified',
        needsReview: true, flags: ['pending-retry'], error: yr?.error || null
      };
      pendingRetry++;
    }
  }

  const assignmentsFile = path.join(TAXONOMY_DIR, 'thes1s-company-assignments.json');
  const output = {
    metadata: {
      version: '1.0.0',
      generatedDate: new Date().toISOString(),
      totalCompanies: Object.keys(assignments).length,
      pipeline: {
        yahoo_quoteSummary: Object.values(assignments).filter(a => a.source === 'yahoo').length,
        yahoo_search: Object.values(assignments).filter(a => a.source === 'yahoo-search').length,
        excludedExchange: excludedExchange,
        pendingRetry: pendingRetry
      },
      confidenceDistribution: {
        high_85: Object.values(assignments).filter(r => r.confidence >= 0.85).length,
        medium_65: Object.values(assignments).filter(r => r.confidence >= 0.65 && r.confidence < 0.85).length,
        unclassified_0: Object.values(assignments).filter(r => r.confidence === 0).length
      }
    },
    assignments
  };

  fs.writeFileSync(assignmentsFile, JSON.stringify(output, null, 2));
  log(`\nAssignments rebuilt: ${classifiedCount} classified, ${excludedExchange} excluded, ${pendingRetry} pending`);
  log(`Coverage: ${classifiedCount}/${Object.keys(assignments).length} (${(classifiedCount / Object.keys(assignments).length * 100).toFixed(1)}%)`);
}

main().catch(err => {
  console.error('Search recovery failed:', err);
  process.exit(1);
});
