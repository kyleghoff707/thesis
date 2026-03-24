# Technology Stack

**Project:** Thes1s AI Agent Workflow
**Researched:** 2026-03-24
**Overall confidence:** HIGH

---

## Recommended Stack

This stack covers the AI agent layer being added to an existing Tauri + Vite + React desktop app with 20+ validated financial data engines. The data layer and UI framework are already decided (React 19, Vite 7, Tauri 2). This document covers only the NEW technology needed for Phases 5-8: the intelligence layer.

---

### Dual-Path Agent Infrastructure

The architecture plan defines two deployment paths: CC Skills (Claude Code, personal use) and In-App Generation (Claude API, commercial). Both paths share schemas, prompts, and data assembly. The stack must serve both.

| Technology | Version | Purpose | Why |
|---|---|---|---|
| `@anthropic-ai/claude-agent-sdk` | ^0.1.x (latest) | CC Skills path: programmatic orchestration of subagents with built-in tools | Powers the same agent loop as Claude Code itself. Subagents get fresh 1M-token contexts, context isolation, parallel execution. Directly maps to the 9-agent architecture. |
| `@anthropic-ai/sdk` | ^0.78.0 (already installed) | In-App API path: direct Claude API calls with tool_use + structured outputs | Already in the project. Supports `output_config.format` with JSON schema enforcement, strict tool_use, and Zod integration for type-safe responses. |
| `zod` | ^3.24.x (import `zod/v4` subpath) | JSON schema definition + runtime validation for all agent outputs | Zod 4 has native `.toJSONSchema()` (no external library needed). Works with both SDKs. Defines report section schemas, DataPacket validation, tool input/output contracts. |

**Confidence:** HIGH -- All three packages are from Anthropic (first two) or de facto standard (Zod). Verified against official documentation.

### Why Two SDKs

The Agent SDK and the Client SDK serve different purposes and are NOT interchangeable:

| Aspect | Agent SDK (`claude-agent-sdk`) | Client SDK (`@anthropic-ai/sdk`) |
|---|---|---|
| **Tool execution** | Built-in (Read, Write, Bash, Grep, Glob, WebSearch, Agent) | You implement the tool loop yourself |
| **Subagents** | Native support with context isolation | Not supported |
| **Cost model** | Uses your Claude Code Pro subscription (included) or API key | Per-token API billing |
| **Best for** | CC Skills path, orchestration, development-time workflows | In-app generation, production API calls, commercial deployment |
| **Context** | Access to filesystem, CLAUDE.md, skills, commands | Stateless API calls, you manage all context |

Phase 5A-5C uses the Agent SDK (CC Skills). Phase 8 adds the Client SDK path (in-app generation via `aiResearch.js`). Both share Zod schemas and DataPacket assembly.

---

### Structured Output Enforcement

| Technology | Version | Purpose | Why |
|---|---|---|---|
| `zod` (via `zod/v4`) | ^3.24.x | Schema definition for report sections, DataPacket, tool contracts | Native `z.toJSONSchema()` eliminates `zod-to-json-schema` dependency. 14x faster parsing than v3. Production-ready despite v4 subpath publishing. |

**How it works with each SDK:**

**Agent SDK (CC Skills path):**
```typescript
import { z } from "zod/v4";
import { query } from "@anthropic-ai/claude-agent-sdk";

const SectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  status: z.enum(["pass", "fail", "review", "pending"]),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  verdict: z.enum(["PASS", "FAIL", "WATCHLIST"]).nullable(),
  verdictRationale: z.string(),
  summary: z.string(),
  narrative: z.string(),
  citations: z.array(z.object({ id: z.number(), ref: z.string(), text: z.string(), source: z.string() })),
  redFlags: z.array(z.string()),
});

for await (const message of query({
  prompt: "Analyze FCF for COST using the DataPacket...",
  options: {
    outputFormat: { type: "json_schema", schema: z.toJSONSchema(SectionSchema) }
  }
})) {
  if (message.type === "result" && message.structured_output) {
    const parsed = SectionSchema.safeParse(message.structured_output);
    // Guaranteed valid, type-safe section data
  }
}
```

