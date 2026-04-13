#!/usr/bin/env node
// Transforms a Managed Agent session events JSON into a localStorage-compatible
// report and outputs a browser console command to inject it.
//
// Usage: node scripts/inject-managed-agent-report.mjs <session-events.json>

import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/inject-managed-agent-report.mjs <session-events.json>');
  process.exit(1);
}

const events = JSON.parse(readFileSync(file, 'utf-8'));

// Find the agent.message event with the JSON output
const messageEvent = events.find(e => e.type === 'agent.message');
if (!messageEvent) {
  console.error('No agent.message event found in session events');
  process.exit(1);
}

// Extract all text content and find the JSON block
const fullText = messageEvent.content
  .filter(b => b.type === 'text')
  .map(b => b.text)
  .join('');

const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/);
if (!jsonMatch) {
  console.error('No JSON block found in agent message');
  process.exit(1);
}

const agentOutput = JSON.parse(jsonMatch[1]);

// Map agent output keys to app section format
const SECTION_MAP = [
  { agentKey: 'company_info', appKey: 'company_info', title: 'Company Information', num: 1 },
  { agentKey: 'minimum_standards', appKey: 'minimum_standards', title: 'Minimum Standards', num: 2 },
  { agentKey: 'meaning', appKey: 'meaning', title: 'Meaning KPIs', num: 3 },
  { agentKey: 'management_kpis', appKey: 'management_kpis', title: 'Management KPIs', num: 4 },
  { agentKey: 'growth_metrics', appKey: 'growth_metrics', title: 'Growth Metrics', num: 5 },
  { agentKey: 'valuation_summary', appKey: 'valuation_summary', title: 'Valuation Summary', num: 6 },
  { agentKey: 'overall_verdict', appKey: 'overall_verdict', title: 'Overall Verdict', num: 7 },
];

const sections = [];
for (const mapping of SECTION_MAP) {
  const src = agentOutput[mapping.agentKey];
  if (!src) continue;

  sections.push({
    key: mapping.appKey,
    title: mapping.title,
    sectionNumber: mapping.num,
    status: src.verdict === 'PASS' ? 'pass' : src.verdict === 'FAIL' ? 'fail' : 'review',
    confidence: src.confidence || 'MEDIUM',
    verdict: src.verdict,
    verdictRationale: src.verdictRationale || '',
    summary: src.summary || '',
    data: JSON.stringify(src.gates || src.kpis || src.companyDetails || src.growthTable || src.keyValuationMetrics || src.sectionSummary || {}),
    narrative: src.narrative || '',
    citations: src.citations || [],
    tables: [],
    charts: [],
    redFlags: src.redFlags || [],
    primarySourceInsights: [],
    crossCuttingFindings: [],
    searchesPerformed: [],
    modelUsed: 'claude-sonnet-4-6',
    tokenCost: { input: 0, output: 0 },
  });
}

// Build the onePager result object
const onePagerResult = {
  ticker: 'COST',
  companyName: 'Costco Wholesale Corporation',
  stage: 'onePager',
  generatedAt: new Date().toISOString(),
  sections,
  overallVerdict: agentOutput.overall_verdict?.verdict || 'WATCHLIST',
  sectionKeys: sections.map(s => s.key),
};

// Build the full report object
const reportId = randomUUID();
const report = {
  id: reportId,
  ticker: 'COST',
  companyName: 'Costco Wholesale Corporation',
  createdAt: new Date().toISOString().split('T')[0],
  updatedAt: new Date().toISOString().split('T')[0],
  currentStage: 1,
  stageApprovals: { onePager: null, pitchDeck: null, fullStory: null },
  onePager: onePagerResult,
  pitchDeck: null,
  fullStory: null,
  notes: '',
  watchlist: false,
  competitors: { privateCompetitors: [] },
};

// Output the console command
console.log('// Paste this into your browser console at http://localhost:5173\n');
console.log(`(function() {
  const key = 'stock-analyzer-reports';
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  // Remove any existing COST reports to avoid duplicates
  const filtered = existing.filter(r => r.ticker !== 'COST');
  filtered.push(${JSON.stringify(report)});
  localStorage.setItem(key, JSON.stringify(filtered));
  console.log('Report injected! Refresh the page.');
  location.reload();
})();`);
