/**
 * consensus.test.js — Unit tests for multi-source consensus classification engine
 *
 * Tests sourcesAgree tolerance, findLargestCluster grouping,
 * and classifyField classification per D-05/D-06.
 */

import { describe, it, expect } from 'vitest';
import {
  sourcesAgree,
  findLargestCluster,
  classifyField,
} from '../../../../validation/scripts/lib/consensus.mjs';

// ─── sourcesAgree ────────────────────────────────────────────

describe('sourcesAgree', () => {
  it('returns true when values are within 1% tolerance (0.5% diff)', () => {
    expect(sourcesAgree(100, 100.5, 0.01)).toBe(true);
  });

  it('returns false when values exceed 1% tolerance (2% diff)', () => {
    expect(sourcesAgree(100, 102, 0.01)).toBe(false);
  });

  it('returns true when both values are zero', () => {
    expect(sourcesAgree(0, 0, 0.01)).toBe(true);
  });

  it('returns false when one value is zero and other exceeds $1M absolute', () => {
    expect(sourcesAgree(0, 500_000_000, 0.01)).toBe(false);
  });

  it('returns true when one value is zero and other is below $1M absolute', () => {
    expect(sourcesAgree(0, 500, 0.01)).toBe(true);
  });

  it('returns true at exactly 1% boundary', () => {
    expect(sourcesAgree(100, 101, 0.01)).toBe(true);
  });

  it('returns false just over 1% boundary', () => {
    expect(sourcesAgree(100, 101.1, 0.01)).toBe(false);
  });

  it('handles negative values', () => {
    expect(sourcesAgree(-100, -100.5, 0.01)).toBe(true);
    expect(sourcesAgree(-100, -102, 0.01)).toBe(false);
  });

  it('uses default 1% tolerance when not specified', () => {
    expect(sourcesAgree(100, 100.5)).toBe(true);
    expect(sourcesAgree(100, 102)).toBe(false);
  });
});

// ─── findLargestCluster ──────────────────────────────────────

describe('findLargestCluster', () => {
  it('finds cluster of 2 among 3 values (two agree, one differs)', () => {
    const sources = [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: 100.5 },
      { source: 'mstarpy', value: 200 },
    ];
    const cluster = findLargestCluster(sources, 0.01);
    expect(cluster).toHaveLength(2);
    expect(cluster.map(s => s.source)).toContain('fmp');
    expect(cluster.map(s => s.source)).toContain('simfin');
  });

  it('finds cluster of 3 when all agree within tolerance', () => {
    const sources = [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: 100.5 },
      { source: 'mstarpy', value: 100.3 },
    ];
    const cluster = findLargestCluster(sources, 0.01);
    expect(cluster).toHaveLength(3);
  });

  it('returns single-element cluster when no values agree', () => {
    const sources = [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: 200 },
      { source: 'mstarpy', value: 300 },
    ];
    const cluster = findLargestCluster(sources, 0.01);
    expect(cluster).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    const cluster = findLargestCluster([], 0.01);
    expect(cluster).toHaveLength(0);
  });

  it('returns single-element cluster for single source', () => {
    const sources = [{ source: 'fmp', value: 100 }];
    const cluster = findLargestCluster(sources, 0.01);
    expect(cluster).toHaveLength(1);
    expect(cluster[0].source).toBe('fmp');
  });

  it('picks the larger cluster when two separate clusters exist', () => {
    const sources = [
      { source: 'a', value: 100 },
      { source: 'b', value: 100.5 },
      { source: 'c', value: 200 },
      { source: 'd', value: 200.5 },
      { source: 'e', value: 100.3 },
    ];
    const cluster = findLargestCluster(sources, 0.01);
    expect(cluster).toHaveLength(3); // a, b, e cluster
    const values = cluster.map(s => s.value);
    expect(values.every(v => v >= 99 && v <= 101)).toBe(true);
  });
});

// ─── classifyField ───────────────────────────────────────────

