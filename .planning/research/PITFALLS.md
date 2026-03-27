# Domain Pitfalls: Claude Code to API Migration

**Domain:** Migrating multi-agent AI pipeline from Claude Code subagent orchestration to direct Claude API calls
**Project:** Thes1s v1.1 -- Pitch Deck pipeline API migration
**Researched:** 2026-03-27
**Overall confidence:** HIGH (grounded in official Anthropic documentation, project-specific V1-V3 validation failures, and verified API behavior)

---

## Critical Pitfalls

Mistakes that cause pipeline failures, silent quality degradation, or cost blowups. Each is either documented in official sources or observed in this project's 3 validation runs.

---

### Pitfall 1: Structured Outputs + Citations Are Mutually Exclusive

**What goes wrong:** You enable `output_config.format` (JSON schema) on a request that also uses the web search tool, expecting Claude's built-in citation system to provide web URLs alongside your structured JSON output. The API returns a **400 error**: "Citations cannot be used together with structured outputs." Your pipeline crashes on every agent that does web research.

**Why it happens:** Claude's citation system interleaves `citation` blocks within `text` content blocks (e.g., `{ type: "text", text: "Revenue grew 18%", citations: [{type: "web_search_result_location", url: "..."}] }`). Structured outputs constrain the entire response to a single JSON object. These two output formats are physically incompatible -- you cannot interleave citation metadata within a JSON string field.

**Consequences:**
- Cannot use both structured outputs AND automatic web citations in the same API call
- Must choose: guaranteed JSON schema compliance OR automatic citation URLs from web search
- The V3 "web citation laundering" problem (agents citing domain names instead of URLs) cannot be solved by simply turning on both features

**Warning signs:**
- 400 errors when combining `output_config.format` with web search tool
- Planning documents that assume web search citations will "just work" with structured outputs

**Prevention:**
1. **Two-phase agent calls.** Phase 1: Agent uses web search tool (no structured output) -- produces free-form analysis with automatic citations. Phase 2: Same conversation, ask Claude to reformat into the JSON schema (with structured output) -- the web search results and citations are already in the conversation context. Claude can extract URLs from the `web_search_result` content blocks visible in its own conversation history.
2. **Extract URLs from tool results programmatically.** The orchestrator receives `web_search_tool_result` content blocks containing `web_search_result` objects with `url`, `title`, and `page_age` fields. Parse these server-side and inject them into the agent's follow-up prompt: "You used these URLs in your research: [url1, url2, ...]. Include the actual URL in every citation's `source` field."
3. **Post-processing URL injection.** After an agent completes (with structured output), scan the conversation's `server_tool_use` and `web_search_tool_result` blocks for URLs. Match search queries to citation sources and replace domain-name-only citations with full URLs.

**Detection:** Unit test that sends a request with both `output_config.format` and `tools: [{type: "web_search_20250305"}]` and verifies it either works (in some future API version) or is handled gracefully.

**Which migration phase:** Phase 1 (aiResearch.js architecture) -- this is a fundamental design constraint that shapes how every agent call is structured. Get this wrong and every web-searching agent fails.

**Confidence:** HIGH -- Verified in official Anthropic structured outputs documentation: "Incompatible with Citations: Citations require interleaving citation blocks with text, which conflicts with strict JSON schema constraints. Returns 400 error if citations enabled with output_config.format."

---

### Pitfall 2: Narrative Collapse Under Schema Constraints (The JSON Squeeze)

**What goes wrong:** When Claude must produce a complex JSON object with many required fields, it budget-constrains the long string fields (like `narrative`) to fit everything within its output token limit. Instead of a 1,200-word Buffett-style analysis, you get a 150-word stub like "See full narrative in agent output" or a choppy summary. This is the exact V2 failure (6/10 sections produced stubs) that the two-pass pattern solved.

