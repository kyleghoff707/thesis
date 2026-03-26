/**
 * root-cause-tagger.test.js — Unit tests for deviation root cause auto-tagger
 *
 * Tests tagRootCause pattern matching per D-07 priority rules:
 * sign_flip > scale_error > fy_offset > tag_miss > derivation_error > unknown
 */

import { describe, it, expect } from 'vitest';
import { tagRootCause } from '../../../../validation/scripts/lib/root-cause-tagger.mjs';

describe('tagRootCause', () => {
  // ─── sign_flip ───

  describe('sign_flip', () => {
    it('detects same magnitude opposite sign (positive vs negative)', () => {
      expect(tagRootCause(100, -100, {})).toBe('sign_flip');
    });

    it('detects same magnitude opposite sign (negative vs positive)', () => {
      expect(tagRootCause(-500_000_000, 500_000_000, {})).toBe('sign_flip');
    });

    it('does NOT trigger on different magnitudes', () => {
      expect(tagRootCause(100, -200, {})).not.toBe('sign_flip');
      expect(tagRootCause(100, -200, {})).toBe('derivation_error');
    });

    it('detects sign_flip within 1% tolerance of magnitude', () => {
      expect(tagRootCause(100, -100.5, {})).toBe('sign_flip');
    });
  });

  // ─── scale_error ───

  describe('scale_error', () => {
    it('detects 1000x scale (thesis too large)', () => {
      expect(tagRootCause(100_000, 100, {})).toBe('scale_error');
    });

    it('detects 1/1000x scale (thesis too small)', () => {
      expect(tagRootCause(100, 100_000, {})).toBe('scale_error');
    });

    it('detects 1,000,000x scale', () => {
      expect(tagRootCause(100_000_000, 100, {})).toBe('scale_error');
    });

    it('detects 1/1,000,000x scale', () => {
      expect(tagRootCause(100, 100_000_000, {})).toBe('scale_error');
    });

    it('does NOT trigger on 10x difference', () => {
      expect(tagRootCause(1000, 100, {})).toBe('derivation_error');
    });
  });

  // ─── fy_offset ───

  describe('fy_offset', () => {
    it('detects when thesis matches previous year consensus', () => {
      expect(tagRootCause(500, null, { prevYearConsensus: 500, nextYearConsensus: 800 })).toBe('fy_offset');
    });

    it('detects when thesis matches next year consensus', () => {
      expect(tagRootCause(800, null, { prevYearConsensus: 500, nextYearConsensus: 800 })).toBe('fy_offset');
    });

    it('detects fy_offset within 1% tolerance', () => {
      expect(tagRootCause(502, null, { prevYearConsensus: 500 })).toBe('fy_offset');
    });

    it('does NOT trigger when thesis matches neither adjacent year', () => {
      expect(tagRootCause(999, null, { prevYearConsensus: 500, nextYearConsensus: 800 })).toBe('unknown');
    });

    it('detects fy_offset even when current consensus exists', () => {
      // If thesis=500, consensus=700, but prevYear consensus=500 -> fy_offset
      expect(tagRootCause(500, 700, { prevYearConsensus: 500 })).toBe('fy_offset');
    });
  });

  // ─── tag_miss ───

  describe('tag_miss', () => {
    it('detects when thesis is null but consensus has value', () => {
      expect(tagRootCause(null, 500, {})).toBe('tag_miss');
    });

    it('detects tag_miss with large consensus value', () => {
      expect(tagRootCause(null, 15_234_000_000, {})).toBe('tag_miss');
    });
  });

  // ─── derivation_error ───

  describe('derivation_error', () => {
    it('labels non-matching values that fit no specific pattern', () => {
      expect(tagRootCause(500, 700, {})).toBe('derivation_error');
    });

    it('labels moderate difference as derivation_error', () => {
      expect(tagRootCause(1000, 1500, {})).toBe('derivation_error');
    });
  });

  // ─── unknown ───

  describe('unknown', () => {
    it('returns unknown when both values are null', () => {
      expect(tagRootCause(null, null, {})).toBe('unknown');
    });

    it('returns unknown when thesis exists but consensus null and no adjacent data', () => {
      expect(tagRootCause(500, null, {})).toBe('unknown');
    });
  });

  // ─── Priority order ───

  describe('priority order', () => {
    it('sign_flip takes precedence over derivation_error', () => {
      // Both sign_flip (opposite sign, same magnitude) and derivation_error (values differ)
      // could apply — sign_flip should win
      expect(tagRootCause(100, -100, {})).toBe('sign_flip');
    });

    it('sign_flip takes precedence over scale_error', () => {
      // sign_flip: 1000 vs -1000 (same magnitude, opposite sign)
      // not scale_error because the ratio is -1, not 1000
      expect(tagRootCause(1000, -1000, {})).toBe('sign_flip');
    });

    it('scale_error takes precedence over fy_offset', () => {
      // Both scale_error (1000x) and fy_offset (matches prev year) could apply
      expect(tagRootCause(100_000, 100, { prevYearConsensus: 100_000 })).toBe('scale_error');
    });

    it('scale_error takes precedence over derivation_error', () => {
      expect(tagRootCause(100_000, 100, {})).toBe('scale_error');
    });

    it('fy_offset takes precedence over derivation_error when consensus exists', () => {
      // thesis=500, consensus=700, prevYear=500 -> fy_offset (not derivation_error)
      expect(tagRootCause(500, 700, { prevYearConsensus: 500 })).toBe('fy_offset');
    });
  });
});
