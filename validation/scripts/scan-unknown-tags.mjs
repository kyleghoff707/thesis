#!/usr/bin/env node
// Scan EDGAR company facts for XBRL tags not in our taxonomy.
// Detects financially significant tags we might be missing.
// Usage: node validation/scripts/scan-unknown-tags.mjs [TICKER1 TICKER2 ...]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const BUNDLE_PATH = resolve(__dirname, 'bundled-engines.mjs');
const REPORTS_DIR = resolve(__dirname, '../reports');

// ── Configuration ──
const MATERIALITY_THRESHOLD = 0.005; // 0.5% of total assets
const ACTION_ITEM_MIN_COMPANIES = 50; // flag tags in 50+ companies
const ACTION_ITEM_MIN_MATERIALITY = 0.01; // with >1% avg materiality

// ── Polyfill browser globals ──
globalThis.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, val) { this._data[key] = String(val); },
  removeItem(key) { delete this._data[key]; },
  get length() { return Object.keys(this._data).length; },
  key(i) { return Object.keys(this._data)[i] ?? null; },
};

if (!existsSync(BUNDLE_PATH)) {
  console.error('Bundled engines not found. Run: node validation/scripts/bundle.mjs');
  process.exit(1);
}

const {
  INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY,
  lookupCIK, fetchCompanyFacts,
} = await import(BUNDLE_PATH);

// Build known tag set from all three taxonomies
const knownTags = new Set();
for (const taxonomy of [INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY]) {
  for (const { tags } of taxonomy) {
    for (const tag of tags) {
      knownTags.add(tag);
    }
  }
}

// Load validation companies
const companiesFile = resolve(ROOT, 'src/data/validationCompanies.js');
const companiesSrc = readFileSync(companiesFile, 'utf-8');
const tickerMatches = [...companiesSrc.matchAll(/ticker:\s*'([^']+)'/g)];
const ALL_TICKERS = tickerMatches.map(m => m[1]);

// CLI arg filtering
const args = process.argv.slice(2);
const tickers = args.length > 0 ? args.map(t => t.toUpperCase()) : ALL_TICKERS;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Category heuristic ──
function classifyTag(tagName, label) {
  const combined = (tagName + ' ' + (label || '')).toLowerCase();

  // Cash flow signals (check first — most specific)
  if (/^(paymentsto|proceedsfrom|increasedecrease)/i.test(tagName)) return 'cashFlow';
  if (/\b(repayment|issuance|financing activit|investing activit|operating activit)\b/.test(combined)) return 'cashFlow';
  if (/\bcash.*(provided|used|paid|received)\b/.test(combined)) return 'cashFlow';

  // Balance sheet signals
  if (/\b(asset|liabilit|equity|receivable|payable|inventory|goodwill|intangible|noncurrent|non-current)\b/.test(combined)) return 'balance';
  if (/\b(current|treasury|retained earning|stockholder|capital stock|accumulated)\b/.test(combined)) return 'balance';
  if (/\bdebt\b/.test(combined) && !/\b(expense|interest|cost)\b/.test(combined)) return 'balance';

  // Income statement signals
  if (/\b(revenue|income|expense|cost of|earning|loss|profit|margin|tax provision|depreciat|amortiz|interest expense|interest income|sga|selling.*general)\b/.test(combined)) return 'income';

  return 'unknown';
}

// ── Main scan ──
console.log(`Scanning ${tickers.length} companies for unknown XBRL tags...`);
console.log(`Known taxonomy: ${knownTags.size} tags\n`);

const perCompany = {};
const tagAggregates = {}; // tag -> { label, units, companies, values, materialityPcts }
let completed = 0;
let skipped = 0;

