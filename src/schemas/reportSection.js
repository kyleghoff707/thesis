// Report Section Schemas for AI-generated investment research
// Zod v4.3 — toJSONSchema() available from "zod" import
// These schemas define the contract for all agent-produced report sections.
// Used by Claude structured outputs (output_config.format) and validation.
//
// NOTE: API-facing schemas use z.string() for flexible object fields (data, tables, charts).
// The agent serializes complex objects as JSON strings; the renderer JSON.parse()s them.
// This keeps the compiled grammar small enough to combine with tool schemas (web search).

import { z } from 'zod';

// Citation — references to DataPacket fields, filings, or external sources
export const CitationSchema = z.object({
  id: z.number(),
  ref: z.string(),      // DataPacket field path or document reference
  text: z.string(),      // The quoted text or value
  source: z.string(),    // "DataPacket", "10-K FY2024 p.34", URL, etc.
  url: z.string().optional(), // FMT-02: web search URL (optional — only populated for web search results)
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
  data: z.string(),                                          // JSON string — orchestrator parses after extraction
  narrative: z.string(),                                    // Buffett-style prose analysis
  citations: z.array(CitationSchema),
  tables: z.array(z.string()).optional().default([]),        // Each table is a JSON string: {"title","headers","rows","source?"}
  charts: z.array(z.string()).optional().default([]),        // Each chart is a JSON string: {"type","config","data"}
  redFlags: z.array(z.string()).min(1),                     // At least one, even for PASS verdicts
  primarySourceInsights: z.array(z.string()).optional().default([]),
  crossCuttingFindings: z.array(z.object({
    finding: z.string(),
    relevantAgents: z.array(z.string()),
    severity: z.enum(['high', 'medium', 'low']),
    source: z.string(),
  })).optional().default([]),
  questions: z.array(z.string()).optional().default([]),      // Questions for the PM
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
