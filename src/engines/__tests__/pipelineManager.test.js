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
            },
            {
              phase: 2,
              description: 'Financial deep-dive',
              agents: [
                { agent: 'competitor-evaluator', sections: [4], parallel: false, note: 'Moat validation needs Phase 1 context' },
                { agent: 'financial-analyst', sections: [5, 7, 8], parallel: true },
                { agent: 'management-evaluator', sections: [6], parallel: true },
              ],
            },
            {
              phase: 3,
              description: 'Risk and valuation',
              agents: [
                { agent: 'risk-analyst', sections: [9], parallel: true },
                { agent: 'valuation-specialist', sections: [10], parallel: true },
              ],
            },
          ],
          postProcessing: [
            { step: 'synthesis', agent: 'synthesis-writer', sections: [], dependsOn: 'all-phases' },
          ],
          sectionKeys: ['radar', 'simple_predictable', 'market_position', 'barriers_moats', 'fcf', 'management', 'roe_roic_debt', 'balance_sheet', 'pest', 'valuation'],
        },
        fullStory: {
          preProcessing: [
            { step: 'inherit-pitch-deck', description: 'Load all Pitch Deck findings + updated DataPacket' },
          ],
          phases: [
            {
              phase: 1,
              description: 'Deep analysis with scored checklists',
              agents: [
                { agent: 'risk-analyst', sections: [1], parallel: true },
                { agent: 'business-analyst', sections: [2], parallel: true },
                { agent: 'competitor-evaluator', sections: [3], parallel: true },
                { agent: 'management-evaluator', sections: [4], parallel: true },
                { agent: 'valuation-specialist', sections: [5], parallel: true },
              ],
            },
            {
              phase: 2,
              description: 'THE DEBATE — 4-step adversarial analysis',
              isDebate: true,
              sequential: true,
              steps: [
                { step: 1, role: 'bull', agent: 'synthesis-writer', description: 'Summarize investment thesis from Sections 1-5', webSearch: false, receivesContext: ['sections_1_through_5'] },
                { step: 2, role: 'bear', agent: 'risk-analyst', description: 'Attack every bull point with cited evidence', webSearch: true, receivesContext: ['bull_output'] },
                { step: 3, role: 'bull_rebuttal', agent: 'synthesis-writer', description: 'Respond to each bear point with evidence or honest acknowledgment', webSearch: false, receivesContext: ['bull_output', 'bear_output'] },
                { step: 4, role: 'judge', agent: 'financial-analyst', description: 'Score each exchange, produce structured verdict', webSearch: false, receivesContext: ['bull_output', 'bear_output', 'bull_rebuttal_output'] },
              ],
              outputSection: 6,
              outputKey: 'inversion_rebuttal',
            },
          ],
          postProcessing: [],
          sectionKeys: ['event_analysis', 'meaning_checklist', 'moat_checklist', 'management_checklist', 'valuation_confirmation', 'inversion_rebuttal'],
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

import { runPipeline, _testExports } from '../pipelineManager.js';
import { dispatchAgent } from '../aiResearch.js';

const { formatPsrFindings } = _testExports;

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
    // Multi-section entries (schema === MultiSectionSchema) return { sections: [...] }
    dispatchAgent.mockImplementation((agentRole, dp, opts) => {
      if (opts?.schema) {
        // Multi-section dispatch — return wrapped array
        const sections = opts.sectionAssignment?.match(/sections: ([\d, ]+)/)?.[1];
        const nums = sections ? sections.split(',').map(s => parseInt(s.trim())) : [1];
        return Promise.resolve({
          section: {
            sections: nums.map(n => ({
              key: `section_${n}`,
              title: `Section ${n} by ${agentRole}`,
              sectionNumber: n,
              status: 'pass',
              confidence: 'HIGH',
              verdict: 'PASS',
              verdictRationale: 'Mock rationale',
              summary: `Mock summary from ${agentRole} for section ${n}`,
              data: '{}',
              narrative: `Mock narrative for section ${n}`,
              citations: [],
              redFlags: ['Minor concern'],
              modelUsed: 'claude-sonnet-4-6',
              tokenCost: { input: 20000, output: 3000 },
            })),
          },
          usage: { inputTokens: 40000, outputTokens: 8000, cacheRead: 15000, cacheWrite: 5000, webSearches: 1, cost: 0.24 },
          webSearches: [],
          model: 'claude-sonnet-4-6',
          stopReason: 'end_turn',
          duration: 8000,
          error: null,
        });
      }
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

    // Wave 1 has business-analyst (consolidated [1,2]) and competitor-evaluator [3]
    const calls = dispatchAgent.mock.calls;
    const agentNames = calls.map(c => c[0]);

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
    dispatchAgent.mockImplementation((agentRole, dp, opts) => {
      callOrder.push(agentRole);
      if (opts?.schema) {
        // Multi-section: return wrapped sections
        const sections = opts.sectionAssignment?.match(/sections: ([\d, ]+)/)?.[1];
        const nums = sections ? sections.split(',').map(s => parseInt(s.trim())) : [1];
        return Promise.resolve({
          section: { sections: nums.map(n => ({ key: `section_${n}`, title: `Section ${n}`, sectionNumber: n, status: 'pass', summary: 'Mock', redFlags: ['x'] })) },
          usage: { inputTokens: 20000, outputTokens: 3000, cacheRead: 15000, cacheWrite: 5000, webSearches: 1, cost: 0.12 },
          error: null,
        });
      }
      return Promise.resolve(mockResult(agentRole));
    });

    await runPipeline('pitchDeck', mockDataPacket);

    // Wave 1: business-analyst, competitor-evaluator
    // Wave 2: competitor-evaluator, financial-analyst, management-evaluator
    // Wave 3: risk-analyst, valuation-specialist
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
    // Find business-analyst call (consolidated sections: [1, 2])
    const baCall = calls.find(c => c[0] === 'business-analyst');
    expect(baCall).toBeDefined();
    expect(baCall[2].sectionAssignment).toContain('1');
    expect(baCall[2].sectionAssignment).toContain('2');

    // Find financial-analyst call (consolidated sections: [5, 7, 8])
    const faCall = calls.find(c => c[0] === 'financial-analyst');
    expect(faCall).toBeDefined();
    expect(faCall[2].sectionAssignment).toContain('5');
    expect(faCall[2].sectionAssignment).toContain('7');
    expect(faCall[2].sectionAssignment).toContain('8');

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

    // 3 waves, each calls onWaveComplete
    expect(onWaveComplete).toHaveBeenCalledTimes(3);

    // First call: wave 1 — business-analyst (consolidated) + competitor-evaluator
    const [waveNum, results, budgetSummary, cacheSummary] = onWaveComplete.mock.calls[0];
    expect(waveNum).toBe(1);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2); // 2 dispatch calls (business-analyst + competitor-evaluator)
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

    // Wave 2 agents should have feedback from wave 1 callback
    const wave2Call = calls.find(c => c[0] === 'financial-analyst');
    expect(wave2Call[2].pmFeedback).toBe('Focus more on debt analysis');

    // Wave 3 agents should have feedback from wave 2 callback
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
    // Wave 1: business-analyst [1,2]=2 sections + competitor-evaluator [3]=1 = 3
    // Wave 2: competitor-evaluator [4]=1 + financial-analyst [5,7,8]=3 + management-evaluator [6]=1 = 5
    // Wave 3: risk-analyst [9]=1 + valuation-specialist [10]=1 = 2
    // Total: 10 prior sections
    expect(synthesisCall[2].priorSections.length).toBe(10);
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

// ─── formatPsrFindings ──────────────────────────────────────────

describe('formatPsrFindings', () => {
  it('extracts narrative and primarySourceInsights from two PSR sections', () => {
    const sections = [
      {
        key: 'annual-reader',
        title: 'Annual Report Reader',
        narrative: 'The 10-K reveals strong revenue growth.',
        primarySourceInsights: ['Revenue grew 12% YoY', 'Gross margin expanded to 38%'],
      },
      {
        key: 'quarterly-reader',
        title: 'Quarterly Report Reader',
        narrative: 'Q4 showed acceleration in same-store sales.',
        primarySourceInsights: ['Same-store sales up 5.2%'],
      },
    ];
    const result = formatPsrFindings(sections);
    expect(result).toContain('Annual Report Reader');
    expect(result).toContain('The 10-K reveals strong revenue growth.');
    expect(result).toContain('Revenue grew 12% YoY');
    expect(result).toContain('Gross margin expanded to 38%');
    expect(result).toContain('Quarterly Report Reader');
    expect(result).toContain('Q4 showed acceleration in same-store sales.');
    expect(result).toContain('Same-store sales up 5.2%');
  });

  it('skips null section in array', () => {
    const sections = [
      null,
      {
        key: 'annual-reader',
        title: 'Annual Report Reader',
        narrative: 'Good findings.',
        primarySourceInsights: ['Insight 1'],
      },
    ];
    const result = formatPsrFindings(sections);
    expect(result).toContain('Annual Report Reader');
    expect(result).toContain('Good findings.');
    expect(result).not.toContain('null');
  });

  it('returns empty string for empty array', () => {
    const result = formatPsrFindings([]);
    expect(result).toBe('');
  });

  it('includes insights even when narrative is missing', () => {
    const sections = [
      {
        key: 'annual-reader',
        title: 'Annual Report Reader',
        primarySourceInsights: ['Key insight from filing'],
      },
    ];
    const result = formatPsrFindings(sections);
    expect(result).toContain('Key insight from filing');
    expect(result).toContain('Key Insights');
  });

  it('output starts with ## Primary Source Reader Findings header', () => {
    const sections = [
      {
        key: 'annual-reader',
        title: 'Annual Report Reader',
        narrative: 'Some findings.',
        primarySourceInsights: [],
      },
    ];
    const result = formatPsrFindings(sections);
    expect(result.startsWith('## Primary Source Reader Findings')).toBe(true);
  });
});

// ─── PSR findings wiring ────────────────────────────────────────

describe('PSR findings wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // PSR agents (annual-reader, quarterly-reader) return sections with narrative + insights
    dispatchAgent.mockImplementation((agentRole) => {
      if (agentRole === 'annual-reader') {
        return Promise.resolve({
          section: {
            key: 'annual-reader',
            title: 'Annual Report Reader',
            sectionNumber: 98,
            status: 'pass',
            confidence: 90,
            summary: 'Annual analysis',
            narrative: 'The 10-K reveals strong revenue growth of 12% driven by new store openings.',
            primarySourceInsights: ['Revenue grew 12%', 'Operating margin improved to 7.5%'],
            redFlags: [],
          },
          usage: { inputTokens: 20000, outputTokens: 3000, cacheRead: 15000, cacheWrite: 5000, webSearches: 0, cost: 0.12 },
          webSearches: [],
          model: 'claude-sonnet-4-6',
          stopReason: 'end_turn',
          duration: 5000,
          error: null,
        });
      }
      if (agentRole === 'quarterly-reader') {
        return Promise.resolve({
          section: {
            key: 'quarterly-reader',
            title: 'Quarterly Report Reader',
            sectionNumber: 99,
            status: 'pass',
            confidence: 85,
            summary: 'Quarterly analysis',
            narrative: 'Q4 results show acceleration with same-store sales up 5.2%.',
            primarySourceInsights: ['Same-store sales up 5.2%', 'Management raised guidance'],
            redFlags: [],
          },
          usage: { inputTokens: 18000, outputTokens: 2500, cacheRead: 14000, cacheWrite: 4000, webSearches: 0, cost: 0.10 },
          webSearches: [],
          model: 'claude-sonnet-4-6',
          stopReason: 'end_turn',
          duration: 4000,
          error: null,
        });
      }
      // All other agents return a generic section
      const sectionNum = agentRole.includes('business') ? 1 :
        agentRole.includes('competitor') ? 3 :
        agentRole.includes('financial') ? 5 :
        agentRole.includes('management') ? 6 :
        agentRole.includes('risk') ? 9 :
        agentRole.includes('valuation') ? 10 :
        agentRole.includes('synthesis') ? 0 : 1;
      return Promise.resolve({
        section: { key: `section_${sectionNum}`, title: `Section ${sectionNum}`, sectionNumber: sectionNum, status: 'pass', summary: 'Mock', redFlags: [] },
        usage: { inputTokens: 20000, outputTokens: 3000, cacheRead: 15000, cacheWrite: 5000, webSearches: 1, cost: 0.12 },
        webSearches: [],
        model: 'claude-sonnet-4-6',
        stopReason: 'end_turn',
        duration: 5000,
        error: null,
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wave agents receive psrFindings field', async () => {
    await runPipeline('pitchDeck', mockDataPacket);

    const calls = dispatchAgent.mock.calls;
    // Wave 1 agent (business-analyst) should receive PSR findings field
    const baCall = calls.find(c => c[0] === 'business-analyst');
    expect(baCall).toBeDefined();
    expect(typeof baCall[2].psrFindings).toBe('string');
  });

  it('post-processing synthesis agent receives psrFindings field', async () => {
    await runPipeline('pitchDeck', mockDataPacket);

    const calls = dispatchAgent.mock.calls;
    const synthesisCall = calls.find(c => c[0] === 'synthesis-writer');
    expect(synthesisCall).toBeDefined();
    expect(typeof synthesisCall[2].psrFindings).toBe('string');
  });
});

// ─── fullStory debate dispatch ─────────────────────────────────

// Mock debate step outputs matching DebateStepSchema shapes
function mockBullOutput() {
  return {
    step: 1,
    role: 'bull',
    agent: 'synthesis-writer',
    content: {
      thesisPoints: [
        { point: 'Strong revenue growth', evidence: 'Revenue grew 14%', sourceSection: 'S1: Event Analysis' },
        { point: 'Expanding margins', evidence: 'Gross margin 38.8%', sourceSection: 'S2: Meaning' },
        { point: 'Zero debt', evidence: 'Net cash $243M', sourceSection: 'S3: Moat' },
        { point: 'Great management', evidence: 'CEO turnaround', sourceSection: 'S4: Management' },
        { point: 'Growth runway', evidence: '477 of 1400 stores', sourceSection: 'S5: Valuation' },
      ],
      overallThesis: 'SFM is a wonderful company at a fair price.',
    },
  };
}

function mockBearOutput() {
  return {
    step: 2,
    role: 'bear',
    agent: 'risk-analyst',
    content: {
      inversions: [
        { targetPoint: 'Strong revenue growth', counterArgument: 'Growth is slowing', evidence: 'Q1 comps negative', severity: 'significant', sources: ['https://example.com/sfm-q1'] },
      ],
      overallBearCase: 'The growth story is decelerating.',
    },
  };
}

function mockRebuttalOutput() {
  return {
    step: 3,
    role: 'bull_rebuttal',
    agent: 'synthesis-writer',
    content: {
      rebuttals: [
        { bearPoint: 'Growth is slowing', rebuttal: 'Tough comps from 11.7% Q1', rebuttalStrength: 'moderate', honest: false },
      ],
    },
  };
}

function mockJudgeOutput() {
  return {
    step: 4,
    role: 'judge',
    agent: 'financial-analyst',
    content: {
      exchanges: [
        { topic: 'Revenue growth', bullStrength: 'strong', bearStrength: 'moderate', verdict: 'Strong Bull', reasoning: 'Bull evidence stronger' },
      ],
      overallVerdict: { direction: 'Bull', unresolvedCount: 0, summary: 'Bull wins overall', investmentImplication: 'Consider buying on dips' },
    },
  };
}

// Helper for fullStory mock section (S1-S5 parallel wave)
function mockFullStorySection(agentRole, sectionNum) {
  return {
    key: `section_${sectionNum}`,
    title: `Section ${sectionNum} by ${agentRole}`,
    sectionNumber: sectionNum,
    status: 'pass',
    confidence: 85,
    summary: `Mock summary from ${agentRole}`,
    verdict: 'PASS',
    redFlags: ['Minor concern'],
  };
}

describe('pipelineManager — fullStory debate dispatch', () => {
  let callOrder;

  beforeEach(() => {
    vi.clearAllMocks();
    callOrder = [];

    // Dispatch mock that differentiates between fullStory wave 1 (parallel),
    // debate steps (sequential), and synthesis
    dispatchAgent.mockImplementation((agentRole, dp, opts) => {
      callOrder.push({ agent: agentRole, opts });

      // Debate step dispatches — identified by debateRole option
      if (opts?.debateRole === 'bull') {
        return Promise.resolve({
          section: mockBullOutput(),
          usage: { inputTokens: 20000, outputTokens: 4000, cacheRead: 15000, cacheWrite: 5000, webSearches: 0, cost: 0.15 },
          webSearches: [],
          model: 'claude-sonnet-4-6',
          stopReason: 'end_turn',
          duration: 5000,
          error: null,
        });
      }
      if (opts?.debateRole === 'bear') {
        return Promise.resolve({
          section: mockBearOutput(),
          usage: { inputTokens: 22000, outputTokens: 5000, cacheRead: 16000, cacheWrite: 5000, webSearches: 3, cost: 0.20 },
          webSearches: [{ url: 'https://example.com/sfm-q1' }],
          model: 'claude-sonnet-4-6',
          stopReason: 'end_turn',
          duration: 7000,
          error: null,
        });
      }
      if (opts?.debateRole === 'bull_rebuttal') {
        return Promise.resolve({
          section: mockRebuttalOutput(),
          usage: { inputTokens: 25000, outputTokens: 3000, cacheRead: 18000, cacheWrite: 5000, webSearches: 0, cost: 0.14 },
          webSearches: [],
          model: 'claude-sonnet-4-6',
          stopReason: 'end_turn',
          duration: 4000,
          error: null,
        });
      }
      if (opts?.debateRole === 'judge') {
        return Promise.resolve({
          section: mockJudgeOutput(),
          usage: { inputTokens: 30000, outputTokens: 4000, cacheRead: 20000, cacheWrite: 5000, webSearches: 0, cost: 0.18 },
          webSearches: [],
          model: 'claude-sonnet-4-6',
          stopReason: 'end_turn',
          duration: 6000,
          error: null,
        });
      }

      // Synthesis-writer composing S6 from debate outputs (no debateRole)
      if (agentRole === 'synthesis-writer' && opts?.sectionAssignment?.includes('Compose Section 6')) {
        return Promise.resolve({
          section: {
            key: 'inversion_rebuttal',
            title: 'Inversion & Rebuttal',
            sectionNumber: 6,
            status: 'pass',
            confidence: 'HIGH',
            verdict: 'WATCHLIST',
            verdictRationale: 'Mixed debate outcome',
            summary: 'Debate produced balanced findings.',
            data: '{}',
            narrative: 'The debate revealed...',
            citations: [],
            tables: [],
            charts: [],
            redFlags: ['Insider selling concern'],
            primarySourceInsights: [],
            crossCuttingFindings: [],
            modelUsed: 'claude-sonnet-4-6',
            tokenCost: { input: 35000, output: 8000 },
          },
          usage: { inputTokens: 35000, outputTokens: 8000, cacheRead: 25000, cacheWrite: 5000, webSearches: 0, cost: 0.30 },
          webSearches: [],
          model: 'claude-sonnet-4-6',
          stopReason: 'end_turn',
          duration: 10000,
          error: null,
        });
      }

      // Wave 1 parallel agents (S1-S5) — standard sections
      const sectionMap = {
        'risk-analyst': 1,
        'business-analyst': 2,
        'competitor-evaluator': 3,
        'management-evaluator': 4,
        'valuation-specialist': 5,
      };
      const sectionNum = sectionMap[agentRole] || 1;
      return Promise.resolve({
        section: mockFullStorySection(agentRole, sectionNum),
        usage: { inputTokens: 20000, outputTokens: 3000, cacheRead: 15000, cacheWrite: 5000, webSearches: 1, cost: 0.12 },
        webSearches: [],
        model: 'claude-sonnet-4-6',
        stopReason: 'end_turn',
        duration: 5000,
        error: null,
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test FS-1: fullStory wave 1 dispatches S1-S5 agents in parallel via Promise.allSettled', async () => {
    const result = await runPipeline('fullStory', mockDataPacket);

    const agentNames = callOrder.map(c => c.agent);
    // Wave 1: 5 parallel agents
    expect(agentNames).toContain('risk-analyst');
    expect(agentNames).toContain('business-analyst');
    expect(agentNames).toContain('competitor-evaluator');
    expect(agentNames).toContain('management-evaluator');
    expect(agentNames).toContain('valuation-specialist');

    // Should complete without error
    expect(result.sections.length).toBeGreaterThanOrEqual(5);
  });

  it('Test FS-2: debate steps 1-4 execute sequentially (bull before bear before rebuttal before judge)', async () => {
    await runPipeline('fullStory', mockDataPacket);

    // Filter to debate steps only (identified by debateRole)
    const debateSteps = callOrder.filter(c => c.opts?.debateRole);
    expect(debateSteps.length).toBe(4);
    expect(debateSteps[0].opts.debateRole).toBe('bull');
    expect(debateSteps[1].opts.debateRole).toBe('bear');
    expect(debateSteps[2].opts.debateRole).toBe('bull_rebuttal');
    expect(debateSteps[3].opts.debateRole).toBe('judge');

    // Debate steps should come AFTER wave 1 agents
    const wave1Agents = ['risk-analyst', 'business-analyst', 'competitor-evaluator', 'management-evaluator', 'valuation-specialist'];
    const lastWave1Idx = Math.max(...wave1Agents.map(a =>
      callOrder.findIndex(c => c.agent === a && !c.opts?.debateRole)
    ));
    const firstDebateIdx = callOrder.findIndex(c => c.opts?.debateRole === 'bull');
    expect(firstDebateIdx).toBeGreaterThan(lastWave1Idx);
  });

  it('Test FS-3: bull step receives debateContext containing S1-S5 section summaries', async () => {
    await runPipeline('fullStory', mockDataPacket);

    const bullCall = callOrder.find(c => c.opts?.debateRole === 'bull');
    expect(bullCall).toBeDefined();
    expect(bullCall.opts.debateContext).toBeDefined();
    // Should contain section summaries from S1-S5
    expect(bullCall.opts.debateContext).toContain('Section 1');
    expect(bullCall.opts.debateContext).toContain('Section 2');
    expect(bullCall.opts.debateContext).toContain('Section 3');
    expect(bullCall.opts.debateContext).toContain('Section 4');
    expect(bullCall.opts.debateContext).toContain('Section 5');
  });

  it('Test FS-4: bear step receives debateContext containing bull_output JSON', async () => {
    await runPipeline('fullStory', mockDataPacket);

    const bearCall = callOrder.find(c => c.opts?.debateRole === 'bear');
    expect(bearCall).toBeDefined();
    expect(bearCall.opts.debateContext).toBeDefined();
    expect(bearCall.opts.debateContext).toContain('Bull Thesis (Step 1)');
    expect(bearCall.opts.debateContext).toContain('thesisPoints');
    expect(bearCall.opts.debateContext).toContain('Strong revenue growth');
  });

  it('Test FS-5: bull_rebuttal step receives debateContext containing both bull_output and bear_output', async () => {
    await runPipeline('fullStory', mockDataPacket);

    const rebuttalCall = callOrder.find(c => c.opts?.debateRole === 'bull_rebuttal');
    expect(rebuttalCall).toBeDefined();
    expect(rebuttalCall.opts.debateContext).toBeDefined();
    expect(rebuttalCall.opts.debateContext).toContain('Bull Thesis (Step 1)');
    expect(rebuttalCall.opts.debateContext).toContain('Bear Inversion (Step 2)');
    expect(rebuttalCall.opts.debateContext).toContain('thesisPoints');
    expect(rebuttalCall.opts.debateContext).toContain('inversions');
  });

  it('Test FS-6: judge step receives debateContext containing bull, bear, and rebuttal outputs', async () => {
    await runPipeline('fullStory', mockDataPacket);

    const judgeCall = callOrder.find(c => c.opts?.debateRole === 'judge');
    expect(judgeCall).toBeDefined();
    expect(judgeCall.opts.debateContext).toBeDefined();
    expect(judgeCall.opts.debateContext).toContain('Bull Thesis (Step 1)');
    expect(judgeCall.opts.debateContext).toContain('Bear Inversion (Step 2)');
    expect(judgeCall.opts.debateContext).toContain('Bull Rebuttal (Step 3)');
  });

  it('Test FS-7: only bear step gets maxSearches > 0; bull, rebuttal, judge get maxSearches: 0', async () => {
    await runPipeline('fullStory', mockDataPacket);

    const bullCall = callOrder.find(c => c.opts?.debateRole === 'bull');
    const bearCall = callOrder.find(c => c.opts?.debateRole === 'bear');
    const rebuttalCall = callOrder.find(c => c.opts?.debateRole === 'bull_rebuttal');
    const judgeCall = callOrder.find(c => c.opts?.debateRole === 'judge');

    expect(bullCall.opts.maxSearches).toBe(0);
    expect(bearCall.opts.maxSearches).toBeGreaterThan(0);
    expect(rebuttalCall.opts.maxSearches).toBe(0);
    expect(judgeCall.opts.maxSearches).toBe(0);
  });

  it('Test FS-8: each debate step dispatches with DEBATE_SCHEMAS[step.role] as schema parameter', async () => {
    await runPipeline('fullStory', mockDataPacket);

    const bullCall = callOrder.find(c => c.opts?.debateRole === 'bull');
    const bearCall = callOrder.find(c => c.opts?.debateRole === 'bear');
    const rebuttalCall = callOrder.find(c => c.opts?.debateRole === 'bull_rebuttal');
    const judgeCall = callOrder.find(c => c.opts?.debateRole === 'judge');

    // Each should have a schema option set
    expect(bullCall.opts.schema).toBeDefined();
    expect(bearCall.opts.schema).toBeDefined();
    expect(rebuttalCall.opts.schema).toBeDefined();
    expect(judgeCall.opts.schema).toBeDefined();
  });

  it('Test FS-9: 5th synthesis-writer call fires after 4 debate steps with no schema override', async () => {
    await runPipeline('fullStory', mockDataPacket);

    // Find the synthesis composition call
    const synthCall = callOrder.find(c =>
      c.agent === 'synthesis-writer' && c.opts?.sectionAssignment?.includes('Compose Section 6')
    );
    expect(synthCall).toBeDefined();

    // Should NOT have a schema override (defaults to ReportSectionSchema in dispatchAgent)
    expect(synthCall.opts.schema).toBeUndefined();

    // Should come after all 4 debate steps
    const synthIdx = callOrder.indexOf(synthCall);
    const lastDebateIdx = callOrder.findIndex(c => c.opts?.debateRole === 'judge');
    expect(synthIdx).toBeGreaterThan(lastDebateIdx);

    // Synthesis receives debate outputs in debateContext
    expect(synthCall.opts.debateContext).toBeDefined();
    expect(synthCall.opts.debateContext).toContain('bull');
    expect(synthCall.opts.debateContext).toContain('bear');
  });

  it('Test FS-10: synthesis result is pushed to allSections as the S6 section', async () => {
    const result = await runPipeline('fullStory', mockDataPacket);

    // Should have 5 sections from wave 1 + 1 from synthesis = 6
    const s6 = result.sections.find(s => s.sectionNumber === 6);
    expect(s6).toBeDefined();
    expect(s6.key).toBe('inversion_rebuttal');
    expect(s6.title).toBe('Inversion & Rebuttal');
  });

  it('Test FS-11: budget.record called with role-qualified labels for debate steps', async () => {
    await runPipeline('fullStory', mockDataPacket);

    // The budget tracker is internal, so we verify via the budget summary
    // which records agentRole labels. We can check the callOrder includes
    // the correct agents with debate roles set.
    const debateSteps = callOrder.filter(c => c.opts?.debateRole);
    expect(debateSteps[0].agent).toBe('synthesis-writer'); // bull
    expect(debateSteps[1].agent).toBe('risk-analyst');     // bear
    expect(debateSteps[2].agent).toBe('synthesis-writer'); // bull_rebuttal
    expect(debateSteps[3].agent).toBe('financial-analyst'); // judge
  });

  it('Test FS-12: onWaveComplete callback fires after each wave including debate', async () => {
    const onWaveComplete = vi.fn().mockResolvedValue(null);

    await runPipeline('fullStory', mockDataPacket, { onWaveComplete });

    // 2 waves — wave 1 (parallel S1-S5) and wave 2 (debate)
    expect(onWaveComplete).toHaveBeenCalledTimes(2);

    // Second call should be the debate wave (phase 2)
    const [waveNum] = onWaveComplete.mock.calls[1];
    expect(waveNum).toBe(2);
  });

  it('Test FS-13: debate step error is captured in errors array (does not crash pipeline)', async () => {
    // Make bear step return an error
    dispatchAgent.mockImplementation((agentRole, dp, opts) => {
      callOrder.push({ agent: agentRole, opts });

      if (opts?.debateRole === 'bear') {
        return Promise.resolve({
          section: null,
          usage: { inputTokens: 1000, outputTokens: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0, cost: 0.003 },
          error: 'Bear analysis failed: context too long',
        });
      }
      if (opts?.debateRole === 'bull') {
        return Promise.resolve({
          section: mockBullOutput(),
          usage: { inputTokens: 20000, outputTokens: 4000, cacheRead: 15000, cacheWrite: 5000, webSearches: 0, cost: 0.15 },
          error: null,
        });
      }
      if (opts?.debateRole === 'bull_rebuttal') {
        return Promise.resolve({
          section: mockRebuttalOutput(),
          usage: { inputTokens: 25000, outputTokens: 3000, cacheRead: 18000, cacheWrite: 5000, webSearches: 0, cost: 0.14 },
          error: null,
        });
      }
      if (opts?.debateRole === 'judge') {
        return Promise.resolve({
          section: mockJudgeOutput(),
          usage: { inputTokens: 30000, outputTokens: 4000, cacheRead: 20000, cacheWrite: 5000, webSearches: 0, cost: 0.18 },
          error: null,
        });
      }
      if (agentRole === 'synthesis-writer' && opts?.sectionAssignment?.includes('Compose Section 6')) {
        return Promise.resolve({
          section: { key: 'inversion_rebuttal', title: 'S6', sectionNumber: 6, status: 'pass', summary: 'Mock', redFlags: ['x'] },
          usage: { inputTokens: 35000, outputTokens: 8000, cacheRead: 25000, cacheWrite: 5000, webSearches: 0, cost: 0.30 },
          error: null,
        });
      }
      const sectionMap = { 'risk-analyst': 1, 'business-analyst': 2, 'competitor-evaluator': 3, 'management-evaluator': 4, 'valuation-specialist': 5 };
      return Promise.resolve({
        section: mockFullStorySection(agentRole, sectionMap[agentRole] || 1),
        usage: { inputTokens: 20000, outputTokens: 3000, cacheRead: 15000, cacheWrite: 5000, webSearches: 1, cost: 0.12 },
        error: null,
      });
    });

    const result = await runPipeline('fullStory', mockDataPacket);

    // Pipeline should NOT throw
    expect(result).toBeDefined();
    // Errors should contain the bear failure
    const bearError = result.errors.find(e => e.step === 'debate-bear');
    expect(bearError).toBeDefined();
    expect(bearError.error).toContain('Bear analysis failed');
  });

  it('Test FS-14: debate step that throws is caught and added to errors', async () => {
    dispatchAgent.mockImplementation((agentRole, dp, opts) => {
      callOrder.push({ agent: agentRole, opts });

      if (opts?.debateRole === 'bull_rebuttal') {
        return Promise.reject(new Error('Network timeout on rebuttal'));
      }
      if (opts?.debateRole === 'bull') {
        return Promise.resolve({
          section: mockBullOutput(),
          usage: { inputTokens: 20000, outputTokens: 4000, cacheRead: 15000, cacheWrite: 5000, webSearches: 0, cost: 0.15 },
          error: null,
        });
      }
      if (opts?.debateRole === 'bear') {
        return Promise.resolve({
          section: mockBearOutput(),
          usage: { inputTokens: 22000, outputTokens: 5000, cacheRead: 16000, cacheWrite: 5000, webSearches: 3, cost: 0.20 },
          error: null,
        });
      }
      if (opts?.debateRole === 'judge') {
        return Promise.resolve({
          section: mockJudgeOutput(),
          usage: { inputTokens: 30000, outputTokens: 4000, cacheRead: 20000, cacheWrite: 5000, webSearches: 0, cost: 0.18 },
          error: null,
        });
      }
      if (agentRole === 'synthesis-writer' && opts?.sectionAssignment?.includes('Compose Section 6')) {
        return Promise.resolve({
          section: { key: 'inversion_rebuttal', title: 'S6', sectionNumber: 6, status: 'pass', summary: 'Mock', redFlags: ['x'] },
          usage: { inputTokens: 35000, outputTokens: 8000, cacheRead: 25000, cacheWrite: 5000, webSearches: 0, cost: 0.30 },
          error: null,
        });
      }
      const sectionMap = { 'risk-analyst': 1, 'business-analyst': 2, 'competitor-evaluator': 3, 'management-evaluator': 4, 'valuation-specialist': 5 };
      return Promise.resolve({
        section: mockFullStorySection(agentRole, sectionMap[agentRole] || 1),
        usage: { inputTokens: 20000, outputTokens: 3000, cacheRead: 15000, cacheWrite: 5000, webSearches: 1, cost: 0.12 },
        error: null,
      });
    });

    const result = await runPipeline('fullStory', mockDataPacket);

    // Pipeline should NOT throw
    expect(result).toBeDefined();
    // Errors should contain the rebuttal throw
    const rebuttalError = result.errors.find(e => e.step === 'debate-bull_rebuttal');
    expect(rebuttalError).toBeDefined();
    expect(rebuttalError.error).toContain('Network timeout');
  });
});

// ─── buildDebateContext ────────────────────────────────────────

describe('buildDebateContext', () => {
  const { buildDebateContext } = _testExports;

  const mockSections = [
    { sectionNumber: 1, title: 'Event Analysis', verdict: 'PASS', status: 'pass', summary: 'Events look good', redFlags: ['Minor concern'] },
    { sectionNumber: 2, title: 'Meaning Checklist', verdict: 'PASS', status: 'pass', summary: 'Business is meaningful', redFlags: ['Low TAM risk'] },
    { sectionNumber: 3, title: 'Moat Checklist', verdict: 'WATCHLIST', status: 'pass', summary: 'Moat is moderate', redFlags: ['Competitor encroachment'] },
    { sectionNumber: 4, title: 'Management', verdict: 'PASS', status: 'pass', summary: 'Management is strong', redFlags: ['Insider selling'] },
    { sectionNumber: 5, title: 'Valuation', verdict: 'WATCHLIST', status: 'pass', summary: 'Stock is near fair value', redFlags: ['Above buy range'] },
    { sectionNumber: 99, title: 'PSR Output', status: 'pass', summary: 'Pre-processing', redFlags: [] },
  ];

  const mockDebateOutputs = {
    bull: mockBullOutput(),
    bear: mockBearOutput(),
    bull_rebuttal: mockRebuttalOutput(),
  };

  it('sections_1_through_5 builds summary from S1-S5 only (excludes S99)', () => {
    const result = buildDebateContext(['sections_1_through_5'], {}, mockSections);
    expect(result).toContain('Event Analysis');
    expect(result).toContain('Meaning Checklist');
    expect(result).toContain('Moat Checklist');
    expect(result).toContain('Management');
    expect(result).toContain('Valuation');
    expect(result).not.toContain('PSR Output');
  });

  it('bull_output includes full JSON of bull debate output', () => {
    const result = buildDebateContext(['bull_output'], mockDebateOutputs, mockSections);
    expect(result).toContain('Bull Thesis (Step 1)');
    expect(result).toContain('thesisPoints');
    expect(result).toContain('Strong revenue growth');
  });

  it('bear_output includes full JSON of bear debate output', () => {
    const result = buildDebateContext(['bear_output'], mockDebateOutputs, mockSections);
    expect(result).toContain('Bear Inversion (Step 2)');
    expect(result).toContain('inversions');
    expect(result).toContain('Growth is slowing');
  });

  it('bull_rebuttal_output includes full JSON of rebuttal debate output', () => {
    const result = buildDebateContext(['bull_rebuttal_output'], mockDebateOutputs, mockSections);
    expect(result).toContain('Bull Rebuttal (Step 3)');
    expect(result).toContain('rebuttals');
    expect(result).toContain('Tough comps from 11.7% Q1');
  });

  it('multiple receivesContext entries joined with separator', () => {
    const result = buildDebateContext(['bull_output', 'bear_output'], mockDebateOutputs, mockSections);
    expect(result).toContain('Bull Thesis (Step 1)');
    expect(result).toContain('Bear Inversion (Step 2)');
    expect(result).toContain('---');
  });

  it('returns empty string for empty receivesContext', () => {
    const result = buildDebateContext([], {}, mockSections);
    expect(result).toBe('');
  });

  it('truncates section narrative to 2000 chars per section for sections_1_through_5', () => {
    const longSections = mockSections.map(s => ({
      ...s,
      narrative: 'x'.repeat(3000),
    }));
    const result = buildDebateContext(['sections_1_through_5'], {}, longSections);
    // Each section's narrative should be at most 2000 chars (truncated)
    // We can verify by checking the result doesn't contain 3000 x's in a row
    expect(result).not.toContain('x'.repeat(2001));
  });
});

// ─── PSR reuse for fullStory (inherit-pitch-deck) ──────────────

describe('PSR reuse for fullStory', () => {
  let callOrder;

  // Mock PSR sections as they appear in pitchDeckSections (from pitch-deck.json)
  const mockPsrSections = [
    {
      key: 'annual-reader',
      title: 'Annual Filing Analysis (10-K FY2025)',
      sectionNumber: 98,
      status: 'pass',
      confidence: 90,
      summary: 'Strong revenue growth from new store openings',
      narrative: 'The 10-K reveals strong revenue growth of 14% driven by new store openings and same-store sales improvement.',
      primarySourceInsights: ['Revenue grew 14%', 'Operating margin improved to 7.5%', 'New stores added: 42'],
      redFlags: [],
    },
    {
      key: 'annual-reader',
      title: 'Annual Filing Analysis (10-K FY2024)',
      sectionNumber: 98,
      status: 'pass',
      confidence: 88,
      summary: 'Continued growth trajectory',
      narrative: 'FY2024 showed 11% revenue growth with margin expansion across all segments.',
      primarySourceInsights: ['Revenue grew 11%', 'Gross margin expanded to 38%'],
      redFlags: [],
    },
    {
      key: 'quarterly-reader',
      title: 'Quarterly Report Reader — Earnings Call Transcript Analysis',
      sectionNumber: 99,
      status: 'pass',
      confidence: 85,
      summary: 'Management raised guidance for FY2026',
      narrative: 'Q4 results show acceleration with same-store sales up 5.2%. Management raised full-year guidance.',
      primarySourceInsights: ['Same-store sales up 5.2%', 'Management raised guidance', 'New distribution center planned'],
      redFlags: [],
    },
  ];

  // Non-PSR sections that should be ignored by the filter
  const mockAnalysisSections = [
    { key: 'radar', title: 'Radar', sectionNumber: 1, status: 'pass', summary: 'Good radar', narrative: 'Analysis...', redFlags: [] },
    { key: 'market_position', title: 'Market Position', sectionNumber: 3, status: 'pass', summary: 'Strong position', narrative: 'Analysis...', redFlags: [] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    callOrder = [];

    dispatchAgent.mockImplementation((agentRole, dp, opts) => {
      callOrder.push({ agent: agentRole, opts });

      // Debate step mocks
      if (opts?.debateRole === 'bull') return Promise.resolve({ section: mockBullOutput(), usage: { inputTokens: 20000, outputTokens: 4000, cacheRead: 15000, cacheWrite: 5000, webSearches: 0, cost: 0.15 }, error: null });
      if (opts?.debateRole === 'bear') return Promise.resolve({ section: mockBearOutput(), usage: { inputTokens: 22000, outputTokens: 5000, cacheRead: 16000, cacheWrite: 5000, webSearches: 3, cost: 0.20 }, error: null });
      if (opts?.debateRole === 'bull_rebuttal') return Promise.resolve({ section: mockRebuttalOutput(), usage: { inputTokens: 25000, outputTokens: 3000, cacheRead: 18000, cacheWrite: 5000, webSearches: 0, cost: 0.14 }, error: null });
      if (opts?.debateRole === 'judge') return Promise.resolve({ section: mockJudgeOutput(), usage: { inputTokens: 30000, outputTokens: 4000, cacheRead: 20000, cacheWrite: 5000, webSearches: 0, cost: 0.18 }, error: null });
      if (agentRole === 'synthesis-writer' && opts?.sectionAssignment?.includes('Compose Section 6')) {
        return Promise.resolve({ section: { key: 'inversion_rebuttal', title: 'S6', sectionNumber: 6, status: 'pass', summary: 'Mock', redFlags: [] }, usage: { inputTokens: 35000, outputTokens: 8000, cacheRead: 25000, cacheWrite: 5000, webSearches: 0, cost: 0.30 }, error: null });
      }

      // Wave 1 parallel agents
      const sectionMap = { 'risk-analyst': 1, 'business-analyst': 2, 'competitor-evaluator': 3, 'management-evaluator': 4, 'valuation-specialist': 5 };
      const sectionNum = sectionMap[agentRole] || 1;
      return Promise.resolve({
        section: mockFullStorySection(agentRole, sectionNum),
        usage: { inputTokens: 20000, outputTokens: 3000, cacheRead: 15000, cacheWrite: 5000, webSearches: 1, cost: 0.12 },
        error: null,
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('PSR-1: fullStory reuses PSR sections from pitchDeckSections — does NOT dispatch annual-reader or quarterly-reader', async () => {
    const dataPacket = {
      ...mockDataPacket,
      pitchDeckSections: [...mockPsrSections, ...mockAnalysisSections],
      filingContent: { '10-K-2025-03-27': {}, '10-K-2024-03-21': {} },
    };

    await runPipeline('fullStory', dataPacket);

    const agentNames = callOrder.map(c => c.agent);
    expect(agentNames).not.toContain('annual-reader');
    expect(agentNames).not.toContain('quarterly-reader');
  });

  it('PSR-2: reused PSR sections flow through to downstream agents as formatted psrFindings', async () => {
    const dataPacket = {
      ...mockDataPacket,
      pitchDeckSections: [...mockPsrSections, ...mockAnalysisSections],
    };

    await runPipeline('fullStory', dataPacket);

    // Wave 1 agent should receive PSR findings containing the reused narrative text
    const wave1Call = callOrder.find(c => c.agent === 'risk-analyst' && !c.opts?.debateRole);
    expect(wave1Call).toBeDefined();
    expect(wave1Call.opts.psrFindings).toContain('Primary Source Reader Findings');
    expect(wave1Call.opts.psrFindings).toContain('revenue growth of 14%');
    expect(wave1Call.opts.psrFindings).toContain('Same-store sales up 5.2%');
  });

  it('PSR-3: budget does NOT record any PSR costs when reusing', async () => {
    const dataPacket = {
      ...mockDataPacket,
      pitchDeckSections: [...mockPsrSections, ...mockAnalysisSections],
    };

    const result = await runPipeline('fullStory', dataPacket);

    // No budget entries for PSR agents
    const psrEntries = result.budget.entries.filter(e =>
      e.agentRole?.includes('annual-reader') || e.agentRole?.includes('quarterly-reader')
    );
    expect(psrEntries).toHaveLength(0);
  });

  it('PSR-4: psrSummary contains reused-from-pitch-deck status entries', async () => {
    const dataPacket = {
      ...mockDataPacket,
      pitchDeckSections: [...mockPsrSections, ...mockAnalysisSections],
    };

    const result = await runPipeline('fullStory', dataPacket);

    // psrSummary is returned in the result
    expect(result.psrSummary).toBeDefined();
    expect(result.psrSummary.length).toBe(3);
    for (const entry of result.psrSummary) {
      expect(entry.status).toBe('reused-from-pitch-deck');
    }
  });

  it('PSR-5: fallback — when pitchDeckSections is empty, fullStory dispatches PSR agents normally', async () => {
    const dataPacket = {
      ...mockDataPacket,
      pitchDeckSections: [],
      filingContent: { '10-K-2025-03-27': { form: '10-K', sections: {} } },
    };

    await runPipeline('fullStory', dataPacket);

    const agentNames = callOrder.map(c => c.agent);
    expect(agentNames).toContain('annual-reader');
  });

  it('PSR-6: fallback — pitchDeck stage always dispatches PSR agents even with pitchDeckSections present', async () => {
    const dataPacket = {
      ...mockDataPacket,
      pitchDeckSections: [...mockPsrSections],
      filingContent: { '10-K-2025-03-27': { form: '10-K', sections: {} } },
    };

    await runPipeline('pitchDeck', dataPacket);

    const agentNames = callOrder.map(c => c.agent);
    expect(agentNames).toContain('annual-reader');
  });
});
