# Architecture Patterns: Claude API Migration

**Domain:** AI orchestration layer for multi-agent investment research pipeline
**Researched:** 2026-03-27
**Confidence:** HIGH (official docs verified, existing codebase analyzed, 3 validation runs studied)

## Executive Summary

This document defines the architecture for migrating Thes1s's Pitch Deck pipeline from Claude Code subagent orchestration to direct Claude API calls via a new `aiResearch.js` engine. The migration solves 6 persistent issues (citation format, red flags, searchesPerformed, narrative collapse, cost, runtime) while preserving the existing state machine, data assembly pipeline, quality validation, and file-based section output pattern.

**Key architectural finding:** Structured outputs and the Citations API feature are incompatible (returns 400 error). Web search tool_use results provide URLs directly in the response, which agents must manually map into the structured `citations` array. This two-phase approach (web search for investigation, structured output for response format) is the correct pattern.

**Key schema finding:** `additionalProperties` must be `false` for all objects in structured outputs. The current `z.looseObject({})` usage (in `data`, `config`, `userInput` fields) must be replaced with explicit typed objects or `z.record(z.string(), z.unknown())` patterns that the SDK can transform.

---

## Recommended Architecture

### Component Map

```
                    EXISTING (unchanged)                          NEW (aiResearch.js)
                    ====================                          ===================

scripts/prepare-data.js                                    src/engines/aiResearch.js
     |                                                          |
     v                                                          v
dataExport.js -----> DataPacket.json                     dispatchAgent()
                          |                                     |
                          |    +------> buildMessages()  -------+
                          |    |             |
                          |    |             v
                          +----+    Claude Messages API
                                    (output_config.format +
                                     web_search tool)
                                            |
                                            v
                                    Section JSON output
                                            |
                                            v
progressState.js <---- updateProgress() <---+
     |                                      |
     v                                      v
.thes1s/reports/   <---- saveSectionOutput() + critic.js
{TICKER}/sections/
```

### Component Boundaries

| Component | Responsibility | Status | Communicates With |
|-----------|---------------|--------|-------------------|
| `scripts/prepare-data.js` | DataPacket assembly, filing preprocessing, transcript fetch | Existing, unchanged | `dataExport.js`, filesystem |
| `src/engines/dataExport.js` | Aggregate 20+ engine outputs into canonical JSON | Existing, unchanged | All data engines |
| `src/engines/aiResearch.js` | **NEW** -- API client, prompt builder, parallel dispatch, caching orchestration | New file | Claude API, progressState, critic, filesystem |
| `src/schemas/reportSection.js` | Report section Zod schema + JSON Schema export | Existing, **modified** -- looseObject to strict objects | aiResearch.js, critic.js |
| `src/engines/progressState.js` | State machine, section status, generation-status.json | Existing, unchanged | aiResearch.js (consumer) |
| `src/engines/critic.js` | Post-generation quality validation | Existing, unchanged | aiResearch.js (consumer) |
| `agents/*/config.json` | Agent role definitions (model, curriculum, slices, tools) | Existing, unchanged | aiResearch.js (reads at dispatch time) |
| `agents/*/prompt.md` | Agent system prompts | Existing, **modified** -- DataPacket path reference added | aiResearch.js (reads at dispatch time) |
| `.claude/skills/generate-pitch-deck/SKILL.md` | CC orchestration skill | Existing, **deprecated** -- replaced by aiResearch.js | N/A after migration |

---

## Data Flow: Complete Pipeline

### Phase 0: Data Assembly (unchanged)

```
User triggers generation
    |
    v
scripts/prepare-data.js {TICKER}
    |
    +--> Gate check (one-pager exists with verdict)
    +--> Guru prefetch (43 portfolios, cached)
    +--> DataPacket assembly (dataExport.js)
    +--> Transcript fetch (Alpha Vantage)
    +--> Filing preprocessing (10-K/10-Q to markdown)
    +--> Data quality checkpoint
    |
    v
.thes1s/reports/{TICKER}/data-packet.json    (~50K tokens)
.thes1s/reports/{TICKER}/filings-md/*.json   (~290KB per 10-K)
.thes1s/reports/{TICKER}/transcripts/*.md    (~30K tokens each)
```

### Phase 1: Primary Source Reading

```
aiResearch.js reads:
    agents/annual-reader/config.json + prompt.md
    agents/quarterly-reader/config.json + prompt.md
    |
    v
buildPSRMessages() constructs messages for each filing year
    |
    +--> Annual readers: 1 API call per 10-K (5 calls, PARALLEL)
    |    Each gets: system prompt + universal context + DataPacket slice + filing text
    |    output_config: { format: { type: "json_schema", schema: AnnualReaderSchema } }
    |
    +--> Quarterly readers: 1 API call per batch of 4 10-Qs (2 calls, PARALLEL)
    |    Each gets: system prompt + universal context + DataPacket slice + 10-Q text + transcripts
    |    output_config: { format: { type: "json_schema", schema: QuarterlyReaderSchema } }
    |
    v
Merge into psrFindings (annualInsights + quarterlyInsights + discrepancies)
Save to .thes1s/reports/{TICKER}/sections/annual-reader-insights.json
Save to .thes1s/reports/{TICKER}/sections/quarterly-reader-insights.json
```

