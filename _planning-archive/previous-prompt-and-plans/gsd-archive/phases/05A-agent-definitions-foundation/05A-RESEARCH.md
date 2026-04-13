# Phase 5A: Agent Definitions & Foundation - Research

**Researched:** 2026-03-24
**Domain:** Multi-agent AI infrastructure — agent role definitions, DataPacket assembly, report schema, Node.js data bridge
**Confidence:** HIGH

## Summary

Phase 5A establishes the entire foundation for AI-powered report generation: 9 agent role definitions with curriculum, a DataPacket assembler that packages all 20+ engine outputs into canonical JSON, a report JSON schema enforced by Zod, a Node.js data bridge that lets engines run outside the browser, and generation state persistence. This is infrastructure-only — no AI calls, no UI, no generation. The deliverables are verified by the user reading agent definitions and by automated tests confirming DataPacket assembly and schema validation work correctly.

The core challenge is context engineering. The architecture plan specifies that each agent gets a focused slice of curriculum and data — enough to prevent hallucinations, not so much that tokens explode. The user will write each agent definition using the `/writing-skills` Claude Code skill, which follows a TDD process (baseline test, write skill, close loopholes). Agent definitions must follow the CC skill format (YAML frontmatter with `name` and `description`, Markdown body) while also producing a `config.json` per role for machine-readable configuration.

The DataPacket assembler (`dataExport.js`) and Node.js data bridge are the most technically complex deliverables. They require adapting 17+ engine files that use `import.meta.env.DEV` for URL routing, wrapping browser APIs (DOMParser, localStorage, IndexedDB) with Node equivalents, and assembling output from all engines into a single canonical JSON structure. The cacheStore.js already has `HAS_IDB` feature detection, which validates the adaptation pattern.

**Primary recommendation:** Build in this order: (1) Report JSON schema with Zod, (2) Node.js data bridge + DataPacket assembly, (3) Toolbox tool wrappers, (4) Agent definitions (user-authored via `/writing-skills`), (5) Orchestrator definition, (6) Generation state persistence. Schema first because everything depends on it. Agent definitions last because the user authors them personally and they need the DataPacket shape and tool definitions finalized first.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGNT-01 | 9 agent role definitions in `agents/` directory with prompt.md, config.json, README.md | Architecture plan specifies exact directory structure, curriculum mapping table, DataPacket slices, and Toolbox tools per role. User writes each via `/writing-skills`. |
| AGNT-02 | Universal agent context — rule-one-fundamentals.md + tools-for-analysis.md + 7 Operating Rules | Files exist and total ~660 lines (~2K tokens). Loaded into every AI agent as shared preamble. |
| AGNT-03 | Agent curriculum injection at full depth — no compression, no summarization | Curriculum files measured: Stage 1 = 440 lines, Stage 2 = 1,246 lines, Stage 3 = 783 lines, research refs = 1,589 lines, Buffett principles = 219 lines. Total curriculum corpus is manageable within context budgets. |
| AGNT-04 | Example contamination boundary — LULU examples never enter agent context | Architecture plan KDD #15. Enforce via config.json exclusion rules and prompt instructions. Critical pitfall #1 from PITFALLS.md. |
| AGNT-05 | Orchestrator definition — dispatch table, phase definitions, checkpoint rules, section-to-agent mapping | Architecture plan provides full stage orchestration flows for all 3 stages. Orchestrator gets rule-1-workflow.md as exclusive curriculum. |
| DATA-01 | DataPacket assembly (dataExport.js) — all 20+ engine outputs into canonical JSON | 41 engine files identified. DataPacket schema defined in architecture plan. Pure code, no AI. |
| DATA-02 | Node.js data bridge (~500-800 LOC) — import.meta.env shim, DOMParser adapter, direct fetch, file-based cache | 17 engine files use `import.meta.env.DEV`. cacheStore.js has HAS_IDB fallback pattern. linkedom for DOM parsing. |
| DATA-03 | 12+ Toolbox tools callable by agents | Existing engine functions map directly: valuation.js exports computeMOS/PBT/TenCap/EquityBond/sensitivityTable, growthRates.js exports computeGrowthRates, etc. Thin wrappers needed. |
| DATA-04 | DataPacket slicing — each agent gets only its relevant data slice | Architecture plan defines exact slice per agent role. Slicing function takes full DataPacket + agent config -> filtered DataPacket. |
| SCHM-01 | Report JSON schema per section — key, title, status, confidence, verdict, etc. | Architecture plan provides exact field list. Zod v4 schema with `.toJSONSchema()` for Claude structured outputs. |
| SCHM-02 | JSON schema enforcement via Claude structured outputs (constrained decoding) | Zod v4 `.toJSONSchema()` feeds `output_config.format` (API mode) or Agent SDK `outputFormat` (CC mode). Verified in STACK.md research. |
| SCHM-03 | Backward-compatible with existing report data model in localStorage | Existing model: `{ id, ticker, companyName, currentStage, stageApprovals, onePager: {}, pitchDeck, fullStory, notes, watchlist, competitors }`. New schema nests section arrays inside onePager/pitchDeck/fullStory objects. |
| SCHM-04 | Generation state persistence — `.thes1s/reports/{TICKER}/progress.json` | Architecture plan defines state machine (IDLE through COMPLETE) with per-section status tracking and checkpoint history. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` (import from `zod/v4`) | 3.24.x (registry: 4.3.6 as of 2026-03-24) | Report section schema, DataPacket validation, tool contracts | Native `.toJSONSchema()` eliminates `zod-to-json-schema`. Works with both Anthropic SDKs. 14x faster parsing than v3. |
| `linkedom` | 0.18.x (registry: 0.18.12) | DOM parsing for filingMarkdown.js in Node context | 3x faster than jsdom, 1/3 memory. Only needs querySelectorAll/textContent, not full browser emulation. |
| `dotenv` | 17.x (registry: 17.3.1) | Load `.env.local` into process.env for Node adapter | Standard approach. Reads the same `.env.local` Vite uses. |

### Already Installed (no changes)

| Library | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.78.0 (registry: 0.80.0) | Claude API client — used for structured outputs in API mode |
| `vitest` | ^4.1.0 | Test framework — 173 existing engine tests, 630 total test cases |

### Not Yet Needed (future phases)

| Library | Phase | Purpose |
|---------|-------|---------|
| `@anthropic-ai/claude-agent-sdk` | Phase 5C | CC Skills orchestration. Not needed for 5A (definitions only, no execution). |

**Installation:**
```bash
npm install zod linkedom dotenv
```

**Note on Zod 4:** Install `zod@latest` (currently 4.3.6 on npm). Import from `zod/v4` subpath if using the v3 package, OR import from `zod` directly if zod@4 is installed as a standalone package. Verify which path works after install:
```javascript
// Try this first (standalone v4)
import { z } from "zod";
z.toJSONSchema // should exist