**Why it happens:** Two compounding factors:
1. **Token budget pressure.** Claude sees the full schema and mentally reserves tokens for all required fields. With 15+ required fields including arrays of citations, tables, charts, and cross-cutting findings, the model naturally "compresses" the longest fields (narrative, verdictRationale) to make room for everything else.
2. **Constrained decoding overhead.** Structured outputs compile the JSON schema into a grammar that constrains each token. The grammar state machine must track position within nested objects. For complex schemas with many optional parameters, this creates larger grammar state spaces. The model's effective "creative bandwidth" for prose generation within a JSON string field is lower than when generating free-form text.
3. **max_tokens truncation is schema-breaking.** If the response hits `max_tokens`, the output has `stop_reason: "max_tokens"` and the JSON may be **incomplete and invalid** -- not just missing the closing brace, but potentially truncated mid-field. The API docs explicitly state: "The output may be incomplete and not match your schema."

**Consequences:**
- Narratives shrink from 1,200 words (V3 two-pass) to 150 words (V2 single-pass)
- Executive summary collapses from 4,700 chars to 350 chars
- Quality score drops from 75 to 56 (V2 vs V3)
- Truncated JSON on max_tokens hit -- `JSON.parse()` fails, entire agent output lost

**Warning signs:**
- Narrative fields under 500 characters when the prompt asks for 800+ words
- `stop_reason: "max_tokens"` in API responses
- JSON parse errors on agent output
- Section quality scores below 60

**Prevention:**
1. **Keep the two-pass pattern.** Even with structured outputs, use a two-phase approach per agent call:
   - Turn 1: "Write your full analysis as prose. Be thorough. 800+ words minimum."
   - Turn 2: "Now format your analysis into this JSON schema: [schema]. Your narrative field MUST contain the full prose you just wrote, not a summary."
   - Turn 2 uses `output_config.format` with the JSON schema. The full narrative is already in the conversation context, so Claude copies it into the JSON rather than generating a compressed version.
2. **Set max_tokens generously.** The ReportSectionSchema with a full narrative, 15 citations, tables, and data typically needs 6,000-10,000 output tokens. Set `max_tokens: 16384` per agent call. The API docs confirm: "max_tokens does not factor into OTPM rate limit calculations, so there is no rate limit downside to setting a higher max_tokens value."
3. **Check stop_reason.** Every API response must check `response.stop_reason`. If `"max_tokens"`, the output is invalid -- retry with higher max_tokens. If `"refusal"`, the output may not match schema. Only `"end_turn"` guarantees valid structured output.
4. **Schema simplification for narrative-heavy sections.** Consider splitting the schema: one call for the narrative + citations + redFlags (the creative content), another for the structured data fields (tables, charts, metrics). Reduces schema complexity, gives Claude more token budget for the prose.
5. **Count optional parameters carefully.** The API enforces a hard limit of **24 optional parameters** across all strict schemas in a request. The current ReportSectionSchema has `tables`, `charts`, `primarySourceInsights`, `crossCuttingFindings`, and `searchesPerformed` as optional. That's 5 optional parameters per schema. With toolbox tools also using strict mode, this adds up fast. Use `required` with empty defaults where possible instead of `optional`.

**Detection:** Automated check: if `narrative.length < 500` after structured output, flag as potential collapse. Compare narrative word counts between two-pass and single-pass approaches in validation runs.

**Which migration phase:** Phase 1 (aiResearch.js) for the two-pass pattern architecture. Phase 2 (pipeline migration) for per-agent tuning of max_tokens and schema complexity.

**Confidence:** HIGH -- V2 validation run proved this failure mode. API docs confirm max_tokens truncation breaks schema compliance. Schema complexity limits (24 optional params, "Schema is too complex" 400 error) are documented.

---

### Pitfall 3: Prompt Cache Invalidation Through Accidental Ordering Changes

**What goes wrong:** Your prompt caching strategy expects 90% cache hit rates (saving ~$6 per company), but actual cache hits are near 0% because the cache key is invalidated on every request. You're paying the 1.25x cache write premium on every call instead of the 0.1x cache read discount. Cost per company goes UP, not down.

**Why it happens:** Claude's prompt cache computes a prefix hash. The hierarchy is **tools -> system -> messages**, and changes cascade downward. Specific invalidation triggers that are easy to hit accidentally:

