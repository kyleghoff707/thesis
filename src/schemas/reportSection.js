// Report Section Schemas for AI-generated investment research
// Zod v4.3 — toJSONSchema() available from "zod" import
// These schemas define the contract for all agent-produced report sections.
// Used by Claude structured outputs (output_config.format) and validation.
//
// NOTE: Uses z.looseObject({}) instead of z.record(z.unknown()) for flexible
// object fields — both accept arbitrary keys, but z.looseObject is compatible
// with z.toJSONSchema() in Zod v4.

import { z } from 'zod';

// Citation — references to DataPacket fields, filings, or external sources
export const CitationSchema = z.object({
  id: z.number(),
  ref: z.string(),      // DataPacket field path or document reference
  text: z.string(),      // The quoted text or value
  source: z.string(),    // "DataPacket", "10-K FY2024 p.34", URL, etc.
});

// Table — structured data tables within a report section
export const TableSchema = z.object({
  title: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
  source: z.string().optional(),
});

// Chart — visualization config for PDF rendering
export const ChartSchema = z.object({
  type: z.string(),
  config: z.looseObject({}),
  data: z.array(z.looseObject({})),
});

// ReportSection — a single section of an AI-generated report
// Every section must have at least one red flag (KDD #12)
export const ReportSectionSchema = z.object({
  key: z.string(),                                          // e.g., "fcf", "radar", "pest"
  title: z.string(),                                        // e.g., "Free Cash Flow"
  sectionNumber: z.number(),
  status: z.enum(['pass', 'fail', 'review', 'pending']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  verdict: z.enum(['PASS', 'FAIL', 'WATCHLIST']).nullable(),
  verdictRationale: z.string(),
  summary: z.string(),                                      // 1-2 sentences for downstream agents
  data: z.looseObject({}),                                  // Section-specific structured data (flexible)
  narrative: z.string(),                                    // Buffett-style prose analysis
  citations: z.array(CitationSchema),
  tables: z.array(TableSchema).optional().default([]),
  charts: z.array(ChartSchema).optional().default([]),
  redFlags: z.array(z.string()).min(1),                     // At least one, even for PASS verdicts
  primarySourceInsights: z.array(z.string()).optional().default([]),
  generatedAt: z.string(),                                  // ISO timestamp
  modelUsed: z.string(),                                    // e.g., "claude-sonnet-4-6"
  tokenCost: z.object({ input: z.number(), output: z.number() }),
});

// StageReport — wraps sections into a stage (nests INSIDE existing report model)
// e.g., report.onePager = { sections: [...], overallVerdict: "PASS", ... }
export const StageReportSchema = z.object({
  sections: z.array(ReportSectionSchema),
  overallVerdict: z.enum(['PASS', 'FAIL', 'WATCHLIST']).nullable(),
  generatedAt: z.string(),
  totalTokenCost: z.object({ input: z.number(), output: z.number() }),
  checkpoints: z.array(z.object({
    phase: z.number(),
    status: z.enum(['approved', 'waiting', 'rejected']),
    userInput: z.looseObject({}).optional(),
    timestamp: z.string().optional(),
  })).optional().default([]),
});

// Returns JSON Schema suitable for Claude API output_config.format
export function getReportSectionJSONSchema() {
  return z.toJSONSchema(ReportSectionSchema);
}
