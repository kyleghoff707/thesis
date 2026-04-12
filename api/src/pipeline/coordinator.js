// Coordinator agent definition for Managed Agents.
// Builds the system prompt (wave logic in natural language), defines custom tool
// schemas, and handles lazy agent creation with caching via D1.

import { DISPATCH_TABLE } from './curriculumBundle.js';

const ANTHROPIC_API = 'https://api.anthropic.com';
const BETA_HEADER = 'managed-agents-2026-04-01';

// ─── Custom tool schemas ─────────────────────────────────────

export function getCustomToolSchemas() {
  return [
    {
      type: 'custom',
      name: 'get_data_packet',
      description: 'Fetch the complete financial DataPacket for a ticker. Call this ONCE at the start of every pipeline run. Returns a summary of available data fields. The full DataPacket is cached internally and passed to analyst agents automatically.',
      input_schema: {
        type: 'object',
        properties: {
          ticker: {
            type: 'string',
            description: 'Stock ticker symbol (e.g. AAPL, COST, SFM)',
          },
        },
        required: ['ticker'],
      },
    },
    {
      type: 'custom',
      name: 'run_agent',
      description: 'Dispatch a specialist analyst agent to generate report sections. Returns the agent output including section data, verdict, summary, red flags, and token usage. For parallel dispatch within a phase, call run_agent multiple times in the same turn.',
      input_schema: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            enum: ['business-analyst', 'competitor-evaluator', 'financial-analyst', 'management-evaluator', 'risk-analyst', 'synthesis-writer', 'valuation-specialist', 'annual-reader', 'quarterly-reader'],
            description: 'The specialist agent role to dispatch',
          },
          stage: {
            type: 'string',
            enum: ['onePager', 'pitchDeck', 'fullStory'],
            description: 'The pipeline stage',
          },
          sectionAssignment: {
            type: 'string',
            description: 'Instructions for the agent: which sections to generate and what to focus on',
          },
          priorSections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                verdict: { type: 'string' },
                summary: { type: 'string' },
                redFlags: { type: 'array', items: { type: 'string' } },
                status: { type: 'string' },
              },
            },
            description: 'Summaries of previously completed sections for cross-referencing',
          },
          debateRole: {
            type: 'string',
            enum: ['bull', 'bear', 'bull_rebuttal', 'judge'],
            description: 'For Full Story debate phase only: the role this agent plays',
          },
          debateContext: {
            type: 'string',
            description: 'For debate phase only: prior debate outputs as formatted text',
          },
          maxSearches: {
            type: 'integer',
            description: 'Maximum web searches allowed (default 5, set to 0 to disable)',
          },
          maxTokens: {
            type: 'integer',
            description: 'Maximum output tokens (default 16384)',
          },
          psrFindings: {
            type: 'string',
            description: 'Formatted Primary Source Reader findings from run_psr. Pass to all analysis agents for pitchDeck and fullStory stages.',
          },
        },
        required: ['role', 'stage', 'sectionAssignment'],
      },
    },
    {
      type: 'custom',
      name: 'run_psr',
      description: 'Run Primary Source Reader pre-processing. Fetches SEC filings (10-K, 10-Q) and earnings call transcripts, dispatches reading agents to extract qualitative insights, returns formatted findings for downstream analysis agents. Call ONCE after get_data_packet, before any run_agent calls. Only needed for pitchDeck and fullStory stages (not onePager).',
      input_schema: {
        type: 'object',
        properties: {
          ticker: {
            type: 'string',
            description: 'Stock ticker symbol',
          },
          stage: {
            type: 'string',
            enum: ['pitchDeck', 'fullStory'],
            description: 'Pipeline stage',
          },
        },
        required: ['ticker', 'stage'],
      },
    },
    {
      type: 'custom',
      name: 'save_progress',
      description: 'Checkpoint pipeline progress to the database. Call after each phase/wave completes so the user can see real-time progress in the UI.',
      input_schema: {
        type: 'object',
        properties: {
          runId: {
            type: 'string',
            description: 'Pipeline run ID (provided in the initial message)',
          },
          wave: {
            type: 'integer',
            description: 'Current wave/phase number (1-indexed)',
          },
          totalWaves: {
            type: 'integer',
            description: 'Total number of waves/phases for this stage',
          },
          status: {
            type: 'string',
            enum: ['assembling', 'running', 'debate', 'synthesis', 'completed'],
            description: 'Current pipeline status',
          },
          completedSections: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of sections completed so far',
          },
        },
        required: ['runId', 'wave', 'status'],
      },
    },
    {
      type: 'custom',
      name: 'save_report',
      description: 'Save the completed report to the database. Call ONCE when the entire pipeline is finished. Saves all sections, logs cost, and marks the pipeline as complete.',
      input_schema: {
        type: 'object',
        properties: {
          reportId: {
            type: 'string',
            description: 'Report ID to save sections under (provided in the initial message)',
          },
          stage: {
            type: 'string',
            enum: ['onePager', 'pitchDeck', 'fullStory'],
            description: 'Pipeline stage',
          },
          sections: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of completed ReportSection objects from run_agent calls',
          },
          errors: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of errors encountered during generation (if any)',
          },
        },
        required: ['reportId', 'stage', 'sections'],
      },
    },
  ];
}

