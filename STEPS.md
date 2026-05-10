# Thesis — Open-Source Migration Plan

Skeleton plan for forking the current Thes1s repo into a public-facing **Thesis** repo. Intentionally high-level — phase ordering, parallelism, decision points only.

---

## Why this migration

**Strategic pivot, 2026-05-07.** The closed-product Thes1s effort hit a structural blocker: Anthropic hasn't approved multiagent orchestration (`callable_agents`) for the user's Managed Agents account, which means the Pitch Deck and Full Story pipelines can't ship as a hosted SaaS the way they were architected. Rather than wait indefinitely on a Research Preview decision, the strategy switched to open-source.

**The model is Langchain-style** — ship the research pipeline as a free public GitHub repo. Users clone it, plug in their own Claude Code subscription, and run `/analyze TICKER` locally to get PDF/DOCX reports in `~/.thesis/reports/`. The free repo becomes the funnel into a (potential, future) paid software stack — most likely a hosted website tier where users can browse and interact with their reports more comfortably than reading raw files.

**Trade-offs accepted:**
- Narrower audience than a hosted SaaS would have reached.
- Giving away considerable work for free, on the bet that visibility and adoption are more valuable than gated revenue at this stage. "Free" is the strongest attention magnet available, especially in a niche like value investing.
- If a meaningful user base materializes (order of hundreds, not tens), a paid website tier becomes viable. Until then, no monetization.

**Two distribution modes:**
1. **Standalone (CLI only)** — clone repo, run skills, get PDFs/DOCX locally. Expected to be most users.
2. **Connected (CLI + website)** — same as above, plus optionally push reports to a personal account at `thesis-investing.com` for a friendlier reading/sharing UX. The website is the eventual paid tier.

**Why we have to "de-Rule-1-ify" everything:** the closed-product Thes1s was built around Phil Town's *Rule One* methodology — branding, scoring concepts, terminology, even the curated guru list. Shipping a public/eventually-paid product on top of someone else's IP without permission is a real legal/ethical concern. Phase 2 strips every Rule One / R1 / Phil Town reference from the product surface (with one principled exception: Phil Town remains in the guru list as a public 13F filer — tracking, not branding). The methodology becomes generic-but-Buffett-flavored value investing, with a new "Thesis Score" rubric to be designed in brainstorm pods.

**Contingency clause for the agent pipeline:** if Anthropic eventually approves multiagent orchestration in the Managed Agents account, migrating the pipeline back into a hosted dispatch model (the v3 Inngest + Fly stack already prototyped in the `stock-analyzer` repo) becomes a real option. Until then, Claude Code skills + subagents are the only execution path.

---

## Reference: the closed-product source repo

