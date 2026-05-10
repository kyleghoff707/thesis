// Tests for DebateStepSchema — 4 role-specific Zod schemas + DEBATE_SCHEMAS lookup map
// Validates against SFM-derived debate step fixtures (inline, from real SFM debate output)
// Covers: parse success with real data, rejection of invalid/missing fields, DEBATE_SCHEMAS map

import { describe, it, expect } from 'vitest';
import {
  BullThesisSchema,
  BearInversionSchema,
  BullRebuttalSchema,
  JudgeVerdictSchema,
  DEBATE_SCHEMAS,
} from '../debateStep.js';

// ─── Fixtures (derived from real SFM debate-step-*.json) ────────

const bullFixture = {
  step: 1,
  role: 'bull',
  agent: 'synthesis-writer',
  content: {
    thesisPoints: [
      { point: 'SFM is the only publicly traded pure-play in the fastest-growing segment', evidence: 'U.S. organic food sales reached $76.6B in 2025', sourceSection: 'S2: Meaning Checklist' },
      { point: '12-year track record of structural margin expansion from 29% to 38.8%', evidence: 'Gross margin expanded from ~29% (FY2013) to 38.8% (FY2025)', sourceSection: 'S3: Moat Checklist' },
      { point: 'CEO Sinclair has delivered one of the strongest operational turnarounds', evidence: 'Operating income grew from $212M to $686M (+224%)', sourceSection: 'S4: Management Checklist' },
      { point: 'Growth ceiling analysis proves SFM can triple its store count to 1,400', evidence: 'SFM operates 477 stores against a CEO-stated target of 1,400', sourceSection: 'S5: Valuation Confirmation' },
      { point: 'The stock has declined 58% from its 2025 peak', evidence: 'SFM trades at $78.14 against a composite buy range of $27-$77', sourceSection: 'S5: Valuation Confirmation' },
      { point: 'The FY2025 earnings miss represents a textbook value investing event', evidence: 'FY2025 delivered $8.81B revenue (+14.1%), $524M net income', sourceSection: 'S1: Event Analysis' },
      { point: 'SFM secular tailwinds are structural and multi-decade', evidence: 'Organic food market growing at 10.8-12.2% CAGR through 2034', sourceSection: 'S2: Meaning Checklist' },
    ],
    overallThesis: 'Sprouts Farmers Market is a wonderful company experiencing a textbook value investing event. The business is simple to understand and has delivered extraordinary results.',
  },
};

const bearFixture = {
  step: 2,
  role: 'bear',
  agent: 'risk-analyst',
  content: {
    inversions: [
      {
        targetPoint: 'SFM is the only publicly traded pure-play',
        counterArgument: 'The only pure-play argument is a liquidity premium, not a moat',
        evidence: 'Amazon announced closure of all Amazon Fresh stores, making Whole Foods its sole physical grocery brand',
        severity: 'significant',
        sources: ['https://www.wholefoodsmagazine.com/articles/retail-insights-2026'],
      },
      {
        targetPoint: 'CEO Sinclair has delivered one of the strongest operational turnarounds',
        counterArgument: 'Zero open-market purchases across 5+ years. All 9 C-suite officers sold in a 10-day window.',
        evidence: 'DataPacket insiders: 18 open-market sellers, 2 buyers, net value -$31.5M',
        severity: 'thesis_killer',
        sources: ['https://www.investing.com/news/insider-trading-news/sprouts-ceo-sells'],
      },
      {
        targetPoint: 'Margin expansion from 29% to 38.8%',
        counterArgument: 'Q4 FY2025 gross margin was 38.0%, DOWN 10 basis points YoY',
        evidence: 'Management guided for gross margin normalization beginning in Q2 2025',
        severity: 'significant',
        sources: [],
      },
    ],
    overallBearCase: 'The SFM bull thesis is built on a foundation of rear-view-mirror metrics. The thesis has two fatal vulnerabilities: management credibility and competitive moat erosion.',
  },
};

const rebuttalFixture = {
  step: 3,
  role: 'bull_rebuttal',
  agent: 'synthesis-writer',
  content: {
    rebuttals: [
      { bearPoint: 'The only pure-play argument is a liquidity premium', rebuttal: 'SFM grew revenue 14.1% in FY2025 versus the organic market\'s 6.8% growth rate', rebuttalStrength: 'strong', honest: false },
      { bearPoint: 'Zero open-market CEO purchases across 5+ years', rebuttal: 'The insider selling pattern is the bear\'s strongest point. Item 9 rated FAIL.', rebuttalStrength: 'weak', honest: true },
      { bearPoint: 'Margin expansion has peaked', rebuttal: 'One quarter of 10 bps compression after 980+ bps of cumulative expansion is noise', rebuttalStrength: 'moderate', honest: false },
    ],
  },
};

