# Phase 9: Parallel Dispatch & Caching - Research

**Researched:** 2026-03-28
**Domain:** Claude API prompt caching, parallel async dispatch, token budget tracking
**Confidence:** HIGH

## Summary

Phase 9 builds the manager layer that dispatches multiple agents in parallel within waves, adds prompt caching for shared context, and replaces character-based budget estimation with actual API usage tracking. The core implementation uses `Promise.allSettled` (already proven in the codebase), the Anthropic SDK's `cache_control` parameter on system message content blocks, and a rewritten `contextBudget.js` that records actual API response `usage` fields.

The most critical finding from this research is that **prompt caching has a parallel request limitation**: cache entries only become available after the first response begins. For truly parallel agents fired simultaneously, the first request writes to cache, but other parallel requests may not benefit from that cache entry because they start before the first completes. The mitigation is to fire one "priming" agent first (or accept that the first wave pays cache-write cost on all agents, with subsequent waves benefiting from the cached prefix). Since waves are sequential in the dispatch table, Wave 2 and Wave 3 agents will reliably hit caches written by Wave 1. Within a single wave, the first agent to complete creates the cache, and any remaining agents that haven't started processing yet can hit it -- but agents that start simultaneously won't benefit from each other's cache writes.

A secondary finding is a **pricing bug in `aiResearch.js`**: the PRICING constant for Opus 4.6 uses old Opus 4 pricing ($15/$75). Actual Opus 4.6 pricing is $5/$25 input/output with $6.25 cache write and $0.50 cache read per MTok. This must be corrected in this phase.

**Primary recommendation:** Restructure the system message to put the universal context (Rule One curriculum + tools-for-analysis) as the first `cache_control` breakpoint, and PSR findings as the second breakpoint. Fire one agent slightly ahead of others in each wave to prime the cache, or accept that intra-wave caching is imperfect and rely on inter-wave caching (which is reliable because waves are sequential).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Parallel within waves, sequential between waves. All agents in a wave fire simultaneously via `Promise.allSettled`. Waves execute in order (1 -> 2 -> 3) because later waves depend on earlier findings.
- **D-02:** No artificial concurrency limit. 10 simultaneous requests is well within typical Claude API rate limits. Phase 8 retry logic handles the rare 429.
- **D-03:** Stack system message in cache-friendly order: (1) universal context (Rule One fundamentals + tools), (2) PSR findings, (3) agent-specific prompt + curriculum. Apply `cache_control` breakpoints on the universal context and PSR findings prefix so agents within the same wave get cache hits on the shared prefix.
- **D-04:** Agent-specific content (prompt.md, curriculum files, DataPacket slice) goes after the cached prefix. These vary per agent and won't get cross-agent cache hits -- that's expected.
- **D-05:** Actuals only -- record real API response usage fields (inputTokens, outputTokens, cacheRead, cacheWrite, webSearches, cost) after each dispatch. Ditch pre-flight character-based estimates.
- **D-06:** Single function with per-wave callbacks for intermediate visibility. Manager accepts `onWaveComplete(waveNumber, results, costSoFar)`.
- **D-07:** Manager pauses between waves for PM review. PM can approve, provide corrections, supply additional data, or ask for changes. PM feedback folded into next wave's context.
- **D-08:** Manager follows `agents/orchestrator/dispatch-table.json` for wave structure, section-to-agent mapping, and checkpoint rules. Deterministic dispatch coordination.

### Claude's Discretion
- How to structure the `onWaveComplete` callback payload
- Whether PSR pre-processing runs in parallel or sequential
- How PM feedback from checkpoints gets incorporated into subsequent wave context
- Cache monitoring implementation details (logging format, 70% threshold warning mechanism)

