# Phase 10: Pipeline Integration & Prompt Fixes - Research

**Researched:** 2026-03-28
**Domain:** AI agent pipeline integration, prompt engineering, structured output compliance
**Confidence:** HIGH

## Summary

Phase 10 wires the full 10-section Pitch Deck pipeline end-to-end: field path injection (FIX-01), PSR findings flow, prompt audit for API dispatch compatibility, and a live test run. The structured output schema (`ReportSectionSchema`) already enforces FIX-03/04/05 mechanically -- citations, searchesPerformed, and redFlags are correctly typed in the Zod schema. The primary implementation work is: (1) a `generateFieldPathBlock()` function that walks a DataPacket slice and produces a human-readable field path reference, injected into `buildUserMessage()` before the JSON code fence; (2) PSR findings extraction and formatting from annual-reader/quarterly-reader output into a string for `options.psrFindings`; (3) targeted prompt edits for 1 CC-specific reference (valuation-specialist line 468) and tool reference cleanup; (4) live pipeline test.

**Primary recommendation:** Build the field path generator as a pure function in `aiResearch.js`, test it with vitest against a real-shaped DataPacket slice, then wire it into `buildUserMessage()`. PSR findings formatting goes in `pipelineManager.js` pre-processing loop. Prompt audit is a file-editing pass with no code changes. Live test is a PM-attended checkpoint.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Generate dynamic field path reference block at dispatch time. Walk actual DataPacket slice (top-level + second-level keys) and inject into user message alongside DataPacket JSON. Existing hardcoded field lists in prompt.md files stay as guidance for what fields mean, but the dynamic block is the source of truth for what fields actually exist. Agents must cite only paths that appear in the reference block.
- **D-02:** After PSR agents complete, extract their `section.narrative` + `section.primarySourceInsights` into a formatted psrFindings string. Pass as `options.psrFindings` to all analysis agents. Goes into cached system message block at 0.1x cache read cost. Quarterly reader reads BOTH 10-Qs AND earnings call transcripts. PSR readers must verify financial data against DataPacket financials -- filings are source of truth.
- **D-03:** Caller assembles DataPacket externally via `assembleDataPacket()` and passes to `runPipeline()`. Pipeline manager is pure dispatch -- does not know about EDGAR, Yahoo, or any data engines.
- **D-04:** Synthesis writer receives all completed sections via existing `priorSections` mechanism. By post-processing time, `allSections` contains all 10 section objects.
- **D-05:** One live end-to-end run to prove pipeline completes. NOT a quality evaluation (Phase 11 does that). **CHECKPOINT:** PM must be present -- do NOT fire automatically.
- **D-06:** Targeted prompt fixes only. Scan all 10 agent prompts for: (a) CC-specific references, (b) outdated format instructions now handled by structured output schema, (c) anything contradicting the new dispatch pattern. Fix what's broken, leave working prompts alone.

### Claude's Discretion
- Format of the dynamic field path reference block (indentation, grouping, depth of nesting shown)
- How psrFindings string is formatted (markdown sections, bullet points, etc.)
- Which specific prompt.md lines need updating during the audit
- Whether PSR agents run sequentially or partially in parallel (dispatch-table.json has parallelism flags)
- Test structure for the dynamic field path generator

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIX-01 | DataPacket field path reference included in every analysis agent prompt -- exact top-level and second-level paths, not guessed | `generateFieldPathBlock()` walks sliced DataPacket, injected by `buildUserMessage()`. Confirmed `sliceDataPacket()` already produces the correct subset per agent config. |
| FIX-03 | Citation format mechanically enforced -- structured outputs guarantee canonical `{id, ref, text, source}` format | Already enforced by `CitationSchema` in `reportSection.js` line 13-19. `z.object({id: z.number(), ref: z.string(), text: z.string(), source: z.string(), url: z.string().optional()})`. No additional work needed unless live test reveals violations. |
| FIX-04 | searchesPerformed format mechanically enforced -- structured outputs guarantee `{query, resultCount, usedInSection}` | Already enforced by `ReportSectionSchema` line 60-63. `z.array(z.object({query: z.string(), resultCount: z.number(), usedInSection: z.boolean()}))`. No additional work needed unless live test reveals violations. |
| FIX-05 | Red flags type mechanically enforced -- structured outputs guarantee string array, not object array | Already enforced by `ReportSectionSchema` line 52. `redFlags: z.array(z.string()).min(1)`. No additional work needed unless live test reveals violations. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | ^0.78.0 | Claude API client | Already installed, `messages.parse()` with `zodOutputFormat` |
| zod | 4.3+ | Schema definition for structured outputs | Already installed, `ReportSectionSchema` in `reportSection.js` |
| vitest | 4.1.0 | Unit testing | Already installed, 57 existing tests pass for aiResearch + pipelineManager |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | (installed) | Environment variable loading | Already used by aiResearch.js |

