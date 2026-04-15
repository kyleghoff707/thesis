# Thes1s v2 Agent Pipeline — Full Orchestration

## Data Assembly (shared across all stages)

Before any agent runs, `run-pipeline.js` assembles inputs:

1. **DataPacket** — `assembleDataPacket(ticker)` pulls XBRL financials, growth rates, return metrics, FCF, peer metrics, guru holdings, insider trades, analyst estimates, compensation, prices, classification from SEC EDGAR + Yahoo + Finviz (with D1/R2 cache layer in production)
2. **Filing Content** — Fetches up to 5 10-Ks + 4 10-Qs from SEC EDGAR, converts HTML → markdown via cheerio + Turndown, extracts sections via regex (`fileSections.js`)
3. **Transcripts** — Brute-force fetches last 8 quarters of earnings calls from Alpha Vantage (disk-cached between runs)

All of this gets packed into `dataPacket.filingContent` and `dataPacket.transcriptContent`.

---

## Stage 1: One Pager (Filter Gate)

**Mode:** `single-call` — no multi-agent orchestration.

One Sonnet call via `onePagerGenerator.js`. No DataPacket needed — the agent uses `web_search` to research the company independently. In production, this is a single Managed Agent session (`agent_011CZzuB5TVsiPgnQZZJscmy`).

**Output:** 6 section keys: `company_info`, `minimum_standards`, `meaning`, `growth_metrics`, `valuation_summary`, `overall_verdict`

**Gate:** `overallVerdict` must be `PASS` to proceed. If FAIL, the pipeline stops — the company doesn't warrant deeper research.

**Cost:** ~$1-2, ~4 min

---

## Stage 2: Pitch Deck (Research)

**Mode:** Multi-agent, wave-based dispatch. 10 specialist agents across PSR pre-processing + 3 waves + post-processing.

### Pre-Processing: PSR Agents (parallel)

The Annual Reader and Quarterly Reader agents run first, concurrently:

| Agent | Input | Output |
|-------|-------|--------|
| **Annual Reader** (1 per 10-K, up to 5) | Single 10-K filing markdown + DataPacket | Extracted findings: competitive positioning, risk factors, segment data, strategic commentary, management promises |
| **Quarterly Reader** (1 for all 10-Qs + 1 for all transcripts) | All 10-Q sections + all earnings transcripts + DataPacket | Quarter-over-quarter changes, management guidance, tone shifts, promise tracking, Q&A insights |

PSR outputs are formatted into a structured `psrFindings` string and passed to every downstream agent.

### Wave 1 — Business Fundamentals (parallel)

| Agent | Sections | Output |
|-------|----------|--------|
| **Business Analyst** | S1 (Radar) + S2 (Simple & Predictable) | Company screening + business model analysis |
| **Competitor Evaluator** | S3 (Market Position) | 15+ peer screen, market share, niche identification, TAM analysis |

Both receive: DataPacket + PSR findings. Run simultaneously via `Promise.allSettled`.

### Wave 2 — Financial Deep-Dive (parallel, after Wave 1)

| Agent | Sections | Dependencies | Output |
|-------|----------|-------------|--------|
| **Competitor Evaluator** | S4 (Barriers & Moats) | Needs S3 output (market position context) | Moat types, anti-fragility, CAP estimate |
| **Financial Analyst** | S5 (FCF) + S7 (ROE/ROIC/Debt) + S8 (Balance Sheet) | None beyond PSR | Multi-section output via `MultiSectionSchema` |
| **Management Evaluator** | S6 (Management) | None beyond PSR | CEO evaluation, compensation alignment, insider ownership |

All receive: DataPacket + PSR findings + Wave 1 section outputs as `priorSections`. The Competitor Evaluator specifically needs S3 output for moat validation against market position findings.

### Wave 3 — Risk & Valuation (parallel, after Wave 2)

| Agent | Sections | Dependencies | Output |
|-------|----------|-------------|--------|
| **Risk Analyst** | S9 (PEST Risks) | Cross-cutting findings from all prior agents | Political, Economic, Social, Technological risk assessment |
| **Valuation Specialist** | S10 (Valuation) | S4 CAP estimate + S3 market share ceiling | FGR derivation, MOS/PBT/Ten Cap/Equity Bond buy prices |

Both receive: DataPacket + PSR findings + all prior sections (S1-S8).

### Post-Processing: Synthesis (after all waves)

| Agent | Sections | Input | Output |
|-------|----------|-------|--------|
| **Synthesis Writer** | S11 (Overall Verdict) | All 10 section outputs (verdicts, confidence, summaries, red flags, citations) | PASS / FAIL / WATCHLIST with rationale |

**Total output:** 11 sections. Keys: `radar`, `simple_predictable`, `market_position`, `barriers_moats`, `fcf`, `management`, `roe_roic_debt`, `balance_sheet`, `pest`, `valuation`, `overall_verdict`

**Gate:** Mechanical score + methodology score both must be >= 85 to proceed to Full Story.

---

## Stage 3: Full Story (Conviction)

**Mode:** Multi-agent, 2-phase dispatch with adversarial debate.

### Pre-Processing: Inherit Pitch Deck

