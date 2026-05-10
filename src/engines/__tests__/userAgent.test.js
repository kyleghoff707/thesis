// Tests for userAgent.js — single source of truth for SEC EDGAR User-Agent.
// Uses THESIS_DIR override to redirect configPath() at a tmp dir.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getUserAgent, _resetUserAgentCache } from '../userAgent.js';

let tmpDir;
let prevThesisDir;

beforeEach(() => {
  prevThesisDir = process.env.THESIS_DIR;
  tmpDir = mkdtempSync(join(tmpdir(), 'thesis-ua-'));
  process.env.THESIS_DIR = tmpDir;
  _resetUserAgentCache();
});

afterEach(() => {
  if (prevThesisDir === undefined) delete process.env.THESIS_DIR;
  else process.env.THESIS_DIR = prevThesisDir;
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  _resetUserAgentCache();
});

describe('getUserAgent', () => {
  it('returns the default UA when no config file exists', () => {
    const ua = getUserAgent();
    expect(ua).toMatch(/^Thesis CLI\//);
    expect(ua).toContain('github.com/kyleghoff707/thesis');
  });

  it('returns the override when config.json has userAgent', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, 'config.json'),
      JSON.stringify({ userAgent: 'CustomBot/2.0 me@example.com' })
    );
    const ua = getUserAgent();
    expect(ua).toBe('CustomBot/2.0 me@example.com');
  });

  it('falls back to default when config.json is malformed', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'config.json'), '{ not valid json');
    const ua = getUserAgent();
    expect(ua).toMatch(/^Thesis CLI\//);
  });

  it('falls back to default when config.json has non-string userAgent', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, 'config.json'),
      JSON.stringify({ userAgent: 12345 })
    );
    const ua = getUserAgent();
    expect(ua).toMatch(/^Thesis CLI\//);
  });

  it('caches the result across calls (singleton)', () => {
    const first = getUserAgent();
    // Even after writing a config, the cached value should persist
    // until _resetUserAgentCache() is called.
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, 'config.json'),
      JSON.stringify({ userAgent: 'ShouldNotAppear/1.0' })
    );
    const second = getUserAgent();
    expect(second).toBe(first);
  });
});