No new dependencies needed. Phase 10 is integration work on existing infrastructure.

## Architecture Patterns

### Recommended Changes

```
src/engines/
  aiResearch.js          # ADD: generateFieldPathBlock(), modify buildUserMessage()
  pipelineManager.js     # ADD: formatPsrFindings(), wire into pre-processing loop

agents/
  valuation-specialist/
    prompt.md            # FIX: line 468 CC skill reference
  (other prompts)        # AUDIT: tool references, outdated format instructions
```

### Pattern 1: Field Path Generator (FIX-01)

**What:** A pure function that walks a DataPacket slice object and produces a markdown reference block listing all top-level keys and their second-level keys with types.

**When to use:** Called inside `buildUserMessage()` for every agent dispatch that has a DataPacket slice.

**Implementation approach:**

```javascript
// In aiResearch.js
function generateFieldPathBlock(dataSlice) {
  const lines = ['## DataPacket Field Paths', '', 'These are the ONLY valid field paths for citations. Do not fabricate paths.', ''];
  for (const [topKey, topVal] of Object.entries(dataSlice)) {
    if (topVal == null) {
      lines.push(`- dataPacket.${topKey}: null`);
      continue;
    }
    if (typeof topVal !== 'object' || Array.isArray(topVal)) {
      const type = Array.isArray(topVal) ? `array[${topVal.length}]` : typeof topVal;
      lines.push(`- dataPacket.${topKey}: ${type}`);
      continue;
    }
    lines.push(`- dataPacket.${topKey}:`);
    for (const [subKey, subVal] of Object.entries(topVal)) {
      if (subVal == null) {
        lines.push(`  - .${subKey}: null`);
      } else if (typeof subVal === 'object' && !Array.isArray(subVal)) {
        lines.push(`  - .${subKey}: {${Object.keys(subVal).length} fields}`);
      } else if (Array.isArray(subVal)) {
        lines.push(`  - .${subKey}: array[${subVal.length}]`);
      } else {
        lines.push(`  - .${subKey}: ${typeof subVal}`);
      }
    }
  }
  return lines.join('\n');
}
```

**Key design decisions:**
- Two levels of depth only (top-level + second-level) -- deeper nesting would bloat the prompt. Agents can see the full JSON in the code fence for deeper paths.
- Show types and lengths, not values -- values are in the JSON code fence below.
- `null` fields explicitly shown -- agents need to know what data is missing.
- Array lengths shown -- tells agents how many peers, filings, etc. are available.
- Prefix every path with `dataPacket.` to match citation format convention.

### Pattern 2: PSR Findings Extraction (D-02)

**What:** After PSR agents complete in pre-processing, extract `section.narrative` + `section.primarySourceInsights` from each PSR result and format into a psrFindings string.

**Critical caveat:** PSR agents produce output shaped as `ReportSectionSchema` (since `dispatchAgent()` uses that schema for all agents). The PSR prompt says "your output is NOT a report section" but structured output forces it into that schema. The `narrative` field will contain the PSR findings, and `primarySourceInsights` will contain verification notes. This is workable -- the fields are strings/string arrays that can hold any content.

**Implementation approach in pipelineManager.js:**