PSR agents do **NOT** re-run. The pipeline loads the completed Pitch Deck output (all 11 sections, including PSR findings) and injects them as `dataPacket.pitchDeckSections`. This saves ~$4/run. If no Pitch Deck is found on disk, PSR agents run fresh as fallback.

### Phase 1 — Deep Analysis (all 5 agents in parallel)

All 5 section agents run simultaneously. They are independent deep-dives building on the completed Pitch Deck — they don't depend on each other.

| Agent | Section | Key | Builds On (Pitch Deck) |
|-------|---------|-----|----------------------|
| **Risk Analyst** | S1: Event Analysis | `event_analysis` | All PD sections — determines if price dislocation is temporary or structural |
| **Business Analyst** | S2: Meaning Checklist (15pt) | `meaning_checklist` | PD S1-S2 (Radar, Simple & Predictable) — deepens with point-by-point conviction assessment |
| **Competitor Evaluator** | S3: Moat Checklist (15pt) | `moat_checklist` | PD S3-S4 (Market Position, Moats) — validates competitive durability item by item |
| **Management Evaluator** | S4: Management Checklist (13pt) | `management_checklist` | PD S6 (Management) — assesses leadership with structured conviction checklist |
| **Valuation Specialist** | S5: Valuation Confirmation | `valuation_confirmation` | PD S10 (Valuation) — stress-tests growth assumptions, does NOT re-run calculators |

Each receives: DataPacket + full Pitch Deck sections (including inherited PSR findings).

### Phase 2 — THE DEBATE (strictly sequential)

Section 6 (Inversion & Rebuttal) is produced through 4 sequential debate steps + a composition call. This is the adversarial stress-test — Rule One Operating Rule #4 ("Always test inversion") in action.

| Step | Agent | Role | Web Search | Receives | Output Format |
|------|-------|------|------------|----------|---------------|
| **1** | Synthesis Writer | **Bull** | No | S1-S5 outputs | `thesisPoints[]` + `overallThesis` |
| **2** | Risk Analyst | **Bear** | **Yes** | Bull thesis | `inversions[]` (each with severity: thesis_killer/significant/minor) + `overallBearCase` |
| **3** | Synthesis Writer | **Rebuttal** | No | Bull thesis + Bear inversions | `rebuttals[]` (each with rebuttalStrength + honest flag) |
| **4** | Financial Analyst | **Judge** | No | Bull + Bear + Rebuttal | `exchanges[]` (scored Strong Bull/Strong Bear/Unresolved) + `overallVerdict` (direction + investmentImplication) |
| **Compose** | Synthesis Writer | **Compose** | No | All 4 debate outputs + S1-S5 | Final S6 as `ReportSectionSchema` — cohesive Buffett-style narrative |

**Web search rule (D-07):** Only the Bear has web search. The Bear researches short-seller theses, negative analyst coverage, and bear cases. Everyone else works with existing evidence from S1-S5.

**Debate output flows into the composed S6.** The Synthesis Writer weaves all 4 perspectives into a single narrative — thesis → antithesis → synthesis. The verdict must follow the Judge's direction.

**Total output:** 6 sections + 4 debate artifacts saved separately. Keys: `event_analysis`, `meaning_checklist`, `moat_checklist`, `management_checklist`, `valuation_confirmation`, `inversion_rebuttal`

---

## Data Inheritance Chain

```
DataPacket (SEC EDGAR + Yahoo + Finviz)
  │
  ├── One Pager: web_search only (no DataPacket)
  │
  ├── Pitch Deck:
  │     ├── DataPacket ──────────────→ All agents
  │     ├── Filing Content ──────────→ PSR agents
  │     ├── Transcripts ─────────────→ PSR agents
  │     ├── PSR findings ────────────→ All Wave 1-3 agents + Synthesis
  │     └── Prior wave sections ─────→ Next wave agents (cumulative)
  │
  └── Full Story:
        ├── DataPacket ──────────────→ All Phase 1 agents + Bear (Phase 2)
        ├── Pitch Deck sections ─────→ All agents (includes PSR findings)
        │   (PSR NOT re-run)
        ├── Phase 1 sections (S1-S5) → All Phase 2 debate agents
        └── Debate steps (cumulative) → Each subsequent debate step
```

## Multi-Role Agents

| Agent | Pitch Deck Role | Full Story Roles |
|-------|----------------|-----------------|
| **Risk Analyst** | S9 (PEST Risks) | S1 (Event Analysis) + Bear (debate Step 2) |
| **Synthesis Writer** | S11 (Overall Verdict) | Bull (Step 1) + Rebuttal (Step 3) + Compose (S6) |
| **Financial Analyst** | S5+S7+S8 (FCF, ROE/ROIC, Balance Sheet) | Judge (debate Step 4) |
| **Competitor Evaluator** | S3 (Market Position) + S4 (Moats) | S3 (Moat Checklist) |
| **Business Analyst** | S1+S2 (Radar, Simple & Predictable) | S2 (Meaning Checklist) |
| **Management Evaluator** | S6 (Management) | S4 (Management Checklist) |
| **Valuation Specialist** | S10 (Valuation) | S5 (Valuation Confirmation) |

## Full 3-Stage Pipeline (`--stage all`)

When run end-to-end: One Pager → gate check (PASS?) → Pitch Deck → gate check (scores >= 85?) → Full Story. Total cost ceiling: $15. DataPacket assembled once and reused across all stages.
