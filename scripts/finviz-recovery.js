#!/usr/bin/env node

/**
 * finviz-recovery.js — Recover failed Yahoo tickers using Finviz
 *
 * Fetches sector/industry/exchange from Finviz for tickers that Yahoo
 * rate-limited, maps through the Yahoo-to-Thes1s crosswalk, and updates
 * yahoo-seed.json + rebuilds assignments.
 *
 * Usage: node scripts/finviz-recovery.js
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TAXONOMY_DIR = path.join(ROOT, 'knowledge', 'taxonomy-research');
const PIPELINE_DIR = path.join(TAXONOMY_DIR, 'pipeline');

const BATCH_DELAY_MS = 300; // Finviz is less aggressive on rate limiting

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// --- Finviz sector names that differ from Yahoo ---
const FINVIZ_SECTOR_TO_YAHOO = {
  'Financial': 'Financial Services',
  // Add others here if discovered
};

// --- Fetch Finviz page and extract sector/industry/exchange ---
function fetchFinviz(ticker) {
  return new Promise((resolve, reject) => {
    const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}&p=d`;
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve({ error: `HTTP ${res.statusCode}` });
          return;
        }
        const sectorMatch = data.match(/screener\.ashx\?v=\d+&f=sec_[^'"]*['"][^>]*>([^<]+)/);
        const industryMatch = data.match(/screener\.ashx\?v=\d+&f=ind_[^'"]*['"][^>]*>([^<]+)/);
        const exchangeMatch = data.match(/screener\.ashx\?v=\d+&f=exch_[^'"]*['"][^>]*>([^<]+)/);

        const rawSector = sectorMatch?.[1]?.replace(/&amp;/g, '&') || null;
        const sector = FINVIZ_SECTOR_TO_YAHOO[rawSector] || rawSector;
        const industry = industryMatch?.[1]?.replace(/&amp;/g, '&') || null;
        const exchange = exchangeMatch?.[1] || null;

        resolve({ sector, industry, exchange });
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ error: 'timeout' }); });
  });
}

// Major exchange codes from Finviz (different format than Yahoo)
const FINVIZ_MAJOR_EXCHANGES = new Set(['NYSE', 'NASD', 'AMEX']);

// Map Finviz exchange to Yahoo exchange codes for consistency
const FINVIZ_EXCHANGE_MAP = {
  'NYSE': { exchange: 'NYQ', exchangeName: 'NYSE' },
  'NASD': { exchange: 'NMS', exchangeName: 'NasdaqGS' }, // approximate
  'AMEX': { exchange: 'ASE', exchangeName: 'NYSE American' },
};

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

  log(`Found ${errorTickers.length} yahoo-error tickers to recover via Finviz`);

  let recovered = 0;
  let excluded = 0;
  let noData = 0;
  let failed = 0;
  let unmapped = 0;

  for (let i = 0; i < errorTickers.length; i++) {
    const { cik, ticker, name } = errorTickers[i];

    const finviz = await fetchFinviz(ticker);

    if (finviz.error) {
      failed++;
    } else if (!finviz.sector || !finviz.industry) {
      noData++;
    } else if (finviz.exchange && !FINVIZ_MAJOR_EXCHANGES.has(finviz.exchange)) {
      // Not a major exchange — exclude
      const exInfo = FINVIZ_EXCHANGE_MAP[finviz.exchange] || { exchange: finviz.exchange, exchangeName: finviz.exchange };
      results[cik] = {
        ticker, name,
        exchange: exInfo.exchange, exchangeName: exInfo.exchangeName, quoteType: 'EQUITY',
        yahooSector: finviz.sector, yahooIndustry: finviz.industry,
        thes1sCode: null, confidence: 0, source: 'finviz-excluded-exchange',
        error: `Non-major exchange: ${finviz.exchange}`
      };
      excluded++;
    } else {
      // Try to map through crosswalk
      const yahooKey = `${finviz.sector}|${finviz.industry}`;
      const mapping = yahooCrosswalkMap.get(yahooKey);

      const exInfo = FINVIZ_EXCHANGE_MAP[finviz.exchange] || { exchange: finviz.exchange, exchangeName: finviz.exchange };

      if (!mapping) {
        results[cik] = {
          ticker, name,
          exchange: exInfo.exchange, exchangeName: exInfo.exchangeName, quoteType: 'EQUITY',
          yahooSector: finviz.sector, yahooIndustry: finviz.industry,
          thes1sCode: null, confidence: 0, source: 'finviz-unmapped',
          error: `No crosswalk for: ${yahooKey}`
        };
        unmapped++;
      } else {
        const taxInfo = codeToTaxonomy.get(mapping.thes1sCode);
        results[cik] = {
          ticker, name,
          exchange: exInfo.exchange, exchangeName: exInfo.exchangeName, quoteType: 'EQUITY',
          yahooSector: finviz.sector, yahooIndustry: finviz.industry,
          thes1sCode: mapping.thes1sCode,
          sector: taxInfo?.sector || mapping.thes1sSector,
          industryGroup: taxInfo?.industryGroup || '',
          industry: taxInfo?.industry || mapping.thes1sIndustry,
          confidence: mapping.mappingType === 'split' ? 0.65 : 0.80, // slightly lower than Yahoo direct
          mappingType: mapping.mappingType,
          needsReview: mapping.mappingType === 'split',
          source: 'finviz'
        };
        recovered++;
      }
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

  log(`\nFinviz recovery complete:`);
  log(`  Recovered: ${recovered}`);
  log(`  Excluded (non-major exchange): ${excluded}`);
  log(`  Unmapped (crosswalk gap): ${unmapped}`);
  log(`  No data: ${noData}`);
  log(`  Failed: ${failed}`);

  // Save updated yahoo-seed
  const totalClassified = Object.values(results).filter(r => r.thes1sCode).length;
  yahooData.results = results;
  yahooData.classified = totalClassified;
  yahooData.lastFinvizRecovery = new Date().toISOString();
  yahooData.completedAt = new Date().toISOString();
  fs.writeFileSync(yahooFile, JSON.stringify(yahooData, null, 2));
  log(`Updated yahoo-seed.json (${totalClassified} total classified)`);

  // Rebuild assignments
  log('\nRebuilding assignments...');
  const universeData = loadJSON(path.join(PIPELINE_DIR, 'universe.json'));

  const assignments = {};
  let yahooClassified = 0;
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
      yahooClassified++;
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
        step2_yahoo: Object.values(assignments).filter(a => a.source === 'yahoo').length,
        finviz_recovery: Object.values(assignments).filter(a => a.source === 'finviz').length,
        excludedExchange: excludedExchange,
        pendingRetry: pendingRetry
      },
      confidenceDistribution: {
        high_85: Object.values(assignments).filter(r => r.confidence >= 0.85).length,
        high_80: Object.values(assignments).filter(r => r.confidence >= 0.80 && r.confidence < 0.85).length,
        medium_65: Object.values(assignments).filter(r => r.confidence >= 0.65 && r.confidence < 0.80).length,
        unclassified_0: Object.values(assignments).filter(r => r.confidence === 0).length
      }
    },
    assignments
  };

  fs.writeFileSync(assignmentsFile, JSON.stringify(output, null, 2));
  log(`Assignments rebuilt: ${yahooClassified} classified, ${excludedExchange} excluded, ${pendingRetry} pending`);
  log(`Coverage: ${yahooClassified}/${Object.keys(assignments).length} (${(yahooClassified / Object.keys(assignments).length * 100).toFixed(1)}%)`);
}

main().catch(err => {
  console.error('Finviz recovery failed:', err);
  process.exit(1);
});