**Client SDK (In-App API path):**
```typescript
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const response = await client.messages.parse({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  messages: [{ role: "user", content: sectionPrompt }],
  output_config: { format: zodOutputFormat(SectionSchema) },
  tools: toolboxTools, // getMetric, computeMOS, etc.
});
```

**Confidence:** HIGH -- Structured outputs are GA on all current Claude models (Opus 4.6, Sonnet 4.6, Sonnet 4.5, Opus 4.5, Haiku 4.5). Zod 4 JSON schema generation verified in official docs. The `zodOutputFormat` helper is a first-party SDK utility.

---

### Node.js Data Bridge

The existing engines use three browser-only APIs that must be adapted for Node.js (Claude Code runs in Node, not a browser):

| Browser API | Adapter | Why This Adapter |
|---|---|---|
| `import.meta.env.DEV` / `import.meta.env.VITE_*` | `dotenv` + env wrapper module | Engines use `import.meta.env.DEV` for URL routing (proxy in dev, direct in Tauri). Node adapter sets `process.env` and provides a shim. Simple, zero-dependency (dotenv is ubiquitous). |
| `DOMParser` / `document.querySelectorAll` | `linkedom` | Used in `filingMarkdown.js` for HTML-to-markdown conversion (SEC filings). LinkedOM is 3x faster than jsdom, 1/3 the memory, and sufficient for DOM traversal without full browser emulation. Already have `jsdom` as devDep but linkedom is better for production Node use. |
| Vite dev proxy (`/api/sec/*`, `/api/yahoo/*`, etc.) | Direct `fetch` with headers | In Node, no CORS restriction exists. The proxy routes (`/api/sec` -> `sec.gov`, `/api/edgar` -> `data.sec.gov`, etc.) become direct fetch calls with the proper User-Agent header. The adapter maps proxy URLs to real URLs. |
| `localStorage` / `IndexedDB` | File-based JSON cache | `cacheStore.js` already has `HAS_IDB` feature detection and falls back gracefully. For Node, cache to `.thes1s/cache/` directory as JSON files. Keep the same TTL structure. |
| `fetch` | Node.js native `fetch` (v18+) | Node 18+ has native fetch. No polyfill needed. Already verified the project targets Node 18+ (Tauri 2 requires it). |

| Technology | Version | Purpose | Why |
|---|---|---|---|
| `linkedom` | ^0.16.x | DOM parsing for filing markdown conversion in Node context | 3x faster than jsdom, 1/3 memory usage. The engine only needs `querySelectorAll`, `textContent`, basic traversal -- not full browser emulation. |
| `dotenv` | ^16.x | Load `.env.local` variables into `process.env` for Node adapter | Standard approach. Zero config. Reads the same `.env.local` file the Vite app uses. |

**The adapter is ~500-800 LOC** (per eng review estimate) and consists of:

1. **`src/engines/nodeAdapter.js`** (~200 LOC) -- Environment shim (`import.meta.env` -> `process.env`), URL mapper (proxy -> direct), DOMParser provider (linkedom), cache provider (fs-based JSON).
2. **`src/engines/dataExport.js`** (~300 LOC) -- DataPacket assembly. Calls all engines, packages output as canonical JSON. No AI logic. Pure data assembly.
3. **Toolbox tool wrappers** (~200 LOC) -- Functions that agents can call: `getMetric()`, `computeMOS()`, `comparePeers()`, etc. Thin wrappers around existing engine functions.

**Confidence:** HIGH for the approach. MEDIUM for the LOC estimate (could be 400-1000 depending on how many engines need adaptation). The cacheStore.js already has graceful Node.js fallback, which validates the pattern.

---

### Agent Definitions

