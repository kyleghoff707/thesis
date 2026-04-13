# Phase 16: API Migration - Research

**Researched:** 2026-03-31
**Domain:** Claude API structured output dispatch, sequential debate orchestration, Zod schema design
**Confidence:** HIGH

## Summary

Phase 16 migrates the Full Story pipeline from CC skill-based orchestration to Claude API dispatch using the proven aiResearch.js + pipelineManager.js infrastructure. The core challenge is extending pipelineManager.js to handle a new dispatch pattern: the 4-step adversarial debate (bull, bear, bull_rebuttal, judge) which must execute sequentially with inter-step context passing, plus a 5th synthesis call to compose the final S6 ReportSectionSchema. All other Full Story sections (S1-S5) can reuse the existing wave-based parallel dispatch pattern identically to Pitch Deck.

The infrastructure is mature. aiResearch.js handles structured output via `client.messages.parse()` with `zodOutputFormat()`, retry-escalate error handling, web search URL extraction, citation enrichment, and cost tracking. pipelineManager.js handles wave orchestration with Promise.allSettled, checkpoint callbacks, budget tracking, and cache monitoring. The gap is exclusively in the debate dispatch branch: pipelineManager.js has zero code for sequential dispatch, multi-schema support (DebateStepSchema vs ReportSectionSchema), context routing between steps, or synthesis composition. All of this is new code.

**Primary recommendation:** Extend pipelineManager.js with an `if (wave.isDebate)` branch that loops through `wave.steps` sequentially, dispatches each via a modified `dispatchAgent()` that accepts an optional `schema` parameter (defaulting to ReportSectionSchema), routes context between steps via the `receivesContext` array from dispatch-table.json, and calls synthesis-writer as a 5th step to produce the final S6 ReportSectionSchema. Define DebateStepSchema in Zod (new file `src/schemas/debateStep.js`) alongside the existing ReportSectionSchema.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Extend pipelineManager.js with an `if (wave.isDebate)` branch for sequential debate dispatch. Do NOT create a separate debateDispatcher.js. Keeps all dispatch logic in one file and reuses existing retry, budget, and cache infrastructure.
- **D-02:** Debate steps execute sequentially within pipelineManager. Each step receives prior step outputs via the `receivesContext` array from dispatch-table.json. Bull output -> bear input, bull+bear -> rebuttal input, all three -> judge input.
- **D-03:** Web search is gated per step -- only bear (step 2) gets `web_search` tool. Check `step.webSearch` before adding tool to the dispatch call.
- **D-04:** Use a 5th AI call (synthesis-writer agent) to compose the 4 debate step outputs into the final S6 ReportSectionSchema. This matches the CC skill pattern that produced 91/100 quality.
- **D-05:** The synthesis call is the ONLY call that returns a ReportSectionSchema for S6. The 4 intermediate debate steps return DebateStepSchema (lightweight format per D-06 from Phase 14).
- **D-06:** Raise the full pipeline cost ceiling from $12 to $15.
- **D-07:** Cost breakdown is tracked per-agent and per-step via contextBudget.js. Full Story cost is reported separately from Pitch Deck cost.
- **D-08:** Re-run SFM Full Story via API, run quality scorer (run-quality-v4.js), compare against CC baseline (89 mechanical / 88 methodology). Accept if within 5 points of baseline.
- **D-09:** Quality validation happens within Phase 16 (not deferred to Phase 17).

### Claude's Discretion
- Model selection per agent/step (Opus vs Sonnet) -- optimize for quality within $15 ceiling
- DebateStepSchema Zod definition -- adapt from existing JSON schema in agents/orchestrator/schemas/
- max_tokens per step -- size based on CC output token counts
- Cache strategy for debate context passing -- whether to cache bull/bear outputs in system message blocks

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | Full Story pipeline migrated from CC to Claude API dispatch using existing aiResearch.js infrastructure | pipelineManager.js debate branch + dispatchAgent schema parameter extension fully maps the CC skill's 10 agent calls (5 parallel S1-S5 + 5 sequential debate) to API dispatch |
| API-02 | Structured output enforcement for all Full Story sections including debate and checklist formats | DebateStepSchema (Zod) for 4 debate steps + ReportSectionSchema for S1-S5 and S6 synthesis; checklist data enforced via existing ReportSectionSchema.data JSON string pattern |
| API-03 | Cost per Full Story and full pipeline (OP+PD+FS) benchmarked against target ceiling | contextBudget.js already tracks per-agent cost; extend budget summary with stage-level aggregation; measure against $15 revised ceiling |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | 0.78.0 (installed) | Claude API client with structured outputs | Already proven in Phases 8-10; `client.messages.parse()` + `zodOutputFormat()` |
| zod | 4.3.6 (installed) | Runtime schema validation for structured outputs | Already used for ReportSectionSchema; extends naturally to DebateStepSchema |
| vitest | 4.1.0 (installed) | Unit testing | 173+ existing engine tests; test the debate branch |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | -- | -- | All dependencies are already installed |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Existing Infrastructure Map

