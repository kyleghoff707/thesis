# POD-4 — Final Thesis Spec

**Status:** Locked 2026-05-09
**Brainstorm pod:** #4 from [STEPS.md](../../STEPS.md) Phase 2B
**Replaces:** Stage 3 "Full Story" workflow
**Implementation status:** Pending (gates W2 semantic UI rewrite for Stage 3 components)

---

## What this is

A locked design spec for the redesign of the Stage 3 conviction document, formerly "Full Story." Opened to satisfy STEPS.md Phase 2B's requirement to redesign the Full Story workflow so it isn't a 1:1 R1-form translation, while preserving the analytical substance (same investment topics) and the user's signature addition (the adversarial debate in Section 6).

The implementation engineer should treat this spec as the source of truth for what the Stage 3 pipeline produces. Anything not specified here keeps its current behavior from the v3 Full Story implementation.

---

## What changed at a glance

The closed-product Full Story was ~80% R1 *Investment Story Form* translation: 6 sections matching the official R1 template, 15 / 15 / 13-point PASS/FAIL checklists, R1 vocabulary throughout (Meaning Checklist, Moat Checklist, Management Checklist, Inversion & Rebuttal). The 4-step adversarial debate in Section 6 was the user's genuine novel addition and is preserved.

Final Thesis preserves the analytical substance and the debate. It changes:

1. **The output artifact for Sections 1-4** — drops the checklist scoring (15/15/13-point PASS/FAIL items), replaces with structured analyst prose ending in a verdict box. Same investigation depth, same questions answered, completely different shape on the page.
2. **The naming of every section** — drops "Checklist," "Confirmation," "Inversion & Rebuttal" in favor of an analytical parallel-naming set (Business Analysis, Moat Analysis, Management Analysis, Valuation Analysis, The Debate).
3. **The stage name** — "Full Story" → "Final Thesis" (resonates with the project name "Thesis"; reads as a stage in the pipeline: One Pager → Pitch Deck → Final Thesis).
4. **One added paragraph in Section 5** — a Mauboussin-style reverse-DCF reality check ("what does today's price imply?").
5. **One added subsection in Section 6** — a "What we're monitoring" forward watchpoint list at the close of Compose.
6. **A new Section 7 — Trade Plan** — tranching, ROP / ROC sell rules, exit triggers, position sizing, the "would you bet your family's wealth on this?" forcing closing line. Pulled from the user's pre-R1 template.

The R1-substance-preserved sections — Moat (all 6 moat types kept), Valuation (all 4 buy-price methods kept), and The Debate (all 5 steps kept) — change *only* in presentation, not in content.

---

## Locked outcome — section table

| § | Title | Key | Source agent | Output shape |
|---|---|---|---|---|
| 1 | **Event Analysis** | `event_analysis` | risk-analyst-finalthesis-event | Structured prose + verdict box |
| 2 | **Business Analysis** | `business_analysis` | business-analyst-finalthesis | Structured prose + verdict box |
| 3 | **Moat Analysis** | `moat_analysis` | competitor-evaluator-finalthesis | Structured prose + 2-line verdict box (Primary / Secondary / Width / Trend) |
| 4 | **Management Analysis** | `management_analysis` | management-evaluator-finalthesis | Structured prose + verdict box; Promise Tracker promoted as standalone visual |
| 5 | **Valuation Analysis** | `valuation_analysis` | valuation-specialist-finalthesis | Structured prose led by reverse-DCF reality check; MOS/PBT/Ten Cap/Equity Bond all retained as buy-price methods |
| 6 | **The Debate** | `debate` | (5-agent debate flow — see §6 spec) | 5-step debate (Bull → Bear → Rebuttal → Judge → Compose); Compose closes with "What we're monitoring" list |
| 7 | **Trade Plan** | `trade_plan` | (TBD — likely synthesis-writer-finalthesis-compose extension or new agent) | Structured prose with explicit tranching plan, sell rules, exit triggers, position size, forcing question |

Stage name: **Final Thesis** (replaces "Full Story" in skill name, file paths, UI text, PDF/DOCX templates, and all derived artifacts).

---

## Section-by-section spec

### §1 Event Analysis

