---
phase: 05A-agent-definitions-foundation
plan: 04
subsystem: agents
tags: [agent-definitions, config, writing-briefs, contamination-boundary, curriculum, vitest]

# Dependency graph
requires:
  - phase: 05A-01
    provides: DataPacket schema (dataPacket.js) with field definitions agents reference
  - phase: 05A-03
    provides: Toolbox tool definitions (toolbox.js) that agents declare in config.json
provides:
  - 9 agent role definitions with config.json, README.md, and stub prompt.md
  - 8 writing briefs for /writing-skills prompt authoring
  - Structural validation test suite (14 tests) for agent definitions
  - Machine-readable agent contracts (model, curriculum, DataPacket slice, tools, sections)
affects: [05A-05, 05B, 05C, agent-prompts, orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns: [agent-config-json-schema, writing-brief-template, worktree-aware-test-resolution]

key-files:
  created:
    - agents/data-assembler/config.json
    - agents/primary-source-reader/config.json
    - agents/financial-analyst/config.json
    - agents/business-analyst/config.json
    - agents/competitor-evaluator/config.json
    - agents/management-evaluator/config.json
    - agents/risk-analyst/config.json
    - agents/valuation-specialist/config.json
    - agents/synthesis-writer/config.json
    - agents/writing-briefs/README.md
    - agents/writing-briefs/financial-analyst-brief.md
    - agents/writing-briefs/business-analyst-brief.md
    - agents/writing-briefs/competitor-evaluator-brief.md
    - agents/writing-briefs/management-evaluator-brief.md
    - agents/writing-briefs/risk-analyst-brief.md
    - agents/writing-briefs/valuation-specialist-brief.md
    - agents/writing-briefs/synthesis-writer-brief.md
    - agents/writing-briefs/primary-source-reader-brief.md
    - agents/__tests__/agentDefinitions.test.js
  modified: []

key-decisions:
  - "buffett_writing_principles.md does not exist -- synthesis-writer references buffett_letters_claude_training_set/ directory instead"
  - "data-assembler has no compressionPolicy field (not an AI agent) and no prompt.md"
  - "Pre-processing agents (data-assembler, primary-source-reader) share empty section assignments -- test accounts for this"
  - "Worktree-aware curriculum path resolution via .git pointer for tests to work in both worktree and main repo"

patterns-established:
  - "Agent config.json schema: role, model, curriculum, compressionPolicy, universalContext, universalContextFiles, dataPacketSlice, tools, exampleContamination, sections"
  - "Writing brief template: Role Summary, Model, Curriculum to Embed, Universal Context, DataPacket Slice, Toolbox Tools, Sections, Output Format, Critical Rules, Contamination Boundary, Key Decisions"
  - "Contamination boundary: exampleContamination.exclude array in every AI agent config.json"

requirements-completed: [AGNT-01, AGNT-02, AGNT-03, AGNT-04]

# Metrics
duration: 11min
completed: 2026-03-24
---

# Phase 05A Plan 04: Agent Definitions Summary

**9 agent role definitions with config.json contracts, 8 writing briefs for /writing-skills authoring, and 14-test structural validation suite enforcing AGNT-01 through AGNT-04**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-24T20:02:12Z
- **Completed:** 2026-03-24T20:13:00Z
- **Tasks:** 3
- **Files modified:** 36

## Accomplishments
- Created all 9 agent directories with config.json (model, curriculum, DataPacket slice, tools, compressionPolicy, contamination boundary, section assignments)
- 8 writing briefs with complete context for /writing-skills prompt authoring (curriculum mapping, token budgets, tool lists, output format, critical rules)
- 14-test structural validation suite validating directory structure, config schema, contamination boundary, curriculum existence/depth, tool validity, section uniqueness, and AGNT-03 compression policy enforcement
- Zero LULU contamination in any agent configuration file

## Task Commits

Each task was committed atomically:

1. **Task 1: Create all 9 agent config.json, README.md, and stub prompt.md files** - `21a78d3` (feat)
2. **Task 2: Create writing briefs and briefs index for /writing-skills authoring** - `883f9d9` (feat)
3. **Task 3: Structural validation tests for agent definitions** - `cfdee29` (test)

## Files Created/Modified
- `agents/*/config.json` (9 files) -- Machine-readable agent contracts with model, curriculum, DataPacket slice, tools, sections
- `agents/*/README.md` (9 files) -- Human-readable agent role descriptions
- `agents/*/prompt.md` (8 files) -- Stub prompts for /writing-skills authoring (data-assembler excluded)
- `agents/writing-briefs/README.md` -- Index of all briefs with /writing-skills instructions
- `agents/writing-briefs/*-brief.md` (8 files) -- Writing briefs with curriculum mapping, token budgets, tool lists
- `agents/__tests__/agentDefinitions.test.js` -- 14-test structural validation suite

## Decisions Made
- **buffett_writing_principles.md**: Does not exist as standalone file. Synthesis-writer config.json references `knowledge/research-references/buffett_letters_claude_training_set/` directory instead (contains 5 curated Buffett shareholder letters). Writing brief documents this and instructs prompt author to extract writing principles from the letters directly.
- **Worktree-aware test resolution**: Tests resolve curriculum file paths through the .git file pointer to find the main repo root, since `knowledge/` is gitignored and not present in worktrees. Works in both environments.
- **Pre-processing agent section uniqueness**: data-assembler and primary-source-reader both have empty section assignments (pre-processing agents). Test accounts for this as a valid exception.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed curriculum path resolution in tests for worktree environment**
- **Found during:** Task 3 (TDD RED phase)
- **Issue:** Tests failed because `knowledge/` directory is gitignored and absent from worktree. CURRICULUM_ROOT resolved incorrectly via naive path traversal.
- **Fix:** Added `findMainRepo()` function that reads the `.git` file (worktree pointer) and resolves `gitdir: .git/worktrees/<id>` back to the actual repo root. Falls back to PROJECT_ROOT when not in a worktree.
- **Files modified:** `agents/__tests__/agentDefinitions.test.js`
- **Verification:** All 14 tests pass in worktree environment
- **Committed in:** cfdee29 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for tests to work in worktree environment. No scope creep.

## Issues Encountered
- `buffett_writing_principles.md` referenced in plan does not exist. Plan anticipated this ("check if exists, fall back to Buffett letters directory"). Used the fallback path.

## Known Stubs
- `agents/*/prompt.md` (8 files) -- All AI agent prompt files are DRAFT stubs. By design: the user replaces these via `/writing-skills`. Not blocking for plan completion.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Agent definitions complete -- ready for the user to author prompt.md files via `/writing-skills` using the writing briefs
- All config.json files validated by structural tests (14/14 pass)
- Writing briefs provide complete context: curriculum mapping with token budgets, DataPacket slice descriptions, Toolbox tool lists, section assignments, output format, and contamination boundary
- Orchestrator definition (05A-05) can now reference these agent configs for dispatch table construction

---
*Phase: 05A-agent-definitions-foundation*
*Completed: 2026-03-24*