for (const ticker of tickers) {
  globalThis.localStorage._data = {};

  try {
    process.stdout.write(`  ${ticker} — `);

    const cik = await lookupCIK(ticker);
    if (!cik) {
      console.log('CIK not found (skipped)');
      skipped++;
      await sleep(300);
      continue;
    }

    const facts = await fetchCompanyFacts(cik);
    const usGaap = facts?.facts?.['us-gaap'];
    if (!usGaap) {
      console.log('no us-gaap data (skipped)');
      skipped++;
      await sleep(300);
      continue;
    }

    // Get total assets for materiality calculation
    let totalAssets = null;
    const assetsTags = ['Assets'];
    for (const t of assetsTags) {
      const entries = usGaap[t]?.units?.USD;
      if (entries) {
        const annuals = entries.filter(e => e.form === '10-K' && e.fp === 'FY');
        if (annuals.length > 0) {
          annuals.sort((a, b) => b.fy - a.fy);
          totalAssets = Math.abs(annuals[0].val);
          break;
        }
      }
    }

    if (!totalAssets) {
      console.log('no total assets (skipped)');
      skipped++;
      await sleep(300);
      continue;
    }

    const companyUnknowns = [];
    const allTagNames = Object.keys(usGaap);

    for (const tagName of allTagNames) {
      if (knownTags.has(tagName)) continue;

      const tagData = usGaap[tagName];
      const unitTypes = Object.keys(tagData.units || {});

      // Skip pure-only tags (ratios, percentages)
      const financialUnits = unitTypes.filter(u => u === 'USD' || u === 'USD/shares' || u === 'shares');
      if (financialUnits.length === 0) continue;

      // Get 10-K annual entries from first available financial unit
      let annualEntries = [];
      let bestUnit = null;
      for (const u of financialUnits) {
        const entries = (tagData.units[u] || []).filter(e => e.form === '10-K' && e.fp === 'FY');
        if (entries.length > annualEntries.length) {
          annualEntries = entries;
          bestUnit = u;
        }
      }

      if (annualEntries.length === 0) continue;

      // Skip if all values are zero
      if (annualEntries.every(e => e.val === 0)) continue;

      // Get latest value for materiality check
      annualEntries.sort((a, b) => b.fy - a.fy);
      const latestEntry = annualEntries[0];
      const latestValue = latestEntry.val;
      const latestYear = latestEntry.fy;

      // Materiality check (for USD amounts only)
      let materialityPct = null;
      if (bestUnit === 'USD') {
        materialityPct = Math.abs(latestValue) / totalAssets;
        if (materialityPct < MATERIALITY_THRESHOLD) continue;
      }

      const info = {
        tag: tagName,
        label: tagData.label || '',
        units: financialUnits,
        latestValue,
        latestYear,
        materialityPct: materialityPct != null ? +(materialityPct * 100).toFixed(2) : null,
        yearCount: new Set(annualEntries.map(e => e.fy)).size,
      };

      companyUnknowns.push(info);

      // Aggregate
      if (!tagAggregates[tagName]) {
        tagAggregates[tagName] = {
          tag: tagName,
          label: tagData.label || '',
          description: tagData.description || '',
          units: financialUnits,
          companies: [],
          values: [],
          materialityPcts: [],
        };
      }
      tagAggregates[tagName].companies.push(ticker);
      tagAggregates[tagName].values.push(latestValue);
      if (materialityPct != null) {
        tagAggregates[tagName].materialityPcts.push(materialityPct * 100);
      }
    }

    perCompany[ticker] = {
      totalTags: allTagNames.length,
      unknownMaterial: companyUnknowns.length,
      totalAssets,
    };

    console.log(`${allTagNames.length} tags total, ${companyUnknowns.length} unknown+material`);
    completed++;
    await sleep(400);
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    perCompany[ticker] = { error: err.message };
    await sleep(500);
  }
}

// ── Aggregate & sort ──
const sortedTags = Object.values(tagAggregates)
  .map(agg => ({
    tag: agg.tag,
    label: agg.label,
    description: agg.description,
    units: agg.units,
    companyCount: agg.companies.length,
    companies: agg.companies.sort(),
    avgMaterialityPct: agg.materialityPcts.length > 0
      ? +(agg.materialityPcts.reduce((a, b) => a + b, 0) / agg.materialityPcts.length).toFixed(2)
      : null,
    maxValue: Math.max(...agg.values.map(Math.abs)),
    minValue: Math.min(...agg.values.map(Math.abs)),
    medianValue: (() => {
      const sorted = agg.values.map(Math.abs).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    })(),
    suggestedCategory: classifyTag(agg.tag, agg.label),
  }))
  .sort((a, b) => b.companyCount - a.companyCount);

// Action items: tags in many companies with high materiality
const actionItems = sortedTags.filter(
  t => t.companyCount >= ACTION_ITEM_MIN_COMPANIES && (t.avgMaterialityPct || 0) >= ACTION_ITEM_MIN_MATERIALITY * 100
);

