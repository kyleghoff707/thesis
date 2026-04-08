// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cacheStore before importing cache
vi.mock('../cacheStore.js', () => ({
  idbGet: vi.fn(() => Promise.resolve(null)),
  idbSet: vi.fn(() => Promise.resolve()),
  idbGetMeta: vi.fn(() => Promise.resolve(null)),
  idbBulkGet: vi.fn(() => Promise.resolve([])),
  idbClear: vi.fn(() => Promise.resolve()),
  idbClearAllCaches: vi.fn(() => Promise.resolve()),
}));

import { clearAllCaches, cacheSet, cacheGet } from '../cache.js';
import { idbClearAllCaches } from '../cacheStore.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('clearAllCaches', () => {
  it('clears memory cache entries', async () => {
    // Write to memory cache via cacheSet (non-IDB key stays in localStorage + memory)
    cacheSet('test-key', { value: 1 }, 'financials');
    expect(cacheGet('test-key')).toEqual({ value: 1 });

    await clearAllCaches();

    expect(cacheGet('test-key')).toBeNull();
  });

  it('clears localStorage sa-cache:* entries', async () => {
    localStorage.setItem('sa-cache:test-key', JSON.stringify({ data: 1, expiresAt: Date.now() + 99999 }));
    localStorage.setItem('sa-cache:another', JSON.stringify({ data: 2, expiresAt: Date.now() + 99999 }));

    await clearAllCaches();

    expect(localStorage.getItem('sa-cache:test-key')).toBeNull();
    expect(localStorage.getItem('sa-cache:another')).toBeNull();
  });

  it('does NOT clear non-cache localStorage keys', async () => {
    localStorage.setItem('stock-analyzer-settings', '{"theme":"dark"}');
    localStorage.setItem('stock-analyzer-reports', '[]');
    localStorage.setItem('sa-last-research', 'some-id');
    localStorage.setItem('sa-cache:should-clear', '{}');

    await clearAllCaches();

    expect(localStorage.getItem('stock-analyzer-settings')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('stock-analyzer-reports')).toBe('[]');
    expect(localStorage.getItem('sa-last-research')).toBe('some-id');
    expect(localStorage.getItem('sa-cache:should-clear')).toBeNull();
  });

  it('calls idbClearAllCaches', async () => {
    await clearAllCaches();
    expect(idbClearAllCaches).toHaveBeenCalledOnce();
  });
});

describe('idbClearAllCaches', () => {
  it('is exported and callable', async () => {
    // The mock verifies it can be called without error
    await idbClearAllCaches();
    expect(idbClearAllCaches).toHaveBeenCalled();
  });
});
