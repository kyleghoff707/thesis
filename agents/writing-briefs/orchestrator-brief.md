# Orchestrator Brief

This brief describes the orchestrator — a **code module**, not an AI agent. It serves as the reference document for building the CC skill (Phase 5C) and aiResearch.js engine (Phase 8).

## Exclusive Curriculum

The orchestrator's only curriculum file is:
- `knowledge/research-references/rule-1-workflow.md` — The Rule One research workflow that defines the 3-stage gated process

The orchestrator does not consume analysis curriculum (pitch-deck-I.md, etc.) — those are for the AI agents. The orchestrator only needs to understand the overall workflow structure to sequence agents correctly.

## Dispatch Table Structure

The dispatch table (`dispatch-table.json`) defines execution for all 3 stages:

### Reading the Dispatch Table

Each stage has four sections:

1. **preProcessing** — Sequential steps that run before any analysis phase (data assembly, primary source reading)
2. **phases** — Numbered analysis phases, each containing agent assignments with parallelism flags
3. **postProcessing** — Final steps after all phases complete (synthesis, final assembly)
4. **sectionKeys** — Canonical key names for each section, used in progress tracking

### Agent Entry Fields

```json
{
  "agent": "financial-analyst",  // Role name matching agents/*/config.json
  "sections": [5, 7, 8],        // Section numbers this agent handles
  "parallel": true,              // Can run simultaneously with other parallel agents in same phase
  "note": "Optional context",   // Human-readable note about sequencing rationale
  "role": "bull",                // Optional role override (used in debate phase)
  "subWorkflow": "fgr-derivation" // Optional sub-workflow trigger
}
```

### Phase Checkpoints

Phases can have checkpoint definitions:

```json
{
  "checkpoint": {
    "after": true,
    "presents": ["findings", "dataGaps", "questions", "confidence"]
  }
}
```

The `presents` array tells the orchestrator what to collect from completed agents and display to the user.

## State Machine Transitions

The orchestrator enforces a linear state machine. Valid transitions:

| Current State | Valid Next States |
|---|---|
| IDLE | DATA_ASSEMBLY |
| DATA_ASSEMBLY | PRIMARY_SOURCE_READING, WAVE_1_RUNNING |
| PRIMARY_SOURCE_READING | WAVE_1_RUNNING |
| WAVE_1_RUNNING | CHECKPOINT_1, WAVE_2_RUNNING |
| CHECKPOINT_1 | WAVE_2_RUNNING |
| WAVE_2_RUNNING | CHECKPOINT_2, WAVE_3_RUNNING |
| CHECKPOINT_2 | WAVE_3_RUNNING |
| WAVE_3_RUNNING | CHECKPOINT_3, SYNTHESIS |
| CHECKPOINT_3 | SYNTHESIS |
| SYNTHESIS | QUALITY_CHECK |
| QUALITY_CHECK | COMPLETE |
| COMPLETE | (terminal) |

Stages that skip checkpoints (like One Pager) can jump directly: WAVE_1_RUNNING -> SYNTHESIS.

## Checkpoint Format

When a phase completes, the orchestrator collects from each agent's output:

1. **Findings** — `section.findings[]` from each completed section
2. **Data gaps** — `section.dataGaps[]` flagged by agents when they could not find information
3. **Questions** — `section.questions[]` where agents need user input to proceed
4. **Confidence** — `section.confidence` (HIGH/MEDIUM/LOW) per section

These are presented to the user (portfolio manager) in a structured format. The user responds with:
- Answers to questions
- Corrections to findings
- Pasted data to fill gaps
- "Proceed" to continue to the next phase

## Retry-Then-Escalate Flow

When an agent fails:

1. **Retry once** with the same context
2. If retry fails, **escalate to user** with the error and ask how to proceed:
   - Skip this section (mark as incomplete)
   - Provide missing data and retry
   - Assign to a different agent
3. Log the failure in `progress.errors[]`

## FGR Confirmation

The valuation specialist's Section 10 (Pitch Deck) triggers a special FGR sub-workflow:

1. Analyst proposes FGR based on 5 inputs (rear view mirror, market relativity, company guidance, sector/industry, analysts)
2. Orchestrator presents FGR derivation to user at Checkpoint 3
3. User must explicitly confirm or adjust FGR before buy prices are calculated
4. `checkpointRules.fgrRequiresConfirmation: true` enforces this gate

## Mapping to Section Keys

The `sectionMapping` in `config.json` maps section numbers to agent roles. The `sectionKeys` in the dispatch table map section numbers to canonical key names used in progress.json:

**One Pager:** 1=company_info, 2=minimum_standards, 3=meaning, 4=growth_metrics, 5=valuation_summary, 6=overall_verdict

**Pitch Deck:** 1=radar, 2=simple_predictable, 3=market_position, 4=barriers_moats, 5=fcf, 6=management, 7=roe_roic_debt, 8=balance_sheet, 9=pest, 10=valuation

**Full Story:** 1=event_analysis, 2=meaning_checklist, 3=moat_checklist, 4=management_checklist, 5=valuation_confirmation, 6=inversion_rebuttal, 7=trading_strategy, 8=pace_plan
