# Phase 15: Quality System - Research

**Researched:** 2026-03-30
**Domain:** Extending critic.js with Full Story methodology checks + dual scoring
**Confidence:** HIGH

## Summary

Phase 15 extends the existing quality system (critic.js) with 33 methodology checks across 6 Full Story section types. The existing infrastructure is well-suited for this extension -- `METHODOLOGY_CHECKS` is a keyed map of check arrays, `runMethodologyChecks()` handles weighted scoring, and `scoreMethodology()` dispatches by section key. Adding Full Story sections requires: (1) new entries in `METHODOLOGY_CHECKS` for 6 keys, (2) a completeness weight adjustment for checklist and debate section types, (3) a helper for parsing polymorphic checklist data, (4) non-standard verdict mapping (CONTEXT/WATCHLIST -> PARTIAL), and (5) a quality formatter update for Full Story section labels.

The implementation is straightforward because the architecture was designed for extensibility. The `METHODOLOGY_CHECKS` map accepts new keys without modifying existing code paths. The `runMethodologyChecks()` function is generic -- it scores any check array against any section. The `validateSection()` entry point already calls `scoreMethodology()` and returns the dual-score structure. No new abstractions are needed.

**Primary recommendation:** Add 6 section keys to `METHODOLOGY_CHECKS` with 33 total checks (19 CRITICAL, 14 supplementary), adjust `scoreCompleteness()` weights per section type, add a checklist data parser with polymorphic field fallbacks, and extend the test suite. The SFM Full Story output provides complete test fixtures for all 6 sections.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Structural checks on `data` field feed mechanical score; content quality checks on `narrative` feed methodology score. Two-score separation preserved.
- D-02: Checklist items are polymorphic -- Meaning uses `{id, question, verdict, confidence, evidence}`, Moat/Management use `{number, item, verdict, evidence, confidence}`. Critic must handle both with defensive fallback chains.
- D-03: Completeness weights adjusted per section type: checklist sections swap data population to 40% and narrative depth to 15%; debate section keeps narrative depth at 25%; standard sections keep current weights.
- D-04: Debate quality measured by process rigor, not outcome. Honest "5 unresolved risks" scores higher than rubber-stamp "0 unresolved" with thin evidence.
- D-05: Debate checks operate on both `data` field (debateStructure counts, judgeOverallVerdict) AND `narrative` (exchange patterns, citation URLs).
- D-06: Non-standard verdicts CONTEXT/WATCHLIST mapped to PARTIAL for scoring. Flagged as low-severity informational issues.
- D-07: No Full Story sections need exemption -- all 6 have checks defined.
- D-08: Same >= 50 passing threshold as Pitch Deck. No cross-stage threshold differences.
- Methodology checks are the full 33-check inventory specified in CONTEXT.md (5+5+6+6+5+6 across S1-S6).
- Carrying forward from prior phases: regex on narrative (D-02 Phase 11), critical 2x / supplementary 1x weighting (D-04 Phase 11), per-section scoring (D-04 Phase 11), `_testExports` pattern (Phase 05D), quality report structure `{ score, issues, passed, methodology }` (Phase 05D).

### Claude's Discretion
- Exact regex patterns for each methodology check test function
- How to parse polymorphic checklist data (fallback chains for field names)
- Whether to create a helper function for checklist data extraction or inline it
- How to detect bull/bear/rebuttal counts from narrative text when data field lacks exchange-level detail
- Test strategy: extend existing critic.test.js or create separate test file
- qualityFormatter.js updates to render Full Story section types correctly

### Deferred Ideas (OUT OF SCOPE)
- AI evaluator agent (~$2-3 per eval) -- deferred from Phase 11
- Cross-stage inheritance checks (Full Story FGR matches Pitch Deck) -- Phase 17
- Quality dashboard in UI -- deferred from Phase 05D
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUAL-01 | critic.js includes Full Story methodology checks derived from story-form-I.md and story-form-II.md | 33 checks defined in CONTEXT.md, mapped to curriculum sections. METHODOLOGY_CHECKS map accepts new keys directly. Regex patterns derived from curriculum language. |
| QUAL-03 | Full Story sections produce dual quality scores (mechanical + methodology) matching Pitch Deck scoring pattern | Existing `validateSection()` already returns `{ score, methodology: { score, checks, passed } }`. Adding keys to METHODOLOGY_CHECKS is sufficient -- no structural changes to the scoring pipeline. Completeness weight adjustment for checklist/debate sections is the only mechanical score modification. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.0 | Test runner for critic.js unit tests | Already in use (83 existing tests passing), project standard |