const judgeFixture = {
  step: 4,
  role: 'judge',
  agent: 'financial-analyst',
  content: {
    exchanges: [
      { topic: 'Pure-play positioning and addressable market', bullStrength: 'strong', bearStrength: 'moderate', verdict: 'Strong Bull', reasoning: 'SFM grew revenue 14.1% vs market 6.8% — gaining share, not losing it.' },
      { topic: 'Management quality and insider alignment', bullStrength: 'weak', bearStrength: 'strong', verdict: 'Strong Bear', reasoning: 'Zero open-market CEO purchases across 5+ years. All 9 C-suite officers selling.' },
      { topic: 'Margin sustainability and competitive pressure', bullStrength: 'moderate', bearStrength: 'moderate', verdict: 'Unresolved', reasoning: 'Q4 10 bps compression — noise or trend reversal? Cannot be resolved until Q1-Q2 2026.' },
      { topic: 'Current valuation and margin of safety', bullStrength: 'weak', bearStrength: 'strong', verdict: 'Strong Bear', reasoning: 'At $78.14, SFM trades above composite buy range ceiling of $77. MOS buy price is ~$40.' },
      { topic: 'Growth ceiling and 1,400-store target', bullStrength: 'moderate', bearStrength: 'moderate', verdict: 'Unresolved', reasoning: 'Three chains expanding into same whitespace. Neither side can prove outcome.' },
    ],
    overallVerdict: {
      direction: 'Mixed',
      unresolvedCount: 2,
      summary: 'The debate produced a genuinely mixed outcome: 1 Strong Bull, 2 Strong Bear, and 2 Unresolved exchanges.',
      investmentImplication: 'SFM is a WATCHLIST position, not a BUY and not a REJECT.',
    },
  },
};

// ─── BullThesisSchema ──────────────────────────────────────────