| Technology | Version | Purpose | Why |
|---|---|---|---|
| Markdown files in `agents/` directory | N/A | Agent role definitions (system prompts, curriculum refs, tool access, model selection) | The architecture plan defines 9 agents as `agents/{role}/prompt.md` + `config.json`. This maps directly to the Agent SDK's `AgentDefinition` type for programmatic creation, and to Claude Code's `.claude/agents/` filesystem convention for CC Skills. |

**Agent definition format** (works with both paths):

```
agents/
  financial-analyst/
    prompt.md          -- System prompt with Rule One curriculum
    config.json        -- { "tools": [...], "model": "sonnet", "curriculum": [...], "dataSlice": [...] }
  valuation-specialist/
    prompt.md
    config.json
  ...
```

The CC Skills path loads these as `AgentDefinition` objects. The in-app API path uses the same prompts as system messages in `messages.create()` calls.

**Confidence:** HIGH -- This is the architecture plan's own recommendation. Agent SDK docs confirm both programmatic and filesystem-based agent definitions are supported.

---

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `linkedom` | ^0.16.x | Node.js DOM parsing for filing markdown | Only in Node adapter (not needed in browser -- browser has native DOMParser) |
| `dotenv` | ^16.x | Load .env.local in Node context | Only in Node adapter and CC Skills scripts |
| `zod` (v4 subpath) | ^3.24.x | Schema validation for all agent I/O | Every agent output, DataPacket validation, tool contracts |
| `cheerio` | ^1.2.0 (already installed) | HTML parsing for web scraping in Vite plugins | Already used. No change needed. |
| `turndown` + `turndown-plugin-gfm` | ^7.2.2 / ^1.0.2 (already installed) | HTML-to-markdown conversion | Already used in filingMarkdown.js. No change needed. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|---|---|---|---|
| Agent orchestration | `@anthropic-ai/claude-agent-sdk` | LangChain / LangGraph | Adds a massive abstraction layer between you and Claude. The Agent SDK IS Claude's own orchestration. LangChain's model-agnostic abstractions add complexity without value when you're committed to Claude. |
| Agent orchestration | `@anthropic-ai/claude-agent-sdk` | Vercel AI SDK (`@ai-sdk/anthropic`) | Good for chat UIs, but missing subagent support, context isolation, and the built-in tool loop that maps to your 9-agent architecture. It's an adapter, not an orchestrator. |
| Agent orchestration | `@anthropic-ai/claude-agent-sdk` | Custom `aiResearch.js` from scratch | The original plan before the hybrid model decision. Would require reimplementing tool loops, context management, retries, and error handling that the Agent SDK provides out of the box. ~2000 LOC of orchestration code you don't need to write. |
| JSON schema | Zod v4 | Pydantic | Pydantic is Python-only. Your stack is Node.js/TypeScript. |
| JSON schema | Zod v4 | `ajv` (JSON Schema validator) | Ajv validates but doesn't generate schemas. Zod does both: define once, validate everywhere, generate JSON Schema for API calls. Single source of truth. |
| JSON schema | Zod v4 | `zod-to-json-schema` | Deprecated as of November 2025. Zod 4 has native `.toJSONSchema()`. No external library needed. |
| DOM parsing (Node) | `linkedom` | `jsdom` (already installed as devDep) | jsdom is 3x slower and 3x more memory. It emulates a full browser environment you don't need. LinkedOM does exactly what the engines require (DOM traversal, querySelectorAll) at a fraction of the cost. |
| DOM parsing (Node) | `linkedom` | `@xmldom/xmldom` (already installed as devDep) | xmldom is XML-focused, not HTML. The filing HTML is real HTML with tables, divs, spans. LinkedOM handles HTML natively. |
| Context compression | Manual context engineering (curriculum slicing per agent) | Anthropic prompt caching | Prompt caching reduces cost but doesn't reduce context window usage. The real challenge is giving each agent exactly the right curriculum slice (not the full 500+ line CLAUDE.md). Manual curation > automatic compression for this use case. |
| Agent framework | None (Agent SDK + custom orchestrator) | CrewAI, AutoGen | Python-only frameworks. Your stack is Node.js. Even if ported, they add opinionated abstractions that conflict with your GSD-style orchestration pattern. |