The implementation extends 4 files and creates 1-2 new files. Here is the full picture:

```
src/
├── engines/
│   ├── aiResearch.js          — EXTEND: add optional schema parameter to dispatchAgent
│   ├── pipelineManager.js     — EXTEND: add isDebate branch for sequential dispatch
│   ├── contextBudget.js       — REUSE: per-agent cost tracking (works as-is)
│   └── cacheMonitor.js        — REUSE: cache hit monitoring (works as-is)
├── schemas/
│   ├── reportSection.js       — REUSE: ReportSectionSchema for S1-S5 and S6 synthesis
│   └── debateStep.js          — NEW: DebateStepSchema (Zod) for debate steps 1-4
agents/
└── orchestrator/
    ├── dispatch-table.json    — REUSE: fullStory config already has isDebate + steps structure
    └── schemas/
        ├── debate-step.schema.json     — REFERENCE: JSON schema to translate into Zod
        └── checklist-item.schema.json  — REFERENCE: already enforced via data field pattern
scripts/
└── run-full-story.js          — NEW: Node script to run Full Story pipeline (like existing Pitch Deck runner)
```

### Pattern 1: Debate Branch in pipelineManager.js

**What:** Inside the existing `for (const wave of stageConfig.phases)` loop, add an `if (wave.isDebate)` branch that processes `wave.steps` sequentially instead of dispatching `wave.agents` in parallel.

**When to use:** When the dispatch-table.json phase has `isDebate: true`.

**Key design:**
```javascript
// Inside the existing wave loop in runPipeline():
for (const wave of stageConfig.phases) {
  if (wave.isDebate) {
    // Sequential debate dispatch
    const debateOutputs = {};
    for (const step of wave.steps) {
      // Build context from prior step outputs per receivesContext
      const debateContext = buildDebateContext(step.receivesContext, debateOutputs, allSections);

      // Gate web search per step
      const maxSearches = step.webSearch ? (options.maxSearches || 5) : 0;

      // Dispatch with DebateStepSchema (not ReportSectionSchema)
      const result = await dispatchAgent(step.agent, dataPacket, {
        schema: DebateStepSchema,
        debateContext,
        debateRole: step.role,
        maxSearches,
        sectionAssignment: `Debate step ${step.step}: ${step.role}`,
        priorSections: allSections.slice(),
        psrFindings: psrFindingsForAgents,
      });

      debateOutputs[step.role] = result.section;
      budget.record(`${step.agent}:${step.role}`, result.usage);
      cacheMonitor.record(result.usage);
    }

    // 5th call: synthesis-writer composes S6 ReportSectionSchema
    const synthesisResult = await dispatchAgent('synthesis-writer', dataPacket, {
      // schema defaults to ReportSectionSchema
      debateContext: debateOutputs,
      sectionAssignment: 'Compose Section 6: Inversion & Rebuttal from debate outputs',
      priorSections: allSections.slice(),
    });

    allSections.push(synthesisResult.section);
    budget.record('synthesis-writer:composition', synthesisResult.usage);

    // Checkpoint after debate
    if (wave.checkpoint?.after && options.onWaveComplete) { ... }

  } else {
    // Existing parallel wave dispatch (unchanged)
    ...
  }
}
```

### Pattern 2: Schema Parameter in dispatchAgent

**What:** Add an optional `schema` field to dispatchAgent options. Default to ReportSectionSchema. The DebateStepSchema is used for debate steps 1-4; ReportSectionSchema is used for everything else.