### Deferred Ideas (OUT OF SCOPE)
- Streaming progress UI -- out of scope per REQUIREMENTS.md
- Configurable concurrency limit -- not needed now
- Pre-flight cost estimation -- replaced by actuals-only tracking
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-02 | Parallel agent dispatch within phases using Promise.allSettled with configurable concurrency limits | Promise.allSettled pattern verified; rate limit analysis confirms feasibility at Tier 1+ (50 RPM); dispatch-table.json provides exact wave structure |
| API-03 | Prompt caching with cache_control breakpoints on shared context -- 0.1x read cost on subsequent agents | cache_control API verified; parallel cache limitation documented; optimal breakpoint placement strategy defined; pricing confirmed |
| API-06 | Cache monitoring -- log cache_read_input_tokens and cache_creation_input_tokens per response, warn if hit rate below 70% | Response usage fields documented; formula for hit rate calculation defined; monitoring implementation pattern provided |
| API-07 | Token budget tracking using actual API response usage fields (input, output, cache read/write, web searches) | contextBudget.js needs rewrite from character-based to actual-usage-based; buildUsage in aiResearch.js already extracts correct fields |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | 0.78.0 (installed) | Claude API client with cache_control support | First-party SDK. Has messages.parse(), cache_control types, usage response fields. No upgrade needed for this phase. |
| Node.js | v24.13.1 | Runtime for Promise.allSettled, async/await | Already installed on dev machine |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.0 | Unit testing | Test manager dispatch, cache monitoring, budget tracking |
| dotenv | 17.3.1 | Environment config | Load .env.local for API key (Phase 8 pattern) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Promise.allSettled | p-limit / p-queue | Adds dependency for ~15 lines of code. D-02 says no concurrency limit needed. |
| Manual cache monitoring | None | No alternative -- must be custom code reading usage response fields |
| Rewriting contextBudget.js | Adding parallel tracking | Cleaner to rewrite: old interface records character counts, new records actual usage |

**Installation:**
```bash
# No new dependencies needed
```

**Version verification:** SDK 0.78.0 already supports `cache_control` on content blocks. Verified via installed `node_modules/@anthropic-ai/sdk/resources/messages.d.ts` type definitions.

## Architecture Patterns

### Recommended Module Structure
```
src/engines/
  aiResearch.js          -- MODIFY: add cache_control to system message content blocks
  contextBudget.js       -- REWRITE: actual-usage-based tracking (replaces char-based)
  pipelineManager.js     -- NEW: wave-based dispatch manager (reads dispatch-table.json)
  cacheMonitor.js        -- NEW: cache hit/miss tracking + 70% threshold warning
```

### Pattern 1: Wave-Based Dispatch Manager
**What:** Reads dispatch-table.json, dispatches agents per wave via Promise.allSettled, pauses for PM feedback at checkpoints, passes accumulated context to subsequent waves.
**When to use:** Every pipeline run (Pitch Deck, One Pager, Full Story)
**Example:**
```javascript
// Source: dispatch-table.json + Promise.allSettled pattern from STACK.md
async function runPipeline(stage, dataPacket, options = {}) {
  const table = JSON.parse(readFileSync(resolve(AGENTS_DIR, 'orchestrator/dispatch-table.json'), 'utf8'));
  const stageConfig = table[stage]; // 'pitchDeck', 'onePager', 'fullStory'
  const budget = createActualBudgetTracker();
  const cacheMonitor = createCacheMonitor();
  const allSections = [];

  // Pre-processing
  for (const step of stageConfig.preProcessing) {
    if (step.agent) {
      const result = await dispatchAgent(step.agent, dataPacket, { /* cache opts */ });
      budget.record(step.agent, result.usage);
      cacheMonitor.record(result.usage);
    }
  }

  // Wave execution
  for (const wave of stageConfig.phases) {
    const waveAgents = wave.agents;
    const results = await Promise.allSettled(
      waveAgents.map(a => dispatchAgent(a.agent, dataPacket, {
        sectionAssignment: buildSectionAssignment(a.sections),
        priorSections: allSections,
      }))
    );

    // Process results
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        const r = results[i].value;
        allSections.push(r.section);
        budget.record(waveAgents[i].agent, r.usage);
        cacheMonitor.record(r.usage);
      }
    }

    // Checkpoint callback
    if (wave.checkpoint?.after && options.onWaveComplete) {
      const action = await options.onWaveComplete(wave.phase, allSections, budget.getSummary(), cacheMonitor.getSummary());
      // action contains PM feedback to fold into next wave
    }
  }

  return { sections: allSections, budget: budget.getSummary(), cacheStats: cacheMonitor.getSummary() };
}
```

