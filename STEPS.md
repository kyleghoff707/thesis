# Thesis — Open-Source Migration Plan

Skeleton plan for forking the current Thes1s repo into a public-facing **Thesis** repo. Intentionally high-level — phase ordering, parallelism, decision points only.

---

## Phase 0 — Strategic decisions (lock these BEFORE forking)

These cascade through every later phase.

- [x] **Name — locked: Thesis.** Domain: `thesis-investing.com` (purchased); `thesisinvesting.ai` reserved as future option. Trademark search clear in the investing space (other "Thesis" marks exist in unrelated categories).
- [x] **License — locked: MIT.** Copyright holder: `Kyle Hoff`. Audit deps via `npx license-checker --summary` after Phase 2 rename to confirm zero copyleft conflicts. Add `LICENSE` file at root, `"license": "MIT"` in every `package.json`, MIT shield badge in README. No per-file SPDX headers needed.
- [x] **Repo strategy — locked: monorepo.** CLI + agents + frontend + Worker all in one public repo. Pre-Phase-1 audit required: `wrangler secret list`, grep for hardcoded keys/emails/admin allowlists; everything must be externalized to env before fork.
- [x] **Existing thes1sinvesting.com users — locked: fresh start.** No active users to migrate. Archive the existing D1 database, deprecate the domain, redirect any traffic to `thesis-investing.com`.
- [x] **Disclaimer language — locked.** Master template in Appendix A below. Three placements: README (full, top, blockquote), PDF/DOCX (short on cover + full in appendix), website (footer every page + first-run modal + per-report banner). Lawyer review deferred until pre-launch of paid website tier.

---

## Phase 1 — Foundation (sequential)

