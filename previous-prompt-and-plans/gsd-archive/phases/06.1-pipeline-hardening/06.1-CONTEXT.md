# Phase 7: Pipeline Hardening - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 makes the Pitch Deck generation pipeline production-grade. All 42 engineering issues from the COST debrief (2026-03-25) must be resolved — no shortcuts. Split into 5 sub-phases: 7A (DataPacket Node.js fixes), 7B (filing tools + PSR optimization), 7C (CC orchestration automation), 7D (quality enforcement), 7E (PM experience).

**Key constraint:** We are optimizing the CC subagent pipeline (free with CC subscription), NOT building the Claude API pipeline yet. `aiResearch.js` (direct API calls for the Tauri production app) is deferred to a future phase. Agent prompts are identical either way — they carry over directly when we switch.

</domain>

<decisions>
## Implementation Decisions

### Node.js Engine Strategy
- **D-01:** Extend `nodeAdapter.js` to handle ALL browser-only APIs. Engines stay untouched — the adapter does the heavy lifting. Shims needed: IndexedDB → file cache, Vite middleware endpoints → direct HTTPS fetch, DOMParser (already done). This makes the DataPacket 90%+ populated in Node.js.

### Orchestration Approach
- **D-02:** Fix and automate the CC subagent pipeline. Patch file permissions, add retry logic, automate orchestration within CC. `aiResearch.js` (direct Claude API mode) deferred to a future phase once quality is proven. Agent prompts carry over directly.
- **D-03:** Agent I/O stays file-based (CC subagent pattern). Fix file write permission issues — pre-authorize write paths or use Bash writes as fallback. Agents write section JSON to `.thes1s/reports/{TICKER}/sections/`.

### Filing Access
- **D-04:** Pre-process filings. Orchestrator converts filings to markdown via `filingMarkdown.js` BEFORE dispatching PSR agents. Agents receive clean markdown sections in their prompt — not raw HTML. Simpler, predictable token usage, no mid-generation EDGAR API calls. Requires making `filingMarkdown.js` work in Node.js (via D-01 nodeAdapter extension).

### Data Gaps
- **D-05:** Fix the DataPacket, not workarounds. The nodeAdapter extension (D-01) makes the DataPacket 90%+ populated. No separate "data gap resolution" mechanism needed. Agents still web search per curriculum — that's research quality, not missing data.

### Web Search Enforcement
- **D-06:** Both self-report AND audit. Each agent prompt includes a "Required Searches" checklist. Agent must include a `searchesPerformed` array in its JSON output listing every search executed. Post-generation, `critic.js` cross-checks citations against curriculum-mandated searches. If an agent claims it searched but has no web citations, that's flagged. Double verification — belt and suspenders.

### PM Progress Visibility
- **D-07:** Dual progress views (eventual). For Phase 7 specifically: build the generation status panel (progress bar + section status cards reading `generation-status.json`). The live orchestration log ("stroll through the office" — watching agents work in real-time) comes with `aiResearch.js` in a future phase. In CC mode, the CC terminal already IS the live view.
  - **Status panel shows:** which sections are done/generating/pending, per-section timing, overall progress bar, current phase (1/2/3)
  - **Orchestration log (future):** live feed showing agent dispatch, data flow, synthesis — transparent about what Thes1s is doing

### Verification
- **D-08:** SFM (Sprouts Farmers Market) for the verification run. Similar enough to COST (grocery/retail) to compare quality, different enough to test generalization. User has pre-course research to benchmark against.

### Claude's Discretion
- CC skill internal refactoring approach (how `/generate:pitch-deck` is updated to implement these fixes)
- Exact `generation-status.json` schema
- How `searchesPerformed` array is structured
- nodeAdapter.js implementation details (which APIs to shim, caching strategy)
- `filingMarkdown.js` Node.js bridge implementation
- Timing/metrics data structure within section JSON
- Error handling and retry patterns within CC orchestration
- Status panel component structure and polling interval

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source of Truth — COST Debrief
- `.thes1s/reports/COST/pitch-deck-generation-debrief.md` — 12-question engineering debrief. All 42 issues traced here. THE requirements document for Phase 7.
- `.thes1s/reports/COST/pitch-deck.md` — The generated COST report. Quality baseline for comparison.

### Architecture
- `gstack/plans/gstack-ai-agent-workflow-plan-20260323.md` — Authoritative architecture plan
- `agents/orchestrator/dispatch-table.json` — Pitch Deck dispatch: phases, agents, checkpoints
- `agents/orchestrator/config.json` — Section-to-agent mapping

