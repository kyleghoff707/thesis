---
quick_id: 260330-u2o
status: complete
commit: aaeefa0
---

## Summary

Fixed silent null section propagation in the Full Story pipeline. Two root causes:

1. **Ambiguous section assignment** — `buildSectionAssignment()` produced "Generate sections: 5" without stage context, so agents with both Pitch Deck and Full Story section definitions defaulted to Pitch Deck. Fixed to include stage: "Stage: Full Story. Generate Full Story sections: 5".

2. **Silent null parsed_output** — When the Claude API returns minimal tokens (e.g., 6) and structured output parsing fails, `parsed_output` is null. `dispatchAgent` returned `{ section: null, error: null }` — a silent failure. The null section got pushed into `allSections`, crashing downstream code. Fixed by adding a null guard that converts null sections into explicit errors with diagnostic info (output token count, stop_reason).

Also added:
- Null guard on `allSections.push` in pipelineManager (belt-and-suspenders)
- Null guard on `priorSections` iteration in `buildUserMessage` (crashed debate steps)
- Null guard in `run-full-story.js` section reporting loop

## Key Files

- `src/engines/aiResearch.js` — null section guard after parsed_output, priorSections filter
- `src/engines/pipelineManager.js` — stage-aware buildSectionAssignment, null guard on push
- `scripts/run-full-story.js` — null guards in section iteration and reporting
