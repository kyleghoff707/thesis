---
status: partial
phase: 08-core-agent-dispatch
source: [08-VERIFICATION.md]
started: 2026-03-28T10:05:00Z
updated: 2026-03-28T10:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live End-to-End Dispatch
expected: Run `node --loader ./scripts/node-esm-loader.js scripts/test-agent-dispatch.js` — all 9 assertions pass (no error, stop_reason end_turn, data parsed to object, narrative >= 2000 chars, >= 3 citations, >= 1 red flag, web URLs extracted, >= 1 citation with URL, cost > 0)
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