**Key design:**
```javascript
export async function dispatchAgent(agentRole, dataPacket, options = {}) {
  // ...existing code...

  const schema = options.schema || ReportSectionSchema;

  const callFn = (overrides = {}) => {
    return client.messages.parse({
      model,
      max_tokens: overrides.maxTokens || options.maxTokens || 16384,
      system: systemBlocks,
      messages: [{ role: 'user', content: userContent }],
      tools: options.maxSearches === 0 ? [] : tools,  // Gate web search
      output_config: { format: zodOutputFormat(schema) },
    });
  };

  // ...rest unchanged...
}
```

### Pattern 3: Debate Context Building

**What:** The `buildDebateContext` function maps `receivesContext` strings from dispatch-table.json to actual debate step outputs.

**Context routing per dispatch-table.json:**
| Step | Role | receivesContext | What They Get |
|------|------|-----------------|---------------|
| 1 | bull | `["sections_1_through_5"]` | All S1-S5 section summaries |
| 2 | bear | `["bull_output"]` | Full bull thesis JSON |
| 3 | bull_rebuttal | `["bull_output", "bear_output"]` | Full bull + bear JSONs |
| 4 | judge | `["bull_output", "bear_output", "bull_rebuttal_output"]` | All 3 prior step JSONs |

**Key design:**
```javascript
function buildDebateContext(receivesContext, debateOutputs, allSections) {
  const parts = [];
  for (const ctx of receivesContext) {
    if (ctx === 'sections_1_through_5') {
      // Build summary of S1-S5 from allSections
      const summaries = allSections
        .filter(s => s && s.sectionNumber >= 1 && s.sectionNumber <= 5)
        .map(s => `### ${s.title} (${s.verdict})\n${s.summary}\nRed flags: ${(s.redFlags || []).join('; ')}`)
        .join('\n\n');
      parts.push(`## Prior Full Story Sections (S1-S5)\n\n${summaries}`);
    } else if (ctx === 'bull_output') {
      parts.push(`## Bull Thesis (Step 1)\n\n\`\`\`json\n${JSON.stringify(debateOutputs.bull, null, 2)}\n\`\`\``);
    } else if (ctx === 'bear_output') {
      parts.push(`## Bear Inversion (Step 2)\n\n\`\`\`json\n${JSON.stringify(debateOutputs.bear, null, 2)}\n\`\`\``);
    } else if (ctx === 'bull_rebuttal_output') {
      parts.push(`## Bull Rebuttal (Step 3)\n\n\`\`\`json\n${JSON.stringify(debateOutputs.bull_rebuttal, null, 2)}\n\`\`\``);
    }
  }
  return parts.join('\n\n---\n\n');
}
```

### Pattern 4: DebateStepSchema (Zod)

**What:** A Zod schema that validates all 4 debate step variants. Since Zod structured outputs need a fixed schema (not `oneOf`), use a union-compatible approach.

**Key consideration:** The existing JSON schema at `agents/orchestrator/schemas/debate-step.schema.json` uses `oneOf` for the `content` field (4 variants). For Claude structured outputs, the most practical approach is a single schema with all fields optional except the common ones, then validate the role-specific fields post-extraction. Alternatively, define 4 separate schemas (BullSchema, BearSchema, RebuttalSchema, JudgeSchema) and select per step.

**Recommended approach -- 4 separate schemas (cleaner structured output enforcement):**
```javascript
// src/schemas/debateStep.js
import { z } from 'zod';

// Step 1: Bull Thesis
export const BullThesisSchema = z.object({
  step: z.literal(1),
  role: z.literal('bull'),
  agent: z.string(),
  content: z.object({
    thesisPoints: z.array(z.object({
      point: z.string(),
      evidence: z.string(),
      sourceSection: z.string(),
    })).min(5),
    overallThesis: z.string(),
  }),
});

// Step 2: Bear Inversion
export const BearInversionSchema = z.object({
  step: z.literal(2),
  role: z.literal('bear'),
  agent: z.string(),
  content: z.object({
    inversions: z.array(z.object({
      targetPoint: z.string(),
      counterArgument: z.string(),
      evidence: z.string(),
      severity: z.enum(['thesis_killer', 'significant', 'minor']),
      sources: z.array(z.string()).optional().default([]),
    })).min(1),
    overallBearCase: z.string(),
  }),
});

