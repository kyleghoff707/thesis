import { describe, it, expect } from 'vitest';
import { listBundledTranscripts } from '../nodeAdapter.js';

// Guards the bundled-corpus discovery path: transcripts are loaded by scanning
// the actual files on disk, NOT by guessing fiscal quarters from filing dates.
// This is what guarantees a bundled ticker's transcripts are always used,
// regardless of its fiscal calendar. If this regresses, bundled tickers
// silently lose their transcripts (the exact failure mode this replaced).
describe('listBundledTranscripts (bundled corpus discovery)', () => {
  it('discovers transcripts for a bundled ticker, sorted newest-first', () => {
    const list = listBundledTranscripts('AAPL');
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i++) {
      const prevKey = list[i - 1].year * 10 + list[i - 1].quarter;
      const curKey = list[i].year * 10 + list[i].quarter;
      expect(prevKey).toBeGreaterThanOrEqual(curKey);
    }
    for (const entry of list) {
      expect(Number.isInteger(entry.year)).toBe(true);
      expect(entry.quarter).toBeGreaterThanOrEqual(1);
      expect(entry.quarter).toBeLessThanOrEqual(4);
    }
  });

  it('is case-insensitive on the ticker', () => {
    expect(listBundledTranscripts('aapl').length).toBe(listBundledTranscripts('AAPL').length);
  });

  it('returns [] for a ticker with no bundled corpus', () => {
    expect(listBundledTranscripts('ZZZZNOTREAL')).toEqual([]);
  });

  it('returns [] for invalid input', () => {
    expect(listBundledTranscripts('')).toEqual([]);
    expect(listBundledTranscripts(null)).toEqual([]);
    expect(listBundledTranscripts(undefined)).toEqual([]);
  });
});