### Phase 2-4: Analysis Phases (3 phases, 10 sections)

```
aiResearch.js reads:
    agents/{role}/config.json + prompt.md + curriculum files
    |
    v
buildAnalysisMessages() constructs messages per agent:
    system: [
        { text: agent prompt.md,      cache_control: { type: "ephemeral" } },  // BP 1
        { text: curriculum content,    cache_control: { type: "ephemeral" } },  // BP 2
    ]
    tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 10 },
    ]
    messages: [
        { role: "user", content: [
            { text: DataPacket slice,  cache_control: { type: "ephemeral" } },  // BP 3
            { text: PSR findings },
            { text: prior phase context },
            { text: task instruction },
        ]},
    ]
    output_config: {
        format: { type: "json_schema", schema: ReportSectionJSONSchema }
    }
    |
    v
Claude API: web search (server-executed) --> structured JSON response
    |
    v
Parse response.content[0].text as JSON (guaranteed valid by structured outputs)
Extract web search URLs from response.content (server_tool_use + web_search_tool_result)
Post-process: inject web URLs into citation source fields
    |
    v
saveSectionOutput() --> .thes1s/reports/{TICKER}/sections/{key}.json
validateSection() --> quality report
advanceState() --> progress.json + generation-status.json
```

### Phase 5: Synthesis

```
aiResearch.js reads all completed sections
    |
    v
buildSynthesisMessages():
    system: synthesis-writer prompt.md + Buffett curriculum
    messages: all 10 section summaries + verdicts + red flags
    output_config: { format: { type: "json_schema", schema: SynthesisSchema } }
    |
    v
Save executive summary + overall verdict
Run validateStage() for aggregate quality report
```

---

## Parallel Dispatch Strategy

### Dependency Graph

```
PSR Phase (all parallel):
    annual-reader-fy2020 --|
    annual-reader-fy2021 --|
    annual-reader-fy2022 --|----> merge psrFindings
    annual-reader-fy2023 --|
    annual-reader-fy2024 --|
    quarterly-reader-b1  --|
    quarterly-reader-b2  --|

Phase 1 (parallel, needs PSR):
    business-analyst [S1, S2] --|
    competitor-evaluator [S3]  --|----> Checkpoint 1

Phase 2 (mixed dependencies):
    competitor-evaluator [S4]  ----> needs S3 (Phase 1)
         |
         v (after S4 completes)
    financial-analyst [S5, S7, S8] --|
    management-evaluator [S6]       --|----> Checkpoint 2

Phase 3 (parallel, needs all prior):
    risk-analyst [S9]          --|
    valuation-specialist [S10] --|----> Checkpoint 3

Synthesis (sequential, needs all):
    synthesis-writer --|----> Quality Check --> COMPLETE
```

### Implementation Pattern

```javascript
// aiResearch.js -- parallel dispatch with dependency awareness

async function runPhase(ticker, phaseNum, agentTasks, context) {
  const { independent, dependent } = classifyTasks(agentTasks);

  // Run independent tasks in parallel
  const independentResults = await Promise.allSettled(
    independent.map(task => dispatchAgent(ticker, task, context))
  );

  // Merge independent results into context
  const updatedContext = mergeResults(context, independentResults);

  // Run dependent tasks sequentially (or in parallel if they share deps)
  const dependentResults = [];
  for (const task of dependent) {
    const result = await dispatchAgent(ticker, task, updatedContext);
    dependentResults.push(result);
    // Update context for next dependent task
    Object.assign(updatedContext, extractContext(result));
  }

  return [...independentResults, ...dependentResults];
}
```

### Expected Runtime

| Phase | Current (CC sequential) | API (parallel) | Bottleneck |
|-------|------------------------|----------------|------------|
| PSR (7 agents) | ~35-40 min | **~8-10 min** | Longest 10-K read |
| Phase 1 (2 agents) | ~10 min | **~5 min** | business-analyst (2 sections) |
| Phase 2 (3 agents) | ~15 min | **~8 min** | S4 dependency, then parallel |
| Phase 3 (2 agents) | ~10 min | **~5 min** | Parallel |
| Synthesis | ~3 min | **~3 min** | Sequential (single agent) |
| **Total** | **~2.5 hr** | **~30-35 min** | -- |

---

## Prompt Caching Strategy

### Cache Breakpoint Placement (4 max per request)

The Claude API allows 4 explicit cache breakpoints per request. With 10 analysis agents sharing significant context, the caching strategy is critical for cost reduction.

**Breakpoint allocation per agent call:**

