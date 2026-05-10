# Thesis

## Project
**Thesis** — open-source AI value investing research. Distributed as a free CLI; users plug in their own Claude Code subscription and run `/analyze TICKER` to get PDFs/DOCX in `~/.thesis/reports/`. Optional connected mode pushes reports to an account at thesis-investing.com.

The user is NOT a programmer — keep explanations in plain English.

**Status**: Mid-migration to public OSS. Phase 1 (foundation) and Phase 2 lead step (mass rename) complete. Phase 2 parallel workstreams still pending: agent prompt framing rewrite, UI text, PDF/DOCX branding, and four brainstorm pods (Thesis Score rubric, valuation methods, guru list, Full Story redesign). [STEPS.md](STEPS.md) is the authoritative phase plan.

---

## Branding rules (non-negotiable)

- **Do not reintroduce** "Rule One", "Phil Town", "R1", "Thes1s", or "thes1sinvesting" anywhere — code, prompts, comments, docs, UI. The Phase 2 rename stripped them; keep them stripped.
- **Buffett, Graham, Lynch, Munger** are fine to reference by name (their methodology is public-domain; the disclaimer in [STEPS.md](STEPS.md) Appendix A handles legal coverage). Don't *frame* the product as theirs.
- **Identity**: product name is `Thesis`. Domain: `thesis-investing.com` (purchased). Copyright holder: Kyle Hoff. License: MIT.

---

## Tech stack

- Vite + React frontend
- Anthropic Claude via Claude Code subagents (the user's own subscription)
- `agents/` = production agent prompts; `.claude/skills/generate-*` = orchestration
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
agents/         — Agent prompts (production path)
.claude/skills/    — generate-one-pager, generate-pitch-deck, generate-full-story, analyze
api/               — Cloudflare Worker (optional connected-mode backend)
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
- Don't reintroduce old branding strings (`Thes1s`, `thes1sinvesting`, `Rule One`, `R1`, `Phil Town`); they were deleted in the Phase 2 rename.
