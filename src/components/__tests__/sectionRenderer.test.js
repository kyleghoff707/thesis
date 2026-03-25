import { describe, it, expect } from 'vitest';
import { _testExports } from '../SectionRenderer.jsx';

const { camelToTitle, formatDataValue } = _testExports;

describe('camelToTitle', () => {
  it('converts mosBuyPrice to MOS Buy Price', () => {
    expect(camelToTitle('mosBuyPrice')).toBe('MOS Buy Price');
  });

  it('converts pbtBuyPrice to PBT Buy Price', () => {
    expect(camelToTitle('pbtBuyPrice')).toBe('PBT Buy Price');
  });

  it('converts currentPrice to Current Price', () => {
    expect(camelToTitle('currentPrice')).toBe('Current Price');
  });

  it('converts preliminaryFGR to Preliminary FGR', () => {
    expect(camelToTitle('preliminaryFGR')).toBe('Preliminary FGR');
  });

  it('converts tenCapPrice to Ten Cap Price', () => {
    expect(camelToTitle('tenCapPrice')).toBe('Ten Cap Price');
  });

  it('converts priceVsBuyRange to Price Vs Buy Range', () => {
    expect(camelToTitle('priceVsBuyRange')).toBe('Price Vs Buy Range');
  });

  it('converts convergence to Convergence', () => {
    expect(camelToTitle('convergence')).toBe('Convergence');
  });
});

describe('formatDataValue', () => {
  it('formats range object as dollar range', () => {
    const result = formatDataValue('mosBuyPrice', { low: 135.04, high: 177.16 });
    expect(result).toContain('135');
    expect(result).toContain('177');
  });

  it('formats currentPrice as dollar string', () => {
    const result = formatDataValue('currentPrice', 972.33);
    expect(result).toContain('972');
  });

  it('formats FGR range as percentage', () => {
    const result = formatDataValue('preliminaryFGR', { low: 0.09, high: 0.12 });
    expect(result).toContain('9');
    expect(result).toContain('12');
  });

  it('returns string values as-is', () => {
    expect(formatDataValue('convergence', 'All 4 methods converge')).toBe('All 4 methods converge');
  });

  it('returns -- for null', () => {
    expect(formatDataValue('someField', null)).toBe('--');
  });

  it('returns -- for undefined', () => {
    expect(formatDataValue('someField', undefined)).toBe('--');
  });
});