// Step 3: Bull Rebuttal
export const BullRebuttalSchema = z.object({
  step: z.literal(3),
  role: z.literal('bull_rebuttal'),
  agent: z.string(),
  content: z.object({
    rebuttals: z.array(z.object({
      bearPoint: z.string(),
      rebuttal: z.string(),
      rebuttalStrength: z.enum(['strong', 'moderate', 'weak']),
      honest: z.boolean(),
    })).min(1),
  }),
});

// Step 4: Judge Verdict
export const JudgeVerdictSchema = z.object({
  step: z.literal(4),
  role: z.literal('judge'),
  agent: z.string(),
  content: z.object({
    exchanges: z.array(z.object({
      topic: z.string(),
      bullStrength: z.enum(['strong', 'moderate', 'weak']),
      bearStrength: z.enum(['strong', 'moderate', 'weak']),
      verdict: z.enum(['Strong Bull', 'Strong Bear', 'Unresolved']),
      reasoning: z.string(),
    })).min(1),
    overallVerdict: z.object({
      direction: z.enum(['Bull', 'Bear', 'Mixed']),
      unresolvedCount: z.number(),
      summary: z.string(),
      investmentImplication: z.string(),
    }),
  }),
});

// Map role to schema for dispatch
export const DEBATE_SCHEMAS = {
  bull: BullThesisSchema,
  bear: BearInversionSchema,
  bull_rebuttal: BullRebuttalSchema,
  judge: JudgeVerdictSchema,
};
```

### Pattern 5: S6 Synthesis Composition

**What:** The 5th AI call (synthesis-writer) receives all 4 debate outputs and produces a ReportSectionSchema for S6. This call uses the existing ReportSectionSchema (not DebateStepSchema).

**Composition input:**
- All 4 debate step JSONs (bull, bear, bull_rebuttal, judge)
- S1-S5 section summaries (key + verdict + summary only -- context management)
- Agent prompt + curriculum (synthesis-writer config)

**Composition output:**
- Standard ReportSectionSchema with key="inversion_rebuttal", sectionNumber=6
- Verdict derived from judge's `overallVerdict.direction` (Bull -> PASS, Bear -> FAIL, Mixed -> WATCHLIST)
- Narrative in dual-view format (verdict table + exchange detail)
- Citations merged from all bear source URLs
- Data field contains `debateStructure`, `judgeOverallVerdict`, `priorSectionVerdicts`

This exactly matches the CC skill's Step 8e pattern (verified against SFM output).

### Anti-Patterns to Avoid
- **Creating a separate debateDispatcher.js** -- D-01 explicitly prohibits this. All dispatch logic stays in pipelineManager.js.
- **Passing full S1-S5 narratives to debate steps** -- Context window budget. Bull gets section summaries + redFlags (per CC skill pattern). Bear/rebuttal/judge get prior debate steps in full but sections only as summaries.
- **Using a single flexible DebateStepSchema for all 4 roles** -- Claude's structured output works better with role-specific schemas that enforce the exact fields expected. A `oneOf`/union schema may produce validation ambiguity.
- **Attempting to parallelize debate steps** -- D-02 mandates strictly sequential execution. Each step depends on prior step outputs.
- **Giving web search to all debate steps** -- D-03 mandates only bear (step 2) gets web search. Other steps rely on existing evidence.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured output parsing | Custom JSON extraction from text | `client.messages.parse()` + `zodOutputFormat()` | Already proven in Phases 8-10; handles schema validation, retry on truncation |
| Cost tracking | Custom token counting | `contextBudget.js` `createBudgetTracker()` | Already records per-agent usage from API response |
| Cache monitoring | Custom cache tracking | `cacheMonitor.js` `createCacheMonitor()` | Already tracks hit/miss rates |
| Retry logic | Custom error handling | `dispatchWithRetry()` in aiResearch.js | Already handles 429, 5xx, max_tokens, refusal |
| Citation enrichment | Custom URL matching | `enrichCitationsWithURLs()` in aiResearch.js | Already matches web search URLs to citations |
| Quality scoring | Custom section validation | `validateStage()` in critic.js + `run-quality-v4.js` | Already handles Full Story methodology checks (33 checks across 6 sections) |

**Key insight:** 95% of the infrastructure already exists. The only new code is (a) the debate branch in pipelineManager.js, (b) the DebateStepSchema Zod definitions, (c) the debate context builder, and (d) the run-full-story.js script. Everything else is reuse.

## Common Pitfalls

### Pitfall 1: Debate Context Token Budget
**What goes wrong:** Passing full S1-S5 section JSONs to every debate step. The SFM S1-S5 sections are ~35K+ tokens of narrative alone. Adding that to every debate call blows up context and cost.
**Why it happens:** Tempting to include all context for maximum quality.
**How to avoid:** Bull (step 1) gets section summaries + redFlags only (per CC skill pattern: key, verdict, confidence, summary, redFlags, narrative first 2000 chars). Bear/rebuttal/judge get prior debate step outputs in full (they're smaller -- ~5-15K tokens each) plus section summaries only.
**Warning signs:** Input tokens > 100K on a single debate call. Cost per debate step > $0.50.

### Pitfall 2: Web Search Gating
**What goes wrong:** Giving all debate steps web search, or accidentally removing it from the bear.
**Why it happens:** The default in aiResearch.js is web_search enabled for all agents (line 351-356).
**How to avoid:** In the debate branch, check `step.webSearch` before including the web_search tool. If `step.webSearch === false`, pass `maxSearches: 0` to dispatchAgent AND remove the tool from the tools array entirely (empty array `[]`).
**Warning signs:** Bull/rebuttal/judge making web searches. Bear not making any web searches.

### Pitfall 3: Schema Mismatch Between Debate Steps and Synthesis
**What goes wrong:** The synthesis-writer tries to produce a DebateStepSchema instead of a ReportSectionSchema, or vice versa.
**Why it happens:** The schema parameter is new; easy to pass the wrong one.
**How to avoid:** Debate steps 1-4 explicitly get `DEBATE_SCHEMAS[step.role]`. The synthesis call gets no schema parameter (defaults to ReportSectionSchema). Clear separation.
**Warning signs:** Zod validation errors on the synthesis call. Missing `narrative`, `citations`, `redFlags` fields in S6 output.

### Pitfall 4: Debate Step Output Saving
**What goes wrong:** Not saving intermediate debate step JSONs (debate-step-1.json through debate-step-4.json), making debugging impossible.
**Why it happens:** The pipelineManager currently doesn't write files -- it returns results. File I/O is in the runner script.
**How to avoid:** The runner script (run-full-story.js) should save each debate step output to `.thes1s/reports/{TICKER}/sections/debate-step-{N}.json` as it completes. This matches the CC skill pattern and enables the quality scorer's debate-step-2 backfill logic.
**Warning signs:** No debate-step-*.json files in sections directory. Quality scorer can't backfill searchesPerformed for inversion_rebuttal.

### Pitfall 5: Synthesis Composition Missing Bear URLs
**What goes wrong:** The composed S6 narrative drops bear citation URLs, making the inversion_rebuttal section fail the `debate-bear-citations` methodology check (requires >= 3 web URLs).
**Why it happens:** The synthesis-writer composes from debate outputs but may summarize rather than carry forward specific URLs.
**How to avoid:** The composition prompt must explicitly instruct: "Include ALL bear source URLs as clickable links in the narrative. Never drop a URL." Post-composition, validate URL count against debate-step-2.json sources (same pattern as CC skill Step 8e validation).
**Warning signs:** S6 citation count < bear inversion source count. Methodology check `debate-bear-citations` fails.

### Pitfall 6: `sections_1_through_5` Context Routing
**What goes wrong:** The bull step receives an empty `debateContext` because the context key `sections_1_through_5` isn't matched to allSections.
**Why it happens:** Unlike other receivesContext values (which reference debate outputs), `sections_1_through_5` references the main section outputs stored in allSections.
**How to avoid:** The `buildDebateContext` function must handle `sections_1_through_5` as a special case that reads from allSections, not from debateOutputs.
**Warning signs:** Bull thesis has no section references. Bull points lack `sourceSection` attribution.

### Pitfall 7: Budget Label Collision
**What goes wrong:** Budget tracker shows duplicate "synthesis-writer" entries with no way to distinguish synthesis-writer:bull from synthesis-writer:composition.
**Why it happens:** Synthesis-writer plays 3 roles (bull, bull_rebuttal, composition) in the Full Story debate.
**How to avoid:** Use `${step.agent}:${step.role}` as the budget label (e.g., `synthesis-writer:bull`, `risk-analyst:bear`, `synthesis-writer:composition`). This gives per-step cost visibility.
**Warning signs:** Budget report shows generic "synthesis-writer" without role distinction.

## Code Examples

### Existing dispatchAgent Call Pattern (from aiResearch.js)
```javascript
// Source: src/engines/aiResearch.js lines 366-375
const callFn = (overrides = {}) => {
  return client.messages.parse({
    model,
    max_tokens: overrides.maxTokens || options.maxTokens || 16384,
    system: systemBlocks,
    messages: [{ role: 'user', content: userContent }],
    tools,
    output_config: { format: zodOutputFormat(ReportSectionSchema) },
  });
};
```

### Existing Wave Dispatch Pattern (from pipelineManager.js)
```javascript
// Source: src/engines/pipelineManager.js lines 92-128
for (const wave of stageConfig.phases) {
  const waveAgents = wave.agents;
  const results = await Promise.allSettled(
    waveAgents.map(a => dispatchAgent(a.agent, dataPacket, {
      sectionAssignment: buildSectionAssignment(a.sections),
      priorSections: allSections.slice(),
      psrFindings: psrFindingsForAgents,
      pmFeedback,
      maxSearches: options.maxSearches,
    }))
  );
  // ... process results ...
}
```

### Existing Debate Step Output (verified from SFM sections)
```javascript
// Source: .thes1s/reports/SFM/sections/debate-step-1.json (abbreviated)
{
  "step": 1,
  "role": "bull",
  "agent": "synthesis-writer",
  "content": {
    "thesisPoints": [
      {
        "point": "SFM is the only publicly traded pure-play...",
        "evidence": "U.S. organic food sales reached $76.6B...",
        "sourceSection": "S2: Meaning Checklist"
      }
      // ... 6 more thesis points
    ],
    "overallThesis": "Sprouts Farmers Market is a wonderful company..."
  }
}
```

### Existing Quality Baseline (SFM CC-produced scores)
```
Overall mechanical: 89
Overall methodology: 88
Per-section:
  event_analysis:         mech=97 meth=29
  meaning_checklist:      mech=82 meth=100
  moat_checklist:         mech=93 meth=100
  management_checklist:   mech=86 meth=100
  valuation_confirmation: mech=84 meth=100
  inversion_rebuttal:     mech=91 meth=100
