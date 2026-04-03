// Tests for StageNavBar — stage navigation tab bar component
// Tests the STAGES constant and gate logic via _testExports
// (no @testing-library/react available for rendering tests)

import { describe, it, expect } from 'vitest';

describe('StageNavBar', () => {
  it('exports a default function component', async () => {
    const mod = await import('../StageNavBar.jsx');
    expect(typeof mod.default).toBe('function');
  });

  it('exports _testExports with STAGES array', async () => {
    const mod = await import('../StageNavBar.jsx');
    expect(mod._testExports).toBeDefined();
    expect(Array.isArray(mod._testExports.STAGES)).toBe(true);
  });

  it('STAGES has exactly 3 entries', async () => {
    const { _testExports } = await import('../StageNavBar.jsx');
    expect(_testExports.STAGES).toHaveLength(3);
  });

  it('STAGES[0] is One Pager with no gate (always unlocked)', async () => {
    const { _testExports } = await import('../StageNavBar.jsx');
    const stage = _testExports.STAGES[0];
    expect(stage.key).toBe('one-pager');
    expect(stage.label).toBe('One Pager');
    expect(stage.gate).toBeNull();
  });

  it('STAGES[1] is Pitch Deck gated by onePager approval', async () => {
    const { _testExports } = await import('../StageNavBar.jsx');
    const stage = _testExports.STAGES[1];
    expect(stage.key).toBe('pitch-deck');
    expect(stage.label).toBe('Pitch Deck');
    expect(stage.gate).toBe('onePager');
  });

  it('STAGES[2] is Full Story gated by pitchDeck approval', async () => {
    const { _testExports } = await import('../StageNavBar.jsx');
    const stage = _testExports.STAGES[2];
    expect(stage.key).toBe('full-story');
    expect(stage.label).toBe('Full Story');
    expect(stage.gate).toBe('pitchDeck');
  });

  it('STAGES keys are valid URL segments', async () => {
    const { _testExports } = await import('../StageNavBar.jsx');
    for (const stage of _testExports.STAGES) {
      expect(stage.key).toMatch(/^[a-z][-a-z]*$/);
    }
  });

  it('gate values reference valid stageApprovals keys', async () => {
    const { _testExports } = await import('../StageNavBar.jsx');
    const validApprovalKeys = ['onePager', 'pitchDeck', 'fullStory'];
    for (const stage of _testExports.STAGES) {
      if (stage.gate !== null) {
        expect(validApprovalKeys).toContain(stage.gate);
      }
    }
  });
});
