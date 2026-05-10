# Phase 3 — Portability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the locked spec at [docs/specs/2026-05-10-phase-3-portability.md](../specs/2026-05-10-phase-3-portability.md): make the Thesis CLI runnable on Mac/Linux/Windows with zero connection to the author's Cloudflare backend, reports written to a visible `~/thesis/` home folder.

**Architecture:** The work is a coupled refactor across nine phases: path foundation first (everything else depends on knowing where state lives), then cache/reports split, then backend cutoff (strip D1/R2 calls), then api/ removal from public repo, then engine cleanup (nodeFinviz, dormant code, User-Agent), then cross-platform safety, then docs, then end-to-end verification on Mac + Linux. Windows verification is additive (post-ship). Each phase ends with a user-approval gate before commit (per CLAUDE.md: no commits without explicit user approval).

**Tech Stack:** Node 20+ (`src/engines/`, `src/components/`, `vite.config.js`), Python 3.11+ (`scripts/pdf/`), Vitest (`__tests__/`), Markdown (agent prompts, SKILL.md, docs).

**Constraints (CLAUDE.md):**
- **No commits without explicit user approval.** Phase boundaries are review checkpoints; the user runs `git add` + `git commit` themselves.
- **No GitHub push.** This work stays on local. The squash-and-push to public is a separate decision (Phase 6 launch readiness or post-Phase-3 closeout).
- **No re-introducing old branding** ("Rule One", "Phil Town", "R1", "Thes1s", "thes1sinvesting").
- **The `agents/` directory has an issue-only PR policy** — no changes to agent prompts in this plan unless explicitly noted.
- **User is not a programmer** — every step shows the literal command or code change.

**Out of scope (per spec):**
- Phase 4 connected mode (account auth, inject-report, signup model).
- First-run config wizard (`npm run setup`) — Phase 4.
- Codex compatibility (Phase 7) beyond not-regressing.
- Telemetry (Phase 6 decision).
- Sample reports committed to repo (Phase 5).
- Squash-and-push to public GitHub (separate user-initiated decision after this plan completes).

---

## File structure — every file touched

| File | Action | Phase |
|---|---|---|
| `src/utils/thesisDir.js` | **CREATE** — JS home/cache/reports resolver | 2 |
| `scripts/pdf/thesis_dir.py` | **CREATE** — Python home/cache/reports resolver | 2 |
| `src/engines/progressState.js` | Modify (line 9: swap THESIS_DIR to home-resolver) | 2, 3 |
| `scripts/pdf/report_data_reader.py` | Modify (line 50: swap base_dir/.thesis to home-resolver) | 2, 3 |
| `vite.config.js` | Audit + modify (any in-repo `.thesis` references) | 2 |
| `.claude/skills/analyze/SKILL.md` | Modify (lines 20-22: paths) | 2 |
| `.claude/skills/generate-one-pager/SKILL.md` | Modify (path strings throughout) | 2 |
| `.claude/skills/generate-pitch-deck/SKILL.md` | Modify (path strings throughout) | 2 |
| `.claude/skills/generate-final-thesis/SKILL.md` | Modify (path strings throughout) | 2 |
| `.gitignore` | Modify (line 28: drop `.thesis/`, add `api/` later) | 2, 5 |
| `CLAUDE.md` | Modify (path references) | 8 |
| `src/engines/transcripts.js` | Modify (lines 56-67: delete R2 fetch block) | 4 |
| `src/engines/gurus.js` | Modify (lines 580-590: delete fetchActivitiesFromD1; lines 593-601: simplify caller) | 4 |
| `src/engines/insiders.js` | Modify (lines 510-525: delete D1 attempt; remove mapD1Trade if orphaned) | 4 |
| `src/engines/peers.js` | Modify (lines 14-24: delete D1 attempt; lines 11: drop dataUrl import) | 4 |
| `src/engines/nodeAdapter.js` | Modify (line 66: delete `/data/` route; nodeFinviz reference at line 399) | 4, 6 |
| `src/engines/apiBase.js` | Modify (delete claudeBaseUrl, dataUrl, gate API_BASE for browser-only) | 4 |
| `src/engines/__tests__/nodeAdapter.test.js` | Modify (line 203: drop `/data/` assertion) | 4 |
| `api/` (entire directory) | `git rm -r --cached`; add to `.gitignore` | 5 |
| `src/engines/nodeFinviz.js` | Audit + decision (delete or keep with scope note) | 6 |
| `src/components/ValuationCalculators.jsx` | Audit (does it actively use Finviz?) | 6 |
| `src/engines/edgarFinancials.js` | Modify (lines 11-15: delete dormant Layer 2/3 imports) | 6 |
| `src/data/taxonomy-hierarchy.json` | **DELETE** (dormant Layer 2/3 data) | 6 |
| `src/data/sp500-tag-classifications.json` | **DELETE** (dormant Layer 2/3 data) | 6 |
| `scripts/inject-report.mjs` | Modify (lines 14, 46, 70: remove personal email defaults) | 6 |
| `src/engines/userAgent.js` | **CREATE** — single User-Agent constant | 6 |
| Engines that hit SEC | Modify (import userAgent, replace ad-hoc UA strings) | 6 |
| `src/utils/safeTickerDir.js` | **CREATE** — JS ticker sanitizer | 7 |
| `scripts/pdf/safe_ticker.py` | **CREATE** — Python ticker sanitizer | 7 |
| `.gitattributes` | **CREATE** — line endings | 7 |
| `docs/privacy.md` | **CREATE** — full privacy notice | 8 |
| `README.md` | Modify (full rewrite to ~150 lines) | 8 |
| `STEPS.md` | Modify (close out Phase 3 items) | 8 |
| `CONTRIBUTING.md` | Modify (note that api/ is no longer in repo) | 8 |

**Files explicitly NOT touched in Phase 3:**
- `agents/` — agent prompts unchanged (issue-only PR policy).
- `industry-classification/*.json` — bundled snapshot stays as-is; refresh ritual is documented but not run in this plan.
- `transcripts/` — already shipped in Phase 2B.
- `package.json`, `requirements.txt` — versions already adequate; only docs note required minimums.

---

## Phase 1 — Pre-flight and baseline

**Goal:** Confirm clean working tree, capture a passing baseline (tests + build), and verify the spec assumptions about current code state. This phase makes zero changes.

### Task 1.1: Verify clean working tree

**Files:** none (read-only)

- [ ] **Step 1: Confirm git working tree has no uncommitted unrelated changes**

Run:
```bash
git -C /Users/kylehoff/Desktop/Thesis status --short
```
Expected: empty output, OR only the spec + plan files just committed (`docs/specs/2026-05-10-phase-3-portability.md`, `docs/plans/2026-05-10-phase-3-portability-plan.md`). If anything else is modified, stop and ask the user before continuing.

- [ ] **Step 2: Confirm current branch**

Run:
```bash
git -C /Users/kylehoff/Desktop/Thesis branch --show-current
```
Expected: `main`. If anything else, stop and ask.

### Task 1.2: Capture baseline (tests + build)

**Files:** none (read-only)

- [ ] **Step 1: Run the test suite**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm test 2>&1 | tail -10
```
Expected: a green summary line ending in something like `Tests  N passed (N)` or `Test Files  M passed`. Per Phase 2B notes, baseline is ~1267 passing tests. **Record the exact passing count** — every later phase must match or improve this number.

- [ ] **Step 2: Run the production build**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm run build 2>&1 | tail -20
```
Expected: `built in Xs` with no errors. Any error here means the baseline is broken; stop and fix before continuing.

- [ ] **Step 3: Run the vocab linter**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && node scripts/lint-vocab.mjs 2>&1 | tail -5
```
Expected: exit code 0, no output or "0 violations." Confirms no R1 vocabulary regression risk during the refactor.

- [ ] **Step 4: Confirm baseline path assumptions**

Run:
```bash
grep -n "process.cwd" /Users/kylehoff/Desktop/Thesis/src/engines/progressState.js
```
Expected: line 9 contains `const THESIS_DIR = join(process.cwd(), '.thesis');`. Confirms this is the file to migrate first.

```bash
grep -n "'.thesis'" /Users/kylehoff/Desktop/Thesis/scripts/pdf/report_data_reader.py
```
Expected: line ~50 contains `self.report_dir = os.path.join(base_dir, '.thesis', 'reports', ticker)`. Confirms this is the central Python path resolution.

**STOP — checkpoint.** Report baseline numbers and confirmations to user before starting Phase 2.

---

## Phase 2 — Path foundation (~/thesis/ home resolver)

**Goal:** Move all state from `<repo>/.thesis/` to `~/thesis/`. Reports remain in a flat `reports/{TICKER}/` structure for now (cache/reports split happens in Phase 3). After this phase, `/analyze AAPL` writes to `/Users/{user}/thesis/reports/AAPL/` instead of `<repo>/.thesis/reports/AAPL/`.

**Why this order:** every later phase touches files that read/write state. Migrating the location first means later phases don't have to think about it.

### Task 2.1: Create the JS path resolver helper

**Files:**
- Create: `src/utils/thesisDir.js`

- [ ] **Step 1: Write the helper file**

Create `src/utils/thesisDir.js` with this content:

```javascript
// Single source of truth for ~/thesis/ paths.
// All engines, scripts, and tests resolve paths through this helper.
//
// Default: $HOME/thesis (visible folder, cross-platform).
// Override: set THESIS_DIR=/some/path to relocate (CI, alt drive, dev).

import os from 'node:os';
import path from 'node:path';

export function thesisHome() {
  return process.env.THESIS_DIR || path.join(os.homedir(), 'thesis');
}

export function reportsDir(ticker) {
  if (!ticker) return path.join(thesisHome(), 'reports');
  return path.join(thesisHome(), 'reports', ticker);
}

