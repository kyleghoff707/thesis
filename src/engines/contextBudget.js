// Context Budget — Token estimation and cost tracking for AI agent dispatch
// Records actual API usage fields per agent and aggregates costs.
// This is measurement infrastructure, not enforcement — it never blocks execution.
//
// estimateTokens() uses chars/4 approximation for pre-flight estimation.
// createBudgetTracker() records actual usage from API response (not character estimates).
// Cost calculation uses known Claude model pricing as of March 2026.

// Re-export shared pricing for backward compatibility
export { MODEL_PRICING, normalizeModel } from '../../packages/pricing/index.js';
import { MODEL_PRICING, normalizeModel } from '../../packages/pricing/index.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const CHARS_PER_TOKEN = 4;

// Estimate token count from text or character count
// Accepts a string (measures .length) or a number (character count directly)
export function estimateTokens(text) {
  if (!text) return 0;
  const charCount = typeof text === 'number' ? text : text.length;
  if (charCount === 0) return 0;
  return Math.ceil(charCount / CHARS_PER_TOKEN);
}

// Compute cost for a given token count and model
// Returns {input, output, cacheRead, cacheWrite, total} in dollars
// Optional cacheReadTokens and cacheWriteTokens for prompt caching costs
export function computeCost(inputTokens, outputTokens, model, cacheReadTokens = 0, cacheWriteTokens = 0) {
  const pricing = MODEL_PRICING[normalizeModel(model)];
  const inputCost = inputTokens * pricing.input / 1_000_000;
  const outputCost = outputTokens * pricing.output / 1_000_000;
  const cacheReadCost = cacheReadTokens * (pricing.cacheRead || 0) / 1_000_000;
  const cacheWriteCost = cacheWriteTokens * (pricing.cacheWrite || 0) / 1_000_000;
  return {
    input: inputCost,
    output: outputCost,
    cacheRead: cacheReadCost,
    cacheWrite: cacheWriteCost,
    total: inputCost + outputCost + cacheReadCost + cacheWriteCost,
  };
}

// Factory: create a budget tracker that records per-agent entries
// record() accepts an agent role string and the actual usage object from API response
// getSummary() aggregates all entries into totals
export function createBudgetTracker() {
  const entries = [];

  return {
    record(agentRole, usage) {
      entries.push({
        agentRole,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        cacheRead: usage.cacheRead || 0,
        cacheWrite: usage.cacheWrite || 0,
        webSearches: usage.webSearches || 0,
        cost: usage.cost || 0,
        timestamp: Date.now(),
      });
    },

    getSummary() {
      const totals = entries.reduce((acc, e) => ({
        inputTokens: acc.inputTokens + e.inputTokens,
        outputTokens: acc.outputTokens + e.outputTokens,
        cacheRead: acc.cacheRead + e.cacheRead,
        cacheWrite: acc.cacheWrite + e.cacheWrite,
        webSearches: acc.webSearches + e.webSearches,
        cost: acc.cost + e.cost,
      }), { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0, cost: 0 });

      return { entries: entries.slice(), totals };
    },
  };
}

// Format a budget summary as a human-readable string
export function formatBudgetReport(summary) {
  const lines = ['=== Token Budget Report ===', ''];

  for (const entry of summary.entries) {
    lines.push(`Agent: ${entry.agentRole}`);
    lines.push(`  Input: ${entry.inputTokens.toLocaleString()} tokens | Output: ${entry.outputTokens.toLocaleString()} tokens`);
    lines.push(`  Cache read: ${entry.cacheRead.toLocaleString()} tokens | Cache write: ${entry.cacheWrite.toLocaleString()} tokens`);
    lines.push(`  Web searches: ${entry.webSearches} | Cost: $${entry.cost.toFixed(4)}`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`Total input: ${summary.totals.inputTokens.toLocaleString()} | Total output: ${summary.totals.outputTokens.toLocaleString()}`);
  lines.push(`Total cache read: ${summary.totals.cacheRead.toLocaleString()} | Total cache write: ${summary.totals.cacheWrite.toLocaleString()}`);
  lines.push(`Total web searches: ${summary.totals.webSearches} | Total cost: $${summary.totals.cost.toFixed(4)}`);

  return lines.join('\n');
}

export const _testExports = { CHARS_PER_TOKEN, DEFAULT_MODEL };