1. **Tool definition changes cascade.** Any change to any tool definition invalidates tools + system + messages caches. If your orchestrator dynamically includes/excludes tools per agent (e.g., financial-analyst gets computeMOS but not WebSearch), the tool list changes between agents, invalidating the cache of shared context (curriculum, DataPacket). Solution: Always send the same tool list, even if some agents won't use all tools.
2. **Dynamic timestamps in system prompts.** If the system prompt includes "Current date: 2026-03-27" or "DataPacket generated at [timestamp]", the cache invalidates every day (or every run). The cache breakpoint must be placed BEFORE any changing content.
3. **JSON key ordering randomization.** Node.js `JSON.stringify` produces deterministic key order for plain objects, but if you're building tool definitions from Maps or sorting dynamically, key order might change between calls, producing different hashes.
4. **Image or tool_choice changes.** Adding or removing images anywhere in the prompt, or changing `tool_choice`, invalidates the messages cache.
5. **The 5-minute TTL trap.** Default cache TTL is 5 minutes. If agents within a pipeline take longer than 5 minutes between cache-sharing requests (e.g., Wave 1 finishes at minute 3, Wave 2 starts at minute 9), the cache expires. Use `"ttl": "1h"` (costs 2x base instead of 1.25x, but still 80% cheaper than cache miss).
6. **Parallel first requests can't share cache.** Cache entries aren't available until the first response begins. If you fire Wave 1's 3 agents simultaneously and they all share the same curriculum prefix, only the first one creates the cache -- the other two create separate cache entries (3x cache write cost). Subsequent waves benefit, but the first wave pays full price.

**Consequences:**
- Cache write costs (1.25x) on every call instead of cache read costs (0.1x)
- $8-12 cost target becomes $14+ (worse than CC mode)
- Silent failure -- cache misses don't cause errors, they just cost more. You only notice when checking `response.usage.cache_read_input_tokens === 0`

**Warning signs:**
- `cache_creation_input_tokens` is high on every request (should be high on first, near-zero on subsequent)
- `cache_read_input_tokens` is always 0 (should be high after first request)
- Total API cost exceeding estimates by 2x+

**Prevention:**
1. **Stable tool definitions.** Send the exact same tool array (same tools, same order, same definitions) to every agent in a pipeline run. Mark the last tool with `cache_control: { type: "ephemeral", ttl: "1h" }`.
2. **Static system prompt prefix.** Structure system as two blocks:
   ```
   Block 1: [Static curriculum + Rule One fundamentals] ← cache_control breakpoint
   Block 2: [Dynamic: agent-specific instructions, DataPacket slice, upstream summaries]
   ```
   Block 1 is identical across agents sharing the same curriculum -- cache hit. Block 2 varies per agent -- uncached, which is fine.
3. **Use 1-hour TTL for pipeline-shared content.** Curriculum and DataPacket don't change during a single pipeline run. Use `"ttl": "1h"` on these breakpoints. Cost is 2x base for first write instead of 1.25x, but every subsequent read is 0.1x.
4. **Warm the cache sequentially before parallel dispatch.** Fire one agent first (e.g., the simplest, fastest one), wait for its response to begin (streaming), then fire the parallel wave. The cache entry from the first agent is now available for all parallel agents.
5. **Monitor cache metrics after every run.** Log `cache_creation_input_tokens` and `cache_read_input_tokens` from every response. Alert if cache read ratio drops below 50%.
6. **Minimum token threshold check.** Cache requires minimum 2,048 tokens (Sonnet 4.6) or 4,096 tokens (Opus 4.6). If your curriculum slice is under this threshold for an agent, it won't cache. Bundle curriculum with universal context to exceed the minimum.

**Detection:** Build a `cacheMonitor` utility into the orchestrator that tracks cache hit/miss ratios per pipeline run and logs a warning if hit rate falls below 70%.

**Which migration phase:** Phase 1 (aiResearch.js) for cache architecture. Phase 2 for per-agent tuning and monitoring.

**Confidence:** HIGH -- All invalidation rules verified against official Anthropic prompt caching documentation. Pricing model confirmed. TTL behavior and parallel request limitations confirmed.

---

### Pitfall 4: Rate Limiting Kills Parallel Dispatch at Low Tiers

**What goes wrong:** You implement parallel agent dispatch (the key runtime optimization: 2.5hr -> 30min), fire 5 Sonnet agents simultaneously, and immediately get 429 rate limit errors because your API tier only allows 50 RPM with 30K ITPM.

