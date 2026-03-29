// Context Budget — Token estimation and cost tracking tests
// Validates character-based token estimation, per-agent cost aggregation,
// and the usage-object recording interface for pipeline integration.

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

  it('should compute Opus pricing', () => {
    // 1000 input at $15/M = 0.015, 500 output at $75/M = 0.0375
    const cost = computeCost(1000, 500, 'claude-opus-4-6');
    expect(cost.input).toBeCloseTo(0.015, 6);
    expect(cost.output).toBeCloseTo(0.0375, 6);
    expect(cost.total).toBeCloseTo(0.0525, 6);
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
});

describe('createBudgetTracker', () => {
  it('should record and retrieve entries from usage objects', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', {
      inputTokens: 20000,
      outputTokens: 3000,
      cacheRead: 15000,
      cacheWrite: 5000,
      webSearches: 2,
      cost: 0.12,
    });
    const summary = tracker.getSummary();
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].agentRole).toBe('financial-analyst');
    expect(summary.entries[0].inputTokens).toBe(20000);
    expect(summary.entries[0].cost).toBe(0.12);
  });

  it('should aggregate totals across entries', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', { inputTokens: 20000, outputTokens: 3000, cacheRead: 0, cacheWrite: 0, webSearches: 1, cost: 0.10 });
    tracker.record('business-analyst', { inputTokens: 15000, outputTokens: 2000, cacheRead: 10000, cacheWrite: 0, webSearches: 0, cost: 0.08 });
    tracker.record('risk-analyst', { inputTokens: 10000, outputTokens: 1000, cacheRead: 5000, cacheWrite: 0, webSearches: 2, cost: 0.05 });
    const summary = tracker.getSummary();
    expect(summary.totals.inputTokens).toBe(45000);
    expect(summary.totals.outputTokens).toBe(6000);
    expect(summary.totals.cacheRead).toBe(15000);
    expect(summary.totals.webSearches).toBe(3);
    expect(summary.totals.cost).toBeCloseTo(0.23, 4);
  });

  it('should handle null usage gracefully', () => {
    const tracker = createBudgetTracker();
    tracker.record('agent', null);
    const summary = tracker.getSummary();
    expect(summary.entries).toHaveLength(0);
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

describe('formatBudgetReport', () => {
  it('should format summary as human-readable string', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', { inputTokens: 20000, outputTokens: 3000, cacheRead: 15000, cacheWrite: 5000, webSearches: 1, cost: 0.12 });
    const summary = tracker.getSummary();
    const report = formatBudgetReport(summary);
    expect(report).toContain('Token Budget Report');
    expect(report).toContain('financial-analyst');
    expect(report).toContain('$');
  });

  it('should show per-agent breakdown', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', { inputTokens: 20000, outputTokens: 3000, cacheRead: 0, cacheWrite: 0, webSearches: 1, cost: 0.12 });
    tracker.record('business-analyst', { inputTokens: 15000, outputTokens: 2000, cacheRead: 0, cacheWrite: 0, webSearches: 0, cost: 0.08 });
    const summary = tracker.getSummary();
    const report = formatBudgetReport(summary);
    // Each agent on its own line
    expect(report).toContain('financial-analyst');
    expect(report).toContain('business-analyst');
  });
});

describe('exports', () => {
  it('should export MODEL_PRICING with Sonnet and Opus', () => {
    expect(MODEL_PRICING).toBeDefined();
    expect(MODEL_PRICING['claude-sonnet-4-20250514']).toBeDefined();
    expect(MODEL_PRICING['claude-opus-4-6']).toBeDefined();
    expect(MODEL_PRICING['claude-sonnet-4-20250514'].input).toBe(3.0);
    expect(MODEL_PRICING['claude-opus-4-6'].input).toBe(15.0);
  });

  it('should export _testExports with CHARS_PER_TOKEN and DEFAULT_MODEL', () => {
    expect(_testExports).toBeDefined();
    expect(_testExports.CHARS_PER_TOKEN).toBe(4);
    expect(_testExports.DEFAULT_MODEL).toBe('claude-sonnet-4-6');
  });
});