**Key:** `event_analysis`
**Agent:** `risk-analyst-finalthesis-event`
**Investigation:** unchanged from current v3. Same 3-event-type taxonomy (company / industry / market), same mandatory analyses (root cause, historical precedent comparison, recovery timeline, upcoming catalysts, risk classification), same web-search requirements.
**Output change:** drop any checklist artifact. Output is structured analyst prose that walks the event evaluation framework, ending with the existing `data` block (`upcomingEvents[]`, `recentMaterialEvents[]`, `eventCalendar`, `eventRiskScore`) and a verdict box.
**Verdict box format:**
> **Event verdict.** Type: company / industry / market / none. Severity: thesis-breaking / material / minor / none. Recovery timeline: [estimate]. Verdict: PASS / FAIL / WATCHLIST.

### §2 Business Analysis

**Key:** `business_analysis` (was `meaning_checklist`)
**Agent:** `business-analyst-finalthesis` (was `business-analyst-fullstory`)
**Investigation:** unchanged. The same 15-point investigation framework applies — every one of the 15 questions (business model, revenue mix, customer base, predictability, problem durability, KPIs at industry and company level, competitive advantage signals, 10-year forward view, 12-year-old test) gets answered in the analyst's research. The KPI deep dive (items 11-12) remains the centerpiece, with required industry KPI and company KPI searches.
**Output change:** drop the 15-item PASS/FAIL `data.items` array. The 15 questions get *answered* in the prose narrative, not rendered as a checklist. The narrative remains 500+ words, cited, with at least 2 red flags.
**Verdict box format:**
> **Business verdict.** Predictability: high / medium / low. Within circle of competence: yes / no / partial. Industry KPI trend: favorable / mixed / declining. Verdict: PASS / FAIL / WATCHLIST.

**`data` payload now contains:** the verdict object, KPI data (`{industryKPIs, companyKPIs, peerComparisons}`), and any cross-cutting findings — no checklist items.

### §3 Moat Analysis

**Key:** `moat_analysis` (was `moat_checklist`)
**Agent:** `competitor-evaluator-finalthesis` (was `competitor-evaluator-fullstory`)
**Moat taxonomy:** all 6 R1 moat types preserved (Brand, Network, Switching, Price Advantage, Secrets/Patents, Toll Bridge).
**Investigation:** unchanged. Same 15-question investigation (moat type identification, trajectory, replicability, pricing power, barriers to entry, market share, return metrics vs peers, analyst recognition, field research, customer loyalty, switching costs, anti-fragility, sustainability).
**Output change:** drop the 15-item PASS/FAIL `data.items` array. Same depth, same prose narrative, same "If this moat is real, why haven't competitors eroded it?" critical question. The verdict box adopts a Width/Trend rubric (the one Dorsey concept worth borrowing).
**Verdict box format:**
> **Moat verdict.** Primary type: [from R1 6-type list]. Secondary type: [from R1 6-type list, or none]. Width: wide / narrow / none. Trend: widening / stable / eroding. Sustainability horizon: [N years]. Verdict: PASS / FAIL / WATCHLIST.

**`data` payload now contains:** the verdict object, the 6-moat-type evaluation matrix (each type with verdict + evidence + confidence), peer comparison summary, and any cross-cutting findings.

### §4 Management Analysis

**Key:** `management_analysis` (was `management_checklist`)
**Agent:** `management-evaluator-finalthesis` (was `management-evaluator-fullstory`)
**Investigation:** unchanged. Same 13-point investigation (CEO tenure, personal stake, return metrics under tenure, compensation alignment, shareholder communication quality, mistakes/accountability, promise tracking, capital allocation, insider activity, guru ownership context, acquisition track record, employee sentiment, board independence). Buffett standard for shareholder communication remains the gold standard.
**Output change:** drop the 13-item PASS/FAIL `data.items` array. Same depth, same prose. **The Promise Tracker — currently buried in `data.promises[]` — gets promoted to a standalone visual** in the rendered PDF/DOCX/UI: a small table of [QuarterYear / Category / Promise / Evidence / Status]. The Promise Tracker stays in the agent output as `data.promises[]` and is rendered separately from the prose.
**Verdict box format:**
> **Management verdict.** CEO integrity: high / medium / low. Capital allocation: rational / questionable / poor. Promise tracking: kept / mixed / broken. Verdict: PASS / FAIL / WATCHLIST.

