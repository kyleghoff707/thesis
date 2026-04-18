---
type: prompt-changelog
lastUpdated: 2026-04-18T18:00:00Z
tags: [prompts, changelog]
---

# Prompt Version Changelog

> Reverse chronological record of all agent prompt changes with measured impact.

---

## 2026-04-18 — Sprint 5 prep: 3 skill orchestrator prompts — non-essential prose stripped

PM directive: orchestrator skills had grown to 2,758 lines total and were potentially overloading the orchestrators. Cleanup applied per the doctrine "tell LLMs exactly what to do and not to do — extra explanation isn't needed; LLMs take shortcuts when given the opportunity."

- **Skills affected**: generate-one-pager, generate-pitch-deck, generate-full-story
- **Removed (categories)**: "why this matters" historical preambles → one-line demands; Sprint/EXP changelog inline references (versioning lives here, not in skills); ASCII summary box templates → single directive; inline markdown report templates → structural description; repeated "Wait for completion. Extract the COMPLETE JSON ... See CRITICAL RULE above" at every wave; soft hedging ("Quality is informational"); "Where:" parameter glosses; constraint subsections that didn't drive behavior
- **Retained verbatim**: all bash commands, schemas, DataPacket field maps, agent registries, DataPacket Slicing rule, Full-Fidelity Output rule, MC-7 contract check, MC-5 sweep script call, all wave/phase/debate task instructions, FGR derivation sub-workflow, JSON Extraction Fallback Chain, Format Violation + Narrative Recovery + Retry Logic, Contamination Boundary, Schema Enforcement, gate checks, auto-archive
- **Line counts**: one-pager 295→222 (-25%), pitch-deck 1331→829 (-38%), full-story 1132→747 (-34%). **Total -35%, 960 lines removed.**
- **Before runs**: Sprint 4 — `878fe13` baseline
- **After runs**: Sprint 5 — pending
- **Impact**: _Pending — expected: orchestrators complete pipelines without confusion or step-skipping. Watch for any regression in step adherence (especially MC-5 sweep, MC-7 contract check, observatory recording per wave). If a regression appears, selectively restore the section from `878fe13`._
- **Production parity**: Skill files are Claude-Code-only orchestration; do not affect Managed Agents production runtime. agents-v2/ prompts unchanged in this commit.

---

## 2026-04-18 — Sprint 5 prep: 17 agents — no-preamble rule + Bull source-quality gate

Two coordinated prompt fixes responding to Sprint 4 fullStory backfill findings (the three Claude instances surfaced 41 format-violation instances + 3 Bull factual-error class events on LULU after the original orchestrators skipped Step 8.5).

### Change 1: Bull source-quality gate (synthesis-writer-fullstory only)

- **Agents affected**: synthesis-writer (Bull role in fullStory)
- **Motivation**: EXP-003 gave Bull web search for the first time. Sprint 4 LULU surfaced 3 Bull factual/methodology errors that Rebuttal had to concede: (T5) used Phil Town/Burry guru ownership as a thesis-strength point — Rule One Operating Rule #2 explicitly says guru ownership is context, not confirmation; (T4) made unsupported forward-math claims about China's near-term contribution; (T3) omitted On Holding's 62.8% gross margin as competitive signal. Sprint 4 POOL surfaced 2 more: Wells Fargo target direction error ($275 raise vs actual $215 cut) sourced via aggregator paraphrase, and ibtimes.com.au (low-quality content aggregator) cited for Berkshire 13F speculation.
- **Key rewrites**:
  - Added "Source quality gate" paragraph: prefer primary sources (SEC filings, company press releases, earnings transcripts, analyst firm direct publications dated within 90 days); avoid content aggregators (ibtimes, *.fool summaries, generic Seeking Alpha listicles, undated "10 stocks Buffett is buying" articles); when citing analyst price targets, name firm + date + direction explicitly
  - Added "Guru ownership rule": guru ownership is context not confirmation per Rule One Operating Rule #2; cannot be used as a thesis-strength point in itself
- **Before runs**: Sprint 4 — 20260417-175335-LULU-fullStory (3 Bull errors), 20260417-192126-POOL-fullStory (3 Bull errors)
- **After runs**: Sprint 5 — pending
- **Impact**: _Pending — Sprint 5 fullStory Bull thesis points should not contain guru-ownership-as-conviction or aggregator-sourced analyst-action claims. Rebuttal `rebuttalStrength: "weak"` count on Bull-error class points should drop._

### Change 2: No-preamble rule (17 agent prompts)

