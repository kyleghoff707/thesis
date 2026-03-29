// Context Budget — Token estimation and cost tracking for AI agent dispatch
// Measures character-based token estimates and aggregates per-agent costs.
// This is measurement infrastructure, not enforcement — it never blocks execution.
//
// Token estimation uses chars/4 approximation (Claude averages ~4 chars per token).
// Cost calculation uses known Claude model pricing as of March 2026.

// Claude model pricing in dollars per million tokens
// cacheRead/cacheWrite pricing per Anthropic's prompt caching docs
export const MODEL_PRICING = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-sonnet-4-6':        { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-4-6':          { input: 15.0, output: 75.0, cacheRead: 1.50, cacheWrite: 18.75 },
};

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
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
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
// record() accepts an agentRole string and a usage object from dispatchAgent
// Usage shape: { inputTokens, outputTokens, cacheRead, cacheWrite, webSearches, cost }
// getSummary() aggregates all entries into totals
export function createBudgetTracker() {
  const entries = [];

  return {
    record(agentRole, usage) {
      if (!usage) return;
      entries.push({
        agentRole,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        cacheRead: usage.cacheRead || 0,
        cacheWrite: usage.cacheWrite || 0,
        webSearches: usage.webSearches || 0,
        cost: usage.cost || 0,
      });
    },

    getSummary() {
      let totalInput = 0;
      let totalOutput = 0;
      let totalCacheRead = 0;
      let totalCacheWrite = 0;
      let totalWebSearches = 0;
      let totalCost = 0;

      for (const entry of entries) {
        totalInput += entry.inputTokens;
        totalOutput += entry.outputTokens;
        totalCacheRead += entry.cacheRead;
        totalCacheWrite += entry.cacheWrite;
        totalWebSearches += entry.webSearches;
        totalCost += entry.cost;
      }

      return {
        entries: entries.slice(),
        totals: {
          inputTokens: totalInput,
          outputTokens: totalOutput,
          cacheRead: totalCacheRead,
          cacheWrite: totalCacheWrite,
          webSearches: totalWebSearches,
          cost: totalCost,
        },
      };
    },
  };
}

// Format a budget summary as a human-readable string
export function formatBudgetReport(summary) {
  const lines = ['=== Token Budget Report ===', ''];

  for (const entry of summary.entries) {
    lines.push(`Agent: ${entry.agentRole}`);
    lines.push(`  Input: ~${entry.inputTokens.toLocaleString()} tokens | Output: ~${entry.outputTokens.toLocaleString()} tokens`);
    lines.push(`  Cache: read=${entry.cacheRead.toLocaleString()} write=${entry.cacheWrite.toLocaleString()}`);
    lines.push(`  Cost: $${entry.cost.toFixed(4)}`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`Total: ~${summary.totals.inputTokens.toLocaleString()} input | ~${summary.totals.outputTokens.toLocaleString()} output`);
  lines.push(`Cache: read=${summary.totals.cacheRead.toLocaleString()} | write=${summary.totals.cacheWrite.toLocaleString()}`);
  lines.push(`Web searches: ${summary.totals.webSearches}`);
  lines.push(`Total cost: $${summary.totals.cost.toFixed(4)}`);

  return lines.join('\n');
}

export const _testExports = { CHARS_PER_TOKEN, DEFAULT_MODEL };
