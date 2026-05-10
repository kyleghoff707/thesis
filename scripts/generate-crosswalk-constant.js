#!/usr/bin/env node
// Generate api/src/cron/crosswalk.js from the taxonomy JSON files.
// Re-run whenever the crosswalk or taxonomy tree changes.
//
// Usage: node scripts/generate-crosswalk-constant.js

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const cw = JSON.parse(readFileSync(resolve(ROOT, 'industry-classification/yahoo-to-thesis-crosswalk.json'), 'utf8'));
const tree = JSON.parse(readFileSync(resolve(ROOT, 'industry-classification/thesis-taxonomy-tree.json'), 'utf8'));

function esc(s) { return s.replace(/'/g, "\\'"); }

// Build code-to-taxonomy lookup from tree
const codeLookup = {};
for (const sector of tree.sectors) {
  for (const ig of sector.industryGroups) {
    for (const ind of ig.industries) {
      codeLookup[ind.code] = { sector: sector.name, industryGroup: ig.name, industry: ind.name };
    }
  }
}

// Build crosswalk map entries
const mapEntries = [];
for (const m of cw.mappings) {
  const key = m.yahooSector + '|' + m.yahooIndustry;
  let code = m.thesisCode;
  let confidence = 0.85;

  if (m.mappingType === 'split' && m.splitOptions && m.splitOptions.length > 0) {
    const def = m.splitOptions.find(o => o.isDefault) || m.splitOptions[0];
    code = def.thesisCode;
    confidence = 0.65;
  }

  const tax = codeLookup[code];
  if (!tax) { console.warn('Missing taxonomy for code:', code); continue; }

  mapEntries.push(
    "  ['" + esc(key) + "', { thesisCode: '" + code + "', sector: '" + esc(tax.sector) +
    "', industryGroup: '" + esc(tax.industryGroup) + "', industry: '" + esc(tax.industry) +
    "', confidence: " + confidence + " }]"
  );
}

// Assemble output
const lines = [];
lines.push('// Auto-generated from yahoo-to-thesis-crosswalk.json + thesis-taxonomy-tree.json');
lines.push('// Regenerate: node scripts/generate-crosswalk-constant.js');
lines.push('// ' + mapEntries.length + ' mappings, ' + Object.keys(codeLookup).length + ' taxonomy codes');
lines.push('');
lines.push('// Major US exchanges (Yahoo Finance exchange codes)');
lines.push("export const MAJOR_EXCHANGES = new Set([");
lines.push("  'NMS',  // Nasdaq Global Select Market");
lines.push("  'NGM',  // Nasdaq Global Market");
lines.push("  'NCM',  // Nasdaq Capital Market");
lines.push("  'NYQ',  // NYSE");
lines.push("  'ASE',  // NYSE American (AMEX)");
lines.push("  'PCX',  // NYSE Arca");
lines.push("  'BTS',  // BATS/Cboe BZX");
lines.push("]);");
lines.push('');
lines.push('// Non-common-stock ticker patterns (warrants, units, rights, preferred)');
lines.push('export const NON_COMMON_STOCK = [');
lines.push('  /[.\\-\\/]W[S]?$/,     // warrants');
lines.push('  /[.\\-\\/]U$/,          // units');
lines.push('  /[.\\-\\/]R[T]?$/,      // rights');
lines.push('  /[.\\-\\/]P[A-Z]?$/,    // preferred');
lines.push('  /[.\\-\\/]PR[.\\-\\/]?[A-Z]?$/, // preferred (alt)');
lines.push('];');
lines.push('');
lines.push('// Yahoo sector|industry -> Thesis classification');
lines.push('export const YAHOO_TO_THES1S = new Map([');
lines.push(mapEntries.join(',\n'));
lines.push(']);');
lines.push('');
lines.push('/**');
lines.push(' * Classify a ticker using Yahoo Finance quoteSummary data.');
lines.push(' * Pure function, no side effects.');
lines.push(' *');
lines.push(' * @param {object} assetProfile - Yahoo assetProfile module data');
lines.push(' * @param {object} priceData - Yahoo price module data');
lines.push(' * @returns {{ status: string, ... }}');
lines.push(' */');
lines.push('export function classifyTicker(assetProfile, priceData) {');
lines.push('  const exchange = priceData?.exchange;');
lines.push('  if (!exchange || !MAJOR_EXCHANGES.has(exchange)) {');
lines.push("    return { status: 'excluded', reason: 'non-major-exchange', exchange };");
lines.push('  }');
lines.push('');
lines.push('  const quoteType = priceData?.quoteType;');
lines.push("  if (quoteType && quoteType !== 'EQUITY') {");
lines.push("    return { status: 'excluded', reason: 'non-equity', quoteType };");
lines.push('  }');
lines.push('');
lines.push('  const yahooSector = assetProfile?.sector;');
lines.push('  const yahooIndustry = assetProfile?.industry;');
lines.push('  if (!yahooSector || !yahooIndustry) {');
lines.push("    return { status: 'unmapped', reason: 'missing-yahoo-classification' };");
lines.push('  }');
lines.push('');
lines.push("  const key = yahooSector + '|' + yahooIndustry;");
lines.push('  const match = YAHOO_TO_THES1S.get(key);');
lines.push('  if (!match) {');
lines.push("    return { status: 'unmapped', reason: 'no-crosswalk-match', yahooSector, yahooIndustry };");
lines.push('  }');
lines.push('');
lines.push('  return {');
lines.push("    status: 'classified',");
lines.push('    thesisCode: match.thesisCode,');
lines.push('    sector: match.sector,');
lines.push('    industryGroup: match.industryGroup,');
lines.push('    industry: match.industry,');
lines.push('    confidence: match.confidence,');
lines.push('    exchange,');
lines.push('    yahooSector,');
lines.push('    yahooIndustry,');
lines.push('  };');
lines.push('}');
lines.push('');
lines.push('export function isNonCommonStock(ticker) {');
lines.push('  return NON_COMMON_STOCK.some(re => re.test(ticker));');
lines.push('}');
lines.push('');

const outPath = resolve(ROOT, 'api/src/cron/crosswalk.js');
writeFileSync(outPath, lines.join('\n'));
console.log('Generated ' + outPath + ' (' + mapEntries.length + ' mappings, ' + Object.keys(codeLookup).length + ' taxonomy codes)');
