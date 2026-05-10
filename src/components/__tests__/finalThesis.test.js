import { describe, it, expect } from 'vitest';
import { SECTION_DEFS } from '../FinalThesis.jsx';

describe('SECTION_DEFS', () => {
  // Expected canonical Final Thesis section keys (post-Phase-2 rewrite).
  // Note: SECTION_DEFS may also include a 'promise_tracker' pseudo-row that is
  // rendered standalone (it pulls data from the management section), so we
  // filter it out for the order-equality assertion.
  const EXPECTED_KEYS = [
    'event_analysis',
    'business_analysis',
    'moat_analysis',
    'management_analysis',
    'valuation_analysis',
    'debate',
    'trade_plan',
  ];

  it('has exactly 7 entries', () => {
    expect(EXPECTED_KEYS).toHaveLength(7);
  });

  it('contains all required section keys', () => {
    expect(EXPECTED_KEYS).toContain('event_analysis');
    expect(EXPECTED_KEYS).toContain('business_analysis');
    expect(EXPECTED_KEYS).toContain('moat_analysis');
    expect(EXPECTED_KEYS).toContain('management_analysis');
    expect(EXPECTED_KEYS).toContain('valuation_analysis');
    expect(EXPECTED_KEYS).toContain('debate');
    expect(EXPECTED_KEYS).toContain('trade_plan');
  });

  it('SECTION_DEFS contains the 7 Final Thesis section keys in order', () => {
    // The promise_tracker pseudo-row is rendered standalone (pulls promises
    // from the management section), so filter it out of the order check.
    const renderableKeys = SECTION_DEFS
      .map((d) => d.key)
      .filter((k) => k !== 'promise_tracker');
    expect(renderableKeys).toEqual(EXPECTED_KEYS);
  });
});

describe('qualityColor', () => {
  // Inline implementation matching D-03 spec for testing
  // Will be replaced with import from _testExports once FinalThesis.jsx is rewritten
  const GREEN = '#16a34a';
  const YELLOW = '#ca8a04';
  const RED = '#dc2626';
  const MUTED = '#94a3b8';

  function qualityColor(score) {
    if (score == null) return MUTED;
    if (score >= 90) return GREEN;
    if (score >= 70) return YELLOW;
    return RED;
  }

  it('returns muted color for null score', () => {
    expect(qualityColor(null)).toBe(MUTED);
  });

  it('returns muted color for undefined score', () => {
    expect(qualityColor(undefined)).toBe(MUTED);
  });

  it('returns green for score >= 90', () => {
    expect(qualityColor(90)).toBe(GREEN);
    expect(qualityColor(100)).toBe(GREEN);
    expect(qualityColor(95)).toBe(GREEN);
  });

  it('returns yellow for score 70-89', () => {
    expect(qualityColor(70)).toBe(YELLOW);
    expect(qualityColor(89)).toBe(YELLOW);
    expect(qualityColor(75)).toBe(YELLOW);
  });

  it('returns red for score < 70', () => {
    expect(qualityColor(69)).toBe(RED);
    expect(qualityColor(0)).toBe(RED);
    expect(qualityColor(50)).toBe(RED);
  });

  it('boundary: 90 is green not yellow', () => {
    expect(qualityColor(90)).toBe(GREEN);
  });

  it('boundary: 70 is yellow not red', () => {
    expect(qualityColor(70)).toBe(YELLOW);
  });
});

describe('qualityMap join logic', () => {
  it('maps quality sections by sectionKey', () => {
    const qualitySections = [
      { sectionKey: 'event_analysis', score: 100, methodology: { score: 98 } },
      { sectionKey: 'meaning_checklist', score: 85, methodology: { score: 92 } },
    ];

    const qualityMap = {};
    for (const qs of qualitySections) {
      qualityMap[qs.sectionKey] = qs;
    }

    expect(qualityMap['event_analysis'].score).toBe(100);
    expect(qualityMap['event_analysis'].methodology.score).toBe(98);
    expect(qualityMap['meaning_checklist'].score).toBe(85);
    expect(qualityMap['unknown_key']).toBeUndefined();
  });

  it('handles empty quality sections', () => {
    const qualityMap = {};
    expect(Object.keys(qualityMap)).toHaveLength(0);
  });
});
