// Report Section Schemas for AI-generated investment research
// Zod v4.3 — toJSONSchema() available from "zod" import
// These schemas define the contract for all agent-produced report sections.
// Used by Claude structured outputs (output_config.format) and validation.
//
// NOTE: API-facing schemas use z.string() for flexible object fields (data, config).
// The agent serializes as JSON strings; the orchestrator JSON.parse()s after extraction.
// Internal schemas (StageReportSchema) keep z.looseObject({}) — never sent to API.

import { z } from 'zod';

// Citation — references to DataPacket fields, filings, or external sources
export const CitationSchema = z.object({
  id: z.number(),
  ref: z.string(),      // DataPacket field path or document reference
  text: z.string(),      // The quoted text or value
  source: z.string(),    // "DataPacket", "10-K FY2024 p.34", URL, etc.
  url: z.string().optional(), // FMT-02: web search URL (optional — only populated for web search results)
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
  config: z.string(),              // JSON string — orchestrator parses after extraction
  data: z.array(z.string()),       // JSON strings — each data point serialized
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
  data: z.string(),                                          // JSON string — orchestrator parses after extraction (per D-01)
  narrative: z.string(),                                    // Buffett-style prose analysis
  citations: z.array(CitationSchema),
  tables: z.array(TableSchema).optional().default([]),
  charts: z.array(ChartSchema).optional().default([]),
  redFlags: z.array(z.string()).min(1),                     // At least one, even for PASS verdicts
  primarySourceInsights: z.array(z.string()).optional().default([]),
  crossCuttingFindings: z.array(z.object({
    finding: z.string(),                                     // What was discovered
    relevantAgents: z.array(z.string()),                     // Which other agents should see this
    severity: z.enum(['high', 'medium', 'low']),             // How important for overall thesis
    source: z.string(),                                      // Where this came from
  })).optional().default([]),
  searchesPerformed: z.array(z.object({
    query: z.string(),                                       // The search query executed
    resultCount: z.number(),                                 // Number of results returned
    usedInSection: z.boolean(),                              // Whether findings were incorporated
  })).optional().default([]),
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
