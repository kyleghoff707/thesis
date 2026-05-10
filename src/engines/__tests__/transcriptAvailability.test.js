// Regression test for the Phase 2B coverage gap:
// dataExport.js's transcriptAvailability used to only check Alpha Vantage keys,
// ignoring the bundled ./transcripts/ corpus. After the fix, getTranscriptAvailability()
// reports "bundled" when the corpus has files for the ticker, even with no AV keys.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTranscriptAvailability } from '../transcripts.js';

let prevExist;

beforeEach(() => {
  prevExist = globalThis.__nodeBundledTranscriptsExist;
});

afterEach(() => {
  globalThis.__nodeBundledTranscriptsExist = prevExist;
});

describe('getTranscriptAvailability', () => {
  it('reports bundled when the corpus has the ticker', () => {
    globalThis.__nodeBundledTranscriptsExist = (t) => t === 'CMG';
    const result = getTranscriptAvailability('CMG');
    expect(result).toEqual({
      available: true,
      source: 'bundled',
      fallbackSource: null,
    });
  });

  it('returns null when neither bundled nor AV is available', () => {
    globalThis.__nodeBundledTranscriptsExist = () => false;
    // AV_KEYS is module-level; in test runs without VITE_ALPHA_VANTAGE_KEY,
    // AV_KEYS.length === 0, so the function should return null.
    const result = getTranscriptAvailability('UNKNOWN');
    expect(result).toBeNull();
  });

  it('returns null when the shim is missing (browser context)', () => {
    delete globalThis.__nodeBundledTranscriptsExist;
    // No bundled detection possible, no AV keys → null.
    const result = getTranscriptAvailability('CMG');
    expect(result).toBeNull();
  });

  it('handles invalid ticker input gracefully', () => {
    globalThis.__nodeBundledTranscriptsExist = (t) =>
      typeof t === 'string' && t.length > 0;
    expect(getTranscriptAvailability(null)).toBeNull();
    expect(getTranscriptAvailability(undefined)).toBeNull();
    expect(getTranscriptAvailability('')).toBeNull();
  });
});
