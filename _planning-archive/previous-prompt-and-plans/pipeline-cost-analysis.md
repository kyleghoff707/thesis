# Pipeline Cost Analysis

**Last Updated:** 2026-04-06
**Ticker:** LULU (in-app v1.0 full 3-stage run)

---

## Current State (Post PSR-Reuse Fix)

| Stage | Before Fix | After Fix | Savings |
|-------|-----------|-----------|---------|
| One Pager | $0.41 | $0.41 | -- |
| Pitch Deck | $15.09 | $15.09 | -- |
| Full Story | $13.64 | **~$9.50** | **$4.14** |
| **Total** | **$29.14** | **~$25.00** | **$4.14** |

PSR reuse implemented: Full Story now inherits Pitch Deck's PSR findings instead of re-dispatching 7 reader agents. See `pipelineManager.js` lines 141-176.

---

## Where the Money Goes

### Cost by Category (Full Pipeline: OP + PD + FS)

| Category | Cost | % of Total | Notes |
|----------|------|-----------|-------|
| **Cache writes** | $10.70 | 37.3% | Largest single driver. Each agent writes 100-160K tokens of curriculum + context to prompt cache |
| **Input tokens** | ~$5.50 | 19.1% | Raw filing text (readers) + DataPacket + prior sections |
| **Output tokens** | ~$5.00 | 17.4% | Generated analysis content |
| **PSR filing reads** | $4.14 | 14.4% | 7 Sonnet calls processing 100-280K token SEC filings (eliminated from FS by reuse) |
| **Cache reads** | ~$0.80 | 2.8% | Cheap — this is the caching system working as intended |
| **Web searches** | $0.69 | 0.2% | 69 searches at $0.01 each. Negligible |

### Cost by Model (PD + FS combined, before PSR fix)

| Model | Agent Calls | Total Cost | % of Total |
|-------|-------------|-----------|-----------|
| **Opus** ($5/$25/$0.50/$6.25) | 9 calls (PD: 3, FS: 6) | $10.09 | 35.1% |
| **Sonnet** ($3/$15/$0.30/$3.75) | 26 calls (PD: 15, FS: 11) | $18.65 | 64.9% |

### The CacheWrite Problem

CacheWrite alone is **$10.70** — more than any single pipeline stage. Every analysis agent writes 130-160K tokens to cache, and Opus cacheWrite costs $6.25/M (vs $3.75/M for Sonnet).

| Agent Type | Avg CacheWrite/Call | Rate | Cost/Call |
|------------|-------------------|------|----------|
| Opus analysis agent | ~155K tokens | $6.25/M | ~$0.97 |
| Sonnet analysis agent | ~125K tokens | $3.75/M | ~$0.47 |
| Reader agent | ~6K tokens | $3.75/M | ~$0.02 |
| Debate step (synthesis) | ~23K tokens | $6.25/M | ~$0.14 |

The cache writes are curriculum files, universal context, PSR findings, and DataPacket slices being written to Anthropic's prompt cache. The first agent in each cache-prefix group pays the write cost; subsequent agents with matching prefixes read cheaply at 1/10th the price.

---

## Agent Model Assignments

| Agent | Model | PD Calls | FS Calls | Why Opus? |
|-------|-------|----------|----------|-----------|
| annual-reader | Sonnet | 5 | 5* | Extraction task |
| quarterly-reader | Sonnet | 2 | 2* | Extraction task |
| business-analyst | Sonnet | 2 | 1 | Screening/checklist |
| financial-analyst | Sonnet | 3 | 1 | Number-crunching |
| competitor-evaluator | Sonnet | 2 | 1 | Comparative analysis |
| management-evaluator | Sonnet | 1 | 1 | Evaluation |
| **risk-analyst** | **Opus** | 1 | 2 | PEST analysis, bear case — needs web search + deep reasoning |
| **valuation-specialist** | **Opus** | 1 | 1 | Complex multi-method valuation |
| **synthesis-writer** | **Opus** | 1 | 3 | Bull/rebuttal/composition — narrative quality |

*Eliminated by PSR reuse

---

## Pitch Deck Breakdown ($15.09)

