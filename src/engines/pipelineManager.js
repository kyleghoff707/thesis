// pipelineManager.js — Wave-based dispatch manager for AI agent pipeline (API-02)
// Reads dispatch-table.json, dispatches agents per wave via Promise.allSettled,
// pauses for PM feedback at checkpoints, tracks budget and cache stats.
// This is code, not AI — deterministic dispatch coordination (per D-08).

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { dispatchAgent } from './aiResearch.js';
import { createCacheMonitor } from './cacheMonitor.js';
import { createBudgetTracker, formatBudgetReport } from './contextBudget.js';

const AGENTS_DIR = resolve(process.cwd(), 'agents');

// Load and validate dispatch table for a given stage
function loadDispatchTable(stage) {
  const tablePath = resolve(AGENTS_DIR, 'orchestrator', 'dispatch-table.json');
  const table = JSON.parse(readFileSync(tablePath, 'utf8'));
  if (!table[stage]) {
    throw new Error(`Unknown stage "${stage}" in dispatch-table.json`);
  }
  return table[stage];
}

// Build section assignment string from section numbers array
function buildSectionAssignment(sections) {
  if (!sections || sections.length === 0) return undefined;
  return `Generate sections: ${sections.join(', ')}`;
}

// Format PSR agent output into a structured findings string for downstream agents (D-02)
function formatPsrFindings(psrSections) {
  if (!psrSections || psrSections.length === 0) return '';
  const parts = [];
  for (const section of psrSections) {
    if (!section) continue;
    const label = section.title || section.key || 'PSR Agent';
    if (section.narrative) {
      parts.push(`### ${label}\n\n${section.narrative}`);
    }
    if (section.primarySourceInsights && section.primarySourceInsights.length > 0) {
      parts.push(`**Key Insights:**\n${section.primarySourceInsights.map(i => `- ${i}`).join('\n')}`);
    }
  }
  if (parts.length === 0) return '';
  return `## Primary Source Reader Findings\n\n${parts.join('\n\n---\n\n')}`;
}

// Main pipeline entry point
// stage: 'pitchDeck' | 'onePager' | 'fullStory'
// options: { onWaveComplete, psrFindings, maxSearches }
// onWaveComplete: async (waveNumber, results, budgetSummary, cacheSummary) => feedback string or null
// Returns: { sections, budget, cacheStats, errors }
export async function runPipeline(stage, dataPacket, options = {}) {
  const stageConfig = loadDispatchTable(stage);
  const budget = createBudgetTracker();
  const cacheMonitor = createCacheMonitor();
  const allSections = [];
  const errors = [];
  let pmFeedback = null;

  // --- Pre-processing (sequential — PSR agents) ---
  // Skip data-assembly step (handled externally via assembleDataPacket)
  for (const step of stageConfig.preProcessing) {
    if (step.step === 'data-assembly') continue;
    if (!step.agent) continue;

    const result = await dispatchAgent(step.agent, dataPacket, {
      psrFindings: options.psrFindings,
      maxSearches: options.maxSearches,
    });

    if (result.error) {
      errors.push({ agent: step.agent, step: step.step, error: result.error });
      console.warn(`Pre-processing ${step.step} failed: ${result.error}`);
    } else {
      allSections.push(result.section);
    }
    budget.record(step.agent, result.usage);
    cacheMonitor.record(result.usage);
  }

  // Extract PSR findings for downstream agents (D-02)
  const psrSections = allSections.filter(s =>
    s && (s.key === 'annual-reader' || s.key === 'quarterly-reader' ||
          s.title?.includes('Annual') || s.title?.includes('Quarterly'))
  );
  const formattedPsrFindings = formatPsrFindings(psrSections);
  // Use formatted PSR findings if available, otherwise fall back to caller-provided
  const psrFindingsForAgents = formattedPsrFindings || options.psrFindings || '';

  // --- Wave execution (parallel within, sequential between — per D-01) ---
  for (const wave of stageConfig.phases) {
    const waveAgents = wave.agents;

    // Dispatch all agents in this wave simultaneously via Promise.allSettled
    const results = await Promise.allSettled(
      waveAgents.map(a => dispatchAgent(a.agent, dataPacket, {
        sectionAssignment: buildSectionAssignment(a.sections),
        priorSections: allSections.slice(),
        psrFindings: psrFindingsForAgents,
        pmFeedback,
        maxSearches: options.maxSearches,
      }))
    );

    // Process results from this wave
    const waveResults = [];
    for (let i = 0; i < results.length; i++) {
      const agentName = waveAgents[i].agent;
      if (results[i].status === 'fulfilled') {
        const r = results[i].value;
        if (r.error) {
          errors.push({ agent: agentName, wave: wave.phase, error: r.error });
        } else {
          allSections.push(r.section);
          waveResults.push(r);
        }
        budget.record(agentName, r.usage);
        cacheMonitor.record(r.usage);
      } else {
        // Promise itself rejected (unexpected — network error, etc.)
        errors.push({
          agent: agentName,
          wave: wave.phase,
          error: results[i].reason?.message || 'Unknown error',
        });
      }
    }

    // Cache threshold warning
    const cacheSummary = cacheMonitor.getSummary();
    if (cacheSummary.belowThreshold) {
      console.warn(`Cache hit rate ${cacheSummary.hitRatePct} is below 70% threshold after wave ${wave.phase}`);
    }

    // Checkpoint callback (per D-06, D-07)
    if (wave.checkpoint?.after && options.onWaveComplete) {
      const feedback = await options.onWaveComplete(
        wave.phase,
        waveResults.map(r => r.section),
        budget.getSummary(),
        cacheSummary
      );
      // PM feedback folded into next wave context (per D-07)
      if (feedback && typeof feedback === 'string') {
        pmFeedback = feedback;
      }
    }
  }

  // --- Post-processing (synthesis) ---
  for (const step of stageConfig.postProcessing) {
    if (!step.agent) continue;

    const result = await dispatchAgent(step.agent, dataPacket, {
      sectionAssignment: buildSectionAssignment(step.sections),
      priorSections: allSections.slice(),
      psrFindings: psrFindingsForAgents,
      pmFeedback,
      maxSearches: options.maxSearches,
    });

    if (result.error) {
      errors.push({ agent: step.agent, step: step.step, error: result.error });
    } else {
      allSections.push(result.section);
    }
    budget.record(step.agent, result.usage);
    cacheMonitor.record(result.usage);
  }

  // Final cache warning
  const finalCacheStats = cacheMonitor.getSummary();
  if (finalCacheStats.belowThreshold) {
    console.warn(`Pipeline cache hit rate ${finalCacheStats.hitRatePct} below 70% threshold`);
  }

  return {
    sections: allSections,
    budget: budget.getSummary(),
    cacheStats: finalCacheStats,
    errors,
  };
}

export const _testExports = { loadDispatchTable, buildSectionAssignment, formatPsrFindings };
