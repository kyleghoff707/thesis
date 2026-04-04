#!/usr/bin/env node
// CLI entry point: Run the full AI agent pipeline for a given ticker
// Usage: node --loader ./scripts/node-esm-loader.js scripts/run-pipeline.js [TICKER] [STAGE]
//        node --loader ./scripts/node-esm-loader.js scripts/run-pipeline.js MNST --stage all
//
// Assembles a DataPacket, runs the pipeline for any stage (onePager, pitchDeck, fullStory)
// via pipelineManager.js, logs wave-by-wave progress, and writes output to
// .thes1s/reports/{TICKER}/pipeline-output.json
//
// When --stage all: chains One Pager -> Pitch Deck -> Full Story with automatic
// gate checks between stages. Stops on first gate failure.
//
// Prerequisites:
//   - .env.local with VITE_CLAUDE_KEY
//   - Node.js 18+ (native fetch required)
//   - Must use custom ESM loader for Vite-style extension-less imports

import '../src/engines/nodeAdapter.js';
import { assembleDataPacket } from '../src/engines/dataExport.js';
import { runPipeline } from '../src/engines/pipelineManager.js';
import { formatBudgetReport } from '../src/engines/contextBudget.js';
import { fetchFilingMarkdown } from '../src/engines/filingMarkdown.js';
import { extractAllSections } from '../src/engines/filingSections.js';
import { validateStage } from '../src/engines/critic.js';
import { formatQualityReport } from '../src/engines/qualityFormatter.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  createProgress, advanceState, updateGenerationStatus, initGenerationStatus,
  updatePhaseStatus, startSection, completeSection, saveSectionOutput, saveBudgetReport,
} from '../src/engines/progressState.js';

// Canonical section fields (19 fields) — ensures consistent shape across all tickers
const CANONICAL_SECTION_FIELDS = {
  key: null,
  title: null,
  sectionNumber: null,
  status: 'complete',
  confidence: null,
  verdict: null,
  verdictRationale: null,
  summary: null,
  data: {},
  narrative: null,
  citations: [],
  tables: [],
  charts: [],
  redFlags: [],
  primarySourceInsights: [],
  crossCuttingFindings: [],
  searchesPerformed: [],
  modelUsed: null,
  tokenCost: null,
};

// Normalize a section object: fill missing fields with defaults, remove unexpected fields
function normalizeSection(section) {
  if (!section) return null;
  const normalized = {};
  for (const [field, defaultVal] of Object.entries(CANONICAL_SECTION_FIELDS)) {
    normalized[field] = section[field] !== undefined ? section[field] : defaultVal;
  }
  return normalized;
}

// Normalize all sections in a pipeline result
function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map(normalizeSection).filter(Boolean);
}

// Argument parsing — supports both old and new syntax:
//   node run-pipeline.js MNST pitchDeck          (backward compat: positional)
//   node run-pipeline.js MNST --stage all         (new: --stage flag)
//   node run-pipeline.js MNST --stage pitchDeck   (new: --stage flag for single stage)
const args = process.argv.slice(2);
let ticker = 'SFM';
let stage = 'pitchDeck';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--stage' && args[i + 1]) {
    stage = args[i + 1];
    i++;
  } else if (!args[i].startsWith('--')) {
    if (i === 0) ticker = args[i].toUpperCase();
    else stage = args[i]; // backward compat: positional stage
  }
}

// Poll interval for checkpoint response (seconds)
const CHECKPOINT_POLL_INTERVAL = 2;

