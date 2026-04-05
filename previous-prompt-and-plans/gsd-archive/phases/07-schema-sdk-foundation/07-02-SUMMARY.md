---
phase: 07-schema-sdk-foundation
plan: 02
subsystem: ai
tags: [anthropic-sdk, structured-outputs, zod, smoke-test, claude-api]

# Dependency graph
requires:
  - phase: 07-schema-sdk-foundation
    plan: 01
    provides: Modified ReportSectionSchema with z.string() fields and optional CitationSchema url
provides:
  - "@anthropic-ai/sdk upgraded to 0.80.0 with GA structured output support"
  - "Two-stage live API smoke test (scripts/smoke-test-schema.js)"
  - "Verified ReportSectionSchema works end-to-end with Claude API structured outputs"
  - "Confirmed schema + web_search_20250305 tool are compatible"
affects: [08-orchestration-layer, 09-parallel-dispatch]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk 0.80.0"]
  patterns: ["client.messages.parse() with zodOutputFormat()", "dotenv direct loading for scripts that use Anthropic SDK (avoid nodeAdapter fetch patch)"]

key-files:
  created: ["scripts/smoke-test-schema.js"]
  modified: ["package.json", "package-lock.json"]

key-decisions:
  - "Use claude-sonnet-4-6 (not claude-sonnet-4-20250514) — older models do not support output_config structured outputs"
  - "Load .env.local via dotenv directly in smoke test — nodeAdapter fetch monkey-patch interferes with Anthropic SDK request headers"

patterns-established:
  - "Anthropic SDK scripts must NOT use nodeAdapter.js — its fetch patch strips SDK auth headers. Use dotenv + direct import instead."
  - "Model selection for structured outputs: only claude-sonnet-4-6+ and claude-opus-4-6+ support output_config. Older model IDs (claude-sonnet-4-20250514) do not."

requirements-completed: [FMT-03]

# Metrics
duration: 19min
completed: 2026-03-28
---

# Phase 7 Plan 02: SDK Upgrade & Live Smoke Test Summary

**Anthropic SDK upgraded to 0.80.0 with two-stage live smoke test verifying ReportSectionSchema structured outputs and web search tool compatibility**

## Performance

- **Duration:** 19 min
- **Started:** 2026-03-28T02:10:49Z
- **Completed:** 2026-03-28T02:30:11Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Upgraded @anthropic-ai/sdk from ^0.78.0 to ^0.80.0 — zodOutputFormat available at GA import path
- Created two-stage smoke test that validates schema compilation + structured output parsing end-to-end
- Stage 1 (no tools): stop_reason end_turn, parsed_output populated with 20 fields, data field is string (11 keys), 3 citations, 3 red flags — $0.04
- Stage 2 (web search): stop_reason end_turn, parsed_output populated with 20 fields, data field is string (41 keys), 30 citations, 6 red flags, 5 web search blocks — $0.61
- Confirmed z.string() approach for data field works perfectly with API structured outputs

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade @anthropic-ai/sdk to 0.80.0** - `c31981d` (chore)
2. **Task 2: Create two-stage live API smoke test** - `f1422b6` (feat)

## Files Created/Modified
- `package.json` - SDK dependency upgraded to ^0.80.0
- `package-lock.json` - Lockfile updated for SDK 0.80.0
- `scripts/smoke-test-schema.js` - Two-stage live API smoke test (222 lines)

## Decisions Made
1. **Model selection: claude-sonnet-4-6 instead of claude-sonnet-4-20250514** — The plan specified `claude-sonnet-4-20250514` but that model does not support `output_config` structured outputs (returns 400: "does not support output format"). Discovered via `client.models.list()` that only `claude-sonnet-4-6`+ and `claude-opus-4-6`+ support structured outputs. This is critical context for Phase 8-9 orchestration.
2. **Direct dotenv loading instead of nodeAdapter.js** — nodeAdapter's `globalThis.fetch` monkey-patch (which adds SEC User-Agent headers to all requests) interferes with the Anthropic SDK's request headers, causing 401 auth failures. The smoke test loads `.env.local` via dotenv directly and imports the SDK without nodeAdapter. This pattern must be used by all future scripts that call the Anthropic API from Node.js (the aiResearch.js engine in Phase 8 will need its own solution).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] nodeAdapter fetch patch breaks Anthropic SDK auth**
- **Found during:** Task 2 (smoke test creation)
- **Issue:** nodeAdapter.js patches globalThis.fetch to add SEC User-Agent headers and intercept proxy URLs. This patch strips the Anthropic SDK's x-api-key header from requests, causing 401 "x-api-key header is required" errors.
- **Fix:** Replaced `import '../src/engines/nodeAdapter.js'` with direct `import dotenv` + `dotenv.config()` for .env.local loading. The smoke test only needs the API key, not the SEC proxy or DOM shims.
- **Files modified:** scripts/smoke-test-schema.js
- **Verification:** Both smoke test stages pass with 200 responses
- **Committed in:** f1422b6 (Task 2 commit)

**2. [Rule 3 - Blocking] Model claude-sonnet-4-20250514 does not support structured outputs**
- **Found during:** Task 2 (smoke test execution)
- **Issue:** Plan specified `claude-sonnet-4-20250514` but API returns 400: "'claude-sonnet-4-20250514' does not support output format." The models.list() endpoint confirmed only `claude-sonnet-4-6`+ support `output_config`.
- **Fix:** Changed model to `claude-sonnet-4-6` in the smoke test. Added MODEL constant with comment explaining the version distinction.
- **Files modified:** scripts/smoke-test-schema.js
- **Verification:** Both smoke test stages pass with end_turn stop_reason
- **Committed in:** f1422b6 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking issues)
**Impact on plan:** Both fixes were necessary to make the smoke test functional. The nodeAdapter incompatibility and model version distinction are critical context for all future Anthropic API work.

## Issues Encountered
- nodeAdapter fetch patch interference with SDK headers was non-obvious — the error was "x-api-key header is required" which looked like a key issue, not a fetch patch issue. Root-caused by testing SDK calls with and without nodeAdapter.

## Known Stubs
None — all code is functional and verified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SDK 0.80.0 installed and verified
- ReportSectionSchema confirmed compatible with Claude API structured outputs
- Web search tool + structured outputs confirmed compatible
- Pattern established for Node.js scripts calling Anthropic API (dotenv, not nodeAdapter)
- Critical finding: only claude-sonnet-4-6+ models support structured outputs — Phase 8 aiResearch.js must use this model
- Cost benchmark: Stage 2 (realistic agent call with web search) costs ~$0.61 — on track for $8-12 total pipeline target

---
*Phase: 07-schema-sdk-foundation*
*Completed: 2026-03-28*
