# Thesis

## Project
**Thesis** — open-source AI value investing research. Distributed as a free CLI; users plug in their own Claude Code subscription and run `/analyze TICKER` to get PDFs/DOCX in `~/.thesis/reports/`. Optional connected mode pushes reports to an account at thesis-investing.com.

The user is NOT a programmer — keep explanations in plain English.

**Status**: Mid-migration from the closed-product website (`Thes1s`) to a public OSS repo (`Thesis`). [STEPS.md](STEPS.md) is the authoritative phase plan. We are early in Phase 1.

---

## Branding rules (non-negotiable)

- **No "Rule One" / "Phil Town" / "R1"** anywhere — code, prompts, comments, docs, UI. Includes derivatives: "Rule One Score" → "Thesis Score".
- **Buffett, Graham, Lynch, Munger** are fine to reference by name (their methodology is public-domain; the disclaimer in [STEPS.md](STEPS.md) Appendix A handles legal coverage). Don't *frame* the product as theirs.
- **Never use** `Thes1s` or `thes1sinvesting.com` in new work. New domain: `thesis-investing.com`. Copyright holder: Kyle Hoff. License: MIT.

---

## Tech stack

- Vite + React frontend
- Anthropic Claude via Claude Code subagents (the user's own subscription)
- `agents-v2/` = production agent prompts; `.claude/skills/generate-*` = orchestration
- SEC EDGAR + Yahoo Finance + Finviz for free data; Alpha Vantage optional (user-supplied key)
- Reports: Python PDF/DOCX generators in `scripts/pdf/`
- Optional Cloudflare Workers + D1 + R2 backend in `api/` for connected-mode account sync

---

## Pipeline

3-stage gated workflow:
1. **One Pager** — quick screen, pass/fail (1 agent)
2. **Pitch Deck** — research case across 10 sections (10 agents, 5 waves)
3. **Final Thesis** *(rename TBD — Phase 2 brainstorm: Conviction Brief / Investment Memo / Final Thesis)* — conviction-level analysis with adversarial debate (7 agents)

Each stage gates the next: user must approve the prior verdict before unlocking generation of the subsequent stage.

---

## Source structure

```
agents-v2/         — Agent prompts (production path)
.claude/skills/    — generate-one-pager, generate-pitch-deck, generate-full-story, analyze
api/               — Cloudflare Worker (optional connected-mode backend)
agents-service/    — Fastify + Inngest dispatch (v3, paused)
scripts/           — CLI runners + PDF/DOCX toolkit
src/
  components/      — React UI
  engines/         — Data fetching, XBRL extraction, scoring, valuation
  hooks/, schemas/, utils/, data/
packages/          — Shared modules (sec-parsers, etc.)
industry-classification/ — Sector/industry taxonomy (rename pending)
STEPS.md           — Migration plan (private; gitignored before public release)
```

---

## Dev commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm test` | Vitest |
| `cd api && npx wrangler dev` | Worker locally (only if working on connected-mode backend) |

---

## Conventions

- Components: PascalCase `.jsx`, default export.
- Hooks: `use` prefix, return `{ data, loading, error }`.
- Engines: camelCase `.js`, named exports.
- Financial fields: `snake_case`; report data: `camelCase`.
- Theme: `import { C } from '../theme'`.
- Error handling: `try/catch` → return `null`; `console.warn` for non-fatal.

---

## Migration constraints (Phase 1)

- **Don't push to GitHub.** The new private repo (`kyleghoff707/thesis`) is empty and stays that way until the squash-and-push at the end of the rebrand.
- **Default to deletion over preservation.** We're starting from a clean slate.
- **Don't add features, tests, or polish** until Phase 2 rebrand finishes.
- **Don't commit anything without explicit user approval.**
- Anything matching `Thes1s`, `thes1sinvesting`, `Rule One`, `R1`, or `Phil Town` is a deletion target, not a refactor target.