### Pattern 2: Cache-Friendly System Message Structure
**What:** Restructure the system message in dispatchAgent to place shared content first with cache_control breakpoints.
**When to use:** Every agent dispatch
**Example:**
```javascript
// Source: Anthropic prompt caching docs (https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
// Cache hierarchy: tools -> system -> messages
// Place shared content BEFORE agent-specific content

const systemBlocks = [];

// Block 1: Universal context (shared by ALL agents) -- ~4,600 tokens
// Rule One fundamentals + tools-for-analysis
if (universalContext) {
  systemBlocks.push({
    type: 'text',
    text: universalContext,
    cache_control: { type: 'ephemeral' },  // Breakpoint 1
  });
}

// Block 2: PSR findings (shared by all analysis agents, varies per ticker)
if (options.psrFindings) {
  systemBlocks.push({
    type: 'text',
    text: options.psrFindings,
    cache_control: { type: 'ephemeral' },  // Breakpoint 2
  });
}

// Block 3: Agent-specific prompt + curriculum (varies per agent -- NO cache_control)
systemBlocks.push({
  type: 'text',
  text: `${prompt}\n\n---\n\n${curriculum}`,
});

// API call
const response = await client.messages.parse({
  model,
  max_tokens: maxTokens,
  system: systemBlocks,
  messages: [{ role: 'user', content: userContent }],
  tools,
  output_config: { format: zodOutputFormat(ReportSectionSchema) },
});
```

### Pattern 3: Actual-Usage Budget Tracker
**What:** Replace character-based estimation with recording actual API response usage fields.
**When to use:** After every dispatchAgent call
**Example:**
```javascript
// Source: aiResearch.js buildUsage + contextBudget.js rewrite
export function createActualBudgetTracker() {
  const entries = [];

  return {
    record(agentRole, usage) {
      // usage comes from aiResearch.js dispatchAgent result.usage
      entries.push({
        agentRole,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheRead: usage.cacheRead,
        cacheWrite: usage.cacheWrite,
        webSearches: usage.webSearches,
        cost: usage.cost,
        timestamp: Date.now(),
      });
    },

    getSummary() {
      const totals = entries.reduce((acc, e) => ({
        inputTokens: acc.inputTokens + e.inputTokens,
        outputTokens: acc.outputTokens + e.outputTokens,
        cacheRead: acc.cacheRead + e.cacheRead,
        cacheWrite: acc.cacheWrite + e.cacheWrite,
        webSearches: acc.webSearches + e.webSearches,
        cost: acc.cost + e.cost,
      }), { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0, cost: 0 });

      return { entries: entries.slice(), totals };
    },
  };
}
```

### Anti-Patterns to Avoid
- **Hardcoding wave structure:** The manager MUST read dispatch-table.json, not embed wave definitions in code. The dispatch table is the single source of truth.
- **Estimating cost from character counts:** D-05 explicitly kills this. Use actual API response `usage` fields only.
- **Expecting cache hits on first parallel wave:** Agents fired simultaneously cannot benefit from each other's cache writes. Design for inter-wave caching, not intra-wave.
- **Using system message as a single string:** The current `dispatchAgent` passes `system: [{ type: 'text', text: systemContent }]` as one block. Must split into multiple blocks with selective `cache_control` for caching to work.

## Critical Finding: Parallel Cache Limitation

**Confidence:** HIGH -- Verified from official Anthropic docs.

From the prompt caching documentation:
> Cache entries only become available **after the first response begins**. For parallel requests, the first request creates the cache entry; parallel requests cannot hit that cache until the first response completes.

### Impact on This Phase

**Within a wave** (agents fire simultaneously):
- All agents in Wave 1 fire at the same time
- The first agent to be processed by Anthropic writes the universal context + PSR findings to cache
- Other agents that START PROCESSING before that first write completes will NOT get cache hits
- In practice, with 2-4 agents per wave, some may hit and some may miss

