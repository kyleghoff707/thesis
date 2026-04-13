# Phase 5D: Quality System - Research

**Researched:** 2026-03-24
**Domain:** Automated quality validation for AI-generated investment research sections
**Confidence:** HIGH

## Summary

Phase 5D builds the quality assurance layer for Thes1s AI-generated reports. The system consists of three new engine files: `critic.js` (citation validation + completeness scoring + confidence validation + red flag enforcement + data gap detection + multi-source verification), `contextBudget.js` (token usage measurement and tracking), and failure recovery logic integrated into `progressState.js`. These engines validate the structured JSON output from AI agents (ReportSectionSchema) against the DataPacket (canonical data source) and produce per-section quality reports saved alongside the generated content.

The COST one-pager provides a real test dataset: 6 sections, 62 citations, structured data, narratives, and red flags. Analysis of this output reveals a critical schema-reality gap: the CitationSchema defines `{id, ref, text, source}` but 76% of actual citations (47 of 62) use `{id, source, url, note}` instead. The quality system must handle both formats and enforce the canonical format going forward. Additionally, all token costs are currently zeros (the CC skill doesn't capture usage from subagent dispatches), making QUAL-08 an infrastructure gap that requires measurement before budgets can be set.

**Primary recommendation:** Build critic.js as a pure function that takes (section, dataPacket, sectionSchema) and returns a QualityReport object. Keep it synchronous and testable -- no network calls, no side effects. Token measurement requires wrapping subagent dispatch in the CC skill, which is a separate concern from critic.js.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Citation validation checks path existence AND value matches for Thes1s native citations. If a citation says `dataPacket.growthRates.earnings.10yr = 13.0%`, critic.js verifies that path exists in the DataPacket AND the value is actually 13.0%.
- **D-02:** SEC filing citations: validate well-formed reference format (has filing type, year, page). Do NOT fetch the actual filing to verify.
- **D-03:** Web search citations: validate URL format is valid. Do NOT fetch URLs (they go stale). Just check it looks like a real URL.
- **D-04:** Untraceable claims are flagged but don't block. Quality report shows severity levels. Report generation still completes -- the PM reviews flags and decides whether to accept, regenerate, or investigate. Like compliance flagging issues for the PM.
- **D-05:** 1 retry with error context, then escalate. Agent fails -> retry once with error message injected ("Your previous attempt failed because..."). If retry fails -> save partial output, escalate to user with: what failed, what was attempted, partial results if any.
- **D-06:** Partial results preserved and marked as `status: 'failed'` in progress state. User can see what was attempted and decide if it's salvageable. Like an analyst submitting an incomplete draft with notes on where they got stuck.

### Claude's Discretion
- Completeness scoring implementation (QUAL-02) -- which fields are "required" vs "optional" per section, scoring formula
- Confidence validation logic (QUAL-03) -- how to verify HIGH/MEDIUM/LOW is justified by data completeness and source agreement
- Multi-source verification rules (QUAL-04) -- which claims need 2-3+ sources
- Red flag enforcement (QUAL-05) -- already enforced in prompts, quality system validates
- "Data not available" handling (QUAL-06) -- already enforced in prompts ("honest gaps, never estimated numbers"), quality system validates
- Token budget measurement (QUAL-08) -- contextBudget.js implementation, how to surface costs to user

### Deferred Ideas (OUT OF SCOPE)
- Quality dashboard in the UI -- show quality scores per section visually
- Automated re-generation triggers based on quality scores
- Historical quality tracking across multiple generations
- Token budget alerts (warn when approaching limits)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUAL-01 | `critic.js` -- citation validation (every claim traceable to DataPacket field path, SEC filing, or URL) | Real COST data analyzed: 62 citations with two format variants; DataPacket path resolution documented; citation type classification rules defined |
| QUAL-02 | Completeness scoring -- all required fields present per section schema | ReportSectionSchema analyzed: 11 required fields, 4 optional; scoring formula designed around required field presence + narrative length + data population |
| QUAL-03 | Confidence scoring -- HIGH/MEDIUM/LOW based on data completeness and source agreement | Confidence validation rules mapped against DataPacket availability and citation source diversity |
| QUAL-04 | Multi-source verification -- financial metrics need EDGAR + peer, growth projections need CAGR + analyst + industry | Citation source categorization enables automated multi-source checking per claim type |
| QUAL-05 | Red flags required in every section, even passing ones | Already enforced in ReportSectionSchema (`redFlags: z.array(z.string()).min(1)`); critic.js validates quality/specificity of flags |
| QUAL-06 | "Data not available" -- honest gaps, never estimated numbers | DataPacket null field detection enables cross-referencing against narrative claims |
| QUAL-07 | Retry-then-escalate failure handling | progressState.js already has `failed` status + error field; retry logic wraps agent dispatch in CC skill |
| QUAL-08 | `contextBudget.js` -- token counting + budget management per agent | Token costs all zeros in COST output; CC skill subagent dispatch doesn't capture usage; measurement-first approach required |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^4.3.6 | Schema validation for quality reports | Already in use; `.safeParse()` for non-throwing validation |
| vitest | ^4.1.0 | Test runner for critic.js + contextBudget.js | Already in use; 17 existing test files in engines/__tests__ |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All quality system functionality uses pure JS + existing Zod |

No new dependencies required. The quality system is pure validation logic operating on JSON objects that already exist in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/engines/
  critic.js              -- Citation validation, completeness scoring, confidence validation,
                            multi-source verification, red flag enforcement, data gap detection
  contextBudget.js       -- Token usage measurement, per-agent cost tracking, budget reporting
  __tests__/
    critic.test.js       -- Unit tests against COST fixture data
    contextBudget.test.js

.thes1s/reports/{TICKER}/
  quality/
    company_info.quality.json      -- Per-section quality report
    minimum_standards.quality.json
    ...
    one-pager.quality.json         -- Aggregate quality report for stage
```

### Pattern 1: Pure Validation Function
**What:** critic.js exports a pure function that validates a section against a DataPacket and returns a QualityReport. No side effects, no network calls, no file I/O.
**When to use:** After every agent completes a section, before saving to disk.
**Example:**
```javascript
// critic.js — pure validation, matches project engine pattern
export function validateSection(section, dataPacket, options = {}) {
  const issues = [];

  // 1. Citation validation (QUAL-01)
  const citationIssues = validateCitations(section.citations, dataPacket);
  issues.push(...citationIssues);

  // 2. Completeness scoring (QUAL-02)
  const completeness = scoreCompleteness(section);

  // 3. Confidence validation (QUAL-03)
  const confidenceIssues = validateConfidence(section, dataPacket);
  issues.push(...confidenceIssues);

  // 4. Multi-source verification (QUAL-04)
  const sourceIssues = checkMultiSource(section.citations);
  issues.push(...sourceIssues);

  // 5. Red flag quality (QUAL-05)
  const redFlagIssues = validateRedFlags(section.redFlags);
  issues.push(...redFlagIssues);

  // 6. Data gap detection (QUAL-06)
  const gapIssues = detectFabricatedData(section, dataPacket);
  issues.push(...gapIssues);

  return {
    sectionKey: section.key,
    score: computeOverallScore(completeness, issues),
    completeness,
    issues,
    passed: issues.filter(i => i.severity === 'high').length === 0,
    checkedAt: new Date().toISOString(),
  };
}
```

### Pattern 2: Citation Type Classification
**What:** Citations in the real output fall into 4 categories that require different validation strategies.
**When to use:** Inside critic.js citation validation.

Analysis of the COST one-pager (62 citations) reveals:
1. **DataPacket citations** (source contains "DataPacket", "EDGAR XBRL", "Rule One Toolbox", "Computed") -- Validate `ref` resolves to a real DataPacket path AND value matches. This is D-01.
2. **SEC filing citations** (source contains "SEC", "EDGAR", "10-K", "10-Q", "8-K", "13F") -- Validate well-formed format: has filing type + year. Per D-02.
3. **Web/URL citations** (url field is non-empty and looks like a URL) -- Validate URL format. Per D-03.
4. **Descriptive citations** (everything else: "Morningstar", "Industry CAGR research", "Costco corporate history") -- Flag as untraceable. Per D-04, these don't block.

```javascript
function classifyCitation(citation) {
  const source = (citation.source || '').toLowerCase();
  const ref = (citation.ref || '').toLowerCase();

  if (source === 'datapacket' || source === 'computed' ||
      source.includes('rule one toolbox') || ref.includes('datapacket')) {
    return 'datapacket';
  }
  if (source.includes('sec') || source.includes('edgar') || source.includes('10-k') ||
      source.includes('10-q') || source.includes('8-k') || source.includes('13f')) {
    return 'sec_filing';
  }
  if (citation.url && /^https?:\/\//.test(citation.url)) {
    return 'web_url';
  }
  return 'untraceable';
}
```

### Pattern 3: DataPacket Path Resolution
**What:** Navigate a dot-path string to resolve a value from the DataPacket JSON.
**When to use:** For D-01 citation validation -- checking that a referenced DataPacket path exists and the value matches.

```javascript
// Resolve a dot-path like "growthRates.earnings.10yr" against the DataPacket
function resolveDataPath(dataPacket, path) {
  const parts = path.split('.');
  let current = dataPacket;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return { found: false, value: undefined };
    current = current[part];
  }
  return { found: current !== undefined, value: current };
}
```

**Critical finding from COST data:** Current citations do NOT use DataPacket paths in the `ref` field. The `ref` field contains human-readable labels like "EDGAR XBRL" or "Rule One Calculators", not paths like "growthRates.earnings.10yr". Two approaches:
1. **Retroactive:** critic.js attempts to match cited values against DataPacket by searching for the numeric value in `text`/`note` field across all DataPacket fields.
2. **Prospective:** Update agent prompts (in a future iteration) to emit DataPacket paths in the `ref` field when the data comes from the DataPacket.

Recommendation: Start with approach 1 (retroactive fuzzy matching for source="DataPacket" or "Computed") and flag citation format violations as `severity: 'low'` issues. The quality system validates what exists today while establishing the standard for future generations.

### Pattern 4: QualityReport Schema
**What:** Structured output from critic.js, saved per section.
```javascript
export const QualityReportSchema = z.object({
  sectionKey: z.string(),
  score: z.number().min(0).max(100),  // 0-100 composite
  completeness: z.object({
    requiredFieldsPresent: z.number(),
    requiredFieldsTotal: z.number(),
    narrativeLength: z.number(),
    dataFieldsPopulated: z.number(),
    score: z.number(),  // 0-100
  }),
  issues: z.array(z.object({
    type: z.enum(['citation', 'completeness', 'confidence', 'multi_source', 'red_flag', 'data_gap']),
    severity: z.enum(['high', 'medium', 'low']),
    message: z.string(),
    field: z.string().optional(),       // which field/citation triggered this
    expected: z.string().optional(),     // what was expected
    actual: z.string().optional(),       // what was found
  })),
  passed: z.boolean(),  // true if no HIGH severity issues
  checkedAt: z.string(),
});
```

### Pattern 5: Token Budget Measurement (contextBudget.js)
**What:** Wrap agent dispatch to capture actual token usage from Claude API responses.
**When to use:** Inside the CC skill, wrapping each subagent Agent tool call.

**The problem:** CC skill dispatches subagents via the Agent tool. The Agent tool response does not expose token usage to the calling agent. Token costs are all zeros in the COST output because agents self-report their tokenCost (which they don't know).

**Realistic approach:** contextBudget.js measures what it CAN measure and logs what it cannot:
1. **Input token estimation:** Count characters in the prompt sent to each agent, divide by ~4 for a rough token estimate. This gives the input side.
2. **Output token estimation:** Count characters in the agent's response, divide by ~4.
3. **Actual usage:** Only available if agents are dispatched via direct Anthropic API calls (not the Agent tool). For CC skill subagents, estimation is the only option.
4. **Cost calculation:** Use known per-token pricing for the model used.

```javascript
// contextBudget.js
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);  // rough estimate
}

