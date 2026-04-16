// Observatory Schemas — Zod v4.3
// Validates raw pipeline run data captured by observatoryCapture.js.
// These schemas define the contract for all observatory records:
// manifest.json, per-agent records, orchestrator log, and verdict checks.

import { z } from 'zod';

// ─── Per-Section Summary (lightweight, no full narrative) ─────────

export const SectionSummarySchema = z.object({
  key: z.string(),
  sectionNumber: z.number().optional(),
  verdict: z.enum(['PASS', 'FAIL', 'WATCHLIST']).nullable(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
  redFlagCount: z.number(),
  citationCount: z.number(),
  narrativeLength: z.number(),        // character count
  dataFieldCount: z.number().optional(),
  tableCount: z.number().optional(),
  chartCount: z.number().optional(),
  summaryPreview: z.string().optional(), // first ~100 chars of summary
});

// ─── Agent Record (one per agent per run) ────────────────────────

export const AgentRecordSchema = z.object({
  runId: z.string(),
  agentRole: z.string(),
  wave: z.number(),
  stage: z.string(),                   // onePager, pitchDeck, fullStory
  sectionsAssigned: z.array(z.number()),

  input: z.object({
    dataPacketSlice: z.array(z.string()),       // which DataPacket fields were sent
    dataPacketSliceSize: z.number().optional(),  // approx char count
    priorSectionKeys: z.array(z.string()),       // sections available from prior waves
    priorSectionsCount: z.number().optional(),
    psrFindingsLength: z.number().optional(),    // char count of PSR context
    model: z.string(),
    promptVersion: z.string().optional(),
  }),

  output: z.object({
    sectionsProduced: z.number(),
    sections: z.array(SectionSummarySchema),
  }),

  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheRead: z.number().optional(),
    cacheWrite: z.number().optional(),
    webSearches: z.number().optional(),
    cost: z.number(),                  // estimated USD
  }),

  timing: z.object({
    startedAt: z.string().optional(),  // ISO timestamp
    completedAt: z.string().optional(),
    durationSeconds: z.number(),
  }),

  qualitySignals: z.object({
    formatValid: z.boolean(),          // output parsed as valid JSON
    schemaValid: z.boolean(),          // output passed ReportSectionSchema
    requiredFieldsMissing: z.array(z.string()).optional(),
    keyNormalized: z.boolean().optional(), // had to remap key names
    retryCount: z.number(),
    retryReasons: z.array(z.string()).optional(),
    criticScores: z.record(z.string(), z.number()).optional(), // key -> score
  }),
});

// ─── Orchestrator Log ────────────────────────────────────────────

export const DispatchEventSchema = z.object({
  wave: z.number(),
  stage: z.string(),
  agents: z.array(z.string()),
  parallel: z.boolean(),
  dispatchedAt: z.string().optional(),
  completedAt: z.string().optional(),
  durationSeconds: z.number().optional(),
});

export const RetryEventSchema = z.object({
  agent: z.string(),
  wave: z.number(),
  stage: z.string().optional(),
  reason: z.string(),
  attempt: z.number(),
  resolved: z.boolean().optional(),
});

export const StallEventSchema = z.object({
  agent: z.string(),
  wave: z.number(),
  detectedAt: z.string(),
  durationSeconds: z.number(),
  resolution: z.string(),            // 'retry', 'skip', 'timeout'
});

export const FormatViolationSchema = z.object({
  agent: z.string(),
  wave: z.number().optional(),
  violation: z.string(),             // 'key_normalization', 'missing_json', 'schema_fail', etc.
  original: z.string().optional(),
  corrected: z.string().optional(),
  fixApplied: z.string().optional(),
});

export const OrchestratorLogSchema = z.object({
  runId: z.string(),
  dispatches: z.array(DispatchEventSchema),
  retries: z.array(RetryEventSchema),
  stallsDetected: z.array(StallEventSchema),
  formatViolations: z.array(FormatViolationSchema),
  dataGaps: z.array(z.string()),      // human-readable data quality issues
  gateDecisions: z.array(z.object({
    stage: z.string(),
    decision: z.enum(['approved', 'rejected', 'skipped']),
    reason: z.string().optional(),
  })).optional(),
});

// ─── Verdict Check ───────────────────────────────────────────────

export const VerdictCheckSchema = z.object({
  runId: z.string(),
  ticker: z.string(),
  expectedVerdict: z.enum(['BUY', 'WATCHLIST', 'PASS', 'FAIL']).nullable(),
  expectedSource: z.string().nullable(),  // 'known-verdicts.json' or null
  actualVerdict: z.string().nullable(),
  match: z.boolean().nullable(),          // null if no expected verdict
  stageVerdicts: z.record(z.string(), z.string()).optional(),  // stage -> verdict
  sectionVerdicts: z.record(z.string(), z.string()).optional(), // sectionKey -> verdict
  verdictDistribution: z.record(z.string(), z.number()).optional(),
});

// ─── Stage Result (for all-stages-combined runs) ─────────────────

export const StageResultSchema = z.object({
  verdict: z.string().nullable(),
  gate: z.enum(['approved', 'rejected', 'skipped']).nullable(),
  timeSeconds: z.number(),
  sectionsProduced: z.number().optional(),
  cost: z.number().optional(),
});

// ─── Run Manifest (top-level per-run record) ─────────────────────

export const RunManifestSchema = z.object({
  runId: z.string(),
  timestamp: z.string(),             // ISO start time
  completedAt: z.string().optional(),

  controlVariables: z.object({
    ticker: z.string(),
    stage: z.string(),               // 'onePager', 'pitchDeck', 'fullStory', 'all'
    stages: z.array(z.string()).optional(),  // for 'all' mode
    models: z.object({
      default: z.string(),
      overrides: z.record(z.string(), z.string()).optional(),
    }),
    promptVersions: z.record(z.string(), z.string()).optional(),
    waveOrder: z.array(z.number()).optional(),
    dataPacketHash: z.string(),
    dataPacketCaveats: z.array(z.string()).optional(),
  }),

  expectedVerdict: z.enum(['BUY', 'WATCHLIST', 'PASS', 'FAIL']).nullable(),
  actualVerdict: z.string().nullable(),
  verdictMatch: z.boolean().nullable(),

  stageResults: z.record(z.string(), StageResultSchema).optional(),

  pipelineMetrics: z.object({
    assemblyTimeSeconds: z.number().optional(),
    pipelineTimeSeconds: z.number().optional(),
    totalWallTimeSeconds: z.number(),
    totalCost: z.number(),
    totalInputTokens: z.number(),
    totalOutputTokens: z.number(),
    cacheHitRate: z.number().optional(),
    sectionsProduced: z.number(),
    sectionsExpected: z.number().optional(),
    errorsCount: z.number(),
  }),

  agentFiles: z.array(z.string()).optional(),  // relative paths to agent records
});

// ─── Log Event (for log.jsonl if we ever need structured parsing) ─

export const LogEventSchema = z.object({
  ts: z.string(),
  event: z.enum([
    'run_started', 'wave_complete', 'agent_complete',
    'format_violation', 'retry', 'stall_detected',
    'run_complete', 'wiki_updated', 'prompt_changed',
  ]),
  runId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