### Supporting
No new libraries needed. This phase modifies existing files only.

**Installation:** None required -- all dependencies already installed.

## Architecture Patterns

### Existing Architecture (Extend, Don't Replace)

The critic.js file has a clean, well-documented architecture at 1128 lines:

```
critic.js
├── Constants (REQUIRED_FIELDS, QUALITY_WEIGHTS, CANONICAL_CITATION_FIELDS)
├── Citation Classification (classifyCitation)
├── DataPacket Path Resolution (resolveDataPath)
├── Citation Validation (validateCitations)
├── Completeness Scoring (scoreCompleteness)
├── Confidence Validation (validateConfidence)
├── Multi-Source Verification (checkMultiSource)
├── Red Flag Quality (validateRedFlags)
├── Data Gap Detection (detectDataGaps)
├── Search Compliance (checkSearchCompliance)
├── Methodology Scoring
│   ├── EXEMPT_METHODOLOGY_KEYS (constant)
│   ├── isExemptSection()
│   ├── METHODOLOGY_CHECKS (map: section_key -> check_array)
│   ├── scoreMethodology() (dispatch by section key)
│   └── runMethodologyChecks() (generic scorer)
├── Overall Score Computation (computeOverallScore)
├── Main Entry Points (validateSection, validateStage)
└── _testExports
```

### Pattern 1: Adding Section Keys to METHODOLOGY_CHECKS

**What:** Each Full Story section type gets its own key in the `METHODOLOGY_CHECKS` map with an array of `{id, label, critical, test}` objects.

**Existing pattern (Pitch Deck):**
```javascript
const METHODOLOGY_CHECKS = {
  company_info: [
    { id: 'radar-event', label: 'Event analysis present', critical: true,
      test: (s) => /event|price\s*drop|catalyst/i.test(s.narrative || '') },
    // ...
  ],
  // ... more sections
};
```

**Full Story extension (same pattern):**
```javascript
// Add to METHODOLOGY_CHECKS:
event_analysis: [
  { id: 'event-root-cause', label: 'Root cause identified', critical: true,
    test: (s) => /root\s*cause|caused\s*(the|by|a)|what\s*caused|trigger/i.test(s.narrative || '') },
  // ... 4 more checks
],
meaning_checklist: [
  { id: 'meaning-item-count', label: 'All 15 items present', critical: true,
    test: (s) => { /* parse data, count items */ } },
  // ... 4 more checks
],
// ... 4 more section keys
```

**Key insight:** `scoreMethodology()` already handles unknown keys by returning score 100 with empty checks. Adding new keys makes them recognized, and the generic `runMethodologyChecks()` handles all scoring. Zero changes to `validateSection()` or `validateStage()`.

### Pattern 2: Checklist Data Parsing with Polymorphic Fallback

**What:** A helper function that extracts checklist items from the `data` field, handling both naming conventions and string vs object data types.

**Why needed:** The `data` field may be a JSON string (Meaning) or already parsed (other sections). Meaning uses `{id, question, verdict, confidence, evidence}`, Moat/Management use `{number, item, verdict, evidence, confidence}`.

```javascript
function parseChecklistData(section) {
  let data = section.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return { items: [], summary: null }; }
  }
  if (!data || typeof data !== 'object') return { items: [], summary: null };

  const items = Array.isArray(data.items) ? data.items : [];
  return {
    items: items.map(item => ({
      id: item.id || item.number,
      question: item.question || item.item,
      verdict: normalizeVerdict(item.verdict),
      rawVerdict: item.verdict,
      evidence: item.evidence || '',
      confidence: item.confidence || null,
    })),
    summary: data.summary || null,
  };
}

function normalizeVerdict(verdict) {
  if (!verdict) return null;
  const v = verdict.toUpperCase();
  if (v === 'CONTEXT' || v === 'WATCHLIST') return 'PARTIAL';
  return v; // PASS, FAIL, PARTIAL unchanged
}
```

### Pattern 3: Debate Data Parsing

**What:** Extracts debate structure from `data` field (structured counts) and falls back to narrative parsing when data is incomplete.

