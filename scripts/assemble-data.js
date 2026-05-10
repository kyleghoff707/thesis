#!/usr/bin/env node
// CLI wrapper: node --import scripts/node-esm-loader.js scripts/assemble-data.js TICKER
// Assembles a full DataPacket and writes to ~/thesis/reports/{TICKER}/data-packet.json
//
// Prerequisites:
//   - .env.local with API keys (VITE_CLAUDE_KEY, etc.)
//   - Node.js 18+ (native fetch required)
//   - Must use custom ESM loader for Vite-style extension-less imports:
//     node --import scripts/node-esm-loader.js scripts/assemble-data.js AAPL
//
// This script imports nodeAdapter.js first (side-effect: loads .env.local,
// patches globals for Node.js execution) then calls assembleDataPacket()
// from the existing engine layer.

import '../src/engines/nodeAdapter.js';
import { assembleDataPacket } from '../src/engines/dataExport.js';
import { reportsDir } from '../src/utils/thesisDir.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ticker = process.argv[2]?.toUpperCase();

if (!ticker) {
  console.error('Usage: node scripts/assemble-data.js <TICKER>');
  console.error('Example: node scripts/assemble-data.js AAPL');
  process.exit(1);
}

async function main() {
  console.log(`Assembling DataPacket for ${ticker}...`);

  const packet = await assembleDataPacket(ticker);

  // Create output directory
  const outputDir = reportsDir(ticker);
  mkdirSync(outputDir, { recursive: true });

  // Write DataPacket JSON
  const outputPath = join(outputDir, 'data-packet.json');
  writeFileSync(outputPath, JSON.stringify(packet, null, 2));

  // Report results
  const fieldCount = Object.keys(packet).length;
  const populatedFields = Object.entries(packet)
    .filter(([, v]) => v != null && v !== undefined)
    .length;

  console.log(`DataPacket written to ${outputPath}`);
  console.log(`  Fields: ${populatedFields}/${fieldCount} populated`);
  console.log(`  Ticker: ${packet.ticker}`);
  console.log(`  Assembled at: ${packet.assembledAt}`);

  // Log errors if any
  if (packet.errors && packet.errors.length > 0) {
    console.log(`  Errors (${packet.errors.length}):`);
    for (const err of packet.errors) {
      console.log(`    - ${err}`);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(`Failed to assemble DataPacket for ${ticker}:`, err.message);
  process.exit(1);
});