```javascript
function formatPsrFindings(psrSections) {
  const parts = [];
  for (const section of psrSections) {
    if (!section) continue;
    const agentLabel = section.key || section.title || 'PSR Agent';
    if (section.narrative) {
      parts.push(`### ${agentLabel}\n\n${section.narrative}`);
    }
    if (section.primarySourceInsights?.length > 0) {
      parts.push(`**Primary Source Insights:**\n${section.primarySourceInsights.map(i => `- ${i}`).join('\n')}`);
    }
  }
  return parts.length > 0 ? `## Primary Source Reader Findings\n\n${parts.join('\n\n---\n\n')}` : '';
}
```

**Where it goes:** In the pre-processing loop of `runPipeline()`, after all PSR agents complete, call `formatPsrFindings(psrSections)` and pass the result as `options.psrFindings` to all subsequent wave dispatches.

### Pattern 3: Prompt Audit Results

**What:** Scan all agent prompts for API dispatch incompatibilities.

**Findings from research:**

| Agent | File | Issue | Severity | Fix |
|-------|------|-------|----------|-----|
| valuation-specialist | prompt.md:468 | "In Pitch Deck mode, the CC skill runs an interactive FGR derivation sub-workflow" | HIGH | Rewrite to describe API dispatch FGR input presentation (not CC skill) |
| all analysis agents | prompt.md | References to `WebSearch` and `WebFetch` tool names | LOW | These map to the `web_search` server tool provided by API. The names are close enough that agents understand the intent. Minor: could rename to match API tool name for clarity, but not breaking. |
| competitor-evaluator | prompt.md | References `comparePeers` tool extensively | MEDIUM | `comparePeers` is listed in config.json `tools` but NOT wired in `dispatchAgent()`. Agents receive only `web_search`. The prompt's `comparePeers` references will be ignored by the API. Need to note this as a data limitation or restructure. Since peerMetrics data IS in the DataPacket slice, the agent can manually compare -- the tool just made it easier. |
| financial-analyst | prompt.md | References `getMetric`, `getFinancialLine`, `computeMOS`, etc. | MEDIUM | Same issue -- custom tools not wired in API dispatch. Financial data IS in the DataPacket slice, so the agent has the numbers but not the convenience tools. |
| annual-reader, quarterly-reader | prompt.md | References `readFilingSection` and `getTranscriptExcerpt` tools | HIGH | These are critical -- PSR agents NEED filing/transcript access to function. If these tools are not wired into API dispatch, PSR agents cannot read filings. This is a **blocking integration issue** that must be addressed. |
| all agents | prompt.md | Many say "return an array of TWO JSON objects" | MEDIUM | `ReportSectionSchema` is a single object, not an array. Structured output will force single-object output. Agents producing multiple sections will need separate dispatch calls (already handled by dispatch-table.json which assigns specific sections per dispatch). |
| synthesis-writer | prompt.md:389 | "Set `searchesPerformed` to an empty array" | LOW | Schema default handles this (`z.array().optional().default([])`) |
| PSR agents | prompt.md | Output schema is raw intelligence JSON, not ReportSectionSchema | HIGH | `dispatchAgent()` forces all agents into `ReportSectionSchema`. PSR agents will have to fit their extraction into the schema's fields (narrative for main findings, primarySourceInsights for insights, data for structured extraction). This impedance mismatch needs careful handling. |

### Anti-Patterns to Avoid
- **Do not rewrite working prompts:** D-06 says targeted fixes only. If a prompt produces good output, leave it alone even if it has minor style inconsistencies.
- **Do not remove tool references wholesale:** Even though custom tools are not wired, the references serve as instructions for what the agent should try to accomplish. The `web_search` tool can partially fill the gap. Document what's unavailable, don't delete the instructions.
- **Do not try to dispatch PSR agents with a different schema:** The entire pipeline uses `dispatchAgent()` with `ReportSectionSchema`. Adding schema switching adds complexity. Instead, map PSR output fields into ReportSectionSchema fields.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DataPacket field enumeration | Custom recursive object walker | Simple two-level Object.entries loop | DataPacket is flat enough that 2 levels covers 95% of useful paths |
| PSR findings formatting | Complex template engine | String concatenation with markdown | PSR output is small enough that simple string building works |
| Schema validation | Custom JSON schema checker | Existing `zodOutputFormat` + `messages.parse()` | Already handles FIX-03/04/05 |
| Tool dispatch for custom tools | MCP-style tool server | Embed data in DataPacket instead | Custom tools (comparePeers, etc.) were for CC context; API agents have the same data in their DataPacket slice |

## Common Pitfalls

### Pitfall 1: PSR Schema Mismatch
**What goes wrong:** PSR agents (annual-reader, quarterly-reader) produce raw intelligence JSON (businessEvolution, riskTrajectory, etc.) but `dispatchAgent()` forces `ReportSectionSchema` output. The model may struggle to fit PSR-specific data into the schema.
**Why it happens:** All agents share the same dispatch path with the same output schema.
**How to avoid:** Map PSR output intentionally: `narrative` = the main PSR findings text, `data` = JSON string of the structured extraction (businessEvolution, riskTrajectory, etc.), `primarySourceInsights` = key insights array, `key` = agent role identifier. Accept that PSR output will look different from analysis sections but still conforms to the schema.
**Warning signs:** PSR agents return truncated or empty `narrative` fields, or the model refuses/errors trying to fit extraction data into the schema.

### Pitfall 2: Custom Tool Unavailability
**What goes wrong:** Agent prompts reference tools like `comparePeers`, `readFilingSection`, `getTranscriptExcerpt` that are not available via API dispatch. Agents either hallucinate tool calls or fail to perform the expected analysis.
**Why it happens:** `dispatchAgent()` only provides `web_search` tool. Custom tools were designed for Claude Code context.
**How to avoid:** For analysis agents (business-analyst, financial-analyst, etc.), the DataPacket already contains the data these tools would return. Remove/rephrase tool call instructions to say "use the DataPacket fields directly." For PSR agents, this is critical -- `readFilingSection` and `getTranscriptExcerpt` are essential. If PSR agents cannot access filings, they cannot function. **The current architecture may need PSR agents to receive filing content pre-loaded in their DataPacket slice** rather than calling tools at runtime.
**Warning signs:** PSR agents produce generic summaries instead of filing-specific extractions. Analysis agents ignore peer metrics data available in the DataPacket.

### Pitfall 3: Multi-Section Output vs Single Schema
**What goes wrong:** Prompts tell agents to "return an array of TWO JSON objects" but structured output (`ReportSectionSchema`) expects a single object.
**Why it happens:** Original prompts were designed for Claude Code context where the agent could return arbitrary JSON.
**How to avoid:** The dispatch-table.json already handles this -- e.g., `business-analyst` is dispatched once for the Pitch Deck and told to produce sections [1, 2]. But `ReportSectionSchema` is one section. Either: (a) dispatch the agent twice (once for section 1, once for section 2), or (b) change the schema to accept arrays. Option (a) is simpler and matches the existing single-section schema. Check dispatch-table.json -- it already shows individual section assignments in some waves.
**Warning signs:** `messages.parse()` returns a 400 schema error because the model outputs an array instead of an object.

### Pitfall 4: Field Path Block Too Large
**What goes wrong:** For agents with large DataPacket slices (financial-analyst gets financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics), the field path block could be hundreds of lines, wasting tokens.
**Why it happens:** Financial data has deeply nested year-by-year objects with dozens of fields per statement type.
**How to avoid:** Cap at 2 levels of nesting. For objects with >20 second-level keys, show a sample (first 10 keys + "...and N more"). Alternatively, group by type: "dataPacket.financials.income: {2014-2024, ~60 fields per year}".
**Warning signs:** Input token counts spike significantly after adding field path blocks.

### Pitfall 5: PSR Findings Not Reaching Analysis Agents
**What goes wrong:** PSR agents complete in pre-processing but their findings are not threaded through to wave agents.
**Why it happens:** The current `pipelineManager.js` pre-processing loop collects `allSections` but does not extract PSR findings into a formatted string for `options.psrFindings`.
**How to avoid:** After the pre-processing loop completes, format PSR findings and set `psrFindings` variable before entering the wave loop. The wave loop already passes `options.psrFindings` to each `dispatchAgent()` call.
**Warning signs:** Analysis agents produce generic analysis without referencing filing-specific insights.

### Pitfall 6: Live Test Fires Without PM Present
**What goes wrong:** An executor agent or automation fires the live pipeline run without the user being present to observe.
**Why it happens:** D-05 explicitly states "CHECKPOINT: PM must be present."
**How to avoid:** The live test task must be flagged as a PM checkpoint in the plan. It should provide the command but instruct the user to run it manually.
**Warning signs:** Pipeline runs appear in git history with no corresponding PM feedback or checkpoint acknowledgment.

## Code Examples

### Field Path Generator (verified pattern from codebase analysis)

```javascript
// In aiResearch.js — new export
// Generates a markdown reference block of valid DataPacket field paths
// for injection into agent user messages (FIX-01)
function generateFieldPathBlock(dataSlice) {
  const lines = [
    '## DataPacket Field Paths',
    '',
    'These are the ONLY valid `ref` paths for DataPacket citations.',
    'Do NOT fabricate paths that do not appear below.',
    '',
  ];

  for (const [topKey, topVal] of Object.entries(dataSlice)) {
    if (topVal == null) {
      lines.push(`- \`dataPacket.${topKey}\`: null`);
      continue;
    }
    if (typeof topVal !== 'object' || Array.isArray(topVal)) {
      const type = Array.isArray(topVal) ? `array[${topVal.length}]` : typeof topVal;
      lines.push(`- \`dataPacket.${topKey}\`: ${type}`);
      continue;
    }

    // Object — show second-level keys
    const subKeys = Object.keys(topVal);
    lines.push(`- \`dataPacket.${topKey}\`: {${subKeys.length} fields}`);
    const displayKeys = subKeys.slice(0, 20);
    for (const subKey of displayKeys) {
      const subVal = topVal[subKey];
      if (subVal == null) {
        lines.push(`  - \`.${subKey}\`: null`);
      } else if (Array.isArray(subVal)) {
        lines.push(`  - \`.${subKey}\`: array[${subVal.length}]`);
      } else if (typeof subVal === 'object') {
        lines.push(`  - \`.${subKey}\`: {${Object.keys(subVal).length} fields}`);
      } else {
        lines.push(`  - \`.${subKey}\`: ${typeof subVal}`);
      }
    }
    if (subKeys.length > 20) {
      lines.push(`  - ... and ${subKeys.length - 20} more fields`);
    }
  }

  return lines.join('\n');
}
```

### Modified buildUserMessage (integration point)

```javascript
// Modified buildUserMessage in aiResearch.js
function buildUserMessage(dataSlice, options = {}) {
  const parts = [];

  // FIX-01: Dynamic field path reference block BEFORE the JSON
  const fieldPaths = generateFieldPathBlock(dataSlice);
  parts.push(fieldPaths);

  // DataPacket slice in JSON code fence
  parts.push(`## DataPacket\n\n\`\`\`json\n${JSON.stringify(dataSlice, null, 2)}\n\`\`\``);

  // ... rest unchanged
}
```

### PSR Findings Extraction (pipelineManager.js integration)

```javascript
// In pipelineManager.js — new helper
function formatPsrFindings(psrSections) {
  if (!psrSections || psrSections.length === 0) return '';
  const parts = [];
  for (const section of psrSections) {
    if (!section) continue;
    const label = section.title || section.key || 'PSR Agent';
    if (section.narrative) {
      parts.push(`### ${label}\n\n${section.narrative}`);
    }
    if (section.primarySourceInsights && section.primarySourceInsights.length > 0) {
      parts.push(`**Key Insights:**\n${section.primarySourceInsights.map(i => `- ${i}`).join('\n')}`);
    }
  }
  if (parts.length === 0) return '';
  return `## Primary Source Reader Findings\n\n${parts.join('\n\n---\n\n')}`;
}
```

### Pre-processing Loop Modification

```javascript
// In runPipeline(), after the pre-processing loop:
let psrFindings = options.psrFindings || '';

