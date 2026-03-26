#!/usr/bin/env node
// CLI: node --loader ./scripts/node-esm-loader.js scripts/data-quality-checkpoint.js TICKER
// Reads DataPacket + filings-md/ and outputs a structured quality report.
// Exits 0 if can proceed, exits 1 if critical fields missing.
// Output: JSON to stdout with { canProceed, summary, criticalMissing, warnings, filingQuality }

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

// ── Field Classification Constants ──────────────────────────────────

export const CRITICAL_FIELDS = ['companyInfo', 'financials', 'filings'];

export const IMPORTANT_FIELDS = ['growthRates', 'returnMetrics', 'fcf', 'ruleOneScore', 'ttm'];

export const NICE_TO_HAVE_FIELDS = [
  'analystEstimates', 'gurus', 'insiders', 'compensation',
  'peers', 'peerMetrics', 'events', 'prices',
  'transcriptAvailability', 'currentPrice', 'keyMetrics',
  'debtMetrics', 'caveats',
];

// ── classifyField ───────────────────────────────────────────────────

export function classifyField(fieldName) {
  if (CRITICAL_FIELDS.includes(fieldName)) return 'critical';
  if (IMPORTANT_FIELDS.includes(fieldName)) return 'important';
  if (NICE_TO_HAVE_FIELDS.includes(fieldName)) return 'nice-to-have';
  return 'unknown';
}

// ── assessDataPacket ────────────────────────────────────────────────

export function assessDataPacket(dataPacket) {
  const allFields = [...CRITICAL_FIELDS, ...IMPORTANT_FIELDS, ...NICE_TO_HAVE_FIELDS];
  const populated = [];
  const criticalMissing = [];
  const importantMissing = [];
  const warnings = [];

  for (const field of allFields) {
    const value = dataPacket[field];
    const isNull = value == null;

    if (isNull) {
      const classification = classifyField(field);
      if (classification === 'critical') {
        criticalMissing.push(field);
      } else if (classification === 'important') {
        importantMissing.push(field);
      } else {
        warnings.push(field);
      }
    } else {
      populated.push(field);
    }
  }

  return {
    canProceed: criticalMissing.length === 0,
    populated,
    criticalMissing,
    importantMissing,
    warnings,
    fieldCount: {
      total: allFields.length,
      populated: populated.length,
      missing: criticalMissing.length + importantMissing.length + warnings.length,
    },
  };
}

// ── assessFilings ───────────────────────────────────────────────────
// Accepts an array of { filename, data } objects where data is the parsed JSON
// from a filings-md/ file.

export function assessFilings(files) {
  if (files.length === 0) {
    return {
      complete: false,
      files: [],
      tenKCount: 0,
      tenQCount: 0,
      totalSections: 0,
    };
  }

  let tenKCount = 0;
  let tenQCount = 0;
  let totalSections = 0;
  let allTenKsHaveEnoughSections = true;

  const fileDetails = files.map(({ filename, data }) => {
    const sections = Object.keys(data.sections || {});
    const sectionCount = sections.length;
    totalSections += sectionCount;

    if (data.form === '10-K') {
      tenKCount++;
      if (sectionCount < 3) {
        allTenKsHaveEnoughSections = false;
      }
    } else if (data.form === '10-Q') {
      tenQCount++;
    }

    return {
      filename,
      form: data.form,
      date: data.date,
      sectionCount,
      sections,
    };
  });

  return {
    complete: tenKCount >= 1 && allTenKsHaveEnoughSections,
    files: fileDetails,
    tenKCount,
    tenQCount,
    totalSections,
  };
}

// ── Field Description Helper ────────────────────────────────────────

function describeField(field, value) {
  if (value == null) return 'MISSING';
  if (field === 'companyInfo') return value.name || value.companyName || 'populated';
  if (field === 'financials') return `${value.years?.length || '?'} years`;
  if (field === 'filings') return `${Array.isArray(value) ? value.length : '?'} filings`;
  if (field === 'gurus') {
    const count = value.holdings?.length || value.count || value.holders?.length || value.length || 0;
    return `${count} gurus`;
  }
  if (field === 'growthRates') return 'populated';
  if (field === 'returnMetrics') return 'populated';
  if (field === 'fcf') return 'populated';
  if (field === 'ttm') return 'populated';
  if (field === 'ruleOneScore') return `composite: ${value.composite ?? '--'}`;
  return 'populated';
}

