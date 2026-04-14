// Pitch Deck Wave Dispatch — Worker-side orchestration for the Pitch Deck pipeline.
// Creates one Managed Agent session per specialist agent, dispatches in wave order,
// and collects section outputs. Driven by client polling (each /status call advances
// the pipeline if the current wave is complete).
//
// This is the Option B path (no callable_agents). When multiagent Research Preview
// access is granted, this can be replaced with a single coordinator session using
// callable_agents — the agent prompts and wave structure are identical.

const ANTHROPIC_API = 'https://api.anthropic.com';
const BETA_HEADER = 'managed-agents-2026-04-01';

// ─── Wave Definitions ───────────────────────────────────────
// Each wave is an array of agent dispatches that can run in parallel.
// Agents within a wave are independent; waves are sequential.

const WAVE_DEFS = [
  // Wave 0: PSR — Primary Source Readers
  {
    wave: 0,
    agents: [
      { key: 'annual_reader', envKey: 'MA_PD_ANNUAL_READER', sections: [] },
      { key: 'quarterly_reader', envKey: 'MA_PD_QUARTERLY_READER', sections: [] },
    ],
  },
  // Wave 1: Business Context
  {
    wave: 1,
    agents: [
      { key: 'business_analyst', envKey: 'MA_PD_BUSINESS_ANALYST', sections: ['radar', 'simple_predictable'] },
      { key: 'competitor_market', envKey: 'MA_PD_COMPETITOR_MARKET', sections: ['market_position'] },
    ],
  },
  // Wave 2: Deep Analysis (Moats needs Section 3 from Wave 1)
  {
    wave: 2,
    agents: [
      { key: 'competitor_moats', envKey: 'MA_PD_COMPETITOR_MOATS', sections: ['barriers_and_moats'] },
      { key: 'financial_analyst', envKey: 'MA_PD_FINANCIAL_ANALYST', sections: ['fcf', 'roe_roic_debt', 'balance_sheet'] },
      { key: 'management_evaluator', envKey: 'MA_PD_MANAGEMENT_EVALUATOR', sections: ['management'] },
    ],
  },
  // Wave 3: Risk & Valuation
  {
    wave: 3,
    agents: [
      { key: 'risk_analyst', envKey: 'MA_PD_RISK_ANALYST', sections: ['pest_risks'] },
      { key: 'valuation_specialist', envKey: 'MA_PD_VALUATION_SPECIALIST', sections: ['valuation'] },
    ],
  },
  // Wave 4: Synthesis
  {
    wave: 4,
    agents: [
      { key: 'synthesis_writer', envKey: 'MA_PD_SYNTHESIS_WRITER', sections: ['overall_verdict'] },
    ],
  },
];

const TOTAL_WAVES = WAVE_DEFS.length;

// ─── DataPacket Slicing ─────────────────────────────────────
// Each agent gets only the DataPacket fields it needs.

function sliceForAgent(agentKey, dataPacket, priorOutputs) {
  const dp = dataPacket;
  const base = { ticker: dp.ticker, companyInfo: dp.companyInfo, classification: dp.classification, caveats: dp.caveats };

  const slices = {
    annual_reader: {
      ...base,
      financials: dp.financials, ttm: dp.ttm,
      filingContent: dp.filingContent,
    },
    quarterly_reader: {
      ...base,
      financials: dp.financials, ttm: dp.ttm,
      filingContent: dp.filingContent,
      transcriptContent: dp.transcriptContent,
    },
    business_analyst: {
      ...base,
      peers: dp.peers, gurus: dp.gurus, financials: dp.financials,
      psrFindings: { annual: priorOutputs.annual_reader, quarterly: priorOutputs.quarterly_reader },
    },
    competitor_market: {
      ...base,
      peers: dp.peers, peerMetrics: dp.peerMetrics, financials: dp.financials,
      psrFindings: { annual: priorOutputs.annual_reader, quarterly: priorOutputs.quarterly_reader },
    },
    competitor_moats: {
      ...base,
      peerMetrics: dp.peerMetrics, financials: dp.financials,
      returnMetrics: dp.returnMetrics, growthRates: dp.growthRates, ruleOneScore: dp.ruleOneScore,
      section3Output: priorOutputs.competitor_market,
      psrFindings: { annual: priorOutputs.annual_reader, quarterly: priorOutputs.quarterly_reader },
    },
    financial_analyst: {
      ...base,
      financials: dp.financials, ttm: dp.ttm, fcf: dp.fcf,
      returnMetrics: dp.returnMetrics, growthRates: dp.growthRates,
      psrFindings: { annual: priorOutputs.annual_reader, quarterly: priorOutputs.quarterly_reader },
    },
    management_evaluator: {
      ...base,
      compensation: dp.compensation, insiders: dp.insiders, gurus: dp.gurus,
      financials: dp.financials, returnMetrics: dp.returnMetrics,
      psrFindings: { annual: priorOutputs.annual_reader, quarterly: priorOutputs.quarterly_reader },
    },
    risk_analyst: {
      ...base,
      analystEstimates: dp.analystEstimates, financials: dp.financials, peers: dp.peers,
      priorSectionOutputs: priorOutputs,
      psrFindings: { annual: priorOutputs.annual_reader, quarterly: priorOutputs.quarterly_reader },
    },
    valuation_specialist: {
      ...base,
      growthRates: dp.growthRates, returnMetrics: dp.returnMetrics, fcf: dp.fcf,
      analystEstimates: dp.analystEstimates, ttm: dp.ttm, keyMetrics: dp.keyMetrics,
      financials: dp.financials,
      section3Output: priorOutputs.competitor_market,
      section4Output: priorOutputs.competitor_moats,
      psrFindings: { annual: priorOutputs.annual_reader, quarterly: priorOutputs.quarterly_reader },
    },
    synthesis_writer: {
      ticker: dp.ticker, companyInfo: dp.companyInfo,
      allSectionOutputs: priorOutputs,
    },
  };

  return slices[agentKey] || base;
}

