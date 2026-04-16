#!/usr/bin/env node
// Observatory Synthesize — CLI wrapper for wiki synthesis.
// Updates wiki pages after pipeline runs using LLM synthesis (Karpathy pattern).
//
// Usage:
//   node --loader ./scripts/node-esm-loader.js scripts/observatory-synthesize.js [RUN_ID]
//   node --loader ./scripts/node-esm-loader.js scripts/observatory-synthesize.js --all

import '../src/engines/nodeAdapter.js';
import { updateWiki, synthesizeAll } from '../src/engines/observatorySynthesize.js';

const args = process.argv.slice(2);

if (args.includes('--all')) {
  console.log('Observatory: batch synthesis of all runs...');
  await synthesizeAll();
} else if (args[0]) {
  console.log(`Observatory: synthesizing wiki for run ${args[0]}...`);
  await updateWiki(args[0]);
} else {
  console.log('Usage:');
  console.log('  node --loader ./scripts/node-esm-loader.js scripts/observatory-synthesize.js RUN_ID');
  console.log('  node --loader ./scripts/node-esm-loader.js scripts/observatory-synthesize.js --all');
  process.exit(1);
}
