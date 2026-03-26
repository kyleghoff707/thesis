#!/usr/bin/env node
// CLI: node --loader ./scripts/node-esm-loader.js scripts/preprocess-filings.js TICKER
// Pre-processes SEC filings (10-K, 10-Q) to clean markdown sections BEFORE PSR agent dispatch.
// Reads the DataPacket to find filing accession numbers, fetches HTML from EDGAR,
// converts to markdown, and extracts standard sections (Business, Risk Factors, MD&A, etc.).
//
// Output: JSON files in .thes1s/reports/{TICKER}/filings-md/ — one per filing.
// Each file contains: { form, date, sections: { item1: "...", item1a: "...", ... }, fullLength }

import '../src/engines/nodeAdapter.js';
import { fetchFilingMarkdown } from '../src/engines/filingMarkdown.js';
import { extractAllSections } from '../src/engines/filingSections.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ticker = process.argv[2]?.toUpperCase();

if (!ticker) {
  console.error('Usage: node scripts/preprocess-filings.js <TICKER>');
  process.exit(1);
}

async function main() {
  // Read the DataPacket to get filing metadata
  const dpPath = join(process.cwd(), '.thes1s', 'reports', ticker, 'data-packet.json');
  if (!existsSync(dpPath)) {
    console.error(`DataPacket not found at ${dpPath}. Run assemble-data.js first.`);
    process.exit(1);
  }

  const dp = JSON.parse(readFileSync(dpPath, 'utf8'));
  const filings = dp.filings || [];

  if (filings.length === 0) {
    console.error('No filings in DataPacket. Cannot pre-process.');
    process.exit(1);
  }

  // Select filings to process: most recent 5 10-Ks + 8 10-Qs (full business cycle)
  const annuals = filings.filter(f => f.form === '10-K').slice(0, 5);
  const quarterly = filings.filter(f => f.form === '10-Q').slice(0, 8);
  const toProcess = [...annuals, ...quarterly];

  console.log(`Pre-processing ${annuals.length} 10-Ks (max 5) and ${quarterly.length} 10-Qs (max 8) for ${ticker}...`);

  // Create output directory
  const outDir = join(process.cwd(), '.thes1s', 'reports', ticker, 'filings-md');
  mkdirSync(outDir, { recursive: true });

  let successCount = 0;
  let failCount = 0;
  const successByForm = {};

  for (const f of toProcess) {
    try {
      // fetchFilingMarkdown expects a single object with cik, accessionNumber, primaryDocument
      const filingObj = {
        cik: dp.companyInfo?.cik,
        accessionNumber: f.accessionNumber,
        primaryDocument: f.primaryDocument,
      };

      const result = await fetchFilingMarkdown(filingObj);

      if (result.skipped || !result.markdown) {
        console.warn(`  Skipped: ${f.form} ${f.filingDate} — ${result.reason || 'no markdown returned'}`);
        failCount++;
        continue;
      }

      // Extract sections from the markdown (form-aware: 10-K vs 10-Q item numbers)
      const sections = extractAllSections(result.markdown, f.form);
      const sectionCount = Object.keys(sections).length;

      // Write processed filing to disk (full filing date prevents collision for multiple 10-Qs in same year)
      const outFile = join(outDir, `${f.form}-${f.filingDate}.json`);
      writeFileSync(outFile, JSON.stringify({
        form: f.form,
        date: f.filingDate,
        sections,
        fullLength: result.markdown.length,
        fromCache: result.fromCache,
      }, null, 2));

      console.log(`  Processed: ${f.form} ${f.filingDate} (${result.markdown.length} chars, ${sectionCount} sections, ${result.fromCache ? 'cached' : 'fetched'})`);
      successCount++;
      successByForm[f.form] = (successByForm[f.form] || 0) + 1;
    } catch (err) {
      console.warn(`  Failed: ${f.form} ${f.filingDate} — ${err.message}`);
      failCount++;
    }
  }

  const tenKSuccess = successByForm['10-K'] || 0;
  const tenQSuccess = successByForm['10-Q'] || 0;
  console.log(`\nFiling pre-processing complete: ${successCount} succeeded, ${failCount} failed out of ${toProcess.length}`);
  console.log(`  10-Ks: ${tenKSuccess}/${annuals.length} | 10-Qs: ${tenQSuccess}/${quarterly.length}`);

  if (successCount === 0) {
    console.error('WARNING: No filings were processed successfully. PSR agents will work with DataPacket data only.');
  }
}

main().catch((err) => {
  console.error(`Filing pre-processing failed: ${err.message}`);
  // Non-fatal — pipeline continues without pre-processed filings
  process.exit(0);
});
