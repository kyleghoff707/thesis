---
type: doe-log
lastUpdated: 2026-04-18T17:30:00Z
experimentCount: 7
tags: [experiments, doe]
---

# Experiment Log

> Formal Design of Experiments (DOE) tracking. Each experiment changes one control variable and measures the effect on output variables.

---

## EXP-001: All-Sonnet Model Assignment
- **Hypothesis:** Opus on risk-analyst and valuation-specialist biases verdicts toward conservatism (WATCHLIST over BUY). Switching to all-Sonnet will produce less conservative verdicts without sacrificing analysis quality.
- **Control:** Sprint 1 configuration — quarterly-reader (opus), risk-analyst (opus), valuation-specialist (opus) in pitch deck; risk-analyst (opus) in full story. All others sonnet.
- **Treatment:** All agents use sonnet across all 3 stages. Zero opus assignments.
- **Metric:** Verdict distribution (BUY/WATCHLIST/FAIL), FGR ranges, buy price calculations, section-level verdicts on risk/valuation sections specifically. Also: cost per run (sonnet is cheaper than opus).
- **Control runs:** Sprint 1 — 20260415-* (LULU, POOL, UBER — 9 runs total, all mixed opus/sonnet)
- **Treatment runs:** Sprint 2 — 20260416-* (LULU, POOL, UBER, SFM, NKE — 15 runs, all sonnet)
- **Result:** No effect. Sprint 1: 8/9 WATCHLIST (89%). Sprint 2: 14/15 WATCHLIST (93%). Verdict distribution unchanged. Conservatism persists across both models.
- **Decision:** REJECT hypothesis. Model choice (opus vs sonnet) is not the driver. The conservatism is in the **prompts**, not the model. Future experiments should target prompt wording, verdict thresholds, and risk-agent weighting.

### Rationale
Sprint 1 produced 8/9 WATCHLIST verdicts. Price-conditional analysis shows LULU was within margin ($162.74 vs $160 target) and POOL was correctly above target ($218 vs $180). The question is whether opus on risk-analyst (explicitly told to "demolish the bull case") and valuation-specialist produces systematically lower FGRs and buy prices than sonnet would. If sonnet produces similar FGRs, the conservatism is in the prompts, not the model. If sonnet produces higher FGRs, the model choice was a contributing factor.

### Variables Changed
| Skill | Agent | Sprint 1 | Sprint 2 |
|-------|-------|----------|----------|
| Pitch Deck | quarterly-reader | opus | **sonnet** |
| Pitch Deck | risk-analyst | opus | **sonnet** |
| Pitch Deck | valuation-specialist | opus | **sonnet** |
| Full Story | risk-analyst | opus | **sonnet** |
| Full Story | risk-analyst (bear debate) | opus | **sonnet** |

### Confounding Variables (also changed between Sprint 1 and Sprint 2)
- Parallel dispatch fix (sequential → parallel) — affects wall time, not verdicts
- Observatory recording added — non-blocking, should not affect verdicts
- Known verdicts populated — affects calibration scoring but not agent behavior
- Price-conditional calibration model — affects how we score verdicts, not what agents produce

---

## EXP-002: FGR Conservatism Rebalancing
- **Hypothesis:** Layered conservatism language across 6 agent prompts compounds to produce systematically low FGR estimates. Removing explicit conservatism mandates and reframing the risk analyst's FGR role from "attack" to "stress test" will produce higher, more accurate FGR ranges — leading to higher buy prices and more BUY verdicts on known-BUY companies.
- **Control:** Sprint 2 configuration — "Conservative bias is non-negotiable" in valuation specialists, "FGR Attack Methodology" in risk analysts, "Optimism is the enemy of good investing" appearing 5x across prompts
- **Treatment:** Evidence-based framing. Specific changes:
  - Valuation specialist (PD+FS): "Conservative bias is non-negotiable" → "Evidence-based analysis is non-negotiable"
  - Risk analyst (PD+FS): "FGR Attack Methodology" → "FGR Stress Test" — assess both directions (too high AND too low)
  - All 6 affected agents: "Optimism is the enemy" (5 instances) → "The goal is accuracy, not conservatism"
  - Financial analyst (FS): "FGR must be achievable every year" → "achievable on average over 10 years"
  - Synthesis writers (PD+FS): "Always prefer conservative growth estimates" → "Prefer realistic, evidence-based growth estimates"