1. Fork repo to new GitHub.
2. Strip secrets: `.env*`, hardcoded keys, session cookies in scripts, internal-only docs.
3. Delete dead code (from audit):
   - `agents-v2/coordinator-pitchdeck/`, `coordinator-fullstory/` (deprecated 2026-05-03)
   - `AssumptionTracker.jsx` — **verify before deleting**: re-audit found it imported by `src/components/pitchDeck/` as a slide-out assumption panel. Confirm zero live render path.
   - `CheckpointCommentBox.jsx`, `DataGapsPanel.jsx`
   - `scripts/run-pipeline.js`, `run-full-story.js` (v1 monolithic runners)
   - `useGeneratePitchDeckV3.js` — **verify zero callers via grep before deleting**.
   - `src/schemas/observatory.js` (if observatory isn't shipping — see cascade below)
   - `scripts/pdf/generate_agentic_workflow_stack.py` (duplicate Thes1sPDF)
   - `scripts/test-assembly.py` (hardcoded session cookie)
   - `.claude/skills/generate-section/` — **broken**: references `agents/orchestrator/config.json` and `agents/{agentName}/config.json` which don't exist in the repo. Either fix in Phase 2 or drop here.
   - **Observatory cascade** (only if Phase 1 decision is to drop): `observatory/` Obsidian vault, all `scripts/observatory-*.js` (init, finalize, record-agent, record-event, sweep-debate, lint, query, synthesize), `src/engines/observatoryCapture.js`, `src/engines/observatorySynthesize.js`, and the observatory hooks in every `.claude/skills/generate-*` SKILL.md.
4. Add `LICENSE`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/`, PR template.
5. **Observatory: ship or not?** Recommend NO — research-time tool, leaks optimization scaffolding.

---

## Phase 2 — Rebrand & de-Rule-1-ify

This is the bulk of the work. Mass rename comes first; everything else is parallelizable.

### Sequential lead step
- [ ] Repo-wide rename `Thes1s` → `Thesis`, `thes1s` → `thesis`. Touches: filenames, package names, env vars, agent prompts, schemas, comments, CSS classes, observatory paths, PDF branding constants, file paths in scripts. One mechanical pass + full test run.

### Parallel workstreams (start after rename completes)

| Workstream | Touches | Effort |
|---|---|---|
| Agent prompts: Rule 1 → "Buffett-style value investing" | `agents-v2/*/prompt.md`, `knowledge/` curriculum files | High |
| Website UI text + tour | `src/components/*`, `tourSteps.js`, glossary | Medium |
| PDF/DOCX branding (logo, colors, wordmark) | `scripts/pdf/thes1s_pdf.py` → `thesis_pdf.py`, `docx_helpers.py` | Medium |
| Re-enable web search on One Pager analyst | `agents-v2/one-pager/`, skill orchestration | Medium |
| Code/doc cleanup (audit findings) | `CLAUDE.md` (3-layer XBRL claim vs dormant Layers 2+3; 8-tab Toolbox claim vs 7 actual tabs); `src/schemas/dataPacket.js` + `src/utils/sliceDataPacket.js` (duplicated `sliceDataPacket()` — consolidate to utils version) | Low |

### Brainstorm pods (run in parallel — each deserves its own session)

- [ ] **Thesis Score** — algorithmically different, not just renamed. Just renaming Rule One Score is *more* derivative, not less. Brainstorm should produce a new scoring rubric.
- [ ] **Valuation methods** — drop or rework. Equity Bond is from Buffettology (1997, public domain methodology) — safe to keep. Ten Cap and Payback Time are most R1-coded.
- [ ] **Guru list** — current 43 are copy-pasted from R1. Rebuild from your own 13F screening criteria (AUM threshold, holding concentration, value-tilt heuristics).
- [ ] **Full Story redesign** — rename + method changes. Candidate names: "Conviction Brief", "Investment Memo", "Final Thesis". Don't keep the 15/15/13-point checklists verbatim.

These four can run as parallel pods right after the rename. Lock them before Phase 5.

---

## Phase 3 — Make it portable (sequential after Phase 2)

Current pipeline assumes Cloudflare D1 + R2 + Worker proxy + invite auth. Repo users have none of that.

- [ ] Audit every engine for D1/R2 dependency. Confirm direct-fetch fallbacks (most already exist).
- [ ] **Alpha Vantage strategy** — three options:
   - (a) User provides own key, optional (degrades to no transcripts) ← recommend
   - (b) Drop transcripts entirely
   - (c) Replace with SEC 8-K mining
- [ ] **Cross-platform paths** — `~/.thesis/reports/{TICKER}/` via `os.homedir()`. Never hardcode `/Users/...`.
- [ ] **Filename safety** — tickers like `BRK.B`, `RDS-A`. Sanitize for Windows (no dots/colons in directory names).
- [ ] **Compensation scraper fate** (1,693 LOC, 94.8% accuracy on DEF 14A) — keep, simplify to top 3 fields only, or drop. Public exposure = user complaints when SEC formats change.
- [ ] **Industry taxonomy refresh** — JSON is 8 weeks stale. Ship snapshot with "last updated" note, OR expose a public read-only endpoint that CLI hits on first run.
- [ ] **Test on Mac, Windows, Linux**. Document Node version, Python version, Claude Code subscription tier required.
- [ ] **Codex compatibility** — defer to Phase 7 unless trivial. Agent prompts are portable; orchestration mechanism is CC-specific.
- [ ] **Privacy notice** — be explicit about what data leaves the user's machine: SEC fetches, Anthropic LLM calls, optional account sync.

---

## Phase 4 — Two-mode wiring (sequential after Phase 3)

Repo users get local PDFs/DOCX. Account users can inject reports into their Thesis website account for a friendlier UX.

- [ ] **Standalone mode** — pipeline writes PDF + DOCX + JSON to `~/.thesis/reports/{TICKER}/`. Done; this already mostly works.
- [ ] **Connected mode** — post-pipeline `inject-report` step pushes to user's website account. Repurpose `scripts/inject-report.mjs`; user authenticates with their own session, no admin endpoint.
- [ ] **First-run config wizard** — `npm run setup` walks through: Claude Code subscription confirmation, optional account email, optional Alpha Vantage key. Writes to `~/.thesis/config.json`.
- [ ] **Website button states** — "Generate One Pager" → "View Report" when injected; "Generate via CLI" instructions when not.
- [ ] **Website auth model** — open public signup, self-serve invite, or hybrid. Removes admin-issued invite friction.

---

## Phase 5 — Reports & polish (parallel-friendly with Phase 6)

- [ ] More charts/graphs in PDF + DOCX. Deserves own brainstorm — what visuals matter for value investing? Margin trends, peer benchmark bars, FGR sensitivity heatmaps, valuation range bars, ROIC vs WACC lines.
- [ ] Mirror chart improvements to web report viewer.
- [ ] **Toolbox refactor** — `src/components/Toolbox.jsx` is a ~700-line god component (8 tabs, 7 scoring engines, 9 hooks). Decompose into per-tab subcomponents before adding new visuals; otherwise chart additions fight the existing structure.
- [ ] **Sample reports committed to repo** — LULU, AAPL, COST. Runnable, no auth required, demonstrates output without setup.
- [ ] **Architecture diagrams** — Mermaid or hand-drawn SVG: pipeline flow, agent waves, data flow. Embed in README.

---

## Phase 6 — GitHub readiness (parallel-friendly with Phase 5)

- [ ] **README** — one-paragraph elevator pitch → 60-second quickstart → architecture diagram → philosophy.
- [ ] **Quickstart** — clone → `npm install` → `claude` → `/analyze AAPL` → done.
- [ ] **Subscription tier docs** — Claude Pro vs Max. Pitch Deck dispatches 10 subagents; may need Max.
- [ ] **Demo Loom** — 3-minute video of One Pager generation end-to-end.
- [ ] **CHANGELOG.md + semver promise**.
- [ ] **Issue templates** — bug, question, feature request. Without these, public repos drown in low-effort issues.
- [ ] **Telemetry decision** — anonymous opt-in usage ping, or hard NO. Affects how you measure adoption.

---

## Phase 7 — Launch & expansion

- [ ] Soft launch — r/ValueInvesting, r/SecurityAnalysis, Show HN.
- [ ] Email list (post-launch).
- [ ] Blog (post-launch).
- [ ] Codex compatibility (post-launch).
- [ ] Track first 100 users; listen for friction; iterate.

---

## Parallelism map

```
Phase 0 (decisions, sequential)
    │
    ▼
Phase 1 (foundation, sequential)
    │
    ▼
Phase 2 — mass rename (sequential)
    │
    └──► 4 workstreams + 4 brainstorm pods (PARALLEL)
              │
              ▼
Phase 3 (portability, sequential — OS testing parallelizes)
    │
    ▼
Phase 4 (two-mode wiring, sequential)
    │
    ▼
Phase 5 (polish) ║ Phase 6 (GitHub readiness)   ← PARALLEL
    │                    │
    └────────┬───────────┘
             ▼
        Phase 7 (launch)
```

---

## Open questions (answer before/during the relevant phase)

1. ~~License — MIT vs AGPL (Phase 0)~~ — **resolved: MIT.** Copyright-holder identity still open.
2. ~~Repo strategy — monorepo vs split (Phase 0)~~ — **resolved: monorepo.**
3. ~~Trademark on chosen name (Phase 0)~~ — **resolved: Thesis, no investing-space conflicts found**
4. ~~Existing user migration plan (Phase 0)~~ — **resolved: fresh start, no users to migrate**
5. Observatory ship-or-not (Phase 1) — recommend no
6. Alpha Vantage strategy (Phase 3)
7. Compensation scraper fate (Phase 3)
8. Industry taxonomy refresh strategy (Phase 3)
9. Account signup model (Phase 4)
10. Telemetry (Phase 6)

---

## Watchouts (carry these into the new repo)

From the audit of the existing codebase. These are the footguns; carry them forward so you don't rediscover them.

- **`dataExport.js` shape is the agent contract.** Renaming fields breaks every prompt. Add safely; rename carefully.
- **`edgarFinancials.js` cache key is `v9`.** Bump on any taxonomy/derivation change or browsers serve stale data.
- **`negate` flag silently flips signs** on cash flow fields. Easy to misuse. Currently only on 4 fields.
- **FY label offset for Jan/Feb fiscal years** runs late. Out-of-band reads of `years` array must be aware.
- **`KEY_NORMALIZATION` lives in 3 places** with different aliases (run-pipeline.js, run-full-story.js, PitchDeck.jsx + FullStory.jsx). Centralize during rebrand.
- **`Spinner.jsx` injects keyframes globally** as a side effect on import. Don't remove the import without moving the keyframes.
- **Toolbox is 7 tabs, not 8.** Old CLAUDE.md says 8 (no Audit tab exists).
- **Static taxonomy JSON drifts from D1.** Decide single source of truth.
- **Two parallel classification systems** — Thes1s taxonomy (sector/peers) AND raw-SIC overlay selector (`industryClassifier.js`). They can disagree. Worth unifying.
- **Three execution surfaces drift** — skills, run-pipeline.js, agents-service. Pick one and delete the others in the new repo.
- **Web search ⊥ structured output** in Anthropic API. The current v3 stack runs from training data only. Re-enabling web search requires multi-turn agent loop.
- **MultiSection wrapper unreliable.** Production already worked around it (commit 27bd562 — N sequential single-section calls). Agent prompts still spec MultiSection; align them.
- **Compensation scraper is fragile.** 94.8% accuracy on DEF 14A; will break when filing formats change.
- **`useOnePager` / `usePitchDeck` / `useFullStory`** poll dev-only Vite middleware paths that 404 in prod. Either gate on `IS_DEV` or remove.
- **`edgarFinancials.js` Layers 2 and 3 are dormant.** Imports commented out at lines 11–15. Engine runs Layer 1 only (~120 fields, ~200 tag mappings). CLAUDE.md falsely claims a live 3-layer system. Decide during Phase 2: re-enable, document as future work, or rip out the dead imports plus the now-unused JSON (`src/data/taxonomy-hierarchy.json`, `src/data/sp500-tag-classifications.json`).

---

## Goodbye note

Take this file with you to the new repo. Hand it to a fresh agent and have them turn each phase into a detailed task list. The audit context lives in the original repo's conversation history — start fresh in the new one without that baggage.

---

## Appendix A — Disclaimer master template (locked)

This is the canonical disclaimer text. Use verbatim in README. For PDFs, DOCX, website footer, and modals, render shortened forms that link back to the full text.

### Full text (README, website `/disclaimer` page, PDF appendix)

> **Not investment advice.** Thesis is an AI-powered research tool for educational and informational purposes only. Reports are generated by large language models and may contain errors, hallucinations, outdated data, or misinterpretations of financial filings. Nothing produced by Thesis constitutes investment advice, financial advice, legal advice, tax advice, or a recommendation to buy, sell, or hold any security. The author is not a registered investment advisor. Always conduct independent research and consult a qualified financial advisor licensed in your jurisdiction before making investment decisions. You assume all risk for any decisions made using this tool or its outputs. Past performance is not indicative of future results.
>
> Thesis is not affiliated with, endorsed by, or sponsored by any investment methodology, author, fund, or organization referenced or implied in its outputs. All trademarks and methodologies referenced belong to their respective owners.

### Short form (PDF cover, website footer, per-report banner)

> AI-generated research. Not investment advice. See full disclaimer.

### Placement matrix

| Surface | Form | Mechanics |
|---|---|---|
| `README.md` | Full | Blockquote near top, before quickstart |
| Generated PDF | Short on cover + full in appendix | Hardcode in `scripts/pdf/*.py` template |
| Generated DOCX | Same as PDF | Hardcode in `docx_helpers.py` template |
| Website — every page footer | Short, link to `/disclaimer` | Layout component |
| Website — first-run modal | Full, checkbox-to-dismiss, persisted in localStorage | Add to App.jsx mount |
| Website — per-report header | Short banner above report content | Add to OnePager / PitchDeck / FullStory render roots |

The "Phil Town shield" is the second paragraph. It stays even after R1 references are stripped from the codebase, because Buffett, Graham, Lynch, Munger, and others remain referenced throughout agent prompts and curriculum.
