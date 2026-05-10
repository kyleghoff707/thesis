import { describe, it, expect } from 'vitest';
import { scanFileForBannedPhrases } from '../lint-vocab.mjs';

describe('lint-vocab', () => {
  const banned = [
    'Three Ms',
    'Wonderful Company',
    'Six-Inch Bar',
    'Big Audacious Goal',
    'BAG',
    'Sticker price',
    'ruleOneMethod',
  ];

  it('finds banned phrases in content', () => {
    const content = 'The Three Ms framework is great.';
    const violations = scanFileForBannedPhrases(content, banned, 'test.md');
    expect(violations).toHaveLength(1);
    expect(violations[0].phrase).toBe('Three Ms');
  });

  it('returns empty for clean content', () => {
    const content = 'No banned phrases here.';
    const violations = scanFileForBannedPhrases(content, banned, 'test.md');
    expect(violations).toEqual([]);
  });

  it('case-insensitive match', () => {
    const content = 'wonderful company is bad.';
    const violations = scanFileForBannedPhrases(content, banned, 'test.md');
    expect(violations).toHaveLength(1);
  });

  it('reports line numbers', () => {
    const content = 'line 1\nline 2 has Three Ms\nline 3';
    const violations = scanFileForBannedPhrases(content, banned, 'test.md');
    expect(violations[0].line).toBe(2);
  });
});