**Between waves** (sequential -- reliable caching):
- Wave 1 completes fully before Wave 2 starts
- Wave 2 agents will reliably hit the cache written by Wave 1
- This is where the 78% shared-content savings actually materialize

### Mitigation Options

1. **Accept imperfect intra-wave caching** (RECOMMENDED). The cost difference for one wave's worth of non-cached shared content is ~$0.05-0.15 for Sonnet agents. Inter-wave caching provides the bulk of savings. This aligns with D-01 (parallel within waves) without adding complexity.

2. **Fire one "primer" agent ahead** of each wave. Dispatch one agent, wait for it to begin responding, then fire the rest. Adds ~5-10s latency per wave but ensures all subsequent agents get cache hits. Worth considering only if Opus agents are in the wave (higher per-token cost).

3. **Use 1-hour cache TTL** for the universal context to ensure it persists across the entire pipeline run (30-40 min). This costs 2x base input price for the write but guarantees availability. The 5-minute TTL (default) should be sufficient for within-wave dispatch since all agents fire within seconds of each other, but the cache must be written and available before reads can happen.

**Recommendation:** Use option 1 (accept imperfect intra-wave caching) for Wave 1-3 Sonnet agents. For Wave 3 which has Opus agents (risk-analyst, valuation-specialist), consider option 2 to save on Opus's higher per-token cost.

## Critical Finding: Pricing Bug in aiResearch.js

**Confidence:** HIGH -- Verified from official Anthropic pricing page.

The PRICING constant in `aiResearch.js` uses old Opus 4 / 4.1 pricing:

```javascript
// CURRENT (WRONG):
'claude-opus-4-6': { input: 15.0, output: 75.0, cacheRead: 1.50, cacheWrite: 18.75, webSearch: 0.01 }

// CORRECT (Opus 4.6 pricing):
'claude-opus-4-6': { input: 5.0, output: 25.0, cacheRead: 0.50, cacheWrite: 6.25, webSearch: 0.01 }
```

The same fix must be applied to `contextBudget.js` MODEL_PRICING if it still references Opus pricing. Current `contextBudget.js` has Opus at `$15/$75` too.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parallel dispatch | Custom event-based orchestrator | Promise.allSettled | Already proven in dataExport.js; D-01 mandates this approach |
| Prompt caching | Token deduplication layer | SDK cache_control parameter | Anthropic handles cache storage, invalidation, and billing |
| Token counting | Client-side tokenizer | API response usage fields | API returns exact counts; client estimation is always approximate |
| Retry/backoff | Custom retry library | Existing dispatchWithRetry in aiResearch.js | Phase 8 already built retry-then-escalate (API-05) |
| Cost calculation | Manual formula | buildUsage function in aiResearch.js | Already correct for Sonnet; just fix Opus pricing |

**Key insight:** The Phase 8 `dispatchAgent` function is already well-structured. The manager wraps it, not replaces it. Cache support requires modifying the system message construction inside `dispatchAgent` to use multiple blocks with `cache_control`, but the overall dispatch interface stays the same.

## Common Pitfalls

### Pitfall 1: System Message Must Be Array of Content Blocks
**What goes wrong:** Currently `dispatchAgent` passes `system: [{ type: 'text', text: systemContent }]` -- one monolithic block. cache_control must be placed on individual blocks, not the whole string.
**Why it happens:** Phase 8 didn't need caching, so it concatenated all system content into one string.
**How to avoid:** Split system message into: universal context block (with cache_control), PSR findings block (with cache_control), agent-specific block (no cache_control). Maximum 4 breakpoints per request.
**Warning signs:** `cache_read_input_tokens` is always 0 in API responses.

### Pitfall 2: Minimum Cacheable Token Thresholds
**What goes wrong:** Content below the minimum token threshold is silently not cached. No error returned.
**Why it happens:** Anthropic has model-specific minimums: Sonnet 4.6 = 2,048 tokens, Opus 4.6 = 4,096 tokens.
**How to avoid:** The universal context files (rule-one-fundamentals.md + tools-for-analysis.md) total ~18,349 chars / ~4,600 tokens -- safely above both thresholds. PSR findings will be much larger (10K+ tokens). Agent-specific prompts are intentionally NOT cached (below thresholds and vary per agent).
**Warning signs:** Both `cache_creation_input_tokens` and `cache_read_input_tokens` are 0 in usage response.

