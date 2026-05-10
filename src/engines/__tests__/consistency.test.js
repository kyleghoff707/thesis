import { describe, it, expect } from 'vitest';
import { coefficientOfVariation, consistencyScore } from '../utils/consistency.js';

describe('coefficientOfVariation', () => {
  it('returns 0 for a perfectly steady series', () => {
    expect(coefficientOfVariation([0.10, 0.10, 0.10, 0.10])).toBe(0);
  });

  it('returns null for fewer than 3 data points', () => {
    expect(coefficientOfVariation([0.10])).toBeNull();
    expect(coefficientOfVariation([0.10, 0.12])).toBeNull();
  });

  it('returns null for an empty or all-null series', () => {
    expect(coefficientOfVariation([])).toBeNull();
    expect(coefficientOfVariation([null, null])).toBeNull();
  });

  it('uses absolute mean to handle negative-mean series safely', () => {
    const cv = coefficientOfVariation([-0.10, 0.00, -0.05]);
    expect(cv).toBeGreaterThan(0);
  });

  it('skips null entries when computing', () => {
    const cv = coefficientOfVariation([0.10, null, 0.10, 0.10]);
    expect(cv).toBe(0);
  });
});

describe('consistencyScore', () => {
  it('returns 100 for CV = 0', () => {
    expect(consistencyScore(0)).toBe(100);
  });

  it('returns 50 for CV = 0.3', () => {
    expect(consistencyScore(0.3)).toBe(50);
  });

  it('returns 0 for CV >= 0.6', () => {
    expect(consistencyScore(0.6)).toBe(0);
    expect(consistencyScore(1.0)).toBe(0);
  });

  it('returns null when CV is null', () => {
    expect(consistencyScore(null)).toBeNull();
  });
});
