# Executive Compensation Engine — Bug Fix Implementation Plan

## Context

A 30-company audit of the Executive Compensation section revealed 11 systemic bugs in the compensation parsing engine (`src/engines/compensation.js`). The engine parses SEC DEF 14A proxy statement HTML to extract Summary Compensation Tables and Director Compensation Tables, with an ECD XBRL fallback for FY2022+ filings.

**Impact:** 27 of 30 companies had at least one issue. The two most critical bugs — column misalignment (9 companies) and name/title concatenation (11 companies) — make the compensation data unreliable for the majority of companies. This must be fixed before AI report generation (Phase 5+) can reference compensation data.

**All changes target a single file:** `src/engines/compensation.js` (~1343 lines), plus a new test file.

---

## Bug Summary

| # | Bug | Severity | Companies Affected | Root Cause |
|---|-----|----------|-------------------|------------|
| 1 | Total column misaligned | CRITICAL | 9/27 (TXRH, ODFL, EW, BOOT, AMZN, GOOGL, JPM, NVDA, SFM) | Sequential column mapping drifts when header/data rows have different spacer counts |
| 2 | Name + title concatenated | CRITICAL | 11/27 (AAPL, MSFT, GOOGL, JPM, NVDA, WFC, MLI, SFM, O, EQIX, BA) | `extractNameTitle()` only splits on `<br>`, not `<p>`/`<div>` or keyword boundaries |
| 3 | Duplicate executive entries | HIGH | 6/27 (AAPL, GOOGL, NVDA, WFC, SFM, CMG) | `normalizeExecName()` can't match names with titles appended (depends on Bug 2) |
| 4 | Non-names parsed as executives | HIGH | 5/27 (NVDA, ODFL, MU, EW, BA) | `looksLikeName()` too permissive — allows title fragments and year strings |
| 5 | HTML entities not decoded | MEDIUM | 5/27 (AAPL, MSFT, AMZN, BA, EQIX) | `cellText()` doesn't strip literal `&nbsp;`/`&amp;` strings |
| 6 | Missing executive titles | MEDIUM | All HTML-sourced | Same root cause as Bug 2 |
| 7 | Footnote artifacts in names | MEDIUM | 5/27 (MSFT, JPM, COST, XOM, CMG) | Only parenthesized `(1)` stripped, not bare trailing digits or `*` |
| 8 | MET shows TXRH data (cache) | CRITICAL | 1/27 (MET) | Corrupted cache entry; cache version bump fixes |
| 9 | Missing directors | HIGH | 3/27 (AMZN, JPM, BRK-B) | Director table heading patterns too narrow |
| 10 | CEO pay ratio misparse | LOW | 1/27 (MLI) | Regex matches year "2024" as ratio number |
| 11 | XBRL companies show low values | MEDIUM | 4/27 (JNJ, COST, BA, EQIX) | HTML parser found garbled data so XBRL fallback never triggered |

---

## Implementation Waves

### Wave 1 — Text Processing Foundation (Bugs 5, 7, 2, 6)

These must land first because Bugs 3 and 4 depend on clean name extraction.

#### Step 1.1: HTML entity decoding (Bug 5)

**Function:** `cellText()` at line ~151

Add to the replacement chain:
```js
.replace(/&nbsp;/gi, ' ')
.replace(/&amp;/g, '&')
```

Apply same replacements in the `cleanPart` lambdas inside `extractNameTitle()` and `extractNameFromBlockTags()`.

#### Step 1.2: Footnote artifact stripping (Bug 7)

**Function:** `extractNameTitle()` at line ~285

After existing `\(\d+\)` stripping, add:
- Strip trailing bare footnote digits: `.replace(/(\w)\d{1,2}$/g, '$1')` — handles "Hoffman4", "Pinto7"
- Strip trailing footnote symbols: `.replace(/[*\u2020\u2021\u00a7\u00b6]+$/g, '')`
- Strip trailing lettered footnote refs: `.replace(/\s*\([a-z]\)\s*$/gi, '')` — handles "(a)", "(c)"

Also apply same stripping to `rawName` in `parseDirectorCompensationTable()` at line ~630.

#### Step 1.3: Name/title splitting overhaul (Bug 2 + Bug 6)

**Function:** `extractNameTitle()` at line ~285

Three-stage extraction strategy:

1. **Stage A (existing):** Split on `<br>` tags
2. **Stage B (expand):** If Stage A produces only 1 part, also split on block-level tag transitions (`</p><p>`, `</div><div>`, standalone `<p>`, `<div>` tags) — **merge the block-tag logic from `extractNameFromBlockTags()` directly into `extractNameTitle()`**, then **delete `extractNameFromBlockTags()` entirely** (DRY — it's only called in 2 places, both reachable from `extractNameTitle`'s callers)
3. **Stage C (new):** If Stage B still produces only 1 part, try keyword-boundary splitting — scan the cleaned text for the first `TITLE_KEYWORDS` match occurring after at least 3 chars, split there. Handles "James DimonChairman and CEO" → name="James Dimon", title="Chairman and CEO". Also handles "Daniel Pinto7President" (after footnote stripping from Step 1.2, becomes "Daniel PintoPresident" → split at "President").

Update the 2 call sites (lines ~521 and ~455) that previously called `extractNameFromBlockTags()` to use the unified `extractNameTitle()` directly.

**Bug 6 (missing titles) resolves automatically** — same root cause as Bug 2.

---

### Wave 2 — Column Alignment (Bug 1)

The highest-impact fix. Replaces the core data extraction mechanism.

#### Step 2.1: Physical column position tracking

**New helper function:**
```js
function getPhysicalColumns(row) {
  const cells = getDirectCells(row);
  const result = [];
  let colPos = 0;
  for (const cell of cells) {
    const colspan = parseInt(cell.getAttribute('colspan')) || 1;
    result.push({ cell, startCol: colPos, endCol: colPos + colspan - 1 });
    colPos += colspan;
  }
  return result;
}
```

#### Step 2.2: Header mapping by physical position

**Function:** `matchColumns()` at line ~226

Change from content-cell index mapping to physical column position mapping. Instead of `mapping[key] = contentCellIndex`, store `mapping[key] = physicalColumnPosition`.

#### Step 2.3: Data extraction by physical position

**Function:** `parseSummaryCompensationTable()`, data loop at lines ~564-571

Replace sequential mapping with physical column position matching:
1. For each data row, compute physical column positions via `getPhysicalColumns()`
2. Build a `Map<physicalCol, cell>` for non-spacer cells
3. For each header mapping entry, find the data cell at that physical column position
4. Handle continuation rows (rowspan) by computing the offset from the missing name cell's colspan

Apply same approach to `parseDirectorCompensationTable()` at lines ~636-643.

#### Step 2.4: Remove `buildColumnSequence()`

No longer needed — column order is tracked by physical position, not sequential index. Keep the function but mark as deprecated (or remove if nothing else references it).

---

### Wave 3 — Validation & Dedup (Bugs 4, 3, 11, 8)

#### Step 3.1: Strengthen name validation (Bug 4)

**Function:** `looksLikeName()` at line ~262

Add rejection rules:
- Common title fragments appearing standalone: "of the", "and", "security", "technology", "operations", "global", "group", "corporate", "business", "former", "interim", "division", "products", "services"
- Require at least 2 word-parts (first + last name minimum)
- Reject all-uppercase abbreviations ≤5 chars (e.g., "EVP")

Add post-parse filter after line ~588: remove executives whose names still fail `looksLikeName()` after extraction.

#### Step 3.2: Improve dedup matching (Bug 3)

**Function:** `findExecMatch()` at line ~345

After Bug 2 fix, most duplicates resolve naturally. Add tertiary matching strategy:
- If last names match AND first names share 4+ leading chars, merge

Add post-merge dedup pass in `mergeCompensationData()` to catch remaining duplicates.

#### Step 3.3: Low-value fallback trigger (Bug 11)

**Function:** `fetchAndParseProxy()` at line ~937

After HTML parsing, if all executive totals have a median below $50K, log a warning and clear the executives list to trigger the XBRL fallback. This catches cases where Bug 1's column misalignment produced extractable but garbage data.

#### Step 3.4: Cache version bump (Bug 8)

**Constant:** `COMP_CACHE_V` at line ~24

Change from `'v2'` to `'v3'`. This single change invalidates all stale cached data (both per-filing and per-ticker caches), forcing re-parse with the fixed parser. No migration code needed — old `v2` keys are simply never read again.

---

### Wave 4 — Edge Cases (Bugs 9, 10)

#### Step 4.1: Expand director heading patterns (Bug 9)

**Function:** `findDirectorCompensationTable()` at line ~595

Add heading patterns: "non-management director", "compensation paid to non-employee", "director summary compensation", "outside director"