- **Metric:** FGR ranges (expecting higher low-end and midpoint), buy price calculations, verdict distribution. LULU Sprint 2 FGR was 6-10% (avg 8%) from 19.9% historical — expecting closer to 10-14%.
- **Control runs:** Sprint 2 — 20260416-* (all 15 runs)
- **Treatment runs:** Sprint 3 — pending
- **Result:** _Pending — awaiting Sprint 3 runs_
- **Decision:** _Pending_

### Key Insight from Sprint 2
The conservatism was layered — every agent applied its own discount:
1. Valuation specialist haircuts historical rates by 50%+ ("when in doubt, round down")
2. Risk analyst attacks the already-conservative FGR ("construct counter-arguments for each input")
3. Synthesis writer defaults to WATCHLIST under any uncertainty
4. The debate bear demolishes what's left

A 19.9% historical composite becoming an 8% FGR is a 60% haircut. Even a single layer of conservatism (say, 30% discount to 14%) would be defensible — but three layers compound to produce unrealistically low estimates.

---

## EXP-005: One-Pager DataPacket Slicing
- **Hypothesis:** The one-pager analyst currently receives the full 137KB DataPacket, which contains fields it doesn't use (insiders, filings, compensation, peers, peerMetrics, ruleOneScore). Slicing to just the numeric core (financials, growth rates, return metrics, FCF, key ratios, debt) plus guru holdings and company meta will reduce input tokens ~34% without degrading output quality. In production (Managed Agents at $3/M Sonnet input), this saves meaningful cost per run.
- **Control:** Sprint 3 configuration — full DataPacket (~137KB ≈ 34K tokens) embedded verbatim in one-pager agent prompt. All 16 top-level fields included: companyInfo, classification, financials, ttm, filings, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics, ruleOneScore, peers, peerMetrics, gurus, insiders, compensation, caveats.
- **Treatment:** Sliced DataPacket (~90KB ≈ 22K tokens) with 11 fields only: companyInfo, classification, financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics, gurus, caveats. Narrative context (business model, catalysts, management commentary, competitive landscape) sourced via web search — which is how the original pre-DataPacket one-pager design worked.

  Rationale for each drop:
  - insiders (29KB) — insider analysis is pitch-deck territory
  - filings (8KB) — read by annual-reader/quarterly-reader in pitch deck
  - compensation (5.6KB) — management evaluation is pitch-deck territory
  - peers (2KB), peerMetrics (2.2KB) — competitive benchmarking is pitch-deck territory
  - ruleOneScore (tiny) — pre-computed composite; one-pager should judge from raw data

  Rationale for gurus kept (2.4KB): Guru ownership is a real Rule One "meaning" signal — it belongs in even a quick screen.

- **Metric:** Input tokens, web-search count per run, total cost per run, duration, verdict, FGR values, output quality (section completeness, citation density).
- **Control runs:** Sprint 1 + 2 + 3 one-pagers — all 16 runs used full DataPacket. Baseline cost $0.73–$1.15/run, baseline tokens unknown (pre-slice).
- **Treatment runs:** Sprint 4 — monitoring alongside the main sprint work (no standalone one-pager-only sprint).
- **Result:** _Pending — awaiting Sprint 4 runs_
- **Decision:** _Pending_

### Production Cost Model (Managed Agents)
The one-pager runs as a Managed Agents session in production — each web search is a paid tool call at ~$0.01 each. In Claude Code subagent mode (current sprints) web search is free, so treatment and control will look similar on duration and cost in local runs. To measure the production tradeoff, extract `toolUses` per run from `observatory/runs/*/agents/one-pager.json` and compute:

