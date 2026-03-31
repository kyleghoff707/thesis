#!/usr/bin/env node
// CLI entry point: Run the Full Story AI agent pipeline for a given ticker
// Usage: node --loader ./scripts/node-esm-loader.js scripts/run-full-story.js [TICKER]
//
// Requires: Existing Pitch Deck output at .thes1s/reports/{TICKER}/pipeline-output.json
// Produces: .thes1s/reports/{TICKER}/full-story-api.json + individual debate step files
//
// Full Story builds on top of the Pitch Deck: it inherits all 10 Pitch Deck sections
// as context for deeper analysis (6 Full Story sections + 4-step adversarial debate).

import '../src/engines/nodeAdapter.js';
import { assembleDataPacket } from '../src/engines/dataExport.js';
import { runPipeline } from '../src/engines/pipelineManager.js';
import { formatBudgetReport } from '../src/engines/contextBudget.js';
import { fetchFilingMarkdown } from '../src/engines/filingMarkdown.js';
import { extractAllSections } from '../src/engines/filingSections.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ticker = (process.argv[2] || 'SFM').toUpperCase();

async function main() {
  console.log(`\n=== Thes1s Full Story Pipeline Runner ===`);
  console.log(`Ticker: ${ticker}`);
  console.log(`Stage: fullStory`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const outputDir = join(process.cwd(), '.thes1s', 'reports', ticker);
  mkdirSync(outputDir, { recursive: true });

  // Step 0: Gate check — verify Pitch Deck exists
  const pdPath = join(outputDir, 'pipeline-output.json');
  const pdAltPath = join(outputDir, 'pitch-deck.json');
  const pdFile = existsSync(pdPath) ? pdPath : existsSync(pdAltPath) ? pdAltPath : null;
  if (!pdFile) {
    console.error(`No Pitch Deck found for ${ticker}. Run the Pitch Deck pipeline first.`);
    console.error(`  Expected: ${pdPath}`);
    console.error(`       or: ${pdAltPath}`);
    process.exit(1);
  }
  const pitchDeckOutput = JSON.parse(readFileSync(pdFile, 'utf8'));
  console.log(`Loaded Pitch Deck from: ${pdFile}`);
  console.log(`  Pitch Deck sections: ${pitchDeckOutput.sections?.length || 0}`);
  console.log(`  Pitch Deck cost: $${pitchDeckOutput.budget?.totals?.cost?.toFixed(4) || '?'}\n`);

  // Step 1: Assemble DataPacket
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

  // Inject Pitch Deck sections into DataPacket (inherit-pitch-deck pre-processing)
  dataPacket.pitchDeckSections = pitchDeckOutput.sections || [];
  console.log(`Injected ${dataPacket.pitchDeckSections.length} Pitch Deck sections into DataPacket\n`);

  // Step 1b: Pre-process filings (fetch 10-K/10-Q content for PSR agents)
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
        console.warn(`  ${f.form} ${f.filingDate}: failed — ${err.message}`);
      }
    }

    const filingTime = ((Date.now() - startFilings) / 1000).toFixed(1);
    const processedCount = Object.keys(filingContent).length;
    console.log(`Filing pre-processing: ${processedCount}/${filingsToProcess.length} in ${filingTime}s\n`);

    if (processedCount > 0) {
      dataPacket.filingContent = filingContent;
    }
  }

  // Step 2: Run pipeline
  console.log('Running fullStory pipeline...\n');
  const startPipeline = Date.now();

  const onWaveComplete = async (waveNumber, results, budgetSummary, cacheSummary) => {
    const sectionCount = results.filter(r => r != null).length;
    console.log(`--- Wave ${waveNumber} complete ---`);
    if (waveNumber === 1) {
      console.log(`  Sections produced: ${sectionCount}`);
    } else {
      console.log(`  Debate steps completed: ${sectionCount}`);
    }
    if (budgetSummary) {
      console.log(`  Running cost: $${budgetSummary.totals?.cost?.toFixed(4) || '?'}`);
    }
    if (cacheSummary) {
      console.log(`  Cache: ${cacheSummary.hitRatePct || '?'} hit rate (${cacheSummary.totalRead || 0} read / ${cacheSummary.totalWrite || 0} write tokens)`);
    }
    console.log('');
    return null; // No PM feedback in automated mode
  };

  let result;
  try {
    result = await runPipeline('fullStory', dataPacket, { onWaveComplete, maxSearches: 7 });
  } catch (err) {
    console.error('Pipeline failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
  const pipelineTime = ((Date.now() - startPipeline) / 1000).toFixed(1);

  // Step 3: Save debate step outputs individually
  const sectionsDir = join(outputDir, 'sections');
  mkdirSync(sectionsDir, { recursive: true });

  if (result.debateOutputs) {
    console.log('\nSaving debate step outputs...');
    for (const [role, output] of Object.entries(result.debateOutputs)) {
      const stepNum = { bull: 1, bear: 2, bull_rebuttal: 3, judge: 4 }[role];
      if (stepNum && output) {
        const stepPath = join(sectionsDir, `debate-step-${stepNum}.json`);
        writeFileSync(stepPath, JSON.stringify(output, null, 2));
        console.log(`  Saved debate-step-${stepNum}.json (${role})`);
      }
    }
  }

  // Step 4: Save section outputs individually (matching CC skill pattern)
  console.log('\nSaving section outputs...');
  const sectionKeyMap = [
    'event_analysis',
    'meaning_checklist',
    'moat_checklist',
    'management_checklist',
    'valuation_confirmation',
    'inversion_rebuttal',
  ];

  if (result.sections?.length > 0) {
    for (const section of result.sections) {
      if (!section) continue;
      const sNum = section.sectionNumber || '?';
      const sKey = section.key || sectionKeyMap[sNum - 1] || `unknown`;
      const sectionPath = join(sectionsDir, `fullStory-S${sNum}-${sKey}.json`);
      writeFileSync(sectionPath, JSON.stringify(section, null, 2));
      console.log(`  Saved fullStory-S${sNum}-${sKey}.json`);
    }
  }

  // Step 5: Write full output to full-story-api.json (NOT pipeline-output.json)
  const outputPath = join(outputDir, 'full-story-api.json');
  writeFileSync(outputPath, JSON.stringify({
    ticker,
    stage: 'fullStory',
    completedAt: new Date().toISOString(),
    assemblyTimeSeconds: parseFloat(assemblyTime),
    pipelineTimeSeconds: parseFloat(pipelineTime),
    sectionCount: result.sections?.length || 0,
    errorCount: result.errors?.length || 0,
    sections: result.sections,
    budget: result.budget,
    cacheStats: result.cacheStats,
    errors: result.errors,
    debateOutputs: result.debateOutputs,
  }, null, 2));
  console.log(`\nOutput written to ${outputPath}`);

  // Step 6: Print results and cost summary
  console.log('\n=== Full Story Pipeline Results ===\n');
  console.log(`Total time: ${pipelineTime}s`);
  console.log(`Sections produced: ${result.sections?.length || 0}`);
  console.log(`Errors: ${result.errors?.length || 0}`);
  console.log('');

  // Section details
  if (result.sections?.length > 0) {
    console.log('Sections:');
    for (const section of result.sections) {
      if (!section) continue;
      const citations = section.citations?.length || 0;
      const redFlags = section.redFlags?.length || 0;
      const searches = section.searchesPerformed?.length || 0;
      console.log(`  [${section.sectionNumber || '?'}] ${section.key || '?'} — ${section.title || 'untitled'}`);
      console.log(`      status: ${section.status || '?'} | confidence: ${section.confidence || '?'} | verdict: ${section.verdict || '?'}`);
      console.log(`      citations: ${citations} | redFlags: ${redFlags} | searches: ${searches}`);
    }
    console.log('');
  }

  // Budget report — Full Story cost
  if (result.budget) {
    console.log(formatBudgetReport(result.budget));
    console.log('');
  }

  // Per-stage cost comparison (per D-07)
  const fsCost = result.budget?.totals?.cost || 0;
  const pdCost = pitchDeckOutput.budget?.totals?.cost || 0;
  const combinedCost = fsCost + pdCost;
  const costCeiling = 15.0;

  console.log('=== Cost Summary (per D-06, D-07) ===');
  console.log(`  Pitch Deck cost:  $${pdCost.toFixed(4)}`);
  console.log(`  Full Story cost:  $${fsCost.toFixed(4)}`);
  console.log(`  Combined total:   $${combinedCost.toFixed(4)}`);
  console.log(`  Cost ceiling:     $${costCeiling.toFixed(2)}`);
  console.log(`  Status:           ${combinedCost <= costCeiling ? 'WITHIN ceiling' : 'EXCEEDS ceiling'}`);
  console.log('');

  // Error details
  if (result.errors?.length > 0) {
    console.log('Errors:');
    for (const err of result.errors) {
      console.log(`  - ${typeof err === 'string' ? err : JSON.stringify(err)}`);
    }
    console.log('');
  }

  // Exit code: expect 6 sections for Full Story
  const produced = result.sections?.length || 0;
  const expectedSections = 6;
  if (produced >= expectedSections) {
    console.log(`All ${produced} sections produced. Full Story pipeline complete.`);
    process.exit(0);
  } else {
    console.log(`Only ${produced}/${expectedSections} sections produced. Check errors above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
