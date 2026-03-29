// Context Budget — Token estimation and cost tracking tests
// Validates actual-usage budget tracking and corrected Opus 4.6 pricing

import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  computeCost,
  createBudgetTracker,
  formatBudgetReport,
  MODEL_PRICING,
  _testExports,
} from '../contextBudget.js';

describe('estimateTokens', () => {
  it('should estimate tokens from character count', () => {
    // "hello world" = 11 chars, 11/4 = 2.75, ceil to 3
    expect(estimateTokens('hello world')).toBe(3);
  });

  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should return 0 for null/undefined', () => {
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  it('should handle large text', () => {
    const largeText = 'a'.repeat(40000);
    // 40000 / 4 = 10000 tokens exactly
    expect(estimateTokens(largeText)).toBe(10000);
  });

  it('should accept a number (character count) directly', () => {
    // 100 chars / 4 = 25 tokens
    expect(estimateTokens(100)).toBe(25);
  });
});

describe('computeCost', () => {
  it('should compute Sonnet pricing', () => {
    // 1000 input at $3/M = 0.003, 500 output at $15/M = 0.0075
    const cost = computeCost(1000, 500, 'claude-sonnet-4-20250514');
    expect(cost.input).toBeCloseTo(0.003, 6);
    expect(cost.output).toBeCloseTo(0.0075, 6);
    expect(cost.total).toBeCloseTo(0.0105, 6);
  });

  it('should compute Opus pricing at corrected $5/$25 rates', () => {
    // 1000 input at $5/M = 0.005, 500 output at $25/M = 0.0125
    const cost = computeCost(1000, 500, 'claude-opus-4-6');
    expect(cost.input).toBeCloseTo(0.005, 6);
    expect(cost.output).toBeCloseTo(0.0125, 6);
    expect(cost.total).toBeCloseTo(0.0175, 6);
  });

  it('should fallback to Sonnet for unknown model', () => {
    const cost = computeCost(1000, 500, 'claude-unknown-model');
    // Same as Sonnet pricing
    expect(cost.input).toBeCloseTo(0.003, 6);
    expect(cost.output).toBeCloseTo(0.0075, 6);
    expect(cost.total).toBeCloseTo(0.0105, 6);
  });

  it('should return zero cost for zero tokens', () => {
    const cost = computeCost(0, 0, 'claude-sonnet-4-20250514');
    expect(cost.input).toBe(0);
    expect(cost.output).toBe(0);
    expect(cost.total).toBe(0);
  });

  it('should compute cost for claude-sonnet-4-6', () => {
    // 1M input at $3/M = 3.0, 100K output at $15/M = 1.5
    const cost = computeCost(1000000, 100000, 'claude-sonnet-4-6');
    expect(cost.input).toBeCloseTo(3.0, 6);
    expect(cost.output).toBeCloseTo(1.5, 6);
    expect(cost.total).toBeCloseTo(4.5, 6);
  });

  it('should include cache costs when provided', () => {
    // 1000 input at $3/M = 0.003, 500 output at $15/M = 0.0075
    // 2000 cacheRead at $0.30/M = 0.0006, 1000 cacheWrite at $3.75/M = 0.00375
    const cost = computeCost(1000, 500, 'claude-sonnet-4-6', 2000, 1000);
    expect(cost.input).toBeCloseTo(0.003, 6);
    expect(cost.output).toBeCloseTo(0.0075, 6);
    expect(cost.cacheRead).toBeCloseTo(0.0006, 6);
    expect(cost.cacheWrite).toBeCloseTo(0.00375, 6);
    expect(cost.total).toBeCloseTo(0.003 + 0.0075 + 0.0006 + 0.00375, 6);
  });

  it('should compute Opus cache costs at corrected rates', () => {
    // 1000 cacheRead at $0.50/M = 0.0005, 1000 cacheWrite at $6.25/M = 0.00625
    const cost = computeCost(0, 0, 'claude-opus-4-6', 1000, 1000);
    expect(cost.cacheRead).toBeCloseTo(0.0005, 6);
    expect(cost.cacheWrite).toBeCloseTo(0.00625, 6);
  });
});