**Real data structure from SFM S6:**
```javascript
// data field (parsed from JSON string):
{
  debateStructure: {
    totalExchanges: 9,
    strongBull: 1,
    strongBear: 2,
    unresolved: 5,
    mixed: 0,
    lean: 1
  },
  judgeOverallVerdict: {
    direction: "Mixed",
    unresolvedCount: 5,
    investmentImplication: "..."
  },
  priorSectionVerdicts: { ... }
}
```

**Fallback narrative parsing (when data field is missing or incomplete):**
```javascript
function countBullPoints(narrative) {
  // Bull thesis points typically numbered or bulleted
  const bullPatterns = /bull\s*(thesis|point|argument|case)|strength|advantage|opportunity/gi;
  return (narrative.match(bullPatterns) || []).length;
}

function hasBearCitations(section) {
  const citations = section.citations || [];
  // Real URLs (not just DataPacket references)
  return citations.some(c => c.url && /^https?:\/\//.test(c.url || c.source || ''));
}
```

### Pattern 4: Completeness Weight Adjustment

**What:** Section-type-aware weight modification in `scoreCompleteness()`.

**Current (fixed weights):**
```javascript
const QUALITY_WEIGHTS = {
  requiredFields: 40,
  narrativeDepth: 25,
  citationDensity: 20,
  dataPopulation: 15,
};
```

**Needed (conditional adjustment):**
```javascript
function getWeightsForSection(sectionKey) {
  // Checklist sections: data population is primary content
  if (['meaning_checklist', 'moat_checklist', 'management_checklist'].includes(sectionKey)) {
    return { requiredFields: 40, narrativeDepth: 15, citationDensity: 20, dataPopulation: 25 };
    // Swapped narrativeDepth (25->15) and dataPopulation (15->25) per D-03
    // Note: D-03 says data 40%, narrative 15% -- but requiredFields is already 40.
    // The intent is to increase dataPopulation weight at expense of narrativeDepth.
    // Exact split: requiredFields 25, narrativeDepth 15, citationDensity 20, dataPopulation 40
  }
  // Debate and standard sections: keep current weights
  return QUALITY_WEIGHTS;
}
```

**Important clarification on D-03:** The CONTEXT says checklist sections should have "data population 40%, narrative depth 15% (swapped from default)." Current default is `dataPopulation: 15, narrativeDepth: 25`. The "swap" means data goes to 40 and narrative goes to 15. But that changes the total from 100 to 115 (40+15+20+40=115). The correct interpretation: `requiredFields: 25, narrativeDepth: 15, citationDensity: 20, dataPopulation: 40` (total 100). The 25+15 swap is between narrativeDepth and dataPopulation; requiredFields adjusts down to keep total at 100. Alternatively, the simplest interpretation is that ONLY narrativeDepth and dataPopulation swap values (25<->15 becomes 15<->25). The implementer should confirm. The safest reading: swap just those two weights (narrativeDepth: 15, dataPopulation: 25, rest unchanged).

### Anti-Patterns to Avoid
- **Modifying `runMethodologyChecks()`**: It is generic and correct. Do not add Full-Story-specific logic here.
- **Modifying `validateSection()` or `validateStage()`**: The pipeline is correct. Changes should be in `METHODOLOGY_CHECKS`, `scoreCompleteness()`, and helpers only.
- **Hardcoding item counts**: Use the checklist data parser to count items dynamically, not hardcoded 15/15/13 expectations. The test function should check `items.length >= expectedCount`, not `=== expectedCount`.
- **Parsing narrative for checklist data**: Checklist methodology checks should parse `section.data` (the structured field), not the narrative. Narrative is for content quality checks (methodology terms).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Weighted scoring | Custom scoring formula | `runMethodologyChecks()` | Already handles critical 2x / supplementary 1x weighting |
| Check registration | Custom dispatch | `METHODOLOGY_CHECKS` map | Adding a key auto-registers with `scoreMethodology()` |
| Score aggregation | Custom stage scoring | `validateStage()` | Already averages section methodology scores |
| Verdict normalization | Inline mapping | Shared `normalizeVerdict()` helper | Used by multiple checklist check functions |
| Data field parsing | Per-check JSON.parse | Shared `parseChecklistData()` helper | Data may be string or object; both naming conventions |

## Common Pitfalls

### Pitfall 1: Data Field Is a JSON String
**What goes wrong:** Checklist `data` field is a JSON string in real output (Meaning section), not a parsed object. Accessing `data.items` directly returns `undefined`.
**Why it happens:** Some agents return `data` as a stringified JSON object. The existing `scoreCompleteness()` already handles this with `typeof dataObj === 'string' ? JSON.parse(dataObj) : ...`.
**How to avoid:** Always parse `data` defensively in checklist/debate check functions. Use the shared `parseChecklistData()` helper.
**Warning signs:** Tests pass with fixture objects but fail on real SFM data.

