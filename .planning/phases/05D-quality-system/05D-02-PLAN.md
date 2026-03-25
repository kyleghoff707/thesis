---
phase: 05D-quality-system
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/engines/contextBudget.js
  - src/engines/__tests__/contextBudget.test.js
autonomous: true
requirements: [QUAL-08]

must_haves:
  truths:
    - "estimateTokens() converts character counts to approximate token counts via chars/4"
    - "createBudgetTracker() records per-agent entries and produces a cost summary"
    - "Cost calculation uses known Claude model pricing (Sonnet input/output, Opus input/output)"
    - "Token costs are estimates, not actuals — the system never blocks on budget limits"
  artifacts:
    - path: "src/engines/contextBudget.js"
      provides: "Token estimation, budget tracking, cost calculation"
      exports: ["estimateTokens", "createBudgetTracker", "computeCost", "MODEL_PRICING"]
    - path: "src/engines/__tests__/contextBudget.test.js"
      provides: "Unit tests for token estimation and budget tracking"
      min_lines: 60
  key_links:
    - from: "src/engines/contextBudget.js"
      to: ".thes1s/reports/{TICKER}/budget.json"
      via: "getSummary() output saved by CC skill"
      pattern: "getSummary"
---

<objective>
Build contextBudget.js — token usage estimation and cost tracking for AI agent dispatch. Measures what can be measured (character-based estimation) and logs what cannot (actual API token counts from Agent tool). This is measurement infrastructure, not enforcement.

Purpose: First real cost visibility into the One Pager pipeline. Currently all tokenCost fields are `{input: 0, output: 0}`. This engine provides estimates so the user can understand cost-per-generation.
Output: `src/engines/contextBudget.js` with full test suite.
</objective>

<execution_context>
@/Users/kylehoff/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kylehoff/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05D-quality-system/05D-CONTEXT.md
@.planning/phases/05D-quality-system/05D-RESEARCH.md

<interfaces>
<!-- Token cost reality from COST one-pager -->
All 6 sections have tokenCost: {input: 0, output: 0} — the CC skill dispatches subagents
via Agent tool, which doesn't expose token usage to the caller.

contextBudget.js provides CHARACTER-BASED ESTIMATION as a first approximation.
It does NOT set budget limits or block execution (deferred: token budget alerts).

From src/schemas/progress.js:
```javascript
// ProgressSchema includes per-section token tracking
sections: z.record(z.string(), z.object({
  status: z.enum(['complete', 'running', 'pending', 'failed']),
  agentRole: z.string().optional(),
  tokenCost: z.object({ input: z.number(), output: z.number() }).optional(),
  error: z.string().optional(),
})),
totalCost: z.object({ input: z.number(), output: z.number() }),
```

From src/schemas/reportSection.js:
```javascript
tokenCost: z.object({ input: z.number(), output: z.number() }),
```

Agent models used (from dispatch-table.json / SKILL.md):
- Analyst agents: claude-sonnet-4-20250514 (Sonnet)
- Synthesis writer: claude-opus-4-6 (Opus)