// After PSR agents complete, format their findings
const psrSections = allSections.filter(s => s && (s.key === 'annual-reader' || s.key === 'quarterly-reader'));
if (psrSections.length > 0) {
  psrFindings = formatPsrFindings(psrSections);
}

// Then in the wave loop, pass psrFindings to each agent:
// Already wired: psrFindings is passed via options.psrFindings
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded field lists in prompts | Dynamic field path block from actual DataPacket | Phase 10 (FIX-01) | Eliminates fabricated citation paths |
| PSR as separate CC skill pass | PSR integrated in pre-processing pipeline | Phase 10 (D-02) | PSR findings flow to all analysis agents automatically |
| Format enforcement via prompt instructions | Structured output schema (`zodOutputFormat`) | Phase 8 (API-01) | Mechanical enforcement of FIX-03/04/05 |

## Open Questions

1. **PSR Tool Access**
   - What we know: PSR agents (annual-reader, quarterly-reader) reference `readFilingSection` and `getTranscriptExcerpt` tools. These are not provided by `dispatchAgent()`.
   - What's unclear: How will PSR agents read actual SEC filings without these tools? The DataPacket includes a `filings` array with accession numbers but not full filing text.
   - Recommendation: Two options: (a) Pre-load filing sections into the DataPacket before PSR dispatch (expensive in tokens but guaranteed to work), or (b) Wire `readFilingSection` as a custom tool in the API call (complex, requires tool implementation server-side). Option (a) is more pragmatic for Phase 10's "prove it works" goal. **This needs resolution before the live test.**

