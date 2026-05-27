#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import {
  DEFAULT_API_BASE_URL,
  DEFAULT_MODE,
  maskApiKey,
  writeThesisConfig,
} from '../src/config/thesisConfig.js';

function cleanApiBaseUrl(apiBaseUrl) {
  if (typeof apiBaseUrl !== 'string') return DEFAULT_API_BASE_URL;
  const normalized = apiBaseUrl.trim().replace(/\/+$/, '');
  return normalized || DEFAULT_API_BASE_URL;
}

function cleanApiKey(apiKey) {
  return typeof apiKey === 'string' ? apiKey.trim() : '';
}

export function createSetupConfig(options = {}) {
  return {
    apiBaseUrl: cleanApiBaseUrl(options.apiBaseUrl),
    apiKey: cleanApiKey(options.apiKey),
    defaultMode: options.defaultMode || DEFAULT_MODE,
  };
}

export function writeSetupConfig(options = {}) {
  return writeThesisConfig(createSetupConfig(options));
}

async function runSetup() {
  const rl = createInterface({ input, output });

  try {
    const apiBaseUrlAnswer = await rl.question(`Thesis Data API URL [${DEFAULT_API_BASE_URL}]: `);
    const apiKeyAnswer = await rl.question('Thesis Data API key (leave blank if key issuing is not enabled yet): ');
    const result = writeSetupConfig({
      apiBaseUrl: apiBaseUrlAnswer,
      apiKey: apiKeyAnswer,
    });

    console.log(`\nWrote ${result.path}`);
    console.log(`Data API URL: ${result.config.apiBaseUrl}`);
    console.log(`API key: ${maskApiKey(result.config.apiKey)}`);

    if (!result.config.apiKey) {
      console.log('No API key saved. Real hosted runs require a live key from thesis-investing.com once key issuing is enabled.');
    }
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  runSetup().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
