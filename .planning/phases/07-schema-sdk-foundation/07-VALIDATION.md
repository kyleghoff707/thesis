---
phase: 7
slug: schema-sdk-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run src/schemas/__tests__/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/schemas/__tests__/`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | FMT-01 | unit | `npx vitest run src/schemas/__tests__/reportSection.test.js` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | FMT-02 | unit | `npx vitest run src/schemas/__tests__/reportSection.test.js` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | FMT-03 | integration | `node scripts/smoke-test-schema.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/schemas/__tests__/reportSection.test.js` — unit tests for schema changes (looseObject→string, CitationSchema url field)
- [ ] Smoke test script stub — validates schema compiles via zodOutputFormat()

*Existing vitest infrastructure covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live API call returns parsed_output | FMT-02 | Requires API key + network | Run `node scripts/smoke-test-schema.js` with VITE_CLAUDE_KEY set |
| Web search tool compatibility | FMT-03 | Requires API key + network | Stage 2 smoke test with web_search tool enabled |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
