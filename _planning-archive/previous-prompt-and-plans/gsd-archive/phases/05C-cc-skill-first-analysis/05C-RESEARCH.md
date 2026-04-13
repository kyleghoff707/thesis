# Phase 5C: CC Skill + First Analysis - Research

**Researched:** 2026-03-24
**Domain:** Claude Code skill orchestration, agent prompt authoring, AI-driven investment analysis
**Confidence:** HIGH

## Summary

Phase 5C delivers the first real AI-generated One Pager by (1) authoring production-quality agent prompts for 4 agents via `/writing-skills`, (2) building a CC skill at `.claude/skills/generate-one-pager/SKILL.md` that orchestrates the full pipeline as CC subagents, and (3) running the first real generation against a test ticker to benchmark against the LULU One Pager PDF. This phase proves the entire agent architecture works end-to-end before any UI is built.

The implementation builds on Phase 5A infrastructure: `assembleDataPacket()`, `sliceDataPacket()`, `ReportSectionSchema`, `progressState.js`, `TOOL_DEFINITIONS`, the dispatch table, agent configs, and writing briefs. The key new work is (a) replacing 4 stub `prompt.md` files with real agent prompts authored via `/writing-skills`, (b) creating the CC skill that reads configs, assembles data, dispatches subagents, and collects results, and (c) validating output quality against the LULU benchmark.

**Primary recommendation:** Build the CC skill as a `context: fork` skill with `disable-model-invocation: true` that uses the Agent tool to spawn 3 parallel analyst subagents (Sonnet) followed by 1 sequential synthesis-writer subagent (Opus). Each subagent receives its sliced DataPacket + curriculum + schema as system prompt context. The skill reads the dispatch table and agent configs at runtime to stay DRY.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `/writing-skills` to author prompt.md for each of the 4 One Pager agents: business-analyst, financial-analyst, valuation-specialist, synthesis-writer
- **D-02:** `/writing-skills` MUST read ALL reference files in the skill directory: `anthropic-best-practices.md`, `testing-skills-with-subagents.md`, `persuasion-principles.md`, `graphviz-conventions.dot`, `examples/`
- **D-03:** Claude drafts each prompt via `/writing-skills` (reading writing briefs + curriculum + reference files). User reviews and approves each before moving to next agent.
- **D-04:** Only 4 agents need prompts for 5C -- the One Pager agents. Remaining agents (primary-source-reader, competitor-evaluator, management-evaluator, risk-analyst) keep stubs until Phase 6.
- **D-05:** Data-assembler is code-driven (no prompt needed). The CC skill wires in the existing `assembleDataPacket()` from 5A.
- **D-06:** `/generate:one-pager {TICKER}` is a Claude Code skill (`.claude/skills/generate-one-pager/SKILL.md`) that orchestrates the full One Pager pipeline
- **D-07:** Dual-path runtime strategy: Phase 5C uses CC subagents (free with CC subscription) for development/validation. Phase 8 adds direct Claude API calls via `aiResearch.js` for the Tauri production app. Same agent prompts power both paths.
- **D-08:** The CC skill reads agent prompt.md files, assembles the DataPacket, dispatches subagents with sliced DataPacket + curriculum, collects structured section outputs, and saves the report to `.thes1s/reports/{TICKER}/`
- **D-09:** Parallel execution for analysts: DataPacket assembled first (sequential). Then financial-analyst, business-analyst, and valuation-specialist run as parallel CC subagents (no dependencies between them). Synthesis-writer runs last after all 3 complete.
- **D-10:** Model selection: Sonnet for analyst agents (financial-analyst, business-analyst, valuation-specialist). Opus for synthesis-writer (needs judgment to weigh verdicts and craft narrative).
- **D-11:** Each subagent receives: its prompt.md as system context, sliced DataPacket (per config.json dataPacketSlice), curriculum files (per config.json curriculum array), universal context (rule-one-fundamentals.md + tools-for-analysis.md), and the ReportSectionSchema for structured output.
- **D-12:** Agent output must conform to ReportSectionSchema (Zod validation). Structured output enforcement via schema, not just prompting.
- **D-13:** Test ticker for first generation is user's choice at runtime (any ticker with good EDGAR data). LULU is the benchmark for comparison but is never used during generation (contamination boundary).
- **D-14:** "80% section depth match" is user-verified -- the user reads the generated One Pager side-by-side with the LULU One Pager PDF and judges whether each section has comparable depth, specificity, and rigor.

