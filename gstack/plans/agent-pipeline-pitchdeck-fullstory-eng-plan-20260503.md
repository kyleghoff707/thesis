# Pitch Deck + Full Story v3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Pitch Deck (10 specialists across 5 waves) and Full Story (10 agents across Phase-1 parallel + Phase-2 sequential debate) from v1 Managed Agents to the v3 stack already running for the One Pager (Inngest + Fly + direct Anthropic SDK + Langfuse). All TODOS.md items 1–5 are baked into this plan, not deferred.

**Architecture:** No new infrastructure. Extends Phase 1 (One Pager) which is already live in production. Cloudflare Worker stays the front door — pre-assembles DataPacket + filing content into R2 keyed by runId, mints `reports` + `v3_runs` rows, fires the Inngest event. Fly.io `thes1s-agents` service hosts two new Inngest functions (`pitch-deck`, `full-story`) that read pre-assembled inputs from R2 via a Worker proxy route, then dispatch agent runners — one runner per agent, each in its own `step.run` block for per-agent retry isolation. Each runner reuses the existing `callAgentWithStructuredOutput` wrapper (Phase A research loop + Phase B reflect-and-retry × 3 + NonRetriableError on 4xx) and ProgressPublisher class. v3 callback writes only to `v3_runs.result_json`. A new `reports.v3_run_id` column links the saved-reports list to v3 runs.

**Tech Stack (no additions over Phase 1):** TypeScript on Node 22 LTS, Fastify, Inngest SDK with Fastify adapter, Anthropic SDK (`@anthropic-ai/sdk`), Langfuse SDK, Zod schemas, Vitest tests.

**Reliability strategy:** Engineered for 100% per-agent success; no graceful degradation. Each agent runs in its own `step.run` so per-step retries apply per-agent. Three layers stack automatically: (1) wrapper Phase B reflect-and-retry × 3 on schema/format failures; (2) Inngest function-level `retries: 3` per step on transient errors; (3) NonRetriableError on 4xx prevents wasted retries. Up to ~9 attempts per agent. If any agent permanently fails, the entire run is `failed` with a clear error — no partial-success state, no `completed_with_errors` writes, no Bull-as-thesis fallback. The cost of this discipline is paid up front in Phase 0 prompt audits.

---

## Plain-English Overview (for the PM)

Today, when you click "Generate Pitch Deck":
1. The Worker calls Anthropic's Managed Agents API and asks the Coordinator agent to dispatch 10 specialists
2. **Anthropic hasn't granted `callable_agents` access** — the Coordinator can't dispatch
3. The run never completes

After this Phase 2 plan, when you click "Generate Pitch Deck":
1. The Worker assembles your DataPacket (financials, gurus, insiders, peers) and filing content (10-K + 10-Q markdown + transcripts) and writes them to R2 keyed by `runId`. ~1 second.
2. The Worker mints a `reports` row + a `v3_runs` row in D1, then fires `thes1s/pitchdeck.start` to Inngest. Returns `runId` to the frontend immediately.
3. Inngest dispatches the run to Fly. Fly runs **5 waves** of agents in sequence, with parallel agents inside each wave. Each agent is its own Inngest step — if one wobbles, only that agent retries, not the whole wave.
4. Between waves, a tiny CPU step merges every agent's `crossCuttingFindings` into a single deduped list and feeds it into the next wave's prompts. No extra Anthropic call.
5. After Wave 4 (Synthesis Writer), Fly POSTs the full report to the Worker callback. Worker writes it to `v3_runs.result_json`.
6. Frontend polls `/api/v3/pipeline/status/:runId`. The streaming UI from Brainstorm 3 will surface wave-by-wave progress, per-agent state, cumulative cost.

Full Story works the same way but with two phases instead of waves: 5 deep-analysis agents in parallel, then a 5-step adversarial debate (Bull → Bear → Rebuttal → Judge → Compose) running strictly in sequence. FS inherits the completed parent Pitch Deck instead of re-running PSR.

**TODOS.md items 1–5 baked in:**
- TODOS 1 (multi-role ambiguity) → Phase 0 Task 3 creates 5 new FS-internal split prompts
- TODOS 2 (debate cascade failure) → engineered out via per-step retry isolation
- TODOS 3 (filesystem section passing) → Phase 0 Task 1 rewrites `/workspace/...` references in all PD/FS prompts
- TODOS 4 (cross-cutting findings) → Phase C Task 14 builds the CPU aggregation helper
- TODOS 5 (web search empty fallback) → Phase 0 Task 2 appends standardized fallback boilerplate

---

## Brainstorm Decisions Inherited

From `gstack/design/agent-pipeline-cross-stage-decisions-20260503.md`. Each B1 decision and where it's applied here:

| # | Brainstorm 1 Decision | How this plan applies it |
|---|---|---|
| 1 | DataPacket → R2 keyed by `runId` | Phase A Task 5 (R2 helpers); Task 7 (Worker writes pre-dispatch) |
| 2 | Filing content → R2 keyed by `runId` | Same module as D1; reuses existing `filings-md/{accession}.md` per-file cache |
| 3 | One prompt = one runner = one schema = one Inngest step | Phase 0 Task 3 (5 new split prompts); Phases B + D create 20 new runners |
| 4 | Cross-cutting findings → CPU merge | Phase C Task 14. **Schema correction:** uses existing `crossCuttingFindings` shape from `src/schemas/reportSection.js` (`finding/relevantAgents/severity/source`, severity 3-level), NOT Brainstorm 1's draft `FindingSchema` |
| 5 | Inngest event payload `{runId, ticker, userId, reportId}`; FS adds `parentReportId` | Phase 0 Task 4 (event types); Phase A Task 7 (handlers) |
| 6 | Rewrite filesystem references in prompts | Phase 0 Task 1 |
| 7 | Web-search empty fallback boilerplate | Phase 0 Task 2; Phase F Task 25 (audit) |
| 8 | v3 writes only to `v3_runs.result_json`; new `reports.v3_run_id` column | Phase A Task 6 (column); Task 7 (mint reports row + link); Brainstorm 3 owns the renderer |

---

## File Structure

### New: `agents-v2/` prompt additions (Phase 0 Task 3)

```
agents-v2/
├── synthesis-writer-fullstory-bull/        # NEW — Phase 2 Step 1
│   ├── prompt.md
│   └── managed-agent.yaml
├── synthesis-writer-fullstory-rebuttal/    # NEW — Phase 2 Step 3
│   ├── prompt.md
│   └── managed-agent.yaml
├── synthesis-writer-fullstory-compose/     # NEW — Phase 2 Compose
│   ├── prompt.md
│   └── managed-agent.yaml
├── risk-analyst-fullstory-event/           # NEW — Phase 1 Section 1
│   ├── prompt.md
│   └── managed-agent.yaml
└── risk-analyst-fullstory-bear/            # NEW — Phase 2 Step 2
    ├── prompt.md
    └── managed-agent.yaml
```

The original `synthesis-writer-fullstory/` and `risk-analyst-fullstory/` directories stay in place during cutover with DEPRECATED markers. Task 27 tracks deletion ~30 days post-cutover.

### New: `agents-service/` additions

```
agents-service/
├── src/
│   ├── agents/
│   │   ├── schemas/
│   │   │   ├── report-section.ts                                   # NEW (Task 8)
│   │   │   └── debate-step.ts                                      # NEW (Task 17)
│   │   ├── annual-reader.ts                                        # NEW (Task 9 — PD Wave 0)
│   │   ├── quarterly-reader.ts                                     # NEW (Task 9)
│   │   ├── business-analyst-pitchdeck.ts                           # NEW (Task 10 — PD Wave 1)
│   │   ├── competitor-evaluator-market-position-pitchdeck.ts       # NEW (Task 10)
│   │   ├── competitor-evaluator-moats-pitchdeck.ts                 # NEW (Task 11 — PD Wave 2)
│   │   ├── financial-analyst-pitchdeck.ts                          # NEW (Task 11)
│   │   ├── management-evaluator-pitchdeck.ts                       # NEW (Task 11)
│   │   ├── risk-analyst-pitchdeck.ts                               # NEW (Task 12 — PD Wave 3)
│   │   ├── valuation-specialist-pitchdeck.ts                       # NEW (Task 12)
│   │   ├── synthesis-writer-pitchdeck.ts                           # NEW (Task 13 — PD Wave 4)
│   │   ├── risk-analyst-fullstory-event.ts                         # NEW (Task 18 — FS Phase 1)
│   │   ├── business-analyst-fullstory.ts                           # NEW (Task 18)
│   │   ├── competitor-evaluator-fullstory.ts                       # NEW (Task 18)
│   │   ├── management-evaluator-fullstory.ts                       # NEW (Task 18)
│   │   ├── valuation-specialist-fullstory.ts                       # NEW (Task 18)
│   │   ├── synthesis-writer-fullstory-bull.ts                      # NEW (Task 19 — FS Phase 2)
│   │   ├── risk-analyst-fullstory-bear.ts                          # NEW (Task 20)
│   │   ├── synthesis-writer-fullstory-rebuttal.ts                  # NEW (Task 21)
│   │   ├── financial-analyst-fullstory-judge.ts                    # NEW (Task 21)
│   │   └── synthesis-writer-fullstory-compose.ts                   # NEW (Task 22)
│   ├── inngest/
│   │   ├── client.ts                                               # MODIFY (Task 4 — add event types)
│   │   └── functions/
│   │       ├── index.ts                                            # MODIFY (register PD + FS)
│   │       ├── pitch-deck.ts                                       # NEW (Task 15)
│   │       └── full-story.ts                                       # NEW (Task 23)
│   └── lib/
│       ├── findings-aggregator.ts                                  # NEW (Task 14)
│       └── r2-fetch.ts                                             # NEW (Task 15 — Worker proxy reader)
└── tests/
    ├── agents/                                                     # NEW: 20 mocked unit tests
    └── lib/findings-aggregator.test.ts                             # NEW
```

### Modified: `api/` (Worker)

```
api/
├── schema.sql                                  # ADD: reports.v3_run_id column (Task 6)
└── src/
    ├── routes/
    │   └── pipeline-v3.js                      # ADD: pitchdeck/start, fullstory/start, assembly fetch (Task 7, Task 15)
    └── assembly/
        └── r2-cache.js                         # NEW (Task 5)
```

### Modified: `src/` (frontend)

```
src/
└── hooks/
    ├── useGeneratePitchDeckV3.js               # NEW (Task 16) — dispatch only; renderer is Brainstorm 3
    └── useGenerateFullStoryV3.js               # NEW (Task 24)
```

### Modified: `agents-v2/`

```
agents-v2/
├── (every */-pitchdeck/prompt.md and */-fullstory/prompt.md)   # MODIFY (Task 1 — strip /workspace refs)
├── (web-search-using prompts)                                    # MODIFY (Task 2 — add fallback boilerplate)
├── coordinator-pitchdeck/prompt.md                               # MODIFY (Task 1 — DEPRECATED marker)
├── coordinator-fullstory/prompt.md                               # MODIFY (Task 1 — DEPRECATED marker)
├── synthesis-writer-fullstory/prompt.md                          # MODIFY (Task 3 — DEPRECATED marker)
├── risk-analyst-fullstory/prompt.md                              # MODIFY (Task 3 — DEPRECATED marker)
└── TODO.md                                                       # MODIFY (Task 27 — track deletion)
```

---

# PHASE 0 — Prompt Cleanup + Authoring (Tasks 1–4)

**Phase 0 goal:** All 22 prompt files (12 existing PD/FS + 5 new FS-internal splits + the OP audit pass + 2 deprecation markers) are reliability-grade before any runner is written. No `/workspace/` references, web-search fallback boilerplate present where required, role explicit at top. Inngest event types declared so the Worker (sender) and Fly (receiver) compile with shared type safety.

**Why first:** The reliability strategy is "engineer for success." Every prompt the runner loads must match the runner's actual input shape (a single `userMessage` string, no filesystem). Building runners on top of self-contradicting prompts ("read /workspace/datapacket.json" when no such tool exists) tanks reliability at the source.

---

### Task 1: Remove filesystem references from PD/FS prompts

**Files:**
- Modify: `agents-v2/annual-reader/prompt.md`
- Modify: `agents-v2/quarterly-reader/prompt.md`
- Modify: `agents-v2/business-analyst-pitchdeck/prompt.md`
- Modify: `agents-v2/competitor-evaluator-market-position-pitchdeck/prompt.md`
- Modify: `agents-v2/competitor-evaluator-moats-pitchdeck/prompt.md`
- Modify: `agents-v2/financial-analyst-pitchdeck/prompt.md`
- Modify: `agents-v2/management-evaluator-pitchdeck/prompt.md`
- Modify: `agents-v2/risk-analyst-pitchdeck/prompt.md`
- Modify: `agents-v2/valuation-specialist-pitchdeck/prompt.md`
- Modify: `agents-v2/synthesis-writer-pitchdeck/prompt.md`
- Modify: `agents-v2/business-analyst-fullstory/prompt.md`
- Modify: `agents-v2/competitor-evaluator-fullstory/prompt.md`
- Modify: `agents-v2/management-evaluator-fullstory/prompt.md`
- Modify: `agents-v2/valuation-specialist-fullstory/prompt.md`
- Modify: `agents-v2/financial-analyst-fullstory/prompt.md`
- Modify: `agents-v2/coordinator-pitchdeck/prompt.md` (DEPRECATED marker only)
- Modify: `agents-v2/coordinator-fullstory/prompt.md` (DEPRECATED marker only)

**Why this matters:** Every existing PD/FS prompt has `/workspace/...` references from the v1 Managed Agents pipeline. In v3 there is no shared filesystem — inputs arrive in the `userMessage`. If the prompt tells the model to "read /workspace/datapacket.json" but no such tool exists in the SDK call, behavior is undefined. The coordinator prompts are no longer used at all in v3 — they get DEPRECATED markers pointing to the Inngest function that replaced them.