describe('classifyField', () => {
  // ─── MATCH ───

  it('returns MATCH when 3 sources agree and thesis matches', () => {
    const result = classifyField(100, [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: 100.5 },
      { source: 'mstarpy', value: 100.3 },
    ]);
    expect(result.classification).toBe('MATCH');
    expect(result.agreeingSources).toHaveLength(3);
    expect(result.totalSources).toBe(3);
  });

  it('returns MATCH when 1 non-null source matches thesis', () => {
    const result = classifyField(100, [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: null },
    ]);
    expect(result.classification).toBe('MATCH');
  });

  // ─── CONSENSUS_DIFF ───

  it('returns CONSENSUS_DIFF when 3 sources agree and thesis differs', () => {
    const result = classifyField(999, [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: 100.5 },
      { source: 'mstarpy', value: 100.3 },
    ]);
    expect(result.classification).toBe('CONSENSUS_DIFF');
    expect(result.consensusValue).toBeCloseTo(100.3, 1); // median
    expect(result.agreeingSources).toHaveLength(3);
    expect(result.totalSources).toBe(3);
  });

  it('returns CONSENSUS_DIFF when thesis is null but 2+ sources have consensus', () => {
    const result = classifyField(null, [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: 100 },
      { source: 'mstarpy', value: 100 },
    ]);
    expect(result.classification).toBe('CONSENSUS_DIFF');
    expect(result.consensusValue).toBe(100);
  });

  // ─── LIKELY_BUG ───

  it('returns LIKELY_BUG when 2 sources agree and thesis differs', () => {
    const result = classifyField(999, [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: 100.5 },
      { source: 'mstarpy', value: 500 },
    ]);
    expect(result.classification).toBe('LIKELY_BUG');
    expect(result.agreeingSources).toHaveLength(2);
  });

  // ─── METHODOLOGY_DIFF ───

  it('returns METHODOLOGY_DIFF when all sources disagree', () => {
    const result = classifyField(999, [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: 200 },
      { source: 'mstarpy', value: 300 },
    ]);
    expect(result.classification).toBe('METHODOLOGY_DIFF');
    expect(result.consensusValue).toBeNull();
    expect(result.agreeingSources).toHaveLength(0);
  });

  it('returns METHODOLOGY_DIFF when only 1 non-null source and thesis differs', () => {
    const result = classifyField(999, [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: null },
    ]);
    expect(result.classification).toBe('METHODOLOGY_DIFF');
  });

  // ─── COVERAGE_GAP ───

  it('returns COVERAGE_GAP when all sources null and thesis null', () => {
    const result = classifyField(null, [
      { source: 'fmp', value: null },
      { source: 'simfin', value: null },
    ]);
    expect(result.classification).toBe('COVERAGE_GAP');
    expect(result.consensusValue).toBeNull();
    expect(result.agreeingSources).toHaveLength(0);
    expect(result.totalSources).toBe(2);
  });

  // ─── UNIQUE_COVERAGE ───

  it('returns UNIQUE_COVERAGE when all sources null but thesis has value', () => {
    const result = classifyField(100, [
      { source: 'fmp', value: null },
      { source: 'simfin', value: null },
    ]);
    expect(result.classification).toBe('UNIQUE_COVERAGE');
    expect(result.consensusValue).toBeNull();
    expect(result.totalSources).toBe(2);
  });

  // ─── Edge cases ───

  it('handles empty source array', () => {
    const result = classifyField(100, []);
    expect(result.classification).toBe('UNIQUE_COVERAGE');
    expect(result.totalSources).toBe(0);
  });

  it('handles large financial values with 1% tolerance', () => {
    // AAPL-scale revenue: 416B vs 418B = 0.48% diff -> MATCH
    const result = classifyField(416_161_000_000, [
      { source: 'fmp', value: 416_161_000_000 },
      { source: 'simfin', value: 416_161_000_000 },
      { source: 'mstarpy', value: 418_000_000_000 },
    ]);
    expect(result.classification).toBe('MATCH');
  });

  it('returns LIKELY_BUG when thesis null and only 2 sources agree', () => {
    const result = classifyField(null, [
      { source: 'fmp', value: 100 },
      { source: 'simfin', value: 100 },
      { source: 'mstarpy', value: 500 },
    ]);
    expect(result.classification).toBe('LIKELY_BUG');
  });

  it('returns result object with correct shape', () => {
    const result = classifyField(100, [
      { source: 'fmp', value: 100 },
    ]);
    expect(result).toHaveProperty('classification');
    expect(result).toHaveProperty('consensusValue');
    expect(result).toHaveProperty('agreeingSources');
    expect(result).toHaveProperty('totalSources');
  });
});
