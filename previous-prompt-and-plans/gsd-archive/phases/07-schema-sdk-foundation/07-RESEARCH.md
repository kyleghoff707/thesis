# Phase 7: Schema & SDK Foundation - Research

**Researched:** 2026-03-27
**Domain:** Zod schema modification for Claude API structured outputs + SDK upgrade + live smoke testing
**Confidence:** HIGH

## Summary

Phase 7 fixes three `z.looseObject({})` usages in `ReportSectionSchema` that produce `additionalProperties: true` in JSON Schema -- incompatible with Claude's structured outputs requirement of `additionalProperties: false`. The SDK's `transformJSONSchema` function does strip `additionalProperties` and set it to `false`, but it also strips the `properties` list, resulting in `{ type: "object", properties: {}, additionalProperties: false }` -- meaning the API would constrain these fields to only accept empty objects `{}`. The fix (per D-01/D-02) is replacing `z.looseObject({})` with `z.string()` for the `data`, `config`, and `data[]` fields, with the orchestrator responsible for JSON.parse() after extraction.

The SDK upgrade from 0.78.0 to 0.80.0 is straightforward -- 0.80.0 is the current latest on npm. The `messages.parse()` method and `zodOutputFormat()` helper are both available at the GA path (`@anthropic-ai/sdk/helpers/zod`). Adding an optional `url` field to `CitationSchema` costs 1 optional parameter (well within the 24-param limit -- the full modified schema has only 2 optional params total).

The smoke test must verify two things independently: (1) schema compilation + structured output parsing works at all, and (2) structured outputs work correctly alongside the `web_search_20250305` server tool. Official docs confirm these are compatible -- only the Citations API feature (`citations: { enabled: true }`) conflicts with structured outputs, not the web search tool itself.

**Primary recommendation:** Replace `z.looseObject({})` with `z.string()`, add `url` to CitationSchema as optional, upgrade SDK to 0.80.0, run two-stage smoke test. Update `critic.js` and test fixture to handle `data` as either string or object for backward compatibility during transition.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Replace all `z.looseObject({})` in API-facing schemas with `z.string()`. The agent serializes flexible data as a JSON string inside the structured output. The orchestrator parses the string after extraction. This is the simplest approach and guaranteed compatible with `additionalProperties: false`.
- **D-02:** Apply `z.string()` consistently to: `ReportSectionSchema.data`, `ChartSchema.config`, `ChartSchema.data` array items.
- **D-03:** Fix only API-facing schemas: `ReportSectionSchema`, `ChartSchema`, `CitationSchema` (add optional `url` field). Do NOT touch `StageReportSchema`, `progress.js`, or `dataPacket.js` -- they use `looseObject` for internal validation only and are never sent to the API.
- **D-04:** `StageReportSchema.checkpoints[].userInput` keeps `z.looseObject({})` -- it's internal state, not API output.
- **D-05:** Two-stage smoke test: Stage 1 (minimal API call, ~$0.05) then Stage 2 (realistic agent call with web search tool, ~$0.50-0.60).
- **D-06:** Both smoke test stages must pass. Stage 1 failure means schema issue; Stage 2 failure means prompt/tool interaction issue.
- **D-07:** Upgrade `@anthropic-ai/sdk` from `^0.78.0` to latest (0.80.0). Use `client.messages.parse()` with `zodOutputFormat(ReportSectionSchema)`.