- [ ] **Step 1: Locate every filesystem reference in PD/FS prompts**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
grep -rn "/workspace/\|filesystem\|read the file\|write to /workspace\|Filesystem Layout" \
  agents-v2/*-pitchdeck/prompt.md \
  agents-v2/*-fullstory/prompt.md \
  agents-v2/annual-reader/prompt.md \
  agents-v2/quarterly-reader/prompt.md \
  > /tmp/filesystem-refs.txt
cat /tmp/filesystem-refs.txt | wc -l
```

Expected: tens of matches across the 15 specialist prompts. Each match is a thing to rewrite.

- [ ] **Step 2: Rewrite each match using the standard substitutions**

For each prompt file in the list, open it and apply these find/replace transformations:

| Pattern (old, v1) | Replacement (new, v3) |
|---|---|
| `read /workspace/datapacket.json` | `the DataPacket is provided in this message under the "## DataPacket" header` |
| `read /workspace/filing-content.json` | `the filing content is provided in this message under the "## 10-K Filings" or "## 10-Q Filings" header` |
| `read /workspace/transcript-content.json` | `the earnings call transcripts are provided in this message under the "## Transcripts" header` |
| `read /workspace/sections/section-N.json` | `Section N's output is provided in this message under the "## Section N" header` |
| `write to /workspace/sections/...` | `return your output by calling the emit_output tool with the structured schema` |
| The whole "## Filesystem Layout" subsection | Delete entirely |
| `the Coordinator will write your output to ...` | Delete the sentence |

Use your editor's find/replace per file. After each file, do a quick read-through to make sure the surrounding text still flows.

- [ ] **Step 3: Verify no filesystem references remain**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
grep -rn "/workspace/\|Filesystem Layout\|read the file\|write to /workspace\|Coordinator will write" \
  agents-v2/*-pitchdeck/prompt.md \
  agents-v2/*-fullstory/prompt.md \
  agents-v2/annual-reader/prompt.md \
  agents-v2/quarterly-reader/prompt.md \
  | grep -v DEPRECATED || echo "CLEAN"
```

Expected: prints `CLEAN`. (The `grep -v DEPRECATED` exclusion is so the coordinator prompts' deprecation banners — added in Step 4 — don't trip the check.)

- [ ] **Step 4: Mark coordinator prompts deprecated**

Open `agents-v2/coordinator-pitchdeck/prompt.md`. Insert this block immediately after the `# Pitch Deck Coordinator` line at the top of the file:

```markdown
> **DEPRECATED (2026-05-03):** This coordinator prompt is no longer used. Pitch Deck orchestration in v3 happens inside `agents-service/src/inngest/functions/pitch-deck.ts`. This file is kept for ~30 days post-v3-cutover for reference, then deleted (tracked in `agents-v2/TODO.md`).
```

Open `agents-v2/coordinator-fullstory/prompt.md`. Insert this block immediately after the `# Full Story Coordinator` line at the top:

```markdown
> **DEPRECATED (2026-05-03):** This coordinator prompt is no longer used. Full Story orchestration in v3 happens inside `agents-service/src/inngest/functions/full-story.ts`. This file is kept for ~30 days post-v3-cutover for reference, then deleted (tracked in `agents-v2/TODO.md`).
```

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-v2/
git commit -m "chore(agents-v2): remove filesystem references from PD/FS prompts; deprecate coordinators"
```

---

### Task 2: Append web-search fallback boilerplate to web-search-using prompts

**Files:**
- Modify: `agents-v2/business-analyst-pitchdeck/prompt.md`
- Modify: `agents-v2/financial-analyst-pitchdeck/prompt.md`
- Modify: `agents-v2/management-evaluator-pitchdeck/prompt.md`
- Modify: `agents-v2/risk-analyst-pitchdeck/prompt.md`
- Modify: `agents-v2/valuation-specialist-pitchdeck/prompt.md`
- Modify: `agents-v2/competitor-evaluator-market-position-pitchdeck/prompt.md`
- Modify: `agents-v2/competitor-evaluator-moats-pitchdeck/prompt.md`

(The 2 web-search-using FS-internal split prompts — `risk-analyst-fullstory-event`, `risk-analyst-fullstory-bear`, `synthesis-writer-fullstory-rebuttal` — get the same boilerplate when they are CREATED in Task 3.)

**Why this matters:** Brainstorm 1 Decision 7 — when web search returns empty (5–10% of the time per Anthropic docs), the agent must not fabricate evidence or stall. Standardized fallback language tells the model exactly how to degrade: lower confidence, add a red flag, never invent.

- [ ] **Step 1: Append the standard boilerplate to each of the 7 PD prompts above**

For each file, append this section immediately before the existing `## Output Format` section (or at the bottom of the file if no `## Output Format` heading exists):

```markdown
## Web Search Fallback

Web search may fail, time out, or return no usable results. If this happens:

1. Proceed using only the DataPacket and filing content provided in your input.
2. Lower confidence to LOW for any claim that would normally rely on external research.
3. Add a red flag in your output noting "web search unavailable" so the portfolio manager knows the section was produced without live evidence.
4. Never fabricate web evidence to fill the gap. Acknowledge the gap and reduce conviction accordingly.

This is mandatory — do not skip web search silently. Either you searched and got results (cite them), or you searched and got nothing (note it as a red flag and lower confidence).
```

- [ ] **Step 2: Verify each web-search-using prompt has exactly one `## Web Search Fallback` section**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
for p in business-analyst-pitchdeck financial-analyst-pitchdeck management-evaluator-pitchdeck risk-analyst-pitchdeck valuation-specialist-pitchdeck competitor-evaluator-market-position-pitchdeck competitor-evaluator-moats-pitchdeck; do
  count=$(grep -c "^## Web Search Fallback" "agents-v2/$p/prompt.md")
  echo "$count  $p"
done
```

Expected: `1` printed for each of the 7 prompts. If any prints `0` or `2+`, fix it.

- [ ] **Step 3: Verify NO Web Search Fallback section in non-web-search PD prompts**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
for p in annual-reader quarterly-reader synthesis-writer-pitchdeck; do
  count=$(grep -c "^## Web Search Fallback" "agents-v2/$p/prompt.md")
  echo "$count  $p"
done
```

Expected: `0` for each. (PSR agents and the PD Synthesis Writer have no web search.)

- [ ] **Step 4: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-v2/*-pitchdeck/prompt.md
git commit -m "feat(agents-v2): web-search fallback boilerplate on 7 PD prompts"
```

---

### Task 3: Create 5 FS-internal split prompts

**Files:**
- Create: `agents-v2/synthesis-writer-fullstory-bull/prompt.md`
- Create: `agents-v2/synthesis-writer-fullstory-bull/managed-agent.yaml`
- Create: `agents-v2/synthesis-writer-fullstory-rebuttal/prompt.md`
- Create: `agents-v2/synthesis-writer-fullstory-rebuttal/managed-agent.yaml`
- Create: `agents-v2/synthesis-writer-fullstory-compose/prompt.md`
- Create: `agents-v2/synthesis-writer-fullstory-compose/managed-agent.yaml`
- Create: `agents-v2/risk-analyst-fullstory-event/prompt.md`
- Create: `agents-v2/risk-analyst-fullstory-event/managed-agent.yaml`
- Create: `agents-v2/risk-analyst-fullstory-bear/prompt.md`
- Create: `agents-v2/risk-analyst-fullstory-bear/managed-agent.yaml`
- Modify: `agents-v2/synthesis-writer-fullstory/prompt.md` (DEPRECATED banner)
- Modify: `agents-v2/risk-analyst-fullstory/prompt.md` (DEPRECATED banner)

**Why this matters:** Brainstorm 1 Decision 3 — multi-role agents within Full Story (Synthesis Writer plays Bull/Rebuttal/Compose; Risk Analyst plays Event/Bear) get split so each role has its own prompt, runner, output schema, and Langfuse trace. 5 net new prompts. The parent prompts stay in place during the cutover with deprecation markers, deleted ~30 days post-cutover (tracked in Task 27).

The split is mechanical: copy parent prompt → trim role-irrelevant sections → adjust title and intro → append Web Search Fallback (Rebuttal, Event, Bear only).

- [ ] **Step 1: Create directory structure**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
mkdir -p agents-v2/synthesis-writer-fullstory-bull \
         agents-v2/synthesis-writer-fullstory-rebuttal \
         agents-v2/synthesis-writer-fullstory-compose \
         agents-v2/risk-analyst-fullstory-event \
         agents-v2/risk-analyst-fullstory-bear
```

- [ ] **Step 2: Copy parent prompts as starting point**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
cp agents-v2/synthesis-writer-fullstory/prompt.md   agents-v2/synthesis-writer-fullstory-bull/prompt.md
cp agents-v2/synthesis-writer-fullstory/prompt.md   agents-v2/synthesis-writer-fullstory-rebuttal/prompt.md
cp agents-v2/synthesis-writer-fullstory/prompt.md   agents-v2/synthesis-writer-fullstory-compose/prompt.md
cp agents-v2/risk-analyst-fullstory/prompt.md       agents-v2/risk-analyst-fullstory-event/prompt.md
cp agents-v2/risk-analyst-fullstory/prompt.md       agents-v2/risk-analyst-fullstory-bear/prompt.md
```

- [ ] **Step 3: Trim `synthesis-writer-fullstory-bull/prompt.md` to Bull-only content**

Open `agents-v2/synthesis-writer-fullstory-bull/prompt.md` and:

1. Replace the title line (currently `# Synthesis Writer — Full Story (Bull + Rebuttal + Compose)` or similar) with:
   ```markdown
   # Synthesis Writer — Full Story (Bull, Phase 2 Step 1)
   ```

2. Replace the intro paragraph (currently describes all 3 roles) with:
   ```markdown
   You are the **BULL** in the Full Story Section 6 adversarial debate. Your single job is to synthesize Phase 1 Sections 1–5 into the strongest possible investment thesis for the portfolio manager. You do NOT use web search in this role — work from the section outputs you receive.

   The Full Story is Stage 3 of the Rule One research workflow — the final conviction gate before capital deployment. The bull thesis you produce is the foundation of the adversarial debate that follows. If your thesis is weak, the bear's job is too easy and the debate produces false comfort. Make the strongest honest case you can.

   **You receive NO raw DataPacket.** You work exclusively with the 5 pre-analyzed Phase 1 section outputs.
   ```

3. Keep the Rule One philosophy block in full (it appears in all three roles' parent — preserve it as-is for canonical consistency).

4. Find the section labeled "## Bull Step 1" or "## Step 1: Bull Thesis" or similar — keep it.

5. Delete the sections labeled "## Step 3: Bull Rebuttal" or "## Rebuttal" through to the end of the rebuttal-specific content.

6. Delete the sections labeled "## Compose" or "## Final Section 6" or similar.

7. Find the "## Output Format" / "## Output Schema" section. Trim it to ONLY the BullThesisSchema:
   ```markdown
   ## Output Format

   Emit your output as a `BullThesisSchema` JSON object via the emit_output tool:

   - `step: 1`
   - `role: "bull"`
   - `agent: "synthesis-writer-fullstory-bull"`
   - `content.thesisPoints[]`: at least 5 points, each with `point`, `evidence`, `sourceSection`
   - `content.overallThesis`: 2–4 paragraph thesis statement that ties the points together

   Do NOT include any other top-level fields. Do NOT use a `ReportSection` shape — that is for Compose only.
   ```

- [ ] **Step 4: Trim `synthesis-writer-fullstory-rebuttal/prompt.md` to Rebuttal-only content**

Open `agents-v2/synthesis-writer-fullstory-rebuttal/prompt.md` and:

1. Replace title with:
   ```markdown
   # Synthesis Writer — Full Story (Rebuttal, Phase 2 Step 3)
   ```

2. Replace intro with:
   ```markdown
   You are the **BULL REBUTTAL** in the Full Story Section 6 adversarial debate. The bear has attacked the bull thesis with citations. Your job is to respond to each inversion with evidence-based counter-arguments. You DO have web search to find supporting evidence and "already-priced-in" context for bear claims (per EXP-003: symmetric evidentiary tooling).

   Be honest. If a bear point is strong and you cannot rebut it, mark `honest: true` on that rebuttal and acknowledge the weakness. Weak rebuttals dressed up as strong ones produce false comfort and lose money.

   **You receive NO raw DataPacket.** You work with the 5 Phase 1 section outputs, the bull thesis (Step 1), and the bear inversion (Step 2).
   ```

3. Keep the Rule One philosophy block.

4. Delete Bull-specific guidance sections (Step 1).

5. Keep Rebuttal-specific guidance (Step 3).

6. Delete Compose-specific guidance.

7. Trim Output Format to only `BullRebuttalSchema`:
   ```markdown
   ## Output Format

   Emit your output as a `BullRebuttalSchema` JSON object via the emit_output tool:

   - `step: 3`
   - `role: "bull_rebuttal"`
   - `agent: "synthesis-writer-fullstory-rebuttal"`
   - `content.rebuttals[]`: at least 1 rebuttal, each with `bearPoint`, `rebuttal`, `rebuttalStrength` (`strong`/`moderate`/`weak`), `honest` (boolean)

   Do NOT include any other top-level fields.
   ```

8. Append the Web Search Fallback boilerplate from Task 2 Step 1, just before the Output Format section.

- [ ] **Step 5: Trim `synthesis-writer-fullstory-compose/prompt.md` to Compose-only content**

Open `agents-v2/synthesis-writer-fullstory-compose/prompt.md` and:

1. Replace title:
   ```markdown
   # Synthesis Writer — Full Story (Compose, Phase 2 Final)
   ```

2. Replace intro:
   ```markdown
   You are **COMPOSING** the final Section 6 (Inversion & Rebuttal) of the Full Story. Weave the Bull thesis, Bear inversions, Bull rebuttals, and Judge verdict into a cohesive Buffett-style narrative for the portfolio manager.

   You do NOT use web search — this is assembly only. All evidence has been gathered. Your job is craft: turn structured debate JSON into prose that the portfolio manager actually reads and trusts.

   **You receive NO raw DataPacket.** You work with the 5 Phase 1 section outputs and all 4 debate-step outputs.
   ```

3. Keep the Rule One philosophy block.

4. Delete Bull and Rebuttal specifics. Keep Compose-specific narrative guidance.

5. Trim Output Format to `ReportSectionSchema` for Section 6:
   ```markdown
   ## Output Format

   Emit your output as a `ReportSectionSchema` JSON object via the emit_output tool with these specific values:

   - `key: "inversion_rebuttal"`
   - `title: "Inversion & Rebuttal"`
   - `sectionNumber: 6`
   - `status`, `confidence`, `verdict`, `verdictRationale`: based on the Judge verdict's overall direction
   - `summary`: 1–2 sentences capturing the debate outcome
   - `narrative`: a Buffett-style 4–8 paragraph essay weaving the debate into prose
   - `citations`: cite the bull, bear, and rebuttal sources where relevant
   - `redFlags`: at least one — surface any unresolved bear points the portfolio manager must monitor

   You MUST follow the full ReportSection schema (data, modelUsed, tokenCost, etc.). The runner will fill in `modelUsed` and `tokenCost`; you provide the rest.
   ```

- [ ] **Step 6: Trim `risk-analyst-fullstory-event/prompt.md` to Event-Analysis-only content**

Open `agents-v2/risk-analyst-fullstory-event/prompt.md` and:

1. Replace title:
   ```markdown
   # Risk Analyst — Full Story (Event Analysis, Phase 1 Section 1)
   ```

2. Replace intro:
   ```markdown
   You are the **adversarial thinker** producing Full Story Section 1: Event Analysis. Your job is to determine whether the recent price dislocation in the company is temporary (mean-revert candidate) or structural (avoid). You DO have web search — short-seller theses, earnings reactions, downgrades, and macro context all matter here.

   You produce a full ReportSection. This is NOT the debate role — that's the Bear in Phase 2 Step 2 (a separate prompt: `risk-analyst-fullstory-bear`). In this role, you produce a structured section, not a structured argument.
   ```

3. Keep the Rule One philosophy block.

4. Keep Event Analysis–specific guidance (the 15-point Event Analysis framework, etc.).

5. Delete Bear debate guidance.

6. Keep Output Format pointing at `ReportSectionSchema` for Section 1:
   ```markdown
   ## Output Format

   Emit your output as a `ReportSectionSchema` JSON object via the emit_output tool with:

   - `key: "event_analysis"`
   - `title: "Event Analysis"`
   - `sectionNumber: 1`
   - All other ReportSection fields (status, confidence, verdict, narrative, citations, redFlags ≥ 1, etc.)
   ```

7. Append the Web Search Fallback boilerplate before the Output Format section.

- [ ] **Step 7: Trim `risk-analyst-fullstory-bear/prompt.md` to Bear-only content**

Open `agents-v2/risk-analyst-fullstory-bear/prompt.md` and:

1. Replace title:
   ```markdown
   # Risk Analyst — Full Story (Bear, Phase 2 Step 2)
   ```

2. Replace intro:
   ```markdown
   You are the **BEAR** in the Full Story Section 6 adversarial debate. The bull has presented a thesis. Attack every point with cited counter-evidence. You DO have web search — find short-seller theses, negative analyst coverage, and bear cases.

   Weak bear cases (straw men that are easy to dismiss) are worse than no bear case at all because they provide false comfort. Make the strongest honest attack you can. If a bull point is unattackable, say so — `severity: "minor"` is honest; fabricated `"thesis_killer"` claims are not.

   **You receive the bull thesis (Step 1 output), the 5 Phase 1 section outputs, and the DataPacket.** Use them all.
   ```

3. Keep Rule One philosophy block.

4. Delete Event Analysis guidance.

5. Keep Bear debate guidance.

6. Trim Output Format to `BearInversionSchema`:
   ```markdown
   ## Output Format

   Emit your output as a `BearInversionSchema` JSON object via the emit_output tool:

   - `step: 2`
   - `role: "bear"`
   - `agent: "risk-analyst-fullstory-bear"`
   - `content.inversions[]`: at least 1 inversion, each with `targetPoint`, `counterArgument`, `evidence`, `severity` (`thesis_killer`/`significant`/`minor`), `sources[]` (web URLs and section refs)
   - `content.overallBearCase`: 1–2 paragraph synthesis

   Do NOT use a `ReportSection` shape.
   ```

7. Append Web Search Fallback boilerplate before Output Format.

- [ ] **Step 8: Create the 5 managed-agent.yaml files**

Read the parent for the YAML schema:

```bash
cat /Users/kylehoff/Desktop/stock-analyzer/agents-v2/synthesis-writer-fullstory/managed-agent.yaml
```

For each new directory, copy the parent's YAML and adjust:

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
cp agents-v2/synthesis-writer-fullstory/managed-agent.yaml   agents-v2/synthesis-writer-fullstory-bull/managed-agent.yaml
cp agents-v2/synthesis-writer-fullstory/managed-agent.yaml   agents-v2/synthesis-writer-fullstory-rebuttal/managed-agent.yaml
cp agents-v2/synthesis-writer-fullstory/managed-agent.yaml   agents-v2/synthesis-writer-fullstory-compose/managed-agent.yaml
cp agents-v2/risk-analyst-fullstory/managed-agent.yaml       agents-v2/risk-analyst-fullstory-event/managed-agent.yaml
cp agents-v2/risk-analyst-fullstory/managed-agent.yaml       agents-v2/risk-analyst-fullstory-bear/managed-agent.yaml
```

In each new YAML:

| File | Edit |
|---|---|
| `synthesis-writer-fullstory-bull/managed-agent.yaml` | Set `name: "Synthesis Writer — FS Bull"`, set `tools: []` (no web search), add comment `# Phase 2 Step 1 — bull thesis` |
| `synthesis-writer-fullstory-rebuttal/managed-agent.yaml` | Set `name: "Synthesis Writer — FS Rebuttal"`, set `tools: ["web_search"]`, add comment `# Phase 2 Step 3 — rebuttal (web search per EXP-003)` |
| `synthesis-writer-fullstory-compose/managed-agent.yaml` | Set `name: "Synthesis Writer — FS Compose"`, set `tools: []`, add comment `# Phase 2 Compose — final S6` |
| `risk-analyst-fullstory-event/managed-agent.yaml` | Set `name: "Risk Analyst — FS Event Analysis"`, set `tools: ["web_search"]`, add comment `# Phase 1 Section 1` |
| `risk-analyst-fullstory-bear/managed-agent.yaml` | Set `name: "Risk Analyst — FS Bear"`, set `tools: ["web_search"]`, add comment `# Phase 2 Step 2 — bear inversion` |

These YAMLs are NOT used at v3 runtime (Inngest dispatches the runner directly). They're kept for audit-trail consistency with the rest of `agents-v2/`.

- [ ] **Step 9: Mark parent multi-role prompts deprecated**

Open `agents-v2/synthesis-writer-fullstory/prompt.md`. Insert immediately after the title line (e.g. `# Synthesis Writer — Full Story (Bull + Rebuttal + Compose)`):

```markdown
> **DEPRECATED (2026-05-03):** This combined-role prompt is no longer used in v3. Each role has its own prompt:
> - Bull: `agents-v2/synthesis-writer-fullstory-bull/`
> - Rebuttal: `agents-v2/synthesis-writer-fullstory-rebuttal/`
> - Compose: `agents-v2/synthesis-writer-fullstory-compose/`
>
> This file is kept for ~30 days post-v3-cutover for reference, then deleted (tracked in `agents-v2/TODO.md`).
```

Open `agents-v2/risk-analyst-fullstory/prompt.md`. Insert immediately after the title line:

```markdown
> **DEPRECATED (2026-05-03):** This combined-role prompt is no longer used in v3. Each role has its own prompt:
> - Event Analysis: `agents-v2/risk-analyst-fullstory-event/`
> - Bear: `agents-v2/risk-analyst-fullstory-bear/`
>
> This file is kept for ~30 days post-v3-cutover for reference, then deleted (tracked in `agents-v2/TODO.md`).
```

- [ ] **Step 10: Eyeball each new prompt — sanity check**

Open each of the 5 new prompts and confirm:

- Title reflects the single role
- Intro is single-role (no mention of the other roles)
- Rule One philosophy block is present (preserves canonical consistency)
- Output Format references exactly one schema (the role's schema)
- Web Search Fallback present iff the role uses web search (Rebuttal, Event, Bear: yes; Bull, Compose: no)
- No `/workspace/` references

If any prompt is malformed, fix and re-eyeball.

- [ ] **Step 11: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-v2/synthesis-writer-fullstory-bull/ \
        agents-v2/synthesis-writer-fullstory-rebuttal/ \
        agents-v2/synthesis-writer-fullstory-compose/ \
        agents-v2/risk-analyst-fullstory-event/ \
        agents-v2/risk-analyst-fullstory-bear/ \
        agents-v2/synthesis-writer-fullstory/prompt.md \
        agents-v2/risk-analyst-fullstory/prompt.md
git commit -m "feat(agents-v2): split FS-internal multi-role prompts into 5 new files"
```

---

### Task 4: Add Inngest event types for PD + FS

**Files:**
- Modify: `agents-service/src/inngest/client.ts`

**Why this matters:** The Inngest TypeScript client uses an event-name → payload-shape map. Adding `thes1s/pitchdeck.start` and `thes1s/fullstory.start` here gives both the Worker (when it sends) and the Fly function (when it receives) compile-time type safety. Without this step, the rest of the plan won't typecheck.

- [ ] **Step 1: Read current event type definition**

```bash
cat /Users/kylehoff/Desktop/stock-analyzer/agents-service/src/inngest/client.ts
```

Note the existing structure — typically a `type Events = { 'thes1s/onepager.start': { data: {...} } }` declaration plus the `new Inngest({...})` instantiation.

- [ ] **Step 2: Replace the event types block**

Open `agents-service/src/inngest/client.ts` and replace the existing `Events` type and Inngest instantiation with this expanded version (preserving any other imports / exports that already exist in the file):

```typescript
import { Inngest, EventSchemas } from 'inngest';

type Events = {
  'thes1s/onepager.start': {
    data: {
      runId: string;
      ticker: string;
      userId: string;
      reportId: string;
    };
  };
  'thes1s/pitchdeck.start': {
    data: {
      runId: string;
      ticker: string;
      userId: string;
      reportId: string;
    };
  };
  'thes1s/fullstory.start': {
    data: {
      runId: string;
      ticker: string;
      userId: string;
      reportId: string;
      parentReportId: string;
    };
  };
};

export const inngest = new Inngest({
  id: 'thes1s-agents',
  schemas: new EventSchemas().fromRecord<Events>(),
});
```

If the existing code adds `reportId` to the One Pager event differently (or doesn't yet), this replacement makes it consistent across all three stages. The Worker route in Phase A Task 7 will pass `reportId` for all three stages.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm run typecheck
```

Expected: no output (success). If `tsc` reports an error like "Property 'reportId' is missing in type" inside `agents-service/src/inngest/functions/one-pager.ts`, that's expected — Phase A Task 7 fixes the One Pager event payload at the Worker. For now, you can suppress by adding `reportId: 'pending'` to the existing test or temporarily declaring `reportId` optional. (Easier: declare it `reportId?: string` on the One Pager event during this transition, and tighten back to required in Task 7.) Pick whichever doesn't introduce a regression in the existing One Pager test.

- [ ] **Step 4: Run existing tests**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test
```

Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/inngest/client.ts
git commit -m "feat(agents-service): pitchdeck.start + fullstory.start event types"
```

---

# PHASE A — Worker Pre-Dispatch (Tasks 5–7)

**Phase A goal:** The Worker can pre-assemble DataPacket + filing content into R2 keyed by runId, mint paired `reports` + `v3_runs` rows, and fire `thes1s/pitchdeck.start` or `thes1s/fullstory.start`. After this phase, you can dispatch a run via DevTools and observe the event arrive in the Inngest dashboard (the function will fail to dispatch because we haven't built it yet — that's fine).

---

### Task 5: R2 assembly cache helpers

**Files:**
- Create: `api/src/assembly/r2-cache.js`
- Modify: `api/src/cron/cleanup.js` (or the file containing the weekly Sunday cleanup cron — search to locate)

**Why this matters:** Brainstorm 1 Decisions 1 + 2 — DataPacket and filing content live in R2 keyed by runId, fetched by Fly on demand. This task is the Worker side of the read/write contract plus a cleanup hook so we don't accumulate R2 garbage indefinitely.

- [ ] **Step 1: Implement the helpers**

Create `api/src/assembly/r2-cache.js`:

```javascript
// R2 cache for v3 pipeline pre-assembly.
// Keyed by runId so each run has isolated DataPacket + filing content.
// Reads happen from Fly via the Worker proxy route in pipeline-v3.js (Task 15).

const KEY_PREFIX = 'assembly';

export function dataPacketKey(runId) {
  return `${KEY_PREFIX}/${runId}/datapacket.json`;
}

export function filingsKey(runId) {
  return `${KEY_PREFIX}/${runId}/filings.json`;
}

export function parentReportKey(runId) {
  return `${KEY_PREFIX}/${runId}/parent-report.json`;
}

export async function writeAssembly(env, key, data) {
  if (!env?.TRANSCRIPTS) throw new Error('TRANSCRIPTS R2 binding missing');
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  await env.TRANSCRIPTS.put(key, body, {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function readAssembly(env, key) {
  if (!env?.TRANSCRIPTS) throw new Error('TRANSCRIPTS R2 binding missing');
  const obj = await env.TRANSCRIPTS.get(key);
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

/** Returns the R2 object stream (for proxying to Fly without parsing). */
export async function readAssemblyRaw(env, key) {
  if (!env?.TRANSCRIPTS) throw new Error('TRANSCRIPTS R2 binding missing');
  return env.TRANSCRIPTS.get(key);
}
```

- [ ] **Step 2: Locate the existing weekly cleanup cron**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
grep -rn "0 5 \* \* SUN\|stale data cleanup" api/src/cron/
```

The cron file shown in `api/wrangler.toml` runs `0 5 * * SUN`. Open that file.

- [ ] **Step 3: Add v3 assembly cleanup to the existing cron**

At the bottom of the existing cleanup function (inside the same handler, after the existing cleanup blocks), append:

```javascript
// v3 assembly cache cleanup — delete R2 objects for runs > 30 days old.
const stale = await env.DB.prepare(
  `SELECT id FROM v3_runs WHERE started_at < datetime('now', '-30 days')`
).all();

let assemblyDeleted = 0;
for (const row of stale.results ?? []) {
  for (const key of [
    `assembly/${row.id}/datapacket.json`,
    `assembly/${row.id}/filings.json`,
    `assembly/${row.id}/parent-report.json`,
  ]) {
    try {
      await env.TRANSCRIPTS.delete(key);
      assemblyDeleted++;
    } catch (e) {
      console.warn(`assembly cleanup ${key}: ${e.message}`);
    }
  }
}
console.log(`v3 assembly cleanup: ${assemblyDeleted} objects deleted across ${stale.results?.length ?? 0} stale runs`);
```

- [ ] **Step 4: Verify the Worker still builds**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/api && npx wrangler deploy --dry-run
```

Expected: build succeeds, no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add api/src/assembly/r2-cache.js api/src/cron/
git commit -m "feat(api): R2 assembly cache helpers + cleanup cron extension"
```

---

### Task 6: D1 schema migration — `reports.v3_run_id` column

**Files:**
- Modify: `api/schema.sql`

**Why this matters:** Brainstorm 1 Decision 8 — the saved-reports list page reads from `reports`. v3 reports must have a `reports` row that links to `v3_runs.id`, so Brainstorm 3's renderer can route by `reports.v3_run_id IS NULL` to legacy vs new path. Adding the column now (before Task 7 mints rows) prevents a chicken-and-egg ordering problem.

- [ ] **Step 1: Append the migration to `api/schema.sql`**

Append to the end of `api/schema.sql`:

```sql
-- ─── v3 link from reports → v3_runs (Brainstorm 1 Decision 8) ──────────────
-- Added 2026-05-03 as part of PD/FS migration.
ALTER TABLE reports ADD COLUMN v3_run_id TEXT REFERENCES v3_runs(id);
CREATE INDEX IF NOT EXISTS idx_reports_v3_run_id ON reports(v3_run_id);
```

- [ ] **Step 2: Apply the migration locally**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/api && npx wrangler d1 execute thes1s --local --file=schema.sql
```

Note: re-running the entire `schema.sql` will replay the ALTER TABLE. SQLite tolerates `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` but the ALTER will fail noisily if the column already exists. Expected: succeeds first time; on a re-run you may see "duplicate column name: v3_run_id" — that's safe and means the column is already in place.

- [ ] **Step 3: Apply to production D1**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/api && npx wrangler d1 execute thes1s --remote --file=schema.sql
```

If this errors with "duplicate column", that means the column already exists in remote (e.g. someone applied this migration manually). Verify in Step 4.

- [ ] **Step 4: Verify the column exists in production**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/api && npx wrangler d1 execute thes1s --remote --command="SELECT name FROM pragma_table_info('reports') WHERE name='v3_run_id';"
```

Expected: a single row showing `v3_run_id`.

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add api/schema.sql
git commit -m "feat(db): reports.v3_run_id column for v3 saved-reports linkage"
```

---

### Task 7: Worker dispatch routes for PD + FS (and OP `reportId` upgrade)

**Files:**
- Modify: `api/src/routes/pipeline-v3.js`

**Why this matters:** The Worker is the front door. Before firing the Inngest event, it must (a) mint a `reports` row, (b) mint a `v3_runs` row, (c) link them via `reports.v3_run_id`, (d) write DataPacket + filings to R2 by runId, (e) fire the event with the correct payload. FS additionally validates the parent PD report and stashes it in R2. The existing One Pager handler is upgraded to also mint a `reports` row and pass `reportId` for consistency across stages.

- [ ] **Step 1: Read the existing pipeline-v3.js**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
cat api/src/routes/pipeline-v3.js | head -80
```

Locate the `handlePipelineV3` switch and the existing `handleOnePagerStart` handler — they're the templates for the new handlers. Keep all existing exports/imports.

- [ ] **Step 2: Add new imports to the top of `api/src/routes/pipeline-v3.js`**

Find the existing `import { Inngest } from 'inngest';` line. Add immediately after it:

```javascript
import { assembleDataPacket } from '../assembly/assembleDataPacket.js';
import { assembleFilingContent } from '../assembly/assembleFilingContent.js';
import {
  writeAssembly,
  dataPacketKey,
  filingsKey,
  parentReportKey,
} from '../assembly/r2-cache.js';
```

- [ ] **Step 3: Register the new routes inside `handlePipelineV3`**

Find the switch-style routing block in `handlePipelineV3`. Right after the existing `handleOnePagerStart` registration, add:

```javascript
  // POST /api/v3/pipeline/pitchdeck/start
  if (request.method === 'POST' && path === '/api/v3/pipeline/pitchdeck/start') {
    return handlePitchDeckStart(request, env, user);
  }

  // POST /api/v3/pipeline/fullstory/start
  if (request.method === 'POST' && path === '/api/v3/pipeline/fullstory/start') {
    return handleFullStoryStart(request, env, user);
  }