// ─── Coordinator system prompt ───────────────────────────────

export function buildCoordinatorSystemPrompt() {
  // Build from dispatch-table.json but expressed as natural language instructions
  const pitchDeck = DISPATCH_TABLE.pitchDeck;
  const fullStory = DISPATCH_TABLE.fullStory;

  return `# Thes1s Investment Research Pipeline Coordinator

You are the orchestration coordinator for Thes1s, an AI-powered investment research platform that uses Rule One methodology. Your job is to execute a multi-phase research pipeline by dispatching specialist analyst agents via tools.

You do NOT produce analysis yourself. You dispatch agents, collect their output, pass context forward, checkpoint progress, and save the final report. You are the manager; the agents are the analysts.

## Your tools

1. **get_data_packet(ticker)** — Fetch financial data for a company. Call ONCE at the start.
2. **run_psr(ticker, stage)** — Run Primary Source Reader pre-processing. Fetches SEC filings and transcripts, returns formatted findings. Call ONCE after get_data_packet for pitchDeck and fullStory (skip for onePager).
3. **run_agent(role, stage, ...)** — Dispatch a specialist agent to generate report sections.
4. **save_progress(runId, wave, ...)** — Checkpoint progress to the database after each phase.
5. **save_report(reportId, stage, sections)** — Save the final report when the pipeline is complete.

## Initial message format

You will receive a message like:
"Generate a {stage} report for {ticker}. Run ID: {runId}. Report ID: {reportId}. User ID: {userId}."

Extract ticker, stage, runId, reportId, and userId from this message.

## Execution rules

1. **ALWAYS** call get_data_packet(ticker) first, before any run_agent calls.
2. For pitchDeck and fullStory: **ALWAYS** call run_psr(ticker, stage) after get_data_packet. Store the returned psrFindings string. Pass it to EVERY subsequent run_agent call via the psrFindings parameter. Skip this for onePager.
3. **ALWAYS** call save_progress after each phase/wave completes.
4. **ALWAYS** call save_report with ALL collected sections when the pipeline is fully complete.
4. For **parallel dispatch**: make multiple run_agent calls in the SAME response. The system executes them concurrently.
5. For **sequential steps** (debate): make ONE run_agent call per response. Wait for the result before the next step.
6. Pass prior section summaries as priorSections to later phases. For each completed section, include: title, verdict, summary, redFlags, status.
7. If an agent fails (error in result), note the error and continue with remaining agents. Include errors in save_report.
8. Do NOT modify agent prompts or methodology. You are a dispatcher, not a content producer.
9. When the initial message says "Report ID: none", still call save_report — the handler will skip the report write but still mark the pipeline as completed.

---

## Stage: onePager

Single call. No phases.

1. Call get_data_packet(ticker)
2. Call save_progress(runId, wave=1, totalWaves=1, status="running")
3. Call run_agent:
   - role: "business-analyst"
   - stage: "onePager"
   - sectionAssignment: "Generate a complete One Pager analysis with all 6 sections: Company Info, Minimum Standards, Meaning, Growth Metrics, Valuation Summary, Overall Verdict."
   - maxSearches: 5
4. Call save_report with the output section
5. Call save_progress(runId, wave=1, totalWaves=1, status="completed", completedSections=[section titles])

---

## Stage: pitchDeck

Pre-processing + ${pitchDeck.phases.length} phases + synthesis post-processing. Total waves: ${pitchDeck.phases.length + 1}.

### Pre-processing — Primary Source Readers
1. Call run_psr(ticker, "pitchDeck") — this fetches and reads SEC filings + earnings transcripts
2. Store the returned psrFindings string — you will pass it to every run_agent call below

### Phase 1 — ${pitchDeck.phases[0].description} (parallel)
Dispatch ALL agents in this phase IN THE SAME RESPONSE:
${pitchDeck.phases[0].agents.map(a => `- run_agent(role="${a.agent}", stage="pitchDeck", sectionAssignment="Generate sections ${a.sections.join(', ')}", psrFindings=<from run_psr>, maxSearches=5)`).join('\n')}

After all complete: save_progress(runId, wave=1, totalWaves=${pitchDeck.phases.length + 1}, status="running", completedSections=[...])

### Phase 2 — ${pitchDeck.phases[1].description} (parallel)
Pass Phase 1 section summaries as priorSections to ALL agents in this phase.
Dispatch ALL agents IN THE SAME RESPONSE:
${pitchDeck.phases[1].agents.map(a => `- run_agent(role="${a.agent}", stage="pitchDeck", sectionAssignment="Generate sections ${a.sections.join(', ')}", priorSections=[Phase 1 summaries], maxSearches=5)`).join('\n')}

After all complete: save_progress(runId, wave=2, ...)

### Phase 3 — ${pitchDeck.phases[2].description} (parallel)
Pass ALL prior section summaries as priorSections.
Dispatch ALL agents IN THE SAME RESPONSE:
${pitchDeck.phases[2].agents.map(a => `- run_agent(role="${a.agent}", stage="pitchDeck", sectionAssignment="Generate sections ${a.sections.join(', ')}", priorSections=[all prior summaries], maxSearches=5)`).join('\n')}

After all complete: save_progress(runId, wave=3, ...)

### Post-processing — Synthesis
- run_agent(role="synthesis-writer", stage="pitchDeck", sectionAssignment="Final synthesis and polish pass across all 10 sections. Ensure consistency, fix cross-references, smooth narrative flow.", priorSections=[all sections], maxSearches=0)

After complete: save_progress(runId, wave=${pitchDeck.phases.length + 1}, totalWaves=${pitchDeck.phases.length + 1}, status="completed", completedSections=[...])

Finally: save_report(reportId, stage="pitchDeck", sections=[all sections including synthesis], errors=[any errors])

---

## Stage: fullStory

Pre-processing + 2 phases. Phase 2 is the adversarial debate (STRICTLY SEQUENTIAL).

### Pre-processing — Primary Source Readers
1. Call run_psr(ticker, "fullStory") — fetches and reads SEC filings + earnings transcripts
2. Store the returned psrFindings string — pass to every run_agent call below

### Phase 1 — ${fullStory.phases[0].description} (parallel)
Dispatch ALL 5 agents IN THE SAME RESPONSE (include psrFindings from run_psr):
${fullStory.phases[0].agents.map(a => `- run_agent(role="${a.agent}", stage="fullStory", sectionAssignment="Generate section ${a.sections.join(', ')}: ${a.note || ''}", psrFindings=<from run_psr>, maxSearches=5)`).join('\n')}

After all complete: save_progress(runId, wave=1, totalWaves=2, status="running", completedSections=[...])

### Phase 2 — THE DEBATE (strictly sequential, 5 steps)

**CRITICAL**: Each debate step MUST be a separate response. Wait for each result before proceeding to the next step. Do NOT parallelize debate steps.

**Step 1 — Bull** (synthesis-writer):
- run_agent(role="synthesis-writer", stage="fullStory", sectionAssignment="Debate step 1: Present the bull investment thesis. Summarize the strongest investment case from all Phase 1 findings.", debateRole="bull", debateContext=[summaries of sections 1-5], maxSearches=0)

**Step 2 — Bear** (risk-analyst):
- run_agent(role="risk-analyst", stage="fullStory", sectionAssignment="Debate step 2: Attack every bull point with cited evidence. Find the strongest counter-arguments.", debateRole="bear", debateContext=[bull output as formatted text], maxSearches=5)

**Step 3 — Bull Rebuttal** (synthesis-writer):
- run_agent(role="synthesis-writer", stage="fullStory", sectionAssignment="Debate step 3: Respond to each bear point with evidence or honest acknowledgment.", debateRole="bull_rebuttal", debateContext=[bull output + bear output], maxSearches=0)

**Step 4 — Judge** (financial-analyst):
- run_agent(role="financial-analyst", stage="fullStory", sectionAssignment="Debate step 4: Score each exchange. Produce a structured verdict with final investment recommendation.", debateRole="judge", debateContext=[bull + bear + rebuttal outputs], maxSearches=0, maxTokens=4096)

**Step 5 — Composition** (synthesis-writer):
- run_agent(role="synthesis-writer", stage="fullStory", sectionAssignment="Compose Section 6: Inversion & Rebuttal. Weave all 4 debate outputs into a polished final section.", debateContext=[all 4 debate outputs as formatted text], maxSearches=0, maxTokens=16384)

After debate complete: save_progress(runId, wave=2, totalWaves=2, status="completed", completedSections=[all section titles])

Finally: save_report(reportId, stage="fullStory", sections=[all Phase 1 sections + debate composition section], errors=[any errors])

---

## Context passing format

When passing priorSections to later phases, summarize each completed section as:
{
  "title": "Section title",
  "verdict": "PASS/FAIL/CONCERN/etc",
  "summary": "2-3 sentence summary of findings",
  "redFlags": ["list", "of", "red", "flags"],
  "status": "complete"
}

When passing debateContext, format prior debate outputs as readable text:
"## Bull Thesis\\n{bull section narrative}\\n\\n## Bear Inversion\\n{bear section narrative}"

## Error handling

- If run_agent returns an error, record it: { agent: role, error: message }
- Continue with remaining agents in the phase
- Include all errors in the save_report call
- Do NOT retry failed agents (the handler already has internal retry logic)
- If get_data_packet fails, stop the pipeline — save_progress with status "completed" is not appropriate; instead just report the error via save_report with an empty sections array

## Important

- You are an orchestrator. Your only job is to dispatch agents in the right order and pass context forward.
- Do NOT generate investment analysis, financial data, or research content yourself.
- Do NOT skip any phases or agents defined in the stage workflow.
- Do NOT modify the sectionAssignment instructions beyond what is specified above.
- The analyst agents have their own prompts, curriculum, and methodology. Trust them to do their jobs.`;
}

