# Pitch Deck Redesign Implementation Plan

> **For agentic workers:** This plan implements the locked spec at [docs/specs/2026-05-09-pitch-deck-redesign.md](../specs/2026-05-09-pitch-deck-redesign.md). Read the spec first — it is the authoritative requirements doc. This plan turns those requirements into ordered, atomic tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the Stage 2 Pitch Deck pipeline so the document presents 7 top-level sections with new CFA-aligned names, drops Tier-1 R1 vocabulary, scrubs three residual R1-trademark schema fields (`ruleOneMethod`, `ceo.bag`, `stickerPrice*`), drops the 15-point Moat Checklist, adds a verdict-box artifact pattern across all sections, adds a §4d Accounting Red-Flag scan and an Investment Verdict closing Pre-Decision Quality Check, and adds a Klarman permanent-vs-temporary loss overlay to §7 Risk Profile — without changing the 8-agent topology, the 5-wave dispatch, the PSR pre-pass, the FGR PM-confirmation gate, the dual Owner Earnings, or the four valuation calculators (MOS / Payback Time / Ten Cap / Equity Bond).

**Architecture:** Document-only consolidation. The pipeline still emits 12 section objects (8 agents — financial-analyst now produces 4 sections instead of 3 — plus 1 synthesis verdict). Section keys, file paths, and verdict-box payloads change. The renderer (PDF/DOCX/UI) groups the 12 emitted sections under 7 top-level headings + Investment Verdict. A new `scripts/lint-vocab.mjs` regression net catches R1 phrase recurrence in agent prompts and the orchestrator.

**Tech Stack:** Markdown (agent prompts + skill), Zod (schema), Node ESM (orchestrator + lint), Vitest (tests), React/JSX (UI), Python (PDF/DOCX renderers).

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `scripts/lint-vocab.mjs` | Regression net — fails if Tier-1 R1 phrases or scrubbed schema fields appear in pitch-deck files |
| Create | `scripts/__tests__/lint-vocab.test.js` | Unit test for the lint script logic |
| Modify | `package.json` | Add `lint:vocab` script |
| Modify | `src/schemas/reportSection.js` | Add new section keys to enum, keep old keys for one release as deprecated |
| Modify | `src/schemas/__tests__/reportSection.test.js` | Test that new keys validate, old keys also still validate during migration |
| Modify | `agents/business-analyst-pitchdeck/prompt.md` | Section renames (`radar` → `setup`, `simple_predictable` → `business_quality`), Tier-1 vocab scrub, verdict-box format |
| Modify | `agents/competitor-evaluator-market-position-pitchdeck/prompt.md` | Section title rename ("Dominant Market Position" → "Market Position"), Tier-1 vocab scrub, verdict-box format |
| Modify | `agents/competitor-evaluator-moats-pitchdeck/prompt.md` | Key rename `barriers_moats` → `moat_analysis`, drop 15-pt Moat Checklist, Tier-1 vocab scrub, Width/Trend verdict-box format |
| Modify | `agents/financial-analyst-pitchdeck/prompt.md` | 3 key renames + 1 new section (accounting_red_flags), schema rename `ruleOneMethod` → `buffettMethod`, Tier-1 vocab scrub, 4 verdict-box formats |
| Modify | `agents/management-evaluator-pitchdeck/prompt.md` | Key rename `management` → `management_capital_allocation`, schema rename `ceo.bag` → `ceo.strategicVision`, drop "Three Ms" / "BAG" / "Wonderful Company" / "Six-Inch Bar" / "Rulers" framing, verdict-box format |
| Modify | `agents/risk-analyst-pitchdeck/prompt.md` | Key rename `pest` → `risk_profile`, section title rename, add Klarman `lossType` per-risk overlay, Tier-1 vocab scrub, verdict-box format |
| Modify | `agents/valuation-specialist-pitchdeck/prompt.md` | Schema rename `stickerPrice*` → `fairValue*` throughout, Tier-1 vocab scrub, verdict-box format. NO Mauboussin reverse-DCF (FT-only). |
| Modify | `agents/synthesis-writer-pitchdeck/prompt.md` | Key rename `overall_verdict` → `investment_verdict`, title rename, add Pre-Decision Quality Check closing block (Calibrated Confidence + Anticipated Regret), Tier-1 vocab scrub |
| Modify | `.claude/skills/generate-pitch-deck/SKILL.md` | Agent registry section keys, wave map (FA → 4 sections), file path updates, Step 12 assembly section keys, Step 14.4 contract (11 → 12), Step 14 budget agentMap, Tier-1 vocab scrub in skill prose |
| Modify | `scripts/pdf/generate_pitch_deck_pdf.py` | 7-top-level grouping render, verdict-box visual element, drop 15-pt checklist render, §4d render, Investment Verdict close render, Sticker→Fair Value labels |
| Modify | `scripts/pdf/docx_helpers.py` (and any DOCX-specific renderer) | Same render changes for DOCX |
| Modify | `src/components/PitchDeck.jsx` | KEY_NORMALIZATION new keys, 7-top-level grouping, verdict-box render, drop 15-pt checklist render |
| Modify | `src/components/Toolbox.jsx` | Sticker→Fair Value in valuation tab labels and variable names |
| Modify | `src/components/CompanyHeader.jsx` | Verify no `Sticker` ScoreBadge usage |
| Modify | `src/components/FinalThesis.jsx` (or `FullStory.jsx` if not yet renamed) | Add new keys to its `KEY_NORMALIZATION` map (consolidation pass) |
| Create | `src/utils/keyNormalization.js` | Single-source-of-truth `KEY_NORMALIZATION` consolidated from `PitchDeck.jsx` + `FinalThesis.jsx` |
| Modify | `src/hooks/usePitchDeck.js` | Verify IS_DEV gate on dev-only Vite middleware paths (existing watchout) |
| Modify | `W2-PUNCHLIST.md` | Resolve `[POD-VAL]` and `[POD-FS]` (Stage 2 portion) tags now that this spec is locked |
| Modify | Any test fixture file with old section keys | Update to new keys |

---

## Phase 1 — Foundation

Set up the regression net, schema migration, and contract update. These tasks must land before any agent prompt edits — once landed they keep the rest of the work honest.

### Task 1: Vocabulary lint script

**Files:**
- Create: `scripts/lint-vocab.mjs`
- Create: `scripts/__tests__/lint-vocab.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the unit test for the lint logic**

Create `scripts/__tests__/lint-vocab.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { scanFileForBannedPhrases } from '../lint-vocab.mjs';

