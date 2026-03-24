# Research Summary: Thes1s AI Agent Workflow

**Domain:** Multi-agent AI investment research (Rule One methodology)
**Researched:** 2026-03-24
**Overall confidence:** HIGH

---

## Executive Summary

The Thes1s AI agent workflow is a well-scoped brownfield project: adding a multi-agent intelligence layer to an existing desktop app with 20+ validated financial data engines, 173 passing tests, and complete Toolbox UI. The technology landscape in March 2026 is unusually favorable -- Anthropic's Claude Agent SDK (released March 2025, renamed from Claude Code SDK) provides native subagent orchestration with context isolation, parallel execution, and structured output enforcement. This means the project's 9-agent architecture maps directly to first-party SDK primitives, not custom orchestration code.

The critical technology decisions are resolved: use the Claude Agent SDK for the CC Skills path (personal/development use), the existing Anthropic Client SDK for the commercial in-app API path, Zod v4 for schema enforcement across both paths, and a ~500-800 LOC Node.js adapter to bridge the browser-only engines to Node.js for agent consumption. The dual-path architecture (CC Skills now, API later) is sound because both paths share DataPacket assembly, Zod schemas, agent prompts, and report structure -- only the orchestration layer differs.

The biggest technical risk is not the AI orchestration (the SDK handles that) but context engineering: giving each of the 9 agents exactly the right curriculum slice without token waste. The architecture plan's "Write, Select, Compress, Isolate" strategy is validated by 2026 industry research showing that 65% of enterprise AI agent failures stem from context drift, not raw context exhaustion. The Agent SDK's subagent context isolation is the key enabler -- the Primary Source Reader's 200K+ token 10-K text stays in its own context window, and other agents only see the Reader's summary.

The prototype validation (March 23, 2026) confirmed the multi-agent necessity: single-agent One Pagers work, but single-agent Pitch Decks degrade rapidly. The architecture plan's 9 specialized roles are justified by this evidence, not theoretical preference.

---

## Key Findings

**Stack:** Claude Agent SDK for orchestration + Anthropic Client SDK for commercial API + Zod v4 for schema enforcement + linkedom/dotenv for Node.js adapter. Four new dependencies total.

**Architecture:** Three-layer system (Data, Intelligence, Presentation) with GSD-style orchestration dispatching 9 specialized agents via the Agent SDK's native subagent support. DataPacket is the canonical JSON bridge between layers.

**Critical pitfall:** Context engineering is the make-or-break challenge. Each agent must get focused curriculum (not the full 500+ line CLAUDE.md), and the Primary Source Reader's 200K+ token input must be isolated via subagent context boundaries. Failing to slice context properly causes context drift -- the #1 failure mode for production multi-agent systems.

---

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Phase 5A: Foundation** (3-4 days) -- DataPacket assembly, Zod schemas, Node.js adapter, agent definitions
   - Addresses: DataPacket assembly, report JSON schema, agent role definitions
   - Avoids: Building display components before validating AI output quality
   - Why first: Everything downstream depends on DataPacket and schemas. Pure code, no AI. Fully testable with vitest.

2. **Phase 5C: CC Skill + First Analysis** (2-3 days) -- Moved BEFORE 5B per eng review
   - Addresses: One Pager generation via CC Skill, LULU benchmark comparison
   - Avoids: Investing weeks in display components before seeing real output
   - Why before 5B: "See real output in 5 days not 14." Validate AI quality before building the frame.

3. **Phase 5B: Display Components** (1 week) -- OnePager.jsx, StatusBadge.jsx, SectionRenderer.jsx
   - Addresses: UI rendering of report data model, approval gates, progress dashboard
   - Avoids: Building without knowing what the AI actually produces

4. **Phase 5D: Quality System** (3-4 days) -- critic.js, contextBudget.js
   - Addresses: Citation validation, completeness scoring, token measurement
   - Avoids: Scaling to Pitch Deck without quality guardrails

5. **Phase 6: Pitch Deck** (2 weeks) -- Multi-agent orchestration, 10 sections, checkpoints
   - Addresses: The core product value. 3-phase generation with checkpoints.
   - Avoids: Doing Pitch Deck before One Pager quality is validated (gated)

6. **Phase 7: Full Story + Debate** (2 weeks) -- Bull/Bear/Judge, 43-item checklists
   - Addresses: Final conviction stage, adversarial analysis
   - Avoids: Building debate system before all section-level agents are proven

