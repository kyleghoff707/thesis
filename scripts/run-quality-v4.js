#!/usr/bin/env node
// Run quality check on V4 API pipeline output for a given ticker and stage.
// Usage:
//   node --loader ./scripts/node-esm-loader.js scripts/run-quality-v4.js [TICKER] [--stage pitchDeck|fullStory]
// Default ticker: SFM
// Default stage: auto-detect (fullStory if section files exist, else pitchDeck)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { validateStage } from '../src/engines/critic.js';
import { formatQualityReport } from '../src/engines/qualityFormatter.js';

const ROOT = process.cwd();

// Parse arguments
const args = process.argv.slice(2);
let ticker = 'SFM';
let stageArg = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--stage' && args[i + 1]) {
    stageArg = args[i + 1];
    i++;
  } else if (!args[i].startsWith('--')) {
    ticker = args[i];
  }
}

const dir = join(ROOT, '.thes1s/reports', ticker);
const sectionsDir = join(dir, 'sections');

// Auto-detect stage if not specified
function detectStage() {
  if (stageArg) return stageArg;

  // Check for Full Story section files
  if (existsSync(sectionsDir)) {
    const files = readdirSync(sectionsDir).filter(f => f.startsWith('fullStory-S') && f.endsWith('.json'));
    if (files.length > 0) return 'fullStory';
  }

  // Check for full-story.json with sections array
  const fullStoryPath = join(dir, 'full-story.json');
  if (existsSync(fullStoryPath)) {
    try {
      const fs = JSON.parse(readFileSync(fullStoryPath, 'utf8'));
      if (Array.isArray(fs.sections) && fs.sections.length > 0) return 'fullStory';
    } catch { /* fall through */ }
  }

  return 'pitchDeck';
}

const stage = detectStage();

let analysisSections;

if (stage === 'fullStory') {
  // Read Full Story sections from individual files or assembled report
  analysisSections = [];

  // Try individual section files first
  if (existsSync(sectionsDir)) {
    const files = readdirSync(sectionsDir)
      .filter(f => f.startsWith('fullStory-S') && f.endsWith('.json'))
      .sort();
    for (const file of files) {
      try {
        const section = JSON.parse(readFileSync(join(sectionsDir, file), 'utf8'));
        analysisSections.push(section);
      } catch (err) {
        console.warn(`Failed to parse ${file}: ${err.message}`);
      }
    }
  }

  // Fallback: read from full-story.json if no individual files found
  if (analysisSections.length === 0) {
    const fullStoryPath = join(dir, 'full-story.json');
    if (existsSync(fullStoryPath)) {
      const fs = JSON.parse(readFileSync(fullStoryPath, 'utf8'));
      if (Array.isArray(fs.sections)) {
        analysisSections = fs.sections;
      }
    }
  }

  if (analysisSections.length === 0) {
    console.error(`No Full Story sections found for ${ticker}`);
    process.exit(1);
  }
} else {
  // Existing Pitch Deck path
  const pipeline = JSON.parse(readFileSync(join(dir, 'pipeline-output.json'), 'utf8'));

  // Filter to analysis sections only (skip PSR readers)
  analysisSections = pipeline.sections.filter(s =>
    !s.key.startsWith('annual-reader') && !s.key.startsWith('quarterly-reader')
  );
}

console.log(`Running quality check on ${analysisSections.length} sections for ${ticker} (stage: ${stage})...`);
console.log('Section keys:', analysisSections.map(s => s.key).join(', '));

let dataPacket = {};
try {
  dataPacket = JSON.parse(readFileSync(join(dir, 'data-packet.json'), 'utf8'));
} catch {
  console.warn('No data-packet.json found -- running without DataPacket validation');
}

const report = validateStage(analysisSections, dataPacket);

mkdirSync(join(dir, 'quality'), { recursive: true });

// Output files named per stage
const prefix = stage === 'fullStory' ? 'full-story' : 'pitch-deck';
writeFileSync(join(dir, `quality/${prefix}-v4.quality.json`), JSON.stringify(report, null, 2));

const md = formatQualityReport(report, { stage, ticker });
writeFileSync(join(dir, `quality/${prefix}-v4.quality.md`), md);

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