- **Agents affected**: business-analyst (PD+FS), competitor-evaluator-market-position-pitchdeck, competitor-evaluator-moats-pitchdeck, competitor-evaluator-fullstory, financial-analyst (PD+FS), management-evaluator (PD+FS), risk-analyst (PD+FS), valuation-specialist (PD+FS), synthesis-writer (PD+FS), annual-reader, quarterly-reader, one-pager
- **Motivation**: Sprint 4 backfill surfaced 41 format-violation instances of "preamble text before JSON" ("Now I have all the data needed. Let me compile…", "I now have enough data… Let me compile") across nearly every Phase 1 sonnet agent. The existing instruction "no commentary outside the JSON" wasn't being parsed as forbidding pre-output narration. MC-5 Pre-Finalize Event Sweep now logs these (was silently stripped Sprint 1-3).
- **Key rewrites**:
  - All 14 agents with "Return ONLY the JSON — no markdown wrapper, no commentary [outside the JSON]." line: appended explicit "first character must be `{` or `[`, last character must be `}` or `]`. No preamble (...examples...), no postamble, no markdown fence wrap, no commentary outside the JSON. The orchestrator now logs format-violation events for any of these (Sprint 4 backfill found 11+ instances across Phase 1 sonnet agents) — they are no longer silently stripped."
  - annual-reader, quarterly-reader, one-pager (no existing "Return ONLY" line): added "Output discipline" paragraph after `## Output Format` header with same rule + agent-specific notes (annual-reader: 5 FY preambles per run; quarterly-reader: unary-plus prefix invalid JSON; one-pager: two-JSON-objects emission)
  - synthesis-writer-fullstory (multi-role file): added top-level "Output discipline" applies-to-all-roles paragraph after the inheritance summary, plus Write-tool prohibition for debate roles (Sprint 4 SFM Bear + Compose violations)
  - financial-analyst-fullstory (Judge): added explicit schema requirement — top-level `overallDirection` (not nested under `overallVerdict`); per-exchange `pointNumber`, `judgeScore`, `severityFromBear` (Sprint 4 LULU + SFM had silent assembly bugs from missing these fields)
  - risk-analyst-fullstory (Bear) + synthesis-writer-pitchdeck (debate roles): added "do NOT use Write tool to save debate-step-*.json directly; return JSON inline"
- **Before runs**: Sprint 4 — 20260417-175437-SFM-pitchDeck (13 violations), 20260417-185013-SFM-fullStory (13 + 2 dataGaps), 20260417-192126-POOL-fullStory (3), 20260417-175335-LULU-fullStory (8 incl. silent assembly bug)
- **After runs**: Sprint 5 — pending
- **Impact**: _Pending — expecting `formatViolations` count to drop from 11+ per pitchDeck/fullStory run to <3. Judge `exchanges[].judgeScore` and `pointNumber` should populate consistently (no more 11/11 null fields)._
- **Production parity**: All edits in `agents-v2/` prompt content — translates 1:1 to Managed Agents.

---

## 2026-04-17 — 3 agents: symmetric debate framework (EXP-003) — Sprint 4