export function createBudgetTracker() {
  const entries = [];

  return {
    record(agentRole, sectionKey, inputChars, outputChars, model) {
      entries.push({
        agentRole,
        sectionKey,
        inputTokens: estimateTokens({ length: inputChars }),
        outputTokens: estimateTokens({ length: outputChars }),
        model,
        timestamp: new Date().toISOString(),
      });
    },

    getSummary() {
      const totalInput = entries.reduce((s, e) => s + e.inputTokens, 0);
      const totalOutput = entries.reduce((s, e) => s + e.outputTokens, 0);
      return {
        entries,
        totals: { input: totalInput, output: totalOutput },
        estimatedCost: computeCost(totalInput, totalOutput),
      };
    },
  };
}
```

### Pattern 6: Failure Recovery Integration
**What:** Retry-then-escalate wrapping around agent dispatch in the CC skill.
**When to use:** When any agent section generation fails.

```javascript
// In CC skill Step 6 (collect analyst outputs), wrap parse/validate:

// Pseudo-code for retry logic in the CC skill instructions:
// 1. Agent completes -> parse JSON from response
// 2. If parse fails OR validation fails:
//    a. Construct retry prompt with error: "Previous attempt failed: {error}. Fix: {specific issue}"
//    b. Dispatch same agent again with retry prompt appended
//    c. If retry also fails -> save partial with status:'failed', error message
//    d. Continue with remaining sections