### Pitfall 3: Cache Prefix Ordering Is Strict
**What goes wrong:** Any change to content at or before a cache breakpoint invalidates the entire cache for that breakpoint and all subsequent ones.
**Why it happens:** Cache is keyed on cumulative content hash. The hierarchy is: tools -> system -> messages.
**How to avoid:** Universal context (R1 fundamentals) is static and never changes between runs. PSR findings change per ticker but are identical for all agents analyzing the same ticker. Only agent-specific content (after all breakpoints) varies.
**Warning signs:** High cache_creation_input_tokens and low cache_read_input_tokens across agents in the same wave.

### Pitfall 4: Rate Limits at Tier 1
**What goes wrong:** Tier 1 allows only 50 RPM and 30K ITPM for both Sonnet and Opus. Firing 4 agents simultaneously each with ~20K input tokens could hit the ITPM limit.
**Why it happens:** User's API tier level is unknown (noted as a concern in STATE.md).
**How to avoid:** Prompt caching helps here -- cached tokens do NOT count against ITPM for Sonnet 4.6 and Opus 4.6 (verified from official docs). So even at Tier 1 (30K ITPM), only uncached tokens count. With caching, the effective throughput is much higher. The Phase 8 retry logic (429 handler with retry-after) provides the safety net. At Tier 2+ (1,000 RPM, 450K ITPM), this is a non-issue.
**Warning signs:** Frequent 429 errors on the first wave of a pipeline run.

### Pitfall 5: contextBudget.js Interface Mismatch
**What goes wrong:** The current `record()` method accepts `(agentRole, sectionKey, inputText, outputText, model)` -- character-based. The new interface needs `(agentRole, usage)` where usage is the actual API response.
**Why it happens:** Phase 8 didn't update contextBudget.js; it built its own `buildUsage` in aiResearch.js.
**How to avoid:** Rewrite `createBudgetTracker()` to accept the usage object from `dispatchAgent` results. The old character-based functions (`estimateTokens`, old `computeCost`) can remain exported for backward compatibility but the tracker itself switches to actuals.
**Warning signs:** Budget report shows "$0.00" or absurdly wrong numbers after switching to actual usage.

### Pitfall 6: Opus Pricing in PRICING Constant Is 3x Too High
**What goes wrong:** Cost reports overstate Opus agent costs by 3x ($15 vs $5 per MTok input, $75 vs $25 per MTok output). Total pipeline cost appears ~$4-6 higher than reality.
**Why it happens:** The PRICING constant was set using Opus 4 / 4.1 pricing. Opus 4.6 launched at $5/$25 -- a 3x reduction.
**How to avoid:** Fix the PRICING constant to match official Anthropic pricing. Also fix contextBudget.js MODEL_PRICING.
**Warning signs:** Reported costs for Opus agents (valuation-specialist, risk-analyst, synthesis-writer) seem disproportionately high compared to Sonnet agents.

## Code Examples

Verified patterns from official sources:

### Cache-Enabled Agent Dispatch
```javascript
// Source: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
// Modified for Thes1s system message structure per D-03

function buildSystemBlocks(universalContext, psrFindings, agentPrompt, curriculum) {
  const blocks = [];

  // Breakpoint 1: Universal context (shared by ALL agents -- cacheable)
  // ~4,600 tokens = rule-one-fundamentals.md (13,888 chars) + tools-for-analysis.md (4,461 chars)
  if (universalContext) {
    blocks.push({
      type: 'text',
      text: universalContext,
      cache_control: { type: 'ephemeral' },
    });
  }

  // Breakpoint 2: PSR findings (shared by all analysis agents for same ticker)
  if (psrFindings) {
    blocks.push({
      type: 'text',
      text: psrFindings,
      cache_control: { type: 'ephemeral' },
    });
  }

  // No breakpoint: Agent-specific content (varies per agent -- not cached cross-agent)
  const agentContent = [agentPrompt, curriculum].filter(Boolean).join('\n\n---\n\n');
  if (agentContent) {
    blocks.push({ type: 'text', text: agentContent });
  }

  return blocks;
}
```

