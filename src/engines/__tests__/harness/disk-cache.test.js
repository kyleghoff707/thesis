/**
 * disk-cache.test.js — Unit tests for shared disk cache + field-mapping.json _sources
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readCache, writeCache, isExpired } from '../../../../validation/scripts/lib/disk-cache.mjs';

// ─── Disk Cache Tests ────────────────────────────────────────────────────────

describe('disk-cache', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'disk-cache-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readCache', () => {
    it('returns null for nonexistent file', () => {
      const result = readCache(tmpDir, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns parsed data for valid cached file', () => {
      const payload = { _cachedAt: new Date().toISOString(), data: { foo: 'bar' } };
      fs.writeFileSync(path.join(tmpDir, 'test-key.json'), JSON.stringify(payload));
      const result = readCache(tmpDir, 'test-key');
      expect(result).toEqual(payload);
      expect(result.data.foo).toBe('bar');
    });
  });

  describe('isExpired', () => {
    it('returns true when cached is null', () => {
      expect(isExpired(null)).toBe(true);
    });

    it('returns true when _cachedAt is missing', () => {
      expect(isExpired({ data: {} })).toBe(true);
    });

    it('returns true when _cachedAt is older than TTL', () => {
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days ago
      expect(isExpired({ _cachedAt: old })).toBe(true);
    });

    it('returns false when _cachedAt is within TTL', () => {
      const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
      expect(isExpired({ _cachedAt: recent })).toBe(false);
    });

    it('respects custom TTL', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const oneHourTtl = 1 * 60 * 60 * 1000;
      expect(isExpired({ _cachedAt: twoHoursAgo }, oneHourTtl)).toBe(true);
    });
  });

  describe('writeCache', () => {
    it('creates directory if missing and writes JSON with _cachedAt timestamp', () => {
      const nestedDir = path.join(tmpDir, 'nested', 'deep');
      writeCache(nestedDir, 'my-key', { ticker: 'AAPL' });

      const filePath = path.join(nestedDir, 'my-key.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const written = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(written._cachedAt).toBeDefined();
      expect(typeof written._cachedAt).toBe('string');
      expect(written.data).toEqual({ ticker: 'AAPL' });
    });

    it('writes with 2-space indent for readability', () => {
      writeCache(tmpDir, 'indent-test', { x: 1 });
      const raw = fs.readFileSync(path.join(tmpDir, 'indent-test.json'), 'utf-8');
      // 2-space indent means lines like '  "data": {'
      expect(raw).toContain('  "data"');
    });
  });
});

// ─── field-mapping.json _sources Tests ───────────────────────────────────────

describe('field-mapping.json _sources', () => {
  let fieldMapping;

  beforeEach(() => {
    const fmPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../fixtures/morningstar/field-mapping.json'
    );
    fieldMapping = JSON.parse(fs.readFileSync(fmPath, 'utf-8'));
  });

  it('has _sources at top level', () => {
    expect(fieldMapping._sources).toBeDefined();
    expect(typeof fieldMapping._sources).toBe('object');
  });

  it('existing _meta section is preserved', () => {
    expect(fieldMapping._meta).toBeDefined();
    expect(fieldMapping._meta.totalMapped).toBe(87);
  });

  it('existing income section is preserved', () => {
    expect(fieldMapping.income).toBeDefined();
    expect(fieldMapping.income['Total Revenue'].thesisField).toBe('revenues');
  });

  it('existing balance_sheet section is preserved', () => {
    expect(fieldMapping.balance_sheet).toBeDefined();
    expect(fieldMapping.balance_sheet['Total Assets'].thesisField).toBe('assets');
  });

  it('existing cash_flow section is preserved', () => {
    expect(fieldMapping.cash_flow).toBeDefined();
  });

  describe('_sources.fmp', () => {
    it('has at least 30 field mappings', () => {
      expect(Object.keys(fieldMapping._sources.fmp).length).toBeGreaterThanOrEqual(30);
    });

    it('maps revenue correctly', () => {
      expect(fieldMapping._sources.fmp.revenue).toEqual({
        canonical: 'revenues',
        sign: 1,
        statement: 'income',
      });
    });

    it('maps capitalExpenditure with sign -1 (FMP negative, canonical positive)', () => {
      expect(fieldMapping._sources.fmp.capitalExpenditure).toEqual({
        canonical: 'capital_expenditures',
        sign: -1,
        statement: 'cashFlow',
      });
    });

    it('maps netIncome', () => {
      expect(fieldMapping._sources.fmp.netIncome).toEqual({
        canonical: 'net_income_loss',
        sign: 1,
        statement: 'income',
      });
    });

    it('maps totalAssets', () => {
      expect(fieldMapping._sources.fmp.totalAssets).toEqual({
        canonical: 'total_assets',
        sign: 1,
        statement: 'balance',
      });
    });
  });

  describe('_sources.simfin', () => {
    it('has GENERAL, BANKS, and INSURANCE templates', () => {
      expect(fieldMapping._sources.simfin.GENERAL).toBeDefined();
      expect(fieldMapping._sources.simfin.BANKS).toBeDefined();
      expect(fieldMapping._sources.simfin.INSURANCE).toBeDefined();
    });

    it('GENERAL has at least 25 field mappings', () => {
      expect(Object.keys(fieldMapping._sources.simfin.GENERAL).length).toBeGreaterThanOrEqual(25);
    });

    it('GENERAL maps Revenue correctly', () => {
      expect(fieldMapping._sources.simfin.GENERAL['Revenue']).toEqual({
        canonical: 'revenues',
        sign: 1,
        statement: 'PL',
      });
    });

    it('GENERAL maps Cost of revenue with sign -1 (SimFin negative, flip to positive)', () => {
      expect(fieldMapping._sources.simfin.GENERAL['Cost of revenue']).toEqual({
        canonical: 'cost_of_revenue',
        sign: -1,
        statement: 'PL',
      });
    });

    it('BANKS has Net Revenue mapping', () => {
      expect(fieldMapping._sources.simfin.BANKS['Net Revenue']).toEqual({
        canonical: 'revenues',
        sign: 1,
        statement: 'PL',
      });
    });

    it('INSURANCE has Net Revenue mapping', () => {
      expect(fieldMapping._sources.simfin.INSURANCE['Net Revenue']).toEqual({
        canonical: 'revenues',
        sign: 1,
        statement: 'PL',
      });
    });
  });

  describe('_sources.mstarpy', () => {
    it('has at least 20 field mappings', () => {
      expect(Object.keys(fieldMapping._sources.mstarpy).length).toBeGreaterThanOrEqual(20);
    });

    it('maps Total Revenue correctly', () => {
      expect(fieldMapping._sources.mstarpy['Total Revenue']).toEqual({
        canonical: 'revenues',
        sign: 1,
        statement: 'income',
      });
    });

    it('maps Cost of Revenue with sign -1 (mstarpy negative, flip)', () => {
      expect(fieldMapping._sources.mstarpy['Cost of Revenue']).toEqual({
        canonical: 'cost_of_revenue',
        sign: -1,
        statement: 'income',
      });
    });

    it('maps Total Assets', () => {
      expect(fieldMapping._sources.mstarpy['Total Assets']).toEqual({
        canonical: 'total_assets',
        sign: 1,
        statement: 'balance',
      });
    });
  });
});