### Phase 5-6 Foundations (Code to Modify/Extend)
- `src/engines/nodeAdapter.js` — Browser-to-Node shim (D-01 extends this)
- `src/engines/dataExport.js` — DataPacket assembler (consumers of nodeAdapter)
- `src/engines/filingMarkdown.js` — HTML-to-markdown converter (needs Node.js bridge via D-04)
- `src/engines/toolbox.js` — 23 tool definitions, `readFilingSection` + `getTranscriptExcerpt` stubs
- `src/engines/critic.js` — Quality validation (extend for D-06 search audit)
- `src/engines/progressState.js` — State machine + crash recovery
- `src/schemas/reportSection.js` — ReportSectionSchema (Zod)
- `src/schemas/dataPacket.js` — DataPacketSchema + sliceDataPacket()

### CC Skills (To Be Updated)
- `.claude/skills/generate-pitch-deck/SKILL.md` — Main pipeline skill (972 lines)
- `.claude/skills/generate-section/SKILL.md` — Single section re-run skill
- `.claude/skills/generate-one-pager/SKILL.md` — One Pager pipeline (reference)

### Agent Prompts (May Need Search Checklist Additions)
- `agents/*/prompt.md` — All 10 agent prompts (D-06 adds Required Searches checklists)

### UI Components (Status Panel)
- `src/components/PitchDeck.jsx` — May integrate status panel
- `src/hooks/usePitchDeck.js` — May extend for progress polling

### User Pre-Course Research (Verification Benchmark)
- `knowledge/pre-course-examples/` — SFM research for D-08 verification comparison

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `nodeAdapter.js` — Already shims DOMParser via linkedom, proxy URL rewriting, file-based cache. Foundation for D-01.
- `filingMarkdown.js` — Complete HTML-to-markdown converter with EDGAR table handling. Just needs Node.js bridge.
- `toolbox.js` — 21 working tools + 2 stubs. `readFilingSection` and `getTranscriptExcerpt` need implementation.
- `critic.js` — 6 quality checks already implemented. Extend for web search audit (D-06).
- `progressState.js` — Full state machine with crash recovery + section/quality/budget file I/O.

### Established Patterns
- `safeCall()` in dataExport.js wraps engine calls in try/catch with error accumulation
- `IS_NODE` detection flag in nodeAdapter.js for environment branching
- `PROXY_MAP` in nodeAdapter.js maps Vite proxy routes to real endpoints
- File-based cache in `.thes1s/cache/` with TTL support (nodeAdapter.js)

### Integration Points
- `generation-status.json` — New file written by CC skill, read by status panel component
- `searchesPerformed` — New field in ReportSectionSchema output
- nodeAdapter extensions → consumed by all engines that currently fail in Node.js
- `filingMarkdown.js` Node bridge → consumed by CC skill pre-processing step

</code_context>

<specifics>
## Specific Ideas

- **"Stroll through the office"** — The PM described wanting a live orchestration log that shows agents working in real-time, like a PM walking through the office checking on analysts. This is the eventual vision for the in-app orchestration view (deferred to `aiResearch.js` phase). For now in CC, the terminal IS this view.
- **Transparency as a feature** — "It shows that Thes1s is transparent about what it's doing, and it shows the true power of Thes1s at the same time." The status panel and future orchestration log are not just progress indicators — they're product differentiators.
- **Quality over everything** — All 42 issues must be addressed. No shortcuts. No deferrals within this phase.
- **SFM verification** — User has pre-course research on SFM to benchmark against. Compare depth, rigor, and coverage.

</specifics>

<deferred>
## Deferred Ideas

- **aiResearch.js (Claude API direct)** — Full in-app orchestration engine. Deferred per D-02 until CC pipeline quality is proven and agent prompts are stable. Agent prompts carry over directly.
- **Live orchestration log component** — Real-time feed showing agent dispatch/synthesis/data flow. Requires aiResearch.js. Deferred to that phase.
- **requestData agent tool** — Real-time callback for agents to request additional data mid-generation. Not needed if DataPacket is 90%+ populated (D-05). Revisit if gaps persist after nodeAdapter extension.
- **A/B test reverse-chronological PSR reading order** — Noted in Phase 6 D-09. Revisit once pipeline is stable.

</deferred>

---

*Phase: 07-pipeline-hardening*
*Context gathered: 2026-03-25*
