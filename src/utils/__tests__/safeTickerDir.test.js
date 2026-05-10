import { describe, it, expect } from 'vitest';
import { safeTickerDir } from '../safeTickerDir.js';

describe('safeTickerDir', () => {
  it('preserves a normal ticker', () => {
    expect(safeTickerDir('AAPL')).toBe('AAPL');
  });

  it('preserves dots and dashes', () => {
    expect(safeTickerDir('BRK.B')).toBe('BRK.B');
    expect(safeTickerDir('RDS-A')).toBe('RDS-A');
  });

  it('uppercases input', () => {
    expect(safeTickerDir('aapl')).toBe('AAPL');
  });

  it('replaces slashes with underscore', () => {
    expect(safeTickerDir('BF/B')).toBe('BF_B');
  });

  it('strips weird characters', () => {
    expect(safeTickerDir('AAPL#1')).toBe('AAPL_1');
  });

  it('replaces leading dots to avoid hidden dirs', () => {
    expect(safeTickerDir('.HIDDEN')).toBe('_HIDDEN');
  });

  it('appends underscore to Windows reserved names', () => {
    expect(safeTickerDir('CON')).toBe('CON_');
    expect(safeTickerDir('com1')).toBe('COM1_');
    expect(safeTickerDir('NUL')).toBe('NUL_');
  });

  it('throws on empty input', () => {
    expect(() => safeTickerDir('')).toThrow();
    expect(() => safeTickerDir('   ')).toThrow();
  });

  it('throws on non-string input', () => {
    expect(() => safeTickerDir(null)).toThrow();
    expect(() => safeTickerDir(undefined)).toThrow();
    expect(() => safeTickerDir(123)).toThrow();
  });
});
