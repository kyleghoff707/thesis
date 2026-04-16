// Observatory Capture — records pipeline run data for the Observatory wiki.
// Hooks into run-pipeline.js to capture control variables, per-agent results,
// orchestrator decisions, and verdict checks without modifying pipeline behavior.
//
// Usage:
//   const capture = createRunCapture(ticker, stage, controlVars);
//   // ... pipeline runs ...
//   capture.recordWave(wave, agentResults, timing);
//   capture.recordAgent(role, wave, stage, input, output, usage, timing, quality);
//   capture.finalize(result, expectedVerdict);

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const OBSERVATORY_ROOT = join(process.cwd(), 'observatory');
const RUNS_DIR = join(OBSERVATORY_ROOT, 'runs');
const KNOWN_VERDICTS_PATH = join(OBSERVATORY_ROOT, 'known-verdicts.json');

// Generate a unique run ID: YYYYMMDD-HHMMSS-TICKER-STAGE
function generateRunId(ticker, stage) {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}-${ticker.toUpperCase()}-${stage}`;
}

// Compute SHA-256 hash of a DataPacket (for reproducibility tracking)
export function hashDataPacket(dataPacket) {
  // Deterministic: sort keys, exclude volatile fields
  const stable = { ...dataPacket };
  delete stable.assembledAt;  // timestamp changes every run
  delete stable.errors;       // transient assembly errors
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

// Load known verdicts from observatory/known-verdicts.json
function loadExpectedVerdict(ticker) {
  try {
    if (!existsSync(KNOWN_VERDICTS_PATH)) return null;
    const data = JSON.parse(readFileSync(KNOWN_VERDICTS_PATH, 'utf8'));
    const entry = data.verdicts?.[ticker.toUpperCase()];
    if (!entry) return null;
    return { verdict: entry.verdict, source: 'known-verdicts.json' };
  } catch {
    return null;
  }
}

// Summarize a section for the agent record (lightweight, no full narrative)
function summarizeSection(section) {
  if (!section) return null;
  return {
    key: section.key || 'unknown',
    sectionNumber: section.sectionNumber || null,
    verdict: section.verdict || null,
    confidence: section.confidence || null,
    redFlagCount: section.redFlags?.length || 0,
    citationCount: section.citations?.length || 0,
    narrativeLength: section.narrative?.length || 0,
    dataFieldCount: typeof section.data === 'object' ? Object.keys(section.data).length :
                    typeof section.data === 'string' ? (() => { try { return Object.keys(JSON.parse(section.data)).length; } catch { return 0; } })() : 0,
    tableCount: section.tables?.length || 0,
    chartCount: section.charts?.length || 0,
    summaryPreview: section.summary?.slice(0, 120) || null,
  };
}

// Extract the overall verdict from pipeline result
function extractOverallVerdict(result, stage) {
  if (!result?.sections?.length) return null;

  // One Pager: singleCallOutput has overallVerdict
  if (stage === 'onePager' && result.singleCallOutput?.overallVerdict) {
    return result.singleCallOutput.overallVerdict;
  }

  // Pitch Deck / Full Story: look for synthesis/overall section
  const overallSection = result.sections.find(s =>
    s?.key === 'overall_verdict' || s?.key === 'synthesis' ||
    s?.key === 'overall' || s?.sectionNumber === 11
  );
  if (overallSection?.verdict) return overallSection.verdict;

  // Fallback: majority verdict from all sections
  const verdicts = result.sections.map(s => s?.verdict).filter(Boolean);
  if (verdicts.length === 0) return null;
  const counts = {};
  for (const v of verdicts) counts[v] = (counts[v] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// Create a capture instance for a pipeline run
export function createRunCapture(ticker, stage, controlVariables = {}) {
  const runId = generateRunId(ticker, stage);
  const runDir = join(RUNS_DIR, runId);
  const agentsDir = join(runDir, 'agents');
  const startTime = new Date().toISOString();

  // Create run directory
  mkdirSync(agentsDir, { recursive: true });

  // State accumulated during the run
  const agentRecords = [];
  const dispatches = [];
  const retries = [];
  const stalls = [];
  const formatViolations = [];
  const dataGaps = [];
  const gateDecisions = [];

  return {
    runId,
    runDir,

    // Record a wave completion (called from onWaveComplete)
    recordWave(wave, stageName, agents, parallel, durationSeconds) {
      dispatches.push({
        wave,
        stage: stageName,
        agents: agents.map(a => typeof a === 'string' ? a : a.role || a.label || 'unknown'),
        parallel: parallel !== false,
        durationSeconds: durationSeconds || 0,
      });
    },

    // Record an individual agent's results
    recordAgent(agentRole, wave, stageName, input, output, usage, timing, qualitySignals) {
      const record = {
        runId,
        agentRole,
        wave,
        stage: stageName,
        sectionsAssigned: input.sectionsAssigned || [],
        input: {
          dataPacketSlice: input.dataPacketSlice || [],
          dataPacketSliceSize: input.dataPacketSliceSize || 0,
          priorSectionKeys: input.priorSectionKeys || [],
          priorSectionsCount: input.priorSectionsCount || 0,
          psrFindingsLength: input.psrFindingsLength || 0,
          model: input.model || controlVariables.models?.default || 'unknown',
          promptVersion: input.promptVersion || controlVariables.promptVersions?.[agentRole] || null,
        },
        output: {
          sectionsProduced: output.sections?.length || 0,
          sections: (output.sections || []).map(summarizeSection).filter(Boolean),
        },
        usage: {
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          cacheRead: usage.cacheRead || 0,
          cacheWrite: usage.cacheWrite || 0,
          webSearches: usage.webSearches || 0,
          cost: usage.cost || 0,
        },
        timing: {
          startedAt: timing.startedAt || null,
          completedAt: timing.completedAt || null,
          durationSeconds: timing.durationSeconds || 0,
        },
        qualitySignals: {
          formatValid: qualitySignals.formatValid !== false,
          schemaValid: qualitySignals.schemaValid !== false,
          requiredFieldsMissing: qualitySignals.requiredFieldsMissing || [],
          keyNormalized: qualitySignals.keyNormalized || false,
          retryCount: qualitySignals.retryCount || 0,
          retryReasons: qualitySignals.retryReasons || [],
          criticScores: qualitySignals.criticScores || {},
        },
      };

      agentRecords.push(record);

      // Write individual agent file
      const filename = `wave-${wave}-${agentRole}.json`;
      writeFileSync(join(agentsDir, filename), JSON.stringify(record, null, 2));

      return record;
    },

    // Record a retry event
    recordRetry(agent, wave, reason, attempt, resolved = false) {
      retries.push({ agent, wave, reason, attempt, resolved });
    },

    // Record a stall detection
    recordStall(agent, wave, durationSeconds, resolution) {
      stalls.push({
        agent, wave,
        detectedAt: new Date().toISOString(),
        durationSeconds,
        resolution,
      });
    },

    // Record a format violation
    recordFormatViolation(agent, violation, original, corrected, fixApplied) {
      formatViolations.push({ agent, violation, original, corrected, fixApplied });
    },

    // Record a data gap
    recordDataGap(description) {
      dataGaps.push(description);
    },

    // Record a gate decision (for all-stages mode)
    recordGateDecision(stageName, decision, reason) {
      gateDecisions.push({ stage: stageName, decision, reason });
    },

    // Finalize the run — writes manifest, orchestrator log, and verdict check
    finalize(result, options = {}) {
      const completedAt = new Date().toISOString();
      const expected = loadExpectedVerdict(ticker);
      const actualVerdict = extractOverallVerdict(result, stage);

      // Budget summary from pipeline result
      const budgetTotals = result.budget?.totals || {};

      // Compute total wall time
      const startMs = new Date(startTime).getTime();
      const endMs = new Date(completedAt).getTime();
      const totalWallTimeSeconds = (endMs - startMs) / 1000;

      // Build manifest
      const manifest = {
        runId,
        timestamp: startTime,
        completedAt,
        controlVariables: {
          ticker: ticker.toUpperCase(),
          stage,
          ...controlVariables,
        },
        expectedVerdict: expected?.verdict || null,
        actualVerdict,
        verdictMatch: expected ? (actualVerdict === expected.verdict) : null,
        stageResults: options.stageResults || undefined,
        pipelineMetrics: {
          assemblyTimeSeconds: options.assemblyTimeSeconds || 0,
          pipelineTimeSeconds: options.pipelineTimeSeconds || 0,
          totalWallTimeSeconds,
          totalCost: budgetTotals.cost || 0,
          totalInputTokens: budgetTotals.inputTokens || 0,
          totalOutputTokens: budgetTotals.outputTokens || 0,
          cacheHitRate: (budgetTotals.inputTokens > 0 && budgetTotals.cacheRead > 0)
            ? budgetTotals.cacheRead / (budgetTotals.inputTokens + budgetTotals.cacheRead)
            : 0,
          sectionsProduced: result.sections?.length || 0,
          sectionsExpected: options.sectionsExpected || null,
          errorsCount: result.errors?.length || 0,
        },
        agentFiles: agentRecords.map(r => `agents/wave-${r.wave}-${r.agentRole}.json`),
      };

      // Orchestrator log
      const orchestratorLog = {
        runId,
        dispatches,
        retries,
        stallsDetected: stalls,
        formatViolations,
        dataGaps,
        gateDecisions: gateDecisions.length > 0 ? gateDecisions : undefined,
      };

      // Verdict check
      const sectionVerdicts = {};
      const verdictCounts = {};
      for (const section of (result.sections || [])) {
        if (section?.key && section?.verdict) {
          sectionVerdicts[section.key] = section.verdict;
          verdictCounts[section.verdict] = (verdictCounts[section.verdict] || 0) + 1;
        }
      }

      const verdictCheck = {
        runId,
        ticker: ticker.toUpperCase(),
        expectedVerdict: expected?.verdict || null,
        expectedSource: expected?.source || null,
        actualVerdict,
        match: expected ? (actualVerdict === expected.verdict) : null,
        sectionVerdicts,
        verdictDistribution: verdictCounts,
      };

      // Write files
      writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      writeFileSync(join(runDir, 'orchestrator.json'), JSON.stringify(orchestratorLog, null, 2));
      writeFileSync(join(runDir, 'verdict-check.json'), JSON.stringify(verdictCheck, null, 2));

      // Append to log.md
      try {
        const logPath = join(OBSERVATORY_ROOT, 'log.md');
        const matchStr = expected ? (actualVerdict === expected.verdict ? 'MATCH' : 'MISMATCH') : 'no expected verdict';
        const costStr = manifest.pipelineMetrics.totalCost.toFixed(2);
        const durMin = (manifest.pipelineMetrics.totalWallTimeSeconds / 60).toFixed(0);
        const failureCount = formatViolations.length + retries.length + stalls.length;
        const failureStr = failureCount > 0
          ? `\n- Failures: ${failureCount} (${formatViolations.length} format violations, ${retries.length} retries, ${stalls.length} stalls)`
          : '\n- Failures: none';

        const entry = `\n## [${completedAt.slice(0, 10)}] run | ${ticker.toUpperCase()} ${stage} | ${runId}\n` +
          `- Verdict: ${actualVerdict || 'unknown'} (expected: ${expected?.verdict || 'not set'}) — ${matchStr}\n` +
          `- Cost: $${costStr} | Duration: ${durMin}min | Sections: ${manifest.pipelineMetrics.sectionsProduced}/${manifest.pipelineMetrics.sectionsExpected || '?'}` +
          failureStr + '\n';

        const currentLog = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
        writeFileSync(logPath, currentLog + entry);
      } catch (err) {
        console.warn(`Observatory: failed to append to log.md: ${err.message}`);
      }

      console.log(`\nObservatory: Run ${runId} captured to observatory/runs/${runId}/`);
      console.log(`  Verdict: ${actualVerdict || 'unknown'} (expected: ${expected?.verdict || 'not set'})`);
      console.log(`  Agents recorded: ${agentRecords.length}`);
      console.log(`  Format violations: ${formatViolations.length} | Retries: ${retries.length} | Stalls: ${stalls.length}`);

      return { runId, manifest, orchestratorLog, verdictCheck };
    },
  };
}
