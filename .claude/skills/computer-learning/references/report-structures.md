# Report Structures Reference — Computer Learning

Section templates and metadata formats for the computer-learning skill outputs.

---

## Metadata Block — Claude Learning Document (always include at top of .md)

```markdown
---
title: <Learning Title>
date: <YYYY-MM-DD>
author: Computer Learning — Claude Code
data-type: <image | literature | video | sensor | other>
domain: <user-specified domain, e.g. "concert photography", "genomics papers">
project-folder: <absolute path to project folder>
topic-slug: <kebab-case-slug>
---
```

---

## Metadata Block — PDF Report (always include at top of .md notes version)

```markdown
---
title: <Learning Report Title>
date: <YYYY-MM-DD>
author: Computer Learning — Claude Code
topic-slug: <kebab-case-slug>
output-dir: <path>
---
```

---

## Learning Document Structure (default — adapt per data type)

Best for all data types. Adjust section 5 (Visual/Structural Patterns) based on whether
the domain is image-based, text-based, or signal-based.

```
1. Purpose & Scope
2. Domain Overview
3. Key Vocabulary & Labels
4. Interpretation Framework
5. Visual / Structural Patterns  ← include for image, video, sensor; omit or rename for literature
6. Categorization Schema
7. Edge Cases & Ambiguities
8. Project-Specific Instructions
9. Quick Reference
```

---

## PDF Report Structure — Standard (default)

Best for: image interpretation, video analysis, sensor data learning.

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

---

## PDF Report Structure — Literature / Document Analysis

Best for: scientific papers, PDFs, academic literature.

```
1. Executive Summary
2. Learning Objective
3. Domain & Field Overview
4. Document Structure Analysis
   4.1 Typical Paper / Document Anatomy
   4.2 Key Sections Claude Should Parse
5. Extraction Framework
   5.1 What to Extract
   5.2 Terminology & Notation
   5.3 Quality / Credibility Signals
6. Categorization & Clustering Schema
7. Edge Cases
8. Downstream Integration
9. References
```

---

## PDF Report Structure — Comparative / Multi-Type

Best for: projects where Claude must interpret multiple data types together.

```
1. Executive Summary
2. Learning Objectives (one per data type)
3. Data Type Overviews
4. Shared Vocabulary & Label Alignment
5. Per-Type Interpretation Frameworks
6. Cross-Type Relationships & Dependencies
7. Unified Categorization Schema
8. Edge Cases
9. Integration Notes
10. References
```

---

## Quick Reference Table Format (for .md Section 9)

Use a compact two-column or three-column markdown table:

```markdown
| Pattern / Signal | Interpretation / Action |
|---|---|
| <what Claude sees> | <what Claude should do or output> |
```

Or with a confidence note:

```markdown
| Signal | Classification | Confidence Threshold |
|---|---|---|
| <signal> | <class> | <high/medium/low or numeric> |
```
