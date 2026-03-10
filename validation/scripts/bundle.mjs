#!/usr/bin/env node
// Bundle the app's EDGAR engines into a single Node.js-compatible ESM file.
// This handles import.meta.env.DEV → false (use direct SEC URLs, not Vite proxy).

import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

await build({
  entryPoints: [resolve(ROOT, 'src/engines/edgarFinancials.js')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: resolve(__dirname, 'bundled-engines.mjs'),
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env': '{}',
  },
  // Re-export keyMetrics alongside edgarFinancials
  // Use a virtual entry that re-exports both
  stdin: {
    contents: `
      export { fetchEdgarStatements, INCOME_TAXONOMY, BALANCE_TAXONOMY, CASHFLOW_TAXONOMY } from '${resolve(ROOT, 'src/engines/edgarFinancials.js').replace(/\\/g, '/')}';
      export { computeKeyMetrics } from '${resolve(ROOT, 'src/engines/keyMetrics.js').replace(/\\/g, '/')}';
    `,
    resolveDir: resolve(ROOT, 'src/engines'),
    loader: 'js',
  },
  // Don't use stdin AND entryPoints — stdin overrides
  entryPoints: undefined,
});

console.log('Bundle created: validation/scripts/bundled-engines.mjs');
