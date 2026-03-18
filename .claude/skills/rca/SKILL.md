---
name: rca
description: >
  Perform a structured root cause analysis (RCA) and propose 2–3 actionable solutions when a user explicitly invokes this skill to investigate any problem with any output — video, audio, image, document, data, code, workflow, or any other Claude or Claude Code result. ONLY trigger when the user manually requests an analysis — phrases like "RCA", "root cause", "analyze this", "why is this wrong", "investigate this issue", "something's off with", "this isn't right", or "run root cause analysis" are strong triggers. Do NOT trigger automatically based on observing problems in outputs — wait for explicit user invocation. After diagnosing, always end by asking the user which solution(s) to implement.
---

# Root Cause Analysis Skill

## Purpose

When manually invoked by the user, perform a structured root cause analysis of any problem with any output — regardless of domain or medium. This includes but is not limited to: generated video, audio, images, documents, spreadsheets, code, data pipelines, workflows, presentations, or any other result produced by Claude or Claude Code.

Present 2–3 concrete, ranked solutions and always end by asking the user which to implement.

**Important**: This skill is *never* triggered automatically. It only activates when the user explicitly asks for a root cause analysis or investigation of a problem.

---

## Workflow

### Step 1 — Understand the Problem

Before diving in, make sure you have enough context:

- What is the **output or artifact** being analyzed (video, image, document, code, data, etc.)?
- What is the **observed problem** — what looks wrong, off, or unexpected?
- What was the **intended or expected result**?
- What **context** is relevant (tools used, prompt given, settings, prior steps)?

If the user has already provided this in their message, proceed directly. If key details are missing, ask one focused clarifying question before continuing.

---

### Step 2 — Root Cause Investigation

Conduct a structured investigation appropriate to the domain. Think through the problem systematically:

1. **Characterize the problem precisely**
   - What exactly is wrong? Describe it in concrete, observable terms.
   - Is it consistent or does it vary? Partial or total failure?

2. **Identify contributing factors**
   - What inputs, settings, prompts, or prior steps led to this output?
   - What constraints or assumptions may have been violated?

3. **Trace to root cause**
   - Work backwards from the observed problem: what must be true for this to occur?
   - Rule out surface-level causes and identify the underlying source.
   - If multiple causes are plausible, name them and evaluate likelihood.
   - Apply domain-appropriate reasoning:
     - **Video/audio/image** — rendering settings, prompt interpretation, model limitations, timing/sync, resolution or format constraints
     - **Document/presentation** — template logic, formatting rules, missing or malformed data, style conflicts
     - **Code/pipeline** — logic errors, environment issues, dependencies, data shape mismatches
     - **Workflow/process** — step ordering, missing inputs, tool misconfiguration, incorrect assumptions about state

4. **State the root cause clearly**
   - Summarize in 1–3 sentences: *"The root cause is X, because Y, which results in Z."*

---

### Step 3 — Present 2–3 Solutions

Offer between 2 and 3 distinct solutions. Each solution should:

- Have a **clear label** (e.g., "Option A — Quick Fix", "Option B — Proper Fix", "Option C — Structural Change")
- Include a **brief explanation** of what it does and why it addresses the root cause
- Note **tradeoffs**: effort, risk, permanence, or side effects
- Include **concrete next steps** — commands, revised prompts, settings changes, file edits, or other actionable guidance appropriate to the domain

Order solutions from quickest/simplest to most thorough/robust when possible.

---

### Step 4 — Ask the User What to Implement

Always end your response with this prompt (adapt wording naturally):

> **Which solution would you like to implement — Option A, B, C, or all of them?**
> I'll begin with the one you choose, or walk through all in sequence if you prefer.

---

## Output Format

```
## Root Cause Analysis

**Output/Artifact:** [What was produced]
**Problem:** [One-line restatement of the issue]
**Root Cause:** [Clear 1–3 sentence diagnosis]

---

### Option A — [Label]
[Explanation + tradeoffs + concrete next steps]

### Option B — [Label]
[Explanation + tradeoffs + concrete next steps]

### Option C — [Label] *(if applicable)*
[Explanation + tradeoffs + concrete next steps]

---

**Which option would you like to implement — A, B, C, or all?**
```

---

## Tone & Style

- Be direct and diagnostic — this is an investigative mode, not a conversational one.
- Avoid excessive hedging. State the most likely root cause confidently, noting genuine uncertainty where it exists.
- Keep the RCA section concise — the user wants answers, not a lecture.
- Tailor concrete steps to the domain — revised prompts for generative outputs, settings changes for tools, code edits for pipelines, etc.

---

## Examples of Valid Trigger Phrases

- "RCA — the video I generated has the wrong aspect ratio"
- "Root cause this: the document formatting is broken"
- "Why is this wrong? Here's the output…"
- "Analyze this issue and suggest fixes"
- "Something's off with this image, investigate it"
- "This isn't right — run a root cause analysis"
- "Debug this: [code/log/output]"

## Examples of Non-Triggers (do NOT auto-invoke)

- Claude notices a problem in output it just generated → report it, don't launch RCA unprompted
- A step in a workflow fails → surface the failure, wait for user to ask for analysis
- User says "fix this" without asking for analysis → attempt the fix directly, no full RCA unless the problem warrants investigation