```
production_cost_estimate = input_tokens × $3/M
                         + output_tokens × $15/M
                         + (web_search_count × $0.01)
```

### Related Future Experiments
- **EXP-006 (conditional):** If treatment shows degraded quality but cost savings, test Arm C — no DataPacket at all (pure web search, the original pre-DataPacket design). The one-pager "worked really well" in that configuration historically.
- **EXP-007 (conditional):** If treatment shows quality maintained but costs didn't drop enough, tighten further by trimming `keyMetrics` (currently 31KB — the largest remaining field) down to just the ratios the one-pager's valuation summary needs.

### Implementation
- [scripts/slice-datapacket.js](../../scripts/slice-datapacket.js) — one-pager registry entry updated with 11-field slice
- [.claude/skills/generate-one-pager/SKILL.md](../../.claude/skills/generate-one-pager/SKILL.md) — Step 3 now runs the slice script; Step 4 embeds the sliced JSON with a prompt-level note explaining what's included vs. missing and directing the agent to web search for narrative context

---

## EXP-003: Symmetric Debate Framework
- **Hypothesis:** The Full Story adversarial debate has 6 structural asymmetries that systematically tip verdicts toward Bear regardless of the underlying investment quality: (1) Bear has web search; Bull and Rebuttal do not. (2) Bear prompts contain adversarial-performance language ("demolish or fail trying," "create discomfort," "keeps you up at night"); Bull has no equivalent. (3) Bear must attack every point with 1+ search each and produces 500+ word adversarial prose; Bull is a section-summary. (4) The judge rubric is asymmetric — "Strong Bear" requires only that bull couldn't rebut, while "Strong Bull" requires bear to be weak; the overall Bear verdict can be triggered by a SINGLE thesis_killer item, while Bull requires majority + zero thesis_killers. (5) Rebuttal mandate requires honest acknowledgment when bear is strong but has no symmetric instruction when bear is weak. (6) Residual "Always prefer conservative" language survived Sprint 3 EXP-002 in three risk-analyst locations. Simultaneously patching A-F should shift full-story verdict distribution toward PASS on known-wonderful companies where pitch deck already produced 4-5 PASS sections (POOL, SFM).
- **Control:** Sprint 3 configuration — asymmetric debate (Bull/Rebuttal no web search, Bear with "demolish" mandate, asymmetric judge rubric, one-directional rebuttal framing, residual Sprint 2 conservatism language in risk-analyst).
- **Treatment:** Symmetric debate — Bull and Rebuttal both have web search; "demolish/discomfort/keeps you up at night" language replaced with "pressure-test with evidence / surface material concerns / classify by severity and novelty"; judge rubric made symmetric (Strong Bull requires bear to be weak/speculative/already priced in — same evidentiary bar as Strong Bear) and thesis-killer trigger raised (needs to be newly-discovered AND unrebutted, not just present); materiality filter added to judge (classify each bear point on severity × novelty axes before scoring); symmetric rebuttal honesty mandate (must honestly flag weak bear attacks, not just strong ones); residual "Always prefer conservative" softened to "Lean toward conservative when evidence is genuinely mixed — not as a blanket override."
- **Metric:** Full-story verdict distribution (expecting at least 1 PASS across POOL/SFM/LULU), judge `exchangeScores.direction` histogram (expecting more Strong Bull entries relative to Sprint 3), FGR ranges and calculated buy prices (expecting modest continued rise vs Sprint 3 as the Bear→Synthesis cascade is less pessimistic), and verdict accuracy relative to user's known-verdict targets (combined with MC-7 price-conditional matching once wired).
- **Control runs:** Sprint 3 — 20260416-194*-* + 20260416-195*-* + 20260416-205*-* + 20260416-210*-* (9 runs across LULU/POOL/SFM, all 3 stages, 0% verdict accuracy).
- **Treatment runs:** Sprint 4 — pending.
- **Result:** _Pending — awaiting Sprint 4 runs_
- **Decision:** _Pending_

