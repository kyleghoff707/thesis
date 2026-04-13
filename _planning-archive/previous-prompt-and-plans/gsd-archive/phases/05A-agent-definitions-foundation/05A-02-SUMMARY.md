---
phase: 05A-agent-definitions-foundation
plan: 02
subsystem: infra
tags: [nodejs, dotenv, linkedom, dom-parsing, env-shim, proxy-resolver, file-cache]

# Dependency graph
requires:
  - phase: phases-1-4
    provides: "30+ browser-based engine files with import.meta.env, DOMParser, Vite proxy patterns"
provides:
  - "nodeAdapter.js — browser API shims for Node.js (env, URL resolver, DOM parser, cache, fetch)"
  - "getEnv() — reads .env.local keys via dotenv, replaces import.meta.env"
  - "resolveURL() — maps 7 Vite proxy routes to real external endpoints"
  - "createDOMParser() — linkedom-based DOM parsing (querySelectorAll, textContent, getAttribute)"
  - "createNodeFetch() — fetch wrapper with SEC User-Agent header"
  - "File-based JSON cache with TTL (cacheGet/cacheSet/ensureCacheDir)"
affects: [05A-03-dataExport, 05A-04-toolbox, 05C-one-pager-generation]

# Tech tracking
tech-stack:
  added: [dotenv ^17.3.1, linkedom ^0.18.12]
  patterns: [node-adapter-shim, proxy-url-resolution, file-based-cache]

key-files:
  created:
    - src/engines/nodeAdapter.js
    - src/engines/__tests__/nodeAdapter.test.js
  modified:
    - package.json
    - package-lock.json
    - .gitignore

key-decisions:
  - "Node adapter is Node-only module — browser code continues using config.js and native APIs"
  - "Used dotenv.config with explicit .env.local path — bare dotenv/config only loads .env which does not exist"
  - "linkedom for DOM parsing over jsdom — 3x faster, 1/3 memory, sufficient for querySelectorAll/textContent"
  - "File-based cache in .thes1s/cache/ with JSON + TTL — replaces localStorage/IndexedDB for Node"

patterns-established:
  - "Node adapter shim: import nodeAdapter.js for Node-only engine execution"
  - "Proxy URL resolution: PROXY_MAP constant maps 7 /api/* routes to real domains"
  - "File cache: .thes1s/cache/{key}.json with expiresAt/cachedAt metadata"

requirements-completed: [DATA-02]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 05A Plan 02: Node.js Data Bridge Summary

**Node.js adapter module (168 LOC) shimming browser APIs for engine execution: dotenv env access, 7-route proxy URL resolver, linkedom DOM parser, file-based JSON cache with TTL**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T19:35:56Z
- **Completed:** 2026-03-24T19:39:32Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created nodeAdapter.js with 11 exports providing full browser API shim layer for Node.js
- 25 tests covering URL resolution (7 proxy routes), env access, DOM parsing, file caching, fetch wrapper
- TDD workflow: failing tests first, then implementation, all green
- Added dotenv and linkedom as production dependencies
- Zero regressions — all 429 engine tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for Node adapter** - `078cd50` (test)
2. **Task 1 (GREEN): Node adapter implementation** - `db6839f` (feat)
3. **Deviation: .thes1s/ gitignore entry** - `b2a036f` (chore)

_TDD task: test commit followed by implementation commit._

## Files Created/Modified
- `src/engines/nodeAdapter.js` - Node.js data bridge: env wrapper, URL resolver, DOM parser, cache, fetch wrapper (168 LOC)
- `src/engines/__tests__/nodeAdapter.test.js` - 25 tests covering all adapter functionality (191 LOC)
- `package.json` - Added dotenv ^17.3.1, linkedom ^0.18.12
- `package-lock.json` - Dependency lockfile update
- `.gitignore` - Added .thes1s/ (runtime cache directory)

## Decisions Made
- **Node-only module**: nodeAdapter.js is never imported in browser code. Browser engines continue using config.js and native APIs. Only dataExport.js and toolbox.js (future CC Skills modules) will import it.
- **Explicit .env.local path**: Used `dotenv.config({ path: resolve(process.cwd(), '.env.local') })` instead of bare `import 'dotenv/config'`. The project stores API keys in .env.local, not .env.
- **linkedom over jsdom**: linkedom is faster and lighter. The engines only need querySelectorAll, textContent, and getAttribute — not full browser emulation.
- **File-based cache with TTL**: JSON files in .thes1s/cache/ directory. Each entry stores value, expiresAt, and cachedAt. Mirrors the TTL pattern from cacheStore.js (IndexedDB in browser).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added .thes1s/ to .gitignore**
- **Found during:** Task 1 (after implementation, file cache tests created .thes1s/cache/ directory)
- **Issue:** The file-based cache directory would be tracked by git if not gitignored
- **Fix:** Added `.thes1s/` entry to .gitignore with explanatory comment
- **Files modified:** .gitignore
- **Verification:** `git status --short` shows clean tree
- **Committed in:** b2a036f

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical)
**Impact on plan:** Essential housekeeping to prevent runtime cache files from being tracked in git. No scope creep.

## Issues Encountered
None

## Known Stubs
None — all functionality is fully implemented and tested.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- nodeAdapter.js ready for import by dataExport.js (Plan 03) and toolbox.js (Plan 04)
- All 11 exports available: IS_NODE, getEnv, isDev, resolveURL, PROXY_MAP, createDOMParser, createNodeFetch, SEC_HEADERS, cacheGet, cacheSet, ensureCacheDir
- linkedom DOM parsing verified compatible with the querySelectorAll/textContent/getAttribute patterns used by filingMarkdown.js

## Self-Check: PASSED

- FOUND: src/engines/nodeAdapter.js
- FOUND: src/engines/__tests__/nodeAdapter.test.js
- FOUND: 078cd50 (test commit)
- FOUND: db6839f (feat commit)
- FOUND: b2a036f (chore commit)

---
*Phase: 05A-agent-definitions-foundation*
*Completed: 2026-03-24*