2. **Multi-Section Dispatch**
   - What we know: Dispatch-table.json assigns multiple sections to some agents (e.g., business-analyst sections [1, 2], financial-analyst sections [5], then [7, 8]).
   - What's unclear: `ReportSectionSchema` is a single section. Financial-analyst is dispatched 3 times (sections 5, then 7, 8 -- two separate dispatch entries in wave 2). Business-analyst is dispatched once with sections [1, 2]. Will the model produce one section or two?
   - Recommendation: Dispatch once per section for clarity, OR accept that the model may return a section representing both and handle it in post-processing. The dispatch table already splits financial-analyst into two entries (sections [5] and [7, 8]). Business-analyst and competitor-evaluator have sections [1, 2] and [3, 4] respectively -- these may need splitting into separate dispatches.

3. **Transcript Availability for Quarterly Reader**
   - What we know: DataPacket includes `transcriptAvailability` (count and latest quarter) but the `transcripts` field in the DataPacket slice for quarterly-reader may not include actual transcript text.
   - What's unclear: Does `dataPacket.transcripts` contain the transcript content, or just metadata? If just metadata, the quarterly-reader's `getTranscriptExcerpt` tool is essential.
   - Recommendation: Check what `fetchTranscriptList()` returns and whether transcript content is cached in IndexedDB. If content is available, include it in the DataPacket. If not, this is the same tool-access issue as `readFilingSection`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `vitest.config.js` (or inline in package.json) |
