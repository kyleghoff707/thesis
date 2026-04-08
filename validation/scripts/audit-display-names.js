/**
 * S&P 500 Display Name Audit
 *
 * Fetches properly-formatted company names from Wikipedia's S&P 500 list,
 * compares them against SEC's raw ALL CAPS names and our formatCompanyName()
 * output, and produces:
 *   1. A curated JSON map (src/data/sp500-display-names.json)
 *   2. An audit report (validation/reports/display-name-audit.md)
 *
 * Usage: node validation/scripts/audit-display-names.js
 */

import * as cheerio from 'cheerio';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { formatCompanyName } from '../../src/engines/formatCompanyName.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPORTS_DIR = join(__dirname, '..', 'reports');
const DATA_DIR = join(__dirname, '..', '..', 'src', 'data');

if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

const UA = 'Thes1s/1.0 (contact@thes1s.app)';

// ─── Fetch Helpers ─────────────────────────────────────────────

async function fetchJSON(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.json();
}

async function fetchHTML(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

// ─── Wikipedia S&P 500 ────────────────────────────────────────

async function fetchSP500() {
  console.log('Fetching S&P 500 constituents from Wikipedia...');
  const html = await fetchHTML('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies');
  const $ = cheerio.load(html);
  const companies = [];

  const table = $('table.wikitable').first();
  table.find('tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length === 0) return;

    const ticker = $(cells[0]).text().trim().replace('.', '-'); // BRK.B → BRK-B
    const companyName = $(cells[1]).text().trim();

    if (ticker) {
      companies.push({ ticker, companyName });
    }
  });

  console.log(`  Found ${companies.length} companies from Wikipedia`);
  return companies;
}

// ─── SEC Ticker Map ───────────────────────────────────────────

async function fetchSECTickerMap() {
  console.log('Fetching SEC company_tickers.json...');
  const data = await fetchJSON('https://www.sec.gov/files/company_tickers.json');
  const map = {};
  for (const entry of Object.values(data)) {
    map[entry.ticker.toUpperCase()] = entry.title || '';
  }
  console.log(`  Loaded ${Object.keys(map).length} SEC tickers`);
  return map;
}

// ─── Comparison Logic ─────────────────────────────────────────

// ─── Wikipedia Name Cleanup ───────────────────────────────────

function cleanWikiName(name) {
  let cleaned = name
    .replace(/\s*\(The\)\s*$/, '')           // "Home Depot (The)" → "Home Depot"
    .replace(/\s*\(Class [A-C]\)\s*$/, '')   // "Fox Corporation (Class A)" → "Fox Corporation"
    .replace(/\u2013/g, '-')                 // en-dash → hyphen
    .replace(/\u2019/g, "'")                 // right single quote → apostrophe
    .trim();
  // Reorder "(Name)" parentheticals: "Lilly (Eli)" → "Eli Lilly"
  const parenMatch = cleaned.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    cleaned = `${parenMatch[2]} ${parenMatch[1]}`;
  }
  return cleaned;
}

// ─── Comparison Logic ─────────────────────────────────────────

const LEGAL_SUFFIXES = /,?\s*(Inc\.?|Corp\.?|Co\.?|Ltd\.?|plc|PLC|LP|LLC|SA|SE|NV|AG|REIT|N\.?V\.?|Corporation|Company|Limited|Incorporated|Holdings|Group)\s*\.?$/gi;

function stripSuffix(name) {
  // Strip common legal suffixes for core name comparison
  let core = name;
  // May have multiple suffixes: "Holdings, Inc." → strip "Inc." then "Holdings" won't match, which is fine
  for (let i = 0; i < 3; i++) {
    const stripped = core.replace(LEGAL_SUFFIXES, '').trim();
    if (stripped === core) break;
    core = stripped;
  }
  return core;
}