7. **Phase 8: Polish + Export** (1 week) -- PDF export, citation system, in-app API path
   - Addresses: Presentation-ready output, commercial deployment path
   - Avoids: Premature optimization of presentation before analysis quality is solid

**Phase ordering rationale:**
- 5A before everything because DataPacket + schemas are the foundation both paths share
- 5C before 5B because validating AI output quality before building display prevents wasted UI work
- 5D before Phase 6 because Pitch Deck's 15 AI calls need quality guardrails (citation validation, completeness scoring)
- Phases 5-7 use CC Skills path (free, interactive, iterative). Phase 8 adds the API path after prompts are proven.

**Research flags for phases:**
- Phase 5A: Standard patterns, unlikely to need additional research. DataPacket is pure data assembly.
- Phase 5C: LIKELY needs deeper research on prompt engineering for Rule One methodology. The curriculum injection depth and prompt structure will require iteration.
- Phase 6: LIKELY needs deeper research on checkpoint orchestration patterns. The Agent SDK supports sessions and resumption, but multi-checkpoint workflows across 3 phases with user interaction are not documented in the SDK examples.
- Phase 7: LIKELY needs research on adversarial debate patterns. The Bull/Bear/Judge system needs prompt design that produces genuine counter-arguments, not strawmen.

---

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | HIGH | All technologies verified against official documentation. Agent SDK, Client SDK, Zod v4, linkedom are all stable, well-documented, and fit the architecture. |
| Features | HIGH | Feature landscape derived from architecture plan that passed CEO + Eng review, plus prototype validation. Feature dependencies are clear. |
| Architecture | HIGH | Three-layer architecture validated through autoplan review. Agent SDK's subagent model maps directly to the 9-agent design. |
| Pitfalls | HIGH | Pitfalls derived from real prototype failures (March 23 validation), industry research on context engineering, and community reports on structured output edge cases. |
| Node.js Adapter | MEDIUM | The approach is sound (verified cacheStore.js already has Node.js fallback), but the exact LOC and complexity depends on how many engines need adaptation. Estimate of 500-800 LOC is from eng review but untested. |
| Context Engineering | MEDIUM | Strategy is solid (Write/Select/Compress/Isolate), but token budget estimates are theoretical until DataPacket assembly produces real numbers. Phase 5D (contextBudget.js) will validate. |
| Cost Estimates | MEDIUM | $8-12 per full pipeline is the eng review's revised estimate (up from $3-8 original). Primary Source Reader is the biggest cost driver. Real measurement needed. |

---

## Gaps to Address

- **Prompt engineering depth for Rule One methodology**: The agent definitions (`agents/{role}/prompt.md`) are the core product value but have not been written yet. Phase 5A writing-skills sessions will be critical. This is where most iteration will happen.
- **Checkpoint orchestration patterns**: The Agent SDK supports sessions and resumption, but the 3-4 checkpoint Pitch Deck workflow (generate phase -> present to user -> get answers -> resume with context) needs pattern validation.
- **Real token measurement**: All token budget estimates are theoretical (text.length / 4 approximation). Need real measurement once DataPacket assembly is built.
- **10-K token budget**: A full 10-K is 200K+ tokens. The Primary Source Reader strategy (separate subagent, summary output) needs validation to ensure the summary preserves qualitative nuance without losing signal.
- **Structured output edge cases**: Agent SDK structured output has a known issue where agents sometimes wrap output in `{"output": {...}}` instead of the raw schema. Need defensive parsing in production.
- **Cost measurement for commercial pricing**: $8-12 per pipeline is estimated. Need real measurement for margin calculations. Different companies have different 10-K lengths (AAPL ~80 pages, BRK ~140 pages).

---

## Sources

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Claude Agent SDK Structured Outputs](https://platform.claude.com/docs/en/agent-sdk/structured-outputs)
- [Claude API Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Skill Authoring Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Zod v4 Release Notes](https://zod.dev/v4)
- [State of Context Engineering 2026](https://www.newsletter.swirlai.com/p/state-of-context-engineering-in-2026)
- [Context Engineering for AI Agents](https://www.getmaxim.ai/articles/context-engineering-for-ai-agents-production-optimization-strategies/)
- Architecture Plan: `gstack/plans/gstack-ai-agent-workflow-plan-20260323.md`
- PROJECT.md: `.planning/PROJECT.md`