**Why it happens:** Rate limits are per-model-family, not per-individual-model. All Sonnet 4.x traffic (Sonnet 4, 4.5, 4.6) shares one pool. All Opus 4.x traffic shares another. The pitch deck pipeline uses both:
- Sonnet agents: business-analyst, competitor-evaluator, financial-analyst, management-evaluator (4 agents)
- Opus agents: annual-reader, quarterly-reader, risk-analyst, valuation-specialist, synthesis-writer (5 agents)

At Tier 1 (50 RPM, 30K ITPM for both Sonnet and Opus), firing even 3 agents in parallel with ~50K input tokens each blows the 30K ITPM limit immediately.

At Tier 2 (1,000 RPM, 450K ITPM), parallel dispatch is comfortable for the analysis agents but tight for the PSR phase (5 annual readers + 2 quarterly readers = 7 parallel Sonnet calls with ~100K+ tokens each).

**Consequences:**
- 429 errors cause retries, which cause more 429 errors (amplification spiral)
- Pipeline hangs or fails entirely
- Even with exponential backoff, effective parallelism drops to near-sequential
- PSR phase (biggest token consumer) is the bottleneck

**Warning signs:**
- `429 rate_limit_error` in API responses
- `retry-after` headers with values > 10 seconds
- Pipeline runtime exceeds 60 minutes (should be 30-40 with proper parallelism)

**Prevention:**
1. **Know your tier.** Check current limits at Claude Console > Settings > Limits. The project needs at minimum Tier 2 (1,000 RPM, 450K ITPM) for meaningful parallelism. Tier 3 (2,000 RPM, 800K ITPM) is comfortable. Tier 1 cannot support parallel dispatch at all -- fall back to sequential.
2. **Prompt caching dramatically increases effective ITPM.** Cached input tokens do NOT count against ITPM rate limits (for Sonnet 4.x and Opus 4.x). With 80% cache hit rate on a 50K token input, only 10K uncached tokens count. This effectively 5x your ITPM capacity.
3. **Build a dispatch queue with concurrency limits.** Don't fire all agents at once. Use a semaphore pattern:
   ```javascript
   const MAX_CONCURRENT_SONNET = 3;  // Adjust based on tier
   const MAX_CONCURRENT_OPUS = 2;
   ```
   Queue agents and release slots as each completes.
4. **Implement exponential backoff with jitter.** On 429, read the `retry-after` header and wait that long plus random jitter (0-2 seconds). Never retry immediately.
5. **Read rate limit headers proactively.** Every response includes `anthropic-ratelimit-requests-remaining` and `anthropic-ratelimit-tokens-remaining`. If remaining is low, throttle dispatch before hitting the limit.
6. **Stagger PSR readers.** The 7 PSR readers (5 annual + 2 quarterly) are the heaviest token consumers. Dispatch 3 at a time, not all 7.

**Detection:** Track 429 error count per pipeline run. If > 0, adjust concurrency limits.

**Which migration phase:** Phase 1 (aiResearch.js dispatch queue and rate limit handling). Critical to get right before any pipeline testing.

**Confidence:** HIGH -- Rate limit tiers verified from official documentation. ITPM cache exemption confirmed. Token bucket algorithm and 429 behavior confirmed.

---

## Moderate Pitfalls

Issues that degrade quality, increase cost, or cause partial failures but don't crash the pipeline.

---

### Pitfall 5: Schema Complexity Limits Break Multi-Tool Agents

**What goes wrong:** Your agent request includes 8 Toolbox tools (all `strict: true`) plus the web search tool plus a structured output schema. The API returns a 400 error: "Schema is too complex for compilation."

**Why it happens:** Structured outputs compile all strict schemas (output format + strict tool input schemas) into a single grammar. The API enforces hard limits:
- **20 strict tools** per request maximum
- **24 optional parameters** total across ALL strict schemas combined
- **16 parameters with union types** total across ALL strict schemas
- **180-second compilation timeout** for the combined grammar

These limits interact multiplicatively. The ReportSectionSchema alone has 5 optional fields (tables, charts, primarySourceInsights, crossCuttingFindings, searchesPerformed). Each strict tool adds its optional parameters to the running total. Eight tools with 2 optional params each = 16, plus 5 from the output schema = 21. Close to the 24-parameter limit.

**Consequences:**
- 400 compilation errors on agents with many tools
- Forced to choose between strict tools and strict output schema
- Non-strict tools don't guarantee schema compliance on inputs

