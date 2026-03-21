---
name: research-dive
description: >
  Use this skill for any research deep dive, technical investigation, or structured research task.
  Trigger whenever the user mentions "research", "deep dive", "investigate", "analyze X topic",
  "write a report on", "look into", or describes wanting a thorough technical or engineering
  investigation of any subject. This skill enforces a standard output workflow: always prompts
  for an output directory, generates both a PDF and .md report, and produces a ready-to-use
  Claude Code prompt .txt file. Use this skill even if the user says something casual like
  "can you research X for me" or "I want to understand Y thoroughly" — if it sounds like they
  want a structured research output, use this skill.
---

# Research Dive Skill

A standardized workflow for technical research deep dives. **The workflow branches based on
where this skill is running** — detect your environment first, then follow the correct path.

---

## Environment Detection — Do This First

Determine which environment you are in before proceeding:

- **Claude.ai / Claude app** — You are a conversational assistant. You cannot execute the
  research autonomously. Your job is to collect the research brief and produce a ready-to-use
  `.txt` prompt the user can paste into Claude Code.

- **Claude Code** — You are an agentic coding assistant with full filesystem, shell, and web
  access. You can perform the research yourself. Skip the prompt `.txt` entirely and go
  straight into plan mode after collecting the brief.

If you are uncertain which environment you are in, default to the **Claude.ai path**.

---

## User Mode Selection — Ask This Before Anything Else

After environment detection, before collecting any session parameters, ask the user:

> "How would you like to run this research?
> **A)** Generate a Claude Code prompt `.txt` I can paste into Claude Code
> **B)** Execute the full research right here in Claude"

Routing rules:
- User picks **A** → follow Path A (generate `.txt` only), regardless of environment
- User picks **B** → follow Path B (full execution: plan mode → generate all outputs)
- User picks **B** but you are in **Claude.ai** → warn them:
  *"Full execution requires filesystem access to save output files. If you're in Claude.ai,
  I may not be able to write files to disk. Do you want to continue anyway?"*
  If they confirm, proceed with Path B as best you can.
- If already in **Claude Code**, suggest B as the default but still ask — do not assume.

Do not proceed to session parameter collection until the user has made their selection.

---

## PATH A — Claude.ai / Claude App

### Step 1 — Collect Session Parameters

Ask the user for all of the following in a single message:

1. **Output directory** — where should files be saved? (e.g. `~/research/my-topic/`)
2. **Report structure** — what sections/format do they want? Offer sensible defaults for
   technical/engineering work (see `references/report-structures.md`) but let them override.
3. **Research scope** — what to investigate, key questions to answer, constraints, angles.

Do not proceed until you have all three.

### Step 2 — Generate the Claude Code Prompt `.txt`

Immediately after collecting the brief, generate the prompt file. Do not ask for additional
confirmation — the user's answers in Step 1 are sufficient to proceed.

Use the canonical template in `references/prompt-template.md`. Fill in every placeholder.
Save as: `<topic-slug>-claude-code-prompt.txt`

The prompt file must include these blocks in order:
1. **Context block** — topic, scope, key questions
2. **Task block** — ordered list of research actions
3. **Output spec block** — file paths, formats, naming conventions
4. **Folder structure block** — suggested directory layout with annotations
5. **Tool hints block** — recommended Claude Code tools for this research type
6. **Plan mode directive** — always last, always verbatim (see `references/prompt-template.md`)

### Step 3 — Present the File

Present the `.txt` file to the user with `present_files`.

Say: "Paste this into Claude Code to kick off the research. Claude Code will enter plan mode
and wait for your approval before doing anything."

Nothing else is generated in Claude.ai — no `.md`, no `.pdf`. Those are produced by Claude
Code when it executes the prompt.

---

## PATH B — Claude Code

### Step 1 — Collect Session Parameters

Ask the user for all of the following in a single message:

1. **Output directory** — where should files be saved?
2. **Report structure** — what sections/format? Offer defaults from
   `references/report-structures.md` but let them override.
3. **Research scope** — what to investigate, key questions, constraints.

Do not proceed until you have all three.

### Step 2 — Enter Plan Mode

After collecting the brief, immediately enter plan mode. Do not take any actions yet.

Present a complete plan covering:
- What sources or systems you will query
- What files you will create and where
- The order of operations
- Any ambiguities or assumptions you are making

**Wait for explicit user approval before proceeding.**

### Step 3 — Execute and Generate Outputs

Once approved, perform the research and generate both output files.

If you cannot access any key websites or sources during your research (because they block ai bots) let the user know at the end of your research. Present the user with hyperlinks that they can find themselves and give to you. Don't do this with every blocked hyperlinks, only key ones. Use your judgement to determine this. Think of this research as a collaboration between user and claude. Some things only claude can do, some things only humans can do 

#### Output A: Markdown Report (`<topic-slug>.md`)

- Save to the user's specified output directory
- Follow the agreed report structure
- Proper Markdown: `#` title, `##` sections, tables, fenced code blocks
- Metadata block at top (see `references/report-structures.md`)
- Technical writing standard: precise, no filler, inline citations as `[Source: ...]`

#### Output B: PDF Report (`<topic-slug>.pdf`)

Generate programmatically using **reportlab**.

Key rules:
- Helvetica body, Courier for code, title page, page numbers in footer
- `<sub>` / `<super>` for subscripts/superscripts — NEVER Unicode ₀¹² etc.
- Code blocks: light gray background, Courier 9pt
- Tables: `TableStyle` with grid lines and header row shading

See `references/pdf-formatting.md` for the full reusable builder template.

### Step 4 — Present Files

Present `.md` first, `.pdf` second. One sentence each. Do not over-explain.

### Reference files 

- report-structures.md
- prompt-template.md
- pdf-formatting.md
- pdf_qa_checker.py