### Claude's Discretion
- Exact `max_tokens` value for smoke tests (research suggests 8192-16384)
- Whether to create a standalone test script or integrate into vitest
- How to handle the `ChartSchema.data` array -- `z.array(z.string())` vs keeping `z.array(ChartSchema)` with `z.string()` inside

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FMT-01 | Replace z.looseObject({}) in ReportSectionSchema with structured output-compatible types | Verified: `z.looseObject({})` produces `additionalProperties: {}` (true) in JSON Schema. SDK's `transformJSONSchema` strips it and sets `false`, but leaves `properties: {}` -- meaning only empty objects are valid. `z.string()` replacement verified to produce correct schema via `zodOutputFormat()`. |
| FMT-02 | Add optional url field to CitationSchema for web search URLs | Verified: `z.string().optional()` produces a property in the schema NOT listed in `required`. Only adds 1 to the optional parameter count (total: 2, well within 24-param limit). |
| FMT-03 | Verify ReportSectionSchema produces valid JSON Schema via z.toJSONSchema() -- smoke test with live API call | Verified: `zodOutputFormat(ModifiedReportSectionSchema)` produces valid schema with `type: "json_schema"` and correct property types. Live API call needed to confirm `stop_reason: "end_turn"` and `parsed_output` population. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | 0.80.0 (upgrade from 0.78.0) | Claude API client with `messages.parse()`, `zodOutputFormat()` | First-party SDK. GA structured outputs support at `@anthropic-ai/sdk/helpers/zod`. |
| `zod` | 4.3.6 (already installed) | Schema definition + runtime validation + JSON Schema generation | `zodOutputFormat` uses `z.toJSONSchema()` internally. No version change needed. |
| `vitest` | 4.1.0 (already installed) | Unit tests for schema changes | Existing test infrastructure. 49 critic tests already passing. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | 17.3.1 (already installed) | Load `.env.local` API keys for smoke test | Node.js smoke test script needs `VITE_CLAUDE_KEY` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `z.string()` for data | `z.record(z.string(), z.any())` | `z.record` produces `additionalProperties: {}` which gets transformed to `additionalProperties: false` with no properties -- same problem. `z.string()` is simpler and guaranteed compatible. |
| `z.string()` for data | Explicit typed object per section | Would require 10+ different schema variants per section type. Massive complexity increase for marginal benefit. The orchestrator-parse pattern keeps it simple. |

**Installation:**
```bash
npm install @anthropic-ai/sdk@0.80.0
```

**Version verification:** `@anthropic-ai/sdk` latest is 0.80.0 (verified via `npm view @anthropic-ai/sdk version`). The `^0.78.0` semver range in package.json already covers 0.80.0, but explicit install ensures the upgrade.

## Architecture Patterns

### Schema Modification Pattern

The core change is replacing 4 `z.looseObject({})` usages with `z.string()` in API-facing schemas only:

```
src/schemas/reportSection.js
  ReportSectionSchema.data:        z.looseObject({}) -> z.string()
  ChartSchema.config:              z.looseObject({}) -> z.string()
  ChartSchema.data:                z.array(z.looseObject({})) -> z.array(z.string())
  CitationSchema:                  add url: z.string().optional()

NOT touched:
  StageReportSchema.checkpoints[].userInput:  z.looseObject({}) stays (internal only)
```

### How zodOutputFormat Works (SDK internals)

```javascript
// @anthropic-ai/sdk/helpers/zod.js (verified from installed 0.78.0)
function zodOutputFormat(zodObject) {
  let jsonSchema = z.toJSONSchema(zodObject, { reused: 'ref' });
  jsonSchema = transformJSONSchema(jsonSchema);  // Forces additionalProperties: false
  return {
    type: 'json_schema',
    schema: { ...jsonSchema },
    parse: (content) => {
      let parsed = JSON.parse(content);
      const output = zodObject.safeParse(parsed);
      // Throws if validation fails
      return output.data;
    },
  };
}
```

The `transformJSONSchema` function (verified from `node_modules/@anthropic-ai/sdk/lib/transform-json-schema.js`):
1. Strips `additionalProperties` from all objects (line 73: `pop(jsonSchema, 'additionalProperties')`)
2. Sets `additionalProperties: false` on all objects (line 74)
3. Preserves `properties` and `required` as-is
4. Moves unsupported constraints to `description` field
5. Only supports `minItems: 0` or `minItems: 1` for arrays

**Critical implication:** When `z.looseObject({})` goes through this transform, it produces:
```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```
This constrains the API to produce ONLY empty objects `{}` for these fields. That is why `z.string()` is the correct fix -- it sidesteps the object constraint entirely.

### Parse After Extraction Pattern

Since `data` becomes a JSON string in the API output, all downstream consumers must parse it:

```javascript
// In the orchestrator (aiResearch.js, Phase 8):
const section = response.parsed_output;
section.data = typeof section.data === 'string' ? JSON.parse(section.data) : section.data;
// Now section.data is a normal object for critic.js and SectionRenderer.jsx
```

### Smoke Test Architecture