### Pitfall 2: Polymorphic Checklist Field Names
**What goes wrong:** Check function accesses `item.question` but Moat/Management items use `item.item`. Gets `undefined`, check fails incorrectly.
**Why it happens:** Different agents produce different field names for the same concept. Meaning agent uses `{id, question}`, Moat/Management agents use `{number, item}`.
**How to avoid:** Use fallback chains: `item.question || item.item` for question text, `item.id || item.number` for identifier.
**Warning signs:** Meaning checklist passes all checks but Moat/Management checklist fails item-count or evidence checks.

### Pitfall 3: Non-Standard Verdicts Break Counting
**What goes wrong:** Counting verdicts with `item.verdict === 'PASS'` misses items with CONTEXT or WATCHLIST verdicts. Item count appears lower than actual.
**Why it happens:** Management checklist items have CONTEXT and WATCHLIST verdicts (real SFM data). These are valid verdicts that should be counted as items present.
**How to avoid:** Normalize verdicts to PASS/FAIL/PARTIAL before counting. Map CONTEXT/WATCHLIST to PARTIAL per D-06.
**Warning signs:** Management checklist reports only 9/13 items with verdicts when all 13 actually have them.

### Pitfall 4: Debate Section Narrative Length Mismatch
**What goes wrong:** Narrative depth score is artificially high for debate sections because the narrative is 35K+ characters (SFM S6). The `scoreCompleteness()` formula caps at 100 very quickly for long narratives, which is correct behavior but not informative.
**Why it happens:** Debate narratives are 10-20x longer than typical sections. The 500-character denominator in `(narrative.length / 500) * 50` makes every debate section score 100% on narrative depth trivially.
**How to avoid:** This is fine -- the completeness score formula was designed to reward content presence, not penalize length. For debates, the methodology score (process rigor checks) is the discriminating quality measure, not completeness.

### Pitfall 5: Citations Array Format Varies
**What goes wrong:** S2 (Meaning) has citations as an array of plain strings (`"[1] SFM FY2025 earnings..."`) while S3 (Moat) has citations as array of objects (`{id, ref, text, source}`). Check functions that assume object format break on string citations.
**Why it happens:** Different agents format citations differently. The existing `classifyCitation()` handles both formats.
**How to avoid:** For debate citation checks (D-05: "Web citations present -- not just DataPacket -- real URLs"), check both `citation.url` and `citation.source` fields, and handle string citations by checking for `https://` pattern in the string itself.
**Warning signs:** Bear citations check fails even though the debate has 35 web-sourced citations.

### Pitfall 6: METHODOLOGY_CHECKS Key Must Match Section Key Exactly
**What goes wrong:** Adding a check under key `inversion_rebuttal` but section output has key `inversion_rebuttal` -- no issue. But if the key is `debate` or `inversion`, it won't match.
**Why it happens:** Section keys in output are: `event_analysis`, `meaning_checklist`, `moat_checklist`, `management_checklist`, `valuation_confirmation`, `inversion_rebuttal`. Must match exactly.
**How to avoid:** Verify against real SFM section output keys (documented in CONTEXT.md canonical refs).

## Code Examples

### Example 1: Checklist Item Count Check (Real Pattern)
```javascript
// Source: Derived from SFM S2 meaning_checklist.json data field
{
  id: 'meaning-item-count',
  label: 'All 15 items present in data',
  critical: true,
  test: (s) => {
    const { items } = parseChecklistData(s);
    return items.length >= 15;
  },
},
```

### Example 2: Verdict Presence Check with Normalization
```javascript
// Source: Derived from SFM S4 management_checklist.json (has CONTEXT, WATCHLIST verdicts)
{
  id: 'mgmt-all-verdicts',
  label: 'Every item has a verdict',
  critical: true,
  test: (s) => {
    const { items } = parseChecklistData(s);
    if (items.length === 0) return false;
    return items.every(item => item.verdict != null && item.verdict !== '');
  },
},
```