This **Thesis** working copy lives at `/Users/kylehoff/Desktop/Thesis` (the directory you're in right now).

The original closed-product **Thes1s** lives at `/Users/kylehoff/Desktop/stock-analyzer` on the same machine, with its own GitHub remote at `https://github.com/kyleghoff707/stock-analyzer.git`. **It is the source of truth for any pre-migration code that has been deleted from this repo** — observatory subsystem, `agents-service` (Fly + Inngest), v1/v3 pipeline routes, the validation harness, the export-service, etc. If something is unexpectedly missing here and the migration plan says "deleted in Phase 1, resurrect from `stock-analyzer.git` if needed," that's where to look.

**Hard rule:** the `stock-analyzer` repo is read-only from this migration's perspective. Reference it freely; **never modify it**. All work happens in this **Thesis** repo.

---

## Phase 0 — Strategic decisions (lock these BEFORE forking)

These cascade through every later phase.

- [x] **Name — locked: Thesis.** Domain: `thesis-investing.com` (purchased); `thesisinvesting.ai` reserved as future option. Trademark search clear in the investing space (other "Thesis" marks exist in unrelated categories).
- [x] **License — locked: MIT.** Copyright holder: `Kyle Hoff`. Audit deps via `npx license-checker --summary` after Phase 2 rename to confirm zero copyleft conflicts. Add `LICENSE` file at root, `"license": "MIT"` in every `package.json`, MIT shield badge in README. No per-file SPDX headers needed.
- [x] **Repo strategy — locked: monorepo.** CLI + agents + frontend + Worker all in one public repo. Pre-Phase-1 audit required: `wrangler secret list`, grep for hardcoded keys/emails/admin allowlists; everything must be externalized to env before fork.
- [x] **Existing thes1sinvesting.com users — locked: fresh start.** No active users to migrate. Archive the existing D1 database, deprecate the domain, redirect any traffic to `thesis-investing.com`.
- [x] **Disclaimer language — locked.** Master template in Appendix A below. Three placements: README (full, top, blockquote), PDF/DOCX (short on cover + full in appendix), website (footer every page + first-run modal + per-report banner). Lawyer review deferred until pre-launch of paid website tier.

---

## Phase 1 — Foundation (COMPLETE — 2026-05-08)

All foundation work executed. Repo is ready for Phase 2 rebrand.

### What got done

1. ✅ **Forked to new GitHub.** Private repo at `https://github.com/kyleghoff707/thesis`. Stays empty until the squash-and-push at the end of the rebrand. Old `stock-analyzer.git` remote detached for a clean break.
2. ✅ **Stripped secrets.** All `.env*` files were already gitignored (Anthropic, Inngest, Langfuse, Worker callback keys — never tracked). The hardcoded session UUID in `scripts/test-assembly.py` was removed via file deletion. Tier 2 infrastructure IDs (D1, R2, Stripe, Managed Agents) removed from `api/wrangler.toml` along with the routes that used them.
3. ✅ **Deleted dead code** (audit list + much more):
   - **All items from the original audit list above** — executed verbatim.
   - **Top-level directories**: `.council/`, `agents/` (v1 archive), `codex/`, `council/`, `docs/`, `gstack/`, `knowledge/`, `public/`, `validation/`, `_planning-archive/`, `agents-service/`, `export-service/`. Plus root `fly.toml`, `TODOS.md`.
   - **api/ surgery**: 5 routes (`admin`, `claude`, `pipeline`, `pipeline-v3`, `stripe`), entire `assembly/` and `shims/` directories, 6 D1 tables (`invite_tokens`, `billing`, `pipeline_runs`, `managed_agents`, `v3_runs`, `v3_run_agents`), 14 wrangler env vars. `auth.js` trimmed to login/logout/me only — signup/invite/setup will be redesigned in Phase 4 per the locked open-public-signup decision.
   - **agents/ cleanup**: `agent-research/` subfolder, `coordinator-pitchdeck/`, `coordinator-fullstory/`, all 25 `managed-agent.yaml` files (Managed Agents platform metadata, no longer needed), `.backup-*` and `.staging-sync/` snapshot dirs, top-level `ORCHESTRATION.md` / `TODO.md` / `UX-MIGRATION-LOG.md` migration docs.
   - **src/ cleanup**: `src/engines/knowledgeBundle.js` + 4 consumers (`onePagerGenerator.js`, `aiResearch.js`, `pipelineManager.js`, `aiResearch.test.js`), `AssumptionTracker.jsx`, `useGeneratePitchDeckV3.js`, `src/schemas/observatory.js`.
   - **vite.config.js**: dead POST endpoint that called the removed `run-pipeline.js`.
   - **.gitignore**: dead `observatory/.obsidian/` entry.
   - **Rename**: `agents-v2/` → `agents/` (sed-replaced across 17 files).
   - **Skill files**: removed ~500 LOC of observatory orchestration from all 3 `.claude/skills/generate-*/SKILL.md` files.
   - **CLAUDE.md**: rewritten thin (~600 lines → ~75 lines).
   - **Pruned**: 62 stale `worktree-agent-*` git branches.

   **Total tracked-file deletions: 154+. ~190 MB of disk space reclaimed.**
4. ✅ **Added open-source scaffolding**:
   - `LICENSE` — MIT, © 2026 Kyle Hoff
   - `CONTRIBUTING.md` — minimalist, with the `agents/` issue-only PR policy
   - `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1 (adopted by reference)
   - `.github/ISSUE_TEMPLATE/` — 3 form templates (bug, feature, question) + `config.yml` (blank issues disabled)
   - `.github/pull_request_template.md` — standard checklist with the `agents/` PR guard
5. ✅ **Observatory: dropped entirely.** Vault, 8 scripts, 2 engines, schema, and all SKILL.md hooks scrubbed. Resurrect-able from `stock-analyzer.git` if ever needed.

### Verification

- `grep -rln -i "observatory" --exclude-dir=node_modules --exclude-dir=.git .` → only matches `STEPS.md` (this file, descriptive only)
- `grep -rln "agents-service" --exclude-dir=node_modules --exclude-dir=.git .` → only matches `STEPS.md`
- All 3 `.claude/skills/generate-*/SKILL.md` files dispatch agents end-to-end without invoking deleted scripts
- New `kyleghoff707/thesis` repo created, empty, private, no upstream wired

---

## Phase 2 — Rebrand & de-Rule-1-ify

### Phase 2A — Mass rename + W1/W3/W4 (COMPLETE — 2026-05-09)

#### Sequential lead step (mass rename)
- ✅ **Repo-wide `Thes1s` → `Thesis`, `thes1s` → `thesis`.** 143 files changed (~7,400 lines insertions/deletions). 7 git-tracked file/dir renames: `scripts/pdf/thes1s_pdf.py` → `thesis_pdf.py`, `src/engines/thes1sClassification.js` → `thesisClassification.js`, 4 industry-classification JSONs (e.g. `thes1s-taxonomy-tree.json` → `thesis-taxonomy-tree.json`), and the engine module rename below.
- ✅ **Schema field rename** `ruleOneScore` → `thesisScore` (and `RuleOneScore` → `ThesisScore`) across 31 files (schema, engine, registry, fixtures, components, tests, agent prompts). Engine file `ruleOneScore.js` → `thesisScore.js`. Subsequent audit-driven sweep also caught `r1Score` camelCase in `Competitors.jsx` (5 hits) and `<ScoreBadge label="Rule #1 Score">` in `CompanyHeader.jsx` that were missed in the initial pass.
- ✅ **Cache directory** `.thes1s/` → `.thesis/`.
- ✅ **Configuration**: `package.json` (`"thesis"`), `api/package.json` (`"thesis-api"`), `api/wrangler.toml` (`database_name = "thesis"`, `bucket_name = "thesis-transcripts"`, `VITE_API_URL = "https://api.thesis-investing.com"`). **Note:** D1/R2 resources keep their original UUID/name in Cloudflare; the actual resource rename in the dashboard is deferred to Phase 4 when connected-mode is rebuilt.

#### Workstream coverage

- ✅ **W1 — Agent prompts: Rule 1 → Buffett-style value investing.** Rule One / Phil Town / R1 references stripped from agent prompts; replaced with generic value-investing language (Buffett, Graham, Lynch, Munger framing). 22 agent prompts have a clean `## Value Investing Philosophy` section header. **Phil Town stays in `packages/sec-parsers/gurusList.js`** (43 entries) — tracking a public 13F filer is unrelated to product branding. **Followup**: some agent prompts have residual prose awkwardness (sentence-start lowercase "value investing", retained "Rulers" terminology, etc.) — to be cleaned up alongside the agent-prompt framing rewrite that comes out of the brainstorm pods.

- ⏸️ **W2 — Website UI text + tour.** Mechanical rename done (variable names, button labels, "Thesis Score" replacing "Rule #1 Score" in tour copy). **Semantic rewrite deferred** to Phase 2B, after brainstorm pods produce real methodology. Today's tour/glossary/UI copy describes a Rule-One-shaped product with strings substituted; once Thesis Score, Valuation methods, and Full Story redesigns are locked, the copy will get a real rewrite. **Watch for**: semantic UI changes may propagate from any brainstorm pod outputs (new scoring rubric, new valuation methods, renamed Full Story stage). Don't write copy twice — wait for the methodology to settle.

- ⏭️ **W3 — PDF/DOCX branding (logo, colors, wordmark).** File rename done (`thes1s_pdf.py` → `thesis_pdf.py`). **Branding kept as-is per user decision** — the teal-and-slate palette and fused-letterform logo style remain (now rendered as the "Thesis" wordmark instead of the T1 letterform). Not a deferred item; a closed decision.

- ✅ **W4 — Web search re-enable on One Pager.** Verified already enabled and operational. `agents/one-pager/prompt.md:9` explicitly instructs *"Research first. Before emitting your structured output, perform at least 2–3 web searches"*. The dispatching `.claude/skills/generate-one-pager/SKILL.md` mirrors this instruction (lines 39, 60, 62). Claude Code subagents have `web_search` available by default through the Agent tool. No code change needed.

### Phase 2B — Complete (2026-05-10)

Both remaining workstreams shipped together. Spec: [docs/specs/2026-05-10-w2-w5-completion.md](docs/specs/2026-05-10-w2-w5-completion.md).

- ✅ **W2 (semantic rewrite of UI text + tour)** — `tourSteps.js` rewritten end-to-end to match the 4-pillar Thesis Score, Final Thesis name, redesigned Pitch Deck section labels, and neutral "investors" framing. `CompanyHeader.jsx` shows composite Thesis Score badge only. `Competitors.jsx` columns dropdown adds 4 pillars (Compounding + Capital Efficiency default-checked; Capital Allocation + Resilience default-unchecked). `PitchDeck.jsx` `SECTION_DEFS` and phase index ranges updated to 11 new keys per POD-PD. `ConfirmGenerateDialog.jsx` Final Thesis copy aligned with the prose-narrative-with-verdict-box redesign (dropped "checklists" language). `GenerationProgressPanel.jsx` `PITCH_DECK_SECTIONS` + `FINAL_THESIS_SECTIONS` aligned with both pod outputs. `peerMetrics.js` extended (`computePeerScores` now accepts a 3rd `latestYearMetrics` arg + fetches shares-outstanding 5yr-prior) so peer Capital Allocation (buybackDiscipline only) and Resilience (netDebtToFCF + currentRatio) populate for the Competitors columns; sub-metrics requiring unavailable peer data (dividend history, interest expense, BVPS composite series) are skipped — pillar averages whatever is present.

- ✅ **W5 (code/doc cleanup + expanded audit findings)**:
  - `theme.js:1` comment: dropped `stickeR1` pun + lowercase "value investing"
  - `.claude/settings.local.json`: curl User-Agent `Thes1s/1.0` → `Thesis/1.0`
  - `src/schemas/dataPacket.js`: dropped legacy `sliceDataPacket()` (utils version remains as production path; obsolete tests removed)
  - **Cross-stage terminology cascade**: "Sticker price" / POD-PD's interim "Fair Value" → "Full Price" across ~22 agent prompts, `ValuationCalculators.jsx` summary labels, `valuation.js` engine comments, PDF/DOCX templates. "Buy price" / "On Sale Price" treated as interchangeable approved vocabulary.
  - **Tier-1 R1 vocabulary scrubbed from Stage 1 + Stage 3 prompts** (lint-vocab `SCAN_GLOBS` extended to cover One Pager, readers, and all 11 Final Thesis prompts; mirrored Pitch Deck redesign substitution patterns: "Wonderful Company" → "high-conviction investment" / "high-quality business"; "Three Ms framework" → "core dimensions"; "Six-Inch Bar Concept" → "Simplicity Test"; "Rulers" → "Value investors")
  - **`R1 moat types`** branding violation in `competitor-evaluator-finalthesis/prompt.md` cleared (3 occurrences)
  - **`THES1S_*` → `THESIS_*`** rename: `THES1S_DIR` (engines/progressState), `THES1S_SOURCES` (CitationTooltip), `YAHOO_TO_THES1S` (api/cron/crosswalk + tests + generator), `THES1S_ADMIN_EMAIL` / `THES1S_ADMIN_PASSWORD` env vars (inject-report.mjs)
  - **`ruleOneOE` JSON key** in `scripts/pdf/generate_pitch_deck_pdf.py` → `valueInvestingOE`
  - **Final Thesis rename closure**: `inject-report.mjs` stage key `fullStory` → `finalThesis`, file `full-story.json` → `final-thesis.json`; 3 Pitch Deck agent prompt cross-references; `sync-agent-yamls.mjs` comment; CLAUDE.md TBD parenthetical closed; STEPS.md `useFullStory` reference updated
  - **Lowercase "value investing" sentence-starts** capitalized across ~12 agent prompts (~30 occurrences)
  - **CLAUDE.md status block** rewritten: Phase 1 + Phase 2 both marked complete
  - **Kept dormant Layers 2 & 3 in `engines/edgarFinancials.js`** as-is (user decision: optionality for future reactivation)

**Verification:** 1262 tests pass; `npm run build` succeeds; `node scripts/lint-vocab.mjs` exits 0 across 25 scanned files; manual grep sweep finds no residual R1 / Sticker / Full Story / Thes1s in production code.

### Brainstorm pods (run in parallel — each deserves its own session)

- [x] **Thesis Score — locked 2026-05-09.** 4-pillar Buffett-flavored rubric (Compounding / Capital Efficiency / Capital Allocation / Resilience) replaces R1's Big-5 + Management dichotomy. See [docs/specs/2026-05-09-thesis-score-redesign.md](docs/specs/2026-05-09-thesis-score-redesign.md) and [docs/plans/2026-05-09-thesis-score-redesign.md](docs/plans/2026-05-09-thesis-score-redesign.md).
- [x] **Valuation methods — implicitly resolved 2026-05-10.** Pitch Deck redesign and Final Thesis redesign both kept the four R1-stack calculators (MOS, Payback Time, Ten Cap, Equity Bond) intact, with only the "Sticker Price" → "Fair Value" label rename. The methods themselves are public-domain (MOS=Graham, Equity Bond=Buffettology 1997, Payback Time=generic, Ten Cap=Buffett's Owner Earnings × 10). No standalone Valuation pod brainstorm needed.
- [x] **Guru list — decided 2026-05-10 to keep the 43-name list unchanged.** No rebuild from custom 13F screening criteria. The names themselves are public 13F filers (tracking is unrelated to product branding); the W1 framing rewrite already removed "Rule 1 Gurus" packaging from agent prompts. Phil Town stays in the list (per existing decision).
- [x] **Final Thesis (formerly Full Story) — spec locked 2026-05-09; implementation complete 2026-05-09.** Spec: [docs/specs/2026-05-09-final-thesis-redesign.md](docs/specs/2026-05-09-final-thesis-redesign.md). Plan: [docs/plans/2026-05-09-final-thesis-implementation.md](docs/plans/2026-05-09-final-thesis-implementation.md). Verified end-to-end on INTU: 7 sections emit correctly (event_analysis / business_analysis / moat_analysis / management_analysis / valuation_analysis / debate / trade_plan), zero checklist artifacts, §§1-5 verdict-box objects present, §6 watchpoints populated, §7 trade plan structured. PDF rendered (206KB, archived). UI render verification deferred (covered by 1267 unit tests + PDF render parity). W2 semantic UI rewrite for Stage 3 components is unblocked.
- [x] **Pitch Deck (Stage 2 redesign) — spec locked 2026-05-09; implementation complete 2026-05-10.** See [docs/specs/2026-05-09-pitch-deck-redesign.md](docs/specs/2026-05-09-pitch-deck-redesign.md). Implementation in [docs/plans/2026-05-09-pitch-deck-redesign-plan.md](docs/plans/2026-05-09-pitch-deck-redesign-plan.md). 22/25 tasks landed (Task 3 merged into 15, Tasks 19+20 no-ops, Task 22 live LLM smoke deferred). Lint at zero R1 violations across 9 scanned files; 1267 unit tests pass; PDF/DOCX renderers smoke-tested on legacy INTU report via LEGACY_KEY_MAP.

All five pods are now resolved (4 original + Pitch Deck sibling). W2 (semantic UI rewrite) and W5 (code/doc cleanup) remain as the only Phase 2B items still open — both can be picked up at any time now that pod outputs have settled.

---

## Phase 3 — Make it portable (sequential after Phase 2)

Current pipeline assumes Cloudflare D1 + R2 + Worker proxy + invite auth. Repo users have none of that.

- [ ] Audit every engine for D1/R2 dependency. Confirm direct-fetch fallbacks (most already exist).
- [x] **Transcripts strategy — resolved 2026-05-10: ship the R2 mirror in-repo at `./transcripts/`.** ~1,677 markdown files, ~72 MB, 492/500 S&P companies covered. CLI users get transcripts with zero setup; no Alpha Vantage key needed. R2 + cron stay alive (powers the website + serves as the upstream source). Monthly refresh: `npm run dump:transcripts` → review diff → commit. Engine reads from local files first via `__nodeTranscriptRead` shim ([src/engines/nodeAdapter.js](src/engines/nodeAdapter.js)), falls through to R2 then Alpha Vantage. Switch to GitHub Releases tarball (Option C from the brainstorm) when user count justifies cleaning up history bloat.
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

1. ~~License — MIT vs AGPL (Phase 0)~~ — **resolved: MIT, © 2026 Kyle Hoff.**
2. ~~Repo strategy — monorepo vs split (Phase 0)~~ — **resolved: monorepo.**
3. ~~Trademark on chosen name (Phase 0)~~ — **resolved: Thesis, no investing-space conflicts found**
4. ~~Existing user migration plan (Phase 0)~~ — **resolved: fresh start, no users to migrate**
5. ~~Observatory ship-or-not (Phase 1)~~ — **resolved: dropped entirely; scrubbed from operational repo**
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
- ~~**`KEY_NORMALIZATION` lives in PitchDeck.jsx + FullStory.jsx**~~ — **resolved** as part of pitch-deck redesign (2026-05-09): consolidated to `src/utils/keyNormalization.js`.
- **`Spinner.jsx` injects keyframes globally** as a side effect on import. Don't remove the import without moving the keyframes.
- **Toolbox is 7 tabs, not 8.** Old CLAUDE.md says 8 (no Audit tab exists).
- **Static taxonomy JSON drifts from D1.** Decide single source of truth.
- **Two parallel classification systems** — Thes1s taxonomy (sector/peers) AND raw-SIC overlay selector (`industryClassifier.js`). They can disagree. Worth unifying.
- ~~Three execution surfaces drift~~ — **resolved in Phase 1**: skills are the only execution surface; `run-pipeline.js` and `agents-service/` deleted.
- ~~Web search ⊥ structured output~~ — **no longer relevant**: the Anthropic SDK direct path (`agents-service/`) was deleted in Phase 1. Skill-based dispatch uses Claude Code subagents, which can web-search freely.
- **MultiSection wrapper unreliable.** Production already worked around it (commit 27bd562 — N sequential single-section calls). Agent prompts still spec MultiSection; align them.
- **Compensation scraper is fragile.** 94.8% accuracy on DEF 14A; will break when filing formats change.
- **`useOnePager` / `usePitchDeck` / `useFinalThesis`** poll dev-only Vite middleware paths that 404 in prod. Either gate on `IS_DEV` or remove.
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
