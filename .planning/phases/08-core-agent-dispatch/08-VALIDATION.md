---
phase: 8
slug: core-agent-dispatch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit tests) + standalone script (live API integration) |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run src/engines/__tests__/aiResearch.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds (unit), ~30-60 seconds (live API) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/engines/__tests__/aiResearch.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds (unit tests)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | API-01 | unit | `npx vitest run src/engines/__tests__/aiResearch.test.js` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | API-04 | unit | `npx vitest run src/engines/__tests__/aiResearch.test.js` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | API-05 | unit | `npx vitest run src/engines/__tests__/aiResearch.test.js` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 2 | FIX-02 | integration | `node --loader ./scripts/node-esm-loader.js scripts/test-agent-dispatch.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/engines/__tests__/aiResearch.test.js` — unit tests for config loading, prompt assembly, error handling, URL extraction
- [ ] Integration test script stub — validates live API dispatch

*Existing vitest infrastructure covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live API dispatch returns 800+ word narrative | API-01 | Requires API key + network + ~$0.61 | Run dispatch script with VITE_CLAUDE_KEY, verify narrative word count |
| Web search URLs appear in citation sources | API-04, FIX-02 | Requires API key + web search | Run dispatch with web search enabled, check citation.source fields |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
