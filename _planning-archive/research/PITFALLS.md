# Domain Pitfalls

**Domain:** SEC EDGAR XBRL financial data normalization and multi-source comparison
**Project:** Thes1s Normalization Engine (Attempt #3 -- triangulation approach)
**Researched:** 2026-03-25
**Overall confidence:** HIGH (grounded in two prior failed attempts, 50-company truth set analysis, 1,894 residual DIFF root cause analysis, and real production engine code)

---

## How This Document Is Organized

Pitfalls are ordered by severity AND by the phase where they must be addressed. Each pitfall connects back to lessons from attempts #1 and #2 where applicable. The three categories:

1. **Critical Pitfalls** -- Mistakes that caused attempts #1 and #2 to fail, or that will cause attempt #3 to produce misleading comparison results. These must be addressed BEFORE any triangulation work.

2. **Moderate Pitfalls** -- Issues that produce persistent, hard-to-diagnose accuracy gaps. These surface during triangulation and must be handled systematically.

3. **Minor Pitfalls** -- Nuances that affect edge cases or specific company types. Address as they appear in comparison results.

---

## Critical Pitfalls

Mistakes that produce systematically wrong results, cascade through derived fields, or invalidate the entire comparison methodology. Each of these either caused a previous attempt to fail or would undermine attempt #3.

---

### Pitfall 1: Fiscal Year Label Misalignment Across Sources

**What goes wrong:** You compare "FY2024" from your engine against "FY2024" from FMP/SimFin/mstarpy, but the sources are actually referring to different 12-month periods. LULU's fiscal year ending January 2025 is labeled "FY2024" by EDGAR (XBRL `fy` field) but "2025" by Morningstar (calendar year of the period end date). FMP uses `fiscalYear` which may follow a third convention. SimFin uses the period end date. If you align by label without resolving to the actual period end date, every non-December-FY company produces 100% mismatches on every field.

**Why it happens:** There is no universal fiscal year labeling convention. Three conventions coexist:

| Convention | Who Uses It | LULU FY ending Jan 31, 2025 |
|---|---|---|
| XBRL `fy` field | SEC EDGAR raw data | 2024 |
| Calendar year of period end | Morningstar, some APIs | 2025 |
| Company's own designation | 10-K cover page, varies | FY2025 (LULU calls it fiscal 2024) |

Companies with Jan or Feb FY ends are the most dangerous because XBRL `fy` is exactly 1 year behind the calendar-end convention. Companies with Mar-Nov FY ends usually have `fy` = calendar year of the end date, but this is NOT guaranteed.

**This project's history:** The Morningstar comparison harness (attempt #2) initially produced false 0% accuracy for LULU, ULTA, WSM, BOOT, NKE, COST, CRM, INTU, NVDA -- all non-December FY companies (9 of 50 = 18% of the truth set). The fix in `morningstar-to-fixtures.cjs` was auto-detection via revenue matching with a bias toward offset=0 and a 3-match requirement. But this approach was fragile: NEE (December FY) initially false-detected as offset:-1 due to coincidental revenue near-matches from utility accounting differences.

**Why attempt #3 makes this worse:** You now have FOUR sources (FMP, SimFin, mstarpy, our engine) that each may use a different labeling convention. A naive four-way comparison by year label produces garbage for ~18% of companies.

**Warning signs:**
- 100% mismatch rate on a company that should be straightforward (large cap, standard accounting)
- Revenue values off by exactly 1 year's growth rate (comparing FY2023 data to FY2024 data)
- Comparison works for Dec-FY companies but fails for non-Dec-FY companies
- "Perfect" alignment on some sources but not others for the same ticker

**Prevention:**
1. **Align by period end date, not year label.** Every source must resolve to a canonical `periodEnd` date (ISO format). FMP provides `date` or `period`. SimFin provides `Report Date`. mstarpy provides fiscal period end. EDGAR provides `end` in the XBRL facts. Compare records where `periodEnd` matches within a window (not year label).
2. **Build a period-end resolution layer** as the first component of the comparison harness. This layer takes raw API responses and normalizes every record to `{ periodEnd: '2025-01-31', periodLength: 365, data: {...} }`. All downstream comparison operates on period-end-aligned records.
3. **Handle the "which year owns a mid-year period" question explicitly.** When displaying results, use the calendar year of the period end date consistently. Document the convention in the harness code. Don't let different comparison functions use different conventions.
4. **Test with the known-offset tickers first:** LULU, NVDA, COST, NKE are the acid test. If they align, the resolution layer works.

**Detection:** Run the comparison harness on JUST the 9 non-December FY companies first. If alignment is wrong, you'll see near-zero match rates on basic fields like revenue (which should be trivially identical across sources).

**Phase:** Must be the FIRST thing built in Phase 1 (comparison harness). Everything else depends on correct alignment.

**Connection to prior attempts:** Attempt #2 spent significant debugging time on this exact issue. The revenue-matching heuristic was a workaround, not a fix. Attempt #3 must solve it structurally.

---

### Pitfall 2: Sign Convention Mismatches -- The Silent Accuracy Killer

**What goes wrong:** Your engine reports Cost of Revenue as `210,352,000,000` (positive). Morningstar reports it as `-210,352,000,000` (negative). Your comparison scores this as a 200% DIFF when the actual difference is zero. Or worse: your engine reports Change in Receivables as `-5,000,000` (cash flow decrease) while a source reports `5,000,000` (balance sheet increase), and you "fix" it by adding a sign flip that breaks the 80% of companies where the conventions already aligned.

Sign convention mismatches are the most common cause of false comparison failures in XBRL normalization. They affect ~30% of financial statement fields and interact differently across all three statements.

**Why it happens:** Three independent sign convention systems coexist:

| Source | Income Statement | Balance Sheet | Cash Flow |
|---|---|---|---|
| **XBRL (raw SEC)** | Expenses positive, income positive | All positive | Outflows positive (balance-sheet-change convention) |
| **Morningstar** | Expenses negative, income positive | All positive | Outflows negative (cash-impact convention) |
| **FMP** | Usually follows MS convention | All positive | Mixed -- some fields use XBRL convention |
| **SimFin** | Expenses positive, income positive | All positive | Outflows negative (cash-impact convention) |

The engine's own `negate` flag on cash flow fields (change_in_receivables, change_in_inventory, other_noncash_items) converts XBRL's balance-sheet-change convention to cash-impact convention at extraction time. But some fields DON'T get negated (change_in_payables -- because payable increases are already positive in both conventions). This creates a mixed-sign environment where some fields have been flipped and others haven't.

**This project's history:** The field mapping table from attempt #2 includes a `sign` multiplier per field (1 or -1). But this was built for a two-source comparison (engine vs MS). With four sources, you need a sign mapping per source per field -- a 4x87 matrix, not a 1x87 vector.

**Warning signs:**
- Exact magnitude match but opposite sign (e.g., engine=210B, source=-210B)
- Accuracy that's great for revenue/net income but terrible for cost items and cash flow
- A "fix" that improves one source comparison but breaks another
- Cash flow items that are sometimes right, sometimes exactly negated

**Prevention:**
1. **Normalize all sources to a canonical sign convention before comparison.** Choose one convention (XBRL standard: expenses positive, outflows positive -- or MS standard: expenses negative, outflows negative) and apply source-specific transforms. Document which convention is canonical.
2. **Build the sign normalization into the source adapter, not the comparison logic.** Each source adapter (FMP adapter, SimFin adapter, mstarpy adapter) is responsible for outputting data in canonical convention. The comparison engine never applies sign transforms.
3. **Create a sign convention test suite.** For each field, assert that every source adapter produces the same sign for AAPL 2024. AAPL is a clean test case (calendar-ish FY, standard accounting, all tags present).
4. **Handle the `negate` fields explicitly.** The engine's `negate: true` fields already flip at extraction time. The comparison harness must know this and NOT double-flip them when comparing against sources that also use cash-impact convention.
5. **Absolute value comparison as a fallback diagnostic.** When a field fails, always check: does `abs(engine) == abs(source)`? If yes, it's a sign issue, not a normalization issue. Log these separately from true value mismatches.

**Detection:** In the first comparison run, filter for fields where `abs(diff) < 1%` but `sign(engine) != sign(source)`. These are pure sign issues. Fix them all before looking at real normalization problems.

**Phase:** Must be solved in Phase 1 (source adapters). This is a comparison infrastructure bug, not a normalization bug -- but it will mask real normalization bugs if not fixed first.

**Connection to prior attempts:** Attempt #2's `field-mapping.json` handled this for one source (MS). Attempt #3 needs per-source sign maps. The architecture must support adding new sources without rebuilding the sign logic.

---

### Pitfall 3: Measuring Tag Coverage Instead of Value Accuracy

**What goes wrong:** You achieve "96% tag coverage" and believe the engine is working well. But tag coverage measures "did we extract a number?" not "did we extract the RIGHT number?" A field can have a resolved XBRL tag, return a non-null value, and still be wrong by 500% because the wrong tag was selected, the wrong period was used, or a derivation formula has a bug.

**This is literally what killed attempt #1.** The three-layer engine achieved 96.1% coverage on S&P 500 scoring-critical fields. When compared against Morningstar, the actual accuracy was 79.5% at baseline (attempt #2). Layer 2/3 were actively making things worse -- producing 820 false matches that were counted as DIFFs. Disconnecting them IMPROVED accuracy from 79.5% to 83.7%.

**Why it happens:** Tag coverage is easy to measure (field != null), flattering (high numbers), and tempting to optimize. Accuracy requires a truth source, correct comparison infrastructure, and tolerance definitions -- all of which are hard. The natural incentive is to optimize the easy metric.

In attempt #3's context, the analogous mistake is: "3 out of 4 sources agree" being treated as proof of correctness. Three sources can agree on the wrong number if they all normalize the same XBRL data the same wrong way (e.g., all including operating leases in total debt, or all using the narrow D&A tag).

**Warning signs:**
- Coverage metric going up while known-wrong values persist
- Layer 2/3 "filling gaps" without validation that the filled values are correct
- Consensus among sources being treated as ground truth without investigating WHY they agree
- Accuracy measured only against sources that normalize the same way (survivorship bias)

**Prevention:**
1. **Never use tag coverage as an optimization target.** It is a diagnostic signal only -- "we extracted something for this field" does not mean "the extracted value is correct."
2. **In triangulation, investigate disagreement, not just agreement.** When 3 sources agree and the engine disagrees, investigate the engine. But ALSO investigate when all 4 agree -- are they all pulling from the same XBRL tag and applying the same (possibly wrong) normalization?
3. **Maintain the Morningstar truth set as the ground truth for the 50 companies it covers.** FMP/SimFin/mstarpy agreement is evidence, not proof. MS CSV data downloaded and manually verified is the highest confidence reference.
4. **Track accuracy by field category, not just overall.** Overall accuracy hides the fact that revenue/net income match at 99% while cash flow items match at 70%. The aggregate number is misleading.

**Detection:** Compare per-field accuracy rates between "tag coverage" and "value accuracy." A field with 100% coverage but 50% accuracy is a normalization bug. A field with 80% coverage and 95% accuracy is a tag gap (less dangerous).

**Phase:** This is a mindset pitfall, not a code pitfall. Must be internalized before Phase 1 begins. Every phase should track value accuracy, not coverage.

**Connection to prior attempts:** This is THE lesson from attempt #1. The entire three-layer engine architecture was optimized for coverage. Attempt #2 proved that coverage and accuracy are weakly correlated for the hardest fields.

---

### Pitfall 4: Derived Field Error Amplification

**What goes wrong:** You compute Gross Profit = Revenue - Cost of Revenue. Revenue is correct. COGS has a 15% error (wrong XBRL tag picked). Gross Profit now has a 40% error because it's a subtraction of two large numbers where the error is in one of them. You then compute Gross Margin = Gross Profit / Revenue. The margin error is 6 percentage points -- enough to change a PASS to FAIL in Rule One analysis.

This error amplification is the mechanism behind the B7 residual computation catastrophe: computing "Other Investing = Total Investing CF - named investing items" produced values 500x wrong (AAPL: -385M expected, -194B computed) because each named item's error accumulated into the residual.

**Why it happens:** Derived fields are computed from other fields. Errors in source fields propagate AND amplify through arithmetic:
- **Subtraction amplification:** When A and B are close in magnitude, `A - B` amplifies small relative errors into large ones. Revenue=$100B with 0% error, COGS=$80B with 5% error ($4B) -> Gross Profit error = $4B / $20B = 20%.
- **Cascade multiplication:** Derived fields feed other derived fields. Total Debt (wrong) -> Net Debt (wrong) -> Debt/Equity (wrong) -> Rule One Score (wrong).
- **Residual accumulation:** "Other" = Total - Sum(known). If N known items each have 5% error, the residual absorbs all N errors. With 5 known items each 5% off, the residual can be 25%+ off.

The engine has ~40 derived fields in `computeDerivedFields()`. Many are chained: SGA (derived from selling + G&A) feeds Operating Income (derived from gross profit - SGA - R&D - D&A) feeds EBIT feeds EBITDA. A single tag error in selling_expense can corrupt 4+ downstream fields.

**Warning signs:**
- Derived field accuracy significantly lower than source field accuracy
- "Other" category fields with wild swings (order-of-magnitude errors)
- A single tag fix causing multiple unrelated fields to change accuracy
- Accuracy on computed subtotals (noncurrent_liabilities, working_capital) worse than their input fields

**Prevention:**
1. **Validate source fields BEFORE derived fields.** Phase 1 should compare only directly-extracted XBRL fields. Phase 2 should compare derived fields. Never fix derived field formulas until their inputs are validated.
2. **Track the derivation dependency graph.** Know which fields feed which. When a source field's accuracy improves, re-check all downstream derived fields. The current engine's `getDerivedFormula()` provides this, but the comparison harness needs to use it.
3. **Defer residual computations ("Other" fields) indefinitely.** Attempt #2 proved these blow up unless named items are at ~100% accuracy. In attempt #3, treat "Other" fields as informational (never fail on them) until all their inputs are validated.
4. **Use tolerance tiers that account for amplification.** A derived field that's two subtractions deep should have a wider tolerance than a directly-extracted field. The current tolerance tiers (exact < 1%, close < 5%, approximate < 10%) need a "derived" tier.
5. **When a derived field fails, diagnose by checking inputs first.** If Gross Profit is wrong, check Revenue and COGS before touching the derivation formula. The formula is usually right; the inputs are wrong.

**Detection:** Add a "derivation depth" metric to comparison results. Sort failures by derivation depth. If depth-0 (direct XBRL) fields are mostly correct but depth-1+ fields are failing, the issue is error amplification, not normalization.

**Phase:** Prevention is architectural (Phase 1: comparison harness design). The tolerance tier system and derivation depth tracking should be built into the harness from the start.

**Connection to prior attempts:** B7 in attempt #2 was reverted TWICE because of this exact pitfall. The residual computation turned 62-failure fields into 204-failure fields. Attempt #3 must treat derived fields as second-class citizens until their inputs are proven.

---

### Pitfall 5: Morningstar Inconsistency Treated as Engine Bug

**What goes wrong:** You compare your engine against Morningstar and find a mismatch. You assume your engine is wrong. You "fix" the engine to match Morningstar. But Morningstar was wrong (or internally inconsistent), and your "fix" breaks 30 other companies that were previously correct.

This already happened: MS includes operating lease ROU assets in "Net PPE" for some years but not others for the same company (AAPL 2021 vs 2022+). The engine was made to unconditionally add ROU to PP&E to match MS's majority convention, which created 49 new mismatches on years where MS excludes ROU.

**Why it happens:** Morningstar is not a perfect truth source. It's a normalized view built by humans and algorithms at Morningstar with their own design choices, bugs, and inconsistencies. Specific known issues:
- **Temporal inconsistency:** MS may change its normalization methodology between years for the same company (PP&E + ROU inclusion, lease reclassification)
- **Restatement lag:** When a company files a 10-K/A (amended filing), MS may update some years but not others, creating internal inconsistencies
- **Cross-statement leakage:** MS's "Total Equity" includes NCI, but their ROE calculation may use parent-only equity
- **Industry boundary shifts:** MS may reclassify a company's industry between years, changing which normalization rules apply

**Warning signs:**
- A fix that improves 30 companies but breaks 10
- Morningstar values that change retroactively (compare a CSV downloaded today vs one from 6 months ago)
- A field that's consistently wrong for recent years but correct for older years (MS methodology change)
- Contradictory field values within MS itself (Total Assets != Current + Non-Current)

**Prevention:**
1. **Triangulate, don't single-source.** This is the entire premise of attempt #3. When MS says X and FMP+SimFin say Y, investigate both. MS is one vote, not the answer key.
2. **Document known MS inconsistencies as exemptions, not failures.** When you identify an MS inconsistency (PP&E ROU inclusion varying by year), create an exemption in the comparison harness that marks those company-year-field triples as "MS_INCONSISTENT" -- neither MATCH nor DIFF.
3. **Version-track your truth set.** If MS changes their numbers, you need to know. Store the download date of each CSV. If re-downloaded CSVs differ from originals, that's a MS restatement, not an engine regression.
4. **Build a "consensus truth" from triangulation.** For each field-year-company: if 3+ sources agree (within 2%), that's the truth. If sources disagree, investigate. The output of attempt #3 should be a validated truth set, not a copy of MS's truth set.

**Detection:** After each normalization fix, check whether it improved aggregate accuracy AND didn't introduce new failures. A fix that trades 30 improvements for 10 regressions may be matching MS inconsistency, not fixing a real bug.

**Phase:** Phase 2 (multi-source triangulation). The comparison harness must support per-source-per-field accuracy reporting, not just engine-vs-truth.

**Connection to prior attempts:** Attempt #2 ended at 91% accuracy with the conclusion "remaining 1,270 DIFFs are structural." Many of those are MS inconsistencies, not engine bugs. Attempt #3 must distinguish the two.

---

### Pitfall 6: Field Name Mapping Drift Across Sources

**What goes wrong:** FMP calls it `costOfRevenue`. SimFin calls it `Cost of Revenue`. mstarpy calls it `Cost of Revenue` (with space). Your engine calls it `cost_of_revenue`. You build a mapping table for one source, miss a field in another, and that missing mapping shows up as 100% MISSING for that source -- inflating the overall error rate with what is actually a harness bug, not a data issue.

**This project's history:** The attempt #2 field mapping covers 87 Morningstar fields. SimFin uses completely different field names and has separate templates for banks and insurance companies. FMP uses camelCase API field names. Adding three more sources means building three more field mappings, each with 80-100+ fields. A single missing or incorrect mapping per source produces hundreds of false comparison failures.

**Why it happens:** There is no standard for financial field naming. Each data provider invents their own vocabulary:

| Our Engine | Morningstar | FMP | SimFin |
|---|---|---|---|
| `cost_of_revenue` | `Cost of Revenue` | `costOfRevenue` | `Cost of Revenue` |
| `net_income_loss` | `Net Income` | `netIncome` | `Net Income` |
| `depreciation_amortization` | `Depreciation, Reconciled` | `depreciationAndAmortization` | `Depreciation & Amortization` |
| `operating_income_loss` | `Operating Income` | `operatingIncome` | `Operating Income (Loss)` |
| `cash` | `Cash And Cash Equivalents` | `cashAndCashEquivalents` | `Cash & Cash Equivalents` |

And it gets worse: some sources split fields that others combine (SimFin has separate `Depreciation` and `Amortization`; FMP combines them). Some sources include fields others don't (FMP has `link` and `cik` metadata fields mixed with financial data). Some sources change field names between API versions.

**Warning signs:**
- MISSING rate for one source dramatically higher than others
- Fields that match perfectly for one source but show as MISSING for another
- Accuracy suddenly dropping after a source API update
- "New" fields appearing in a source that are actually renamed existing fields

**Prevention:**
1. **Build field mapping tables per source BEFORE the comparison engine.** This is a separate, deliberate step -- not something discovered during comparison debugging. For each source, download a sample response, enumerate all fields, and map each to the engine's canonical field names.
2. **Start with high-value fields only.** Map the 20-25 fields that matter most for Rule One scoring (revenue, net income, EPS, BVPS, cash flow from operations, capex, total debt, equity, shares outstanding). Expand mappings incrementally as those fields validate.
3. **Validate mappings with a single ticker sanity check.** For AAPL (clean, well-documented), verify that every mapped field produces the same value across all sources (within sign convention differences). This catches mapping errors before the full comparison run.
4. **Version-pin source API responses.** When a source changes their API format, your mapping may break. Cache raw API responses and re-validate mappings when updating to new API versions.
5. **Log unmapped fields.** Every field in a source response that's NOT in the mapping table should be logged. This catches new fields and helps identify mapping gaps.

**Detection:** For each source, report the count of mapped vs unmapped fields. If SimFin has 45 fields and you've mapped 20, the comparison is inherently incomplete. Track this as "mapping coverage" (distinct from "tag coverage" and "value accuracy").

**Phase:** Phase 1, alongside fiscal year alignment and sign conventions. The source adapters and field mappings are prerequisite infrastructure.

**Connection to prior attempts:** Attempt #2's `field-mapping.json` covered 87 MS fields out of 675 unique field names (13% mapping coverage). The 2,757 MISSING values in the baseline were partly real gaps and partly unmapped fields. Attempt #3 must separate "field not mapped" from "field mapped but engine returns null."

---

## Moderate Pitfalls

Issues that produce persistent accuracy gaps, false positives in comparison results, or hard-to-diagnose discrepancies. These surface during active triangulation work.

---

### Pitfall 7: Industry-Specific Normalization Differences

**What goes wrong:** Your engine normalizes JPMorgan using the bank overlay (NII, deposits, efficiency ratio). FMP normalizes JPMorgan using their standard financial model. SimFin uses a separate bank template. Each source makes different choices about what "Revenue" means for a bank (NII? Total interest income? Total revenue including non-interest income?) and what "Operating Income" means (pre-provision? post-provision? N/A?). The triangulation shows disagreement, but it's not because anyone is wrong -- they're all correctly normalizing under different definitions.

**Fields most affected by industry:**
- **Banks:** Revenue (NII vs total), Operating Income (pre/post provision), Total Debt (deposits as debt?), Equity (regulatory vs book)
- **REITs:** Revenue (rental vs total), Net Income (vs FFO), CapEx (maintenance vs growth), Total Debt (secured vs unsecured)
- **Insurance:** Revenue (premiums earned vs total), Reserves (vs liabilities), Investment Income (operating vs non-operating)
- **Utilities:** Revenue (regulated vs total), CapEx (very high, lumpy), D&A (accelerated schedules)

**Warning signs:**
- Financial sector companies showing 40-60% accuracy while standard companies show 90%+
- "Revenue" matching for standard companies but failing for banks/insurance
- All sources disagreeing with each other on the same bank field (not just engine vs sources)
- Source that has separate bank/insurance templates showing different results than source with unified template

**Prevention:**
1. **Compare financial sector companies SEPARATELY.** Don't let bank comparison failures drag down aggregate accuracy. Report accuracy for standard companies, banks, REITs, and insurance as separate cohorts.
2. **For banks/REITs/insurance, align on definitions before comparing values.** Define what "Revenue" means for each industry type in the comparison harness. If FMP uses Total Revenue and SimFin uses Net Interest Income for banks, those are different fields -- don't compare them.
3. **Use the engine's `industryClassifier.js` to route comparison logic.** When `classifyIndustryType(sic)` returns 'bank', use bank-specific field mappings. When it returns 'reit', use REIT-specific mappings.
4. **Accept wider tolerances for financial sector.** Attempt #2 already relaxed tolerance for BRK-B, JPM, MET, WFC. Attempt #3 should formalize this: standard = 1% tolerance, financial sector = 5% tolerance on revenue and debt, 10% on derived fields.

**Detection:** Sort comparison results by industry type. If one industry has dramatically worse accuracy, the issue is definitional, not algorithmic.

**Phase:** Phase 2 (triangulation). Build industry routing into the comparison harness when adding SimFin (which has explicit bank/insurance templates).

**Connection to prior attempts:** Attempt #2 relaxed tolerances for 4 financial sector tickers. Attempt #3 should systematize this into the comparison framework rather than handling it as per-ticker exceptions.

---

### Pitfall 8: Restated vs As-Filed Data Mismatch

**What goes wrong:** Your engine extracts the "restated" version of financial data (EDGAR's latest filing includes restated comparatives for prior years). Source A also uses restated data. Source B uses as-filed data. When a company restated FY2022 numbers in their FY2024 10-K, your engine and Source A agree (both have restated 2022), but Source B disagrees (it has the original 2022 from the FY2022 10-K). The comparison reports a DIFF that's actually a restatement, not a normalization error.

Common restatement triggers:
- **Accounting standard changes** (ASC 606 revenue recognition, ASC 842 leases -- retroactively applied)
- **Segment reorganization** (company restructures reporting segments, restates prior years)
- **Error corrections** (10-K/A filings with material corrections)
- **Discontinued operations** (divested business removed from continuing operations retroactively)
- **Spin-offs** (JNJ pre-Kenvue, T pre-Warner Bros Discovery)

**This project's history:** Attempt #2 flagged EQIX, LEN, NEM, PG, SFM, XPEL as "restatement flagged (10-K/A filed)" and JNJ/T as "spin-off flagged." These 8 companies accounted for hundreds of legitimate but misleading DIFFs.

**Warning signs:**
- Older years showing larger discrepancies than recent years (restatement applied going forward)
- Revenue changing retroactively (ASC 606 restatement)
- Balance sheet items changing retroactively for years before 2019 (ASC 842 lease restatement)
- One source agreeing with the engine and another disagreeing for the same year (restated vs as-filed)

**Prevention:**
1. **Know which version each source provides.** FMP provides restated (latest filing's comparatives). SimFin provides restated. mstarpy provides restated. EDGAR raw XBRL provides restated (the engine's "restated" mode). If all sources use restated, this pitfall is minimized for standard comparisons.
2. **Flag known restatement companies in the comparison harness.** For the 50-company truth set, document which tickers have material restatements and which years are affected. Comparison results for those company-years should be flagged as "RESTATEMENT" and excluded from aggregate accuracy.
3. **For spin-off companies, use informational-only comparison for pre-spin years.** JNJ's revenue for 2021 includes Kenvue. Post-spin JNJ revenue is dramatically lower. Comparing pre-spin years is meaningless.
4. **If a source offers both restated and as-filed, always use restated for comparison** (since the engine uses restated).

**Detection:** When a company shows perfect accuracy for recent years but diverging accuracy for older years, suspect a restatement. Check the company's EDGAR filings page for 10-K/A amendments.

**Phase:** Phase 1 (source adapter design). Each source adapter should document whether it provides restated or as-filed data. Flag known restatement tickers in the comparison configuration.

---

### Pitfall 9: Units and Scale Mismatches

**What goes wrong:** Your engine returns revenue in whole dollars (391,035,000,000). FMP returns revenue in whole dollars. mstarpy returns revenue in millions (391,035). SimFin sometimes returns in thousands. You compare 391,035,000,000 to 391,035 and report a 1,000,000x DIFF. Or worse: you know about the million-dollar scaling and apply it, but one source inconsistently scales some fields differently (per-share data in whole dollars while financial data is in millions).

**Why it happens:** Financial data APIs have no uniform scaling convention:

| Source | Dollar Fields | Per-Share Fields | Shares Outstanding |
|---|---|---|---|
| Our Engine | Whole dollars | Whole dollars | Whole shares |
| Morningstar CSVs | Whole dollars (with trailing decimal) | Whole dollars | Whole shares |
| mstarpy | Millions (multiply by 1e6) | Whole dollars | Millions (sometimes) |
| FMP | Whole dollars | Whole dollars | Whole shares |
| SimFin | Whole dollars (configurable) | Whole dollars | Whole shares |

The mstarpy case is particularly dangerous because the scaling factor is implicit -- the API response doesn't include units metadata. Per-share data (EPS, DPS, BVPS) is NOT scaled by 1e6, but financial data IS. If you apply a blanket 1e6 multiplier, EPS goes from $6.73 to $6,730,000.

**Warning signs:**
- Off by exact powers of 10 (1000x, 1000000x)
- Per-share data correct but total dollar amounts wrong (or vice versa)
- One source perfectly accurate, another consistently off by the same factor
- mstarpy revenue matching but EPS wildly wrong (or vice versa)

**Prevention:**
1. **Normalize all source adapters to whole dollars.** Every adapter outputs dollar values in whole dollars, shares in whole shares, per-share in whole dollars. Apply scaling in the adapter, not the comparison engine.
2. **Unit test each adapter with known values.** AAPL 2024 revenue = $391,035,000,000 in whole dollars. Verify each adapter outputs this exact value for revenue.
3. **Separate scaling for dollar fields vs per-share fields.** mstarpy needs 1e6 for financials but 1.0 for per-share data. The adapter must know which fields are which.
4. **Check for ratio fields that shouldn't be scaled.** Tax rate, margins, ROE -- these are already percentages. Scaling them by 1e6 produces nonsense.
5. **When comparison shows ~0.1% accuracy on a source, suspect a scaling issue before investigating individual field normalization.**

**Detection:** Sort comparison failures by error magnitude. If most failures are exactly 1000x or 1000000x off, it's a scaling issue.

**Phase:** Phase 1 (source adapters). This is adapter infrastructure, not normalization.

---

### Pitfall 10: "First Tag Wins" Producing Inconsistent Extraction Across Years

**What goes wrong:** The engine's `extractSection` uses a "first tag wins" strategy -- for each field, it tries XBRL tags in priority order and takes the first one that returns a value. But a company may change which XBRL tag it uses between filings. If the engine extracts `RevenueFromContractWithCustomerExcludingAssessedTax` for FY2023 (the company's first ASC 606 filing) but `Revenues` for FY2020 (pre-ASC 606), and these two tags report slightly different values due to "assessed tax" treatment, revenue shows a discontinuity that doesn't exist in reality.

**Why it happens:** XBRL allows companies to use any us-gaap tag that fits their disclosure. Companies switch tags when:
- **Accounting standards change** (ASC 606 added `RevenueFromContractWithCustomerExcludingAssessedTax` in 2018)
- **Filing software changes** (new software prefers different tags)
- **Auditor changes** (auditors have tag preferences)
- **Organizational restructuring** (different business segments use different revenue tags)

The "first tag wins" approach means the same economic event can resolve to different values depending on which tag existed in each year's filing. This creates year-over-year discontinuities that affect growth rate calculations.

**Warning signs:**
- Growth rates showing implausible spikes or drops at the boundary year where a company changed tags
- Provenance data showing different XBRL tags for the same field across years
- Revenue/COGS showing a jump in 2018-2019 (ASC 606 transition year for most companies)
- Balance sheet items showing jumps in 2019-2020 (ASC 842 lease transition)

**Prevention:**
1. **Check for tag consistency across years in provenance data.** If a field resolves from different tags in different years, flag it. The tag change itself isn't necessarily a problem, but it should be investigated.
2. **Prefer broader, more stable tags.** `Revenues` is more stable across years than `RevenueFromContractWithCustomerExcludingAssessedTax`. But `Revenues` may not exist for newer filings. The current tag ordering (specific first, broad last) optimizes for precision at the cost of consistency.
3. **For multi-source comparison, don't chase this in the engine.** Instead, validate the engine's extracted values against sources. If the sources show the same discontinuity, it's a real accounting change. If the sources are smooth but the engine has a jump, the engine's tag selection changed at that year boundary.
4. **Use provenance to diagnose comparison failures.** When a field fails comparison for one specific year, check provenance: did the XBRL tag change? If yes, investigate whether the new tag maps to a different semantic concept.

**Detection:** Sort comparison failures by year. If failures cluster at specific transition years (2018-2019 for ASC 606, 2019-2020 for ASC 842), tag transition is the likely cause.

**Phase:** Phase 2 (during triangulation). This surfaces organically when comparing values across years. Not something to pre-fix.

---

### Pitfall 11: Combined vs Separated XBRL Tags (The AP/Accrued Problem)

**What goes wrong:** Many companies report only the combined tag `AccountsPayableAndAccruedLiabilitiesCurrent` without reporting separate `AccountsPayableCurrent` and `AccruedLiabilitiesCurrent`. Your engine uses the combined tag as a fallback for Accounts Payable. Morningstar splits it into AP and Accrued. You can't match BOTH fields because the combined tag was consumed by AP, leaving nothing for Accrued. But if you split the combined tag 50/50, you're guessing.

This is the root cause of the persistent 143 accrued_liabilities failures in attempt #2.

**Why it happens:** XBRL allows companies to report at different granularity levels. Some companies tag every line item separately; others tag only the subtotal. Data providers handle this differently:
- **Morningstar** splits combined tags using proprietary heuristics (possibly from the notes to financial statements or supplemental data)
- **FMP** often leaves combined values in one field
- **SimFin** has explicit rules for splitting
- **Your engine** uses "first tag wins" which assigns the combined value to whichever field lists the combined tag first

Fields commonly affected: AP + Accrued (combined), Short-term debt + Current portion of LT debt (combined), Finite + Indefinite intangibles (combined), Operating + Finance lease liabilities (combined).

**Warning signs:**
- Two related fields where one is always correct and the other always wrong (the combined value was consumed by one field)
- Field values that are exactly double what they should be (combined assigned to a field that should only have the component)
- Accrued liabilities showing as null when AP has a suspiciously large value
- Lease liabilities where current + noncurrent don't add up to the total

**Prevention:**
1. **Create separate "combined" fields in the engine.** When only the combined tag exists, store the combined value AND mark the components as null. Don't force a combined value into a component field.
2. **In comparison, compare combined-to-combined when components are unavailable.** If the engine has `payables_and_accrued` but not separate `accounts_payable` and `accrued_liabilities`, compare the combined field against the sum of the source's components.
3. **Accept component field failures when only combined exists.** Mark these as "COMBINED_ONLY" in comparison results, not as DIFF. They are a data granularity issue, not a normalization error.
4. **For triangulation, check which sources also have the combined-only pattern.** If FMP also shows the combined value, that corroborates the engine's extraction. If FMP has separate values, investigate how they split it.

**Detection:** For each ticker, log which fields resolved from combined vs component tags. If a company is consistently combined-only, accept lower accuracy on component fields.

**Phase:** Phase 2 (triangulation). The engine already has `payables_and_accrued` as a separate field. The comparison harness needs to know when to use it.

**Connection to prior attempts:** Attempt #2 identified the AP/Accrued circular dependency as one of three fields needing "research deep-dives." Attempt #3's multi-source approach can reveal how FMP and SimFin handle this split.

---

### Pitfall 12: XBRL Period Selection -- Duration vs Instant Tags

**What goes wrong:** The engine queries the EDGAR API for a balance sheet value using the wrong period specifier. Balance sheet items are "instant" (point-in-time) values; income statement and cash flow items are "duration" (period) values. The Frames API requires different URL patterns: `CY2024.json` for duration, `CY2024Q4I.json` for instant. Using the wrong pattern returns a 404 or wrong data.

This is already documented in CLAUDE.md and handled by the engine's `period: 'instant' | 'duration'` property on tag definitions. But it becomes a multi-source comparison issue because sources may return data for different periods.

**Specific danger for comparison:** Your engine extracts balance sheet values as of the fiscal year end date (Q4I instant). A source may return balance sheet values as of December 31 (calendar year end) for non-calendar-FY companies. LULU's assets as of January 31, 2025 (engine) vs February 1, 2025 (source using period end + 1 day convention) can differ due to next-day accrual adjustments.

**Prevention:**
1. **In source adapters, verify which date each source reports balance sheet values for.** Some APIs return `date` in the response; use it to confirm alignment with the engine's period.
2. **Accept 1-day period end date differences as matching.** January 31 vs February 1 is the same fiscal year end; don't let date off-by-one produce false mismatches.
3. **For income statement/cash flow, verify period length.** A source might return 9-month data for a company that changed its fiscal year mid-period. The engine should only compare 12-month periods.

**Phase:** Phase 1 (source adapter design). Include period date verification in each adapter.

---

## Minor Pitfalls

Nuances that affect edge cases, specific company types, or rare data conditions. Address as they surface in comparison results.

---

### Pitfall 13: Foreign Currency Companies

**What goes wrong:** RACE (Ferrari) reports in EUR. Your engine extracts EUR values. Sources may convert to USD using different exchange rates (period average for income/CF, period end for balance sheet, or a single rate for all). Comparing USD-converted values from different sources produces differences that are exchange rate methodology, not normalization.

**Prevention:** Skip non-USD companies from triangulation accuracy metrics. The engine is correct in extracting the filed currency; the comparison is meaningless across different FX rates. RACE was already excluded from attempt #2's truth set.

**Phase:** Phase 1 (comparison harness configuration). Maintain a skip list for non-USD tickers.

---

### Pitfall 14: Stock Split Adjustment Double-Counting

**What goes wrong:** The engine detects stock splits and adjusts per-share values (EPS, DPS, BVPS) and share counts for historical years. A source ALSO adjusts for splits. If both adjust independently, old-year EPS gets divided by the split factor twice. A 4:1 split turns FY2020 EPS from $10 to $2.50 (correct) or $0.625 (double-adjusted).

**This project's history:** B4 in attempt #2 confirmed the split logic was correct. But the comparison harness must still verify: does each source provide split-adjusted or as-filed per-share data?

**Prevention:**
1. **Determine each source's split adjustment status.** FMP and mstarpy provide split-adjusted data (restated comparatives). SimFin may provide as-filed with a separate split table.
2. **When the engine provides split-adjusted and the source provides split-adjusted, compare directly.** No double-adjustment needed.
3. **When the source provides as-filed, apply the engine's split factors before comparing.** Or skip per-share comparison for that source.
4. **Test with a known-split company.** TSCO had a split that caused 2400% shares error in the engine's earlier version. Use TSCO as a canary for split handling.

**Phase:** Phase 1 (source adapter documentation). Each adapter should explicitly state whether it returns split-adjusted data.

---

### Pitfall 15: Tolerance Thresholds That Hide Real Bugs

**What goes wrong:** You set tolerance at 5% to avoid noise from rounding and minor definitional differences. But a real normalization bug producing a 4.8% error gets classified as "CLOSE" and never investigated. Over time, the tolerance becomes a rug under which bugs accumulate. Aggregate accuracy looks good, but individual values are systematically biased by 3-5%.

**Prevention:**
1. **Use tight tolerances (1%) for scoring-critical fields** (revenue, net income, EPS, equity, cash, total debt, shares outstanding). These directly feed Rule One calculations.
2. **Use moderate tolerances (5%) for display fields** (SGA, R&D, individual CF items). These affect the Financials tab but don't feed scoring.
3. **Use wide tolerances (10-20%) only for residual fields** ("Other" categories) and financial sector definitional fields.
4. **Track the DISTRIBUTION of errors, not just pass/fail.** A field that passes tolerance at 4.9% across 50 companies has a systematic bias that should be investigated even though every individual comparison "passes."
5. **Never relax tolerance to improve aggregate accuracy.** Relaxing tolerance is borrowing from future debugging time.

**Phase:** Phase 1 (comparison harness design). Tolerance tiers should be defined in the harness configuration.

---

### Pitfall 16: Rate Limit Exhaustion During Comparison Runs

**What goes wrong:** FMP allows 250 calls/day. The 50-company truth set needs 3 API calls per company (income, balance, cash flow) = 150 calls just for FMP. Add SimFin at 2000/day and mstarpy with anti-bot risk. A full comparison run that hits all 4 sources for all 50 companies = ~450 FMP calls (exceeds daily limit), ~450 SimFin calls, ~50 mstarpy calls. You run the comparison, it fails at company #42 due to rate limit, and you have partial results that look like selective accuracy.

**Prevention:**
1. **Cache ALL API responses aggressively.** One call per ticker per source per day, max. Store raw responses in `validation/data/` (not IndexedDB, since these are development-time assets).
2. **Design the comparison pipeline for incremental runs.** Compare what's cached. Fetch uncached tickers in rate-limited batches. Never require a full clean run.
3. **Prioritize FMP (tightest limit).** Fetch FMP first, SimFin second, mstarpy last. If FMP quota is exhausted, the comparison can still proceed with 3 sources.
4. **mstarpy anti-bot mitigation:** Add 2-3 second delays between requests. Run mstarpy fetches as a separate batch job, not inline with comparison.

**Phase:** Phase 1 (comparison harness infrastructure). Rate limiting and caching are prerequisites for sustainable iteration.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| **Phase 1: Comparison Harness** | FY alignment (#1), Sign conventions (#2), Field mapping (#6), Units scaling (#9), Rate limits (#16) | Build these as adapter infrastructure BEFORE any accuracy measurement. A broken harness produces fake accuracy numbers that send you chasing non-existent bugs. |
| **Phase 1: Initial Comparison Run** | Measuring coverage not accuracy (#3), Tolerance hiding bugs (#15) | Use tight tolerances, track error distribution, report per-field accuracy not just aggregate. |
| **Phase 2: Multi-Source Triangulation** | MS inconsistency (#5), Industry normalization (#7), Combined tags (#11), Restated vs as-filed (#8) | Separate accuracy by industry cohort. Build consensus truth. Document exceptions per company-year-field. |
| **Phase 2: Engine Fixes** | Derived field amplification (#4), Tag consistency (#10) | Fix source fields before derived fields. Track derivation depth. Test downstream fields after every change. |
| **Phase 3: S&P 500 Expansion** | New company types not in truth set, rate limit exhaustion (#16), industry variety (#7) | Expand incrementally (50 -> 200 -> 500). Monitor accuracy by sector. Don't assume truth-set fixes generalize. |
| **Phase 4: Full Market** | Micro-cap XBRL quality, foreign filers (#13), split history gaps (#14) | Accept lower accuracy for small-cap. Skip non-USD. Build regression tests for each known pitfall. |

---

## The Meta-Pitfall: Optimizing the Wrong Metric

Attempts #1 and #2 both fell into the trap of optimizing a metric that didn't measure what mattered:

- **Attempt #1** optimized **tag coverage** (96.1%). Lesson: coverage != accuracy.
- **Attempt #2** optimized **Morningstar match rate** (91.0%). Lesson: matching one source != correctness.
- **Attempt #3** must not optimize **source consensus** without verifying that consensus = truth.

The right metric for attempt #3 is: **"For each field, does the engine's value match the economic reality reported in the SEC filing?"** Source consensus is EVIDENCE for this, not a DEFINITION of it. When 3 sources agree and you disagree, you're probably wrong. When 4 sources all agree on a number that contradicts the 10-K text, they're all wrong.

The comparison harness should always support going back to the raw XBRL source to verify any disputed value. Provenance tracking (which XBRL tag resolved which field) is the tool for this.

---

## Sources

All findings are drawn from:
- Project engineering plan: `gstack/plans/gstack-xbrl-annual-normalization-eng-plan-20260319.md` (attempts #1 and #2 complete history)
- Engine source code: `src/engines/edgarFinancials.js` (taxonomy, derived fields, FY offset logic)
- Project context: `.planning/PROJECT.md` (attempt #3 definition)
- Field mapping: `src/engines/__tests__/fixtures/morningstar/field-mapping.json` (87-field sign/tolerance mapping)
- API reference: user memory `reference_financial_data_apis.md` (FMP, SimFin, mstarpy behavior)
- CLAUDE.md: project-specific XBRL conventions, negate flags, debt sanity checks, REIT/bank/insurance caveats

**Confidence: HIGH** -- all pitfalls are grounded in this project's documented failures, code inspection, and known API behavior. No web-search-only claims.