- **Change**: Attacked 6 structural asymmetries in the bear/bull debate simultaneously. Softened Bear's adversarial-performance language; gave Bull + Rebuttal web search; fixed asymmetric judge rubric; added materiality filter (severity × novelty classification) to judge; added symmetric rebuttal honesty mandate; softened residual "Always prefer conservative" Sprint 3 leftovers in risk-analyst prompts.
- **Agents affected**: synthesis-writer (FS Bull/Rebuttal roles), financial-analyst (FS Judge), risk-analyst (PD+FS)
- **Motivation**: Sprint 3 full-story verdicts exactly matched pitch deck verdicts for all 3 tickers (no downgrades, no upgrades). Business quality sections (4-5 PASS on POOL/SFM) consistently recognized, but valuation/PEST sections veto overall verdict. Patterns [[patterns/bear-bull-asymmetry]] and [[patterns/valuation-drives-verdict]] identified the debate framework's structural symmetry toward caution as highest-leverage lever remaining after EXP-002. See [[experiments/doe-log]] EXP-003.
- **Key rewrites**:
  - risk-analyst-fullstory: "demolish the bull case or fail trying" × 3 → "pressure-test with evidence / find the strongest evidence-based challenge"; "make the reader genuinely uncomfortable" → "surface material, evidence-backed concerns clearly and specifically"; "Lead with what keeps you up at night" → "Lead with the most material, evidence-backed risk"
  - risk-analyst-pitchdeck: "demolish — or fail trying" → "pressure-test with the strongest evidence-based challenges"
  - synthesis-writer-fullstory Bull: "You do NOT have web search" → "You HAVE web search" + directed search menu (positive catalysts, insider buying, guru activity, analyst upgrades, third-party validation)
  - synthesis-writer-fullstory Rebuttal: "You do NOT have web search" → "You HAVE web search" + directed search menu (verify bear citations, find already-priced-in context, surface counter-evidence, check materiality)
  - synthesis-writer-fullstory Rebuttal honesty: added symmetric mandate — honest acknowledgment required when bear attack is weak (not just when it's strong)
  - financial-analyst-fullstory Judge: Strong Bull/Strong Bear definitions made symmetric (both require specific evidence + opposing side's weakness); added materiality filter (severity: thesis-killing/material/immaterial × novelty: newly-discovered/already-priced-in/known-and-managed); overall Bear verdict now requires ≥2 thesis-killer items that are BOTH newly-discovered AND unrebutted (was: any single thesis_killer sufficient)
  - risk-analyst prompts (3 instances): "Always prefer conservative growth estimates/assumptions" → "Lean toward conservative ... when evidence is genuinely mixed — conservatism is a tiebreaker, not a ceiling"
- **Skill-level changes**: generate-full-story SKILL.md "Web Search Rule" updated (Bull/Bear/Rebuttal all have web search; Judge/Compose still do not); per-agent web_searches estimation heuristics updated for Bull/Rebuttal.
- **Before runs**: Sprint 3 — 20260416-194*-* + 20260416-195*-* + 20260416-205*-* + 20260416-210*-* (9 runs, 0% verdict accuracy, full-story matched pitch deck 100%)
- **After runs**: Sprint 4 — pending
- **Impact**: _Pending — expecting at least 1 PASS across POOL/SFM/LULU and higher Strong Bull count in judge exchange scores_
- **Sprint 4 goal**: Introduce symmetry into debate framework so wonderful-company pitch deck results can translate into PASS/WATCHLIST-near-BUY in full story.

---

## 2026-04-17 — 6 agents: FGR conservatism rebalancing (EXP-002) — Sprint 3

- **Change**: Removed layered conservatism language across valuation-specialist, risk-analyst, synthesis-writer, and financial-analyst prompts. Reframed risk analyst FGR role from "attack" to "stress test."
- **Agents affected**: valuation-specialist (PD+FS), risk-analyst (PD+FS), synthesis-writer (PD+FS), financial-analyst (FS)
- **Key rewrites**:
  - "Conservative bias is non-negotiable" → "Evidence-based analysis is non-negotiable"
  - "FGR Attack Methodology" → "FGR Stress Test" (assess both directions)
  - "Optimism is the enemy of good investing" (5x) → "The goal is accuracy, not conservatism"
  - "Always prefer conservative growth estimates" → "Prefer realistic, evidence-based growth estimates"
  - "FGR must be achievable every year" → "achievable on average over 10 years"
- **Motivation**: Sprint 2 showed LULU 19.9% historical composite → 8% FGR (60% haircut). Three layers of conservatism compounded: valuation specialist haircuts, risk analyst attacks the result, synthesis writer defaults to WATCHLIST. See [[experiments/doe-log]] EXP-002 and [[patterns/valuation-drives-verdict]].
- **Before runs**: Sprint 2 — 20260416-* (15 runs, 0% verdict accuracy, FGR systematically low)
- **After runs**: Sprint 3 — pending
- **Impact**: _Pending — expecting FGR ranges to rise (LULU: 6-10% → ~10-14%)_
- **Sprint 3 goal**: Reduce conservatism-bias

## 2026-04-17 — All skills: mandatory observatory + full-fidelity saving

- **Change**: Replaced all "non-blocking" observatory language with "REQUIRED" + retry-once. Added CRITICAL RULE for full-fidelity output saving (no stubs, minimum file size thresholds).
- **Motivation**: Sprint 2 orchestrators skipped observatory recording (0/5 pitch deck, 0/5 full story) and saved stub section files (4/5 full stories truncated). Claude treats "non-blocking" as "optional" under context pressure.
- **Before runs**: Sprint 2 — empty agent records, truncated outputs
- **After runs**: Sprint 3 — pending
- **Impact**: _Pending — mechanical fix, should not affect verdicts_

## 2026-04-16 — All agents: model assignment change (EXP-001) — Sprint 2

- **Change**: Switched all agents from mixed opus/sonnet to all-sonnet
- **Agents affected**: quarterly-reader (PD), risk-analyst (PD+FS), valuation-specialist (PD)
- **Motivation**: Sprint 1 produced 8/9 WATCHLIST verdicts. Hypothesis: opus on risk-analyst and valuation-specialist produces systematically conservative FGRs.
- **Before runs**: Sprint 1 — 20260415-* (LULU, POOL, UBER — 9 runs, mixed opus/sonnet)
- **After runs**: Sprint 2 — 20260416-* (15 runs, all sonnet)
- **Impact**: **No effect.** Sprint 1: 89% WATCHLIST. Sprint 2: 93% WATCHLIST. Model is not the driver. EXP-001 REJECTED. See [[patterns/model-independence]].

## 2026-04-16 — All skills: parallel dispatch fix — Sprint 2

- **Change**: Renamed pitch deck Wave 1-3 headers from "Dispatch Agents Sequentially" to "PARALLEL DISPATCH" with CRITICAL callout blocks.
- **Motivation**: Sprint 1 pitch decks took 55-60min.
- **After runs**: Sprint 2 — 4/5 orchestrators confirmed parallel dispatch. RESOLVED. See [[failure-modes/sequential-dispatch]].

## 2026-04-16 — All skills: observatory recording added — Sprint 2

- **Change**: Added per-agent recording, orchestrator event recording, and wiki synthesis step.
- **Motivation**: Sprint 1 had zero agent-level data.
- **Impact**: Partially worked (one-pager only). Sprint 2 pitch deck + full story still empty due to "non-blocking" language. Fixed in Sprint 3 prep.