describe('createBudgetTracker (actual usage)', () => {
  it('should accept 2-param record(agentRole, usage) signature', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', {
      inputTokens: 45000,
      outputTokens: 3800,
      cacheRead: 20000,
      cacheWrite: 5000,
      webSearches: 2,
      cost: 0.42,
    });
    const summary = tracker.getSummary();
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].agentRole).toBe('financial-analyst');
  });

  it('should accept full usage object shape', () => {
    const tracker = createBudgetTracker();
    const usage = {
      inputTokens: 45000,
      outputTokens: 3800,
      cacheRead: 20000,
      cacheWrite: 5000,
      webSearches: 2,
      cost: 0.42,
    };
    tracker.record('business-analyst', usage);
    const summary = tracker.getSummary();
    const entry = summary.entries[0];
    expect(entry.inputTokens).toBe(45000);
    expect(entry.outputTokens).toBe(3800);
    expect(entry.cacheRead).toBe(20000);
    expect(entry.cacheWrite).toBe(5000);
    expect(entry.webSearches).toBe(2);
    expect(entry.cost).toBe(0.42);
  });

  it('should return totals with all numeric fields from getSummary()', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', {
      inputTokens: 10000, outputTokens: 1000,
      cacheRead: 5000, cacheWrite: 2000,
      webSearches: 1, cost: 0.10,
    });
    tracker.record('risk-analyst', {
      inputTokens: 8000, outputTokens: 800,
      cacheRead: 4000, cacheWrite: 0,
      webSearches: 3, cost: 0.08,
    });
    const summary = tracker.getSummary();
    expect(summary.totals.inputTokens).toBe(18000);
    expect(summary.totals.outputTokens).toBe(1800);
    expect(summary.totals.cacheRead).toBe(9000);
    expect(summary.totals.cacheWrite).toBe(2000);
    expect(summary.totals.webSearches).toBe(4);
    expect(summary.totals.cost).toBeCloseTo(0.18, 4);
  });

  it('should include timestamp in each entry', () => {
    const tracker = createBudgetTracker();
    const before = Date.now();
    tracker.record('financial-analyst', {
      inputTokens: 10000, outputTokens: 1000,
      cacheRead: 0, cacheWrite: 0,
      webSearches: 0, cost: 0.05,
    });
    const after = Date.now();
    const entry = tracker.getSummary().entries[0];
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
  });

  it('should aggregate totals across multiple agents', () => {
    const tracker = createBudgetTracker();
    tracker.record('agent-a', { inputTokens: 100, outputTokens: 10, cacheRead: 50, cacheWrite: 20, webSearches: 1, cost: 0.01 });
    tracker.record('agent-b', { inputTokens: 200, outputTokens: 20, cacheRead: 100, cacheWrite: 40, webSearches: 2, cost: 0.02 });
    tracker.record('agent-c', { inputTokens: 300, outputTokens: 30, cacheRead: 150, cacheWrite: 60, webSearches: 0, cost: 0.03 });
    const summary = tracker.getSummary();
    expect(summary.totals.inputTokens).toBe(600);
    expect(summary.totals.outputTokens).toBe(60);
    expect(summary.totals.cacheRead).toBe(300);
    expect(summary.totals.cacheWrite).toBe(120);
    expect(summary.totals.webSearches).toBe(3);
    expect(summary.totals.cost).toBeCloseTo(0.06, 4);
  });

  it('should handle usage with missing fields (default to 0)', () => {
    const tracker = createBudgetTracker();
    tracker.record('minimal-agent', {});
    const summary = tracker.getSummary();
    expect(summary.entries[0].inputTokens).toBe(0);
    expect(summary.entries[0].outputTokens).toBe(0);
    expect(summary.entries[0].cacheRead).toBe(0);
    expect(summary.entries[0].cacheWrite).toBe(0);
    expect(summary.entries[0].webSearches).toBe(0);
    expect(summary.entries[0].cost).toBe(0);
  });

  it('should return empty summary when no entries', () => {
    const tracker = createBudgetTracker();
    const summary = tracker.getSummary();
    expect(summary.entries).toHaveLength(0);
    expect(summary.totals.inputTokens).toBe(0);
    expect(summary.totals.outputTokens).toBe(0);
    expect(summary.totals.cost).toBe(0);
  });
});

describe('formatBudgetReport (actual usage)', () => {
  it('should include cache read/write token counts and web search counts', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', {
      inputTokens: 45000, outputTokens: 3800,
      cacheRead: 20000, cacheWrite: 5000,
      webSearches: 2, cost: 0.42,
    });
    const summary = tracker.getSummary();
    const report = formatBudgetReport(summary);
    expect(report).toContain('Token Budget Report');
    expect(report).toContain('financial-analyst');
    expect(report).toContain('Cache read');
    expect(report).toContain('Cache write');
    expect(report).toContain('Web searches');
    expect(report).toContain('$');
  });

  it('should show totals with all fields', () => {
    const tracker = createBudgetTracker();
    tracker.record('agent-a', { inputTokens: 10000, outputTokens: 1000, cacheRead: 5000, cacheWrite: 2000, webSearches: 1, cost: 0.10 });
    tracker.record('agent-b', { inputTokens: 8000, outputTokens: 800, cacheRead: 4000, cacheWrite: 0, webSearches: 3, cost: 0.08 });
    const summary = tracker.getSummary();
    const report = formatBudgetReport(summary);
    expect(report).toContain('Total input');
    expect(report).toContain('Total output');
    expect(report).toContain('Total cache read');
    expect(report).toContain('Total cache write');
    expect(report).toContain('Total web searches');
    expect(report).toContain('Total cost');
  });
});

describe('exports', () => {
  it('should export MODEL_PRICING with corrected Opus pricing ($5/$25)', () => {
    expect(MODEL_PRICING).toBeDefined();
    expect(MODEL_PRICING['claude-sonnet-4-20250514']).toBeDefined();
    expect(MODEL_PRICING['claude-opus-4-6']).toBeDefined();
    expect(MODEL_PRICING['claude-sonnet-4-20250514'].input).toBe(3.0);
    // Corrected Opus pricing: $5/$25 (not $15/$75)
    expect(MODEL_PRICING['claude-opus-4-6'].input).toBe(5.0);
    expect(MODEL_PRICING['claude-opus-4-6'].output).toBe(25.0);
    expect(MODEL_PRICING['claude-opus-4-6'].cacheRead).toBe(0.50);
    expect(MODEL_PRICING['claude-opus-4-6'].cacheWrite).toBe(6.25);
  });

  it('should export estimateTokens and computeCost for backward compatibility', () => {
    expect(typeof estimateTokens).toBe('function');
    expect(typeof computeCost).toBe('function');
  });

  it('should export _testExports with CHARS_PER_TOKEN and DEFAULT_MODEL', () => {
    expect(_testExports).toBeDefined();
    expect(_testExports.CHARS_PER_TOKEN).toBe(4);
    expect(_testExports.DEFAULT_MODEL).toBe('claude-sonnet-4-6');
  });
});
