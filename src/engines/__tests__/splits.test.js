// Tests for stock split detection and adjustment
// Fix 1 (P5): Yahoo-based split detection + cumulativeSplitFactor date comparison bug

import { describe, it, expect } from 'vitest';
import { cumulativeSplitFactor } from '../splits';

describe('cumulativeSplitFactor', () => {
  const splits = [
    { date: '2023-06-15', ratio: 5 },  // 5:1 split mid-year
    { date: '2020-08-31', ratio: 4 },  // 4:1 split
  ];

  it('should apply all splits after the fiscal year end (December FY)', () => {
    // FY 2019 (ends Dec 31 2019) — both splits happened after → factor = 5 * 4 = 20
    expect(cumulativeSplitFactor(splits, 2019)).toBe(20);
  });

  it('should apply only later splits (December FY)', () => {
    // FY 2021 (ends Dec 31 2021) — only 2023 split happened after → factor = 5
    expect(cumulativeSplitFactor(splits, 2021)).toBe(5);
  });

  it('should return 1 when no splits happened after the fiscal year', () => {
    // FY 2024 (ends Dec 31 2024) — no splits after → factor = 1
    expect(cumulativeSplitFactor(splits, 2024)).toBe(1);
  });

  it('should handle same-year split for December FY company correctly', () => {
    // FY 2023 ends Dec 31, split was June 15 — split is BEFORE FY end
    // So FY 2023 data is already on post-split basis → factor should be 1
    // (The 2020 split is also before FY end → not applied)
    expect(cumulativeSplitFactor(splits, 2023)).toBe(1);
  });

  it('should handle same-year split for non-calendar FY company', () => {
    // Company with September FY end: FY 2020 ends Sep 30 2020
    // The Aug 31 2020 split is BEFORE Sep 30 → data is post-split → factor should be 1
    // The June 2023 split is after Sep 30 2020 → should be applied → factor = 5
    // BUG: old code did splitYear > fiscalYear → 2020 > 2020 = false (correct for Dec FY, but...)
    // For Sep FY, this is actually correct since split (Aug) is before FY end (Sep)
    // But if the split were in November 2020, it should be applied for a Sep FY company
    const novSplit = [
      { date: '2020-11-15', ratio: 4 },  // Split AFTER Sep FY end
    ];
    // FY 2020 ends Sep 30 — split is Nov 15, which is AFTER FY end
    // Factor should be 4 (need to adjust FY 2020 data)
    // Old code: 2020 > 2020 = false → returns 1 (WRONG)
    expect(cumulativeSplitFactor(novSplit, 2020, 'Sep')).toBe(4);
  });

  it('should handle split before non-calendar FY end', () => {
    const marSplit = [
      { date: '2020-03-15', ratio: 2 },  // Split BEFORE Sep FY end
    ];
    // FY 2020 ends Sep 30 — split is Mar 15, which is BEFORE FY end
    // Factor should be 1 (data already post-split)
    expect(cumulativeSplitFactor(marSplit, 2020, 'Sep')).toBe(1);
  });
});

describe('parseYahooSplits', () => {
  // Import after module is updated
  it('should parse Yahoo chart events.splits format', async () => {
    const { parseYahooSplits } = await import('../splits');

    // Yahoo returns events.splits as an object keyed by timestamp
    const yahooEvents = {
      '1687305600': { date: 1687305600, numerator: 5, denominator: 1 },
      '1598832000': { date: 1598832000, numerator: 4, denominator: 1 },
    };

    const result = parseYahooSplits(yahooEvents);

    expect(result).toHaveLength(2);
    // Should convert to { date: 'YYYY-MM-DD', ratio: N } format
    for (const split of result) {
      expect(split).toHaveProperty('date');
      expect(split).toHaveProperty('ratio');
      expect(split.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(split.ratio).toBeGreaterThan(0);
    }

    // Check actual values
    const fiveToOne = result.find(s => s.ratio === 5);
    expect(fiveToOne).toBeDefined();

    const fourToOne = result.find(s => s.ratio === 4);
    expect(fourToOne).toBeDefined();
  });

  it('should handle reverse splits', async () => {
    const { parseYahooSplits } = await import('../splits');

    const yahooEvents = {
      '1687305600': { date: 1687305600, numerator: 1, denominator: 10 },
    };

    const result = parseYahooSplits(yahooEvents);
    expect(result).toHaveLength(1);
    expect(result[0].ratio).toBeCloseTo(0.1);
  });

  it('should return empty array for null/undefined input', async () => {
    const { parseYahooSplits } = await import('../splits');

    expect(parseYahooSplits(null)).toEqual([]);
    expect(parseYahooSplits(undefined)).toEqual([]);
    expect(parseYahooSplits({})).toEqual([]);
  });
});