// If that fails, try subpath (v4 via v3 package)
import { z } from "zod/v4";
```

## Architecture Patterns

### Recommended Project Structure

```
agents/                              # NEW — Agent definitions (user-authored)
  orchestrator/
    prompt.md                        # Dispatch table, phase definitions, checkpoint rules
    config.json                      # { curriculum, sections, model }
    README.md                        # Human-readable role description
  data-assembler/
    prompt.md                        # Engine list, DataPacket schema (no AI)
    config.json
    README.md
  primary-source-reader/
    prompt.md                        # 10-K reader, transcript analyzer, promise tracker
    config.json
    README.md
  financial-analyst/
    prompt.md                        # Growth, returns, FCF, balance sheet
    config.json
    README.md
  business-analyst/
    prompt.md                        # Business model, moat identification
    config.json
    README.md
  competitor-evaluator/
    prompt.md                        # Landscape, TAM, moat validation
    config.json
    README.md
  management-evaluator/
    prompt.md                        # CEO assessment, insider activity, compensation
    config.json
    README.md
  risk-analyst/
    prompt.md                        # Adversarial: PEST, bear cases, inversion
    config.json
    README.md
  valuation-specialist/
    prompt.md                        # FGR derivation, 4 methods, sensitivity
    config.json
    README.md
  synthesis-writer/
    prompt.md                        # Buffett-style narrative, verdicts, overall thesis
    config.json
    README.md

src/engines/
  dataExport.js                      # NEW — DataPacket assembly from all engines
  nodeAdapter.js                     # NEW — Browser API shims for Node.js
  toolbox.js                         # NEW — Toolbox tool wrappers for agents

src/schemas/
  reportSection.js                   # NEW — Zod schemas for report sections
  dataPacket.js                      # NEW — Zod schema for DataPacket structure
  progress.js                        # NEW — Zod schema for generation state

.thes1s/                             # NEW — Generation artifacts (gitignored)
  reports/
    {TICKER}/
      progress.json                  # Generation state machine
      sections/                      # Completed section JSONs
      datapacket.json                # Cached DataPacket snapshot
```

### Pattern 1: Agent Definition Format (CC Skill Compatible)

**What:** Each agent is a CC skill with YAML frontmatter (name, description) and a Markdown body containing the system prompt with embedded curriculum.

**When to use:** All 9 agent definitions plus the orchestrator.

**Format:**

```markdown
---
name: financial-analyst
description: Use when analyzing financial metrics, growth rates, returns, FCF, and balance sheet strength for investment research
---

# Financial Analyst

## Role
You are a Financial Analyst on an investment research team...

## Universal Context
[rule-one-fundamentals.md content]
[tools-for-analysis.md content]
[7 Operating Rules]

## Your Curriculum
[advanced-financial-analysis.md content]
[fgr.md content]
[capex-cash-flow-explained.md content]

## DataPacket Fields You Receive
financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics

## Toolbox Tools Available
getMetric, getFinancialLine, computeGrowthRates, computeMOS, computePBT,
computeTenCap, computeEquityBond, sensitivityTable, comparePeers

## Output Format
[Report section JSON schema specification]

