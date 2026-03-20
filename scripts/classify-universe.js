#!/usr/bin/env node

/**
 * classify-universe.js — Standalone batch classification script
 *
 * Classifies ~8,000 US public companies into the Thes1s taxonomy using:
 *   Step 1: Build universe from EDGAR company_tickers.json
 *   Step 2: Classify via Yahoo Finance (sector/industry via yahoo-finance2)
 *   Step 3: Build final assignments (Yahoo-classified + unclassified pending retry)
 *
 * Output: industry-classification/thes1s-company-assignments.json
 *
 * Usage:
 *   node scripts/classify-universe.js                # Run full pipeline
 *   node scripts/classify-universe.js --retry-yahoo  # Retry only previously failed Yahoo tickers
 *   node scripts/classify-universe.js --force-step 2 # Force re-run from step 2
 *   node scripts/classify-universe.js --step 1       # Run only step 1
 *   node scripts/classify-universe.js --validate     # Run validation only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TAXONOMY_DIR = path.join(ROOT, 'industry-classification');
const PIPELINE_DIR = path.join(TAXONOMY_DIR, 'pipeline');

// Ensure pipeline dir exists
if (!fs.existsSync(PIPELINE_DIR)) fs.mkdirSync(PIPELINE_DIR, { recursive: true });

// --- Configuration ---
const YAHOO_BATCH_SIZE = 50;
const YAHOO_BATCH_DELAY_MS = 500;
const YAHOO_PERSIST_EVERY = 100;
const EDGAR_USER_AGENT = 'Thes1s Research Tool admin@thes1s.local';

// --- Load reference files ---
function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const crosswalk = loadJSON(path.join(TAXONOMY_DIR, 'yahoo-to-thes1s-crosswalk.json'));
const taxonomy = loadJSON(path.join(TAXONOMY_DIR, 'thes1s-taxonomy-tree.json'));

// Build lookup: yahooSector|yahooIndustry -> mapping
const yahooCrosswalkMap = new Map();
crosswalk.mappings.forEach(m => {
  yahooCrosswalkMap.set(`${m.yahooSector}|${m.yahooIndustry}`, m);
});

// Build lookup: thes1sCode -> { sector, industryGroup, industry }
const codeToTaxonomy = new Map();
taxonomy.sectors.forEach(s => {
  s.industryGroups.forEach(g => {
    g.industries.forEach(i => {
      codeToTaxonomy.set(i.code, {
        sector: s.name,
        sectorCode: s.code,
        industryGroup: g.name,
        industryGroupCode: g.code,
        industry: i.name,
        industryCode: i.code
      });
    });
  });
});

// --- Helpers ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

function stepOutputExists(stepFile) {
  if (!fs.existsSync(stepFile)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(stepFile, 'utf-8'));
    return data.completedAt != null;
  } catch {
    return false;
  }
}

function saveStepOutput(stepFile, data) {
  data.completedAt = new Date().toISOString();
  fs.writeFileSync(stepFile, JSON.stringify(data, null, 2));
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// Major US exchange codes from Yahoo Finance
const MAJOR_EXCHANGES = new Set([
  'NMS',   // Nasdaq Global Select Market
  'NGM',   // Nasdaq Global Market
  'NCM',   // Nasdaq Capital Market
  'NYQ',   // NYSE
  'ASE',   // AMEX (NYSE American)
  'PCX',   // NYSE Arca
  'BTS',   // BATS/Cboe BZX
]);

// Classify a single Yahoo result through the crosswalk
function classifyYahooResult(ticker, name, profile, priceData) {
  const exchange = priceData?.exchange || null;
  const exchangeName = priceData?.exchangeName || null;
  const quoteType = priceData?.quoteType || null;

  if (!profile?.sector || !profile?.industry) {
    return { ticker, name, exchange, exchangeName, quoteType, yahooSector: null, yahooIndustry: null, thes1sCode: null, confidence: 0, source: 'yahoo-missing' };
  }

  // Filter: only major US exchanges
  if (exchange && !MAJOR_EXCHANGES.has(exchange)) {
    return {
      ticker, name, exchange, exchangeName, quoteType,
      yahooSector: profile.sector, yahooIndustry: profile.industry,
      thes1sCode: null, confidence: 0, source: 'yahoo-excluded-exchange',
      error: `Non-major exchange: ${exchange} (${exchangeName})`
    };
  }

  // Filter: only equity (not ETF, mutual fund, etc.)
  if (quoteType && quoteType !== 'EQUITY') {
    return {
      ticker, name, exchange, exchangeName, quoteType,
      yahooSector: profile.sector, yahooIndustry: profile.industry,
      thes1sCode: null, confidence: 0, source: 'yahoo-excluded-type',
      error: `Non-equity quoteType: ${quoteType}`
    };
  }

  const yahooKey = `${profile.sector}|${profile.industry}`;
  const mapping = yahooCrosswalkMap.get(yahooKey);

  if (!mapping) {
    return {
      ticker, name, exchange, exchangeName, quoteType,
      yahooSector: profile.sector, yahooIndustry: profile.industry,
      thes1sCode: null, confidence: 0, source: 'yahoo-unmapped',
      error: `No crosswalk for: ${yahooKey}`
    };
  }

  const taxInfo = codeToTaxonomy.get(mapping.thes1sCode);
  return {
    ticker, name, exchange, exchangeName, quoteType,
    yahooSector: profile.sector, yahooIndustry: profile.industry,
    thes1sCode: mapping.thes1sCode,
    sector: taxInfo?.sector || mapping.thes1sSector,
    industryGroup: taxInfo?.industryGroup || '',
    industry: taxInfo?.industry || mapping.thes1sIndustry,
    confidence: mapping.mappingType === 'split' ? 0.65 : 0.85,
    mappingType: mapping.mappingType,
    needsReview: mapping.mappingType === 'split',
    source: 'yahoo'
  };
}

// ============================================================
// STEP 1: Build Universe from EDGAR
// ============================================================
async function step1_buildUniverse(force = false) {
  const outputFile = path.join(PIPELINE_DIR, 'universe.json');

  if (!force && stepOutputExists(outputFile)) {
    const existing = loadJSON(outputFile);
    log(`Step 1: Skipping — universe.json exists (${existing.itemCount} tickers)`);
    return existing;
  }

  log('Step 1: Downloading EDGAR company_tickers.json...');
  const raw = await httpsGet('https://www.sec.gov/files/company_tickers.json', {
    'User-Agent': EDGAR_USER_AGENT,
    'Accept': 'application/json'
  });
  const tickers = JSON.parse(raw);

  // tickers is an object like { "0": { cik_str, ticker, title }, "1": {...}, ... }
  const entries = Object.values(tickers);
  log(`  Raw EDGAR entries: ${entries.length}`);

  // Minimal filtering — only exclude tickers with explicit separator-based suffixes
  // that indicate warrants, units, rights, preferred shares (e.g. ACHR/WS, BAC-PL)
  // The real filtering happens in Step 2 via Yahoo exchange data (NYSE/NASDAQ/AMEX only)
  const filtered = entries.filter(e => {
    const t = e.ticker.toUpperCase();
    // Only exclude tickers with separators (., -, /) indicating non-common-stock classes
    if (/[.\-\/]/.test(t)) {
      if (/[.\-\/]W[S]?$/.test(t)) return false;    // warrants
      if (/[.\-\/]U$/.test(t)) return false;          // units
      if (/[.\-\/]R[T]?$/.test(t)) return false;      // rights
      if (/[.\-\/]P[A-Z]?$/.test(t)) return false;    // preferred
      if (/[.\-\/]PR[.\-\/]?[A-Z]?$/.test(t)) return false; // preferred (alt)
    }
    return true;
  });

  // Deduplicate by ticker (keep first occurrence — lowest CIK usually)
  const seen = new Map();
  const universe = [];
  for (const entry of filtered) {
    const ticker = entry.ticker.toUpperCase();
    if (!seen.has(ticker)) {
      seen.set(ticker, true);
      universe.push({
        cik: String(entry.cik_str).padStart(10, '0'),
        ticker: ticker,
        name: entry.title
      });
    }
  }

  log(`  Filtered universe: ${universe.length} tickers`);

  const output = {
    itemCount: universe.length,
    generatedDate: new Date().toISOString(),
    companies: universe
  };

  saveStepOutput(outputFile, output);
  log(`Step 1: Complete — ${universe.length} tickers saved`);
  return output;
}

// ============================================================
// STEP 2: Yahoo Finance Classification
// ============================================================
async function step2_yahooSeed(universeData, force = false) {
  const outputFile = path.join(PIPELINE_DIR, 'yahoo-seed.json');

  if (!force && stepOutputExists(outputFile)) {
    const existing = loadJSON(outputFile);
    log(`Step 2: Skipping — yahoo-seed.json exists (${existing.itemCount} results)`);
    return existing;
  }

  // Check for partial progress
  let results = {};
  let startIndex = 0;
  const partialFile = path.join(PIPELINE_DIR, 'yahoo-seed-partial.json');
  if (fs.existsSync(partialFile)) {
    try {
      const partial = JSON.parse(fs.readFileSync(partialFile, 'utf-8'));
      results = partial.results || {};
      startIndex = Object.keys(results).length;
      log(`Step 2: Resuming from ticker ${startIndex} (${Object.keys(results).length} already done)`);
    } catch {
      log('Step 2: Partial file corrupt, starting fresh');
    }
  }

  const companies = universeData.companies;
  log(`Step 2: Classifying ${companies.length} tickers via Yahoo Finance (starting at ${startIndex})...`);

  let classified = 0;
  let failed = 0;
  let noProfile = 0;
  let excluded = 0;

  for (let i = startIndex; i < companies.length; i++) {
    const company = companies[i];
    const ticker = company.ticker;

    // Skip if already done (from partial recovery)
    if (results[company.cik]) continue;

    try {
      const summary = await yahooFinance.quoteSummary(ticker, {
        modules: ['assetProfile', 'price']
      });

      const result = classifyYahooResult(ticker, company.name, summary?.assetProfile, summary?.price);
      results[company.cik] = result;

      if (result.thes1sCode) classified++;
      else if (result.source === 'yahoo-excluded-exchange' || result.source === 'yahoo-excluded-type') excluded++;
      else noProfile++;
    } catch (err) {
      results[company.cik] = {
        ticker,
        name: company.name,
        exchange: null, exchangeName: null, quoteType: null,
        thes1sCode: null,
        confidence: 0,
        source: 'yahoo-error',
        error: err.message?.slice(0, 200)
      };
      failed++;
    }

    // Batch delay: pause every YAHOO_BATCH_SIZE requests
    if ((i - startIndex + 1) % YAHOO_BATCH_SIZE === 0) {
      await sleep(YAHOO_BATCH_DELAY_MS);
    }

    // Incremental persistence: save every YAHOO_PERSIST_EVERY tickers
    if ((i - startIndex + 1) % YAHOO_PERSIST_EVERY === 0) {
      fs.writeFileSync(partialFile, JSON.stringify({
        results,
        lastIndex: i,
        savedAt: new Date().toISOString()
      }));
      const pct = ((i + 1) / companies.length * 100).toFixed(1);
      log(`  Progress: ${i + 1}/${companies.length} (${pct}%) — ${classified} classified, ${failed} failed, ${excluded} excluded, ${noProfile} no profile`);
    }
  }

  // Final counts
  const totalClassified = Object.values(results).filter(r => r.thes1sCode).length;
  const totalFailed = Object.values(results).filter(r => r.source === 'yahoo-error').length;
  const totalExcluded = Object.values(results).filter(r => r.source?.startsWith('yahoo-excluded')).length;
  const totalMissing = Object.values(results).filter(r => !r.thes1sCode).length;

  log(`Step 2: Yahoo complete — ${totalClassified} classified, ${totalExcluded} excluded (non-major exchange/non-equity), ${totalFailed} errors, ${totalMissing - totalExcluded - totalFailed} missing`);

  const output = {
    itemCount: Object.keys(results).length,
    classified: totalClassified,
    missing: totalMissing,
    errors: totalFailed,
    generatedDate: new Date().toISOString(),
    results
  };

  saveStepOutput(outputFile, output);

  // Clean up partial file
  if (fs.existsSync(partialFile)) fs.unlinkSync(partialFile);

  return output;
}

// ============================================================
// RETRY: Re-run Yahoo for previously failed tickers only
// ============================================================
async function retryYahoo() {
  const yahooFile = path.join(PIPELINE_DIR, 'yahoo-seed.json');
  if (!fs.existsSync(yahooFile)) {
    log('No yahoo-seed.json found. Run the full pipeline first.');
    return;
  }

  const yahooData = loadJSON(yahooFile);
  const results = yahooData.results;

  // Find all failed entries (errors, unmapped, missing — but NOT excluded-exchange/excluded-type, those were intentional)
  const failedCiks = Object.entries(results)
    .filter(([, r]) => r.source === 'yahoo-error' || r.source === 'yahoo-unmapped' || r.source === 'yahoo-missing')
    .map(([cik, r]) => ({ cik, ticker: r.ticker, name: r.name }));

  // Also find tickers in universe that aren't in yahoo-seed at all (e.g. after filter fix)
  const universeData = loadJSON(path.join(PIPELINE_DIR, 'universe.json'));
  const newTickers = universeData.companies
    .filter(c => !results[c.cik])
    .map(c => ({ cik: c.cik, ticker: c.ticker, name: c.name }));

  if (newTickers.length > 0) {
    log(`Found ${newTickers.length} new tickers not in yahoo-seed (added after universe rebuild)`);
    failedCiks.push(...newTickers);
  }

  if (failedCiks.length === 0) {
    log('No failed tickers to retry!');
    return;
  }

  log(`Retrying ${failedCiks.length} previously failed tickers via Yahoo Finance...`);

  let classified = 0;
  let stillFailed = 0;

  for (let i = 0; i < failedCiks.length; i++) {
    const { cik, ticker, name } = failedCiks[i];

    try {
      const summary = await yahooFinance.quoteSummary(ticker, {
        modules: ['assetProfile', 'price']
      });

      const result = classifyYahooResult(ticker, name, summary?.assetProfile, summary?.price);
      results[cik] = result;
      if (result.thes1sCode) {
        classified++;
      } else {
        stillFailed++;
      }
    } catch (err) {
      results[cik] = {
        ticker, name,
        exchange: null, exchangeName: null, quoteType: null,
        thes1sCode: null,
        confidence: 0,
        source: 'yahoo-error',
        error: err.message?.slice(0, 200)
      };
      stillFailed++;
    }

    // Batch delay
    if ((i + 1) % YAHOO_BATCH_SIZE === 0) {
      await sleep(YAHOO_BATCH_DELAY_MS);
    }

    // Progress logging
    if ((i + 1) % YAHOO_PERSIST_EVERY === 0) {
      const pct = ((i + 1) / failedCiks.length * 100).toFixed(1);
      log(`  Retry progress: ${i + 1}/${failedCiks.length} (${pct}%) — ${classified} recovered, ${stillFailed} still failed`);
    }
  }

  // Update counts
  const totalClassified = Object.values(results).filter(r => r.thes1sCode).length;
  const totalErrors = Object.values(results).filter(r => r.source === 'yahoo-error').length;

  log(`Retry complete — ${classified} recovered, ${stillFailed} still failed`);
  log(`Total now classified: ${totalClassified} / ${Object.keys(results).length}`);

  // Save updated yahoo-seed.json
  yahooData.results = results;
  yahooData.classified = totalClassified;
  yahooData.errors = totalErrors;
  yahooData.missing = Object.values(results).filter(r => !r.thes1sCode).length;
  yahooData.lastRetryDate = new Date().toISOString();
  saveStepOutput(yahooFile, yahooData);

  // Rebuild assignments (universeData already loaded above)
  await step3_buildAssignments(universeData, yahooData, true);

  log('\n');
  validate();
  log('\nRetry complete!');
}

// ============================================================
// STEP 3: Build Final Assignments (Yahoo-only, no SIC fallback)
// ============================================================
async function step3_buildAssignments(universeData, yahooData, force = false) {
  const outputFile = path.join(PIPELINE_DIR, 'assignments-build.json');

  if (!force && stepOutputExists(outputFile)) {
    const existing = loadJSON(outputFile);
    log(`Step 3: Skipping — assignments already built (${existing.itemCount} entries)`);
    return existing;
  }

  log('Step 3: Building final assignments from Yahoo results...');

  const results = {};
  let yahooClassified = 0;
  let excludedExchange = 0;
  let excludedType = 0;
  let pendingRetry = 0;

  for (const company of universeData.companies) {
    const cik = company.cik;
    const yr = yahooData.results[cik];

    if (yr?.thes1sCode) {
      // Yahoo classified this company on a major exchange
      results[cik] = {
        ticker: company.ticker,
        name: company.name,
        cik,
        exchange: yr.exchange,
        exchangeName: yr.exchangeName,
        thes1sCode: yr.thes1sCode,
        sector: yr.sector,
        industryGroup: yr.industryGroup,
        industry: yr.industry,
        confidence: yr.confidence,
        source: yr.source,
        yahooSector: yr.yahooSector,
        yahooIndustry: yr.yahooIndustry,
        needsReview: yr.needsReview || false,
        flags: []
      };
      yahooClassified++;
    } else if (yr?.source === 'yahoo-excluded-exchange') {
      // Intentionally excluded — not on a major exchange
      excludedExchange++;
    } else if (yr?.source === 'yahoo-excluded-type') {
      // Intentionally excluded — not equity
      excludedType++;
    } else {
      // Unclassified — pending Yahoo retry
      results[cik] = {
        ticker: company.ticker,
        name: company.name,
        cik,
        exchange: yr?.exchange || null,
        exchangeName: yr?.exchangeName || null,
        thes1sCode: null,
        sector: null,
        industryGroup: null,
        industry: null,
        confidence: 0,
        source: yr?.source || 'unclassified',
        needsReview: true,
        flags: ['pending-yahoo-retry'],
        error: yr?.error || null
      };
      pendingRetry++;
    }
  }

  log(`  Yahoo classified: ${yahooClassified}`);
  log(`  Excluded (non-major exchange): ${excludedExchange}`);
  log(`  Excluded (non-equity): ${excludedType}`);
  log(`  Pending retry: ${pendingRetry}`);

  const output = {
    itemCount: Object.keys(results).length,
    stats: { yahooClassified, pendingRetry },
    generatedDate: new Date().toISOString(),
    results
  };

  saveStepOutput(outputFile, output);

  // Write the final assignments file
  const assignmentsFile = path.join(TAXONOMY_DIR, 'thes1s-company-assignments.json');
  const assignments = {
    metadata: {
      version: '1.0.0',
      generatedDate: new Date().toISOString(),
      totalCompanies: Object.keys(results).length,
      pipeline: {
        step2_yahoo: yahooClassified,
        excludedExchange: excludedExchange,
        excludedType: excludedType,
        pendingRetry: pendingRetry,
        step5_nlp: 0,
        step6_segments: 0,
        step7_manual: 0
      },
      confidenceDistribution: {
        high_85: Object.values(results).filter(r => r.confidence >= 0.85).length,
        medium_65: Object.values(results).filter(r => r.confidence >= 0.65 && r.confidence < 0.85).length,
        unclassified_0: Object.values(results).filter(r => r.confidence === 0).length
      }
    },
    assignments: results
  };

  fs.writeFileSync(assignmentsFile, JSON.stringify(assignments, null, 2));
  log(`  Final assignments written: ${assignmentsFile}`);

  return output;
}

// ============================================================
// VALIDATION
// ============================================================
function validate() {
  const assignmentsFile = path.join(TAXONOMY_DIR, 'thes1s-company-assignments.json');
  if (!fs.existsSync(assignmentsFile)) {
    log('Validation: No assignments file found. Run the pipeline first.');
    return;
  }

  const data = loadJSON(assignmentsFile);
  const results = data.assignments;
  const entries = Object.values(results);

  log('=== VALIDATION REPORT ===\n');

  // 1. Summary stats
  log(`Total companies: ${entries.length}`);
  log(`Pipeline stats: ${JSON.stringify(data.metadata.pipeline, null, 2)}`);
  log(`Confidence distribution: ${JSON.stringify(data.metadata.confidenceDistribution, null, 2)}`);

  // 2. Spot-check well-known companies
  const spotChecks = ['AAPL', 'AMZN', 'TSLA', 'LULU', 'NFLX', 'GOOGL', 'V', 'EQIX', 'XOM', 'JPM',
    'MSFT', 'NVDA', 'META', 'UNH', 'JNJ', 'WMT', 'PG', 'HD', 'COST', 'ODFL'];

  log('\n--- Spot Check (20 well-known companies) ---');
  for (const ticker of spotChecks) {
    const entry = entries.find(e => e.ticker === ticker);
    if (entry) {
      if (entry.thes1sCode) {
        log(`  ${ticker.padEnd(6)} → ${entry.sector} > ${entry.industry} (conf: ${entry.confidence})`);
      } else {
        log(`  ${ticker.padEnd(6)} → PENDING RETRY (${entry.source})`);
      }
    } else {
      log(`  ${ticker.padEnd(6)} → NOT FOUND`);
    }
  }

  // 3. Sector distribution (classified only)
  log('\n--- Sector Distribution (classified only) ---');
  const classified = entries.filter(e => e.thes1sCode);
  const sectorCounts = {};
  classified.forEach(e => {
    sectorCounts[e.sector] = (sectorCounts[e.sector] || 0) + 1;
  });
  Object.entries(sectorCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([sector, count]) => {
      const pct = (count / classified.length * 100).toFixed(1);
      log(`  ${sector.padEnd(28)} ${String(count).padStart(5)} (${pct}%)`);
    });

  // 4. Thin industries (<5 companies)
  const industryCounts = {};
  classified.forEach(e => {
    const key = `${e.thes1sCode} ${e.industry}`;
    industryCounts[key] = (industryCounts[key] || 0) + 1;
  });
  const thin = Object.entries(industryCounts).filter(([, c]) => c < 5);
  log(`\n--- Thin Industries (<5 companies): ${thin.length} ---`);
  thin.sort((a, b) => a[1] - b[1]).slice(0, 20).forEach(([ind, count]) => {
    log(`  ${ind}: ${count}`);
  });

  // 5. Pending retry breakdown
  const pending = entries.filter(e => !e.thes1sCode);
  const pendingSources = {};
  pending.forEach(p => { pendingSources[p.source] = (pendingSources[p.source] || 0) + 1; });
  log(`\n--- Pending Retry: ${pending.length} ---`);
  Object.entries(pendingSources).forEach(([src, count]) => {
    log(`  ${src}: ${count}`);
  });

  // 6. Exchange distribution
  log('\n--- Exchange Distribution (classified only) ---');
  const exchangeCounts = {};
  classified.forEach(e => {
    const key = e.exchangeName || e.exchange || 'Unknown';
    exchangeCounts[key] = (exchangeCounts[key] || 0) + 1;
  });
  Object.entries(exchangeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ex, count]) => {
      log(`  ${ex.padEnd(25)} ${String(count).padStart(5)}`);
    });

  // 7. Coverage rate
  const coveragePct = (classified.length / entries.length * 100).toFixed(1);
  log(`\n--- Coverage: ${classified.length}/${entries.length} (${coveragePct}%) ---`);

  // 7. Industry group distribution (top 20)
  log('\n--- Industry Group Distribution (top 20) ---');
  const igCounts = {};
  classified.forEach(e => {
    if (e.industryGroup) {
      igCounts[e.industryGroup] = (igCounts[e.industryGroup] || 0) + 1;
    }
  });
  Object.entries(igCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([ig, count]) => {
      log(`  ${ig.padEnd(35)} ${count}`);
    });

  log('\n=== VALIDATION COMPLETE ===');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const forceStep = args.includes('--force-step') ? parseInt(args[args.indexOf('--force-step') + 1]) : null;
  const onlyStep = args.includes('--step') ? parseInt(args[args.indexOf('--step') + 1]) : null;
  const validateOnly = args.includes('--validate');
  const retryMode = args.includes('--retry-yahoo');

  if (validateOnly) {
    validate();
    return;
  }

  if (retryMode) {
    await retryYahoo();
    return;
  }

  log('=== Thes1s Classification Pipeline ===\n');

  const shouldForce = (step) => forceStep != null && step >= forceStep;
  const shouldRun = (step) => onlyStep == null || onlyStep === step;

  // Step 1: Build Universe
  let universeData;
  if (shouldRun(1)) {
    universeData = await step1_buildUniverse(shouldForce(1));
  } else {
    universeData = loadJSON(path.join(PIPELINE_DIR, 'universe.json'));
  }
  if (onlyStep === 1) return;

  // Step 2: Yahoo Classification
  let yahooData;
  if (shouldRun(2)) {
    yahooData = await step2_yahooSeed(universeData, shouldForce(2));
  } else {
    yahooData = loadJSON(path.join(PIPELINE_DIR, 'yahoo-seed.json'));
  }
  if (onlyStep === 2) return;

  // Step 3: Build Final Assignments
  if (shouldRun(3)) {
    await step3_buildAssignments(universeData, yahooData, shouldForce(3));
  }

  // Run validation
  log('\n');
  validate();

  log('\nPipeline complete!');
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
