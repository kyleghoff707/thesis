#!/usr/bin/env node
// CLI wrapper: node scripts/assemble-data.js TICKER
// Fetches a DataPacket from the Thesis Data API and writes it to
// ~/thesis/reports/{TICKER}/data-packet.json.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchDataPacket } from '../src/api/thesisDataApi.js';
import { maskApiKey, requireThesisApiConfig } from '../src/config/thesisConfig.js';
import { reportsDir } from '../src/utils/thesisDir.js';
import { normalizeTicker } from '../src/utils/ticker.js';

const USAGE = 'Usage: node scripts/assemble-data.js <TICKER>';

export async function assembleDataFromApi(ticker, options = {}) {
  const symbol = normalizeTicker(ticker);

  const config = options.config || requireThesisApiConfig();
  const result = await fetchDataPacket(symbol, config, options);
  const packet = result.dataPacket;

  const outputDir = reportsDir(symbol);
  mkdirSync(outputDir, { recursive: true });

  const outputPath = join(outputDir, 'data-packet.json');
  writeFileSync(outputPath, `${JSON.stringify(packet, null, 2)}\n`);

  return {
    ticker: symbol,
    outputPath,
    packet,
    quality: result.quality,
    cache: result.cache,
    apiBaseUrl: config.apiBaseUrl,
    apiKeyMasked: maskApiKey(config.apiKey),
  };
}

export function printAssemblySummary(summary) {
  const packet = summary.packet || {};
  const fieldCount = Object.keys(packet).length;
  const populatedFields = Object.entries(packet)
    .filter(([, value]) => value != null)
    .length;

  console.log(`DataPacket written to ${summary.outputPath}`);
  console.log(`  API: ${summary.apiBaseUrl}`);
  console.log(`  API key: ${summary.apiKeyMasked}`);
  console.log(`  Fields: ${populatedFields}/${fieldCount} populated`);
  console.log(`  Ticker: ${packet.ticker || summary.ticker}`);
  console.log(`  Assembled at: ${packet.assembledAt}`);

  if (summary.cache && typeof summary.cache.hit === 'boolean') {
    console.log(`  Cache: ${summary.cache.hit ? 'hit' : 'miss'}`);
  }

  if (summary.quality && typeof summary.quality.canProceed === 'boolean') {
    console.log(`  Quality: ${summary.quality.canProceed ? 'PROCEED' : 'BLOCKED'}`);
  }

  if (Array.isArray(packet.errors) && packet.errors.length > 0) {
    console.log(`  Errors (${packet.errors.length}):`);
    for (const error of packet.errors) {
      console.log(`    - ${error}`);
    }
  }
}

async function main() {
  const ticker = process.argv[2];
  if (!ticker) {
    console.error(USAGE);
    process.exit(1);
  }

  try {
    console.log(`Fetching DataPacket for ${ticker} from Thesis Data API...`);
    const summary = await assembleDataFromApi(ticker);
    printAssemblySummary(summary);
    console.log('Done.');
  } catch (err) {
    console.error(`Failed to fetch DataPacket: ${err.message}`);
    process.exit(1);
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  main();
}