export function cacheDir(ticker) {
  if (!ticker) return path.join(thesisHome(), 'cache');
  return path.join(thesisHome(), 'cache', ticker);
}

export function configPath() {
  return path.join(thesisHome(), 'config.json');
}
```

- [ ] **Step 2: Write a unit test**

Create `src/utils/__tests__/thesisDir.test.js`:

```javascript
import { describe, it, expect, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { thesisHome, reportsDir, cacheDir, configPath } from '../thesisDir.js';

const ORIGINAL = process.env.THESIS_DIR;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.THESIS_DIR;
  else process.env.THESIS_DIR = ORIGINAL;
});

describe('thesisDir', () => {
  it('defaults to ~/thesis when THESIS_DIR unset', () => {
    delete process.env.THESIS_DIR;
    expect(thesisHome()).toBe(path.join(os.homedir(), 'thesis'));
  });

  it('honors THESIS_DIR override', () => {
    process.env.THESIS_DIR = '/tmp/custom-thesis';
    expect(thesisHome()).toBe('/tmp/custom-thesis');
  });

  it('reportsDir returns base when ticker omitted', () => {
    delete process.env.THESIS_DIR;
    expect(reportsDir()).toBe(path.join(os.homedir(), 'thesis', 'reports'));
  });

  it('reportsDir appends ticker', () => {
    delete process.env.THESIS_DIR;
    expect(reportsDir('AAPL')).toBe(path.join(os.homedir(), 'thesis', 'reports', 'AAPL'));
  });

  it('cacheDir returns base when ticker omitted', () => {
    delete process.env.THESIS_DIR;
    expect(cacheDir()).toBe(path.join(os.homedir(), 'thesis', 'cache'));
  });

  it('configPath returns ~/thesis/config.json', () => {
    delete process.env.THESIS_DIR;
    expect(configPath()).toBe(path.join(os.homedir(), 'thesis', 'config.json'));
  });
});
```

- [ ] **Step 3: Run the new tests**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/utils/__tests__/thesisDir.test.js
```
Expected: 6 tests pass. If any fail, fix before continuing.

### Task 2.2: Create the Python path resolver helper

**Files:**
- Create: `scripts/pdf/thesis_dir.py`

- [ ] **Step 1: Write the helper file**

Create `scripts/pdf/thesis_dir.py`:

```python
"""Single source of truth for ~/thesis/ paths in Python scripts.

Default: $HOME/thesis (visible folder, cross-platform).
Override: set THESIS_DIR=/some/path to relocate (CI, alt drive, dev).
"""

import os
from pathlib import Path


def thesis_home() -> Path:
    override = os.environ.get('THESIS_DIR')
    if override:
        return Path(override)
    return Path.home() / 'thesis'


def reports_dir(ticker: str | None = None) -> Path:
    base = thesis_home() / 'reports'
    return base / ticker if ticker else base


def cache_dir(ticker: str | None = None) -> Path:
    base = thesis_home() / 'cache'
    return base / ticker if ticker else base


def config_path() -> Path:
    return thesis_home() / 'config.json'
```

- [ ] **Step 2: Smoke test in Python**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && python3 -c "
import sys; sys.path.insert(0, 'scripts/pdf')
from thesis_dir import thesis_home, reports_dir, cache_dir, config_path
import os
print('home:', thesis_home())
print('reports/AAPL:', reports_dir('AAPL'))
print('cache:', cache_dir())
print('config:', config_path())
os.environ['THESIS_DIR'] = '/tmp/xx'
# reimport-style check by re-evaluating
from importlib import reload
import thesis_dir; reload(thesis_dir)
print('overridden home:', thesis_dir.thesis_home())
"
```
Expected: prints absolute paths under `$HOME/thesis/...`, then under `/tmp/xx/...` after override. No errors.

### Task 2.3: Migrate progressState.js to use the resolver

**Files:**
- Modify: `src/engines/progressState.js` (line 9)

- [ ] **Step 1: Replace the THESIS_DIR constant**

In `src/engines/progressState.js`, change lines 1–10 from:

```javascript
// Generation State Persistence
// Manages .thesis/reports/{TICKER}/progress.json for crash recovery and progress tracking
// Used by orchestrator to persist generation state across process restarts

import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { ProgressSchema, createInitialProgress } from '../schemas/progress.js';

const THESIS_DIR = join(process.cwd(), '.thesis');
const REPORTS_DIR = join(THESIS_DIR, 'reports');
```

To:

```javascript
// Generation State Persistence
// Manages ~/thesis/reports/{TICKER}/progress.json for crash recovery and progress tracking
// Used by orchestrator to persist generation state across process restarts

import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { ProgressSchema, createInitialProgress } from '../schemas/progress.js';
import { thesisHome, reportsDir } from '../utils/thesisDir.js';

const THESIS_DIR = thesisHome();
const REPORTS_DIR = reportsDir();
```

- [ ] **Step 2: Run the test suite to confirm no regression**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm test 2>&1 | tail -10
```
Expected: same passing test count as baseline (Task 1.2). If any progressState tests now fail because they expected `<repo>/.thesis/`, those tests need updating to use `thesisHome()` from the new helper.

- [ ] **Step 3: Inspect any failing tests**

If tests fail, run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/engines/__tests__/progressState 2>&1 | tail -40
```
Common failures: tests with hardcoded `.thesis` strings. Update those to import `thesisHome()` and use the resolved path. Re-run until green.

### Task 2.4: Migrate report_data_reader.py to use the resolver

**Files:**
- Modify: `scripts/pdf/report_data_reader.py` (lines 40–60)

- [ ] **Step 1: Update the path resolution block**

In `scripts/pdf/report_data_reader.py`, find lines 43–50 (the constructor's path setup) which currently looks like:

```python
        self.ticker = ticker
        self.stage = stage

        if base_dir is None:
            # Navigate from scripts/pdf/ up to project root
            base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')

        self.report_dir = os.path.join(base_dir, '.thesis', 'reports', ticker)
```

Replace with:

```python
        self.ticker = ticker
        self.stage = stage

        if base_dir is not None:
            # Caller-provided base_dir override (used by tests); legacy semantics
            self.report_dir = os.path.join(base_dir, '.thesis', 'reports', ticker)
        else:
            from thesis_dir import reports_dir
            self.report_dir = str(reports_dir(ticker))
```

- [ ] **Step 2: Smoke test that report_data_reader resolves to ~/thesis/**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && python3 -c "
import sys; sys.path.insert(0, 'scripts/pdf')
from report_data_reader import ReportData
# Should resolve to ~/thesis/reports/FAKE/ even though no data exists there
try:
    r = ReportData('FAKE', 'one-pager')
except FileNotFoundError as e:
    print('Expected FileNotFoundError, got it:', str(e)[:120])
except Exception as e:
    print('Resolved path:', e)
"
```
Expected: error message references `~/thesis/reports/FAKE/` or the equivalent absolute path. Confirms migration worked. Any reference to `.thesis/reports/FAKE/` means migration is incomplete.

### Task 2.5: Audit and update vite.config.js

**Files:**
- Modify: `vite.config.js` (any in-repo `.thesis` references)

- [ ] **Step 1: Find all `.thesis` references in vite.config**

Run:
```bash
grep -n "\.thesis" /Users/kylehoff/Desktop/Thesis/vite.config.js
```
Expected: zero or more lines. If any exist, each must be migrated.

- [ ] **Step 2: For each match, replace with the resolver**

For every match, change patterns like:
```javascript
const reportsDir = path.join(process.cwd(), '.thesis', 'reports');
```
To:
```javascript
import { reportsDir as thesisReportsDir } from './src/utils/thesisDir.js';
const reportsDir = thesisReportsDir();
```

(Adjust the import alias if `reportsDir` is already a local variable name.)

- [ ] **Step 3: Run the dev server briefly to confirm it boots**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && timeout 10 npm run dev 2>&1 | head -25
```
Expected: server reports `Local: http://localhost:5173/` (or similar) without throwing. The `timeout 10` kills it after 10 seconds — that's fine.

### Task 2.6: Update the four SKILL.md orchestration files

**Files:**
- Modify: `.claude/skills/analyze/SKILL.md`
- Modify: `.claude/skills/generate-one-pager/SKILL.md`
- Modify: `.claude/skills/generate-pitch-deck/SKILL.md`
- Modify: `.claude/skills/generate-final-thesis/SKILL.md`

- [ ] **Step 1: Find every `.thesis/` reference across the SKILL files**

Run:
```bash
grep -n "\.thesis/" /Users/kylehoff/Desktop/Thesis/.claude/skills/analyze/SKILL.md /Users/kylehoff/Desktop/Thesis/.claude/skills/generate-one-pager/SKILL.md /Users/kylehoff/Desktop/Thesis/.claude/skills/generate-pitch-deck/SKILL.md /Users/kylehoff/Desktop/Thesis/.claude/skills/generate-final-thesis/SKILL.md
```
Expected: a list of all current `.thesis/reports/{TICKER}/...` mentions. Capture the count.

- [ ] **Step 2: Replace `.thesis/reports/` with `~/thesis/reports/` in each SKILL.md**

For each of the four files, change every literal string `.thesis/reports/` to `~/thesis/reports/`. Note: these are instructions to subagents, so the tilde is interpreted as the user's home folder. Subagents using bash will expand `~` correctly.

For `.claude/skills/analyze/SKILL.md` specifically, also update the directory creation step. Lines 19–22 currently:
```markdown
- Create output directories:
    - `.thesis/reports/{TICKER}/`
    - `.thesis/reports/{TICKER}/sections/`
    - `.thesis/reports/{TICKER}/quality/`
```
Replace with:
```markdown
- Create output directories:
    - `~/thesis/reports/{TICKER}/`
    - `~/thesis/reports/{TICKER}/sections/`
    - `~/thesis/reports/{TICKER}/quality/`
```