**Stage 1 -- Schema validation (no tools):**
```javascript
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ReportSectionSchema } from '../src/schemas/reportSection.js';

const client = new Anthropic({ apiKey: process.env.VITE_CLAUDE_KEY });
const response = await client.messages.parse({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
  messages: [{ role: 'user', content: 'Generate a sample radar section for AAPL...' }],
  output_config: { format: zodOutputFormat(ReportSectionSchema) },
});
// Check: stop_reason === 'end_turn', parsed_output is populated
```

**Stage 2 -- Schema + web search tool:**
```javascript
const response = await client.messages.parse({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 16384,
  system: [{ type: 'text', text: businessAnalystPrompt }],
  messages: [{ role: 'user', content: dataPacketSlice + sectionAssignment }],
  tools: [{
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 5,
  }],
  output_config: { format: zodOutputFormat(ReportSectionSchema) },
});
// Check: stop_reason === 'end_turn', parsed_output populated,
//   web_search_tool_result blocks in response.content
```

### Anti-Patterns to Avoid
- **Do NOT enable `citations: { enabled: true }` with structured outputs** -- returns 400 error. Extract URLs from `web_search_tool_result` blocks instead.
- **Do NOT use `z.record(z.string(), z.any())` as a looseObject replacement** -- produces the same `additionalProperties` problem after SDK transform.
- **Do NOT create separate schemas per section** -- uses a single `ReportSectionSchema` to avoid 10x schema compilation overhead.
- **Do NOT use `messages.create()` for the smoke test** -- use `messages.parse()` which auto-validates via the Zod schema and populates `parsed_output`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema generation from Zod | Manual `z.toJSONSchema()` + custom transform | `zodOutputFormat(schema)` from SDK | SDK handles `additionalProperties: false` injection, `description` fallback for unsupported constraints, and `parse` callback automatically |
| Structured output parsing | Manual `JSON.parse(response.content[0].text)` + `.safeParse()` | `client.messages.parse()` | Finds the text block, parses JSON, runs Zod validation, populates `parsed_output` -- all in one call |
| API key loading for Node.js | Custom dotenv setup | `import { getEnv } from './nodeAdapter.js'` | Already loads `.env.local` and provides `getEnv('VITE_CLAUDE_KEY')` |

**Key insight:** The SDK already handles the hard parts -- schema transformation, response parsing, Zod validation. The phase's work is limited to fixing the schema inputs and verifying the outputs.

## Common Pitfalls

### Pitfall 1: looseObject Produces Empty-Object-Only Constraint
**What goes wrong:** `z.looseObject({})` generates `{ type: "object", properties: {}, additionalProperties: {} }`. The SDK strips `additionalProperties` and sets it to `false`, but preserves `properties: {}`. Result: the API enforces that the `data` field must be exactly `{}` -- no keys allowed.
**Why it happens:** The SDK's `transformJSONSchema` function treats ALL objects the same way -- strips `additionalProperties`, sets to `false`. It has no special handling for "flexible objects."
**How to avoid:** Replace `z.looseObject({})` with `z.string()` per D-01. The model serializes the flexible data as a JSON string.
**Warning signs:** API returns `{}` for data/config fields, or schema compilation errors.

### Pitfall 2: Backward Compatibility with critic.js and SectionRenderer.jsx
**What goes wrong:** `critic.js` line 332 does `Object.keys(section.data).length` and `SectionRenderer.jsx` line 285 does `typeof section.data === 'object'`. If the orchestrator passes `data` as a string, both break silently (zero keys, not-an-object).
**Why it happens:** The schema change is in the API output format, but the consumers expect objects. The orchestrator (Phase 8) is the correct place to JSON.parse() the string back to an object before passing to validators and renderers.
**How to avoid:** In this phase, update `critic.js`'s `scoreCompleteness` function to handle both string and object data gracefully. The fixture (`cost-section-company-info.json`) keeps `data` as an object (it represents post-orchestrator data). Add a test that validates the schema with `zodOutputFormat()` against a fixture with string data.
**Warning signs:** `completeness.dataFieldsPopulated` always returns 0 for API-generated sections.

