---
quick_id: 260331-pdy
status: complete
commit: 4e7601e
---

## Summary

Calibrated the quality scorer (critic.js) to measure analysis substance instead of JSON format compliance. Four fixes:

1. **getAllText() helper** — Methodology checks now search narrative + summary + verdictRationale + stringified data + crossCuttingFindings + redFlags + primarySourceInsights. Models using `messages.create()` (the tools-present path) may distribute analysis content across different fields than `messages.parse()`. S5 methodology went from 0% → 100%.

2. **SEC citation classifier** — Changed `source.includes('sec')` to `\bsec\b` word boundary regex. "Full Story Section 2" was matching the substring "sec" in "Section" and being incorrectly classified as an SEC filing. S6 had 5 false-positive medium-severity issues.

3. **inversion_rebuttal search exemption** — S6 is a synthesis section composed from debate step outputs. Web research lives in the bear debate step, not in S6 itself. Added to EXEMPT_SECTIONS. Eliminated 1 HIGH + 2 MEDIUM false positives.

4. **Descriptive DataPacket path labels** — Citations like `dataPacket.insiders.recentTransactions[CEO Award March 14]` use descriptive labels the path resolver can't verify. Downgraded from HIGH → LOW severity. S4 went from 37% → 91%.

**Result:** Overall 94 mechanical / 98 methodology (was 79/72). Exceeds CC baseline (89/88).
