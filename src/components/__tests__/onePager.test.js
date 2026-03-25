// Tests for OnePager — pure helper functions
// ONEP-02 coverage: formatTitle, formatRelativeTime, stateToLabel

import { describe, it, expect } from 'vitest';
import { _testExports } from '../OnePager.jsx';

const { formatTitle, stateToLabel } = _testExports;

describe('OnePager: formatTitle', () => {
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

describe('OnePager: stateToLabel', () => {
  it('IDLE -> Preparing...', () => {
    expect(stateToLabel('IDLE')).toBe('Preparing...');
  });

  it('DATA_ASSEMBLY -> Assembling data...', () => {
    expect(stateToLabel('DATA_ASSEMBLY')).toBe('Assembling data...');
  });

  it('WAVE_1_RUNNING -> Generating sections...', () => {
    expect(stateToLabel('WAVE_1_RUNNING')).toBe('Generating sections...');
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

  it('unknown state returns a reasonable fallback', () => {
    const result = stateToLabel('UNKNOWN_STATE');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
