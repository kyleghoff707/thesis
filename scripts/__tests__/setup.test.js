import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSetupConfig, writeSetupConfig } from '../setup.js';

let tmpDir;
let previousThesisDir;

beforeEach(() => {
  previousThesisDir = process.env.THESIS_DIR;
  tmpDir = mkdtempSync(join(tmpdir(), 'thesis-setup-'));
  process.env.THESIS_DIR = tmpDir;
});

afterEach(() => {
  if (previousThesisDir === undefined) delete process.env.THESIS_DIR;
  else process.env.THESIS_DIR = previousThesisDir;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('setup helper', () => {
  it('builds a hosted-data config from an API key', () => {
    expect(createSetupConfig({
      apiKey: '  thesis_live_test_key  ',
      apiBaseUrl: 'https://api.example.test///',
    })).toEqual({
      apiBaseUrl: 'https://api.example.test',
      apiKey: 'thesis_live_test_key',
      defaultMode: 'hosted-data',
      accountEmail: '',
    });
  });

  it('uses the production API base URL by default', () => {
    expect(createSetupConfig({ apiKey: 'thesis_live_test_key' })).toMatchObject({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'thesis_live_test_key',
      defaultMode: 'hosted-data',
      accountEmail: '',
    });
  });

  it('writes ~/thesis/config.json through THESIS_DIR override in tests', () => {
    const result = writeSetupConfig({
      apiKey: 'thesis_live_test_key',
      apiBaseUrl: 'https://api.example.test',
    });

    expect(result.path).toBe(join(tmpDir, 'config.json'));
    expect(existsSync(result.path)).toBe(true);
    expect(JSON.parse(readFileSync(result.path, 'utf8'))).toEqual({
      apiBaseUrl: 'https://api.example.test',
      apiKey: 'thesis_live_test_key',
      defaultMode: 'hosted-data',
      accountEmail: '',
    });
  });

  it('passes accountEmail through to the written config', () => {
    const result = writeSetupConfig({
      apiKey: 'thesis_live_test_key',
      accountEmail: '  user@example.com  ',
    });

    expect(JSON.parse(readFileSync(result.path, 'utf8'))).toEqual({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'thesis_live_test_key',
      defaultMode: 'hosted-data',
      accountEmail: 'user@example.com',
    });
  });

  it('defaults accountEmail to empty string', () => {
    expect(createSetupConfig({ apiKey: 'thesis_live_test_key' })).toEqual({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'thesis_live_test_key',
      defaultMode: 'hosted-data',
      accountEmail: '',
    });
  });
});
