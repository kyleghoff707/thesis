# W2 + W5 Completion Spec — Phase 2B Closeout

**Status:** Locked 2026-05-10
**Closes:** STEPS.md Phase 2B remaining items (W2 semantic UI rewrite + W5 code/doc cleanup)
**Implementation status:** Pending — execution begins immediately after spec lock
**Unblocked by:** all five brainstorm pods now resolved (POD-SCORE, POD-PD, POD-VAL, POD-GURU, POD-FS)

---

## What this is

A locked spec consolidating the two final Phase 2 workstreams — W2 (semantic UI rewrite) and W5 (code/doc cleanup, expanded to absorb audit findings beyond the original STEPS.md bullet list). Once shipped, Phase 2 is complete and the repo can move to Phase 3 (portability).

The brainstorm session that produced this spec surfaced one cross-cutting nomenclature decision (Sticker → Full Price; Buy → On Sale) that doesn't fit cleanly under either workstream — it cascades through agent prompts, UI, lint-vocab, and tests. Treated as its own implementation step alongside W2/W5.

---

## Locked decisions

### 1. Score-badge surface

- **CompanyHeader:** composite Thesis Score badge only. Drop the `Moat` / `Mgmt` sub-badges (they reflect the retired Big-5 + Four-Ms dichotomy).
- **Thesis Score dropdown / detail view:** show all 4 pillars (Compounding, Capital Efficiency, Capital Allocation, Resilience) as established by [POD-SCORE](2026-05-09-thesis-score-redesign.md).
- **Competitors columns dropdown:** add the 4 pillars as toggleable column options. Default-checked: `Thesis Score`, `Compounding`, `Capital Efficiency`. Default-unchecked: `Capital Allocation`, `Resilience`. The existing column-toggle UI on the Competitors tab is reused; no new feature scope.

### 2. Final Thesis name lock

The Stage 3 stage is renamed from **Full Story** → **Final Thesis** across all surfaces. Cascade includes:

- Component file: `src/components/FullStory.jsx` → `FinalThesis.jsx`
- Hook file: `src/hooks/useFullStory.js` → `useFinalThesis.js`
- Skill folder: `.claude/skills/generate-full-story/` → `.claude/skills/generate-final-thesis/`
- Internal stage keys (e.g. `'fullStory'` in component state, route paths, button labels)
- All UI copy: dialog titles, empty states, button labels, generation progress labels, tour copy
- Documentation: `STEPS.md` Phase 2 narrative + `CLAUDE.md` pipeline section

Done as one atomic commit so the tree is never half-renamed.

### 3. Cross-stage terminology cascade — Sticker → Full Price; Buy → On Sale

- **General "sticker price" references → "Full Price"** (both One Pager, Pitch Deck, Final Thesis prompts; UI; tests; lint-vocab). "Sticker price" is an R1-coined term and must be eliminated.
- **General "buy price" references → "On Sale Price"** OR **"Buy Price"** (both terms public-domain and acceptable; treat as interchangeable approved vocabulary).
- **Calculator method names ("10 Cap", "Margin of Safety", "Payback Time", "Equity Bond") — UNCHANGED.** These are public-domain methodology names and stay as section headers in `ValuationCalculators.jsx`. Only output row labels rename.
- **POD-PD's interim "Fair Value" rename cascades to "Full Price"** for cross-stage consistency. (Stage 2 redesign used "Fair Value" as the placeholder; locked rename is now "Full Price".)
- **`scripts/lint-vocab.mjs`:** remove "Sticker price" / "sticker price" from the approved list, add "Full Price" / "On Sale" / "Buy Price" as approved vocabulary, add "Sticker price" to the **forbidden** list to prevent regression.

### 4. W5 expanded scope

The original STEPS.md bullet listed four cleanup items. Audit surfaced more; expanded scope is approved.

| Item | Files | Disposition |
|---|---|---|
| `sliceDataPacket()` duplicated | `src/schemas/dataPacket.js`, `src/utils/sliceDataPacket.js` | Drop the schema-side version; keep the utils version (production path). Update `src/schemas/__tests__/reportSection.test.js` + `src/engines/__tests__/dataExport.test.js` to import from utils. |
| `theme.js:1` comment | `src/theme.js` | Rewrite to drop `stickeR1`-pun + lowercase "value investing". |
| "Rulers" terminology | 9 agent prompts, 14 occurrences | Replace with neutral terms: "value investors", "we", "investors", or rephrase per context. |
| "R1 moat types" — branding violation | `agents/competitor-evaluator-finalthesis/prompt.md:518,541,661` | Rewrite to "moat types" / "the six moat types". Hard branding-rule violation. |
| Sentence-start lowercase "value investing" | ~12 agent prompts, ~30 occurrences | Capitalize or rephrase ("Value investing rejects…" or "The value investor rejects…"). |
| `.claude/settings.local.json:66` | curl User-Agent `Thes1s/1.0` | Replace with `Thesis/1.0`. |
| CLAUDE.md stale claims (3-layer XBRL, 8-tab Toolbox) | already removed in Phase 1 rewrite | No-op; verified absent. |
| `edgarFinancials.js` Layers 2 & 3 | dormant imports + commented blocks | **KEEP AS-IS.** Reactivation deferred to a possible future decision. |

---

## Out of scope