- [ ] **Step 3: Verify zero `.thesis/` references remain**

Run:
```bash
grep -rn "\.thesis/" /Users/kylehoff/Desktop/Thesis/.claude/skills/
```
Expected: zero matches. If any remain, repeat Step 2 for those files.

### Task 2.7: Update .gitignore

**Files:**
- Modify: `.gitignore` (line 28)

- [ ] **Step 1: Remove the obsolete in-repo cache pattern**

In `.gitignore`, find and delete the two lines:
```gitignore
# Node adapter file cache (runtime, regenerated on demand)
.thesis/
```

Reason: the in-repo `.thesis/` cache is being abandoned. Pipeline state now lives in `~/thesis/`, which is outside the repo and doesn't need a gitignore entry.

(The `api/` addition to `.gitignore` happens in Phase 5, not here.)

### Task 2.8: Smoke test the path migration

**Files:** none (verification)

- [ ] **Step 1: Run the test suite**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm test 2>&1 | tail -10
```
Expected: same passing count as baseline. New `thesisDir` tests added (6 more); minus any tests that needed updating in Task 2.3. Net: baseline + 6 (or near).

- [ ] **Step 2: Run the build**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm run build 2>&1 | tail -10
```
Expected: clean build, no errors.

- [ ] **Step 3: Smoke test path resolution end-to-end**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && node -e "
import('./src/utils/thesisDir.js').then(m => {
  console.log('home:', m.thesisHome());
  console.log('reports/AAPL:', m.reportsDir('AAPL'));
  console.log('cache/AAPL:', m.cacheDir('AAPL'));
  console.log('config:', m.configPath());
});
"
```
Expected: prints `/Users/kylehoff/thesis/...` paths. Confirms the helper resolves correctly in the actual runtime.

**STOP — checkpoint.** Phase 2 done. Tests pass, build passes, paths resolve. User reviews, optionally commits.

---

## Phase 3 — Cache / reports split

**Goal:** Per the spec, split `~/thesis/` into `reports/` (final user-visible PDFs/DOCX/JSON) and `cache/` (intermediate scratch: `progress.json`, `dataPacket.json`, agent outputs, quality scores). After this phase, a user opening `~/thesis/reports/AAPL/` sees only the three PDF + DOCX + JSON pairs they care about, not the pipeline scratch.

**Sequencing note:** the spec is explicit about this split. If during implementation it proves more disruptive than expected (more than ~3 hours of refactoring or more than 5 unrelated test failures), the user may choose to defer the split and ship Phase 3 with everything still under `reports/`. Flag and ask before deferring.

### Task 3.1: Decide what is cache vs reports

**Files:** none (planning)

The split rule:

| Artifact | Goes to | Why |
|---|---|---|
| `progress.json` | `cache/{TICKER}/` | Pipeline scratch, recreated on every run |
| `dataPacket.json` | `cache/{TICKER}/` | Intermediate data shape, agent input |
| `sections/` | `cache/{TICKER}/sections/` | Per-section agent outputs, intermediate |
| `quality/` | `cache/{TICKER}/quality/` | Quality scores, intermediate |
| `one-pager.json` | `reports/{TICKER}/` | Polished output; PDF generator reads this |
| `pitch-deck.json` | `reports/{TICKER}/` | Polished output |
| `final-thesis.json` | `reports/{TICKER}/` | Polished output |
| `*.pdf`, `*.docx` | `reports/{TICKER}/` | Final user-visible |

PDF generators read `{stage}.json` from `reports/{TICKER}/` (already there) and write `{stage}.pdf` and `{stage}.docx` next to it.

- [ ] **Step 1: Print the split table for the implementer's reference, no code change**

(This task is documentation only — no implementation step.)

### Task 3.2: Update progressState.js to write progress.json to cache/

**Files:**
- Modify: `src/engines/progressState.js`

- [ ] **Step 1: Find every place `REPORTS_DIR` is used to construct paths for intermediate state**

Run:
```bash
grep -n "REPORTS_DIR\|progress.json\|dataPacket\|sections/\|quality/" /Users/kylehoff/Desktop/Thesis/src/engines/progressState.js
```
Expected: the file uses `REPORTS_DIR` to construct progress file paths. Capture the exact lines.

- [ ] **Step 2: Add cache-vs-reports splitting**

Modify the import block at the top of `progressState.js` to add `cacheDir`:

```javascript
import { thesisHome, reportsDir, cacheDir } from '../utils/thesisDir.js';

const THESIS_DIR = thesisHome();
const REPORTS_DIR = reportsDir();
const CACHE_DIR = cacheDir();
```

Then for every function that reads/writes `progress.json`, switch from a `REPORTS_DIR`-based path to a `CACHE_DIR`-based path. Example pattern:

Before:
```javascript
const progressPath = join(REPORTS_DIR, ticker, 'progress.json');
```
After:
```javascript
const progressPath = join(CACHE_DIR, ticker, 'progress.json');
```

The same swap applies to `dataPacket.json`, `sections/` directory, and `quality/` directory references inside this file.

The actual stage outputs (`one-pager.json`, etc.) stay under `REPORTS_DIR` — only the intermediate scratch moves.

- [ ] **Step 3: Ensure CACHE_DIR is created on first write**

Find the directory-creation pattern (likely `mkdirSync(..., { recursive: true })`) and confirm it now operates on `CACHE_DIR` paths. Add `mkdirSync(join(CACHE_DIR, ticker), { recursive: true })` calls before any `writeFileSync` to a cache path, mirroring whatever the existing pattern is for reports.

- [ ] **Step 4: Run progressState tests**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/engines/__tests__/progressState 2>&1 | tail -30
```
Expected: green. If tests assumed progress.json lives under `reports/`, update them to use `cacheDir()`.

### Task 3.3: Update SKILL.md orchestration cleanup commands

**Files:**
- Modify: `.claude/skills/generate-one-pager/SKILL.md`
- Modify: `.claude/skills/generate-pitch-deck/SKILL.md`
- Modify: `.claude/skills/generate-final-thesis/SKILL.md`
- Modify: `.claude/skills/analyze/SKILL.md`

- [ ] **Step 1: Find the cleanup / sections / quality references in each SKILL**

Run:
```bash
grep -n "sections/\|quality/\|progress\.json\|dataPacket" /Users/kylehoff/Desktop/Thesis/.claude/skills/*/SKILL.md
```
Capture all hits.

- [ ] **Step 2: Replace `~/thesis/reports/{TICKER}/sections/` with `~/thesis/cache/{TICKER}/sections/` in each SKILL**

Same swap for `quality/`, `progress.json`, `dataPacket.json` — these all become `~/thesis/cache/{TICKER}/...`.

The stage outputs (`one-pager.json`, `pitch-deck.json`, `final-thesis.json`) stay at `~/thesis/reports/{TICKER}/{stage}.json` — those are the final outputs the PDF generators consume.

For `.claude/skills/analyze/SKILL.md`, update the directory creation lines to:
```markdown
- Create output directories:
    - `~/thesis/reports/{TICKER}/`
    - `~/thesis/cache/{TICKER}/sections/`
    - `~/thesis/cache/{TICKER}/quality/`
```

- [ ] **Step 3: Verify split is consistent**

Run:
```bash
grep -rn "thesis/reports/.*/sections\|thesis/reports/.*/quality\|thesis/reports/.*/progress" /Users/kylehoff/Desktop/Thesis/.claude/skills/
```
Expected: zero matches. Any match means a path wasn't updated to use `cache/`.

### Task 3.4: Smoke test the split

**Files:** none

- [ ] **Step 1: Run tests + build**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -5
```
Expected: same passing count as Phase 2 end; clean build.

- [ ] **Step 2: Mock-run a partial pipeline to verify split**

Skip — actual pipeline runs happen in Phase 9 (final verification). For now, the unit tests + grep verification are enough.

**STOP — checkpoint.** Phase 3 done. User reviews, optionally commits.

---

## Phase 4 — Backend cutoff (D1 / R2 / Worker)

**Goal:** Strip every call to `api.thesis-investing.com` from the local pipeline. After this phase, blocking that hostname in `/etc/hosts` does not affect any local pipeline run.

### Task 4.1: Strip R2 fetch from transcripts.js

**Files:**
- Modify: `src/engines/transcripts.js` (lines ~56–67)

- [ ] **Step 1: Locate the R2 block**

Run:
```bash
grep -n "r2Url\|dataUrl\|/transcripts/" /Users/kylehoff/Desktop/Thesis/src/engines/transcripts.js | head -10
```
Confirms current line numbers.

- [ ] **Step 2: Delete the R2 try-block**

In `src/engines/transcripts.js`, find lines 56–67:

```javascript
  // Try R2 (cron-cached transcripts — free, instant)
  try {
    const r2Url = dataUrl(`/transcripts/${ticker.toUpperCase()}/${year}/Q${quarter}`);
    const r2Res = await fetch(r2Url);
    if (r2Res.ok) {
      const r2Data = await r2Res.json();
      if (r2Data.data?.text) {
        const result = { text: r2Data.data.text, meta: r2Data.data.meta || { source: 'r2', year, quarterNum: quarter } };
        cacheSet(cacheKey, result, 'transcript');
        return { found: true, text: result.text, meta: result.meta, fromCache: false, charCount: result.text.length };
      }
    }
  } catch { /* fall through to Alpha Vantage */ }
```

Delete this entire block (the `// Try R2` comment + the surrounding `try { ... } catch { ... }`). The flow becomes: cache → bundled (Node) → Alpha Vantage.

- [ ] **Step 3: Remove the dataUrl import if no longer used**