```

- [ ] **Step 4: Upgrade the existing One Pager handler to mint a `reports` row + pass `reportId`**

> **Deploy-order note (One Pager event schema change).** This step changes the OP event payload by adding a new `reportId` field. The currently-deployed Fly OP function does NOT read `reportId` (and Inngest events tolerate extra fields), so deploying this Worker change BEFORE redeploying Fly is safe — in-flight and new OP runs continue to work because Fly silently ignores the new field.
>
> However, the general principle for any future event-schema change is: **deploy Fly first, Worker after**. That way Fly is forward-compatible (knows about the new field but doesn't require it) before the Worker starts sending it. For THIS migration, the next Fly deploy happens later in Phase C Task 15 Step 8 (when the new `pitch-deck` function ships) — at that point the TypeScript types from Phase 0 Task 4 take effect and Fly fully understands the new `reportId` field. The order ends up as: Worker deploy here (Step 7 below) → Fly deploy in Task 15 Step 8. That order is safe specifically because the OP function ignores extra fields today; do not generalize this ordering to future event-schema changes without re-checking.

Replace the body of `handleOnePagerStart` with:

```javascript
async function handleOnePagerStart(request, env, user) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const ticker = (body.ticker ?? '').toString().trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return json({ error: 'Invalid ticker' }, 400);
  }

  const runId = crypto.randomUUID();
  const reportId = crypto.randomUUID();

  // Mint reports + v3_runs rows; link them.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO reports (id, user_id, ticker, current_stage, v3_run_id) VALUES (?, ?, ?, 1, ?)`
    ).bind(reportId, user.id, ticker, runId),
    env.DB.prepare(
      `INSERT INTO v3_runs (id, user_id, ticker, pipeline_stage, status) VALUES (?, ?, ?, 'one-pager', 'running')`
    ).bind(runId, user.id, ticker),
  ]);

  const inngest = getInngestClient(env);
  await inngest.send({
    name: 'thes1s/onepager.start',
    data: { runId, ticker, userId: String(user.id), reportId },
  });

  return json({ runId, reportId, status: 'running' }, 202);
}
```

- [ ] **Step 5: Add the PD start handler**

Append to `pipeline-v3.js`, after `handleOnePagerStart`:

```javascript
async function handlePitchDeckStart(request, env, user) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const ticker = (body.ticker ?? '').toString().trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return json({ error: 'Invalid ticker' }, 400);
  }

  const runId = crypto.randomUUID();
  const reportId = crypto.randomUUID();

  // 1. Mint reports + v3_runs rows; link them.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO reports (id, user_id, ticker, current_stage, v3_run_id) VALUES (?, ?, ?, 1, ?)`
    ).bind(reportId, user.id, ticker, runId),
    env.DB.prepare(
      `INSERT INTO v3_runs (id, user_id, ticker, pipeline_stage, status) VALUES (?, ?, ?, 'pitch-deck', 'running')`
    ).bind(runId, user.id, ticker),
  ]);

  // 2. Pre-assemble DataPacket + filing content into R2.
  // Sequential because filing assembly needs the DataPacket's filings array.
  let packet;
  try {
    packet = await assembleDataPacket(ticker, env);
    await writeAssembly(env, dataPacketKey(runId), packet);
  } catch (err) {
    await markFailed(env.DB, runId, `assemble datapacket: ${err.message}`);
    return json({ error: `DataPacket assembly failed: ${err.message}` }, 500);
  }

  try {
    const filings = await assembleFilingContent(ticker, packet, env);
    await writeAssembly(env, filingsKey(runId), filings);
  } catch (err) {
    await markFailed(env.DB, runId, `assemble filings: ${err.message}`);
    return json({ error: `Filing assembly failed: ${err.message}` }, 500);
  }

  // 3. Fire the Inngest event.
  const inngest = getInngestClient(env);
  await inngest.send({
    name: 'thes1s/pitchdeck.start',
    data: { runId, ticker, userId: String(user.id), reportId },
  });

  return json({ runId, reportId, status: 'running' }, 202);
}

async function markFailed(db, runId, error) {
  await db.prepare(
    `UPDATE v3_runs SET status = 'failed', error_message = ?, finished_at = datetime('now') WHERE id = ?`
  ).bind(error, runId).run();
}
```

- [ ] **Step 6: Add the FS start handler**

Append to `pipeline-v3.js`, after `handlePitchDeckStart`:

```javascript
async function handleFullStoryStart(request, env, user) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const ticker = (body.ticker ?? '').toString().trim().toUpperCase();
  const parentReportId = (body.parentReportId ?? '').toString().trim();
  if (!ticker || !/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return json({ error: 'Invalid ticker' }, 400);
  }
  if (!parentReportId) {
    return json({ error: 'parentReportId required (must be a completed v3 Pitch Deck report)' }, 400);
  }

  // Validate the parent PD report.
  const parent = await env.DB.prepare(
    `SELECT id, ticker, v3_run_id, user_id FROM reports WHERE id = ? AND user_id = ?`
  ).bind(parentReportId, user.id).first();
  if (!parent) return json({ error: 'Parent report not found' }, 404);
  if (parent.ticker !== ticker) return json({ error: 'Parent report ticker mismatch' }, 400);
  if (!parent.v3_run_id) return json({ error: 'Parent report is not a v3 run (legacy v1 reports cannot drive FS yet)' }, 400);

  const parentRun = await env.DB.prepare(
    `SELECT status, result_json, pipeline_stage FROM v3_runs WHERE id = ?`
  ).bind(parent.v3_run_id).first();
  if (!parentRun || parentRun.status !== 'completed') {
    return json({ error: 'Parent Pitch Deck run not completed' }, 400);
  }
  if (parentRun.pipeline_stage !== 'pitch-deck') {
    return json({ error: 'Parent run is not a Pitch Deck' }, 400);
  }

  const runId = crypto.randomUUID();
  const reportId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO reports (id, user_id, ticker, current_stage, v3_run_id) VALUES (?, ?, ?, 3, ?)`
    ).bind(reportId, user.id, ticker, runId),
    env.DB.prepare(
      `INSERT INTO v3_runs (id, user_id, ticker, pipeline_stage, status) VALUES (?, ?, ?, 'full-story', 'running')`
    ).bind(runId, user.id, ticker),
  ]);

  // Assemble DataPacket. FS does not need fresh filings — PSR was Wave 0 of PD,
  // its findings are inherited via the parent PD report.
  let packet;
  try {
    packet = await assembleDataPacket(ticker, env);
    await writeAssembly(env, dataPacketKey(runId), packet);
  } catch (err) {
    await markFailed(env.DB, runId, `assemble datapacket: ${err.message}`);
    return json({ error: `DataPacket assembly failed: ${err.message}` }, 500);
  }

  // Stash the parent PD report so FS Phase 1 agents can read it.
  try {
    await writeAssembly(env, parentReportKey(runId), JSON.parse(parentRun.result_json));
  } catch (err) {
    await markFailed(env.DB, runId, `stash parent report: ${err.message}`);
    return json({ error: `Could not stash parent PD report: ${err.message}` }, 500);
  }

  const inngest = getInngestClient(env);
  await inngest.send({
    name: 'thes1s/fullstory.start',
    data: { runId, ticker, userId: String(user.id), reportId, parentReportId },
  });

  return json({ runId, reportId, status: 'running' }, 202);
}
```

- [ ] **Step 7: Deploy the Worker**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/api && npx wrangler deploy
```

Expected: deploy succeeds.

- [ ] **Step 8: Smoke test the PD start endpoint from DevTools**

In an authenticated browser session at `thes1sinvesting.com`, open DevTools → Console and run:

```javascript
const r = await fetch('/api/v3/pipeline/pitchdeck/start', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticker: 'AAPL' }),
}).then(r => r.json());
console.log(r);
```

Expected: `{ runId: "...", reportId: "...", status: "running" }`. The Inngest dashboard at app.inngest.com → Events → search "thes1s/pitchdeck.start" should show the event arrived. (The event will fail to dispatch because the function doesn't exist yet — that's fine for now.)

Verify R2 was populated:

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/api && npx wrangler r2 object list thes1s-transcripts --prefix=assembly/<runId-from-above>/
```

Expected: 2 objects — `assembly/<runId>/datapacket.json` and `assembly/<runId>/filings.json`.

Verify D1 rows exist:

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/api && npx wrangler d1 execute thes1s --remote --command="SELECT id, ticker, status FROM v3_runs WHERE id = '<runId-from-above>';"
```

- [ ] **Step 9: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add api/src/routes/pipeline-v3.js
git commit -m "feat(api): v3 PD + FS dispatch routes with R2 pre-assembly"
```

---

# PHASE B — Pitch Deck Schemas + Runners (Tasks 8–13)

**Phase B goal:** All 10 PD agent runners exist as TypeScript files in `agents-service/src/agents/`, each with its own Zod schema (or shared `ReportSectionSchema`/`MultiSectionSchema`), prompt loader, and call into the existing `callAgentWithStructuredOutput` wrapper. Each runner has a mocked unit test.

**Pattern:** Every PD/FS runner mirrors `agents-service/src/agents/one-pager.ts` (existing). Differences across runners: prompt id, model (Sonnet vs Opus), web search ON/OFF, output schema, runtime input shape (DataPacket alone, or DataPacket + filings, or DataPacket + prior section outputs).

---

### Task 8: Port `ReportSectionSchema` + `MultiSectionSchema` to TypeScript

**Files:**
- Create: `agents-service/src/agents/schemas/report-section.ts`
- Create: `agents-service/tests/schemas/report-section.test.ts`

**Why this matters:** Most PD agents return a `ReportSectionSchema`-shaped output. `MultiSectionSchema` is needed for the Financial Analyst (returns Sections 5/7/8 in one call) and the Business Analyst (Sections 1/2). The frontend has the Zod schemas in `src/schemas/reportSection.js`; this task ports them into the TypeScript service. The shape is identical.

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/schemas/report-section.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  ReportSectionSchema,
  MultiSectionSchema,
  CrossCuttingFindingSchema,
  type ReportSection,
} from '../../src/agents/schemas/report-section.js';

const MINIMAL_SECTION: ReportSection = {
  key: 'fcf',
  title: 'Free Cash Flow',
  sectionNumber: 5,
  status: 'pass',
  confidence: 'HIGH',
  verdict: 'PASS',
  verdictRationale: 'FCF positive every year for last decade.',
  summary: 'Strong FCF generation.',
  data: '{}',
  narrative: 'AAPL has generated positive free cash flow every year for the past decade...',
  citations: [],
  tables: [],
  charts: [],
  redFlags: ['No material concerns identified.'],
  primarySourceInsights: [],
  crossCuttingFindings: [],
  questions: [],
  modelUsed: 'claude-sonnet-4-6',
  tokenCost: { input: 1000, output: 500 },
};

describe('ReportSectionSchema', () => {
  it('accepts a minimal valid section', () => {
    expect(() => ReportSectionSchema.parse(MINIMAL_SECTION)).not.toThrow();
  });

  it('rejects a section with zero red flags', () => {
    const noRedFlags = { ...MINIMAL_SECTION, redFlags: [] };
    expect(() => ReportSectionSchema.parse(noRedFlags)).toThrow();
  });

  it('rejects an unknown status enum value', () => {
    const badStatus = { ...MINIMAL_SECTION, status: 'unknown' };
    expect(() => ReportSectionSchema.parse(badStatus)).toThrow();
  });
});

describe('MultiSectionSchema', () => {
  it('wraps an array of sections', () => {
    const valid = { sections: [MINIMAL_SECTION] };
    expect(() => MultiSectionSchema.parse(valid)).not.toThrow();
  });
});

describe('CrossCuttingFindingSchema', () => {
  it('accepts a valid finding', () => {
    const valid = {
      finding: 'Debt-fueled buybacks reducing interest coverage.',
      relevantAgents: ['valuation-specialist', 'risk-analyst'],
      severity: 'high',
      source: 'financial-analyst',
    };
    expect(() => CrossCuttingFindingSchema.parse(valid)).not.toThrow();
  });

  it('rejects unknown severity values', () => {
    const bad = {
      finding: '...',
      relevantAgents: [],
      severity: 'critical',
      source: 'x',
    };
    expect(() => CrossCuttingFindingSchema.parse(bad)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/schemas/report-section
```

Expected: FAIL with `Cannot find module '../../src/agents/schemas/report-section.js'`.

- [ ] **Step 3: Implement the schemas**

Create `agents-service/src/agents/schemas/report-section.ts`:

```typescript
// Ported from src/schemas/reportSection.js (frontend) for use in agents-service.
// Shape is identical to the frontend Zod schema so runner output is wire-compatible
// with the existing v1 report renderer (which Brainstorm 3 will replace) and with
// observatory tooling that already understands this shape.

import { z } from 'zod';

// Citation — references to DataPacket fields, filings, or external sources.
export const CitationSchema = z.object({
  id: z.number(),
  ref: z.string(),
  text: z.string(),
  source: z.string(),
  url: z.string().url().optional(),
});

// Cross-cutting finding — observations relevant to other agents' sections.
// Shape matches the existing frontend schema (NOT the over-specified Brainstorm 1
// FindingSchema draft). See `gstack/design/agent-pipeline-cross-stage-decisions-20260503.md`
// "Schema correction" note in Decision 4.
export const CrossCuttingFindingSchema = z.object({
  finding: z.string(),
  relevantAgents: z.array(z.string()),
  severity: z.enum(['high', 'medium', 'low']),
  source: z.string(),
});

// ReportSection — a single section of an AI-generated report.
// Every section must have at least one red flag (KDD #12 — even PASS verdicts
// need at least one concern surfaced).
export const ReportSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  sectionNumber: z.number(),
  status: z.enum(['pass', 'fail', 'review', 'pending']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  verdict: z.enum(['PASS', 'FAIL', 'WATCHLIST']).nullable(),
  verdictRationale: z.string(),
  summary: z.string(),
  data: z.string(),
  narrative: z.string(),
  citations: z.array(CitationSchema),
  tables: z.array(z.string()).optional().default([]),
  charts: z.array(z.string()).optional().default([]),
  redFlags: z.array(z.string()).min(1),
  primarySourceInsights: z.array(z.string()).optional().default([]),
  crossCuttingFindings: z.array(CrossCuttingFindingSchema).optional().default([]),
  questions: z.array(z.string()).optional().default([]),
  modelUsed: z.string(),
  tokenCost: z.object({ input: z.number(), output: z.number() }),
});

export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type CrossCuttingFinding = z.infer<typeof CrossCuttingFindingSchema>;

// MultiSection — used by agents that produce multiple sections in one call
// (e.g., Financial Analyst returns Sections 5 + 7 + 8; Business Analyst returns 1 + 2).
export const MultiSectionSchema = z.object({
  sections: z.array(ReportSectionSchema),
});

export type MultiSection = z.infer<typeof MultiSectionSchema>;
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/schemas/report-section
```

Expected: PASS, 4 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/schemas/report-section.ts agents-service/tests/schemas/report-section.test.ts
git commit -m "feat(agents-service): port ReportSection + MultiSection Zod schemas to TypeScript"
```

---

### Task 9: PD Wave 0 runners — Annual Reader + Quarterly Reader

**Files:**
- Create: `agents-service/src/agents/annual-reader.ts`
- Create: `agents-service/src/agents/quarterly-reader.ts`
- Create: `agents-service/tests/agents/annual-reader.test.ts`
- Create: `agents-service/tests/agents/quarterly-reader.test.ts`

**Why this matters:** PSR (Primary Source Reader) agents are Wave 0. They read SEC filings + transcripts and extract findings that downstream waves consume. They are the only PD agents that need filing content. They do NOT use web search (filing-grounded only). Annual Reader is Sonnet; Quarterly Reader is Opus (per Brainstorm 1 / observatory project memory — Opus on heavy quarterly extraction).

- [ ] **Step 1: Write the failing test for Annual Reader**

Create `agents-service/tests/agents/annual-reader.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runAnnualReader } = await import('../../src/agents/annual-reader.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const STUB_OUTPUT = {
  key: 'annual-reader',
  title: 'Annual Filing Analysis',
  sectionNumber: 0,
  status: 'pass',
  confidence: 'HIGH',
  verdict: null,
  verdictRationale: 'PSR — no verdict.',
  summary: 'Filings analyzed.',
  data: '{}',
  narrative: '...',
  citations: [],
  tables: [],
  charts: [],
  redFlags: ['minor formatting variance in 2023'],
  primarySourceInsights: [],
  crossCuttingFindings: [],
  questions: [],
  modelUsed: 'claude-sonnet-4-6',
  tokenCost: { input: 5000, output: 800 },
};

describe('runAnnualReader', () => {
  it('loads the annual-reader prompt and includes filings + DataPacket in user message', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(STUB_OUTPUT);

    const result = await runAnnualReader({
      ticker: 'AAPL',
      runId: 'r1',
      dataPacket: { foo: 'bar' },
      filingContent: { '10-K-2025-09-04': { sections: { item1: '...' } } },
    });

    expect(result).toEqual(STUB_OUTPUT);
    expect(loadAgentPrompt).toHaveBeenCalledWith('annual-reader');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('AAPL');
    expect(args.userMessage).toContain('## DataPacket');
    expect(args.userMessage).toContain('## 10-K Filings');
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(args.maxResearchTurns).toBe(1);
    expect(args.maxWebSearches).toBeUndefined();
    expect(args.traceName).toBe('pitchdeck.annual-reader');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/agents/annual-reader
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement Annual Reader**

Create `agents-service/src/agents/annual-reader.ts`:

```typescript
import { ReportSectionSchema, type ReportSection } from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface AnnualReaderInput {
  ticker: string;
  runId: string;
  /** Stable Langfuse trace id (Inngest event.id). */
  traceId?: string;
  /** Pre-assembled DataPacket fetched from R2. */
  dataPacket: unknown;
  /** Filing content for 10-Ks only — Inngest function filters before calling. */
  filingContent: Record<string, unknown>;
}

const MODEL = 'claude-sonnet-4-6';

export async function runAnnualReader(input: AnnualReaderInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('annual-reader');

  const userMessage =
    `Analyze the 10-K filings for ${input.ticker}. Extract material findings about the business, ` +
    `material year-over-year changes, and any cross-cutting findings downstream agents should consider. ` +
    `Return your output via the emit_output tool.\n\n` +
    `## DataPacket\n\n` +
    '```json\n' + JSON.stringify(input.dataPacket, null, 2) + '\n```\n\n' +
    `## 10-K Filings\n\n` +
    '```json\n' + JSON.stringify(input.filingContent, null, 2) + '\n```\n';

  const progress = new ProgressPublisher(input.runId, 'annual-reader');
  await progress.setStatus('running', {
    displayName: 'Annual Reader',
    wave: 0,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'AnnualReaderSection',
      schemaDescription: 'Emit your annual-filing analysis as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.annual-reader',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 0 },
      traceId: input.traceId,
      // No web search — PSR is filing-grounded only.
      maxResearchTurns: 1,
      progress,
    });

    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err; // bubble — Inngest retries this step (per-agent retry isolation)
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/agents/annual-reader
```

Expected: PASS.

- [ ] **Step 5: Write the failing test for Quarterly Reader**

Create `agents-service/tests/agents/quarterly-reader.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runQuarterlyReader } = await import('../../src/agents/quarterly-reader.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const STUB_OUTPUT = {
  key: 'quarterly-reader',
  title: 'Quarterly Filing Analysis',
  sectionNumber: 0,
  status: 'pass',
  confidence: 'HIGH',
  verdict: null,
  verdictRationale: 'PSR — no verdict.',
  summary: 'Filings analyzed.',
  data: '{}',
  narrative: '...',
  citations: [],
  tables: [],
  charts: [],
  redFlags: ['guidance trajectory softened in latest 10-Q'],
  primarySourceInsights: [],
  crossCuttingFindings: [],
  questions: [],
  modelUsed: 'claude-opus-4-7',
  tokenCost: { input: 8000, output: 1200 },
};

describe('runQuarterlyReader', () => {
  it('loads the quarterly-reader prompt and includes 10-Qs + transcripts in user message', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(STUB_OUTPUT);

    const result = await runQuarterlyReader({
      ticker: 'AAPL',
      runId: 'r1',
      dataPacket: { foo: 'bar' },
      filingContent: { '10-Q-2026-02-26': { sections: { item2: '...' } } },
      transcriptContent: { 'transcript-Q4-2025': 'Operator: ...' },
    });

    expect(result).toEqual(STUB_OUTPUT);
    expect(loadAgentPrompt).toHaveBeenCalledWith('quarterly-reader');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('AAPL');
    expect(args.userMessage).toContain('## DataPacket');
    expect(args.userMessage).toContain('## 10-Q Filings');
    expect(args.userMessage).toContain('## Transcripts');
    expect(args.model).toBe('claude-opus-4-7');
    expect(args.maxResearchTurns).toBe(1);
    expect(args.maxWebSearches).toBeUndefined();
    expect(args.traceName).toBe('pitchdeck.quarterly-reader');
  });
});
```

- [ ] **Step 6: Run test, verify it fails**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/agents/quarterly-reader
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 7: Implement Quarterly Reader**

Create `agents-service/src/agents/quarterly-reader.ts`:

```typescript
import { ReportSectionSchema, type ReportSection } from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface QuarterlyReaderInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  /** Filing content for 10-Qs only. */
  filingContent: Record<string, unknown>;
  /** Earnings call transcripts. */
  transcriptContent: Record<string, unknown>;
}

const MODEL = 'claude-opus-4-7';

export async function runQuarterlyReader(input: QuarterlyReaderInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('quarterly-reader');

  const userMessage =
    `Analyze the 10-Q filings and earnings call transcripts for ${input.ticker}. Extract material ` +
    `findings about quarterly trajectory, guidance changes, management tone, and cross-cutting ` +
    `findings downstream agents should consider. Return your output via the emit_output tool.\n\n` +
    `## DataPacket\n\n` +
    '```json\n' + JSON.stringify(input.dataPacket, null, 2) + '\n```\n\n' +
    `## 10-Q Filings\n\n` +
    '```json\n' + JSON.stringify(input.filingContent, null, 2) + '\n```\n\n' +
    `## Transcripts\n\n` +
    '```json\n' + JSON.stringify(input.transcriptContent, null, 2) + '\n```\n';

  const progress = new ProgressPublisher(input.runId, 'quarterly-reader');
  await progress.setStatus('running', {
    displayName: 'Quarterly Reader',
    wave: 0,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'QuarterlyReaderSection',
      schemaDescription: 'Emit your quarterly-filing + transcript analysis as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.quarterly-reader',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 0 },
      traceId: input.traceId,
      maxResearchTurns: 1,
      progress,
    });

    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 8: Run test, verify it passes**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/agents/quarterly-reader
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/{annual-reader,quarterly-reader}.ts \
        agents-service/tests/agents/{annual-reader,quarterly-reader}.test.ts
git commit -m "feat(agents-service): PD Wave 0 runners — Annual Reader (Sonnet) + Quarterly Reader (Opus)"
```

---

### Task 10: PD Wave 1 runners — Business Analyst + Competitor (Market Position)

**Files:**
- Create: `agents-service/src/agents/business-analyst-pitchdeck.ts`
- Create: `agents-service/src/agents/competitor-evaluator-market-position-pitchdeck.ts`
- Create: `agents-service/tests/agents/business-analyst-pitchdeck.test.ts`
- Create: `agents-service/tests/agents/competitor-evaluator-market-position-pitchdeck.test.ts`

**Why this matters:** Wave 1 produces Sections 1/2 (Business Analyst → Radar + Simple/Predictable, returns `MultiSection`) and Section 3 (Competitor MP → Dominant Market Position, returns `ReportSection`). Both have web search ON.

- [ ] **Step 1: Write the failing test for Business Analyst**

Create `agents-service/tests/agents/business-analyst-pitchdeck.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runBusinessAnalystPitchDeck } = await import('../../src/agents/business-analyst-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['minor concern'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
});

