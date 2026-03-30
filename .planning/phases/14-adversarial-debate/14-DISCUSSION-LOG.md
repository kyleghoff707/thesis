# Phase 14: Adversarial Debate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 14-adversarial-debate
**Areas discussed:** Final debate presentation, Debate checkpoint UX, S6 narrative composition, Bear aggressiveness

---

## Final Debate Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Exchange-by-exchange | Each topic as structured exchange: Bull -> Bear -> Rebuttal -> Judge verdict | |
| Verdict-first summary | Lead with Judge's overall verdict, then supporting detail | |
| Dual view | Both formats -- verdict summary table at top, full exchange-by-exchange below | ✓ |

**User's choice:** Dual view
**Notes:** PM gets both the quick scan (verdict table) and the deep read (full exchanges) in one section.

### Follow-up: Exchange Count

| Option | Description | Selected |
|--------|-------------|----------|
| Match bull thesis points | Bull produces N points, Bear attacks each. N exchanges. | |
| Fixed 5 exchanges | Cap at exactly 5 exchanges. | |
| 5-8 range with Bear additions | Bull produces 5+ points, Bear attacks each AND adds 1-2 new attack vectors. | ✓ |

**User's choice:** 5-8 range with Bear additions
**Notes:** Initially selected "Match bull thesis points" then changed mind. Bear can add attack vectors the Bull conveniently omitted -- a real bear analyst wouldn't limit themselves to the bull's framing.

---

## Debate Checkpoint UX

### Checkpoint Display

| Option | Description | Selected |
|--------|-------------|----------|
| Judge verdict + exchange table | Overall verdict, unresolved count, summary table. PM types number to see detail. | ✓ |
| Full debate transcript | Entire 4-step exchange inline. | |
| Verdict + strongest bear point | Verdict table plus single strongest bear case. | |

**User's choice:** Judge verdict + exchange table
**Notes:** Matches the information density pattern from checklist checkpoints ("12/15 PASS, 2 PARTIAL, 1 FAIL").

### Re-run Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Re-run from any step | PM can re-run from any step forward. Downstream steps cascade. | ✓ |
| Whole debate only | Any re-run restarts all 4 steps. | |
| Individual step only | Re-run just one step. Risk of incoherence. | |

**User's choice:** Re-run from any step
**Notes:** Saves cost when Bull thesis is fine but Bear was weak -- only re-runs Bear + Rebuttal + Judge.

### PM Guidance on Re-runs

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with guidance text | PM types specific feedback injected into re-run prompt. | ✓ (extended) |
| No, just re-run | Same prompt, accept or reject only. | |

**User's choice:** Yes with guidance text + file attachment (if they choose to)
**Notes:** User extended the option -- PM can also attach files (short seller reports, analyst notes) as additional context for the re-run agent. Matches the hedge fund model where PMs hand analysts specific sources.

---

## S6 Narrative Composition

| Option | Description | Selected |
|--------|-------------|----------|
| 5th agent call -- synthesis-writer | After all 4 steps, synthesis-writer writes final S6 narrative. Clean separation of concerns. | ✓ |
| Judge produces final narrative | Expand Judge step to also write narrative. Saves 1 call but overloads role. | |
| Template-based assembly | Mechanical markdown assembly from JSON. Cheapest but reads like a template. | |

**User's choice:** 5th synthesis-writer call
**Notes:** User initially asked "If we go with Judge producing final narrative, do you think that will overload that role?" -- after discussing the trade-off (Judge impartiality vs cost), chose the 5th synthesis-writer call for clean separation. Judge scores, synthesis-writer presents.

---

## Bear Aggressiveness

### Bear Tone

| Option | Description | Selected |
|--------|-------------|----------|
| Activist short seller | Bear plays to WIN. Searches for strongest counter-evidence. Relentless. | ✓ |
| Balanced devil's advocate | Presents legitimate counter-arguments but stays measured. | |
| Evidence-only skeptic | Only raises points backed by concrete data. No speculation. | |

**User's choice:** Activist short seller
**Notes:** Matches "how would a real hedge fund do this?" litmus test -- they'd hire a bear who tries to kill the thesis.

### Web Search Depth

| Option | Description | Selected |
|--------|-------------|----------|
| 1+ per bull point + 1-2 general | Targeted search per point plus broad risk searches. ~7-10 total. | ✓ |
| 3-5 searches total | Fewer, focused on biggest themes. | |
| Unlimited -- Bear decides | As many as needed. Unpredictable cost. | |

**User's choice:** 1+ per bull point + 1-2 general
**Notes:** Matches the existing prompt instruction of "at least 1 web search per bull point."

### Citation Format

| Option | Description | Selected |
|--------|-------------|----------|
| Yes -- full URL citations | Bear's web search URLs carry through to final S6. PM can click to verify. | ✓ |
| Source names only | Cite source name but not URL. | |

**User's choice:** Yes -- full URL citations
**Notes:** Matches reference/citation system requirement (#14 from user's research patterns).

---

## Claude's Discretion

- Internal state management for debate step tracking and re-run support
- How PM guidance and file attachments are injected into re-run prompts
- Error handling and retry logic for individual debate steps
- Synthesis-writer composition prompt structure for dual-view format
- Token budget allocation across the 5 agent calls

## Deferred Ideas

None -- discussion stayed within phase scope.