// Wait for PM response at a checkpoint — polls for checkpoint-{N}-response.json
async function waitForCheckpointResponse(currentTicker, waveNumber) {
  const reportsDir = join(process.cwd(), '.thes1s', 'reports', currentTicker.toUpperCase());
  const responsePath = join(reportsDir, `checkpoint-${waveNumber}-response.json`);

  // Clean up any stale response file from a previous run
  if (existsSync(responsePath)) {
    unlinkSync(responsePath);
  }

  console.log(`  ⏸  Waiting for PM review (checkpoint ${waveNumber})...`);
  console.log(`     Pipeline paused. PM reviews in the app, then clicks Continue or Re-run.`);

  // Poll for response file
  while (true) {
    await new Promise(resolve => setTimeout(resolve, CHECKPOINT_POLL_INTERVAL * 1000));
    if (existsSync(responsePath)) {
      try {
        const raw = readFileSync(responsePath, 'utf-8');
        const response = JSON.parse(raw);
        console.log(`  ▶  PM responded: ${response.action}`);
        if (response.comments) {
          console.log(`     Feedback: ${response.comments}`);
        }
        // Clean up response file
        unlinkSync(responsePath);
        return response;
      } catch (err) {
        console.warn(`  Failed to parse checkpoint response: ${err.message}`);
      }
    }
  }
}

// Shared wave progress callback — writes progress state + pauses at checkpoints for PM review
const onWaveComplete = async (waveNumber, results, budgetSummary, cacheSummary) => {
  const sectionCount = results.filter(r => r != null).length;
  console.log(`--- Wave ${waveNumber} complete ---`);
  console.log(`  Sections produced: ${sectionCount}`);
  if (budgetSummary) {
    console.log(`  Running cost: $${budgetSummary.totals?.cost?.toFixed(4) || '?'}`);
  }
  if (cacheSummary) {
    console.log(`  Cache: ${cacheSummary.hitRatePct || '?'} hit rate (${cacheSummary.totalRead || 0} read / ${cacheSummary.totalWrite || 0} write tokens)`);
  }

  // Mark completed sections in generation-status.json
  for (const section of results) {
    if (section?.key) {
      try { completeSection(ticker, section.key); } catch { /* non-critical */ }
    }
  }

  // Update phase status
  try { updatePhaseStatus(ticker, waveNumber, 'complete'); } catch { /* non-critical */ }

  // Advance state to CHECKPOINT_N
  const checkpointState = `CHECKPOINT_${waveNumber}`;
  try {
    advanceState(ticker, checkpointState);
    console.log(`  State: ${checkpointState}`);
  } catch (err) {
    // If checkpoint state transition fails (e.g., OP has no checkpoints), skip pause
    console.log(`  Skipping checkpoint pause (${err.message})`);
    console.log('');
    return null;
  }

  // Write checkpoint data (data gaps, findings) for the frontend
  const reportsDir = join(process.cwd(), '.thes1s', 'reports', ticker.toUpperCase());
  const checkpointData = {
    waveNumber,
    sections: results.filter(r => r != null).map(r => r.key || 'unknown'),
    dataGaps: [], // TODO: extract from agent results when available
    budgetSummary: budgetSummary || null,
    timestamp: new Date().toISOString(),
  };
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, `checkpoint-${waveNumber}-data.json`), JSON.stringify(checkpointData, null, 2));

  // Pause and wait for PM response
  const response = await waitForCheckpointResponse(ticker, waveNumber);

  if (response.action === 'rerun') {
    console.log(`  Re-running wave ${waveNumber}...`);
    // Advance back to WAVE_N_RUNNING for the re-run
    try { advanceState(ticker, `WAVE_${waveNumber}_RUNNING`); } catch { /* state may not support this */ }
    // Return 'rerun' as feedback — pipelineManager will need to handle this
    return '__RERUN__';
  }

  // Continue — advance state to next wave
  const nextWave = waveNumber + 1;
  const nextWaveState = `WAVE_${nextWave}_RUNNING`;
  try {
    advanceState(ticker, nextWaveState);
    updatePhaseStatus(ticker, nextWave, 'active');
  } catch {
    // If next wave doesn't exist (last checkpoint), advance to SYNTHESIS
    try { advanceState(ticker, 'SYNTHESIS'); } catch { /* non-critical */ }
  }

  // Mark next wave sections as running
  console.log('');
  return response.comments || null; // PM feedback text folded into next wave
};