**`data` payload now contains:** the verdict object, the `promises[]` array (unchanged), and any cross-cutting findings.

### §5 Valuation Analysis

**Key:** `valuation_analysis` (was `valuation_confirmation`)
**Agent:** `valuation-specialist-finalthesis` (was `valuation-specialist-fullstory`)
**Buy-price methods:** unchanged. MOS, PBT, Ten Cap, Equity Bond all retained.
**Investigation:** unchanged. Same 5 stress tests (debt-fueled growth, organic vs acquisition, growth ceiling, growth stage classification, buy price confirmation).
**Output change — added paragraph:** a one-paragraph **"What does today's price imply?"** reverse-DCF reality check inspired by Mauboussin's Price-Implied Expectations framework. The paragraph computes the growth rate, margin, and competitive duration baked into the current market price, then assesses whether those expectations are achievable given the moat and growth-stage findings.

Format example:
> "At $890, the market is pricing in 11% revenue growth for 10 years and 22% net margins maintained throughout. That implies $710B revenue by 2036 — 38% market share in a $1.9T global market. Given the wide-but-stable moat and slowing-growth-stage classification, that expectation is **aggressive but not implausible**. The Pitch Deck's 12% FGR sits at the bullish end of what the price already assumes; meaningful upside requires the FGR to *exceed* the market's expectation, not just meet it."

This paragraph leads the section. The 5 existing stress tests follow. The 4 buy-price methods get summarized in a compact closing block: "MOS: $X / PBT: $Y / Ten Cap: $Z / Equity Bond: $W. Range: $low–$high. Current: $current. Position relative to range: above / within / below."

**Verdict box format:**
> **Valuation verdict.** Buy-price range: $low–$high. Current price: $current. Margin of safety: X%. Implied-expectation gap: bull / fair / bear. Verdict: PASS / FAIL / WATCHLIST.

**Excluded:** Bond Comparison table (considered, dropped per user).

### §6 The Debate

**Key:** `debate` (was `inversion_rebuttal`)
**Section title:** "The Debate"
**Agents:** unchanged five-agent flow.
- Step 1 Bull → `synthesis-writer-finalthesis-bull` (was `-fullstory-bull`)
- Step 2 Bear → `risk-analyst-finalthesis-bear` (was `-fullstory-bear`)
- Step 3 Rebuttal → `synthesis-writer-finalthesis-rebuttal` (was `-fullstory-rebuttal`)
- Step 4 Judge → `financial-analyst-finalthesis` (was `financial-analyst-fullstory`)
- Compose → `synthesis-writer-finalthesis-compose` (was `-fullstory-compose`)

**Internal step naming:** the Bull's output remains "Bull Thesis" (per user choice — preserves the adversarial framing). All other step names unchanged.

**Output change:** Compose adds a new closing subsection: **"What we're monitoring."** This is a forward-looking watchpoint list with explicit thresholds, derived from the unresolved bear concerns surfaced by the Judge. Format:

> **What we're monitoring**
> - **FCF/Debt ratio.** Currently 2.1×. Re-evaluate if drops below 1.5×. Source: Bear inversion #2.
> - **Membership renewal rate.** Currently 92.9%. Re-evaluate if drops below 90% for 2 consecutive quarters. Source: Bear inversion #4.
> - **Insider selling.** Cluster of executive sells last quarter. Re-evaluate if pattern continues for 2 more quarters with no offsetting buys. Source: Bear inversion #6.

This is the spiritual continuation of the user's old template's "When to sell" rules but expressed as forward watchpoints rather than abstract triggers. Each item ties back to a specific bear concern from Step 2 (so the watchpoint has provenance the PM can audit).

**`data` payload adds:** `watchpoints[]` array — each entry `{ metric, currentValue, threshold, direction, sourceInversionId }`.

### §7 Trade Plan

