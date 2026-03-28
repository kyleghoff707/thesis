#!/usr/bin/env node
// Smoke test: Verify ReportSectionSchema works with Claude API structured outputs
// Two stages per D-05/D-06:
//   Stage 1: Minimal prompt + structured output (no tools) — ~$0.05
//   Stage 2: Agent prompt + web_search_20250305 tool + structured output — ~$0.50-0.60
//
// Usage: node --loader ./scripts/node-esm-loader.js scripts/smoke-test-schema.js
//
// Requires: VITE_CLAUDE_KEY in .env.local
// Cost: ~$0.60 total (Stage 1 ~$0.05, Stage 2 ~$0.55)

// Load .env.local directly — do NOT import nodeAdapter.js because its fetch
// monkey-patch interferes with the Anthropic SDK's request headers.
// nodeAdapter is designed for engines that call SEC/Yahoo proxied URLs;
// this script only needs the API key from .env.local.
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ReportSectionSchema } from '../src/schemas/reportSection.js';

// ─── Client initialization ─────────────────────────────────────

const apiKey = process.env.VITE_CLAUDE_KEY;
if (!apiKey) {
  console.error('ERROR: VITE_CLAUDE_KEY not found in .env.local');
  process.exit(1);
}
const client = new Anthropic({ apiKey });

// Model selection: use the latest Sonnet that supports structured outputs.
// claude-sonnet-4-20250514 does NOT support output_config; claude-sonnet-4-6 does.
const MODEL = 'claude-sonnet-4-6';

// ─── Cost estimation (Sonnet pricing) ───────────────────────────

function estimateCost(usage) {
  const inputCost = (usage.input_tokens * 3) / 1_000_000;
  const outputCost = (usage.output_tokens * 15) / 1_000_000;
  return inputCost + outputCost;
}

// ─── Diagnostics printer ────────────────────────────────────────

function printDiagnostics(label, response) {
  const out = response.parsed_output;
  const sep = '───────────────────────────────────────';
  console.error(`\n${sep}`);
  console.error(`${label} Diagnostics`);
  console.error(sep);
  console.error(`stop_reason:            ${response.stop_reason}`);
  console.error(`parsed_output populated: ${out != null ? 'yes' : 'no'}`);

  if (out) {
    console.error(`parsed_output fields:   ${Object.keys(out).join(', ')}`);
    console.error(`narrative length:       ${out.narrative ? out.narrative.length : 0} chars`);
    console.error(`citations count:        ${out.citations ? out.citations.length : 0}`);
    console.error(`redFlags count:         ${out.redFlags ? out.redFlags.length : 0}`);
    console.error(`data field type:        ${typeof out.data}`);

    if (typeof out.data === 'string') {
      try {
        const parsed = JSON.parse(out.data);
        console.error(`data JSON.parse:        SUCCESS (${Object.keys(parsed).length} keys)`);
      } catch (e) {
        console.error(`data JSON.parse:        FAILED (${e.message})`);
      }
    }
  }

  // Count web search result blocks
  const webSearchBlocks = (response.content || []).filter(
    b => b.type === 'web_search_tool_result'
  ).length;
  console.error(`web search blocks:      ${webSearchBlocks}`);

  // Usage
  const u = response.usage || {};
  console.error(`usage:`);
  console.error(`  input_tokens:                  ${u.input_tokens || 0}`);
  console.error(`  output_tokens:                 ${u.output_tokens || 0}`);
  console.error(`  cache_creation_input_tokens:   ${u.cache_creation_input_tokens || 0}`);
  console.error(`  cache_read_input_tokens:       ${u.cache_read_input_tokens || 0}`);
  console.error(`  estimated cost:                $${estimateCost(u).toFixed(4)}`);
  console.error(sep);
}

// ─── Stage results tracking ─────────────────────────────────────

let stage1Pass = false;
let stage2Pass = false;
let totalCost = 0;

// ─── Stage 1: Minimal schema validation (no tools) ──────────────

console.error('\n=== STAGE 1: Schema validation (no tools) ===\n');

