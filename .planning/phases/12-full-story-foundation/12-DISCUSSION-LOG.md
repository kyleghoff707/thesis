# Phase 12: Full Story Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 12-full-story-foundation
**Areas discussed:** Checklist Schema, Prompt Strategy, Debate Schema

---

## Checklist Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Verdict + Evidence | Each item gets PASS/FAIL/PARTIAL plus 1-2 sentence evidence. Matches Rule One binary thinking. | ✓ |
| 1-5 Scale + Evidence | More granular but harder to interpret — what does a 3 mean? | |
| Narrative Only | Rich analysis per item but harder for Judge to compare. | |

**User's choice:** Verdict + Evidence
**Notes:** Simple, matches Rule One's binary conviction thinking.

| Option | Description | Selected |
|--------|-------------|----------|
| In data field | Checklist items as structured JSON in existing data field. Consistent with current schema. | ✓ |
| New schema field | Add dedicated checklistItems field to ReportSectionSchema. Cleaner but requires schema change. | |

**User's choice:** In data field (Recommended)
**Notes:** Keeps schema stable. No changes needed across all sections.

---

## Prompt Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Append to existing | Add Full Story sections to each agent's prompt.md. Same file, more content. Simplest. | ✓ |
| Stage-specific files | Create prompt-fullstory.md per agent. Cleaner separation but more files. | |
| You decide | Claude picks based on token budget and maintainability. | |

**User's choice:** Append to existing
**Notes:** Each prompt already has stage-aware sections. Full Story becomes the third section.

---

## Debate Schema

| Option | Description | Selected |
|--------|-------------|----------|
| ReportSectionSchema | Each step produces full section. Reuses existing infrastructure. | |
| Lightweight JSON | Simpler format for intermediate steps. Needs new schema. | |
| You decide | Claude picks based on integration with dispatch engine. | |

**User's initial question:** "What do you mean by the judge's final output is what goes in the report? Will I not be able to see the bull cases, the bear cases, and the bull rebuttal cases?"

**Clarification provided:** All 4 steps are visible in the report regardless of format. The question is about internal plumbing — what envelope the data uses between steps.

**Follow-up on Bear research:**

| Option | Description | Selected |
|--------|-------------|----------|
| All lightweight + Bear searches | All steps lightweight, Bear has web search. Simplest. | |
| Bear full, rest lightweight | Bear gets full schema, others lightweight. Precise. | |
| All full format | Every step gets ReportSectionSchema. Most thorough. | ✓ |

**User's reasoning:** "My instinct is to say create a new reportschema that is simpler — all in the name of saving money. But if the Bull/Bear agents are performing more websearching, that would justify a full reportschema."

**Final choice:** All full format — quality over cost savings on the most critical section.

---

## Claude's Discretion

- Exact JSON structure of checklist items within the data field
- How to encode the 4 debate steps within dispatch table JSON
- How prior Pitch Deck section data is formatted for Full Story agent context

## Deferred Ideas

None — discussion stayed within phase scope.