describe('runBusinessAnalystPitchDeck', () => {
  it('loads BA prompt, builds userMessage with PSR + findings, returns MultiSection', async () => {
    const stub = { sections: [SECTION(1, 'Radar'), SECTION(2, 'Simple & Predictable')] };
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(stub);

    const result = await runBusinessAnalystPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'Annual'), quarterly: SECTION(0, 'Quarterly') },
      crossCuttingFindings: [{ finding: 'high debt', relevantAgents: [], severity: 'high', source: 'fa' }],
    });

    expect(result).toEqual(stub);
    expect(loadAgentPrompt).toHaveBeenCalledWith('business-analyst-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('AAPL');
    expect(args.userMessage).toContain('## DataPacket');
    expect(args.userMessage).toContain('## PSR Findings');
    expect(args.userMessage).toContain('## Cross-Cutting Findings');
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(args.maxWebSearches).toBe(5);
    expect(args.maxResearchTurns).toBe(5);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/agents/business-analyst-pitchdeck
```

- [ ] **Step 3: Implement Business Analyst PD**

Create `agents-service/src/agents/business-analyst-pitchdeck.ts`:

```typescript
import {
  MultiSectionSchema,
  type MultiSection,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface BusinessAnalystPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runBusinessAnalystPitchDeck(input: BusinessAnalystPDInput): Promise<MultiSection> {
  const systemPrompt = await loadAgentPrompt('business-analyst-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Sections 1 (Radar) and 2 (Simple & Predictable) for ${input.ticker}. ` +
    `Use web search to ground claims about the business in current information. Return your output ` +
    `via the emit_output tool with a sections array containing both Section 1 and Section 2.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'business-analyst-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Business Analyst',
    wave: 1,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: MultiSectionSchema,
      schemaName: 'BusinessAnalystPDSections',
      schemaDescription: 'Emit Sections 1 and 2 as { sections: ReportSection[] }.',
      model: MODEL,
      maxTokens: 12000,
      traceName: 'pitchdeck.business-analyst',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 1 },
      traceId: input.traceId,
      maxResearchTurns: 5,
      maxWebSearches: 5,
      progress,
    });

    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/agents/business-analyst-pitchdeck
```

- [ ] **Step 5: Write the failing test for Competitor (Market Position)**

Create `agents-service/tests/agents/competitor-evaluator-market-position-pitchdeck.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runCompetitorMarketPositionPitchDeck } = await import('../../src/agents/competitor-evaluator-market-position-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['watch for new entrants'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
});

describe('runCompetitorMarketPositionPitchDeck', () => {
  it('loads CMP prompt, requests web search, returns ReportSection', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(SECTION(3, 'Dominant Market Position'));

    const result = await runCompetitorMarketPositionPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(3);
    expect(loadAgentPrompt).toHaveBeenCalledWith('competitor-evaluator-market-position-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('AAPL');
    expect(args.maxWebSearches).toBe(5);
    expect(args.traceName).toBe('pitchdeck.competitor-market-position');
  });
});
```

- [ ] **Step 6: Run test, verify it fails**

- [ ] **Step 7: Implement Competitor (Market Position)**

Create `agents-service/src/agents/competitor-evaluator-market-position-pitchdeck.ts`:

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface CompetitorMPPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runCompetitorMarketPositionPitchDeck(input: CompetitorMPPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('competitor-evaluator-market-position-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Section 3 (Dominant Market Position) for ${input.ticker}. Use web search to ` +
    `validate market share claims, identify the named peer set, and surface market share ceiling ` +
    `analysis. Return your output via the emit_output tool as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'competitor-evaluator-market-position-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Competitor — Market Position',
    wave: 1,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'CompetitorMarketPositionSection',
      schemaDescription: 'Emit Section 3 (Dominant Market Position) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.competitor-market-position',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 1 },
      traceId: input.traceId,
      maxResearchTurns: 5,
      maxWebSearches: 5,
      progress,
    });

    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 8: Run test, verify it passes**

- [ ] **Step 9: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/{business-analyst-pitchdeck,competitor-evaluator-market-position-pitchdeck}.ts \
        agents-service/tests/agents/{business-analyst-pitchdeck,competitor-evaluator-market-position-pitchdeck}.test.ts
git commit -m "feat(agents-service): PD Wave 1 runners — Business Analyst + Competitor MP"
```

---

### Task 11: PD Wave 2 runners — Competitor (Moats), Financial Analyst, Management Evaluator

**Files:**
- Create: `agents-service/src/agents/competitor-evaluator-moats-pitchdeck.ts`
- Create: `agents-service/src/agents/financial-analyst-pitchdeck.ts`
- Create: `agents-service/src/agents/management-evaluator-pitchdeck.ts`
- Create: 3 corresponding test files

**Why this matters:** Wave 2 has 3 agents. Competitor (Moats) → Section 4 (depends on Section 3). Financial Analyst → Sections 5/7/8 (returns `MultiSection`). Management Evaluator → Section 6. All Sonnet, all web search ON.

For brevity and to avoid placeholder violations, the 3 runners follow the SAME structure as Task 10 with these specific differences:

| Runner | Prompt id | Output schema | Inputs | Web max | Display name | Trace |
|---|---|---|---|---|---|---|
| `competitor-evaluator-moats-pitchdeck.ts` | `competitor-evaluator-moats-pitchdeck` | `ReportSectionSchema` | DP + PSR + CCF + **section3** | 3 | "Competitor — Moats" | `pitchdeck.competitor-moats` |
| `financial-analyst-pitchdeck.ts` | `financial-analyst-pitchdeck` | `MultiSectionSchema` (3 sections) | DP + PSR + CCF | 3 | "Financial Analyst" | `pitchdeck.financial-analyst` |
| `management-evaluator-pitchdeck.ts` | `management-evaluator-pitchdeck` | `ReportSectionSchema` | DP + PSR + CCF | 5 | "Management Evaluator" | `pitchdeck.management-evaluator` |

The Financial Analyst's `maxTokens` should be `16000` (3 sections in one call). All other Wave 2 runners use `8000`.

- [ ] **Step 1: Write the failing test for Competitor (Moats)**

Create `agents-service/tests/agents/competitor-evaluator-moats-pitchdeck.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runCompetitorMoatsPitchDeck } = await import('../../src/agents/competitor-evaluator-moats-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
});

describe('runCompetitorMoatsPitchDeck', () => {
  it('loads moats prompt, includes Section 3 in userMessage, returns ReportSection', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(SECTION(4, 'Moats'));

    const result = await runCompetitorMoatsPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      section3: SECTION(3, 'Market Position'),
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(4);
    expect(loadAgentPrompt).toHaveBeenCalledWith('competitor-evaluator-moats-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('## Section 3 (Market Position)');
    expect(args.maxWebSearches).toBe(3);
    expect(args.traceName).toBe('pitchdeck.competitor-moats');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

- [ ] **Step 3: Implement Competitor (Moats)**

Create `agents-service/src/agents/competitor-evaluator-moats-pitchdeck.ts`:

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface CompetitorMoatsPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  section3: ReportSection; // Market Position output
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runCompetitorMoatsPitchDeck(input: CompetitorMoatsPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('competitor-evaluator-moats-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Section 4 (Large Barrier to Entry & Moats) for ${input.ticker}. Use Section 3 ` +
    `(Market Position) as your starting point — the named peer set there is your moat-comparison universe. ` +
    `Validate the durability of each moat with web search where useful. Return your output via the ` +
    `emit_output tool as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Section 3 (Market Position)\n\n\`\`\`json\n${JSON.stringify(input.section3, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'competitor-evaluator-moats-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Competitor — Moats',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'CompetitorMoatsSection',
      schemaDescription: 'Emit Section 4 (Moats) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.competitor-moats',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 2 },
      traceId: input.traceId,
      maxResearchTurns: 3,
      maxWebSearches: 3,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run, verify it passes**

- [ ] **Step 5: Write the failing test for Financial Analyst PD**

Create `agents-service/tests/agents/financial-analyst-pitchdeck.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runFinancialAnalystPitchDeck } = await import('../../src/agents/financial-analyst-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
});

describe('runFinancialAnalystPitchDeck', () => {
  it('returns MultiSection with Sections 5, 7, 8', async () => {
    const stub = { sections: [SECTION(5, 'FCF'), SECTION(7, 'ROE'), SECTION(8, 'Balance Sheet')] };
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(stub);

    const result = await runFinancialAnalystPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      crossCuttingFindings: [],
    });

    expect(result.sections).toHaveLength(3);
    expect(loadAgentPrompt).toHaveBeenCalledWith('financial-analyst-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.maxTokens).toBe(16000);
    expect(args.maxWebSearches).toBe(3);
    expect(args.traceName).toBe('pitchdeck.financial-analyst');
  });
});
```

- [ ] **Step 6: Run, verify fails**

- [ ] **Step 7: Implement Financial Analyst PD**

Create `agents-service/src/agents/financial-analyst-pitchdeck.ts`:

```typescript
import {
  MultiSectionSchema,
  type MultiSection,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface FinancialAnalystPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runFinancialAnalystPitchDeck(input: FinancialAnalystPDInput): Promise<MultiSection> {
  const systemPrompt = await loadAgentPrompt('financial-analyst-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Sections 5 (Free Cash Flow), 7 (ROE/ROIC/ROA & Debt), and 8 (Strong Balance ` +
    `Sheet) for ${input.ticker}. Use web search where analyst estimates or peer benchmarking matter. ` +
    `Return your output via emit_output as { sections: ReportSection[] } with all 3 sections.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'financial-analyst-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Financial Analyst',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: MultiSectionSchema,
      schemaName: 'FinancialAnalystPDSections',
      schemaDescription: 'Emit Sections 5, 7, and 8 as { sections: ReportSection[] }.',
      model: MODEL,
      maxTokens: 16000,
      traceName: 'pitchdeck.financial-analyst',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 2 },
      traceId: input.traceId,
      maxResearchTurns: 3,
      maxWebSearches: 3,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 8: Run, verify passes**

- [ ] **Step 9: Write the failing test for Management Evaluator PD**

Create `agents-service/tests/agents/management-evaluator-pitchdeck.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runManagementEvaluatorPitchDeck } = await import('../../src/agents/management-evaluator-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
});

describe('runManagementEvaluatorPitchDeck', () => {
  it('returns Section 6 with web search ON', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(SECTION(6, 'Management'));

    const result = await runManagementEvaluatorPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(6);
    expect(loadAgentPrompt).toHaveBeenCalledWith('management-evaluator-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.maxWebSearches).toBe(5);
    expect(args.traceName).toBe('pitchdeck.management-evaluator');
  });
});
```

- [ ] **Step 10: Run, verify fails**

- [ ] **Step 11: Implement Management Evaluator PD**

Create `agents-service/src/agents/management-evaluator-pitchdeck.ts`:

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface ManagementEvaluatorPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runManagementEvaluatorPitchDeck(input: ManagementEvaluatorPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('management-evaluator-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Section 6 (Management Talent & Integrity) for ${input.ticker}. Use web search ` +
    `to find management interviews, capital allocation track record, executive comp commentary, and ` +
    `insider transaction context. Return your output via emit_output as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'management-evaluator-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Management Evaluator',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'ManagementEvaluatorSection',
      schemaDescription: 'Emit Section 6 (Management) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.management-evaluator',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 2 },
      traceId: input.traceId,
      maxResearchTurns: 5,
      maxWebSearches: 5,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 12: Run, verify passes**

- [ ] **Step 13: Run all Wave 2 tests**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/agents/competitor-evaluator-moats-pitchdeck tests/agents/financial-analyst-pitchdeck tests/agents/management-evaluator-pitchdeck
```

Expected: 3 PASS.

- [ ] **Step 14: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/{competitor-evaluator-moats-pitchdeck,financial-analyst-pitchdeck,management-evaluator-pitchdeck}.ts \
        agents-service/tests/agents/{competitor-evaluator-moats-pitchdeck,financial-analyst-pitchdeck,management-evaluator-pitchdeck}.test.ts
git commit -m "feat(agents-service): PD Wave 2 runners — Moats, Financial Analyst, Management Evaluator"
```

---

### Task 12: PD Wave 3 runners — Risk Analyst (Opus) + Valuation Specialist (Opus)

**Files:**
- Create: `agents-service/src/agents/risk-analyst-pitchdeck.ts`
- Create: `agents-service/src/agents/valuation-specialist-pitchdeck.ts`
- Create: 2 corresponding test files

**Why this matters:** Wave 3 runs Section 9 (PEST Risks) and Section 10 (Valuation). Both use **Opus** (`claude-opus-4-7`) per Brainstorm 1 / observatory project memory. Both web search ON. Valuation Specialist takes Section 3 + Section 4 outputs as inputs (CAP estimate from Moats, market share ceiling from MP).

- [ ] **Step 1: Write the failing test for Risk Analyst PD**

Create `agents-service/tests/agents/risk-analyst-pitchdeck.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runRiskAnalystPitchDeck } = await import('../../src/agents/risk-analyst-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-opus-4-7', tokenCost: { input: 1, output: 1 },
});

describe('runRiskAnalystPitchDeck', () => {
  it('uses Opus, web search, returns Section 9', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(SECTION(9, 'PEST Risks'));

    const result = await runRiskAnalystPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(9);
    expect(loadAgentPrompt).toHaveBeenCalledWith('risk-analyst-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.model).toBe('claude-opus-4-7');
    expect(args.maxWebSearches).toBe(5);
    expect(args.traceName).toBe('pitchdeck.risk-analyst');
  });
});
```

- [ ] **Step 2: Run, verify fails**

- [ ] **Step 3: Implement Risk Analyst PD**

Create `agents-service/src/agents/risk-analyst-pitchdeck.ts`:

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface RiskAnalystPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-opus-4-7';

export async function runRiskAnalystPitchDeck(input: RiskAnalystPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('risk-analyst-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Section 9 (Limited Exposure to P.E.S.T Risks) for ${input.ticker}. Use web ` +
    `search to find macro, regulatory, geopolitical, and technology-shift risks. Return your output ` +
    `via emit_output as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'risk-analyst-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Risk Analyst',
    wave: 3,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'RiskAnalystPDSection',
      schemaDescription: 'Emit Section 9 (PEST Risks) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.risk-analyst',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 3 },
      traceId: input.traceId,
      maxResearchTurns: 5,
      maxWebSearches: 5,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run, verify passes**

- [ ] **Step 5: Write the failing test for Valuation Specialist PD**

Create `agents-service/tests/agents/valuation-specialist-pitchdeck.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runValuationSpecialistPitchDeck } = await import('../../src/agents/valuation-specialist-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-opus-4-7', tokenCost: { input: 1, output: 1 },
});

describe('runValuationSpecialistPitchDeck', () => {
  it('includes Section 3 + Section 4 in userMessage, uses Opus + web search', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(SECTION(10, 'Valuation'));

    const result = await runValuationSpecialistPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      psrFindings: { annual: SECTION(0, 'A'), quarterly: SECTION(0, 'Q') },
      section3: SECTION(3, 'Market Position'),
      section4: SECTION(4, 'Moats'),
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(10);
    expect(loadAgentPrompt).toHaveBeenCalledWith('valuation-specialist-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('## Section 3');
    expect(args.userMessage).toContain('## Section 4');
    expect(args.model).toBe('claude-opus-4-7');
    expect(args.maxWebSearches).toBe(5);
    expect(args.traceName).toBe('pitchdeck.valuation-specialist');
  });
});
```

- [ ] **Step 6: Run, verify fails**

- [ ] **Step 7: Implement Valuation Specialist PD**

Create `agents-service/src/agents/valuation-specialist-pitchdeck.ts`:

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface ValuationSpecialistPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  psrFindings: { annual: ReportSection; quarterly: ReportSection };
  section3: ReportSection;
  section4: ReportSection;
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-opus-4-7';

export async function runValuationSpecialistPitchDeck(input: ValuationSpecialistPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('valuation-specialist-pitchdeck');

  const userMessage =
    `Produce Pitch Deck Section 10 (Valuation) for ${input.ticker}. Use Section 3's market share ceiling ` +
    `and Section 4's CAP (competitive advantage period) to constrain growth assumptions. Apply MOS, PBT, ` +
    `Ten Cap, and Equity Bond methods. Use web search for analyst estimates and FGR triangulation. ` +
    `Return as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## PSR Findings\n\n` +
    `### Annual Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.annual, null, 2)}\n\`\`\`\n\n` +
    `### Quarterly Reader\n\`\`\`json\n${JSON.stringify(input.psrFindings.quarterly, null, 2)}\n\`\`\`\n\n` +
    `## Section 3 (Market Position)\n\n\`\`\`json\n${JSON.stringify(input.section3, null, 2)}\n\`\`\`\n\n` +
    `## Section 4 (Moats)\n\n\`\`\`json\n${JSON.stringify(input.section4, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Prior Waves\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'valuation-specialist-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Valuation Specialist',
    wave: 3,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'ValuationSpecialistPDSection',
      schemaDescription: 'Emit Section 10 (Valuation) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.valuation-specialist',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 3 },
      traceId: input.traceId,
      maxResearchTurns: 5,
      maxWebSearches: 5,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 8: Run, verify passes**

- [ ] **Step 9: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/{risk-analyst-pitchdeck,valuation-specialist-pitchdeck}.ts \
        agents-service/tests/agents/{risk-analyst-pitchdeck,valuation-specialist-pitchdeck}.test.ts
git commit -m "feat(agents-service): PD Wave 3 runners — Risk Analyst + Valuation Specialist (Opus)"
```

---

### Task 13: PD Wave 4 runner — Synthesis Writer

**Files:**
- Create: `agents-service/src/agents/synthesis-writer-pitchdeck.ts`
- Create: `agents-service/tests/agents/synthesis-writer-pitchdeck.test.ts`

**Why this matters:** Wave 4 has one agent. Synthesis Writer reads ALL 10 prior section outputs and produces Section 11 (Overall Verdict: PASS/FAIL/WATCHLIST). No web search. Sonnet.

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/agents/synthesis-writer-pitchdeck.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runSynthesisWriterPitchDeck } = await import('../../src/agents/synthesis-writer-pitchdeck.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
});

describe('runSynthesisWriterPitchDeck', () => {
  it('includes all 10 prior section headers in userMessage, returns Section 11', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(SECTION(11, 'Overall Verdict'));

    const priorSections = [1,2,3,4,5,6,7,8,9,10].map(n => SECTION(n, `Section ${n}`));

    const result = await runSynthesisWriterPitchDeck({
      ticker: 'AAPL', runId: 'r1',
      priorSections,
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(11);
    expect(loadAgentPrompt).toHaveBeenCalledWith('synthesis-writer-pitchdeck');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    for (let n = 1; n <= 10; n++) {
      expect(args.userMessage).toContain(`### Section ${n}`);
    }
    expect(args.maxWebSearches).toBeUndefined();
    expect(args.maxResearchTurns).toBe(1);
    expect(args.traceName).toBe('pitchdeck.synthesis-writer');
  });
});
```

- [ ] **Step 2: Run, verify fails**

- [ ] **Step 3: Implement Synthesis Writer PD**

Create `agents-service/src/agents/synthesis-writer-pitchdeck.ts`:

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface SynthesisWriterPDInput {
  ticker: string;
  runId: string;
  traceId?: string;
  /** All 10 prior section outputs in order: 1,2,3,4,5,6,7,8,9,10. */
  priorSections: ReportSection[];
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runSynthesisWriterPitchDeck(input: SynthesisWriterPDInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('synthesis-writer-pitchdeck');

  const sectionsBlock = input.priorSections
    .map(s => `### Section ${s.sectionNumber} — ${s.title}\n\`\`\`json\n${JSON.stringify(s, null, 2)}\n\`\`\``)
    .join('\n\n');

  const userMessage =
    `Synthesize the Pitch Deck verdict for ${input.ticker} from the 10 section outputs below. Produce ` +
    `Section 11 (Overall Verdict: PASS / FAIL / WATCHLIST). Return via emit_output as a single ` +
    `ReportSection. No web search — synthesis only.\n\n` +
    `## Prior Section Outputs (Sections 1–10)\n\n${sectionsBlock}\n\n` +
    `## Cross-Cutting Findings (cumulative)\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'synthesis-writer-pitchdeck');
  await progress.setStatus('running', {
    displayName: 'Synthesis Writer',
    wave: 4,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'OverallVerdictSection',
      schemaDescription: 'Emit Section 11 (Overall Verdict) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'pitchdeck.synthesis-writer',
      traceMetadata: { ticker: input.ticker, runId: input.runId, wave: 4 },
      traceId: input.traceId,
      maxResearchTurns: 1,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run, verify passes**

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/synthesis-writer-pitchdeck.ts \
        agents-service/tests/agents/synthesis-writer-pitchdeck.test.ts
git commit -m "feat(agents-service): PD Wave 4 runner — Synthesis Writer (Section 11 verdict)"
```

---

# PHASE C — Pitch Deck Inngest Function (Tasks 14–16)

**Phase C goal:** A deployed Inngest function that orchestrates all 10 PD runners across 5 waves with per-agent `step.run` retry isolation, cross-cutting findings aggregation between waves, and a Worker callback that writes the final report to `v3_runs.result_json`. Plus a frontend dispatch hook.

---

### Task 14: Cross-cutting findings aggregator (CPU helper)

**Files:**
- Create: `agents-service/src/lib/findings-aggregator.ts`
- Create: `agents-service/tests/lib/findings-aggregator.test.ts`

**Why this matters:** Brainstorm 1 Decision 4 — pure CPU merge of `crossCuttingFindings` between waves. Dedupe by `hash(source + finding-text-normalized)`. Sort by severity then source. No Anthropic call. Schema follows the existing `CrossCuttingFindingSchema` (`finding/relevantAgents/severity/source`, severity 3-level).

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/lib/findings-aggregator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregateFindings } from '../../src/lib/findings-aggregator.js';
import type { CrossCuttingFinding } from '../../src/agents/schemas/report-section.js';

