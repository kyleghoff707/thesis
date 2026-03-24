---
phase: 05C-cc-skill-first-analysis
plan: 04
type: execute
wave: 3
depends_on: [05C-03]
files_modified: []
autonomous: false
requirements: [ONEP-01, ONEP-06]
must_haves:
  truths:
    - "User can run /generate:one-pager {TICKER} and receive a complete 6-section One Pager with verdict badges, citations, and red flags"
    - "Generated One Pager achieves 80%+ section depth match vs the LULU One Pager benchmark (user-verified)"
    - "Every quantitative claim traces to a DataPacket field path or external source -- no fabricated numbers"
    - "LULU examples are confirmed absent from agent context during generation (contamination boundary holds)"
  artifacts:
    - path: ".thes1s/reports/{TICKER}/one-pager.json"
      provides: "Machine-readable One Pager report"
    - path: ".thes1s/reports/{TICKER}/one-pager.md"
      provides: "Human-readable One Pager for benchmark comparison"
  key_links:
    - from: ".claude/skills/generate-one-pager/SKILL.md"
      to: "agents/*/prompt.md"
      via: "CC skill reads prompts and dispatches subagents"
      pattern: "prompt.md"
    - from: ".thes1s/reports/{TICKER}/one-pager.json"
      to: "src/schemas/reportSection.js"
      via: "Every section validates against ReportSectionSchema"
      pattern: "ReportSectionSchema"
---

<objective>
Run the first real One Pager generation via `/generate:one-pager` for a test ticker and validate the output quality against the LULU One Pager benchmark. This is the proving run that demonstrates the entire agent architecture works end-to-end.

Purpose: Until a real generation succeeds and meets the quality bar, the agent architecture is theoretical. This plan proves it works by generating a real analysis and having the user compare it to the LULU benchmark.

Output: A generated One Pager (JSON + markdown) for a user-chosen test ticker, validated against the LULU benchmark for section depth match.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05C-cc-skill-first-analysis/05C-CONTEXT.md
@.planning/phases/05C-cc-skill-first-analysis/05C-RESEARCH.md
@.planning/phases/05C-cc-skill-first-analysis/05C-03-SUMMARY.md
</context>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1: User selects test ticker for first generation</name>
  <files>.claude/skills/generate-one-pager/SKILL.md</files>
  <action>
    Present the user with a choice of test ticker for the first One Pager generation. Options:
    - COST (Costco): Simple business model, excellent EDGAR data, strong Rule One scores
    - AAPL (Apple): Best EDGAR data coverage, most-analyzed company
    - User's own choice: any company they know well enough to evaluate quality
    NOT LULU — that is the benchmark for comparison only (per D-13). The user selects a ticker.
  </action>
  <verify>
    <automated>echo "User decision required — no automated verification"</automated>
  </verify>
  <done>User has selected a test ticker for the first One Pager generation run.</done>
</task>

