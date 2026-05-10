# W2 — UI Copy Punch-List (Phase 2B — RESOLVED 2026-05-10)

**Status:** ✅ Closed. All `[POD-SCORE]`, `[POD-PD]`, `[POD-FS]`, `[POD-GURU]`, and `[INDEP]` items addressed by the W2 semantic rewrite shipped on 2026-05-10. See [docs/specs/2026-05-10-w2-w5-completion.md](docs/specs/2026-05-10-w2-w5-completion.md) and the updated [STEPS.md](STEPS.md#phase-2b--complete-2026-05-10) Phase 2B section. This file is preserved as a historical inventory of the rewrite scope.

See [STEPS.md](STEPS.md) Phase 2B for the broader migration context.

---

## Legend

| Tag | Unblocked when… |
|---|---|
| `[POD-SCORE]` | **RESOLVED 2026-05-09** — see [docs/specs/2026-05-09-thesis-score-redesign.md](docs/specs/2026-05-09-thesis-score-redesign.md). All `[POD-SCORE]`-tagged rows below are addressed by the v2 engine + UI swap. |
| `[POD-PD]` | **RESOLVED 2026-05-09** — see [docs/specs/2026-05-09-pitch-deck-redesign.md](docs/specs/2026-05-09-pitch-deck-redesign.md). All `[POD-PD]`-tagged rows below are addressed by this spec. |
| `[POD-VAL]` | Valuation methods brainstorm decides which calculators stay, drop, or get reworked (Stage 3 valuation only — Stage 2 valuation labels are now `[POD-PD]`) |
| `[POD-GURU]` | Guru list rebuild produces the new criteria + curated 13F filer list |
| `[POD-FS]` | Full Story redesign locks the rename + structural changes |
| `[INDEP]` | Not pod-blocked. Safe to rewrite anytime in Phase 2B (or skip if it's already fine) |

---

## 1. Tour & onboarding

File: [src/components/tourSteps.js](src/components/tourSteps.js)

| Line | String (verbatim, short) | Why methodology-laden | Tag |
|---|---|---|---|
| 12 | "Your AI analyst team is ready. You're the portfolio manager — Thesis does the 40+ hours of value investing research…" | Frames the user as a thesis-driven portfolio manager — fine in spirit, but "value investing research" framing should align with whatever methodology pods land on | `[INDEP]` |
| 20 | "Watchlists … Research … Gurus … Reports for your AI-generated investment theses" | "investment theses" presumes thesis-driven workflow | `[POD-FS]` |
| 36 | "colored score badges on the right — Thesis Score, Moat, and Management — are computed from 10 years of SEC EDGAR filings" | "Moat" / "Management" are Four Ms framework labels; the inputs/weights described will change with the new score | `[POD-SCORE]` |
| 45 | "Three scores at a glance. The overall Thesis Score combines Moat (growth rate quality across BVPS, EPS, revenue, and operating cash flow) and Management (return on equity, return on invested capital, and debt levels)…" | Names the exact Rule-One inputs (Big Five rates, ROE/ROIC/Debt) and the Moat/Management dichotomy | `[POD-SCORE]` |
| 53 | "Valuation for buy price calculators" | Stage 2 Toolbox valuation tab — redesign keeps 4 calculators (MOS / Payback Time / Ten Cap / Equity Bond) and renames buy-price output to "Fair Value" | `[POD-PD]` |
| 61 | "One Pager (quick screen), Pitch Deck (deep research), and Full Story (conviction thesis)" | "Full Story" name + "conviction thesis" framing depend on the rename decision | `[POD-FS]` |
| 69 | "stage pills: green means approved, teal means generated and ready for your review, gray means not yet generated, and dimmed means locked until the previous stage is approved" | Approval-gating language fine; the stage NAMES referenced will change | `[POD-FS]` |
| 85 | "See what the world's top investors are buying and selling. … gurus have different time horizons and strategies" | "gurus" terminology + framing of which investors are featured | `[POD-GURU]` |
| 117 | "Go find your first thesis" | Wrap-up CTA depends on whether the Full Story is renamed to "thesis", "memo", "brief", etc. | `[POD-FS]` |

---

## 2. Generate dialogs

File: [src/components/ConfirmGenerateDialog.jsx](src/components/ConfirmGenerateDialog.jsx)

| Line | String | Why | Tag |
|---|---|---|---|
| 6 | `title: "Generate One Pager for ${ticker}"` | Stage name; fine if One Pager stays named | `[INDEP]` |
| 8 | "This kicks off an AI research pipeline. The One Pager is a screening filter -- only generate for companies you're seriously considering as investment targets." | Generic enough; no methodology-specific language | `[INDEP]` |
| 13 | `title: "Generate Pitch Deck for ${ticker}"` | Stage name | `[INDEP]` |
| 15 | "This is a deep 10-section business analysis generated across 3 waves." | Pipeline structure description; fine | `[INDEP]` |
| 20 | `title: "Generate Full Story for ${ticker}"` | Depends on Full Story rename | `[POD-FS]` |
| 22 | "This is the final conviction gate. Includes checklists, adversarial debate, and valuation confirmation." | "conviction gate", "checklists", "adversarial debate", "valuation confirmation" all describe the Full Story's specific Rule-One-shaped structure | `[POD-FS]` |

---

## 3. Section / stage labels

### PitchDeck section keys

File: [src/components/PitchDeck.jsx](src/components/PitchDeck.jsx)

| Line | String | Why | Tag |
|---|---|---|---|
| 39 | `{ key: 'simple_predictable', label: 'Simple & Predictable', phase: 1 }` | Rule-One principle | `[POD-SCORE]` |
| 40 | `{ key: 'market_position', label: 'Market Position', phase: 1 }` | Generic on its own; flag because adjacent to Four Ms section labels | `[POD-SCORE]` |
| 41 | `{ key: 'barriers_moats', label: 'Barriers & Moats', phase: 2 }` | Four Ms framework label | `[POD-SCORE]` |
| 43 | `{ key: 'management', label: 'Management', phase: 2 }` | Four Ms framework label | `[POD-SCORE]` |
| 46 | `{ key: 'pest', label: 'PEST Risks', phase: 3 }` | Specific risk-framework choice | `[INDEP]` |
| 47 | `{ key: 'valuation', label: 'Valuation', phase: 3 }` | Stage 2 section — redesign retains "Valuation" as one of 7 top-level sections; content uses 4 calculators with "Fair Value" output naming | `[POD-PD]` |
| 50–55 | `Phase 1: Business Fundamentals`, `Phase 2: Financial Deep-Dive`, `Phase 3: Risk & Valuation`, `Final: Synthesis` | Generic — likely fine to keep | `[INDEP]` |

### FullStory section keys

File: [src/components/FullStory.jsx](src/components/FullStory.jsx)

| Line | String | Why | Tag |
|---|---|---|---|
| 73–77 | `Meaning Checklist` (73), `Moat Checklist` (74), `Management Checklist` (75), `Inversion & Rebuttal` (77) | Four Ms checklists + adversarial debate are core Full Story structure | `[POD-FS]` |
| 83 | `'Phase 2: The Debate'` | "The Debate" is the bull/bear adversarial framework | `[POD-FS]` |
| 93 | `WAVE_2_RUNNING: 'Phase 2: The Debate...'` | Same string in progress state | `[POD-FS]` |
| 555 | "No Full Story generated yet" | Stage name in empty-state copy | `[POD-FS]` |
| 576 | `{generating ? 'Generating...' : 'Generate Full Story'}` | Stage name in button | `[POD-FS]` |

---

## 4. Score badges & company header

File: [src/components/CompanyHeader.jsx](src/components/CompanyHeader.jsx)

| Line | String | Why | Tag |
|---|---|---|---|
| 117 | `<ScoreBadge label="Thesis Score" score={thesisScore} large />` | Score name (already renamed from "Rule #1 Score" → "Thesis Score" mechanically; final naming depends on POD-SCORE) | `[POD-SCORE]` |
| 119 | `<ScoreBadge label="Moat" ... />` | Four Ms label | `[POD-SCORE]` |
| 120 | `<ScoreBadge label="Mgmt" ... />` | Four Ms label | `[POD-SCORE]` |

File: [src/components/Competitors.jsx](src/components/Competitors.jsx)

| Line | String | Why | Tag |
|---|---|---|---|
| 48 | `{ key: 'moatScore', label: 'Moat Score', ... }` | Four Ms framework | `[POD-SCORE]` |
| 49 | `{ key: 'mgmtScore', label: 'Management Score', ... }` | Four Ms framework | `[POD-SCORE]` |
| 50 | `{ key: 'thesisScore', label: 'Thesis Score', ... }` | Score name | `[POD-SCORE]` |

File: [src/components/Toolbox.jsx](src/components/Toolbox.jsx)

| Line | String | Why | Tag |
|---|---|---|---|
| 679 | `<InfoRow label="Thesis Code" value={classification.thesisCode} />` | Thesis-classification taxonomy label; sector code system is independent of investing methodology | `[INDEP]` |

---

## 5. Valuation calculators (heaviest concentration)

**`[POD-PD]` — RESOLVED 2026-05-09.** All rows in this section are Stage 2 valuation UI (Toolbox calculators + Pitch Deck Valuation section). The pitch-deck redesign spec retains all four calculators (MOS / Payback Time / Ten Cap / Equity Bond) and renames the buy-price output to "Fair Value". See [docs/specs/2026-05-09-pitch-deck-redesign.md](docs/specs/2026-05-09-pitch-deck-redesign.md).

File: [src/components/ValuationCalculators.jsx](src/components/ValuationCalculators.jsx)

| Line | String | Why |
|---|---|---|
| 392 | Toggle `"10 Cap"` | Ten Cap = Rule-One buy-price method |
| 394 | Toggle `"MOS"` | Margin of Safety acronym |
| 396 | Toggle `"PBT"` | Payback Time acronym |
| 398 | Toggle `"Equity Bond"` | Equity Bond Method (Buffettology — possibly safer to keep) |
| 624 | summary card label `10 Cap` | Card label in summary grid |
| 626 | `summaryRow('10 Cap Price', tenCapPriceLow, tenCapPriceHigh)` | "10 Cap Price" output label |
| 627 | `summaryRow('Sticker Price', tenCapStickerLow, tenCapStickerHigh)` | "Sticker Price" = Rule-One term for max rational price |
| 634 | summary card label `MOS` | Card label in summary grid |
| 636 | `summaryRow('MOS Price', mosPriceLow, mosPriceHigh)` | MOS labeled output |
| 637 | `summaryRow('Sticker Price', mosStickerLow, mosStickerHigh)` | Repeated Sticker Price terminology |
| 647 | `summaryRow('Sticker Price', pbtStickerLow, pbtStickerHigh)` | Repeated |
| 660 | summary card label `Equity Bond` | Card label in summary grid |
| 675 | `<SectionHeader title="10 Cap" />` | Calculator section header |
| 755 | `<SectionHeader title="Margin of Safety" />` | Calculator section header |
| 808 | `<SectionHeader title="Payback Time" />` | Calculator section header |
| 857 | `<SectionHeader title="Equity Bond" />` | Calculator section header |

File: [src/components/Valuation.jsx](src/components/Valuation.jsx)

| Line | String | Why |
|---|---|---|
| 175 | `const ALL_HERO_KEYS = ['10 Cap', 'MOS', 'PBT', 'Equity Bond'];` | All four method names hardcoded |
| 36–41 | Sub-tab labels: `Growth Rate Analysis`, `Valuation Inputs`, `Valuation Calculators`, `Price vs Value` | Generic labels — likely fine; content covered by `[POD-PD]` resolution above |

File: [src/components/HistoricalBuyPrices.jsx](src/components/HistoricalBuyPrices.jsx)

| Line | String | Why |
|---|---|---|
| 21 | `{ key: 'mosPrice', label: 'MOS', color: '#16a34a' }` | Series label |
| 23 | `{ key: 'tenCapPrice', label: 'Ten Cap', color: '#0f766e' }` | Series label |
| 24 | `{ key: 'ebPrice', label: 'Equity Bond', color: '#7c3aed' }` | Series label |
| 179 | `// Historical high PE up to this year (for MOS future PE cap)` | Developer comment referencing MOS methodology |
| 181 | `// True average PE up to this year (for Equity Bond — more conservative)` | Developer comment referencing Equity Bond methodology |

---

## 6. Empty states

| File | Line | String | Tag |
|---|---|---|---|
| [src/components/OnePager.jsx](src/components/OnePager.jsx) | 157 | "No One Pager generated yet" | `[INDEP]` (uses stage name; likely stays) |
| [src/components/OnePager.jsx](src/components/OnePager.jsx) | 159 | "Go to the Research tab and click Generate One Pager to start." | `[INDEP]` |
| [src/components/FullStory.jsx](src/components/FullStory.jsx) | 555 | "No Full Story generated yet" | `[POD-FS]` |
| [src/components/ReportsList.jsx](src/components/ReportsList.jsx) | 177 | "No reports generated yet" | `[INDEP]` |
| [src/components/ReportsList.jsx](src/components/ReportsList.jsx) | 179 | "Search a ticker in the Research tab and click Generate One Pager to start." | `[INDEP]` |
| [src/components/BillingPage.jsx](src/components/BillingPage.jsx) | 149 | "No analyses yet. Run your first One Pager to get started." | `[INDEP]` |

---

## 7. Generation progress labels

File: [src/components/GenerationProgressPanel.jsx](src/components/GenerationProgressPanel.jsx)

| Line | String | Why | Tag |
|---|---|---|---|
| 16 | `{ label: 'Bull thesis', agent: 'synthesis-writer' }` | Adversarial-debate framework | `[POD-FS]` |
| 18 | `{ label: 'Bull rebuttal', agent: 'synthesis-writer' }` | Adversarial-debate framework | `[POD-FS]` |
| 20 | `{ label: 'Composition', agent: 'synthesis-writer' }` | Synthesis step naming | `[POD-FS]` |

---

## 8. Glossary terms

The glossary infrastructure ([src/components/ReportMarkdown.jsx](src/components/ReportMarkdown.jsx)) is neutral — terms are defined dynamically via the report's `glossaryTerms` field, which is produced by the agents. Terminology cleanup happens at the agent prompt layer (already partially handled in W1). No standalone glossary file with hard-coded user-facing definitions was found.

---

## Items deliberately **excluded** from this punch-list

- **Internal variable names** that aren't user-visible (`thesisScore`, `mosPrice`, etc.) — keep as-is until methodology lands; renaming internals without a destination is churn.
- **Toolbox tab labels** (`Overview / Financials / Growth / Valuation / Competitors / Insiders / Filings`) — generic finance app labels, not methodology-laden. Their *contents* are flagged where relevant.
- **PitchDeck phase header strings** (`Phase 1: Business Fundamentals`, etc.) — generic and likely stay.
- **Settings, login, signup, layout text** — no methodology references found.

---

## How to use this list

1. When a brainstorm pod produces a final decision, grep this file for that pod's tag (e.g. `grep POD-VAL W2-PUNCHLIST.md`).
2. For each match, open the referenced file at the listed line and rewrite per the new methodology.
3. Tick the item off (mark it `[DONE]` or strike through) so progress is visible.
4. After all four pods are absorbed, sweep the `[INDEP]` items in one pass.
