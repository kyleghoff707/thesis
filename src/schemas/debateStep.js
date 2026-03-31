// Debate Step Schemas for adversarial debate (4-step Bull/Bear/Rebuttal/Judge)
// Zod v4.3 — separate schemas per role for cleaner structured output enforcement
// Per D-05: debate steps return DebateStepSchema, not ReportSectionSchema.
// Translated from agents/orchestrator/schemas/debate-step.schema.json

import { z } from 'zod';

// ─── Step 1: Bull Thesis ───────────────────────────────────────

export const BullThesisSchema = z.object({
  step: z.literal(1),
  role: z.literal('bull'),
  agent: z.string(),
  content: z.object({
    thesisPoints: z.array(z.object({
      point: z.string(),
      evidence: z.string(),
      sourceSection: z.string(),
    })).min(5),
    overallThesis: z.string(),
  }),
});

// ─── Step 2: Bear Inversion ───────────────────────────────────

export const BearInversionSchema = z.object({
  step: z.literal(2),
  role: z.literal('bear'),
  agent: z.string(),
  content: z.object({
    inversions: z.array(z.object({
      targetPoint: z.string(),
      counterArgument: z.string(),
      evidence: z.string(),
      severity: z.enum(['thesis_killer', 'significant', 'minor']),
      sources: z.array(z.string()).optional().default([]),
    })).min(1),
    overallBearCase: z.string(),
  }),
});

// ─── Step 3: Bull Rebuttal ────────────────────────────────────

export const BullRebuttalSchema = z.object({
  step: z.literal(3),
  role: z.literal('bull_rebuttal'),
  agent: z.string(),
  content: z.object({
    rebuttals: z.array(z.object({
      bearPoint: z.string(),
      rebuttal: z.string(),
      rebuttalStrength: z.enum(['strong', 'moderate', 'weak']),
      honest: z.boolean(),
    })).min(1),
  }),
});

// ─── Step 4: Judge Verdict ────────────────────────────────────

export const JudgeVerdictSchema = z.object({
  step: z.literal(4),
  role: z.literal('judge'),
  agent: z.string(),
  content: z.object({
    exchanges: z.array(z.object({
      topic: z.string(),
      bullStrength: z.enum(['strong', 'moderate', 'weak']),
      bearStrength: z.enum(['strong', 'moderate', 'weak']),
      verdict: z.enum(['Strong Bull', 'Strong Bear', 'Unresolved']),
      reasoning: z.string(),
    })).min(1),
    overallVerdict: z.object({
      direction: z.enum(['Bull', 'Bear', 'Mixed']),
      unresolvedCount: z.number(),
      summary: z.string(),
      investmentImplication: z.string(),
    }),
  }),
});

// ─── Role-to-Schema lookup map ────────────────────────────────

export const DEBATE_SCHEMAS = {
  bull: BullThesisSchema,
  bear: BearInversionSchema,
  bull_rebuttal: BullRebuttalSchema,
  judge: JudgeVerdictSchema,
};