- **`docs/specs/*.md` and `docs/plans/*.md` historical artifacts.** Locked spec snapshots; treat as historical. The whole `docs/` directory will be added to `.gitignore` before the public push (separate pre-publish step, not part of this spec).
- **Toolbox refactor** (the 700-line god component). Tracked under Phase 5 polish.
- **Industry taxonomy file rename** (`industry-classification/` → final name TBD). Tracked under Phase 3 portability.
- **`engines/edgarFinancials.js` Layers 2 & 3 disposition.** User decided to keep dormant for possible future reactivation; no rip-out.
- **Backwards-compat fixture map** for the Sticker → Full Price rename. Not adding a `LEGACY_KEY_MAP` — fixtures regenerate from current pipeline runs. Old PDFs/DOCX in `~/.thesis/reports/` from prior runs will display old terminology; users regenerate as needed.

---

## Execution order

Sequenced to minimize re-edits of the same file:

### Step 1 — W5 mechanical sweep (low-risk, no naming decisions)
1. `src/theme.js:1` comment cleanup
2. `.claude/settings.local.json:66` User-Agent fix
3. `sliceDataPacket()` dedup — drop schema version, update test imports
4. Agent-prompt residue: "Rulers" → neutral, "R1 moat types" → "moat types", lowercase "value investing" → capitalized

### Step 2 — Terminology cascade (Sticker → Full Price, Buy ↔ On Sale)
1. Sweep all 22 agent prompts for "Sticker price" → "Full Price"
2. Sweep `src/components/ValuationCalculators.jsx`, `Valuation.jsx`, `HistoricalBuyPrices.jsx` for output-row label updates
3. Update `scripts/lint-vocab.mjs` + `scripts/__tests__/lint-vocab.test.js` (allowlist + forbidden-list)
4. Run lint-vocab; fix any new violations surfaced

### Step 3 — Final Thesis rename (atomic commit)
1. File renames: `FullStory.jsx` → `FinalThesis.jsx`, `useFullStory.js` → `useFinalThesis.js`, `.claude/skills/generate-full-story/` → `.claude/skills/generate-final-thesis/`
2. Internal state-key renames (`'fullStory'` → `'finalThesis'`)
3. UI copy: dialog titles, empty states, button labels, progress labels
4. `STEPS.md` + `CLAUDE.md` doc updates (close the "rename TBD" parenthetical)
5. Update all importers

### Step 4 — W2 semantic surface (the remaining UI copy that was waiting on pods)
1. `tourSteps.js` — full rewrite of all 9 steps to match new methodology (4-pillar score, Final Thesis name, Pitch Deck redesign sections, neutral "investors")
2. `CompanyHeader.jsx` — drop Moat/Mgmt sub-badges; keep composite Thesis Score only
3. `Competitors.jsx` columns: add 4 pillars to dropdown options; set defaults (Thesis + Compounding + Capital Efficiency checked; Capital Allocation + Resilience unchecked)
4. `PitchDeck.jsx` section keys + labels — align with POD-PD's 7 top-level sections
5. `ConfirmGenerateDialog.jsx` Final Thesis copy
6. `GenerationProgressPanel.jsx` "Bull thesis / Bull rebuttal / Composition" labels — verify match POD-FS structure

### Step 5 — Verification
1. `npm test` (1267+ unit tests must pass)
2. `npm run build` (no broken imports after renames)
3. `node scripts/lint-vocab.mjs` (zero R1 violations across 9+ scanned files)
4. Manual grep sweep: `grep -rni "rule one\|rule 1\|R1\|phil town\|sticker price\|rulers\|thes1s"` — should return zero hits outside `gurusList.js`, the closed-product `stock-analyzer/` reference, and explicitly-allowlisted strings.
5. `npm run dev` smoke test — open Costco/Apple report, confirm CompanyHeader shows single badge, Competitors dropdown defaults match spec, all stage names read "Final Thesis".

---

## Verification gates

Each step ships only after its acceptance criteria pass:

- **Step 1:** `grep -rni "rulers\|R1 moat" agents/` → zero hits.
- **Step 2:** `grep -rni "sticker price" agents/ src/ scripts/` → zero hits; `node scripts/lint-vocab.mjs` exits 0.
- **Step 3:** `grep -rni "fullstory\|full story\|FullStory" src/ .claude/ agents/` → zero hits except code referring to historical files (e.g. STEPS.md narrative). `npm run build` succeeds.
- **Step 4:** Manual UI dogfood on COST + AAPL — single Thesis Score badge on header, default-checked Competitors columns match spec, tour copy reads cleanly with no Big-5 / Moat-Mgmt phrasing.
- **Step 5:** Full test suite passes, lint passes, manual smoke clean.

---

## Commit strategy

Five commits, one per step:

1. `chore(w5): mechanical cleanup — Rulers, R1 moat types, theme comment, sliceDataPacket dedup`
2. `refactor: cascade Sticker → Full Price, Buy ↔ On Sale terminology across stages`
3. `refactor: rename Full Story → Final Thesis (atomic file/folder/copy cascade)`
4. `feat(w2): semantic UI rewrite — 4-pillar score badges, tour copy, pitch-deck section labels`
5. `chore: STEPS.md — close Phase 2B; W2 + W5 complete`

No commit pushed to GitHub remote (per Phase 1 constraint — repo stays empty until end-of-rebrand squash-and-push).