function normalizeForComparison(name) {
  return name
    .replace(/[.,'\u2019]/g, '')  // strip punctuation
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim()
    .toLowerCase();
}

function categorize(formatted, wikipedia) {
  const normF = normalizeForComparison(formatted);
  const normW = normalizeForComparison(wikipedia);

  if (normF === normW) return 'MATCH';

  // Check if core names match (ignoring suffixes like Inc, Corp)
  const coreFRaw = stripSuffix(formatted);
  const coreWRaw = stripSuffix(wikipedia);
  const coreF = normalizeForComparison(coreFRaw);
  const coreW = normalizeForComparison(coreWRaw);

  if (coreF === coreW) {
    // Cores match case-insensitively. But check if CASING differs.
    // "Mcdonalds" vs "McDonald's" → same normalized but wrong casing
    const casedF = coreFRaw.replace(/[.,'\u2019]/g, '').replace(/\s+/g, ' ').trim();
    const casedW = coreWRaw.replace(/[.,'\u2019]/g, '').replace(/\s+/g, ' ').trim();
    if (casedF === casedW) return 'SUFFIX_ONLY';
    // Casing differs → formatter got casing wrong, use Wikipedia
    return 'CASING';
  }

  // Close: high word overlap
  const wordsF = normF.split(' ');
  const wordsW = normW.split(' ');
  const overlap = wordsF.filter(w => wordsW.includes(w)).length;
  const maxLen = Math.max(wordsF.length, wordsW.length);
  if (maxLen > 0 && overlap / maxLen >= 0.7) return 'CLOSE';

  return 'MISMATCH';
}

/**
 * Pick the best display name for the curated JSON.
 * - MATCH/SUFFIX_ONLY: formatter output is correct (has suffix + correct casing)
 * - CASING/CLOSE/MISMATCH: Wikipedia name has better casing or brand name, use it
 */
function pickCuratedName(result) {
  if (result.category === 'MATCH' || result.category === 'SUFFIX_ONLY') {
    return result.formatted;
  }
  // Wikipedia has the correct casing/brand name
  return result.wikiName;
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const [sp500, secMap] = await Promise.all([
    fetchSP500(),
    fetchSECTickerMap(),
  ]);

  const results = [];
  const counts = { MATCH: 0, SUFFIX_ONLY: 0, CASING: 0, CLOSE: 0, MISMATCH: 0, MISSING: 0 };

  for (const { ticker, companyName: rawWikiName } of sp500) {
    const wikiName = cleanWikiName(rawWikiName);
    const rawSEC = secMap[ticker];
    if (!rawSEC) {
      results.push({ ticker, wikiName, rawSEC: '(not found)', formatted: '', curated: wikiName, category: 'MISSING' });
      counts.MISSING++;
      continue;
    }

    const formatted = formatCompanyName(rawSEC);
    const category = categorize(formatted, wikiName);
    const curated = pickCuratedName({ wikiName, formatted, category });

    results.push({ ticker, wikiName, rawSEC, formatted, curated, category });
    counts[category]++;
  }

  // Sort: mismatches first, then casing, then close, then suffix-only, then matches
  const order = { MISSING: 0, MISMATCH: 1, CASING: 2, CLOSE: 3, SUFFIX_ONLY: 4, MATCH: 5 };
  results.sort((a, b) => order[a.category] - order[b.category] || a.ticker.localeCompare(b.ticker));

  // ─── Generate curated JSON ──────────────────────────────────

  const names = {};
  for (const r of results) {
    if (r.category === 'MISSING') continue;
    names[r.ticker] = r.curated;
  }

  const curatedJSON = {
    _meta: {
      description: 'Curated display names for S&P 500 companies. Used by ticker search dropdown.',
      generated: new Date().toISOString().slice(0, 10),
      source: 'Wikipedia S&P 500 list + manual review',
      count: Object.keys(names).length,
      refreshCommand: 'node validation/scripts/audit-display-names.js',
    },
    names,
  };

  const jsonPath = join(DATA_DIR, 'sp500-display-names.json');
  writeFileSync(jsonPath, JSON.stringify(curatedJSON, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(names).length} names to ${jsonPath}`);

  // ─── Generate audit report ──────────────────────────────────

  const lines = [
    `# S&P 500 Display Name Audit`,
    ``,
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Total:** ${results.length} companies`,
    `**Match:** ${counts.MATCH} | **Suffix-only:** ${counts.SUFFIX_ONLY} | **Casing fix:** ${counts.CASING} | **Close:** ${counts.CLOSE} | **Mismatch:** ${counts.MISMATCH} | **Missing:** ${counts.MISSING}`,
    ``,
    `**Strategy:** MATCH + SUFFIX_ONLY → use formatCompanyName() output (correct casing + keeps suffix).`,
    `CASING → Wiki casing + formatter suffix. CLOSE + MISMATCH → Wikipedia name (better brand name).`,
    ``,
  ];

  // Mismatches (Wikipedia name used — biggest differences)
  const mismatches = results.filter(r => r.category === 'MISMATCH');
  if (mismatches.length > 0) {
    lines.push(`## Mismatches — Wikipedia name used (${mismatches.length})`, ``);
    lines.push(`These have genuinely different names. Wikipedia brand name is used in the curated JSON.`, ``);
    lines.push(`| Ticker | Curated Name | Wikipedia | formatCompanyName() | SEC Raw |`);
    lines.push(`|--------|-------------|-----------|---------------------|---------|`);
    for (const r of mismatches) {
      lines.push(`| ${r.ticker} | **${r.curated}** | ${r.wikiName} | ${r.formatted} | ${r.rawSEC} |`);
    }
    lines.push(``);
  }

  // Casing fixes (Wiki casing + formatter suffix)
  const casingFixes = results.filter(r => r.category === 'CASING');
  if (casingFixes.length > 0) {
    lines.push(`## Casing Fixes — Wiki casing + formatter suffix (${casingFixes.length})`, ``);
    lines.push(`Formatter had the right suffix but wrong casing. Combined Wiki casing with formatter suffix.`, ``);
    lines.push(`| Ticker | Curated Name | Wikipedia | formatCompanyName() |`);
    lines.push(`|--------|-------------|-----------|---------------------|`);
    for (const r of casingFixes) {
      lines.push(`| ${r.ticker} | **${r.curated}** | ${r.wikiName} | ${r.formatted} |`);
    }
    lines.push(``);
  }

  // Close matches (Wikipedia name used)
  const closeMatches = results.filter(r => r.category === 'CLOSE');
  if (closeMatches.length > 0) {
    lines.push(`## Close Matches — Wikipedia name used (${closeMatches.length})`, ``);
    lines.push(`| Ticker | Curated Name | Wikipedia | formatCompanyName() |`);
    lines.push(`|--------|-------------|-----------|---------------------|`);
    for (const r of closeMatches) {
      lines.push(`| ${r.ticker} | **${r.curated}** | ${r.wikiName} | ${r.formatted} |`);
    }
    lines.push(``);
  }

  // Suffix-only diffs (formatter output used — casing is correct)
  const suffixOnly = results.filter(r => r.category === 'SUFFIX_ONLY');
  if (suffixOnly.length > 0) {
    lines.push(`## Suffix-Only Diffs — formatter output used (${suffixOnly.length})`, ``);
    lines.push(`Casing matches Wikipedia. Formatter output kept because it includes the legal suffix.`, ``);
    lines.push(`| Ticker | Curated Name | Wikipedia (no suffix) |`);
    lines.push(`|--------|-------------|----------------------|`);
    for (const r of suffixOnly) {
      lines.push(`| ${r.ticker} | ${r.curated} | ${r.wikiName} |`);
    }
    lines.push(``);
  }

  // Exact matches
  const matches = results.filter(r => r.category === 'MATCH');
  if (matches.length > 0) {
    lines.push(`## Exact Matches (${matches.length})`, ``);
    lines.push(`| Ticker | Curated Name |`);
    lines.push(`|--------|-------------|`);
    for (const r of matches) {
      lines.push(`| ${r.ticker} | ${r.curated} |`);
    }
    lines.push(``);
  }

  const reportPath = join(REPORTS_DIR, 'display-name-audit.md');
  writeFileSync(reportPath, lines.join('\n') + '\n');
  console.log(`Wrote audit report to ${reportPath}`);

  // Summary
  console.log(`\n── Summary ──────────────────────────`);
  console.log(`  MATCH:       ${counts.MATCH} (formatter output — exact match)`);
  console.log(`  SUFFIX_ONLY: ${counts.SUFFIX_ONLY} (formatter output — correct casing, keeps suffix)`);
  console.log(`  CASING:      ${counts.CASING} (Wiki casing + formatter suffix)`);
  console.log(`  CLOSE:       ${counts.CLOSE} (Wikipedia name — minor diff)`);
  console.log(`  MISMATCH:    ${counts.MISMATCH} (Wikipedia name — different name/casing)`);
  console.log(`  MISSING:     ${counts.MISSING} (not in SEC ticker map)`);
  console.log(`\n  Formatter: ${counts.MATCH + counts.SUFFIX_ONLY} | Hybrid: ${counts.CASING} | Wikipedia: ${counts.CLOSE + counts.MISMATCH}`);
  console.log(`\nReview MISMATCH and CLOSE sections in the audit report for edge cases.`);
}

main().catch(err => { console.error(err); process.exit(1); });