---

## Context Engineering Strategy

This is the core design challenge per the architecture plan. Each agent needs enough curriculum to prevent hallucinations but not so much that token budgets explode.

### The Strategy: Write, Select, Compress, Isolate

| Principle | Implementation |
|---|---|
| **Write** | Agent definitions in `agents/{role}/prompt.md` with focused system prompts. 500 lines max per SKILL.md (Claude Code best practice). |
| **Select** | Each agent gets ONLY its curriculum slice. Financial Analyst gets `fgr.md` + `advanced-financial-analysis.md`. Business Analyst gets `pitch-deck-I.md`. No agent gets everything. |
| **Compress** | Universal context (rule-one-fundamentals.md + tools-for-analysis.md + 7 Operating Rules) is a ~2K token shared preamble. Keep it tight. |
| **Isolate** | Agent SDK subagents run in fresh context windows. The Primary Source Reader's 200K+ token 10-K text stays in ITS context -- other agents only see the Reader's summary output. This is the killer feature of the Agent SDK's subagent model. |

### Token Budget Estimates (per agent invocation)

| Context Component | Tokens | Notes |
|---|---|---|
| Universal context (R1 fundamentals + tools) | ~2,000 | Loaded into every agent |
| Agent-specific curriculum | ~3,000-8,000 | Varies by role. Financial Analyst needs more (fgr + advanced + capex docs) |
| DataPacket (full) | ~15,000-25,000 | 10 years of financials, metrics, peers. Biggest single item. |
| DataPacket (sliced for agent) | ~5,000-10,000 | Each agent gets its relevant slice, not the full packet |
| Section outputs from prior phases | ~2,000-5,000 | Synthesis Writer needs all prior sections; others need less |
| **Total per agent** | **~12,000-45,000** | Well within 200K context. Room for Toolbox exploration. |
| **Primary Source Reader (10-K)** | **~200,000+** | The outlier. Full 10-K text. This is why it runs as a separate subagent. |

### The `contextBudget.js` Module (Phase 5D)

Token counting utility that measures context usage per agent invocation. Not a hard limiter for Phase 5A-5C -- let agents use tokens freely in CC mode. Measure actual usage, then set budgets for the API mode based on real data.

```javascript
// contextBudget.js — measure, don't limit (for now)
export function estimateTokens(text) { return Math.ceil(text.length / 4); }
export function measureAgentContext(prompt, curriculum, dataSlice) {
  return { prompt: estimateTokens(prompt), curriculum: estimateTokens(curriculum),
           data: estimateTokens(JSON.stringify(dataSlice)), total: /* sum */ };
}
```

**Confidence:** HIGH for the strategy. MEDIUM for token estimates (need real measurement once DataPacket assembly is built). The 65% enterprise failure rate from context drift (per context engineering research) validates the importance of the Select + Isolate approach.

---

## Model Selection Strategy

| Agent Role | Model | Why |
|---|---|---|
| Data Assembler | N/A (pure code, no AI) | Runs `dataExport.js` -- no LLM call |
| Primary Source Reader | Opus 4.6 | 200K+ token 10-K input. Needs strongest reasoning for nuanced qualitative extraction (management tone, promise tracking, competitive positioning). |
| Financial Analyst | Sonnet 4.5 | Quantitative analysis with structured data. Sonnet handles numbers and formulas well at 60% lower cost. |
| Business Analyst | Sonnet 4.5 | Business model analysis. Web search for qualitative research. Sonnet sufficient for structured qualitative work. |
| Competitor Evaluator | Sonnet 4.5 | Landscape analysis with peer metrics data. Structured comparison work. |
| Management Evaluator | Sonnet 4.5 | Insider activity + compensation analysis. Structured data + web search. |
| Risk Analyst | Opus 4.6 | Adversarial thinking (PEST, bear cases, inversion). Needs strongest reasoning to construct compelling counter-arguments. |
| Valuation Specialist | Opus 4.6 | FGR derivation (5 inputs, synthesis), sensitivity analysis, growth ceiling checks. Complex multi-variable reasoning. |
| Synthesis Writer | Opus 4.6 | Buffett-style narrative. Final thesis. Needs the best writing quality. |

