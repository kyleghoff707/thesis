#!/usr/bin/env node
// CLI entry point: Run the full AI agent pipeline for a given ticker
// Usage: node --loader ./scripts/node-esm-loader.js scripts/run-pipeline.js [TICKER]
//
// Assembles a DataPacket, runs the pitchDeck pipeline (10 sections + synthesis),
// logs wave-by-wave progress, and writes output to .thes1s/reports/{TICKER}/pipeline-output.json
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
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ticker = (process.argv[2] || 'SFM').toUpperCase();
const stage = process.argv[3] || 'pitchDeck';

async function main() {
  console.log(`\n=== Thes1s Pipeline Runner ===`);
  console.log(`Ticker: ${ticker}`);
  console.log(`Stage: ${stage}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

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
  console.log(`Running ${stage} pipeline...\n`);
  const startPipeline = Date.now();

  const onWaveComplete = async (waveNumber, results, budgetSummary, cacheSummary) => {
    // results is an array of section objects (not Promise.allSettled wrappers)
    const sectionCount = results.filter(r => r != null).length;
    console.log(`--- Wave ${waveNumber} complete ---`);
    console.log(`  Sections produced: ${sectionCount}`);
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
    result = await runPipeline(stage, dataPacket, { onWaveComplete });
  } catch (err) {
    console.error(`Pipeline failed:`, err.message);
    console.error(err.stack);
    process.exit(1);
  }
  const pipelineTime = ((Date.now() - startPipeline) / 1000).toFixed(1);

  // Step 3: Report results
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

  // Step 4: Write output
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

  // Exit code
  const expectedSections = stage === 'pitchDeck' ? 11 : stage === 'onePager' ? 6 : 9;
  const produced = result.sections?.length || 0;
  if (produced >= expectedSections) {
    console.log(`\nAll ${produced} sections produced. Pipeline complete.`);
    process.exit(0);
  } else {
    console.log(`\nOnly ${produced}/${expectedSections} sections produced. Check errors above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