Claude pricing (as of March 2026):
- Sonnet: $3/M input, $15/M output
- Opus: $15/M input, $75/M output
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement contextBudget.js + tests (TDD)</name>
  <files>src/engines/contextBudget.js, src/engines/__tests__/contextBudget.test.js</files>
  <read_first>
    - src/schemas/progress.js (tokenCost schema: {input: number, output: number})
    - src/schemas/reportSection.js (tokenCost field on sections)
    - src/engines/__tests__/progressState.test.js (test pattern reference)
    - .planning/phases/05D-quality-system/05D-RESEARCH.md (Pattern 5: Token Budget Measurement)
  </read_first>
  <behavior>
    - estimateTokens("hello world") returns approximately 3 (11 chars / 4 = 2.75, ceil to 3)
    - estimateTokens("") returns 0
    - estimateTokens(null) returns 0
    - computeCost(1000, 500, "claude-sonnet-4-20250514") returns {input: 0.003, output: 0.0075, total: 0.0105}
    - computeCost(1000, 500, "claude-opus-4-6") returns {input: 0.015, output: 0.0375, total: 0.0525}
    - computeCost with unknown model uses Sonnet pricing as fallback
    - createBudgetTracker().record("financial-analyst", "meaning", 50000, 8000, "claude-sonnet-4-20250514") — records an entry
    - createBudgetTracker().getSummary() returns {entries: [...], totals: {input, output}, estimatedCost: {input, output, total}}
    - createBudgetTracker() with 4 recorded agents produces correct aggregated totals
    - formatBudgetReport(summary) returns human-readable string with per-agent breakdown and total cost
  </behavior>
  <action>
    **RED phase — write tests first** in `src/engines/__tests__/contextBudget.test.js`:

    Tests:
    - describe("estimateTokens"):
      - "should estimate tokens from character count" — 11 chars -> ~3 tokens
      - "should return 0 for empty string" — "" -> 0
      - "should return 0 for null/undefined" — null -> 0, undefined -> 0
      - "should handle large text" — 40000 chars -> ~10000 tokens

    - describe("computeCost"):
      - "should compute Sonnet pricing" — 1000 input, 500 output at $3/$15 per M
      - "should compute Opus pricing" — 1000 input, 500 output at $15/$75 per M
      - "should fallback to Sonnet for unknown model" — "claude-unknown" uses Sonnet rates
      - "should return zero cost for zero tokens"

    - describe("createBudgetTracker"):
      - "should record and retrieve entries" — record 1 entry, getSummary has 1 entry
      - "should aggregate totals across entries" — record 3 entries, totals match sum
      - "should compute estimated cost for all entries" — 3 Sonnet + 1 Opus entries, total cost is correct
      - "should return empty summary when no entries" — getSummary with 0 entries

    - describe("formatBudgetReport"):
      - "should format summary as human-readable string" — includes agent roles, token counts, dollar amounts
      - "should show per-agent breakdown" — each agent on its own line

    **GREEN phase — implement** `src/engines/contextBudget.js`:

    Module-level constants (UPPER_SNAKE_CASE):
    ```javascript
    const MODEL_PRICING = {
      'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },   // $/M tokens
      'claude-opus-4-6': { input: 15.0, output: 75.0 },
    };
    const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
    const CHARS_PER_TOKEN = 4;
    ```

    Named exports:
    1. `estimateTokens(text)` — `if (!text) return 0; return Math.ceil(text.length / CHARS_PER_TOKEN);`
       Also accept a number (character count) directly for convenience: `if (typeof text === 'number') return Math.ceil(text / CHARS_PER_TOKEN);`

    2. `computeCost(inputTokens, outputTokens, model)` — look up MODEL_PRICING[model] or fallback to DEFAULT_MODEL. Return `{input: inputTokens * rate.input / 1_000_000, output: outputTokens * rate.output / 1_000_000, total: sum}`.

    3. `createBudgetTracker()` — factory function returning tracker object:
       - `record(agentRole, sectionKey, inputText, outputText, model)` — call estimateTokens on inputText and outputText, push entry to internal array
       - `getSummary()` — aggregate all entries, compute totals, compute estimatedCost via computeCost for each entry then sum
       - Return: `{entries, totals: {input, output}, estimatedCost: {input, output, total}}`

    4. `formatBudgetReport(summary)` — human-readable string:
       ```
       === Token Budget Report ===
       Agent: financial-analyst (meaning)
         Input: ~12,500 tokens | Output: ~2,000 tokens
         Estimated cost: $0.068
       Agent: business-analyst (company_info)
         ...
       ---
       Total: ~50,000 input | ~8,000 output
       Estimated cost: $0.27
       ```

    5. Export `MODEL_PRICING` for transparency.

    Test-only exports: `export const _testExports = { CHARS_PER_TOKEN, DEFAULT_MODEL };`

    Run: `npx vitest run src/engines/__tests__/contextBudget.test.js`
  </action>
  <verify>
    <automated>cd /Users/kylehoff/Desktop/stock-analyzer && npx vitest run src/engines/__tests__/contextBudget.test.js --reporter=verbose 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `src/engines/contextBudget.js` exports estimateTokens, createBudgetTracker, computeCost, formatBudgetReport, MODEL_PRICING
    - `src/engines/contextBudget.js` exports _testExports with CHARS_PER_TOKEN and DEFAULT_MODEL
    - MODEL_PRICING has entries for "claude-sonnet-4-20250514" and "claude-opus-4-6"
    - No imports of 'fs', 'path', or 'node:' modules (pure engine)
    - No fetch(), XMLHttpRequest, or network calls
    - All contextBudget.test.js tests pass
    - contextBudget.js is under 120 lines (small, focused module)
  </acceptance_criteria>
  <done>contextBudget.js provides token estimation and cost tracking. All tests pass. Engine is pure — no side effects. MODEL_PRICING is exported for transparency. formatBudgetReport produces human-readable output.</done>
</task>

</tasks>

<verification>
Run contextBudget test suite:
```bash
npx vitest run src/engines/__tests__/contextBudget.test.js --reporter=verbose
```

Verify no new dependencies:
```bash
git diff package.json
```

Verify pure engine (no I/O imports):
```bash
grep -E "import.*from.*'(fs|path|node:)" src/engines/contextBudget.js
```
Should return nothing.
</verification>

<success_criteria>
- contextBudget.js exports estimateTokens, createBudgetTracker, computeCost, formatBudgetReport
- Token estimation uses chars/4 approximation (documented, not hidden)
- Cost calculation uses real Claude pricing for Sonnet and Opus
- Budget tracker aggregates across multiple agent dispatch entries
- All tests pass
- No network calls, no file I/O, no new dependencies
</success_criteria>

<output>
After completion, create `.planning/phases/05D-quality-system/05D-02-SUMMARY.md`
</output>
