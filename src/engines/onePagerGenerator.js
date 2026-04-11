// onePagerGenerator.js — Single-call One Pager generator using Claude Sonnet
// Replaces the multi-agent pipeline for Stage 1. The One Pager is a screening
// filter, not a thesis — one Sonnet call with full DataPacket + curriculum
// produces a concise, template-filled result in ~2 minutes.
//
// Browser-compatible: uses knowledgeBundle.js for file content (Vite ?raw imports).
// Node.js CLI: still works via scripts/run-pipeline.js which uses nodeAdapter.js.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { OnePagerOutputSchema } from '../schemas/onePagerOutput.js';
import { onePagerCurriculum, onePagerTemplate, buffettWritingStyleGuide } from './knowledgeBundle.js';
import { claudeBaseUrl } from './apiBase.js';

// ─── Client initialization ─────────────────────────────────────

const IS_DEV = import.meta.env.DEV;

const client = new Anthropic({
  apiKey: IS_DEV ? import.meta.env.VITE_CLAUDE_KEY : 'proxy',
  baseURL: claudeBaseUrl(),
  dangerouslyAllowBrowser: true,
  ...(IS_DEV ? {} : {
    defaultHeaders: { 'x-claude-caller': 'onePager' },
    fetch: (url, init) => fetch(url, { ...init, credentials: 'include' }),
  }),
});

// ─── Constants ──────────────────────────────────────────────────

import { MODEL_PRICING as PRICING, normalizeModel } from '../../packages/pricing/index.js';

const SECTION_META = [
  { key: 'company_info', title: 'Company Information', sectionNumber: 1 },
  { key: 'minimum_standards', title: 'Minimum Standards', sectionNumber: 2 },
  { key: 'meaning', title: 'Meaning KPIs', sectionNumber: 3 },
  { key: 'growth_metrics', title: 'Growth Metrics', sectionNumber: 4 },
  { key: 'valuation_summary', title: 'Valuation Summary', sectionNumber: 5 },
  { key: 'overall_verdict', title: 'Overall Verdict', sectionNumber: 6 },
];

// ─── Prompt construction ────────────────────────────────────────

function buildSystemPrompt() {
  const role = `You are a Rule One investment analyst conducting a quick screening pass. Your job is to fill out a One Pager — a concise filter document that answers one question: Is this company worth deeper research? Be direct, cite specific numbers, and keep each section to 1-3 short paragraphs. This is a screening tool, not a thesis.`;

  const curriculum = onePagerCurriculum;
  const writingGuide = buffettWritingStyleGuide;
  const template = onePagerTemplate;

  const outputInstructions = `Produce a JSON object with 6 keys matching the template sections. Each section must have: verdict (PASS/FAIL/WATCHLIST), confidence (HIGH/MEDIUM/LOW), verdictRationale (1-2 sentences), summary (2-3 sentences), narrative (1-3 SHORT paragraphs — this is a one pager, not an essay), redFlags (at least 1 item, even for PASS verdicts), and citations (array of {id, ref, text, source}). The overall_verdict section synthesizes all other sections into a final PASS/FAIL/WATCHLIST recommendation.`;

  return [role, curriculum, writingGuide, template, outputInstructions].join('\n\n---\n\n');
}

function buildUserMessage(dataPacket) {
  const json = JSON.stringify(dataPacket, null, 2);
  return `## DataPacket\n\n\`\`\`json\n${json}\n\`\`\`\n\n## Assignment\n\nAnalyze ${dataPacket.ticker} and fill out the complete One Pager. Be concise — each section should be 1-3 short paragraphs. Cite specific numbers from the DataPacket.`;
}

// ─── Output transformation ──────────────────────────────────────

// Convert OnePagerOutputSchema output to the existing backward-compatible format
// expected by the PDF generator and gate check
function transformToOutputFormat(parsed, dataPacket, usage, model) {
  const sections = SECTION_META.map(meta => {
    const s = parsed[meta.key];
    return {
      key: meta.key,
      title: meta.title,
      sectionNumber: meta.sectionNumber,
      status: s.verdict === 'PASS' ? 'pass' : s.verdict === 'FAIL' ? 'fail' : 'review',
      confidence: s.confidence,
      verdict: s.verdict,
      verdictRationale: s.verdictRationale,
      summary: s.summary,
      data: '{}',
      narrative: s.narrative,
      citations: s.citations,
      tables: [],
      charts: [],
      redFlags: s.redFlags,
      primarySourceInsights: [],
      crossCuttingFindings: [],
      searchesPerformed: [],
      modelUsed: model,
      tokenCost: {
        input: Math.round(usage.inputTokens / 6),
        output: Math.round(usage.outputTokens / 6),
      },
    };
  });

  return {
    ticker: dataPacket.ticker,
    companyName: dataPacket.companyInfo?.name || dataPacket.ticker,
    stage: 'onePager',
    generatedAt: new Date().toISOString(),
    sections,
    overallVerdict: parsed.overall_verdict.verdict,
    sectionKeys: SECTION_META.map(m => m.key),
  };
}

// ─── Main entry point ───────────────────────────────────────────

export async function generateOnePager(dataPacket) {
  const startTime = Date.now();

  try {
    // Build prompts
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(dataPacket);

    // Call Claude API with structured output
    const model = 'claude-sonnet-4-6';
    const response = await client.messages.parse({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      output_config: { format: zodOutputFormat(OnePagerOutputSchema) },
    });

    // Extract parsed output
    const parsed = response.parsed_output;
    if (!parsed) {
      const outputTokens = response.usage?.output_tokens || 0;
      throw new Error(`Structured output parsing failed (${outputTokens} output tokens, stop_reason: ${response.stop_reason || 'unknown'})`);
    }

    // Build usage from API response
    const apiUsage = response.usage || {};
    const inputTokens = apiUsage.input_tokens || 0;
    const outputTokens = apiUsage.output_tokens || 0;
    const cacheRead = apiUsage.cache_read_input_tokens || 0;
    const cacheWrite = apiUsage.cache_creation_input_tokens || 0;
    const p = PRICING[normalizeModel(model)];
    const cost =
      (inputTokens * p.input / 1_000_000) +
      (outputTokens * p.output / 1_000_000) +
      (cacheRead * p.cacheRead / 1_000_000) +
      (cacheWrite * p.cacheWrite / 1_000_000);
    const usage = { inputTokens, outputTokens, cacheRead, cacheWrite, cost };

    // Transform to backward-compatible output format
    const output = transformToOutputFormat(parsed, dataPacket, usage, model);

    return { output, usage, duration: Date.now() - startTime, error: null };
  } catch (err) {
    return { output: null, usage: null, duration: Date.now() - startTime, error: err.message };
  }
}

// ─── Test exports ───────────────────────────────────────────────

export const _testExports = {
  buildSystemPrompt,
  buildUserMessage,
  transformToOutputFormat,
  SECTION_META,
};
