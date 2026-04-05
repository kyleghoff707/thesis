# Phase 24: PM Workflow Controls - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 24-pm-workflow-controls
**Areas discussed:** PM Review Experience, Data Gap Transparency, Research Initiation UX, Research vs Reports Tab Merge

---

## PM Review Experience

### Section-level feedback mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Per-section comment box | Small text area below each SectionRenderer card. Comments saved to report JSON. | ✓ |
| Margin annotations | Click anywhere to leave positioned comment (like Google Docs). More complex. | |
| Single notes field | Upgrade from window.prompt to text area in approval bar. One set of notes for whole stage. | |

**User's choice:** Per-section comment box
**Notes:** None

### File attachments

| Option | Description | Selected |
|--------|-------------|----------|
| No attachments — text only | Keep simple. Paste links in text if needed. | |
| Link attachments only | Small 'Add link' button. Stores URLs as clickable links. | |
| Full file attachments | Upload screenshots/PDFs per section. Stored in IndexedDB. | ✓ |

**User's choice:** Full file attachments
**Notes:** None

### Comment visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible | Comment box always present below cards. Low friction. | |
| Toggle-to-show | Comment icon/badge on section header. Click to expand. | ✓ |
| Review mode toggle | Top-level button reveals all comment boxes at once. | |

**User's choice:** Toggle-to-show
**Notes:** None

### Approval bar upgrade

| Option | Description | Selected |
|--------|-------------|----------|
| Comment summary + approve/reject | Show count of sections with notes. Section comments serve as feedback. | |
| Three buttons: Approve / Request Changes / Reject | Like a PR review. Request Changes = iterate on flagged sections. | |
| Keep current approve/reject | Don't change approval bar. Per-section comments are enough. | |

**User's choice:** N/A — User clarified that the review concept is about mid-pipeline checkpoints, not post-generation annotation.

**Critical clarification from user:** "I was referring to the PM checkpoints which are part of a given stage pipeline flow. During a PD, the first wave completes and then the PM is given an approve/reject checkpoint. This is where the PM should be able to read the analysis and narrative thus far, and then add comments, provide additional data sources, etc and then re-run that section(s) until they are satisfied."

The PM's mental model is mid-pipeline review (steering during generation), not post-hoc commenting (annotating after everything is done). This fundamentally changed the direction of the feature.

### Checkpoint UI approach

| Option | Description | Selected |
|--------|-------------|----------|
| Checkpoint panel with sections + comment boxes + action buttons | Pipeline pauses. Panel shows completed sections, data gaps, comment boxes. Continue or Re-run buttons. | ✓ |
| Modal overlay | Full-screen modal blocks page. More forceful. | |
| Inline pause state | No separate panel. Banner + comment boxes on existing section cards. | |

**User's choice:** Checkpoint panel with sections + comment boxes + action buttons
**Notes:** None

---

## Data Gap Transparency

### Gap display location

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated section at top of checkpoint | Summary block lists what agents couldn't access. PM sees full picture before reviewing sections. | ✓ |
| Per-section gap indicators | Warning icon + tooltip per section card. More contextual but scattered. | |
| Both — summary + per-section | Top-level summary plus per-section indicators. | |

**User's choice:** Dedicated section at top of checkpoint
**Notes:** None

### PM action on gaps

| Option | Description | Selected |
|--------|-------------|----------|
| PM can paste links or attach files to fill gaps | Each gap has 'Add source' button. Fed to agents on re-run. | ✓ |
| Informational only | PM sees gaps but can't fill them. | |
| PM can dismiss gaps as acceptable | Mark gaps as 'acknowledged' to proceed. | |

**User's choice:** PM can paste links or attach files to fill gaps
**Notes:** None

---

## Research Initiation UX

### Button placement

| Option | Description | Selected |
|--------|-------------|----------|
| Toolbox header, next to ticker name | Natural flow: explore data → decide to research → click generate. | ✓ |
| Research tab list | 'Generate' button per ticker row in ResearchList. | |
| Both | Toolbox header + Research list. | |

**User's choice:** Toolbox header, next to ticker name
**Notes:** None

### Technical trigger mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| API call to backend endpoint | POST /api/thes1s/generate/{ticker}/one-pager. Frontend polls for progress. | ✓ |
| Open Claude Code with pre-filled command | Opens CC terminal with command pre-typed. Requires CC running. | |
| In-browser pipeline execution | Run agent pipeline directly in browser via Claude API. | |

**User's choice:** API call to backend endpoint
**Notes:** User requested a confirmation dialog for all stage generations. "Generate One Pager is no trivial task — they are beginning a three-stage multi component research task that will cost money and time. I don't want users clicking Generate One Pager willy nilly because it costs money."

### Stage flow progression

| Option | Description | Selected |
|--------|-------------|----------|
| Contextual button per stage | Button evolves: Generate OP → View OP → Generate PD → View PD → etc. Each shows confirmation dialog. | ✓ |
| Separate buttons for each stage | Distinct buttons for OP, PD, FS in a group. All visible but locked/unlocked. | |
| Just One Pager generation | Only OP button. PD/FS stay CLI-only. | |

**User's choice:** Contextual button per stage
**Notes:** User wants same confirmation dialog on all three stages. OP dialog should mention the full 3-stage pipeline: "You are beginning the process."

---

## Research vs Reports Tab Merge

### Tab structure

| Option | Description | Selected |
|--------|-------------|----------|
| Merge into one 'Research' tab | One tab with Toolbox access + stage pills per ticker. Reports tab goes away. | |
| Keep separate but improve navigation | Keep both tabs with cross-links between them. | ✓ |
| Keep separate as-is | No changes. | |

**User's choice:** Keep separate but improve navigation
**Notes:** None

### Cross-link approach

| Option | Description | Selected |
|--------|-------------|----------|
| Stage pills on Research tab rows | OP/PD/FS pills per Research row + 'View Toolbox' link on Reports rows. | |
| 'View Report' button on Research rows | Single button per Research row. Simpler. | |
| Contextual banner in Toolbox | Banner when viewing ticker if report exists. | |

**User's choice:** "View Reports" button (plural) on Research tab rows
**Notes:** User chose plural "View Reports" to future-proof for multi-report per ticker at different times. Reports tab gets a corresponding "View Toolbox" link.

---

## Claude's Discretion

- Checkpoint panel layout and styling details
- Comment box expand/collapse animation
- File attachment thumbnail/preview rendering
- Data gap severity visual treatment
- Confirmation dialog exact copy and cost estimates
- PM feedback serialization for agent re-runs
- Progress/loading states during generation
- "View Reports" button styling and placement

## Deferred Ideas

- Merging Research and Reports tabs — keep separate with cross-navigation
- Multi-report per ticker — anticipated by "View Reports" plural naming
- Terminal/CLI live view — already covered by in-app progress UI
- Batch generation from Research list — one at a time from Toolbox header only
