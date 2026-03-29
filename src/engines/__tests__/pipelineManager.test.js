// Pipeline Manager — Wave-based dispatch orchestration tests
// Verifies parallel dispatch within waves, sequential wave execution,
// PM feedback integration, budget tracking, and cache monitoring.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs.readFileSync to provide dispatch-table.json
vi.mock('fs', () => ({
  readFileSync: vi.fn((filePath) => {
    if (filePath.includes('dispatch-table.json')) {
      return JSON.stringify({
        pitchDeck: {
          preProcessing: [
            { step: 'data-assembly', agent: 'data-assembler', parallel: false },
            { step: 'annual-reading', agent: 'annual-reader', parallel: false, dependsOn: 'data-assembly' },
            { step: 'quarterly-reading', agent: 'quarterly-reader', parallel: true, dependsOn: 'data-assembly' },
          ],
          phases: [
            {
              phase: 1,
              description: 'Business fundamentals',
              agents: [
                { agent: 'business-analyst', sections: [1, 2], parallel: true },
                { agent: 'competitor-evaluator', sections: [3], parallel: true },
              ],
              checkpoint: { after: true, presents: ['findings', 'dataGaps'] },
            },
            {
              phase: 2,
              description: 'Financial deep-dive',
              agents: [
                { agent: 'financial-analyst', sections: [5], parallel: true },
                { agent: 'management-evaluator', sections: [6], parallel: true },
              ],
              checkpoint: { after: true, presents: ['findings'] },
            },
            {
              phase: 3,
              description: 'Risk and valuation',
              agents: [
                { agent: 'risk-analyst', sections: [9], parallel: true },
                { agent: 'valuation-specialist', sections: [10], parallel: true },
              ],
              checkpoint: { after: true, presents: ['findings', 'valuationReview'] },
            },
          ],
          postProcessing: [
            { step: 'synthesis', agent: 'synthesis-writer', sections: [], dependsOn: 'all-phases' },
          ],
          sectionKeys: ['radar', 'simple_predictable', 'market_position', 'barriers_moats', 'fcf', 'management', 'roe_roic_debt', 'balance_sheet', 'pest', 'valuation'],
        },
      });
    }
    throw new Error(`Unmocked readFileSync: ${filePath}`);
  }),
}));

// Mock dispatchAgent from aiResearch.js
vi.mock('../aiResearch.js', () => ({
  dispatchAgent: vi.fn(),
}));

import { runPipeline } from '../pipelineManager.js';
import { dispatchAgent } from '../aiResearch.js';

// Helper: create a mock dispatchAgent result
function mockResult(agentRole, sectionNum = 1) {
  return {
    section: {
      key: `section_${sectionNum}`,
      title: `Section ${sectionNum} by ${agentRole}`,
      sectionNumber: sectionNum,
      status: 'pass',
      confidence: 85,
      summary: `Mock summary from ${agentRole}`,
      redFlags: [],
    },
    usage: {
      inputTokens: 20000,
      outputTokens: 3000,
      cacheRead: 15000,
      cacheWrite: 5000,
      webSearches: 1,
      cost: 0.12,
    },
    webSearches: [],
    model: 'claude-sonnet-4-6',
    stopReason: 'end_turn',
    duration: 5000,
    error: null,
  };
}

// Helper: create a failed mock result
function mockErrorResult(agentRole) {
  return {
    section: null,
    usage: { inputTokens: 1000, outputTokens: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0, cost: 0.003 },
    webSearches: [],
    model: 'claude-sonnet-4-6',
    stopReason: 'error',
    duration: 1000,
    error: 'Agent failed: test error',
  };
}

const mockDataPacket = { ticker: 'SFM', caveats: [] };

