// OnePager Output Schema — Zod schema for single-call One Pager generation
// Optimized for a single Claude Sonnet call that produces all 6 sections at once.
// Maps cleanly to the existing 6-section output format for PDF generator backward compatibility.

import { z } from 'zod';

// Concise section — lighter than full ReportSectionSchema
const OnePagerSectionSchema = z.object({
  verdict: z.enum(['PASS', 'FAIL', 'WATCHLIST']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  verdictRationale: z.string(),  // 1-2 sentences why
  summary: z.string(),           // 2-3 sentences
  narrative: z.string(),         // 1-3 short paragraphs (concise! this is a one pager)
  redFlags: z.array(z.string()).min(1),
  citations: z.array(z.object({
    id: z.number(),
    ref: z.string(),
    text: z.string(),
    source: z.string(),
  })),
});

export const OnePagerOutputSchema = z.object({
  company_info: OnePagerSectionSchema,
  minimum_standards: OnePagerSectionSchema,
  meaning: OnePagerSectionSchema,
  growth_metrics: OnePagerSectionSchema,
  valuation_summary: OnePagerSectionSchema,
  overall_verdict: OnePagerSectionSchema,
});