| Quick run command | `npm test -- src/engines/__tests__/aiResearch.test.js src/engines/__tests__/pipelineManager.test.js` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIX-01 | generateFieldPathBlock produces correct paths from DataPacket slice | unit | `npm test -- src/engines/__tests__/aiResearch.test.js -t "generateFieldPathBlock"` | Wave 0 |
| FIX-01 | buildUserMessage includes field path block before DataPacket JSON | unit | `npm test -- src/engines/__tests__/aiResearch.test.js -t "buildUserMessage"` | Existing (needs extension) |
| FIX-03 | CitationSchema enforces {id, ref, text, source} format | unit | `npm test -- src/schemas/__tests__/reportSection.test.js` | Wave 0 (optional -- schema is static) |
| FIX-04 | searchesPerformed schema enforces {query, resultCount, usedInSection} | unit | Same as FIX-03 | Wave 0 (optional) |
| FIX-05 | redFlags is z.array(z.string()).min(1) | unit | Same as FIX-03 | Wave 0 (optional) |
| D-02 | formatPsrFindings extracts narrative + insights from PSR sections | unit | `npm test -- src/engines/__tests__/pipelineManager.test.js -t "formatPsrFindings"` | Wave 0 |
| D-02 | pipelineManager wires PSR findings into wave agent dispatches | integration | `npm test -- src/engines/__tests__/pipelineManager.test.js -t "PSR findings"` | Wave 0 |
| D-05 | Live pipeline run completes all 10 sections + synthesis | manual | Run script manually with PM present | N/A -- manual checkpoint |

### Sampling Rate
- **Per task commit:** `npm test -- src/engines/__tests__/aiResearch.test.js src/engines/__tests__/pipelineManager.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/engines/__tests__/aiResearch.test.js` -- add `generateFieldPathBlock` describe block (6+ tests)
- [ ] `src/engines/__tests__/pipelineManager.test.js` -- add `formatPsrFindings` describe block (4+ tests)
- [ ] `src/engines/__tests__/pipelineManager.test.js` -- add PSR findings wiring integration test

## Sources

### Primary (HIGH confidence)
- `src/engines/aiResearch.js` -- current dispatch implementation (buildUserMessage, sliceDataPacket, dispatchAgent)
- `src/engines/pipelineManager.js` -- current pipeline orchestration (runPipeline, pre-processing loop)
- `src/schemas/reportSection.js` -- current Zod schema (ReportSectionSchema, CitationSchema)
- `agents/orchestrator/dispatch-table.json` -- wave structure, section-to-agent mapping
- All 9 agent `config.json` files -- dataPacketSlice definitions, tool lists
- All 9 agent `prompt.md` files -- full prompt audit performed
- `src/engines/dataExport.js` -- DataPacket structure (assembleDataPacket return shape)
- Existing test files -- 57 passing tests for aiResearch + pipelineManager

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions D-01 through D-06 -- user-locked implementation decisions
- REQUIREMENTS.md FIX-01/03/04/05 -- requirement definitions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing infrastructure verified in code
- Architecture: HIGH -- clear integration points identified, patterns verified against existing code
- Pitfalls: HIGH -- all identified from actual code reading (tool unavailability, schema mismatch, multi-section dispatch)
- Open Questions: MEDIUM -- PSR tool access is a genuine blocker that needs resolution during planning

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- infrastructure-level changes, not library-version-dependent)
