# Phase 7: Pipeline Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 07-pipeline-hardening
**Areas discussed:** Node.js strategy, Orchestration, Filing tools, Data gaps, Web search enforcement, PM progress, Verification ticker

---

## Node.js Engine Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Extend nodeAdapter.js | Beef up adapter to shim all missing APIs. Engines untouched. | ✓ |
| Node-only wrappers | Write thin Node.js wrappers in src/engines/node/. Clean separation. | |
| Dual-environment engines | Modify each engine with if (IS_NODE) branching. | |

**User's choice:** Extend nodeAdapter.js (Recommended)
**Notes:** Clean approach — adapter was designed for this purpose.

---

## Orchestration Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Build aiResearch.js now | Direct Claude API calls, full control | |
| Keep CC subagents, fix permissions | Stay with CC approach, patch issues | |
| Both — CC for now, API later | Fix CC now, build API later | ✓ (initially) |
| Fix CC pipeline now | Patch permissions, add retry, automate within CC | ✓ (final) |

**User's choice:** Fix CC pipeline now
**Notes:** User was initially torn — wanted to optimize CC (free, already paying) vs API (production). Clarified that agent prompts are identical either way. User chose to prove quality in CC first, then port to API. Key insight: "I naively thought that the backend buildout would be the same, and converting CC → API would be easy after I confirm the output quality and pipeline were rock solid."

---

## Agent I/O

| Option | Description | Selected |
|--------|-------------|----------|
| Structured API response | JSON in API response, orchestrator saves | |
| File-based I/O | Agents write to disk, matches CC pattern | ✓ |
| Hybrid | Response + file backup | |

**User's choice:** File-based I/O (follows from CC decision)
**Notes:** Explained in plain English after user asked for clarification. File-based is the CC subagent pattern; structured response requires aiResearch.js.

---

## Filing Tool Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-processing step | Orchestrator converts before dispatch | ✓ |
| Real-time tool call | Agents fetch on demand mid-generation | |
| Hybrid | Pre-process common + on-demand for extras | |

**User's choice:** Pre-processing step (Recommended)
**Notes:** Simpler, predictable token usage.

---

## Data Gaps

| Option | Description | Selected |
|--------|-------------|----------|
| Agents web search independently | Fill gaps via WebSearch | |
| Structured needs field | Second-pass data enrichment | |
| Fix the DataPacket first | Make DataPacket 90%+ populated | ✓ |

**User's choice:** Fix the DataPacket
**Notes:** User clarified the distinction: web searching is for curriculum-mandated research (quality), DataPacket gaps are missing engine data (plumbing). "We spent a lot of effort building Thes1s already, might as well use it."

---

## Web Search Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Search checklist in agent output | Self-report searchesPerformed array | |
| Post-generation audit only | critic.js scans citations after the fact | |
| Both — self-report + audit | Belt and suspenders | ✓ |

**User's choice:** Both — self-report + audit
**Notes:** Double verification. Agent self-reports + critic.js cross-checks.

---

## PM Progress Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Generation status panel | Progress bar + section cards via JSON polling | ✓ |
| Live section rendering | Sections render as they complete | |
| Terminal output only | Watch CC terminal | |

**User's choice:** Status panel + live orchestration log (eventual)
**Notes:** User's vision: "It's as if a PM were taking a stroll through the office, checking in on analysts as they're working. It shows that Thes1s is transparent about what it's doing, and it shows the true power of Thes1s at the same time." Dual views — status panel for simplicity, orchestration log for transparency. Log deferred to aiResearch.js phase since CC terminal already provides this.

---

## Verification Ticker

| Option | Description | Selected |
|--------|-------------|----------|
| ODFL (Old Dominion Freight) | Freight/logistics, different industry | |
| EW (Edwards Lifesciences) | Medical devices | |
| SFM (Sprouts Farmers Market) | Grocery/specialty retail | ✓ |
| User picks at runtime | Maximum flexibility | |

**User's choice:** SFM (Sprouts Farmers Market)
**Notes:** Similar enough to COST for quality comparison, different enough to test generalization. User has pre-course research to benchmark against.

---

## Claude's Discretion

- CC skill refactoring approach
- generation-status.json schema
- searchesPerformed array structure
- nodeAdapter implementation details
- filingMarkdown Node.js bridge
- Timing data structures
- Error handling/retry patterns
- Status panel component structure

## Deferred Ideas

- aiResearch.js (Claude API direct) — future phase after CC quality proven
- Live orchestration log component — requires aiResearch.js
- requestData agent tool — revisit if DataPacket gaps persist
- A/B test reverse-chronological PSR reading — noted in Phase 6 D-09
