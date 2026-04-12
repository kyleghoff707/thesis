// Tests for reportHelpers — shared formatting functions for all report viewers
// Migrated from onePager.test.js (formatTitle, stateToLabel) and
// sectionRenderer.test.js (formatDataValue) + new tests for remaining exports

import { describe, it, expect } from 'vitest';
import {
  formatTitle,
  formatRelativeTime,
  stateToLabel,
  verdictDotColor,
  fmtNum,
  fmtDollar,
  fmtPct,
  formatDataValue,
} from '../reportHelpers.js';
import { C } from '../../theme';

// --- formatTitle ---

describe('formatTitle', () => {
  it('strips /NEW suffix and title-cases', () => {
    expect(formatTitle('COSTCO WHOLESALE CORP /NEW')).toBe('Costco Wholesale Corp');
  });

  it('title-cases simple all-caps name', () => {
    expect(formatTitle('APPLE INC')).toBe('Apple Inc');
  });

  it('strips /DE suffix and title-cases', () => {
    expect(formatTitle('BERKSHIRE HATHAWAY INC /DE')).toBe('Berkshire Hathaway Inc');
  });

  it('strips /OLD suffix and title-cases', () => {
    expect(formatTitle('MICROSOFT CORP /OLD')).toBe('Microsoft Corp');
  });

  it('handles null gracefully', () => {
    expect(formatTitle(null)).toBe('');
  });

  it('handles empty string', () => {
    expect(formatTitle('')).toBe('');
  });
});

// --- formatRelativeTime ---

describe('formatRelativeTime', () => {
  it('returns empty string for null', () => {
    expect(formatRelativeTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatRelativeTime(undefined)).toBe('');
  });

  it('returns "just now" for a very recent time', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('returns minutes ago for recent times', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5 minutes ago');
  });

  it('returns singular minute', () => {
    const oneMinAgo = new Date(Date.now() - 1 * 60000).toISOString();
    expect(formatRelativeTime(oneMinAgo)).toBe('1 minute ago');
  });

  it('returns hours ago', () => {
    const twoHrsAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    expect(formatRelativeTime(twoHrsAgo)).toBe('2 hours ago');
  });

  it('returns days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
  });
});

// --- stateToLabel ---

describe('stateToLabel', () => {
  it('IDLE -> Preparing...', () => {
    expect(stateToLabel('IDLE')).toBe('Preparing...');
  });

  it('DATA_ASSEMBLY -> Assembling data...', () => {
    expect(stateToLabel('DATA_ASSEMBLY')).toBe('Assembling data...');
  });

  it('WAVE_1_RUNNING -> Phase 1: Business Fundamentals...', () => {
    expect(stateToLabel('WAVE_1_RUNNING')).toBe('Phase 1: Business Fundamentals...');
  });

  it('SYNTHESIS -> Writing synthesis...', () => {
    expect(stateToLabel('SYNTHESIS')).toBe('Writing synthesis...');
  });

  it('QUALITY_CHECK -> Quality check...', () => {
    expect(stateToLabel('QUALITY_CHECK')).toBe('Quality check...');
  });

  it('COMPLETE -> Complete', () => {
    expect(stateToLabel('COMPLETE')).toBe('Complete');
  });

  it('unknown state returns Working...', () => {
    expect(stateToLabel('UNKNOWN')).toBe('Working...');
  });
});

// --- verdictDotColor ---

describe('verdictDotColor', () => {
  it('PASS returns C.green', () => {
    expect(verdictDotColor('PASS')).toBe(C.green);
  });

  it('FAIL returns C.red', () => {
    expect(verdictDotColor('FAIL')).toBe(C.red);
  });

  it('WATCHLIST returns C.yellow', () => {
    expect(verdictDotColor('WATCHLIST')).toBe(C.yellow);
  });

  it('REVIEW returns C.accent', () => {
    expect(verdictDotColor('REVIEW')).toBe(C.accent);
  });

  it('null returns C.textMuted', () => {
    expect(verdictDotColor(null)).toBe(C.textMuted);
  });

  it('undefined returns C.textMuted', () => {
    expect(verdictDotColor(undefined)).toBe(C.textMuted);
  });
});

// --- fmtNum ---

describe('fmtNum', () => {
  it('returns -- for null', () => {
    expect(fmtNum(null)).toBe('--');
  });

  it('returns -- for NaN', () => {
    expect(fmtNum(NaN)).toBe('--');
  });

  it('abbreviates trillions', () => {
    expect(fmtNum(2.5e12)).toBe('2.50T');
  });

  it('abbreviates billions', () => {
    expect(fmtNum(1234567890)).toBe('1.23B');
  });

  it('abbreviates millions', () => {
    expect(fmtNum(1500000)).toBe('1.50M');
  });

  it('abbreviates thousands', () => {
    expect(fmtNum(5000)).toBe('5.0K');
  });

  it('formats small numbers with 2 decimals', () => {
    expect(fmtNum(42)).toBe('42.00');
  });

  it('handles negative numbers', () => {
    expect(fmtNum(-1500000)).toBe('-1.50M');
  });
});

// --- fmtDollar ---

describe('fmtDollar', () => {
  it('returns -- for null', () => {
    expect(fmtDollar(null)).toBe('--');
  });

  it('returns -- for NaN', () => {
    expect(fmtDollar(NaN)).toBe('--');
  });

  it('prefixes $ to abbreviated number', () => {
    expect(fmtDollar(1000000)).toBe('$1.00M');
  });

  it('handles billions', () => {
    expect(fmtDollar(5e9)).toBe('$5.00B');
  });
});

// --- fmtPct ---

describe('fmtPct', () => {
  it('returns -- for null', () => {
    expect(fmtPct(null)).toBe('--');
  });

  it('converts decimal to percentage', () => {
    expect(fmtPct(0.452)).toBe('45.2%');
  });

  it('displays whole percentage as-is', () => {
    expect(fmtPct(45.2)).toBe('45.2%');
  });

  it('handles zero', () => {
    expect(fmtPct(0)).toBe('0.0%');
  });
});

// --- formatDataValue ---

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

  it('formats dollar keys as dollar', () => {
    const result = formatDataValue('revenue', 5000000);
    expect(result).toBe('$5.00M');
  });

  it('formats percentage keys as percentage', () => {
    const result = formatDataValue('grossMargin', 0.42);
    expect(result).toBe('42.0%');
  });
});