// Shared DataPacket assembly + filing pre-processing
async function assembleAndPreprocess() {
  console.log('Assembling DataPacket...');
  const startAssembly = Date.now();
  let dataPacket;
  try {
    dataPacket = await assembleDataPacket(ticker);
  } catch (err) {
    console.error(`Failed to assemble DataPacket for ${ticker}:`, err.message);
    process.exit(1);
  }
  const assemblyTime = ((Date.now() - startAssembly) / 1000).toFixed(1);
  const fieldCount = Object.keys(dataPacket).length;
  const populatedFields = Object.entries(dataPacket)
    .filter(([, v]) => v != null)
    .length;
  console.log(`DataPacket assembled in ${assemblyTime}s (${populatedFields}/${fieldCount} fields populated)`);
  if (dataPacket.errors?.length > 0) {
    console.log(`  Assembly warnings: ${dataPacket.errors.length}`);
    for (const err of dataPacket.errors) {
      console.log(`    - ${err}`);
    }
  }
  console.log('');

  // Pre-process filings (fetch 10-K/10-Q content for PSR agents)
  const filings = dataPacket.filings || [];
  const annuals = filings.filter(f => f.form === '10-K').slice(0, 5);
  const quarterlies = filings.filter(f => f.form === '10-Q').slice(0, 4);
  const filingsToProcess = [...annuals, ...quarterlies];

  if (filingsToProcess.length > 0 && dataPacket.companyInfo?.cik) {
    console.log(`Pre-processing ${annuals.length} 10-Ks + ${quarterlies.length} 10-Qs...`);
    const startFilings = Date.now();
    const filingContent = {};

    for (const f of filingsToProcess) {
      try {
        const result = await fetchFilingMarkdown({
          cik: dataPacket.companyInfo.cik,
          accessionNumber: f.accessionNumber,
          primaryDocument: f.primaryDocument,
        });
        if (result?.markdown) {
          const sections = extractAllSections(result.markdown, f.form);
          const sectionCount = Object.keys(sections).length;
          const key = `${f.form}-${f.filingDate}`;
          filingContent[key] = { form: f.form, date: f.filingDate, sections, fullLength: result.markdown.length };
          console.log(`  ${f.form} ${f.filingDate}: ${sectionCount} sections (${(result.markdown.length / 1024).toFixed(0)}KB)`);
        }
      } catch (err) {
        console.warn(`  ${f.form} ${f.filingDate}: failed - ${err.message}`);
      }
    }

    const filingTime = ((Date.now() - startFilings) / 1000).toFixed(1);
    const processedCount = Object.keys(filingContent).length;
    console.log(`Filing pre-processing: ${processedCount}/${filingsToProcess.length} in ${filingTime}s\n`);

    if (processedCount > 0) {
      dataPacket.filingContent = filingContent;
    }
  }

  return { dataPacket, assemblyTime };
}