## Critical Rules
- Every quantitative claim MUST cite a DataPacket field path
- If data not in DataPacket, say "Data not available." NEVER estimate.
- Every section MUST identify at least one red flag, even for PASS verdicts
- Compare metrics to industry peers, not absolute thresholds
```

**Companion config.json:**

```json
{
  "model": "sonnet",
  "curriculum": [
    "knowledge/research-references/advanced-financial-analysis.md",
    "knowledge/research-references/fgr.md",
    "knowledge/research-references/capex-cash-flow-explained.md"
  ],
  "dataPacketSlice": [
    "financials", "ttm", "growthRates", "returnMetrics",
    "debtMetrics", "fcf", "keyMetrics"
  ],
  "tools": [
    "getMetric", "getFinancialLine", "computeGrowthRates",
    "computeMOS", "computePBT", "computeTenCap",
    "computeEquityBond", "sensitivityTable", "comparePeers"
  ],
  "universalContext": true,
  "exampleContamination": {
    "exclude": ["knowledge/stage-1-one-pager/examples/",
                "knowledge/stage-2-pitch-deck/examples/",
                "knowledge/stage-3-full-story/examples/"]
  },
  "sections": {
    "onePager": [3, 4],
    "pitchDeck": [5, 7, 8],
    "fullStory": [5]
  }
}
```

### Pattern 2: DataPacket Slicing

**What:** Each agent receives only its relevant DataPacket fields, not the full 50-100KB structure.

**When to use:** Every agent dispatch.

**Implementation:**

```javascript
// src/engines/dataExport.js

export function sliceDataPacket(fullPacket, agentConfig) {
  const slice = {};
  for (const field of agentConfig.dataPacketSlice) {
    if (fullPacket[field] !== undefined) {
      slice[field] = fullPacket[field];
    }
  }
  // Always include identifying info
  slice.ticker = fullPacket.ticker;
  slice.companyInfo = fullPacket.companyInfo;
  slice.classification = fullPacket.classification;
  return slice;
}
```

### Pattern 3: Report Section Schema (Zod)

**What:** Every section produced by any agent conforms to the same Zod schema, enabling constrained decoding via Claude structured outputs.

**Implementation:**

```javascript
// src/schemas/reportSection.js
import { z } from "zod/v4";

export const CitationSchema = z.object({
  id: z.number(),
  ref: z.string(),      // DataPacket field path or document reference
  text: z.string(),      // The quoted text or value
  source: z.string(),    // "DataPacket", "10-K FY2024 p.34", URL, etc.
});

export const TableSchema = z.object({
  title: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
  source: z.string().optional(),
});

export const ReportSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  sectionNumber: z.number(),
  status: z.enum(["pass", "fail", "review", "pending"]),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  verdict: z.enum(["PASS", "FAIL", "WATCHLIST"]).nullable(),
  verdictRationale: z.string(),
  summary: z.string(),            // 1-2 sentences for downstream agents
  data: z.record(z.unknown()),    // Section-specific structured data
  narrative: z.string(),          // Buffett-style prose
  citations: z.array(CitationSchema),
  tables: z.array(TableSchema).optional().default([]),
  charts: z.array(z.object({
    type: z.string(),
    config: z.record(z.unknown()),
    data: z.array(z.record(z.unknown())),
  })).optional().default([]),
  redFlags: z.array(z.string()).min(1),  // At least one, even for PASS
  primarySourceInsights: z.array(z.string()).optional().default([]),
  generatedAt: z.string(),
  modelUsed: z.string(),
  tokenCost: z.object({
    input: z.number(),
    output: z.number(),
  }),
});
```

### Pattern 4: Node.js Adapter (Browser API Shimming)

**What:** A module that provides Node.js equivalents for browser APIs used by engines.

**Implementation approach:**

```javascript
// src/engines/nodeAdapter.js
import 'dotenv/config';   // loads .env.local into process.env
import { parseHTML } from 'linkedom';

// Shim import.meta.env for engines that check it
const IS_NODE = typeof window === 'undefined';

export function getEnv(key) {
  if (IS_NODE) return process.env[key];
  return import.meta.env[key];
}

export function isDev() {
  if (IS_NODE) return false;  // Node = production mode
  return import.meta.env.DEV;
}

// URL mapper: Vite proxy routes -> direct URLs
const PROXY_MAP = {
  '/api/sec/': 'https://www.sec.gov/',
  '/api/edgar/': 'https://data.sec.gov/',
  '/api/efts/': 'https://efts.sec.gov/',
  '/api/yahoo/': 'https://query1.finance.yahoo.com/',
};

export function resolveURL(proxyURL) {
  if (!IS_NODE) return proxyURL;  // Browser uses Vite proxy as-is
  for (const [prefix, real] of Object.entries(PROXY_MAP)) {
    if (proxyURL.startsWith(prefix)) {
      return proxyURL.replace(prefix, real);
    }
  }
  return proxyURL;
}

