#!/usr/bin/env node
// Integration test: Dispatch business-analyst for SFM section 1 via aiResearch.js
// Proves the full dispatch pipeline works: config loading, prompt assembly,
// API call with web search, structured output parsing, citation enrichment.
//
// Usage: node --loader ./scripts/node-esm-loader.js scripts/test-agent-dispatch.js
//
// Requires: VITE_CLAUDE_KEY in .env.local
// Cost: ~$0.60 per run (single agent with web search)

import { dispatchAgent } from '../src/engines/aiResearch.js';

// ─── Minimal DataPacket for SFM ─────────────────────────────────

const dataPacket = {
  ticker: 'SFM',
  caveats: [],
  companyInfo: {
    ticker: 'SFM',
    name: 'Sprouts Farmers Market Inc',
    sector: 'Consumer Defensive',
    industry: 'Grocery Stores',
    marketCap: 14000000000,
    revenue: 7400000000,
    netIncome: 470000000,
    pe: 30,
  },
  classification: {
    sector: 'Consumer Staples',
    industryGroup: 'Food & Staples Retailing',
    industry: 'Food Retail',
  },
  ruleOneScore: {
    overall: 72,
    moat: 68,
    management: 75,
    meaning: 80,
  },
  peers: [
    { ticker: 'WFM', name: 'Whole Foods' },
    { ticker: 'KR', name: 'Kroger' },
    { ticker: 'COST', name: 'Costco' },
  ],
};

// ─── Dispatch ───────────────────────────────────────────────────

async function main() {
  console.log('=== Agent Dispatch Test: business-analyst (SFM, section 1) ===\n');

  const result = await dispatchAgent('business-analyst', dataPacket, {
    sectionAssignment: 'Generate section 1: Radar — Simple & Predictable for the Pitch Deck. Evaluate whether SFM is a simple, predictable business using Rule One criteria.',
    maxSearches: 3,
  });

  // ─── Diagnostics ────────────────────────────────────────────────

  const section = result.section;
  const usage = result.usage;

  console.log('Result:');
  console.log(`  error:              ${result.error || 'none'}`);
  console.log(`  stopReason:         ${result.stopReason}`);
  console.log(`  model:              ${result.model}`);
  console.log(`  duration:           ${result.duration}ms`);

  if (section) {
    const withUrl = section.citations.filter(c => c.url).length;
    console.log('\nSection:');
    console.log(`  key:                ${section.key}`);
    console.log(`  title:              ${section.title}`);
    console.log(`  sectionNumber:      ${section.sectionNumber}`);
    console.log(`  status:             ${section.status}`);
    console.log(`  confidence:         ${section.confidence}`);
    console.log(`  verdict:            ${section.verdict}`);
    console.log(`  narrative length:   ${section.narrative.length} chars (~${Math.round(section.narrative.length / 5)} words)`);
    console.log(`  citations:          ${section.citations.length} (${withUrl} with URLs)`);
    console.log(`  redFlags:           ${section.redFlags.length}`);
    console.log(`  data type:          ${typeof section.data}`);
    console.log(`  data keys:          ${section.data ? Object.keys(section.data).join(', ') : 'N/A'}`);
    console.log(`  searchesPerformed:  ${section.searchesPerformed?.length || 0}`);
  }

  console.log('\nUsage:');
  console.log(`  inputTokens:        ${usage.inputTokens}`);
  console.log(`  outputTokens:       ${usage.outputTokens}`);
  console.log(`  cacheRead:          ${usage.cacheRead}`);
  console.log(`  cacheWrite:         ${usage.cacheWrite}`);
  console.log(`  webSearches:        ${usage.webSearches}`);
  console.log(`  cost:               $${usage.cost.toFixed(4)}`);

  console.log(`\nWeb Search URLs:      ${result.webSearches.length} extracted`);
  for (const ws of result.webSearches) {
    console.log(`  ${ws.url}`);
  }

  // ─── Assertions ─────────────────────────────────────────────────

  console.log('\n--- Assertions ---\n');

  const assertions = [
    { name: 'No errors', pass: result.error === null },
    { name: 'Stop reason is end_turn', pass: result.stopReason === 'end_turn' },
    { name: 'Data parsed to object (D-06)', pass: typeof result.section?.data === 'object' },
    { name: 'Narrative >= 2000 chars (~400 words)', pass: (result.section?.narrative?.length || 0) >= 2000 },
    { name: 'At least 3 citations', pass: (result.section?.citations?.length || 0) >= 3 },
    { name: 'At least 1 red flag', pass: (result.section?.redFlags?.length || 0) >= 1 },
    { name: 'Web search URLs extracted', pass: result.webSearches.length >= 1 },
    { name: 'At least 1 citation has URL', pass: result.section?.citations?.some(c => c.url) || false },
    { name: 'Cost is positive', pass: result.usage.cost > 0 },
  ];

  let passCount = 0;
  for (const a of assertions) {
    const label = a.pass ? 'PASS' : 'FAIL';
    console.log(`  [${label}] ${a.name}`);
    if (a.pass) passCount++;
  }

  console.log(`\nINTEGRATION TEST: ${passCount === assertions.length ? 'PASS' : 'FAIL'} (${passCount}/${assertions.length} assertions)`);

  process.exit(passCount === assertions.length ? 0 : 1);
}

main().catch(err => {
  console.error('Integration test failed with error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
