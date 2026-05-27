# Thesis
> Agent startup note: Claude/Codex agents should read the local, gitignored `INFRA.md` at the start of every conversation before making infrastructure, deployment, repo-boundary, or API changes.

## Project
**Thesis** — open-source AI value investing research. Distributed as a free CLI; users plug in their own Claude Code subscription and run `/analyze TICKER` to get PDFs/DOCX in `~/thesis/reports/`. The CLI runs locally and contacts SEC EDGAR, Yahoo Finance, and Anthropic. Optional connected mode (Phase 4, future) will push reports to thesis-investing.com — that's not yet wired in this repo.

The user is NOT a programmer — keep explanations in plain English.

**Status**: Mid-migration to public OSS. Phases 1 (foundation), 2 (rebrand), and 3 (portability) complete. First end-to-end smoke test against the live hosted Thesis Data API passed on 2026-05-13 — `/analyze AAPL` generated One Pager (6 sections, 11pp PDF), Pitch Deck (12 sections, 66pp PDF), and Final Thesis (7 sections + adversarial debate, 45pp PDF), all WATCHLIST; 19/20 DataPacket fields populated; 24 subagent dispatches completed without retry. Phase 4 (two-mode wiring — connected-mode account sync) is next. [STEPS.md](STEPS.md) is the authoritative phase plan.

---

## Operating rules

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

### Rule 1 — Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

### Rule 2 — Simplicity First
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

### Rule 3 — Surgical Changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

### Rule 4 — Goal-Driven Execution
Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.

### Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

### Rule 6 — Token budgets are not advisory
Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

### Rule 7 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

### Rule 8 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

### Rule 9 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

### Rule 10 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

### Rule 11 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

### Rule 12 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

---

## Branding rules (non-negotiable)

- **Do not reintroduce** "Rule One", "Phil Town", "R1", "Thes1s", or "thes1sinvesting" anywhere — code, prompts, comments, docs, UI. The Phase 2 rename stripped them; keep them stripped.
- **Buffett, Graham, Lynch, Munger** are fine to reference by name (their methodology is public-domain; the disclaimer in [STEPS.md](STEPS.md) Appendix A handles legal coverage). Don't *frame* the product as theirs.
- **Identity**: product name is `Thesis`. Domain: `thesis-investing.com` (purchased). Copyright holder: Kyle Hoff. License: MIT.

---

## Tech stack

