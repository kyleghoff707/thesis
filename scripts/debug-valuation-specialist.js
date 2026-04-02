#!/usr/bin/env node
// Diagnostic: reproduce the valuation-specialist 6-token failure
// Calls client.messages.create() directly (not .parse()) to see raw response

import '../src/engines/nodeAdapter.js';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ReportSectionSchema } from '../src/schemas/reportSection.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { assembleDataPacket } from '../src/engines/dataExport.js';

const client = new Anthropic({ apiKey: process.env.VITE_CLAUDE_KEY });
const AGENTS_DIR = resolve(process.cwd(), 'agents');

// Replicate exactly what dispatchAgent does for valuation-specialist
const config = JSON.parse(readFileSync(resolve(AGENTS_DIR, 'valuation-specialist', 'config.json'), 'utf8'));
const prompt = readFileSync(resolve(AGENTS_DIR, 'valuation-specialist', 'prompt.md'), 'utf8');

// Load curriculum
const curriculum = config.curriculum.map(f => {
  try { return readFileSync(resolve(process.cwd(), f), 'utf8'); } catch { return ''; }
}).filter(Boolean).join('\n\n---\n\n');

// Load universal context
const universalContext = config.universalContextFiles.map(f => {
  try { return readFileSync(resolve(process.cwd(), f), 'utf8'); } catch { return ''; }
}).filter(Boolean).join('\n\n---\n\n');

console.log('Assembling DataPacket...');
const dataPacket = await assembleDataPacket('SFM');
console.log('DataPacket assembled');

// Slice dataPacket
const dataSlice = {};
for (const key of config.dataPacketSlice) {
  if (dataPacket[key] !== undefined) dataSlice[key] = dataPacket[key];
}

// Build system blocks (same as buildSystemBlocks)
const systemBlocks = [];
if (universalContext) {
  systemBlocks.push({ type: 'text', text: universalContext, cache_control: { type: 'ephemeral' } });
}
// No PSR findings for this test
const agentContent = [prompt, curriculum].filter(Boolean).join('\n\n---\n\n');
if (agentContent) {
  systemBlocks.push({ type: 'text', text: agentContent });
}

// Build user message (simplified)
const userContent = `## DataPacket\n\n\`\`\`json\n${JSON.stringify(dataSlice, null, 2)}\n\`\`\`\n\n## Assignment\n\nStage: Full Story. Generate Full Story sections: 5`;

// Token estimates
const sysChars = systemBlocks.reduce((a, b) => a + (b.text?.length || 0), 0);
const userChars = userContent.length;
console.log(`\nSystem message: ~${Math.round(sysChars / 4)} tokens (${sysChars} chars)`);
console.log(`User message: ~${Math.round(userChars / 4)} tokens (${userChars} chars)`);
console.log(`Total estimate: ~${Math.round((sysChars + userChars) / 4)} tokens`);

const schema = zodOutputFormat(ReportSectionSchema);
console.log(`\nSchema type: ${schema.type}`);
console.log(`Schema keys: ${Object.keys(schema.schema?.properties || {}).join(', ')}`);

// Test 1: Call with output_config + tools (original failing config)
console.log('\n=== Test 1: output_config + tools (original config) ===');
try {
  const resp1 = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 16384,
    system: systemBlocks,
    messages: [{ role: 'user', content: userContent }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    output_config: { format: schema },
  });
  console.log(`stop_reason: ${resp1.stop_reason}`);
  console.log(`output_tokens: ${resp1.usage?.output_tokens}`);
  console.log(`content length: ${resp1.content?.length}`);
  console.log(`content types: ${resp1.content?.map(b => b.type).join(', ')}`);
  console.log(`content[0] (500 chars): ${JSON.stringify(resp1.content?.[0])?.substring(0, 500)}`);
  console.log(`response keys: ${Object.keys(resp1).join(', ')}`);
  if (resp1.output) console.log(`output: ${JSON.stringify(resp1.output)?.substring(0, 500)}`);
} catch (err) {
  console.log(`ERROR: ${err.status} ${err.message}`);
  if (err.error) console.log(`Error body: ${JSON.stringify(err.error)?.substring(0, 500)}`);
}

// Test 2: Call WITHOUT tools (remove web_search)
console.log('\n=== Test 2: output_config only (no tools) ===');
try {
  const resp2 = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 16384,
    system: systemBlocks,
    messages: [{ role: 'user', content: userContent }],
    output_config: { format: schema },
  });
  console.log(`stop_reason: ${resp2.stop_reason}`);
  console.log(`output_tokens: ${resp2.usage?.output_tokens}`);
  console.log(`content length: ${resp2.content?.length}`);
  console.log(`content types: ${resp2.content?.map(b => b.type).join(', ')}`);
  console.log(`content[0] (500 chars): ${JSON.stringify(resp2.content?.[0])?.substring(0, 500)}`);
} catch (err) {
  console.log(`ERROR: ${err.status} ${err.message}`);
  if (err.error) console.log(`Error body: ${JSON.stringify(err.error)?.substring(0, 500)}`);
}

// Test 3: Call WITHOUT output_config (no structured output, with tools)
console.log('\n=== Test 3: tools only (no output_config) ===');
try {
  const resp3 = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 16384,
    system: systemBlocks,
    messages: [{ role: 'user', content: userContent + '\n\nRespond with a JSON object matching ReportSectionSchema. Start with {' }],
  });
  console.log(`stop_reason: ${resp3.stop_reason}`);
  console.log(`output_tokens: ${resp3.usage?.output_tokens}`);
  console.log(`content length: ${resp3.content?.length}`);
  console.log(`content types: ${resp3.content?.map(b => b.type).join(', ')}`);
  console.log(`content[0] (500 chars): ${JSON.stringify(resp3.content?.[0])?.substring(0, 500)}`);
} catch (err) {
  console.log(`ERROR: ${err.status} ${err.message}`);
  if (err.error) console.log(`Error body: ${JSON.stringify(err.error)?.substring(0, 500)}`);
}

console.log('\nDone.');