// Single-stage mode (backward-compatible with original main())
async function main() {
  console.log(`\n=== Thes1s Pipeline Runner ===`);
  console.log(`Ticker: ${ticker}`);
  console.log(`Stage: ${stage}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  // Initialize progress tracking for the UI
  try {
    createProgress(ticker, stage);
    initGenerationStatus(ticker, stage);
    advanceState(ticker, 'DATA_ASSEMBLY');
    console.log('Progress tracking initialized\n');
  } catch (err) {
    console.warn(`Progress init warning: ${err.message}`);
  }

  const { dataPacket, assemblyTime } = await assembleAndPreprocess();

  // Advance state to first wave
  try {
    advanceState(ticker, 'WAVE_1_RUNNING');
    updatePhaseStatus(ticker, 1, 'active');
  } catch { /* non-critical */ }

  // Run pipeline
  console.log(`Running ${stage} pipeline...\n`);
  const startPipeline = Date.now();

  let result;
  try {
    result = await runPipeline(stage, dataPacket, { onWaveComplete });
  } catch (err) {
    console.error(`Pipeline failed:`, err.message);
    console.error(err.stack);
    process.exit(1);
  }
  const pipelineTime = ((Date.now() - startPipeline) / 1000).toFixed(1);

  // Mark generation complete in progress tracking
  try {
    advanceState(ticker, 'COMPLETE');
    updateGenerationStatus(ticker, { state: 'COMPLETE' });
  } catch { /* non-critical */ }

  // Normalize section schemas for consistency across tickers (per D-07)
  if (result.sections) {
    result.sections = normalizeSections(result.sections);
  }

  // Report results
  console.log('\n=== Pipeline Results ===\n');
  console.log(`Total time: ${pipelineTime}s`);
  console.log(`Sections produced: ${result.sections?.length || 0}`);
  console.log(`Errors: ${result.errors?.length || 0}`);
  console.log('');

  // Section details
  if (result.sections?.length > 0) {
    console.log('Sections:');
    for (const section of result.sections) {
      const citations = section.citations?.length || 0;
      const redFlags = section.redFlags?.length || 0;
      const searches = section.searchesPerformed?.length || 0;
      console.log(`  [${section.sectionNumber || '?'}] ${section.key || '?'} — ${section.title || 'untitled'}`);
      console.log(`      status: ${section.status || '?'} | confidence: ${section.confidence || '?'} | verdict: ${section.verdict || '?'}`);
      console.log(`      citations: ${citations} | redFlags: ${redFlags} | searches: ${searches}`);
    }
    console.log('');
  }

  // Budget report
  if (result.budget) {
    console.log(formatBudgetReport(result.budget));
    console.log('');
  }

  // Error details
  if (result.errors?.length > 0) {
    console.log('Errors:');
    for (const err of result.errors) {
      console.log(`  - ${typeof err === 'string' ? err : JSON.stringify(err)}`);
    }
    console.log('');
  }

  // Write output
  const outputDir = join(process.cwd(), '.thes1s', 'reports', ticker);
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'pipeline-output.json');
  writeFileSync(outputPath, JSON.stringify({
    ticker,
    stage,
    completedAt: new Date().toISOString(),
    assemblyTimeSeconds: parseFloat(assemblyTime),
    pipelineTimeSeconds: parseFloat(pipelineTime),
    sectionCount: result.sections?.length || 0,
    errorCount: result.errors?.length || 0,
    sections: result.sections,
    budget: result.budget,
    cacheStats: result.cacheStats,
    errors: result.errors,
  }, null, 2));
  console.log(`Output written to ${outputPath}`);

  // For pitchDeck: also write pitch-deck.json (canonical name for Vite middleware)
  if (stage === 'pitchDeck') {
    const pdOutputPath = join(outputDir, 'pitch-deck.json');
    writeFileSync(pdOutputPath, JSON.stringify({
      ticker,
      stage,
      completedAt: new Date().toISOString(),
      pipelineTimeSeconds: parseFloat(pipelineTime),
      sectionCount: result.sections?.length || 0,
      errorCount: result.errors?.length || 0,
      sections: result.sections,
      budget: result.budget,
      cacheStats: result.cacheStats,
      errors: result.errors,
    }, null, 2));
    console.log(`Pitch Deck output written to ${pdOutputPath}`);
  }

  // For onePager: write backward-compatible one-pager.json alongside pipeline-output.json
  if (stage === 'onePager' && result.singleCallOutput) {
    const opOutputPath = join(outputDir, 'one-pager.json');
    writeFileSync(opOutputPath, JSON.stringify(result.singleCallOutput, null, 2));
    console.log(`One Pager output written to ${opOutputPath}`);
  }

  // One Pager-specific summary
  if (stage === 'onePager' && result.singleCallOutput) {
    console.log(`Overall Verdict: ${result.singleCallOutput.overallVerdict}`);
  }

  // Exit code
  const expectedSections = stage === 'pitchDeck' ? 11 : 6; // fullStory = 6, onePager = 6
  const produced = result.sections?.length || 0;
  if (produced >= expectedSections) {
    console.log(`\nAll ${produced} sections produced. Pipeline complete.`);
    process.exit(0);
  } else {
    console.log(`\nOnly ${produced}/${expectedSections} sections produced. Check errors above.`);
    process.exit(1);
  }
}

// Full 3-stage chaining mode (--stage all)
// Chains: One Pager -> Pitch Deck -> Full Story
// Gate checks between stages; stops on first failure
async function runAllStages() {
  const startTotal = Date.now();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Thes1s Full Pipeline — ${ticker}`);
  console.log(`  Stages: One Pager -> Pitch Deck -> Full Story`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  const outputDir = join(process.cwd(), '.thes1s', 'reports', ticker);
  mkdirSync(outputDir, { recursive: true });
  const qualityDir = join(outputDir, 'quality');
  mkdirSync(qualityDir, { recursive: true });
  const sectionsDir = join(outputDir, 'sections');
  mkdirSync(sectionsDir, { recursive: true });

  // Step 1: Assemble DataPacket once (shared across all stages)
  const { dataPacket } = await assembleAndPreprocess();

  // ================================================================
  // STAGE 1: ONE PAGER
  // ================================================================
  console.log('\n' + '='.repeat(60));
  console.log('STAGE 1: ONE PAGER');
  console.log('='.repeat(60) + '\n');

  // Initialize progress tracking for One Pager
  try {
    createProgress(ticker, 'onePager');
    initGenerationStatus(ticker, 'onePager');
    advanceState(ticker, 'DATA_ASSEMBLY');
    advanceState(ticker, 'WAVE_1_RUNNING');
    updatePhaseStatus(ticker, 1, 'active');
  } catch (err) { console.warn(`OP progress init: ${err.message}`); }

  const opStart = Date.now();
  let opResult;
  try {
    opResult = await runPipeline('onePager', dataPacket, { onWaveComplete });
  } catch (err) {
    console.error('One Pager pipeline failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
  const opTime = ((Date.now() - opStart) / 1000).toFixed(1);
  console.log(`One Pager completed in ${opTime}s`);

  // Mark OP complete in progress tracking
  try {
    advanceState(ticker, 'COMPLETE');
    updateGenerationStatus(ticker, { state: 'COMPLETE' });
  } catch { /* non-critical */ }

  // Normalize OP sections (per D-07)
  if (opResult.sections) {
    opResult.sections = normalizeSections(opResult.sections);
  }

  // Write one-pager output files
  const opOutput = {
    ticker,
    stage: 'onePager',
    completedAt: new Date().toISOString(),
    pipelineTimeSeconds: parseFloat(opTime),
    sections: opResult.sections,
    budget: opResult.budget,
    cacheStats: opResult.cacheStats,
    errors: opResult.errors,
  };
  writeFileSync(join(outputDir, 'pipeline-output-op.json'), JSON.stringify(opOutput, null, 2));
  if (opResult.singleCallOutput) {
    writeFileSync(join(outputDir, 'one-pager.json'), JSON.stringify(opResult.singleCallOutput, null, 2));
  }

  // Gate check: OP verdict (per D-04)
  const opVerdict = opResult.singleCallOutput?.overallVerdict;
  console.log(`\nOne Pager verdict: ${opVerdict}`);
  if (opVerdict !== 'PASS') {
    console.error(`\nGATE FAILED: One Pager verdict is ${opVerdict}, not PASS. Pipeline stopped.`);
    console.error(`Review: ${join(outputDir, 'one-pager.json')}`);
    process.exit(1);
  }
  console.log('Gate PASSED — advancing to Pitch Deck\n');

  // ================================================================
  // STAGE 2: PITCH DECK
  // ================================================================
  console.log('='.repeat(60));
  console.log('STAGE 2: PITCH DECK');
  console.log('='.repeat(60) + '\n');

  // Initialize progress tracking for Pitch Deck
  try {
    createProgress(ticker, 'pitchDeck');
    initGenerationStatus(ticker, 'pitchDeck');
    advanceState(ticker, 'DATA_ASSEMBLY');
    advanceState(ticker, 'WAVE_1_RUNNING');
    updatePhaseStatus(ticker, 1, 'active');
  } catch (err) { console.warn(`PD progress init: ${err.message}`); }

  const pdStart = Date.now();
  let pdResult;
  try {
    pdResult = await runPipeline('pitchDeck', dataPacket, { onWaveComplete });
  } catch (err) {
    console.error('Pitch Deck pipeline failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
  const pdTime = ((Date.now() - pdStart) / 1000).toFixed(1);
  console.log(`Pitch Deck completed in ${pdTime}s`);

  // Mark PD complete in progress tracking
  try {
    advanceState(ticker, 'COMPLETE');
    updateGenerationStatus(ticker, { state: 'COMPLETE' });
  } catch { /* non-critical */ }

  // Normalize PD sections (per D-07)
  if (pdResult.sections) {
    pdResult.sections = normalizeSections(pdResult.sections);
  }

  // Write pipeline-output.json (PD canonical name)
  writeFileSync(join(outputDir, 'pipeline-output.json'), JSON.stringify({
    ticker,
    stage: 'pitchDeck',
    completedAt: new Date().toISOString(),
    pipelineTimeSeconds: parseFloat(pdTime),
    sectionCount: pdResult.sections?.length || 0,
    errorCount: pdResult.errors?.length || 0,
    sections: pdResult.sections,
    budget: pdResult.budget,
    cacheStats: pdResult.cacheStats,
    errors: pdResult.errors,
  }, null, 2));

  // Also write pitch-deck.json (canonical name for Vite middleware)
  writeFileSync(join(outputDir, 'pitch-deck.json'), JSON.stringify({
    ticker,
    stage: 'pitchDeck',
    completedAt: new Date().toISOString(),
    pipelineTimeSeconds: parseFloat(pdTime),
    sectionCount: pdResult.sections?.length || 0,
    errorCount: pdResult.errors?.length || 0,
    sections: pdResult.sections,
    budget: pdResult.budget,
    cacheStats: pdResult.cacheStats,
    errors: pdResult.errors,
  }, null, 2));
  console.log(`Pitch Deck canonical output written to ${join(outputDir, 'pitch-deck.json')}`);

  // Gate check: PD quality score (per D-04, D-05, D-07)
  console.log('\nRunning Pitch Deck quality scoring...');
  const pdQuality = validateStage(pdResult.sections, dataPacket);
  writeFileSync(join(qualityDir, 'pitch-deck-v4.quality.json'), JSON.stringify(pdQuality, null, 2));
  const pdQualityMd = formatQualityReport(pdQuality, { ticker, stage: 'pitchDeck' });
  writeFileSync(join(qualityDir, 'pitch-deck-v4.quality.md'), pdQualityMd);

  console.log(`Pitch Deck mechanical score: ${pdQuality.overallScore}`);
  console.log(`Pitch Deck methodology score: ${pdQuality.overallMethodologyScore}`);

  if (pdQuality.overallScore < 85 || pdQuality.overallMethodologyScore < 85) {
    console.error(`\nGATE FAILED: Pitch Deck scores below 85 threshold.`);
    console.error(`  Mechanical: ${pdQuality.overallScore} (need 85+)`);
    console.error(`  Methodology: ${pdQuality.overallMethodologyScore} (need 85+)`);
    console.error(`Quality report: ${join(qualityDir, 'pitch-deck-v4.quality.md')}`);
    process.exit(1);
  }
  console.log('Gate PASSED — advancing to Full Story\n');

  // ================================================================
  // STAGE 3: FULL STORY
  // ================================================================
  console.log('='.repeat(60));
  console.log('STAGE 3: FULL STORY');
  console.log('='.repeat(60) + '\n');

  // Inject PD sections into dataPacket for Full Story inheritance (per run-full-story.js line 71)
  dataPacket.pitchDeckSections = pdResult.sections || [];
  console.log(`Injected ${dataPacket.pitchDeckSections.length} Pitch Deck sections into DataPacket\n`);

  // Initialize progress tracking for Full Story
  try {
    createProgress(ticker, 'fullStory');
    initGenerationStatus(ticker, 'fullStory');
    advanceState(ticker, 'DATA_ASSEMBLY');
    advanceState(ticker, 'WAVE_1_RUNNING');
    updatePhaseStatus(ticker, 1, 'active');
  } catch (err) { console.warn(`FS progress init: ${err.message}`); }

  const fsStart = Date.now();
  let fsResult;
  try {
    fsResult = await runPipeline('fullStory', dataPacket, { onWaveComplete, maxSearches: 7 });
  } catch (err) {
    console.error('Full Story pipeline failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
  const fsTime = ((Date.now() - fsStart) / 1000).toFixed(1);
  console.log(`Full Story completed in ${fsTime}s`);

  // Mark FS complete in progress tracking
  try {
    advanceState(ticker, 'COMPLETE');
    updateGenerationStatus(ticker, { state: 'COMPLETE' });
  } catch { /* non-critical */ }

  // Normalize FS sections (per D-07)
  if (fsResult.sections) {
    fsResult.sections = normalizeSections(fsResult.sections);
  }

  // Save debate step outputs individually (per run-full-story.js lines 149-159)
  if (fsResult.debateOutputs) {
    console.log('\nSaving debate step outputs...');
    for (const [role, output] of Object.entries(fsResult.debateOutputs)) {
      const stepNum = { bull: 1, bear: 2, bull_rebuttal: 3, judge: 4 }[role];
      if (stepNum && output) {
        writeFileSync(join(sectionsDir, `debate-step-${stepNum}.json`), JSON.stringify(output, null, 2));
        console.log(`  Saved debate-step-${stepNum}.json (${role})`);
      }
    }
  }

  // Save section outputs individually (per run-full-story.js lines 162-181)
  const sectionKeyMap = [
    'event_analysis',
    'meaning_checklist',
    'moat_checklist',
    'management_checklist',
    'valuation_confirmation',
    'inversion_rebuttal',
  ];
  if (fsResult.sections?.length > 0) {
    console.log('\nSaving section outputs...');
    for (const section of fsResult.sections) {
      if (!section) continue;
      const sNum = section.sectionNumber || '?';
      const sKey = section.key || sectionKeyMap[sNum - 1] || 'unknown';
      writeFileSync(join(sectionsDir, `fullStory-S${sNum}-${sKey}.json`), JSON.stringify(section, null, 2));
      console.log(`  Saved fullStory-S${sNum}-${sKey}.json`);
    }
  }

  // Write full-story-api.json (FS canonical name)
  writeFileSync(join(outputDir, 'full-story-api.json'), JSON.stringify({
    ticker,
    stage: 'fullStory',
    completedAt: new Date().toISOString(),
    pipelineTimeSeconds: parseFloat(fsTime),
    sectionCount: fsResult.sections?.length || 0,
    errorCount: fsResult.errors?.length || 0,
    sections: fsResult.sections,
    budget: fsResult.budget,
    cacheStats: fsResult.cacheStats,
    errors: fsResult.errors,
    debateOutputs: fsResult.debateOutputs,
  }, null, 2));

  // Gate check: FS quality score (per D-05)
  console.log('\nRunning Full Story quality scoring...');
  const fsQuality = validateStage(fsResult.sections, dataPacket);
  writeFileSync(join(qualityDir, 'full-story-v4.quality.json'), JSON.stringify(fsQuality, null, 2));
  const fsQualityMd = formatQualityReport(fsQuality, { ticker, stage: 'fullStory' });
  writeFileSync(join(qualityDir, 'full-story-v4.quality.md'), fsQualityMd);

  console.log(`Full Story mechanical score: ${fsQuality.overallScore}`);
  console.log(`Full Story methodology score: ${fsQuality.overallMethodologyScore}`);

  // ================================================================
  // COMBINED RESULTS
  // ================================================================
  const totalTime = ((Date.now() - startTotal) / 1000).toFixed(1);
  const opCost = opResult.budget?.totals?.cost || 0;
  const pdCost = pdResult.budget?.totals?.cost || 0;
  const fsCost = fsResult.budget?.totals?.cost || 0;
  const totalCost = opCost + pdCost + fsCost;

  console.log('\n' + '='.repeat(60));
  console.log('PIPELINE COMPLETE — ALL 3 STAGES');
  console.log('='.repeat(60));
  console.log(`\nTotal time: ${totalTime}s`);
  console.log(`\nCost breakdown (per D-11):`);
  console.log(`  One Pager:   $${opCost.toFixed(4)}`);
  console.log(`  Pitch Deck:  $${pdCost.toFixed(4)}`);
  console.log(`  Full Story:  $${fsCost.toFixed(4)}`);
  console.log(`  TOTAL:       $${totalCost.toFixed(4)}`);
  console.log(`  Ceiling:     $15.00`);
  console.log(`  Status:      ${totalCost <= 15.0 ? 'WITHIN ceiling' : 'EXCEEDS ceiling'}`);
  console.log(`\nQuality scores:`);
  console.log(`  One Pager:   ${opVerdict}`);
  console.log(`  Pitch Deck:  ${pdQuality.overallScore} mechanical / ${pdQuality.overallMethodologyScore} methodology`);
  console.log(`  Full Story:  ${fsQuality.overallScore} mechanical / ${fsQuality.overallMethodologyScore} methodology`);

  // Write combined budget report
  writeFileSync(join(outputDir, 'budget.json'), JSON.stringify({
    ticker,
    completedAt: new Date().toISOString(),
    totalTimeSeconds: parseFloat(totalTime),
    totalCost,
    costCeiling: 15.0,
    withinCeiling: totalCost <= 15.0,
    stages: {
      onePager: { cost: opCost, time: parseFloat(opTime), sections: opResult.sections?.length || 0, verdict: opVerdict },
      pitchDeck: { cost: pdCost, time: parseFloat(pdTime), sections: pdResult.sections?.length || 0, mechanical: pdQuality.overallScore, methodology: pdQuality.overallMethodologyScore },
      fullStory: { cost: fsCost, time: parseFloat(fsTime), sections: fsResult.sections?.length || 0, mechanical: fsQuality.overallScore, methodology: fsQuality.overallMethodologyScore },
    },
  }, null, 2));
  console.log(`\nBudget report: ${join(outputDir, 'budget.json')}`);

  // Final pass/fail
  const fsPass = fsQuality.overallScore >= 85 && fsQuality.overallMethodologyScore >= 85;
  if (!fsPass) {
    console.error(`\nFull Story scores below 85 threshold — review quality report.`);
    console.error(`Quality report: ${join(qualityDir, 'full-story-v4.quality.md')}`);
    process.exit(1);
  }
  if (totalCost > 15.0) {
    console.warn(`\nWARNING: Total cost $${totalCost.toFixed(4)} exceeds $15.00 ceiling.`);
  }

  console.log(`\nAll stages passed. Output: .thes1s/reports/${ticker}/`);
  process.exit(0);
}

// Route execution based on stage
if (stage === 'all') {
  runAllStages().catch((err) => {
    console.error('Pipeline error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error('Unexpected error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}
