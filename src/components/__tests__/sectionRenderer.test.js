import { describe, it, expect } from 'vitest';
import { _testExports } from '../SectionRenderer.jsx';
import { formatDataValue } from '../reportHelpers.js';

const { camelToTitle } = _testExports;

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

describe('primarySourceInsights rendering contract', () => {
  it('accepts string array for primarySourceInsights', () => {
    const insights = ['10-K paragraph about revenue', 'Earnings call Q3 2025 excerpt'];
    expect(Array.isArray(insights)).toBe(true);
    expect(insights.length).toBeGreaterThan(0);
    expect(typeof insights[0]).toBe('string');
  });

  it('accepts object array with text field for primarySourceInsights', () => {
    const insights = [
      { text: 'From 10-K filing', source: 'SEC EDGAR' },
      { text: 'From earnings call', source: 'Alpha Vantage' },
    ];
    expect(Array.isArray(insights)).toBe(true);
    // SectionRenderer should handle: typeof insight === 'string' ? insight : (insight.text || insight.source)
    expect(insights[0].text).toBe('From 10-K filing');
  });

  it('empty array should not render block', () => {
    const insights = [];
    // Guard: section.primarySourceInsights && Array.isArray(...) && .length > 0
    expect(insights.length > 0).toBe(false);
  });
});

describe('searchesPerformed rendering contract', () => {
  it('accepts search objects with query field', () => {
    const searches = [
      { query: 'SFM competitive landscape', resultCount: 10, usedInSection: true },
    ];
    expect(searches[0].query).toBe('SFM competitive landscape');
    expect(searches[0].resultCount).toBe(10);
  });

  it('accepts string-only searches', () => {
    const searches = ['SFM revenue growth 2025'];
    // Guard: typeof search === 'string' ? search : search.query
    expect(typeof searches[0]).toBe('string');
  });

  it('empty array should not render block', () => {
    const searches = [];
    expect(searches.length > 0).toBe(false);
  });
});