<task type="auto">
  <name>Task 2: Run first One Pager generation via /generate:one-pager</name>
  <files></files>
  <read_first>
    .claude/skills/generate-one-pager/SKILL.md
    agents/orchestrator/dispatch-table.json
  </read_first>
  <action>
    Execute the first real One Pager generation using the CC skill:

    1. Run: `/generate:one-pager {TICKER}` (where TICKER is the user's choice from Task 1)

    2. Monitor the generation progress:
       - Step 1: DataPacket assembly via scripts/assemble-data.js
       - Step 2: Agent config reading
       - Step 3: 3 parallel analyst subagents (financial-analyst, business-analyst, valuation-specialist)
       - Step 4: Output validation against ReportSectionSchema
       - Step 5: Synthesis-writer subagent
       - Step 6: Final report assembly

    3. If any subagent fails:
       - Log the error and which agent/section failed
       - If the error is a schema validation failure, check if the agent output is parseable JSON but missing required fields — if so, the prompt may need refinement
       - If the error is an execution failure, check DataPacket assembly output for missing fields
       - Document the failure and any fixes applied

    4. After successful generation, verify outputs exist:
       - .thes1s/reports/{TICKER}/data-packet.json (DataPacket)
       - .thes1s/reports/{TICKER}/sections/company_info.json (Section 1)
       - .thes1s/reports/{TICKER}/sections/minimum_standards.json (Section 2)
       - .thes1s/reports/{TICKER}/sections/meaning.json (Section 3)
       - .thes1s/reports/{TICKER}/sections/growth_metrics.json (Section 4)
       - .thes1s/reports/{TICKER}/sections/valuation_summary.json (Section 5)
       - .thes1s/reports/{TICKER}/sections/overall_verdict.json (Section 6)
       - .thes1s/reports/{TICKER}/one-pager.json (assembled report)
       - .thes1s/reports/{TICKER}/one-pager.md (human-readable markdown)

    5. Quick quality checks on the output:
       - Each section has a non-empty narrative (> 50 words)
       - Each section has at least 1 citation
       - Each section has at least 1 red flag
       - Each section has a verdict (PASS/FAIL/WATCHLIST) except where null is valid
       - Section 6 (overall_verdict) references findings from other sections
       - No mention of "LULU" or "lululemon" anywhere in the output (contamination check)

    6. Print the generated one-pager.md to the terminal for user review.
  </action>
  <verify>
    <automated>test -f .thes1s/reports/*/one-pager.json && test -f .thes1s/reports/*/one-pager.md && echo "PASS: report files exist" || echo "FAIL: missing report files"</automated>
  </verify>
  <acceptance_criteria>
    - .thes1s/reports/{TICKER}/one-pager.json exists and is valid JSON
    - .thes1s/reports/{TICKER}/one-pager.md exists and is > 200 lines
    - All 6 section JSON files exist in .thes1s/reports/{TICKER}/sections/
    - Each section JSON passes ReportSectionSchema validation (has key, title, status, confidence, narrative, citations, redFlags)
    - No section narrative is empty
    - No section has zero citations
    - No section has zero red flags
    - Output does NOT contain "LULU" or "lululemon" (contamination check)
    - Overall verdict section (overall_verdict) references other section findings
  </acceptance_criteria>
  <done>First real One Pager generated successfully for user's chosen ticker. All 6 sections present with narratives, citations, red flags, and verdicts. Output saved as both JSON and markdown. No LULU contamination detected.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: User evaluates generated One Pager against LULU benchmark (ONEP-06)</name>
  <files>.thes1s/reports/{TICKER}/one-pager.md, .thes1s/reports/{TICKER}/one-pager.json</files>
  <action>
    Present the generated One Pager to the user for side-by-side evaluation against the LULU benchmark PDF.
    User opens knowledge/stage-1-one-pager/examples/LULU One Pager.PDF alongside .thes1s/reports/{TICKER}/one-pager.md.
    Per-section depth evaluation (80% target per ONEP-06):
    1. Company Info: company name, ticker, industry, last price, substantive business description
    2. Minimum Standards: market cap, public history, debt-to-earnings with real DataPacket numbers
    3. Meaning/Management KPIs: ROE, ROIC, Net-Debt ratios, Rule One Score, Guru ownership
    4. Growth Metrics: multi-year table with Big 4 growth rates across multiple periods
    5. Valuation Summary: buy price RANGES from multiple methods, current price comparison
    6. Overall Verdict: cohesive PASS/FAIL/WATCHLIST verdict, Buffett-style narrative
    Quality checks: citations to DataPacket fields, substantive red flags, conversational tone, independent analysis feel.
  </action>
  <verify>
    <automated>test -f .thes1s/reports/*/one-pager.md && echo "PASS: report exists for benchmark review" || echo "FAIL: no report to review"</automated>
  </verify>
  <done>User has evaluated the generated One Pager against the LULU benchmark and confirmed it achieves 80%+ section depth match (ONEP-06).</done>
</task>

</tasks>

<verification>
- /generate:one-pager {TICKER} completed successfully with all 6 sections
- Generated output is at .thes1s/reports/{TICKER}/one-pager.json and one-pager.md
- All sections pass ReportSectionSchema validation
- No LULU contamination in output
- User has evaluated against LULU benchmark and approved (ONEP-06)
</verification>

<success_criteria>
1. /generate:one-pager {TICKER} produces a complete 6-section One Pager (ONEP-01)
2. Every section has narrative, citations, red flags, and verdict (schema compliant)
3. No fabricated numbers — all quantitative claims trace to DataPacket (QUAL-06 preview)
4. No LULU contamination (AGNT-04)
5. User confirms 80%+ section depth match vs LULU benchmark (ONEP-06)
</success_criteria>

<output>
After completion, create `.planning/phases/05C-cc-skill-first-analysis/05C-04-SUMMARY.md`
</output>
