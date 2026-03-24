// DataPacket schema — validates canonical data snapshot from all engines
// Uses Zod v4 for schema definition and validation
// Created by Plan 05A-03 (blocking dependency from Plan 05A-01)

import { z } from 'zod/v4';

// Loose validation schema — DataPacket fields vary by company data availability
// Uses .passthrough() so extra fields don't cause validation failures
// Zod v4 requires explicit key type for z.record()
const looseObj = z.record(z.string(), z.unknown());

export const DataPacketSchema = z.object({
  ticker: z.string(),
  companyInfo: looseObj.optional(),
  classification: looseObj.optional(),
  currentPrice: z.number().nullable().optional(),
  financials: looseObj.optional(),
  ttm: looseObj.optional(),
  growthRates: looseObj.optional(),
  returnMetrics: looseObj.optional(),
  debtMetrics: looseObj.optional(),
  fcf: looseObj.optional(),
  keyMetrics: looseObj.optional(),
  ruleOneScore: looseObj.optional(),
  gurus: looseObj.nullable().optional(),
  insiders: looseObj.nullable().optional(),
  compensation: looseObj.nullable().optional(),
  peers: looseObj.nullable().optional(),
  peerMetrics: looseObj.nullable().optional(),
  analystEstimates: looseObj.nullable().optional(),
  events: looseObj.nullable().optional(),
  prices: looseObj.nullable().optional(),
  transcriptAvailability: looseObj.nullable().optional(),
  caveats: z.array(z.string()).optional().default([]),
  assembledAt: z.string(),
}).passthrough();

/**
 * Slice a full DataPacket to only the fields an agent needs.
 * Always includes: ticker, companyInfo, classification, caveats.
 * @param {object} fullPacket - Complete DataPacket
 * @param {object} agentConfig - Agent config with dataPacketSlice: string[]
 * @returns {object} Filtered DataPacket
 */
export function sliceDataPacket(fullPacket, agentConfig) {
  const alwaysInclude = ['ticker', 'companyInfo', 'classification', 'caveats'];
  const requestedFields = agentConfig?.dataPacketSlice || [];
  const allFields = [...new Set([...alwaysInclude, ...requestedFields])];

  const sliced = {};
  for (const field of allFields) {
    if (field in fullPacket) {
      sliced[field] = fullPacket[field];
    }
  }
  return sliced;
}