**In Agent SDK:**
```typescript
agents: {
  "financial-analyst": {
    description: "...",
    prompt: financialAnalystPrompt,
    tools: ["Read", "Bash"],  // Bash for engine functions
    model: "sonnet"  // SDK handles model routing
  },
  "risk-analyst": {
    description: "...",
    prompt: riskAnalystPrompt,
    tools: ["Read", "Bash", "WebSearch"],
    model: "opus"
  }
}
```

**Confidence:** HIGH for the model selection rationale. The Agent SDK's `model` field in `AgentDefinition` directly supports per-subagent model selection ("sonnet", "opus", "haiku", "inherit").

---

## Installation

```bash
# New dependencies for AI agent layer
npm install @anthropic-ai/claude-agent-sdk zod linkedom dotenv

# Already installed (no change needed)
# @anthropic-ai/sdk ^0.78.0
# cheerio ^1.2.0
# turndown ^7.2.2
# turndown-plugin-gfm ^1.0.2
```

**Note on Zod 4:** Install `zod@^3.24.x` and import from `zod/v4` subpath. Zod 4 is published as a subpath of the v3 package, not as a separate `zod@4` package. This is the official recommendation per Zod's versioning docs.

```javascript
// Correct import for Zod 4 features (toJSONSchema, faster parsing)
import { z } from "zod/v4";

// NOT: import { z } from "zod";  // This gets Zod 3
```

---

## What NOT to Install

| Library | Why Not |
|---|---|
| `langchain` / `@langchain/anthropic` | Adds 50+ transitive dependencies and model-agnostic abstractions you don't need. You're using Claude exclusively. The Agent SDK gives you the orchestration loop directly. |
| `@ai-sdk/anthropic` (Vercel AI SDK) | Designed for chat UIs with streaming. No subagent support. Doesn't map to your 9-agent architecture. |
| `crewai` / `autogen` | Python-only. Your stack is Node.js. |
| `openai` | You're not using OpenAI. Don't add it "just in case." |
| `zod-to-json-schema` | Deprecated. Zod 4 has native `.toJSONSchema()`. |
| `jsdom` (for production Node adapter) | 3x slower than linkedom for DOM traversal. Keep it as devDep for vitest only. |
| `tiktoken` / `@anthropic-ai/tokenizer` | For Phase 5A-5C, use the simple `text.length / 4` estimate. Don't add a tokenizer dependency until Phase 5D when you build `contextBudget.js` and need precision. Even then, Claude's API returns token counts in response metadata. |
| `express` / `fastify` | No server needed. This is a desktop app. The Node adapter runs locally for CC Skills, not as a web server. |

---

## Sources

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) -- Official docs, subagent patterns, tool definitions
- [Claude Agent SDK Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents) -- Context isolation, parallel execution, AgentDefinition API
- [Claude Agent SDK Structured Outputs](https://platform.claude.com/docs/en/agent-sdk/structured-outputs) -- outputFormat, Zod integration, error handling
- [Claude API Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- output_config.format, strict tool_use, JSON schema enforcement
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) -- SKILL.md format, frontmatter, triggering conditions
- [Zod v4 Release Notes](https://zod.dev/v4) -- Native toJSONSchema(), 14x faster parsing, subpath publishing
- [Zod JSON Schema Docs](https://zod.dev/json-schema) -- Schema generation, supported features
- [LinkedOM GitHub](https://github.com/WebReflection/linkedom) -- Performance benchmarks vs jsdom
- [Skill Authoring Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) -- Description triggers, progressive disclosure
- [Context Engineering Guide 2026](https://www.newsletter.swirlai.com/p/state-of-context-engineering-in-2026) -- Write/Select/Compress/Isolate framework
