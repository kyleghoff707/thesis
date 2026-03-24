// DataPacket Schema — canonical JSON structure for all engine output
// Zod v4.3 — loose validation with passthrough() for extensibility
// Each agent receives a sliced view of the full DataPacket via sliceDataPacket()
//
// NOTE: Uses z.looseObject({}) instead of z.record(z.unknown()) for flexible
// object fields — Zod v4 z.record() requires explicit (keySchema, valueSchema).

import { z } from 'zod';

// DataPacket — the complete data payload assembled from all engines
// Uses .passthrough() so extra fields don't cause validation failures
export const DataPacketSchema = z.object({
  ticker: z.string(),
  companyInfo: z.looseObject({}).optional(),
  classification: z.looseObject({}).optional(),
  currentPrice: z.number().nullable().optional(),
  financials: z.looseObject({}).optional(),
  ttm: z.looseObject({}).optional(),
  growthRates: z.looseObject({}).optional(),
  returnMetrics: z.looseObject({}).optional(),
  debtMetrics: z.looseObject({}).optional(),
  fcf: z.looseObject({}).optional(),
  keyMetrics: z.looseObject({}).optional(),
  ruleOneScore: z.looseObject({}).optional(),
  gurus: z.looseObject({}).nullable().optional(),
  insiders: z.looseObject({}).nullable().optional(),
  compensation: z.looseObject({}).nullable().optional(),
  peers: z.looseObject({}).nullable().optional(),
  peerMetrics: z.looseObject({}).nullable().optional(),
  analystEstimates: z.looseObject({}).nullable().optional(),
  events: z.looseObject({}).nullable().optional(),
  prices: z.looseObject({}).nullable().optional(),
  transcriptAvailability: z.looseObject({}).nullable().optional(),
  caveats: z.array(z.string()).optional().default([]),
  assembledAt: z.string(),
}).passthrough();

// Always-included fields in every DataPacket slice (DATA-04)
const ALWAYS_INCLUDED = ['ticker', 'companyInfo', 'classification', 'caveats'];

// Slice a full DataPacket to only the fields an agent needs
// agentConfig.dataPacketSlice: string[] of field names the agent requires
// Always includes ticker, companyInfo, classification, caveats regardless of config
export function sliceDataPacket(fullPacket, agentConfig) {
  if (!fullPacket || !agentConfig?.dataPacketSlice) return fullPacket;

  const slice = {};

  // Always include core fields
  for (const key of ALWAYS_INCLUDED) {
    if (key in fullPacket) {
      slice[key] = fullPacket[key];
    }
  }

  // Include requested fields
  for (const key of agentConfig.dataPacketSlice) {
    if (key in fullPacket) {
      slice[key] = fullPacket[key];
    }
  }

  return slice;
}