| Agent | Model | Input | Output | CacheR | CacheW | Web | Cost |
|-------|-------|-------|--------|--------|--------|-----|------|
| 5x annual-reader | Sonnet | 557K | 68K | 0 | 32K | 0 | $2.81 |
| 2x quarterly-reader | Sonnet | 326K | 21K | 0 | 13K | 0 | $1.34 |
| 2x business-analyst | Sonnet | 108K | 19K | 259K | 265K | 8 | $1.76 |
| 2x competitor-evaluator | Sonnet | 110K | 21K | 294K | 237K | 8 | $1.70 |
| 3x financial-analyst | Sonnet | 207K | 39K | 498K | 324K | 11 | $2.69 |
| 1x management-evaluator | Sonnet | 68K | 12K | 162K | 107K | 4 | $0.88 |
| 1x risk-analyst | Opus | 73K | 13K | 175K | 159K | 5 | $1.82 |
| 1x valuation-specialist | Opus | 83K | 13K | 26K | 159K | 5 | $1.79 |
| 1x synthesis-writer | Opus | 21K | 7K | 26K | 0 | 0 | $0.31 |
| **Totals** | | 1,554K | 213K | 1,440K | 1,295K | 41 | **$15.09** |

## Full Story Breakdown ($13.64, drops to ~$9.50 with PSR reuse)

| Agent | Model | Input | Output | CacheR | CacheW | Web | Cost |
|-------|-------|-------|--------|--------|--------|-----|------|
| 5x annual-reader* | Sonnet | 558K | 62K | 6K | 25K | 0 | $2.70 |
| 2x quarterly-reader* | Sonnet | 350K | 23K | 0 | 13K | 0 | $1.44 |
| 1x risk-analyst | Opus | 67K | 8K | 151K | 148K | 5 | $1.58 |
| 1x business-analyst | Sonnet | 55K | 13K | 132K | 136K | 4 | $0.95 |
| 1x competitor-evaluator | Sonnet | 55K | 13K | 130K | 132K | 4 | $0.94 |
| 1x management-evaluator | Sonnet | 69K | 16K | 146K | 136K | 5 | $1.06 |
| 1x valuation-specialist | Opus | 80K | 10K | 159K | 152K | 5 | $1.73 |
| synthesis-writer:bull | Opus | 33K | 3K | 0 | 23K | 0 | $0.37 |
| risk-analyst:bear | Opus | 74K | 6K | 161K | 159K | 5 | $1.64 |
| synthesis-writer:rebuttal | Opus | 27K | 4K | 0 | 23K | 0 | $0.37 |
| financial-analyst:judge | Sonnet | 87K | 3K | 0 | 23K | 0 | $0.38 |
| synthesis-writer:comp | Opus | 33K | 6K | 0 | 24K | 0 | $0.47 |
| **Totals** | | 1,487K | 166K | 886K | 994K | 28 | **$13.64** |

*Eliminated by PSR reuse — saves $4.14

---

## Optimization Opportunities

### Already Implemented

| Fix | Savings | Status |
|-----|---------|--------|
| PSR reuse (FS inherits PD findings) | ~$4.14/run | Done |

### Tier 1: Low Risk, Meaningful Savings

**1. Selective Opus → Sonnet for debate steps ($1.00-1.50/run)**

The debate bull, bull_rebuttal, and composition steps are synthesis/summarization tasks — they compress existing analysis, not generate new reasoning. These could safely use Sonnet.

| Step | Current (Opus) | As Sonnet | Savings |
|------|---------------|-----------|---------|
| synthesis-writer:bull | $0.37 | $0.22 | $0.15 |
| synthesis-writer:rebuttal | $0.37 | $0.22 | $0.15 |
| synthesis-writer:composition | $0.47 | $0.28 | $0.19 |
| **Subtotal** | $1.21 | $0.72 | **$0.49** |

Keep risk-analyst:bear on Opus — the bear case is the most adversarial, evidence-demanding step and needs the strongest reasoning. Keep financial-analyst:judge on Sonnet (already is).

The PD synthesis-writer ($0.31) could also go Sonnet → save $0.12.

**Total savings: ~$0.61/run.** Conservative, low quality risk.

**2. Consolidate multi-call agents in Pitch Deck ($1.50-2.50/run)**

Several Sonnet agents are called 2-3 times in PD, each paying full cacheWrite:

| Agent | PD Calls | CacheWrite Cost | If 1 Call |
|-------|----------|----------------|-----------|
| financial-analyst | 3 | $1.21 | $0.47 |
| business-analyst | 2 | $0.99 | $0.49 |
| competitor-evaluator | 2 | $0.89 | $0.51 |

Each additional call pays ~$0.40-0.50 in cacheWrite for the same curriculum re-uploaded. Consolidating financial-analyst from 3 calls to 1-2 (assign FCF + ROE/ROIC + Balance Sheet in a single call with larger max_tokens) saves ~$0.40-0.80 in cacheWrite alone.

