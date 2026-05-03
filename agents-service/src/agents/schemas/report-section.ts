// Ported from src/schemas/reportSection.js (frontend) for use in agents-service.
// Shape is identical to the frontend Zod schema so runner output is wire-compatible
// with the existing v1 report renderer (which Brainstorm 3 will replace) and with
// observatory tooling that already understands this shape.

import { z } from 'zod';

// Citation — references to DataPacket fields, filings, or external sources.
export const CitationSchema = z.object({
  id: z.number(),
  ref: z.string(),
  text: z.string(),
  source: z.string(),
  url: z.string().url().optional(),
});

// Cross-cutting finding — observations relevant to other agents' sections.
// Shape matches the existing frontend schema (NOT the over-specified Brainstorm 1
// FindingSchema draft). See `gstack/design/agent-pipeline-cross-stage-decisions-20260503.md`
// "Schema correction" note in Decision 4.
export const CrossCuttingFindingSchema = z.object({
  finding: z.string(),
  relevantAgents: z.array(z.string()),
  severity: z.enum(['high', 'medium', 'low']),
  source: z.string(),
});

// ReportSection — a single section of an AI-generated report.
// Every section must have at least one red flag (KDD #12 — even PASS verdicts
// need at least one concern surfaced).
export const ReportSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  sectionNumber: z.number(),
  status: z.enum(['pass', 'fail', 'review', 'pending']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  verdict: z.enum(['PASS', 'FAIL', 'WATCHLIST']).nullable(),
  verdictRationale: z.string(),
  summary: z.string(),
  data: z.string(),
  narrative: z.string(),
  citations: z.array(CitationSchema),
  tables: z.array(z.string()).optional().default([]),
  charts: z.array(z.string()).optional().default([]),
  redFlags: z.array(z.string()).min(1),
  primarySourceInsights: z.array(z.string()).optional().default([]),
  crossCuttingFindings: z.array(CrossCuttingFindingSchema).optional().default([]),
  questions: z.array(z.string()).optional().default([]),
  modelUsed: z.string().optional(),
  tokenCost: z.object({ input: z.number(), output: z.number() }).optional(),
});

export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type CrossCuttingFinding = z.infer<typeof CrossCuttingFindingSchema>;

// MultiSection — used by agents that produce multiple sections in one call
// (e.g., Financial Analyst returns Sections 5 + 7 + 8; Business Analyst returns 1 + 2).
export const MultiSectionSchema = z.object({
  sections: z.array(ReportSectionSchema),
});

export type MultiSection = z.infer<typeof MultiSectionSchema>;