### Cache Monitor
```javascript
// Source: API response usage fields from https://platform.claude.com/docs/en/build-with-claude/prompt-caching
// Monitors cache_read_input_tokens vs cache_creation_input_tokens

function createCacheMonitor() {
  const entries = [];

  return {
    record(usage) {
      entries.push({
        cacheRead: usage.cacheRead || 0,
        cacheWrite: usage.cacheWrite || 0,
        uncached: usage.inputTokens || 0,
      });
    },

    getSummary() {
      const totalRead = entries.reduce((s, e) => s + e.cacheRead, 0);
      const totalWrite = entries.reduce((s, e) => s + e.cacheWrite, 0);
      const totalUncached = entries.reduce((s, e) => s + e.uncached, 0);
      const totalCacheable = totalRead + totalWrite; // tokens that went through cache system
      const hitRate = totalCacheable > 0 ? totalRead / totalCacheable : 0;
      const belowThreshold = hitRate < 0.70 && entries.length > 1; // skip single-agent runs

      return {
        entries: entries.length,
        totalRead,
        totalWrite,
        totalUncached,
        hitRate,
        hitRatePct: `${(hitRate * 100).toFixed(1)}%`,
        belowThreshold,
      };
    },
  };
}
```

### Corrected Pricing Constants
```javascript
// Source: https://platform.claude.com/docs/en/about-claude/pricing (verified 2026-03-28)

const PRICING = {
  'claude-sonnet-4-6': {
    input: 3.0,      // $3/MTok
    output: 15.0,    // $15/MTok
    cacheRead: 0.30,  // $0.30/MTok (0.1x input)
    cacheWrite: 3.75, // $3.75/MTok (1.25x input)
    webSearch: 0.01,   // $0.01 per search
  },
  'claude-opus-4-6': {
    input: 5.0,       // $5/MTok (NOT $15 -- that's Opus 4/4.1)
    output: 25.0,     // $25/MTok (NOT $75)
    cacheRead: 0.50,  // $0.50/MTok (0.1x input)
    cacheWrite: 6.25, // $6.25/MTok (1.25x input)
    webSearch: 0.01,
  },
};
```

## Rate Limit Analysis

### By Tier (Sonnet 4.x and Opus 4.x share the same limits)

| Tier | RPM | ITPM (uncached only) | OTPM | Can Handle Parallel Wave? |
|------|-----|---------------------|------|--------------------------|
| 1 | 50 | 30,000 | 8,000 | Tight -- 4 agents x ~5K uncached = 20K ITPM. Works if cached. |
| 2 | 1,000 | 450,000 | 90,000 | Easily. No concern. |
| 3 | 2,000 | 800,000 | 160,000 | Easily. |
| 4 | 4,000 | 2,000,000 | 400,000 | Easily. |

### Critical: Cache-Aware ITPM
**For Sonnet 4.6 and Opus 4.6, only uncached input tokens count towards ITPM rate limits.** `cache_read_input_tokens` do NOT count. This is a major advantage -- with effective caching, the effective throughput is much higher than the nominal ITPM limit.

**Example at Tier 1 (30K ITPM):** With ~15K tokens cached per agent and ~5K uncached per agent, 4 parallel agents use only 20K uncached ITPM, well within the 30K limit. Without caching, those same 4 agents would need 80K ITPM -- exceeding Tier 1 by 2.7x.

### Recommendation
The user's tier level is unknown (flagged in STATE.md). At Tier 1, caching is essential for parallel dispatch to work without rate-limiting. At Tier 2+, it's purely a cost optimization. The Phase 8 retry-then-escalate pattern (429 -> backoff -> retry) handles rate limit errors gracefully. No code changes needed for rate limit handling.

## Caching Economics