// ── Main (CLI) ──────────────────────────────────────────────────────

async function main() {
  const ticker = process.argv[2]?.toUpperCase();

  if (!ticker) {
    console.error('Usage: node scripts/data-quality-checkpoint.js <TICKER>');
    console.error('Example: node scripts/data-quality-checkpoint.js AAPL');
    process.exit(1);
  }

  const baseDir = join(process.cwd(), '.thes1s', 'reports', ticker);
  const dpPath = join(baseDir, 'data-packet.json');

  if (!existsSync(dpPath)) {
    console.error(`DataPacket not found at ${dpPath}. Run assemble-data.js first.`);
    process.exit(1);
  }

  // Read DataPacket
  const dataPacket = JSON.parse(readFileSync(dpPath, 'utf8'));

  // Read filings-md/ directory
  const filingsDir = join(baseDir, 'filings-md');
  let filingFiles = [];
  if (existsSync(filingsDir)) {
    const filenames = readdirSync(filingsDir).filter(f => f.endsWith('.json'));
    filingFiles = filenames.map(filename => ({
      filename,
      data: JSON.parse(readFileSync(join(filingsDir, filename), 'utf8')),
    }));
  }

  // Assess
  const packetResult = assessDataPacket(dataPacket);
  const filingResult = assessFilings(filingFiles);

  // Print human-readable summary to stderr
  const allFields = [...CRITICAL_FIELDS, ...IMPORTANT_FIELDS, ...NICE_TO_HAVE_FIELDS];

  process.stderr.write('\n');
  process.stderr.write('═══════════════════════════════════════════════\n');
  process.stderr.write(`DATA QUALITY CHECKPOINT — ${ticker}\n`);
  process.stderr.write('═══════════════════════════════════════════════\n\n');
  process.stderr.write(`DataPacket Fields: ${packetResult.fieldCount.populated}/${packetResult.fieldCount.total}\n`);
  process.stderr.write('───────────────────────────────────────────────\n');

  // Group by classification
  const groups = [
    { label: 'CRITICAL', fields: CRITICAL_FIELDS },
    { label: 'IMPORTANT', fields: IMPORTANT_FIELDS },
    { label: 'NICE-TO-HAVE', fields: NICE_TO_HAVE_FIELDS },
  ];

  for (const group of groups) {
    process.stderr.write(`${group.label}:\n`);
    for (const field of group.fields) {
      const value = dataPacket[field];
      const isNull = value == null;
      const mark = isNull ? '\u2717' : '\u2713';
      const desc = describeField(field, value);
      const padded = field.padEnd(24);
      process.stderr.write(`  ${mark} ${padded} ${desc}\n`);
    }
  }

  process.stderr.write('\n');
  process.stderr.write(`Filing Pre-Processing: ${filingResult.tenKCount} 10-Ks, ${filingResult.tenQCount} 10-Qs\n`);
  process.stderr.write('───────────────────────────────────────────────\n');

  if (filingResult.files.length === 0) {
    process.stderr.write('  No pre-processed filings found.\n');
  } else {
    for (const f of filingResult.files) {
      process.stderr.write(`  ${f.filename.padEnd(28)} ${f.sectionCount} sections (${f.sections.join(', ')})\n`);
    }
  }

  process.stderr.write('\n');
  if (packetResult.canProceed) {
    process.stderr.write('\u2713 VERDICT: PROCEED\n');
  } else {
    process.stderr.write(`\u2717 VERDICT: BLOCKED — missing critical fields: ${packetResult.criticalMissing.join(', ')}\n`);
  }
  process.stderr.write('═══════════════════════════════════════════════\n\n');

  // Print machine-readable JSON to stdout
  const output = {
    ticker,
    canProceed: packetResult.canProceed,
    dataPacket: packetResult,
    filingQuality: filingResult,
  };
  console.log(JSON.stringify(output, null, 2));

  // Exit code based on result
  process.exit(packetResult.canProceed ? 0 : 1);
}

// Only run main when executed as CLI (not when imported for testing)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('data-quality-checkpoint.js') ||
  process.argv[1].includes('data-quality-checkpoint')
);

if (isMainModule) {
  main().catch((err) => {
    console.error(`Data quality checkpoint failed: ${err.message}`);
    process.exit(1);
  });
}