### Example 3: Debate Structure Check (Data + Narrative Fallback)
```javascript
// Source: Derived from SFM S6 inversion_rebuttal.json data field
{
  id: 'debate-bear-coverage',
  label: 'Bear inversion count >= bull point count',
  critical: true,
  test: (s) => {
    const data = parseDebateData(s);
    if (data && data.debateStructure) {
      // Structured data available: totalExchanges >= 5 (each exchange IS a bear inversion)
      return data.debateStructure.totalExchanges >= 5;
    }
    // Fallback: count inversion/bear patterns in narrative
    const narrative = s.narrative || '';
    const bearPatterns = narrative.match(/bear\s*(inversion|point|argument|case)|invert|counter.?argument/gi);
    return (bearPatterns || []).length >= 5;
  },
},
```

### Example 4: Evidence Quality Check (Evidence String Length)
```javascript
// Source: D-03 specifies evidence string > 10 chars
{
  id: 'moat-evidence-present',
  label: 'Every item has evidence string > 10 chars',
  critical: true,
  test: (s) => {
    const { items } = parseChecklistData(s);
    if (items.length === 0) return false;
    return items.every(item => (item.evidence || '').length > 10);
  },
},
```

### Example 5: Completeness Weight Adjustment
```javascript
// Source: D-03 -- checklist sections swap data/narrative weights
function scoreCompleteness(section) {
  // Determine weights based on section type
  const key = section.key || '';
  const isChecklist = ['meaning_checklist', 'moat_checklist', 'management_checklist'].includes(key);
  const weights = isChecklist
    ? { requiredFields: 40, narrativeDepth: 15, citationDensity: 20, dataPopulation: 25 }
    : QUALITY_WEIGHTS;

  // ... rest of existing scoring logic using `weights` instead of `QUALITY_WEIGHTS`
}
```

