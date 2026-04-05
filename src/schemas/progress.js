// Generation State Schema — tracks the progress of AI report generation
// Zod v4.3 — validates the state machine for generation progress
// Used by orchestrator to track which sections are complete, running, or failed
//
// NOTE: Zod v4 requires z.record(keySchema, valueSchema) — single-arg z.record(schema)
// treats the arg as the key schema. Always pass z.string() as first arg for string-keyed records.

import { z } from 'zod';

// ProgressSchema — the state machine for a single stage generation run
export const ProgressSchema = z.object({
  ticker: z.string(),
  stage: z.enum(['onePager', 'pitchDeck', 'fullStory']),
  state: z.enum([
    'IDLE', 'DATA_ASSEMBLY', 'PRIMARY_SOURCE_READING',
    'WAVE_1_RUNNING', 'WAVE_2_RUNNING', 'WAVE_3_RUNNING',
    'SYNTHESIS', 'QUALITY_CHECK', 'COMPLETE',
  ]),
  startedAt: z.string(),
  lastUpdated: z.string(),
  sections: z.record(z.string(), z.object({
    status: z.enum(['complete', 'running', 'pending', 'failed']),
    agentRole: z.string().optional(),
    tokenCost: z.object({ input: z.number(), output: z.number() }).optional(),
    error: z.string().optional(),
  })),
  checkpoints: z.array(z.object({
    phase: z.number(),
    status: z.enum(['approved', 'waiting', 'rejected']),
    userInput: z.looseObject({}).optional(),
    timestamp: z.string().optional(),
  })),
  errors: z.array(z.string()),
  totalCost: z.object({ input: z.number(), output: z.number() }),
});

// Create an initial progress object with all sections set to "pending"
// ticker: string, stage: "onePager"|"pitchDeck"|"fullStory", sectionKeys: string[]
export function createInitialProgress(ticker, stage, sectionKeys) {
  const now = new Date().toISOString();
  const sections = {};
  for (const key of sectionKeys) {
    sections[key] = { status: 'pending' };
  }
  return {
    ticker,
    stage,
    state: 'IDLE',
    startedAt: now,
    lastUpdated: now,
    sections,
    checkpoints: [],
    errors: [],
    totalCost: { input: 0, output: 0 },
  };
}