**Estimated savings: $1.00-2.00/run.** Requires wider output + prompt adjustments. Medium effort.

**3. Switch valuation-specialist to Sonnet ($1.36/run)**

The valuation-specialist runs once in PD ($1.79) and once in FS ($1.73). Switching to Sonnet:

| Stage | Current (Opus) | As Sonnet | Savings |
|-------|---------------|-----------|---------|
| PD | $1.79 | $1.10 | $0.69 |
| FS | $1.73 | $1.06 | $0.67 |
| **Total** | $3.52 | $2.16 | **$1.36** |

The valuation calculations are mostly mechanical (MOS, PBT, Ten Cap, Equity Bond formulas). Sonnet handles structured math well. This is moderate risk — worth testing on one ticker to compare quality.

### Tier 2: Higher Effort, Larger Savings

**4. Reduce curriculum/prompt size ($2-4/run)**

CacheWrite is $10.70/run (37% of total). Analysis agents write 130-160K tokens of curriculum to cache per invocation. The agent prompt.md files are 29-30K chars each, plus curriculum files add 4-15K words more. 

If curriculum can be trimmed 25% (remove redundant instructions, compress examples):
- Saves ~30-40K cacheWrite tokens per agent call
- At ~15 analysis agent calls: 450-600K fewer cacheWrite tokens
- Savings: 500K * avg($5/M) = **$2.50/run**

This requires an audit of each agent's prompt.md to identify redundancy. High effort but the single largest remaining opportunity.

**5. Skip filing pre-processing for FS when PSR is reused (~30 seconds saved, no $ savings)**

`run-full-story.js` and `run-pipeline.js main()` still fetch filing markdown from EDGAR even when PSR is reused. The filings are IndexedDB-cached so it's fast, but it's wasted I/O. Could skip `filingContent` assembly entirely when PSR reuse is active. Zero cost savings but faster FS startup.

### Tier 3: Aggressive (Test Before Committing)

**6. All Opus → Sonnet ($3.93/run)**

Nuclear option: switch every agent to Sonnet.

| Pipeline | Current | All-Sonnet | Savings |
|----------|---------|-----------|---------|
| PD Opus agents | $3.92 | $2.40 | $1.52 |
| FS Opus agents | $6.17 | $3.76 | $2.41 |
| **Total** | $10.09 | $6.16 | **$3.93** |

Risk: The risk-analyst (PEST, bear case) and synthesis-writer (narrative quality) are the agents most likely to degrade with Sonnet. The risk-analyst's bear case needs to find non-obvious counter-arguments — this is where Opus reasoning shines. Would need A/B testing on 2-3 tickers comparing quality scores.

---

## Projected Cost After All Tier 1 Optimizations

| Optimization | Savings |
|-------------|---------|
| PSR reuse (done) | $4.14 |
| Debate synthesis → Sonnet | $0.61 |
| Valuation-specialist → Sonnet | $1.36 |
| **Total Tier 1** | **$6.11** |

| Stage | Before | After Tier 1 |
|-------|--------|-------------|
| One Pager | $0.41 | $0.41 |
| Pitch Deck | $15.09 | ~$13.00 |
| Full Story | $13.64 | ~$9.50 |
| **Total** | **$29.14** | **~$23.00** |

With Tier 2 (agent consolidation + curriculum trim): **~$18-20/run**

---

## Pricing Reference (as of 2026-04-06)

| Model | Input | Output | Cache Read | Cache Write | Web Search |
|-------|-------|--------|------------|-------------|------------|
| Sonnet 4.6 | $3/M | $15/M | $0.30/M | $3.75/M | $0.01/req |
| Opus 4.6 | $5/M | $25/M | $0.50/M | $6.25/M | $0.01/req |
| Haiku 4.5 | $0.80/M | $4/M | $0.08/M | $1/M | $0.01/req |

---

## Historical Comparison

| Run | Type | Total | PSR Cost | Notes |
|-----|------|-------|---------|-------|
| SFM V6 (CC) | FS only | $5.54 | $0 | PSR by CC subagents (subscription) |
| LULU (in-app v1.0) | OP+PD+FS | $29.14 | $8.28 | PSR paid twice |
| LULU (post PSR-reuse) | OP+PD+FS | ~$25.00 | $4.14 | PSR paid once |
| Target (Tier 1) | OP+PD+FS | ~$23.00 | $4.14 | + model routing |
| Target (Tier 1+2) | OP+PD+FS | ~$18-20 | $4.14 | + consolidation + curriculum trim |
