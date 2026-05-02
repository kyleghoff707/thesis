import { z } from 'zod';

export const CitationSchema = z.object({
  id: z.number().int().min(1),
  ref: z.string(),
  text: z.string(),
  source: z.string(),
});

export const ReportSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  status: z.enum(['pass', 'fail', 'review', 'pending']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  summary: z.string(),
  narrative: z.string(),
  citations: z.array(CitationSchema).default([]),
  redFlags: z.array(z.string()).default([]),
});

export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type Citation = z.infer<typeof CitationSchema>;