| Breakpoint | Content | Tokens | Cache Behavior |
|------------|---------|--------|----------------|
| BP 1 | System prompt (agent prompt.md) | ~2-4K | Unique per agent role, cached across sections by same agent |
| BP 2 | Curriculum + Universal context | ~8-15K | Shared across agents with same curriculum, cached |
| BP 3 | DataPacket slice + PSR findings | ~30-60K | Shared across phase, cached within 5-min window |
| BP 4 | (reserved for automatic caching) | -- | SDK auto-places on last cacheable block |

**Cache reuse patterns:**

```
Agent                  BP1 (prompt)    BP2 (curriculum)    BP3 (data)
------                 -----------     ----------------    ----------
business-analyst S1    WRITE           WRITE               WRITE
business-analyst S2    READ (same)     READ (same)         READ (same)
competitor-eval S3     WRITE           WRITE (diff)        READ (data)
competitor-eval S4     READ (same)     READ (same)         READ (data)
financial-analyst S5   WRITE           WRITE (diff)        READ (data)
financial-analyst S7   READ (same)     READ (same)         READ (data)
financial-analyst S8   READ (same)     READ (same)         READ (data)
management-eval S6     WRITE           WRITE (diff)        READ (data)
risk-analyst S9        WRITE           WRITE (diff)        READ (data)
valuation-spec S10     WRITE           WRITE (diff)        READ (data)
```

**Key constraint:** Parallel dispatch means agents in the same phase fire within seconds of each other. Cache writes from the first agent of a role must complete before reads from the second can benefit. Within a phase, agents of the SAME role sharing curriculum will get cache hits on BP1 and BP2. The DataPacket (BP3) benefits ALL agents within the 5-minute TTL window.

### Important: Cache Breakpoint Ordering

Cache breakpoints must follow the hierarchy: tools -> system -> messages. Content is cached as a PREFIX -- everything from the start of the array up to and including the breakpoint. If you put a breakpoint on a system message, everything before it (including tools) is part of the cached prefix.

**Implication for aiResearch.js:** The web search tool definition should appear BEFORE system messages in the call, and the system messages should have the first breakpoints. This way the tool definition + system prompt + curriculum are all part of the cached prefix.

### Cost Estimate

| Component | Tokens | First Agent | Subsequent Agents |
|-----------|--------|-------------|-------------------|
| Curriculum (per unique set) | ~10K | $0.03 write (1.25x) | $0.003 read (0.1x) |
| DataPacket + PSR | ~50K | $0.15 write | $0.015 read |
| Agent prompt | ~3K | $0.009 write | $0.0009 read |
| Web search | ~5 searches/agent | $0.05/agent | $0.05/agent |
| Output tokens | ~2K/section | $0.03/section | $0.03/section |

**Estimated total per company (Pitch Deck):**
- Cache writes (first of each type): ~$0.70
- Cache reads (subsequent): ~$0.35
- Uncached input (task instructions, phase context): ~$0.50
- Output tokens (10 sections + synthesis): ~$0.40
- Web search (50 searches at $0.01/search): ~$0.50
- PSR (7 agents, Sonnet): ~$3.00
- Opus agents (risk-analyst, valuation-specialist, synthesis-writer): ~$4.00
- **Total: ~$8-10 per company** (down from $32 V3 / $14 original target)

---

## Structured Outputs Integration

### Schema Modification Required

**Problem:** The Claude API requires `additionalProperties: false` on all objects in structured output schemas. The current `z.looseObject({})` in ReportSectionSchema generates `additionalProperties: true`.

**Fields affected:**
1. `data` in ReportSectionSchema -- section-specific structured data
2. `config` in ChartSchema
3. `data` items in ChartSchema
4. `userInput` in checkpoint objects (ProgressSchema, StageReportSchema)

**Solution options:**

```javascript
// BEFORE (incompatible with structured outputs):
data: z.looseObject({}),

// OPTION A: string-serialized JSON (simplest, guaranteed compliant)
data: z.string(),  // Agent outputs JSON.stringify(data), orchestrator parses

// OPTION B: record type (flexible, SDK *may* transform)
data: z.record(z.string(), z.unknown()),

// OPTION C: explicit typed objects per section (most constrained, best quality)
// Requires a schema variant per section key -- more work but best structured output quality
```

**Recommendation:** Option A (`z.string()`) for the `data` field. The `data` field contains arbitrary section-specific content (moat types, growth tables, valuation ranges) that varies wildly across sections. Making it a string that contains serialized JSON is the simplest path. The orchestrator parses it after extraction. The `zodOutputFormat()` helper in the Anthropic SDK automatically transforms schemas with unsupported features, but `looseObject` semantics may not survive transformation cleanly -- testing needed.

For `ChartSchema.config` and `ChartSchema.data`: these are optional fields rarely used. Change to `z.string()` or remove from the structured output schema entirely (charts are a PDF concern, not an AI output concern).

### Schema Complexity Limits

The structured output system has hard limits:
- Max 20 strict tools per request
- Max 24 optional parameters across all schemas
- No recursive schemas
- `additionalProperties` must be `false`