### Pitfall 3: Optional Parameter Budget
**What goes wrong:** API rejects the schema with "Schema is too complex" if optional parameters exceed 24 across all strict schemas in a request.
**Why it happens:** Each non-`required` property counts. In Phase 8, if strict tool schemas are also used, their optional params add to the total.
**How to avoid:** The modified schema has only 2 optional parameters total (`citations[].url` and `tables[].source`). Zod v4's `.optional().default([])` makes fields required in JSON Schema (with defaults). Well within limits. But monitor this in Phase 8 when adding tools.
**Warning signs:** 400 errors mentioning "optional parameters."

### Pitfall 4: max_tokens Truncation Breaks Structured Output
**What goes wrong:** If the response hits `max_tokens`, `stop_reason` is `"max_tokens"` and the JSON is incomplete -- `JSON.parse()` fails.
**Why it happens:** Constrained decoding does not guarantee the output fits within `max_tokens`. If the model has more to say than the budget allows, the response is truncated mid-JSON.
**How to avoid:** Set `max_tokens: 8192` for Stage 1 (minimal test, ~2K output expected) and `max_tokens: 16384` for Stage 2 (full section, ~6-10K output expected). Always check `stop_reason === 'end_turn'` before trusting `parsed_output`.
**Warning signs:** `stop_reason: "max_tokens"` in the smoke test response.

### Pitfall 5: Web Search Tool + Structured Outputs -- The Distinction
**What goes wrong:** Confusion between "Citations API" (incompatible) and "web search tool" (compatible). The web search tool IS compatible with structured outputs. The Citations API feature (`citations: { enabled: true }`) IS NOT.
**Why it happens:** The PITFALLS.md research (Pitfall 1) correctly identifies the incompatibility but the terminology is easy to conflate. "Web search citations" in the response content blocks are different from the "Citations API" feature.
**How to avoid:** Use `web_search_20250305` tool in the `tools` array. Do NOT add `citations: { enabled: true }` to the request. URLs from web search results appear in `web_search_tool_result` content blocks, which the orchestrator extracts programmatically -- they do NOT automatically appear in the model's structured JSON output.
**Warning signs:** 400 error mentioning "Citations cannot be used together with structured outputs."

## Code Examples

### Example 1: Modified ReportSectionSchema (verified locally)

```javascript
// Source: Verified via local node -e test
import { z } from 'zod';

export const CitationSchema = z.object({
  id: z.number(),
  ref: z.string(),
  text: z.string(),
  source: z.string(),
  url: z.string().optional(),  // FMT-02: web search URL
});

export const ChartSchema = z.object({
  type: z.string(),
  config: z.string(),              // Was z.looseObject({}) -- JSON string
  data: z.array(z.string()),       // Was z.array(z.looseObject({})) -- JSON strings
});

export const ReportSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  sectionNumber: z.number(),
  status: z.enum(['pass', 'fail', 'review', 'pending']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  verdict: z.enum(['PASS', 'FAIL', 'WATCHLIST']).nullable(),
  verdictRationale: z.string(),
  summary: z.string(),
  data: z.string(),                 // Was z.looseObject({}) -- JSON string
  narrative: z.string(),
  citations: z.array(CitationSchema),
  tables: z.array(TableSchema).optional().default([]),
  charts: z.array(ChartSchema).optional().default([]),
  redFlags: z.array(z.string()).min(1),
  primarySourceInsights: z.array(z.string()).optional().default([]),
  crossCuttingFindings: z.array(z.object({
    finding: z.string(),
    relevantAgents: z.array(z.string()),
    severity: z.enum(['high', 'medium', 'low']),
    source: z.string(),
  })).optional().default([]),
  searchesPerformed: z.array(z.object({
    query: z.string(),
    resultCount: z.number(),
    usedInSection: z.boolean(),
  })).optional().default([]),
  modelUsed: z.string(),
  tokenCost: z.object({ input: z.number(), output: z.number() }),
});
```

### Example 2: zodOutputFormat Output (verified locally)

```javascript
// Source: Local verification via node -e
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const result = zodOutputFormat(ReportSectionSchema);
// result.type === 'json_schema'
// result.schema.properties.data === { type: 'string' }
// result.schema.properties.citations.items.properties.url === { type: 'string' }
// result.schema.properties.citations.items.required === ['id', 'ref', 'text', 'source']
//   (url NOT in required -- it's optional)
// Total optional params: 2 (citations[].url, tables[].source)
```