// In progressState.js, the section already supports:
// { status: 'failed', error: 'Parse error: unexpected token at line 12' }
```

### Anti-Patterns to Avoid
- **Network-dependent validation:** Never fetch URLs or SEC filings to verify citations. D-02 and D-03 are explicit: format validation only.
- **Blocking on untraceable citations:** D-04 is explicit: flag but don't block. The PM decides.
- **Setting token budgets before measurement:** D-08 context says "measure first, set limits later." Do not hardcode budget caps.
- **Modifying agent prompts in this phase:** The quality system VALIDATES output. Prompt improvements are a separate concern (iterative improvement in 5C or later).
- **Custom scoring without test data:** Use the COST one-pager as the test fixture. Build scoring that produces reasonable results against real data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation | Custom field checking | Zod `.safeParse()` on ReportSectionSchema | Already in use, handles edge cases |
| JSON path resolution | Complex traversal lib | Simple dot-path split + loop | DataPacket is max 3 levels deep, simple recursion works |
| URL format validation | Custom regex | `new URL()` in a try/catch | Handles all URL edge cases, built into Node/browser |
| Token counting | Custom tokenizer | Character-based estimation (chars/4) | Exact token counting requires tiktoken (heavy dep) -- estimation is fine for measurement phase |

**Key insight:** The quality system is fundamentally a structured JSON diff/check engine. The DataPacket and ReportSection are both well-defined JSON objects. The hard part is not the validation logic -- it's defining the rules for what constitutes "good enough" quality. Start with the rules from CONTEXT.md decisions and iterate based on real generation output.

## Common Pitfalls

### Pitfall 1: Citation Schema Mismatch
**What goes wrong:** The CitationSchema defines `{id, ref, text, source}` but 76% of real citations use `{id, source, url, note}`. Strict validation against the schema rejects most citations.
**Why it happens:** Agents were dispatched with the schema as guidance but produced a different format. The Zod schema in reportSection.js was not enforced via Claude structured outputs for the citation array elements.
**How to avoid:** critic.js must handle BOTH citation formats. Normalize citations to a canonical form before validating. Flag format violations as low-severity issues.
**Warning signs:** All citations failing validation in test runs.

### Pitfall 2: Zero Token Costs
**What goes wrong:** The CC skill dispatches agents via the Agent tool, which doesn't expose token usage to the caller. All tokenCost fields are `{input: 0, output: 0}`.
**Why it happens:** Claude Code's Agent tool is a black box -- the parent agent can't observe the child's API calls.
**How to avoid:** contextBudget.js uses character-based estimation as a first approximation. More precise measurement requires either (a) direct API calls instead of Agent tool, or (b) post-hoc estimation from prompt + response sizes.
**Warning signs:** Token cost data being relied on for budget enforcement when it's only estimated.

### Pitfall 3: Overly Strict Completeness Scoring
**What goes wrong:** Scoring rejects sections that are actually good because optional fields are missing.
**Why it happens:** Treating all fields equally instead of weighting required vs optional.
**How to avoid:** ReportSectionSchema distinguishes required fields (no `.optional()`) from optional ones (`.optional().default([])`). Required: key, title, sectionNumber, status, confidence, verdict, verdictRationale, summary, data, narrative, citations, redFlags, generatedAt, modelUsed, tokenCost. Optional: tables, charts, primarySourceInsights, crossCuttingFindings.
**Warning signs:** Scores below 70% for sections that read as high-quality to a human.

### Pitfall 4: DataPacket Value Matching Precision
**What goes wrong:** Citation says "ROE 27.77%" but DataPacket has `0.2777`. Exact string match fails.
**Why it happens:** Agents format numbers for human readability (percentages, dollar signs) while DataPacket stores raw values.
**How to avoid:** Implement fuzzy numeric matching: extract numeric values from citation text, normalize units (% -> decimal, $B -> raw), then compare within tolerance.
**Warning signs:** High rate of "value mismatch" issues on citations that are actually correct.

### Pitfall 5: Mixing Validation and Enforcement
**What goes wrong:** Quality system blocks report generation or rejects sections.
**Why it happens:** Developer instinct to make validation a hard gate.
**How to avoid:** Per D-04, the quality system FLAGS issues. It NEVER blocks. The PM (user) decides. The `passed` field in QualityReport is informational, not a gate. Even `passed: false` sections are saved.
**Warning signs:** Code paths that throw errors or prevent saves based on quality scores.

## Code Examples

### Citation Validation with Type-Aware Strategy
```javascript
// Source: project analysis of COST one-pager citations
function validateCitations(citations, dataPacket) {
  const issues = [];

  for (const citation of citations) {
    const type = classifyCitation(citation);

    switch (type) {
      case 'datapacket': {
        // D-01: path exists AND value matches
        const ref = citation.ref || '';
        const text = citation.text || citation.note || '';

        // Try to resolve as DataPacket path
        if (ref.startsWith('dataPacket.') || ref.startsWith('DataPacket.')) {
          const path = ref.replace(/^[Dd]ataPacket\./, '');
          const { found, value } = resolveDataPath(dataPacket, path);
          if (!found) {
            issues.push({
              type: 'citation', severity: 'high',
              message: `DataPacket path not found: ${ref}`,
              field: `citation[${citation.id}]`,
            });
          } else {
            // Extract numeric values from text and compare
            const match = matchNumericValue(text, value);
            if (!match) {
              issues.push({
                type: 'citation', severity: 'medium',
                message: `Value mismatch: citation says "${text}" but DataPacket has ${value}`,
                field: `citation[${citation.id}]`,
                expected: String(value),
                actual: text,
              });
            }
          }
        } else {
          // Ref is human-readable, not a path — flag format but don't block
          issues.push({
            type: 'citation', severity: 'low',
            message: `DataPacket citation uses label "${ref}" instead of a field path`,
            field: `citation[${citation.id}]`,
          });
        }
        break;
      }

      case 'sec_filing': {
        // D-02: validate format (filing type + year)
        const text = citation.source || citation.ref || '';
        const hasFilingType = /10-[KQ]|8-K|13[FD]|proxy|annual|S-1/i.test(text);
        const hasYear = /\b(19|20)\d{2}\b|FY\d{2,4}/i.test(text);
        if (!hasFilingType) {
          issues.push({
            type: 'citation', severity: 'medium',
            message: `SEC citation missing filing type: "${text}"`,
            field: `citation[${citation.id}]`,
          });
        }
        if (!hasYear) {
          issues.push({
            type: 'citation', severity: 'low',
            message: `SEC citation missing year: "${text}"`,
            field: `citation[${citation.id}]`,
          });
        }
        break;
      }

      case 'web_url': {
        // D-03: validate URL format
        try {
          new URL(citation.url);
        } catch {
          issues.push({
            type: 'citation', severity: 'medium',
            message: `Invalid URL format: "${citation.url}"`,
            field: `citation[${citation.id}]`,
          });
        }
        break;
      }

      case 'untraceable': {
        // D-04: flag but don't block
        issues.push({
          type: 'citation', severity: 'low',
          message: `Untraceable citation: "${citation.source || citation.ref}"`,
          field: `citation[${citation.id}]`,
        });
        break;
      }
    }
  }

  return issues;
}
```

### Completeness Scoring
```javascript
// Source: ReportSectionSchema analysis
const REQUIRED_FIELDS = [
  'key', 'title', 'sectionNumber', 'status', 'confidence',
  'verdict', 'verdictRationale', 'summary', 'data', 'narrative',
  'citations', 'redFlags', 'generatedAt', 'modelUsed', 'tokenCost',
];