After the deletion, run:
```bash
grep -n "dataUrl" /Users/kylehoff/Desktop/Thesis/src/engines/transcripts.js
```
Expected: only the import statement (line 7). Delete `import { dataUrl } from './apiBase.js';` from line 7. Also update the file's docstring comment (lines 1–4) to remove the "tries R2" line.

- [ ] **Step 4: Run transcripts tests**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/engines/__tests__/transcripts 2>&1 | tail -20
```
Expected: green. If a test asserted R2 fetch behavior, delete the assertion (it's testing behavior we just removed).

### Task 4.2: Strip D1 fetch from gurus.js

**Files:**
- Modify: `src/engines/gurus.js` (lines 578–601)

- [ ] **Step 1: Delete fetchActivitiesFromD1**

In `src/engines/gurus.js`, lines 578–590, delete:

```javascript
// Fetch all guru activities from D1 (single API call).
// Returns activities array or null if D1 is empty/unavailable.
async function fetchActivitiesFromD1() {
  try {
    const res = await fetch(dataUrl('/gurus/all'));
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.activities || data.activities.length === 0) return null;
    return data.activities;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Simplify the caller**

In `src/engines/gurus.js`, lines 593–601, find:

```javascript
export async function fetchAllWithChanges(onProgress) {
  // Try D1 first (single HTTP call vs 200+ SEC EDGAR calls)
  const d1Activities = await fetchActivitiesFromD1();
  if (d1Activities && d1Activities.length > 0) {
    // Resolve tickers (D1 cron doesn't resolve CUSIP → ticker)
    for (const activity of d1Activities) {
      if (activity.holdings?.some(h => !h.ticker && h.cusip)) {
        activity.holdings = await resolveTickersForHoldings(activity.holdings);
      }
```

Replace the comment + `if` block. New version:

```javascript
export async function fetchAllWithChanges(onProgress) {
  // SEC EDGAR is the only path. (D1 supplement removed for OSS — see STEPS.md Phase 3.)
```

Then proceed to whatever the EDGAR fallback was — the existing flow continues from there. Read 30 lines down from the deletion to make sure the function still has a coherent body.

- [ ] **Step 3: Remove dataUrl import if orphaned**

Run:
```bash
grep -n "dataUrl" /Users/kylehoff/Desktop/Thesis/src/engines/gurus.js
```
If only the import remains, delete it. Otherwise leave (some other call may use it; will be cleaned up in 4.5).

- [ ] **Step 4: Run gurus tests**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/engines/__tests__/gurus 2>&1 | tail -20
```
Expected: green. Update any test asserting D1 path behavior.

### Task 4.3: Strip D1 fetch from insiders.js

**Files:**
- Modify: `src/engines/insiders.js` (lines 510–525, plus mapD1Trade if orphaned)

- [ ] **Step 1: Delete the D1 try-block**

In `src/engines/insiders.js`, lines 510–525, find:

```javascript
  // Try D1 first (single API call vs 20-50 SEC EDGAR XML fetches)
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(dataUrl(`/insiders/${ticker.toUpperCase()}?years=${yearsBack}`));
      if (res.ok) {
        const data = await res.json();
        if (data.trades && data.trades.length > 0) {
          const transactions = data.trades.map(mapD1Trade);
          const monthlyAggregates = aggregateMonthly(transactions);
          const summary = computeInsiderSummary(transactions);
          const clusterDates = detectClusters(transactions);
          for (const txn of transactions) {
            txn.isCluster = clusterDates.has(txn.transactionDate);
          }
          // ... whatever the rest of the if-block does
        }
      }
    } catch { /* fall through to EDGAR */ }
  }
```

Delete the entire `if (typeof window !== 'undefined') { try { ... } catch { ... } }` block. EDGAR fallback continues directly.

- [ ] **Step 2: Find and delete mapD1Trade if orphaned**

Run:
```bash
grep -n "mapD1Trade" /Users/kylehoff/Desktop/Thesis/src/engines/insiders.js
```
If only the function definition remains (no callers), delete the function. If something else still calls it, leave it.

- [ ] **Step 3: Remove dataUrl import if orphaned**

Run:
```bash
grep -n "dataUrl" /Users/kylehoff/Desktop/Thesis/src/engines/insiders.js
```
If only the import remains, delete it.

- [ ] **Step 4: Run insiders tests**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/engines/__tests__/insiders 2>&1 | tail -20
```
Expected: green. Update any test asserting D1 behavior.

### Task 4.4: Strip D1 fetch from peers.js

**Files:**
- Modify: `src/engines/peers.js` (lines 11–24)

- [ ] **Step 1: Delete the D1 try-block and dataUrl import**

In `src/engines/peers.js`, change lines 1–34 from:

```javascript
// ─── Peer Discovery Engine ─────────────────────────────────────────
// Discovers peer companies using the Thesis taxonomy.
// Instant in-memory lookup from prebuilt company assignments —
// no HTTP requests needed. Replaces the old SIC-based approach
// that required dozens of SEC requests per lookup.
//
// Returns arrays of { cik, name, ticker } for use in competitor comparison.

import { getCompaniesForTier } from './thesisClassification';
import { getTickerSearchIndex } from './edgar';
import { dataUrl } from './apiBase';

export async function fetchPeersByTier(tier, classification, ticker) {
  // Try D1 first (includes weekly-refreshed IPOs, reclassifications)
  if (ticker && typeof window !== 'undefined') {
    try {
      const res = await fetch(dataUrl(`/taxonomy/peers/${ticker.toUpperCase()}?tier=${tier}`));
      if (res.ok) {
        const data = await res.json();
        if (data.peers?.length > 0) {
          return data.peers.map(p => ({ cik: p.cik, name: p.name, ticker: p.ticker || null }));
        }
      }
    } catch { /* fall through to static JSON */ }
  }

  // Fallback: in-memory from static JSON (baked into build)
  if (!classification?.[tier]) return [];
  const companies = getCompaniesForTier(tier, classification[tier]);
  return companies.map(c => ({
    cik: c.cik,
    name: c.name,
    ticker: c.ticker || null,
  }));
}
```

To:

```javascript
// ─── Peer Discovery Engine ─────────────────────────────────────────
// Discovers peer companies using the Thesis taxonomy.
// Instant in-memory lookup from prebuilt company assignments —
// no HTTP requests needed.
//
// Returns arrays of { cik, name, ticker } for use in competitor comparison.

import { getCompaniesForTier } from './thesisClassification';
import { getTickerSearchIndex } from './edgar';

export async function fetchPeersByTier(tier, classification, ticker) {
  if (!classification?.[tier]) return [];
  const companies = getCompaniesForTier(tier, classification[tier]);
  return companies.map(c => ({
    cik: c.cik,
    name: c.name,
    ticker: c.ticker || null,
  }));
}
```