### Claude's Discretion
- CC skill internal implementation details (how subagents are spawned, error handling patterns)
- DataPacket assembly error handling during generation (already resilient from 5A)
- Report file format within `.thes1s/reports/{TICKER}/` (JSON structure, section files)
- Progress state updates during generation (uses progressState.js from 5A)

### Deferred Ideas (OUT OF SCOPE)
- Direct Claude API path for production Tauri app -- Phase 8 (`aiResearch.js`)
- Primary Source Reader agent prompt -- Phase 6 (Pitch Deck needs it, One Pager doesn't)
- Competitor-evaluator, management-evaluator, risk-analyst prompts -- Phase 6
- Token budget measurement and optimization -- Quality System Phase 5D
- Automated eval system -- user IS the eval for first 5-10 reports
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ONEP-01 | CC skill `/generate:one-pager` orchestrating data-assembler + financial-analyst + business-analyst + synthesis-writer | CC skill architecture pattern (context: fork + Agent tool dispatch), subagent configuration, DataPacket assembly integration, dispatch table choreography |
| ONEP-06 | 80%+ section depth match vs LULU One Pager benchmark (user-verified) | LULU benchmark structure documented (6 sections visible in PDF), agent prompt quality achieved via /writing-skills TDD methodology, curriculum injection at full depth, benchmark comparison output format |
</phase_requirements>

## CC Skill Architecture Patterns

### How CC Skills Work (Verified from Official Docs)

**Confidence: HIGH** -- Verified from https://code.claude.com/docs/en/skills and https://code.claude.com/docs/en/sub-agents

A CC skill is a `.claude/skills/<name>/SKILL.md` file with YAML frontmatter + markdown instructions. Key patterns for this phase:

| Feature | How It Works | Use In This Phase |
|---------|-------------|-------------------|
| `context: fork` | Runs skill in isolated subagent context | The orchestrator skill runs in a fork so it gets a clean context |
| `disable-model-invocation: true` | Only user can trigger via `/generate:one-pager` | Prevents Claude from auto-triggering report generation |
| `$ARGUMENTS` / `$0` | String substitution for arguments | `/generate:one-pager COST` passes `COST` as `$0` |
| `allowed-tools` | Restricts which tools the skill can use | Allow Agent, Bash, Read, Write, Glob, Grep |
| Agent tool | Spawns subagents from within the skill | Dispatch financial-analyst, business-analyst, valuation-specialist, synthesis-writer |
| `model` | Override model for the skill | Use `opus` for the orchestrator (it needs judgment for synthesis dispatch) |

### Subagent Dispatch Pattern

**Confidence: HIGH** -- Verified from official subagent docs

The CC skill (orchestrator) spawns subagents using the `Agent` tool. Each subagent:
- Gets its own isolated context window (up to 200K tokens for Sonnet, 1M for Opus)
- Receives a custom system prompt (the agent's `prompt.md` content + curriculum + DataPacket slice)
- Can use tools specified in its configuration
- Returns results to the orchestrator when complete
- Cannot spawn its own subagents (no nesting)

**Parallel dispatch**: The orchestrator can spawn multiple subagents in a single message. All three analyst agents (financial-analyst, business-analyst, valuation-specialist) can be dispatched simultaneously since they have no dependencies on each other.

**Sequential dispatch**: The synthesis-writer MUST wait for all 3 analysts to complete. The orchestrator collects all section outputs, then dispatches synthesis-writer with those outputs as context.

### Custom Subagent Definitions

**Confidence: HIGH** -- Verified from official docs

Subagents can be defined as `.claude/agents/<name>.md` files with YAML frontmatter. For this phase, we need 4 agent definitions:

```
.claude/agents/
  financial-analyst.md
  business-analyst.md
  valuation-specialist.md
  synthesis-writer.md
```

Each file structure:
```yaml
---
name: financial-analyst
description: Analyzes quantitative financial data for Rule One investment research
tools: Read, Bash, Grep, Glob
model: sonnet
---

[System prompt from agents/financial-analyst/prompt.md]
```

**Critical constraint**: Subagents cannot spawn other subagents. The orchestrator (CC skill) is the only entity that dispatches.

### Data Flow Architecture

```
/generate:one-pager COST
  |
  v
CC Skill (orchestrator, context: fork)
  |
  |--> Step 1: Bash: node scripts/assemble-data.js COST
  |      (runs assembleDataPacket via nodeAdapter, writes DataPacket JSON to .thes1s/)
  |
  |--> Step 2: Read agent configs from agents/*/config.json
  |      (determine dataPacketSlice, curriculum, sections per agent)
  |
  |--> Step 3: Dispatch 3 parallel Agent calls:
  |      Agent(financial-analyst, prompt: sliced DataPacket + curriculum + schema)
  |      Agent(business-analyst, prompt: sliced DataPacket + curriculum + schema)
  |      Agent(valuation-specialist, prompt: sliced DataPacket + curriculum + schema)
  |
  |--> Step 4: Collect outputs, validate against ReportSectionSchema
  |
  |--> Step 5: Dispatch synthesis-writer Agent
  |      Agent(synthesis-writer, prompt: all section summaries + verdicts + schema)
  |
  |--> Step 6: Assemble final report, write to .thes1s/reports/COST/
  |
  v
Report JSON + formatted markdown
```

## Prompt Authoring via /writing-skills

### Methodology

**Confidence: HIGH** -- Verified from `.claude/skills/writing-skills/SKILL.md`

The `/writing-skills` skill follows a TDD-style process:
1. **RED**: Run a pressure scenario WITHOUT the prompt -- see what a vanilla agent produces
2. **GREEN**: Write the prompt addressing specific failures
3. **REFACTOR**: Close loopholes, plug rationalizations

For this phase, the TDD cycle per agent is:
1. Read the writing brief (`agents/writing-briefs/{agent}-brief.md`) -- this is the roadmap
2. Read all curriculum files referenced in the brief at full depth
3. Read ALL reference files in the writing-skills directory (D-02)
4. Draft the prompt.md with curriculum embedded at full depth
5. User reviews and approves before moving to next agent (D-03)

### Per-Agent Prompt Content Requirements

**Confidence: HIGH** -- Derived from writing briefs + agent configs

| Agent | One Pager Sections | Key Curriculum | DataPacket Slice | Model |
|-------|-------------------|----------------|------------------|-------|
| business-analyst | 1 (Company Info), 2 (Minimum Standards) | one-pager.md, pitch-deck-I.md, story-form-I.md, advanced-financial-analysis.md | companyInfo, classification, ruleOneScore, peers | Sonnet |
| financial-analyst | 3 (Meaning/Management KPIs), 4 (Growth Metrics) | advanced-financial-analysis.md, fgr.md, capex-cash-flow-explained.md | financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics | Sonnet |
| valuation-specialist | 5 (Valuation Summary) | pitch-deck-IV.md, fgr.md, equity-bond-research.md, advanced-financial-analysis.md, capex-cash-flow-explained.md | growthRates, returnMetrics, fcf, analystEstimates, ttm, currentPrice, keyMetrics | Sonnet (D-10 says Sonnet for analyst agents) |
| synthesis-writer | 6 (Overall Verdict) | buffett_letters_claude_training_set/ (6 letters + principles) | None (receives section outputs from other agents) | Opus |

**Note on valuation-specialist model**: The agent config.json says `"model": "opus"` but D-10 explicitly says "Sonnet for analyst agents (financial-analyst, business-analyst, valuation-specialist)". The CONTEXT.md decision overrides the config -- use Sonnet for One Pager generation (Opus reserved for Pitch Deck/Full Story valuation work).

### Each prompt.md Must Include

Based on writing briefs and CONTEXT.md decisions:

1. **Role definition** -- Who the agent is, what they do
2. **Curriculum at full depth** -- No compression, no summarization (AGNT-03)
3. **DataPacket slice documentation** -- What fields the agent receives, how to reference them
4. **Output schema** -- ReportSectionSchema fields, what each must contain
5. **Section-specific instructions** -- For One Pager: what each section covers, what data to pull
6. **Citation requirements** -- Every quantitative claim traces to DataPacket field path
7. **Red flag mandate** -- At least 1 red flag per section, even for PASS (KDD #12)
8. **Contamination boundary** -- Never reference LULU or example analyses
9. **Industry branching** -- Financial-analyst must handle REIT/bank/insurance differently
10. **Honest gaps** -- "Data not available" for missing data, never estimate

### Estimated Token Budgets per Agent (One Pager)

| Agent | Curriculum | Universal Context | DataPacket Slice (est.) | Schema | Prompt Chrome | Total Input (est.) |
|-------|-----------|-------------------|------------------------|--------|---------------|-------------------|
| business-analyst | ~3,840 | ~1,570 | ~2,000 | ~500 | ~1,500 | ~9,400 |
| financial-analyst | ~2,400 | ~1,570 | ~8,000 | ~500 | ~1,500 | ~14,000 |
| valuation-specialist | ~4,930 | ~1,570 | ~6,000 | ~500 | ~1,500 | ~14,500 |
| synthesis-writer | ~5,000 | ~1,570 | ~3,000 (section outputs) | ~500 | ~1,500 | ~11,600 |

All well within Sonnet's 200K context and Opus's 1M context. The DataPacket slice estimates are rough -- actual size depends on the ticker's data coverage.

## DataPacket Assembly for CLI

### Node.js Bridge (from 5A)

**Confidence: HIGH** -- Verified from `src/engines/nodeAdapter.js` and `src/engines/dataExport.js`

The DataPacket must be assembled in Node.js (not the browser) for CC skill execution. Phase 5A built:
- `src/engines/nodeAdapter.js` -- Browser-to-Node shims (dotenv, linkedom, proxy resolution, file cache)
- `src/engines/dataExport.js` -- `assembleDataPacket()` with staged pipeline and error resilience

A thin CLI script is needed to invoke `assembleDataPacket()` from the CC skill:

```js
// scripts/assemble-data.js (new file)
import { assembleDataPacket } from '../src/engines/dataExport.js';
import '../src/engines/nodeAdapter.js'; // Side-effect: loads .env.local, patches globals
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ticker = process.argv[2];
if (!ticker) { console.error('Usage: node scripts/assemble-data.js TICKER'); process.exit(1); }

const packet = await assembleDataPacket(ticker);
const dir = join(process.cwd(), '.thes1s', 'reports', ticker.toUpperCase());
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'data-packet.json'), JSON.stringify(packet, null, 2));
console.log(`DataPacket assembled for ${ticker}: ${dir}/data-packet.json`);
```

**Key concern**: The engines use `import.meta.env` in the browser path. The nodeAdapter patches this for Node.js, but some engines may still import from `config.js` which reads `import.meta.env`. The nodeAdapter's `getEnv()` function and `isDev()` are the Node-safe alternatives. Need to verify that `assembleDataPacket()` works cleanly from CLI -- Phase 5A should have validated this but it warrants a quick smoke test.

### DataPacket Slicing

**Confidence: HIGH** -- Verified from `src/schemas/dataPacket.js`

`sliceDataPacket(fullPacket, agentConfig)` extracts only the fields listed in `agentConfig.dataPacketSlice` plus always-included fields (`ticker`, `companyInfo`, `classification`, `caveats`). This is already implemented and tested.

## Report Output Format

### File Structure

**Confidence: HIGH** -- Discretion area, designed to be consistent with progressState.js

```
.thes1s/reports/{TICKER}/
  data-packet.json          -- Full DataPacket from assembly
  progress.json             -- Generation state (from progressState.js)
  sections/
    company_info.json       -- Section 1 output (ReportSectionSchema)
    minimum_standards.json  -- Section 2 output
    meaning.json            -- Section 3 output
    growth_metrics.json     -- Section 4 output
    valuation_summary.json  -- Section 5 output
    overall_verdict.json    -- Section 6 output
  one-pager.json            -- Assembled StageReport (all sections + overall verdict)
  one-pager.md              -- Human-readable formatted markdown (for LULU comparison)
```

The section keys match `dispatch-table.json` sectionKeys: `["company_info", "minimum_standards", "meaning", "growth_metrics", "valuation_summary", "overall_verdict"]`.

### ReportSectionSchema Compliance

**Confidence: HIGH** -- Verified from `src/schemas/reportSection.js`

Every agent output section MUST include:
- `key` (string) -- e.g., "company_info"
- `title` (string) -- e.g., "Company Information"
- `sectionNumber` (number) -- 1-6
- `status` (enum) -- 'pass' | 'fail' | 'review' | 'pending'
- `confidence` (enum) -- 'HIGH' | 'MEDIUM' | 'LOW'
- `verdict` (enum | null) -- 'PASS' | 'FAIL' | 'WATCHLIST' | null
- `verdictRationale` (string)
- `summary` (string) -- 1-2 sentences for downstream agents
- `data` (object) -- Section-specific structured data
- `narrative` (string) -- Buffett-style prose analysis
- `citations` (array) -- [{id, ref, text, source}]
- `tables` (array, optional)
- `charts` (array, optional)
- `redFlags` (array, min 1) -- At least one, even for PASS
- `primarySourceInsights` (array, optional)
- `generatedAt` (ISO string)
- `modelUsed` (string) -- e.g., "claude-sonnet-4-6"
- `tokenCost` ({input, output})

**Schema enforcement strategy**: Include the JSON schema in each agent's prompt so the agent knows exactly what fields to produce. The orchestrator validates outputs using `ReportSectionSchema.safeParse()` after each subagent returns.

## LULU Benchmark Structure

### What the LULU One Pager Contains

**Confidence: HIGH** -- Verified from PDF

The LULU One Pager PDF (dated Aug 2025) contains:

| Section | Content |
|---------|---------|
| Company Information | Company Name: Lululemon, Last Price: $196, Stock Ticker: LULU, Industry: 'Athleisure' apparel |
| Minimum Standards | Market Cap: $22,500M, HQ: Vancouver BC, Public > 7 years: Yes, Debt < 3 years earnings: Yes |
| Meaning KPIs | In 3 Circles: Yes, Number of Gurus: No gurus, Rule One Score: 100/100/100, Bigger in 10 Years: Probably |
| Management KPIs | ROE: 41.97%, ROIC: 41.97%, Net-Debt to Earnings: 0, Net-Debt to FCF: 0 |
| Company Summary | ~100 words describing Lululemon's business (designs/distributes athletic apparel, 760+ stores, founded 1998, Vancouver) |
| Growth Metrics | 12-year table with Book Value, BVPS+Div, Earnings, Operating Cash, Revenue, FCF, ROE, ROIC, ROA |

The "80% section depth match" benchmark (ONEP-06) means the generated One Pager must:
1. Have all 6 sections present with substantive content
2. Include actual numerical data from the DataPacket (not placeholders)
3. Provide a Company Summary with comparable specificity
4. Include growth metrics across multiple years with trend analysis
5. Deliver a clear PASS/FAIL/WATCHLIST verdict with rationale
6. Have at least comparable depth of analysis per section

### Benchmark Comparison Output

Per CONTEXT.md specifics: save as both JSON (machine-readable) and formatted markdown (human-readable for side-by-side comparison with LULU PDF). The markdown should be structured to mirror the One Pager template layout.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DataPacket assembly | Custom data gathering | `assembleDataPacket()` from dataExport.js | 20+ engines already integrated with error resilience |
| DataPacket slicing | Manual field filtering | `sliceDataPacket()` from dataPacket.js | Handles always-included fields, tested |
| Schema validation | Manual field checking | `ReportSectionSchema.safeParse()` from reportSection.js | Zod validation with detailed error messages |
| Progress tracking | Custom state file | `progressState.js` state machine | IDLE->DATA_ASSEMBLY->WAVE_1_RUNNING->SYNTHESIS->COMPLETE with validated transitions |
| Section persistence | Custom file I/O | `saveSectionOutput()` / `readSectionOutput()` from progressState.js | Handles directory creation, JSON serialization |
| Tool definitions | Custom tool schemas | `TOOL_DEFINITIONS` from toolbox.js | 13 Claude tool_use compatible definitions |
| Tool execution | Custom dispatch | `createToolExecutor(dataPacket)` from toolbox.js | Handles both standalone and data-dependent tools |

**Key insight:** Phase 5A built all the infrastructure. Phase 5C's code work is limited to (a) a CLI DataPacket assembly script, (b) the CC skill SKILL.md, and (c) possibly custom subagent definitions in `.claude/agents/`. The bulk of the work is prompt authoring via `/writing-skills`.

## Common Pitfalls

### Pitfall 1: Context Window Overflow in Subagents
**What goes wrong:** Agent receives too much data and the DataPacket slice + curriculum exceeds context limits, causing truncation or degraded output.
**Why it happens:** Some tickers have 15+ years of financial data; the full financials object can be very large.
**How to avoid:** DataPacket slicing (already implemented) limits each agent to its relevant fields. The financial-analyst gets the heaviest slice (~8K tokens estimated) but this is well within Sonnet's 200K limit.
**Warning signs:** Agent outputs that reference "previous sections" that don't exist, or hallucinated financial figures.

### Pitfall 2: Subagent JSON Output Parsing
**What goes wrong:** Subagent returns narrative text instead of structured JSON conforming to ReportSectionSchema.
**Why it happens:** Without explicit schema enforcement, LLMs default to prose. The prompt must be very explicit about output format.
**How to avoid:** Include the exact JSON schema in each agent's prompt.md. Include a concrete example of the expected output shape. Use the `data` field description to specify what section-specific fields are expected.
**Warning signs:** Zod validation failures when parsing subagent output.

### Pitfall 3: LULU Contamination
**What goes wrong:** Agent output pattern-matches from LULU examples instead of performing independent analysis.
**Why it happens:** LULU examples exist in the knowledge/ directory. If the subagent has file system access, it could read them.
**How to avoid:** (1) Contamination boundary in every agent prompt -- explicit instruction to never reference examples. (2) Restrict subagent tool access -- if agents don't need file read access beyond their DataPacket, don't give them Read tool. (3) The CC skill itself should never read from knowledge/stage-*/examples/ during generation.
**Warning signs:** Output that mentions "Lululemon" when analyzing a different ticker, or section structures that exactly mirror the LULU format.

### Pitfall 4: NodeAdapter Import Chain Failures
**What goes wrong:** Running `assembleDataPacket()` from CLI fails because some engine imports `config.js` which uses `import.meta.env`.
**Why it happens:** The engines were designed for browser/Vite execution. nodeAdapter patches the environment but the import chain may have gaps.
**How to avoid:** Smoke test the CLI DataPacket assembly script early. If engines fail, they'll return null (error-resilient design from 5A) but the errors array will show what broke.
**Warning signs:** Many null fields in the DataPacket, errors array with multiple entries.

### Pitfall 5: Prompt.md Files Too Large for Subagent System Prompt
**What goes wrong:** Agent prompts with full-depth curriculum exceed the system prompt size limits.
**Why it happens:** Curriculum files total ~2,000-5,000 tokens each agent. With the prompt chrome, DataPacket documentation, and schema, each prompt.md could be 3,000-5,000 words.
**How to avoid:** Prompt.md doesn't contain the DataPacket itself -- only documentation about what fields to expect. The actual DataPacket is passed as the task message, not the system prompt. Curriculum is embedded in the prompt at full depth but the files are modest (150-400 lines each).
**Warning signs:** Prompt.md files exceeding 10,000 words.

### Pitfall 6: Parallel Agent Race Conditions in CC Skill
**What goes wrong:** The CC skill dispatches 3 parallel agents but doesn't properly wait for all to complete before dispatching synthesis-writer.
**Why it happens:** The Agent tool returns results asynchronously. If the orchestrator dispatches synthesis-writer before all 3 analysts complete, it gets incomplete data.
**How to avoid:** CC automatically handles this -- when you spawn multiple Agent calls in one message, they all run in parallel and all results are returned before the next message. The orchestrator should dispatch all 3 analysts in a single message, then dispatch synthesis-writer in a subsequent message.
**Warning signs:** Synthesis-writer output references only 1-2 sections instead of all 5.

## Architecture Patterns

### CC Skill SKILL.md Structure

```yaml
---
name: generate-one-pager
description: Generate a complete Rule One One Pager investment analysis for a given stock ticker
argument-hint: TICKER
disable-model-invocation: true
context: fork
model: opus
allowed-tools: Agent, Bash, Read, Write, Glob, Grep
---

# Generate One Pager: $0

[Orchestration instructions...]
```

**Key design decisions:**
- `context: fork` -- Runs in isolated context so main conversation stays clean
- `disable-model-invocation: true` -- Only triggered by `/generate:one-pager TICKER`
- `model: opus` -- The orchestrator itself uses Opus for judgment on assembly/validation
- `allowed-tools` includes Agent (to spawn subagents), Bash (to run DataPacket assembly), Read/Write (to read configs and write results)

### Subagent Definition Pattern

Each agent gets a `.claude/agents/<name>.md` file:

```yaml
---
name: financial-analyst
description: Rule One financial analyst -- quantitative analysis of growth, returns, FCF, and balance sheet
tools: Read, Grep, Glob
model: sonnet
maxTurns: 30
---

[Content of agents/financial-analyst/prompt.md]
```

**Why `.claude/agents/` instead of inline Agent dispatch**: Using persistent agent definitions means the orchestrator can reference agents by name rather than passing the full prompt in every Agent call. This keeps the CC skill concise and the prompts maintainable.

**Alternative approach**: Instead of .claude/agents/ files, the CC skill could read the prompt.md files at runtime using the Read tool and pass the content directly to the Agent tool's prompt parameter. This avoids duplicating prompts between `agents/*/prompt.md` and `.claude/agents/*.md` but makes the orchestrator more complex.

**Recommendation**: Use the runtime-read approach -- the CC skill reads `agents/*/prompt.md` and `agents/*/config.json`, assembles the subagent prompt (prompt.md + sliced DataPacket + curriculum content + schema), and passes it all as the Agent tool prompt. This keeps the single source of truth in `agents/*/prompt.md` and avoids sync issues.

### Recommended Project Structure (New Files)

```
.claude/skills/
  generate-one-pager/
    SKILL.md                     # CC skill orchestrator

scripts/
  assemble-data.js               # CLI wrapper for assembleDataPacket()

agents/
  business-analyst/
    prompt.md                    # REPLACE stub with real prompt (via /writing-skills)
  financial-analyst/
    prompt.md                    # REPLACE stub with real prompt
  valuation-specialist/
    prompt.md                    # REPLACE stub with real prompt
  synthesis-writer/
    prompt.md                    # REPLACE stub with real prompt

.thes1s/reports/{TICKER}/        # Generated output (gitignored)
  data-packet.json
  progress.json
  sections/*.json
  one-pager.json
  one-pager.md
```

### Anti-Patterns to Avoid

- **Embedding full DataPacket in system prompt**: Pass DataPacket as the task message, not the system prompt. System prompts should contain role definition, curriculum, and schema.
- **Duplicating prompt content across files**: One source of truth in `agents/*/prompt.md`. The CC skill reads these at runtime.
- **Giving agents file system access to knowledge/examples/**: This enables contamination. Agents should get data via DataPacket, not by reading files.
- **Hardcoding section keys in the CC skill**: Read from `dispatch-table.json` and `config.json` to stay DRY and support future stages.
- **Running synthesis-writer with raw DataPacket**: Synthesis-writer receives section outputs from other agents, not raw financial data. Its DataPacket slice is empty for a reason.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Task tool | Agent tool | CC v2.1.63 (2026) | `Task(...)` still works as alias but `Agent(...)` is the current name |
| Commands (.claude/commands/) | Skills (.claude/skills/) | CC v2.x (2025-2026) | Commands still work but skills add frontmatter options, supporting files |
| Single-file skills | Skill directories with SKILL.md + supporting files | CC v2.x | Better organization for complex skills |
| No context: fork | context: fork for isolated execution | CC v2.x | Skills can run in subagent context |
| No model override | model: field in frontmatter | CC v2.x | Skills can specify which model to use |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vite.config.js` (vitest config inline) |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ONEP-01 | CC skill exists and has correct frontmatter | unit | `npm test -- --run agents/__tests__/ccSkill.test.js` | Wave 0 |
| ONEP-01 | DataPacket CLI assembly works for a test ticker | integration/smoke | `node scripts/assemble-data.js AAPL` (manual) | Wave 0 |
| ONEP-01 | Agent prompt.md files are non-stub (> 1000 bytes, no "STUB" marker) | unit | `npm test -- --run agents/__tests__/agentDefinitions.test.js` | Existing (check 14 covers size) |
| ONEP-06 | Generated report has all 6 sections with valid schema | integration | Manual (run `/generate:one-pager` and validate) | Manual |
| ONEP-06 | Each section passes ReportSectionSchema validation | unit | `npm test -- --run src/schemas/__tests__/reportSection.test.js` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green + user-verified LULU benchmark comparison

### Wave 0 Gaps
- [ ] `agents/__tests__/ccSkill.test.js` -- Validates CC skill SKILL.md exists with correct frontmatter
- [ ] `src/schemas/__tests__/reportSection.test.js` -- Validates that sample section JSON passes schema
- [ ] `scripts/assemble-data.js` -- CLI entry point for DataPacket assembly (smoke testable)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | DataPacket assembly CLI | Yes | v24.13.1 | -- |
| Claude Code | CC skill + Agent tool dispatch | Yes | (installed) | -- |
| CC Pro subscription | Free subagent execution | Yes (assumed) | -- | Claude API (Phase 8) |
| `.env.local` with API keys | DataPacket assembly (EDGAR, Yahoo, etc.) | Yes | -- | Partial DataPacket (error-resilient) |
| Vitest | Tests | Yes | 4.1.0 | -- |

**Missing dependencies with no fallback:** None identified.

## Open Questions

1. **NodeAdapter smoke test**
   - What we know: Phase 5A built nodeAdapter.js with browser-to-Node shims
   - What's unclear: Whether `assembleDataPacket()` works cleanly from a standalone CLI script (not just tests)
   - Recommendation: First task should include a smoke test running `node scripts/assemble-data.js AAPL` and verifying the DataPacket JSON is valid

2. **Subagent prompt delivery method**
   - What we know: The CC skill needs to pass prompt.md + DataPacket + curriculum to each subagent
   - What's unclear: Whether to use `.claude/agents/` definitions (persistent subagents) or inline Agent tool calls with full prompt
   - Recommendation: Use inline Agent tool calls -- the CC skill reads prompt.md, slices DataPacket, reads curriculum files, and passes everything as the Agent prompt. This avoids maintaining two copies of prompts. The `.claude/agents/` approach would require syncing.

3. **Valuation-specialist model for One Pager**
   - What we know: Agent config.json says `"model": "opus"`, but CONTEXT.md D-10 says "Sonnet for analyst agents"
   - What's unclear: Whether Sonnet is sufficient for the valuation summary section (less complex than Pitch Deck valuation)
   - Recommendation: Follow D-10 -- use Sonnet for One Pager. The valuation summary section is a quick buy price range, not the full FGR derivation workflow. Opus is overkill here.

4. **Tool access for analyst subagents**
   - What we know: Financial-analyst config lists 9 tools, business-analyst lists 0 tools
   - What's unclear: Whether Sonnet subagents can effectively use Toolbox tools in CC mode (tools would need to be implemented as Bash scripts the agent can call)
   - Recommendation: For One Pager, tools are likely unnecessary -- the DataPacket already contains pre-computed growth rates, return metrics, valuation scores, etc. The tools become important for Pitch Deck iterative analysis. Omit tool access for 5C subagents; add in Phase 6.

## Project Constraints (from CLAUDE.md)

- **Desktop only**: Tauri app, no server. API calls go direct to external services.
- **No Prettier**: Formatting is manual/editor-default, 2 spaces, single quotes, semicolons
- **Error handling pattern**: try/catch and return null on failure, callers check for null
- **Naming**: Engines camelCase .js, components PascalCase .jsx, hooks useX.js
- **Testing**: Vitest (`npm test`), use vitest for all tests
- **Git**: No branch strategy (branching_strategy: "none"), commit to main
- **GSD workflow**: Use GSD commands for planned work
- **Bug fixing**: Diagnose first, write failing test, fix with subagent, verify
- **Contamination**: LULU examples never enter agent context during generation (AGNT-04)
- **Cost**: Full pipeline target $8-12 per company (One Pager alone should be ~$0.05-0.15)
- **Theme**: Inline styles with mutable C palette, no CSS files

## Sources

### Primary (HIGH confidence)
- `.claude/skills/writing-skills/SKILL.md` -- /writing-skills TDD methodology for prompt authoring
- `agents/orchestrator/dispatch-table.json` -- One Pager section-to-agent mapping and parallelism rules
- `agents/orchestrator/config.json` -- Section mapping for all stages
- `agents/*/config.json` -- Per-agent curriculum, DataPacket slice, tools, model
- `agents/writing-briefs/*.md` -- Detailed writing briefs for each agent prompt
- `src/schemas/reportSection.js` -- ReportSectionSchema (Zod v4.3)
- `src/schemas/dataPacket.js` -- DataPacketSchema + sliceDataPacket()
- `src/engines/progressState.js` -- State machine + section persistence
- `src/engines/dataExport.js` -- assembleDataPacket() implementation
- `src/engines/toolbox.js` -- TOOL_DEFINITIONS + executors
- `src/engines/nodeAdapter.js` -- Browser-to-Node shims
- `knowledge/stage-1-one-pager/examples/LULU One Pager.PDF` -- LULU benchmark (viewed)
- https://code.claude.com/docs/en/skills -- Official CC skills documentation
- https://code.claude.com/docs/en/sub-agents -- Official CC subagent documentation

### Secondary (MEDIUM confidence)
- `gstack/plans/gstack-ai-agent-workflow-plan-20260323.md` -- Architecture plan (authored by user + Claude)
- Token budget estimates for agent prompts (based on line counts, ~3.3 tokens/line heuristic)

### Tertiary (LOW confidence)
- DataPacket size estimates per ticker (varies significantly by data coverage)
- Whether all 20+ engines work cleanly from CLI via nodeAdapter (needs smoke test)

## Metadata

**Confidence breakdown:**
- CC Skill Architecture: HIGH - Verified from official docs, well-documented patterns
- Prompt Authoring: HIGH - /writing-skills methodology well-defined, writing briefs comprehensive
- DataPacket Assembly: HIGH - Code exists and is tested, but CLI path needs smoke test
- LULU Benchmark: HIGH - PDF examined, structure documented
- Token Budgets: MEDIUM - Estimates based on line counts, not measured tokens
- Subagent Dispatch: HIGH - Official docs confirm parallel Agent calls work as expected

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- CC skill patterns and 5A infrastructure are established)
