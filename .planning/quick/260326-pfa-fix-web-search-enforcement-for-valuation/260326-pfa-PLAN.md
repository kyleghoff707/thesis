---
phase: quick
plan: 260326-pfa
type: execute
wave: 1
depends_on: []
files_modified:
  - agents/valuation-specialist/prompt.md
  - agents/risk-analyst/prompt.md
  - agents/management-evaluator/prompt.md
  - .claude/skills/generate-pitch-deck/SKILL.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "All three agent prompts include searchesPerformed in their JSON output schema block"
    - "SKILL.md validation checklist includes searchesPerformed as a required field"
    - "Management-evaluator prompt explicitly prohibits flat sources arrays in favor of canonical citations"
  artifacts:
    - path: "agents/valuation-specialist/prompt.md"
      provides: "searchesPerformed in ReportSectionSchema JSON block"
      contains: "searchesPerformed"
    - path: "agents/risk-analyst/prompt.md"
      provides: "searchesPerformed in ReportSectionSchema JSON block"
      contains: "searchesPerformed"
    - path: "agents/management-evaluator/prompt.md"
      provides: "searchesPerformed in ReportSectionSchema JSON block and canonical citation enforcement"
      contains: "searchesPerformed"
    - path: ".claude/skills/generate-pitch-deck/SKILL.md"
      provides: "searchesPerformed in validation required fields list"
      contains: "searchesPerformed"
  key_links:
    - from: "agents/*/prompt.md"
      to: "src/engines/critic.js"
      via: "searchesPerformed field in agent output consumed by QUAL-07 check"
      pattern: "searchesPerformed"
---

<objective>
Fix web search enforcement for valuation-specialist, risk-analyst, and management-evaluator agents.

Purpose: Agents are told to include searchesPerformed in their output but the JSON output schema blocks don't list it, so models treat it as optional and omit it. The SKILL.md pipeline validation also doesn't check for it. This causes QUAL-07 search compliance failures in critic.js (which does check for it). Additionally, the management-evaluator may produce flat `sources` arrays instead of canonical `{id, ref, text, source}` citations.

Output: Updated prompt files and SKILL.md with searchesPerformed in the formal schema blocks and validation checklists.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@agents/valuation-specialist/prompt.md
@agents/risk-analyst/prompt.md
@agents/management-evaluator/prompt.md
@.claude/skills/generate-pitch-deck/SKILL.md
@src/engines/critic.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add searchesPerformed to agent JSON output schema blocks</name>
  <files>agents/valuation-specialist/prompt.md, agents/risk-analyst/prompt.md, agents/management-evaluator/prompt.md</files>
  <action>
In each of the three agent prompt files, find the ReportSectionSchema JSON block (the formal output schema definition) and add `searchesPerformed` as a required field within the schema.

**valuation-specialist/prompt.md** (schema block starts ~line 315):
- In the JSON schema block after `"tokenCost": { "input": number, "output": number }`, add:
```
  "searchesPerformed": [
    { "query": "string", "resultCount": number, "usedInSection": boolean }
  ]
```
- Add a field requirement entry in the description list below the schema: `- \`searchesPerformed\` -- Array of web searches performed. MUST NOT be empty for non-exempt agents. Each entry: query (the search string), resultCount (number of results), usedInSection (whether findings were incorporated). This field is validated by the pipeline -- omitting it triggers a quality failure.`

**risk-analyst/prompt.md** (schema block starts ~line 394):
- Same addition to the JSON schema block after `"tokenCost"`.
- Same field requirement entry in the description list.

**management-evaluator/prompt.md** (schema block starts ~line 404):
- Same addition to the JSON schema block after `"tokenCost"`.
- Same field requirement entry in the description list.
- Additionally, add this paragraph immediately after the Citation Enforcement section (after the "Rule:" paragraph, before the Output Format section):

```
**Anti-pattern: flat sources arrays.** Do NOT include `"sources": ["url1", "url2"]` anywhere in your `data` field objects. ALL source attribution MUST go through the `citations` array using the canonical format `{ "id": number, "ref": string, "text": string, "source": string }`. If you need to cite a source for an acquisition, insider transaction, or other data point, add it to the top-level `citations` array -- not as a nested `sources` field within `data`.
```
  </action>
  <verify>
    <automated>grep -c "searchesPerformed" agents/valuation-specialist/prompt.md agents/risk-analyst/prompt.md agents/management-evaluator/prompt.md | grep -v ":0$" | wc -l | xargs test 3 -eq && echo "PASS: searchesPerformed found in all 3 prompts" || echo "FAIL"</automated>
  </verify>
  <done>All three agent prompts have searchesPerformed in their formal JSON output schema block (not just in the instruction text at the end). Management-evaluator prompt also has explicit anti-pattern guidance against flat sources arrays.</done>
</task>

<task type="auto">
  <name>Task 2: Add searchesPerformed to SKILL.md validation checklist</name>
  <files>.claude/skills/generate-pitch-deck/SKILL.md</files>
  <action>
In the generate-pitch-deck SKILL.md, find the Phase 1 "Validate" step (around line 424) where required fields are listed:

```
2. **Validate** each section output has the required fields:
   - `key` (string matching a sectionKey: radar, simple_predictable, market_position)
   - `title` (string)
   - `sectionNumber` (number: 1, 2, or 3)
   ...
   - `redFlags` (array with at least 1 item)
```

Add this entry to the end of the required fields list:
```
   - `searchesPerformed` (array -- required for non-exempt sections; exempt: psr_annual, psr_quarterly, synthesis, overall_verdict)
```

Also find the Phase 2 and Phase 3 validation sections. Both say "Same validation pattern as Phase 1" (~line 645 and ~line 783). After each "Same validation pattern" line, add a reminder:
```
- **searchesPerformed check:** Verify `searchesPerformed` is a non-empty array for risk-analyst, valuation-specialist, management-evaluator, business-analyst, and competitor-evaluator sections. Log a warning if missing or empty -- this is the primary enforcement point for QUAL-07 search compliance.
```
  </action>
  <verify>
    <automated>grep -c "searchesPerformed" .claude/skills/generate-pitch-deck/SKILL.md | xargs test 0 -lt && echo "PASS: searchesPerformed found in SKILL.md" || echo "FAIL"</automated>
  </verify>
  <done>SKILL.md validation checklist now includes searchesPerformed as a required field for non-exempt sections in all three pipeline phases. Pipeline operators will flag missing searchesPerformed before saving section output.</done>
</task>

</tasks>

<verification>
1. Each of the 3 agent prompts contains searchesPerformed in the formal JSON schema block (not just the "Required Web Searches" instruction section).
2. SKILL.md validation checklist includes searchesPerformed in required fields.
3. Management-evaluator prompt has explicit anti-pattern guidance for flat sources arrays.
4. No existing content was accidentally removed or broken.
</verification>

<success_criteria>
- grep for "searchesPerformed" in all 3 prompt files returns matches inside the JSON schema block section
- grep for "searchesPerformed" in SKILL.md returns matches in the validation checklist section
- grep for "flat sources" or "Anti-pattern" in management-evaluator prompt returns a match
- All files remain valid markdown with no syntax errors
</success_criteria>

<output>
After completion, create `.planning/quick/260326-pfa-fix-web-search-enforcement-for-valuation/260326-pfa-SUMMARY.md`
</output>