- Node.js CLI orchestration
- Anthropic Claude via Claude Code subagents (the user's own subscription)
- `agents/` = production agent prompts; `.claude/skills/generate-*` = orchestration
- Hosted Thesis Data API for canonical DataPackets; local SEC filing extraction and bundled transcripts
- Reports: Python PDF/DOCX generators in `scripts/pdf/`
- Optional connected-mode backend (account sync) is maintained outside this repo

---

## Pipeline

3-stage gated workflow:
1. **One Pager** — quick screen, pass/fail (1 agent)
2. **Pitch Deck** — research case across 12 sections (11 specialist agents across 5 waves + 6 PSR readers in Wave 0)
3. **Final Thesis** — conviction-level analysis across 7 sections with adversarial Bull/Bear/Rebuttal/Judge debate (11 agents across 3 phases)

Each stage gates the next via verdict: `PASS` or `WATCHLIST` proceeds, `FAIL` stops the pipeline. `/analyze TICKER` chains all three stages auto-pilot — no per-stage user approval.

---

## Pipeline gotchas (learned from the 2026-05-13 smoke test)

- **`disable-model-invocation: true` is set on `analyze`, `generate-one-pager`, `generate-pitch-deck`, `generate-final-thesis`.** The Skill tool refuses to fire them; only the user typing `/analyze TICKER` (or a child command) at the prompt loads them. When the user invokes `/analyze` and its SKILL.md says "Invoke `/generate-one-pager TICKER`", the orchestrating model must execute that child SKILL.md as a procedural recipe directly (Bash + Agent tool calls), not as a sub-Skill call.
- **`generate-pitch-deck` Wave 3 is internally inconsistent.** It declares "PARALLEL DISPATCH" while also stating valuation-specialist receives `S11 risk_profile` as input. These contradict. Honor the parallel dispatch — valuation-specialist works from Wave 1+2 context; synthesis-writer reconciles cross-references at Wave 4.
- **`generate-final-thesis` PD_INHERITANCE_MAP references legacy keys** (`pest`, `radar`, `simple_predictable`, `barriers_moats`, `fcf`, `roe_roic_debt`) that do not exist in the v2 Pitch Deck schema. Best-fit remap: pest/radar → `risk_profile` + `setup`, simple_predictable → `business_quality`, barriers_moats → `moat_analysis`, fcf → `cash_generation`, roe_roic_debt → `returns_leverage` + `balance_sheet`, management → `management_capital_allocation`. Map needs reconciliation.
- **Pitch Deck FGR derivation (Step 9) describes an interactive PM confirmation loop** but `/analyze` runs auto-pilot ("All sub-skills run end-to-end without checkpoints"). Accept the valuation-specialist's proposed FGR derivation without prompting.
- **Auto-archive cuts a new ARCHIVE_ID per stage**, not per `/analyze` run. Three completed stages produce three archive directories. If you want one-archive-per-run, share an ARCHIVE_ID across stages.

---

## Source structure

```
agents/         — Agent prompts (production path)
.claude/skills/    — generate-one-pager, generate-pitch-deck, generate-final-thesis, analyze
scripts/           — CLI runners + PDF/DOCX toolkit
src/
  api/             — Hosted Thesis Data API client
  config/          — Local `~/thesis/config.json` helpers
  engines/         — Retained CLI engines for filings, transcripts, and Node setup
  schemas/, utils/, data/
transcripts/       — Bundled public transcript corpus
STEPS.md           — Migration plan (private; gitignored before public release)
```

---

## Dev commands

| Command | Purpose |
|---|---|
| `npm run setup` | Write `~/thesis/config.json` |
| `npm test` | Vitest |

---

## Conventions

- Components: PascalCase `.jsx`, default export.
- Hooks: `use` prefix, return `{ data, loading, error }`.
- Engines: camelCase `.js`, named exports.
- Financial fields: `snake_case`; report data: `camelCase`.
- Theme: `import { C } from '../theme'`.
- Error handling: `try/catch` → return `null`; `console.warn` for non-fatal.

---

## Generation status

`~/thesis/reports/{TICKER}/generation-status.json` tracks pipeline progress. Shape:

```json
{ "ticker": "AAPL", "stage": "finalThesis", "state": "COMPLETED", "startedAt": "...", "updatedAt": "...", "lastVerdict": "WATCHLIST" }
```

- `stage`: `onePager` | `pitchDeck` | `finalThesis`
- `state`: `IN_PROGRESS` | `DATA_PREP` | `COMPLETED` | `FAILED`
- `startedAt` is preserved across stage transitions; `updatedAt` is refreshed on every write
- `lastVerdict` is the most recent stage verdict (PASS / WATCHLIST / FAIL)

Maintained by [scripts/update-status.js](scripts/update-status.js). Each `generate-*` SKILL.md writes `IN_PROGRESS` at start and `COMPLETED` with verdict at end; `scripts/prepare-data.js` writes `pitchDeck/DATA_PREP` during the Stage 2 data fetch. Currently no reader — the file exists for future inspection/resume tooling.

---

## Working rules

- **Keep CLAUDE.md and AGENTS.md in sync.** They are the same instructions for two different agents (Claude Code reads `CLAUDE.md`; Codex reads `AGENTS.md`). When you edit one, mirror the edit in the other in the same commit. They should be byte-for-byte identical.
- **Don't commit without explicit user approval.** The user is the gate.
- **Don't reintroduce old branding strings** (`Thes1s`, `thes1sinvesting`, `Rule One`, `R1`, `Phil Town`) — see [Branding rules](#branding-rules-non-negotiable).
- **Don't push to remotes without being asked.** Local commits OK; `git push` and `gh pr create` need a green light.

---

## `ant` CLI Isolation Rule (Anthropic Console/API auth — IMPORTANT)

**Never run raw `ant`. Never run `ant auth login`.** Raw `ant auth login` writes Console/API OAuth state into `~/.config/anthropic` — the shared default — which Claude Code also reads. On 2026-05-20 this caused a billing leak: Claude Code billed the Anthropic Console / API balance instead of using the Claude Max 20x subscription. Recovery required wiping Claude Code state, Keychain Claude credentials, Claude Desktop state, and `~/.config/anthropic`.

**Always isolate Console/Managed-Agents auth into a dedicated config dir.** Either:

1. Use a project wrapper if one exists (e.g. `scripts/ant-console`), which sets `ANTHROPIC_CONFIG_DIR=$HOME/.config/anthropic-ant`. The Thesis-hosted repo has a reference implementation at `~/Desktop/Thesis-hosted/scripts/ant-console`.
2. Or export the env var manually before any `ant` invocation:

   ```bash
   export ANTHROPIC_CONFIG_DIR="$HOME/.config/anthropic-ant"
   ant auth login
   ant auth status
   ```

Every `ant` invocation must use the isolated config dir — no exceptions.
