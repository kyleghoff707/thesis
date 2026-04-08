import { describe, it, expect } from 'vitest';
import { _testExports } from '../edgar';

const { displayName } = _testExports;

describe('displayName', () => {
  it('returns curated name for S&P 500 tickers', () => {
    expect(displayName('JPM', 'JPMORGAN CHASE & CO')).toBe('JPMorgan Chase');
    expect(displayName('MCD', 'MCDONALDS CORP')).toBe("McDonald's");
    expect(displayName('XOM', 'EXXON MOBIL CORP')).toBe('ExxonMobil');
    expect(displayName('IBM', 'INTERNATIONAL BUSINESS MACHINES CORP')).toBe('IBM');
    expect(displayName('KO', 'COCA COLA CO')).toBe('Coca-Cola Company');
    expect(displayName('TSCO', 'TRACTOR SUPPLY CO /DE/')).toBe('Tractor Supply Co');
  });

  it('falls back to formatCompanyName for non-S&P tickers', () => {
    expect(displayName('ZZZZ', 'FAKE COMPANY INC')).toBe('Fake Company Inc');
    expect(displayName('ZZZZ', 'SOME RANDOM CORP /DE/')).toBe('Some Random Corp');
  });

  it('handles null/empty raw names gracefully', () => {
    expect(displayName('ZZZZ', null)).toBe('');
    expect(displayName('ZZZZ', '')).toBe('');
    expect(displayName('ZZZZ', undefined)).toBe('');
  });

  it('curated map takes priority over formatter', () => {
    // GE's SEC name is "GENERAL ELECTRIC CO" but curated name is "GE Aerospace"
    expect(displayName('GE', 'GENERAL ELECTRIC CO')).toBe('GE Aerospace');
    // UNH formatter gives "Unitedhealth Group Inc" but curated has correct casing
    expect(displayName('UNH', 'UNITEDHEALTH GROUP INC')).toBe('UnitedHealth Group');
  });
});