### Example 3: messages.parse() with Web Search Tool (from SDK type definitions)

```javascript
// Source: @anthropic-ai/sdk/resources/messages/messages.d.ts
const response = await client.messages.parse({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 16384,
  messages: [{ role: 'user', content: 'Analyze AAPL competitive position...' }],
  tools: [{
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 5,
  }],
  output_config: { format: zodOutputFormat(ReportSectionSchema) },
});

// response.parsed_output -- Zod-validated ReportSection object
// response.content -- array including:
//   { type: 'server_tool_use', name: 'web_search', input: { query: '...' } }
//   { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: '...', ... }] }
//   { type: 'text', text: '{ "key": "radar", ... }' }  <-- the structured JSON output
```

### Example 4: critic.js Data Field Compatibility

```javascript
// In scoreCompleteness (critic.js line 332):
// BEFORE:
const dataKeys = section.data ? Object.keys(section.data).length : 0;

// AFTER (handles both string and object):
let dataObj = section.data;
if (typeof dataObj === 'string') {
  try { dataObj = JSON.parse(dataObj); } catch { dataObj = null; }
}
const dataKeys = dataObj && typeof dataObj === 'object' ? Object.keys(dataObj).length : 0;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `output_format` (beta) | `output_config.format` (GA) | Late 2025 | SDK helper handles translation; use GA parameter |
| Beta header `structured-outputs-2025-11-13` | No header needed | GA release | Remove beta header if present |
| `z.looseObject({})` for flexible fields | `z.string()` for API-facing, keep `z.looseObject` for internal | This phase | API constrained decoding requires `additionalProperties: false` |
| Manual JSON.parse + validation | `client.messages.parse()` + `zodOutputFormat()` | SDK 0.80.0 GA | Auto-validates via Zod, populates `parsed_output` |

**Deprecated/outdated:**
- `output_format` parameter: Still works during transition, but use `output_config.format`
- `betaZodTool` from `@anthropic-ai/sdk/helpers/beta/zod`: Use GA `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | None (uses vite.config.js defaults) |
| Quick run command | `npx vitest run src/engines/__tests__/critic.test.js` |
| Full suite command | `npm test` |

### Phase Requirements --> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FMT-01 | Modified schema produces valid JSON Schema via zodOutputFormat | unit | `npx vitest run src/schemas/__tests__/reportSection.test.js -x` | Wave 0 |
| FMT-01 | critic.js handles data as string or object | unit | `npx vitest run src/engines/__tests__/critic.test.js -x` | Existing (needs update) |
| FMT-02 | CitationSchema includes optional url field | unit | `npx vitest run src/schemas/__tests__/reportSection.test.js -x` | Wave 0 |
| FMT-03 | Live API call returns stop_reason end_turn with parsed_output | smoke (live API) | `node scripts/smoke-test-schema.js` | Wave 0 |
| FMT-03 | Live API call with web search tool + structured output works | smoke (live API) | `node scripts/smoke-test-schema.js` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/engines/__tests__/critic.test.js src/schemas/__tests__/reportSection.test.js -x`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + smoke test pass before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/schemas/__tests__/reportSection.test.js` -- covers FMT-01, FMT-02 (schema unit tests)
- [ ] `scripts/smoke-test-schema.js` -- covers FMT-03 (live API smoke test, Stage 1 + Stage 2)
- [ ] Update `src/engines/__tests__/critic.test.js` -- add test for string data field handling

## Open Questions

1. **max_tokens for smoke tests**
   - What we know: Stage 1 (simple prompt) needs ~2K output tokens. Stage 2 (full analysis) needs ~6-10K.
   - What's unclear: Whether `8192` is sufficient for Stage 2 or if it needs `16384`.
   - Recommendation: Use `8192` for Stage 1, `16384` for Stage 2 (generous to avoid truncation). Claude's discretion per CONTEXT.md.

2. **Standalone script vs vitest for smoke test**
   - What we know: Smoke tests require live API calls (~$0.05 + ~$0.55 = ~$0.60 total). Vitest tests are run frequently.
   - What's unclear: Whether the cost is acceptable for routine `npm test` runs.
   - Recommendation: Standalone script (`scripts/smoke-test-schema.js`) invoked manually, NOT part of `npm test`. Avoids accidental API charges on every test run. Claude's discretion per CONTEXT.md.