**Key:** `trade_plan`
**Agent:** TBD during implementation. Most likely an extension of `synthesis-writer-finalthesis-compose` (it has the full debate context already) or a small new agent `trade-plan-finalthesis`. Decision deferred to implementation.

**Content (pulled from user's pre-R1 template):**
- **Position sizing.** Recommended portfolio % allocation, anchored to confidence and moat width.
- **Entry / tranching plan.** How many tranches; first tranche size; trigger price for each subsequent tranche; "first tranche is the smallest" rule by default.
- **Sell rules.** ROP (return of principal) sell zone — within 20% of fair value; ROCT (return of capital trade) at 80% of intrinsic value or below; sticker-price sell trigger; moat-breach exit trigger; management-degradation exit triggers (debt rising uncontrollably, ROIC declining, ROE declining, CEO not sharing complete story).
- **PACE plan.** Primary / Alternative / Contingency / Emergency responses to story or market changes (pulled from R1 Full Story Investment Strategy section as a structuring concept).
- **Closing forcing question.** *"Would you be okay having this company be the only asset you and your family own for the rest of your lives?"* — direct quote from the user's pre-R1 template, page 3.

**Output:** structured prose. No verdict box (this is the action plan, not an analytical verdict — the verdict came in §6). Structured `data.tradePlan` object captures position sizing, tranches, sell rules, and watchpoints in a programmatically queryable form.

---

## Cross-cutting design notes

### The verdict-box artifact pattern

Across §§1-5, the new pattern is consistent: **structured analyst prose ending in a small verdict box.** The verdict box is the at-a-glance summary the PM scans first; the prose is the evidence the PM reads when the verdict surprises them. Implementation should:

- Render the verdict box as a visually distinct element in the PDF/DOCX (e.g., bordered call-out, color-coded by PASS/WATCHLIST/FAIL).
- Render the verdict box *after* the prose narrative in the document flow.
- Surface the verdict (and only the verdict) in any summary view (the report assembly's `sectionVerdicts` table, the report bundle's manifest, etc.).
- Keep the verdict object structured (not free-text) so it can be programmatically aggregated.

### What's NOT in the data payload anymore

- §1: unchanged.
- §2: drop `data.items[]`. Drop `data.summary` (passCount, failCount, etc.).
- §3: drop `data.items[]`. Drop `data.summary`.
- §4: drop `data.items[]`. Drop `data.summary`. Keep `data.promises[]`.
- §5: streamline `data` to verdict + buy-price summary + reverse-DCF inputs/outputs.

The agent prompts must NOT instruct the model to emit the dropped structures. The PDF/DOCX templates must NOT render any checklist tables. The UI components must NOT show 15-item PASS/FAIL grids.

### Promise Tracker promotion (§4)

The Promise Tracker is currently `data.promises[]` inside the management section, rendered alongside the rest of the section data. In Final Thesis it gets a standalone presentation:
- In the PDF/DOCX: a dedicated subsection with its own heading, rendered as a clean table.
- In the UI (FinalThesis.jsx): its own React component, not buried inside a checklist render.
- The agent contract for `data.promises[]` is unchanged — only the rendering changes.

### Reverse-DCF reality check (§5)

This is a single paragraph at the top of Section 5's narrative. The agent must compute (or estimate) what the current market price implies for revenue growth, margins, and competitive duration. The math is back-of-the-envelope, not a full DCF — typical pattern:

1. Take current market cap.
2. Assume terminal value at year 10 ÷ 1.10^10 ≈ today's price.
3. Solve for the revenue growth + margin combo that makes the math work, given some default cost of capital (10% baseline).
4. Check the implied 10-year revenue against industry TAM.
5. State the implication in plain English.

The output is prose, not a structured `data` field. (Optional `data.impliedExpectations: { revenueGrowth, netMargin, marketShare, achievability }` block is fine if implementation finds it useful for the UI.)

---

## Out of scope (considered and excluded)

These were on the table during the brainstorm and explicitly *not* picked:

- **Bond Comparison table.** Considered (from user's pre-R1 template). Excluded by user choice — felt redundant with existing Equity Bond method.
- **VIC variant-perception spine.** Considered as a top-level reframe. Excluded — would have required restructuring the entire stage around "what does the market believe vs what do I believe," which is incompatible with keeping moat / valuation / debate substantively R1-shaped.
- **Greenwald Asset / EPV / Franchise / Growth tier valuation.** Considered as a Section 5 substitution. Excluded — Pitch Deck's MOS / PBT / Ten Cap / Equity Bond methods are kept intact (user preference; pod #2 may revisit valuation methods separately).
- **Pat Dorsey's 4-source moat taxonomy** (Intangibles / Switching / Network / Cost). Considered as a Section 3 substitution. Excluded for taxonomy (R1's 6 types stay), but the Width/Trend verdict-box rubric is borrowed.
- **Renaming "Bull Thesis" to "Investment Thesis."** Considered. Excluded — preserves the adversarial framing.
- **Reducing 6 moat types back to original R1 "Big Five"** (dropping Network). Considered. Excluded — Network is widely recognized as a real moat type for tech/platform companies.
- **`Trade Plan` as a closing subsection inside §6.** Considered. Excluded in favor of standalone Section 7.

---

## Implementation surface

When this spec is picked up for build, the changes touch:

### Files to rename

- `.claude/skills/generate-full-story/` → `.claude/skills/generate-final-thesis/` (folder + SKILL.md frontmatter `name:` field)
- `agents/risk-analyst-fullstory/` → `agents/risk-analyst-finalthesis/`
- `agents/risk-analyst-fullstory-event/` → `agents/risk-analyst-finalthesis-event/`
- `agents/risk-analyst-fullstory-bear/` → `agents/risk-analyst-finalthesis-bear/`
- `agents/business-analyst-fullstory/` → `agents/business-analyst-finalthesis/`
- `agents/competitor-evaluator-fullstory/` → `agents/competitor-evaluator-finalthesis/`
- `agents/management-evaluator-fullstory/` → `agents/management-evaluator-finalthesis/`
- `agents/valuation-specialist-fullstory/` → `agents/valuation-specialist-finalthesis/`
- `agents/synthesis-writer-fullstory/` → `agents/synthesis-writer-finalthesis/`
- `agents/synthesis-writer-fullstory-bull/` → `agents/synthesis-writer-finalthesis-bull/`
- `agents/synthesis-writer-fullstory-rebuttal/` → `agents/synthesis-writer-finalthesis-rebuttal/`
- `agents/synthesis-writer-fullstory-compose/` → `agents/synthesis-writer-finalthesis-compose/`
- `agents/financial-analyst-fullstory/` → `agents/financial-analyst-finalthesis/`
- `scripts/pdf/generate_full_story_pdf.py` → `scripts/pdf/generate_final_thesis_pdf.py`
- `src/components/FullStory.jsx` → `src/components/FinalThesis.jsx`
- `src/hooks/useFullStory.js` → `src/hooks/useFinalThesis.js`
- (and any imports / agent registrations that reference these paths)

### Output files to rename

- `.thesis/reports/{TICKER}/full-story.json` → `final-thesis.json`
- `.thesis/reports/{TICKER}/full-story.md` → `final-thesis.md`
- `.thesis/reports/{TICKER}/full-story-api.json` → `final-thesis-api.json`
- Auto-archive paths in SKILL.md Step 11

### ReportSectionSchema key enum changes

- `meaning_checklist` → `business_analysis`
- `moat_checklist` → `moat_analysis`
- `management_checklist` → `management_analysis`
- `valuation_confirmation` → `valuation_analysis`
- `inversion_rebuttal` → `debate`
- (new) `trade_plan`
- `event_analysis` unchanged

### Agent prompt rewrites required (real work, not just renames)

1. All five Phase 1 prompts: drop the 15/15/13-item PASS/FAIL output structure from the agents' Output Format sections, replace with prose-with-verdict-box instructions.
2. `valuation-specialist-finalthesis`: add the reverse-DCF reality check requirement; reorder narrative structure to lead with it; streamline existing valuation-confirmation `data` payload.
3. `synthesis-writer-finalthesis-compose`: add the "What we're monitoring" closing subsection requirement; document the `data.watchpoints[]` schema.
4. New agent (or extension of compose): Trade Plan content per §7 spec.
5. Strip remaining "checklist" / "confirmation" / "Inversion & Rebuttal" vocabulary from all prompts; substitute new section names consistently.
6. Update the `## The Full Story: 6-Section Conviction Framework` table that appears in every prompt — now: 7-Section Conviction Framework with the new names.

### PDF/DOCX template work

- Drop checklist rendering across §§1-4.
- Add verdict-box visual element (bordered call-out, color-coded).
- Add Promise Tracker as standalone subsection in §4 render.
- Add reverse-DCF paragraph as the lead block in §5 render.
- Add "What we're monitoring" subsection in §6 render.
- Add §7 Trade Plan render (new section).

### UI work (`FinalThesis.jsx`)

- Same render-shape changes as PDF/DOCX.
- The existing `KEY_NORMALIZATION` map needs to be updated for the new keys; consolidation with `PitchDeck.jsx`'s copy is a good time to fix the watchout from STEPS.md Phase 2B.
- Tour copy and glossary text propagate from W2 punch list using the new section names.

### Other

- `useFinalThesis` hook follows the pattern of `useFullStory` — gate dev-only Vite middleware paths on IS_DEV per the existing watchout in STEPS.md.

---

## Coordination with other pods and workstreams

**Pod #1 (Thesis Score):** independent. The Thesis Score may surface in the Final Thesis report header (it does in the current Full Story), but the score itself is a separate brainstorm.

**Pod #2 (Valuation methods):** real coordination point. Section 5 keeps MOS / PBT / Ten Cap / Equity Bond *intact at the time of this spec*. If pod #2 reworks any of those methods (drops Ten Cap, replaces PBT, etc.), the Section 5 narrative wraps whatever methods land — the *presentation* (reverse-DCF lead, streamlined layout, verdict box) is method-agnostic. The implementation engineer should land Final Thesis with current methods, then update if pod #2 changes the method set.

**Pod #3 (Guru list):** independent. The current guru list is referenced inside Section 4's Item 10 (Guru Ownership Context). Whatever guru list pod #3 produces, Section 4's "guru ownership is context, not confirmation" treatment doesn't change.

**W2 punch list (semantic UI rewrite):** Stage 3 entries in W2-PUNCHLIST.md inherit the new section names from this spec. W2 should not start writing Stage 3 UI copy until this spec is implemented (or at minimum, until the section names are fixed in code, which is a clean precondition).

**Phase 5 (Reports & polish):** the verdict-box visual element introduced here is an opportunity to also introduce Phase 5's broader chart improvements as a coordinated render upgrade. Worth flagging.

---

## References

This spec drew on the following:

- **R1 official Full Story template** (user-provided, "Rule #1 Full Story Form.DOCX.pdf") — the source of the current 6-section structure being replaced.
- **User's pre-R1 personal template** (user-provided, "My Template.pdf") — source of the Trade Plan section content, the "would you bet your family's wealth on this?" forcing question, and the When-to-Sell rules now expressed as forward watchpoints.
- **Value Investors Club** ([valueinvestorsclub.com](https://www.valueinvestorsclub.com/help/faq)) — variant perception / catalyst / asymmetry framing; considered for the spine, not adopted (see Out of Scope).
- **Pat Dorsey, *The Little Book That Builds Wealth*** ([Morningstar](https://www.morningstar.com/stocks/pat-dorsey-economic-moats-more)) — Width/Trend rubric for the Section 3 verdict box (only borrowed concept; full taxonomy not adopted).
- **Bruce Greenwald, *Value Investing: From Graham to Buffett and Beyond*** ([Columbia Business School](https://business.columbia.edu/insights/chazen-global-insights/greenwald-explains-value-investing-principles)) — Asset / EPV / Franchise / Growth tiered valuation; considered, not adopted (see Out of Scope).
- **Michael Mauboussin, *Expectations Investing*** ([expectationsinvesting.com](https://www.expectationsinvesting.com/)) — reverse-DCF / Price-Implied Expectations technique, adopted as the Section 5 lead paragraph.

---

## Sign-off

Spec locked by Kyle Hoff on 2026-05-09. Open for implementation pickup as part of Phase 2B closure.