(The `ticker` parameter is now unused but kept for API stability — callers don't need updating.)

- [ ] **Step 2: Run peers tests**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/engines/__tests__/peers 2>&1 | tail -20
```
Expected: green. Update any test asserting D1 behavior.

### Task 4.5: Strip /data/ route from nodeAdapter.js + delete dataUrl from apiBase.js

**Files:**
- Modify: `src/engines/nodeAdapter.js` (line 66)
- Modify: `src/engines/apiBase.js`
- Modify: `src/engines/__tests__/nodeAdapter.test.js` (line 203)

- [ ] **Step 1: Delete the /data/ route**

In `src/engines/nodeAdapter.js`, find the PROXY_MAP block (around line 59–67):

```javascript
export const PROXY_MAP = {
  '/api/sec/': 'https://www.sec.gov/',
  '/api/edgar/': 'https://data.sec.gov/',
  '/api/efts/': 'https://efts.sec.gov/',
  '/api/yahoo/': 'https://query1.finance.yahoo.com/',
  '/api/finviz/': 'https://finviz.com/',
  '/api/alpha/': 'https://www.alphavantage.co/',
  '/data/': 'https://api.thesis-investing.com/data/',
};
```

Delete the `'/data/':` line. Final shape:

```javascript
export const PROXY_MAP = {
  '/api/sec/': 'https://www.sec.gov/',
  '/api/edgar/': 'https://data.sec.gov/',
  '/api/efts/': 'https://efts.sec.gov/',
  '/api/yahoo/': 'https://query1.finance.yahoo.com/',
  '/api/finviz/': 'https://finviz.com/',
  '/api/alpha/': 'https://www.alphavantage.co/',
};
```

(The `/api/finviz/` route is removed in Phase 6 alongside the nodeFinviz cleanup.)

- [ ] **Step 2: Update the nodeAdapter test**

In `src/engines/__tests__/nodeAdapter.test.js`, find line 203:

```javascript
expect(PROXY_MAP['/data/']).toBe('https://api.thesis-investing.com/data/');
```

Delete this assertion. If it's part of a larger test block, also update the surrounding `it(...)` description to drop "/data/" coverage.

- [ ] **Step 3: Delete dataUrl + claudeBaseUrl from apiBase.js**

In `src/engines/apiBase.js` (full file is 66 lines), delete the `dataUrl()` function and the `claudeBaseUrl()` function. Both are no longer needed.

Also gate the `API_BASE` constant. Currently:
```javascript
export const API_BASE = import.meta.env.DEV ? '' : 'https://api.thesis-investing.com';
```

Change to:
```javascript
// Browser-only: the React app reads this for connected-mode requests (Phase 4).
// CLI/Node code paths must not import API_BASE — backend is unreachable in CLI mode.
export const API_BASE = import.meta.env?.DEV ? '' : 'https://api.thesis-investing.com';
```

The `?.` makes it safe in Node contexts where `import.meta.env` is undefined.

- [ ] **Step 4: Confirm no engine imports apiBase functions directly**

Run:
```bash
grep -rn "from .*apiBase" /Users/kylehoff/Desktop/Thesis/src/engines/ --include="*.js"
```
Expected: zero matches in CLI engines (transcripts.js, gurus.js, insiders.js, peers.js — already cleaned). If any engine still imports from apiBase, audit whether it's CLI-path or browser-path. CLI-path imports must be removed.

- [ ] **Step 5: Run the full test suite**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm test 2>&1 | tail -10
```
Expected: green. Any failure here is a real cutoff regression — investigate and fix.

### Task 4.6: Verify the cutoff with /etc/hosts block

**Files:** none (verification)

- [ ] **Step 1: Block the hostname locally**

Run (requires sudo password):
```bash
sudo sh -c "echo '127.0.0.1 api.thesis-investing.com' >> /etc/hosts"
```

- [ ] **Step 2: Confirm DNS resolution is blackholed**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}" https://api.thesis-investing.com/data/test 2>&1 || echo "BLOCKED"
```
Expected: connection refused or timeout (output `000` or `BLOCKED`). Confirms blocking is in place.

- [ ] **Step 3: Run a CLI smoke test**

Run a partial pipeline. Open Claude Code in `/Users/kylehoff/Desktop/Thesis` and execute:
```
/generate-one-pager AAPL
```

Expected: completes without errors. Report lands in `~/thesis/reports/AAPL/one-pager.{json,pdf,docx}`. If any step fails with a network error pointing at api.thesis-investing.com, an engine call site was missed — investigate which engine triggered the call and audit it.

- [ ] **Step 4: Restore /etc/hosts**

Run (requires sudo):
```bash
sudo sed -i.bak '/api\.thesis-investing\.com/d' /etc/hosts
```

Confirms cutoff is hard. Run again to confirm `/etc/hosts` is back to original:
```bash
grep "thesis-investing" /etc/hosts || echo "CLEAN"
```
Expected: `CLEAN`.

**STOP — checkpoint.** Phase 4 done. Cutoff verified. User reviews, optionally commits.

---

## Phase 5 — Worker repo split (api/ removal from public)

**Goal:** Remove `api/` from git tracking so the eventual public push excludes the Worker source. Files remain on disk; only git tracking changes.

**Pre-condition:** Phase 4 backend cutoff is complete. No engine in `src/engines/` imports anything from `api/`. (Phase 4 verified this implicitly.)

### Task 5.1: Add api/ to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append api/ to .gitignore**

Add to `.gitignore` (anywhere; bottom is fine):

```gitignore
# Worker source — kept out of the public OSS repo.
# Lives on the author's local Desktop only. See docs/specs/2026-05-10-phase-3-portability.md.
api/
```

- [ ] **Step 2: Confirm .gitignore now matches api/**

Run:
```bash
git -C /Users/kylehoff/Desktop/Thesis check-ignore -v api/wrangler.toml
```
Expected: prints `.gitignore:N:api/  api/wrangler.toml` showing api/ is matched. Note: `.gitignore` only stops *new* changes from being tracked — existing tracking continues until the next step.

### Task 5.2: Untrack api/ in git

**Files:**
- Modify: git index (no file content changes)

- [ ] **Step 1: Untrack the entire api/ directory**

Run:
```bash
git -C /Users/kylehoff/Desktop/Thesis rm -r --cached api/
```

Expected: lists every file under api/ with `rm 'api/...'` prefix. The `--cached` flag means files stay on disk. Around 50–100 files affected.

- [ ] **Step 2: Verify files still exist on disk**

Run:
```bash
ls -la /Users/kylehoff/Desktop/Thesis/api/ | head -10
```
Expected: directory still listed with all its contents. The `--cached` removal does not delete files.

- [ ] **Step 3: Verify git no longer tracks api/**

Run:
```bash
git -C /Users/kylehoff/Desktop/Thesis ls-files api/ | head -5
```
Expected: empty output — api/ is no longer in the git index.

- [ ] **Step 4: Verify git status shows the deletions as staged**

Run:
```bash
git -C /Users/kylehoff/Desktop/Thesis status --short | head -10
```
Expected: many `D  api/...` lines (deletion staged). These will become a single commit.

### Task 5.3: Verify Worker still builds locally

**Files:** none (verification)

- [ ] **Step 1: Confirm wrangler still works**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis/api && ls package.json wrangler.toml 2>&1 | head -5
```
Expected: both files listed. Confirms api/ is intact on disk.

- [ ] **Step 2: Confirm Time Machine is running (or note backup)**

Tell the user: **Worker source is now single-copy on disk. Verify Time Machine is enabled (System Settings → General → Time Machine), or set up another backup mechanism, before continuing.** If Time Machine is on, take note of last backup time. If off, ask the user to enable it before committing.

**STOP — checkpoint.** Phase 5 done. api/ is untracked but on disk. User confirms backup, reviews, optionally commits.

---

## Phase 6 — Engine cleanup

**Goal:** Remove dead and personal-info code: the orphan `nodeFinviz.js`, the dormant Layer 2/3 in `edgarFinancials.js`, hardcoded personal email, and create the project-wide `userAgent.js` constant.

### Task 6.1: Audit nodeFinviz.js call sites

**Files:**
- Read: `src/engines/nodeFinviz.js`, callers

- [ ] **Step 1: Find all imports**

Run:
```bash
grep -rln "nodeFinviz\|node-finviz" /Users/kylehoff/Desktop/Thesis --include="*.js" --include="*.jsx" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=api
```
Expected output (per audit): `nodeAdapter.js`, `__tests__/nodeAdapter.test.js`, `ValuationCalculators.jsx`. (api/ is gitignored now so excluded.)

- [ ] **Step 2: Determine if ValuationCalculators.jsx actively uses Finviz**

Run:
```bash
grep -n "finviz\|Finviz" /Users/kylehoff/Desktop/Thesis/src/components/ValuationCalculators.jsx
```
Read the relevant lines (use `Read` on the file). Decide: is Finviz fetch wired into a live UI feature, or just an unused import?

- [ ] **Step 3: Branch based on usage**

**If ValuationCalculators.jsx actively uses Finviz**: stop and ask the user. The user said "Finviz is no longer part of the pipeline" — but a UI feature using it might need a separate decision. Do not auto-delete.

**If ValuationCalculators.jsx has only a stale import (no live usage)**: proceed to 6.2 (delete the file + clean imports).

### Task 6.2: Delete nodeFinviz.js + clean imports

**Files:**
- Delete: `src/engines/nodeFinviz.js`
- Modify: `src/engines/nodeAdapter.js` (line 399)
- Modify: `src/components/ValuationCalculators.jsx` (drop import if unused)
- Modify: `src/engines/__tests__/nodeAdapter.test.js` (drop Finviz route assertion)

- [ ] **Step 1: Delete the file**

Run:
```bash
rm /Users/kylehoff/Desktop/Thesis/src/engines/nodeFinviz.js
```

- [ ] **Step 2: Remove the nodeFinviz import + reference in nodeAdapter.js**

In `src/engines/nodeAdapter.js`, line 399 references nodeFinviz. Open the file at that line and:
- Delete the import statement at the top.
- Delete the line(s) that reference nodeFinviz (likely a global setup like `globalThis.__nodeFinvizFetch = ...`).
- Delete the `'/api/finviz/': 'https://finviz.com/',` entry in PROXY_MAP if still present.

- [ ] **Step 3: Drop unused import from ValuationCalculators.jsx**

If the audit at 6.1 confirmed dead import: open `src/components/ValuationCalculators.jsx`, find the `import` line for nodeFinviz, delete it. If any code referenced it (likely just a const that was never used), delete that too.

- [ ] **Step 4: Drop Finviz assertions from nodeAdapter.test.js**

In `src/engines/__tests__/nodeAdapter.test.js`, find any assertion like `expect(PROXY_MAP['/api/finviz/'])...` and delete. Update test descriptions if needed.

- [ ] **Step 5: Run tests + build**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm test 2>&1 | tail -10 && npm run build 2>&1 | tail -10
```
Expected: green tests, clean build. Any failure means a stale reference was missed.

### Task 6.3: Rip out dormant Layer 2/3 from edgarFinancials.js

**Files:**
- Modify: `src/engines/edgarFinancials.js` (lines 11–15)
- Delete: `src/data/taxonomy-hierarchy.json`
- Delete: `src/data/sp500-tag-classifications.json`

- [ ] **Step 1: Delete the dormant import comments**

In `src/engines/edgarFinancials.js`, lines 11–15:

```javascript
// Layer 2/3 disconnected — kept dormant, not deleted
// import { augmentTaxonomy } from './taxonomyResolver';
import { classifyIndustryType } from './industryClassifier';
import { getOverlay } from './industryOverlays';
// import { collectKnownTags, getLayer3Suggestions } from './companyAdapter';
```

Replace with:

```javascript
import { classifyIndustryType } from './industryClassifier';
import { getOverlay } from './industryOverlays';
```

(Two commented imports + the explanatory comment, all gone. Active imports preserved.)

- [ ] **Step 2: Confirm taxonomyResolver and companyAdapter are not imported anywhere else**

Run:
```bash
grep -rn "taxonomyResolver\|companyAdapter\|augmentTaxonomy\|getLayer3Suggestions" /Users/kylehoff/Desktop/Thesis/src/ --include="*.js" --include="*.jsx"
```
Expected: zero matches. If any match, audit before deleting the source files.

- [ ] **Step 3: Delete the dormant taxonomy files**

If src/engines/taxonomyResolver.js or src/engines/companyAdapter.js exist as orphans, delete them:

```bash
ls /Users/kylehoff/Desktop/Thesis/src/engines/taxonomyResolver.js /Users/kylehoff/Desktop/Thesis/src/engines/companyAdapter.js 2>&1
```
For any that exist, run:
```bash
rm /Users/kylehoff/Desktop/Thesis/src/engines/taxonomyResolver.js
rm /Users/kylehoff/Desktop/Thesis/src/engines/companyAdapter.js
```

- [ ] **Step 4: Delete unused JSON data**

Run:
```bash
rm /Users/kylehoff/Desktop/Thesis/src/data/taxonomy-hierarchy.json
rm /Users/kylehoff/Desktop/Thesis/src/data/sp500-tag-classifications.json
```

- [ ] **Step 5: Run tests + build**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm test 2>&1 | tail -10 && npm run build 2>&1 | tail -10
```
Expected: green. Any test or build failure points to a stale import; fix before continuing.