describe('lint-vocab', () => {
  const banned = [
    'Three Ms',
    'Wonderful Company',
    'Six-Inch Bar',
    'Big Audacious Goal',
    'BAG',
    'Sticker price',
    'ruleOneMethod',
  ];

  it('finds banned phrases in content', () => {
    const content = 'The Three Ms framework is great.';
    const violations = scanFileForBannedPhrases(content, banned, 'test.md');
    expect(violations).toHaveLength(1);
    expect(violations[0].phrase).toBe('Three Ms');
  });

  it('returns empty for clean content', () => {
    const content = 'No banned phrases here.';
    const violations = scanFileForBannedPhrases(content, banned, 'test.md');
    expect(violations).toEqual([]);
  });

  it('case-insensitive match', () => {
    const content = 'wonderful company is bad.';
    const violations = scanFileForBannedPhrases(content, banned, 'test.md');
    expect(violations).toHaveLength(1);
  });

  it('reports line numbers', () => {
    const content = 'line 1\nline 2 has Three Ms\nline 3';
    const violations = scanFileForBannedPhrases(content, banned, 'test.md');
    expect(violations[0].line).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/__tests__/lint-vocab.test.js`
Expected: FAIL — `scanFileForBannedPhrases is not defined` or module not found.

- [ ] **Step 3: Implement the lint script**

Create `scripts/lint-vocab.mjs`:

```js
#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const TIER_1_PHRASES = [
  'Three Ms',
  '3 Ms framework',
  'Wonderful Company',
  'Six-Inch Bar',
  'Six Inch Bar',
  'Big Audacious Goal',
  'BAG',
  'Rulers',
  'value investing Rulers',
];

const TIER_2_PHRASES = [
  'Sticker price',
  'sticker price',
];

const SCHEMA_FIELDS = [
  'ruleOneMethod',
  'stickerPriceLow',
  'stickerPriceHigh',
  'stickerPrice',
  'ceo.bag',
  '"bag":',
  '"bag" :',
];

const BANNED = [...TIER_1_PHRASES, ...TIER_2_PHRASES, ...SCHEMA_FIELDS];

const SCAN_GLOBS = [
  'agents/business-analyst-pitchdeck/prompt.md',
  'agents/competitor-evaluator-market-position-pitchdeck/prompt.md',
  'agents/competitor-evaluator-moats-pitchdeck/prompt.md',
  'agents/financial-analyst-pitchdeck/prompt.md',
  'agents/management-evaluator-pitchdeck/prompt.md',
  'agents/risk-analyst-pitchdeck/prompt.md',
  'agents/valuation-specialist-pitchdeck/prompt.md',
  'agents/synthesis-writer-pitchdeck/prompt.md',
  '.claude/skills/generate-pitch-deck/SKILL.md',
];

export function scanFileForBannedPhrases(content, banned, filePath) {
  const violations = [];
  const lines = content.split('\n');
  for (const phrase of banned) {
    const re = new RegExp(escapeRegex(phrase), 'gi');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        violations.push({ file: filePath, line: i + 1, phrase, snippet: lines[i].trim().slice(0, 120) });
      }
    }
  }
  return violations;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function main() {
  const allViolations = [];
  for (const rel of SCAN_GLOBS) {
    const abs = join(repoRoot, rel);
    try {
      const content = readFileSync(abs, 'utf8');
      allViolations.push(...scanFileForBannedPhrases(content, BANNED, rel));
    } catch (err) {
      console.warn(`[lint-vocab] could not read ${rel}: ${err.message}`);
    }
  }
  if (allViolations.length === 0) {
    console.log('[lint-vocab] OK — no banned phrases found.');
    return 0;
  }
  console.error(`[lint-vocab] FOUND ${allViolations.length} violations:`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}  "${v.phrase}"  — ${v.snippet}`);
  }
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
```

- [ ] **Step 4: Run the test to verify it now passes**

Run: `npx vitest run scripts/__tests__/lint-vocab.test.js`
Expected: PASS — all 4 cases.

- [ ] **Step 5: Add npm script and run the lint against the current repo**

Add to `package.json` `scripts` block:
```json
"lint:vocab": "node scripts/lint-vocab.mjs"
```

Run: `npm run lint:vocab`
Expected: FAIL with many violations across the 8 prompt files and SKILL.md. This is the regression net working — every subsequent task drives this count toward zero.

- [ ] **Step 6: Commit**

```bash
git add scripts/lint-vocab.mjs scripts/__tests__/lint-vocab.test.js package.json
git commit -m "test: add vocab-scrub regression net for pitch-deck redesign"
```

---

### Task 2: Update ReportSectionSchema enum

**Files:**
- Modify: `src/schemas/reportSection.js`
- Modify: `src/schemas/__tests__/reportSection.test.js`

- [ ] **Step 1: Read the existing schema to see the current enum**

Run: `grep -n "key" src/schemas/reportSection.js | head -30`
Look for the `z.enum([...])` or `key: z.string()` declaration. The current schema may already use a free-form string key (in which case no enum update is needed); if it uses an enum, the new keys need adding.

- [ ] **Step 2: Write the test for the new keys**

Add to `src/schemas/__tests__/reportSection.test.js` (appending to existing tests):

```js
import { describe, it, expect } from 'vitest';
import { ReportSectionSchema } from '../reportSection.js';

describe('ReportSectionSchema — pitch deck redesign keys', () => {
  const newKeys = [
    'setup',
    'business_quality',
    'market_position',
    'moat_analysis',
    'cash_generation',
    'returns_leverage',
    'balance_sheet',
    'accounting_red_flags',
    'management_capital_allocation',
    'valuation',
    'risk_profile',
    'investment_verdict',
  ];

  for (const key of newKeys) {
    it(`accepts new key "${key}"`, () => {
      const minimal = {
        key,
        title: 'Test',
        sectionNumber: 1,
        status: 'pass',
        confidence: 'HIGH',
        verdict: 'PASS',
        verdictRationale: 'test',
        summary: 'test',
        narrative: 'a'.repeat(250),
        citations: [{ id: 1, ref: 'test', text: 'test', source: 'test' }],
        redFlags: ['flag1', 'flag2'],
      };
      expect(() => ReportSectionSchema.parse(minimal)).not.toThrow();
    });
  }
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/schemas/__tests__/reportSection.test.js`
Expected: If the schema uses a free-form string key, tests PASS immediately (no enum to update). If the schema uses an enum, tests FAIL on at least the new keys (`setup`, `business_quality`, `moat_analysis`, `cash_generation`, `returns_leverage`, `accounting_red_flags`, `management_capital_allocation`, `risk_profile`, `investment_verdict`).

- [ ] **Step 4: Update the enum if needed**

Open `src/schemas/reportSection.js`. Find the `key` definition. If it's `z.enum([...])`, add the new keys alongside the existing ones (do NOT remove old keys yet — they're still emitted by the live pipeline until each agent prompt is updated):

```js
key: z.enum([
  // legacy pitch-deck keys (deprecated, removed once all agent prompts update)
  'radar',
  'simple_predictable',
  'market_position',
  'barriers_moats',
  'fcf',
  'roe_roic_debt',
  'balance_sheet',
  'management',
  'pest',
  'valuation',
  'overall_verdict',
  // new pitch-deck keys (this redesign)
  'setup',
  'business_quality',
  'moat_analysis',
  'cash_generation',
  'returns_leverage',
  'accounting_red_flags',
  'management_capital_allocation',
  'risk_profile',
  'investment_verdict',
  // ... preserve existing one-pager and final-thesis keys
]),
```

If the schema uses a free-form string, leave it alone — the test is then a forward-looking sanity check.

- [ ] **Step 5: Run the test again**

Run: `npx vitest run src/schemas/__tests__/reportSection.test.js`
Expected: PASS for all 12 new keys.

- [ ] **Step 6: Commit**

```bash
git add src/schemas/reportSection.js src/schemas/__tests__/reportSection.test.js
git commit -m "feat(schema): add pitch-deck redesign section keys to ReportSectionSchema"
```

---

### Task 3: Update SKILL.md section count contract

**Files:**
- Modify: `.claude/skills/generate-pitch-deck/SKILL.md` (Step 14.4 only — narrow change)

- [ ] **Step 1: Read the current contract check**

Open `.claude/skills/generate-pitch-deck/SKILL.md`, locate Step 14.4. The current check enforces 11 sections with `overall_verdict` as section 11.

- [ ] **Step 2: Replace the contract check**

Find the block:
```js
if (sections.length !== 11 || maxSectionNumber !== 11 || !sections.some(s => s.key === 'overall_verdict')) {
  console.error('CONTRACT VIOLATION: pitch deck must have 11 sections with overall_verdict as section 11');
  process.exit(1);
}
```

Replace with:
```js
if (sections.length !== 12 || maxSectionNumber !== 12 || !sections.some(s => s.key === 'investment_verdict')) {
  console.error('CONTRACT VIOLATION: pitch deck must have 12 sections with investment_verdict as section 12');
  process.exit(1);
}
```

- [ ] **Step 3: Do NOT commit yet**

The contract check now demands 12 sections + `investment_verdict`, but the agents still emit 11 sections + `overall_verdict`. Running the pipeline now would fail the contract. We commit Task 3 together with Task 4 (orchestrator updates) so the contract update lands atomically with the rest of the orchestrator changes that satisfy it.

Mark this step as held; it commits in Task 4 step 7.

---

## Phase 2 — Schema field renames

Three residual R1-trademark schema fields need renaming. Each is a small, atomic change.

### Task 4: Schema rename — `data.ownerEarnings.ruleOneMethod` → `buffettMethod`

**Files:**
- Modify: `agents/financial-analyst-pitchdeck/prompt.md` (output schema block + narrative)
- Modify: `.claude/skills/generate-pitch-deck/SKILL.md` (assembly references, if any)
- Modify: `scripts/pdf/generate_pitch_deck_pdf.py` (renderer reference)
- Modify: `src/components/PitchDeck.jsx` (UI render, if it consumes this field)

> Note: this rename is scoped to ONLY the field name. Adopting all the other §4a Cash Generation changes (verdict box, vocab scrub, section key rename `fcf` → `cash_generation`) lives in Task 9. This task isolates the field rename so it's reviewable on its own.

- [ ] **Step 1: Find all references**

Run from repo root:
```bash
grep -rn "ruleOneMethod" --include="*.md" --include="*.py" --include="*.js" --include="*.jsx" .
```

Record the file:line list. Expect hits in:
- `agents/financial-analyst-pitchdeck/prompt.md` (output schema block, narrative requirements)
- Possibly `scripts/pdf/generate_pitch_deck_pdf.py`
- Possibly `src/components/PitchDeck.jsx`

- [ ] **Step 2: Replace in each file**

For each file found in step 1, replace `ruleOneMethod` with `buffettMethod` (case-sensitive). In Markdown prose around the field, change "value investing Method (Buffett's Formula)" to "Buffett Method" if present.

- [ ] **Step 3: Run the lint**

Run: `npm run lint:vocab`
Expected: violation count for `ruleOneMethod` should be zero (other Tier-1 phrases still flagged).

- [ ] **Step 4: Run vitest**

Run: `npm test`
Expected: existing tests pass. Any test fixture using the old `ruleOneMethod` key would fail — fix the fixture inline.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(schema): rename ownerEarnings.ruleOneMethod to buffettMethod"
```

---

### Task 5: Schema rename — `data.ceo.bag` → `data.ceo.strategicVision`

**Files:**
- Modify: `agents/management-evaluator-pitchdeck/prompt.md` (output schema block + narrative)
- Modify: `scripts/pdf/generate_pitch_deck_pdf.py` (if it renders this field)
- Modify: `src/components/PitchDeck.jsx` (if it renders this field)

- [ ] **Step 1: Find all references**

```bash
grep -rn '"bag"\|ceo\.bag\|\.bag\b' --include="*.md" --include="*.py" --include="*.js" --include="*.jsx" agents/ scripts/ src/
```

Be careful: `bag` is a short string and can match accidentally. Inspect each hit to confirm it refers to the CEO field.

- [ ] **Step 2: Replace in each file**

For each confirmed hit, replace `bag` with `strategicVision` and update any prose around it ("Big Audacious Goal" → "long-term strategic vision"). The "BAG" acronym should also disappear.

- [ ] **Step 3: Run the lint**

Run: `npm run lint:vocab`
Expected: `BAG`, `Big Audacious Goal`, and the `"bag":` schema-field entries all show zero violations.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(schema): rename ceo.bag to ceo.strategicVision"
```

---

### Task 6: Schema rename — `stickerPrice*` → `fairValue*`

**Files:**
- Modify: `agents/valuation-specialist-pitchdeck/prompt.md`
- Modify: `.claude/skills/generate-pitch-deck/SKILL.md` (sensitivity table headers, FGR derivation references, assembly block)
- Modify: `scripts/pdf/generate_pitch_deck_pdf.py`
- Modify: `src/components/Toolbox.jsx` (valuation tab labels and variable names — heaviest hit)
- Modify: `src/components/PitchDeck.jsx` (if it references these fields)
- Possibly: `src/engines/*.js` (if any valuation engine surfaces sticker price)

- [ ] **Step 1: Find all references**

```bash
grep -rn "[Ss]ticker[Pp]rice\|[Ss]ticker [Pp]rice\|sticker_price" --include="*.md" --include="*.py" --include="*.js" --include="*.jsx" .
```

Record full file:line list. There will be many — sticker price is referenced throughout the valuation toolchain.

- [ ] **Step 2: Replace systematically**

For each file:
- Schema field names: `stickerPriceLow` → `fairValueLow`, `stickerPriceHigh` → `fairValueHigh`, `stickerPrice` → `fairValue`
- User-facing labels: "Sticker Price" → "Fair Value", "sticker price" → "fair value"
- Variable names: `stickerPrice` → `fairValue` (camelCase preserved)

In agent prompt prose, replace phrasings like "Sticker price = the at-value price. Buy price = ~50% below sticker." with "Fair Value = the at-value price. Buy price = ~50% below Fair Value."

- [ ] **Step 3: Run the lint**

Run: `npm run lint:vocab`
Expected: zero violations for `Sticker price` and the `stickerPrice*` schema fields.

- [ ] **Step 4: Run vitest**

Run: `npm test`
Expected: PASS. If any UI component test snapshot includes "Sticker Price" copy, update the snapshot.

- [ ] **Step 5: Smoke check the dev server**

Run: `npm run dev` in one terminal. Navigate to the Toolbox valuation tab. Confirm the labels read "Fair Value" everywhere and no `undefined` values render where `stickerPrice*` used to be sourced from.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(schema): rename stickerPrice* to fairValue* across pitch-deck pipeline"
```

---

## Phase 3 — Agent prompt updates

Each agent prompt gets one task. Each task follows the same shape: edit the prompt, run the lint, sanity-check the file diff, commit.

### Task 7: Update business-analyst-pitchdeck prompt

**Files:**
- Modify: `agents/business-analyst-pitchdeck/prompt.md`

**Changes:**
- Section 1 key `radar` → `setup`, title "Radar" → "Setup & Situation"
- Section 2 key `simple_predictable` → `business_quality`, title "Simple & Predictable" → "Business Quality"
- Drop Tier-1 vocab: "Three Ms," "Wonderful Company" 4-test, "Six-Inch Bar," "Rulers," "load up the truck," "Big Audacious Goal / BAG"
- Drop the "Cross-Cutting Context: Meaning & Moat Frameworks" 15-point Meaning Checklist subsection (Stage 3 has its own redesign — this Stage 3 forward-reference is no longer load-bearing)
- Add verdict-box format requirement at the end of each section's narrative
- Update output schema example to reflect new keys

- [ ] **Step 1: Update Section 1 framing**

Open `agents/business-analyst-pitchdeck/prompt.md`. Replace:
- All occurrences of `radar` (as section key) with `setup`
- All occurrences of "Radar" (as section title) with "Setup & Situation"
- Drop all "Rulers" / "value investing Rulers" phrasings — replace with "value investors" or "long-term investors"
- Drop "load up the truck" and similar R1 catchphrases — paraphrase as "build a meaningful position"

- [ ] **Step 2: Update Section 2 framing**

Replace:
- `simple_predictable` (key) → `business_quality`
- "Simple & Predictable" (title) → "Business Quality"
- "Six-Inch Bar Concept" subsection header → "Circle of Competence" (or similar plain-English rephrase)
- Drop "Six-Inch Bar" terminology in prose; keep the *concept* (simple enough to understand) in plain English

- [ ] **Step 3: Drop the 15-point Meaning Checklist subsection**

Find the block titled "Meaning Checklist (15 Points — used in Full Story Section 2)" and remove it entirely. It was a forward-reference to Stage 3 which has its own redesign that dropped this checklist.

Also remove any references to "Meaning Checklist," "Three Ms," or "the first M" in the prompt prose.

- [ ] **Step 4: Add verdict-box format requirements**

In the "Output Format" section, immediately after the existing data structure for Section 1, add:

> **Verdict box (required at end of narrative):**
> > **Setup verdict.** Event status: active / recent / none. Event type: company-specific / industry-specific / market-wide / none. Guru ownership: significant / partial / none. Verdict: PROCEED / WATCH / SKIP.

And after Section 2's data structure:

> **Verdict box (required at end of narrative):**
> > **Business verdict.** Predictability: high / medium / low. Within circle of competence: yes / no / partial. Cyclicality: none / mild / moderate / severe. Verdict: PASS / FAIL / WATCHLIST.

- [ ] **Step 5: Update output schema example block**

In the MultiSection JSON example, change `"key": "radar"` → `"key": "setup"` and `"key": "simple_predictable"` → `"key": "business_quality"`. Update titles to match.

- [ ] **Step 6: Run the lint**

Run: `npm run lint:vocab`
Expected: violations from `agents/business-analyst-pitchdeck/prompt.md` should be zero (other agents still flagged).

- [ ] **Step 7: Visually scan the file diff**

Run: `git diff agents/business-analyst-pitchdeck/prompt.md`
Confirm: no remaining R1 phrasings, both verdict boxes added, both keys updated.

- [ ] **Step 8: Commit**

```bash
git add agents/business-analyst-pitchdeck/prompt.md
git commit -m "refactor(agent): rebrand business-analyst-pitchdeck per pitch-deck redesign spec"
```

---

### Task 8: Update competitor-evaluator-market-position-pitchdeck prompt

**Files:**
- Modify: `agents/competitor-evaluator-market-position-pitchdeck/prompt.md`

**Changes:**
- Section title "Dominant Market Position" → "Market Position" (key `market_position` is unchanged)
- Drop Tier-1 vocab
- Add verdict-box format

- [ ] **Step 1: Replace the section title**

Replace all occurrences of "Dominant Market Position" with "Market Position." The "Dominant" framing of the title is the most R1-coded piece; the key `market_position` itself is fine.

- [ ] **Step 2: Drop Tier-1 vocab**

Remove "Rulers" / "load up the truck" / "Wonderful Company" 4-test references. Most are in the boilerplate "Value Investing Philosophy" header section.

- [ ] **Step 3: Add verdict-box requirement**

After the data structure block, add:

> **Verdict box (required at end of narrative):**
> > **Market position verdict.** Niche rank: Top 3 / Top 10 / Mid-pack. Market share trend: growing / stable / declining. 10-year ceiling: realistic / ambitious / unrealistic / implausible. Verdict: PASS / FAIL / WATCHLIST.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint:vocab
git add agents/competitor-evaluator-market-position-pitchdeck/prompt.md
git commit -m "refactor(agent): rebrand market-position-pitchdeck per pitch-deck redesign spec"
```

---

### Task 9: Update competitor-evaluator-moats-pitchdeck prompt (drop 15-pt checklist)

**Files:**
- Modify: `agents/competitor-evaluator-moats-pitchdeck/prompt.md`

**Changes:**
- Section key `barriers_moats` → `moat_analysis`
- Section title "Large Barrier to Entry & Moats" → "Moat Analysis"
- **Drop the entire 15-point Moat Checklist subsection** and its `data.moatChecklist.items[]` schema
- Drop Tier-1 vocab
- Add Width/Trend verdict-box format
- Keep the 6 R1 moat types in the prompt (per Final Thesis spec alignment)

- [ ] **Step 1: Rename section key and title**

Replace `barriers_moats` (key) with `moat_analysis`, "Large Barrier to Entry & Moats" (title) with "Moat Analysis."

- [ ] **Step 2: Delete the 15-point Moat Checklist subsection**

Find the subsection titled "15-Point Moat Checklist (MANDATORY)" and remove it entirely (the prose introduction, the 15 numbered items, the verdict-values explanation, and the field-research note).

- [ ] **Step 3: Update the output data structure**

In the data structure block, find `"moatChecklist": { "items": [...], "summary": {...} }` and remove the entire `moatChecklist` field. Keep `moatTypes[]` (the 6-type evaluation matrix), `moatClassification`, `barriers[]`, `pricingPowerAssessment`, `antifragility`, `competitiveAdvantagePeriod`, `capRationale`, `moatValidation`.

- [ ] **Step 4: Add the Width/Trend verdict-box requirement**

After the data structure block, add:

> **Verdict box (required at end of narrative):**
> > **Moat verdict.** Primary type: [from 6-type list]. Secondary type: [from 6-type list, or none]. Width: wide / narrow / none. Trend: widening / stable / eroding. Sustainability horizon: [N years]. Verdict: PASS / FAIL / WATCHLIST.

- [ ] **Step 5: Drop Tier-1 vocab**

Remove "Rulers," "Wonderful Company" 4-test, etc. Keep the 6 R1 moat types verbatim (Brand, Network, Switching, Price Advantage, Secrets/Patents, Toll Bridge) — this is the Final Thesis alignment.

- [ ] **Step 6: Update Quality Standards "Quality Checklist (Self-Verification)" subsection**

Find the line `[ ] Scored all 15 moat checklist items with verdicts and evidence` and remove it. Replace with `[ ] All 6 moat types evaluated in narrative with strength + evidence + durability risk per type` if not already covered.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint:vocab
git add agents/competitor-evaluator-moats-pitchdeck/prompt.md
git commit -m "refactor(agent): drop 15-point Moat Checklist, adopt Width/Trend verdict box (moats-pitchdeck)"
```

---

### Task 10: Update financial-analyst-pitchdeck prompt (4-section restructure)

**Files:**
- Modify: `agents/financial-analyst-pitchdeck/prompt.md`

**Changes (this is the biggest agent edit):**
- Section key renames: `fcf` → `cash_generation`, `roe_roic_debt` → `returns_leverage` (`balance_sheet` unchanged)
- Section title renames: "Free Cash Flow Generative" → "Cash Generation," "ROE / ROIC / ROA & Debt" → "Returns & Leverage," "Strong Balance Sheet" → "Balance Sheet"
- **Add NEW Section §4d "Accounting Red Flags"** with 5-category investigation framework
- Drop Tier-1 vocab
- Add 4 verdict-box formats
- (`ruleOneMethod` → `buffettMethod` already done in Task 4 — verify it stuck)

- [ ] **Step 1: Rename the three existing sections**

Find and replace:
- `"key": "fcf"` → `"key": "cash_generation"`
- `"key": "roe_roic_debt"` → `"key": "returns_leverage"`
- "Free Cash Flow Generative" (title) → "Cash Generation"
- "ROE / ROIC / ROA & Debt" (title) → "Returns & Leverage"
- "Strong Balance Sheet" (title) → "Balance Sheet"

The `balance_sheet` key is unchanged.

- [ ] **Step 2: Add the new Section 4d "Accounting Red Flags"**

Find the structural block of the prompt that lists the three sections (Section 5 / Section 7 / Section 8). Add a new section block after the existing three:

```markdown
## Section §4d: Accounting Red Flags

**Purpose:** Explicit footnote-and-disclosure scan for five categories of accounting concerns. Investigates earnings-quality flags that financial-statement analysis alone may miss.

This investigation runs alongside §4a/§4b/§4c. Output is its own section with its own verdict box.

### The Five Categories

1. **"Capitalized" footnote scan** — search 10-K footnotes for capitalized R&D, software development, customer acquisition costs, or other items that move expenses to the balance sheet. Quantify amount and trend over 5 years.

2. **"Deferred" footnote scan** — search for deferred income, deferred tax assets/liabilities, deferred revenue patterns. Flag any large deferrals that smooth earnings.

3. **"Restructuring" charges** — list all restructuring charges in the last 10 years. Frequent recurring "non-recurring" charges are a red flag.

4. **Income tax actually paid vs reported** — compare the income tax provision on the income statement against actual cash taxes paid (cash flow statement). Material divergence is a flag.

5. **Goodwill impairment history** — list all goodwill impairments in the last 10 years. Pattern of impairments suggests overpaying for acquisitions.

For each category, output either specific flags found OR a "Clean" status with the specific filing/footnote searched. No category may be silently skipped.

### Section §4d — Data Structure

```json
{
  "categories": [
    {
      "category": "capitalized | deferred | restructuring | tax | goodwill",
      "investigated": true,
      "flagsFound": [
        { "description": "...", "severity": "high | medium | low", "source": "10-K footnote N citation" }
      ],
      "verdict": "clean | yellow | red"
    }
  ],
  "totalFlags": 0,
  "highSeverityFlags": 0,
  "verdict": "clean | yellow | red"
}
```

**Verdict box (required at end of narrative):**
> **Accounting verdict.** Triggers found: [N of 5 categories]. Severity: clean (0 flags) / yellow (1-2 flags) / red (3+ flags or any high-severity flag). Verdict: PASS / WATCH / FAIL.
```

- [ ] **Step 3: Update the MultiSection output example**

Find the "Output Format: MultiSectionSchema" block. The current example shows 3 sections (`fcf`, `roe_roic_debt`, `balance_sheet`). Add a 4th section object for `accounting_red_flags`:

```json
{
  "sections": [
    { "key": "cash_generation", "sectionNumber": 5, ... },
    { "key": "returns_leverage", "sectionNumber": 6, ... },
    { "key": "balance_sheet", "sectionNumber": 7, ... },
    { "key": "accounting_red_flags", "sectionNumber": 8, ... }
  ]
}
```

> **Section number note:** the old pitch deck numbered sections 1-10 + verdict=11 with management at position 6 (sandwiched between FA's S5 and S7). The new pipeline numbers 1-11 + verdict=12 with management moved to position 9 (after FA's four contiguous sections). Within financial-analyst, the four sections now sit at contiguous positions 5, 6, 7, 8 (the orchestrator's global numbering). Do not renumber inside the agent prompt — the orchestrator handles the global numbering at assembly time.

- [ ] **Step 4: Add verdict-box requirements for §4a, §4b, §4c**

After each section's data structure block, add the corresponding verdict box:

§4a Cash Generation:
> > **Cash verdict.** FCF: positive and growing / positive but volatile / declining / negative. FCF/Earnings ratio: ≥1.0 / 0.75-1.0 / <0.75. Owner earnings convergence (Buffett vs Graham): aligned (within 20%) / divergent. Verdict: PASS / FAIL / WATCHLIST.

§4b Returns & Leverage:
> > **Returns verdict.** ROIC trend: improving / stable / deteriorating / volatile. ROE-vs-ROIC divergence (debt distortion): low / moderate / high. Debt-to-FCF: <3 / 3-5 / >5. Interest coverage: strong (>6×) / adequate (3-6×) / strained (<3×). Verdict: PASS / FAIL / WATCHLIST.

§4c Balance Sheet:
> > **Balance sheet verdict.** Equity trend: growing / flat / declining. Current ratio: ≥2 / 1-2 / <1. Goodwill burden: low (<15% of assets) / moderate (15-30%) / high (>30%). Verdict: PASS / FAIL / WATCHLIST.

- [ ] **Step 5: Drop Tier-1 vocab**

Remove "Rulers," "Wonderful Company" 4-test, "load up the truck" wherever present in this prompt.

- [ ] **Step 6: Update "Pitch Deck Depth Minimums" table**

Add a row for the 4th section. The table currently says "Required tables | 4 (FCF history, return trends, balance sheet health, dual Owner Earnings)" — update to add a 5th: "Accounting red-flag findings table." Update "Cross-cutting findings | At least 2" if needed.

- [ ] **Step 7: Verify the `ruleOneMethod` → `buffettMethod` rename from Task 4 stuck**

Run: `grep -n "ruleOneMethod" agents/financial-analyst-pitchdeck/prompt.md`
Expected: no output. If output appears, fix it.

- [ ] **Step 8: Lint and commit**

```bash
npm run lint:vocab
git add agents/financial-analyst-pitchdeck/prompt.md
git commit -m "refactor(agent): financial-analyst-pitchdeck — rename 3 sections, add 4d accounting red flags, verdict boxes"
```

---

### Task 11: Update management-evaluator-pitchdeck prompt

**Files:**
- Modify: `agents/management-evaluator-pitchdeck/prompt.md`

**Changes:**
- Section key `management` → `management_capital_allocation`
- Section title "Management Talent & Integrity" → "Management & Capital Allocation"
- Drop Tier-1 vocab including "Three Ms / the third M / 3 Ms framework," "Wonderful Company," "Big Audacious Goal (BAG)" trademark wording
- Schema rename `data.ceo.bag` → `data.ceo.strategicVision` (already done in Task 5 — verify)
- Add verdict-box format

- [ ] **Step 1: Rename section key and title**

Replace `"key": "management"` with `"key": "management_capital_allocation"`. Replace "Management Talent & Integrity" with "Management & Capital Allocation" everywhere it appears.

- [ ] **Step 2: Drop Three Ms framing**

Find the prompt's introduction paragraph that references "the third 'M' in the 3 Ms framework: Meaning, Moat, **Management**." Rewrite without the Three Ms framing — e.g., "You assess the people running the business — the human factor that numbers alone cannot capture."

- [ ] **Step 3: Drop BAG terminology, keep concept**

Find references to "Big Audacious Goal (BAG)" and replace with "long-term strategic vision." Verify the schema rename from Task 5 is in place: `data.ceo.bag` → `data.ceo.strategicVision`.

- [ ] **Step 4: Drop "Wonderful Company" 4-test framing**

Locate any "Wonderful Company" 4-test references and rephrase as "value investing investment criteria" or paraphrase per the spec.

- [ ] **Step 5: Add verdict-box requirement**

After the data structure block, add:

> **Verdict box (required at end of narrative):**
> > **Management verdict.** CEO integrity: high / medium / low. Capital allocation: rational / questionable / poor. Insider conviction: high (net buying) / neutral / negative (net selling). Promise tracking: kept / mixed / broken. Verdict: PASS / FAIL / WATCHLIST.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint:vocab
git add agents/management-evaluator-pitchdeck/prompt.md
git commit -m "refactor(agent): rebrand management-evaluator-pitchdeck per pitch-deck redesign spec"
```

---

### Task 12: Update risk-analyst-pitchdeck prompt (Klarman overlay)

**Files:**
- Modify: `agents/risk-analyst-pitchdeck/prompt.md`

**Changes:**
- Section key `pest` → `risk_profile`
- Section title "Limited Exposure to P.E.S.T Risks" → "Risk Profile"
- Add Klarman permanent-vs-temporary loss classification (each PEST risk gets a `lossType` field)
- Drop Tier-1 vocab
- Add verdict-box format

- [ ] **Step 1: Rename section key and title**

Replace `"key": "pest"` with `"key": "risk_profile"`. Replace "Limited Exposure to P.E.S.T Risks" with "Risk Profile" everywhere.

- [ ] **Step 2: Add Klarman overlay**

In the "For Each Identified Risk, You MUST Provide:" subsection, add a new bullet:

```markdown
- **Loss Type:** PERMANENT (regulatory ban, technological obsolescence, balance-sheet collapse, fraud — equity is vaporized) or TEMPORARY (cyclical downturn, multiple compression, transient mistakes — recovery probable). One-sentence rationale required.
```

In the data structure block, extend each risk object's schema to include `lossType: "permanent" | "temporary"` and `lossTypeRationale: "..."`.

- [ ] **Step 3: Update the Risk Matrix subsection**

Add a new line after the existing 2x2 probability/severity matrix description:

```markdown
**Permanent vs Temporary classification overlay:** Permanent-loss risks weigh heavier than temporary-loss risks in the verdict. A high-probability + high-severity *temporary* risk (e.g., cyclical earnings hit) may still allow a PASS with a smaller position; a low-probability + high-severity *permanent* risk (e.g., regulatory ban) may force a WATCHLIST or FAIL even when the probability is small.
```

- [ ] **Step 4: Drop Tier-1 vocab**

Remove "Rulers," "Wonderful Company," "load up the truck" — paraphrase or replace.

- [ ] **Step 5: Add verdict-box requirement**

After the data structure block, add:

> **Verdict box (required at end of narrative):**
> > **Risk verdict.** Permanent-loss risks: N. Temporary-loss risks: N. Thesis-killers: [list, may be "None identified"]. Bear case strength: weak / moderate / strong. Verdict: PASS / FAIL / WATCHLIST.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint:vocab
git add agents/risk-analyst-pitchdeck/prompt.md
git commit -m "refactor(agent): risk-analyst-pitchdeck — rename to Risk Profile, add Klarman loss-type overlay"
```

---

### Task 13: Update valuation-specialist-pitchdeck prompt

**Files:**
- Modify: `agents/valuation-specialist-pitchdeck/prompt.md`

**Changes:**
- Schema rename `stickerPrice*` → `fairValue*` (already done in Task 6 — verify)
- "Sticker price" prose → "Fair Value" prose
- Drop Tier-1 vocab
- Add verdict-box format
- **Do NOT add Mauboussin reverse-DCF** — that's Final-Thesis-exclusive per spec

- [ ] **Step 1: Verify Task 6's sticker→fairValue replacements stuck**

Run: `grep -n "[Ss]ticker" agents/valuation-specialist-pitchdeck/prompt.md`
Expected: no output (or only acceptable contextual mentions like "the term 'fair value' replaces what was previously called 'sticker price'" if any historical note is desired — usually clean).

- [ ] **Step 2: Drop Tier-1 vocab**

Remove "Rulers," "Wonderful Company," "load up the truck."

- [ ] **Step 3: Add verdict-box requirement**

After the data structure block, add:

> **Verdict box (required at end of narrative):**
> > **Valuation verdict.** Buy-price range (4-method): $low–$high. Current price: $current. Position relative to range: above / within / below. Margin of safety at current: X%. Method convergence: tight (within 20%) / spread (>20%). Verdict: PASS / FAIL / WATCHLIST.

- [ ] **Step 4: Verify NO Mauboussin reverse-DCF added**

Run: `grep -in "mauboussin\|reverse.dcf\|implied.expectation" agents/valuation-specialist-pitchdeck/prompt.md`
Expected: no output. If output appears, remove. Mauboussin reverse-DCF stays in Final Thesis only.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint:vocab
git add agents/valuation-specialist-pitchdeck/prompt.md
git commit -m "refactor(agent): valuation-specialist-pitchdeck — fair-value rename, verdict box, drop R1 vocab"
```

---

### Task 14: Update synthesis-writer-pitchdeck prompt

**Files:**
- Modify: `agents/synthesis-writer-pitchdeck/prompt.md`

**Changes:**
- Section key `overall_verdict` → `investment_verdict`
- Title "Overall Verdict" → "Investment Verdict"
- Add Pre-Decision Quality Check closing block (Calibrated Confidence + Anticipated Regret)
- Drop Tier-1 vocab
- Update the section weighting tables / cross-section consistency check to reference the new section keys (radar → setup, pest → risk_profile, etc.)

- [ ] **Step 1: Rename key, title, sectionNumber**

Replace `"key": "overall_verdict"` → `"key": "investment_verdict"`. Replace "Overall Verdict" → "Investment Verdict." The `sectionNumber` is now `12` (was `11`).

- [ ] **Step 2: Update referenced section keys throughout**

The synthesis-writer prompt references all 10 upstream section keys in its inputs and section-weighting blocks. Find and replace:
- `radar` → `setup`
- `simple_predictable` → `business_quality`
- `barriers_moats` → `moat_analysis`
- `fcf` → `cash_generation`
- `roe_roic_debt` → `returns_leverage`
- `management` → `management_capital_allocation`
- `pest_risks` (or `pest`) → `risk_profile`
- (`market_position`, `balance_sheet`, `valuation` are unchanged)

Also add the new `accounting_red_flags` key to any "10 sections" enumeration — it becomes 11 upstream sections.

- [ ] **Step 3: Add Pre-Decision Quality Check closing block requirement**

In the "Narrative Structure" subsection, add a new step 7:

```markdown
7. **Pre-Decision Quality Check (closing block).** End the narrative with a one-paragraph quality check covering:
   - **Confidence calibration.** Which sections were HIGH confidence? Which were LOW? Is the verdict's overall confidence appropriate to the strongest or weakest dimension? Where are we at risk of overconfidence?
   - **Anticipated regret.** If this thesis fails over the next 5 years, what is the most likely failure mode (tied to the strongest red flag)? What signal would we have missed? If the thesis succeeds, what dimension did we get right that consensus is currently missing?

   This block is REQUIRED in the narrative. It is also reflected in the `data.preDecisionCheck` object.
```

In the data structure block (currently `data: { sectionVerdicts, overallVerdict, keyStrengths, keyConcerns, nextSteps }`), add:

```json
"preDecisionCheck": {
  "highConfidenceSections": ["..."],
  "lowConfidenceSections": ["..."],
  "overconfidenceRisks": ["..."],
  "anticipatedFailureMode": "...",
  "anticipatedFailureSignal": "...",
  "variantPerceptionStatement": "..."
}
```

- [ ] **Step 4: Update `data.sectionVerdicts` example to use new keys**

The example currently lists 10 keys — update to 11 (adding `accounting_red_flags`) and rename per the new keys above.

- [ ] **Step 5: Drop Tier-1 vocab**

Remove "Rulers," "Wonderful Company," "Three Ms" etc. wherever present.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint:vocab
git add agents/synthesis-writer-pitchdeck/prompt.md
git commit -m "refactor(agent): synthesis-writer-pitchdeck — Investment Verdict + Pre-Decision Quality Check"
```

---

## Phase 4 — Orchestrator skill update

### Task 15: Update generate-pitch-deck SKILL.md

**Files:**
- Modify: `.claude/skills/generate-pitch-deck/SKILL.md`

**Changes (the SKILL.md is the orchestrator — it has the most cross-cutting changes):**
- Agent Registry: section keys updated, financial-analyst now lists 4 sections
- Wave Structure: financial-analyst wave 2 produces 4 sections
- Step 5 (now Step 4 numbering may shift): dispatch instructions for business-analyst with new section keys
- Step 6 dispatch instructions for financial-analyst with 4-section task
- Step 9: FGR derivation references — `stickerPrice*` already renamed in Task 6
- Step 11: synthesis-writer dispatch with new section keys + Pre-Decision Quality Check requirement
- Step 12: assembly block — section keys, sectionKeys array, file paths
- Step 14: budget agentMap — new section keys
- Step 14.4: contract update (commits with this task — was held in Task 3)
- Tier-1 vocab scrub throughout the skill prose

- [ ] **Step 1: Update Agent Registry**

Find the `AGENT_REGISTRY:` block. Update each entry's `sections: [...]` field with new keys:

```yaml
business-analyst:
  sections: [setup, business_quality]
competitor-market-position:
  sections: [market_position]
competitor-moats:
  sections: [moat_analysis]
financial-analyst:
  sections: [cash_generation, returns_leverage, balance_sheet, accounting_red_flags]
management-evaluator:
  sections: [management_capital_allocation]
risk-analyst:
  sections: [risk_profile]
valuation-specialist:
  sections: [valuation]
synthesis-writer:
  sections: [investment_verdict]
```

The agent prompt paths and models are unchanged.

- [ ] **Step 2: Update Wave Structure block**

Wave 0-3 are unchanged in agent membership. Update the Wave 4 line for the synthesis writer to reflect the new key:

```
Wave 4 (Synthesis): synthesis-writer  → investment_verdict
```

- [ ] **Step 3: Update Step 5 (Wave 1 — Business Fundamentals) dispatch**

In the "Agent 1: business-analyst" block, change "sections: radar (S1), simple_predictable (S2)" to "sections: setup (S1), business_quality (S2)." Update the Task instruction text to reference the new section names ("Pitch Deck sections 1 (Setup) and 2 (Business Quality)"). Update the Save line from `sections/radar.json`, `sections/simple_predictable.json` to `sections/setup.json`, `sections/business_quality.json`.

In "Agent 2: competitor-market-position," section key `market_position` is unchanged — only the section title in narrative ("Dominant Market Position" → "Market Position").

- [ ] **Step 4: Update Step 6 (Wave 2 — Deep Analysis) dispatch**

In the "Agent 1: competitor-moats" block, change "section: barriers_moats (S4)" to "section: moat_analysis (S4)." Update Save line: `sections/moat_analysis.json` (was `sections/barriers_moats.json`).

In the "Agent 2: financial-analyst" block, change "sections: fcf (S5), roe_roic_debt (S7), balance_sheet (S8)" to "sections: cash_generation (S5), returns_leverage (S6), balance_sheet (S7), accounting_red_flags (S8)." Update Task instruction to "Return a JSON array containing all FOUR section objects matching ReportSectionSchema." Update Save lines: `sections/cash_generation.json`, `sections/returns_leverage.json`, `sections/balance_sheet.json`, `sections/accounting_red_flags.json`.

In "Agent 3: management-evaluator," update `management` → `management_capital_allocation` (key + file path), AND update sectionNumber from `6` to `9` (management moves after FA's now-contiguous block).

> **Section number note:** the new global numbering is 1-12 with TOP-level groupings 1, 2, 3 (subsections 3a, 3b), 4 (subsections 4a, 4b, 4c, 4d), 5, 6, 7, plus Investment Verdict. The orchestrator uses sectionNumber 1-11 + verdict=12. Map: setup=1, business_quality=2, market_position=3, moat_analysis=4, cash_generation=5, returns_leverage=6, balance_sheet=7, accounting_red_flags=8, management_capital_allocation=9, valuation=10, risk_profile=11, investment_verdict=12. Note: management moves from position 6 (old) to position 9 (new) — this is the largest single section-number shift in the redesign.

- [ ] **Step 5: Update Step 8 (Wave 3 — Risk & Valuation) dispatch**

Update risk-analyst section key: `pest` → `risk_profile`. Update sectionNumber: 9 → 11. Update file path `sections/pest.json` → `sections/risk_profile.json`.

Valuation-specialist key is unchanged (still `valuation`, sectionNumber still 10); only the agent prompt's internal `stickerPrice*` references were renamed in Task 6.

- [ ] **Step 6: Update Step 11 (Wave 4 — Synthesis) dispatch**

Change synthesis-writer section key from `overall_verdict` to `investment_verdict`. Update file path `sections/overall_verdict.json` → `sections/investment_verdict.json`.

Update the Task instruction to require Pre-Decision Quality Check:
> "Review all 11 Pitch Deck sections for {TICKER}. Check cross-section consistency. Identify contradictions. Produce the Investment Verdict section (key: 'investment_verdict', sectionNumber: 12). Weight moat and financial sections most heavily, risk lightest, management as contextual. Close the narrative with a Pre-Decision Quality Check (Calibrated Confidence + Anticipated Regret). Return a single JSON object matching ReportSectionSchema with `data` containing: `{ sectionVerdicts: {...}, overallVerdict: 'PASS|FAIL|WATCHLIST', keyStrengths: [...], keyConcerns: [...], nextSteps: [...], preDecisionCheck: { highConfidenceSections, lowConfidenceSections, overconfidenceRisks, anticipatedFailureMode, anticipatedFailureSignal, variantPerceptionStatement } }`."

- [ ] **Step 7: Update Step 12 (Assemble Final Report) sectionKeys**

Find the `sectionKeys` array. Replace:
```json
["radar", "simple_predictable", "market_position", "barriers_moats", "fcf", "management", "roe_roic_debt", "balance_sheet", "pest", "valuation", "overall_verdict"]
```

With:
```json
["setup", "business_quality", "market_position", "moat_analysis", "cash_generation", "returns_leverage", "balance_sheet", "accounting_red_flags", "management_capital_allocation", "valuation", "risk_profile", "investment_verdict"]
```

Update the surrounding sections-comment block to describe the new ordering and the 12-section count. Update `overallVerdict`/`verdictRationale`/`synthesisNarrative` mirror lines to reference `sections[11]` (was `sections[10]`).

- [ ] **Step 8: Update Step 14 budget agentMap**

In the budget tracker JS block, update `agentMap`:

```js
const agentMap = {
  setup: 'business-analyst', business_quality: 'business-analyst',
  market_position: 'competitor-market-position', moat_analysis: 'competitor-moats',
  cash_generation: 'financial-analyst', returns_leverage: 'financial-analyst',
  balance_sheet: 'financial-analyst', accounting_red_flags: 'financial-analyst',
  management_capital_allocation: 'management-evaluator',
  risk_profile: 'risk-analyst', valuation: 'valuation-specialist'
};
```

- [ ] **Step 9: Update Step 14.4 contract check**

The contract update from Task 3 (held) lands here:

```js
if (sections.length !== 12 || maxSectionNumber !== 12 || !sections.some(s => s.key === 'investment_verdict')) {
  console.error('CONTRACT VIOLATION: pitch deck must have 12 sections with investment_verdict as section 12');
  process.exit(1);
}
```

- [ ] **Step 10: Update Step 17 auto-archive paths**

The auto-archive block uses `cp .thesis/reports/{TICKER}/sections/*.json` — that's a wildcard, so no path-specific update is needed. Verify by reading the block.

- [ ] **Step 11: Tier-1 vocab scrub on the skill prose**

Search the SKILL.md prose for "Three Ms," "Wonderful Company," "Six-Inch Bar," "Rulers," "BAG," "Big Audacious Goal." Remove or rephrase.

- [ ] **Step 12: Run lint**

Run: `npm run lint:vocab`
Expected: zero violations across all 8 prompts and the SKILL.md. The lint script is now green for the first time.

- [ ] **Step 13: Commit**

```bash
git add .claude/skills/generate-pitch-deck/SKILL.md
git commit -m "refactor(skill): generate-pitch-deck orchestrator — new section keys, 12-section contract, FA 4-section task"
```

---

## Phase 5 — PDF/DOCX renderer

### Task 16: Update Python PDF renderer

**Files:**
- Modify: `scripts/pdf/generate_pitch_deck_pdf.py`
- Modify: `scripts/pdf/docx_helpers.py` (and any other DOCX-specific renderer)

- [ ] **Step 1: Read the current renderer to understand its structure**

```bash
wc -l scripts/pdf/generate_pitch_deck_pdf.py
grep -n "def \|section_key\|SECTION_KEYS\|render_section" scripts/pdf/generate_pitch_deck_pdf.py | head -40
```

The renderer iterates over the `sections[]` array from `pitch-deck.json`. Identify:
- Where section keys are matched (any `if section_key == 'fcf':` style switches?)
- Where section titles are rendered
- Where the 15-point Moat Checklist is rendered (look for `moatChecklist` or `15` in this file)
- Where `stickerPrice*` is rendered

- [ ] **Step 2: Add a section-key migration map**

At the top of `generate_pitch_deck_pdf.py`, add:

```python
# Pitch Deck redesign — old key → new key migration map.
# The renderer should read both old and new keys for backward compat with archived reports.
LEGACY_KEY_MAP = {
    'radar': 'setup',
    'simple_predictable': 'business_quality',
    'barriers_moats': 'moat_analysis',
    'fcf': 'cash_generation',
    'roe_roic_debt': 'returns_leverage',
    'management': 'management_capital_allocation',
    'pest': 'risk_profile',
    'overall_verdict': 'investment_verdict',
}

def normalize_section_key(key: str) -> str:
    return LEGACY_KEY_MAP.get(key, key)
```

Wherever the renderer matches on section_key, route through `normalize_section_key()` first.

- [ ] **Step 3: Add 7-top-level grouping**

Add a grouping helper:

```python
TOP_LEVEL_GROUPS = [
    {'title': 'Setup & Situation', 'subsection_keys': ['setup']},
    {'title': 'Business Quality', 'subsection_keys': ['business_quality']},
    {'title': 'Industry & Competitive Position', 'subsection_keys': ['market_position', 'moat_analysis']},
    {'title': 'Financial Analysis', 'subsection_keys': ['cash_generation', 'returns_leverage', 'balance_sheet', 'accounting_red_flags']},
    {'title': 'Management & Capital Allocation', 'subsection_keys': ['management_capital_allocation']},
    {'title': 'Valuation', 'subsection_keys': ['valuation']},
    {'title': 'Risk Profile', 'subsection_keys': ['risk_profile']},
    {'title': 'Investment Verdict', 'subsection_keys': ['investment_verdict']},
]
```

Update the main render loop to iterate `TOP_LEVEL_GROUPS`, render the top-level heading, then iterate the matching subsection sections from the JSON.

- [ ] **Step 4: Drop the 15-point Moat Checklist render**

Find the block that renders `moatChecklist.items[]` (search for `moatChecklist` in the file). Remove it. The moat narrative + verdict box now substitutes for the checklist grid.

- [ ] **Step 5: Add verdict-box visual element**

Add a function `render_verdict_box(canvas, section)` that:
- Reads `section.verdict` (PASS / FAIL / WATCHLIST)
- Reads `section.verdictRationale`
- Reads any structured verdict-box fields the agent emitted at the end of its data payload
- Renders a bordered call-out, color-coded:
  - PASS: green border (#4caf50)
  - WATCHLIST: amber border (#ff9800)
  - FAIL: red border (#f44336)

Call `render_verdict_box(...)` after each section's narrative.

- [ ] **Step 6: Add §4d Accounting Red Flags render**

Add a renderer specifically for `accounting_red_flags` that iterates `data.categories[]` and renders each category as a sub-block with its `flagsFound[]` list (or a "Clean" status). Render the category-level verdicts with the same color coding as the verdict box.

- [ ] **Step 7: Add Investment Verdict close render**

In the renderer for `investment_verdict`, add a closing block that reads `data.preDecisionCheck` and renders the Pre-Decision Quality Check paragraph. Use a distinct visual style (slightly indented, italic, gray background) to differentiate from the main verdict prose.

- [ ] **Step 8: Update Sticker → Fair Value labels**

Search the renderer for any literal "Sticker" or "sticker" strings in headers, table column names, or labels. Replace with "Fair Value." This is a separate sweep from Task 6 (which targeted schema field names) — the renderer may have hard-coded labels.

- [ ] **Step 9: Smoke test**

Run the renderer against an archived pitch-deck JSON if one exists:

```bash
ls .thesis/reports/*/archive/*/pitch-deck.json | head -3
# pick one
python3 scripts/pdf/generate_pitch_deck_pdf.py {TICKER}  # may need a fresh run if old archives use legacy keys
```

If the smoke test runs against legacy keys (because no fresh redesigned report exists yet), confirm the `LEGACY_KEY_MAP` routes them correctly. The output PDF should render without crashes.

- [ ] **Step 10: Apply same changes to DOCX renderer**

If `scripts/pdf/docx_helpers.py` (or another file) renders the DOCX, apply the same 4 changes there: top-level grouping, drop 15-pt grid, add verdict box, sticker→fair value, accounting red flags render, investment verdict close.

- [ ] **Step 11: Lint and commit**

```bash
git add scripts/pdf/
git commit -m "feat(pdf): pitch-deck renderer — 7-section grouping, verdict boxes, drop 15-pt checklist, accounting red flags"
```

---

## Phase 6 — UI updates

### Task 17: Consolidate KEY_NORMALIZATION

**Files:**
- Create: `src/utils/keyNormalization.js`
- Modify: `src/components/PitchDeck.jsx`
- Modify: `src/components/FinalThesis.jsx` (or `FullStory.jsx` if not yet renamed)

> Resolves the watchout from STEPS.md: "KEY_NORMALIZATION lives in PitchDeck.jsx + FullStory.jsx with different aliases."

- [ ] **Step 1: Read both existing maps**

```bash
grep -A 30 "KEY_NORMALIZATION" src/components/PitchDeck.jsx
grep -A 30 "KEY_NORMALIZATION" src/components/FinalThesis.jsx 2>/dev/null || \
  grep -A 30 "KEY_NORMALIZATION" src/components/FullStory.jsx
```

Compare the two maps. Identify entries unique to each.

- [ ] **Step 2: Create the consolidated module**

Create `src/utils/keyNormalization.js`:

```js
// Single source of truth for legacy → current section-key migration.
// Used by both PitchDeck and FinalThesis renderers.
//
// Legacy keys come from archived reports generated before the
// 2026-05-09 pitch-deck and final-thesis redesigns. We keep the
// migration in place indefinitely so old reports still render.

export const KEY_NORMALIZATION = {
  // Pitch Deck redesign (2026-05-09)
  radar: 'setup',
  simple_predictable: 'business_quality',
  barriers_moats: 'moat_analysis',
  fcf: 'cash_generation',
  roe_roic_debt: 'returns_leverage',
  management: 'management_capital_allocation',
  pest: 'risk_profile',
  pest_risks: 'risk_profile',
  overall_verdict: 'investment_verdict',
  // Final Thesis redesign (2026-05-09)
  meaning_checklist: 'business_analysis',
  moat_checklist: 'moat_analysis',  // collides with PD; both stages use moat_analysis intentionally
  management_checklist: 'management_analysis',
  valuation_confirmation: 'valuation_analysis',
  inversion_rebuttal: 'debate',
  // ... preserve any other entries from the existing PitchDeck/FullStory maps
};

export function normalizeKey(key) {
  return KEY_NORMALIZATION[key] || key;
}
```

> **Collision note:** both Pitch Deck and Final Thesis use `moat_analysis` as a key. That's intentional — both stages have a Moat Analysis section. The renderer disambiguates by stage (top-level grouping is per-stage), not by key.

- [ ] **Step 3: Update PitchDeck.jsx to import**

Replace the inline `KEY_NORMALIZATION` definition in `PitchDeck.jsx` with:

```js
import { KEY_NORMALIZATION, normalizeKey } from '../utils/keyNormalization.js';
```

- [ ] **Step 4: Update FinalThesis.jsx (or FullStory.jsx) the same way**

- [ ] **Step 5: Run vitest**

Run: `npm test`
Expected: PASS. If snapshot tests reference the old inline KEY_NORMALIZATION, update.

- [ ] **Step 6: Commit**

```bash
git add src/utils/keyNormalization.js src/components/PitchDeck.jsx src/components/FinalThesis.jsx 2>/dev/null || \
  git add src/utils/keyNormalization.js src/components/PitchDeck.jsx src/components/FullStory.jsx
git commit -m "refactor(ui): consolidate KEY_NORMALIZATION between PitchDeck and FinalThesis"
```

---

### Task 18: Update PitchDeck.jsx render

**Files:**
- Modify: `src/components/PitchDeck.jsx`

**Changes:**
- Add 7-top-level grouping in the render
- Add verdict-box render
- Drop 15-point Moat Checklist render (if present)
- Add §4d Accounting Red Flags subsection render
- Add Investment Verdict closing Pre-Decision Quality Check render

- [ ] **Step 1: Find the section-list render**

Locate the JSX block that maps over `report.sections`. Determine its current shape.

- [ ] **Step 2: Add the TOP_LEVEL_GROUPS constant**

Add the same grouping array used by the PDF renderer:

```js
const TOP_LEVEL_GROUPS = [
  { title: 'Setup & Situation', keys: ['setup'] },
  { title: 'Business Quality', keys: ['business_quality'] },
  { title: 'Industry & Competitive Position', keys: ['market_position', 'moat_analysis'] },
  { title: 'Financial Analysis', keys: ['cash_generation', 'returns_leverage', 'balance_sheet', 'accounting_red_flags'] },
  { title: 'Management & Capital Allocation', keys: ['management_capital_allocation'] },
  { title: 'Valuation', keys: ['valuation'] },
  { title: 'Risk Profile', keys: ['risk_profile'] },
  { title: 'Investment Verdict', keys: ['investment_verdict'] },
];
```

- [ ] **Step 3: Refactor the render loop**

Replace the flat `report.sections.map(s => <SectionRender section={s} />)` with a top-level group loop:

```jsx
{TOP_LEVEL_GROUPS.map(group => (
  <TopLevelSection key={group.title} title={group.title}>
    {group.keys.map(key => {
      const section = report.sections.find(s => normalizeKey(s.key) === key);
      if (!section) return null;
      return <SubsectionRender key={key} section={section} />;
    })}
  </TopLevelSection>
))}
```

`TopLevelSection` and `SubsectionRender` may need to be new components — extract them from the existing inline render logic.

- [ ] **Step 4: Add VerdictBox component**

Create a `VerdictBox` component that takes a section and renders the verdict-box fields. Color-code by verdict (PASS green, WATCHLIST amber, FAIL red). Render after each subsection's narrative.

- [ ] **Step 5: Drop 15-pt checklist render (if present)**

Search the JSX for any `data.moatChecklist` or `moatChecklist.items` reference. Remove. The narrative now substitutes.

- [ ] **Step 6: Add §4d AccountingRedFlags subsection render**

Add a specific render for `accounting_red_flags` that maps over `data.categories[]` and shows each category's `flagsFound[]` or "Clean" state.

- [ ] **Step 7: Add Investment Verdict Pre-Decision Quality Check render**

In the `investment_verdict` render, add a closing block reading `data.preDecisionCheck`. Render in a slightly distinct visual style.

- [ ] **Step 8: Smoke test in the dev server**

Run: `npm run dev`
Open the app, navigate to a pitch deck for a ticker that has an existing archived report (the legacy keys will be auto-migrated by `normalizeKey`). Verify:
- 7 top-level sections render
- Verdict boxes appear after each subsection
- No 15-pt checklist grid renders
- The Investment Verdict section ends with the Pre-Decision Quality Check block

Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/components/PitchDeck.jsx
git commit -m "feat(ui): PitchDeck.jsx — 7-section grouping, verdict boxes, accounting red flags, pre-decision check"
```

---

### Task 19: Update Toolbox.jsx (sticker → fair value sweep)

**Files:**
- Modify: `src/components/Toolbox.jsx`

> Task 6 caught the schema-field rename. This task catches any remaining UI labels and tab-specific variable names in the valuation tab of the Toolbox god-component.

- [ ] **Step 1: Find remaining sticker references**

```bash
grep -n "[Ss]ticker" src/components/Toolbox.jsx
```

- [ ] **Step 2: Replace UI labels**

For each hit:
- "Sticker Price" (display label) → "Fair Value"
- "Sticker" (column header) → "Fair Value"
- `stickerPrice` (variable) → `fairValue`

Preserve casing conventions in the surrounding code.

- [ ] **Step 3: Run vitest**

Run: `npm test`
Expected: PASS. Snapshot tests of the Toolbox may need updating.

- [ ] **Step 4: Smoke test**

Run: `npm run dev`. Navigate to the Toolbox, the valuation tab. Confirm "Fair Value" label appears throughout, no `undefined` values, sensitivity tables render.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/Toolbox.jsx
git commit -m "refactor(ui): Toolbox valuation tab — sticker → fair-value labels"
```

---

### Task 20: Verify usePitchDeck IS_DEV gate

**Files:**
- Modify: `src/hooks/usePitchDeck.js` (only if the gate is missing)

> Existing watchout from STEPS.md: "useOnePager / usePitchDeck / useFullStory poll dev-only Vite middleware paths that 404 in prod."

- [ ] **Step 1: Read the hook**

```bash
cat src/hooks/usePitchDeck.js
```

Look for any `fetch('/__pitch-deck-status')` or similar dev-only middleware calls.

- [ ] **Step 2: Add IS_DEV gate if missing**

If a dev-only fetch is unconditional, wrap it:

```js
if (import.meta.env.DEV) {
  // existing fetch to dev-only middleware
}
```

If the gate is already present, no change needed — note in the task and move on.

- [ ] **Step 3: Commit (if changes were made)**

```bash
git add src/hooks/usePitchDeck.js
git commit -m "fix(ui): gate usePitchDeck dev-only middleware fetch on import.meta.env.DEV"
```

If no change was needed, mark this task complete without a commit.

---

## Phase 7 — Test fixtures + smoke test

### Task 21: Update test fixtures with old keys

**Files:**
- Modify: any test fixture file referencing `radar`, `simple_predictable`, `barriers_moats`, `fcf`, `roe_roic_debt`, `management` (as section key), `pest`, `overall_verdict`

- [ ] **Step 1: Find all fixture files**

```bash
grep -rln '"key":\s*"\(radar\|simple_predictable\|barriers_moats\|fcf\|roe_roic_debt\|management\|pest\|overall_verdict\)"' --include="*.js" --include="*.json" .
```

Note: `balance_sheet`, `market_position`, `valuation` keys are unchanged — exclude false positives by spot-checking each hit.

- [ ] **Step 2: For each fixture, update the key**

Replace the legacy key with its current name per the migration map. Where a fixture covers a multi-section agent (business-analyst, financial-analyst), update each section in the array.

- [ ] **Step 3: Run vitest**

Run: `npm test`
Expected: PASS. The schema test from Task 2 already validates the new keys. Other tests should now find their fixtures with the renamed keys.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: update pitch-deck test fixtures to new section keys"
```

---

### Task 22: End-to-end smoke test

> Goal: actually run `/generate-pitch-deck` end-to-end on a known ticker and verify the output. This is the single test that catches integration failures the unit tests miss.

**Tooling:** Claude Code subagents are the dispatch mechanism. The smoke test runs the live skill.

- [ ] **Step 1: Pick a known ticker with prior data**

Use AAPL or COST — both have a populated DataPacket and a historical one-pager. Verify a one-pager exists:

```bash
ls .thesis/reports/AAPL/one-pager.json 2>/dev/null
```

If not, run `/generate-one-pager AAPL` first.

- [ ] **Step 2: Clean prior pitch deck output**

```bash
rm -rf .thesis/reports/AAPL/sections/
rm -f .thesis/reports/AAPL/pitch-deck.json
rm -f .thesis/reports/AAPL/pitch-deck.md
```

(The skill itself does this in Step 1; doing it here makes the test more deterministic.)

- [ ] **Step 3: Run the skill**

In Claude Code: `/generate-pitch-deck AAPL`

Expected: orchestrator runs all 5 waves end-to-end. Step 14.4 contract check passes (12 sections, `investment_verdict`).

- [ ] **Step 4: Inspect the output JSON**

```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('.thesis/reports/AAPL/pitch-deck.json','utf8'));
console.log('section count:', r.sections.length);
console.log('section keys:', r.sections.map(s => s.key).join(', '));
console.log('verdict:', r.overallVerdict);
console.log('preDecisionCheck:', !!r.sections.find(s => s.key === 'investment_verdict')?.data?.preDecisionCheck);
"
```

Expected:
- `section count: 12`
- All 12 keys from the new spec
- `verdict` is set (PASS / FAIL / WATCHLIST)
- `preDecisionCheck` is `true`

- [ ] **Step 5: Inspect a few section files**

```bash
ls .thesis/reports/AAPL/sections/
```

Expected files: `setup.json`, `business_quality.json`, `market_position.json`, `moat_analysis.json`, `cash_generation.json`, `returns_leverage.json`, `balance_sheet.json`, `accounting_red_flags.json`, `management_capital_allocation.json`, `valuation.json`, `risk_profile.json`, `investment_verdict.json` (plus `annual-reader-insights.json`, `quarterly-reader-insights.json` from PSR).

- [ ] **Step 6: Verify verdict boxes are present**

Inspect one section narrative for the verdict-box block at the end:

```bash
node -e "
const s = JSON.parse(require('fs').readFileSync('.thesis/reports/AAPL/sections/moat_analysis.json','utf8'));
console.log('---narrative tail---');
console.log(s.narrative.slice(-500));
"
```

Expected: the narrative ends with a "Moat verdict." block matching the spec format.

- [ ] **Step 7: Verify the PDF renders**

```bash
ls .thesis/reports/AAPL/*.pdf
```

Expected: `pitch-deck-AAPL-{date}.pdf` exists. Open it. Verify:
- 7 top-level sections (no longer 10)
- Each section ends with a colored verdict box
- §4d Accounting Red Flags appears under Financial Analysis
- Investment Verdict ends with Pre-Decision Quality Check

- [ ] **Step 8: Run the lint one final time**

Run: `npm run lint:vocab`
Expected: zero violations.

- [ ] **Step 9: Run all tests**

Run: `npm test`
Expected: PASS.

If any of the above checks fail, open the underlying issue and fix in a follow-up task. Do not mark Task 22 complete until all 9 checks pass.

- [ ] **Step 10: Commit any fixes from this smoke test**

```bash
git add -A
git commit -m "test: end-to-end smoke test of pitch-deck redesign on AAPL"
```

If no fixes were needed, no commit — the smoke test is verification, not modification.

---

## Phase 8 — Documentation + cleanup

### Task 23: Update W2-PUNCHLIST.md

**Files:**
- Modify: `W2-PUNCHLIST.md`

- [ ] **Step 1: Find Stage 2 entries with [POD-VAL] tag**

```bash
grep -n "POD-VAL\|POD-FS" W2-PUNCHLIST.md
```

- [ ] **Step 2: Resolve [POD-VAL] entries (Stage 2 portion)**

For each `[POD-VAL]`-tagged row that references valuation-method labels in the Stage 2 UI (e.g., "Sticker Price," "Buy price calculators"), update the row to reflect the resolved naming from this spec ("Fair Value," 4 calculators retained: MOS / Payback Time / Ten Cap / Equity Bond).

Add a note at the top of the W2 file similar to the [POD-SCORE] resolution note:

```markdown
| `[POD-PD]` | **RESOLVED 2026-05-09** — see [docs/specs/2026-05-09-pitch-deck-redesign.md](docs/specs/2026-05-09-pitch-deck-redesign.md). All `[POD-PD]`-tagged rows below are addressed by this spec. |
```

Re-tag the affected `[POD-VAL]` rows to `[POD-PD]` if they're Stage-2-specific (Stage 3 valuation entries stay `[POD-VAL]` until that pod opens).

- [ ] **Step 3: Update tour copy entries that depend on Stage 2 names**

Stage 2 section names from the redesign:
- "Setup & Situation," "Business Quality," "Industry & Competitive Position," "Financial Analysis," "Management & Capital Allocation," "Valuation," "Risk Profile," "Investment Verdict"

Any tour-copy row referencing the old names (Radar, Simple & Predictable, etc.) gets updated.

- [ ] **Step 4: Commit**

```bash
git add W2-PUNCHLIST.md
git commit -m "docs: resolve POD-PD (Stage 2) entries in W2 punch list"
```

---

### Task 24: Update STEPS.md status

**Files:**
- Modify: `STEPS.md`

- [ ] **Step 1: Find the Phase 2B brainstorm pods section**

In `STEPS.md`, the "Brainstorm pods (run in parallel — each deserves its own session)" subsection lists the four pods. Pod #4 (Final Thesis) is marked `[x]`. Pod #2 (Valuation methods) and Pod #1 (Thesis Score) and Pod #3 (Guru list) are still `[ ]`.

- [ ] **Step 2: Add a Pitch Deck redesign entry**

The Pitch Deck redesign was not originally listed as one of the four pods — it's a Stage-2 sibling of Pod #4 that emerged during this brainstorm. Add it as a new bullet:

```markdown
- [x] **Pitch Deck (Stage 2 redesign) — spec locked 2026-05-09.** See [docs/specs/2026-05-09-pitch-deck-redesign.md](docs/specs/2026-05-09-pitch-deck-redesign.md). Implementation in [docs/plans/2026-05-09-pitch-deck-redesign-plan.md](docs/plans/2026-05-09-pitch-deck-redesign-plan.md).
```

- [ ] **Step 3: Update the Phase 2B watchouts list**

In the Watchouts section of STEPS.md, the entry "KEY_NORMALIZATION lives in PitchDeck.jsx + FullStory.jsx with different aliases" is resolved by Task 17. Update the line:

```markdown
- ~~**`KEY_NORMALIZATION` lives in PitchDeck.jsx + FullStory.jsx**~~ — **resolved** as part of pitch-deck redesign (2026-05-09): consolidated to `src/utils/keyNormalization.js`.
```

- [ ] **Step 4: Commit**

```bash
git add STEPS.md
git commit -m "docs: STEPS.md — log pitch-deck redesign spec + plan, resolve KEY_NORMALIZATION watchout"
```

---

### Task 25: Final verification pass

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 2: Run the vocab lint**

Run: `npm run lint:vocab`
Expected: zero violations.

- [ ] **Step 3: Run the regular lint**

Run: `npm run lint`
Expected: zero errors. Warnings OK.

- [ ] **Step 4: Run the dev server smoke test**

Run: `npm run dev`. Open the app. Navigate to the Pitch Deck for AAPL (or COST). Verify the UI renders correctly:
- 7 top-level sections
- Verdict boxes throughout
- Accounting Red Flags subsection visible under Financial Analysis
- Investment Verdict ends with Pre-Decision Quality Check
- Toolbox valuation tab uses "Fair Value" labels

Stop the dev server.

- [ ] **Step 5: Final git status check**

```bash
git status
```

Expected: clean working tree. All redesign commits are landed.

- [ ] **Step 6: Push (deferred per CLAUDE.md)**

Per `CLAUDE.md`'s "Don't push to GitHub" rule (Phase 1 constraint that's still in effect): **do NOT push.** The squash-and-push happens at the end of the rebrand.

This task is verification only — no commit.

---

## Out-of-band: Spec amendments

If during implementation you discover a spec gap or a wrong assumption, do NOT silently change behavior. Open a small spec amendment block at the bottom of [docs/specs/2026-05-09-pitch-deck-redesign.md](../specs/2026-05-09-pitch-deck-redesign.md) under a new `## Amendments` heading, dated and signed. Log the change there before implementing it.

Example:
```markdown
## Amendments

### 2026-05-XX — Field rename clarification

The spec said `data.ownerEarnings.ruleOneMethod` → `buffettMethod`. Discovered during implementation
that the FT spec's matching block uses `valueInvestingMethod`. Updated this spec to align: rename
becomes `ruleOneMethod` → `valueInvestingMethod` (matching FT) instead of `buffettMethod`. Both
specs now use `valueInvestingMethod`.
```

This keeps the spec the source of truth and avoids spec/code drift.