// ─── Message Building ───────────────────────────────────────

function buildAgentMessage(agentKey, ticker, companyName, dataSlice) {
  const header = `Analyze ${ticker} (${companyName}).`;

  if (agentKey === 'synthesis_writer') {
    return `${header}\n\nBelow are the outputs from all 10 specialist agent sections. Synthesize them into the overall verdict.\n\n\`\`\`json\n${JSON.stringify(dataSlice.allSectionOutputs, null, 2)}\n\`\`\``;
  }

  return `${header}\n\nBelow is your input data. Read it and produce your section output as JSON.\n\n\`\`\`json\n${JSON.stringify(dataSlice, null, 2)}\n\`\`\``;
}

// ─── Session Management ─────────────────────────────────────

function anthropicHeaders(env) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BETA_HEADER,
  };
}

/**
 * Create a Managed Agent session and send the initial message.
 * Returns the session ID.
 */
async function dispatchAgent(agentId, environmentId, message, env) {
  // Create session
  const sessionRes = await fetch(`${ANTHROPIC_API}/v1/sessions`, {
    method: 'POST',
    headers: anthropicHeaders(env),
    body: JSON.stringify({ agent: agentId, environment_id: environmentId }),
  });
  if (!sessionRes.ok) {
    const text = await sessionRes.text();
    throw new Error(`Session create failed (${sessionRes.status}): ${text.slice(0, 300)}`);
  }
  const session = await sessionRes.json();

  // Send message
  const sendRes = await fetch(`${ANTHROPIC_API}/v1/sessions/${session.id}/events`, {
    method: 'POST',
    headers: anthropicHeaders(env),
    body: JSON.stringify({
      events: [{ type: 'user.message', content: [{ type: 'text', text: message }] }],
    }),
  });
  if (!sendRes.ok) {
    const text = await sendRes.text();
    throw new Error(`Message send failed (${sendRes.status}): ${text.slice(0, 300)}`);
  }

  return session.id;
}

/**
 * Poll a session's events to check if it's complete.
 * Returns { done: boolean, output: string|null, usage: { input, output } }
 */
async function pollSession(sessionId, env) {
  const res = await fetch(`${ANTHROPIC_API}/v1/sessions/${sessionId}/events`, {
    headers: anthropicHeaders(env),
  });
  if (!res.ok) return { done: false, output: null, usage: { input: 0, output: 0 } };

  const data = await res.json();
  const events = data.events || data.data || [];

  const idleEvent = events.find(e =>
    e.type === 'session.status_idle' && e.stop_reason?.type === 'end_turn'
  );
  const terminated = events.find(e => e.type === 'session.status_terminated');

  if (!idleEvent && !terminated) {
    return { done: false, output: null, usage: { input: 0, output: 0 } };
  }

  // Extract output text from the last agent message
  const agentMessage = [...events].reverse().find(e => e.type === 'agent.message');
  let output = null;
  if (agentMessage?.content) {
    output = agentMessage.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
  }

  // Sum usage
  const usageEvents = events.filter(e => e.type === 'span.model_request_end' && e.model_usage);
  let totalInput = 0, totalOutput = 0;
  for (const u of usageEvents) {
    totalInput += (u.model_usage.input_tokens || 0) +
      (u.model_usage.cache_read_input_tokens || 0) +
      (u.model_usage.cache_creation_input_tokens || 0);
    totalOutput += u.model_usage.output_tokens || 0;
  }

  return { done: true, output, usage: { input: totalInput, output: totalOutput } };
}

/**
 * Parse section JSON from an agent's text output.
 * Agents return JSON in a ```json code block, or raw JSON.
 */
function parseAgentOutput(text) {
  if (!text) return null;
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;
  try {
    return JSON.parse(jsonStr.trim());
  } catch {
    return null;
  }
}

// ─── Wave Dispatch & Advancement ────────────────────────────

/**
 * Start a wave: dispatch all agents in the wave in parallel.
 * Returns an array of { key, sessionId } for tracking.
 */