// DOMParser replacement
export function createDOMParser() {
  if (IS_NODE) {
    return {
      parseFromString(html, type) {
        const { document } = parseHTML(html);
        return document;
      }
    };
  }
  return new DOMParser();
}
```

### Anti-Patterns to Avoid

- **Monolithic context:** Never load the full DataPacket + all curriculum into every agent. Slice per role.
- **Agent-to-agent direct communication:** All communication goes through orchestrator. Agents return section JSON; orchestrator extracts summaries for downstream agents.
- **Shared mutable state:** Each agent returns immutable section JSON. Only the orchestrator writes to the report data model.
- **Example contamination:** LULU examples must NEVER enter agent context. Not in prompts, not in curriculum file paths, not accessible via Toolbox tools.
- **Compressing curriculum:** Full depth injection is the competitive edge. No summarization.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema validation | Custom JSON validators | Zod v4 `.safeParse()` + `.toJSONSchema()` | Single source of truth: define once, validate at runtime, generate JSON schema for Claude API |
| DOM parsing in Node | Custom XML/HTML parsers | linkedom `parseHTML()` | Battle-tested, 3x faster than jsdom, handles real HTML tables |
| Environment variable loading | Custom env file parsers | dotenv + wrapper module | Standard, reads same `.env.local` Vite uses |
| Token estimation | Precise tokenizer library | `Math.ceil(text.length / 4)` for Phase 5A | Anthropic API returns actual token counts. Precise estimation is Phase 5D work. |
| Agent orchestration framework | Custom tool loop | Claude Agent SDK (Phase 5C) | Agent SDK provides subagent isolation, tool execution, parallel dispatch |

**Key insight:** Phase 5A defines the shapes and contracts. Phase 5C tests them with real AI calls. Don't build orchestration infrastructure in 5A — just the definitions that orchestration will consume.

## Common Pitfalls

### Pitfall 1: Example Contamination ("The LULU Echo")
**What goes wrong:** Agents pattern-match from LULU examples instead of performing independent analysis. Prototype testing confirmed this: LULU pitch deck regurgitated the example.
**Why it happens:** LLMs are powerful pattern-matchers. Completed examples are the path of least resistance.
**How to avoid:** Hard architectural boundary in config.json `exampleContamination.exclude` array. Agents receive template structure and curriculum methodology but never a completed analysis example. Prompt instruction: "Perform independent research. Do NOT reference or copy patterns from example analyses."
**Warning signs:** Similar sentence structures across reports for different companies. Same moat framework regardless of industry.

### Pitfall 2: Context Window Overstuffing
**What goes wrong:** Giving every agent the full DataPacket (50-100KB) plus all curriculum files drowns key information in noise.
**Why it happens:** Temptation to give "everything" for completeness.
**How to avoid:** DataPacket slicing per agent (config.json `dataPacketSlice`). Curriculum slicing per agent (config.json `curriculum`). Each agent gets ONLY what it needs.
**Warning signs:** Agent outputs that are verbose but shallow. Claims not supported by DataPacket (agent hallucinating to fill gaps from wrong slice).

### Pitfall 3: Schema Too Loose or Too Strict
**What goes wrong:** Too loose = agents return wildly different structures per section, breaking rendering. Too strict = agents struggle to fit nuanced analysis into rigid boxes, producing formulaic output.
**Why it happens:** Schema design without testing against real agent output (Phase 5A defines schema before 5C generates output).
**How to avoid:** Design schema based on architecture plan's section specification. Use `z.record(z.unknown())` for the `data` field (structured but flexible). Use `z.string()` for `narrative` (unstructured prose). Keep the container rigid, the content flexible.
**Warning signs:** Multiple schema revisions during Phase 5C.

### Pitfall 4: Node.js Adapter Incomplete Coverage
**What goes wrong:** DataPacket assembly works for most engines but silently fails for one or two that use browser APIs in unexpected ways.
**Why it happens:** 17 engine files use `import.meta.env.DEV` but the actual browser dependencies vary per engine (some use DOMParser, some use localStorage, some use IndexedDB).
**How to avoid:** Test DataPacket assembly for a known ticker and compare output to what the browser engines produce. Verify field-by-field that Node output matches browser output.
**Warning signs:** Missing or null fields in DataPacket for specific engines.

### Pitfall 5: Financial Domain Blindness in Agent Definitions
**What goes wrong:** Agent prompts apply standard financial analysis to REITs, banks, insurance companies that require different metrics.
**Why it happens:** Generic curriculum doesn't branch on industry type.
**How to avoid:** Include industry branching instructions in agent prompts. DataPacket includes `classification` field from `industryClassifier.js`. Agent prompt: "If classification is REIT, use FFO/AFFO/NAV. If bank, use NIM/efficiency ratio."
**Warning signs:** Valuation Specialist using P/E on a REIT.

### Pitfall 6: Backward Compatibility Break
**What goes wrong:** New report schema structure breaks existing report rendering in the app.
**Why it happens:** Existing `useResearch.js` stores reports as `{ onePager: {}, pitchDeck: null, fullStory: null }`. New schema needs nested section arrays.
**How to avoid:** Design schema as an extension, not a replacement. `onePager.sections: [...]` is additive to the existing empty object. Existing fields (ticker, companyName, stageApprovals, etc.) remain unchanged.
**Warning signs:** App crashes when loading reports after schema changes.

## Code Examples

### DataPacket Assembly (dataExport.js)

```javascript
// src/engines/dataExport.js — assembles ALL engine output into canonical JSON
// Pure code, no AI. This is the Data Assembler "agent" (runs without LLM).

