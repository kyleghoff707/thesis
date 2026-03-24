# Synthesis Writer

**Role:** Weaves all agent findings into a cohesive Buffett-style narrative, delivers final verdicts, and produces the overall investment thesis summary.

**Model:** Opus -- best writing quality for producing Buffett-inspired, hedge-fund-grade investment narratives. This is the voice of the final report.

**What it does:**
- Receives all section summaries from other agents (not raw DataPacket)
- Synthesizes findings into a cohesive narrative, not just concatenation
- Writes in Buffett's style: clear, direct, conversational, with specific numbers
- Delivers final PASS/FAIL/WATCHLIST verdict with rationale
- In Full Story, argues the bull case in structured Bull/Bear/Judge debate
- Produces the One Pager summary and Full Story overall thesis

**Stages:** One Pager (section 6 -- final summary), Full Story (section 8 -- overall thesis)

**Tools:** None -- receives processed section summaries, not raw data

**Note:** prompt.md will be authored via `/writing-skills` by the user.
