# Phase 3 — Portability (CLI users, zero backend access)

**Status**: spec locked 2026-05-10. Awaiting implementation plan.
**Predecessor**: Phase 2B complete (W2 semantic rewrite + W5 cleanup).
**Successor**: Phase 4 (connected mode — opt-in account sync to thesis-investing.com).

---

## Goal

Make the Thesis CLI runnable on any Mac / Linux / Windows machine with zero connection to the author's Cloudflare backend (D1 + R2 + Worker). The full pipeline (`/analyze TICKER` → One Pager → Pitch Deck → Final Thesis) runs locally, writes PDFs/DOCX to the user's home folder, and contacts only free public sources (SEC EDGAR, Yahoo Finance, Anthropic via the user's own Claude Code subscription, optionally Alpha Vantage if they bring their own key).

---

## Locked decisions

1. **Home folder is `~/thesis/` (visible)** — single user-facing folder containing reports, cache, and config. Replaces the inherited `<repo>/.thesis/` cache pattern that mixed working state into the cloned repo.
2. **CLI users have zero access to D1, R2, or the Worker.** The Cloudflare backend belongs to the website (Phase 4) only. Local engines never call `api.thesis-investing.com`.
3. **Compensation scraper stays as-is** (~1,693 LOC). Maintenance burden accepted because management-quality analysis depends on it.
4. **Industry taxonomy ships in-repo, refreshed via PR** (same pattern as the bundled transcripts).
5. **Cross-platform support is Mac + Linux + Windows.** Mac + Linux verification gates the public push; Windows verification is additive (runs once the author's Windows machine is back).
6. **The `api/` Worker source moves out of the public repo.** Gitignored; the source stays on the author's local Desktop. Public OSS repo never sees it.
7. **SEC User-Agent identifies the project, not a person** — `Thesis CLI/0.1 (+https://github.com/kyleghoff707/thesis)`. No personal email in shipped code.
8. **Privacy notice ships in three places:** README, generated PDFs (appendix), first-run CLI banner.

---

## 1. Home folder layout

```
~/thesis/
├── reports/
│   └── {TICKER}/
│       ├── one-pager.pdf
│       ├── one-pager.docx
│       ├── one-pager.json
│       ├── pitch-deck.pdf
│       ├── pitch-deck.docx
│       ├── pitch-deck.json
│       ├── final-thesis.pdf
│       ├── final-thesis.docx
│       └── final-thesis.json
├── cache/
│   └── {TICKER}/
│       ├── dataPacket.json
│       ├── agent-outputs/
│       └── progress.json
└── config.json
```

### Path resolution

- **Node:** `path.join(os.homedir(), 'thesis')`
- **Python:** `Path.home() / 'thesis'`

Cross-platform identical:
- macOS: `/Users/{user}/thesis`
- Linux: `/home/{user}/thesis`
- Windows: `C:\Users\{user}\thesis`

### `THESIS_DIR` env override

Power users may set `THESIS_DIR=/some/path` to relocate the entire tree (CI, dev, alternate drive). Falls back to `~/thesis` when unset. Single resolver helper per language; no scattered `os.homedir()` calls.

### Files that need path updates

**JS:**
- `src/engines/progressState.js` — replace `process.cwd()/.thesis` with home-resolver
- `vite.config.js:130` — dev server lookup of report dir

**Python:**
- `scripts/pdf/generate_one_pager_pdf.py:23`
- `scripts/pdf/generate_pitch_deck_pdf.py:30`
- `scripts/pdf/generate_final_thesis_pdf.py:23`
- `scripts/pdf/report_data_reader.py:50`
- `scripts/pdf/generate_one_pager_docx.py`, `generate_pitch_deck_docx.py`, `generate_final_thesis_docx.py` (mirror PDF changes)

**Skill orchestration:**
- `.claude/skills/generate-one-pager/SKILL.md`
- `.claude/skills/generate-pitch-deck/SKILL.md`
- `.claude/skills/generate-final-thesis/SKILL.md`
- `.claude/skills/analyze/SKILL.md`

**Docs:**
- `CLAUDE.md` — update path references
- `STEPS.md` — close out Phase 3 path item
- `.gitignore` — drop the obsolete `.thesis/` cache pattern

### Migration

No public users yet. For the author's local working copy, the old `<repo>/.thesis/` folder becomes dead weight after the rename — safe to delete manually. Document in CHANGELOG.

---

## 2. Backend cutoff (D1 / R2 / Worker)

### Engine surgery

| Engine | Before | After |
|---|---|---|
| `src/engines/transcripts.js` | Local file → R2 → Alpha Vantage | Local file → Alpha Vantage |
| `src/engines/gurus.js` | D1 (`/gurus/all`) → SEC EDGAR | SEC EDGAR only |
| `src/engines/insiders.js` | D1 (`mapD1Trade`) → SEC EDGAR | SEC EDGAR only |
| `src/engines/peers.js` | Local taxonomy + D1 IPO supplement | Local taxonomy only |

### Adapter cleanup

- `src/engines/nodeAdapter.js` — delete the `'/data/': 'https://api.thesis-investing.com/data/'` route. The `dataUrl()` helper either deleted or stripped to a no-op.
- `src/engines/apiBase.js` — `claudeBaseUrl()` (lines 58–59) is browser-only. Either gate it behind `import.meta.env.SSR` or split into browser + node variants. Goal: no Worker URLs reachable from the CLI execution path.

### Trade-offs accepted

- **Lose:** D1's recently-IPO'd companies (peers.js IPO supplement). New ceiling = whatever the bundled `industry-classification/thesis-company-assignments.json` contains; refreshed monthly via PR.
- **Lose:** Pre-cleaned guru/insider aggregations from D1. EDGAR is the source of truth, so worst case CLI users get raw filings instead of Worker-cleaned data.
- **Gain:** Backend stays private. Zero forker access to the website's hosting layer. Zero load from CLI runs. Phase 4 connected mode is purely additive.

### Worker repo split

- `api/` is added to `.gitignore`.
- `git rm -r --cached api/` removes it from the working tree (files remain on disk).
- This happens **before** the squash-and-push to public, so `api/` never enters public git history.
- The Worker source lives only on the author's local Desktop. Author should ensure Time Machine or equivalent backup is running, since this is now the single copy.

### Verification (per-engine)

After surgery, blocking `api.thesis-investing.com` in `/etc/hosts` (or via firewall) and running `/analyze AAPL` end-to-end must produce a complete report set. Any 500 or hang means a call site was missed.

---

## 3. Engine audit + data source map

### Final source-of-truth map after Phase 3

| Engine | Source | Failure mode |
|---|---|---|
| `edgarFinancials.js` | `data.sec.gov` (XBRL company facts) | Hard fail — pipeline blocked without 10-K data |
| `edgar.js` | `www.sec.gov` (filing fetches) | Hard fail |
| `compensation.js` | `www.sec.gov` (DEF 14A scrape) | Soft fail — management agents handle missing comp |
| `gurus.js` | `www.sec.gov` (Form 13F) | Soft fail — empty list |
| `insiders.js` | `www.sec.gov` (Form 4) | Soft fail |
| `nport.js` | `www.sec.gov` (Form N-PORT) | Verify during audit (see callout) |
| `transcripts.js` | local `./transcripts/` → Alpha Vantage (optional) | Soft fail — agents skip missing transcripts |
| `prices.js` | `query1.finance.yahoo.com` | Soft fail — degraded valuation inputs |
| `analystEstimates.js` | `query1.finance.yahoo.com` | Soft fail |
| `batchQuotes.js` | `query1.finance.yahoo.com` | Soft fail |
| `peers.js` | local `industry-classification/*.json` | Hard miss → no peers, agent handles gracefully |
| `industryClassifier.js` + `thesisClassification.js` | local `industry-classification/*.json` | Always succeeds |

### Phase 3 audit callouts

- **`nport.js`** — was not enumerated in the Phase 3 surface-area audit's D1/R2 list. Verify it is purely SEC-direct before considering the engine sweep done.
- **Dormant Layers 2 & 3 in `edgarFinancials.js`** — STEPS.md notes the imports are commented out and the JSON is unused. Phase 3 rips them out (default-to-deletion principle):
  - Remove dormant imports at `edgarFinancials.js:11–15`
  - Delete `src/data/taxonomy-hierarchy.json`
  - Delete `src/data/sp500-tag-classifications.json`
- **`nodeFinviz.js`** — Finviz is no longer part of the pipeline. Delete `src/engines/nodeFinviz.js` and grep for stale imports/references in agent prompts and hooks.
- **Personal email sweep** — grep for `kyleghoff707@gmail.com` (and any other personal email) across the entire repo and replace with the generic project User-Agent. No personal contact info ships in public code.

### SEC User-Agent

- Default in code: `Thesis CLI/0.1 (+https://github.com/kyleghoff707/thesis)`
- Identifies the project, not a person.
- Users may override via `~/thesis/config.json` (`userAgent` field) if they want SEC to contact them directly under heavy use. Casual users get the project default; the author's email is never the default.
- Single User-Agent constant lives in `src/engines/userAgent.js` and is imported by every engine that hits SEC.

### Industry taxonomy refresh

- Snapshot lives in `industry-classification/` (35 KB tree + 2.8 MB assignments + crosswalks).
- Monthly refresh ritual: `npm run refresh:taxonomy` regenerates the JSON from the author's source-of-truth, author reviews diff, commits, opens PR.
- README documents the refresh cadence so users know `git pull` is the way to stay current.

### Alpha Vantage strategy

- Optional. Free tier (25 req/day) is sufficient for casual users.
- Only used as fallback for the ~8 S&P companies missing from the bundled `./transcripts/` corpus, plus newer quarters since the last refresh.
- Without a key, transcripts for those gaps are silently skipped; agents handle missing transcripts gracefully.
- Not a hard dependency. Documented in README as "rare-miss fallback."

---

## 4. Cross-platform safety

### Path handling

- All path construction uses `path.join` (Node) or `Path` / `os.path.join` (Python). Sweep for any string concatenation with `'/'` and replace.
- Home directory resolved once per language (Node: `os.homedir()`; Python: `Path.home()`) and re-used.

### Ticker filename / directory sanitization

Tickers appear as **directory names** under `~/thesis/reports/`, never as filenames (filenames are by function: `one-pager.pdf`, etc.). Surface is small.

Single helper used at every call site:

```js
function safeTickerDir(ticker) {
  const cleaned = ticker
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '_')   // strip anything weird
    .replace(/^\.+/, '_');            // never start with a dot

  // Defensively avoid Windows reserved names
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  return reserved.test(cleaned) ? `${cleaned}_` : cleaned;
}
```

Behavior:
- `BRK.B` → `BRK.B` (preserved; modern Windows handles dots fine)
- `RDS-A` → `RDS-A` (preserved)
- Hypothetical `BF/B` → `BF_B` (slash sanitized)
- Defensive against `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9` (no real US ticker matches, but free safety)

A Python equivalent lives in `scripts/pdf/` (or imported via a shared helper module).

### Python invocation differences

- macOS / Linux: `python3 scripts/pdf/generate_pitch_deck_pdf.py AAPL`
- Windows: `python scripts/pdf/generate_pitch_deck_pdf.py AAPL`

Skill SKILL.md files and any orchestration that shells out to Python detect the right command at startup. Either:
- Probe `python3` first, fall back to `python` if not found
- Use `npx cross-spawn` and let it figure out

### Line endings

`.gitattributes` at repo root:
```
* text=auto eol=lf
*.png binary
*.jpg binary
*.pdf binary
```

Protects the bundled `./transcripts/` corpus and JSON files from CRLF mangling on Windows clones.

### Required versions (documented in README)

- **Node:** 20 LTS or newer (top-level await, `node:fs/promises`)
- **Python:** 3.11 or newer (modern type hints, match statements)
- **Claude Code:** Pro tier minimum, Max recommended (Pitch Deck dispatches 10 subagents in parallel; Pro will throttle hard)

### E2E verification per platform

**Mac (author's daily driver):** smoke test post-changes — full `/analyze AAPL` run, verify PDFs render.

**Linux:** Docker `node:20-bookworm` container with Python 3.11 layered in, or a Lima VM. Mount the repo, run `/analyze AAPL`, verify outputs in `~/thesis/reports/AAPL/`.

**Windows (additive, post-ship):** Windows 11 on the author's reclaimed laptop. Fresh Node + Python install. Walk through the README quickstart literally. Anticipated bug surface: path separators, `python3` vs `python`, Unicode in agent prompts breaking Windows console, line endings in transcripts.

Per-platform verification checklist:
- [ ] `~/thesis/reports/AAPL/one-pager.pdf` opens cleanly
- [ ] `~/thesis/reports/AAPL/pitch-deck.pdf` opens (10-section content)
- [ ] `~/thesis/reports/AAPL/final-thesis.pdf` opens (7-section content)
- [ ] No personal email in any HTTP request (verify with `mitmproxy` or curl trace)
- [ ] No request to `api.thesis-investing.com` (verify by blocking it in `/etc/hosts`)

**Ship gate:** Mac + Linux pass = ship. Windows verification follows in a few days; bugs found there are filed as issues, not release blockers.

### Codex compatibility

Deferred to Phase 7 per STEPS.md. Phase 3 contributes one rule: agent prompts in `agents/` remain pure prompt content (no Claude-Code-specific syntax). Since Phase 3 doesn't change prompts, this is a guardrail against introducing new CC-specific syntax during the engine surgery.

---

## 5. README, privacy notice, and docs

### Privacy notice (canonical text)

This text is the source of truth, used in three places:

> ### What data leaves your computer
>
> Thesis runs entirely on your machine. When you run `/analyze TICKER`, the following network calls happen:
>
> - **SEC EDGAR** (`sec.gov`) — fetches public filings (10-K, 10-Q, DEF 14A, Form 4, Form 13F). The ticker you analyze is sent in the URL. Identifies as `Thesis CLI` via User-Agent. No personal data.
> - **Yahoo Finance** (`query1.finance.yahoo.com`) — fetches stock prices, analyst estimates, peer quotes. Anonymous; ticker in URL.
> - **Anthropic** (`api.anthropic.com`) — agent prompts and your data packet are sent to Claude through your Claude Code subscription. Subject to [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy). The ticker, financial data, and any context the agent reasons over passes through Anthropic's servers.
> - **Alpha Vantage** (`alphavantage.co`) — *only if you provided a key.* Used as a fallback for earnings transcripts not bundled in the repo. Your key is sent in the URL.
>
> **Thesis itself has no servers.** No telemetry, no analytics, no phone-home. The repo author cannot see what tickers you analyze.
>
> If you opt into the connected-mode website (Phase 4, future), reports you choose to push will go to your account on `thesis-investing.com`. That's opt-in per report.

### Three placements

| Surface | Form | Mechanics |
|---|---|---|
| `README.md` | Full notice | Section between Quickstart and Architecture |
| `docs/privacy.md` | Full notice + expansion (data retention, opt-out) | Linked from README |
| Generated PDFs | Short form on cover, full in appendix | Hardcoded in `scripts/pdf/*.py` templates |
| First-run CLI banner | Short form, dismiss-once | Stored as a flag in `~/thesis/config.json` |

### README structure (target ~150 lines)

```
# Thesis

[1-paragraph elevator pitch — what it is, who it's for]

[Disclaimer blockquote — Phase 0 locked text, STEPS.md Appendix A]

## Quickstart (60 seconds)
1. Clone this repo
2. npm install && pip install -r requirements.txt
3. Open Claude Code in this folder
4. /analyze AAPL
5. Open ~/thesis/reports/AAPL/

## Requirements
- Node 20+, Python 3.11+, Claude Code Pro (Max recommended)
- 5 GB disk for the repo (transcripts bundle is ~72 MB)

## What you get
[Sample PDF screenshots — One Pager, Pitch Deck, Final Thesis]

## Privacy
[Full canonical notice above; link to docs/privacy.md]

## Architecture
[Mermaid flowchart: /analyze → 3-stage pipeline → ~/thesis/reports/]

## Philosophy
[Buffett-flavored value investing; link to Thesis Score 4-pillar rubric]

## Optional: account sync (Phase 4)
[1 paragraph on connected mode; deferred feature]

## Contributing
[Link to CONTRIBUTING.md; agents/ PR guard]
```

### Other doc updates

- `docs/privacy.md` — full privacy notice + expansion (data retention notes, opt-out instructions)
- `CLAUDE.md` — update all path references to `~/thesis/`; strike all Cloudflare references from the standalone-mode story
- `STEPS.md` — close out every Phase 3 item (path migration, D1/R2 strip, taxonomy in-repo, compensation kept, cross-platform plan, privacy notice)
- `CONTRIBUTING.md` — note that `api/` no longer exists in this repo; future contributors won't see Worker source and shouldn't ask about it

---

## Out of scope (explicitly deferred)

- **Phase 4 connected mode** — `inject-report.mjs` repurposing, account auth flow, website button states, signup model. Phase 3 only ensures the boundary is clean for Phase 4 to bolt on later.
- **First-run config wizard (`npm run setup`)** — Phase 4 item per STEPS.md. Phase 3 ships with a documented manual edit of `~/thesis/config.json`; the wizard makes it nicer in Phase 4.
- **Codex compatibility** — Phase 7. Phase 3 only avoids regression (no new CC-specific syntax in agent prompts).
- **Telemetry** — Phase 6 decision. Phase 3 ships with zero telemetry.
- **Sample reports committed to repo** (LULU, AAPL, COST) — Phase 5 item.
- **More charts in PDFs** — Phase 5.

---

## Open questions resolved by this spec (closes STEPS.md items)

- **#6 Alpha Vantage strategy** — optional fallback for missing transcripts; documented in README.
- **#7 Compensation scraper fate** — keep as-is.
- **#8 Industry taxonomy refresh** — ship in-repo, refresh via PR (monthly).

Remaining STEPS.md open questions belong to Phase 4+ (account signup model, telemetry).

---

## Verification (definition-of-done for Phase 3)

1. **Path migration:** `~/thesis/{reports,cache,config.json}` works on macOS and Linux; visible in Finder/Files; THESIS_DIR override works.
2. **Backend cutoff:** Blocking `api.thesis-investing.com` in `/etc/hosts` does not affect any local pipeline run. No Worker URL reachable from CLI execution path.
3. **Worker repo split:** `api/` is in `.gitignore`, git no longer tracks it, files remain on author's Desktop with backup verified.
4. **Engine cleanup:** `nodeFinviz.js` deleted, dormant Layers 2/3 ripped out, personal email swept, generic User-Agent in place.
5. **Cross-platform code:** All paths via `path.join` / `Path`; ticker sanitization helper in use; `.gitattributes` set; Python invocation portable.
6. **Docs:** README rewritten to ~150 lines; privacy notice live in three placements; STEPS.md Phase 3 closed out; CLAUDE.md updated.
7. **Mac + Linux smoke test:** `/analyze AAPL` produces all three PDFs; manual review of one report passes.
8. **Windows smoke test:** runs after Phase 3 ships; bugs become tracked issues, not release blockers.