const f = (source: string, finding: string, severity: 'high' | 'medium' | 'low'): CrossCuttingFinding => ({
  source, finding, severity, relevantAgents: [],
});

describe('aggregateFindings', () => {
  it('dedupes by source + normalized text (case + whitespace)', () => {
    const wave = [{ crossCuttingFindings: [
      f('financial-analyst', 'High debt load', 'high'),
      f('financial-analyst', 'high  DEBT load  ', 'high'),
    ]}];
    expect(aggregateFindings([], wave)).toHaveLength(1);
  });

  it('keeps findings from different sources even with same text', () => {
    const wave = [{ crossCuttingFindings: [
      f('financial-analyst', 'high debt', 'high'),
      f('risk-analyst',      'high debt', 'high'),
    ]}];
    expect(aggregateFindings([], wave)).toHaveLength(2);
  });

  it('sorts by severity (high → medium → low) then source A→Z', () => {
    const wave = [{ crossCuttingFindings: [
      f('z-source', 'a', 'low'),
      f('a-source', 'b', 'high'),
      f('b-source', 'c', 'high'),
      f('c-source', 'd', 'medium'),
    ]}];
    const result = aggregateFindings([], wave);
    expect(result.map(r => r.source)).toEqual(['a-source', 'b-source', 'c-source', 'z-source']);
  });

  it('preserves prior findings cumulatively across waves', () => {
    const prior = [f('x', 'p1', 'medium')];
    const wave = [{ crossCuttingFindings: [f('y', 'p2', 'low')] }];
    expect(aggregateFindings(prior, wave)).toHaveLength(2);
  });

  it('handles wave outputs with missing crossCuttingFindings field', () => {
    const wave = [{}, { crossCuttingFindings: [f('a', 'x', 'high')] }];
    expect(aggregateFindings([], wave)).toHaveLength(1);
  });

  it('handles empty inputs', () => {
    expect(aggregateFindings([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/lib/findings-aggregator
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the aggregator**

Create `agents-service/src/lib/findings-aggregator.ts`:

```typescript
import type { CrossCuttingFinding } from '../agents/schemas/report-section.js';

interface HasFindings {
  crossCuttingFindings?: CrossCuttingFinding[];
}

const SEVERITY_RANK: Record<CrossCuttingFinding['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function fingerprint(f: CrossCuttingFinding): string {
  return `${f.source}|${normalizeText(f.finding)}`;
}

/**
 * Merge findings from a wave's outputs with cumulative findings from prior waves.
 * Dedupes by source+text. Sorts by severity (high → low) then source A→Z.
 *
 * Pure CPU — no Anthropic call. Deterministic. Idempotent across Inngest step replays.
 */
export function aggregateFindings(
  prior: CrossCuttingFinding[],
  waveOutputs: HasFindings[],
): CrossCuttingFinding[] {
  const map = new Map<string, CrossCuttingFinding>();
  for (const f of prior) {
    map.set(fingerprint(f), f);
  }
  for (const out of waveOutputs) {
    for (const f of out?.crossCuttingFindings ?? []) {
      const fp = fingerprint(f);
      if (!map.has(fp)) map.set(fp, f);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const sevDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDelta !== 0) return sevDelta;
    return a.source.localeCompare(b.source);
  });
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/lib/findings-aggregator
```

Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/lib/findings-aggregator.ts agents-service/tests/lib/findings-aggregator.test.ts
git commit -m "feat(agents-service): cross-cutting findings aggregator (CPU merge, dedupe, sort)"
```

---

### Task 15: Pitch Deck Inngest function + Worker R2 proxy route

**Files:**
- Create: `agents-service/src/lib/r2-fetch.ts`
- Create: `agents-service/src/inngest/functions/pitch-deck.ts`
- Modify: `agents-service/src/inngest/functions/index.ts`
- Modify: `api/src/routes/pipeline-v3.js` (add R2 proxy GET route)

**Why this matters:** This task ties everything together. Worker exposes a secret-authenticated GET route so Fly can fetch R2-stashed assembly artifacts without holding R2 credentials. The PD Inngest function reads inputs from R2, runs all 10 specialists across 5 waves with per-agent `step.run` blocks, aggregates findings between waves, posts the final report to the Worker callback.

- [ ] **Step 1: Add the Worker R2 proxy GET route**

Open `api/src/routes/pipeline-v3.js`. In the existing `handlePipelineV3` switch, add this branch (before the final `return null`):

```javascript
  // GET /api/v3/pipeline/assembly/:runId/:key.json — Fly fetches R2 artifacts here.
  // Public route, secret-authenticated.
  const assemblyMatch = path.match(/^\/api\/v3\/pipeline\/assembly\/([a-f0-9-]+)\/([a-z0-9-]+)\.json$/);
  if (request.method === 'GET' && assemblyMatch) {
    return handleAssemblyFetch(request, env, assemblyMatch[1], assemblyMatch[2]);
  }
```

Then add the handler function (after the existing handlers in the same file):

```javascript
async function handleAssemblyFetch(request, env, runId, key) {
  const provided = request.headers.get('X-Callback-Secret');
  if (!provided || provided !== env.V3_CALLBACK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  const validKeys = ['datapacket', 'filings', 'parent-report'];
  if (!validKeys.includes(key)) return new Response('Not Found', { status: 404 });

  const r2Key = `assembly/${runId}/${key}.json`;
  const obj = await env.TRANSCRIPTS.get(r2Key);
  if (!obj) return new Response('Not Found', { status: 404 });

  return new Response(obj.body, { headers: { 'Content-Type': 'application/json' } });
}
```

- [ ] **Step 2: Deploy the Worker**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/api && npx wrangler deploy
```

- [ ] **Step 3: Implement the Fly-side R2 fetch helper**

Create `agents-service/src/lib/r2-fetch.ts`:

```typescript
import { loadEnv } from './env.js';

export type AssemblyKey = 'datapacket' | 'filings' | 'parent-report';

/**
 * Fetch a v3 assembly artifact (DataPacket / filings / parent PD report) from R2
 * via the Worker proxy. Avoids coupling Fly to Cloudflare R2 credentials.
 */
export async function fetchAssembly<T = unknown>(runId: string, key: AssemblyKey): Promise<T> {
  const env = loadEnv();
  const url = `${env.WORKER_CALLBACK_URL}/api/v3/pipeline/assembly/${runId}/${key}.json`;
  const res = await fetch(url, {
    headers: { 'X-Callback-Secret': env.WORKER_CALLBACK_SECRET },
  });
  if (!res.ok) {
    throw new Error(`R2 fetch ${key} for run ${runId} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Implement the PD Inngest function**

Create `agents-service/src/inngest/functions/pitch-deck.ts`:

```typescript
import { inngest } from '../client.js';
import { fetchAssembly } from '../../lib/r2-fetch.js';
import { aggregateFindings } from '../../lib/findings-aggregator.js';
import { ProgressPublisher } from '../../lib/worker-progress.js';
import { postCallback } from '../../lib/worker-callback.js';
import { flushLangfuse } from '../../lib/langfuse-client.js';
import type { CrossCuttingFinding, ReportSection } from '../../agents/schemas/report-section.js';

import { runAnnualReader } from '../../agents/annual-reader.js';
import { runQuarterlyReader } from '../../agents/quarterly-reader.js';
import { runBusinessAnalystPitchDeck } from '../../agents/business-analyst-pitchdeck.js';
import { runCompetitorMarketPositionPitchDeck } from '../../agents/competitor-evaluator-market-position-pitchdeck.js';
import { runCompetitorMoatsPitchDeck } from '../../agents/competitor-evaluator-moats-pitchdeck.js';
import { runFinancialAnalystPitchDeck } from '../../agents/financial-analyst-pitchdeck.js';
import { runManagementEvaluatorPitchDeck } from '../../agents/management-evaluator-pitchdeck.js';
import { runRiskAnalystPitchDeck } from '../../agents/risk-analyst-pitchdeck.js';
import { runValuationSpecialistPitchDeck } from '../../agents/valuation-specialist-pitchdeck.js';
import { runSynthesisWriterPitchDeck } from '../../agents/synthesis-writer-pitchdeck.js';

interface FilingAssembly {
  filingContent: Record<string, unknown>;
  transcriptContent: Record<string, unknown>;
  errors?: unknown[];
  stats?: unknown;
}

export const pitchDeckFn = inngest.createFunction(
  {
    id: 'pitch-deck',
    retries: 3,
    timeouts: { finish: '60m' },
    onFailure: async ({ event, error }) => {
      const runId = (event as any).data?.event?.data?.runId;
      if (runId) {
        await postCallback({ runId, status: 'failed', error: error.message });
      }
    },
  },
  { event: 'thes1s/pitchdeck.start' },
  async ({ event, step }) => {
    const { runId, ticker } = event.data;
    const traceId = event.id ?? runId;
    const runPub = new ProgressPublisher(runId, '__run__');

    // ─── Step: Fetch pre-assembled inputs from R2 (via Worker proxy) ─────
    const { dataPacket, filing } = await step.run('fetch-inputs', async () => {
      await runPub.setPhase('fetching-inputs', 'Loading DataPacket and filings');
      const [dp, fc] = await Promise.all([
        fetchAssembly<unknown>(runId, 'datapacket'),
        fetchAssembly<FilingAssembly>(runId, 'filings'),
      ]);
      return { dataPacket: dp, filing: fc };
    });

    // ─── Wave 0 — PSR (parallel) ─────────────────────────────────────────
    await runPub.setPhase('wave-0-psr', 'Wave 0: Reading filings and transcripts');
    const [annualOut, quarterlyOut] = await Promise.all([
      step.run('wave-0-annual-reader', () =>
        runAnnualReader({
          ticker, runId, traceId,
          dataPacket,
          filingContent: pickByForm(filing.filingContent, '10-K'),
        })),
      step.run('wave-0-quarterly-reader', () =>
        runQuarterlyReader({
          ticker, runId, traceId,
          dataPacket,
          filingContent: pickByForm(filing.filingContent, '10-Q'),
          transcriptContent: filing.transcriptContent,
        })),
    ]);

    let findings: CrossCuttingFinding[] = aggregateFindings([], [annualOut, quarterlyOut]);
    const psrFindings = { annual: annualOut, quarterly: quarterlyOut };

    // ─── Wave 1 — Business Context (parallel) ─────────────────────────────
    await runPub.setPhase('wave-1-context', 'Wave 1: Business context');
    const [baOut, cmpOut] = await Promise.all([
      step.run('wave-1-business-analyst', () =>
        runBusinessAnalystPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings, crossCuttingFindings: findings,
        })),
      step.run('wave-1-competitor-market-position', () =>
        runCompetitorMarketPositionPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings, crossCuttingFindings: findings,
        })),
    ]);

    const sec1 = baOut.sections.find((s: ReportSection) => s.sectionNumber === 1)!;
    const sec2 = baOut.sections.find((s: ReportSection) => s.sectionNumber === 2)!;
    const sec3 = cmpOut;
    findings = aggregateFindings(findings, [sec1, sec2, sec3]);

    // ─── Wave 2 — Deep Analysis (parallel) ────────────────────────────────
    await runPub.setPhase('wave-2-deep-analysis', 'Wave 2: Deep analysis');
    const [moatsOut, faOut, mgmtOut] = await Promise.all([
      step.run('wave-2-competitor-moats', () =>
        runCompetitorMoatsPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings,
          section3: sec3, crossCuttingFindings: findings,
        })),
      step.run('wave-2-financial-analyst', () =>
        runFinancialAnalystPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings, crossCuttingFindings: findings,
        })),
      step.run('wave-2-management-evaluator', () =>
        runManagementEvaluatorPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings, crossCuttingFindings: findings,
        })),
    ]);

    const sec4 = moatsOut;
    const sec5 = faOut.sections.find((s: ReportSection) => s.sectionNumber === 5)!;
    const sec7 = faOut.sections.find((s: ReportSection) => s.sectionNumber === 7)!;
    const sec8 = faOut.sections.find((s: ReportSection) => s.sectionNumber === 8)!;
    const sec6 = mgmtOut;
    findings = aggregateFindings(findings, [sec4, sec5, sec6, sec7, sec8]);

    // ─── Wave 3 — Risk & Valuation (parallel) ─────────────────────────────
    await runPub.setPhase('wave-3-risk-valuation', 'Wave 3: Risk & Valuation');
    const [riskOut, valOut] = await Promise.all([
      step.run('wave-3-risk-analyst', () =>
        runRiskAnalystPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings, crossCuttingFindings: findings,
        })),
      step.run('wave-3-valuation-specialist', () =>
        runValuationSpecialistPitchDeck({
          ticker, runId, traceId, dataPacket, psrFindings,
          section3: sec3, section4: sec4, crossCuttingFindings: findings,
        })),
    ]);

    const sec9 = riskOut;
    const sec10 = valOut;
    findings = aggregateFindings(findings, [sec9, sec10]);

    // ─── Wave 4 — Synthesis ───────────────────────────────────────────────
    await runPub.setPhase('wave-4-synthesis', 'Wave 4: Final verdict');
    const sec11 = await step.run('wave-4-synthesis-writer', () =>
      runSynthesisWriterPitchDeck({
        ticker, runId, traceId,
        priorSections: [sec1, sec2, sec3, sec4, sec5, sec6, sec7, sec8, sec9, sec10],
        crossCuttingFindings: findings,
      }));

    // ─── Final assembly + callback ────────────────────────────────────────
    const finalReport = {
      ticker,
      pipelineStage: 'pitch-deck' as const,
      generatedAt: new Date().toISOString(),
      sections: [sec1, sec2, sec3, sec4, sec5, sec6, sec7, sec8, sec9, sec10, sec11],
      overallVerdict: sec11.verdict,
    };

    await step.run('post-callback', async () => {
      await runPub.setPhase('finalizing', 'Saving the report');
      await postCallback({ runId, status: 'completed', result: finalReport });
      await runPub.setPhase('completed', 'Completed');
    });

    await flushLangfuse();
    return { runId, ticker, sections: finalReport.sections.length };
  }
);

/** Filter the assembled filing content by form type (10-K vs 10-Q). */
function pickByForm(all: Record<string, unknown>, form: '10-K' | '10-Q'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(`${form}-`)) out[key] = value;
  }
  return out;
}
```

- [ ] **Step 5: Register the function**

Replace `agents-service/src/inngest/functions/index.ts`:

```typescript
import { helloWorld } from './hello-world.js';
import { onePagerFn } from './one-pager.js';
import { pitchDeckFn } from './pitch-deck.js';

export const functions = [helloWorld, onePagerFn, pitchDeckFn] as const;
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm run typecheck
```

Expected: no output (success).

- [ ] **Step 7: Run all tests**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test
```

Expected: all PASS (the existing One Pager tests + the new schema/runner tests + the aggregator test).

- [ ] **Step 8: Deploy Fly + sync Inngest**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
fly deploy . --config agents-service/fly.toml
```

Then verify in app.inngest.com → Apps → thes1s-agents → 3 functions: hello-world + one-pager + **pitch-deck**.

If pitch-deck doesn't show up, force a sync:

```bash
curl -X PUT https://thes1s-agents.fly.dev/api/inngest
```

- [ ] **Step 9: Smoke test end-to-end**

In an authenticated browser session at `thes1sinvesting.com`, open DevTools and run:

```javascript
const r = await fetch('/api/v3/pipeline/pitchdeck/start', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticker: 'AAPL' }),
}).then(r => r.json());
console.log('PD runId:', r.runId, 'reportId:', r.reportId);
```

Watch:
- **Inngest dashboard** — function enters Running, progresses through 5 wave phases. Each agent appears as its own step.
- **Langfuse** — ~12 traces named `pitchdeck.*` with input/output token counts.
- **R2** — `assembly/{runId}/datapacket.json` and `filings.json` present.

After 30–45 minutes, check completion:

```javascript
const status = await fetch(`/api/v3/pipeline/status/${r.runId}`, { credentials: 'include' }).then(r => r.json());
console.log(status.status, status.result?.sections?.length);
```

Expected: `'completed'`, `11`.

- [ ] **Step 10: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/lib/r2-fetch.ts \
        agents-service/src/inngest/functions/{pitch-deck.ts,index.ts} \
        api/src/routes/pipeline-v3.js
git commit -m "feat: Pitch Deck v3 — 5-wave Inngest function + Worker R2 proxy route"
```

---

### Task 16: Frontend dispatch hook for Pitch Deck v3

**Files:**
- Create: `src/hooks/useGeneratePitchDeckV3.js`

**Why this matters:** Dispatch only — POST start, return runId. **Rendering is out of scope; Brainstorm 3 owns it.** This hook lets a future component (Brainstorm 3) wire the Generate button.

- [ ] **Step 1: Create the hook**

Create `src/hooks/useGeneratePitchDeckV3.js`:

```javascript
import { useState, useCallback } from 'react';
import { API_BASE } from '../engines/apiBase.js';

/**
 * v3 Pitch Deck dispatch hook. Calls the Worker start route, returns { runId, reportId, status }.
 * Does NOT poll status or render the report — Brainstorm 3 owns the live-running and completed-report UI.
 */
export function useGeneratePitchDeckV3() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = useCallback(async (ticker) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v3/pipeline/pitchdeck/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, error };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add src/hooks/useGeneratePitchDeckV3.js
git commit -m "feat(frontend): useGeneratePitchDeckV3 dispatch hook"
```

---

# PHASE D — Full Story Schemas + Runners (Tasks 17–22)

**Phase D goal:** Port the 4 debate-step Zod schemas to TypeScript, then build all 10 FS runners (5 Phase-1 parallel section agents + 5 Phase-2 sequential debate agents). Each runner mocked-unit-tested.

---

### Task 17: Port debate-step schemas to TypeScript

**Files:**
- Create: `agents-service/src/agents/schemas/debate-step.ts`
- Create: `agents-service/tests/schemas/debate-step.test.ts`

**Why this matters:** FS Phase 2 has 4 distinct output shapes (Bull / Bear / Rebuttal / Judge). The frontend has them in `src/schemas/debateStep.js`; this task ports them as TypeScript Zod schemas. Compose returns `ReportSectionSchema` (already ported in Task 8).

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/schemas/debate-step.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  BullThesisSchema,
  BearInversionSchema,
  BullRebuttalSchema,
  JudgeVerdictSchema,
} from '../../src/agents/schemas/debate-step.js';

describe('BullThesisSchema', () => {
  it('accepts a valid bull with 5+ thesis points', () => {
    const valid = {
      step: 1, role: 'bull', agent: 'synthesis-writer-fullstory-bull',
      content: {
        thesisPoints: [1,2,3,4,5].map(n => ({ point: `p${n}`, evidence: `e${n}`, sourceSection: 's${n}` })),
        overallThesis: 'Strong thesis...',
      },
    };
    expect(() => BullThesisSchema.parse(valid)).not.toThrow();
  });

  it('rejects bull with fewer than 5 thesis points', () => {
    const bad = { step: 1, role: 'bull', agent: 'x', content: { thesisPoints: [], overallThesis: 'x' }};
    expect(() => BullThesisSchema.parse(bad)).toThrow();
  });
});

describe('BearInversionSchema', () => {
  it('accepts a valid bear with 1+ inversions', () => {
    const valid = {
      step: 2, role: 'bear', agent: 'risk-analyst-fullstory-bear',
      content: {
        inversions: [{
          targetPoint: 'p1', counterArgument: 'c1', evidence: 'e1',
          severity: 'thesis_killer', sources: ['url'],
        }],
        overallBearCase: 'Bear case...',
      },
    };
    expect(() => BearInversionSchema.parse(valid)).not.toThrow();
  });
});

describe('BullRebuttalSchema', () => {
  it('accepts a valid rebuttal with honest field', () => {
    const valid = {
      step: 3, role: 'bull_rebuttal', agent: 'synthesis-writer-fullstory-rebuttal',
      content: {
        rebuttals: [{
          bearPoint: 'p1', rebuttal: 'r1', rebuttalStrength: 'strong', honest: true,
        }],
      },
    };
    expect(() => BullRebuttalSchema.parse(valid)).not.toThrow();
  });
});

