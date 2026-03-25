// Tests for SectionRenderer — camelToTitle and data formatting helpers
// ONEP-04 coverage: section data display logic

import { describe, it, expect } from 'vitest';
import { _testExports } from '../SectionRenderer.jsx';

const { camelToTitle, formatDataValue } = _testExports;

describe('SectionRenderer: camelToTitle', () => {
  it('mosBuyPrice -> MOS Buy Price', () => {
    expect(camelToTitle('mosBuyPrice')).toBe('MOS Buy Price');
  });

  it('pbtBuyPrice -> PBT Buy Price', () => {
    expect(camelToTitle('pbtBuyPrice')).toBe('PBT Buy Price');
  });

  it('currentPrice -> Current Price', () => {
    expect(camelToTitle('currentPrice')).toBe('Current Price');
  });

  it('preliminaryFGR -> Preliminary FGR', () => {
    expect(camelToTitle('preliminaryFGR')).toBe('Preliminary FGR');
  });

  it('tenCapPrice -> Ten Cap Price', () => {
    expect(camelToTitle('tenCapPrice')).toBe('Ten Cap Price');
  });

  it('priceVsBuyRange -> Price Vs Buy Range', () => {
    expect(camelToTitle('priceVsBuyRange')).toBe('Price Vs Buy Range');
  });

  it('convergence -> Convergence', () => {
    expect(camelToTitle('convergence')).toBe('Convergence');
  });
});

describe('SectionRenderer: formatDataValue', () => {
  it('range object for mosBuyPrice shows both dollar amounts', () => {
    const result = formatDataValue('mosBuyPrice', { low: 135.04, high: 177.16 });
    expect(result).toContain('135');
    expect(result).toContain('177');
  });

  it('single number for currentPrice shows dollar-formatted string', () => {
    const result = formatDataValue('currentPrice', 972.33);
    expect(result).toContain('972');
  });

  it('range object for preliminaryFGR shows percentage-formatted string', () => {
    const result = formatDataValue('preliminaryFGR', { low: 0.09, high: 0.12 });
    expect(result).toContain('9');
    expect(result).toContain('12');
  });

  it('plain string for convergence returns string as-is', () => {
    const result = formatDataValue('convergence', 'All 4 methods...');
    expect(result).toBe('All 4 methods...');
  });

  it('null value returns -- fallback', () => {
    const result = formatDataValue('someField', null);
    expect(result).toBe('--');
  });

  it('undefined value returns -- fallback', () => {
    const result = formatDataValue('someField', undefined);
    expect(result).toBe('--');
  });
});
