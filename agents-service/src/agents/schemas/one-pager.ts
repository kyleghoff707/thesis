import { z } from 'zod';
import { ReportSectionSchema } from './report-section.js';

export const OnePagerOutputSchema = z.object({
  ticker: z.string().min(1),
  companyName: z.string().min(1),
  generatedAt: z.string().datetime(),
  overallVerdict: z.enum(['PASS', 'FAIL', 'WATCHLIST']),
  overallRationale: z.string(),
  sections: z.array(ReportSectionSchema).min(1),
});

export type OnePagerOutput = z.infer<typeof OnePagerOutputSchema>;
