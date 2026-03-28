# Requirements: Thes1s v1.1 — API Migration & Pitch Deck Quality

**Defined:** 2026-03-27
**Core Value:** Depth of investigation that exceeds what a single human analyst can achieve in 70+ hours — delivered in minutes, with zero shortcuts on rigor.

## v1.1 Requirements

### API Orchestration Layer

- [ ] **API-01**: aiResearch.js dispatches agents via direct Claude API calls with structured outputs (output_config.format + zodOutputFormat)
- [ ] **API-02**: Parallel agent dispatch within phases using Promise.allSettled with configurable concurrency limits
- [ ] **API-03**: Prompt caching with cache_control breakpoints on shared context (curriculum, DataPacket, PSR findings) — 0.1x read cost on subsequent agents
- [ ] **API-04**: Web search via server tool (web_search_20250305) with max_uses per agent and URL extraction from tool results
- [ ] **API-05**: Error handling with retry-then-escalate: rate limit backoff, max_tokens retry, schema errors logged, partial results preserved
- [ ] **API-06**: Cache monitoring — log cache_read_input_tokens and cache_creation_input_tokens per response, warn if hit rate below 70%
- [ ] **API-07**: Token budget tracking using actual API response usage fields (input, output, cache read/write, web searches)

### Schema Compliance

- [ ] **FMT-01**: Replace z.looseObject({}) in ReportSectionSchema with structured output-compatible types (z.string() for data field, explicit types for chart config/data)
- [ ] **FMT-02**: Add optional url field to CitationSchema for web search URLs
- [ ] **FMT-03**: Verify ReportSectionSchema produces valid JSON Schema via z.toJSONSchema() — smoke test with live API call before pipeline work

### Quality & Compliance Fixes

- [ ] **FIX-01**: DataPacket field path reference included in every analysis agent prompt — exact top-level and second-level paths, not guessed
- [ ] **FIX-02**: Web citation URL enforcement — post-processing enriches citation source fields with actual URLs from web_search_tool_result blocks
- [ ] **FIX-03**: Citation format mechanically enforced — structured outputs guarantee canonical {id, ref, text, source} format on every section
- [ ] **FIX-04**: searchesPerformed format mechanically enforced — structured outputs guarantee {query, resultCount, usedInSection} on every section
- [ ] **FIX-05**: Red flags type mechanically enforced — structured outputs guarantee string array, not object array

### Validation

- [ ] **VAL-01**: SFM pitch deck generated via API pipeline scores 85+ overall quality with zero high-severity issues
- [ ] **VAL-02**: Second ticker (different sector, chosen at runtime) generates successfully at 85+ quality
- [ ] **VAL-03**: Pipeline cost per company is $8-12 (verified from API response usage fields)
- [ ] **VAL-04**: Pipeline runtime is 30-40 minutes wall clock (verified from timestamps)

## Carried Forward (Next Milestone)

### Full Story (Stage 3)

- **FLST-01**: CC skill `/generate:full-story` with 3-phase dispatch
- **FLST-02**: Scored checklists (Meaning 15pt, Moat 15pt, Management 13pt = 43 items)
- **FLST-03**: Bull/Bear/Judge structured debate
- **FLST-04**: DebateView component
- **FLST-05**: Management Promise Tracker
- **FLST-06**: Inversion & Rebuttal
- **FLST-07**: Quick Bull/Bear narrative toggle
- **FLST-08**: Trading Strategy + PACE Plan
- **FLST-09**: Conversational checkpoint dialogue
- **FLST-10**: Full parity vs LULU Full Story benchmark

### Export & Polish

- **EXPT-01**: Branded PDF export
- **EXPT-02**: Citation manager (40+ references)
- **EXPT-03**: Source preview on citation hover
- **EXPT-04**: Working view vs export view
- **EXPT-05**: Version history / diff view
- **EXPT-06**: In-app API-driven generation (commercial path)

## Out of Scope

| Feature | Reason |
|---------|--------|
| One Pager API migration | Works well enough as CC skill. Migrate later if needed. |
| In-browser direct API calls | Phase 8 Polish (EXPT-06). This milestone is Node.js orchestration. |
| Streaming progress UI | Differentiator, not table stakes. PM can wait 30-40 min. Add later. |
| Batch API for PSR | Marginal savings (~$0.40) for significant complexity. Revisit if cost target isn't met. |
| Strict tool_use validation | Tools work fine non-strict. Add if tool call errors become a problem. |
| Extended thinking | Adds output token cost. Structured output + narrative IS the thinking. |
| Fast mode (6x pricing) | $80+ per company. Speed is not the bottleneck — quality is. |
| Multi-turn agent conversations | Single-turn with tools is sufficient. PSR works with pre-processed filing markdown. |
| Inter-agent real-time communication | Orchestrator handles info flow via phased dispatch. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FMT-01 | Phase 7 | Pending |
| FMT-02 | Phase 7 | Pending |
| FMT-03 | Phase 7 | Pending |
| API-01 | Phase 8 | Pending |
| API-04 | Phase 8 | Pending |
| API-05 | Phase 8 | Pending |
| FIX-02 | Phase 8 | Pending |
| API-02 | Phase 9 | Pending |
| API-03 | Phase 9 | Pending |
| API-06 | Phase 9 | Pending |
| API-07 | Phase 9 | Pending |
| FIX-01 | Phase 10 | Pending |
| FIX-03 | Phase 10 | Pending |
| FIX-04 | Phase 10 | Pending |
| FIX-05 | Phase 10 | Pending |
| VAL-01 | Phase 11 | Pending |
| VAL-02 | Phase 11 | Pending |
| VAL-03 | Phase 11 | Pending |
| VAL-04 | Phase 11 | Pending |

**Coverage:**
- v1.1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation (traceability populated)*
