#!/usr/bin/env node
// Run quality check on V4 API pipeline output for a given ticker.
// Usage: node --loader ./scripts/node-esm-loader.js scripts/run-quality-v4.js [TICKER]
// Default ticker: SFM
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { validateStage } from '../src/engines/critic.js';
import { formatQualityReport } from '../src/engines/qualityFormatter.js';

const ROOT = process.cwd();
const ticker = process.argv[2] || 'SFM';
const dir = join(ROOT, '.thes1s/reports', ticker);

const pipeline = JSON.parse(readFileSync(join(dir, 'pipeline-output.json'), 'utf8'));

// Filter to analysis sections only (skip PSR readers)
const analysisSections = pipeline.sections.filter(s =>
  !s.key.startsWith('annual-reader') && !s.key.startsWith('quarterly-reader')
);

console.log(`Running quality check on ${analysisSections.length} sections for ${ticker}...`);
console.log('Section keys:', analysisSections.map(s => s.key).join(', '));

let dataPacket = {};
try {
  dataPacket = JSON.parse(readFileSync(join(dir, 'data-packet.json'), 'utf8'));
} catch {
  console.warn('No data-packet.json found -- running without DataPacket validation');
}

const report = validateStage(analysisSections, dataPacket);

mkdirSync(join(dir, 'quality'), { recursive: true });
writeFileSync(join(dir, 'quality/pitch-deck-v4.quality.json'), JSON.stringify(report, null, 2));

const md = formatQualityReport(report, { stage: 'pitchDeck', ticker });
writeFileSync(join(dir, 'quality/pitch-deck-v4.quality.md'), md);

console.log('\n=== QUALITY SUMMARY ===');
console.log(`Overall Score: ${report.overallScore} (mechanical) | ${report.overallMethodologyScore ?? '--'} (methodology)`);
console.log(`Overall Passed: ${report.overallPassed}`);
console.log('');
for (const s of report.sections) {
  const highCount = s.issues.filter(i => i.severity === 'high').length;
  const medCount = s.issues.filter(i => i.severity === 'medium').length;
  const methScore = s.methodology?.score ?? '--';
  console.log(`  ${s.sectionKey}: ${s.score} mech / ${methScore} meth (${s.passed ? 'PASS' : 'FAIL'}) -- ${highCount} high, ${medCount} med`);
}

// Methodology gap summary (sections scoring below 80)
const methGaps = report.sections.filter(s => s.methodology?.score != null && s.methodology.score < 80);
if (methGaps.length > 0) {
  console.log('\nMethodology gaps (< 80):');
  for (const s of methGaps) {
    const failed = (s.methodology.checks || []).filter(c => !c.passed);
    console.log(`  ${s.sectionKey} (${s.methodology.score}): ${failed.map(c => c.label).join(', ')}`);
  }
}

console.log(`\nWritten to: ${join(dir, 'quality/')}`);
