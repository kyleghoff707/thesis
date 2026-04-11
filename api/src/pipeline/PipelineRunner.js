// PipelineRunner — Durable Object for server-side pipeline execution
// Runs the full AI agent pipeline with no wall-clock limit.
// Checkpoints to D1 after each wave for crash recovery.
//
// This does NOT import pipelineManager.js or aiResearch.js directly
// (they have Vite ?raw / import.meta.env contamination that esbuild can't handle).
// Instead, it reimplements wave dispatch using the clean agentDispatch.js layer.

import { DurableObject } from 'cloudflare:workers';
import { assembleDataPacketServer } from './dataPacket.js';
import { dispatchAgentServer } from './agentDispatch.js';
import { DISPATCH_TABLE } from './curriculumBundle.js';

export class PipelineRunner extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/run') {
      const params = await request.json();

      // AWAIT the pipeline. This keeps the DO alive for the full 5-15 min run.
      // ctx.waitUntil() in DOs has the same ~30-60s kill limit as regular Workers.
      // The Worker route fire-and-forgets this stub.fetch() call so the HTTP
      // response to the user returns immediately (202).
      await this.runPipeline(params);

      return new Response(JSON.stringify({ status: 'completed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  async updateProgress(runId, updates) {
    // Whitelist allowed columns to prevent SQL injection via object keys
    const ALLOWED_COLUMNS = new Set([
      'status', 'current_wave', 'total_waves', 'progress', 'sections_json',
      'data_packet_json', 'error', 'budget_json', 'started_at', 'completed_at',
    ]);
    const safeEntries = Object.entries(updates).filter(([k]) => ALLOWED_COLUMNS.has(k));
    if (safeEntries.length === 0) return;

    const setClauses = safeEntries.map(([k]) => `${k} = ?`).join(', ');
    const values = safeEntries.map(([, v]) => v);
    try {
      await this.env.DB.prepare(
        `UPDATE pipeline_runs SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`
      ).bind(...values, runId).run();
    } catch (err) {
      console.warn(`Pipeline ${runId}: D1 write failed: ${err.message}`);
    }
  }

  async runPipeline({ runId, ticker, stage, userId, reportId }) {
    try {
      // ── Phase 1: Assemble DataPacket ──
      await this.updateProgress(runId, { status: 'assembling' });
      const dataPacket = await assembleDataPacketServer(ticker, this.env);
      await this.updateProgress(runId, {
        status: 'running',
        data_packet_json: JSON.stringify(dataPacket),
      });

      // ── Phase 2: Dispatch agents by stage ──
      const stageConfig = DISPATCH_TABLE[stage];
      if (!stageConfig) throw new Error(`Unknown stage: ${stage}`);

      let sections = [];
      let errors = [];

      if (stageConfig.mode === 'single-call') {
        // One Pager: single agent call
        const result = await this.dispatchOnePager(dataPacket, runId);
        sections = result.sections;
        errors = result.errors;
      } else {
        // Pitch Deck / Full Story: wave-based dispatch
        const result = await this.dispatchWaves(stageConfig, stage, dataPacket, runId);
        sections = result.sections;
        errors = result.errors;
      }

      // ── Phase 3: Save report ──
      const hasErrors = errors.length > 0;
      const finalStatus = hasErrors ? 'completed_with_errors' : 'completed';

      if (reportId && sections.length > 0) {
        // Verify report ownership before writing (prevents IDOR)
        const owns = await this.env.DB.prepare(
          'SELECT id FROM reports WHERE id = ? AND user_id = ?'
        ).bind(reportId, userId).first();

        if (owns) {
          const stageKey = stage;
          const stageData = {
            sections,
            errors,
            generatedAt: new Date().toISOString(),
          };

          await this.env.DB.prepare(
            `INSERT INTO report_stages (report_id, stage, data) VALUES (?, ?, ?)
             ON CONFLICT(report_id, stage) DO UPDATE SET data = excluded.data`
          ).bind(reportId, stageKey, JSON.stringify(stageData)).run();

          const stageNum = stage === 'onePager' ? 1 : stage === 'pitchDeck' ? 2 : 3;
          await this.env.DB.prepare(
            `UPDATE reports SET current_stage = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
          ).bind(stageNum, reportId, userId).run();
        }
      }

      // Log aggregate usage
      await this.logPipelineCost(userId, ticker, sections, runId);

      await this.updateProgress(runId, {
        status: finalStatus,
        completed_at: new Date().toISOString(),
        sections_json: JSON.stringify(sections),
        error: hasErrors ? JSON.stringify(errors) : null,
      });

    } catch (err) {
      console.warn(`Pipeline ${runId} failed:`, err.message);
      await this.updateProgress(runId, {
        status: 'failed',
        error: err.message,
      });
    }
  }

  // ── One Pager: single Sonnet call ──────────────────────────

  async dispatchOnePager(dataPacket, runId) {
    const errors = [];
    try {
      // Use the business-analyst agent with One Pager assignment
      const result = await dispatchAgentServer('business-analyst', dataPacket, {
        stage: 'onePager',
        sectionAssignment: 'Generate a complete One Pager analysis with all 6 sections: Company Info, Minimum Standards, Meaning, Growth Metrics, Valuation Summary, Overall Verdict.',
        maxSearches: 5,
        maxTokens: 16384,
      }, this.env);

      await this.updateProgress(runId, {
        current_wave: 1,
        progress: JSON.stringify({ wave: 1, status: 'completed' }),
      });

      if (result.error) {
        errors.push({ agent: 'onePager', error: result.error });
      }
      return { sections: result.section ? [result.section] : [], errors };
    } catch (err) {
      errors.push({ agent: 'onePager', error: err.message });
      return { sections: [], errors };
    }
  }

  // ── Multi-wave dispatch (Pitch Deck / Full Story) ──────────

  async dispatchWaves(stageConfig, stage, dataPacket, runId) {
    const allSections = [];
    const errors = [];
    const phases = stageConfig.phases || [];

    // Calculate total waves for progress
    const totalWaves = phases.length + (stageConfig.postProcessing?.length || 0);
    await this.updateProgress(runId, { total_waves: totalWaves });

    // ── Wave dispatch ──
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const waveNum = i + 1;

      await this.updateProgress(runId, {
        progress: JSON.stringify({
          wave: waveNum,
          totalWaves,
          phase: phase.description,
          status: 'dispatching',
        }),
      });

      if (phase.isDebate) {
        // Sequential debate dispatch
        const debateResult = await this.dispatchDebate(phase, stage, dataPacket, allSections, runId);
        allSections.push(...debateResult.sections);
        errors.push(...debateResult.errors);
      } else {
        // Parallel agent dispatch within wave
        const agents = phase.agents || [];
        const results = await Promise.allSettled(
          agents.map(a => {
            const sectionStr = (a.sections || []).join(', ');
            return dispatchAgentServer(a.agent, dataPacket, {
              stage,
              sectionAssignment: `Stage: ${stage}. Generate sections: ${sectionStr}`,
              priorSections: allSections.slice(),
              maxSearches: 5,
            }, this.env);
          })
        );

        for (let j = 0; j < results.length; j++) {
          const agentName = agents[j].agent;
          if (results[j].status === 'fulfilled') {
            const r = results[j].value;
            if (r.section) allSections.push(r.section);
            if (r.error) errors.push({ agent: agentName, wave: waveNum, error: r.error });
          } else {
            errors.push({ agent: agentName, wave: waveNum, error: results[j].reason?.message });
          }
        }
      }

      // Checkpoint after wave
      await this.updateProgress(runId, {
        current_wave: waveNum,
        sections_json: JSON.stringify(allSections),
        progress: JSON.stringify({
          wave: waveNum,
          totalWaves,
          sectionsCompleted: allSections.length,
          status: 'wave_complete',
        }),
      });
    }

    // ── Post-processing (synthesis) ──
    for (const step of stageConfig.postProcessing || []) {
      if (!step.agent) continue;
      try {
        const result = await dispatchAgentServer(step.agent, dataPacket, {
          stage,
          sectionAssignment: `Final synthesis pass across all sections.`,
          priorSections: allSections.slice(),
          maxSearches: 0,
        }, this.env);
        if (result.section) allSections.push(result.section);
        if (result.error) errors.push({ agent: step.agent, step: 'synthesis', error: result.error });
      } catch (err) {
        errors.push({ agent: step.agent, step: 'synthesis', error: err.message });
      }
    }

    return { sections: allSections, errors };
  }

  // ── Debate dispatch (Full Story Phase 2) ───────────────────

  async dispatchDebate(phase, stage, dataPacket, allSections, runId) {
    const sections = [];
    const errors = [];
    const debateOutputs = {};

    for (const step of phase.steps || []) {
      await this.updateProgress(runId, {
        progress: JSON.stringify({
          debate: true,
          step: step.step,
          role: step.role,
          status: 'dispatching',
        }),
      });

      try {
        // Build debate context from prior outputs
        let debateContext = '';
        for (const ctx of step.receivesContext || []) {
          if (ctx === 'sections_1_through_5') {
            const s1to5 = allSections.filter(s => s?.sectionNumber >= 1 && s?.sectionNumber <= 5);
            debateContext += s1to5.map(s =>
              `### ${s.title} (${s.verdict || s.status})\n${s.summary}\n${(s.narrative || '').slice(0, 2000)}`
            ).join('\n\n');
          } else if (ctx === 'bull_output' && debateOutputs.bull) {
            debateContext += `## Bull Thesis\n\n\`\`\`json\n${JSON.stringify(debateOutputs.bull, null, 2)}\n\`\`\``;
          } else if (ctx === 'bear_output' && debateOutputs.bear) {
            debateContext += `## Bear Inversion\n\n\`\`\`json\n${JSON.stringify(debateOutputs.bear, null, 2)}\n\`\`\``;
          } else if (ctx === 'bull_rebuttal_output' && debateOutputs.bull_rebuttal) {
            debateContext += `## Bull Rebuttal\n\n\`\`\`json\n${JSON.stringify(debateOutputs.bull_rebuttal, null, 2)}\n\`\`\``;
          }
        }

        const result = await dispatchAgentServer(step.agent, dataPacket, {
          stage,
          debateContext,
          debateRole: step.role,
          maxSearches: step.webSearch ? 5 : 0,
          sectionAssignment: `Debate step ${step.step}: ${step.role} — ${step.description || ''}`,
          priorSections: allSections.slice(),
          maxTokens: step.role === 'judge' ? 4096 : 8192,
        }, this.env);

        if (result.section) {
          debateOutputs[step.role] = result.section;
        }
        if (result.error) {
          errors.push({ agent: step.agent, step: `debate-${step.role}`, error: result.error });
        }
      } catch (err) {
        errors.push({ agent: step.agent, step: `debate-${step.role}`, error: err.message });
      }
    }

    // Compose final debate section from all outputs
    if (Object.keys(debateOutputs).length > 0) {
      try {
        const allDebateJSON = Object.entries(debateOutputs)
          .map(([role, output]) => `### ${role}\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\``)
          .join('\n\n');

        const compositionResult = await dispatchAgentServer('synthesis-writer', dataPacket, {
          stage,
          debateContext: allDebateJSON,
          sectionAssignment: `Compose Section ${phase.outputSection}: Inversion & Rebuttal from debate outputs.`,
          priorSections: allSections.slice(),
          maxTokens: 16384,
          maxSearches: 0,
        }, this.env);

        if (compositionResult.section) sections.push(compositionResult.section);
        if (compositionResult.error) errors.push({ agent: 'synthesis-writer', step: 'debate-composition', error: compositionResult.error });
      } catch (err) {
        errors.push({ agent: 'synthesis-writer', step: 'debate-composition', error: err.message });
      }
    }

    return { sections, errors };
  }

  // ── Cost logging ──────────────────────────────────────────

  async logPipelineCost(userId, ticker, sections, runId) {
    try {
      // Sum up token usage from all sections
      let totalInput = 0, totalOutput = 0;
      for (const s of sections) {
        if (s?.tokenCost) {
          totalInput += s.tokenCost.input || 0;
          totalOutput += s.tokenCost.output || 0;
        }
      }

      // Cost in millicents: dollars * 1000 (matches packages/pricing/index.js convention)
      // Sonnet pricing: $3/MTok input, $15/MTok output
      const costDollars = (totalInput * 3 / 1_000_000) + (totalOutput * 15 / 1_000_000);
      const costMc = Math.round(costDollars * 1000);

      await this.env.DB.prepare(
        `INSERT INTO api_usage (user_id, model, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, web_searches, cost_millicents,
         status, caller, ticker) VALUES (?, 'pipeline-aggregate', ?, ?, 0, 0, 0, ?, 'completed', 'pipeline', ?)`
      ).bind(userId, totalInput, totalOutput, costMc, ticker).run();
    } catch (err) {
      console.warn(`Pipeline ${runId}: cost logging failed: ${err.message}`);
    }
  }
}
