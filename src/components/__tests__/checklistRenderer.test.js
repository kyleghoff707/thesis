// Tests for ChecklistRenderer — aggregate bar and score text logic
// Wave 0 contract tests: define helpers BEFORE implementation

import { describe, it, expect } from 'vitest';
import { _testExports } from '../ChecklistRenderer.jsx';

const { computeBarSegments, formatScoreText } = _testExports;

describe('ChecklistRenderer: computeBarSegments', () => {
  it('returns 3 segments when all counts > 0', () => {
    const segments = computeBarSegments({ passCount: 12, failCount: 1, partialCount: 2, totalItems: 15 });
    expect(segments).toHaveLength(3);
    expect(segments[0].flex).toBe(12);
    expect(segments[0].label).toBe('pass');
    expect(segments[1].flex).toBe(2);
    expect(segments[1].label).toBe('partial');
    expect(segments[2].flex).toBe(1);
    expect(segments[2].label).toBe('fail');
  });

  it('omits zero-count segments', () => {
    const segments = computeBarSegments({ passCount: 15, failCount: 0, partialCount: 0, totalItems: 15 });
    expect(segments).toHaveLength(1);
    expect(segments[0].flex).toBe(15);
    expect(segments[0].label).toBe('pass');
  });

  it('returns empty array for null summary', () => {
    expect(computeBarSegments(null)).toEqual([]);
  });

  it('returns empty array for undefined summary', () => {
    expect(computeBarSegments(undefined)).toEqual([]);
  });

  it('handles PARTIAL-only checklist (all partial)', () => {
    const segments = computeBarSegments({ passCount: 0, failCount: 0, partialCount: 13, totalItems: 13 });
    expect(segments).toHaveLength(1);
    expect(segments[0].label).toBe('partial');
    expect(segments[0].flex).toBe(13);
  });
});

describe('ChecklistRenderer: formatScoreText', () => {
  it('formats standard counts with middot separators', () => {
    const text = formatScoreText({ passCount: 12, failCount: 0, partialCount: 3, totalItems: 15 });
    expect(text).toBe('12 PASS \u00B7 3 PARTIAL \u00B7 0 FAIL');
  });

  it('formats all-pass checklist', () => {
    const text = formatScoreText({ passCount: 15, failCount: 0, partialCount: 0, totalItems: 15 });
    expect(text).toBe('15 PASS \u00B7 0 PARTIAL \u00B7 0 FAIL');
  });

  it('returns empty string for null summary', () => {
    expect(formatScoreText(null)).toBe('');
  });
});
