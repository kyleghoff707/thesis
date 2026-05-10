# POD-2 — Pitch Deck Spec

**Status:** Locked 2026-05-09
**Brainstorm pod:** Stage-2 sibling of Pod #4 ([final-thesis-redesign](2026-05-09-final-thesis-redesign.md)) from [STEPS.md](../../STEPS.md) Phase 2B
**Replaces:** Stage 2 R1-derived 10-section "Pitch Deck" workflow
**Implementation status:** Pending (gates W2 semantic UI rewrite for Stage 2 components; coordinates with Pod #2 Valuation methods if those land first)

---

## What this is

A locked design spec for the redesign of the Stage 2 conviction-prep document, the "Pitch Deck." Opened to satisfy STEPS.md Phase 2B's requirement to make Stage 2 different enough from Phil Town's *Investment Story Form* that the public OSS release does not carry a derivative-work risk, while preserving the analytical substance (same investigation depth, same FGR derivation, same dual Owner Earnings, same PSR cross-period reconciliation, same 8-agent fan-out, same 5-wave dispatch).

The implementation engineer should treat this spec as the source of truth for what the Stage 2 pipeline produces. Anything not specified here keeps its current behavior from the current `agents/*-pitchdeck/` implementation.

---

## What changed at a glance

The closed-product Pitch Deck was an R1 *Investment Story Form* translation: 10 sections matching the official R1 Pitch Deck template, R1's six moat types (including the R1-distinctive "Toll Bridge" coinage), the Three Ms framework ("Meaning / Moat / Management"), the "Wonderful Company" 4-test, the "Six-Inch Bar" concept, "Rulers" terminology, "Big Audacious Goal (BAG)," "Sticker / Buy Price" language, and "Limited Exposure to P.E.S.T Risks" as a section title. The structural differentiators today (PSR pre-pass, 8 parallel specialist agents, 15+ peer screen, market-share ceiling test, FGR derivation with PM-confirmation gate, dual Owner Earnings (Buffett + Graham), sensitivity tables, adversarial risk-analyst with steel-manned bear case) are real but invisible because the section titles still read R1.

Pitch Deck redesign keeps every analytical move and the entire orchestration topology. It changes:

1. **The document shape** — 10 sections collapse to 7 top-level sections in the rendered document. The 8 specialist agents and the 5-wave dispatch are unchanged. Only the assembly + PDF/DOCX/UI render groups output JSON by parent section.
2. **All seven section names** — drop R1 slogans in favor of CFA-aligned headers with value-investor-flavored subheaders.
3. **Tier 1 R1 vocabulary scrubbed** across all 8 agent prompts and the orchestrating skill: "Three Ms" / "3 Ms framework," "Wonderful Company" 4-test (the specific 4-bullet phrasing), "Six-Inch Bar," "Rulers," "Big Audacious Goal (BAG)."
4. **One Tier 2 label rename:** "Sticker price" → "Fair Value." All other R1-popularized analytical-method labels (Payback Time, Ten Cap, FGR, MARR) keep their current names — the methods are public-domain even where R1 popularized the labels.
5. **Verdict-box artifact pattern adopted** across all 7 top-level sections — same pattern locked for Final Thesis §§1-5, propagated to the full Stage 2 pipeline.
6. **15-point Moat Checklist dropped** from §3b — same decision as Final Thesis §3 Moat Analysis. The same 15-question investigation framework still runs; the 15 answers go into the prose narrative ending in a verdict box, not a numbered PASS/FAIL grid.
7. **Klarman permanent-vs-temporary loss overlay** added to §7 Risk Profile on top of the existing PEST inventory. PEST itself is generic (Aguilar 1967), kept.
8. **Accounting Red-Flag scan** — new explicit subsection §4d, pulled from the user's pre-R1 personal template (capitalized / deferred / restructuring / tax discrepancies / goodwill impairment).
9. **Calibrated Confidence + Anticipated Regret check** — new closing paragraph in the Investment Verdict, also pulled from the user's pre-R1 personal template.

The R1-substance-preserved bones — six moat types (Final Thesis alignment), four valuation methods (MOS / Payback Time / Ten Cap / Equity Bond), 5-input FGR derivation, 3-event taxonomy (company / industry / market), PSR cross-period reconciliation, PEST 4-quadrant framework, dual Owner Earnings (Buffett + Graham), 15+ peer screen with market-share ceiling test, sensitivity tables for all four valuation methods — change *only* in section grouping and verdict-box presentation, not in content.

**Explicitly NOT adopted from Final Thesis:** Mauboussin reverse-DCF "price-implied expectations" paragraph stays Final-Thesis-exclusive. This preserves stage differentiation: Pitch Deck *builds* the valuation; Final Thesis *pressure-tests* it against price-implied expectations.

---

## Locked outcome — section table

The pipeline emits **12 section objects** (8 specialist agents producing 11 sections + 1 synthesis verdict, with financial-analyst now producing 4 sub-sections instead of 3). The renderer groups them into 7 top-level document sections plus the verdict.

| § | Top-level title | Subsection | Key | Source agent | Wave |
|---|---|---|---|---|---|
| 1 | **Setup & Situation** | — | `setup` | business-analyst | 1 |
| 2 | **Business Quality** | — | `business_quality` | business-analyst | 1 |
| 3 | **Industry & Competitive Position** | 3a Market Position | `market_position` | competitor-evaluator-market-position | 1 |
| | | 3b Moat Analysis | `moat_analysis` | competitor-evaluator-moats | 2 |
| 4 | **Financial Analysis** | 4a Cash Generation | `cash_generation` | financial-analyst | 2 |
| | | 4b Returns & Leverage | `returns_leverage` | financial-analyst | 2 |
| | | 4c Balance Sheet | `balance_sheet` | financial-analyst | 2 |
| | | 4d Accounting Red Flags | `accounting_red_flags` | financial-analyst | 2 |
| 5 | **Management & Capital Allocation** | — | `management_capital_allocation` | management-evaluator | 2 |
| 6 | **Valuation** | — | `valuation` | valuation-specialist | 3 |
| 7 | **Risk Profile** | — | `risk_profile` | risk-analyst | 3 |
| — | **Investment Verdict** | — | `investment_verdict` | synthesis-writer | 4 |

Stage name: **Pitch Deck** (kept — the term is generic in finance and not R1-specific).

---

## Section-by-section spec

### §1 Setup & Situation

**Key:** `setup` (was `radar`)
**Top-level title:** "Setup & Situation"
**Agent:** `business-analyst-pitchdeck` (existing — produces both this section and §2)

**Investigation:** unchanged from current Radar. Same event analysis (3 event types: company / industry / market), same guru screening, same management background research, same competitive position statement, same 3-5 year growth thesis.

**Output change:** structured analyst prose ending in a verdict box. Drop the "Radar" framing language. Drop "value investing Rulers" terminology in favor of "value investors" or "long-term investors." Drop "load up the truck" and similar R1 catchphrases.

**Verdict box format:**
> **Setup verdict.** Event status: active / recent / none. Event type: company-specific / industry-specific / market-wide / none. Guru ownership: significant / partial / none. Verdict: PROCEED / WATCH / SKIP.

**`data` payload:** unchanged from current `radar` data structure (`eventStatus`, `eventDescription`, `eventType`, `priceDropMagnitude`, `guruOwnership[]`, `managementTeam[]`, `competitivePosition`, `growthThesis`).

### §2 Business Quality

**Key:** `business_quality` (was `simple_predictable`)
**Top-level title:** "Business Quality"
**Agent:** `business-analyst-pitchdeck` (existing — produces both §1 and this section)

**Investigation:** unchanged. Same Simple test, Predictable test, cyclicality assessment, problem-solved analysis, acquisition history tracking. The "Six-Inch Bar" concept stays as an *idea* but is rephrased as plain English ("simple enough to understand"); the R1 phrasing is dropped from the prompt.

**Output change:** prose ending in a verdict box. The "Three Ms" framing is dropped from the cross-cutting context section (this previously referenced "Meaning Checklist" and the 15-point Meaning items used in Stage 3 — Stage 3 has its own redesign, this reference is no longer load-bearing).

**Verdict box format:**
> **Business verdict.** Predictability: high / medium / low. Within circle of competence: yes / no / partial. Cyclicality: none / mild / moderate / severe. Verdict: PASS / FAIL / WATCHLIST.

**`data` payload:** unchanged from current `simple_predictable` structure (`simpleTestVerdict`, `businessModelSummary`, `revenueMix[]`, `predictableTestVerdict`, `revenueConsistency`, `marginDurability`, `cyclicality`, `cyclicalityDescription`, `problemSolved`, `acquisitionHistory[]`).

### §3 Industry & Competitive Position

**Top-level title:** "Industry & Competitive Position"
**Renders two subsection outputs from two specialist agents.**

#### §3a Market Position

**Key:** `market_position` (unchanged)
**Subsection title:** "Market Position"
**Agent:** `competitor-evaluator-market-position-pitchdeck` (existing)

**Investigation:** unchanged. Same 15+ peer screen mandate, same market share ceiling analysis, same niche identification, same business cycle positioning, same industry-specific competitive factor research.

**Output change:** prose ending in a verdict box. The "Dominant Market Position" framing is dropped from the section title and prompt prose; substance preserved.

**Verdict box format:**
> **Market position verdict.** Niche rank: Top 3 / Top 10 / Mid-pack. Market share trend: growing / stable / declining. 10-year ceiling: realistic / ambitious / unrealistic / implausible. Verdict: PASS / FAIL / WATCHLIST.

**`data` payload:** unchanged from current `market_position` structure (peer table, `marketShareCeiling`, `competitivePositionMap`, `nichePosition`, `marketShareTrend`, `businessCycle`, `industryGrowthDrivers[]`).

#### §3b Moat Analysis

**Key:** `moat_analysis` (was `barriers_moats`)
**Subsection title:** "Moat Analysis"
**Agent:** `competitor-evaluator-moats-pitchdeck` (existing)

**Moat taxonomy:** all 6 R1 moat types preserved (Brand, Network, Switching, Price Advantage, Secrets/Patents, Toll Bridge) — aligns with locked Final Thesis §3 spec.

**Investigation:** unchanged. Same six-moat-type classification, same anti-fragility assessment, same pricing power assessment, same Competitive Advantage Period (CAP) estimate, same Section 3a cross-validation.

**Output change:**
- **Drop the 15-point Moat Checklist** entirely. The current `data.moatChecklist.items[15]` PASS/FAIL/PARTIAL array and `data.moatChecklist.summary` (passCount/failCount/partialCount) are removed from the agent's output. The same 15 questions still drive the investigation, but the answers go into the prose narrative, not a numbered grid.
- Adopt the Width/Trend rubric in the verdict box (Final Thesis pattern, borrowed from Pat Dorsey).

**Verdict box format:**
> **Moat verdict.** Primary type: [from R1 6-type list]. Secondary type: [from R1 6-type list, or none]. Width: wide / narrow / none. Trend: widening / stable / eroding. Sustainability horizon: [N years]. Verdict: PASS / FAIL / WATCHLIST.

**`data` payload:** verdict object, `moatTypes[]` (6-moat-type evaluation matrix with strength + evidence + durability risk per type), `moatClassification`, `barriers[]`, `pricingPowerAssessment`, `antifragility`, `competitiveAdvantagePeriod`, `capRationale`, `moatValidation`. **NO `moatChecklist` object** — that field is deleted.

### §4 Financial Analysis

**Top-level title:** "Financial Analysis"
**Renders four subsection outputs from one specialist agent (financial-analyst-pitchdeck) producing four sections instead of the current three.**

> Note on agent topology: the current `financial-analyst-pitchdeck` produces a `MultiSection` JSON with three sections. The known watchout from STEPS.md (commit 27bd562) is that "MultiSection wrapper unreliable; production already worked around it with N sequential single-section calls." This redesign preserves that fallback path and now requires the agent to produce four sections (or four sequential calls). No new agent needed.

#### §4a Cash Generation

**Key:** `cash_generation` (was `fcf`)
**Subsection title:** "Cash Generation"
**Agent:** `financial-analyst-pitchdeck` (existing — produces all four §4 sub-sections)

**Investigation:** unchanged. Same 10-year FCF history, CapEx breakdown (maintenance vs growth), FCF yield vs peers, FCF conversion rate, dual Owner Earnings (Buffett + Graham).

**Output change:** prose ending in a verdict box. "Free Cash Flow Generative" framing dropped from the title and prose.

**Verdict box format:**
> **Cash verdict.** FCF: positive and growing / positive but volatile / declining / negative. FCF/Earnings ratio: ≥1.0 / 0.75-1.0 / <0.75. Owner earnings convergence (Buffett vs Graham): aligned (within 20%) / divergent. Verdict: PASS / FAIL / WATCHLIST.

**`data` payload:** unchanged from current `fcf` structure (`fcfHistory`, `fcfPerShare`, `fcfRatio`, `fcfYield`, `fcfYieldVsPeers`, `fcfConversionRate`, `capexBreakdown`, `ownerEarnings.ruleOneMethod` — *the field name `ruleOneMethod` should be renamed to `valueInvestingMethod` or `buffettMethod`* — and `ownerEarnings.grahamMethod`, `ownerEarnings.divergence`, `shareholderReturns`).

> **Schema rename:** `data.ownerEarnings.ruleOneMethod` → `data.ownerEarnings.buffettMethod`. The current key is one of the last residual `ruleOne` field names in the schema (the Phase 2A rename caught most of them but missed this one inside the Owner Earnings sub-object). Rename in `agents/financial-analyst-pitchdeck/prompt.md` line ~607, the assembly script, the PDF/DOCX renderer, and the FT spec's matching dual-method block. *Logged here so the implementer doesn't miss it.*

#### §4b Returns & Leverage

**Key:** `returns_leverage` (was `roe_roic_debt`)
**Subsection title:** "Returns & Leverage"
**Agent:** `financial-analyst-pitchdeck` (existing)

**Investigation:** unchanged. Same 10-year ROE/ROIC/ROA trend, DuPont decomposition, debt-to-equity trajectory, interest coverage, comparison to cost of capital.

**Output change:** prose ending in a verdict box.

**Verdict box format:**
> **Returns verdict.** ROIC trend: improving / stable / deteriorating / volatile. ROE-vs-ROIC divergence (debt distortion): low / moderate / high. Debt-to-FCF: <3 / 3-5 / >5. Interest coverage: strong (>6×) / adequate (3-6×) / strained (<3×). Verdict: PASS / FAIL / WATCHLIST.

**`data` payload:** unchanged from current `roe_roic_debt` structure (`returnMetrics`, `dupontDecomposition`, `debtAnalysis`, `roeVsRoicDivergence`, `costOfCapitalComparison`).

#### §4c Balance Sheet

**Key:** `balance_sheet` (unchanged)
**Subsection title:** "Balance Sheet"
**Agent:** `financial-analyst-pitchdeck` (existing)

**Investigation:** unchanged. Same working capital trend, current ratio evolution, quick ratio, goodwill-to-assets ratio, off-balance-sheet items, lease obligations.

**Output change:** prose ending in a verdict box. "Strong Balance Sheet" framing dropped from the title and prose.

**Verdict box format:**
> **Balance sheet verdict.** Equity trend: growing / flat / declining. Current ratio: ≥2 / 1-2 / <1. Goodwill burden: low (<15% of assets) / moderate (15-30%) / high (>30%). Verdict: PASS / FAIL / WATCHLIST.

**`data` payload:** unchanged from current `balance_sheet` structure (`equityTrend`, `currentRatio`, `quickRatio`, `workingCapital`, `goodwillToAssets`, `leaseObligations`, `offBalanceSheetItems`, `balanceSheetImprovedUnderCurrentManagement`).

#### §4d Accounting Red Flags (NEW)

**Key:** `accounting_red_flags` (NEW)
**Subsection title:** "Accounting Red Flags"
**Agent:** `financial-analyst-pitchdeck` (existing — adds a fourth sub-investigation)

**Investigation:** explicit footnote-and-disclosure scan for five categories of accounting concerns drawn from the user's pre-R1 personal template (page 4: "Investigate whenever you see the words 'capitalized', 'deferred', or 'restructuring'"). The investigation requires:

1. **"Capitalized" footnote scan** — search 10-K footnotes for capitalized R&D, software development, customer acquisition costs, or other items that move expenses to the balance sheet. Quantify amount and trend over 5 years.
2. **"Deferred" footnote scan** — search for deferred income, deferred tax assets/liabilities, and deferred revenue patterns. Flag any large deferrals that smooth earnings.
3. **"Restructuring" charges** — list all restructuring charges in the last 10 years. Frequent recurring "non-recurring" charges are a red flag.
4. **Income tax actually paid vs reported** — compare the income tax provision on the income statement against actual cash taxes paid (cash flow statement). Material divergence is a flag.
5. **Goodwill impairment history** — list all goodwill impairments in the last 10 years. Pattern of impairments suggests overpaying for acquisitions.

Each category has its own findings list. If a category has no flags, state "Clean" with the specific filing/footnote searched.

**Output:** prose narrative + structured red-flag list ending in a verdict box. No 15-point checklist; just the five categories with findings or clean status.

**Verdict box format:**
> **Accounting verdict.** Triggers found: [N of 5 categories]. Severity: clean (0 flags) / yellow (1-2 flags) / red (3+ flags or any high-severity flag). Verdict: PASS / WATCH / FAIL.

**`data` payload:**
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

### §5 Management & Capital Allocation

**Key:** `management_capital_allocation` (was `management`)
**Top-level title:** "Management & Capital Allocation"
**Agent:** `management-evaluator-pitchdeck` (existing)

**Investigation:** unchanged. Same six-dimension assessment (CEO track record, capital allocation, integrity, insider ownership, compensation, guru context). Same Buffett-standard integrity assessment (treat shareholders as partners, radical candor, focus on intrinsic value, capital allocation discipline, plain language, teaching orientation, long-term focus). Same acquisition track record framework. Same operating-rule-#2 enforcement (Guru ownership is context, not confirmation).

**Output change:**
- Drop "Three Ms framework" reference. The phrase "the third M" appears in the current prompt's introduction; remove that specific framing.
- Drop "Big Audacious Goal (BAG)" — the *concept* (long-term strategic vision) is real and stays, but the trademark phrase and acronym are scrubbed. Replace with "long-term strategic vision."
- Prose ending in a verdict box.

**Verdict box format:**
> **Management verdict.** CEO integrity: high / medium / low. Capital allocation: rational / questionable / poor. Insider conviction: high (net buying) / neutral / negative (net selling). Promise tracking: kept / mixed / broken. Verdict: PASS / FAIL / WATCHLIST.

**`data` payload:** unchanged from current `management` structure (`ceo`, `returnMetrics`, `compensation`, `insiderActivity`, `guruOwnership`, `acquisitions`, `integrityAssessment`) — except `ceo.bag` field is renamed to `ceo.strategicVision`.

> **Schema rename:** `data.ceo.bag` → `data.ceo.strategicVision`. Same justification as §4a's `ruleOneMethod` rename — last residual R1-trademark field name.

### §6 Valuation

**Key:** `valuation` (unchanged)
**Top-level title:** "Valuation"
**Agent:** `valuation-specialist-pitchdeck` (existing)

**Buy-price methods:** unchanged. MOS, Payback Time (PBT), Ten Cap, Equity Bond all retained with current labels (the labels are R1-popularized but the methods are public).

**Investigation:** unchanged. Same 5-input FGR derivation (Rear View Mirror / Market Relativity / Company Guidance / Sector Growth / Analyst Consensus), same PM-confirmation gate inside the orchestrating skill, same dual Owner Earnings, same sensitivity tables (4 methods × 5×5 grids), same market-share ceiling spot-check, same growth-quality confirmation, same growth-stage classification.

**Output change:**
- "Sticker price" → "Fair Value" everywhere in the prompt, the data structure, the verdict box, the PDF/DOCX renderer, and the UI.
- Prose ending in a verdict box.
- **Mauboussin reverse-DCF "price-implied expectations" paragraph is NOT added here.** That stays Final-Thesis-exclusive (§5 of FT spec). Pitch Deck builds the buy-price range; Final Thesis interprets it against price-implied expectations. This stage differentiation is intentional.

**Verdict box format:**
> **Valuation verdict.** Buy-price range (4-method): $low–$high. Current price: $current. Position relative to range: above / within / below. Margin of safety at current: X%. Method convergence: tight (within 20%) / spread (>20%). Verdict: PASS / FAIL / WATCHLIST.

**`data` payload:** unchanged from current `valuation` structure (`fgrDerivation`, `mosBuyPrice`, `pbtBuyPrice`, `tenCapPrice`, `equityBondBuyPrice`, `buyPriceRange`, `marketShareCeiling`, `growthStage`, `growthQuality`) — except every `stickerPrice*` field is renamed to `fairValue*`. Specifically: `mosBuyPrice.stickerPriceLow` → `mosBuyPrice.fairValueLow`, `mosBuyPrice.stickerPriceHigh` → `mosBuyPrice.fairValueHigh`, and any other `sticker*` field references throughout.

### §7 Risk Profile

**Key:** `risk_profile` (was `pest`)
**Top-level title:** "Risk Profile"
**Agent:** `risk-analyst-pitchdeck` (existing)

**Investigation:** unchanged. Same PEST 4-quadrant inventory (Political / Economic / Social / Technological — PEST is generic, kept), same minimum 2 risks per quadrant with named actors, same probability×severity matrix, same evidence-based rebuttal mandate, same thesis-killer classification, same cyclical risk assessment, same FGR stress-test, same minimum 3 red flags (higher than other agents).

**Output change — added Klarman overlay:** each identified risk gets a **permanent-vs-temporary loss classification** (Graham/Klarman convention, public-domain), in addition to the existing probability×severity classification. Permanent-loss risks (regulatory bans, technological obsolescence, balance-sheet collapse, fraud) get higher weight than temporary-loss risks (cyclical downturn, multiple compression, transient management mistakes) in the verdict.

The existing steel-manned bear-case pass stays — that's already a VIC-aligned pattern in the current prompt and is value-additive without R1 baggage.

**Output change — section title:** "Limited Exposure to P.E.S.T Risks" → "Risk Profile." The R1 framing ("Limited Exposure") is replaced with neutral CFA-style naming.

**Verdict box format:**
> **Risk verdict.** Permanent-loss risks: N. Temporary-loss risks: N. Thesis-killers: [list, may be "None identified"]. Bear case strength: weak / moderate / strong. Verdict: PASS / FAIL / WATCHLIST.

**`data` payload:** existing `risk_profile` structure (`politicalRisks[]`, `economicRisks[]`, `socialRisks[]`, `technologicalRisks[]`, `cyclicalAssessment`, `riskMatrix`, `thesisKillers[]`, `unrebutted[]`) — extended so each risk object inside the four PEST arrays includes a `lossType: "permanent" | "temporary"` field with a one-sentence rationale.

### Investment Verdict (closing synthesis)

**Key:** `investment_verdict` (was `overall_verdict`)
**Title:** "Investment Verdict"
**Agent:** `synthesis-writer-pitchdeck` (existing)

**Investigation:** unchanged. Same cross-section consistency check, same section-weighting (heavy: moat + financials, medium: business + valuation, lower: risk, contextual: management), same three-verdict outcome (PASS / FAIL / WATCHLIST).

**Output change — added Pre-Decision Quality Check:** a new closing block appended to the narrative, drawn from the user's pre-R1 personal template page 2 ("Factors of a good decision: well-calibrated confidence + correctly anticipated regret"). This is one paragraph, not a full section.

**Closing block format:**
> **Pre-Decision Quality Check**
>
> *Confidence calibration.* Our highest-confidence sections are [list of HIGH-confidence sections]. Our lowest-confidence sections are [list of LOW-confidence sections]. The verdict's overall confidence is appropriate to the [strongest / weakest] dimension because [reasoning]. We are NOT overconfident on [risk-of-overconfidence call-out, e.g., "the market-share ceiling, where TAM data is from a single source"].
>
> *Anticipated regret.* If this thesis fails over the next 5 years, the most likely failure mode is [specific scenario tying back to the strongest red flag]. The signal we would have missed is [specific monitorable indicator]. If the thesis succeeds, the dimension we got right that consensus is currently missing is [variant-perception statement, even if implicit].

**`data` payload:** existing `overall_verdict` data + a new `preDecisionCheck` block:
```json
{
  "preDecisionCheck": {
    "highConfidenceSections": ["..."],
    "lowConfidenceSections": ["..."],
    "overconfidenceRisks": ["..."],
    "anticipatedFailureMode": "...",
    "anticipatedFailureSignal": "...",
    "variantPerceptionStatement": "..."
  }
}
```

---

## Cross-cutting design notes

### The verdict-box artifact pattern (Pitch Deck propagation)

Across all 7 top-level sections (and every subsection), each rendered output ends with a small structured verdict box. This is the same pattern locked for Final Thesis §§1-5, propagated to the full Stage 2 pipeline. Implementation should:

- Render the verdict box as a visually distinct element in the PDF/DOCX (bordered call-out, color-coded by PASS/WATCHLIST/FAIL).
- Render the verdict box *after* the prose narrative in the document flow.
- Surface the verdict (and only the verdict) in any summary view (the report bundle's manifest, the report assembly's `sectionVerdicts` table, etc.).
- Keep the verdict object structured (not free-text) so it can be programmatically aggregated by the synthesis-writer.

For sub-sectioned top-level sections (§3, §4), the renderer shows each subsection's individual verdict box, plus a top-level "section roll-up" verdict at the parent level (computed by the renderer, not by an agent).

### What's NOT in the data payload anymore

- §3b: drop `data.moatChecklist.items[]`. Drop `data.moatChecklist.summary`. Keep `data.moatTypes[]` (the 6-type evaluation matrix is the substance; the 15-point grid was the artifact).

The agent prompts must NOT instruct the model to emit the dropped structures. The PDF/DOCX templates must NOT render any 15-item PASS/FAIL grid. The UI components must NOT show a 15-item checklist render for §3b.

### Document-only consolidation (orchestration unchanged)

The 7-top-level-section structure is a *rendering* concern, not an *orchestration* concern. The 8 specialist agents are unchanged. The 5-wave dispatch is unchanged. The PSR pre-pass is unchanged. The DataPacket slicing is unchanged. The FGR PM-confirmation gate inside the orchestrating skill is unchanged.

What changes is:
- The agent prompts use the new section names and keys.
- The agents emit the new verdict-box structure inside their `data` payloads.
- The financial-analyst agent emits 4 sections (or 4 sequential outputs) instead of 3.
- The orchestrating skill writes outputs to the new section file names (e.g., `sections/cash_generation.json` instead of `sections/fcf.json`).
- The report assembly + PDF/DOCX renderer + UI components group the 12 emitted section objects under 7 top-level headings + verdict.

### Field renames (catch-all)

Three residual R1-trademark field names exist inside structured data payloads. All three are renamed in this redesign:

| Old field | New field | Location |
|---|---|---|
| `data.ownerEarnings.ruleOneMethod` | `data.ownerEarnings.buffettMethod` | §4a Cash Generation |
| `data.ceo.bag` | `data.ceo.strategicVision` | §5 Management & Capital Allocation |
| `data.*.stickerPrice*` (multiple) | `data.*.fairValue*` | §6 Valuation |

These are the last residual R1 field-name fingerprints in the Pitch Deck schema after Phase 2A's mass rename.

### Tier 1 vocabulary scrub (across all 8 agent prompts)

The following R1-trademark phrases are scrubbed from every Pitch Deck agent prompt:

| Old phrase | Replacement |
|---|---|
| "Three Ms" / "3 Ms framework" / "the third M" | Drop entirely; refer to sections by their new names |
| "Wonderful Company" 4-test (the specific 4-bullet phrasing) | "value investing investment criteria" or "the four conditions for investment" |
| "Six-Inch Bar" | "simple enough to understand" / "within circle of competence" |
| "Rulers" / "value investing Rulers" / "Rulers buy fear and sell greed" | "value investors" / "long-term investors" / paraphrase the underlying idea |
| "Big Audacious Goal (BAG)" | "long-term strategic vision" |
| "load up the truck" | "build a meaningful position" or paraphrase |

### Stage differentiation: what Pitch Deck does that Final Thesis doesn't

After this redesign, the two stages have clearly differentiated jobs:

| Move | Pitch Deck (Stage 2) | Final Thesis (Stage 3) |
|---|---|---|
| 15+ peer screen, market-share ceiling test | ✓ §3a Market Position | — (inherits from Pitch Deck) |
| 4-method valuation + sensitivity tables | ✓ §6 Valuation | — (kept but presented as summary) |
| 5-input FGR derivation with PM-confirmation gate | ✓ inside orchestrating skill | — (uses Pitch Deck's locked FGR) |
| Mauboussin reverse-DCF "price-implied expectations" | — | ✓ §5 lead paragraph |
| 5-step adversarial Debate (Bull → Bear → Rebuttal → Judge → Compose) | — | ✓ §6 |
| Trade Plan (tranching, ROP/ROC sell rules, position sizing) | — | ✓ §7 |
| "What we're monitoring" forward watchpoint list | — | ✓ §6 close |
| Promise Tracker as standalone visual | partial (in §5 data) | ✓ promoted in §4 render |
| 15-point Moat / Meaning / Management checklists | — (dropped per this spec) | — (dropped per FT spec) |
| Klarman permanent-vs-temporary risk overlay | ✓ §7 (this spec) | — (Stage 3's risk handling is Event Analysis only — different cut) |
| Accounting Red-Flag scan | ✓ §4d (this spec) | — |
| Calibrated Confidence + Anticipated Regret check | ✓ Investment Verdict close (this spec) | — |
| Pre-R1 6-moat-type taxonomy | ✓ §3b | ✓ §3 (FT spec) |

The two stages now read as a clear pipeline: **Stage 2 builds the case from peer-screened evidence, structured analysis, and a quantified buy-price range. Stage 3 pressure-tests the case through expectations-investing, adversarial debate, forward watchpoints, and a trade plan.**

---

## Out of scope (considered and excluded)

These were on the table during the brainstorm and explicitly *not* picked:

- **Switching to Pat Dorsey's 4-source moat taxonomy (Intangibles / Switching Costs / Network Effect / Cost Advantages).** Considered as a Section 3b substitution. Excluded — Final Thesis spec is locked with the 6 R1 types, and divergent moat taxonomies between Stage 2 and Stage 3 would be confusing. Both stages keep R1's 6 types with Dorsey's Width/Trend rubric in the verdict box.
- **Renaming "Toll Bridge" to "Efficient Scale / Regulatory."** Considered. Excluded for the same Final Thesis alignment reason. This is the largest single residual R1 fingerprint after the redesign and the implementer should be aware.
- **Renaming "Payback Time / PBT" to "FCF Payback Period."** Considered (PBT is the title of a Phil Town book). Excluded — the underlying method is generic and the user assessed the legal exposure as low.
- **Renaming "Ten Cap" to "Owner Earnings Yield."** Considered. Excluded for the same reason — Buffett's Owner Earnings × 10 method is public; Phil Town only popularized the label.
- **Renaming "FGR (Future Growth Rate)" to "LTGR (Long-Term Growth Rate)."** Considered. Excluded for the same reason.
- **Adopting Mauboussin reverse-DCF "price-implied expectations" lead paragraph in Section 6.** Considered as a Final Thesis mirror. Excluded — this stays Final-Thesis-exclusive to preserve stage differentiation. Pitch Deck builds the valuation; Final Thesis interprets it.
- **Greenwald EPV-tiered valuation as a substitution for the 4-method valuation stack.** Considered (Greenwald is public-domain and the tiering is analytically clean). Excluded — Pod #2 (Valuation methods) may revisit valuation methods separately, and a substitution at this scope would conflict with Pod #2's eventual decisions. Pitch Deck §6 keeps the 4-method stack.
- **VIC variant-perception subsection in Section 1.** Considered as a graft. Excluded — out of scope for "slightly different, not radically different" intent. The variant-perception thinking still emerges naturally in §7 Risk Profile (steel-manned bear case) and the Investment Verdict's Anticipated Regret close.
- **Macro Context subsection in Section 1 (Shiller CAPE, IPO quality, dividend-vs-bond yields).** Considered. Excluded — macro context is per-investment-decision, not per-company, and would bloat §1. Can be revisited as a Phase 5 chart addition.
- **Reducing 6 moat types back to original R1 "Big Five"** (dropping Network). Considered. Excluded — Network is widely recognized as a real moat type for tech/platform companies and is publicly canonized in Dorsey's taxonomy.
- **CFA Investment Summary as a top-level Section 0** (executive summary card before §1). Considered. Excluded — the Investment Verdict at the document close serves the same role; doubling it adds redundancy without depth.

---

## Implementation surface

When this spec is picked up for build, the changes touch:

### Files to modify (no renames needed)

The Pitch Deck agent folders are not renamed — the `-pitchdeck` suffix stays. Only prompt content changes inside each folder.

- `agents/business-analyst-pitchdeck/prompt.md` — section name changes (`radar` → `setup`, `simple_predictable` → `business_quality`), Tier 1 vocab scrub, output schema verdict-box updates, drop "Three Ms" / "Wonderful Company" / "Six-Inch Bar" / "Rulers" / "BAG" phrasings throughout, drop the "Cross-Cutting Context: Meaning & Moat Frameworks" 15-point Meaning Checklist reference (Stage 3 has its own redesign).
- `agents/competitor-evaluator-market-position-pitchdeck/prompt.md` — section title change (drop "Dominant"), Tier 1 vocab scrub, verdict-box update, remove R1 framing in "Niche Identification" prose.
- `agents/competitor-evaluator-moats-pitchdeck/prompt.md` — section name change (`barriers_moats` → `moat_analysis`), section title change ("Large Barrier to Entry & Moats" → "Moat Analysis"), **drop the entire 15-point Moat Checklist section**, Tier 1 vocab scrub, verdict-box update with Dorsey Width/Trend rubric.
- `agents/financial-analyst-pitchdeck/prompt.md` — three section name changes (`fcf` → `cash_generation`, `roe_roic_debt` → `returns_leverage`, `balance_sheet` unchanged), **add fourth section `accounting_red_flags`** with the 5-category investigation framework, Tier 1 vocab scrub, three verdict-box updates + one new verdict box, schema rename `ownerEarnings.ruleOneMethod` → `ownerEarnings.buffettMethod`. The MultiSection wrapper now contains 4 sections instead of 3 (or N sequential single-section calls per the watchout).
- `agents/management-evaluator-pitchdeck/prompt.md` — section name change (`management` → `management_capital_allocation`), section title change, drop "Three Ms" introduction phrasing, drop "Big Audacious Goal (BAG)" trademark wording (concept stays as "long-term strategic vision"), Tier 1 vocab scrub, schema rename `data.ceo.bag` → `data.ceo.strategicVision`, verdict-box update.
- `agents/risk-analyst-pitchdeck/prompt.md` — section name change (`pest` → `risk_profile`), section title change ("Limited Exposure to P.E.S.T Risks" → "Risk Profile"), add Klarman permanent-vs-temporary loss classification overlay (each PEST risk gets a `lossType` field), Tier 1 vocab scrub, verdict-box update. PEST framework itself stays.
- `agents/valuation-specialist-pitchdeck/prompt.md` — section title unchanged ("Valuation"), schema rename all `stickerPrice*` fields → `fairValue*`, Tier 1 vocab scrub, verdict-box update. **Do NOT add Mauboussin reverse-DCF** — that's Final-Thesis-exclusive.
- `agents/synthesis-writer-pitchdeck/prompt.md` — section name change (`overall_verdict` → `investment_verdict`), title change ("Overall Verdict" → "Investment Verdict"), add Pre-Decision Quality Check closing-block requirement (Calibrated Confidence + Anticipated Regret), Tier 1 vocab scrub, narrative requirements update.
- `.claude/skills/generate-pitch-deck/SKILL.md` — **agent registry update** (section keys change), **wave map update** (financial-analyst now produces 4 sections), section count contract check update (from "11 sections" to "12 sections" in Step 14.4), file path updates throughout (sections/`fcf.json` → sections/`cash_generation.json`, etc.), Tier 1 vocab scrub, the Step 12 "Assemble Final Report" structure updates with the new section keys.
- `.claude/skills/generate-pitch-deck/SKILL.md` Step 14 budget tracking — `agentMap` updates with new section keys.

### Output files to update (paths under `.thesis/reports/{TICKER}/`)

- `sections/fcf.json` → `sections/cash_generation.json`
- `sections/roe_roic_debt.json` → `sections/returns_leverage.json`
- `sections/barriers_moats.json` → `sections/moat_analysis.json`
- `sections/management.json` → `sections/management_capital_allocation.json`
- `sections/pest.json` → `sections/risk_profile.json`
- `sections/overall_verdict.json` → `sections/investment_verdict.json`
- `sections/radar.json` → `sections/setup.json`
- `sections/simple_predictable.json` → `sections/business_quality.json`
- `sections/accounting_red_flags.json` (new)
- `pitch-deck.json` and `pitch-deck.md` — root-level outputs keep their names; the inner `sections[]` array carries the new keys.
- `archive/{stamp}/` — auto-archive paths in SKILL.md Step 17 inherit the new section file names.

### ReportSectionSchema key enum changes

- `radar` → `setup`
- `simple_predictable` → `business_quality`
- `market_position` → unchanged
- `barriers_moats` → `moat_analysis`
- `fcf` → `cash_generation`
- `roe_roic_debt` → `returns_leverage`
- `balance_sheet` → unchanged
- `accounting_red_flags` → NEW
- `management` → `management_capital_allocation`
- `valuation` → unchanged
- `pest` → `risk_profile`
- `overall_verdict` → `investment_verdict`

### Section count contract change

The current Pitch Deck contract enforces **11 sections** (10 + overall_verdict). After this redesign, the contract is **12 sections** (11 emitted by 8 agents — financial-analyst now emits 4 — plus 1 synthesis verdict). Update Step 14.4 in the skill accordingly:

```js
if (sections.length !== 12 || maxSectionNumber !== 12 || !sections.some(s => s.key === 'investment_verdict')) {
  console.error('CONTRACT VIOLATION: pitch deck must have 12 sections with investment_verdict as section 12');
  process.exit(1);
}
```

### PDF/DOCX template work

- `scripts/pdf/generate_pitch_deck_pdf.py` — render with the 7-top-level-section grouping (§§3, 4 are multi-subsection sections), drop the 15-point Moat Checklist render, add verdict-box visual element (bordered call-out, color-coded), add §4d Accounting Red Flags subsection render, add Pre-Decision Quality Check closing block to the Investment Verdict render, replace "Sticker Price" with "Fair Value" in all rendered headers and labels.
- `scripts/pdf/docx_helpers.py` — same render changes for DOCX.

### UI work (`PitchDeck.jsx`)

- `src/components/PitchDeck.jsx` — same render-shape changes as PDF/DOCX. The existing `KEY_NORMALIZATION` map needs the new key entries added. **Consolidation note:** the `KEY_NORMALIZATION` watchout from STEPS.md applies — this is a good time to consolidate `KEY_NORMALIZATION` between PitchDeck.jsx and FullStory.jsx (now FinalThesis.jsx) into a single source of truth, since both stage redesigns are landing concurrently.
- `src/components/Toolbox.jsx` — search for `Sticker` references in the valuation tab and rename to `Fair Value`.
- `src/components/CompanyHeader.jsx` — search for any `Sticker` ScoreBadge usage; should already be clean from Phase 2A but verify.
- `src/hooks/usePitchDeck.js` — gate dev-only Vite middleware paths on IS_DEV per the existing watchout.

### W2 punch list (semantic UI rewrite)

Stage 2 entries in `W2-PUNCHLIST.md` inherit the new section names from this spec (just as Stage 3 entries inherit from the Final Thesis spec). W2 should not start writing Stage 2 UI copy until this spec is implemented (or at minimum, until the section names are fixed in code, which is a clean precondition).

### Test fixtures

Any test fixture files under `agents/__tests__/`, `api/__tests__/`, or `src/**/__tests__/` that reference the old section keys (`radar`, `simple_predictable`, `barriers_moats`, `fcf`, `roe_roic_debt`, `management`, `pest`, `overall_verdict`) need updating. Quick grep should surface them.

---

## Coordination with other pods and workstreams

**Pod #1 (Thesis Score):** independent. The Thesis Score may surface in the Pitch Deck report header (it does today), but the score itself is a separate brainstorm.

**Pod #2 (Valuation methods):** real coordination point. §6 Valuation keeps MOS / PBT / Ten Cap / Equity Bond *intact at the time of this spec*. If pod #2 reworks any of those methods (drops Ten Cap, replaces PBT, etc.), the §6 narrative wraps whatever methods land — the *presentation* (verdict box, fair-value rename, sensitivity tables, PM-confirmation gate) is method-agnostic. The implementation engineer should land Pitch Deck redesign with current methods, then update if pod #2 changes the method set.

**Pod #3 (Guru list):** independent. The current guru list is referenced inside §1 Setup (Guru Screening) and §5 Management & Capital Allocation (Guru Ownership Context). Whatever guru list pod #3 produces, both treatments ("guru ownership is context, not confirmation") don't change.

**Pod #4 (Final Thesis):** locked. This Pitch Deck spec was written to align with the locked Final Thesis spec on:
- 6-moat-type taxonomy (both stages keep R1's 6 types)
- Verdict-box artifact pattern (both stages adopt it)
- "Buffett method" naming for one of the dual Owner Earnings methods
- Stage-differentiation guarantees (Mauboussin reverse-DCF stays FT-only; Trade Plan stays FT-only; adversarial Debate stays FT-only)

**W2 punch list (semantic UI rewrite):** Stage 2 entries inherit the new section names from this spec. Same dependency model as Stage 3.

**Phase 5 (Reports & polish):** the verdict-box visual element introduced here (and in FT) is an opportunity to also introduce Phase 5's broader chart improvements as a coordinated render upgrade. Worth flagging.

**Toolbox refactor (STEPS.md Phase 5):** the existing 700-line Toolbox.jsx god-component is the hardest implementation surface for the `stickerPrice*` → `fairValue*` rename. Consider scoping the Toolbox refactor to land alongside this spec rather than after — the rename touches valuation-tab variable names anyway.

---

## References

This spec drew on the following:

- **R1 official Pitch Deck template** (user-provided, "Rule #1 Pitch Deck Template.pdf") — the source of the current 10-section structure being replaced.
- **User's pre-R1 personal template** (user-provided, "My Template.pdf") — source of the Accounting Red-Flag scan (page 4 "Investigate whenever you see the words 'capitalized', 'deferred', or 'restructuring'") and the Calibrated Confidence + Anticipated Regret pre-decision check (page 2 "Factors of a good decision").
- **CFA Institute Equity Research Report standard** ([CFA Research Challenge essentials PDF](https://www.cfainstitute.org/sites/default/files/-/media/documents/support/research-challenge/challenge/rc-equity-research-report-essentials.pdf)) — the source of the CFA-aligned 7-section spine (Investment Summary / Business Description / Industry & Competitive Position / Financial Analysis / Management & Capital Allocation / Valuation / Investment Risks).
- **Pat Dorsey, *The Little Book That Builds Wealth*** ([Morningstar](https://www.morningstar.com/stocks/pat-dorsey-economic-moats-more)) — Width/Trend rubric for the §3b verdict box (only borrowed concept; the 6-type taxonomy stays per Final Thesis alignment).
- **Seth Klarman, *Margin of Safety*** ([summary](https://www.safalniveshak.com/wp-content/uploads/2013/05/30-Ideas-from-Margin-of-Safety.pdf)) — permanent-vs-temporary loss classification overlay for §7 Risk Profile.
- **Aswath Damodaran, *Narrative and Numbers*** ([CFA Institute](https://blogs.cfainstitute.org/investor/2014/12/10/aswath-damodaran-the-most-reliable-investment-valuations-balance-numbers-and-narratives/)) — narrative-test discipline informs the §2 Business Quality prose framing.
- **Value Investors Club** ([valueinvestorsclub.com](https://www.valueinvestorsclub.com/help/faq)) — steel-manned bear case as a section-level mandate; informs §7 Risk Profile and the §Investment Verdict close.
- **Final Thesis spec** ([2026-05-09-final-thesis-redesign.md](2026-05-09-final-thesis-redesign.md)) — verdict-box pattern, dual Owner Earnings naming, 6-moat-type alignment, stage-differentiation rationale.

---

## Sign-off

Spec drafted 2026-05-09. Awaiting user sign-off before invoking `write-plan` for the implementation plan.