import { fetchEdgarStatements } from './edgarFinancials.js';
import { computeAllGrowthRates, buildGrowthAnalysisSeries } from './growthRates.js';
import { computeReturnMetrics } from './returnMetrics.js';
import { computeFreeCashFlow } from './freeCashFlow.js';
import { computeRuleOneScore, computeMoatScore, computeManagementScore } from './ruleOneScore.js';
import { fetchGurus } from './gurus.js';
import { fetchInsiders } from './insiders.js';
import { fetchCompensation } from './compensation.js';
import { fetchPeers } from './peers.js';
import { fetchPeerMetrics } from './peerMetrics.js';
import { fetchAnalystEstimates } from './analystEstimates.js';
import { fetchCompanyEvents } from './companyEvents.js';
import { getTranscriptAvailability } from './transcripts.js';
import { fetchPriceHistory } from './prices.js';
import { fetchBatchQuotes } from './batchQuotes.js';
import { computeKeyMetrics } from './keyMetrics.js';
import { computeFGR } from './fgr.js';
// ... additional engine imports

export async function assembleDataPacket(ticker) {
  // Step 1: Core financial data (sequential — other engines depend on this)
  const financials = await fetchEdgarStatements(ticker);

  // Step 2: Computed metrics (parallel — all depend only on financials)
  const [growthRates, returnMetrics, fcf, keyMetrics] = await Promise.all([
    computeAllGrowthRates(financials.statements),
    computeReturnMetrics(financials.statements),
    computeFreeCashFlow(financials.statements),
    computeKeyMetrics(financials.statements),
  ]);

  // Step 3: External data (parallel — independent of each other)
  const [gurus, insiders, compensation, peers, estimates, events, prices, transcripts] =
    await Promise.all([
      fetchGurus(ticker),
      fetchInsiders(ticker),
      fetchCompensation(ticker),
      fetchPeers(ticker),
      fetchAnalystEstimates(ticker),
      fetchCompanyEvents(ticker),
      fetchPriceHistory(ticker),
      getTranscriptAvailability(ticker),
    ]);

  // Step 4: Peer metrics (depends on peers)
  const peerMetrics = peers ? await fetchPeerMetrics(peers) : null;

  // Step 5: Scores (depends on growth + returns)
  const moatScore = computeMoatScore(growthRates);
  const managementScore = computeManagementScore(returnMetrics, /* debtMetrics */);
  const ruleOneScore = computeRuleOneScore(moatScore, managementScore);

  return {
    ticker,
    companyInfo: financials.companyInfo,
    classification: financials.classification,
    currentPrice: prices?.currentPrice,
    financials: financials.statements,
    ttm: financials.ttm,
    growthRates,
    returnMetrics,
    fcf,
    keyMetrics,
    debtMetrics: /* derived from financials */,
    ruleOneScore: { moat: moatScore, management: managementScore, composite: ruleOneScore },
    gurus,
    insiders,
    compensation,
    peers,
    peerMetrics,
    analystEstimates: estimates,
    events,
    prices,
    transcriptAvailability: transcripts,
    // Caveats for agent awareness
    caveats: buildCaveats(financials.classification),
    assembledAt: new Date().toISOString(),
  };
}

function buildCaveats(classification) {
  const caveats = [];
  if (classification?.industryType === 'reit') {
    caveats.push("FFO is derived (not tagged in XBRL) — approximate for post-2018 years. Cross-reference NAREIT-published FFO.");
    caveats.push("AFFO maintenance capex hardcoded at 15% of total capex. Adjust per REIT subtype.");
  }
  if (classification?.industryType === 'insurance') {
    caveats.push("Insurance float is approximated from XBRL balance sheet items. Pure-play insurers have better coverage.");
  }
  if (classification?.industryType === 'bank') {
    caveats.push("Use NIM, efficiency ratio, and provision for credit losses as primary metrics. Gross margin is not meaningful.");
  }
  return caveats;
}
```

### Toolbox Tool Wrappers (toolbox.js)

```javascript
// src/engines/toolbox.js — callable functions for agents
// Each function is a thin wrapper around existing engine exports

import { computeMOS, computePBT, computeTenCap, computeEquityBond, sensitivityTable } from './valuation.js';
import { computeAllGrowthRates } from './growthRates.js';

// Tool definitions for Claude tool_use (API mode)
export const TOOL_DEFINITIONS = [
  {
    name: "computeMOS",
    description: "Compute Margin of Safety buy price. Returns sticker price and buy price.",
    input_schema: {
      type: "object",
      properties: {
        fgr: { type: "number", description: "Future Growth Rate as decimal (e.g., 0.12 for 12%)" },
        eps: { type: "number", description: "Current EPS (TTM or 3yr avg)" },
        futurePE: { type: "number", description: "Future P/E ratio (max 2x FGR, capped at historical high)" },
        marr: { type: "number", description: "Minimum Acceptable Rate of Return (default 0.15)" },
      },
      required: ["fgr", "eps", "futurePE"],
      additionalProperties: false,
    },
  },
  // ... similar for computePBT, computeTenCap, etc.
];