The current ReportSectionSchema has ~8 optional fields (`tables`, `charts`, `primarySourceInsights`, `crossCuttingFindings`, `searchesPerformed`, plus optionals within nested objects). This is within the 24-parameter limit, but barely. Count carefully before adding more optional fields.

**Optional parameter budget:**

| Field | Status | Counts |
|-------|--------|--------|
| `tables` | optional | 1 |
| `charts` | optional | 1 |
| `primarySourceInsights` | optional | 1 |
| `crossCuttingFindings` | optional | 1 |
| `searchesPerformed` | optional | 1 |
| `TableSchema.source` | optional | 1 |
| `CitationSchema.url` | optional (new) | 1 |
| `crossCuttingFindings[].source` nested | required (0) | 0 |
| **Total** | | **7 of 24** |

Room to grow, but be mindful.

### Two-Pass Output Pattern Assessment

V3 used a two-pass pattern (prose first, then JSON) to prevent narrative collapse. With structured outputs, the model is constrained to produce valid JSON matching the schema. The question is whether the `narrative` string field will still get abbreviated.

**Assessment:** Structured outputs guarantee the SCHEMA is valid, but do NOT guarantee field LENGTH. The model could still output a short narrative string and satisfy the schema. However, the constraint that `redFlags` is `z.array(z.string()).min(1)` will be enforced mechanically (min items of 1 is supported).

**Recommendation:** Keep narrative length validation in the orchestrator (post-hoc check). If `narrative.length < 500`, retry once with explicit instruction. This is cheap insurance. The two-pass pattern itself (write prose first, then JSON) is NOT needed with structured outputs because the model writes directly into the schema. But the post-hoc length check is still needed.

---

## Web Search + Citation Architecture

### The Incompatibility

**Citations API and Structured Outputs are incompatible.** The Citations feature requires interleaving citation blocks with text output, which conflicts with strict JSON schema constraints. Enabling both returns a 400 error.

This means we cannot use the built-in Citations feature. Instead, we use the web search tool and manually extract URLs from the response.

### Web Search URL Flow

When an agent uses the web search tool, the response contains `web_search_tool_result` blocks with URLs. The structured JSON output is in a separate `text` content block.

**Response structure with web search + structured output:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "I'll research SFM's competitive position."
    },
    {
      "type": "server_tool_use",
      "id": "srvtoolu_abc",
      "name": "web_search",
      "input": { "query": "Sprouts Farmers Market competitive analysis 2026" }
    },
    {
      "type": "web_search_tool_result",
      "tool_use_id": "srvtoolu_abc",
      "content": [
        {
          "type": "web_search_result",
          "url": "https://www.grocerydive.com/news/sprouts-2026-growth/",
          "title": "Sprouts 2026 Growth Strategy",
          "encrypted_content": "...",
          "page_age": "March 15, 2026"
        }
      ]
    },
    {
      "type": "text",
      "text": "{\"key\":\"market_position\",\"citations\":[{\"id\":1,\"ref\":\"...\",\"text\":\"...\",\"source\":\"Grocery Dive\"}]}"
    }
  ]
}
```

**Post-processing in aiResearch.js:**

```javascript
function extractWebSearchURLs(response) {
  const urls = [];
  for (const block of response.content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (result.type === 'web_search_result') {
          urls.push({
            url: result.url,
            title: result.title,
            pageAge: result.page_age,
          });
        }
      }
    }
  }
  return urls;
}

function enrichCitationsWithURLs(section, webSearchURLs) {
  for (const citation of section.citations) {
    if (!citation.url && citation.source) {
      // Match citation source to web search URL by domain or title substring
      const match = webSearchURLs.find(ws => {
        const domain = new URL(ws.url).hostname.replace('www.', '');
        const sourceLower = citation.source.toLowerCase();
        return sourceLower.includes(domain) ||
               sourceLower.includes(ws.title.toLowerCase().substring(0, 20));
      });
      if (match) {
        citation.url = match.url;
      }
    }
  }
}
```

**Citation schema extension:**

```javascript
export const CitationSchema = z.object({
  id: z.number(),
  ref: z.string(),
  text: z.string(),
  source: z.string(),
  url: z.string().optional(),  // NEW: populated from web search results
});
```

**Agent prompt instruction (add to all analysis agent prompt.md files):**

```
CITATION REQUIREMENTS:
When citing web search results, you MUST include the full URL in the "source" field.
Format: "https://example.com/article -- Article Title (2026)"
The URL is available in the search result returned to you. Do NOT paraphrase or
abbreviate URLs. The source field must contain the https:// URL for web citations.