// ── Console summary ──
console.log('\n' + '═'.repeat(70));
console.log('UNKNOWN XBRL TAG SCAN SUMMARY');
console.log('═'.repeat(70));
console.log(`Companies scanned: ${completed} (${skipped} skipped)`);
console.log(`Known tags in taxonomy: ${knownTags.size}`);
console.log(`Unique unknown material tags found: ${sortedTags.length}`);
console.log('');

if (sortedTags.length > 0) {
  console.log('── Top 20 Unknown Tags (by company count) ──');
  for (const t of sortedTags.slice(0, 20)) {
    const mat = t.avgMaterialityPct != null ? `${t.avgMaterialityPct}%` : 'N/A';
    console.log(`  ${t.companyCount}/${completed} companies | ${mat} avg materiality | [${t.suggestedCategory}] ${t.tag}`);
    console.log(`    ${' '.repeat(String(t.companyCount).length + String(completed).length + 3)}${t.label}`);
  }
}

if (actionItems.length > 0) {
  console.log(`\n── Action Items (${actionItems.length} tags in ${ACTION_ITEM_MIN_COMPANIES}+ companies, >${ACTION_ITEM_MIN_MATERIALITY * 100}% materiality) ──`);
  for (const t of actionItems) {
    console.log(`  ${t.tag} — ${t.label} (${t.companyCount} companies, ${t.avgMaterialityPct}% avg)`);
  }
}

// ── Save reports ──
if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

const dateStr = new Date().toISOString().slice(0, 10);

// JSON report
const jsonPath = resolve(REPORTS_DIR, `unknown-tags-${dateStr}.json`);
writeFileSync(jsonPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  config: {
    materialityThreshold: MATERIALITY_THRESHOLD,
    companiesScanned: completed,
    companiesSkipped: skipped,
    knownTagCount: knownTags.size,
  },
  summary: {
    uniqueUnknownTags: sortedTags.length,
    actionItems: actionItems.length,
  },
  tags: sortedTags,
  perCompany,
}, null, 2));

// Markdown report
function fmtVal(v) {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v}`;
}

let md = `# Unknown XBRL Tag Scan — ${dateStr}\n\n`;
md += `## Summary\n`;
md += `- Companies scanned: ${completed} (${skipped} skipped)\n`;
md += `- Known tags in taxonomy: ${knownTags.size}\n`;
md += `- Material unknown tags found: ${sortedTags.length}\n`;
md += `- Materiality threshold: ${MATERIALITY_THRESHOLD * 100}% of total assets\n\n`;

if (actionItems.length > 0) {
  md += `## Action Items\n\n`;
  md += `Tags in ${ACTION_ITEM_MIN_COMPANIES}+ companies with >${ACTION_ITEM_MIN_MATERIALITY * 100}% avg materiality — strong candidates for taxonomy addition:\n\n`;
  md += `| Tag | Label | Category | Companies | Avg Materiality | Median Value |\n`;
  md += `|-----|-------|----------|-----------|-----------------|-------------|\n`;
  for (const t of actionItems) {
    md += `| \`${t.tag}\` | ${t.label} | ${t.suggestedCategory} | ${t.companyCount}/${completed} | ${t.avgMaterialityPct}% | ${fmtVal(t.medianValue)} |\n`;
  }
  md += '\n';
}

md += `## Top Unknown Tags (by company count)\n\n`;
md += `| # | Tag | Label | Category | Companies | Avg Materiality | Median Value |\n`;
md += `|---|-----|-------|----------|-----------|-----------------|-------------|\n`;
for (let i = 0; i < Math.min(sortedTags.length, 50); i++) {
  const t = sortedTags[i];
  const mat = t.avgMaterialityPct != null ? `${t.avgMaterialityPct}%` : 'N/A';
  md += `| ${i + 1} | \`${t.tag}\` | ${t.label} | ${t.suggestedCategory} | ${t.companyCount}/${completed} | ${mat} | ${fmtVal(t.medianValue)} |\n`;
}

if (sortedTags.length > 50) {
  md += `\n*...and ${sortedTags.length - 50} more tags (see JSON report for full list)*\n`;
}

const mdPath = resolve(REPORTS_DIR, `unknown-tags-${dateStr}.md`);
writeFileSync(mdPath, md);

console.log(`\nReports saved:`);
console.log(`  ${jsonPath}`);
console.log(`  ${mdPath}`);
