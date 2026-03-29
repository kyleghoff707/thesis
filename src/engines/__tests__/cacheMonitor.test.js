// Cache Monitor — Cache hit/miss tracking tests (API-06)
// Validates cache read/write tracking and 70% threshold warning

import { describe, it, expect } from 'vitest';
import { createCacheMonitor } from '../cacheMonitor.js';

describe('createCacheMonitor', () => {
  it('should return object with record() and getSummary() methods', () => {
    const monitor = createCacheMonitor();
    expect(typeof monitor.record).toBe('function');
    expect(typeof monitor.getSummary).toBe('function');
  });

  it('should count cacheWrite > 0 with cacheRead === 0 as a write (first agent)', () => {
    const monitor = createCacheMonitor();
    monitor.record({ cacheWrite: 5000, cacheRead: 0, inputTokens: 10000 });
    const summary = monitor.getSummary();
    expect(summary.totalWrite).toBe(5000);
    expect(summary.totalRead).toBe(0);
  });

  it('should count cacheRead > 0 as a read (subsequent agent)', () => {
    const monitor = createCacheMonitor();
    monitor.record({ cacheWrite: 5000, cacheRead: 0, inputTokens: 10000 });
    monitor.record({ cacheWrite: 0, cacheRead: 4500, inputTokens: 8000 });
    const summary = monitor.getSummary();
    expect(summary.totalRead).toBe(4500);
    expect(summary.totalWrite).toBe(5000);
  });

  it('should return full summary shape from getSummary()', () => {
    const monitor = createCacheMonitor();
    monitor.record({ cacheWrite: 5000, cacheRead: 0, inputTokens: 10000 });
    const summary = monitor.getSummary();
    expect(summary).toHaveProperty('entries');
    expect(summary).toHaveProperty('totalRead');
    expect(summary).toHaveProperty('totalWrite');
    expect(summary).toHaveProperty('totalUncached');
    expect(summary).toHaveProperty('hitRate');
    expect(summary).toHaveProperty('hitRatePct');
    expect(summary).toHaveProperty('belowThreshold');
  });

  it('should compute hitRate as totalRead / (totalRead + totalWrite) -- 3 reads and 1 write = 0.75', () => {
    const monitor = createCacheMonitor();
    // 1 write (first agent)
    monitor.record({ cacheWrite: 1000, cacheRead: 0, inputTokens: 5000 });
    // 3 reads (subsequent agents)
    monitor.record({ cacheWrite: 0, cacheRead: 1000, inputTokens: 5000 });
    monitor.record({ cacheWrite: 0, cacheRead: 1000, inputTokens: 5000 });
    monitor.record({ cacheWrite: 0, cacheRead: 1000, inputTokens: 5000 });
    const summary = monitor.getSummary();
    // hitRate = 3000 / (3000 + 1000) = 0.75
    expect(summary.hitRate).toBeCloseTo(0.75, 4);
    expect(summary.hitRatePct).toBe('75.0%');
  });

  it('should set belowThreshold true when hitRate < 0.70 AND entries > 1', () => {
    const monitor = createCacheMonitor();
    // 1 write, 1 read = 50% hit rate, below 70%
    monitor.record({ cacheWrite: 1000, cacheRead: 0, inputTokens: 5000 });
    monitor.record({ cacheWrite: 1000, cacheRead: 1000, inputTokens: 5000 });
    const summary = monitor.getSummary();
    // hitRate = 1000 / (1000 + 2000) = 0.333...
    expect(summary.hitRate).toBeLessThan(0.70);
    expect(summary.belowThreshold).toBe(true);
  });

  it('should set belowThreshold false for single-agent runs even if hitRate is 0', () => {
    const monitor = createCacheMonitor();
    monitor.record({ cacheWrite: 5000, cacheRead: 0, inputTokens: 10000 });
    const summary = monitor.getSummary();
    expect(summary.hitRate).toBe(0);
    expect(summary.entries).toBe(1);
    expect(summary.belowThreshold).toBe(false);
  });

  it('should return hitRate 0 when no cache activity (totalRead + totalWrite === 0)', () => {
    const monitor = createCacheMonitor();
    monitor.record({ cacheWrite: 0, cacheRead: 0, inputTokens: 5000 });
    monitor.record({ cacheWrite: 0, cacheRead: 0, inputTokens: 3000 });
    const summary = monitor.getSummary();
    expect(summary.hitRate).toBe(0);
    expect(summary.totalRead).toBe(0);
    expect(summary.totalWrite).toBe(0);
    expect(summary.totalUncached).toBe(8000);
  });

  it('should handle usage with missing/zero cacheRead and cacheWrite fields', () => {
    const monitor = createCacheMonitor();
    // Missing fields entirely
    monitor.record({ inputTokens: 5000 });
    // Explicit zero
    monitor.record({ cacheRead: 0, cacheWrite: 0, inputTokens: 3000 });
    // Only cacheRead present
    monitor.record({ cacheRead: 2000, inputTokens: 4000 });
    const summary = monitor.getSummary();
    expect(summary.entries).toBe(3);
    expect(summary.totalRead).toBe(2000);
    expect(summary.totalWrite).toBe(0);
    expect(summary.totalUncached).toBe(12000);
  });
});
