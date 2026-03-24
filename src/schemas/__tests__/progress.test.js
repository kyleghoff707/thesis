// Tests for ProgressSchema and createInitialProgress helper
// Covers: state machine validation, invalid state rejection, initial progress creation

import { describe, it, expect } from 'vitest';
import { ProgressSchema, createInitialProgress } from '../progress.js';

describe('ProgressSchema', () => {
  it('Test 8: validates a complete progress object with all valid states', () => {
    const progress = {
      ticker: 'COST',
      stage: 'pitchDeck',
      state: 'WAVE_1_RUNNING',
      startedAt: '2026-03-24T10:00:00Z',
      lastUpdated: '2026-03-24T10:05:00Z',
      sections: {
        radar: { status: 'complete', agentRole: 'businessAnalyst', tokenCost: { input: 5000, output: 1200 } },
        simple_predictable: { status: 'running', agentRole: 'businessAnalyst' },
        market_position: { status: 'pending' },
        barriers_moats: { status: 'pending' },
      },
      checkpoints: [
        { phase: 1, status: 'approved', timestamp: '2026-03-24T10:03:00Z' },
      ],
      errors: [],
      totalCost: { input: 5000, output: 1200 },
    };
    const result = ProgressSchema.safeParse(progress);
    expect(result.success).toBe(true);
  });

  it('Test 9: rejects invalid state value', () => {
    const badProgress = {
      ticker: 'COST',
      stage: 'pitchDeck',
      state: 'INVALID_STATE',
      startedAt: '2026-03-24T10:00:00Z',
      lastUpdated: '2026-03-24T10:05:00Z',
      sections: {},
      checkpoints: [],
      errors: [],
      totalCost: { input: 0, output: 0 },
    };
    const result = ProgressSchema.safeParse(badProgress);
    expect(result.success).toBe(false);
  });
});

describe('createInitialProgress', () => {
  it('Test 10: creates valid progress with all sections pending and state IDLE', () => {
    const progress = createInitialProgress('COST', 'pitchDeck', [
      'radar',
      'simple_predictable',
      'market_position',
    ]);

    // Validate against schema
    const result = ProgressSchema.safeParse(progress);
    expect(result.success).toBe(true);

    // Check initial state
    expect(progress.ticker).toBe('COST');
    expect(progress.stage).toBe('pitchDeck');
    expect(progress.state).toBe('IDLE');
    expect(progress.checkpoints).toEqual([]);
    expect(progress.errors).toEqual([]);
    expect(progress.totalCost).toEqual({ input: 0, output: 0 });

    // All sections should be pending
    expect(Object.keys(progress.sections)).toHaveLength(3);
    expect(progress.sections.radar.status).toBe('pending');
    expect(progress.sections.simple_predictable.status).toBe('pending');
    expect(progress.sections.market_position.status).toBe('pending');
  });
});
