---
name: computer-learning
description: >
  Use this skill when the user wants Claude to learn how to interpret a specific type of
  domain data — images, photos, scientific literature, video, or other project-specific
  media — so that Claude can apply that knowledge to a codebase or project. Trigger
  whenever the user says things like "teach Claude to read", "learn to interpret",
  "computer vision learning", "train Claude on", "help Claude understand this type of
  data", "Claude should recognize", or describes wanting Claude to be better at analyzing
  a specific category of input (photos, papers, charts, sensor data, etc.). This skill
  runs a guided intake to clarify what Claude should learn, then produces a Claude-optimized
  .md learning document (always saved to the project folder) and a human-readable PDF
  report. When run in Claude.ai, it also produces a .txt Claude Code prompt for handoff.
---

# Computer Learning Skill

A standardized workflow for teaching Claude to interpret domain-specific data. The output
is a structured `.md` learning document optimized for injection into a Claude project's
knowledge base, plus a technical PDF for human review. **The workflow branches based on
where this skill is running** — detect your environment first, then follow the correct path.

---

## Environment Detection — Do This First

Determine which environment you are in before proceeding:

- **Claude.ai / Claude app** — You are a conversational assistant. You cannot execute
  the research and file generation autonomously. Your job is to run the intake, then
  produce a ready-to-use `.txt` prompt the user can paste into Claude Code.

- **Claude Code** — You are an agentic coding assistant with full filesystem, shell, and
  web access. You can perform the research yourself. Skip the prompt `.txt` entirely and
  go straight into plan mode after completing the intake.

If you are uncertain which environment you are in, default to the **Claude.ai path**.

---

## User Mode Selection — Ask This Before Anything Else

After environment detection, before running the intake, ask the user:

> "How would you like to run this learning session?
> **A)** Generate a Claude Code prompt `.txt` I can paste into Claude Code
> **B)** Execute the full skill right here in Claude"

Routing rules:
- User picks **A** → run the full intake, then follow Path A (generate `.txt` only), regardless of environment
- User picks **B** → run the full intake, then follow Path B (full execution: plan mode → generate all outputs)
- User picks **B** but you are in **Claude.ai** → warn them:
  *"Full execution requires filesystem access to save output files. If you're in Claude.ai,
  I may not be able to write files to disk. Do you want to continue anyway?"*
  If they confirm, proceed with Path B as best you can.
- If already in **Claude Code**, suggest B as the default but still ask — do not assume.

Do not proceed to the intake until the user has made their selection.

---

## INTAKE — Run This in Both Environments

Before branching to Path A or Path B, always complete the full intake. Ask these questions
in a single message — do not split them across turns.

### Intake Questions

1. **Output directory** — Where should the PDF and notes be saved?
   (The `.md` learning document always goes to the project folder — confirm project folder
   path if not already known.)

2. **What should Claude learn to interpret?** — Describe the type of data, subject matter,
   and what "correct interpretation" looks like for your project.

3. **Data type detection** — Based on the user's answer to (2), apply the detection rules
   below. Ask the relevant follow-up questions in the same message if the type is clear,
   or ask after their first answer if ambiguous.

### Data Type Detection & Follow-up Questions

After reading the user's subject description, identify the primary data type and ask the
corresponding follow-up questions:

---

#### TYPE: Images / Photos

**Trigger phrases**: "photos", "images", "pictures", "shots", "frames", "visuals",
"photographs", "gallery", "album", "camera", "footage stills"

**Clarifying prompt to user:**
> "It sounds like this is for photo or image interpretation — is that right? If so, I have
> a few quick questions to make the learning document as useful as possible:"

**Follow-up questions:**
- What are the **common visual elements** Claude should identify? (objects, people, colors,
  textures, compositions, lighting conditions, etc.)
- What is the **categorization schema**? (How should photos be grouped, labeled, or ranked?
  e.g., genre, quality, subject, mood, setting)
- Are there **edge cases or ambiguous cases** Claude should handle gracefully? (e.g., dark
  photos, overlapping subjects, unusual angles)
