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
// record() accepts raw character counts (strings or numbers) and converts to tokens
// getSummary() aggregates all entries into totals and estimated cost
export function createBudgetTracker() {
  const entries = [];

  return {
    record(agentRole, sectionKey, inputText, outputText, model) {
      const inputTokens = estimateTokens(inputText);
      const outputTokens = estimateTokens(outputText);
      const cost = computeCost(inputTokens, outputTokens, model);
      entries.push({
        agentRole,
        sectionKey,
        model,
        inputTokens,
        outputTokens,
        cost,
      });
    },

    getSummary() {
      let totalInput = 0;
      let totalOutput = 0;
      let totalCostInput = 0;
      let totalCostOutput = 0;

      for (const entry of entries) {
        totalInput += entry.inputTokens;
        totalOutput += entry.outputTokens;
        totalCostInput += entry.cost.input;
        totalCostOutput += entry.cost.output;
      }

      return {
        entries: entries.slice(),
        totals: { input: totalInput, output: totalOutput },
        estimatedCost: {
          input: totalCostInput,
          output: totalCostOutput,
          total: totalCostInput + totalCostOutput,
        },
      };
    },
  };
}

// Format a budget summary as a human-readable string
export function formatBudgetReport(summary) {
  const lines = ['=== Token Budget Report ===', ''];

  for (const entry of summary.entries) {
    lines.push(`Agent: ${entry.agentRole} (${entry.sectionKey})`);
    lines.push(`  Input: ~${entry.inputTokens.toLocaleString()} tokens | Output: ~${entry.outputTokens.toLocaleString()} tokens`);
    lines.push(`  Estimated cost: $${entry.cost.total.toFixed(4)}`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`Total: ~${summary.totals.input.toLocaleString()} input | ~${summary.totals.output.toLocaleString()} output`);
  lines.push(`Estimated cost: $${summary.estimatedCost.total.toFixed(4)}`);

  return lines.join('\n');
}

export const _testExports = { CHARS_PER_TOKEN, DEFAULT_MODEL };
