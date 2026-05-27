import { describe, it, expect, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { thesisHome, reportsDir, cacheDir, configPath } from '../thesisDir.js';

const ORIGINAL = process.env.THESIS_DIR;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.THESIS_DIR;
  else process.env.THESIS_DIR = ORIGINAL;
});

describe('thesisDir', () => {
  it('defaults to ~/thesis when THESIS_DIR unset', () => {
    delete process.env.THESIS_DIR;
    expect(thesisHome()).toBe(path.join(os.homedir(), 'thesis'));
  });

  it('honors THESIS_DIR override', () => {
    process.env.THESIS_DIR = '/tmp/custom-thesis';
    expect(thesisHome()).toBe('/tmp/custom-thesis');
  });

  it('reportsDir returns base when ticker omitted', () => {
    delete process.env.THESIS_DIR;
    expect(reportsDir()).toBe(path.join(os.homedir(), 'thesis', 'reports'));
  });

  it('reportsDir appends ticker', () => {
    delete process.env.THESIS_DIR;
    expect(reportsDir('AAPL')).toBe(path.join(os.homedir(), 'thesis', 'reports', 'AAPL'));
  });

  it('cacheDir returns base when ticker omitted', () => {
    delete process.env.THESIS_DIR;
    expect(cacheDir()).toBe(path.join(os.homedir(), 'thesis', 'cache'));
  });

  it('configPath returns ~/thesis/config.json', () => {
    delete process.env.THESIS_DIR;
    expect(configPath()).toBe(path.join(os.homedir(), 'thesis', 'config.json'));
  });
});
