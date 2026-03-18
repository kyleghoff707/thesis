# Report Structures Reference

Default section templates for technical/engineering research reports.
Present these as options when the user hasn't specified a structure.

---

## Metadata Block (always include at top of .md)

```markdown
---
title: <Research Title>
date: <YYYY-MM-DD>
author: Research Dive — Claude
topic-slug: <kebab-case-slug>
output-dir: <path>
---
```

---

## Template A — Technical Deep Dive (default for engineering research)

Best for: architecture investigations, system analysis, technology evaluations, protocol research.

```
1. Executive Summary
2. Background & Context
3. Technical Overview
   3.1 Core Concepts
   3.2 Architecture / Design
   3.3 Key Components
4. Analysis
   4.1 <Primary angle from research scope>
   4.2 <Secondary angle>
5. Implementation Considerations
   5.1 Requirements / Dependencies
   5.2 Trade-offs & Constraints
   5.3 Known Issues / Limitations
6. Recommendations
7. References & Sources
8. Appendix (optional)
```

---

## Template B — Comparative / Evaluation Report

Best for: comparing technologies, tools, libraries, or approaches side-by-side.

```
1. Executive Summary
2. Evaluation Criteria
3. Candidates Overview
4. Detailed Comparison
   4.1 <Candidate A>
   4.2 <Candidate B>
   4.3 <Candidate C>
5. Comparative Matrix (table)
6. Recommendation
7. References
```

---

## Template C — Investigation / Root Cause Report

Best for: debugging investigations, failure analysis, incident research.

```
1. Summary
2. Problem Statement
3. Investigation Methodology
4. Findings
   4.1 Observations
   4.2 Root Cause Analysis
   4.3 Contributing Factors
5. Resolution / Mitigation Options
6. Preventive Recommendations
7. Timeline
8. References
```

---

## Template D — Survey / State-of-the-Field

Best for: literature surveys, technology landscape overviews.

```
1. Abstract
2. Introduction & Motivation
3. Scope & Methodology
4. Current Landscape
5. Key Players / Projects / Papers
6. Trends & Directions
7. Gaps & Open Problems
8. Conclusion
9. References
```

---

## Flexible / Custom

If the user wants to define their own structure, accept a bulleted or numbered list of section
names and use those verbatim as `##` headings in the report.
