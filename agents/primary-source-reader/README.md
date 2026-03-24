# Primary Source Reader

**Role:** Reads raw SEC filings (10-K, 10-Q, proxy statements) and earnings call transcripts to extract qualitative insights that no structured data engine can capture.

**Model:** Opus -- processes 200K+ token 10-K filings that require the strongest reasoning and largest context window.

**What it does:**
- Extracts business description, risk factors, competitive positioning, and management discussion from 10-K text
- Analyzes earnings call transcripts for key themes, management tone, and Q&A highlights
- Reviews proxy statements for compensation structure, insider ownership, and board composition
- Runs the Management Promise Tracker: extracts forward-looking statements and compares to actuals
- Cross-checks key DataPacket financials against actual 10-K text (data verification)

**Stages:** Pre-processing (runs before analysis agents, after Data Assembler)

**Sections:** None (produces `primarySourceInsights.json` consumed by all downstream agents)

**Note:** prompt.md will be authored via `/writing-skills` by the user.
