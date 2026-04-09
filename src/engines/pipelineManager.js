// pipelineManager.js — Wave-based dispatch manager for AI agent pipeline (API-02)
// Reads dispatch-table.json, dispatches agents per wave via Promise.allSettled,
// pauses for PM feedback at checkpoints, tracks budget and cache stats.
// This is code, not AI — deterministic dispatch coordination (per D-08).

import { dispatchAgent } from './aiResearch.js';
import { generateOnePager } from './onePagerGenerator.js';
import { createCacheMonitor } from './cacheMonitor.js';
import { createBudgetTracker, formatBudgetReport } from './contextBudget.js';
import { DEBATE_SCHEMAS } from '../schemas/debateStep.js';
import { MultiSectionSchema } from '../schemas/reportSection.js';
import { DISPATCH_TABLE } from './knowledgeBundle.js';

// Load and validate dispatch table for a given stage (from build-time bundle)
function loadDispatchTable(stage) {
  if (!DISPATCH_TABLE[stage]) {
    throw new Error(`Unknown stage "${stage}" in dispatch-table.json`);
  }
  return DISPATCH_TABLE[stage];
}

// Build section assignment string from section numbers array
function buildSectionAssignment(sections, stage) {
  if (!sections || sections.length === 0) return undefined;
  const stageLabel = stage === 'fullStory' ? 'Full Story' : stage === 'pitchDeck' ? 'Pitch Deck' : stage;
  return `Stage: ${stageLabel}. Generate ${stageLabel} sections: ${sections.join(', ')}`;
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

// Build debate context string from receivesContext array, debate outputs, and prior sections
// Maps receivesContext strings from dispatch-table.json to actual content
function buildDebateContext(receivesContext, debateOutputs, allSections) {
  if (!receivesContext || receivesContext.length === 0) return '';

  const parts = [];
  for (const ctx of receivesContext) {
    if (ctx === 'sections_1_through_5') {
      // Build summary from allSections with sectionNumber 1-5
      const s1to5 = allSections.filter(s => s && s.sectionNumber >= 1 && s.sectionNumber <= 5);
      const summaries = s1to5.map(s => {
        const label = s.verdict || s.status || '';
        const redFlags = (s.redFlags && s.redFlags.length > 0) ? `Red flags: ${s.redFlags.join('; ')}` : '';
        // Truncate narrative to 2000 chars to manage token budget (per RESEARCH Pitfall 1)
        const narrative = s.narrative ? s.narrative.slice(0, 2000) : '';
        const narrativeBlock = narrative ? `\n${narrative}` : '';
        return `### ${s.title} (${label})\n${s.summary}${narrativeBlock}\n${redFlags}`;
      }).join('\n\n');
      parts.push(summaries);
    } else if (ctx === 'bull_output') {
      if (debateOutputs.bull) {
        parts.push(`## Bull Thesis (Step 1)\n\n\`\`\`json\n${JSON.stringify(debateOutputs.bull, null, 2)}\n\`\`\``);
      } else {
        console.warn(`buildDebateContext: Expected bull_output but it is missing — downstream agent receives incomplete context`);
        parts.push(`## Bull Thesis (Step 1)\n\n**[MISSING — bull thesis generation failed. Proceed with available context only.]**`);
      }
    } else if (ctx === 'bear_output') {
      if (debateOutputs.bear) {
        parts.push(`## Bear Inversion (Step 2)\n\n\`\`\`json\n${JSON.stringify(debateOutputs.bear, null, 2)}\n\`\`\``);
      } else {
        console.warn(`buildDebateContext: Expected bear_output but it is missing — downstream agent receives incomplete context`);
        parts.push(`## Bear Inversion (Step 2)\n\n**[MISSING — bear inversion generation failed. Proceed with available context only.]**`);
      }
    } else if (ctx === 'bull_rebuttal_output') {
      if (debateOutputs.bull_rebuttal) {
        parts.push(`## Bull Rebuttal (Step 3)\n\n\`\`\`json\n${JSON.stringify(debateOutputs.bull_rebuttal, null, 2)}\n\`\`\``);
      } else {
        console.warn(`buildDebateContext: Expected bull_rebuttal_output but it is missing — downstream agent receives incomplete context`);
        parts.push(`## Bull Rebuttal (Step 3)\n\n**[MISSING — bull rebuttal generation failed. Proceed with available context only.]**`);
      }
    }
  }

  return parts.join('\n\n---\n\n');
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
  const errors = [];

  // --- Single-call mode (One Pager — no multi-agent orchestration) ---
  if (stageConfig.mode === 'single-call') {
    const result = await generateOnePager(dataPacket);

    if (result.error) {
      errors.push({ agent: 'onePagerGenerator', step: 'single-call', error: result.error });
    }

    // Record usage in budget tracker and cache monitor
    if (result.usage) {
      budget.record('onePagerGenerator', result.usage);
      cacheMonitor.record(result.usage);
    }

    return {
      sections: result.output?.sections || [],
      budget: budget.getSummary(),
      cacheStats: cacheMonitor.getSummary(),
      errors,
      // Attach full output for caller to use (output path, overallVerdict, etc.)
      singleCallOutput: result.output,
    };
  }

  const allSections = [];
  const psrAgentResults = [];
  let pmFeedback = null;
  let allDebateOutputs = null;

  // --- Pre-processing (parallel PSR agents) ---
  // Split filingContent into per-agent DataPackets and dispatch all PSR agents in parallel.
  // Annual readers: 1 per 10-K (up to 5). Quarterly readers: 1 for all 10-Qs.
  // This matches the CC skill orchestrator design — 7 agents max, all concurrent.
  //
  // PSR Reuse (inherit-pitch-deck): When running fullStory and Pitch Deck PSR sections
  // are available in dataPacket.pitchDeckSections, reuse them instead of re-dispatching.
  // The PSR agents are identical for both stages — same prompts, same configs, same output.
  {
    const pdSections = dataPacket.pitchDeckSections || [];
    const inheritedPsrSections = pdSections.filter(s =>
      s && (s.key === 'annual-reader' || s.key === 'quarterly-reader' ||
            s.agentRole === 'annual-reader' || s.agentRole === 'quarterly-reader' ||
            s.title?.includes('Annual') || s.title?.includes('Quarterly'))
    );

    if (stage === 'fullStory' && inheritedPsrSections.length > 0) {
      // Reuse Pitch Deck PSR findings — skip redundant API calls (~$4/run savings)
      console.log(`PSR REUSE: Inheriting ${inheritedPsrSections.length} PSR sections from Pitch Deck (skipping redundant API calls)`);
      for (const s of inheritedPsrSections) {
        console.log(`  Reused: ${s.title || s.key}`);
        allSections.push(s);
        psrAgentResults.push({ label: s.title || s.key, status: 'reused-from-pitch-deck' });
      }
      console.log(`PSR reuse complete: ${inheritedPsrSections.length} sections inherited\n`);

      // Write PSR summary to disk (Node.js CLI only, skipped in browser)
      if (typeof process !== 'undefined' && process.versions?.node) {
        try {
          const { mkdirSync, writeFileSync } = await import('fs');
          const { join } = await import('path');
          const reportsDir = join(process.cwd(), '.thes1s', 'reports', dataPacket.ticker.toUpperCase());
          mkdirSync(reportsDir, { recursive: true });
          writeFileSync(join(reportsDir, 'psr-summary.json'), JSON.stringify({
            agents: psrAgentResults,
            completed: psrAgentResults.length,
            failed: 0,
            total: psrAgentResults.length,
            reused: true,
            reusedFrom: 'pitchDeck',
            timestamp: new Date().toISOString(),
          }, null, 2));
        } catch { /* non-critical */ }
      }
    } else {
      // Fresh PSR dispatch — no Pitch Deck sections available or not fullStory stage
      const filingContent = dataPacket.filingContent || {};
      const annualKeys = Object.keys(filingContent).filter(k => k.startsWith('10-K')).sort();
      const quarterlyKeys = Object.keys(filingContent).filter(k => k.startsWith('10-Q')).sort();

      const psrDispatches = [];

      // One annual-reader per 10-K, each with only its year's filing
      for (const key of annualKeys) {
        const perYearPacket = { ...dataPacket, filingContent: { [key]: filingContent[key] } };
        const fyLabel = key; // e.g. "10-K-2026-02-04"
        psrDispatches.push({
          label: `annual-reader (${fyLabel})`,
          agent: 'annual-reader',
          promise: dispatchAgent('annual-reader', perYearPacket, {
            sectionAssignment: `Read the single 10-K filing provided in filingContent (${fyLabel}). Extract findings per the annual-reader schema.`,
            maxSearches: 0,
            maxTokens: 32768,
          }),
        });
      }

      // One quarterly-reader for all 10-Qs (≤4 filings per batch)
      if (quarterlyKeys.length > 0) {
        const quarterlyPacket = { ...dataPacket, filingContent: Object.fromEntries(quarterlyKeys.map(k => [k, filingContent[k]])) };
        psrDispatches.push({
          label: `quarterly-reader (${quarterlyKeys.join(', ')})`,
          agent: 'quarterly-reader',
          promise: dispatchAgent('quarterly-reader', quarterlyPacket, {
            sectionAssignment: `Read all ${quarterlyKeys.length} 10-Q filings provided in filingContent. Extract findings per the quarterly-reader schema.`,
            maxSearches: 0,
            maxTokens: 32768,
          }),
        });
      }

      // One quarterly-reader for earnings call transcripts (separate from 10-Q reader)
      const transcriptContent = dataPacket.transcriptContent || {};
      const transcriptKeys = Object.keys(transcriptContent);
      if (transcriptKeys.length > 0) {
        // Build a DataPacket with transcripts as the filing content so the agent reads them
        const transcriptPacket = { ...dataPacket, filingContent: {}, transcriptContent };
        psrDispatches.push({
          label: `quarterly-reader (transcripts: ${transcriptKeys.map(k => k.replace('transcript-', '')).join(', ')})`,
          agent: 'quarterly-reader',
          promise: dispatchAgent('quarterly-reader', transcriptPacket, {
            sectionAssignment: `Read all ${transcriptKeys.length} earnings call transcripts provided in transcriptContent. Focus on: management guidance changes, tone shifts, promise tracking, forward-looking statements, and Q&A insights. Cross-reference management promises across quarters. Extract findings per the quarterly-reader schema.`,
            maxSearches: 0,
            maxTokens: 32768,
          }),
        });
      }

      if (psrDispatches.length > 0) {
        console.log(`Dispatching ${psrDispatches.length} PSR agents in parallel...`);
        for (const d of psrDispatches) console.log(`  ${d.label}`);

        const psrResults = await Promise.allSettled(psrDispatches.map(d => d.promise));

        for (let i = 0; i < psrResults.length; i++) {
          const label = psrDispatches[i].label;
          if (psrResults[i].status === 'fulfilled') {
            const r = psrResults[i].value;
            if (r.error) {
              errors.push({ agent: label, step: 'pre-processing', error: r.error });
              psrAgentResults.push({ label, status: 'failed', error: r.error });
              console.warn(`PSR ${label} failed: ${r.error}`);
            } else if (r.section) {
              allSections.push(r.section);
              psrAgentResults.push({ label, status: 'complete' });
            }
            budget.record(label, r.usage);
            cacheMonitor.record(r.usage);
          } else {
            const err = psrResults[i].reason?.message || 'Unknown error';
            errors.push({ agent: label, step: 'pre-processing', error: err });
            psrAgentResults.push({ label, status: 'failed', error: err });
            console.warn(`PSR ${label} rejected: ${err}`);
          }
        }
        console.log(`PSR pre-processing complete: ${allSections.length} sections produced\n`);

        // Write PSR summary to disk (Node.js CLI only, skipped in browser)
        if (typeof process !== 'undefined' && process.versions?.node) {
          try {
            const { mkdirSync, writeFileSync } = await import('fs');
            const { join } = await import('path');
            const reportsDir = join(process.cwd(), '.thes1s', 'reports', dataPacket.ticker.toUpperCase());
            mkdirSync(reportsDir, { recursive: true });
            const transcriptKeys = Object.keys(dataPacket.transcriptContent || {});
            writeFileSync(join(reportsDir, 'psr-summary.json'), JSON.stringify({
              agents: psrAgentResults,
              completed: psrAgentResults.filter(r => r.status === 'complete').length,
              failed: psrAgentResults.filter(r => r.status === 'failed').length,
              total: psrAgentResults.length,
              transcripts: {
                available: transcriptKeys.length > 0,
                count: transcriptKeys.length,
                keys: transcriptKeys,
              },
              timestamp: new Date().toISOString(),
            }, null, 2));
          } catch { /* non-critical */ }
        }
      }
    }
  }

  // Extract PSR findings for downstream agents (D-02)
  // PSR sections come from pre-processing — match by agent role, key patterns, or title
  const psrSections = allSections.filter(s =>
    s && (s.key === 'annual-reader' || s.key === 'quarterly-reader' ||
          s.agentRole === 'annual-reader' || s.agentRole === 'quarterly-reader' ||
          s.title?.includes('Annual') || s.title?.includes('Quarterly'))
  );
  const formattedPsrFindings = formatPsrFindings(psrSections);
  // Use formatted PSR findings if available, otherwise fall back to caller-provided
  const psrFindingsForAgents = formattedPsrFindings || options.psrFindings || '';

  // --- Wave execution (parallel within, sequential between — per D-01) ---
  for (const wave of stageConfig.phases) {

    if (wave.isDebate) {
      // --- Sequential debate dispatch (per D-01, D-02) ---
      const debateOutputs = {};

      for (const step of wave.steps) {
        const debateContext = buildDebateContext(step.receivesContext, debateOutputs, allSections);
        const stepSchema = DEBATE_SCHEMAS[step.role];
        const maxSearches = step.webSearch ? (options.maxSearches || 5) : 0;

        try {
          const result = await dispatchAgent(step.agent, dataPacket, {
            stage,
            schema: stepSchema,
            debateContext,
            debateRole: step.role,
            maxSearches,
            sectionAssignment: `Debate step ${step.step}: ${step.role} — ${step.description || ''}`,
            priorSections: allSections.slice(),
            psrFindings: psrFindingsForAgents,
            pmFeedback,
            maxTokens: step.role === 'judge' ? 4096 : 8192,
          });

          if (result.error) {
            errors.push({ agent: step.agent, step: `debate-${step.role}`, error: result.error });
            console.warn(`Debate step ${step.step} (${step.role}) failed: ${result.error}`);
          } else {
            debateOutputs[step.role] = result.section;
          }

          budget.record(`${step.agent}:${step.role}`, result.usage);
          cacheMonitor.record(result.usage);
        } catch (err) {
          errors.push({ agent: step.agent, step: `debate-${step.role}`, error: err.message || 'Unknown error' });
          console.warn(`Debate step ${step.step} (${step.role}) threw: ${err.message}`);
        }
      }

      // 5th call: synthesis-writer composes S6 ReportSectionSchema (per D-04, D-05)
      // Guard: check which debate steps completed
      let composedS6 = null; // Hoisted for onWaveComplete access
      const expectedRoles = ['bull', 'bear', 'bull_rebuttal', 'judge'];
      const missingRoles = expectedRoles.filter(r => !debateOutputs[r]);
      if (missingRoles.length > 0) {
        console.warn(`DEBATE INCOMPLETE: Missing outputs for: ${missingRoles.join(', ')}. Synthesis-writer will compose S6 from partial debate.`);
        errors.push({ agent: 'debate-flow', step: 'debate-validation', error: `Missing debate outputs: ${missingRoles.join(', ')}` });
      }

      try {
        const allDebateJSON = Object.entries(debateOutputs)
          .map(([role, output]) => `## ${role}\n\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\``)
          .join('\n\n---\n\n');

        const missingNote = missingRoles.length > 0
          ? ` NOTE: The following debate steps failed and are missing: ${missingRoles.join(', ')}. Compose the section from whatever debate outputs are available. Acknowledge any gaps.`
          : '';

        const synthesisResult = await dispatchAgent('synthesis-writer', dataPacket, {
          stage,
          // No schema override — defaults to ReportSectionSchema
          debateContext: allDebateJSON,
          sectionAssignment: `Compose Section ${wave.outputSection}: Inversion & Rebuttal from debate outputs. Key: ${wave.outputKey}. Include ALL bear source URLs as clickable links in the narrative. Never drop a URL.${missingNote}`,
          priorSections: allSections.slice(),
          psrFindings: psrFindingsForAgents,
          pmFeedback,
          maxTokens: 16384,
          maxSearches: 0,
        });

        if (synthesisResult.error) {
          errors.push({ agent: 'synthesis-writer', step: 'debate-composition', error: synthesisResult.error });
        } else {
          composedS6 = synthesisResult.section;
          allSections.push(composedS6);
        }

        budget.record('synthesis-writer:composition', synthesisResult.usage);
        cacheMonitor.record(synthesisResult.usage);
      } catch (err) {
        errors.push({ agent: 'synthesis-writer', step: 'debate-composition', error: err.message || 'Unknown error' });
      }

      // Wave complete callback (notify runner of wave completion)
      // Include composed S6 alongside debate step outputs so onWaveComplete can mark it complete
      if (options.onWaveComplete) {
        const cacheSummary = cacheMonitor.getSummary();
        const feedback = await options.onWaveComplete(
          wave.phase,
          [...Object.values(debateOutputs), composedS6].filter(Boolean),
          budget.getSummary(),
          cacheSummary
        );
        if (feedback && typeof feedback === 'string') {
          pmFeedback = feedback;
        }
      }

      allDebateOutputs = debateOutputs;

    } else {
      // --- Parallel wave dispatch ---
      const waveAgents = wave.agents;

      // Dispatch all agents in this wave simultaneously via Promise.allSettled
      // Multi-section entries (sections.length > 1) use MultiSectionSchema to return
      // multiple sections from a single API call, reducing cacheWrite costs.
      const results = await Promise.allSettled(
        waveAgents.map(a => {
          const isMultiSection = a.sections && a.sections.length > 1;
          return dispatchAgent(a.agent, dataPacket, {
            stage,
            sectionAssignment: buildSectionAssignment(a.sections, stage),
            priorSections: allSections.slice(),
            psrFindings: psrFindingsForAgents,
            pmFeedback,
            maxSearches: options.maxSearches,
            ...(isMultiSection ? { schema: MultiSectionSchema, maxTokens: 32768 } : {}),
          });
        })
      );

      // Process results from this wave
      const waveResults = [];
      for (let i = 0; i < results.length; i++) {
        const agentName = waveAgents[i].agent;
        const isMultiSection = waveAgents[i].sections && waveAgents[i].sections.length > 1;
        if (results[i].status === 'fulfilled') {
          const r = results[i].value;
          if (r.error) {
            errors.push({ agent: agentName, wave: wave.phase, error: r.error });
          } else if (isMultiSection && r.section?.sections) {
            // Unwrap multi-section result — push each section individually
            for (const s of r.section.sections) {
              allSections.push(s);
            }
            waveResults.push(r);
          } else if (r.section) {
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

      // Wave complete callback (notify runner of wave completion)
      if (options.onWaveComplete) {
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
  }

  // --- Post-processing (synthesis) ---
  for (const step of stageConfig.postProcessing || []) {
    if (!step.agent) continue;

    const result = await dispatchAgent(step.agent, dataPacket, {
      stage,
      sectionAssignment: buildSectionAssignment(step.sections, stage),
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
    debateOutputs: allDebateOutputs,
    psrSummary: psrAgentResults,
  };
}

export const _testExports = { loadDispatchTable, buildSectionAssignment, formatPsrFindings, buildDebateContext };
