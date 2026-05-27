import { describe, it, expect } from 'vitest';
import { normalizeTicker } from '../ticker.js';

describe('normalizeTicker', () => {
  it('uppercases and trims normal ticker input', () => {
    expect(normalizeTicker(' aapl ')).toBe('AAPL');
  });

  it('allows common share-class separators', () => {
    expect(normalizeTicker('brk.b')).toBe('BRK.B');
    expect(normalizeTicker('bf-b')).toBe('BF-B');
  });

  it('rejects shell and path characters before command construction', () => {
    expect(() => normalizeTicker('AAPL; rm -rf ~')).toThrow(/Invalid ticker/);
    expect(() => normalizeTicker('../AAPL')).toThrow(/Invalid ticker/);
    expect(() => normalizeTicker('BF/B')).toThrow(/Invalid ticker/);
  });

  it('rejects empty and non-string input', () => {
    expect(() => normalizeTicker('')).toThrow(/required/);
    expect(() => normalizeTicker('   ')).toThrow(/required/);
    expect(() => normalizeTicker(null)).toThrow(/required/);
  });
});