### Controlled Variables Changed
| File | Change | Options |
|------|--------|---------|
| synthesis-writer-fullstory prompt | Bull role now HAS web search with directed search menu (positive catalysts, insider buying, guru activity, analyst upgrades, third-party validation) | A |
| synthesis-writer-fullstory prompt | Rebuttal role now HAS web search (verify bear citations, find already-priced-in context, surface counter-evidence, check materiality) | A |
| financial-analyst-fullstory prompt | Judge rubric — Strong Bull/Strong Bear definitions made symmetric (both require evidence quality + opposing side's weakness); overall Bear verdict requires ≥2 thesis-killer items newly-discovered AND unrebutted (was: any single thesis_killer) | B |
| financial-analyst-fullstory prompt | Materiality filter added — each bear point classified on severity (thesis-killing / material but manageable / immaterial) × novelty (newly-discovered / already priced in / known and managed) axes before scoring | D |
| risk-analyst-fullstory prompt | 4 instances of "demolish," "discomfort," "keeps you up at night" replaced with "pressure-test with evidence," "surface material concerns," "lead with highest-severity cited concern" | C |
| risk-analyst-pitchdeck prompt | "Your job is to demolish" → "Your job is to pressure-test with the strongest evidence-based challenges" | C |
| synthesis-writer-fullstory prompt | Rebuttal mandate made symmetric — honest acknowledgment required when bear is weak (not just when bear is strong) | E |
| risk-analyst-fullstory + risk-analyst-pitchdeck | "Always prefer conservative" (3 locations) softened to "Lean toward conservative when evidence is genuinely mixed — conservatism is a tiebreaker, not a ceiling" | F |
| generate-full-story SKILL.md | Web Search Rule updated — Bull/Bear/Rebuttal all have web search; Judge and Compose do not | A |

### Expected Effects and Confounding
The changes compound in the same direction (all soften bear dominance), so EXP-003 tests the package, not any single lever. If Sprint 4 shows POOL or SFM flip to PASS, the package worked; individual attribution (which of A-F mattered most) requires sub-experiments in Sprint 5+.

**Confounding from prior sprints:** EXP-005 (one-pager slicing) runs in parallel. Since one-pager and full-story are independent stages, EXP-005 should not affect Sprint 4 full-story verdicts. MC-7 (11-section drift) and MC-8 (per-agent usage capture) are measurement layers, not methodology.

**Risk:** The Bull now has web search — could surface pump-coverage from Seeking Alpha etc. and overstate the bull case. Mitigations: (1) Bull prompt explicitly says "web search is for sharpening and validating — not inventing a thesis the sections don't support"; (2) Judge still adjudicates evidence quality regardless of source count; (3) Sprint 4 output review should read Bull thesis critically for evidence provenance.

### Parked for Sprint 5 if EXP-003 is insufficient
- **G: Weight debate by section verdicts** — if 7+ pitch deck sections PASS, raise the bar for full-story FAIL. Structural shift, blunt instrument. See [[patterns/bear-bull-asymmetry]] EXP-TBD-D.

---

## EXP-008: Prompt Caching (Anthropic cache_control)

- **Status:** BACKLOG — highest-priority post-Sprint-5 optimization. Selected by PM 2026-04-18 after Sprint 5 debrief. No implementation yet.
- **Hypothesis:** Each agent prompt today sends ~80-120KB of stable content (Rule One curriculum, methodology rules, DataPacket, filing markdown) fresh on every call. Placing the stable prefix behind Anthropic's prompt cache (5-minute TTL; up to 4 cache breakpoints per request) and varying only the agent-specific task at the end will reduce input token cost ~90% on cache hits and reduce time-to-first-token meaningfully — without changing a single word of methodology.
- **Control:** Sprint 5 configuration — every agent call is a fresh request with no `cache_control` breakpoints. POOL pitch deck: 1.03M input tokens × $3/M = $3.08 input cost at Sonnet rates.
- **Treatment (proposed):** Restructure every agent prompt into three zones:
  1. **Stable prefix** (cacheable): Rule One curriculum, shared methodology blocks, DataPacket JSON, filing content — everything that doesn't vary across agents in the same run
  2. **Agent-specific section** (cacheable if prompt is identical across invocations): the agent's task/role/output-schema block
  3. **Dynamic task tail** (not cached): the specific "analyze ticker X" invocation line
  Use `cache_control: { type: "ephemeral" }` markers at zone boundaries.
- **Metric:**
  - Input token cost (expect ~70-90% drop on cache hits after first agent per run warms the cache)
  - Cache hit rate (read from `cache_read_input_tokens` + `cache_creation_input_tokens` in API response)
  - Time-to-first-token per agent (expect modest drop, cache hits are faster to start)
  - Total wall time per pipeline (secondary — wave parallelism already dominates)
  - Output quality: MUST match Sprint 5 baseline on verdict distribution, section PASS counts, judge histograms
- **Production parity:** Translates directly to Managed Agents — `cache_control` is an Anthropic API feature, identical in Claude Code subagent and Managed Agents sessions.
- **Key questions before implementation:**
  1. Is DataPacket shared enough across agents in a single pitch deck run to benefit from caching? (Yes — all 10 specialist agents read the same DataPacket.)
  2. Does the cache TTL (5 minutes) cover a full pipeline wave? (Wave 2 is up to ~12 min — may need cache refresh between waves.)
  3. How are cache breakpoints counted against the 4-per-request limit? (Design the zone layout accordingly.)
- **Risk:** Low. Caching is transparent — output is identical on cache miss or hit. Failure mode is "cache never hits, cost unchanged" not "wrong output."
- **Control runs:** Sprint 5 — all 9 runs.
- **Treatment runs:** _Pending implementation_.
- **Result:** _Pending_.
- **Decision:** _Pending_.

### Related reading
- Anthropic prompt caching docs — cache breakpoints, TTL, and eligible content
- `claude-api` skill default includes prompt caching (per skill description)

---

## EXP-009: Port DataPacket slicing to production Managed Agents (CORRECTED SCOPE)

- **Status:** BACKLOG. **Scope correction (2026-04-19):** the original EXP-009 framed per-agent slicing as pending work. Audit of `scripts/slice-datapacket.js` confirms slicing has **already been implemented for all 11 agents** in Claude Code — live since at least Sprint 4. Each agent's custom field list is in the `REGISTRY` object, enforced by all three skill files (`generate-one-pager`, `generate-pitch-deck`, `generate-full-story`) via the "MUST NOT pass the full DataPacket" rule. What remains is porting this same optimization into production.
- **Hypothesis:** Production currently runs un-sliced. The one-pager agent on platform.claude.com receives NO DataPacket today (just "Create a One Pager on ${TICKER}" per [api/src/routes/pipeline.js:193-196](../../api/src/routes/pipeline.js#L193-L196)) and must web-search every fact from scratch. The pitch deck coordinator (blocked on `callable_agents`) would receive the full DataPacket when dispatch unlocks. Porting per-agent slicing to production will match Claude Code behavior and reduce cost + latency.
- **Control:** Current production state. One-pager: no DataPacket, web search everything, ~$0.72 cost, ~5min duration (Sprint 5 SFM baseline). Pitch deck: blocked on Research Preview, so no production data.
- **Treatment:** Port the `scripts/slice-datapacket.js` REGISTRY to browser-side slicing (browser already assembles the full DataPacket per [src/engines/dataExport.js](../../src/engines/dataExport.js)). For each agent invocation, browser slices the DataPacket to just that agent's fields before forwarding to the Worker, which passes the slice unchanged to Managed Agents.
- **Scope decomposition:**
  - **Workstream 1** — port one-pager slicing to production. Narrow: one agent, 4 coordinated changes (browser + Worker + YAML + portal). Unblocks real cost savings on live traffic.
  - **Workstream 3** — port pitch-deck slicing via coordinator. Blocked on `callable_agents`; coordinator needs per-agent slicing logic translated from Claude Code skill into coordinator prompt.
  - **Full story** — blocked on Full Story agents not existing on platform yet.
- **Metric (one-pager only):** Input tokens per run, web_searches per run (expect significant drop since DataPacket supplies financials), total cost per run, run duration, output quality parity (section PASS counts match Sprint 5 baseline).
- **Production parity:** Once implemented, the sliced DataPacket is byte-identical to what Claude Code one-pager subagents receive today — directly comparable.
- **Risk:** Low for one-pager. The Sprint 5 Claude Code runs (EXP-005 treatment arm) already validate that the 11-field slice produces acceptable output. Risk is infrastructure plumbing, not methodology.
- **Control runs:** Sprint 5 production one-pager runs (when we have them) vs Sprint 5 Claude Code one-pager runs (for quality parity check).
- **Treatment runs:** _Pending Workstream 1 implementation_.
- **Result:** _Pending_.
- **Decision:** _Pending_.

### EXP-005 supersession note
EXP-005's "Result: Pending — awaiting Sprint 4 runs" is stale. Slicing was live in Claude Code by Sprint 4 and has now run for 2 sprints without quality degradation. EXP-005 is effectively RESOLVED-IN-FAVOR on the Claude Code side; EXP-009 (this entry, as corrected) continues the work into production.

---

## EXP-010: Shared Methodology Block Deduplication

- **Status:** BACKLOG — lower-priority, lower-risk, organizational. Selected by PM 2026-04-18.
- **Hypothesis:** Every one of the 17 agent prompts redundantly restates the same Rule One fundamentals — 4 Ms framework, FGR derivation steps, 50% MOS, Operating Rule #2 (guru ownership is context not confirmation), 10 research generation requirements, etc. Extracting these into shared blocks (system prompt in Managed Agents; `<<include>>` mechanism in Claude Code skills) will shrink every agent prompt by ~25-35% without changing what the agent actually sees.
- **Control:** Current state — each `agents-v2/*/prompt.md` is self-contained and merges 7+ curriculum/knowledge files.
- **Treatment (proposed):** Identify the shared-across-all-agents content and promote to a single shared block. Agent prompts then reference the shared block by inclusion. In Managed Agents this maps to: shared block goes in agent config's `system` or `instructions` field; agent-specific prose stays in the prompt. In Claude Code skills, the SKILL.md orchestrator assembles the final prompt by concatenating shared + agent-specific.
- **Metric:** Token count per agent prompt (expect 25-35% drop), pipeline cost (modest secondary benefit — cache reuse from EXP-008 interacts), output quality parity.
- **Production parity:** Managed Agents supports system prompts per-agent; the dedupe mechanism translates cleanly.
- **Risk:** Medium. Harder to audit what any single agent sees when the prompt is assembled from pieces. Requires clear naming convention for shared blocks and a diff tool that shows the fully-assembled per-agent prompt.
- **Sequencing:** Should follow Sprint 6 prompt-prose cleanup — no point deduping prose that's about to be rewritten. Then EXP-010 is a one-time refactor of the cleaned prompts.
- **Control runs:** Post-Sprint-6 — first clean run set.
- **Treatment runs:** _Pending implementation_.
- **Result:** _Pending_.
- **Decision:** _Pending_.

### Interaction with EXP-008 (prompt caching)
EXP-010 is the companion to EXP-008, not an alternative. Caching saves cost on repeated calls; deduplication saves prompt real-estate. Done together: cache the shared methodology block once, reuse across every agent in a run — maximum leverage. Done separately: still helpful, but less so.