describe('JudgeVerdictSchema', () => {
  it('accepts a valid verdict with overallVerdict', () => {
    const valid = {
      step: 4, role: 'judge', agent: 'financial-analyst-fullstory-judge',
      content: {
        exchanges: [{
          topic: 't', bullStrength: 'strong', bearStrength: 'weak',
          verdict: 'Strong Bull', reasoning: '...',
        }],
        overallVerdict: {
          direction: 'Bull', unresolvedCount: 0, summary: 's', investmentImplication: 'i',
        },
      },
    };
    expect(() => JudgeVerdictSchema.parse(valid)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fails**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/schemas/debate-step
```

- [ ] **Step 3: Implement the schemas**

Create `agents-service/src/agents/schemas/debate-step.ts`:

```typescript
// Ported from src/schemas/debateStep.js (frontend) for use in agents-service.
// Shape is identical to the frontend Zod schema. Each role has its own schema —
// no shared union. The runner for each role references exactly one schema.

import { z } from 'zod';

// ─── Step 1: Bull Thesis ──────────────────────────────────────

export const BullThesisSchema = z.object({
  step: z.literal(1),
  role: z.literal('bull'),
  agent: z.string(),
  content: z.object({
    thesisPoints: z.array(z.object({
      point: z.string(),
      evidence: z.string(),
      sourceSection: z.string(),
    })).min(5),
    overallThesis: z.string(),
  }),
});
export type BullThesis = z.infer<typeof BullThesisSchema>;

// ─── Step 2: Bear Inversion ───────────────────────────────────

export const BearInversionSchema = z.object({
  step: z.literal(2),
  role: z.literal('bear'),
  agent: z.string(),
  content: z.object({
    inversions: z.array(z.object({
      targetPoint: z.string(),
      counterArgument: z.string(),
      evidence: z.string(),
      severity: z.enum(['thesis_killer', 'significant', 'minor']),
      sources: z.array(z.string()).optional().default([]),
    })).min(1),
    overallBearCase: z.string(),
  }),
});
export type BearInversion = z.infer<typeof BearInversionSchema>;

// ─── Step 3: Bull Rebuttal ────────────────────────────────────

export const BullRebuttalSchema = z.object({
  step: z.literal(3),
  role: z.literal('bull_rebuttal'),
  agent: z.string(),
  content: z.object({
    rebuttals: z.array(z.object({
      bearPoint: z.string(),
      rebuttal: z.string(),
      rebuttalStrength: z.enum(['strong', 'moderate', 'weak']),
      honest: z.boolean(),
    })).min(1),
  }),
});
export type BullRebuttal = z.infer<typeof BullRebuttalSchema>;

// ─── Step 4: Judge Verdict ────────────────────────────────────

export const JudgeVerdictSchema = z.object({
  step: z.literal(4),
  role: z.literal('judge'),
  agent: z.string(),
  content: z.object({
    exchanges: z.array(z.object({
      topic: z.string(),
      bullStrength: z.enum(['strong', 'moderate', 'weak']),
      bearStrength: z.enum(['strong', 'moderate', 'weak']),
      verdict: z.enum(['Strong Bull', 'Strong Bear', 'Unresolved']),
      reasoning: z.string(),
    })).min(1),
    overallVerdict: z.object({
      direction: z.enum(['Bull', 'Bear', 'Mixed']),
      unresolvedCount: z.number(),
      summary: z.string(),
      investmentImplication: z.string(),
    }),
  }),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;
```

- [ ] **Step 4: Run, verify passes**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/schemas/debate-step
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/schemas/debate-step.ts agents-service/tests/schemas/debate-step.test.ts
git commit -m "feat(agents-service): port debate-step Zod schemas (Bull/Bear/Rebuttal/Judge)"
```

---

### Task 18: FS Phase 1 runners — 5 deep-analysis section agents

**Files:**
- Create: `agents-service/src/agents/risk-analyst-fullstory-event.ts` (Section 1)
- Create: `agents-service/src/agents/business-analyst-fullstory.ts` (Section 2)
- Create: `agents-service/src/agents/competitor-evaluator-fullstory.ts` (Section 3)
- Create: `agents-service/src/agents/management-evaluator-fullstory.ts` (Section 4)
- Create: `agents-service/src/agents/valuation-specialist-fullstory.ts` (Section 5)
- Create: 5 corresponding test files

**Why this matters:** Phase 1 is 5 parallel agents producing FS Sections 1–5 (Event Analysis, Meaning Checklist, Moat Checklist, Management Checklist, Valuation Confirmation). All take DataPacket + the inherited completed Pitch Deck (`parentPitchDeck`) + cross-cutting findings inherited from PD. All return `ReportSectionSchema`. Only Risk Analyst (Event) uses web search and Opus; the other 4 are Sonnet without web search.

The 5 runners share an input shape:

```typescript
export interface FSPhase1Input {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  parentPitchDeck: unknown;
  crossCuttingFindings: import('./schemas/report-section.js').CrossCuttingFinding[];
}
```

Per-runner table:

| Runner | Prompt id | Model | Web search | Display name | Trace |
|---|---|---|---|---|---|
| `risk-analyst-fullstory-event.ts` | `risk-analyst-fullstory-event` | Opus | Yes (5) | "Risk Analyst — Event Analysis" | `fullstory.event-analysis` |
| `business-analyst-fullstory.ts` | `business-analyst-fullstory` | Sonnet | No | "Business Analyst" | `fullstory.meaning-checklist` |
| `competitor-evaluator-fullstory.ts` | `competitor-evaluator-fullstory` | Sonnet | No | "Competitor Evaluator" | `fullstory.moat-checklist` |
| `management-evaluator-fullstory.ts` | `management-evaluator-fullstory` | Sonnet | No | "Management Evaluator" | `fullstory.management-checklist` |
| `valuation-specialist-fullstory.ts` | `valuation-specialist-fullstory` | Sonnet | No | "Valuation Specialist" | `fullstory.valuation-confirmation` |

Each returns `ReportSectionSchema`. Section numbers are 1, 2, 3, 4, 5 respectively.

- [ ] **Step 1: Write the failing test for `risk-analyst-fullstory-event`**

Create `agents-service/tests/agents/risk-analyst-fullstory-event.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runRiskAnalystFullStoryEvent } = await import('../../src/agents/risk-analyst-fullstory-event.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-opus-4-7', tokenCost: { input: 1, output: 1 },
});

describe('runRiskAnalystFullStoryEvent', () => {
  it('uses Opus + web search, includes parent PD in userMessage', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(SECTION(1, 'Event Analysis'));

    const result = await runRiskAnalystFullStoryEvent({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: { dp: 1 },
      parentPitchDeck: { sections: [] },
      crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(1);
    expect(loadAgentPrompt).toHaveBeenCalledWith('risk-analyst-fullstory-event');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('## Parent Pitch Deck Report');
    expect(args.model).toBe('claude-opus-4-7');
    expect(args.maxWebSearches).toBe(5);
    expect(args.traceName).toBe('fullstory.event-analysis');
  });
});
```

- [ ] **Step 2: Run, verify fails**

- [ ] **Step 3: Implement `risk-analyst-fullstory-event`**

Create `agents-service/src/agents/risk-analyst-fullstory-event.ts`:

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface RiskAnalystFSEventInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  parentPitchDeck: unknown;
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-opus-4-7';

export async function runRiskAnalystFullStoryEvent(input: RiskAnalystFSEventInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('risk-analyst-fullstory-event');

  const userMessage =
    `Produce Full Story Section 1 (Event Analysis) for ${input.ticker}. Determine whether the recent ` +
    `price dislocation is temporary or structural. Use web search for short-seller theses, downgrades, ` +
    `and macro context. Return as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## Parent Pitch Deck Report (inherited)\n\n\`\`\`json\n${JSON.stringify(input.parentPitchDeck, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Pitch Deck\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'risk-analyst-fullstory-event');
  await progress.setStatus('running', {
    displayName: 'Risk Analyst — Event Analysis',
    wave: 1,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'EventAnalysisSection',
      schemaDescription: 'Emit Section 1 (Event Analysis) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'fullstory.event-analysis',
      traceMetadata: { ticker: input.ticker, runId: input.runId, phase: 1 },
      traceId: input.traceId,
      maxResearchTurns: 5,
      maxWebSearches: 5,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run, verify passes**

- [ ] **Step 5: Implement the 4 non-web-search Phase 1 runners + tests**

The remaining 4 (`business-analyst-fullstory`, `competitor-evaluator-fullstory`, `management-evaluator-fullstory`, `valuation-specialist-fullstory`) follow the EXACT same template as Step 3, with these differences:

For each, write a test file mirroring Step 1 (mock pattern + assert correct prompt id + correct model + `maxWebSearches: undefined`), then implement the runner. Below is the full code for each.

**`agents-service/tests/agents/business-analyst-fullstory.test.ts`:**

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runBusinessAnalystFullStory } = await import('../../src/agents/business-analyst-fullstory.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
});

describe('runBusinessAnalystFullStory', () => {
  it('uses Sonnet, no web search, returns Section 2', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(SECTION(2, 'Meaning Checklist'));

    const result = await runBusinessAnalystFullStory({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: {}, parentPitchDeck: {}, crossCuttingFindings: [],
    });

    expect(result.sectionNumber).toBe(2);
    expect(loadAgentPrompt).toHaveBeenCalledWith('business-analyst-fullstory');
    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(args.maxWebSearches).toBeUndefined();
    expect(args.traceName).toBe('fullstory.meaning-checklist');
  });
});
```

**`agents-service/src/agents/business-analyst-fullstory.ts`:**

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface BusinessAnalystFSInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  parentPitchDeck: unknown;
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runBusinessAnalystFullStory(input: BusinessAnalystFSInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('business-analyst-fullstory');

  const userMessage =
    `Produce Full Story Section 2 (Meaning Checklist — 15-point) for ${input.ticker}. Deepen business ` +
    `understanding from the Pitch Deck. No web search — work from the inherited PD report and DataPacket. ` +
    `Return as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## Parent Pitch Deck Report (inherited)\n\n\`\`\`json\n${JSON.stringify(input.parentPitchDeck, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Pitch Deck\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'business-analyst-fullstory');
  await progress.setStatus('running', {
    displayName: 'Business Analyst',
    wave: 1,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'MeaningChecklistSection',
      schemaDescription: 'Emit Section 2 (Meaning Checklist) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'fullstory.meaning-checklist',
      traceMetadata: { ticker: input.ticker, runId: input.runId, phase: 1 },
      traceId: input.traceId,
      maxResearchTurns: 1,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

**`agents-service/tests/agents/competitor-evaluator-fullstory.test.ts`:**

Same structure as `business-analyst-fullstory.test.ts`, replace `runBusinessAnalystFullStory` with `runCompetitorEvaluatorFullStory`, prompt id with `'competitor-evaluator-fullstory'`, traceName with `'fullstory.moat-checklist'`, section number with `3`, title with `'Moat Checklist'`.

**`agents-service/src/agents/competitor-evaluator-fullstory.ts`:**

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface CompetitorEvaluatorFSInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  parentPitchDeck: unknown;
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runCompetitorEvaluatorFullStory(input: CompetitorEvaluatorFSInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('competitor-evaluator-fullstory');

  const userMessage =
    `Produce Full Story Section 3 (Moat Checklist — 15-point) for ${input.ticker}. Validate competitive ` +
    `durability point by point against the Pitch Deck's moat assessment. No web search. ` +
    `Return as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## Parent Pitch Deck Report (inherited)\n\n\`\`\`json\n${JSON.stringify(input.parentPitchDeck, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Pitch Deck\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'competitor-evaluator-fullstory');
  await progress.setStatus('running', {
    displayName: 'Competitor Evaluator',
    wave: 1,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'MoatChecklistSection',
      schemaDescription: 'Emit Section 3 (Moat Checklist) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'fullstory.moat-checklist',
      traceMetadata: { ticker: input.ticker, runId: input.runId, phase: 1 },
      traceId: input.traceId,
      maxResearchTurns: 1,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

**`agents-service/src/agents/management-evaluator-fullstory.ts`:**

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface ManagementEvaluatorFSInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  parentPitchDeck: unknown;
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runManagementEvaluatorFullStory(input: ManagementEvaluatorFSInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('management-evaluator-fullstory');

  const userMessage =
    `Produce Full Story Section 4 (Management Checklist — 13-point) for ${input.ticker}. Assess ` +
    `leadership quality and integrity from the Pitch Deck's management view. No web search. ` +
    `Return as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## Parent Pitch Deck Report (inherited)\n\n\`\`\`json\n${JSON.stringify(input.parentPitchDeck, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Pitch Deck\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'management-evaluator-fullstory');
  await progress.setStatus('running', {
    displayName: 'Management Evaluator',
    wave: 1,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'ManagementChecklistSection',
      schemaDescription: 'Emit Section 4 (Management Checklist) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'fullstory.management-checklist',
      traceMetadata: { ticker: input.ticker, runId: input.runId, phase: 1 },
      traceId: input.traceId,
      maxResearchTurns: 1,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

**`agents-service/src/agents/valuation-specialist-fullstory.ts`:**

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
  type CrossCuttingFinding,
} from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface ValuationSpecialistFSInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  parentPitchDeck: unknown;
  crossCuttingFindings: CrossCuttingFinding[];
}

const MODEL = 'claude-sonnet-4-6';

export async function runValuationSpecialistFullStory(input: ValuationSpecialistFSInput): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('valuation-specialist-fullstory');

  const userMessage =
    `Produce Full Story Section 5 (Valuation Confirmation) for ${input.ticker}. Stress-test the Pitch ` +
    `Deck's valuation under varied FGR / MARR / margin assumptions; confirm or revise buy prices. ` +
    `No web search — work from inherited DP and PD. Return as a single ReportSection.\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## Parent Pitch Deck Report (inherited)\n\n\`\`\`json\n${JSON.stringify(input.parentPitchDeck, null, 2)}\n\`\`\`\n\n` +
    `## Cross-Cutting Findings From Pitch Deck\n\n\`\`\`json\n${JSON.stringify(input.crossCuttingFindings, null, 2)}\n\`\`\`\n`;

  const progress = new ProgressPublisher(input.runId, 'valuation-specialist-fullstory');
  await progress.setStatus('running', {
    displayName: 'Valuation Specialist',
    wave: 1,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'ValuationConfirmationSection',
      schemaDescription: 'Emit Section 5 (Valuation Confirmation) as a ReportSection.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'fullstory.valuation-confirmation',
      traceMetadata: { ticker: input.ticker, runId: input.runId, phase: 1 },
      traceId: input.traceId,
      maxResearchTurns: 1,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

For each of `competitor-evaluator-fullstory`, `management-evaluator-fullstory`, `valuation-specialist-fullstory`, also create a test file mirroring `business-analyst-fullstory.test.ts` (replace function name, prompt id, traceName, section number, title accordingly).

- [ ] **Step 6: Run all Phase 1 tests**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/agents/risk-analyst-fullstory-event tests/agents/business-analyst-fullstory tests/agents/competitor-evaluator-fullstory tests/agents/management-evaluator-fullstory tests/agents/valuation-specialist-fullstory
```

Expected: 5 PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/{risk-analyst-fullstory-event,business-analyst-fullstory,competitor-evaluator-fullstory,management-evaluator-fullstory,valuation-specialist-fullstory}.ts \
        agents-service/tests/agents/{risk-analyst-fullstory-event,business-analyst-fullstory,competitor-evaluator-fullstory,management-evaluator-fullstory,valuation-specialist-fullstory}.test.ts
git commit -m "feat(agents-service): FS Phase 1 runners (5 deep-analysis section agents)"
```

---

### Task 19: FS Phase 2 Step 1 — Bull (Synthesis Writer)

**Files:**
- Create: `agents-service/src/agents/synthesis-writer-fullstory-bull.ts`
- Create: `agents-service/tests/agents/synthesis-writer-fullstory-bull.test.ts`

**Why this matters:** Bull is the foundation of the debate. Reads the 5 Phase-1 section outputs and produces the strongest possible thesis. Output: `BullThesisSchema`. No web search. Sonnet.

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/agents/synthesis-writer-fullstory-bull.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runSynthesisWriterFullStoryBull } = await import('../../src/agents/synthesis-writer-fullstory-bull.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number, title: string) => ({
  key: `s${n}`, title, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
});

const STUB_BULL = {
  step: 1, role: 'bull', agent: 'synthesis-writer-fullstory-bull',
  content: {
    thesisPoints: [1,2,3,4,5].map(n => ({ point: `p${n}`, evidence: `e${n}`, sourceSection: 's${n}` })),
    overallThesis: 'Strong thesis...',
  },
};

describe('runSynthesisWriterFullStoryBull', () => {
  it('builds userMessage with 5 phase-1 section headers, returns BullThesis', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(STUB_BULL);

    const phase1Sections = [1,2,3,4,5].map(n => SECTION(n, `Section ${n}`));

    const result = await runSynthesisWriterFullStoryBull({
      ticker: 'AAPL', runId: 'r1', phase1Sections,
    });

    expect(result).toEqual(STUB_BULL);
    expect(loadAgentPrompt).toHaveBeenCalledWith('synthesis-writer-fullstory-bull');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    for (let n = 1; n <= 5; n++) {
      expect(args.userMessage).toContain(`### Section ${n}`);
    }
    expect(args.maxWebSearches).toBeUndefined();
    expect(args.traceName).toBe('fullstory.bull');
  });
});
```

- [ ] **Step 2: Run, verify fails**

- [ ] **Step 3: Implement**

Create `agents-service/src/agents/synthesis-writer-fullstory-bull.ts`:

```typescript
import { BullThesisSchema, type BullThesis } from './schemas/debate-step.js';
import type { ReportSection } from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface SynthesisWriterFSBullInput {
  ticker: string;
  runId: string;
  traceId?: string;
  phase1Sections: ReportSection[]; // S1 through S5
}

const MODEL = 'claude-sonnet-4-6';

export async function runSynthesisWriterFullStoryBull(input: SynthesisWriterFSBullInput): Promise<BullThesis> {
  const systemPrompt = await loadAgentPrompt('synthesis-writer-fullstory-bull');

  const sectionsBlock = input.phase1Sections
    .map(s => `### Section ${s.sectionNumber} — ${s.title}\n\`\`\`json\n${JSON.stringify(s, null, 2)}\n\`\`\``)
    .join('\n\n');

  const userMessage =
    `You are the BULL in the Full Story adversarial debate for ${input.ticker}. Synthesize Phase 1 ` +
    `Sections 1–5 into the strongest possible investment thesis. No web search — work from the section ` +
    `outputs. Return your output via emit_output as a BullThesis (step: 1, role: 'bull').\n\n` +
    `## Phase 1 Section Outputs\n\n${sectionsBlock}\n`;

  const progress = new ProgressPublisher(input.runId, 'synthesis-writer-fullstory-bull');
  await progress.setStatus('running', {
    displayName: 'Synthesis Writer — Bull',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: BullThesisSchema,
      schemaName: 'BullThesis',
      schemaDescription: 'Emit the bull thesis with at least 5 thesis points + overall thesis.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'fullstory.bull',
      traceMetadata: { ticker: input.ticker, runId: input.runId, phase: 2, step: 1 },
      traceId: input.traceId,
      maxResearchTurns: 1,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run, verify passes**

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/synthesis-writer-fullstory-bull.ts \
        agents-service/tests/agents/synthesis-writer-fullstory-bull.test.ts
git commit -m "feat(agents-service): FS Phase 2 Step 1 — Bull (Synthesis Writer)"
```

---

### Task 20: FS Phase 2 Step 2 — Bear (Risk Analyst, Opus, web search)

**Files:**
- Create: `agents-service/src/agents/risk-analyst-fullstory-bear.ts`
- Create: `agents-service/tests/agents/risk-analyst-fullstory-bear.test.ts`

**Why this matters:** Bear attacks the Bull thesis with cited counter-evidence. Web search ON. Opus. Output: `BearInversionSchema`.

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/agents/risk-analyst-fullstory-bear.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runRiskAnalystFullStoryBear } = await import('../../src/agents/risk-analyst-fullstory-bear.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION = (n: number) => ({
  key: `s${n}`, title: `S${n}`, sectionNumber: n,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
});

const STUB_BULL = {
  step: 1, role: 'bull', agent: 'synthesis-writer-fullstory-bull',
  content: { thesisPoints: [1,2,3,4,5].map(n => ({ point: `p${n}`, evidence: 'e', sourceSection: 's' })), overallThesis: 't' },
};
const STUB_BEAR = {
  step: 2, role: 'bear', agent: 'risk-analyst-fullstory-bear',
  content: { inversions: [{ targetPoint: 'p1', counterArgument: 'c', evidence: 'e', severity: 'significant', sources: [] }], overallBearCase: 'b' },
};

describe('runRiskAnalystFullStoryBear', () => {
  it('uses Opus, web search, includes bull thesis + phase 1 sections', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(STUB_BEAR);

    const result = await runRiskAnalystFullStoryBear({
      ticker: 'AAPL', runId: 'r1',
      dataPacket: {},
      phase1Sections: [1,2,3,4,5].map(SECTION),
      bullThesis: STUB_BULL as any,
    });

    expect(result).toEqual(STUB_BEAR);
    expect(loadAgentPrompt).toHaveBeenCalledWith('risk-analyst-fullstory-bear');

    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('## Bull Thesis');
    expect(args.userMessage).toContain('### Section 1');
    expect(args.model).toBe('claude-opus-4-7');
    expect(args.maxWebSearches).toBe(5);
    expect(args.traceName).toBe('fullstory.bear');
  });
});
```

- [ ] **Step 2: Run, verify fails**

- [ ] **Step 3: Implement**

Create `agents-service/src/agents/risk-analyst-fullstory-bear.ts`:

```typescript
import {
  BearInversionSchema,
  type BearInversion,
  type BullThesis,
} from './schemas/debate-step.js';
import type { ReportSection } from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface RiskAnalystFSBearInput {
  ticker: string;
  runId: string;
  traceId?: string;
  dataPacket: unknown;
  phase1Sections: ReportSection[];
  bullThesis: BullThesis;
}

const MODEL = 'claude-opus-4-7';

export async function runRiskAnalystFullStoryBear(input: RiskAnalystFSBearInput): Promise<BearInversion> {
  const systemPrompt = await loadAgentPrompt('risk-analyst-fullstory-bear');

  const sectionsBlock = input.phase1Sections
    .map(s => `### Section ${s.sectionNumber} — ${s.title}\n\`\`\`json\n${JSON.stringify(s, null, 2)}\n\`\`\``)
    .join('\n\n');

  const userMessage =
    `You are the BEAR in the Full Story adversarial debate for ${input.ticker}. The bull has presented ` +
    `a thesis. Attack every point with cited counter-evidence. Use web search to find short-seller ` +
    `theses, downgrades, and bear cases. Return as a BearInversion.\n\n` +
    `## Bull Thesis\n\n\`\`\`json\n${JSON.stringify(input.bullThesis, null, 2)}\n\`\`\`\n\n` +
    `## DataPacket\n\n\`\`\`json\n${JSON.stringify(input.dataPacket, null, 2)}\n\`\`\`\n\n` +
    `## Phase 1 Section Outputs\n\n${sectionsBlock}\n`;

  const progress = new ProgressPublisher(input.runId, 'risk-analyst-fullstory-bear');
  await progress.setStatus('running', {
    displayName: 'Risk Analyst — Bear',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: BearInversionSchema,
      schemaName: 'BearInversion',
      schemaDescription: 'Emit the bear inversion with at least 1 inversion + overall bear case.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'fullstory.bear',
      traceMetadata: { ticker: input.ticker, runId: input.runId, phase: 2, step: 2 },
      traceId: input.traceId,
      maxResearchTurns: 5,
      maxWebSearches: 5,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run, verify passes**

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/risk-analyst-fullstory-bear.ts \
        agents-service/tests/agents/risk-analyst-fullstory-bear.test.ts
git commit -m "feat(agents-service): FS Phase 2 Step 2 — Bear (Risk Analyst, Opus, web search)"
```

---

### Task 21: FS Phase 2 Steps 3 + 4 — Rebuttal + Judge

**Files:**
- Create: `agents-service/src/agents/synthesis-writer-fullstory-rebuttal.ts`
- Create: `agents-service/src/agents/financial-analyst-fullstory-judge.ts`
- Create: 2 corresponding test files

**Why this matters:** Rebuttal responds to bear with web-search-symmetric evidence (per EXP-003). Judge scores impartially with no web search.

- [ ] **Step 1: Implement Rebuttal runner + test**

Create `agents-service/tests/agents/synthesis-writer-fullstory-rebuttal.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runSynthesisWriterFullStoryRebuttal } = await import('../../src/agents/synthesis-writer-fullstory-rebuttal.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const STUB = {
  step: 3, role: 'bull_rebuttal', agent: 'synthesis-writer-fullstory-rebuttal',
  content: { rebuttals: [{ bearPoint: 'p', rebuttal: 'r', rebuttalStrength: 'strong', honest: true }] },
};

describe('runSynthesisWriterFullStoryRebuttal', () => {
  it('uses web search (symmetric per EXP-003), includes bull + bear in userMessage', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(STUB);

    const result = await runSynthesisWriterFullStoryRebuttal({
      ticker: 'AAPL', runId: 'r1',
      phase1Sections: [],
      bullThesis: { step: 1, role: 'bull', agent: 'b', content: { thesisPoints: [], overallThesis: '' } } as any,
      bearInversion: { step: 2, role: 'bear', agent: 'b', content: { inversions: [], overallBearCase: '' } } as any,
    });

    expect(result).toEqual(STUB);
    expect(loadAgentPrompt).toHaveBeenCalledWith('synthesis-writer-fullstory-rebuttal');
    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('## Bull Thesis');
    expect(args.userMessage).toContain('## Bear Inversion');
    expect(args.maxWebSearches).toBe(3);
    expect(args.traceName).toBe('fullstory.rebuttal');
  });
});
```

Create `agents-service/src/agents/synthesis-writer-fullstory-rebuttal.ts`:

```typescript
import {
  BullRebuttalSchema,
  type BullRebuttal,
  type BullThesis,
  type BearInversion,
} from './schemas/debate-step.js';
import type { ReportSection } from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface SynthesisWriterFSRebuttalInput {
  ticker: string;
  runId: string;
  traceId?: string;
  phase1Sections: ReportSection[];
  bullThesis: BullThesis;
  bearInversion: BearInversion;
}

const MODEL = 'claude-sonnet-4-6';

export async function runSynthesisWriterFullStoryRebuttal(
  input: SynthesisWriterFSRebuttalInput,
): Promise<BullRebuttal> {
  const systemPrompt = await loadAgentPrompt('synthesis-writer-fullstory-rebuttal');

  const sectionsBlock = input.phase1Sections
    .map(s => `### Section ${s.sectionNumber} — ${s.title}\n\`\`\`json\n${JSON.stringify(s, null, 2)}\n\`\`\``)
    .join('\n\n');

  const userMessage =
    `You are the BULL REBUTTAL in the Full Story adversarial debate for ${input.ticker}. Respond to ` +
    `each bear inversion with evidence-based counter-arguments. Use web search for already-priced-in ` +
    `context and supporting evidence (symmetric tooling per EXP-003). Be honest — mark weak rebuttals ` +
    `as ` + "`honest: true`" + `. Return as a BullRebuttal.\n\n` +
    `## Bull Thesis\n\n\`\`\`json\n${JSON.stringify(input.bullThesis, null, 2)}\n\`\`\`\n\n` +
    `## Bear Inversion\n\n\`\`\`json\n${JSON.stringify(input.bearInversion, null, 2)}\n\`\`\`\n\n` +
    `## Phase 1 Section Outputs\n\n${sectionsBlock}\n`;

  const progress = new ProgressPublisher(input.runId, 'synthesis-writer-fullstory-rebuttal');
  await progress.setStatus('running', {
    displayName: 'Synthesis Writer — Rebuttal',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: BullRebuttalSchema,
      schemaName: 'BullRebuttal',
      schemaDescription: 'Emit the bull rebuttal with at least 1 rebuttal.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'fullstory.rebuttal',
      traceMetadata: { ticker: input.ticker, runId: input.runId, phase: 2, step: 3 },
      traceId: input.traceId,
      maxResearchTurns: 3,
      maxWebSearches: 3,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 2: Run Rebuttal test, verify passes**

- [ ] **Step 3: Implement Judge runner + test**

Create `agents-service/tests/agents/financial-analyst-fullstory-judge.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runFinancialAnalystFullStoryJudge } = await import('../../src/agents/financial-analyst-fullstory-judge.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const STUB = {
  step: 4, role: 'judge', agent: 'financial-analyst-fullstory-judge',
  content: {
    exchanges: [{ topic: 't', bullStrength: 'strong', bearStrength: 'weak', verdict: 'Strong Bull', reasoning: 'r' }],
    overallVerdict: { direction: 'Bull', unresolvedCount: 0, summary: 's', investmentImplication: 'i' },
  },
};

describe('runFinancialAnalystFullStoryJudge', () => {
  it('no web search, includes all 3 prior debate outputs', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(STUB);

    const result = await runFinancialAnalystFullStoryJudge({
      ticker: 'AAPL', runId: 'r1',
      phase1Sections: [],
      bullThesis: { step: 1, role: 'bull', agent: 'b', content: { thesisPoints: [], overallThesis: '' } } as any,
      bearInversion: { step: 2, role: 'bear', agent: 'b', content: { inversions: [], overallBearCase: '' } } as any,
      bullRebuttal: { step: 3, role: 'bull_rebuttal', agent: 'r', content: { rebuttals: [] } } as any,
    });

    expect(result).toEqual(STUB);
    expect(loadAgentPrompt).toHaveBeenCalledWith('financial-analyst-fullstory-judge');
    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('## Bull Thesis');
    expect(args.userMessage).toContain('## Bear Inversion');
    expect(args.userMessage).toContain('## Bull Rebuttal');
    expect(args.maxWebSearches).toBeUndefined();
    expect(args.traceName).toBe('fullstory.judge');
  });
});
```

Create `agents-service/src/agents/financial-analyst-fullstory-judge.ts`:

```typescript
import {
  JudgeVerdictSchema,
  type JudgeVerdict,
  type BullThesis,
  type BearInversion,
  type BullRebuttal,
} from './schemas/debate-step.js';
import type { ReportSection } from './schemas/report-section.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface FinancialAnalystFSJudgeInput {
  ticker: string;
  runId: string;
  traceId?: string;
  phase1Sections: ReportSection[];
  bullThesis: BullThesis;
  bearInversion: BearInversion;
  bullRebuttal: BullRebuttal;
}

const MODEL = 'claude-sonnet-4-6';

export async function runFinancialAnalystFullStoryJudge(
  input: FinancialAnalystFSJudgeInput,
): Promise<JudgeVerdict> {
  const systemPrompt = await loadAgentPrompt('financial-analyst-fullstory-judge');

  const sectionsBlock = input.phase1Sections
    .map(s => `### Section ${s.sectionNumber} — ${s.title}\n\`\`\`json\n${JSON.stringify(s, null, 2)}\n\`\`\``)
    .join('\n\n');

  const userMessage =
    `You are the JUDGE in the Full Story adversarial debate for ${input.ticker}. Score each exchange ` +
    `between bull and bear impartially. No web search — judge the evidence as presented. Return as ` +
    `a JudgeVerdict.\n\n` +
    `## Bull Thesis\n\n\`\`\`json\n${JSON.stringify(input.bullThesis, null, 2)}\n\`\`\`\n\n` +
    `## Bear Inversion\n\n\`\`\`json\n${JSON.stringify(input.bearInversion, null, 2)}\n\`\`\`\n\n` +
    `## Bull Rebuttal\n\n\`\`\`json\n${JSON.stringify(input.bullRebuttal, null, 2)}\n\`\`\`\n\n` +
    `## Phase 1 Section Outputs (reference)\n\n${sectionsBlock}\n`;

  const progress = new ProgressPublisher(input.runId, 'financial-analyst-fullstory-judge');
  await progress.setStatus('running', {
    displayName: 'Financial Analyst — Judge',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: JudgeVerdictSchema,
      schemaName: 'JudgeVerdict',
      schemaDescription: 'Emit the judge verdict scoring all exchanges + overall direction.',
      model: MODEL,
      maxTokens: 8000,
      traceName: 'fullstory.judge',
      traceMetadata: { ticker: input.ticker, runId: input.runId, phase: 2, step: 4 },
      traceId: input.traceId,
      maxResearchTurns: 1,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run both tests, verify pass**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test -- tests/agents/synthesis-writer-fullstory-rebuttal tests/agents/financial-analyst-fullstory-judge
```

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/{synthesis-writer-fullstory-rebuttal,financial-analyst-fullstory-judge}.ts \
        agents-service/tests/agents/{synthesis-writer-fullstory-rebuttal,financial-analyst-fullstory-judge}.test.ts
git commit -m "feat(agents-service): FS Phase 2 Steps 3 + 4 — Rebuttal + Judge"
```

---

### Task 22: FS Phase 2 Compose — final Section 6

**Files:**
- Create: `agents-service/src/agents/synthesis-writer-fullstory-compose.ts`
- Create: `agents-service/tests/agents/synthesis-writer-fullstory-compose.test.ts`

**Why this matters:** Compose weaves Bull + Bear + Rebuttal + Judge into a Buffett-style narrative as the final Section 6 (`ReportSectionSchema`). No web search. Sonnet.

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/agents/synthesis-writer-fullstory-compose.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));
vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));
vi.mock('../../src/lib/worker-progress.js', () => ({
  ProgressPublisher: vi.fn().mockImplementation(() => ({
    setStatus: vi.fn().mockResolvedValue(undefined),
    setPhase: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    setRunTokens: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { runSynthesisWriterFullStoryCompose } = await import('../../src/agents/synthesis-writer-fullstory-compose.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const { loadAgentPrompt } = await import('../../src/agents/prompts.js');

const SECTION_6 = {
  key: 'inversion_rebuttal', title: 'Inversion & Rebuttal', sectionNumber: 6,
  status: 'pass', confidence: 'HIGH', verdict: 'PASS',
  verdictRationale: '.', summary: '.', data: '{}', narrative: '.',
  citations: [], tables: [], charts: [],
  redFlags: ['x'], primarySourceInsights: [], crossCuttingFindings: [], questions: [],
  modelUsed: 'claude-sonnet-4-6', tokenCost: { input: 1, output: 1 },
};

describe('runSynthesisWriterFullStoryCompose', () => {
  it('returns Section 6 ReportSection, includes all 4 debate outputs in userMessage', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce(SECTION_6);

    const result = await runSynthesisWriterFullStoryCompose({
      ticker: 'AAPL', runId: 'r1',
      phase1Sections: [],
      bullThesis: { step: 1, role: 'bull', agent: 'b', content: { thesisPoints: [], overallThesis: '' } } as any,
      bearInversion: { step: 2, role: 'bear', agent: 'b', content: { inversions: [], overallBearCase: '' } } as any,
      bullRebuttal: { step: 3, role: 'bull_rebuttal', agent: 'r', content: { rebuttals: [] } } as any,
      judgeVerdict: { step: 4, role: 'judge', agent: 'j', content: { exchanges: [], overallVerdict: { direction: 'Bull', unresolvedCount: 0, summary: '', investmentImplication: '' } } } as any,
    });

    expect(result.sectionNumber).toBe(6);
    expect(loadAgentPrompt).toHaveBeenCalledWith('synthesis-writer-fullstory-compose');
    const args = (callAgentWithStructuredOutput as any).mock.calls[0][0];
    expect(args.userMessage).toContain('## Bull Thesis');
    expect(args.userMessage).toContain('## Bear Inversion');
    expect(args.userMessage).toContain('## Bull Rebuttal');
    expect(args.userMessage).toContain('## Judge Verdict');
    expect(args.maxWebSearches).toBeUndefined();
    expect(args.traceName).toBe('fullstory.compose');
  });
});
```

- [ ] **Step 2: Run, verify fails**

- [ ] **Step 3: Implement**

Create `agents-service/src/agents/synthesis-writer-fullstory-compose.ts`:

```typescript
import {
  ReportSectionSchema,
  type ReportSection,
} from './schemas/report-section.js';
import type {
  BullThesis,
  BearInversion,
  BullRebuttal,
  JudgeVerdict,
} from './schemas/debate-step.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';
import { ProgressPublisher } from '../lib/worker-progress.js';

export interface SynthesisWriterFSComposeInput {
  ticker: string;
  runId: string;
  traceId?: string;
  phase1Sections: ReportSection[];
  bullThesis: BullThesis;
  bearInversion: BearInversion;
  bullRebuttal: BullRebuttal;
  judgeVerdict: JudgeVerdict;
}

const MODEL = 'claude-sonnet-4-6';

export async function runSynthesisWriterFullStoryCompose(
  input: SynthesisWriterFSComposeInput,
): Promise<ReportSection> {
  const systemPrompt = await loadAgentPrompt('synthesis-writer-fullstory-compose');

  const sectionsBlock = input.phase1Sections
    .map(s => `### Section ${s.sectionNumber} — ${s.title}\n\`\`\`json\n${JSON.stringify(s, null, 2)}\n\`\`\``)
    .join('\n\n');

  const userMessage =
    `You are COMPOSING the final Section 6 (Inversion & Rebuttal) of the Full Story for ${input.ticker}. ` +
    `Weave the four debate outputs into a Buffett-style narrative the portfolio manager will read. No ` +
    `web search — assembly only. Return as a single ReportSection with key "inversion_rebuttal", ` +
    `sectionNumber 6.\n\n` +
    `## Bull Thesis\n\n\`\`\`json\n${JSON.stringify(input.bullThesis, null, 2)}\n\`\`\`\n\n` +
    `## Bear Inversion\n\n\`\`\`json\n${JSON.stringify(input.bearInversion, null, 2)}\n\`\`\`\n\n` +
    `## Bull Rebuttal\n\n\`\`\`json\n${JSON.stringify(input.bullRebuttal, null, 2)}\n\`\`\`\n\n` +
    `## Judge Verdict\n\n\`\`\`json\n${JSON.stringify(input.judgeVerdict, null, 2)}\n\`\`\`\n\n` +
    `## Phase 1 Section Outputs (reference)\n\n${sectionsBlock}\n`;

  const progress = new ProgressPublisher(input.runId, 'synthesis-writer-fullstory-compose');
  await progress.setStatus('running', {
    displayName: 'Synthesis Writer — Compose',
    wave: 2,
    startedAt: new Date().toISOString(),
  });

  try {
    const output = await callAgentWithStructuredOutput({
      systemPrompt,
      userMessage,
      schema: ReportSectionSchema,
      schemaName: 'InversionRebuttalSection',
      schemaDescription: 'Emit Section 6 (Inversion & Rebuttal) as a ReportSection.',
      model: MODEL,
      maxTokens: 12000,
      traceName: 'fullstory.compose',
      traceMetadata: { ticker: input.ticker, runId: input.runId, phase: 2, step: 'compose' },
      traceId: input.traceId,
      maxResearchTurns: 1,
      progress,
    });
    await progress.setStatus('completed', { finishedAt: new Date().toISOString() });
    return output;
  } catch (err) {
    await progress.setStatus('failed', {
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run, verify passes**

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/agents/synthesis-writer-fullstory-compose.ts \
        agents-service/tests/agents/synthesis-writer-fullstory-compose.test.ts
git commit -m "feat(agents-service): FS Phase 2 Compose — final Section 6"
```

---

# PHASE E — Full Story Inngest Function (Tasks 23–24)

**Phase E goal:** A deployed FS Inngest function with Phase 1 parallel + Phase 2 sequential debate, plus the frontend dispatch hook.

---

### Task 23: Full Story Inngest function

**Files:**
- Create: `agents-service/src/inngest/functions/full-story.ts`
- Modify: `agents-service/src/inngest/functions/index.ts`

**Why this matters:** Smaller surface than PD (no findings aggregation between sections — Phase 1 agents work against the same parent PD). Phase 2 has strict sequential ordering with each step in its own `step.run` for retry isolation.

- [ ] **Step 1: Implement the FS function**

Create `agents-service/src/inngest/functions/full-story.ts`:

```typescript
import { inngest } from '../client.js';
import { fetchAssembly } from '../../lib/r2-fetch.js';
import { ProgressPublisher } from '../../lib/worker-progress.js';
import { postCallback } from '../../lib/worker-callback.js';
import { flushLangfuse } from '../../lib/langfuse-client.js';
import type { CrossCuttingFinding } from '../../agents/schemas/report-section.js';

import { runRiskAnalystFullStoryEvent } from '../../agents/risk-analyst-fullstory-event.js';
import { runBusinessAnalystFullStory } from '../../agents/business-analyst-fullstory.js';
import { runCompetitorEvaluatorFullStory } from '../../agents/competitor-evaluator-fullstory.js';
import { runManagementEvaluatorFullStory } from '../../agents/management-evaluator-fullstory.js';
import { runValuationSpecialistFullStory } from '../../agents/valuation-specialist-fullstory.js';

import { runSynthesisWriterFullStoryBull } from '../../agents/synthesis-writer-fullstory-bull.js';
import { runRiskAnalystFullStoryBear } from '../../agents/risk-analyst-fullstory-bear.js';
import { runSynthesisWriterFullStoryRebuttal } from '../../agents/synthesis-writer-fullstory-rebuttal.js';
import { runFinancialAnalystFullStoryJudge } from '../../agents/financial-analyst-fullstory-judge.js';
import { runSynthesisWriterFullStoryCompose } from '../../agents/synthesis-writer-fullstory-compose.js';

export const fullStoryFn = inngest.createFunction(
  {
    id: 'full-story',
    retries: 3,
    timeouts: { finish: '60m' },
    onFailure: async ({ event, error }) => {
      const runId = (event as any).data?.event?.data?.runId;
      if (runId) {
        await postCallback({ runId, status: 'failed', error: error.message });
      }
    },
  },
  { event: 'thes1s/fullstory.start' },
  async ({ event, step }) => {
    const { runId, ticker } = event.data;
    const traceId = event.id ?? runId;
    const runPub = new ProgressPublisher(runId, '__run__');

    // ─── Step: Fetch inputs ───────────────────────────────────────────────
    const { dataPacket, parentPitchDeck } = await step.run('fetch-inputs', async () => {
      await runPub.setPhase('fetching-inputs', 'Loading DataPacket and parent Pitch Deck');
      const [dp, pd] = await Promise.all([
        fetchAssembly<unknown>(runId, 'datapacket'),
        fetchAssembly<unknown>(runId, 'parent-report'),
      ]);
      return { dataPacket: dp, parentPitchDeck: pd };
    });

    const inheritedFindings = collectFindingsFromParent(parentPitchDeck);

    // ─── Phase 1 — Deep Analysis (5 agents parallel) ──────────────────────
    await runPub.setPhase('phase-1-deep-analysis', 'Phase 1: 5 parallel deep-analysis sections');
    const baseInput = {
      ticker, runId, traceId, dataPacket, parentPitchDeck,
      crossCuttingFindings: inheritedFindings,
    };
    const [sec1, sec2, sec3, sec4, sec5] = await Promise.all([
      step.run('phase-1-event-analysis',     () => runRiskAnalystFullStoryEvent(baseInput)),
      step.run('phase-1-meaning-checklist',  () => runBusinessAnalystFullStory(baseInput)),
      step.run('phase-1-moat-checklist',     () => runCompetitorEvaluatorFullStory(baseInput)),
      step.run('phase-1-management-checklist', () => runManagementEvaluatorFullStory(baseInput)),
      step.run('phase-1-valuation-confirmation', () => runValuationSpecialistFullStory(baseInput)),
    ]);

    const phase1Sections = [sec1, sec2, sec3, sec4, sec5];

    // ─── Phase 2 — Adversarial Debate (sequential) ────────────────────────
    await runPub.setPhase('phase-2-debate', 'Phase 2: Adversarial debate');

    const bullThesis = await step.run('phase-2-bull', () =>
      runSynthesisWriterFullStoryBull({ ticker, runId, traceId, phase1Sections }));

    const bearInversion = await step.run('phase-2-bear', () =>
      runRiskAnalystFullStoryBear({
        ticker, runId, traceId, dataPacket, phase1Sections, bullThesis,
      }));

    const bullRebuttal = await step.run('phase-2-rebuttal', () =>
      runSynthesisWriterFullStoryRebuttal({
        ticker, runId, traceId, phase1Sections, bullThesis, bearInversion,
      }));

    const judgeVerdict = await step.run('phase-2-judge', () =>
      runFinancialAnalystFullStoryJudge({
        ticker, runId, traceId, phase1Sections, bullThesis, bearInversion, bullRebuttal,
      }));

    const sec6 = await step.run('phase-2-compose', () =>
      runSynthesisWriterFullStoryCompose({
        ticker, runId, traceId, phase1Sections,
        bullThesis, bearInversion, bullRebuttal, judgeVerdict,
      }));

    // ─── Final assembly + callback ────────────────────────────────────────
    const finalReport = {
      ticker,
      pipelineStage: 'full-story' as const,
      generatedAt: new Date().toISOString(),
      sections: [sec1, sec2, sec3, sec4, sec5, sec6],
      overallVerdict: sec6.verdict,
      // Preserve the raw debate outputs in the final report.
      // Brainstorm 3 decides whether to surface them in the renderer.
      debate: { bullThesis, bearInversion, bullRebuttal, judgeVerdict },
    };

    await step.run('post-callback', async () => {
      await runPub.setPhase('finalizing', 'Saving the report');
      await postCallback({ runId, status: 'completed', result: finalReport });
      await runPub.setPhase('completed', 'Completed');
    });

    await flushLangfuse();
    return { runId, ticker, sections: finalReport.sections.length };
  }
);

/** Inherit cross-cutting findings from the completed parent PD report. */
function collectFindingsFromParent(parentPitchDeck: any): CrossCuttingFinding[] {
  const sections = parentPitchDeck?.sections ?? [];
  const all: CrossCuttingFinding[] = [];
  for (const s of sections) {
    if (Array.isArray(s.crossCuttingFindings)) {
      all.push(...s.crossCuttingFindings);
    }
  }
  return all;
}
```

- [ ] **Step 2: Register the function**

Replace `agents-service/src/inngest/functions/index.ts`:

```typescript
import { helloWorld } from './hello-world.js';
import { onePagerFn } from './one-pager.js';
import { pitchDeckFn } from './pitch-deck.js';
import { fullStoryFn } from './full-story.js';

export const functions = [helloWorld, onePagerFn, pitchDeckFn, fullStoryFn] as const;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm run typecheck
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer/agents-service && npm test
```

Expected: all PASS (~25 test files: original OP tests + new schema tests + 20 runner tests + aggregator).

- [ ] **Step 5: Deploy + sync Inngest**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
fly deploy . --config agents-service/fly.toml
```

Verify in app.inngest.com → Apps → thes1s-agents → 4 functions: hello-world + one-pager + pitch-deck + **full-story**.

If full-story doesn't appear:

```bash
curl -X PUT https://thes1s-agents.fly.dev/api/inngest
```

- [ ] **Step 6: Smoke test end-to-end (requires a completed PD)**

You need a completed `reportId` from a successful PD run (use the runId from Task 15 Step 9 if it completed, or run a fresh one). In DevTools:

```javascript
const fs = await fetch('/api/v3/pipeline/fullstory/start', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticker: 'AAPL', parentReportId: '<paste PD reportId here>' }),
}).then(r => r.json());
console.log('FS runId:', fs.runId);
```

Watch Inngest dashboard for ~25–30 minutes. After completion:

```javascript
const status = await fetch(`/api/v3/pipeline/status/${fs.runId}`, { credentials: 'include' }).then(r => r.json());
console.log(status.status, status.result?.sections?.length, 'debate keys:', Object.keys(status.result?.debate ?? {}));
```

Expected: `'completed'`, `6` sections, debate keys: `['bullThesis', 'bearInversion', 'bullRebuttal', 'judgeVerdict']`.

- [ ] **Step 7: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-service/src/inngest/functions/{full-story.ts,index.ts}
git commit -m "feat(agents-service): Full Story Inngest function (Phase 1 parallel + Phase 2 sequential debate)"
```

---

### Task 24: Frontend dispatch hook for Full Story v3

**Files:**
- Create: `src/hooks/useGenerateFullStoryV3.js`

**Why this matters:** Same pattern as Task 16 — dispatch only, no rendering. Brainstorm 3 owns the UI.

- [ ] **Step 1: Create the hook**

Create `src/hooks/useGenerateFullStoryV3.js`:

```javascript
import { useState, useCallback } from 'react';
import { API_BASE } from '../engines/apiBase.js';

/**
 * v3 Full Story dispatch hook. Calls the Worker start route, returns { runId, reportId, status }.
 * Requires a completed parent Pitch Deck reportId.
 * Does NOT poll status or render the report — Brainstorm 3 owns the live-running and completed-report UI.
 */
export function useGenerateFullStoryV3() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = useCallback(async (ticker, parentReportId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v3/pipeline/fullstory/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, parentReportId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, error };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add src/hooks/useGenerateFullStoryV3.js
git commit -m "feat(frontend): useGenerateFullStoryV3 dispatch hook"
```

---

# PHASE F — Reliability + Cleanup + Sign-off (Tasks 25–28)

**Phase F goal:** Final reliability audit pass on all 21 prompts. Documentation updated. Post-cutover deletion tracked. **USER ACTION** smoke check signs off the plan and hands off to Brainstorm 3 for the UI.

---

### Task 25: Reliability audit — re-read every prompt with the runner contract in mind

**Files:**
- Modify: any `agents-v2/*-pitchdeck/prompt.md`, `agents-v2/*-fullstory/prompt.md`, `agents-v2/annual-reader/prompt.md`, `agents-v2/quarterly-reader/prompt.md`, `agents-v2/one-pager/prompt.md` that fail the audit checklist

**Why this matters:** Reliability strategy is "engineer for success." Now that runners exist and we know exactly what userMessage shape each agent sees, every prompt must match: schema described, output example present, role explicit, redFlags mandate present. Failures here translate directly into agent failures in production, which is the thing we explicitly engineered against.

- [ ] **Step 1: For each of the 21 prompts, run this checklist**

Open each prompt and verify:

| Check | What to look for |
|---|---|
| **Role at top** | Does the first paragraph state the role unambiguously? "You are X, producing Y for Z." |
| **Schema described** | Is the output schema referenced — at least the section keys, sectionNumber, status enum? Or for debate roles, is the debate-step shape described? |
| **Output format example** | Does the prompt include a concrete "Example output" JSON block matching the schema? If not, ADD ONE. This single change drives schema-failure rates down dramatically. |
| **Input shape known** | Does the prompt's "Your Input" section match the runner's userMessage layout? E.g., are `## DataPacket`, `## PSR Findings`, `## Section N` headers documented? |
| **Web Search Fallback** | Present unmodified for the 9 web-search-using agents. (See list below.) |
| **No filesystem references** | `/workspace/` gone. No "Coordinator will write your output to..." sentences. |
| **Red-flag mandate** | "Always include at least one red flag" present (matches `redFlags: z.array(z.string()).min(1)`). |

Web-search-using agents (must have Web Search Fallback section):
- `one-pager`
- `business-analyst-pitchdeck`
- `financial-analyst-pitchdeck`
- `management-evaluator-pitchdeck`
- `risk-analyst-pitchdeck`
- `valuation-specialist-pitchdeck`
- `competitor-evaluator-market-position-pitchdeck`
- `competitor-evaluator-moats-pitchdeck`
- `risk-analyst-fullstory-event`
- `risk-analyst-fullstory-bear`
- `synthesis-writer-fullstory-rebuttal`

Non-web-search agents (must NOT have it):
- `annual-reader`, `quarterly-reader`, `synthesis-writer-pitchdeck`
- `business-analyst-fullstory`, `competitor-evaluator-fullstory`, `management-evaluator-fullstory`, `valuation-specialist-fullstory`
- `synthesis-writer-fullstory-bull`, `financial-analyst-fullstory-judge`, `synthesis-writer-fullstory-compose`

- [ ] **Step 2: Verify Web Search Fallback present everywhere it should be**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
echo "=== Should have Web Search Fallback ==="
for p in one-pager business-analyst-pitchdeck financial-analyst-pitchdeck management-evaluator-pitchdeck risk-analyst-pitchdeck valuation-specialist-pitchdeck competitor-evaluator-market-position-pitchdeck competitor-evaluator-moats-pitchdeck risk-analyst-fullstory-event risk-analyst-fullstory-bear synthesis-writer-fullstory-rebuttal; do
  count=$(grep -c "^## Web Search Fallback" "agents-v2/$p/prompt.md" 2>/dev/null || echo "FILE_MISSING")
  echo "$count  $p"
done

echo "=== Should NOT have Web Search Fallback ==="
for p in annual-reader quarterly-reader synthesis-writer-pitchdeck business-analyst-fullstory competitor-evaluator-fullstory management-evaluator-fullstory valuation-specialist-fullstory synthesis-writer-fullstory-bull financial-analyst-fullstory-judge synthesis-writer-fullstory-compose; do
  count=$(grep -c "^## Web Search Fallback" "agents-v2/$p/prompt.md" 2>/dev/null || echo "FILE_MISSING")
  echo "$count  $p"
done
```

Expected: first block all `1`, second block all `0`. Any mismatch is a fix.

- [ ] **Step 3: Verify no `/workspace/` references survived in any v3 prompt**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
grep -rn "/workspace/" agents-v2/one-pager/ agents-v2/*-pitchdeck/ agents-v2/*-fullstory/ agents-v2/annual-reader/ agents-v2/quarterly-reader/ \
  | grep -v DEPRECATED \
  || echo "CLEAN"
```

Expected: prints `CLEAN`. (Deprecated parent prompts may still have refs and that's allowed — they aren't loaded.)

- [ ] **Step 4: Spot-check a high-risk prompt by eye**

Open the most complex prompt (`risk-analyst-fullstory-bear/prompt.md` is a good candidate — Opus, web search, debate role, multi-input). Read it end to end. Ask yourself:
- If I were the model, do I know exactly which schema to emit?
- Are the input headers (`## Bull Thesis`, `## Phase 1 Section Outputs`) explicitly mentioned in the prompt's "Your Input" section?
- Do I see at least one example of the expected output JSON?
- Does the role ambiguity from the parent prompt linger anywhere ("when you are the bear..." vs "your role is bear")?

Fix anything that fails this read.

- [ ] **Step 5: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-v2/
git commit -m "chore(agents-v2): reliability audit pass on 21 v3 prompts"
```

---

### Task 26: Documentation update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `agents-service/README.md`

**Why this matters:** Future you (or future Claude) needs to see PD/FS v3 documented alongside the existing OP entry.

- [ ] **Step 1: Update the "v3 Pipeline" section of CLAUDE.md**

Open `CLAUDE.md` and find the `## v3 Pipeline (Inngest + Fly + Direct Anthropic SDK)` section. Replace the existing `**Status (2026-05-02):** ...` paragraph with:

```markdown
**Status (2026-05-03):** All three stages live in v3 backend (One Pager, Pitch Deck, Full Story). Frontend dispatch hooks exist (`useGenerateOnePagerV3`, `useGeneratePitchDeckV3`, `useGenerateFullStoryV3`); the live-running and completed-report renderers are designed in Brainstorm 3 (UI not yet shipped to users).

**v3 stages:**
- **One Pager** — single Anthropic call (Sonnet, web search). ~3–5 min with web search.
- **Pitch Deck** — 1 Inngest function; 5 waves of agents (10 specialists total) with per-agent `step.run` retry isolation; cross-cutting findings aggregated between waves. ~30–45 min.
- **Full Story** — 1 Inngest function; Phase 1 parallel (5 deep-analysis agents) + Phase 2 sequential adversarial debate (Bull → Bear → Rebuttal → Judge → Compose). ~25–40 min. Inherits the parent Pitch Deck (no PSR re-run).

**Inngest events:**
- `thes1s/onepager.start { runId, ticker, userId, reportId }`
- `thes1s/pitchdeck.start { runId, ticker, userId, reportId }`
- `thes1s/fullstory.start { runId, ticker, userId, reportId, parentReportId }`

**R2 assembly cache** (Brainstorm 1 Decisions 1, 2):
- `assembly/{runId}/datapacket.json` — pre-assembled by Worker before event dispatch
- `assembly/{runId}/filings.json` — `{ filingContent, transcriptContent, ... }` (PD only)
- `assembly/{runId}/parent-report.json` — inherited completed PD report (FS only)
- Cleaned up by weekly cron after 30 days

**Reliability strategy:** Engineered for 100% per-agent success. Each agent runs in its own `step.run` for retry isolation. Layered retries: (1) wrapper Phase B reflect-and-retry × 3 on schema/format failures; (2) Inngest function-level `retries: 3` per step on transient errors; (3) NonRetriableError on 4xx prevents wasted retries. Up to ~9 attempts per agent. No `completed_with_errors` state, no `failed_sections` writes, no Bull-as-thesis fallback. Run completes fully or fails as a whole.
```

Update the "Pipeline Routes" subsection to add:
- `POST /api/v3/pipeline/pitchdeck/start { ticker }` — auth required
- `POST /api/v3/pipeline/fullstory/start { ticker, parentReportId }` — auth required
- `GET /api/v3/pipeline/assembly/:runId/:key.json` — public, secret-authenticated (Fly proxy read)

- [ ] **Step 2: Update `agents-service/README.md`**

Open `agents-service/README.md`. Find the section listing the Inngest functions (it currently lists `one-pager` only). Update the bullet list to:

```markdown
**Inngest functions hosted by this service:**

- `one-pager` — Stage 1 quick screen. Single Anthropic call (Sonnet, web search). ~3–5 min.
- `pitch-deck` — Stage 2 full research report. 5 waves of agents with per-agent step.run retry isolation. ~30–45 min.
- `full-story` — Stage 3 conviction document. Phase 1 parallel + Phase 2 sequential debate. ~25–40 min. Requires a completed parent Pitch Deck.
- `hello-world` — sanity check (kept for liveness testing).
```

- [ ] **Step 3: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add CLAUDE.md agents-service/README.md
git commit -m "docs: document v3 PD + FS pipeline (Status, events, R2 cache, reliability strategy)"
```

---

### Task 27: Track post-cutover prompt deletion

**Files:**
- Modify: `agents-v2/TODO.md`

**Why this matters:** The deprecated coordinator prompts and parent multi-role prompts stay in place during the v3 cutover for rollback reference. Track deletion ~30 days post-cutover so the cleanup doesn't slip.

- [ ] **Step 1: Append the deletion TODO**

Append this section to the bottom of `agents-v2/TODO.md`:

```markdown
## Post-cutover cleanup (trigger: 30 days after v3 cutover stable)

When v3 has been the sole production pipeline for 30 days with no rollbacks, delete the deprecated v1 prompt directories:

- [ ] `agents-v2/coordinator-pitchdeck/` (replaced by `agents-service/src/inngest/functions/pitch-deck.ts`)
- [ ] `agents-v2/coordinator-fullstory/` (replaced by `agents-service/src/inngest/functions/full-story.ts`)
- [ ] `agents-v2/synthesis-writer-fullstory/` (replaced by 3 splits: -bull, -rebuttal, -compose)
- [ ] `agents-v2/risk-analyst-fullstory/` (replaced by 2 splits: -event, -bear)

These are kept during the cutover window for rollback reference. Once v3 has been stable in production for 30 days, delete them in a single chore commit.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-v2/TODO.md
git commit -m "chore(agents-v2): track post-cutover prompt deletion (30-day window)"
```

---

### Task 28: USER ACTION — backend smoke check + sign-off

**Files:** None (manual verification)

**Why this matters:** Before Brainstorm 3 builds the UI on top of these endpoints, Kyle verifies the backend is sound — not a comprehensive validation, just a gut-check that the wiring is right end-to-end. This is the user's final sign-off for Phase 2.

- [ ] **Step 1: Run a fresh PD via DevTools**

In an authenticated browser session at `thes1sinvesting.com`, open DevTools → Console:

```javascript
const r = await fetch('/api/v3/pipeline/pitchdeck/start', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticker: 'AAPL' }),
}).then(r => r.json());
console.log('PD runId:', r.runId, 'reportId:', r.reportId);
```

While waiting (~30–45 min), verify:

- **Inngest dashboard** (app.inngest.com → Runs) — function shows 5 wave-step blocks running, then synthesis, then post-callback. **No retries on the steps means the per-agent retry budget wasn't needed (good).** If you see retries, that's still success at the run level — investigate whether it was a transient 5xx or a real reliability issue worth fixing.
- **Langfuse** (project: thes1s-dev) — ~12 traces named `pitchdeck.{agent-id}` with input/output token counts visible.
- **R2** — `assembly/{runId}/datapacket.json` and `filings.json` present right after dispatch.

- [ ] **Step 2: Verify PD completion**

```javascript
const status = await fetch(`/api/v3/pipeline/status/${r.runId}`, { credentials: 'include' }).then(r => r.json());
console.log('status:', status.status);
console.log('sections:', status.result?.sections?.length);
console.log('titles:', status.result?.sections?.map(s => s.title));
console.log('verdict:', status.result?.overallVerdict);
```

Expected: `status: 'completed'`, `sections: 11`, all 11 section titles in order, a verdict of `PASS` / `FAIL` / `WATCHLIST`.

- [ ] **Step 3: Run a fresh FS using the PD just generated**

```javascript
const fs = await fetch('/api/v3/pipeline/fullstory/start', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticker: 'AAPL', parentReportId: r.reportId }),
}).then(r => r.json());
console.log('FS runId:', fs.runId);
```

Wait ~25–30 min. Verify:

```javascript
const fsStatus = await fetch(`/api/v3/pipeline/status/${fs.runId}`, { credentials: 'include' }).then(r => r.json());
console.log('status:', fsStatus.status);
console.log('sections:', fsStatus.result?.sections?.length);
console.log('debate keys:', Object.keys(fsStatus.result?.debate ?? {}));
```

Expected: `status: 'completed'`, `sections: 6`, debate keys: `['bullThesis', 'bearInversion', 'bullRebuttal', 'judgeVerdict']`.

- [ ] **Step 4: Sanity-eyeball both outputs**

Read the JSON output (it's verbose — focus on the verdicts, narratives, and red flags). Ask:

- Does the PD overall verdict make sense given the section verdicts?
- Does the FS Section 6 reference both bull and bear arguments in its narrative?
- Are red flags populated on every section?
- Are citations populated (especially in web-search-using sections)?
- Does the FS `debate.judgeVerdict.content.overallVerdict.direction` align with the FS Section 6 verdict?

This is NOT a comparison vs v1 — it's a "does the v3 output look like a real Pitch Deck / Full Story" gut check.

- [ ] **Step 5: If anything looks off, file a TODO**

Add any issues to `agents-v2/TODO.md` under a new "Post-Phase-2 prompt tuning" section. **Do NOT fix prompts live here** — minor prompt tuning happens in Brainstorm 3 once the user can see the rendered output and judge quality in context.

- [ ] **Step 6: Sign off**

If both runs complete and the JSON looks right: **this plan is done.** Brainstorm 3 takes over — UI/UX design for the live-running and completed-report views, leveraging the backend contract this plan locked in.

- [ ] **Step 7: Final commit (TODO.md additions, if any from Step 5)**

```bash
cd /Users/kylehoff/Desktop/stock-analyzer
git add agents-v2/TODO.md
git diff --cached --stat
git commit -m "chore(agents-v2): post-Phase-2 prompt tuning notes from smoke check" || echo "nothing to commit"
```

---

## Self-Review

Walked through the spec (skeleton + Brainstorm 1 decisions + Brainstorm 2 design) and confirmed coverage:

| Spec requirement | Task |
|---|---|
| **Brainstorm 1 D1** — DataPacket → R2 keyed by runId | Task 5 (helpers); Task 7 (Worker writes); Task 15 (Fly reads via Worker proxy) |
| **Brainstorm 1 D2** — Filing content → R2 keyed by runId | Task 5 (helpers); Task 7 (Worker writes); Task 15 (Fly reads). Reuses existing `filings-md/{accession}.md` per-file cache via the existing `assembleFilingContent.js` |
| **Brainstorm 1 D3** — Multi-role agents split into separate prompts | Task 3 (5 new FS-internal split prompts created from parent prompts); Tasks 19, 20, 21, 22 (matching runners). PD/FS file-tree split was already done in `agents-v2/`. |
| **Brainstorm 1 D4** — Cross-cutting findings via CPU merge with existing schema shape | Task 8 (CrossCuttingFindingSchema port); Task 14 (aggregator); Task 15 (PD function calls aggregator between waves) |
| **Brainstorm 1 D5** — Inngest event payloads `{runId, ticker, userId, reportId}` + FS `parentReportId` | Task 4 (event types); Task 7 (handlers send these payloads) |
| **Brainstorm 1 D6** — Rewrite filesystem references in prompts; coordinator prompts deprecated | Task 1 (rewrite + deprecation markers on coordinators); Task 3 Step 9 (deprecation markers on parent multi-role prompts) |
| **Brainstorm 1 D7** — Web-search empty fallback boilerplate | Task 2 (apply to 7 PD prompts); Task 3 Steps 4, 6, 7 (apply to 3 new FS-internal split prompts that use web search); Task 25 (audit) |
| **Brainstorm 1 D8** — v3 writes only to `v3_runs.result_json`; new `reports.v3_run_id` column; Brainstorm 3 owns renderer | Task 6 (column added); Task 7 (handlers mint linked rows); the existing v3 callback handler (already in `pipeline-v3.js`) writes only to `v3_runs.result_json` — no change needed. Frontend hooks are dispatch-only (Tasks 16, 24). |
| **Reliability strategy — per-agent step.run retry isolation** | Task 15 (PD: 10 step.run blocks); Task 23 (FS: 10 step.run blocks). Function-level `retries: 3` set on both. |
| **Reliability strategy — wrapper Phase B reflect-and-retry × 3** | Already in `anthropic-client.ts` from Phase 1. Used by all 21 runners. |
| **Reliability strategy — NonRetriableError on 4xx** | Already in `anthropic-client.ts` from Phase 1. |
| **Reliability strategy — no graceful degradation** | All runners `throw err` on permanent failure (Tasks 9–13, 18–22). PD/FS Inngest functions only post `status: 'completed'` or `status: 'failed'` — never `completed_with_errors` (Tasks 15, 23). |
| **No cost ceilings during dev** | No runner passes `costCeilingUsd` to the wrapper (Tasks 9–13, 18–22 — verify in code review). |
| **No integration / comparison / fault-injection tests** | All runner tests are mocked unit tests (Tasks 9–13, 18–22). No `RUN_INTEGRATION=1` test created. No comparison script created. Smoke verification is Task 28 — manual click-through. |
| **Schema collision — use existing CrossCuttingFindingSchema shape** | Task 8 implements the existing shape (`finding/relevantAgents/severity/source`, severity 3-level). Task 14 aggregator references it. The Brainstorm 1 draft `FindingSchema` is NOT used. |
| **5 new FS-internal split prompts created in this plan** | Task 3 creates `synthesis-writer-fullstory-{bull,rebuttal,compose}` and `risk-analyst-fullstory-{event,bear}`. |
| **Phase 0 prompt cleanup is a real reliability investment** | Task 1 (filesystem references); Task 2 (web-search fallback boilerplate); Task 3 (split prompts); Task 25 (final audit per-runner). |
| **TODOS.md item 1** — multi-role ambiguity | Task 3 (5 split prompts) |
| **TODOS.md item 2** — debate cascade failure | Engineered out via per-step retry isolation in Task 23. No fallback path. |
| **TODOS.md item 3** — filesystem section passing | Task 1 |
| **TODOS.md item 4** — cross-cutting findings | Task 8 (schema), Task 14 (aggregator), Task 15 (PD applies aggregator between waves) |
| **TODOS.md item 5** — web-search empty fallback | Task 2 (boilerplate added); Task 25 (audit) |
| **Worker-mediated R2 read** | Task 15 Step 1 adds `GET /api/v3/pipeline/assembly/:runId/:key.json` route on Worker; Task 15 Step 3 adds Fly-side `r2-fetch.ts` that calls it with `X-Callback-Secret`. |
| **One prompt = one runner = one schema = one Inngest step** | 21 specialist runners total: 1 OP (Phase 1) + 10 PD (Tasks 9–13) + 10 FS (Tasks 18–22). Each maps to exactly one prompt directory. |
| **PD wave structure** | Task 15 implements: Wave 0 PSR parallel, Wave 1 (BA + CompMP) parallel, Wave 2 (Moats + FA + Mgmt) parallel, Wave 3 (Risk + Val) parallel, Wave 4 Synthesis sequential. Findings aggregated via `aggregateFindings` between every wave. |
| **FS structure** | Task 23 implements: Phase 1 5-agent parallel via `Promise.all([step.run(...) × 5])`, Phase 2 sequential 5-step debate (Bull → Bear → Rebuttal → Judge → Compose). |
| **FS inherits parent Pitch Deck (no PSR re-run)** | Task 7 stashes parent at `assembly/{runId}/parent-report.json`; Task 23 fetches it; Phase 1 runners use it as `parentPitchDeck` input (Tasks 18 implements). |
| **Scale comparable to OnePager plan (24 tasks)** | This plan: 28 tasks across 6 phases. Bigger because 20 new runners + 2 Inngest functions + Worker dispatch routes + R2 cache wiring + 5 new prompts. |

**Placeholder scan:** No "TBD", "TODO", "fill in details", or "implement later" patterns. Each task has full code where code is required. The 4 non-web-search FS Phase 1 runners (Task 18 Step 5) are written out in full code rather than referencing other tasks — DRY rule respected (engineer may read tasks out of order). The 4 Phase-1 test files for `business-analyst-fullstory` / `competitor-evaluator-fullstory` / `management-evaluator-fullstory` / `valuation-specialist-fullstory` use a "mirror this template" instruction with the specific replacements named — this is the only minor compromise; if an executor reads this section in isolation they have the full template + the variation table to reconstruct.

**Type consistency:** Runner naming follows `run<AgentName>(input)` pattern uniformly. Schema names: `ReportSectionSchema`, `MultiSectionSchema`, `CrossCuttingFindingSchema`, `BullThesisSchema`, `BearInversionSchema`, `BullRebuttalSchema`, `JudgeVerdictSchema` — used uniformly. Input interface naming follows `<Agent><Stage>Input` pattern (`AnnualReaderInput`, `BusinessAnalystPDInput`, `RiskAnalystFSEventInput`, etc.). Trace name pattern: `pitchdeck.{agent}` for PD, `fullstory.{phase-or-step}` for FS.

**Scope:** This plan is scoped to PD + FS migration as a single subsystem. The two stages share infrastructure (the wrapper, ProgressPublisher, R2 cache, schemas) and several agents (multi-role split happens here). They are NOT independent — splitting them into two plans would duplicate Phase 0 + Phase A.

**Open questions surfaced for Brainstorm 3:**
- Final report renderer: read directly from `/api/v3/pipeline/status/:runId` or add a separate `/api/v3/pipeline/report/:runId`? (Same as Brainstorm 1 D8's surfaced question.)
- The FS `result.debate` field (Bull/Bear/Rebuttal/Judge raw outputs) is preserved in `result_json`. Brainstorm 3 decides whether to surface the debate transcript in the renderer or hide it behind an "advanced" toggle.
- Adapter for legacy v1 `report_stages` reports → v3 renderer shape (already noted in B1-D8 open questions).

**Known assumptions to verify at implementation time:**
- The Anthropic SDK `web_search_20250305` tool's `max_uses` semantics: empirically caps total searches across all turns, not per-turn. If actual behavior differs, runner `maxWebSearches` values need re-tuning.
- The Cloudflare R2 binding `env.TRANSCRIPTS` is reused for `assembly/{runId}/*` keys — non-overlapping prefix vs the existing `transcripts/...` and `filings-md/...` prefixes.
- The Worker's 30-second CPU limit applies to PD dispatch (which calls `assembleDataPacket` + `assembleFilingContent` synchronously in Task 7). Existing assembly already has a 25-second budget guard. If a ticker's filings exceed that budget, the Task 7 handler returns 500 and the user retries. This is the existing v1 behavior, not a regression introduced here.

---

## Execution Handoff

**Plan complete and saved to `gstack/plans/agent-pipeline-pitchdeck-fullstory-eng-plan-20260503.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. **REQUIRED SUB-SKILL:** Use superpowers:executing-plans.

**Which approach?**
