// Tests for VerdictBadge — verdict-to-color mapping logic
// ONEP-03 coverage: verdict rendering as colored pill badges

import { describe, it, expect } from 'vitest';
import { _testExports } from '../VerdictBadge.jsx';

const { getVerdictStyle } = _testExports;

describe('VerdictBadge: getVerdictStyle', () => {
  it('PASS returns green background with white text', () => {
    const style = getVerdictStyle('PASS');
    expect(style).not.toBeNull();
    expect(style.bg).toMatch(/#16a34a|#4ade80/);
    expect(style.text).toBe('#fff');
    expect(style.label).toBe('PASS');
  });

  it('FAIL returns red background with white text', () => {
    const style = getVerdictStyle('FAIL');
    expect(style).not.toBeNull();
    expect(style.bg).toMatch(/#dc2626|#f87171/);
    expect(style.text).toBe('#fff');
    expect(style.label).toBe('FAIL');
  });

  it('WATCHLIST returns yellow/amber background with white text', () => {
    const style = getVerdictStyle('WATCHLIST');
    expect(style).not.toBeNull();
    expect(style.bg).toMatch(/#ca8a04|#fbbf24/);
    expect(style.text).toBe('#fff');
    expect(style.label).toBe('WATCHLIST');
  });

  it('REVIEW returns teal background with white text', () => {
    const style = getVerdictStyle('REVIEW');
    expect(style).not.toBeNull();
    expect(style.bg).toMatch(/#0f766e|#2dd4bf/);
    expect(style.text).toBe('#fff');
    expect(style.label).toBe('REVIEW');
  });

  it('null returns null', () => {
    expect(getVerdictStyle(null)).toBeNull();
  });

  it('undefined returns null', () => {
    expect(getVerdictStyle(undefined)).toBeNull();
  });

  it('invalid string returns null', () => {
    expect(getVerdictStyle('INVALID')).toBeNull();
  });

  it('all 4 valid verdicts return text: #fff', () => {
    for (const v of ['PASS', 'FAIL', 'WATCHLIST', 'REVIEW']) {
      const style = getVerdictStyle(v);
      expect(style.text).toBe('#fff');
    }
  });
});