```
Note: event_analysis methodology score (29) is low because the CC skill's risk-analyst didn't use explicit "root cause" / "historical precedent" keywords. This is a known scoring gap, not a quality gap. API dispatch should do at least as well since the same prompts are used.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CC skill (generate-full-story SKILL.md) | Claude API dispatch (aiResearch.js) | Phase 16 | Automated, scriptable, testable, cost-tracked |
| Manual debate orchestration in CC skill | pipelineManager.js debate branch | Phase 16 | Retry logic, budget tracking, cache monitoring |
| JSON schema (debate-step.schema.json) | Zod schema (debateStep.js) | Phase 16 | Structured output enforcement via zodOutputFormat |
| No cost tracking for Full Story | Per-step budget via contextBudget.js | Phase 16 | Full pipeline cost visibility (OP+PD+FS) |

## Open Questions

1. **max_tokens per debate step**
   - What we know: CC skill didn't enforce max_tokens -- CC agent tool has no token limit. The SFM bull thesis is ~3500 words, bear inversion ~4000 words, rebuttal ~2500 words, judge verdict ~1500 words. Synthesis S6 narrative is ~35K characters.
   - What's unclear: Optimal max_tokens for each step via API dispatch.
   - Recommendation: Bull/bear/rebuttal: 8192 tokens. Judge: 4096 tokens. Synthesis: 16384 tokens. Start conservative, increase if truncation detected (retry logic already handles this).

2. **Model selection per debate step**
   - What we know: risk-analyst (bear) uses opus, synthesis-writer (bull/rebuttal) uses opus, financial-analyst (judge) uses sonnet. These come from agent config.json files.
   - What's unclear: Whether the judge should use opus for better verdict quality.
   - Recommendation: Use config.json model assignments as-is. If judge quality is low in validation, escalate to opus for that step only.

3. **Cache efficiency for debate steps**
   - What we know: System message caching uses `cache_control: { type: 'ephemeral' }` breakpoints. Universal context + PSR findings are cached across agents.
   - What's unclear: Whether debate step outputs passed as user message content benefit from caching (they're unique per step).
   - Recommendation: Keep existing cache strategy. The debate context is step-specific and won't benefit from cross-agent caching. Focus cache on universal context and curriculum (which ARE shared across synthesis-writer's 3 calls).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | vitest.config.js (implicit via vite.config.js) |
| Quick run command | `npm test -- --run src/engines/__tests__/pipelineManager.test.js` |
| Full suite command | `npm test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | Debate branch dispatches 4 steps sequentially then synthesis | unit | `npm test -- --run src/engines/__tests__/pipelineManager.test.js` | Exists (extend) |
| API-01 | dispatchAgent accepts schema parameter | unit | `npm test -- --run src/engines/__tests__/aiResearch.test.js` | Exists (extend) |
| API-02 | DebateStepSchema validates all 4 role variants | unit | `npm test -- --run src/schemas/__tests__/debateStep.test.js` | Wave 0 |
| API-02 | Debate context routing matches receivesContext spec | unit | `npm test -- --run src/engines/__tests__/pipelineManager.test.js` | Exists (extend) |
| API-03 | Budget tracker records per-step costs with role labels | unit | `npm test -- --run src/engines/__tests__/contextBudget.test.js` | Exists (extend) |
| D-03 | Web search gated: only bear step gets tools | unit | `npm test -- --run src/engines/__tests__/pipelineManager.test.js` | Exists (extend) |
| D-08 | SFM quality parity (within 5 points of 89/88 baseline) | e2e/manual | `node scripts/run-quality-v4.js SFM --stage fullStory` | Exists |