### Task 6.4: Personal email sweep

**Files:**
- Modify: `scripts/inject-report.mjs` (lines 14, 46, 70)

- [ ] **Step 1: Find every personal email occurrence**

Run:
```bash
grep -rn "kyleghoff707@gmail" /Users/kylehoff/Desktop/Thesis --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=api
```
Expected: 3 hits in `scripts/inject-report.mjs` (api/ is gitignored, so its hit doesn't count). Capture line numbers.

- [ ] **Step 2: Replace with a neutral placeholder**

In `scripts/inject-report.mjs`:

Line 14 (comment in usage docs):
```
//   --email,-e     Target user's email (the account to inject into). Default: kyleghoff707@gmail.com
```
Change to:
```
//   --email,-e     Target user's email (the account to inject into). Required for connected mode.
```

Line 46 (default value in args object):
```javascript
    email: 'kyleghoff707@gmail.com',
```
Change to:
```javascript
    email: process.env.THESIS_ACCOUNT_EMAIL || null,
```

Line 70 (default value setting):
```javascript
  if (!args.adminEmail) args.adminEmail = 'kyleghoff707@gmail.com';
```
Change to:
```javascript
  if (!args.adminEmail) args.adminEmail = process.env.THESIS_ADMIN_EMAIL || null;
```

Also, near where `args.email` is consumed, add a guard:

```javascript
if (!args.email) {
  console.error('Error: --email required, or set THESIS_ACCOUNT_EMAIL.');
  process.exit(1);
}
```

(Find the existing call site that uses `args.email`. Insert the guard before it.)

- [ ] **Step 3: Verify zero personal email remains in tracked files**

Run:
```bash
grep -rn "kyleghoff707@gmail" /Users/kylehoff/Desktop/Thesis --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=api
```
Expected: zero matches.

### Task 6.5: Create userAgent.js + propagate

**Files:**
- Create: `src/engines/userAgent.js`
- Modify: every engine that hits SEC

- [ ] **Step 1: Create the helper**

Create `src/engines/userAgent.js`:

```javascript
// Single User-Agent constant for SEC EDGAR + other identified-fetch APIs.
// SEC asks researchers to identify themselves so they can contact us if
// our traffic gets weird. We identify the project, not a person.
//
// Power users may override via ~/thesis/config.json { "userAgent": "..." }
// to surface their own contact info if they're running heavy queries.

import { configPath } from '../utils/thesisDir.js';
import { readFileSync, existsSync } from 'node:fs';

const DEFAULT_UA = 'Thesis CLI/0.1 (+https://github.com/kyleghoff707/thesis)';

let cached = null;

export function getUserAgent() {
  if (cached) return cached;
  try {
    const cp = configPath();
    if (existsSync(cp)) {
      const config = JSON.parse(readFileSync(cp, 'utf8'));
      if (config.userAgent && typeof config.userAgent === 'string') {
        cached = config.userAgent;
        return cached;
      }
    }
  } catch {
    // fall through to default
  }
  cached = DEFAULT_UA;
  return cached;
}
```

- [ ] **Step 2: Find existing User-Agent strings in engines**

Run:
```bash
grep -rn "User-Agent\|user-agent\|'Thesis\|\"Thesis" /Users/kylehoff/Desktop/Thesis/src/engines/ --include="*.js"
```
Capture every match. Each is a candidate for replacement.

- [ ] **Step 3: For each match, replace with `getUserAgent()`**

Pattern. Before:
```javascript
const headers = { 'User-Agent': 'Thesis/1.0 admin@example.com' };
```
After:
```javascript
import { getUserAgent } from './userAgent.js';
// ...
const headers = { 'User-Agent': getUserAgent() };
```

Add the import to each modified file. Run a per-file test to confirm:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/engines/__tests__/edgar 2>&1 | tail -10
```
Expected: green.

- [ ] **Step 4: Confirm no ad-hoc User-Agent strings remain**

Run:
```bash
grep -rn "'User-Agent':" /Users/kylehoff/Desktop/Thesis/src/engines/ --include="*.js" | grep -v "getUserAgent"
```
Expected: zero matches. Every User-Agent must come through getUserAgent().

- [ ] **Step 5: Run full test suite**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm test 2>&1 | tail -10
```
Expected: green.

**STOP — checkpoint.** Phase 6 done. User reviews, optionally commits.

---

## Phase 7 — Cross-platform safety

**Goal:** Ticker sanitization helper, line-ending guard, Python invocation portability. After this phase, the code is defensively safe for Windows even though Windows verification happens in Phase 9.

### Task 7.1: Create the JS ticker sanitizer

**Files:**
- Create: `src/utils/safeTickerDir.js`
- Create: `src/utils/__tests__/safeTickerDir.test.js`

- [ ] **Step 1: Write the helper**

Create `src/utils/safeTickerDir.js`:

```javascript
// Sanitize a ticker for use as a directory name across macOS, Linux, and Windows.
// Tickers are uppercased and stripped of anything other than [A-Z0-9._-].
// Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) are suffixed with _.
// Leading dots are replaced (Unix would treat the dir as hidden).

const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function safeTickerDir(ticker) {
  if (typeof ticker !== 'string' || !ticker.trim()) {
    throw new Error('safeTickerDir: ticker must be a non-empty string');
  }
  let cleaned = ticker
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '_')
    .replace(/^\.+/, '_');
  if (RESERVED.test(cleaned)) cleaned = `${cleaned}_`;
  return cleaned;
}
```

- [ ] **Step 2: Write the test**

Create `src/utils/__tests__/safeTickerDir.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { safeTickerDir } from '../safeTickerDir.js';

describe('safeTickerDir', () => {
  it('preserves a normal ticker', () => {
    expect(safeTickerDir('AAPL')).toBe('AAPL');
  });

  it('preserves dots and dashes', () => {
    expect(safeTickerDir('BRK.B')).toBe('BRK.B');
    expect(safeTickerDir('RDS-A')).toBe('RDS-A');
  });

  it('uppercases input', () => {
    expect(safeTickerDir('aapl')).toBe('AAPL');
  });

  it('replaces slashes with underscore', () => {
    expect(safeTickerDir('BF/B')).toBe('BF_B');
  });

  it('strips weird characters', () => {
    expect(safeTickerDir('AAPL#1')).toBe('AAPL_1');
  });

  it('replaces leading dots to avoid hidden dirs', () => {
    expect(safeTickerDir('.HIDDEN')).toBe('_HIDDEN');
  });

  it('appends underscore to Windows reserved names', () => {
    expect(safeTickerDir('CON')).toBe('CON_');
    expect(safeTickerDir('com1')).toBe('COM1_');
    expect(safeTickerDir('NUL')).toBe('NUL_');
  });

  it('throws on empty input', () => {
    expect(() => safeTickerDir('')).toThrow();
    expect(() => safeTickerDir('   ')).toThrow();
  });

  it('throws on non-string input', () => {
    expect(() => safeTickerDir(null)).toThrow();
    expect(() => safeTickerDir(undefined)).toThrow();
    expect(() => safeTickerDir(123)).toThrow();
  });
});
```

- [ ] **Step 3: Run the tests**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/utils/__tests__/safeTickerDir.test.js
```
Expected: 9 tests pass.

- [ ] **Step 4: Wire the sanitizer into thesisDir.js**

Modify `src/utils/thesisDir.js`. At the top, add:
```javascript
import { safeTickerDir } from './safeTickerDir.js';
```

Update `reportsDir` and `cacheDir` to sanitize:

Before:
```javascript
export function reportsDir(ticker) {
  if (!ticker) return path.join(thesisHome(), 'reports');
  return path.join(thesisHome(), 'reports', ticker);
}
```
After:
```javascript
export function reportsDir(ticker) {
  if (!ticker) return path.join(thesisHome(), 'reports');
  return path.join(thesisHome(), 'reports', safeTickerDir(ticker));
}
```

Same change to `cacheDir`. Run tests to confirm:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/utils/__tests__/thesisDir.test.js
```
Update existing assertions where needed (e.g. `reportsDir('aapl')` now returns `.../AAPL`, not `.../aapl`).

### Task 7.2: Create the Python ticker sanitizer

**Files:**
- Create: `scripts/pdf/safe_ticker.py`

- [ ] **Step 1: Write the Python helper**

Create `scripts/pdf/safe_ticker.py`:

```python
"""Cross-platform ticker -> directory name sanitizer.

Mirrors src/utils/safeTickerDir.js so JS and Python agree on directory layout.
"""

import re

RESERVED = re.compile(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$', re.IGNORECASE)


def safe_ticker_dir(ticker: str) -> str:
    if not isinstance(ticker, str) or not ticker.strip():
        raise ValueError('safe_ticker_dir: ticker must be a non-empty string')
    cleaned = ticker.upper()
    cleaned = re.sub(r'[^A-Z0-9._-]', '_', cleaned)
    cleaned = re.sub(r'^\.+', '_', cleaned)
    if RESERVED.match(cleaned):
        cleaned = cleaned + '_'
    return cleaned
```

- [ ] **Step 2: Wire into thesis_dir.py**

In `scripts/pdf/thesis_dir.py`, add an import and update `reports_dir` + `cache_dir`:

```python
from safe_ticker import safe_ticker_dir


def reports_dir(ticker: str | None = None) -> Path:
    base = thesis_home() / 'reports'
    return base / safe_ticker_dir(ticker) if ticker else base


def cache_dir(ticker: str | None = None) -> Path:
    base = thesis_home() / 'cache'
    return base / safe_ticker_dir(ticker) if ticker else base
```

- [ ] **Step 3: Smoke test**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && python3 -c "
import sys; sys.path.insert(0, 'scripts/pdf')
from safe_ticker import safe_ticker_dir
assert safe_ticker_dir('AAPL') == 'AAPL'
assert safe_ticker_dir('BRK.B') == 'BRK.B'
assert safe_ticker_dir('RDS-A') == 'RDS-A'
assert safe_ticker_dir('BF/B') == 'BF_B'
assert safe_ticker_dir('CON') == 'CON_'
assert safe_ticker_dir('aapl') == 'AAPL'
print('OK')
"
```
Expected: prints `OK`. Any AssertionError means the helper has a bug; fix before continuing.

### Task 7.3: Add .gitattributes

**Files:**
- Create: `.gitattributes`

- [ ] **Step 1: Write the file**

Create `/Users/kylehoff/Desktop/Thesis/.gitattributes`:

```gitattributes
# Cross-platform line endings: LF everywhere.
# Protects bundled transcripts and JSON data from CRLF mangling on Windows clones.
* text=auto eol=lf

# Binary files: never touch.
*.png binary
*.jpg binary
*.jpeg binary
*.pdf binary
*.docx binary
*.xlsx binary
*.zip binary
*.gz binary
```

### Task 7.4: Audit Python invocation in JS code

**Files:**
- Modify: any JS code that shells out to Python

- [ ] **Step 1: Find every spawn of python3**

Run:
```bash
grep -rn "python3\|spawn.*python\|exec.*python" /Users/kylehoff/Desktop/Thesis/src /Users/kylehoff/Desktop/Thesis/scripts --include="*.js" --include="*.mjs"
```
Capture all hits.

- [ ] **Step 2: For each hit, make python invocation portable**

Pattern. Before:
```javascript
const { spawn } = require('child_process');
const p = spawn('python3', ['scripts/pdf/generate_pitch_deck_pdf.py', ticker]);
```

After:
```javascript
const { spawn } = require('child_process');
const PYTHON = process.env.THESIS_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const p = spawn(PYTHON, ['scripts/pdf/generate_pitch_deck_pdf.py', ticker]);
```

Or, if there are many call sites, create `src/utils/pythonBin.js`:
```javascript
export const PYTHON_BIN = process.env.THESIS_PYTHON ||
  (process.platform === 'win32' ? 'python' : 'python3');
```

And import it where needed.

- [ ] **Step 3: Run the build to confirm no syntax errors**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm run build 2>&1 | tail -5
```
Expected: clean.

**STOP — checkpoint.** Phase 7 done. User reviews, optionally commits.

---

## Phase 8 — Documentation

**Goal:** Update READMEs, privacy notice, CLAUDE.md, STEPS.md, CONTRIBUTING.md to match the new state. After this phase, a first-time visitor to the repo can run the quickstart in 60 seconds.

### Task 8.1: Write the privacy notice

**Files:**
- Create: `docs/privacy.md`

- [ ] **Step 1: Write the canonical privacy doc**

Create `docs/privacy.md`:

```markdown
# Privacy

Thesis runs entirely on your machine. There are no Thesis servers, no telemetry, and no analytics. The repo author cannot see what tickers you analyze.

## What data leaves your computer

When you run `/analyze TICKER`, the following network calls happen:

- **SEC EDGAR** (`sec.gov`) — fetches public filings (10-K, 10-Q, DEF 14A, Form 4, Form 13F). The ticker you analyze is sent in the URL. Identifies as `Thesis CLI/0.1` via User-Agent. No personal data.
- **Yahoo Finance** (`query1.finance.yahoo.com`) — fetches stock prices, analyst estimates, peer quotes. Anonymous; ticker in URL.
- **Anthropic** (`api.anthropic.com`) — agent prompts and your data packet are sent to Claude through your Claude Code subscription. Subject to [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy). The ticker, financial data, and any context the agent reasons over passes through Anthropic's servers.
- **Alpha Vantage** (`alphavantage.co`) — *only if you provided a key.* Used as a fallback for earnings transcripts not bundled in the repo. Your key is sent in the URL.

## What data stays on your computer

- Reports: `~/thesis/reports/{TICKER}/`
- Pipeline scratch state: `~/thesis/cache/`
- Optional config (account email, AV key): `~/thesis/config.json`

## Optional: account sync (Phase 4, future)

If you opt into the connected-mode website at thesis-investing.com, reports you choose to push will go to your account there. That's opt-in per report. Until you push a report manually, your data never reaches our servers.

## Customizing your User-Agent

By default, Thesis identifies itself to SEC as `Thesis CLI/0.1 (+https://github.com/kyleghoff707/thesis)`. If SEC ever needs to contact someone about your traffic, they'll file a GitHub issue.

If you're running heavy queries and want SEC to contact you directly, set `userAgent` in `~/thesis/config.json`:

```json
{
  "userAgent": "MyResearch admin@example.com"
}
```

## Disclaimer

[Standard Thesis disclaimer — see README]
```

### Task 8.2: Rewrite README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

Run:
```bash
cat /Users/kylehoff/Desktop/Thesis/README.md | head -100
```

Capture what's there. The rewrite is a full replace.

- [ ] **Step 2: Replace with the new structure**

Replace `README.md` content with this skeleton (filling in any project-specific details from the existing file as you go):

```markdown
# Thesis

Open-source AI value investing research. Distributed as a free CLI: clone the repo, plug in your own Claude Code subscription, run `/analyze TICKER` to get One Pager, Pitch Deck, and Final Thesis reports as PDF, DOCX, and JSON in `~/thesis/reports/`.

> **Not investment advice.** Thesis is an AI-powered research tool for educational and informational purposes only. Reports are generated by large language models and may contain errors, hallucinations, outdated data, or misinterpretations of financial filings. Nothing produced by Thesis constitutes investment advice. Always conduct independent research and consult a qualified financial advisor before making investment decisions. See full disclaimer below.

## Quickstart (60 seconds)

```bash
git clone https://github.com/kyleghoff707/thesis.git
cd thesis
npm install
pip install -r requirements.txt
```

Open Claude Code in this folder, then:

```
/analyze AAPL
```

When the pipeline finishes, open `~/thesis/reports/AAPL/` to see your reports.

## Requirements

- **Node** 20 LTS or newer
- **Python** 3.11 or newer
- **Claude Code subscription** — Pro tier minimum, Max recommended (the Pitch Deck stage dispatches 10 subagents in parallel; Pro will throttle hard)
- **Disk** ~5 GB for the repo (the bundled earnings transcripts are ~72 MB)

Mac and Linux are tested. Windows works (file issues if not).

## What you get

Three reports per ticker, gated:

1. **One Pager** — quick screen, pass/fail.
2. **Pitch Deck** — 10-section research case (compounding, capital efficiency, capital allocation, resilience, valuation).
3. **Final Thesis** — conviction-level analysis with adversarial debate and a trade plan.

Each stage gates the next: you approve the prior verdict before the next runs.

[TODO: insert sample PDF screenshots once samples are committed]

## Privacy

[Full text of docs/privacy.md, condensed: 4-bullet list of network calls + "no servers, no telemetry"]

See [docs/privacy.md](docs/privacy.md) for details.

## Architecture

```
/analyze TICKER
    │
    ▼
One Pager (1 subagent) ──── PASS? ──┐
                                     ▼
Pitch Deck (10 subagents, 5 waves) ──── verdict?
                                     ▼
Final Thesis (7 subagents, with debate)
                                     ▼
                          ~/thesis/reports/{TICKER}/
                              one-pager.pdf
                              pitch-deck.pdf
                              final-thesis.pdf
```

## Philosophy

Buffett-flavored value investing. Public-domain methodology references: Buffett, Graham, Lynch, Munger. Scoring rubric is the 4-pillar Thesis Score (Compounding / Capital Efficiency / Capital Allocation / Resilience). See [docs/specs/2026-05-09-thesis-score-redesign.md](docs/specs/2026-05-09-thesis-score-redesign.md) for the full rubric.

## Optional: account sync (future)

Phase 4 will add connected mode: opt into an account at thesis-investing.com to push your reports to a friendlier reading UX. Until then, the website doesn't exist for CLI users.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Note: agent prompts in `agents/` follow an issue-only PR policy.

## License

MIT © 2026 Kyle Hoff. See [LICENSE](LICENSE).

## Disclaimer

[Full disclaimer text from STEPS.md Appendix A — copy verbatim]
```

- [ ] **Step 3: Verify length**

Run:
```bash
wc -l /Users/kylehoff/Desktop/Thesis/README.md
```
Expected: 100–200 lines. Trim or expand to hit ~150.

### Task 8.3: Update CLAUDE.md path references

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find all `.thesis` and Cloudflare references**

Run:
```bash
grep -n "\.thesis\|cloudflare\|api\.thesis-investing\|D1\|R2 " /Users/kylehoff/Desktop/Thesis/CLAUDE.md
```

- [ ] **Step 2: Update each match**

Path references: `~/.thesis/reports/` → `~/thesis/reports/` throughout.

Cloudflare references: STEPS.md is the authoritative architectural doc; CLAUDE.md should describe the **standalone** mode without leaning on Worker/D1/R2 vocabulary. If the existing CLAUDE.md has paragraphs explaining the Cloudflare backend as part of standard usage, rewrite them to:

> The CLI runs locally and contacts SEC EDGAR, Yahoo Finance, and Anthropic. Optional connected mode (Phase 4, future) will push reports to thesis-investing.com — that's not yet wired in this repo.

The `api/` folder is now gitignored — if CLAUDE.md mentioned it as part of the project structure, drop that mention.

### Task 8.4: Close out STEPS.md Phase 3

**Files:**
- Modify: `STEPS.md`

- [ ] **Step 1: Mark Phase 3 items complete**

In `STEPS.md`, find the Phase 3 section (around line 143). Update each unchecked item:

- `[ ] Audit every engine for D1/R2 dependency. Confirm direct-fetch fallbacks (most already exist).` → `[x] (closed by docs/specs/2026-05-10-phase-3-portability.md)`
- `[ ] **Cross-platform paths** — ...` → `[x] Migrated to ~/thesis/ via src/utils/thesisDir.js`
- `[ ] **Filename safety** — ...` → `[x] safeTickerDir.js + safe_ticker.py`
- `[ ] **Compensation scraper fate** — ...` → `[x] Kept as-is`
- `[ ] **Industry taxonomy refresh** — ...` → `[x] Bundled in-repo, refreshed via PR`
- `[ ] **Test on Mac, Windows, Linux**` → `[x] Mac + Linux verified pre-ship; Windows additive (post-ship)`
- `[ ] **Codex compatibility**` — leave as-is (deferred to Phase 7)
- `[ ] **Privacy notice** — ...` → `[x] docs/privacy.md + README + per-report banner`

- [ ] **Step 2: Update the open questions section**

In STEPS.md "Open questions" section (line ~232), mark resolved:

- `6. Alpha Vantage strategy (Phase 3)` → `6. ~~Alpha Vantage strategy~~ — resolved: optional fallback for missing transcripts. README documents.`
- `7. Compensation scraper fate (Phase 3)` → `7. ~~Compensation scraper fate~~ — resolved: keep as-is.`
- `8. Industry taxonomy refresh strategy (Phase 3)` → `8. ~~Industry taxonomy refresh strategy~~ — resolved: bundled snapshot, refreshed monthly via PR.`

- [ ] **Step 3: Add a Phase 3 closeout note**

After the existing Phase 3 section, add:

```markdown
### Phase 3 closeout (2026-05-10)

All Phase 3 items shipped. Spec: [docs/specs/2026-05-10-phase-3-portability.md](docs/specs/2026-05-10-phase-3-portability.md). Plan: [docs/plans/2026-05-10-phase-3-portability-plan.md](docs/plans/2026-05-10-phase-3-portability-plan.md).

Changes:
- `~/thesis/{reports,cache,config.json}` is the home folder layout (visible).
- D1/R2/Worker calls stripped from local engines; CLI hits only SEC, Yahoo, Anthropic, and (optional) Alpha Vantage.
- `api/` Worker source moved out of public repo (gitignored, on-disk only).
- nodeFinviz, dormant Layer 2/3, and personal email removed.
- Cross-platform safety helpers (ticker sanitizer, .gitattributes, Python invocation).
- README rewritten; privacy notice in docs/privacy.md.

Mac + Linux verified end-to-end. Windows verification additive — runs when the author's Windows machine is back.
```

### Task 8.5: Update CONTRIBUTING.md

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Add a note about api/**

Find the section listing PR policies. Add (after the agents/ issue-only policy):

```markdown
## Worker source (`api/`)

The Cloudflare Worker that powers the optional thesis-investing.com website is **not part of this repo**. It's maintained separately by the author. PRs to add or modify a Worker won't be accepted; if you need server functionality, propose it as an issue first.
```

**STOP — checkpoint.** Phase 8 done. Docs are aligned with the implementation. User reviews, optionally commits.

---

## Phase 9 — End-to-end verification

**Goal:** Confirm the full pipeline runs cleanly on Mac and Linux. Windows verification is additive (post-ship), tracked but not gating.

### Task 9.1: Mac smoke test

**Files:** none (verification)

- [ ] **Step 1: Clean state**

Remove any old `~/thesis/` from prior dev:
```bash
ls ~/thesis 2>/dev/null && echo "Existing ~/thesis found — review before deleting"
```
If output, ask the user before deleting. If empty, no cleanup needed.

- [ ] **Step 2: Run /analyze AAPL**

Open Claude Code in `/Users/kylehoff/Desktop/Thesis` and execute:
```
/analyze AAPL
```

Expected: pipeline runs through all three stages without errors. Pauses at gate checks.

- [ ] **Step 3: Verify outputs**

Run:
```bash
ls -la ~/thesis/reports/AAPL/
```
Expected output:
- `one-pager.json`, `one-pager.pdf`, `one-pager.docx`
- `pitch-deck.json`, `pitch-deck.pdf`, `pitch-deck.docx`
- `final-thesis.json`, `final-thesis.pdf`, `final-thesis.docx`

Run:
```bash
ls -la ~/thesis/cache/AAPL/
```
Expected: `progress.json`, `dataPacket.json`, `sections/`, `quality/` (intermediate state).

- [ ] **Step 4: Spot-check a PDF**

Open `~/thesis/reports/AAPL/final-thesis.pdf`. Confirm 7 sections render with content. No template artifacts, no missing data placeholders.

- [ ] **Step 5: Verify no api.thesis-investing.com calls were made**

Re-run the /etc/hosts blocking from Task 4.6:
```bash
sudo sh -c "echo '127.0.0.1 api.thesis-investing.com' >> /etc/hosts"
```

Re-run `/analyze AAPL` (a different ticker if you want — e.g. `MSFT`). Expected: same successful completion. Then unblock:
```bash
sudo sed -i.bak '/api\.thesis-investing\.com/d' /etc/hosts
```

### Task 9.2: Linux smoke test (Docker)

**Files:** none (verification)

- [ ] **Step 1: Build a Linux test container**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && cat > /tmp/Dockerfile.thesis-test <<'EOF'
FROM node:20-bookworm

RUN apt-get update && apt-get install -y python3 python3-pip git curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app
RUN npm install --no-audit --no-fund
RUN pip3 install -r requirements.txt --break-system-packages

CMD ["bash"]
EOF

docker build -f /tmp/Dockerfile.thesis-test -t thesis-test .
```
Expected: image builds cleanly. If pip or npm fails, debug before continuing.

- [ ] **Step 2: Run a non-pipeline smoke test inside the container**

Claude Code subagents can't run in Docker without auth — but path resolution and engine code can. Run:
```bash
docker run --rm -v ~/.thesis-docker:/root/thesis thesis-test bash -c '
  cd /app
  npm test 2>&1 | tail -10
  npm run build 2>&1 | tail -5
  node -e "import(\"./src/utils/thesisDir.js\").then(m => console.log(\"home:\", m.thesisHome()))"
'
```
Expected: tests pass, build clean, `home: /root/thesis`. Confirms the cross-platform paths resolve correctly inside Linux.

- [ ] **Step 3: (Optional) Full pipeline run on Linux**

If the user has Claude Code installed on a Linux box (or via WSL on a Linux machine they have access to), run `/analyze AAPL` there and confirm outputs. Otherwise, this step is skipped — the Docker smoke test + Mac end-to-end is the ship gate.

### Task 9.3: Windows smoke test (additive, post-ship)

**Files:** none (verification, deferred until user's Windows machine returns)

- [ ] **Step 1: When Windows machine is back, install requirements**

On Windows 11:
- Install Node.js LTS from nodejs.org
- Install Python 3.11+ from python.org (check "Add to PATH")
- Install Git for Windows
- Install Claude Code

- [ ] **Step 2: Clone the repo**

```powershell
git clone https://github.com/kyleghoff707/thesis.git
cd thesis
npm install
pip install -r requirements.txt
```

- [ ] **Step 3: Run /analyze AAPL**

Open Claude Code in the repo folder, run:
```
/analyze AAPL
```

- [ ] **Step 4: Verify outputs**

Open File Explorer to `C:\Users\{user}\thesis\reports\AAPL\`. Confirm:
- `one-pager.pdf`, `pitch-deck.pdf`, `final-thesis.pdf` all present
- All open without errors
- Content renders correctly

- [ ] **Step 5: File issues for any bugs**

Any failure becomes a GitHub issue. Don't block the public push — Windows is additive.

**STOP — checkpoint.** Phase 3 implementation complete. User reviews, optionally commits, optionally pushes.

---

## Self-review log

This section documents the self-review pass against the spec.

**Spec coverage check:**
- Spec section 1 (Home folder layout) → Phase 2.
- Spec section 2 (Backend cutoff) → Phase 4 + Phase 5.
- Spec section 3 (Engine audit + data sources) → Phase 6.
- Spec section 4 (Cross-platform safety) → Phase 7.
- Spec section 5 (README + privacy + docs) → Phase 8.
- Definition-of-done items 1-7 → Phase 9 verification.
- Definition-of-done item 8 (Windows smoke test) → Phase 9 Task 9.3 (additive).

**Placeholder scan:** the README rewrite has one inline `[TODO: insert sample PDF screenshots once samples are committed]` — that screenshot work is Phase 5 per STEPS.md, deliberately out of scope. Acceptable as a forward-looking marker.

**Type consistency:** `safeTickerDir` (JS camelCase) vs `safe_ticker_dir` (Python snake_case) is intentional language convention. `thesisHome` / `reportsDir` / `cacheDir` / `configPath` are consistent across both languages (camelCase in JS, snake_case in Python).

**Scope check:** Phase 3 covers a single coherent migration (portability). Each phase produces working software. Phase boundaries are commit-friendly user checkpoints.
