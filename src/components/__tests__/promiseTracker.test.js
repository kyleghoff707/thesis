import { describe, it, expect } from 'vitest';
import { _testExports } from '../PromiseTracker.jsx';
import { C } from '../../theme';

const { computePromiseBarSegments, formatPromiseScoreText } = _testExports;

describe('computePromiseBarSegments', () => {
  it('returns empty array for null/empty promises', () => {
    expect(computePromiseBarSegments(null)).toEqual([]);
    expect(computePromiseBarSegments([])).toEqual([]);
    expect(computePromiseBarSegments(undefined)).toEqual([]);
  });

  it('returns correct segments for [2 KEPT, 1 PARTIAL, 1 BROKEN]', () => {
    const promises = [
      { quote: 'a', status: 'KEPT' },
      { quote: 'b', status: 'KEPT' },
      { quote: 'c', status: 'PARTIAL' },
      { quote: 'd', status: 'BROKEN' },
    ];
    const segments = computePromiseBarSegments(promises);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ flex: 2, color: C.green, label: 'kept' });
    expect(segments[1]).toEqual({ flex: 1, color: C.yellow, label: 'partial' });
    expect(segments[2]).toEqual({ flex: 1, color: C.red, label: 'broken' });
  });

  it('includes PENDING segment with C.badge color', () => {
    const promises = [
      { quote: 'a', status: 'KEPT' },
      { quote: 'b', status: 'PENDING' },
      { quote: 'c', status: 'PENDING' },
    ];
    const segments = computePromiseBarSegments(promises);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ flex: 1, color: C.green, label: 'kept' });
    expect(segments[1]).toEqual({ flex: 2, color: C.badge, label: 'pending' });
  });
});

describe('formatPromiseScoreText', () => {
  it('returns formatted score text with middot separators', () => {
    const promises = [
      { quote: 'a', status: 'KEPT' },
      { quote: 'b', status: 'KEPT' },
      { quote: 'c', status: 'KEPT' },
      { quote: 'd', status: 'PARTIAL' },
    ];
    const text = formatPromiseScoreText(promises);
    expect(text).toBe('3 KEPT \u00B7 1 PARTIAL \u00B7 0 BROKEN');
  });

  it('returns empty string for null promises', () => {
    expect(formatPromiseScoreText(null)).toBe('');
    expect(formatPromiseScoreText([])).toBe('');
    expect(formatPromiseScoreText(undefined)).toBe('');
  });
});
