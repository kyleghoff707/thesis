// Context Budget — Token estimation and cost tracking tests
// Validates character-based token estimation and per-agent cost aggregation

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
});

describe('createBudgetTracker', () => {
  it('should record and retrieve entries', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', 'meaning', 50000, 8000, 'claude-sonnet-4-20250514');
    const summary = tracker.getSummary();
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].agentRole).toBe('financial-analyst');
    expect(summary.entries[0].sectionKey).toBe('meaning');
  });

  it('should aggregate totals across entries', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', 'meaning', 50000, 8000, 'claude-sonnet-4-20250514');
    tracker.record('business-analyst', 'company_info', 30000, 5000, 'claude-sonnet-4-20250514');
    tracker.record('risk-analyst', 'minimum_standards', 20000, 3000, 'claude-sonnet-4-20250514');
    const summary = tracker.getSummary();
    // 50000+30000+20000 chars = 100000 chars -> estimateTokens(100000) = 25000
    // 8000+5000+3000 chars = 16000 chars -> estimateTokens(16000) = 4000
    expect(summary.totals.input).toBe(25000);
    expect(summary.totals.output).toBe(4000);
  });

  it('should compute estimated cost for all entries', () => {
    const tracker = createBudgetTracker();
    // 3 Sonnet entries
    tracker.record('financial-analyst', 'meaning', 40000, 8000, 'claude-sonnet-4-20250514');
    tracker.record('business-analyst', 'company_info', 40000, 8000, 'claude-sonnet-4-20250514');
    tracker.record('risk-analyst', 'minimum_standards', 40000, 8000, 'claude-sonnet-4-20250514');
    // 1 Opus entry
    tracker.record('synthesis-writer', 'overall_verdict', 40000, 8000, 'claude-opus-4-6');
    const summary = tracker.getSummary();

    // Each entry: 40000 chars / 4 = 10000 input tokens, 8000 chars / 4 = 2000 output tokens
    // Sonnet per entry: 10000*3/1M + 2000*15/1M = 0.03 + 0.03 = 0.06
    // 3 Sonnet entries: 0.18
    // Opus entry: 10000*15/1M + 2000*75/1M = 0.15 + 0.15 = 0.30
    // Total: 0.18 + 0.30 = 0.48
    expect(summary.estimatedCost.total).toBeCloseTo(0.48, 4);
  });

  it('should return empty summary when no entries', () => {
    const tracker = createBudgetTracker();
    const summary = tracker.getSummary();
    expect(summary.entries).toHaveLength(0);
    expect(summary.totals.input).toBe(0);
    expect(summary.totals.output).toBe(0);
    expect(summary.estimatedCost.total).toBe(0);
  });
});

describe('formatBudgetReport', () => {
  it('should format summary as human-readable string', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', 'meaning', 50000, 8000, 'claude-sonnet-4-20250514');
    const summary = tracker.getSummary();
    const report = formatBudgetReport(summary);
    expect(report).toContain('Token Budget Report');
    expect(report).toContain('financial-analyst');
    expect(report).toContain('meaning');
    expect(report).toContain('$');
  });

  it('should show per-agent breakdown', () => {
    const tracker = createBudgetTracker();
    tracker.record('financial-analyst', 'meaning', 40000, 8000, 'claude-sonnet-4-20250514');
    tracker.record('business-analyst', 'company_info', 30000, 5000, 'claude-sonnet-4-20250514');
    const summary = tracker.getSummary();
    const report = formatBudgetReport(summary);
    // Each agent on its own line
    expect(report).toContain('financial-analyst');
    expect(report).toContain('business-analyst');
    expect(report).toContain('meaning');
    expect(report).toContain('company_info');
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
    expect(_testExports.DEFAULT_MODEL).toBe('claude-sonnet-4-20250514');
  });
});