Add table-text patterns: "non-employee director", "compensation paid to directors"

#### Step 4.2: Fix pay ratio regex (Bug 10)

**Function:** `parseCeoPayRatio()` at line ~659

Add negative lookahead `(?!20\d{2}\b)` to pattern 4 to reject year-like numbers. Also add year-range rejection to the validation: reject ratios between 2020-2035.

---

## Test Plan

**New file:** `src/engines/__tests__/compensation.test.js`

**Environment:** `// @vitest-environment jsdom` (needed for DOMParser)

**Pattern:** Follow `edgarFinancials.test.js` — mock `edgar.js` and `cache.js`, export internal functions via `_testExports`.

**Step 0:** Add `_testExports` object at the bottom of `compensation.js` exporting all internal functions for testing.

**DOM test helpers:**
```js
function makeCell(html) {
  const doc = new DOMParser().parseFromString(`<table><tr>${html}</tr></table>`, 'text/html');
  return doc.querySelector('td') || doc.querySelector('th');
}
```

### Test Groups

| Describe Block | Tests | Covers |
|---------------|-------|--------|
| `cellText` | Strips `&nbsp;`, `&amp;`, zero-width chars | Bug 5 |
| `extractNameTitle` | Splits on `<br>`, `<p>`, `<div>`, keyword boundary; strips footnotes | Bugs 2, 6, 7 |
| `looksLikeName` | Accepts valid names, rejects fragments/years/abbreviations | Bug 4 |
| `normalizeExecName` | Strips initials, footnotes; lowercases | Bug 3 |
| `findExecMatch` | Exact, fuzzy, tertiary matching | Bug 3 |
| `physical column mapping` | Standard table, mismatched spacers, colspan headers, continuation rows | Bug 1 |
| `parseSummaryCompensationTable` | Full table parse with various layouts | Bug 1 |
| `parseDirectorCompensationTable` | Standard + non-standard headings, footnote stripping | Bugs 7, 9 |
| `parseCeoPayRatio` | Valid patterns, year rejection | Bug 10 |
| `mergeCompensationData` | Cross-filing merge, dedup, most-recent-wins | Bug 3 |
| `low-value fallback` | Triggers XBRL when median total < $50K | Bug 11 |

### Integration Tests (HTML Fixture Tables)

3 end-to-end tests feeding realistic HTML tables into `parseSummaryCompensationTable()`:

1. **Standard layout** — mimics AAPL/META format: `<br>` between name and title, year column, 7 comp columns, spacer cells between each. Verify all fields map correctly.
2. **Mismatched spacers** — mimics ODFL/TXRH format: header has 3 spacer cells, data rows have 5. Verify total column reads the correct cell (not a footnote number).
3. **Rowspan names** — mimics JPM/WFC format: name cell with `rowspan=3`, 3 continuation rows for years 2022-2024. Verify all years map to the same executive with correct field values.

---

## Verification

After all fixes, clear the browser's IndexedDB (`comp-data` store) and re-test these 30 companies:

**Column alignment (Bug 1):** TXRH, ODFL, EW, BOOT, AMZN, GOOGL, JPM, NVDA, SFM — verify CEO total matches SEC filing

**Name/title (Bugs 2, 6, 7):** AAPL, MSFT, GOOGL, JPM, NVDA, WFC, MLI, SFM — verify clean names with separate titles

**Dedup (Bug 3):** AAPL, GOOGL, NVDA, WFC, SFM — verify no duplicate entries

**Non-names (Bug 4):** NVDA, ODFL, MU, EW, BA — verify no title fragments as names

**Directors (Bug 9):** AMZN, JPM — verify director count > 0

**Cache (Bug 8):** MET — verify MetLife data, not TXRH

**Pay ratio (Bug 10):** MLI — verify ratio is not "2024"

**Working companies stay working:** META, UNH, LULU, BRK-B — verify no regressions

---

## Files Modified

| File | Changes |
|------|---------|
| `src/engines/compensation.js` | All 11 bug fixes + `_testExports` |
| `src/engines/__tests__/compensation.test.js` | New file — comprehensive test suite |

## Implementation Order

1. Create test file with failing tests for all bugs
2. Add `_testExports` to `compensation.js`
3. Wave 1 fixes (entity decoding, footnotes, name/title splitting)
4. Wave 2 fix (physical column alignment)
5. Wave 3 fixes (name validation, dedup, low-value fallback, cache bump)
6. Wave 4 fixes (director headings, pay ratio regex)
7. Run full test suite — all tests pass
8. Manual verification on dev server across 30 companies