**Warning signs:**
- 400 errors mentioning "Schema is too complex" or compilation timeout
- Slowness on first request with a new schema (compilation taking > 10 seconds)

**Prevention:**
1. **Mark only the output schema as strict.** Use `strict: true` only on the `output_config.format` JSON schema. Make Toolbox tools non-strict (Claude naturally adheres to simple tool schemas without constrained decoding). Reserve strict enforcement for where schema violations cause real problems -- the final output.
2. **Make optional fields required with defaults.** Instead of `tables: z.array(TableSchema).optional()`, use `tables: z.array(TableSchema).default([])` and make it required in the JSON schema with a description "Empty array if no tables." This reduces optional parameter count without changing semantics.
3. **Split complex tools into simpler ones.** Instead of one tool with 8 optional parameters, use 3 tools with 2-3 required parameters each.

**Detection:** Pre-flight schema complexity check: count optional parameters and union types across all strict schemas before sending. Warn if approaching limits.

**Which migration phase:** Phase 1 (schema design) and Phase 2 (per-agent tool configuration).

**Confidence:** HIGH -- Limits verified from official structured outputs documentation. Interaction between output schema and tool schemas confirmed.

---

### Pitfall 6: Web Search Tool Cost and Token Explosion

**What goes wrong:** Agents perform 7-10 web searches per section (observed in V3), each search costs $0.01 ($10/1,000 searches), and search result content consumes significant input tokens in subsequent conversation turns. A pipeline with 10 sections averaging 7 searches = 70 searches = $0.70 in search fees. But the real cost is the search results inflating input token counts: each search returns multiple `web_search_result` blocks with `encrypted_content` that count as input tokens in multi-turn conversations.

**Why it happens:** In Claude Code, web search results are ephemeral -- the subagent's context is discarded after it returns its output. In direct API calls with multi-turn conversations (the two-pass pattern), web search results from Turn 1 remain in the conversation and are re-sent as input tokens in Turn 2. Search result content tokens accumulate.

**Consequences:**
- Each web search adds 1,000-5,000 input tokens of result content
- 7 searches per section = 7,000-35,000 additional input tokens
- These tokens are billed at full input price in Turn 2 (unless cached)
- Pipeline cost could increase by $2-4 per company just from search result token inflation

**Warning signs:**
- Input token counts on Turn 2 (structured output) are 2-3x higher than expected
- Per-section costs exceed $1 (should be $0.30-0.60)
- `usage.input_tokens` growing much larger than the system prompt + DataPacket

**Prevention:**
1. **Limit web searches per agent.** Use `max_uses: 5` on the web search tool definition. V3 showed 7-9 searches per section but many were redundant. 5 is sufficient for quality research.
2. **Don't send search results back in Turn 2.** For the two-pass pattern, structure Turn 2 as a NEW conversation (new `messages.create()` call), not a continuation. Pass the prose output from Turn 1 as a user message in Turn 2, NOT the full conversation history with all search result blocks.
3. **Use the dynamic filtering version** (`web_search_20260209`) on Opus 4.6 and Sonnet 4.6 to reduce irrelevant search result content before it enters context.
4. **Track per-search costs in the orchestrator.** The `usage.server_tool_use.web_search_requests` field tells you exactly how many searches were executed. Log it.

**Detection:** Monitor `usage.server_tool_use.web_search_requests` and input token counts across turns. Alert if search count exceeds 5 per section or input tokens on Turn 2 exceed 2x the expected DataPacket + curriculum size.

**Which migration phase:** Phase 1 (web search tool configuration) and Phase 2 (per-agent cost monitoring).

**Confidence:** HIGH -- Web search pricing ($10/1,000) and token counting behavior confirmed in official docs. Multi-turn token accumulation is standard API behavior.

---

### Pitfall 7: Loss of File System Context (CC Has It, API Does Not)

**What goes wrong:** Agent prompts reference files, paths, or patterns that worked in Claude Code but don't exist in the API context. CC subagents have access to the filesystem (Read, Write, Bash, Glob, Grep tools). Direct API calls have access to nothing except what you explicitly put in the request.

**Why it happens:** CC subagents can:
- Read CLAUDE.md for project context
- Read curriculum files on-demand (`knowledge/research-references/fgr.md`)
- Read the DataPacket from disk
- Run engine functions via Bash
- Search the codebase for patterns

