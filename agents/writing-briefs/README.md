# Writing Briefs -- Agent Prompt Authoring

These briefs provide everything needed to author each agent's `prompt.md` file
using the `/writing-skills` skill.

## How to Use

1. Pick an agent from the list below
2. Read its writing brief (linked below)
3. Run `/writing-skills` with the brief as input
4. **CRITICAL:** Tell Claude to read ALL writing-skills reference files before starting:
   - `.claude/skills/writing-skills/anthropic-best-practices.md` -- Anthropic's official skill authoring guidance
   - `.claude/skills/writing-skills/testing-skills-with-subagents.md` -- Complete testing methodology
   - `.claude/skills/writing-skills/persuasion-principles.md` -- Bulletproofing against rationalization
   - `.claude/skills/writing-skills/graphviz-conventions.dot` -- Flowchart style (if needed)
   - `.claude/skills/writing-skills/examples/` -- Example skills for reference
5. The skill walks you through a TDD-style authoring process
6. Output goes to `agents/{role}/prompt.md` (replacing the DRAFT stub)

**Why read ALL reference files?** These agent skills are the core product of Thes1s.
Cutting corners on skill authoring = cutting corners on research quality.
Every reference file exists because it prevents a specific class of failure.

## Agent Briefs

| Agent | Brief | Model | Sections |
|-------|-------|-------|----------|
| Primary Source Reader | [primary-source-reader-brief.md](primary-source-reader-brief.md) | Opus | Pre-processing (legacy -- see annual-reader + quarterly-reader) |
| Annual Reader | [annual-reader-brief.md](annual-reader-brief.md) | Opus | Pre-processing (10-K, proxy, shareholder letters) |
| Quarterly Reader | [quarterly-reader-brief.md](quarterly-reader-brief.md) | Opus | Pre-processing (10-Q, transcripts, promise tracking) |
| Financial Analyst | [financial-analyst-brief.md](financial-analyst-brief.md) | Sonnet | OP 3-4, PD 5/7/8, FS 5 |
| Business Analyst | [business-analyst-brief.md](business-analyst-brief.md) | Sonnet | OP 1-2, PD 1-2, FS 2-3 |
| Competitor Evaluator | [competitor-evaluator-brief.md](competitor-evaluator-brief.md) | Sonnet | PD 3-4, FS 3 |
| Management Evaluator | [management-evaluator-brief.md](management-evaluator-brief.md) | Sonnet | PD 6, FS 4 |
| Risk Analyst | [risk-analyst-brief.md](risk-analyst-brief.md) | Opus | PD 9, FS 1/6 |
| Valuation Specialist | [valuation-specialist-brief.md](valuation-specialist-brief.md) | Opus | OP 5, PD 10, FS 5/7 |
| Synthesis Writer | [synthesis-writer-brief.md](synthesis-writer-brief.md) | Opus | OP 6, FS 8 |

## Notes

- Data Assembler has no prompt.md (pure code agent -- no AI)
- Each brief specifies curriculum files that MUST be embedded at full depth (no compression -- per AGNT-03)
- All briefs include the contamination boundary (per AGNT-04)