### Universal Context Size
| File | Chars | Est. Tokens |
|------|-------|-------------|
| rule-one-fundamentals.md | 13,888 | ~3,472 |
| tools-for-analysis.md | 4,461 | ~1,115 |
| **Total universal context** | **18,349** | **~4,587** |

Above Sonnet's 2,048 minimum and Opus's 4,096 minimum (just barely for Opus -- monitor this).

### Pitch Deck Agent Model Mix (from agent configs)
| Wave | Agent | Model | DataPacket Slice |
|------|-------|-------|-----------------|
| Pre | annual-reader | opus | companyInfo, classification, financials, ttm, transcriptAvailability |
| Pre | quarterly-reader | opus | (same as annual) |
| 1 | business-analyst | sonnet | companyInfo, classification, ruleOneScore, peers |
| 1 | competitor-evaluator | sonnet | peers, peerMetrics, classification, companyInfo |
| 2 | competitor-evaluator (moats) | sonnet | (same) |
| 2 | financial-analyst | sonnet | financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics |
| 2 | management-evaluator | sonnet | compensation, insiders, gurus, companyInfo |
| 2 | financial-analyst (7,8) | sonnet | (same as financial-analyst) |
| 3 | risk-analyst | opus | companyInfo, events, analystEstimates, classification |
| 3 | valuation-specialist | opus | growthRates, returnMetrics, fcf, analystEstimates, ttm, currentPrice, keyMetrics |
| Post | synthesis-writer | opus | (empty -- reads prior sections) |

### Estimated Cost Savings (Corrected Opus Pricing)

**Without caching (baseline):**
- 8 Sonnet agents x ~20K shared tokens each: 160K tokens x $3/MTok = $0.48
- 3 Opus agents x ~20K shared tokens each: 60K tokens x $5/MTok = $0.30
- Total shared content cost: $0.78

**With caching:**
- First agent (cache write): 20K x $3.75/MTok (Sonnet) = $0.075
- 7 subsequent Sonnet reads: 140K x $0.30/MTok = $0.042
- First Opus write: 20K x $6.25/MTok = $0.125
- 2 subsequent Opus reads: 40K x $0.50/MTok = $0.020
- Total shared content cost: $0.262

**Savings: ~66% on shared content** ($0.78 -> $0.26).

Note: Inter-wave caching is reliable (sequential). Intra-wave caching depends on timing. Realistic savings are likely ~50-60% factoring in some intra-wave cache misses.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Character-based token estimation (chars/4) | Actual API response usage fields | Phase 8 (aiResearch.js buildUsage) | Cost tracking is exact, not approximate |
| Single system message string | Array of content blocks with cache_control | This phase | Enables prompt caching for 50-66% savings on shared content |
| Opus at $15/$75 per MTok | Opus 4.6 at $5/$25 per MTok | Anthropic pricing update (Opus 4.5/4.6) | 3x cost reduction for Opus agents; must update PRICING constant |
| Sequential agent dispatch (CC skill) | Parallel wave dispatch (Promise.allSettled) | This phase | 30-40 min total vs 2.5+ hours sequential |

**Deprecated/outdated:**
- `estimateTokens()` in contextBudget.js: Still useful for pre-flight estimation but NOT for budget tracking (D-05). The budget tracker must use actuals.
- Opus $15/$75 pricing: Only applies to Opus 4 and 4.1. Opus 4.5 and 4.6 are $5/$25.

## Open Questions

1. **User's API tier level**
   - What we know: STATE.md flags this as a concern. Tier 1 has 50 RPM / 30K ITPM.
   - What's unclear: What tier is the user on? This affects whether parallel dispatch hits rate limits.
   - Recommendation: Log rate limit response headers (`anthropic-ratelimit-*`) on first API call and warn if Tier 1. Caching mitigates ITPM limits since cache reads don't count. The existing 429 retry logic is the safety net.

2. **PSR findings format and size**
   - What we know: PSR reads annual + quarterly filings, produces findings that feed into all analysis agents.
   - What's unclear: PSR hasn't been implemented yet. How large will its output be? If it's very large (50K+ tokens), it'll dominate the cache prefix.
   - Recommendation: PSR findings should be summarized to a reasonable size (5-15K tokens) before being placed in the cached system message. The manager can truncate if needed.

