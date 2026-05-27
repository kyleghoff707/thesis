import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const removedPaths = [
  'src/App.jsx',
  'src/main.jsx',
  'src/assets',
  'src/components',
  'src/hooks',
  'index.html',
  'public',
  'vite.config.js',
  'dist',
  `industry-${'classification'}`,
  ['packages', `sec-${'parsers'}`].join('/'),
  ['packages', 'pricing'].join('/'),
];

const removedEngines = [
  'src/engines/dataExport.js',
  'src/engines/edgarFinancials.js',
  'src/engines/compensation.js',
  'src/engines/gurus.js',
  `src/engines/guru${'focus'}.js`,
  'src/engines/insiders.js',
  'src/engines/peerMetrics.js',
  'src/engines/peers.js',
  `src/engines/thesisScore${'V2'}.js`,
  'src/engines/thesisClassification.js',
  'src/engines/industryClassifier.js',
  'src/engines/sicClassification.js',
  'src/engines/industryOverlays.js',
];

const browserDependencies = [
  'react',
  'react-dom',
  'react-router-dom',
  'react-markdown',
  'recharts',
  'file-saver',
  'idb',
  'vite',
  '@vitejs/plugin-react',
  '@tauri-apps/cli',
  'jsdom',
  '@types/react',
  '@types/react-dom',
];

describe('thesis-cli public boundary', () => {
  it('does not ship frontend app files or proprietary assembly directories', () => {
    for (const relPath of [...removedPaths, ...removedEngines]) {
      expect(existsSync(join(root, relPath)), `${relPath} should be removed from thesis-cli`).toBe(false);
    }
  });

  it('does not depend on browser UI packages', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };

    for (const dep of browserDependencies) {
      expect(allDeps[dep], `${dep} should not be listed in package.json`).toBeUndefined();
    }
  });

  it('keeps the CLI entry points required by the skills', () => {
    const keptPaths = [
      'scripts/assemble-data.js',
      'scripts/prepare-data.js',
      'scripts/preprocess-filings.js',
      'scripts/slice-datapacket.js',
      'scripts/data-quality-checkpoint.js',
      'src/api/thesisDataApi.js',
      'src/config/thesisConfig.js',
      'src/engines/filingMarkdown.js',
      'src/engines/filingSections.js',
      'src/engines/transcripts.js',
      'src/engines/userAgent.js',
      'src/schemas/dataPacket.js',
      'src/utils/thesisDir.js',
      'src/utils/safeTickerDir.js',
      'src/utils/sliceDataPacket.js',
      'src/data/datapacket-slice-registry.json',
    ];

    for (const relPath of keptPaths) {
      expect(existsSync(join(root, relPath)), `${relPath} should remain in thesis-cli`).toBe(true);
    }
  });
});
