---
phase: 06-pitch-deck
plan: 06A-04
type: execute
wave: 2
depends_on: [06A-01]
files_modified:
  - agents/management-evaluator/prompt.md
autonomous: true
requirements: [PTCH-12]
must_haves:
  truths:
    - "management-evaluator prompt.md is a full prompt (300+ lines, not 22-line stub)"
    - "Prompt covers Section 6 (Management) of the Pitch Deck"
    - "Prompt includes Buffett letters analysis methodology for management assessment"
  artifacts:
    - path: "agents/management-evaluator/prompt.md"
      provides: "Full management-evaluator agent prompt"
      min_lines: 300
  key_links:
    - from: "agents/management-evaluator/prompt.md"
      to: "knowledge/research-references/guru-list.md"
      via: "curriculum reference"
      pattern: "guru"
---

<objective>
Author the management-evaluator agent prompt via /writing-skills, replacing the 22-line stub with a full prompt. This agent handles Pitch Deck section 6 (Management).

Purpose: Management quality is one of the 3 Ms (Meaning, Moat, Management) that determine investment decisions in Rule One. This agent evaluates CEO competence, capital allocation, insider ownership, compensation alignment, and Buffett's management principles. Per D-02, authored via /writing-skills.
Output: Full management-evaluator prompt.md (300+ lines).
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
  <name>Task 1: Author management-evaluator prompt via /writing-skills</name>
  <files>agents/management-evaluator/prompt.md</files>
  <read_first>
    agents/management-evaluator/prompt.md
    agents/management-evaluator/config.json
    agents/writing-briefs/management-evaluator-brief.md
    agents/business-analyst/prompt.md
    .claude/skills/writing-skills/SKILL.md
    knowledge/stage-2-pitch-deck/pitch-deck-II.md
    knowledge/stage-2-pitch-deck/template.md
    knowledge/research-references/guru-list.md
  </read_first>
  <action>
Use /writing-skills to author the management-evaluator prompt. Full TDD process:

1. **Read ALL writing-skills reference files** (per D-02):
   - .claude/skills/writing-skills/SKILL.md
   - .claude/skills/writing-skills/anthropic-best-practices.md
   - .claude/skills/writing-skills/testing-skills-with-subagents.md
   - .claude/skills/writing-skills/persuasion-principles.md
   - .claude/skills/writing-skills/graphviz-conventions.dot
   - .claude/skills/writing-skills/examples/ (all files)

2. **Read the management-evaluator writing brief** at agents/writing-briefs/management-evaluator-brief.md

3. **Read curriculum files** from config.json — specifically:
   - knowledge/stage-2-pitch-deck/pitch-deck-II.md (sections 4-6, where section 6 is Management)
   - knowledge/research-references/guru-list.md (43 named gurus for ownership lookup)
   - knowledge/research-references/buffett_letters_claude_training_set/ (Buffett management principles)

4. **RED phase:** Run baseline test against 22-line stub.

5. **GREEN phase:** Author full prompt covering:
   - **Section 6 (Management):** CEO background and track record, capital allocation history (buybacks vs dividends vs reinvestment vs M&A), insider ownership levels and trends, compensation alignment (pay-for-performance ratio, stock vs cash comp mix)
   - **Buffett's management test:** Does management treat shareholders as partners? Is capital allocation rational? Are earnings retained wisely (1 dollar retained should create at least 1 dollar of market value)?
   - **Guru ownership (PTCH-12 contribution):** Check 13F data from DataPacket for guru investors. Guru ownership is CONTEXT not CONFIRMATION — per Rule One methodology, guru buying is an indicator to investigate deeper, not a buy signal.
   - **Acquisition history support:** Management-evaluator should assess M&A strategy quality — did acquisitions create or destroy value? Were prices paid reasonable? This complements the business-analyst's acquisition table (PTCH-12).
   - **PSR integration:** When annual-reader findings include proxy analysis (board composition, compensation, shareholder letters), incorporate them.
   - **DataPacket fields:** companyInfo, insiders, compensation, gurus (from config.json dataPacketSlice)
   - **Output format:** ReportSectionSchema JSON

6. **REFACTOR:** Pressure test with a real ticker. Ensure management assessment includes specific data (not generic "management is good").

Follow structural patterns of business-analyst/prompt.md.
  </action>
  <verify>
    <automated>wc -l agents/management-evaluator/prompt.md | awk '{if ($1 >= 300) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <acceptance_criteria>
    - agents/management-evaluator/prompt.md is 300+ lines (not 22-line stub)
    - File contains "Section 6" or "Management" section assignment
    - File contains "capital allocation" (Buffett management test)
    - File contains "insider" or "ownership" (insider ownership assessment)
    - File contains "guru" (13F guru ownership context)
    - File contains "compensation" or "comp" (pay-for-performance analysis)
    - File contains "acquisition" (M&A quality assessment for PTCH-12)
    - File contains "ReportSectionSchema" (output format)
  </acceptance_criteria>
  <done>management-evaluator has a full production prompt covering capital allocation, insider ownership, compensation alignment, guru context, and M&A assessment</done>
</task>

</tasks>

<verification>
- `wc -l agents/management-evaluator/prompt.md` shows 300+ lines
- `npx vitest run` all tests pass
</verification>

<success_criteria>
management-evaluator/prompt.md is a full production prompt (300+ lines) authored via /writing-skills TDD methodology, covering all management evaluation dimensions.
</success_criteria>

<output>
After completion, create `.planning/phases/06-pitch-deck/06A-04-SUMMARY.md`
</output>