export async function startWave(waveNum, ticker, companyName, dataPacket, priorOutputs, env) {
  const waveDef = WAVE_DEFS[waveNum];
  if (!waveDef) throw new Error(`Invalid wave number: ${waveNum}`);

  const dispatches = [];
  const errors = [];

  await Promise.allSettled(
    waveDef.agents.map(async (agent) => {
      const agentId = env[agent.envKey];
      if (!agentId) {
        errors.push(`${agent.key}: missing env var ${agent.envKey}`);
        return;
      }

      const dataSlice = sliceForAgent(agent.key, dataPacket, priorOutputs);
      const message = buildAgentMessage(agent.key, ticker, companyName, dataSlice);

      try {
        const sessionId = await dispatchAgent(agentId, env.MA_ENVIRONMENT_ID, message, env);
        dispatches.push({ key: agent.key, sessionId, sections: agent.sections });
      } catch (e) {
        errors.push(`${agent.key}: ${e.message}`);
      }
    })
  );

  return { dispatches, errors };
}

/**
 * Check if all sessions in a wave are complete.
 * Returns { allDone, outputs: { agentKey: parsedJSON }, usage, errors }
 */
export async function checkWave(waveDispatches, env) {
  const outputs = {};
  let allDone = true;
  let totalInput = 0, totalOutput = 0;
  const errors = [];

  for (const { key, sessionId } of waveDispatches) {
    const result = await pollSession(sessionId, env);
    totalInput += result.usage.input;
    totalOutput += result.usage.output;

    if (!result.done) {
      allDone = false;
      continue;
    }

    const parsed = parseAgentOutput(result.output);
    if (parsed) {
      outputs[key] = parsed;
    } else {
      errors.push(`${key}: could not parse agent output`);
      outputs[key] = { error: 'Failed to parse output', raw: result.output?.slice(0, 500) };
    }
  }

  return { allDone, outputs, usage: { input: totalInput, output: totalOutput }, errors };
}

/**
 * Assemble the final sections array from all collected outputs.
 */
export function assembleFinalSections(allOutputs) {
  const SECTION_ORDER = [
    { key: 'radar', agentKey: 'business_analyst', sectionNumber: 1, title: 'Radar' },
    { key: 'simple_predictable', agentKey: 'business_analyst', sectionNumber: 2, title: 'Simple & Predictable' },
    { key: 'market_position', agentKey: 'competitor_market', sectionNumber: 3, title: 'Dominant Market Position' },
    { key: 'barriers_and_moats', agentKey: 'competitor_moats', sectionNumber: 4, title: 'Large Barrier to Entry & Moats' },
    { key: 'fcf', agentKey: 'financial_analyst', sectionNumber: 5, title: 'Free Cash Flow Generative' },
    { key: 'management', agentKey: 'management_evaluator', sectionNumber: 6, title: 'Management Talent & Integrity' },
    { key: 'roe_roic_debt', agentKey: 'financial_analyst', sectionNumber: 7, title: 'ROE / ROIC / ROA & Debt' },
    { key: 'balance_sheet', agentKey: 'financial_analyst', sectionNumber: 8, title: 'Strong Balance Sheet' },
    { key: 'pest_risks', agentKey: 'risk_analyst', sectionNumber: 9, title: 'Limited Exposure to P.E.S.T Risks' },
    { key: 'valuation', agentKey: 'valuation_specialist', sectionNumber: 10, title: 'Valuation' },
    { key: 'overall_verdict', agentKey: 'synthesis_writer', sectionNumber: 11, title: 'Overall Verdict' },
  ];

  const sections = [];
  for (const def of SECTION_ORDER) {
    const agentOutput = allOutputs[def.agentKey];
    if (!agentOutput) {
      sections.push({
        key: def.key, title: def.title, sectionNumber: def.sectionNumber,
        status: 'error', confidence: 'LOW', verdict: null,
        verdictRationale: '', summary: 'Agent did not produce output',
        data: {}, narrative: 'This section was not generated — the agent did not return output.',
        citations: [], tables: [], charts: [], redFlags: [],
        primarySourceInsights: [], crossCuttingFindings: [],
        modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 0, output: 0 },
      });
      continue;
    }

    // Agent output can be a single section object or an array of sections
    if (Array.isArray(agentOutput)) {
      // Multi-section agent (business_analyst returns 2, financial_analyst returns 3)
      const match = agentOutput.find(s => s.key === def.key);
      sections.push(match || {
        key: def.key, title: def.title, sectionNumber: def.sectionNumber,
        status: 'error', narrative: `Section ${def.key} not found in agent output`,
      });
    } else if (agentOutput.key === def.key) {
      sections.push(agentOutput);
    } else if (agentOutput.error) {
      sections.push({
        key: def.key, title: def.title, sectionNumber: def.sectionNumber,
        status: 'error', narrative: `Agent error: ${agentOutput.error}`,
      });
    } else {
      // Single-section agent output — use as-is
      sections.push({ ...agentOutput, key: def.key, sectionNumber: def.sectionNumber });
    }
  }

  return sections;
}

export { WAVE_DEFS, TOTAL_WAVES, parseAgentOutput };