For DataPacket citations, use the exact field path from the DataPacket Reference below.
```

### Web Search Pricing

$10 per 1,000 searches. With ~5 searches per analysis agent and 7 analysis agents (excluding PSR and synthesis), that is ~35-50 searches per pipeline = ~$0.35-0.50 per company. Acceptable.

---

## State Machine Changes

### Current State Machine (preserved)

```
IDLE --> DATA_ASSEMBLY --> PRIMARY_SOURCE_READING --> WAVE_1_RUNNING --> CHECKPOINT_1
--> WAVE_2_RUNNING --> CHECKPOINT_2 --> WAVE_3_RUNNING --> CHECKPOINT_3
--> SYNTHESIS --> QUALITY_CHECK --> COMPLETE
```

**No changes to the state machine.** The states, transitions, and validation logic in `progressState.js` remain exactly as-is. The only difference is WHO drives the transitions:

| Transition Driver | Current (CC) | New (API) |
|-------------------|-------------|-----------|
| State advances | SKILL.md bash commands | aiResearch.js function calls |
| Section start/complete | SKILL.md bash commands | aiResearch.js function calls |
| Phase status updates | SKILL.md bash commands | aiResearch.js function calls |
| generation-status.json | progressState.js | progressState.js (unchanged) |
| Section output files | SKILL.md `cat << EOF` | aiResearch.js `saveSectionOutput()` |

### Checkpoint Handling Change

**Current (CC):** Checkpoints are conversational dialogue loops in SKILL.md. The PM types "continue" or asks questions, and the CC skill dispatches follow-up agents.

**New (API):** Checkpoints become function return values from aiResearch.js. The orchestrator:
1. Advances state to `CHECKPOINT_N`
2. Returns a checkpoint summary object to the caller
3. The caller (CC skill wrapper or future UI) presents the checkpoint to the PM
4. PM input flows back into aiResearch.js via `resumeFromCheckpoint(ticker, phaseNum, pmInput)`

```javascript
// aiResearch.js checkpoint interface

export async function runPitchDeck(ticker, options = {}) {
  // Phase 0: Data assembly (external -- prepare-data.js already ran)
  const dataPacket = readDataPacket(ticker);

  // PSR Phase
  advanceState(ticker, 'PRIMARY_SOURCE_READING');
  const psrFindings = await runPSRPhase(ticker, dataPacket);

  // Phase 1
  advanceState(ticker, 'WAVE_1_RUNNING');
  const phase1Results = await runPhase(ticker, 1, PHASE_1_TASKS, {
    dataPacket, psrFindings
  });
  advanceState(ticker, 'CHECKPOINT_1');

  // Return checkpoint -- caller must resume
  return {
    type: 'checkpoint',
    phase: 1,
    sections: phase1Results,
    // Caller invokes resumePhase2(ticker, pmInput) to continue
  };
}

export async function resumeFromCheckpoint(ticker, phaseNum, pmInput) {
  const context = loadPhaseContext(ticker, phaseNum);
  if (pmInput.supplementaryContext) {
    context.supplementary = pmInput.supplementaryContext;
  }
  if (pmInput.rerunSections) {
    // Re-dispatch specific sections with additional guidance
    for (const { key, guidance } of pmInput.rerunSections) {
      await rerunSection(ticker, key, guidance, context);
    }
  }

  // Continue to next phase
  const nextPhase = phaseNum + 1;
  advanceState(ticker, `WAVE_${nextPhase}_RUNNING`);
  // ... dispatch next phase agents
}
```

This decouples the PM interaction from the orchestration logic. The CC skill becomes a thin wrapper that calls `runPitchDeck()` and handles PM dialogue. The future browser UI calls the same functions.

---

## aiResearch.js Architecture

### Why a New File (Not Extending Existing Patterns)

`aiResearch.js` is a NEW engine file, not an extension of any existing file. Rationale:

1. **dataExport.js** is pure data assembly -- no AI, no API calls, no state management. Adding API orchestration would violate its single responsibility.
2. **The CC SKILL.md** contains orchestration logic embedded in procedural markdown. That logic needs to become JavaScript functions with proper error handling, retry, and parallel dispatch.
3. **progressState.js** is a state persistence layer. The orchestration logic that DRIVES state transitions is a separate concern.
4. **No existing engine** does what aiResearch.js needs to do: manage Claude API sessions, build prompts from agent configs, handle caching, dispatch in parallel, process tool results, and coordinate checkpoints.

### Module Structure

```javascript
// src/engines/aiResearch.js -- ~600-800 LOC

// --- Imports ---
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ReportSectionSchema } from '../schemas/reportSection.js';
import { validateSection, validateStage } from './critic.js';
import {
  advanceState, createProgress, saveSectionOutput, readSectionOutput,
  startSection, completeSection, updateGenerationStatus,
  updatePhaseStatus, saveBudgetReport,
} from './progressState.js';