3. **PM feedback mechanism**
   - What we know: D-07 says the manager pauses for PM review between waves. Feedback is folded into next wave's context.
   - What's unclear: How is feedback provided? (a) In the calling code (the CC skill or future UI), (b) as plain text appended to user messages, or (c) as additional system context.
   - Recommendation: The manager accepts an async callback `onWaveComplete` that returns a feedback string. If non-empty, it's appended to the user message of subsequent agents (after the DataPacket). This avoids polluting the cached system prefix with per-run feedback.

4. **Opus 4.6 universal context threshold**
   - What we know: Universal context is ~4,587 tokens. Opus 4.6 minimum cacheable length is 4,096 tokens.
   - What's unclear: Token estimation from char count is approximate. The actual token count could be slightly below 4,096.
   - Recommendation: Monitor the first Opus agent's `cache_creation_input_tokens` in the usage response. If 0, the content is below threshold. Fix by including a small amount of additional static content (e.g., stage template header) to push over 4,096.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | vitest defined in package.json |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-02 | Parallel dispatch: Promise.allSettled fires wave agents, wall-clock ~ slowest agent | unit | `npx vitest run src/engines/__tests__/pipelineManager.test.js -t "parallel dispatch"` | Wave 0 |
| API-03 | Cache breakpoints: system message has cache_control on universal + PSR blocks | unit | `npx vitest run src/engines/__tests__/aiResearch.test.js -t "cache_control"` | Wave 0 (extend existing) |
| API-06 | Cache monitor: tracks hit rate, warns below 70% | unit | `npx vitest run src/engines/__tests__/cacheMonitor.test.js` | Wave 0 |
| API-07 | Budget tracker: records actual usage per agent, produces per-agent and total cost breakdown | unit | `npx vitest run src/engines/__tests__/contextBudget.test.js -t "actual usage"` | Wave 0 (extend existing) |

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/engines/__tests__/pipelineManager.test.js` -- covers API-02 (parallel dispatch timing, wave sequencing, checkpoint callbacks)
- [ ] `src/engines/__tests__/cacheMonitor.test.js` -- covers API-06 (hit rate calculation, 70% threshold warning)
- [ ] Extend `src/engines/__tests__/aiResearch.test.js` -- covers API-03 (verify system blocks have cache_control)
- [ ] Extend `src/engines/__tests__/contextBudget.test.js` -- covers API-07 (actual-usage-based tracking replaces char-based)

## Sources

### Primary (HIGH confidence)
- [Anthropic Prompt Caching Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) -- cache_control breakpoints, TTL options, parallel request limitation, minimum token thresholds, usage response fields
- [Anthropic Pricing Page](https://platform.claude.com/docs/en/about-claude/pricing) -- Model pricing table (Opus 4.6: $5/$25, Sonnet 4.6: $3/$15), cache multipliers, web search $0.01/search
- [Anthropic Rate Limits Page](https://platform.claude.com/docs/en/api/rate-limits) -- Tier tables, cache-aware ITPM (cached reads don't count against ITPM for 4.6 models)
- Local codebase: `src/engines/aiResearch.js`, `src/engines/contextBudget.js`, `agents/orchestrator/dispatch-table.json`, all agent `config.json` files

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` -- SDK features, integration patterns (verified against official docs)
- `agents/orchestrator/README.md` -- State machine, checkpoint format

### Tertiary (LOW confidence)
- None -- all findings verified against official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies, all existing SDK features verified
- Architecture: HIGH -- Pattern derived from official docs + existing codebase patterns + locked decisions from CONTEXT.md
- Pitfalls: HIGH -- Parallel cache limitation verified from official docs; pricing bug verified from official pricing page; rate limits verified from official docs
- Cache economics: MEDIUM -- Token estimates from char/4 approximation; actual savings depend on cache hit timing in parallel requests

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (30 days -- prompt caching API is stable GA, pricing may change)