- What is the **end goal** — tagging, sorting, captioning, scoring, detecting anomalies,
  something else?
- Any **project-specific vocabulary** or label names already in use?

**Example probes for specific photo domains:**
- *Concert photos* → What performance elements matter? (crowd energy, stage lighting,
  performer expression, instrument visibility) What categories are needed? (opener vs
  headliner, genre, venue type)
- *Medical imaging* → What anatomical structures or anomalies? What severity scale?
- *Satellite/aerial* → What land types, structures, or changes to detect?
- *Product photos* → What quality signals? Defect types? Attribute taxonomy?

---

#### TYPE: Scientific / Academic Literature

**Trigger phrases**: "papers", "literature", "articles", "research", "publications",
"PDFs", "studies", "journals", "abstracts", "citations"

**Follow-up questions:**
- What **scientific domain** (biology, chemistry, ML, materials science, etc.)?
- What should Claude **extract or summarize** from each paper? (key findings, methods,
  datasets used, conclusions, limitations)
- Any **domain-specific terminology** Claude must recognize?
- Should Claude assess **paper quality or credibility** signals?
- How are papers **used downstream** in the project? (cited, filtered, ranked, clustered)

---

#### TYPE: Video / Temporal Data

**Trigger phrases**: "video", "footage", "clips", "frames", "temporal", "timeline",
"motion", "sequence", "recording"

**Follow-up questions:**
- Is interpretation at the **frame level** (individual images) or **clip level** (patterns
  over time)?
- What **events or transitions** should Claude detect? (scene changes, actions, anomalies)
- What is the **domain**? (surveillance, sports, documentary, tutorial, live event)
- Should Claude produce **timestamps**, **summaries**, **tags**, or all three?
- What visual vocabulary matters most? (subject IDs, motion types, scene types)

---

#### TYPE: Sensor / Structured Data (tabular, time-series, logs)

**Trigger phrases**: "sensor", "logs", "time series", "tabular", "CSV", "metrics",
"telemetry", "signals", "measurements"

**Follow-up questions:**
- What **instrument or system** generated the data?
- What **patterns or anomalies** matter? (spikes, drops, drift, periodicity)
- What does a **normal vs abnormal** reading look like?
- How is this data used in the project codebase?

---

#### TYPE: Mixed / Other

If the user's description doesn't clearly fit a type above, ask openly:
> "Can you describe what a correct interpretation looks like — what would Claude say or
> output after processing one of these items? That will help me shape the learning document."

---

## PATH A — Claude.ai / Claude App

### Step 1 — Complete Intake

Run the full intake above. Do not proceed until you have:
- Output directory
- Project folder path (for `.md` placement)
- Data type confirmed
- All relevant follow-up answers

### Step 2 — Generate the Claude Code Prompt `.txt`

Immediately after the intake is complete, generate the prompt file.
Do not ask for additional confirmation — the intake answers are sufficient.

Use the canonical template in `references/prompt-template.md`. Fill in every placeholder.
Save as: `<topic-slug>-computer-learning-prompt.txt`

The prompt file must include these blocks in order:
1. **Context block** — subject, data type, what Claude must learn
2. **Intake summary block** — user's clarification answers verbatim or lightly cleaned
3. **Task block** — ordered list of research and learning document generation actions
4. **Output spec block** — file paths, formats, naming conventions
5. **Folder structure block** — suggested directory layout with annotations
6. **Tool hints block** — recommended tools for this data type and domain
7. **Plan mode directive** — always last, always verbatim (see `references/prompt-template.md`)

### Step 3 — Present the File

Present the `.txt` file to the user with `present_files`.

Say: "Paste this into Claude Code to kick off the learning session. Claude Code will enter
plan mode and wait for your approval before doing anything."

Nothing else is generated in Claude.ai — no `.md`, no `.pdf`. Those are produced by Claude
Code when it executes the prompt.

---

## PATH B — Claude Code

### Step 1 — Complete Intake