const QUALITY_WEIGHTS = {
  requiredFields: 40,    // 40% — all required fields present
  narrativeDepth: 25,    // 25% — narrative length and paragraph structure
  citationDensity: 20,   // 20% — citations per claim
  dataPopulation: 15,    // 15% — data object has meaningful content
};

function scoreCompleteness(section) {
  // Required fields
  const present = REQUIRED_FIELDS.filter(f => section[f] != null && section[f] !== '');
  const requiredScore = (present.length / REQUIRED_FIELDS.length) * 100;

  // Narrative depth (paragraphs, length)
  const narrative = section.narrative || '';
  const paragraphs = narrative.split(/\n\n|\. [A-Z]/).length;
  const narrativeScore = Math.min(100, (narrative.length / 500) * 50 + (paragraphs / 3) * 50);

  // Citation density
  const citations = section.citations?.length || 0;
  const citationScore = Math.min(100, (citations / 5) * 100);  // 5+ citations = full score

  // Data population
  const dataKeys = section.data ? Object.keys(section.data).length : 0;
  const dataScore = Math.min(100, (dataKeys / 3) * 100);  // 3+ data fields = full score

  const composite = Math.round(
    requiredScore * (QUALITY_WEIGHTS.requiredFields / 100) +
    narrativeScore * (QUALITY_WEIGHTS.narrativeDepth / 100) +
    citationScore * (QUALITY_WEIGHTS.citationDensity / 100) +
    dataScore * (QUALITY_WEIGHTS.dataPopulation / 100)
  );

  return {
    requiredFieldsPresent: present.length,
    requiredFieldsTotal: REQUIRED_FIELDS.length,
    narrativeLength: narrative.length,
    dataFieldsPopulated: dataKeys,
    score: composite,
  };
}
```

### Confidence Validation
```javascript
// Source: QUAL-03 requirements + DataPacket analysis
function validateConfidence(section, dataPacket) {
  const issues = [];
  const confidence = section.confidence;

  // HIGH confidence requires: multiple data sources + all required fields populated
  if (confidence === 'HIGH') {
    const citations = section.citations || [];
    const uniqueSources = new Set(citations.map(c => classifyCitation(c)));

    if (uniqueSources.size < 2) {
      issues.push({
        type: 'confidence', severity: 'medium',
        message: `HIGH confidence but only ${uniqueSources.size} citation type(s). Expected 2+.`,
        field: 'confidence',
      });
    }

    // Check if key DataPacket fields for this section are null
    const nullFields = findNullDataPacketFields(section.key, dataPacket);
    if (nullFields.length > 2) {
      issues.push({
        type: 'confidence', severity: 'medium',
        message: `HIGH confidence but ${nullFields.length} expected DataPacket fields are null: ${nullFields.join(', ')}`,
        field: 'confidence',
      });
    }
  }

  return issues;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Post-hoc manual review | Automated quality checks per section | This phase | Catches issues before PM review |
| Agent self-reported token costs | Wrapper-based measurement + estimation | This phase | First real cost data |
| Schema as documentation | Schema as validation contract | Phase 5A (Zod schemas) | Foundation for critic.js |

**Deprecated/outdated:**
- No deprecated approaches to note -- this is greenfield quality infrastructure.

## Open Questions

1. **DataPacket path format in citations**
   - What we know: Current agents use human-readable labels ("EDGAR XBRL"), not DataPacket paths ("growthRates.earnings.10yr")
   - What's unclear: Whether to update agent prompts now or accept the current format
   - Recommendation: Accept both formats in critic.js. Flag non-path citations as low-severity. Agent prompt updates happen in a separate iteration.

2. **Completeness score thresholds**
   - What we know: We have one real report (COST) to calibrate against
   - What's unclear: What score constitutes "good enough" for each section type
   - Recommendation: Run critic.js against COST, observe score distribution, then set thresholds. Don't pre-define thresholds without data.

3. **Token estimation accuracy**
   - What we know: chars/4 is a rough approximation; actual Claude tokenization varies by content
   - What's unclear: How far off estimates will be from reality
   - Recommendation: contextBudget.js logs estimates. When/if direct API calls replace Agent tool dispatch, the system will capture actual usage. The delta between estimated and actual will calibrate the estimator.

4. **Citation format normalization**
   - What we know: Two formats exist (`{id, ref, text, source}` and `{id, source, url, note}`)
   - What's unclear: Which format to enforce going forward
   - Recommendation: The canonical format is the CitationSchema (`{id, ref, text, source}`). critic.js accepts both but flags the non-canonical format. Agent prompt updates enforce canonical format in next iteration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | package.json `"test": "vitest run"` (no separate config file) |
| Quick run command | `npm test -- --reporter=verbose src/engines/__tests__/critic.test.js` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-01 | Citation validation: DataPacket path + value match, SEC format, URL format, untraceable flagging | unit | `npm test -- src/engines/__tests__/critic.test.js -t "citation"` | Wave 0 |
| QUAL-02 | Completeness scoring: required fields, narrative depth, citation density, data population | unit | `npm test -- src/engines/__tests__/critic.test.js -t "completeness"` | Wave 0 |
| QUAL-03 | Confidence validation: HIGH requires multi-source + data completeness | unit | `npm test -- src/engines/__tests__/critic.test.js -t "confidence"` | Wave 0 |
| QUAL-04 | Multi-source verification: financial claims need EDGAR + peer sources | unit | `npm test -- src/engines/__tests__/critic.test.js -t "multi-source"` | Wave 0 |
| QUAL-05 | Red flag quality: min 1 flag, specificity check | unit | `npm test -- src/engines/__tests__/critic.test.js -t "red flag"` | Wave 0 |
| QUAL-06 | Data gap detection: narrative claims vs DataPacket null fields | unit | `npm test -- src/engines/__tests__/critic.test.js -t "data gap"` | Wave 0 |
| QUAL-07 | Failure recovery: retry-then-escalate, partial result preservation | unit | `npm test -- src/engines/__tests__/critic.test.js -t "failure"` | Wave 0 |
| QUAL-08 | Token estimation and budget tracking | unit | `npm test -- src/engines/__tests__/contextBudget.test.js` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- src/engines/__tests__/critic.test.js src/engines/__tests__/contextBudget.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/engines/__tests__/critic.test.js` -- covers QUAL-01 through QUAL-06
- [ ] `src/engines/__tests__/contextBudget.test.js` -- covers QUAL-08
- [ ] `src/engines/__tests__/fixtures/cost-section-company-info.json` -- fixture from real COST data
- [ ] `src/engines/__tests__/fixtures/cost-data-packet-slice.json` -- minimal DataPacket fixture for path resolution tests

## Project Constraints (from CLAUDE.md)

- **Engine pattern:** Engines are pure async functions with no React dependency. critic.js follows this pattern.
- **Error handling:** Try/catch with null returns, callers check for null. Console.warn for non-fatal.
- **Naming:** Engine files are camelCase `.js`. Test files mirror source with `.test.js` suffix. Functions are camelCase with action verb prefix.
- **Test framework:** Vitest (`npm test`). Tests in `src/engines/__tests__/`.
- **Constants:** UPPER_SNAKE_CASE for module-level constants.
- **Exports:** Named exports for engine functions. Test-only exports under `export const _testExports = {}`.
- **No new deps:** Quality system uses Zod (already installed) and pure JS. No new npm packages.
- **File output:** Quality reports go to `.thes1s/reports/{TICKER}/quality/` alongside existing section JSON.
- **Node execution:** Scripts use `--import scripts/node-esm-loader.js` for Vite-style imports.
- **GSD workflow:** Use `/gsd:execute-phase` for planned phase work.

## Sources

### Primary (HIGH confidence)
- `src/schemas/reportSection.js` -- ReportSectionSchema, CitationSchema definitions (read directly)
- `src/schemas/dataPacket.js` -- DataPacketSchema, sliceDataPacket function (read directly)
- `.thes1s/reports/COST/one-pager.json` -- Real generated output, 6 sections, 62 citations (analyzed directly)
- `.thes1s/reports/COST/data-packet.json` -- Real DataPacket for COST, 163KB, all engine outputs (analyzed directly)
- `src/engines/progressState.js` -- State persistence, section status, state machine transitions (read directly)
- `src/engines/validation.js` -- Existing validation engine pattern (accounting identities, completeness, derived field checks)
- `.claude/skills/generate-one-pager/SKILL.md` -- CC skill: 8-step pipeline, agent dispatch, error resilience

### Secondary (MEDIUM confidence)
- `src/schemas/progress.js` -- ProgressSchema with section status enum (complete/running/pending/failed)
- `agents/orchestrator/dispatch-table.json` -- Agent-to-section mappings, phase structure, checkpoint definitions
- `.planning/phases/05B-one-pager-display-components/05B-UI-POLISH-NOTES.md` -- Citation rendering issues to coordinate with

### Tertiary (LOW confidence)
- Token estimation accuracy (chars/4 approximation) -- needs calibration against real Claude tokenization

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, all validation logic is pure JS + existing Zod
- Architecture: HIGH -- real generated data (COST) analyzed, patterns derived from actual output structure
- Pitfalls: HIGH -- schema-reality gap discovered through direct analysis, all pitfalls evidence-based

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- quality validation patterns don't change fast)