// --- Configuration ---
const ANTHROPIC_API_KEY = process.env.VITE_CLAUDE_KEY;
const MODELS = { sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-6' };
const MAX_SEARCH_USES = 10;
const AGENTS_DIR = join(process.cwd(), 'agents');
const REPORTS_DIR = join(process.cwd(), '.thes1s', 'reports');

// --- Core Functions (exported) ---
export async function dispatchAgent(ticker, agentConfig, context);
export async function runPSRPhase(ticker, dataPacket);
export async function runPhase(ticker, phaseNum, tasks, context);
export async function runSynthesis(ticker, sectionOutputs, dataPacket);
export async function runPitchDeck(ticker, options);
export async function resumeFromCheckpoint(ticker, phaseNum, pmInput);

// --- Prompt Builders (internal) ---
function buildSystemMessages(agentDir, config);
function buildUserMessages(config, dataPacket, psrFindings, priorContext, taskInstruction);
function sliceDataPacket(dataPacket, sliceKeys);
function loadCurriculum(config);
function formatPriorPhaseContext(completedSections);

// --- Response Processing (internal) ---
function extractStructuredOutput(response);
function extractWebSearchURLs(response);
function enrichCitationsWithURLs(section, webSearchURLs);
function computeTokenCost(response);

// --- Retry and Error Handling (internal) ---
async function dispatchWithRetry(client, params, maxRetries);
function handleRateLimit(error);
function handleMaxTokens(response, params);
```

### Key Function: dispatchAgent

```javascript
async function dispatchAgent(ticker, task, context) {
  const { agentDir, sectionKeys, taskInstruction } = task;
  const configPath = join(AGENTS_DIR, agentDir, 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  // Mark sections as running
  for (const key of sectionKeys) {
    startSection(ticker, key, config.role);
  }

  // Build messages with cache breakpoints
  const systemMessages = buildSystemMessages(agentDir, config);
  const userMessages = buildUserMessages(
    config, context.dataPacket, context.psrFindings,
    context.priorSections, taskInstruction
  );

  // Determine tools (analysis agents get web search; PSR and synthesis do not)
  const tools = [];
  if (agentNeedsWebSearch(config)) {
    tools.push({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: MAX_SEARCH_USES,
    });
  }

  // Determine output schema
  const outputSchema = sectionKeys.length === 1
    ? ReportSectionSchema
    : z.array(ReportSectionSchema);

  // Build API params
  const params = {
    model: MODELS[config.model] || MODELS.sonnet,
    max_tokens: 8192,
    system: systemMessages,
    messages: [{ role: 'user', content: userMessages }],
    output_config: { format: zodOutputFormat(outputSchema) },
  };
  if (tools.length > 0) params.tools = tools;

  // Dispatch with retry
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const response = await dispatchWithRetry(client, params, 1);

  // Extract structured output (last text block contains JSON)
  const sectionJSON = extractStructuredOutput(response);
  const webURLs = extractWebSearchURLs(response);
  const sections = Array.isArray(sectionJSON) ? sectionJSON : [sectionJSON];

  // Enrich and save
  const tokenCost = computeTokenCost(response);
  for (const section of sections) {
    enrichCitationsWithURLs(section, webURLs);
    section.modelUsed = params.model;
    section.tokenCost = tokenCost;

    // Narrative length check (post-hoc quality gate)
    if (section.narrative && section.narrative.length < 500) {
      console.warn(`Short narrative for ${section.key}: ${section.narrative.length} chars`);
      // Could retry here with explicit length instruction
    }

    saveSectionOutput(ticker, section.key, section);
    const quality = validateSection(section, context.dataPacket);
    completeSection(ticker, section.key);
  }

  return sections;
}
```

---

## Integration Points: New vs Modified vs Unchanged

### New Components

| Component | Purpose | LOC Estimate | Dependencies |
|-----------|---------|-------------|--------------|
| `src/engines/aiResearch.js` | API orchestration, parallel dispatch, prompt building, caching | ~600-800 | @anthropic-ai/sdk, progressState, critic, reportSection |

### Modified Components

| Component | Change | Scope | Risk |
|-----------|--------|-------|------|
| `src/schemas/reportSection.js` | Replace `z.looseObject({})` with structured output-compatible types; add optional `url` to CitationSchema | ~8 lines | LOW -- test with `z.toJSONSchema()` first |
| `agents/*/prompt.md` (7 analysis agents) | Add DataPacket field path reference section + citation URL instructions | ~20 lines each | LOW -- additive only |
| `package.json` | Update `@anthropic-ai/sdk` from 0.78.0 to 0.80.0+ | 1 line | LOW |

### Unchanged Components

| Component | Why Unchanged |
|-----------|--------------|
| `src/engines/dataExport.js` | Data assembly is orthogonal to API orchestration |
| `src/engines/critic.js` | Quality validation logic is API-agnostic |
| `src/engines/progressState.js` | State machine and persistence are API-agnostic |
| `src/schemas/progress.js` | Progress schema unchanged |
| `agents/*/config.json` | Agent configs consumed as-is by aiResearch.js |
| `agents/orchestrator/dispatch-table.json` | Phase structure consumed as-is |
| `agents/orchestrator/config.json` | Section mapping consumed as-is |
| `scripts/prepare-data.js` | Data prep runs before API orchestration |
| `.thes1s/reports/{TICKER}/` | File structure preserved exactly |

---

## Build Order (Dependency-Aware)

### Phase 1: Schema + SDK Foundation (0 dependencies)

1. **Update `@anthropic-ai/sdk`** to 0.80.0+ (needed for `zodOutputFormat`)
2. **Modify `reportSection.js`** -- replace `z.looseObject({})`, add `url` to CitationSchema
3. **Verify** `z.toJSONSchema(ReportSectionSchema)` produces valid structured output schema (run a test)
4. **Smoke test** with a single Claude API call using the new schema + `output_config.format`

### Phase 2: Core Dispatch (depends on Phase 1)

5. **Create `aiResearch.js`** -- API client initialization, `dispatchAgent()`, response processing
6. **Implement prompt builders** -- `buildSystemMessages()`, `buildUserMessages()`, `sliceDataPacket()`
7. **Implement response processors** -- `extractStructuredOutput()`, `extractWebSearchURLs()`, `enrichCitationsWithURLs()`
8. **Test** single agent dispatch (business-analyst for radar section) end-to-end

### Phase 3: Parallel + State (depends on Phase 2)

9. **Implement `runPhase()`** -- parallel dispatch with `Promise.allSettled`, dependency classification
10. **Implement `runPSRPhase()`** -- annual + quarterly reader parallel dispatch and merge
11. **Wire state machine** -- `advanceState()`, `startSection()`, `completeSection()` calls throughout
12. **Test** full Phase 1 dispatch (business-analyst + competitor-evaluator parallel)

### Phase 4: Full Pipeline + Checkpoints (depends on Phase 3)

13. **Implement `runPitchDeck()`** -- full pipeline entry point with checkpoint returns
14. **Implement `resumeFromCheckpoint()`** -- resume from PM input
15. **Implement `runSynthesis()`** -- synthesis-writer dispatch using all completed sections
16. **Add DataPacket path reference** to all 7 analysis agent prompt.md files
17. **Add citation URL instructions** to all 7 analysis agent prompt.md files

### Phase 5: Validation (depends on Phase 4)

18. **Run SFM** -- full pipeline, compare quality to V3 baseline (75/100)
19. **Run second ticker** -- generalization test (different sector)
20. **Cost audit** -- verify $8-12 target from usage response fields
21. **Runtime audit** -- verify 30-40 min target
22. **Quality audit** -- verify 85+ score, zero high-severity citation/format issues

---

## Patterns to Follow

### Pattern 1: Agent Config-Driven Dispatch

**What:** Every aspect of agent dispatch (model, curriculum, DataPacket slice, web search eligibility) is read from `agents/*/config.json` at runtime. Zero agent knowledge is hardcoded in `aiResearch.js`.

**Why:** The config files are the single source of truth for agent behavior. Adding a new agent or changing a curriculum file requires zero code changes in the orchestrator.

**Example:**
```javascript
const config = JSON.parse(readFileSync(join(AGENTS_DIR, agentDir, 'config.json'), 'utf8'));
const model = MODELS[config.model] || MODELS.sonnet;
const curriculum = config.curriculum.map(f => readFileSync(join(process.cwd(), f), 'utf8'));
const slicedData = sliceDataPacket(dataPacket, config.dataPacketSlice);
const needsSearch = !['annual-reader', 'quarterly-reader', 'synthesis-writer'].includes(config.role);
```

### Pattern 2: Structured Output + Post-Processing

**What:** Use `output_config.format` for schema enforcement, then post-process the parsed JSON to enrich with data the model could not produce (web URLs from tool results, token costs from usage, model name from params).

**Why:** Structured outputs guarantee the skeleton is correct. Post-processing fills in metadata that comes from the response object, not the model's generation.

### Pattern 3: Cache-Aligned Message Construction

**What:** Build messages so that shared content (curriculum, DataPacket) appears early in the message array with `cache_control` breakpoints, and task-specific content (instructions, phase context) appears after.

**Why:** Cache breakpoints cache everything from the start of the message up to the breakpoint. Shared content cached early means subsequent agents pay 0.1x for the same tokens.

**Example:**
```javascript
function buildSystemMessages(agentDir, config) {
  const promptText = readFileSync(join(AGENTS_DIR, agentDir, 'prompt.md'), 'utf8');
  const curriculumText = loadCurriculum(config);
  const universalText = config.universalContext
    ? config.universalContextFiles.map(f => readFileSync(join(process.cwd(), f), 'utf8')).join('\n\n')
    : '';

  return [
    {
      type: 'text',
      text: promptText + '\n\n' + universalText,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: curriculumText,
      cache_control: { type: 'ephemeral' },
    },
  ];
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Hardcoded Agent Logic

**What:** Putting agent-specific behavior (which sections, which model, which curriculum) directly in `aiResearch.js`.

**Why bad:** Every new agent or config change requires editing the orchestrator.

**Instead:** Read everything from `agents/*/config.json` and `agents/orchestrator/dispatch-table.json`. The only hardcoded knowledge should be the dispatch table structure.

### Anti-Pattern 2: Fire-and-Forget Parallel Dispatch

**What:** Dispatching all 10 agents in parallel regardless of dependencies.

**Why bad:** Phase 2's `barriers_moats` (S4) depends on Phase 1's `market_position` (S3). Phase 3 agents need all prior context. Ignoring dependencies produces inferior analysis because agents lack context.

**Instead:** Respect the dependency graph. Parallelize within phases, sequence between phases.

### Anti-Pattern 3: Relying on Structured Outputs for Content Quality

**What:** Assuming structured outputs solve all quality issues.

**Why bad:** Structured outputs guarantee SCHEMA compliance, not CONTENT quality. A model can produce valid JSON with a 10-word narrative.

**Instead:** Structured outputs for format enforcement + `critic.js` for content validation. Both necessary, neither sufficient alone.

### Anti-Pattern 4: Single Client Instance with Concurrent Calls

**What:** Creating one `Anthropic()` client and reusing it for all parallel calls.

**Why bad:** Potential connection pooling issues or request interleaving. The SDK may not handle concurrent requests correctly with a shared instance.

**Instead:** Either create a client per call (cheap -- it is just a config wrapper) or verify the SDK supports concurrent usage. Start with one-client-per-call for safety, optimize later if needed.

### Anti-Pattern 5: Ignoring Grammar Compilation Latency

**What:** Not accounting for the ~2-5 second grammar compilation on the first use of a schema.

**Why bad:** The first agent call with a new schema will be slower. If you time your pipeline without accounting for this, the first run will always seem slow.

**Instead:** Accept the first-request latency. The grammar is cached for 24 hours after that. Could warm the cache with a lightweight call at pipeline start.

---

## Error Handling Architecture

### Retry Strategy

```
API call fails
    |
    +-- 429 (Rate Limit) --> wait retry-after header value --> retry (max 3)
    +-- 500/502/503 (Server Error) --> wait 30s --> retry once
    +-- 400 (Bad Request) --> log error, do NOT retry (schema issue)
    +-- stop_reason: "max_tokens" --> retry with max_tokens * 1.5 (up to 16K)
    +-- stop_reason: "refusal" --> log, mark section as failed, continue
    +-- Network error --> wait 10s --> retry once
    |
    v
If all retries exhausted:
    save section with status: "failed" + error message
    continue pipeline (partial results better than no results)
    PM sees failure at checkpoint
```

### Graceful Degradation

- If a single agent fails, other agents in the phase continue
- Failed sections get `status: "failed"` in progress.json
- The PM sees which sections failed at the checkpoint
- The PM can trigger `re-run section X` through the checkpoint interface
- The synthesis-writer works with whatever sections completed successfully

### Token Budget Management

Each API call returns usage data:
```javascript
function computeTokenCost(response) {
  const usage = response.usage;
  return {
    input: usage.input_tokens + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens || 0,
    cacheWrite: usage.cache_creation_input_tokens || 0,
    webSearches: usage.server_tool_use?.web_search_requests || 0,
  };
}
```

Accumulate per-pipeline costs in `budget.json` (already exists via `saveBudgetReport()`).

---

## Scalability Considerations

| Concern | Current (1 company) | Future (batch) | Notes |
|---------|---------------------|-----------------|-------|
| API rate limits | ~15 calls/pipeline | Queue system needed | Rate limits are per-org |
| Prompt caching | 5-min TTL sufficient | 1-hour TTL for batches | `ttl: "1h"` at 2x write cost |
| Concurrent pipelines | Not supported | Promise queue needed | One company at a time per PROJECT.md |
| Cost tracking | Per-pipeline budget.json | Aggregate reporting | budget.json per ticker already exists |
| Error recovery | Retry + manual re-run | Automated retry queue | Current approach sufficient for v1.1 |

---

## Sources

- [Structured outputs - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- GA, `output_config.format`, JSON Schema limitations, feature compatibility (HIGH confidence)
- [Prompt caching - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) -- `cache_control`, 4 breakpoints max, TTL pricing, minimum token counts (HIGH confidence)
- [Web search tool - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) -- `web_search_20250305`, response structure with URLs, $10/1000 searches (HIGH confidence)
- [Citations - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/citations) -- Incompatible with structured outputs, 400 error when combined (HIGH confidence)
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) -- v0.80.0 latest, `zodOutputFormat` helper available in `helpers/zod` (HIGH confidence)
- V3 Validation Report (`.planning/phases/06.3-pipeline-validation-pt3/V3-VALIDATION-REPORT.md`) -- 6 persistent issues, quality baseline 75/100 (HIGH confidence)
- Existing codebase analysis: `agents/*/config.json`, `src/schemas/reportSection.js`, `src/engines/progressState.js`, `src/engines/critic.js`, `src/engines/dataExport.js`, `.claude/skills/generate-pitch-deck/SKILL.md` (HIGH confidence)