describe('BullThesisSchema', () => {
  it('parses real SFM debate-step-1 fixture successfully', () => {
    const result = BullThesisSchema.safeParse(bullFixture);
    expect(result.success).toBe(true);
    expect(result.data.step).toBe(1);
    expect(result.data.role).toBe('bull');
    expect(result.data.agent).toBe('synthesis-writer');
    expect(result.data.content.thesisPoints.length).toBeGreaterThanOrEqual(5);
    expect(typeof result.data.content.overallThesis).toBe('string');
  });

  it('rejects object missing thesisPoints', () => {
    const invalid = {
      step: 1,
      role: 'bull',
      agent: 'synthesis-writer',
      content: { overallThesis: 'Some thesis' },
    };
    const result = BullThesisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('enforces z.literal(1) for step', () => {
    const wrongStep = { ...bullFixture, step: 2 };
    const result = BullThesisSchema.safeParse(wrongStep);
    expect(result.success).toBe(false);
  });

  it('enforces z.literal("bull") for role', () => {
    const wrongRole = { ...bullFixture, role: 'bear' };
    const result = BullThesisSchema.safeParse(wrongRole);
    expect(result.success).toBe(false);
  });

  it('rejects fewer than 5 thesis points', () => {
    const tooFew = {
      ...bullFixture,
      content: {
        ...bullFixture.content,
        thesisPoints: bullFixture.content.thesisPoints.slice(0, 4),
      },
    };
    const result = BullThesisSchema.safeParse(tooFew);
    expect(result.success).toBe(false);
  });
});

// ─── BearInversionSchema ───────────────────────────────────────

describe('BearInversionSchema', () => {
  it('parses real SFM debate-step-2 fixture successfully', () => {
    const result = BearInversionSchema.safeParse(bearFixture);
    expect(result.success).toBe(true);
    expect(result.data.step).toBe(2);
    expect(result.data.role).toBe('bear');
    expect(result.data.agent).toBe('risk-analyst');
    expect(result.data.content.inversions.length).toBeGreaterThanOrEqual(1);
    expect(typeof result.data.content.overallBearCase).toBe('string');
  });

  it('rejects inversion with invalid severity value', () => {
    const invalid = {
      step: 2,
      role: 'bear',
      agent: 'risk-analyst',
      content: {
        inversions: [{
          targetPoint: 'Some point',
          counterArgument: 'Counter',
          evidence: 'Evidence',
          severity: 'catastrophic', // invalid
          sources: [],
        }],
        overallBearCase: 'Bear case',
      },
    };
    const result = BearInversionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('enforces severity enum: thesis_killer, significant, minor', () => {
    for (const severity of ['thesis_killer', 'significant', 'minor']) {
      const valid = {
        step: 2,
        role: 'bear',
        agent: 'risk-analyst',
        content: {
          inversions: [{
            targetPoint: 'Point',
            counterArgument: 'Counter',
            evidence: 'Evidence',
            severity,
          }],
          overallBearCase: 'Bear case',
        },
      };
      const result = BearInversionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    }
  });

  it('defaults sources to empty array when not provided', () => {
    const withoutSources = {
      step: 2,
      role: 'bear',
      agent: 'risk-analyst',
      content: {
        inversions: [{
          targetPoint: 'Point',
          counterArgument: 'Counter',
          evidence: 'Evidence',
          severity: 'minor',
        }],
        overallBearCase: 'Bear case',
      },
    };
    const result = BearInversionSchema.safeParse(withoutSources);
    expect(result.success).toBe(true);
    expect(result.data.content.inversions[0].sources).toEqual([]);
  });
});

// ─── BullRebuttalSchema ────────────────────────────────────────

describe('BullRebuttalSchema', () => {
  it('parses real SFM debate-step-3 fixture successfully', () => {
    const result = BullRebuttalSchema.safeParse(rebuttalFixture);
    expect(result.success).toBe(true);
    expect(result.data.step).toBe(3);
    expect(result.data.role).toBe('bull_rebuttal');
    expect(result.data.agent).toBe('synthesis-writer');
    expect(result.data.content.rebuttals.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces rebuttalStrength enum: strong, moderate, weak', () => {
    const invalid = {
      step: 3,
      role: 'bull_rebuttal',
      agent: 'synthesis-writer',
      content: {
        rebuttals: [{
          bearPoint: 'Point',
          rebuttal: 'Rebuttal',
          rebuttalStrength: 'devastating', // invalid
          honest: false,
        }],
      },
    };
    const result = BullRebuttalSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('requires honest boolean on each rebuttal', () => {
    const result = BullRebuttalSchema.safeParse(rebuttalFixture);
    expect(result.success).toBe(true);
    result.data.content.rebuttals.forEach(r => {
      expect(typeof r.honest).toBe('boolean');
    });
  });
});

// ─── JudgeVerdictSchema ────────────────────────────────────────

describe('JudgeVerdictSchema', () => {
  it('parses real SFM debate-step-4 fixture successfully', () => {
    const result = JudgeVerdictSchema.safeParse(judgeFixture);
    expect(result.success).toBe(true);
    expect(result.data.step).toBe(4);
    expect(result.data.role).toBe('judge');
    expect(result.data.agent).toBe('financial-analyst');
    expect(result.data.content.exchanges.length).toBeGreaterThanOrEqual(1);
    expect(result.data.content.overallVerdict.direction).toBe('Mixed');
    expect(typeof result.data.content.overallVerdict.unresolvedCount).toBe('number');
    expect(typeof result.data.content.overallVerdict.summary).toBe('string');
    expect(typeof result.data.content.overallVerdict.investmentImplication).toBe('string');
  });

  it('rejects exchange with invalid verdict value', () => {
    const invalid = {
      step: 4,
      role: 'judge',
      agent: 'financial-analyst',
      content: {
        exchanges: [{
          topic: 'Some topic',
          bullStrength: 'strong',
          bearStrength: 'moderate',
          verdict: 'Tie', // invalid — must be Strong Bull, Strong Bear, or Unresolved
          reasoning: 'Some reasoning',
        }],
        overallVerdict: {
          direction: 'Bull',
          unresolvedCount: 0,
          summary: 'Summary',
          investmentImplication: 'Implication',
        },
      },
    };
    const result = JudgeVerdictSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('enforces verdict enum: Strong Bull, Strong Bear, Unresolved', () => {
    for (const verdict of ['Strong Bull', 'Strong Bear', 'Unresolved']) {
      const valid = {
        step: 4,
        role: 'judge',
        agent: 'financial-analyst',
        content: {
          exchanges: [{
            topic: 'Topic',
            bullStrength: 'strong',
            bearStrength: 'weak',
            verdict,
            reasoning: 'Reasoning',
          }],
          overallVerdict: {
            direction: 'Bull',
            unresolvedCount: 0,
            summary: 'Summary',
            investmentImplication: 'Implication',
          },
        },
      };
      const result = JudgeVerdictSchema.safeParse(valid);
      expect(result.success).toBe(true);
    }
  });

  it('enforces direction enum: Bull, Bear, Mixed', () => {
    const invalid = {
      step: 4,
      role: 'judge',
      agent: 'financial-analyst',
      content: {
        exchanges: [{
          topic: 'Topic',
          bullStrength: 'strong',
          bearStrength: 'weak',
          verdict: 'Strong Bull',
          reasoning: 'Reasoning',
        }],
        overallVerdict: {
          direction: 'Neutral', // invalid
          unresolvedCount: 0,
          summary: 'Summary',
          investmentImplication: 'Implication',
        },
      },
    };
    const result = JudgeVerdictSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ─── DEBATE_SCHEMAS map ────────────────────────────────────────

describe('DEBATE_SCHEMAS', () => {
  it('maps bull to BullThesisSchema', () => {
    expect(DEBATE_SCHEMAS.bull).toBe(BullThesisSchema);
  });

  it('maps bear to BearInversionSchema', () => {
    expect(DEBATE_SCHEMAS.bear).toBe(BearInversionSchema);
  });

  it('maps bull_rebuttal to BullRebuttalSchema', () => {
    expect(DEBATE_SCHEMAS.bull_rebuttal).toBe(BullRebuttalSchema);
  });

  it('maps judge to JudgeVerdictSchema', () => {
    expect(DEBATE_SCHEMAS.judge).toBe(JudgeVerdictSchema);
  });

  it('contains exactly 4 entries', () => {
    expect(Object.keys(DEBATE_SCHEMAS)).toHaveLength(4);
  });
});