---

## Eng Review Decisions

Decisions made during /plan-eng-review on 2026-03-21:

1. **Bug 1 approach:** Physical column positions via colspan (option A) — most robust, handles multi-span headers and irregular structures
2. **Bug 11 safety net:** Keep the $50K median fallback trigger (option A) — defense in depth, zero performance cost
3. **DRY cleanup:** Merge `extractNameFromBlockTags()` into `extractNameTitle()`, delete standalone function (option A) — one function, clear 3-stage pipeline
4. **Footnote regex:** Use proposed `(\w)\d{1,2}$` regex (option A) — handles all observed cases, negligible false positive risk
5. **Integration tests:** Add 3 HTML fixture integration tests (option A) — catches integration bugs between `matchColumns()` and `parseSummaryCompensationTable()`

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 4 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement

---

## Implementation Results (2026-03-21)

**Status: COMPLETE** — All 11 bugs fixed, all tests passing, build succeeds.

### Test Results

| Metric | Result |
|--------|--------|
| New compensation tests | **47/47 pass** |
| All engine tests | **377/377 pass** (11 test files, 0 regressions) |
| Production build | **Succeeds** |
| Cache version | Bumped v2 → v3 |

### What Was Implemented

| Wave | Bugs | Changes |
|------|------|---------|
| **Wave 1** | 5, 7, 2, 6 | `cellText()` decodes `&nbsp;`/`&amp;` entities. New `stripFootnoteArtifacts()` strips trailing digits, symbols, lettered refs. `extractNameTitle()` rewritten with 3-stage pipeline: `<br>` → `<p>`/`<div>` → keyword-boundary splitting. `extractNameFromBlockTags()` deleted (merged into extractNameTitle). |
| **Wave 2** | 1 | New `getPhysicalColumns()` + `buildPhysicalCellMap()` helpers. `matchColumns()` returns physical column positions (not content-cell indices). `parseSummaryCompensationTable()` + `parseDirectorCompensationTable()` extract data by physical position — handles mismatched spacer counts. `buildColumnSequence()` removed. |
| **Wave 3** | 4, 3, 11, 8 | `looksLikeName()` requires 2+ words, rejects title fragments, uppercase abbreviations, uses word-boundary matching for TITLE_KEYWORDS. `findExecMatch()` adds tertiary matching (last name + first 4 chars). `mergeCompensationData()` adds post-merge dedup pass. `fetchAndParseProxy()` clears executives when median total < $50K (XBRL fallback trigger). Cache bumped v2→v3. |
| **Wave 4** | 9, 10 | `findDirectorCompensationTable()` adds 5 new heading/table-text patterns. `parseCeoPayRatio()` adds year-range rejection (2020-2035) + negative lookahead. |

### Deviations from Plan

1. **TITLE_KEYWORDS word-boundary matching:** The plan's `looksLikeName()` used `lower.includes(kw)` for keyword checks, but this caused false positives — "Tim Cook" was rejected because "cook" contains the substring "coo" (a TITLE_KEYWORD). Fixed by switching to regex word-boundary matching (`\b`).
2. **Stage C keyword length filter:** Stage C keyword-boundary splitting in `extractNameTitle()` filters to keywords ≥5 chars to avoid false splits from short abbreviations (ceo, cfo, coo, etc.) appearing as substrings within names. Short keywords would match inside names like "Cook" (contains "coo") or "Viceroy" (contains "vice").
3. **`jsdom` dev dependency:** Added as a dev dependency — required by the `@vitest-environment jsdom` directive for DOMParser in tests.

### Remaining: Manual Verification

Clear the browser's IndexedDB (`comp-data` store) and re-test these 30 companies on the dev server:

- **Column alignment (Bug 1):** TXRH, ODFL, EW, BOOT, AMZN, GOOGL, JPM, NVDA, SFM
- **Name/title (Bugs 2, 6, 7):** AAPL, MSFT, GOOGL, JPM, NVDA, WFC, MLI, SFM
- **Dedup (Bug 3):** AAPL, GOOGL, NVDA, WFC, SFM
- **Non-names (Bug 4):** NVDA, ODFL, MU, EW, BA
- **Directors (Bug 9):** AMZN, JPM
- **Cache (Bug 8):** MET
- **Pay ratio (Bug 10):** MLI
- **No regressions:** META, UNH, LULU, BRK-B