describe('pipelineManager — runPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all dispatches succeed
    dispatchAgent.mockImplementation((agentRole) => {
      const sectionNum = agentRole.includes('business') ? 1 :
        agentRole.includes('competitor') ? 3 :
        agentRole.includes('financial') ? 5 :
        agentRole.includes('management') ? 6 :
        agentRole.includes('risk') ? 9 :
        agentRole.includes('valuation') ? 10 :
        agentRole.includes('synthesis') ? 0 :
        agentRole.includes('annual') ? 98 :
        agentRole.includes('quarterly') ? 99 : 1;
      return Promise.resolve(mockResult(agentRole, sectionNum));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 1: reads dispatch-table.json for the specified stage', async () => {
    const result = await runPipeline('pitchDeck', mockDataPacket);
    // Should have completed without error — table was read
    expect(result).toBeDefined();
    expect(result.sections).toBeDefined();
    expect(result.budget).toBeDefined();
    expect(result.cacheStats).toBeDefined();
    expect(result.errors).toBeDefined();
  });

  it('Test 2: Wave 1 agents fire in parallel via Promise.allSettled', async () => {
    await runPipeline('pitchDeck', mockDataPacket);

    // Wave 1 has business-analyst and competitor-evaluator
    // After pre-processing (annual-reader, quarterly-reader), wave 1 dispatches both
    const calls = dispatchAgent.mock.calls;
    const agentNames = calls.map(c => c[0]);

    // Pre-processing: annual-reader, quarterly-reader
    // Wave 1: business-analyst, competitor-evaluator
    expect(agentNames).toContain('business-analyst');
    expect(agentNames).toContain('competitor-evaluator');

    // Both wave 1 agents should be called (parallel dispatch)
    const wave1Start = agentNames.indexOf('business-analyst');
    const wave1End = agentNames.indexOf('competitor-evaluator');
    // They should be adjacent (dispatched together)
    expect(Math.abs(wave1Start - wave1End)).toBe(1);
  });

  it('Test 3: Waves execute sequentially — Wave 2 agents do not start until Wave 1 completes', async () => {
    const callOrder = [];
    dispatchAgent.mockImplementation((agentRole) => {
      callOrder.push(agentRole);
      return Promise.resolve(mockResult(agentRole));
    });

    await runPipeline('pitchDeck', mockDataPacket);

    // Pre-processing agents first, then wave 1, then wave 2, then wave 3, then post-processing
    const wave1Agents = ['business-analyst', 'competitor-evaluator'];
    const wave2Agents = ['financial-analyst', 'management-evaluator'];
    const wave3Agents = ['risk-analyst', 'valuation-specialist'];

    // Find first index of any wave 2 agent
    const firstWave2Idx = Math.min(
      ...wave2Agents.map(a => callOrder.indexOf(a)).filter(i => i >= 0)
    );
    // Find last index of any wave 1 agent
    const lastWave1Idx = Math.max(
      ...wave1Agents.map(a => callOrder.indexOf(a)).filter(i => i >= 0)
    );
    // Wave 2 should start after wave 1 completes
    expect(firstWave2Idx).toBeGreaterThan(lastWave1Idx);

    // Find first index of any wave 3 agent
    const firstWave3Idx = Math.min(
      ...wave3Agents.map(a => callOrder.indexOf(a)).filter(i => i >= 0)
    );
    // Find last index of any wave 2 agent
    const lastWave2Idx = Math.max(
      ...wave2Agents.map(a => callOrder.indexOf(a)).filter(i => i >= 0)
    );
    // Wave 3 should start after wave 2 completes
    expect(firstWave3Idx).toBeGreaterThan(lastWave2Idx);
  });

  it('Test 4: Each agent dispatch receives correct sectionAssignment from dispatch table', async () => {
    await runPipeline('pitchDeck', mockDataPacket);

    const calls = dispatchAgent.mock.calls;
    // Find business-analyst call (sections: [1, 2])
    const baCall = calls.find(c => c[0] === 'business-analyst');
    expect(baCall).toBeDefined();
    expect(baCall[2].sectionAssignment).toContain('1');
    expect(baCall[2].sectionAssignment).toContain('2');

    // Find competitor-evaluator call (sections: [3])
    const ceCall = calls.find(c => c[0] === 'competitor-evaluator');
    expect(ceCall).toBeDefined();
    expect(ceCall[2].sectionAssignment).toContain('3');
  });

  it('Test 5: Prior sections from completed waves are passed to subsequent wave agents', async () => {
    await runPipeline('pitchDeck', mockDataPacket);

    const calls = dispatchAgent.mock.calls;
    // Wave 1 agents should have no prior sections (only pre-processing sections)
    // Wave 2 agents should have wave 1 sections as priorSections
    const wave2Call = calls.find(c => c[0] === 'financial-analyst');
    expect(wave2Call).toBeDefined();
    expect(wave2Call[2].priorSections).toBeDefined();
    expect(wave2Call[2].priorSections.length).toBeGreaterThan(0);

    // Wave 3 agents should have wave 1 + wave 2 sections
    const wave3Call = calls.find(c => c[0] === 'risk-analyst');
    expect(wave3Call).toBeDefined();
    expect(wave3Call[2].priorSections.length).toBeGreaterThan(wave2Call[2].priorSections.length);
  });

  it('Test 6: onWaveComplete callback is called after each wave with correct arguments', async () => {
    const onWaveComplete = vi.fn().mockResolvedValue(null);

    await runPipeline('pitchDeck', mockDataPacket, { onWaveComplete });

    // 3 waves, each has checkpoint.after = true
    expect(onWaveComplete).toHaveBeenCalledTimes(3);

    // First call: wave 1
    const [waveNum, results, budgetSummary, cacheSummary] = onWaveComplete.mock.calls[0];
    expect(waveNum).toBe(1);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2); // business-analyst + competitor-evaluator
    expect(budgetSummary).toBeDefined();
    expect(budgetSummary.totals).toBeDefined();
    expect(cacheSummary).toBeDefined();
    expect(cacheSummary.hitRate).toBeDefined();
  });

  it('Test 7: PM feedback string returned from onWaveComplete is passed to next wave agents', async () => {
    const onWaveComplete = vi.fn()
      .mockResolvedValueOnce('Focus more on debt analysis')
      .mockResolvedValueOnce('Look deeper at cash flow')
      .mockResolvedValueOnce(null);

    await runPipeline('pitchDeck', mockDataPacket, { onWaveComplete });

    const calls = dispatchAgent.mock.calls;

    // Wave 1 agents should NOT have pmFeedback (no prior wave feedback)
    const wave1Call = calls.find(c => c[0] === 'business-analyst');
    expect(wave1Call[2].pmFeedback).toBeNull();

    // Wave 2 agents should have feedback from wave 1 checkpoint
    const wave2Call = calls.find(c => c[0] === 'financial-analyst');
    expect(wave2Call[2].pmFeedback).toBe('Focus more on debt analysis');

    // Wave 3 agents should have feedback from wave 2 checkpoint
    const wave3Call = calls.find(c => c[0] === 'risk-analyst');
    expect(wave3Call[2].pmFeedback).toBe('Look deeper at cash flow');
  });

  it('Test 8: PSR findings from options.psrFindings are passed through to each dispatchAgent call', async () => {
    const psrFindings = { annualReport: 'Key finding from 10-K' };

    await runPipeline('pitchDeck', mockDataPacket, { psrFindings });

    const calls = dispatchAgent.mock.calls;
    // Every call should receive psrFindings
    for (const call of calls) {
      expect(call[2].psrFindings).toEqual(psrFindings);
    }
  });

  it('Test 9: Failed agents are captured in errors array, not thrown', async () => {
    // Make risk-analyst fail
    dispatchAgent.mockImplementation((agentRole) => {
      if (agentRole === 'risk-analyst') {
        return Promise.resolve(mockErrorResult(agentRole));
      }
      return Promise.resolve(mockResult(agentRole));
    });

    const result = await runPipeline('pitchDeck', mockDataPacket);

    // Should NOT throw
    expect(result).toBeDefined();
    // Errors array should contain the failed agent
    expect(result.errors.length).toBeGreaterThan(0);
    const riskError = result.errors.find(e => e.agent === 'risk-analyst');
    expect(riskError).toBeDefined();
    expect(riskError.error).toContain('Agent failed');
  });

  it('Test 10: Budget tracker records usage from each successful agent dispatch', async () => {
    const result = await runPipeline('pitchDeck', mockDataPacket);

    // Budget should have entries for all agents (pre-processing + 3 waves + post-processing)
    expect(result.budget.entries.length).toBeGreaterThan(0);
    expect(result.budget.totals.inputTokens).toBeGreaterThan(0);
    expect(result.budget.totals.outputTokens).toBeGreaterThan(0);
    expect(result.budget.totals.cost).toBeGreaterThan(0);
  });

  it('Test 11: Cache monitor records usage from each successful agent dispatch', async () => {
    const result = await runPipeline('pitchDeck', mockDataPacket);

    // Cache stats should reflect recorded entries
    expect(result.cacheStats.entries).toBeGreaterThan(0);
    expect(result.cacheStats.totalRead).toBeGreaterThan(0);
    expect(result.cacheStats.totalWrite).toBeGreaterThan(0);
  });

  it('Test 12: Final return contains { sections, budget, cacheStats, errors }', async () => {
    const result = await runPipeline('pitchDeck', mockDataPacket);

    expect(result).toHaveProperty('sections');
    expect(result).toHaveProperty('budget');
    expect(result).toHaveProperty('cacheStats');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.sections)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.budget.totals).toBeDefined();
    expect(typeof result.cacheStats.hitRate).toBe('number');
  });

  it('Test 13: postProcessing synthesis agent runs after all waves and receives all prior sections', async () => {
    await runPipeline('pitchDeck', mockDataPacket);

    const calls = dispatchAgent.mock.calls;
    const agentNames = calls.map(c => c[0]);

    // Synthesis should be the last call
    expect(agentNames[agentNames.length - 1]).toBe('synthesis-writer');

    // Synthesis call should receive all prior sections
    const synthesisCall = calls[calls.length - 1];
    expect(synthesisCall[2].priorSections).toBeDefined();
    // Pre-processing (2) + wave 1 (2) + wave 2 (2) + wave 3 (2) = 8 prior sections
    expect(synthesisCall[2].priorSections.length).toBe(8);
  });

  it('Test 14: Cache monitor belowThreshold warning is logged when hit rate < 70%', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Make all dispatches return 0 cache reads (0% hit rate)
    dispatchAgent.mockImplementation((agentRole) => {
      return Promise.resolve({
        section: { key: 'test', title: 'Test', sectionNumber: 1, status: 'pass', summary: 'Mock', redFlags: [] },
        usage: { inputTokens: 20000, outputTokens: 3000, cacheRead: 0, cacheWrite: 0, webSearches: 0, cost: 0.12 },
        webSearches: [],
        model: 'claude-sonnet-4-6',
        stopReason: 'end_turn',
        duration: 5000,
        error: null,
      });
    });

    await runPipeline('pitchDeck', mockDataPacket);

    // Should have warned about low cache hit rate
    const cacheWarns = warnSpy.mock.calls.filter(
      c => c[0] && typeof c[0] === 'string' && c[0].includes('below') && c[0].includes('threshold')
    );
    expect(cacheWarns.length).toBeGreaterThan(0);

    warnSpy.mockRestore();
  });

  it('Test 15: throws for unknown stage', async () => {
    await expect(runPipeline('unknownStage', mockDataPacket)).rejects.toThrow('Unknown stage');
  });

  it('Test 16: Promise.allSettled handles rejected promises gracefully', async () => {
    // Make competitor-evaluator reject entirely (not return error, but throw)
    dispatchAgent.mockImplementation((agentRole) => {
      if (agentRole === 'competitor-evaluator') {
        return Promise.reject(new Error('Network timeout'));
      }
      return Promise.resolve(mockResult(agentRole));
    });

    const result = await runPipeline('pitchDeck', mockDataPacket);

    // Should NOT throw at the pipeline level
    expect(result).toBeDefined();
    // The rejected promise should appear in errors
    const ceError = result.errors.find(e => e.agent === 'competitor-evaluator');
    expect(ceError).toBeDefined();
    expect(ceError.error).toContain('Network timeout');
  });
});