// ─── Anthropic API helper with response validation ───────────

async function anthropicFetch(url, method, body, env, expectedFields = []) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': BETA_HEADER,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status} at ${url}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  for (const field of expectedFields) {
    if (!(field in data)) {
      console.warn(`Managed Agents API: missing expected field '${field}' in response from ${url}. Got keys: ${Object.keys(data).join(', ')}`);
    }
  }
  return data;
}

// ─── Agent creation + caching ────────────────────────────────

function hashString(str) {
  // Simple hash for change detection (not crypto)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

export async function ensureCoordinatorAgent(env) {
  const systemPrompt = buildCoordinatorSystemPrompt();
  const toolSchemas = getCustomToolSchemas();
  const promptHash = hashString(systemPrompt + JSON.stringify(toolSchemas));

  // Check D1 cache
  try {
    const cached = await env.DB.prepare(
      'SELECT agent_id FROM managed_agents WHERE prompt_hash = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(promptHash).first();

    if (cached?.agent_id) return cached.agent_id;
  } catch {
    // Table might not exist yet — fall through to create
  }

  // Create new agent via Managed Agents API
  // Tools use type: "custom" (not a separate custom_tools field)
  const agent = await anthropicFetch(`${ANTHROPIC_API}/v1/agents`, 'POST', {
    name: 'thes1s-coordinator',
    description: 'Thes1s investment research pipeline coordinator',
    model: 'claude-sonnet-4-6',
    system: systemPrompt,
    tools: toolSchemas,
  }, env, ['id']);

  const agentId = agent.id;

  // Cache in D1
  try {
    await env.DB.prepare(
      'INSERT INTO managed_agents (agent_id, prompt_hash) VALUES (?, ?)'
    ).bind(agentId, promptHash).run();
  } catch (err) {
    console.warn('Failed to cache agent_id in D1:', err.message);
  }

  return agentId;
}

// ─── Session lifecycle helpers ───────────────────────────────

export async function createSession(agentId, env) {
  // Ensure we have an environment (created once, cached in D1)
  const envId = await ensureEnvironment(env);

  return anthropicFetch(`${ANTHROPIC_API}/v1/sessions`, 'POST', {
    agent: agentId,
    environment_id: envId,
  }, env, ['id']);
}

async function ensureEnvironment(env) {
  // Check D1 cache
  try {
    const cached = await env.DB.prepare(
      'SELECT agent_id FROM managed_agents WHERE prompt_hash = ? LIMIT 1'
    ).bind('__environment__').first();
    if (cached?.agent_id) return cached.agent_id;
  } catch {}

  // Create environment
  const envData = await anthropicFetch(`${ANTHROPIC_API}/v1/environments`, 'POST', {
    name: 'thes1s-pipeline',
  }, env, ['id']);

  const envId = envData.id;

  // Cache in D1 (reuse managed_agents table with special hash)
  try {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO managed_agents (agent_id, prompt_hash) VALUES (?, ?)'
    ).bind(envId, '__environment__').run();
  } catch {}

  return envId;
}

export async function sendSessionEvent(sessionId, event, env) {
  // Wrap event in events array; normalize content to content blocks
  const wrappedEvent = { ...event };

  // Convert string content to content blocks array
  if (typeof wrappedEvent.content === 'string') {
    wrappedEvent.content = [{ type: 'text', text: wrappedEvent.content }];
  }

  return anthropicFetch(
    `${ANTHROPIC_API}/v1/sessions/${sessionId}/events`,
    'POST', { events: [wrappedEvent] }, env,
  );
}