try {
  const stage1Response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `Generate a sample "radar" section for AAPL (Apple Inc.) as if you were a Rule One investment analyst. The section should evaluate whether Apple is a "simple and predictable" business.

Fill all required fields in the output schema. For the "data" field, provide a JSON string containing key metrics like {"ticker": "AAPL", "sector": "Technology", "simpleScore": 8, "predictableScore": 7}. For citations, create at least 2 plausible references. For redFlags, list at least 1 genuine concern.

Keep the narrative concise (200-400 words) but substantive.`,
    }],
    output_config: { format: zodOutputFormat(ReportSectionSchema) },
  });

  printDiagnostics('Stage 1', stage1Response);

  // Validate Stage 1
  if (stage1Response.stop_reason !== 'end_turn') {
    console.error(`STAGE 1: FAIL — stop_reason is "${stage1Response.stop_reason}", expected "end_turn"`);
  } else if (stage1Response.parsed_output == null) {
    console.error('STAGE 1: FAIL — parsed_output is null');
  } else if (typeof stage1Response.parsed_output.data !== 'string') {
    console.error(`STAGE 1: FAIL — data field type is "${typeof stage1Response.parsed_output.data}", expected "string"`);
  } else {
    stage1Pass = true;
    console.error('STAGE 1: PASS');
  }

  totalCost += estimateCost(stage1Response.usage || {});
} catch (err) {
  console.error('STAGE 1: FAIL — API error');
  console.error(`  Status: ${err.status || 'N/A'}`);
  console.error(`  Message: ${err.message}`);
  if (err.error) console.error(`  Error detail: ${JSON.stringify(err.error)}`);
  if (err.status === 400) {
    console.error('  Schema compilation failed. Check reportSection.js for looseObject remnants.');
  }
}

if (!stage1Pass) {
  console.error('\nStage 1 failed — schema issue. Aborting Stage 2.');
  process.exit(1);
}

// ─── Stage 2: Realistic agent call with web search tool ─────────

console.error('\n=== STAGE 2: Agent prompt + web search tool ===\n');

try {
  const agentPrompt = readFileSync(
    resolve(process.cwd(), 'agents/business-analyst/prompt.md'),
    'utf8'
  );

  const userMessage = `You are analyzing Sprouts Farmers Market (SFM) for a Rule One investment thesis.

Company context:
- Ticker: SFM
- Sector: Consumer Defensive — Grocery Stores
- Market Cap: ~$14B
- Revenue (TTM): ~$7.4B
- Net Income (TTM): ~$470M
- P/E (TTM): ~30

Your assignment: Generate section 1 — "Radar: Simple & Predictable" for the Pitch Deck.

Use web search to find recent information about SFM's business model, competitive advantages, and growth trajectory. Incorporate findings into your analysis.

Fill all required fields. The "data" field must be a JSON string containing key business metrics you discover. Include real citations with sources. List genuine red flags.`;

  const stage2Response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16384,
    system: [{ type: 'text', text: agentPrompt }],
    messages: [{ role: 'user', content: userMessage }],
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
    }],
    output_config: { format: zodOutputFormat(ReportSectionSchema) },
  });

  printDiagnostics('Stage 2', stage2Response);

  // Validate Stage 2
  if (stage2Response.stop_reason !== 'end_turn') {
    console.error(`STAGE 2: FAIL — stop_reason is "${stage2Response.stop_reason}", expected "end_turn"`);
  } else if (stage2Response.parsed_output == null) {
    console.error('STAGE 2: FAIL — parsed_output is null');
  } else if (typeof stage2Response.parsed_output.data !== 'string') {
    console.error(`STAGE 2: FAIL — data field type is "${typeof stage2Response.parsed_output.data}", expected "string"`);
  } else {
    stage2Pass = true;
    console.error('STAGE 2: PASS');
  }

  totalCost += estimateCost(stage2Response.usage || {});
} catch (err) {
  console.error('STAGE 2: FAIL — API error');
  console.error(`  Status: ${err.status || 'N/A'}`);
  console.error(`  Message: ${err.message}`);
  if (err.error) console.error(`  Error detail: ${JSON.stringify(err.error)}`);
  if (err.status === 400) {
    console.error('  Schema compilation failed or tool conflict. Check for citations: { enabled: true }.');
  }
}

// ─── Final summary ──────────────────────────────────────────────

const summaryLine = (pass) => pass ? 'PASS' : 'FAIL';

console.log('');
console.log('===================================================================');
console.log('SMOKE TEST SUMMARY');
console.log(`Stage 1 (schema only):     ${summaryLine(stage1Pass)}`);
console.log(`Stage 2 (schema + search): ${summaryLine(stage2Pass)}`);
console.log(`Total cost: $${totalCost.toFixed(2)} (estimated from token counts)`);
console.log('===================================================================');

process.exit(stage1Pass && stage2Pass ? 0 : 1);