### Sampling Rate
- **Per task commit:** `npm test -- --run src/engines/__tests__/pipelineManager.test.js`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green + SFM quality parity check before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/schemas/__tests__/debateStep.test.js` -- covers API-02 (DebateStepSchema validation)
- [ ] Extend `pipelineManager.test.js` with fullStory debate dispatch mock -- covers API-01, D-03
- [ ] `scripts/run-full-story.js` -- pipeline runner script (not a test, but required for API-03/D-08 validation)

## Sources

### Primary (HIGH confidence)
- `src/engines/aiResearch.js` -- Full dispatchAgent implementation reviewed (452 lines)
- `src/engines/pipelineManager.js` -- Full runPipeline implementation reviewed (187 lines)
- `agents/orchestrator/dispatch-table.json` -- fullStory config with isDebate structure (145 lines)
- `agents/orchestrator/schemas/debate-step.schema.json` -- DebateStepSchema JSON reference (122 lines)
- `src/schemas/reportSection.js` -- ReportSectionSchema Zod definition (88 lines)
- `src/engines/critic.js` -- Full Story methodology checks (33 checks across 6 sections)
- `.thes1s/reports/SFM/sections/` -- CC-produced debate step outputs (verified format)
- `.thes1s/reports/SFM/quality/full-story-v4.quality.json` -- Quality baseline (89/88)
- `.claude/skills/generate-full-story/SKILL.md` -- CC skill implementation reference
- `src/engines/__tests__/pipelineManager.test.js` -- Existing test patterns (577 lines)

### Secondary (MEDIUM confidence)
- Agent config.json files (synthesis-writer, risk-analyst, financial-analyst) -- model assignments and debate role instructions verified
- Agent prompt.md files -- debate role instructions verified (bull, bear, rebuttal, judge)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and proven; no new dependencies
- Architecture: HIGH -- extending well-understood code (aiResearch.js, pipelineManager.js) with a pattern that closely mirrors the existing CC skill flow
- Pitfalls: HIGH -- derived from actual CC skill experience and SFM output analysis; known failure modes documented
- Schemas: HIGH -- debate-step.schema.json provides complete field definitions; translation to Zod is mechanical

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable -- no external dependency changes expected)
