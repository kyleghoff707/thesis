# Phase 6: Pitch Deck - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 06-pitch-deck
**Areas discussed:** Build order & sub-phasing, Checkpoint experience, Primary Source Reader, FGR derivation flow

---

## Build Order & Sub-phasing

| Option | Description | Selected |
|--------|-------------|----------|
| Sub-phase it | Split into 3-4 sub-phases: agent prompts first, then generation skill, then UI, then polish. See working output sooner. | ✓ |
| Two big chunks | 6A = generation pipeline, 6B = display + delight. | |
| All at once | One massive phase, highest risk. | |

**User's choice:** Sub-phase it
**Notes:** None

### Sub-phase breakdown

| Option | Description | Selected |
|--------|-------------|----------|
| 4 sub-phases | 6A: Agent prompts. 6B: CC skill + generation + checkpoints + PSR. 6C: PitchDeck.jsx + 10 sections + sensitivity tables. 6D: Delight + LULU parity. | ✓ |
| 3 sub-phases | 6A: Agent prompts + CC skill. 6B: UI. 6C: Delight + polish. | |
| You decide | Claude determines breakdown during planning. | |

**User's choice:** 4 sub-phases
**Notes:** None

### Agent prompt authoring

| Option | Description | Selected |
|--------|-------------|----------|
| Same workflow | Use /writing-skills for each agent, user reviews each. Proven in 5C. | ✓ |
| Batch with spot checks | Draft all 4 in one go, user reviews the set together. | |
| Iterative per generation phase | Author only agents needed for each generation phase. | |

**User's choice:** Same workflow — with emphasis on reading EVERY reference file in /writing-skills
**Notes:** "These skills make up the core of the product, we have to get them right"

### Existing agent updates

| Option | Description | Selected |
|--------|-------------|----------|
| Prompts are stage-agnostic | No changes needed. | |
| Light update pass | Quick review for deeper Pitch Deck sections. | ✓ |
| Full rewrite | Re-author all 4 with Pitch Deck context. | |

**User's choice:** Light update pass
**Notes:** None

### Orchestrator approach

| Option | Description | Selected |
|--------|-------------|----------|
| Separate skill | New `/generate:pitch-deck` alongside existing one-pager. | ✓ |
| Extend existing skill | Upgrade to handle both stages via --stage flag. | |
| You decide | Claude determines best approach. | |

**User's choice:** Separate skill
**Notes:** None

### Phase 5B dependency

| Option | Description | Selected |
|--------|-------------|----------|
| 5B before 6 starts | Complete 5B first for reusable UI components. | ✓ |
| Skip 5B | Build Pitch Deck UI from scratch. | |
| Parallel | Extract shared components in 6C. | |

**User's choice:** 5B before 6 starts
**Notes:** None

---

## Checkpoint Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Terminal dialogue | CC skill pauses, prints summary, enters conversational loop. | ✓ |
| File-based review | Checkpoint writes a file, user reviews at own pace. | |
| Approve-only gate | Summary + confidence, approve or reject only. | |

**User's choice:** Terminal dialogue
**Notes:** None

### PM data injection

| Option | Description | Selected |
|--------|-------------|----------|
| Inject and re-run | PM can paste data, agents use it in next phase. Re-running sections optional. | ✓ |
| Append only | PM provides data, stored alongside but agents don't re-run. | |
| No injection | Agents work with what they have. | |

**User's choice:** Inject and re-run
**Notes:** None

### Who answers PM questions

| Option | Description | Selected |
|--------|-------------|----------|
| The relevant agent | Route to agent that produced the section. | ✓ |
| The synthesis-writer | One agent handles all dialogue. | |
| A dedicated checkpoint agent | New lightweight Q&A agent. | |

**User's choice:** The relevant agent
**Notes:** None

### Section redirect

| Option | Description | Selected |
|--------|-------------|----------|
| Re-run specific sections | PM marks sections for re-generation with guidance. | ✓ |
| Re-run entire phase | Whole phase re-runs with feedback. | |
| Fix in next phase | Issues addressed in subsequent phases. | |

**User's choice:** Re-run specific sections
**Notes:** None

---

## Primary Source Reader

### Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Selective sections | Specific 10-K sections only. ~$0.50-1.00. | |
| Full document | Entire 10-K. ~$3-5 per filing. | |
| Tiered approach | Selective first, targeted follow-up on gaps. | ✓ (initial selection) |

**User's choice:** Much deeper than any option presented
**Notes:** "Rule 1 teaches you that you should be reading at least 10 years of 10K reports & proxy statements, at least four quarters of 10Q reports, and at least four quarters of earnings call transcripts. The whole nine yards." User also noted filingMarkdown.js converts to markdown specifically to reduce tokens. SEC filings are always source of truth — cross-validate with financial analyst. If PSR and DataPacket disagree, PSR wins.

### Agent split

| Option | Description | Selected |
|--------|-------------|----------|
| Two agents (filing + transcript) | Agent 1: Filing Reader. Agent 2: Transcript Reader. | |
| One agent, tiered reads | Single agent reads everything in tiers. | |
| One agent per filing type | Three specialized agents. | |
| User's proposal | Annual Reader (10-Ks + proxies) + Quarterly Reader (10-Qs + transcripts) | ✓ |

**User's choice:** Two agents split by time horizon:
- Annual Reader: 10 years 10-Ks + 10 years proxies + shareholder letters
- Quarterly Reader: 4+ quarters 10-Qs + 4+ quarters transcripts
**Notes:** "Makes more sense because the proxies line up with each 10K. One annual agent, one quarterly agent. Makes more sense that way."

### Discrepancy handling

| Option | Description | Selected |
|--------|-------------|----------|
| Flag + override | PSR flags discrepancy, corrected value becomes primary. DataPacket preserved for audit trail. | ✓ |
| Flag + escalate to PM | PM decides which value to use. | |
| Silent correction | PSR silently uses SEC value. | |

**User's choice:** Flag + override
**Notes:** None

### Reading order

| Option | Description | Selected |
|--------|-------------|----------|
| Chronological | Oldest first, reading forward. | ✓ |
| Reverse-chronological | Most recent first, going backward. | |
| Agent decides | Agent determines order per company. | |

**User's choice:** Chronological
**Notes:** "Remind me to run an A/B test later on at some point. I want to stress test this to see which method is better. I personally go reverse-chronological but that's because I'm human and I'm lazy."

---

## FGR Derivation Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Agent-assisted with PM confirmation | Agents research all 5 inputs, PM confirms each. | ✓ |
| PM provides inputs manually | PM manually enters 3 of 5 inputs. | |
| Fully automated with PM veto | Agents determine all, PM can veto. | |

**User's choice:** Agent-assisted with PM confirmation
**Notes:** User asked about which agents complete before FGR. Confirmed: all Phase 1 + Phase 2 agents complete, both PSR agents complete, before FGR starts in Phase 3 section 10.

### FGR confirmation granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Input-by-input review | Each of 5 inputs presented separately with evidence. | ✓ |
| Summary review | All 5 in a table, PM reviews together. | |
| Range proposal only | Agent proposes final range, PM adjusts. | |

**User's choice:** Input-by-input review
**Notes:** None

### Standalone /fgr command

| Option | Description | Selected |
|--------|-------------|----------|
| Drop it | FGR only within pitch deck generation. | ✓ |
| Keep but scoped | Requires completed pitch deck. | |
| Keep it lite | Quick estimate version. | |

**User's choice:** Drop it
**Notes:** User challenged the premise: "How would it work as a standalone tool if it requires a bunch of previous research in order to be accurate?" — correct, FGR without deep research is superficial.

---

## Claude's Discretion

- CC skill internal architecture
- Token budget allocation per agent
- Inter-phase context passing mechanism
- PitchDeck.jsx component structure
- SensitivityTable.jsx implementation
- Delight feature implementation details
- Error handling / retry patterns

## Deferred Ideas

- Standalone `/fgr TICKER` (CMD-03) — depends on deep research, can't run standalone meaningfully
- A/B test filing reading order (chronological vs reverse-chronological)
- "At least 3 years of quarterlies" enforcement — observe quarterly reader behavior first
- Automated eval system — user IS the eval for first 5-10 reports
