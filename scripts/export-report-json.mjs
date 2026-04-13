#!/usr/bin/env node
// Exports the transformed report as a clean JSON file
import { readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

const file = process.argv[2];
const events = JSON.parse(readFileSync(file, 'utf-8'));

const messageEvent = events.find(e => e.type === 'agent.message');
const fullText = messageEvent.content.filter(b => b.type === 'text').map(b => b.text).join('');
const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/);
const agentOutput = JSON.parse(jsonMatch[1]);

const SECTION_MAP = [
  { agentKey: 'company_info', title: 'Company Information', num: 1 },
  { agentKey: 'minimum_standards', title: 'Minimum Standards', num: 2 },
  { agentKey: 'meaning', title: 'Meaning KPIs', num: 3 },
  { agentKey: 'management_kpis', title: 'Management KPIs', num: 4 },
  { agentKey: 'growth_metrics', title: 'Growth Metrics', num: 5 },
  { agentKey: 'valuation_summary', title: 'Valuation Summary', num: 6 },
  { agentKey: 'overall_verdict', title: 'Overall Verdict', num: 7 },
];

const sections = SECTION_MAP.filter(m => agentOutput[m.agentKey]).map(m => {
  const src = agentOutput[m.agentKey];
  return {
    key: m.agentKey, title: m.title, sectionNumber: m.num,
    status: src.verdict === 'PASS' ? 'pass' : src.verdict === 'FAIL' ? 'fail' : 'review',
    confidence: src.confidence || 'MEDIUM', verdict: src.verdict,
    verdictRationale: src.verdictRationale || '', summary: src.summary || '',
    data: JSON.stringify(src.gates || src.kpis || src.companyDetails || src.growthTable || src.keyValuationMetrics || src.sectionSummary || {}),
    narrative: src.narrative || '', citations: src.citations || [],
    tables: [], charts: [], redFlags: src.redFlags || [],
    primarySourceInsights: [], crossCuttingFindings: [], searchesPerformed: [],
    modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 0, output: 0 },
  };
});

const report = {
  id: randomUUID(), ticker: 'COST', companyName: 'Costco Wholesale Corporation',
  createdAt: new Date().toISOString().split('T')[0],
  updatedAt: new Date().toISOString().split('T')[0],
  currentStage: 1,
  stageApprovals: { onePager: null, pitchDeck: null, fullStory: null },
  onePager: {
    ticker: 'COST', companyName: 'Costco Wholesale Corporation', stage: 'onePager',
    generatedAt: new Date().toISOString(), sections,
    overallVerdict: agentOutput.overall_verdict?.verdict || 'WATCHLIST',
    sectionKeys: sections.map(s => s.key),
  },
  pitchDeck: null, fullStory: null, notes: '', watchlist: false,
  competitors: { privateCompetitors: [] },
};

const outPath = new URL('../public/managed-agent-report.json', import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Report written to ${outPath}`);
console.log('\nPaste this into your browser console at http://localhost:5173:\n');
console.log(`fetch('/managed-agent-report.json').then(r=>r.json()).then(report=>{const key='stock-analyzer-reports';const existing=JSON.parse(localStorage.getItem(key)||'[]').filter(r=>r.ticker!=='COST');existing.push(report);localStorage.setItem(key,JSON.stringify(existing));console.log('Injected!');location.reload()})`);