Run the full intake above. Do not proceed until all answers are collected.

### Step 2 — Enter Plan Mode

After completing the intake, immediately enter plan mode. Do not take any actions yet.

Present a complete plan covering:
- What sources, references, or examples you will research
- What files you will create and where
- The structure of the learning `.md` document
- The structure of the PDF report
- Any ambiguities or assumptions you are making

**Wait for explicit user approval before proceeding.**

### Step 3 — Execute and Generate Outputs

Once approved, perform the research and generate all output files.

#### Output A: Claude Learning Document (`<topic-slug>-learning.md`)

**Destination: Always the project folder** (confirmed during intake).

This file is optimized for injection into a Claude project's knowledge base. It is written
as direct instructions and reference material for Claude — not as a human-facing report.

Structure (adapt based on data type, but always include these sections):

```
---
title: <Learning Title>
date: <YYYY-MM-DD>
author: Computer Learning — Claude Code
data-type: <image | literature | video | sensor | other>
domain: <user-specified domain>
project-folder: <path>
---

# Claude Learning Document — <Domain>

## 1. Purpose & Scope
What this document teaches Claude and how it should be applied in this project.

## 2. Domain Overview
What this data type is, where it comes from, and why it matters to the project.

## 3. Key Vocabulary & Labels
Terms, class names, taxonomies, and labels Claude must recognize and use consistently.
Present as definition lists or tables for fast lookup.

## 4. Interpretation Framework
Step-by-step rules for how Claude should read, analyze, and respond to this data type.
Written as direct instructions (imperative mood): "When you see X, do Y."

## 5. Visual / Structural Patterns  [include for image, video, sensor types]
What to look for. Reference common patterns, typical vs atypical examples, key signals.

## 6. Categorization Schema
User-defined taxonomy. How to classify, tag, rank, or group items.
Include decision rules: "If A and B are present → Category X."

## 7. Edge Cases & Ambiguities
Known hard cases and how to handle them. What to do when uncertain.

## 8. Project-Specific Instructions
How to apply these learnings within this project's codebase, API, or workflow.
Include any naming conventions, output formats, or integration points.

## 9. Quick Reference
A condensed lookup table of the most important rules and labels.
```

Writing standards for the `.md` learning document:
- Imperative, direct instructions ("Look for...", "When you see...", "Classify as...")
- No filler or hedging language
- Use tables for taxonomies and decision rules
- Use fenced code blocks for any output format examples
- Sections should be self-contained enough to work as standalone context injections

#### Output B: PDF Research Report (`<topic-slug>-learning-report.pdf`)

- Save to the user's specified **output directory** (not the project folder)
- This is the human-readable version — technical, structured, citation-appropriate
- Mirrors the depth and format of a research-dive PDF
- Covers: what was researched, sources consulted, domain analysis, and the rationale
  behind the interpretation framework and categorization schema in the `.md`
- Use the reportlab builder from `references/pdf-formatting.md`

Default PDF section structure:

```
1. Executive Summary
2. Learning Objective & Data Type
3. Domain Research
   3.1 Domain Overview
   3.2 Key Concepts & Terminology
   3.3 Existing Standards / Taxonomies / Benchmarks
4. Interpretation Framework (rationale)
5. Categorization Schema (rationale)
6. Edge Cases & Known Challenges
7. Project Integration Notes
8. References & Sources
```

#### Output C: Notes File (`<topic-slug>-learning-notes.md`) [optional but recommended]

- Save to output directory alongside the PDF
- Raw research scratchpad: sources, raw findings, draft rules before synthesis
- Not for injection — just for auditability

### Step 4 — Present Files

Present `.md` learning document first, `.pdf` second. One sentence each. Do not
over-explain.

---

## Reference Files

- `references/report-structures.md` — PDF section templates and `.md` metadata formats
- `references/pdf-formatting.md` — Full reportlab PDF builder boilerplate (same as research-dive)
- `references/prompt-template.md` — Canonical Claude Code prompt `.txt` template for this skill
