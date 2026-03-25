---
phase: 06-pitch-deck
plan: 06A-05
type: execute
wave: 2
depends_on: [06A-01]
files_modified:
  - agents/risk-analyst/prompt.md
autonomous: true
requirements: [PTCH-11]
must_haves:
  truths:
    - "risk-analyst prompt.md is a full prompt (300+ lines, not 22-line stub)"
    - "Prompt covers Section 9 (PEST) of the Pitch Deck"
    - "Prompt includes cyclical business risk assessment methodology"
  artifacts:
    - path: "agents/risk-analyst/prompt.md"
      provides: "Full risk-analyst agent prompt"
      min_lines: 300
  key_links:
    - from: "agents/risk-analyst/prompt.md"
      to: "knowledge/stage-2-pitch-deck/pitch-deck-III.md"
      via: "curriculum reference for PEST section"
      pattern: "PEST"
---

<objective>
Author the risk-analyst agent prompt via /writing-skills, replacing the 22-line stub with a full prompt. This agent handles Pitch Deck section 9 (PEST — Political, Economic, Social, Technological risks).

Purpose: Risk assessment is the bear-case engine of the Pitch Deck. This agent must identify every material risk to the investment thesis, categorize by PEST framework, assess probability and severity, and flag any thesis-killing risks. Also handles cyclical business risk for PTCH-11. Per D-02, authored via /writing-skills.
Output: Full risk-analyst prompt.md (300+ lines).
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
  <name>Task 1: Author risk-analyst prompt via /writing-skills</name>
  <files>agents/risk-analyst/prompt.md</files>
  <read_first>
    agents/risk-analyst/prompt.md
    agents/risk-analyst/config.json
    agents/writing-briefs/risk-analyst-brief.md
    agents/business-analyst/prompt.md
    .claude/skills/writing-skills/SKILL.md
    knowledge/stage-2-pitch-deck/pitch-deck-III.md
    knowledge/stage-2-pitch-deck/template.md
  </read_first>
  <action>
Use /writing-skills to author the risk-analyst prompt. Full TDD process:

1. **Read ALL writing-skills reference files** (per D-02):
   - .claude/skills/writing-skills/SKILL.md
   - .claude/skills/writing-skills/anthropic-best-practices.md
   - .claude/skills/writing-skills/testing-skills-with-subagents.md
   - .claude/skills/writing-skills/persuasion-principles.md
   - .claude/skills/writing-skills/graphviz-conventions.dot
   - .claude/skills/writing-skills/examples/ (all files)

2. **Read the risk-analyst writing brief** at agents/writing-briefs/risk-analyst-brief.md

3. **Read curriculum files** from config.json — specifically:
   - knowledge/stage-2-pitch-deck/pitch-deck-III.md (sections 7-9, where section 9 is PEST)
   - knowledge/stage-2-pitch-deck/template.md (PEST section template questions)

4. **RED phase:** Run baseline test against 22-line stub.

5. **GREEN phase:** Author full prompt covering:
   - **Section 9 (PEST):** Structured risk analysis across 4 categories:
     - **Political:** Regulatory risk, antitrust, tax policy, international trade, government dependency
     - **Economic:** Macro sensitivity, interest rate exposure, currency risk, recession vulnerability, inflation impact
     - **Social:** Consumer trend shifts, demographic changes, ESG/reputation risk, labor market tightness
     - **Technological:** Disruption risk, tech debt, AI/automation impact, cybersecurity, platform dependencies
   - For each identified risk: Description, Probability (HIGH/MEDIUM/LOW), Severity (HIGH/MEDIUM/LOW), Mitigation (what the company is doing about it), and Thesis Impact (does this risk invalidate the investment thesis?)
   - **Cyclical risk assessment (PTCH-11):** Identify if the business is cyclical. Assess current position in the cycle (expansion, peak, contraction, trough). Evaluate management's track record through previous cycles. Flag if valuation metrics are distorted by cycle position.
   - **Red flags:** This agent must be the most aggressive about red flags. Every PEST section must have 3+ red flags minimum. The risk-analyst's job is to find reasons NOT to invest.
   - **Cross-section risk synthesis:** Reference findings from prior sections (if available from Phase 1/2 context) to assess whether risks compound or are mitigated by moat/management strength.
   - **PSR integration:** When PSR findings include risk factor evolution (10-K risk section changes over years), incorporate the trajectory.
   - **DataPacket fields:** companyInfo, classification, financials, ttm, peers, peerMetrics (from config.json dataPacketSlice)
   - **Output format:** ReportSectionSchema JSON with structured risk table in data field

6. **REFACTOR:** Pressure test. Ensure output contains specific risks with evidence, not generic "regulatory risk exists."

Follow structural patterns of business-analyst/prompt.md.
  </action>
  <verify>
    <automated>wc -l agents/risk-analyst/prompt.md | awk '{if ($1 >= 300) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <acceptance_criteria>
    - agents/risk-analyst/prompt.md is 300+ lines (not 22-line stub)
    - File contains "Section 9" or "PEST"
    - File contains "Political" and "Economic" and "Social" and "Technological"
    - File contains "cyclical" (PTCH-11 risk assessment)
    - File contains "red flag" or "redFlags" (aggressive red flag mandate)
    - File contains "ReportSectionSchema" (output format)
    - File contains probability/severity assessment methodology
  </acceptance_criteria>
  <done>risk-analyst has a full production prompt with PEST framework, cyclical risk assessment, and aggressive red flag requirements</done>
</task>

</tasks>

<verification>
- `wc -l agents/risk-analyst/prompt.md` shows 300+ lines
- `npx vitest run` all tests pass
</verification>

<success_criteria>
risk-analyst/prompt.md is a full production prompt (300+ lines) authored via /writing-skills TDD methodology, covering structured PEST risk analysis with cyclical business handling.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06A-05-SUMMARY.md`
</output>