3. **ChartSchema.data array type**
   - What we know: Currently `z.array(z.looseObject({}))`. Must become compatible.
   - What's unclear: Whether `z.array(z.string())` (each data point is a JSON string) or `z.array(z.record(z.string(), z.union([z.string(), z.number()])))` is better.
   - Recommendation: `z.array(z.string())` -- matches the D-01 pattern (serialize flexible data as JSON strings). Simple, consistent, guaranteed compatible. Claude's discretion per CONTEXT.md.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Smoke test script | Yes | v24.13.1 | -- |
| npm | SDK upgrade | Yes | (bundled with Node) | -- |
| `@anthropic-ai/sdk` | zodOutputFormat, messages.parse | Yes | 0.78.0 (upgrade to 0.80.0) | -- |
| `zod` | Schema definition | Yes | 4.3.6 | -- |
| `VITE_CLAUDE_KEY` | Live API smoke test | Yes (in .env.local) | -- | -- |
| `vitest` | Unit tests | Yes | 4.1.0 | -- |
| Internet access | Live API call | Required | -- | Cannot run smoke test offline |

**Missing dependencies with no fallback:**
- None. All dependencies are available.

**Missing dependencies with fallback:**
- None.

## Sources

### Primary (HIGH confidence)
- [Anthropic Structured Outputs Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- Feature compatibility section confirms: Citations API incompatible (400 error), web search tool NOT listed as incompatible. Schema complexity limits (24 optional params, 20 strict tools, 16 union params). `additionalProperties: false` requirement.
- `node_modules/@anthropic-ai/sdk/lib/transform-json-schema.js` -- SDK source code verified: lines 73-74 strip `additionalProperties` and set `false`. Line 68 preserves `properties` hash as-is.
- `node_modules/@anthropic-ai/sdk/helpers/zod.js` -- SDK source code verified: `zodOutputFormat()` calls `z.toJSONSchema()` then `transformJSONSchema()`, returns `{ type, schema, parse }`.
- `node_modules/@anthropic-ai/sdk/lib/parser.js` -- SDK source code verified: `parseMessage()` iterates `content` blocks, finds `type: 'text'` blocks, parses the first one. Non-text blocks (server_tool_use, web_search_tool_result) pass through unchanged.
- `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` -- Type definitions: `parse()` method signature, `ParsedMessage` type with `parsed_output`.
- Local verification -- `node -e` tests confirming:
  - `z.looseObject({})` produces `{ properties: {}, additionalProperties: {} }` via `z.toJSONSchema()`
  - After `zodOutputFormat()` transform: `{ properties: {}, additionalProperties: false }` (only empty objects valid)
  - `z.string()` replacement produces correct `{ type: "string" }` for data field
  - Modified schema has 2 optional params total (url, tables[].source), well within 24-param limit
  - `npm view @anthropic-ai/sdk version` returns 0.80.0

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` -- Project-specific STACK research confirming zodOutputFormat, messages.parse, prompt caching, web search tool patterns
- `.planning/research/PITFALLS.md` -- Project-specific pitfall catalog (Pitfalls 1-12) for the full migration

### Tertiary (LOW confidence)
- None. All findings verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- versions verified via npm, SDK source inspected
- Architecture: HIGH -- schema behavior verified via local `node -e` tests, SDK internals read
- Pitfalls: HIGH -- grounded in verified SDK behavior and official docs

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable domain -- SDK API is GA, schema behavior unlikely to change)

## Project Constraints (from CLAUDE.md)

- **GSD workflow enforcement:** All file changes go through GSD commands
- **No CSS files** -- inline styles only
- **Vitest for testing** -- `npm test` runs vitest
- **Node adapter pattern** -- Node.js scripts use `nodeAdapter.js` for env access (`getEnv('VITE_CLAUDE_KEY')`)
- **API keys in .env.local** -- not `.env`
- **Convention: _testExports** -- test-only exports via `export const _testExports = { ... }`
- **Error pattern** -- `try/catch` with `null` return on failure; `console.warn` for non-fatal
- **Schema conventions** -- `src/schemas/` uses Zod v4; `looseObject` stays for internal schemas
