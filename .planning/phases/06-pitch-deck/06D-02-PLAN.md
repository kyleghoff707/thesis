---
phase: 06-pitch-deck
plan: 06D-02
type: execute
wave: 7
depends_on: [06D-01, 06B-01, 06B-02]
files_modified: []
autonomous: false
requirements: [PTCH-16, CMD-03]
must_haves:
  truths:
    - "A real Pitch Deck has been generated for a test ticker via /generate:pitch-deck"
    - "Generated output has been compared against LULU Pitch Deck benchmark by the PM"
    - "All 10 sections render correctly in PitchDeck.jsx"
    - "Sensitivity tables display correctly with color coding"
    - "PM has confirmed parity (or identified gaps for follow-up)"
  artifacts: []
  key_links: []
---

<objective>
Generate a real Pitch Deck for a test ticker, verify LULU benchmark parity (user-verified), and confirm the full Phase 6 pipeline works end-to-end. CMD-03 is DEFERRED per D-16 — this plan marks it as acknowledged and not planned.

Purpose: This is the final verification gate for Phase 6. The PM compares the generated Pitch Deck against the LULU example to verify depth, rigor, and completeness. No feature is truly done until the output quality passes the human test.
Output: Generated pitch deck for test ticker + PM verification.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/06-pitch-deck/06-CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Generate a Pitch Deck for test ticker</name>
  <files></files>
  <read_first>
    .claude/skills/generate-pitch-deck/SKILL.md
    .thes1s/reports/COST/one-pager.json
  </read_first>
  <action>
Run the Pitch Deck generation pipeline for a test ticker (COST is the existing test ticker from Phase 5C with an approved One Pager).

1. Verify the COST One Pager exists and has an overall verdict: `cat .thes1s/reports/COST/one-pager.json | head -10`
2. Run: `/generate:pitch-deck COST`
3. The generation will take significant time (10+ agent calls across 3 phases with checkpoints)
4. At each checkpoint, review the findings, answer questions, and continue
5. During FGR derivation, review each of the 5 inputs and confirm or adjust
6. After generation completes, verify output files exist:
   - .thes1s/reports/COST/pitch-deck.json
   - .thes1s/reports/COST/pitch-deck.md
   - .thes1s/reports/COST/sections/ (10 section files)
   - .thes1s/reports/COST/quality/pitch-deck.quality.json
   - .thes1s/reports/COST/budget.json

Note: If COST One Pager does not have an approved status, run the generation on a different ticker that has a completed One Pager, or approve the COST One Pager first.

**CMD-03 acknowledgment:** Per D-16, the standalone `/fgr TICKER` command is DEFERRED from Phase 6. FGR without prior deep research would be superficial. This requirement is intentionally NOT implemented — the planner has acknowledged it and marked it as out of scope.
  </action>
  <verify>
    <automated>test -f .thes1s/reports/COST/pitch-deck.json && echo "pitch-deck.json exists" || echo "pitch-deck.json NOT FOUND"</automated>
  </verify>
  <acceptance_criteria>
    - .thes1s/reports/COST/pitch-deck.json exists with 10 sections
    - pitch-deck.json contains overallVerdict field
    - pitch-deck.json contains checkpoints array with 3 entries
    - pitch-deck.json contains fgrDerivation with finalLow and finalHigh
    - pitch-deck.json contains sensitivityTables with at least one method
    - .thes1s/reports/COST/pitch-deck.md exists (human-readable markdown)
    - .thes1s/reports/COST/quality/pitch-deck.quality.json exists
  </acceptance_criteria>
  <done>A real Pitch Deck has been generated end-to-end through the complete pipeline</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: LULU parity verification — PM compares generated Pitch Deck against benchmark</name>
  <files></files>
  <action>User compares the generated Pitch Deck section-by-section against the LULU Pitch Deck example at knowledge/stage-2-pitch-deck/ to verify depth, rigor, and completeness parity. Also verifies UI rendering, sensitivity tables, FGR display, and section re-run via CMD-01.</action>
  <what-built>Complete Pitch Deck generation pipeline + UI rendering for COST (or test ticker)</what-built>
  <how-to-verify>
    1. Run `npm run dev` and navigate to http://localhost:5173/research/{COST-id}/pitch-deck
    2. Verify all 10 sections render with verdicts, confidence badges, and narrative content
    3. Verify sensitivity tables display in Section 10 (Valuation) with color coding
    4. Verify FGR derivation display shows 5 inputs with confidence levels
    5. Verify checkpoint summary blocks appear between phase groups
    6. Verify "Assumptions (N)" button in hero opens the AssumptionTracker sidebar
    7. Open the LULU Pitch Deck example at knowledge/stage-2-pitch-deck/ (for PM comparison ONLY — never agent input)
    8. Compare depth and rigor section by section:
       - Section 1 (Radar): Does it cover management background, competitive position, 3-5 year thesis?
       - Section 3 (Market Position): Are 15+ peers benchmarked? Market share ceiling analysis present?
       - Section 5 (FCF): 10-year FCF history with CapEx breakdown?
       - Section 6 (Management): Capital allocation, insider ownership, compensation analysis?
       - Section 9 (PEST): Structured risk analysis with probability/severity?
       - Section 10 (Valuation): Dual owner earnings, FGR derivation, sensitivity tables, buy price ranges?
    9. Note any sections that are significantly less thorough than the LULU benchmark
    10. Test the section re-run: `/generate:section COST pitchDeck 3 "Add more international competitors"` — verify section 3 regenerates
  </how-to-verify>
  <resume-signal>Type "approved" with notes on any depth gaps, or describe issues to address</resume-signal>
</task>

</tasks>

<verification>
- Pitch Deck generated end-to-end without pipeline errors
- All 10 sections render in PitchDeck.jsx
- Quality report generated with per-section scores
- PM confirms parity (or identifies specific gaps)
</verification>

<success_criteria>
A real Pitch Deck has been generated, rendered in the UI, and verified by the PM against the LULU benchmark. The PM has confirmed parity or provided specific feedback for follow-up. Phase 6 is complete when the PM approves.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06D-02-SUMMARY.md`
</output>
