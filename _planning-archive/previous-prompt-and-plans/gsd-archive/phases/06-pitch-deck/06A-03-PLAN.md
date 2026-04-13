---
phase: 06-pitch-deck
plan: 06A-03
type: execute
wave: 2
depends_on: [06A-01]
files_modified:
  - agents/competitor-evaluator/prompt.md
autonomous: true
requirements: [PTCH-08, PTCH-09]
must_haves:
  truths:
    - "competitor-evaluator prompt.md is a full prompt (300+ lines, not 22-line stub)"
    - "Prompt mandates 15+ peer companies for competitor benchmarking"
    - "Prompt includes market share ceiling analysis methodology"
  artifacts:
    - path: "agents/competitor-evaluator/prompt.md"
      provides: "Full competitor-evaluator agent prompt"
      min_lines: 300
  key_links:
    - from: "agents/competitor-evaluator/prompt.md"
      to: "src/engines/peerMetrics.js"
      via: "comparePeers tool reference"
      pattern: "comparePeers"
---

<objective>
Author the competitor-evaluator agent prompt via /writing-skills, replacing the 22-line stub with a full prompt. This agent handles Pitch Deck sections 3 (Market Position) and 4 (Barriers & Moats).

Purpose: The competitor-evaluator is responsible for the most data-intensive sections of the Pitch Deck — 15+ peer companies benchmarked across multiple metrics, market share ceiling analysis, and moat validation. Per D-02, this prompt MUST be authored via /writing-skills with full TDD methodology.
Output: Full competitor-evaluator prompt.md (300+ lines) that passes pressure testing.
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
  <name>Task 1: Author competitor-evaluator prompt via /writing-skills</name>
  <files>agents/competitor-evaluator/prompt.md</files>
  <read_first>
    agents/competitor-evaluator/prompt.md
    agents/competitor-evaluator/config.json
    agents/writing-briefs/competitor-evaluator-brief.md
    agents/business-analyst/prompt.md
    .claude/skills/writing-skills/SKILL.md
    knowledge/stage-2-pitch-deck/pitch-deck-I.md
    knowledge/stage-2-pitch-deck/template.md
  </read_first>
  <action>
Use /writing-skills to author the competitor-evaluator prompt. This is the TDD process:

1. **Read ALL writing-skills reference files** (per D-02 — no shortcuts):
   - .claude/skills/writing-skills/SKILL.md
   - .claude/skills/writing-skills/anthropic-best-practices.md
   - .claude/skills/writing-skills/testing-skills-with-subagents.md
   - .claude/skills/writing-skills/persuasion-principles.md
   - .claude/skills/writing-skills/graphviz-conventions.dot
   - .claude/skills/writing-skills/examples/ (all files in directory)

2. **Read the competitor-evaluator writing brief** at agents/writing-briefs/competitor-evaluator-brief.md

3. **Read curriculum files** from config.json — specifically knowledge/stage-2-pitch-deck/pitch-deck-I.md (sections 1-3, where section 3 is Market Position) and the template

4. **RED phase (baseline):** Run a test prompt against the current 22-line stub to document what fails. The stub will produce generic, shallow output.

5. **GREEN phase (write prompt):** Author the full prompt covering:
   - **Section 3 (Market Position):** 15+ peer companies from peerMetrics data, market share analysis, competitive positioning map, industry growth drivers, TAM/SAM/SOM estimation
   - **Section 4 (Barriers & Moats):** Moat type classification (brand, switching costs, network effects, toll bridge, secrets), durability assessment, competitive advantage period estimation, moat score (wide/narrow/none with evidence)
   - **Market share ceiling analysis (PTCH-09):** Calculate what market share the company would need at the assumed growth rate in 5 and 10 years. If >50% of addressable market, flag as unrealistic.
   - **15+ peer requirement (PTCH-08):** Use comparePeers tool to get industry peers. If fewer than 15 available, note the gap. Never benchmark against fewer than 5.
   - **DataPacket fields used:** peers, peerMetrics, batchQuotes, classification (from config.json dataPacketSlice)
   - **Tools available:** comparePeers (from config.json tools)
   - **PSR integration:** When annual-reader/quarterly-reader findings are available, incorporate competitive landscape evolution and M&A impacts
   - **Output format:** ReportSectionSchema JSON with specific data fields for peer comparison tables

6. **REFACTOR phase:** Pressure test the prompt with a real ticker's DataPacket to verify depth. Iterate if sections are too shallow (under 500 words) or miss peer benchmarking.

The prompt must follow the same structural patterns as business-analyst/prompt.md (539 lines) — role definition, methodology sections, output format, quality requirements, edge cases.
  </action>
  <verify>
    <automated>wc -l agents/competitor-evaluator/prompt.md | awk '{if ($1 >= 300) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <acceptance_criteria>
    - agents/competitor-evaluator/prompt.md is 300+ lines (not the 22-line stub)
    - File contains "15" or "fifteen" (peer count requirement for PTCH-08)
    - File contains "market share ceiling" or "market share" and "ceiling" (PTCH-09)
    - File contains "comparePeers" (tool reference)
    - File contains "Section 3" and "Section 4" (pitch deck section assignments)
    - File contains "ReportSectionSchema" (output format reference)
    - File contains moat type references (at least 3 of: brand, switching, network, toll, secrets)
  </acceptance_criteria>
  <done>Competitor-evaluator has a full production prompt authored via /writing-skills TDD methodology, mandating 15+ peers and market share ceiling analysis</done>
</task>

</tasks>

<verification>
- `wc -l agents/competitor-evaluator/prompt.md` shows 300+ lines
- `grep -c "market share" agents/competitor-evaluator/prompt.md` returns 1+
- `npx vitest run` all tests pass
</verification>

<success_criteria>
competitor-evaluator/prompt.md is a full production prompt (300+ lines) that mandates 15+ peer benchmarking and market share ceiling analysis, authored via /writing-skills TDD methodology.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06A-03-SUMMARY.md`
</output>
