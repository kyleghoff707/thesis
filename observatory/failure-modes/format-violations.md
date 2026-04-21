---
type: failure-mode
mode: format-violations
lastUpdated: 2026-04-20T03:15:10.496Z
severity: high
frequency: 49
affectedAgents: [risk-analyst, one-pager, orchestrator, financial-analyst-judge, synthesis-writer-bull, synthesis-writer-rebuttal, synthesis-writer-compose, annual-reader-FY2021, annual-reader-FY2022, annual-reader-FY2023, annual-reader-FY2024, annual-reader-FY2025, quarterly-reader, business-analyst, competitor-market-position, competitor-moats, financial-analyst, management-evaluator, valuation-specialist, competitor-evaluator, synthesis-writer]
tags: [failure-mode, format-violations]
---

## Definition

Agent output did not match expected JSON schema.

## Instances

| Run ID | Ticker | Agent | Details |
|--------|--------|-------|---------|
| 20260417-082354-LULU-pitchDeck | LULU | risk-analyst | agent timed out twice — orchestrator synthesizing PEST from other Wave outputs |
| 20260417-174638-SFM-onePager | SFM | one-pager | preamble text before JSON (Key final calculations narrative) |
| 20260417-174638-SFM-onePager | SFM | one-pager | subagent emitted two JSON objects (indented + compact); used last compact copy |
| 20260417-175335-LULU-fullStory | LULU | orchestrator | Skipped Step 8.5 Pre-Finalize Event Sweep entirely — orchestrator went straight from Compose to finalize without retrospective sweep. Meta-violation: all debate-level events below were NOT logged in the original run. Backfilled 2026-04-17 at PM request after debrief. |
| 20260417-175335-LULU-fullStory | LULU | financial-analyst-judge | Schema deviation: judge wrapped payload in top-level 'content: {...}' + renamed 'overallDirection' to 'overallVerdict'. Prompt required flat schema. Caused silent assembly bug — exchangeCount:0 in full-story.json despite 11 actual exchanges. Direction field survived only because orchestrator used a 'Mixed' string fallback that happened to match reality. |
| 20260417-175335-LULU-fullStory | LULU | synthesis-writer-bull | Bull T5 over-claimed on guru/insider signals as conviction evidence. Rule One Operating Rule #2 explicitly says 'guru ownership is context not confirmation.' Bull used Phil Town 26.1% + Burry 26.1% as thesis-strength-5 conviction point. Rebuttal R5 self-conceded 'weakest thesis point' and 'relies on evidence Rule One explicitly cautions against.' Bull factual/methodology error class event, self-healed in Rebuttal. |
| 20260417-175335-LULU-fullStory | LULU | synthesis-writer-bull | Bull T4 (China international engine) made near-term claims Rebuttal R4 could not defend. R4 self-rated 'weak' with explicit concession: 'Bear wins this exchange on near-term facts.' Bull output carried forward-math claims (China will 'arithmetically dominate the revenue equation within 3-5 years') that were unsupported at current revenue mix (15.8% China vs 70.7% Americas). Bull factual error class event, self-healed via concession. |
| 20260417-175335-LULU-fullStory | LULU | synthesis-writer-bull | Bull T3 (moat) omitted the most important competitive signal — On Holding's 62.8% gross margin exceeds LULU's 56.6%. Bear I3 surfaced it; Rebuttal R3 explicitly acknowledged: 'bear is right that On Holding's gross margin exceeding LULU's is the most important competitive signal in the analysis.' Omission from Bull's initial output was a material completeness error, self-healed by Bear surfacing it. |
| 20260417-175335-LULU-fullStory | LULU | synthesis-writer-rebuttal | Rebuttal output 54KB exceeded prompt's stated 10-40KB range. Agent self-flagged the overrun in its completion report and orchestrator accepted without logging. Minor-but-symptomatic. |
| 20260417-175335-LULU-fullStory | LULU | synthesis-writer-compose | Compose output 49.7KB exceeded prompt's stated 15-45KB range and narrative 1808 words exceeded 800-1500 word target. Agent self-flagged both overruns in completion report. Orchestrator accepted without logging. |
| 20260417-175335-LULU-fullStory | LULU | orchestrator | Full Story PDF rendered as 2 pages (title + empty citations) because full-story PDF generator's report_data_reader.py read 'full-story-api.json' by default and had no fallback to 'full-story.json' (unlike pitch-deck which does have a fallback). Orchestrator wrote full-story.json per skill spec; silent 2-page output was accepted without inspection. Root cause: reader fallback chain incomplete. Fix: patched report_data_reader.py to add full-story.json fallback. Regenerated PDF = 36 pages (within 30-40pg expected range). Archive updated. |
| 20260417-175437-SFM-pitchDeck | SFM | annual-reader-FY2021 | preamble text before JSON (Now I have all the data... Let me compile) |
| 20260417-175437-SFM-pitchDeck | SFM | annual-reader-FY2022 | preamble text before JSON (Now I have all the data... Let me compile) |
| 20260417-175437-SFM-pitchDeck | SFM | annual-reader-FY2023 | preamble text before JSON (Now I have all the data... Let me compile) |
| 20260417-175437-SFM-pitchDeck | SFM | annual-reader-FY2024 | preamble text before JSON (Now I have all the data... Let me compile) |
| 20260417-175437-SFM-pitchDeck | SFM | annual-reader-FY2025 | preamble text before JSON (Now I have all the data... Let me compile) |
| 20260417-175437-SFM-pitchDeck | SFM | quarterly-reader | preamble text before JSON (Now I have all the data... Let me compile) |
| 20260417-175437-SFM-pitchDeck | SFM | business-analyst | preamble text before JSON (I now have enough data... Let me compile) |
| 20260417-175437-SFM-pitchDeck | SFM | competitor-market-position | preamble and postamble commentary around JSON; also saved file under wrong filename (market-position.json instead of market_position.json) |
| 20260417-175437-SFM-pitchDeck | SFM | competitor-moats | preamble/commentary before/after JSON |
| 20260417-175437-SFM-pitchDeck | SFM | financial-analyst | preamble/commentary before/after JSON |
| 20260417-175437-SFM-pitchDeck | SFM | management-evaluator | preamble/commentary before/after JSON |
| 20260417-175437-SFM-pitchDeck | SFM | risk-analyst | saved to pest_risks.json instead of pest.json; key was 'pest_risks' instead of 'pest'; orchestrator renamed |
| 20260417-175437-SFM-pitchDeck | SFM | valuation-specialist | preamble commentary before and after JSON |
| 20260417-183135-POOL-pitchDeck | POOL | quarterly-reader | emitted invalid JSON with unary-plus prefix (: +0.01); orchestrator sed-fixed before parse |
| 20260417-185013-SFM-fullStory | SFM | risk-analyst | preamble text before JSON (e.g. 'Now I have all the data needed. Let me produce the final JSON') |
| 20260417-185013-SFM-fullStory | SFM | business-analyst | preamble text before JSON (e.g. 'Now I have all the data needed. Let me produce the final JSON') |
| 20260417-185013-SFM-fullStory | SFM | competitor-evaluator | preamble text before JSON (e.g. 'Now I have all the data needed. Let me produce the final JSON') |
| 20260417-185013-SFM-fullStory | SFM | management-evaluator | preamble text before JSON (e.g. 'Now I have all the data needed. Let me produce the final JSON') |
| 20260417-185013-SFM-fullStory | SFM | valuation-specialist | preamble text before JSON (e.g. 'Now I have all the data needed. Let me produce the final JSON') |
| 20260417-185013-SFM-fullStory | SFM | competitor-evaluator | tables field returned as array of JSON-encoded strings instead of objects; orchestrator parsed via json.loads fallback |
| 20260417-185013-SFM-fullStory | SFM | synthesis-writer | Bull step: preamble text before JSON ('Now I have all the data needed to construct the bull thesis JSON') |
| 20260417-185013-SFM-fullStory | SFM | risk-analyst | Bear step: used Write tool to save debate-step-2-bear.json directly instead of returning JSON per protocol; orchestrator verified file existed |
| 20260417-185013-SFM-fullStory | SFM | synthesis-writer | Rebuttal step: wrapped output in  code fence despite instructions |
| 20260417-185013-SFM-fullStory | SFM | synthesis-writer | Rebuttal step: schema drift - used 'bearPoint' instead of 'bearInversionTarget', 'rebuttalStrength' instead of 'strength' |
| 20260417-185013-SFM-fullStory | SFM | financial-analyst | Judge step: schema drift - used 'bullStrength'/'bearStrength'/'verdict' instead of 'winner'; nested 'overallVerdict.direction' instead of top-level 'overallDirection' |
| 20260417-185013-SFM-fullStory | SFM | synthesis-writer | Compose step: used Write tool to save inversion_rebuttal.json directly rather than returning JSON per protocol |
| 20260417-185013-SFM-fullStory | SFM | synthesis-writer | Rebuttal step: wrapped output in triple-backtick json code fence despite prompt instructions to output raw JSON |
| 20260417-192126-POOL-fullStory | POOL | synthesis-writer-bull | Bull thesis contained factual error: cited Wells Fargo raising target to 275 when actual was cut to 215 (caught by bear, acknowledged in rebuttal) |
| 20260417-192126-POOL-fullStory | POOL | synthesis-writer-bull | Bull thesis point 7 stated dividend payout ratio ~46%; rebuttal conceded actual payout ~60% on reported FCF. Factual correction acknowledged in rebuttal. |
| 20260417-192126-POOL-fullStory | POOL | synthesis-writer-bull | Bull used low-quality source (ibtimes.com.au speculation re: Berkshire Q1 2026 13F sale) for guru-validation claim; rebuttal acknowledged source quality issue and genuine uncertainty unresolved until May 15 filing. |
| 20260417-234502-POOL-onePager | POOL | one-pager | Preamble before JSON: ~660 chars of calculation summary preceded the JSON object |
| 20260417-234502-SFM-onePager | SFM | one-pager | Agent emitted two copies of the JSON object (indented version followed by second more-complete version) — orchestrator used the second copy |
| 20260417-235256-POOL-pitchDeck | POOL | valuation-specialist | valuation.json contained 2 arithmetic expressions ('5289396000 * 2.158' and '5289396000 * 3.106') instead of computed numeric values — broke JSON parse; manually computed and replaced |
| 20260417-235603-SFM-pitchDeck | SFM | competitor-moats | protocol violation: used Write tool to save section file instead of returning JSON in response body |
| 20260418-004838-POOL-fullStory | POOL | financial-analyst-judge | Wrapped judge output in 'content' field instead of returning fields at top level (schema drift) |
| 20260418-004838-POOL-fullStory | POOL | synthesis-writer-bull | bull point 9 conceded weak in rebuttal |
| 20260419-182010-NOW-onePager | NOW | one-pager | Emitted TWO copies of the JSON object (indented pretty-printed then compact). Orchestrator used compact (last) copy. |
| 20260419-194111-NOW-fullStory | NOW | synthesis-writer-bull | bull point 6 conceded weak in rebuttal |

## Root Cause Analysis

_To be filled after pattern emerges across multiple runs._

## Mitigation

_To be determined based on root cause._
