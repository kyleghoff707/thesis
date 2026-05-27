import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_API_BASE_URL,
  readThesisConfig,
  requireThesisApiConfig,
  writeThesisConfig,
  maskApiKey,
} from '../thesisConfig.js';

let tmpDir;
let prevThesisDir;

beforeEach(() => {
  prevThesisDir = process.env.THESIS_DIR;
  tmpDir = mkdtempSync(join(tmpdir(), 'thesis-config-'));
  process.env.THESIS_DIR = tmpDir;
});

afterEach(() => {
  if (prevThesisDir === undefined) delete process.env.THESIS_DIR;
  else process.env.THESIS_DIR = prevThesisDir;
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('thesisConfig', () => {
  it('returns defaults when config is missing', () => {
    expect(readThesisConfig()).toEqual({
      apiBaseUrl: DEFAULT_API_BASE_URL,
      apiKey: '',
      defaultMode: 'hosted-data',
    });
  });

  it('writes config.json and reads it back with optional fields preserved', () => {
    const result = writeThesisConfig({
      apiBaseUrl: 'https://example.com/api',
      apiKey: 'thesis_live_testkey',
      defaultMode: 'local-data',
      userAgent: 'Thesis CLI/0.1 research@example.com',
    });

    expect(result.path).toBe(join(tmpDir, 'config.json'));
    expect(JSON.parse(readFileSync(result.path, 'utf8'))).toEqual({
      apiBaseUrl: 'https://example.com/api',
      apiKey: 'thesis_live_testkey',
      defaultMode: 'local-data',
      userAgent: 'Thesis CLI/0.1 research@example.com',
    });
    expect(readThesisConfig()).toEqual({
      apiBaseUrl: 'https://example.com/api',
      apiKey: 'thesis_live_testkey',
      defaultMode: 'local-data',
      userAgent: 'Thesis CLI/0.1 research@example.com',
    });
  });

  it('trims trailing slashes from apiBaseUrl', () => {
    writeThesisConfig({ apiBaseUrl: 'https://example.com/api///' });

    expect(readThesisConfig().apiBaseUrl).toBe('https://example.com/api');
  });

  it('trims whitespace from apiKey', () => {
    writeThesisConfig({ apiKey: '  thesis_live_key  ' });

    expect(readThesisConfig().apiKey).toBe('thesis_live_key');
  });

  it('throws a helpful setup error when apiKey is missing', () => {
    expect(() => requireThesisApiConfig()).toThrow(/Create .*config\.json/);
  });

  it('throws a helpful parse error for malformed JSON', () => {
    writeFileSync(join(tmpDir, 'config.json'), '{ not valid json');

    expect(() => readThesisConfig()).toThrow(/Could not parse/);
  });

  it('masks API keys for display', () => {
    expect(maskApiKey('thesis_live_abcdefghijklmnopqrstuvwxyz')).toBe('thesis_liv...wxyz');
    expect(maskApiKey('short')).toBe('***');
    expect(maskApiKey('')).toBe('(missing)');
  });
});