### Example 6: Non-Standard Verdict Issue Flagging
```javascript
// Source: D-06 -- flag non-standard verdicts as informational
function flagNonStandardVerdicts(items) {
  const issues = [];
  for (const item of items) {
    if (item.rawVerdict && !['PASS', 'FAIL', 'PARTIAL'].includes(item.rawVerdict.toUpperCase())) {
      issues.push({
        type: 'methodology',
        severity: 'low',
        message: `Non-standard verdict "${item.rawVerdict}" on item ${item.id} -- mapped to PARTIAL`,
        field: `data.items[${item.id}]`,
      });
    }
  }
  return issues;
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | vite.config.js (vitest section) |
| Quick run command | `npx vitest run src/engines/__tests__/critic.test.js` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-01 | 33 methodology checks return correct pass/fail for Full Story sections | unit | `npx vitest run src/engines/__tests__/critic.test.js -x` | Exists (extend) |
| QUAL-01 | Checklist parsing handles polymorphic field names | unit | `npx vitest run src/engines/__tests__/critic.test.js -x` | Exists (extend) |
| QUAL-01 | Non-standard verdicts (CONTEXT/WATCHLIST) mapped correctly | unit | `npx vitest run src/engines/__tests__/critic.test.js -x` | Exists (extend) |
| QUAL-03 | Dual scores produced for all 6 Full Story sections | unit | `npx vitest run src/engines/__tests__/critic.test.js -x` | Exists (extend) |
| QUAL-03 | Completeness weights adjusted for checklist section type | unit | `npx vitest run src/engines/__tests__/critic.test.js -x` | Exists (extend) |
| QUAL-03 | Debate section methodology checks pass on SFM data | unit | `npx vitest run src/engines/__tests__/critic.test.js -x` | Exists (extend) |
| QUAL-03 | Full Story validateStage produces overallMethodologyScore | unit | `npx vitest run src/engines/__tests__/critic.test.js -x` | Exists (extend) |
| E2E | run-quality script produces valid output for SFM Full Story | smoke | `node --loader ./scripts/node-esm-loader.js scripts/run-quality-v4.js SFM` | Manual adaptation needed |

### Sampling Rate
- **Per task commit:** `npx vitest run src/engines/__tests__/critic.test.js -x`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Full Story section fixtures needed in `src/engines/__tests__/fixtures/` -- extract from SFM real output (6 section files exist at `.thes1s/reports/SFM/sections/fullStory-S*.json`)
- [ ] Test describe blocks for each Full Story section type (event_analysis, meaning_checklist, moat_checklist, management_checklist, valuation_confirmation, inversion_rebuttal)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mechanical-only scoring | Dual scoring (mechanical + methodology) | Phase 11 (v1.1) | Methodology score catches curriculum compliance gaps |
| Fixed completeness weights | Section-type-aware weights | Phase 15 (this phase) | Checklist sections properly weighted toward data, not narrative |
| Pitch Deck only | Pitch Deck + Full Story | Phase 15 (this phase) | Cross-stage quality comparison enabled |

## Open Questions

1. **Completeness weight interpretation for D-03**
   - What we know: D-03 says "data population 40%, narrative depth 15% (swapped from default)" for checklist sections. Default is requiredFields 40, narrative 25, citations 20, data 15.
   - What's unclear: If data goes to 40% and narrative to 15%, and requiredFields stays at 40%, the total is 115%. Either requiredFields must drop to 25%, or "40%" means swapping data and narrative (15<->25).
   - Recommendation: Simplest interpretation -- swap just narrativeDepth and dataPopulation values (25<->15 becomes 15<->25). Total stays 100. This matches the intent ("the value of a checklist section is in its structured data field").

2. **run-quality-v4.js Full Story support**
   - What we know: The script currently reads `pipeline-output.json` which contains Pitch Deck sections. Full Story sections are in `fullStory-S*.json` files or `full-story.json`.
   - What's unclear: Whether the script should support `--stage fullStory` flag or auto-detect stage.
   - Recommendation: Add Full Story support to the script (read section files from `.thes1s/reports/{ticker}/sections/fullStory-S*.json` or `full-story.json` depending on which exists). This is Claude's Discretion and low-complexity.

3. **qualityFormatter.js section labels**
   - What we know: `SECTION_LABELS` map has Pitch Deck labels only. Full Story keys fall through to the `labelFor()` fallback (title-case from snake_case), which produces reasonable labels ("Event Analysis", "Meaning Checklist", etc.).
   - What's unclear: Whether custom labels are needed or the fallback is adequate.
   - Recommendation: Add explicit labels for all 6 Full Story section keys for consistency: `event_analysis: 'Event Analysis'`, `meaning_checklist: 'Meaning Checklist (15pt)'`, `moat_checklist: 'Moat Checklist (15pt)'`, `management_checklist: 'Management Checklist (13pt)'`, `valuation_confirmation: 'Valuation Confirmation'`, `inversion_rebuttal: 'Inversion & Rebuttal (Debate)'`.

## Sources

### Primary (HIGH confidence)
- `src/engines/critic.js` (1128 lines) -- Full source reviewed, architecture understood
- `src/engines/__tests__/critic.test.js` (83 passing tests) -- Test patterns and fixtures reviewed
- `src/engines/qualityFormatter.js` (212 lines) -- Full source reviewed
- `scripts/run-quality-v4.js` (60 lines) -- Full source reviewed
- `.thes1s/reports/SFM/sections/fullStory-S1-event_analysis.json` -- Real output: standard narrative section
- `.thes1s/reports/SFM/sections/fullStory-S2-meaning_checklist.json` -- Real output: checklist with `{id, question, verdict}` format, `data` is JSON string
- `.thes1s/reports/SFM/sections/fullStory-S3-moat_checklist.json` -- Real output: checklist with `{number, item, verdict}` format, `data` is JSON string
- `.thes1s/reports/SFM/sections/fullStory-S4-management_checklist.json` -- Real output: checklist with CONTEXT/WATCHLIST verdicts, `data` is JSON string
- `.thes1s/reports/SFM/sections/fullStory-S5-valuation_confirmation.json` -- Real output: standard narrative section
- `.thes1s/reports/SFM/sections/fullStory-S6-inversion_rebuttal.json` -- Real output: debate with debateStructure in data, 35K narrative, 35 citations
- `knowledge/stage-3-full-story/story-form-I.md` -- Curriculum for S1-S4 methodology checks
- `knowledge/stage-3-full-story/story-form-II.md` -- Curriculum for S5-S6 methodology checks
- `.planning/phases/15-quality-system/15-CONTEXT.md` -- User decisions (33 checks, weights, thresholds)
- `.planning/phases/11-validation/11-CONTEXT.md` -- Prior methodology scoring decisions
- `.planning/phases/05D-quality-system/05D-CONTEXT.md` -- Original quality system design

### Secondary (MEDIUM confidence)
- None needed -- all information sourced from project files.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, extending existing well-understood code
- Architecture: HIGH -- all patterns established by Phase 11 Pitch Deck methodology scoring, direct extension
- Pitfalls: HIGH -- all 6 pitfalls identified from real SFM output analysis, not hypothetical

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- no external dependencies, internal code only)