API calls get exactly what you put in `system` and `messages`. If the agent prompt says "Refer to knowledge/research-references/advanced-financial-analysis.md for the ROE/ROIC methodology," the API agent has no way to access that file.

**Consequences:**
- Agents produce vague analysis because they lack curriculum depth
- References to file paths in prompts confuse the model (it tries to "remember" content it doesn't have)
- Quality drops because agents lose the methodological guardrails that curriculum files provide
- The "context engineering" challenge (right curriculum to the right agent) must be solved entirely in the orchestrator

**Warning signs:**
- Agent output lacks Rule One methodology specifics (no mention of Big 4, no FGR derivation, generic SWOT instead of PEST)
- Agent references file paths it can't access
- Quality regression compared to CC-generated output

**Prevention:**
1. **Inline everything.** Every piece of context an agent needs must be inlined into the system prompt or user message. No file references. Read curriculum files at orchestrator startup and concatenate into agent prompts.
2. **Build a `contextAssembler` utility.** For each agent, read its `config.json` `curriculum` array, load those files, and concatenate them with the universal context and DataPacket slice into a single prompt string. This replaces CC's on-demand file reading.
3. **Toolbox tools replace Bash.** CC agents call engine functions via Bash (`node -e "..."`). API agents call them via `tool_use`. The `toolbox.js` module must expose every engine function as a tool definition.
4. **Test prompt completeness.** For each agent, compare the CC skill's effective context (all files it could Read) against the API prompt's actual content. Any missing curriculum or reference material is a quality regression.

**Detection:** Side-by-side comparison of CC-generated and API-generated output for the same ticker. If API output lacks methodology depth, the context assembly is incomplete.

**Which migration phase:** Phase 1 (contextAssembler utility) and Phase 2 (per-agent context verification).

**Confidence:** HIGH -- This is a fundamental architectural difference between CC and the API. No verification needed -- it's definitionally true.

---

### Pitfall 8: Partial Pipeline Failure Without Graceful Degradation

**What goes wrong:** One agent in a wave fails (timeout, rate limit, schema too complex, model overloaded), and the pipeline either crashes entirely or produces an incomplete report with no indication of what failed.

**Why it happens:** `Promise.all()` rejects on the first failure. If you dispatch 3 agents in parallel with `Promise.all()`, one failure kills all three results -- including the two that succeeded.

**Consequences:**
- Successful agent outputs are lost
- Pipeline must restart the entire wave (wasting tokens and money)
- User sees a generic error with no indication which section failed

**Warning signs:**
- Pipeline produces 0 sections on runs where most agents succeeded
- Error messages don't identify which agent/section failed
- Cost accumulates on retried waves where most work was already done

**Prevention:**
1. **Use `Promise.allSettled()`, not `Promise.all()`.** `allSettled` returns results for ALL promises, marking each as "fulfilled" or "rejected." Process successful results, retry only the failures.
2. **Per-agent timeout.** Set per-agent timeout (e.g., 5 minutes for Sonnet, 10 minutes for Opus). Use `AbortController` with `signal` on the fetch call.
3. **Section-level persistence.** Write each completed section to `progress.json` immediately. On pipeline restart, skip completed sections.
4. **Three-tier error recovery** (from ARCHITECTURE.md): Retry once with error context -> Model upgrade (Sonnet -> Opus) -> User escalation. Never silently skip a section.

**Detection:** Automated test that simulates one agent failure in a parallel wave and verifies other agents' results are preserved.

**Which migration phase:** Phase 1 (error handling in aiResearch.js). Must be robust before Phase 2 pipeline testing.

**Confidence:** HIGH -- Standard JavaScript async pattern. No API-specific verification needed.

---

## Minor Pitfalls

Issues that waste time or money but are easily caught and fixed.

---

### Pitfall 9: Schema Compilation Latency on First Request

**What goes wrong:** The first API request with a new JSON schema experiences 5-30 seconds of additional latency while the schema compiles to a grammar. If you fire 10 agents in the first wave of a pipeline and each has a slightly different schema, that's 10 independent compilations.

**Why it happens:** Structured outputs compile JSON schemas into grammars. The compiled grammar is cached for 24 hours. But the first request with any new or modified schema pays the compilation cost.

**Prevention:** Use the **same output schema** for all agents (the ReportSectionSchema). Don't create per-section schema variants. One schema, cached once, used by all 10 sections.

**Which migration phase:** Phase 1 (schema design).

**Confidence:** HIGH -- Confirmed in official docs. Grammar caching confirmed (24-hour TTL).

---

### Pitfall 10: Numerical Constraints Not Enforced by Schema

**What goes wrong:** Your schema includes `z.number().min(1)` for `sectionNumber` or `z.array(z.string()).min(1)` for `redFlags`. You expect the API to enforce the minimums. It doesn't -- only `minItems: 0` and `minItems: 1` are supported for arrays, and numerical constraints (`minimum`, `maximum`) are NOT enforced by constrained decoding.

**Why it happens:** The SDK helper (`zodOutputFormat()`) silently removes unsupported constraints and moves them to the field description ("Must be at least 1"). Claude reads the description as guidance, not enforcement. Most of the time it complies, but there's no guarantee.

**Prevention:**
1. **Post-response validation with the original Zod schema.** Always `SectionSchema.safeParse(response.parsed_output)` after receiving the API response. The SDK's `.parse()` method does this automatically, but if you're using raw `messages.create()`, you must validate manually.
2. **Critical constraints need code enforcement.** Don't trust the schema alone for `redFlags.min(1)`. Add a post-validation check: if `redFlags.length === 0`, retry the agent with explicit instruction to include at least one red flag.
3. **Use the `.parse()` SDK method** which validates against the full Zod schema (including constraints the API doesn't enforce).

**Which migration phase:** Phase 1 (validation layer in aiResearch.js).

**Confidence:** HIGH -- Confirmed in official docs: "Numerical constraints (minimum, maximum, multipleOf, etc.) not supported. String constraints (minLength, maxLength) not supported."

---

### Pitfall 11: `output_format` vs `output_config.format` Migration Confusion

**What goes wrong:** You follow example code from a blog post or earlier documentation that uses `output_format` (the beta parameter). It works during development because Anthropic provides a transition period. Then it breaks without warning when the transition period ends.

**Why it happens:** The structured outputs API parameter moved from `output_format` (beta) to `output_config.format` (GA). The SDK helper `zodOutputFormat()` still accepts `output_format` for convenience and translates internally, but direct API calls need the new parameter path.

**Prevention:** Use `output_config.format` (the GA parameter) everywhere. If copying code from examples or blog posts, verify the parameter name.

**Which migration phase:** Phase 1 (initial API client setup). One-time fix.

**Confidence:** HIGH -- Confirmed in official migration notice: "The output_format parameter has moved to output_config.format, and beta headers are no longer required."

---

### Pitfall 12: DataPacket Path Fabrication Persists After Migration

**What goes wrong:** You migrate to the API with structured outputs, fixing citation format (Issue 1), red flags type (Issue 5), and searchesPerformed format (Issue 3) from the V3 validation. But DataPacket path fabrication (Issue 4) still occurs because structured outputs enforce the SHAPE of citations, not the CONTENT. The agent still writes `DataPacket.fcf.yearly[2025]` instead of the actual path `DataPacket.financials.cashFlow.2025`.

**Why it happens:** Structured outputs guarantee `{ id: number, ref: string, text: string, source: string }`. They cannot guarantee that `ref` contains a valid DataPacket path -- that's a semantic constraint, not a structural one.

**Prevention:**
1. **DataPacket field path reference in every agent prompt.** Include a "DataPacket Structure Reference" section listing all top-level keys and their sub-keys. This was identified as "still requires prompt-level fixes" in the V3 validation report.
2. **Post-generation citation validation in critic.js.** For every citation with `source: "DataPacket"`, validate that `ref` resolves to an actual field in the DataPacket. Already planned but must not be dropped during migration.
3. **Provide field paths alongside data.** When assembling the DataPacket slice for an agent, include a `_fieldPaths` metadata object listing all available paths. Agents can reference this instead of guessing.

**Which migration phase:** Phase 2 (prompt engineering) alongside the pipeline migration. Not blocked by API infrastructure.

**Confidence:** HIGH -- Observed in all 3 validation runs. Structured outputs solve format, not semantics.

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Phase 1: aiResearch.js | Cache invalidation from dynamic tool lists | Freeze tool array per pipeline run |
| Phase 1: aiResearch.js | Web search + structured outputs incompatibility | Design two-phase agent call pattern from day one |
| Phase 1: aiResearch.js | Promise.all crashes on single agent failure | Use Promise.allSettled with per-agent error handling |
| Phase 1: aiResearch.js | Rate limits at Tier 1 block parallelism | Implement dispatch queue with configurable concurrency |
| Phase 2: Pipeline migration | Narrative collapse in structured output mode | Preserve two-pass pattern (prose first, JSON second) |
| Phase 2: Pipeline migration | Missing curriculum in API prompts | Build contextAssembler, compare against CC context |
| Phase 2: Pipeline migration | DataPacket path fabrication persists | Add field path reference to every agent prompt |
| Phase 2: Pipeline migration | Schema complexity from strict tools + output | Make tools non-strict, only output schema strict |
| Phase 3: Validation | Cache hit rate below target | Monitor cache_read_input_tokens in every response |
| Phase 3: Validation | Cost exceeds $12 target | Track per-agent cost, identify token inflation sources |
| Phase 3: Validation | Web search cost inflation from multi-turn | Use new conversation for Turn 2, not continuation |

---

## Integration Pitfalls: CC to API Behavioral Differences

These are not bugs in either system -- they're fundamental behavioral differences that will cause quality regressions if not anticipated.

| CC Behavior | API Behavior | Migration Impact |
|-------------|-------------|-----------------|
| Subagent has fresh 1M context | API call has whatever you send | Must manually construct full context per agent |
| Subagent can Read/Write/Bash | API only has declared tools | All engine access must go through tool_use definitions |
| Subagent automatically gets CLAUDE.md | API gets nothing automatic | Relevant CLAUDE.md content must be inlined or omitted |
| Subagent output is natural language text | API output is constrained JSON (with structured outputs) | Two-pass pattern needed for narrative quality |
| WebSearch results are ephemeral | Web search results persist in conversation | Token accumulation across turns; cost inflation |
| Errors show in terminal, human retries | Errors must be caught and handled programmatically | Full retry/escalation logic in orchestrator |
| CC manages conversation state | You manage all state | Progress persistence, checkpoint serialization |
| CC handles streaming internally | You must implement stream parsing | SSE parsing for progress UI updates |
| One agent at a time (RAM limit) | True parallelism possible | Need dispatch queue, rate limit management |
| Cost: $0 (Pro subscription) | Cost: $8-12 per company (target) | Cost monitoring, token budgets, caching optimization |

---

## Sources

- [Claude API Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- Schema limitations, complexity limits, feature compatibility (citations incompatibility confirmed), max_tokens truncation behavior. HIGH confidence.
- [Claude API Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) -- Cache key computation, invalidation hierarchy, TTL rules, parallel request limitation, minimum token thresholds, pricing model. HIGH confidence.
- [Claude API Rate Limits](https://platform.claude.com/docs/en/api/rate-limits) -- Per-tier RPM/ITPM/OTPM limits, cache-aware ITPM, model family sharing, response headers. HIGH confidence.
- [Claude API Web Search Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) -- Tool definition, response structure with URLs, citation format, pricing ($10/1,000 searches), max_uses parameter. HIGH confidence.
- [Claude API Citations](https://platform.claude.com/docs/en/build-with-claude/citations) -- Citation system architecture, incompatibility with structured outputs. HIGH confidence.
- [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents) -- CC subagent capabilities (Read/Write/Bash/WebSearch). HIGH confidence.
- [Thes1s V3 Validation Report](.planning/phases/06.3-pipeline-validation-pt3/V3-VALIDATION-REPORT.md) -- Project-specific: citation format anarchy, web citation laundering, narrative collapse, DataPacket path fabrication, red flags type crash, cost regression. HIGH confidence.
- [Structured Outputs Blog Post](https://claude.com/blog/structured-outputs-on-the-claude-developer-platform) -- Constrained decoding explanation. MEDIUM confidence.
- [Claude Code Subagent Best Practices](https://claudefa.st/blog/guide/agents/sub-agent-best-practices) -- CC subagent patterns and migration considerations. MEDIUM confidence.
