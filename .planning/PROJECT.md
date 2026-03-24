# Thes1s — AI Agent Workflow

## What This Is

Thes1s is a professional AI-powered investment analyst team for Rule One stock research. The user is the portfolio manager; the AI agents are the analyst team. Each agent has a specialized role (financial analyst, business analyst, risk analyst, etc.), follows Rule One methodology exactly, and produces hedge-fund-quality investment theses through a 3-stage gated workflow: One Pager (filter) → Pitch Deck (research) → Full Story (conviction). The agents don't just generate reports — they investigate like their careers depend on it. Every unknown gets explored. Every claim gets cited. Every section gets checked.

This is not a black box. The portfolio manager reads every output, challenges assumptions, provides data sources agents couldn't access, and makes final decisions. It's a collaborative research operation — the same operating model as a real hedge fund analyst team, except the analysts are AI agents working 1000x faster.

## Core Value

**Depth of investigation that exceeds what a single human analyst can achieve in 70+ hours — delivered in minutes, with zero shortcuts on rigor.**

The power of Rule One research is the depth. A human analyst doing 70 hours of manual research inevitably hits "good enough" moments. AI agents don't. They explore every unknown, follow every thread, cross-reference every claim. The goal is not parity with manual research — it's *deeper* than manual research.

## Requirements

### Validated

- Data layer: 20+ financial data engines (EDGAR XBRL, growth rates, return metrics, FCF, valuation, peers, gurus, insiders, compensation, transcripts, events, analyst estimates)
- Three-layer XBRL engine validated across all 503 S&P 500 companies
- 8 Toolbox tabs (Overview, Financials, Growth, Valuation, Competitors, Insiders, Filings, Audit)
- 173 vitest tests passing
- Prototype validation: One Pagers work single-agent, Pitch Decks require multi-agent

### Active

- [ ] Agent definitions — 9 specialized roles with full curriculum, trained on Rule One methodology
- [ ] DataPacket assembly — all engine output packaged as canonical JSON for agents
- [ ] Report JSON schema — section-level granularity, citations, confidence, verdicts
- [ ] Node.js data bridge — ~500-800 LOC adapter for CC skills and future backend
- [ ] One Pager generation — CC skill + UI rendering
- [ ] Pitch Deck generation — multi-agent orchestration with structured checkpoints
- [ ] Full Story generation — deepest analysis with Bull/Bear/Judge debate
- [ ] Quality system — citation validation, completeness scoring, confidence checks
- [ ] Presentation-ready PDF export — branded, professional, charts + footnoted citations
- [ ] Toolbox tools for agents — interactive data exploration during analysis
- [ ] Management Promise Tracker — extract promises from earnings calls, compare to actuals
- [ ] Primary Source Reader — 10-K text, transcripts, proxy, data verification against DataPacket
- [ ] Delight features — deep-dive, source preview, Bull/Bear toggle, assumption tracker, industry cards, progress dashboard, version history

### Out of Scope

- Server infrastructure / API gateway — local desktop app for now
- Stripe billing / payment integration — commercial later
- Team features / multi-tenant — single-user first
- Mobile app — desktop only
- Batch processing pipeline — one company at a time
- Real-time thesis monitoring alerts — manual trigger only
- Automated eval system — user IS the eval for first 5-10 reports, automated later

## Context

### Brownfield — Extensive Existing Codebase
Phases 1-4 complete. All data engines, all UI tabs, watchlists, 3-layer XBRL engine with provenance, 173 tests. The remaining work is the AI layer — the intelligence that transforms raw data into investment theses.

### Architecture Plan (Source of Truth)
`gstack/plans/gstack-ai-agent-workflow-plan-20260323.md` — 516-line authoritative plan. Reviewed by CEO review (scope expansion), Eng review (architecture validated + prototype confirmed). Contains: 9 agent roles, 3-layer architecture, stage orchestration, DataPacket + Toolbox tools, quality assurance system, report JSON schema, cost estimates, 22 key design decisions, prototype validation results.

### Rule One Knowledge Base
`knowledge/` directory contains full Rule One curriculum: stage templates, curriculum files (one-pager.md, pitch-deck-I through IV, story-form-I and II), research references (fgr.md, equity-bond-research.md, rule-one-fundamentals.md, tools-for-analysis.md, advanced-financial-analysis.md), and the user's own manual research examples (LULU, EW, SFM, MU, ODFL).

### LULU Example — Benchmark, Not Template
The user's manual LULU analysis (One Pager PDF, Pitch Deck, Full Story) is the quality benchmark. Generated output must achieve full parity in depth and rigor — and ideally go deeper. CRITICAL: agents must NEVER see or pattern-match from LULU examples during generation. The examples exist only for the user to compare output quality after generation.

### Operating Model — Hedge Fund Analyst Team
The user is the portfolio manager. Agents are the analyst team. This is not "click generate and walk away." The PM:
- Reviews every output at structured checkpoints
- Challenges assumptions and asks agents to go deeper
- Provides data sources that agents couldn't access (paywalled, firewalled)
- Verifies final output against their own expertise
- Makes the invest/don't-invest decision

Agents must escalate to the PM when they hit data walls — never guess, never skip.

### Agent Design Philosophy
Each agent is a specialist. They follow Rule One methodology exactly as laid out in the curriculum files. They investigate every unknown. They cite every claim. They identify red flags even when the thesis is bullish. They don't produce "good enough" — they produce "thorough." The depth IS the competitive advantage.

Context engineering is critical: enough curriculum to prevent hallucinations and ensure methodological correctness, but not so much that token budgets explode. This balance is the core design challenge of Phase 5A.

### Dual Audience
Thes1s is used by both humans (reading reports, reviewing at checkpoints) and AI agents (consuming DataPacket, producing sections). The UI must serve both: human-friendly display AND structured data that downstream agents can consume.

## Constraints

- **Desktop only**: Tauri app, no server. API calls go direct to external services.
- **Cost ceiling**: Full pipeline (One Pager + Pitch Deck + Full Story) should target ~$8-12 per company. Primary Source Reader is the biggest cost driver (~200K+ input tokens for a full 10-K).
- **LULU contamination**: Agents must never access LULU examples during generation. Evaluation only.
- **Rule One methodology**: Agents follow the curriculum exactly. Creative freedom is limited to investigation depth and narrative style — never methodology.
- **User verification**: The user personally verifies agent output quality at each milestone. No milestone is "done" until the user says so.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 9 specialized agent roles | Prototype proved single-agent degrades on complex analysis. Each role = focused context + curriculum. | -- Pending |
| GSD-style orchestration | Commands dispatch, agents execute in parallel with fresh context. Proven pattern. | -- Pending |
| Build order 5A → 5C → 5B | Validate AI quality before investing in display components. See output in 5 days not 14. | -- Pending |
| Node.js data bridge (not browser scraping) | Permanent infrastructure. Foundation for CC skills AND future backend. No tech debt shortcuts. | -- Pending |
| Manual eval first, automated later | User IS the eval for first 5-10 reports. Build eval system after understanding what "good" looks like. | -- Pending |
| JSON schema enforcement for agent output | Without it, parsing is fragile. Use Claude JSON mode or schema validation. | -- Pending |
| Use /writing-skills for agent definitions | Agent skills are the core product value. Read all supporting files. Do it right. | -- Pending |
| LULU examples as benchmark only | Keep for quality comparison. Exclude from agent context to prevent contamination. | -- Pending |
| 5 milestones (not 1 mega-milestone) | Complex plan needs structured gates. User verifies quality at each boundary. | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 after initialization*