// Tool executor — routes tool_use requests to engine functions
export function executeTool(toolName, input) {
  switch (toolName) {
    case 'computeMOS': return computeMOS(input);
    case 'computePBT': return computePBT(input);
    case 'computeTenCap': return computeTenCap(input);
    case 'computeEquityBond': return computeEquityBond(input);
    case 'sensitivityTable': return sensitivityTable(input);
    // ... additional tools
    default: throw new Error(`Unknown tool: ${toolName}`);
  }
}
```

### Generation State (progress.json)

```javascript
// src/schemas/progress.js
import { z } from "zod/v4";

export const ProgressSchema = z.object({
  ticker: z.string(),
  stage: z.enum(["onePager", "pitchDeck", "fullStory"]),
  state: z.enum([
    "IDLE", "DATA_ASSEMBLY", "PRIMARY_SOURCE_READING",
    "WAVE_1_RUNNING", "CHECKPOINT_1",
    "WAVE_2_RUNNING", "CHECKPOINT_2",
    "WAVE_3_RUNNING", "CHECKPOINT_3",
    "SYNTHESIS", "QUALITY_CHECK", "COMPLETE",
  ]),
  startedAt: z.string(),
  lastUpdated: z.string(),
  sections: z.record(z.object({
    status: z.enum(["complete", "running", "pending", "failed"]),
    agentRole: z.string().optional(),
    tokenCost: z.object({ input: z.number(), output: z.number() }).optional(),
    error: z.string().optional(),
  })),
  checkpoints: z.array(z.object({
    phase: z.number(),
    status: z.enum(["approved", "waiting", "rejected"]),
    userInput: z.record(z.unknown()).optional(),
    timestamp: z.string().optional(),
  })),
  errors: z.array(z.string()),
  totalCost: z.object({ input: z.number(), output: z.number() }),
});
```

## Curriculum Inventory

Measured line counts for all curriculum files that agents will consume. This informs context budget planning.

| File | Lines | Approx Tokens | Used By |
|------|-------|---------------|---------|
| rule-one-fundamentals.md | 239 | ~800 | ALL agents (universal) |
| tools-for-analysis.md | 231 | ~770 | ALL agents (universal) |
| rule-1-workflow.md | 190 | ~630 | Orchestrator only |
| one-pager.md | 302 | ~1,000 | Business Analyst, Financial Analyst (Stage 1) |
| stage-1 template.md | 138 | ~460 | Business Analyst (Stage 1) |
| pitch-deck-I.md | 284 | ~950 | Business Analyst, Competitor Evaluator |
| pitch-deck-II.md | 200 | ~670 | Competitor Evaluator, Management Evaluator |
| pitch-deck-III.md | 145 | ~480 | Risk Analyst |
| pitch-deck-IV.md | 360 | ~1,200 | Valuation Specialist |
| story-form-I.md | 221 | ~740 | Business Analyst, Competitor Evaluator (Stage 3) |
| story-form-II.md | 306 | ~1,020 | Risk Analyst (Stage 3) |
| advanced-financial-analysis.md | 344 | ~1,150 | Financial Analyst |
| fgr.md | 153 | ~510 | Financial Analyst, Valuation Specialist |
| capex-cash-flow-explained.md | 222 | ~740 | Financial Analyst |
| equity-bond-research.md | 400 | ~1,330 | Valuation Specialist |
| buffett_writing_principles.md | 219 | ~730 | Synthesis Writer |
| **Universal total** | **470** | **~1,570** | Loaded into every agent |

**Budget check:** The heaviest agent (Valuation Specialist) gets universal (~1,570) + pitch-deck-IV (~1,200) + fgr (~510) + equity-bond (~1,330) = ~4,610 tokens of curriculum. Well within budget even with a 10K DataPacket slice.

## Agent Role Summary

| Role | Model | Curriculum | DataPacket Slice | Toolbox Tools | Sections |
|------|-------|------------|-----------------|---------------|----------|
| Orchestrator | N/A (code) | rule-1-workflow.md | Full (dispatch only) | None | Dispatch table |
| Data Assembler | N/A (code) | None | Produces the full DataPacket | Engine APIs | Pre-processing |
| Primary Source Reader | Opus | None (reads raw filings) | companyInfo, filings | readFilingSection, getTranscriptExcerpt | Pre-processing |
| Financial Analyst | Sonnet | advanced-financial-analysis, fgr, capex-cash-flow | financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics | getMetric, getFinancialLine, computeGrowthRates, computeMOS/PBT/TenCap/EquityBond, sensitivityTable, comparePeers | OP:3-4, PD:5,7,8, FS:5 |
| Business Analyst | Sonnet | pitch-deck-I (sections 1-3), one-pager, story-form-I | companyInfo, classification, ruleOneScore, peers (names) | Web search | OP:1-2, PD:1-2, FS:2-3 |
| Competitor Evaluator | Sonnet | pitch-deck-I (dominance), pitch-deck-II (barriers), story-form-I (moat) | peers, peerMetrics, classification | comparePeers, web search | PD:3-4, FS:3 |
| Management Evaluator | Sonnet | pitch-deck-II (mgmt section) | compensation, insiders, gurus | Web search | PD:6, FS:4 |
| Risk Analyst | Opus | pitch-deck-III, story-form-II | companyInfo, events, analystEstimates, classification | Web search | PD:9, FS:1,6 |
| Valuation Specialist | Opus | pitch-deck-IV, fgr, equity-bond-research | growthRates, returnMetrics, fcf, analystEstimates, ttm, currentPrice | computeMOS/PBT/TenCap/EquityBond, sensitivityTable, web search | PD:10, FS:5,7 |
| Synthesis Writer | Opus | buffett_writing_principles + Buffett letter | All section summaries (not DataPacket) | None | Final polish pass |

## Backward Compatibility Strategy

The existing report data model in `useResearch.js`:

```javascript
{
  id: "uuid",
  ticker: "AAPL",
  companyName: "Apple Inc.",
  createdAt: "2026-03-08",
  updatedAt: "2026-03-08",
  currentStage: 1,
  stageApprovals: { onePager: null, pitchDeck: null, fullStory: null },
  onePager: {},          // Currently empty object
  pitchDeck: null,       // null until Stage 2
  fullStory: null,       // null until Stage 3
  notes: "",
  watchlist: false,
  competitors: { privateCompetitors: [] }
}
```

**Migration strategy:** The AI-generated sections live INSIDE the existing stage objects. No schema break.

```javascript
{
  // ... all existing fields unchanged ...
  onePager: {
    sections: [ /* ReportSectionSchema[] */ ],
    overallVerdict: "PASS",
    generatedAt: "2026-03-24T10:00:00Z",
    totalTokenCost: { input: 45000, output: 12000 },
  },
  pitchDeck: {
    sections: [ /* ReportSectionSchema[] */ ],
    checkpoints: [ /* checkpoint history */ ],
    // ...
  },
}
```

Components that currently read `report.onePager` as an empty object will continue to work because they check for specific fields. New components check for `report.onePager.sections`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | vite.config.js (vitest configured via Vite) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm test -- --run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | DataPacket assembly produces complete JSON for known ticker | integration | `npx vitest run src/engines/__tests__/dataExport.test.js -x` | Wave 0 |
| DATA-02 | Node adapter resolves proxy URLs, shims env vars, provides DOMParser | unit | `npx vitest run src/engines/__tests__/nodeAdapter.test.js -x` | Wave 0 |
| DATA-03 | Toolbox tools produce correct output for known inputs | unit | `npx vitest run src/engines/__tests__/toolbox.test.js -x` | Wave 0 |
| DATA-04 | DataPacket slicing returns correct subset per agent config | unit | `npx vitest run src/engines/__tests__/dataExport.test.js -x` | Wave 0 |
| SCHM-01 | Report section schema validates good input, rejects bad input | unit | `npx vitest run src/schemas/__tests__/reportSection.test.js -x` | Wave 0 |
| SCHM-02 | Zod schema converts to valid JSON Schema for Claude API | unit | `npx vitest run src/schemas/__tests__/reportSection.test.js -x` | Wave 0 |
| SCHM-03 | New schema structure is additive to existing report model | unit | `npx vitest run src/schemas/__tests__/reportSection.test.js -x` | Wave 0 |
| SCHM-04 | Progress schema validates state machine transitions | unit | `npx vitest run src/schemas/__tests__/progress.test.js -x` | Wave 0 |
| AGNT-01 | Each agent definition has prompt.md, config.json, README.md | smoke | `npx vitest run agents/__tests__/agentDefinitions.test.js -x` | Wave 0 |
| AGNT-02 | Universal context files exist and are referenced in all agent configs | smoke | `npx vitest run agents/__tests__/agentDefinitions.test.js -x` | Wave 0 |
| AGNT-04 | No agent config references LULU example paths | smoke | `npx vitest run agents/__tests__/agentDefinitions.test.js -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/engines/__tests__/dataExport.test.js` -- covers DATA-01, DATA-04
- [ ] `src/engines/__tests__/nodeAdapter.test.js` -- covers DATA-02
- [ ] `src/engines/__tests__/toolbox.test.js` -- covers DATA-03
- [ ] `src/schemas/__tests__/reportSection.test.js` -- covers SCHM-01, SCHM-02, SCHM-03
- [ ] `src/schemas/__tests__/progress.test.js` -- covers SCHM-04
- [ ] `agents/__tests__/agentDefinitions.test.js` -- covers AGNT-01, AGNT-02, AGNT-04 (structural validation)
- [ ] `src/schemas/` directory creation -- new directory for Zod schema files

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `zod-to-json-schema` for schema generation | Zod v4 native `.toJSONSchema()` | Nov 2025 | Eliminates external dependency |
| Claude API prompting for JSON | `output_config.format` constrained decoding | 2025 GA | Guaranteed schema compliance, not probabilistic |
| jsdom for Node DOM parsing | linkedom | Ongoing | 3x faster, 1/3 memory |
| Single-agent report generation | Multi-agent with fresh context per role | Validated by prototype 2026-03-23 | Single-agent fails on Pitch Deck depth |
| Custom tool loops | Claude Agent SDK subagents | 2025 | Built-in tool execution, context isolation |

## Open Questions

1. **Zod v4 packaging**
   - What we know: npm shows zod@4.3.6 on registry. Stack research says import from `zod/v4` subpath.
   - What's unclear: Whether `zod@4.3.6` is standalone or still v4-via-v3-subpath. The npm registry version suggests standalone v4 may now be the default.
   - Recommendation: Install `zod@latest`, test both `import { z } from "zod"` and `import { z } from "zod/v4"` to determine which has `z.toJSONSchema`. Document whichever works.

2. **DataPacket size for complex companies**
   - What we know: Architecture estimates 50-100KB. Token estimate is 15K-25K for full, 5K-10K sliced.
   - What's unclear: Actual size for companies with 10+ years of data, 20+ peers, and full industry overlay data.
   - Recommendation: Build DataPacket assembly first, measure actual output size for 3-5 representative tickers (AAPL, JPM/bank, O/reit, BRK/insurance, COST/standard), then finalize slicing strategy based on real data.

3. **Agent prompt.md file size limits**
   - What we know: CC skills best practices say <500 words for SKILL.md. But agent prompts need full curriculum embedded.
   - What's unclear: Whether CC skill file size limits apply when the skill IS the agent definition (agent prompts are much larger than typical skills).
   - Recommendation: Agent definitions are NOT typical CC skills -- they are specialized agent prompts. The 500-word guideline is for discovery skills, not subagent system prompts. Full curriculum embedding is the design intent per AGNT-03. If CC encounters issues with large prompts, curriculum can be loaded via `@file` references in the prompt.

4. **AGNT-05 scope: Orchestrator as code vs. as agent**
   - What we know: Architecture plan says orchestrator is code (dispatch table, state machine). Not an AI agent.
   - What's unclear: Whether AGNT-05's "orchestrator definition" means a prompt.md for a CC skill (like `/generate:one-pager`) or a code file (like an `orchestrator.js` module).
   - Recommendation: Create `agents/orchestrator/` with a prompt.md that documents the dispatch table and checkpoint rules (human-readable reference), plus a config.json with the section-to-agent mapping. The actual orchestration CODE is built in Phase 5C as the CC skill. Phase 5A just defines the configuration.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Node adapter, DataPacket assembly, tests | Yes | v24.13.1 | -- |
| npm | Package installation | Yes | v11.8.0 | -- |
| vitest | Test execution | Yes | ^4.1.0 | -- |
| @anthropic-ai/sdk | Structured output schema testing | Yes | ^0.78.0 (0.80.0 on registry) | -- |
| .env.local with VITE_CLAUDE_KEY | AI API calls (Phase 5C) | N/A for 5A | -- | Not needed in 5A -- definitions only |
| zod | Schema definitions | Not installed | 4.3.6 on registry | Must install |
| linkedom | Node DOM parsing | Not installed | 0.18.12 on registry | Must install |
| dotenv | Env loading in Node | Not installed | 17.3.1 on registry | Must install |

**Missing dependencies with no fallback:**
- zod, linkedom, dotenv -- must be installed (npm install)

**Missing dependencies with fallback:**
- None

## Sources

### Primary (HIGH confidence)
- Architecture plan: `gstack/plans/gstack-ai-agent-workflow-plan-20260323.md` -- All agent roles, DataPacket schema, Toolbox tools, orchestration flows
- Stack research: `.planning/research/STACK.md` -- Zod v4, Agent SDK, Node adapter strategy
- Architecture research: `.planning/research/ARCHITECTURE.md` -- Component boundaries, data flow, error recovery
- Pitfalls research: `.planning/research/PITFALLS.md` -- 14 catalogued pitfalls with prevention strategies
- CLAUDE.md -- XBRL engine details, existing data model, tech stack, operating rules

### Secondary (MEDIUM confidence)
- Feature research: `.planning/research/FEATURES.md` -- Competitive context, table stakes vs differentiators
- Claude Code Skills documentation -- SKILL.md format, frontmatter structure
- Writing-skills SKILL.md -- TDD process for skill creation

### Tertiary (LOW confidence)
- Zod v4 packaging (standalone vs subpath) -- Needs hands-on verification after install
- DataPacket actual sizes -- Needs measurement from real engine output

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All packages verified on npm registry with current versions. Existing project dependencies confirmed.
- Architecture: HIGH -- Architecture plan is reviewed (CEO + Eng), prototype-validated, and provides exact specifications.
- Pitfalls: HIGH -- 6 critical pitfalls catalogued from prototype testing and industry research. Prevention strategies documented.
- Agent definitions: MEDIUM -- Format is clear but actual prompt engineering quality depends on user authoring via `/writing-skills`. The definitions themselves are the creative work.
- Node adapter: MEDIUM -- Pattern is validated (cacheStore.js HAS_IDB), but actual LOC and edge cases depend on which engines need adaptation.

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable infrastructure, no fast-moving dependencies)
