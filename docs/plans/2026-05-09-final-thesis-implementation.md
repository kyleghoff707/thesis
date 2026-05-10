# Final Thesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the locked spec at [docs/specs/2026-05-09-final-thesis-redesign.md](../specs/2026-05-09-final-thesis-redesign.md): rename Stage 3 from "Full Story" to "Final Thesis", drop the 15/15/13-point checklist artifact in favor of prose-with-verdict-box across §§1-4, add a Mauboussin-style reverse-DCF reality check in §5, add "What we're monitoring" watchpoints in §6 Compose, and add a brand-new §7 Trade Plan section.

**Architecture:** The work is one coupled feature redesign across six surfaces (12 agent prompts, SKILL.md orchestration, React UI component, PDF generator, DOCX generator, vite/quality config). The plan executes in six phases: mechanical renames first (no behavior change), then UI rewrite, then agent prompt rewrites, then SKILL.md orchestration, then PDF/DOCX template work, then end-to-end verification on a real ticker. Each phase ends with a user-approval gate before commit (per CLAUDE.md: no commits without explicit user approval).

**Tech Stack:** Markdown (agent prompts, SKILL.md), Vite + React (`src/components/`, `src/hooks/`), Vitest (`__tests__/`), Python (`scripts/pdf/*.py` for PDF and DOCX), Node.js scripts (`scripts/`).

**Constraints (CLAUDE.md):**
- **No commits without explicit user approval.** Commit commands appear in tasks but pause for approval.
- **No GitHub push.** This work stays on the local branch.
- **No re-introducing R1 vocabulary** ("Rule One", "Phil Town", "R1", "Thes1s", "Investment Story Form").
- **No scope creep into other Phase 2B pods** (Thesis Score, Valuation methods, Guru list).
- The `agents/` directory has an issue-only PR policy per CONTRIBUTING.md — verify any changes there before suggesting upstream.

**Out of scope (per spec):**
- Bond Comparison table (excluded by user).
- Replacing MOS / PBT / Ten Cap / Equity Bond methods (pod #2).
- Replacing R1's 6 moat types with Dorsey's 4 sources.
- Renaming "Bull Thesis" inside the debate.

---

## File structure — every file touched

| File | Action | Phase |
|---|---|---|
| `agents/risk-analyst-fullstory/` | `git mv` to `risk-analyst-finalthesis/` | 1 |
| `agents/risk-analyst-fullstory-event/` | `git mv` to `risk-analyst-finalthesis-event/` | 1 |
| `agents/risk-analyst-fullstory-bear/` | `git mv` to `risk-analyst-finalthesis-bear/` | 1 |
| `agents/business-analyst-fullstory/` | `git mv` to `business-analyst-finalthesis/` | 1 |
| `agents/competitor-evaluator-fullstory/` | `git mv` to `competitor-evaluator-finalthesis/` | 1 |
| `agents/management-evaluator-fullstory/` | `git mv` to `management-evaluator-finalthesis/` | 1 |
| `agents/valuation-specialist-fullstory/` | `git mv` to `valuation-specialist-finalthesis/` | 1 |
| `agents/synthesis-writer-fullstory/` | `git mv` to `synthesis-writer-finalthesis/` (deprecated combined-role; will be deleted in Phase 3) | 1 |
| `agents/synthesis-writer-fullstory-bull/` | `git mv` to `synthesis-writer-finalthesis-bull/` | 1 |
| `agents/synthesis-writer-fullstory-rebuttal/` | `git mv` to `synthesis-writer-finalthesis-rebuttal/` | 1 |
| `agents/synthesis-writer-fullstory-compose/` | `git mv` to `synthesis-writer-finalthesis-compose/` | 1 |
| `agents/financial-analyst-fullstory/` | `git mv` to `financial-analyst-finalthesis/` | 1 |
| `agents/trade-plan-finalthesis/prompt.md` | **CREATE** (new §7 agent) | 3 |
| `.claude/skills/generate-full-story/` | `git mv` to `generate-final-thesis/`; rewrite SKILL.md frontmatter `name:` and orchestration | 1, 4 |
| `scripts/pdf/generate_full_story_pdf.py` | `git mv` to `generate_final_thesis_pdf.py`; modify rendering | 1, 5 |
| `scripts/pdf/generate_full_story_docx.py` | `git mv` to `generate_final_thesis_docx.py`; modify rendering | 1, 5 |
| `scripts/pdf/section_renderers.py` | Modify (drop `checklist_items`, add `verdict_box`, add `trade_plan`, add `reverse_dcf_lead`, add `watchpoints`) | 5 |
| `scripts/run-quality-v4.js` | Modify lines 42, 78 (`full-story.json` → `final-thesis.json`) | 1 |
| `src/components/FullStory.jsx` | `git mv` to `FinalThesis.jsx`; rewrite SECTION_DEFS, KEY_ALIASES, render branches; remove ChecklistRenderer; add VerdictBox + TradePlanRenderer; promote PromiseTracker | 1, 2 |
| `src/hooks/useFullStory.js` | `git mv` to `useFinalThesis.js`; update API URL strings inside | 1 |
| `src/components/__tests__/fullStory.test.js` | `git mv` to `finalThesis.test.js`; update `EXPECTED_KEYS` | 1, 2 |
| `vite.config.js` | Modify lines 480-481, 520-522, 590-591 (rename `full-story` → `final-thesis` in fileType maps) | 1 |
| Any consumer of `FullStory.jsx` / `useFullStory` (likely `src/App.jsx` or a router) | Update imports | 1 |
| `STEPS.md` | Mark spec implementation complete (after Phase 6) | 6 |

**Files NOT touched:**
- `src/schemas/reportSection.js` — `key` is `z.string()`, no enum changes needed.
- `src/components/PitchDeck.jsx` — not in scope (Pitch Deck is unaffected).
- `src/schemas/__tests__/reportSection.test.js` — generic, no key-specific assertions.
- `package.json` scripts — no `full-story` references.
- `api/` worker — confirmed no `full-story` references in dev-only routes.

---

## Phase 1 — Mass mechanical rename

**Goal:** Rename every "full-story" / "fullstory" / "FullStory" surface to "final-thesis" / "finalthesis" / "FinalThesis" without changing any behavior. After this phase the codebase compiles, tests pass, and a `/generate-full-story` invocation no longer exists — but a `/generate-final-thesis` invocation produces output identical to the old `/generate-full-story` because no prompt or template content has changed yet.

**Why first:** Decouples the noisy rename diff from the substantive changes that follow. Reviewers can audit Phase 1 as a pure mv-and-string-replace pass, then audit later phases as content changes against stable paths.

### Task 1.1: Pre-flight verification

**Files:** none (read-only checks)

- [ ] **Step 1: Confirm git working tree is clean of unrelated changes**

Run:
```bash
git -C /Users/kylehoff/Desktop/Thesis status --short
```
Expected: only the brainstorm-pod artifacts from this morning (`docs/plans/2026-05-09-final-thesis-implementation.md`, `docs/specs/2026-05-09-final-thesis-redesign.md`, `STEPS.md`). If anything else is modified, stop and ask the user before continuing.

- [ ] **Step 2: Confirm we're on `main`**

Run:
```bash
git -C /Users/kylehoff/Desktop/Thesis branch --show-current
```
Expected: `main`. If not, stop and ask.

- [ ] **Step 3: Confirm baseline tests pass**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm test -- --run
```
Expected: all tests pass. If not, stop — do not start Phase 1 against a broken baseline.

### Task 1.2: Rename 12 agent folders

**Files:**
- Rename: `agents/risk-analyst-fullstory/` → `agents/risk-analyst-finalthesis/`
- Rename: `agents/risk-analyst-fullstory-event/` → `agents/risk-analyst-finalthesis-event/`
- Rename: `agents/risk-analyst-fullstory-bear/` → `agents/risk-analyst-finalthesis-bear/`
- Rename: `agents/business-analyst-fullstory/` → `agents/business-analyst-finalthesis/`
- Rename: `agents/competitor-evaluator-fullstory/` → `agents/competitor-evaluator-finalthesis/`
- Rename: `agents/management-evaluator-fullstory/` → `agents/management-evaluator-finalthesis/`
- Rename: `agents/valuation-specialist-fullstory/` → `agents/valuation-specialist-finalthesis/`
- Rename: `agents/synthesis-writer-fullstory/` → `agents/synthesis-writer-finalthesis/`
- Rename: `agents/synthesis-writer-fullstory-bull/` → `agents/synthesis-writer-finalthesis-bull/`
- Rename: `agents/synthesis-writer-fullstory-rebuttal/` → `agents/synthesis-writer-finalthesis-rebuttal/`
- Rename: `agents/synthesis-writer-fullstory-compose/` → `agents/synthesis-writer-finalthesis-compose/`
- Rename: `agents/financial-analyst-fullstory/` → `agents/financial-analyst-finalthesis/`

- [ ] **Step 1: Run all 12 git mv commands**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis
git mv agents/risk-analyst-fullstory agents/risk-analyst-finalthesis
git mv agents/risk-analyst-fullstory-event agents/risk-analyst-finalthesis-event
git mv agents/risk-analyst-fullstory-bear agents/risk-analyst-finalthesis-bear
git mv agents/business-analyst-fullstory agents/business-analyst-finalthesis
git mv agents/competitor-evaluator-fullstory agents/competitor-evaluator-finalthesis
git mv agents/management-evaluator-fullstory agents/management-evaluator-finalthesis
git mv agents/valuation-specialist-fullstory agents/valuation-specialist-finalthesis
git mv agents/synthesis-writer-fullstory agents/synthesis-writer-finalthesis
git mv agents/synthesis-writer-fullstory-bull agents/synthesis-writer-finalthesis-bull
git mv agents/synthesis-writer-fullstory-rebuttal agents/synthesis-writer-finalthesis-rebuttal
git mv agents/synthesis-writer-fullstory-compose agents/synthesis-writer-finalthesis-compose
git mv agents/financial-analyst-fullstory agents/financial-analyst-finalthesis
```

- [ ] **Step 2: Verify**

Run:
```bash
ls /Users/kylehoff/Desktop/Thesis/agents/ | grep -E "fullstory|finalthesis"
```
Expected: 12 lines, all matching `*-finalthesis*`, none matching `*-fullstory*`.

### Task 1.3: Rename skill folder and update SKILL frontmatter

**Files:**
- Rename: `.claude/skills/generate-full-story/` → `.claude/skills/generate-final-thesis/`
- Modify: `.claude/skills/generate-final-thesis/SKILL.md` (frontmatter `name:` field only; orchestration content rewrite happens in Phase 4)

- [ ] **Step 1: Rename the skill folder**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis
git mv .claude/skills/generate-full-story .claude/skills/generate-final-thesis
```

- [ ] **Step 2: Update the SKILL.md frontmatter `name:` field**

Edit `/Users/kylehoff/Desktop/Thesis/.claude/skills/generate-final-thesis/SKILL.md`:

Replace:
```yaml
---
name: generate-full-story
description: Generate a 6-section value investing Full Story (Stage 3) using v2 agent prompts, Claude Code subagent orchestration, adversarial debate, and Pitch Deck inheritance
argument-hint: TICKER
disable-model-invocation: true
---

# Generate Full Story (v2)
```

With:
```yaml
---
name: generate-final-thesis
description: Generate a 7-section value investing Final Thesis (Stage 3) using v2 agent prompts, Claude Code subagent orchestration, adversarial debate, and Pitch Deck inheritance
argument-hint: TICKER
disable-model-invocation: true
---

# Generate Final Thesis (v2)
```

- [ ] **Step 3: Verify**

Run:
```bash
head -10 /Users/kylehoff/Desktop/Thesis/.claude/skills/generate-final-thesis/SKILL.md
```
Expected: frontmatter shows `name: generate-final-thesis` and the H1 reads `# Generate Final Thesis (v2)`. (Other content in SKILL.md still references `full-story` paths and old keys — those get rewritten in Phase 4.)

### Task 1.4: Rename PDF and DOCX scripts

**Files:**
- Rename: `scripts/pdf/generate_full_story_pdf.py` → `scripts/pdf/generate_final_thesis_pdf.py`
- Rename: `scripts/pdf/generate_full_story_docx.py` → `scripts/pdf/generate_final_thesis_docx.py`

- [ ] **Step 1: Run git mv**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis
git mv scripts/pdf/generate_full_story_pdf.py scripts/pdf/generate_final_thesis_pdf.py
git mv scripts/pdf/generate_full_story_docx.py scripts/pdf/generate_final_thesis_docx.py
```

- [ ] **Step 2: Verify**

Run:
```bash
ls /Users/kylehoff/Desktop/Thesis/scripts/pdf/ | grep -E "full_story|final_thesis"
```
Expected: 2 lines, both `generate_final_thesis_*.py`, no `generate_full_story_*.py`.

### Task 1.5: Rename FullStory React component and hook

**Files:**
- Rename: `src/components/FullStory.jsx` → `src/components/FinalThesis.jsx`
- Rename: `src/hooks/useFullStory.js` → `src/hooks/useFinalThesis.js`
- Rename: `src/components/__tests__/fullStory.test.js` → `src/components/__tests__/finalThesis.test.js`

- [ ] **Step 1: Run git mv**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis
git mv src/components/FullStory.jsx src/components/FinalThesis.jsx
git mv src/hooks/useFullStory.js src/hooks/useFinalThesis.js
git mv src/components/__tests__/fullStory.test.js src/components/__tests__/finalThesis.test.js
```

- [ ] **Step 2: Update internal `useFullStory` exported name in the hook file**

Edit `/Users/kylehoff/Desktop/Thesis/src/hooks/useFinalThesis.js`. Find the export line (likely near top or bottom) and change every occurrence of the symbol `useFullStory` to `useFinalThesis`. Use a single grep to confirm:

```bash
grep -n "useFullStory" /Users/kylehoff/Desktop/Thesis/src/hooks/useFinalThesis.js
```
Expected after edit: 0 matches.

- [ ] **Step 3: Update component imports inside FinalThesis.jsx**

Edit `/Users/kylehoff/Desktop/Thesis/src/components/FinalThesis.jsx`. Find every `useFullStory` symbol (import, call, JSX) and replace with `useFinalThesis`. Find every `FullStory` component identifier (function/component name, default export) and replace with `FinalThesis`. Verify:

```bash
grep -nE "useFullStory|FullStory" /Users/kylehoff/Desktop/Thesis/src/components/FinalThesis.jsx
```
Expected after edit: 0 matches.

- [ ] **Step 4: Update test file imports**

Edit `/Users/kylehoff/Desktop/Thesis/src/components/__tests__/finalThesis.test.js`. Replace every `FullStory` and `useFullStory` reference. Verify:

```bash
grep -nE "useFullStory|FullStory" /Users/kylehoff/Desktop/Thesis/src/components/__tests__/finalThesis.test.js
```
Expected after edit: 0 matches.

- [ ] **Step 5: Find and update consumer imports**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && grep -rln "FullStory\|useFullStory" src/ --include="*.jsx" --include="*.js"
```
Expected: any files printed are consumers (likely `src/App.jsx` or a router file). For each file printed, edit it: replace `import FullStory from '...'` with `import FinalThesis from '...'`, replace `<FullStory ... />` with `<FinalThesis ... />`, replace `useFullStory` calls with `useFinalThesis`. After edits, re-run the grep — expected: 0 matches.

### Task 1.6: Update vite.config.js references

**Files:**
- Modify: `vite.config.js` lines 480-481, 520-522, 590-591

- [ ] **Step 1: Update fileType existence-check (around line 480)**

Edit `/Users/kylehoff/Desktop/Thesis/vite.config.js`. Find:
```javascript
fullStory: fs.existsSync(path.join(dir, 'full-story-api.json')),
```

Replace with:
```javascript
finalThesis: fs.existsSync(path.join(dir, 'final-thesis-api.json')),
```

- [ ] **Step 2: Update export-script map (around lines 520-522)**

Find:
```javascript
'full-story': { pdf: 'generate_full_story_pdf.py', docx: 'generate_full_story_docx.py' },
```

Replace with:
```javascript
'final-thesis': { pdf: 'generate_final_thesis_pdf.py', docx: 'generate_final_thesis_docx.py' },
```

- [ ] **Step 3: Update fileMap (around lines 590-591)**

Find:
```javascript
'full-story': 'full-story-api.json',
'full-story-quality': 'quality/full-story-v4.quality.json',
```

Replace with:
```javascript
'final-thesis': 'final-thesis-api.json',
'final-thesis-quality': 'quality/final-thesis-v4.quality.json',
```

- [ ] **Step 4: Verify no remaining `full-story` strings in vite.config.js**

Run:
```bash
grep -n "full-story\|fullStory\|full_story" /Users/kylehoff/Desktop/Thesis/vite.config.js
```
Expected: 0 matches.

- [ ] **Step 5: Update API URL strings inside the renamed hook**

Edit `/Users/kylehoff/Desktop/Thesis/src/hooks/useFinalThesis.js`. Find the fetch URLs that include `full-story` (per the explorer report: `/api/thesis/reports/{ticker}/full-story` and `/api/thesis/reports/{ticker}/full-story-quality`). Replace with `/api/thesis/reports/{ticker}/final-thesis` and `/api/thesis/reports/{ticker}/final-thesis-quality` respectively. Verify:

```bash
grep -n "full-story\|full_story\|fullStory" /Users/kylehoff/Desktop/Thesis/src/hooks/useFinalThesis.js
```
Expected: 0 matches.

### Task 1.7: Update scripts/run-quality-v4.js

**Files:**
- Modify: `scripts/run-quality-v4.js` lines 42 and 78

- [ ] **Step 1: Read the file to confirm exact strings**

```bash
sed -n '40,80p' /Users/kylehoff/Desktop/Thesis/scripts/run-quality-v4.js
```

- [ ] **Step 2: Replace `full-story.json` with `final-thesis.json`**

Use Edit with `replace_all: true` on the file `/Users/kylehoff/Desktop/Thesis/scripts/run-quality-v4.js`:
- Old: `full-story.json`
- New: `final-thesis.json`

If there are also references to `full-story-v4.quality.json` or `full-story-api.json`, replace those:
- `full-story-v4.quality.json` → `final-thesis-v4.quality.json`
- `full-story-api.json` → `final-thesis-api.json`

- [ ] **Step 3: Verify**

```bash
grep -n "full-story\|full_story" /Users/kylehoff/Desktop/Thesis/scripts/run-quality-v4.js
```
Expected: 0 matches.

### Task 1.8: Update output filenames in PDF and DOCX scripts

**Files:**
- Modify: `scripts/pdf/generate_final_thesis_pdf.py` line ~488
- Modify: `scripts/pdf/generate_final_thesis_docx.py` line ~386

- [ ] **Step 1: Update PDF output filename**

Edit `/Users/kylehoff/Desktop/Thesis/scripts/pdf/generate_final_thesis_pdf.py`. Find the line near the bottom that produces `'full-story.pdf'` (around line 488). Replace `full-story.pdf` with `final-thesis.pdf`.

- [ ] **Step 2: Update DOCX output filename**

Edit `/Users/kylehoff/Desktop/Thesis/scripts/pdf/generate_final_thesis_docx.py`. Find the line near the bottom that produces `'full-story.docx'` (around line 386). Replace `full-story.docx` with `final-thesis.docx`.

- [ ] **Step 3: Verify no remaining `full-story` strings in either script**

```bash
grep -n "full-story\|full_story" /Users/kylehoff/Desktop/Thesis/scripts/pdf/generate_final_thesis_pdf.py /Users/kylehoff/Desktop/Thesis/scripts/pdf/generate_final_thesis_docx.py
```
Expected: 0 matches.

### Task 1.9: Sweep for any missed references

- [ ] **Step 1: Repo-wide grep for surviving `full-story` and friends**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis
grep -rln -E "full-story|fullStory|full_story|FullStory" \
  --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" \
  --include="*.py" --include="*.json" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs --exclude-dir=.thesis
```

- [ ] **Step 2: Audit each match**

For each file printed:
- Files in `agents/*/prompt.md` — leave for Phase 3 (those prompts get full rewrites).
- Files in `.claude/skills/generate-final-thesis/SKILL.md` — leave for Phase 4 (orchestration rewrite).
- `STEPS.md`, this plan, the spec — keep references (historical / pointer text).
- Any other file — fix immediately. Use the same naming map: `full-story` → `final-thesis`, `fullStory` → `finalThesis`, `full_story` → `final_thesis`, `FullStory` → `FinalThesis`. Re-run the grep until the only remaining matches are the expected ones above.

### Task 1.10: Verify build still works

- [ ] **Step 1: Run vite build**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm run build
```
Expected: build succeeds. If it fails with an import error, the failing import points to a file that wasn't updated in Task 1.5 or Task 1.9. Fix the import, re-run.

- [ ] **Step 2: Run vitest**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm test -- --run
```
Expected: tests pass. The `__tests__/finalThesis.test.js` file may fail at this point because it still has `EXPECTED_KEYS` with old keys (`event_analysis`, `meaning_checklist`, etc.) — that's fine; it'll be updated in Phase 2. If it fails, note the failure and proceed; if any OTHER test fails, that's a Phase 1 regression — fix it.

- [ ] **Step 3: Sanity-check the dev server boots**

Run in background:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm run dev
```
Wait ~5 seconds, then check `http://localhost:5173` returns HTTP 200 (or whatever the configured port is). Kill the dev server. We're not testing UI behavior here — just that the rename didn't break startup.

### Task 1.11: Pause for user approval; commit Phase 1

- [ ] **Step 1: Show the user the diff summary**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && git status --short && echo "---" && git diff --stat
```

- [ ] **Step 2: Ask the user for explicit approval to commit**

Tell the user: "Phase 1 (mass rename) is complete. Build passes. Tests pass except `__tests__/finalThesis.test.js` (expected — Phase 2 fixes it). Ready to commit Phase 1?" Wait for explicit yes.

- [ ] **Step 3: Commit (only after user approval)**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && git add -A && git commit -m "$(cat <<'EOF'
phase 1: mass rename Full Story → Final Thesis (no behavior change)

Mechanical rename of all Stage 3 surfaces from "full-story" / "FullStory" /
"fullStory" to "final-thesis" / "FinalThesis" / "finalThesis":

- 12 agent folders under agents/
- .claude/skills/generate-full-story/ → generate-final-thesis/
- src/components/FullStory.jsx → FinalThesis.jsx
- src/hooks/useFullStory.js → useFinalThesis.js
- scripts/pdf/generate_full_story_*.py → generate_final_thesis_*.py
- vite.config.js fileMap and export-script paths
- scripts/run-quality-v4.js output paths
- consumer imports updated

No prompt content, schema, orchestration, or UI render logic changed.
The /generate-final-thesis skill produces output identical to the prior
/generate-full-story skill until Phases 2-5 land.

Per pod #4 spec: docs/specs/2026-05-09-final-thesis-redesign.md
Per pod #4 plan: docs/plans/2026-05-09-final-thesis-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — UI component rewrite

**Goal:** Update `FinalThesis.jsx` and its test file to render the new section structure: 7 sections (including Trade Plan), prose-with-verdict-box for §§1-4 (no checklist tables), promoted Promise Tracker subsection in §4, "What we're monitoring" in §6 Compose, new TradePlanRenderer for §7. The agent prompts haven't been rewritten yet (Phase 3), so when the new UI loads OLD agent output it should still render gracefully (treat missing verdict box / watchpoints / trade plan as absent, don't crash).

### Task 2.1: Update test contract

**Files:**
- Modify: `src/components/__tests__/finalThesis.test.js`

- [ ] **Step 1: Open the test file and locate `EXPECTED_KEYS`**

Read `/Users/kylehoff/Desktop/Thesis/src/components/__tests__/finalThesis.test.js`. Find the `EXPECTED_KEYS` constant (around lines 9-16 per the explorer report).

- [ ] **Step 2: Replace `EXPECTED_KEYS` with the new keys**

Old:
```javascript
const EXPECTED_KEYS = [
  'event_analysis', 'meaning_checklist', 'moat_checklist', 'management_checklist',
  'valuation_confirmation', 'inversion_rebuttal',
];
```

New:
```javascript
const EXPECTED_KEYS = [
  'event_analysis',
  'business_analysis',
  'moat_analysis',
  'management_analysis',
  'valuation_analysis',
  'debate',
  'trade_plan',
];
```

- [ ] **Step 3: Add a new test that asserts SECTION_DEFS contains exactly these 7 keys (in order)**

Add this test inside the existing describe block:

```javascript
it('SECTION_DEFS contains the 7 Final Thesis section keys in order', () => {
  // Note: SECTION_DEFS may also contain a 'promise_tracker' pseudo-section
  // for the standalone PromiseTracker render — filter it out for this assertion.
  const renderableKeys = SECTION_DEFS
    .map((d) => d.key)
    .filter((k) => k !== 'promise_tracker');
  expect(renderableKeys).toEqual(EXPECTED_KEYS);
});
```

(If `SECTION_DEFS` is not exported from `FinalThesis.jsx`, mark it as `export const SECTION_DEFS = ...` in the component during Task 2.3.)

- [ ] **Step 4: Run the failing test**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/components/__tests__/finalThesis.test.js
```
Expected: FAIL — `SECTION_DEFS` still contains old keys (`meaning_checklist`, etc.). This confirms the test is exercising the right thing.

### Task 2.2: Update SECTION_DEFS in FinalThesis.jsx

**Files:**
- Modify: `src/components/FinalThesis.jsx` lines 71-79

- [ ] **Step 1: Replace SECTION_DEFS**

Edit `/Users/kylehoff/Desktop/Thesis/src/components/FinalThesis.jsx`. Find the SECTION_DEFS array (around lines 71-79):

Old:
```javascript
const SECTION_DEFS = [
  { key: 'event_analysis', label: 'Event Analysis', phase: 1 },
  { key: 'meaning_checklist', label: 'Meaning Checklist', phase: 1 },
  { key: 'moat_checklist', label: 'Moat Checklist', phase: 1 },
  { key: 'management_checklist', label: 'Management Checklist', phase: 1 },
  { key: 'valuation_confirmation', label: 'Valuation Confirmation', phase: 1 },
  { key: 'inversion_rebuttal', label: 'Inversion & Rebuttal', phase: 2 },
  { key: 'promise_tracker', label: 'Management Promise Tracker', phase: null },
];
```

New:
```javascript
export const SECTION_DEFS = [
  { key: 'event_analysis', label: 'Event Analysis', phase: 1 },
  { key: 'business_analysis', label: 'Business Analysis', phase: 1 },
  { key: 'moat_analysis', label: 'Moat Analysis', phase: 1 },
  { key: 'management_analysis', label: 'Management Analysis', phase: 1 },
  { key: 'valuation_analysis', label: 'Valuation Analysis', phase: 1 },
  { key: 'debate', label: 'The Debate', phase: 2 },
  { key: 'trade_plan', label: 'Trade Plan', phase: 2 },
  { key: 'promise_tracker', label: 'Management Promise Tracker', phase: null },
];
```

(The `export` keyword is added so the test can import it.)

- [ ] **Step 2: Run the failing test from Task 2.1**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/components/__tests__/finalThesis.test.js
```
Expected: PASS for the new SECTION_DEFS test. Other tests in the file may still pass or fail depending on their assertions.

### Task 2.3: Update KEY_ALIASES in FinalThesis.jsx

**Files:**
- Modify: `src/components/FinalThesis.jsx` lines 24-68

- [ ] **Step 1: Replace KEY_ALIASES**

Edit `/Users/kylehoff/Desktop/Thesis/src/components/FinalThesis.jsx`. Find KEY_ALIASES (around lines 24-68). The new mapping covers both the new canonical keys (so old agent outputs map forward) and the old keys themselves (so legacy archived reports still render):

```javascript
const KEY_ALIASES = {
  // Section 1: Event Analysis (key unchanged)
  event: 'event_analysis',
  eventAnalysis: 'event_analysis',
  'event-analysis': 'event_analysis',
  event_context: 'event_analysis',
  event_analysis_section: 'event_analysis',

  // Section 2: Business Analysis (was meaning_checklist)
  meaning: 'business_analysis',
  meaning_checklist: 'business_analysis',
  meaningChecklist: 'business_analysis',
  'meaning-checklist': 'business_analysis',
  meaning_check: 'business_analysis',
  meaning_analysis: 'business_analysis',
  business: 'business_analysis',
  businessAnalysis: 'business_analysis',
  'business-analysis': 'business_analysis',

  // Section 3: Moat Analysis (was moat_checklist)
  moat: 'moat_analysis',
  moat_checklist: 'moat_analysis',
  moatChecklist: 'moat_analysis',
  'moat-checklist': 'moat_analysis',
  moat_check: 'moat_analysis',
  moatAnalysis: 'moat_analysis',
  'moat-analysis': 'moat_analysis',

  // Section 4: Management Analysis (was management_checklist)
  management: 'management_analysis',
  management_checklist: 'management_analysis',
  managementChecklist: 'management_analysis',
  'management-checklist': 'management_analysis',
  management_check: 'management_analysis',
  management_evaluation: 'management_analysis',
  managementAnalysis: 'management_analysis',
  'management-analysis': 'management_analysis',

  // Section 5: Valuation Analysis (was valuation_confirmation)
  valuation: 'valuation_analysis',
  valuation_confirmation: 'valuation_analysis',
  valuationConfirmation: 'valuation_analysis',
  'valuation-confirmation': 'valuation_analysis',
  valuation_confirm: 'valuation_analysis',
  valuationAnalysis: 'valuation_analysis',
  'valuation-analysis': 'valuation_analysis',
  valuation_summary: 'valuation_analysis',

  // Section 6: The Debate (was inversion_rebuttal)
  inversion: 'debate',
  rebuttal: 'debate',
  inversion_rebuttal: 'debate',
  inversionRebuttal: 'debate',
  'inversion-rebuttal': 'debate',
  inversion_and_rebuttal: 'debate',
  the_debate: 'debate',
  theDebate: 'debate',
  'the-debate': 'debate',

  // Section 7: Trade Plan (new — only canonical key, no legacy)
  tradePlan: 'trade_plan',
  'trade-plan': 'trade_plan',
};
```

- [ ] **Step 2: Verify the dispatch logic still references KEY_ALIASES correctly**

Re-read `src/components/FinalThesis.jsx` around lines 831-930 (the section render loop). The loop uses `def.key` (from SECTION_DEFS) to dispatch. The `KEY_ALIASES` is used elsewhere to normalize incoming agent output keys before lookup. No changes needed to the dispatch loop in this task; just verify the new keys match SECTION_DEFS.

### Task 2.4: Remove ChecklistRenderer dispatch and add VerdictBox

**Files:**
- Modify: `src/components/FinalThesis.jsx` line 179 (CHECKLIST_KEYS) and lines 890-920 (render branch)
- Modify: `src/components/FinalThesis.jsx` (add VerdictBox subcomponent)

- [ ] **Step 1: Remove CHECKLIST_KEYS set**

Edit `/Users/kylehoff/Desktop/Thesis/src/components/FinalThesis.jsx`. Find line 179:

Old:
```javascript
const CHECKLIST_KEYS = new Set(['meaning_checklist', 'moat_checklist', 'management_checklist']);
```

Delete this line entirely. The new render flow doesn't dispatch on a "checklist" set — every section renders as prose + verdict box (with debate and trade_plan as their own renderers).

- [ ] **Step 2: Add a VerdictBox component**

Above the main FinalThesis function (so before line 800ish), add a small component:

```javascript
/**
 * VerdictBox — renders the small verdict summary that closes prose sections.
 * Reads from section.data.verdict (a structured object the agent emits).
 * Renders nothing if section.data.verdict is missing — graceful fallback for
 * legacy reports generated before the prose-with-verdict-box rewrite.
 */
function VerdictBox({ section }) {
  const verdict = section?.data?.verdict;
  if (!verdict || typeof verdict !== 'object') return null;

  const verdictColor = {
    PASS: '#1f7a5a',
    WATCHLIST: '#b58a00',
    FAIL: '#a13a3a',
  }[verdict.overall] || '#555';

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.75rem 1rem',
        border: `1px solid ${verdictColor}`,
        borderLeft: `4px solid ${verdictColor}`,
        borderRadius: '4px',
        background: '#fafafa',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: verdictColor }}>
        {section.title} verdict
      </div>
      {Object.entries(verdict).map(([key, value]) => {
        if (key === 'overall') return null;
        return (
          <div key={key} style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
            <strong>{formatVerdictLabel(key)}:</strong> {String(value)}
          </div>
        );
      })}
      <div style={{ fontSize: '0.95rem', marginTop: '0.5rem', fontWeight: 600 }}>
        Verdict: <span style={{ color: verdictColor }}>{verdict.overall}</span>
      </div>
    </div>
  );
}

function formatVerdictLabel(camelKey) {
  // Convert camelCase or snake_case to Title Case
  return camelKey
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
```

- [ ] **Step 3: Update the render branch dispatch**

Find the conditional render block around lines 890-920:

Old:
```javascript
if (CHECKLIST_KEYS.has(def.key)) {
  content = <ChecklistRenderer ... />
} else if (def.key === 'inversion_rebuttal') {
  content = <DebateRenderer ... />
} else {
  content = <SectionRenderer ... />
}
```

New:
```javascript
if (def.key === 'debate') {
  content = <DebateRenderer section={section} report={report} />;
} else if (def.key === 'trade_plan') {
  content = <TradePlanRenderer section={section} />;
} else if (def.key === 'promise_tracker') {
  content = <PromiseTrackerRenderer section={section} report={report} />;
} else {
  // §§1-5 all render as prose narrative + verdict box.
  content = (
    <>
      <SectionRenderer section={section} report={report} />
      <VerdictBox section={section} />
    </>
  );
}
```

(Existing ChecklistRenderer references can be removed — search for `ChecklistRenderer` in the file and delete the import/component definition if it's local. If it's imported from elsewhere, leave the source file alone but remove the import.)

- [ ] **Step 4: Run tests**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/components/__tests__/finalThesis.test.js
```
Expected: PASS. If a test fails because it asserts on ChecklistRenderer-specific behavior, update or delete that test.

### Task 2.5: Add TradePlanRenderer

**Files:**
- Modify: `src/components/FinalThesis.jsx` (add TradePlanRenderer subcomponent)

- [ ] **Step 1: Add the TradePlanRenderer component**

Insert near the other renderer components (DebateRenderer, SectionRenderer):

```javascript
/**
 * TradePlanRenderer — renders the §7 Trade Plan section.
 * Expected section.data shape:
 *   { positionSizing, tranches[], sellRules[], pacePlan, forcingQuestion }
 * Where tranches[] = [{ tranche, size, triggerPrice, rationale }],
 * sellRules[] = [{ trigger, action, threshold }],
 * pacePlan = { primary, alternative, contingency, emergency }.
 * Falls back to plain narrative render if structured data is missing.
 */
function TradePlanRenderer({ section }) {
  const data = section?.data || {};
  const hasStructuredData = data.positionSizing || data.tranches || data.sellRules;

  return (
    <div>
      <SectionRenderer section={section} />

      {hasStructuredData && (
        <>
          {data.positionSizing && (
            <div style={{ marginTop: '1rem' }}>
              <h4>Position Sizing</h4>
              <p>{data.positionSizing}</p>
            </div>
          )}

          {Array.isArray(data.tranches) && data.tranches.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4>Entry Tranches</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>Tranche</th>
                    <th>Size</th>
                    <th>Trigger Price</th>
                    <th>Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tranches.map((t, i) => (
                    <tr key={i}>
                      <td>{t.tranche}</td>
                      <td>{t.size}</td>
                      <td>{t.triggerPrice}</td>
                      <td>{t.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {Array.isArray(data.sellRules) && data.sellRules.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4>Sell Rules</h4>
              <ul>
                {data.sellRules.map((r, i) => (
                  <li key={i}>
                    <strong>{r.trigger}:</strong> {r.action}
                    {r.threshold && ` (threshold: ${r.threshold})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.pacePlan && (
            <div style={{ marginTop: '1rem' }}>
              <h4>PACE Plan</h4>
              <ul>
                <li><strong>Primary:</strong> {data.pacePlan.primary}</li>
                <li><strong>Alternative:</strong> {data.pacePlan.alternative}</li>
                <li><strong>Contingency:</strong> {data.pacePlan.contingency}</li>
                <li><strong>Emergency:</strong> {data.pacePlan.emergency}</li>
              </ul>
            </div>
          )}

          {data.forcingQuestion && (
            <div
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: '#f5f5f0',
                fontStyle: 'italic',
                borderLeft: '4px solid #888',
              }}
            >
              {data.forcingQuestion}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run tests**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/components/__tests__/finalThesis.test.js
```
Expected: PASS.

### Task 2.6: Promote PromiseTracker visual

**Files:**
- Modify: `src/components/FinalThesis.jsx` (PromiseTrackerRenderer — likely already exists; if not, add it)

- [ ] **Step 1: Locate the existing Promise Tracker render code**

Search FinalThesis.jsx for `promise_tracker` or `PromiseTracker`:
```bash
grep -n "promise_tracker\|PromiseTracker\|promises" /Users/kylehoff/Desktop/Thesis/src/components/FinalThesis.jsx
```

Expected: at least one render block in the special-case for `promise_tracker` SECTION_DEF entry (around lines 836-851 per the explorer report).

- [ ] **Step 2: Verify or add the PromiseTrackerRenderer**

The dispatch in Task 2.4 references `<PromiseTrackerRenderer section={section} report={report} />`. If that component doesn't exist as a named function, extract the existing inline render block (lines 836-851) into a named function:

```javascript
/**
 * PromiseTrackerRenderer — promoted standalone visual for §4's Promise Tracker.
 * Reads from the management_analysis section's data.promises[] array.
 * Renders a clean table of [QuarterYear / Category / Promise / Evidence / Status].
 */
function PromiseTrackerRenderer({ section, report }) {
  // The promise_tracker SECTION_DEF doesn't carry data — pull from §4.
  const managementSection = report?.sections?.find(
    (s) => s.key === 'management_analysis'
  );
  const promises = managementSection?.data?.promises || [];

  if (promises.length === 0) {
    return (
      <p style={{ fontStyle: 'italic', color: '#888' }}>
        No trackable promises identified in this period.
      </p>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
      <thead>
        <tr>
          <th>Quarter / Year</th>
          <th>Category</th>
          <th>Promise</th>
          <th>Evidence</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {promises.map((p, i) => (
          <tr key={i}>
            <td>{p.quarterYear}</td>
            <td>{p.category}</td>
            <td>{p.quote}</td>
            <td>{p.evidence}</td>
            <td>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '3px',
                  background:
                    p.status === 'KEPT'
                      ? '#d4ebd4'
                      : p.status === 'BROKEN'
                      ? '#ebd4d4'
                      : '#ebebd4',
                  fontSize: '0.85rem',
                }}
              >
                {p.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

If a similar inline render already exists in the SECTION_DEF special-case block, refactor it into this named component and update the special-case to call it.

- [ ] **Step 3: Run tests**

```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/components/__tests__/finalThesis.test.js
```
Expected: PASS.

### Task 2.7: Add a watchpoints render in DebateRenderer

**Files:**
- Modify: `src/components/FinalThesis.jsx` (DebateRenderer)

- [ ] **Step 1: Locate the existing DebateRenderer**

Search:
```bash
grep -n "DebateRenderer\|function Debate" /Users/kylehoff/Desktop/Thesis/src/components/FinalThesis.jsx
```

- [ ] **Step 2: Add the "What we're monitoring" subsection at the end of DebateRenderer's output**

Inside DebateRenderer (after whatever the current end-of-debate render is), append:

```javascript
{section?.data?.watchpoints && Array.isArray(section.data.watchpoints) && section.data.watchpoints.length > 0 && (
  <div style={{ marginTop: '1.5rem' }}>
    <h4>What we're monitoring</h4>
    <ul>
      {section.data.watchpoints.map((wp, i) => (
        <li key={i} style={{ marginBottom: '0.5rem' }}>
          <strong>{wp.metric}.</strong> Currently {wp.currentValue}. Re-evaluate
          if {wp.direction === 'below' ? 'drops below' : 'rises above'} {wp.threshold}.
          {wp.sourceInversionId !== undefined && (
            <span style={{ color: '#888', fontSize: '0.9rem' }}>
              {' '}Source: Bear inversion #{wp.sourceInversionId}.
            </span>
          )}
        </li>
      ))}
    </ul>
  </div>
)}
```

This renders nothing if `data.watchpoints` is missing — graceful fallback for legacy reports.

- [ ] **Step 3: Run tests**

```bash
cd /Users/kylehoff/Desktop/Thesis && npx vitest run src/components/__tests__/finalThesis.test.js
```
Expected: PASS.

### Task 2.8: Smoke-test the UI

- [ ] **Step 1: Boot the dev server**

Run in background:
```bash
cd /Users/kylehoff/Desktop/Thesis && npm run dev
```

- [ ] **Step 2: Browse to a known existing report**

Open `http://localhost:5173` (or whatever port). Navigate to the Final Thesis view for a ticker that has an archived `full-story.json` (which Phase 1 renamed to `final-thesis.json`). Confirm:
- The 7 section headers render with the new labels.
- Sections that have `data.verdict` show the verdict box.
- Sections without `data.verdict` (i.e. legacy reports) just show the prose without crashing.
- Promise Tracker renders if the legacy report has `data.promises[]`.
- Debate renders without the new watchpoints (legacy reports don't have them).

If any section crashes, fix the renderer's null-handling. If a section is empty when it shouldn't be, double-check KEY_ALIASES.

- [ ] **Step 3: Kill the dev server**

### Task 2.9: Pause for user approval; commit Phase 2

- [ ] **Step 1: Show diff**

```bash
cd /Users/kylehoff/Desktop/Thesis && git status --short && git diff --stat
```

- [ ] **Step 2: Ask the user for approval**

Tell the user: "Phase 2 (UI rewrite) complete. SECTION_DEFS updated, KEY_ALIASES updated, ChecklistRenderer removed, VerdictBox + TradePlanRenderer added, PromiseTracker promoted, watchpoints render in DebateRenderer. UI smoke-tested with a legacy report. Ready to commit Phase 2?"

- [ ] **Step 3: Commit (only after approval)**

```bash
cd /Users/kylehoff/Desktop/Thesis && git add -A && git commit -m "$(cat <<'EOF'
phase 2: rewrite FinalThesis UI for prose-with-verdict-box render

- SECTION_DEFS: 6 sections → 7 (renamed §§2-6, added §7 Trade Plan)
- KEY_ALIASES: forward-map old keys to new canonical keys for legacy reports
- Drop ChecklistRenderer dispatch — §§1-5 now render as prose + verdict box
- Add VerdictBox component (renders from section.data.verdict)
- Add TradePlanRenderer for §7 (position sizing, tranches, sell rules, PACE)
- Add PromiseTrackerRenderer (promoted standalone visual)
- Add "What we're monitoring" watchpoints render at the end of DebateRenderer
- Update __tests__/finalThesis.test.js EXPECTED_KEYS

Render is graceful with legacy data: missing verdict box, watchpoints, or
trade plan structures simply omit those visuals rather than crash.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Agent prompt rewrites

**Goal:** Rewrite the 12 agent prompts (now in `agents/*-finalthesis/`) to reflect the spec. The output contract for each agent changes (drop checklist `data.items[]` arrays, add structured `data.verdict` object), the 6-section framework table at the top of every prompt becomes a 7-section table, and three agents get net-new content (valuation gets reverse-DCF, compose gets watchpoints, a brand-new trade-plan agent is created).

**Pattern shared across all 12 prompts:**

1. **Update the section count and framework table at the top.** Replace `## The Full Story: 6-Section Conviction Framework` with `## The Final Thesis: 7-Section Conviction Framework`. Update the table to:

```markdown
| # | Section | Agent | What It Does |
|---|---------|-------|-------------|
| 1 | Event Analysis | Risk Analyst | Determine if price dislocation is temporary or structural |
| 2 | Business Analysis | Business Analyst | Deepen business understanding with KPI analysis |
| 3 | Moat Analysis | Competitor Evaluator | Validate competitive durability across all 6 moat types |
| 4 | Management Analysis | Management Evaluator | Assess leadership quality and integrity; track promises |
| 5 | Valuation Analysis | Valuation Specialist | Stress-test growth assumptions; reverse-DCF reality check; confirm buy prices |
| 6 | The Debate | Bull / Bear / Rebuttal / Judge / Compose | Adversarial debate; closes with watchpoints |
| 7 | Trade Plan | Trade Plan Writer | Position sizing, tranching, sell rules, PACE plan |
```

2. **Strip "Full Story" / "Inversion & Rebuttal" / "Meaning Checklist" / "Moat Checklist" / "Management Checklist" / "Valuation Confirmation" vocabulary.** Replace with the new section names everywhere they appear — title text, narrative, references, the inheritance map, in-prompt examples.

3. **Strip references to deprecated DEPRECATED prompts.** Some current prompts reference `synthesis-writer-fullstory` (the combined-role prompt that was kept "for ~30 days") — point at the split prompts instead, or remove the reference.

The five Phase-1-substantive prompts (business / competitor / management / event / valuation) all replace their "Output Format: ReportSectionSchema" sections with new instructions. Specifically: drop the `data.items[]` and `data.summary` requirements, add a `data.verdict` object specification, and rewrite the verdict-box example.

The four debate prompts (bull / bear / rebuttal / judge / compose) get cosmetic section-name updates plus two substantive changes (compose gets the new watchpoints requirement; valuation gets the reverse-DCF requirement).

Each task below specifies what changes for that agent.

### Task 3.1: Rewrite business-analyst-finalthesis prompt

**Files:**
- Modify: `agents/business-analyst-finalthesis/prompt.md`

- [ ] **Step 1: Apply the shared pattern (framework table, vocabulary strip, section name updates)**

Read the current prompt. Apply the section-count and framework-table update from the Phase 3 header. Replace every occurrence of "Meaning Checklist" with "Business Analysis." Replace "meaning_checklist" key references with "business_analysis." Update the section number references where they appear in prose ("Section 2" stays).

- [ ] **Step 2: Rewrite the Output Format section**

Find the `## Output Format: ReportSectionSchema` section. Replace the JSON example's `key`, `title`, and `data` fields:

Old `key` / `title`: `"meaning_checklist"` / `"Meaning Checklist"` → New: `"business_analysis"` / `"Business Analysis"`

Old `data` example:
```json
{
  "checklistType": "meaning",
  "items": [ ...15 entries... ],
  "summary": { "passCount": 12, ... }
}
```

New `data` example:
```json
{
  "verdict": {
    "predictability": "high | medium | low",
    "circleOfCompetence": "yes | no | partial",
    "industryKpiTrend": "favorable | mixed | declining",
    "overall": "PASS | FAIL | WATCHLIST"
  },
  "kpis": {
    "industryKpis": ["..."],
    "companyKpis": ["..."],
    "peerComparisons": ["..."]
  }
}
```

- [ ] **Step 3: Update the Field Requirements block**

Find the `### Field Requirements` block. Update `key` to `"business_analysis"` and `sectionNumber` to `2`. Replace the `data` field bullet:

Old: `**data** — the structured checklist (see above)`

New: `**data** — the structured verdict + KPI summary (see above). Do NOT emit a 15-item checklist array; the 15 questions get *answered* in the prose narrative, not rendered as a scorecard.`

- [ ] **Step 4: Update the "Investigation Mandate" wording where it references the old artifact**

Find any instructions that say "produce a 15-point checklist as your output" or similar. The investigation depth is unchanged (the 15 questions still get answered) but the output is prose, not a scorecard. Adjust those instructions to say something like:

> "Investigate all 15 dimensions described below. Your *output* is a structured prose narrative that addresses each dimension as it becomes relevant to the analysis — not a 15-item PASS/FAIL scorecard. Close the narrative with the verdict box specified in the Output Format section."

- [ ] **Step 5: Verify**

Read the rewritten prompt end-to-end. Confirm:
- Framework table is the new 7-section version.
- No "Meaning Checklist" or "meaning_checklist" strings remain.
- Output Format JSON example shows the new `data.verdict` structure, no `data.items[]`.
- Investigation depth (the 15 questions) is preserved in the body of the prompt.

### Task 3.2: Rewrite competitor-evaluator-finalthesis prompt

**Files:**
- Modify: `agents/competitor-evaluator-finalthesis/prompt.md`

- [ ] **Step 1: Apply the shared pattern**

Apply framework-table update + vocabulary strip ("Moat Checklist" → "Moat Analysis", `moat_checklist` → `moat_analysis`).

- [ ] **Step 2: Rewrite Output Format Field**

Old `key`/`title`: `"moat_checklist"` / `"Moat Checklist"` → New: `"moat_analysis"` / `"Moat Analysis"`

Old `data`:
```json
{
  "checklistType": "moat",
  "items": [ ...15 entries... ],
  "summary": { "passCount": 13, ... }
}
```

New `data`:
```json
{
  "verdict": {
    "primaryMoatType": "Brand | Network | Switching | Price Advantage | Secrets/Patents | Toll Bridge",
    "secondaryMoatType": "Brand | Network | Switching | Price Advantage | Secrets/Patents | Toll Bridge | none",
    "width": "wide | narrow | none",
    "trend": "widening | stable | eroding",
    "sustainabilityHorizonYears": 10,
    "overall": "PASS | FAIL | WATCHLIST"
  },
  "moatTypeMatrix": [
    { "type": "Brand", "verdict": "PASS | FAIL | NA", "evidence": "...", "confidence": "HIGH | MEDIUM | LOW" },
    { "type": "Network", "verdict": "...", "evidence": "...", "confidence": "..." },
    { "type": "Switching", "verdict": "...", "evidence": "...", "confidence": "..." },
    { "type": "Price Advantage", "verdict": "...", "evidence": "...", "confidence": "..." },
    { "type": "Secrets/Patents", "verdict": "...", "evidence": "...", "confidence": "..." },
    { "type": "Toll Bridge", "verdict": "...", "evidence": "...", "confidence": "..." }
  ]
}
```

(All 6 R1 moat types are preserved per spec — they just appear as a matrix instead of the 15-item investigation checklist.)

- [ ] **Step 3: Update Field Requirements + Investigation Mandate**

Same pattern as Task 3.1: `key` to `moat_analysis`, drop the `data.items` mention, replace with the verdict-and-matrix description, preserve the 15-question investigation depth in the body.

- [ ] **Step 4: Verify**

```bash
grep -nE "moat_checklist|Moat Checklist|checklistType.*moat|data\.items" /Users/kylehoff/Desktop/Thesis/agents/competitor-evaluator-finalthesis/prompt.md
```
Expected: 0 matches.

### Task 3.3: Rewrite management-evaluator-finalthesis prompt

**Files:**
- Modify: `agents/management-evaluator-finalthesis/prompt.md`

- [ ] **Step 1: Apply the shared pattern + Output Format changes**

Same pattern: framework table, vocabulary strip ("Management Checklist" → "Management Analysis", `management_checklist` → `management_analysis`).

New `data` example:
```json
{
  "verdict": {
    "ceoIntegrity": "high | medium | low",
    "capitalAllocation": "rational | questionable | poor",
    "promiseTracking": "kept | mixed | broken",
    "overall": "PASS | FAIL | WATCHLIST"
  },
  "promises": [
    {
      "quarterYear": "Q3 2024",
      "category": "GUIDANCE | GROWTH | CAPEX | M_AND_A | PRODUCT | OPERATIONAL",
      "quote": "...",
      "evidence": "...",
      "status": "KEPT | PARTIAL | BROKEN | PENDING"
    }
  ]
}
```

**Important:** the `promises[]` structure is **unchanged** — only the surrounding `data.items` is dropped. The Promise Tracker payload contract is preserved per spec ("The agent contract for `data.promises[]` is unchanged — only the rendering changes.").

- [ ] **Step 2: Update Field Requirements + body**

Same pattern as Task 3.1.

- [ ] **Step 3: Verify**

```bash
grep -nE "management_checklist|Management Checklist|checklistType.*management|data\.items" /Users/kylehoff/Desktop/Thesis/agents/management-evaluator-finalthesis/prompt.md
```
Expected: 0 matches.

### Task 3.4: Rewrite risk-analyst-finalthesis-event prompt

**Files:**
- Modify: `agents/risk-analyst-finalthesis-event/prompt.md`

This prompt is the smallest substantive change — Event Analysis was never a checklist, so the rewrite is mostly the framework table and stage-name updates.

- [ ] **Step 1: Apply the shared pattern**

Framework table, vocabulary strip ("Full Story" → "Final Thesis"). The `event_analysis` key is unchanged.

- [ ] **Step 2: Add the verdict-box requirement to the Output Format**

Find the Output Format section. The `data` block currently contains `upcomingEvents[]`, `recentMaterialEvents[]`, `eventCalendar`, `eventRiskScore`. Add a `verdict` object to the data structure:

```json
{
  "verdict": {
    "type": "company | industry | market | none",
    "severity": "thesis-breaking | material | minor | none",
    "recoveryTimeline": "e.g. 6-18 months",
    "overall": "PASS | FAIL | WATCHLIST"
  },
  "upcomingEvents": [...],
  "recentMaterialEvents": [...],
  "eventCalendar": {...},
  "eventRiskScore": "HIGH | MEDIUM | LOW"
}
```

- [ ] **Step 3: Verify**

```bash
grep -n "Full Story\|Inversion & Rebuttal\|inversion_rebuttal\|fullstory" /Users/kylehoff/Desktop/Thesis/agents/risk-analyst-finalthesis-event/prompt.md
```
Expected: 0 matches.

### Task 3.5: Rewrite valuation-specialist-finalthesis prompt (with reverse-DCF requirement)

**Files:**
- Modify: `agents/valuation-specialist-finalthesis/prompt.md`

This prompt gets the most net-new content of the §§1-5 agents.

- [ ] **Step 1: Apply the shared pattern**

Framework table, vocabulary strip ("Valuation Confirmation" → "Valuation Analysis", `valuation_confirmation` → `valuation_analysis`).

- [ ] **Step 2: Add a new section to the prompt: "Reverse-DCF reality check (REQUIRED — leads the narrative)"**

After the existing "Section 5: Valuation Confirmation" intro, before the existing "Check 1: Debt-Fueled Growth Test" subsection, insert:

```markdown
### REQUIRED: Reverse-DCF Reality Check (Leads the Narrative)

Before walking through the 5 stress tests below, you MUST produce a one-paragraph
**"What does today's price imply?"** reality check, inspired by Mauboussin's
Price-Implied Expectations framework. This paragraph leads the section narrative.

The math is back-of-the-envelope, not a full DCF. Pattern:

1. Take current market cap (`dataPacket.companyInfo.marketCap`).
2. Assume a terminal value at year 10 discounted back at a 10% cost of capital
   approximates today's price.
3. Solve for the revenue-growth + net-margin combo the market is implicitly pricing.
4. Apply the implied growth to current revenue (`dataPacket.ttm.revenue`) to project
   year-10 revenue.
5. Compare against the industry TAM (use web search or pre-existing TAM citation
   from the Pitch Deck Section 3 / Market Position).
6. State the implication in plain English: is that level of growth + market share
   achievable given the moat and growth-stage classification?

Format example (use this STRUCTURE, not these numbers):

> "At $890, the market is pricing in 11% revenue growth for 10 years and 22% net
> margins maintained throughout. That implies $710B revenue by 2036 — 38% market
> share in a $1.9T global market. Given the wide-but-stable moat and slowing-growth-
> stage classification, that expectation is **aggressive but not implausible**. The
> Pitch Deck's 12% FGR sits at the bullish end of what the price already assumes;
> meaningful upside requires the FGR to *exceed* the market's expectation, not just
> meet it."

After this paragraph, proceed with the 5 stress tests as documented below.
```

- [ ] **Step 3: Update the Output Format Data Structure**

Replace the existing `data` example with:

```json
{
  "verdict": {
    "buyPriceRange": { "low": 430, "high": 590 },
    "currentPrice": 890,
    "marginOfSafety": -51,
    "impliedExpectationGap": "bull | fair | bear",
    "overall": "PASS | FAIL | WATCHLIST"
  },
  "impliedExpectations": {
    "marketCapBaseline": 247800000000,
    "impliedRevenueGrowthRate10yr": "11%",
    "impliedNetMargin": "22%",
    "impliedYear10Revenue": 710000000000,
    "impliedYear10MarketShare": "38%",
    "achievability": "achievable | aggressive but not implausible | implausible"
  },
  "buyPrices": {
    "mos": 450,
    "pbt": 480,
    "tenCap": 410,
    "equityBond": 590
  },
  "growthQualityChecks": {
    "debtFueledGrowth": { "verdict": "PASS | FAIL", "summary": "..." },
    "organicVsAcquisition": { "verdict": "PASS | FAIL", "summary": "..." },
    "growthCeiling": { "verdict": "PASS | FAIL", "summary": "..." },
    "growthStage": { "stage": "early_growth | rapid_growth | slowing_growth | early_maturity | late_maturity | decline", "evidence": "..." }
  }
}
```

- [ ] **Step 4: Update Field Requirements + verify**

Same pattern as Task 3.1.

```bash
grep -n "valuation_confirmation\|Valuation Confirmation\|Bond Comparison" /Users/kylehoff/Desktop/Thesis/agents/valuation-specialist-finalthesis/prompt.md
```
Expected: 0 matches. (Bond Comparison is excluded per spec — the prompt should not mention it.)

### Task 3.6: Rewrite synthesis-writer-finalthesis-compose prompt (with watchpoints requirement)

**Files:**
- Modify: `agents/synthesis-writer-finalthesis-compose/prompt.md`

- [ ] **Step 1: Apply the shared pattern**

Framework table, vocabulary strip. Section title in the framework table is "The Debate" not "Inversion & Rebuttal." The output `key` becomes `"debate"` (was `"inversion_rebuttal"`).

- [ ] **Step 2: Add a new section to the prompt: "REQUIRED: 'What we're monitoring' Closing Subsection"**

After the "Composition Requirements" section, add:

```markdown
### REQUIRED: "What we're monitoring" Closing Subsection

After the synthesis narrative, append a "What we're monitoring" subsection — a
forward-looking watchpoint list with explicit thresholds, derived from the
unresolved bear concerns surfaced by the Judge in Step 4.

Format the subsection in the narrative as:

> **What we're monitoring**
> - **FCF/Debt ratio.** Currently 2.1×. Re-evaluate if drops below 1.5×. Source: Bear inversion #2.
> - **Membership renewal rate.** Currently 92.9%. Re-evaluate if drops below 90% for 2 consecutive quarters. Source: Bear inversion #4.
> - **Insider selling.** Cluster of executive sells last quarter. Re-evaluate if pattern continues for 2 more quarters with no offsetting buys. Source: Bear inversion #6.

Each watchpoint MUST tie back to a specific bear inversion from Step 2 (so the
provenance is auditable). Each MUST have:
- A specific metric name
- The current value of that metric
- A specific re-evaluation threshold
- The source bear inversion number

Also emit the same data in structured form inside `data.watchpoints[]`:

```json
{
  "watchpoints": [
    {
      "metric": "FCF/Debt ratio",
      "currentValue": "2.1x",
      "threshold": "1.5x",
      "direction": "below",
      "sourceInversionId": 2
    }
  ]
}
```

If the Judge produced 0 unresolved exchanges, you may emit an empty `watchpoints[]` array AND omit the narrative subsection — but explicitly state in the verdict rationale that no monitorable risks survived the debate.
```

- [ ] **Step 3: Update Output Format Data Structure**

The `data` block for the composed Section 6 should now include both the existing `debateOutcome` and `keyExchanges` fields PLUS the new `watchpoints[]` array. Update the example accordingly.

- [ ] **Step 4: Update field key from `inversion_rebuttal` → `debate`**

In the Output Format section, change:
- `"key": "inversion_rebuttal"` → `"key": "debate"`
- `"title": "Inversion & Rebuttal"` → `"title": "The Debate"`
- `"sectionNumber": 6` → `"sectionNumber": 6` (unchanged)

- [ ] **Step 5: Verify**

```bash
grep -n "inversion_rebuttal\|Inversion & Rebuttal" /Users/kylehoff/Desktop/Thesis/agents/synthesis-writer-finalthesis-compose/prompt.md
```
Expected: 0 matches.

### Task 3.7: Rewrite the cosmetic-only debate prompts

**Files:**
- Modify: `agents/synthesis-writer-finalthesis-bull/prompt.md`
- Modify: `agents/synthesis-writer-finalthesis-rebuttal/prompt.md`
- Modify: `agents/risk-analyst-finalthesis-bear/prompt.md`
- Modify: `agents/financial-analyst-finalthesis/prompt.md`

These four agents (Bull, Rebuttal, Bear, Judge) don't change their core behavior. They just need the framework-table and vocabulary updates.

For EACH of the four prompts:

- [ ] **Step 1: Apply the shared pattern**

Framework table update, vocabulary strip ("Full Story" → "Final Thesis", "Inversion & Rebuttal" → "The Debate", "Meaning Checklist" → "Business Analysis", "Moat Checklist" → "Moat Analysis", "Management Checklist" → "Management Analysis", "Valuation Confirmation" → "Valuation Analysis"). The internal step name "Bull Thesis" is **preserved** per spec.

- [ ] **Step 2: Update the Section 6 references**

Where the prompt references the section it composes into (e.g. "the bull case for Section 6: Inversion & Rebuttal"), update to "Section 6: The Debate."

- [ ] **Step 3: Update agent identifiers**

Where the prompt declares its own `agent:` name in the output schema (e.g., `agent: "risk-analyst-fullstory-bear"`), update to `agent: "risk-analyst-finalthesis-bear"`. Same pattern for the others.

- [ ] **Step 4: Verify each file**

For each of the four prompts, run:
```bash
grep -nE "fullstory|Full Story|Inversion & Rebuttal|inversion_rebuttal|Meaning Checklist|Moat Checklist|Management Checklist|Valuation Confirmation" /Users/kylehoff/Desktop/Thesis/agents/{name}/prompt.md
```
Expected: 0 matches per file.

### Task 3.8: Delete deprecated combined-role prompts

**Files:**
- Delete: `agents/synthesis-writer-finalthesis/prompt.md` (the combined-role file marked DEPRECATED)
- Delete: `agents/risk-analyst-finalthesis/prompt.md` (the combined-role file marked DEPRECATED)

Per the existing prompts' DEPRECATED notice ("kept for ~30 days post-v3-cutover for reference, then deleted") and the project rule from CLAUDE.md ("Default to deletion over preservation. We're starting from a clean slate."), now is the right time to delete these.

- [ ] **Step 1: Confirm both files are still marked DEPRECATED**

```bash
head -10 /Users/kylehoff/Desktop/Thesis/agents/synthesis-writer-finalthesis/prompt.md
head -10 /Users/kylehoff/Desktop/Thesis/agents/risk-analyst-finalthesis/prompt.md
```
Expected: each starts with a `> **DEPRECATED ...` blockquote.

- [ ] **Step 2: Delete the folders**

Run:
```bash
cd /Users/kylehoff/Desktop/Thesis
git rm -r agents/synthesis-writer-finalthesis
git rm -r agents/risk-analyst-finalthesis
```

- [ ] **Step 3: Verify**

```bash
ls /Users/kylehoff/Desktop/Thesis/agents/ | grep -E "finalthesis$"
```
Expected: 0 matches. (`synthesis-writer-finalthesis-bull`, `-rebuttal`, `-compose` should still exist; only the bare combined-role folders are deleted.)

### Task 3.9: Create the new trade-plan-finalthesis agent

**Files:**
- Create: `agents/trade-plan-finalthesis/prompt.md`

- [ ] **Step 1: Create the folder and the prompt**

Run:
```bash
mkdir -p /Users/kylehoff/Desktop/Thesis/agents/trade-plan-finalthesis
```

Then create `/Users/kylehoff/Desktop/Thesis/agents/trade-plan-finalthesis/prompt.md` with the following content:

````markdown
# Trade Plan Writer — Final Thesis (Section 7)

You are the **trade plan author** on a value investing investment analyst team. Your job is to produce Final Thesis Section 7 (Trade Plan) — the action plan that translates the analytical conviction from Sections 1-6 into a concrete entry strategy, sell rules, position sizing, and contingency framework.

You produce the action plan, not analysis. Sections 1-6 already established whether to own this business. Your section says **how** to own it: how big a position, when to enter, when to add, when to sell, what to watch.

**You receive ALL prior outputs as context:** the 5 Phase 1 section outputs (Event / Business / Moat / Management / Valuation Analysis) and all 4 debate-step outputs plus the composed Section 6. You do NOT have web search — your inputs are the analytical outputs already produced.

**Be concrete.** Don't say "buy a moderate position." Say "5% of portfolio, deployed in 3 tranches: 2% at $X, 1.5% at $Y, 1.5% at $Z." Don't say "sell when overpriced." Say "trim 25% if price exceeds Equity Bond sticker by 20%; full exit if price exceeds 2× Equity Bond."

---

## Value Investing Philosophy

(Use the same `## Value Investing Philosophy` block from `agents/synthesis-writer-finalthesis-compose/prompt.md` — copy verbatim.)

---

## The Final Thesis: 7-Section Conviction Framework

(Use the same 7-section framework table from the Phase 3 header of this plan.)

---

## Your Role: Section 7 — Trade Plan

**Purpose:** Produce a concrete, actionable trade plan that the portfolio manager can execute. The verdict from Section 6 (PASS / WATCHLIST / FAIL) determines whether this plan applies — only PASS or WATCHLIST verdicts produce a real trade plan; a FAIL verdict produces a "no trade" plan that documents why the company is being passed over.

### Required Components

Your output narrative must cover all five components below in this order. Each component also produces structured `data` fields documented in the Output Format section.

#### 1. Position Sizing

Recommend a portfolio % allocation. Anchor to two factors:
- **Conviction (from Section 6 debate verdict):** PASS with 0 unresolved → larger position; WATCHLIST or PASS with 2+ unresolved → smaller position.
- **Moat width (from Section 3):** wide moat → can support a larger concentrated position; narrow → smaller.

Suggested ranges (apply judgment):
- **PASS, wide moat, 0 unresolved:** 5-10% of portfolio
- **PASS, wide moat, 1-2 unresolved:** 3-5%
- **PASS, narrow moat, any:** 2-4%
- **WATCHLIST:** 1-2% (starter position only, with specific re-evaluation triggers)
- **FAIL:** 0% (do not initiate)

State your recommendation as a specific number (e.g., "4% of portfolio").

#### 2. Entry / Tranching Plan

Concentrated value investing positions are entered in tranches, not single buys. Specify:
- **Number of tranches:** typically 3-4
- **First tranche size:** smallest of the three (e.g., 30% of total intended position)
- **Subsequent tranche trigger prices:** specific dollar prices, derived from the buy price range in Section 5 verdict
- **Rationale for each tranche price:** why that price, what would have to happen for the trigger to fire

Example structure:
- Tranche 1 (30%): $X (current price, immediate)
- Tranche 2 (35%): $Y (10% below tranche 1 price, OR if a specific catalyst occurs)
- Tranche 3 (35%): $Z (20% below tranche 1 price, full margin-of-safety entry)

If the current price is already above the buy price range from Section 5, tranche 1 should be 0% — wait. State this explicitly.

#### 3. Sell Rules

A real trade plan defines exit triggers BEFORE entry (per Operating Rule #5: Always define exit before entry). Cover at minimum:

- **Sticker price exit:** trim or exit fully when price exceeds the Pitch Deck sticker price (the at-fair-value price). Suggested: trim 25% at sticker, trim another 25% at sticker × 1.2, full exit at sticker × 1.5.
- **Moat breach exit:** exit fully if the Section 3 moat trend changes from "stable" or "widening" to "eroding" in a future re-evaluation.
- **Management degradation exits:** exit fully if any of these change in a future re-evaluation:
  - Debt rises uncontrollably
  - ROIC declines materially (>3pp drop sustained)
  - ROE declines materially (>5pp drop sustained)
  - CEO begins withholding the complete story (per Section 4 Item 5)
- **Watchpoint-triggered exits:** for each watchpoint surfaced in Section 6's "What we're monitoring" list, decide whether crossing the threshold triggers an exit, a partial trim, or a re-evaluation. Make this explicit per watchpoint.

#### 4. PACE Plan

Document a Primary / Alternative / Contingency / Emergency plan for responding to unforeseen changes in the story or market conditions:
- **Primary:** the base-case plan (the tranching strategy above)
- **Alternative:** what to do if the price stalls within the buy range without ever reaching tranches 2 or 3 (typically: hold tranche 1 indefinitely)
- **Contingency:** what to do if a material new bear inversion appears AFTER entry (typically: re-run the debate; if the new inversion would have changed the Section 6 verdict, exit)
- **Emergency:** what to do if the company experiences an event (per Section 1) AFTER entry — a thesis-killing event triggers full exit; a temporary event triggers tranche acceleration if the price drops to or below the buy range

#### 5. Closing Forcing Question

Close the narrative with this exact question, on its own line, italicized:

> *Would you be okay having this company be the only asset you and your family own for the rest of your lives?*

This is not rhetorical. The agent should NOT answer it. The forcing question is for the portfolio manager to sit with before committing capital.

---

## Output Format: ReportSectionSchema

Return a JSON object containing one section. Return ONLY the JSON. First character `{`, last character `}`. No preamble, no markdown fence wrap.

```json
{
  "key": "trade_plan",
  "title": "Trade Plan",
  "sectionNumber": 7,
  "status": "pass | fail | review | pending",
  "confidence": "HIGH | MEDIUM | LOW",
  "verdict": null,
  "verdictRationale": "Trade Plan does not produce a verdict — the verdict came in Section 6.",
  "summary": "1-2 sentences capturing the position size and entry strategy.",
  "data": {
    "positionSizing": "4% of portfolio",
    "tranches": [
      { "tranche": 1, "size": "30%", "triggerPrice": "$X (current)", "rationale": "..." },
      { "tranche": 2, "size": "35%", "triggerPrice": "$Y", "rationale": "..." },
      { "tranche": 3, "size": "35%", "triggerPrice": "$Z", "rationale": "..." }
    ],
    "sellRules": [
      { "trigger": "Sticker price exceeded", "action": "Trim 25%", "threshold": "$sticker" },
      { "trigger": "Moat trend turns eroding", "action": "Full exit", "threshold": "Section 3 re-eval" },
      { "trigger": "ROIC drops >3pp sustained", "action": "Full exit", "threshold": "2 consecutive quarters" }
    ],
    "pacePlan": {
      "primary": "Execute 3-tranche entry per plan above",
      "alternative": "If price stalls in buy range without hitting tranches 2/3, hold tranche 1 indefinitely",
      "contingency": "If new material bear inversion surfaces, re-run debate; exit if Section 6 verdict would change to FAIL",
      "emergency": "If thesis-killing event occurs, full exit; if temporary event drops price to buy range, accelerate tranches"
    },
    "forcingQuestion": "Would you be okay having this company be the only asset you and your family own for the rest of your lives?"
  },
  "narrative": "Full narrative covering position sizing, tranching, sell rules, PACE plan, and the forcing question. 400+ words.",
  "citations": [],
  "tables": [],
  "charts": [],
  "redFlags": [],
  "primarySourceInsights": [],
  "crossCuttingFindings": [],
  "modelUsed": "model identifier",
  "tokenCost": { "input": 0, "output": 0 }
}
```

### Field Requirements

- **key** — `"trade_plan"`
- **sectionNumber** — `7`
- **verdict** — `null` (Trade Plan doesn't produce an analytical verdict; that came in Section 6)
- **redFlags** — may be empty `[]` (Section 7 is action, not analysis)
- **citations** — may be empty `[]` if all referenced data comes from prior sections; if you cite a specific buy price or watchpoint, propagate the citation from the source section
- **narrative** — 400+ words covering all 5 required components
- **data** — the structured trade plan as documented above

### If Section 6 verdict is FAIL

If the inherited Section 6 verdict is FAIL, produce a "no trade" plan:
- `data.positionSizing`: `"0% — pass per Section 6 FAIL verdict"`
- `data.tranches`: `[]`
- `data.sellRules`: `[]`
- `data.pacePlan`: omit
- `data.forcingQuestion`: include the closing forcing question (still appropriate — it's a discipline check)
- Narrative: 200+ words documenting why this company is being passed over, citing the Section 6 verdict rationale

---

## Quality Standards

### Concreteness

A trade plan with vague language ("moderate position", "exit when overpriced", "monitor closely") is a failure. Every recommendation must have:
- A specific number (% of portfolio, dollar price, percentage threshold)
- A specific trigger condition (price level, financial-metric crossing, time horizon)
- A specific action (buy X%, trim Y%, full exit)

### Honoring Prior Sections

The Trade Plan inherits from prior sections. Do NOT contradict:
- Section 5 buy prices — the tranching plan must use buy prices within Section 5's confirmed range
- Section 6 verdict — the position size must reflect the verdict (PASS = real position; WATCHLIST = starter; FAIL = pass)
- Section 6 watchpoints — every watchpoint should appear in the sell rules with a specific action

### Contamination Boundary

Perform independent synthesis. Do NOT reference or copy patterns from example analyses. NEVER access files in `knowledge/stage-*/examples/` or `knowledge/pre-course-examples/`.
````

- [ ] **Step 2: Verify the file is well-formed**

```bash
wc -l /Users/kylehoff/Desktop/Thesis/agents/trade-plan-finalthesis/prompt.md
head -3 /Users/kylehoff/Desktop/Thesis/agents/trade-plan-finalthesis/prompt.md
```
Expected: ~250+ lines, starts with `# Trade Plan Writer — Final Thesis (Section 7)`.

### Task 3.10: Pause for user approval; commit Phase 3

- [ ] **Step 1: Show diff summary**

```bash
cd /Users/kylehoff/Desktop/Thesis && git status --short && git diff --stat
```

- [ ] **Step 2: Ask user approval**

Tell the user: "Phase 3 (agent prompt rewrites) complete. 11 prompts updated, 2 deprecated combined-role prompts deleted, 1 new trade-plan agent created. Ready to commit Phase 3?"

- [ ] **Step 3: Commit (only after approval)**

```bash
cd /Users/kylehoff/Desktop/Thesis && git add -A && git commit -m "$(cat <<'EOF'
phase 3: rewrite agent prompts for prose-with-verdict-box output

- §1 Event Analysis: add data.verdict object; cosmetic vocabulary updates
- §2 Business Analysis (was meaning_checklist): drop data.items[]; add data.verdict
- §3 Moat Analysis (was moat_checklist): drop data.items[]; add data.verdict +
  6-moat-type matrix; preserve all 6 R1 moat types
- §4 Management Analysis (was management_checklist): drop data.items[]; preserve
  data.promises[] for the promoted Promise Tracker
- §5 Valuation Analysis (was valuation_confirmation): add REQUIRED reverse-DCF
  reality check leading the narrative; restructure data with verdict +
  impliedExpectations + buyPrices + growthQualityChecks
- §6 The Debate (was inversion_rebuttal): compose adds REQUIRED "What we're
  monitoring" closing subsection + data.watchpoints[]
- Bull / Rebuttal / Bear / Judge: cosmetic vocabulary updates only
- §7 Trade Plan: NEW agent (agents/trade-plan-finalthesis/) covering position
  sizing, tranching, sell rules, PACE plan, forcing question
- Deleted deprecated combined-role prompts (synthesis-writer-finalthesis,
  risk-analyst-finalthesis) per their own DEPRECATED notice
- All 12 prompts: framework table updated to 7 sections; vocabulary stripped
  of "Full Story" / "Inversion & Rebuttal" / "Checklist" / "Confirmation"

Per pod #4 spec: docs/specs/2026-05-09-final-thesis-redesign.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — SKILL.md orchestration update

**Goal:** Rewrite the `.claude/skills/generate-final-thesis/SKILL.md` orchestration to dispatch the new agent paths, use the new section keys, add the §7 Trade Plan dispatch, and emit `final-thesis.json` instead of `full-story.json`.

### Task 4.1: Update Agent Registry block

**Files:**
- Modify: `.claude/skills/generate-final-thesis/SKILL.md`

- [ ] **Step 1: Replace the AGENT_REGISTRY block**

Find the `## Agent Registry` section. Replace the block with:

```
AGENT_REGISTRY:

  risk-analyst-event:
    prompt: agents/risk-analyst-finalthesis-event/prompt.md
    model: sonnet
    sections: [event_analysis]
    phase: 1
    pdInheritance: [pest, radar]
    dpFields: [companyInfo, classification, financials, ttm, growthRates, peers, insiders, caveats]

  business-analyst:
    prompt: agents/business-analyst-finalthesis/prompt.md
    model: sonnet
    sections: [business_analysis]
    phase: 1
    pdInheritance: [simple_predictable, market_position]
    dpFields: [companyInfo, classification, thesisScore, peers, gurus, financials, ttm, growthRates, caveats]

  competitor-evaluator:
    prompt: agents/competitor-evaluator-finalthesis/prompt.md
    model: sonnet
    sections: [moat_analysis]
    phase: 1
    pdInheritance: [barriers_moats, market_position]
    dpFields: [companyInfo, classification, thesisScore, peers, peerMetrics, financials, ttm, growthRates, caveats]

  management-evaluator:
    prompt: agents/management-evaluator-finalthesis/prompt.md
    model: sonnet
    sections: [management_analysis]
    phase: 1
    pdInheritance: [management, balance_sheet]
    dpFields: [companyInfo, classification, compensation, insiders, gurus, financials, ttm, returnMetrics, caveats]

  valuation-specialist:
    prompt: agents/valuation-specialist-finalthesis/prompt.md
    model: sonnet
    sections: [valuation_analysis]
    phase: 1
    pdInheritance: [fcf, roe_roic_debt, valuation]
    dpFields: [companyInfo, classification, financials, ttm, growthRates, returnMetrics, fcf, keyMetrics, caveats]

  bull:
    prompt: agents/synthesis-writer-finalthesis-bull/prompt.md
    model: sonnet
    sections: []
    phase: 2
    debateRole: bull (Step 1)
    dpFields: []

  bear:
    prompt: agents/risk-analyst-finalthesis-bear/prompt.md
    model: sonnet
    sections: []
    phase: 2
    debateRole: bear (Step 2)
    dpFields: [companyInfo, classification, financials, ttm, growthRates, peers, insiders, caveats]

  rebuttal:
    prompt: agents/synthesis-writer-finalthesis-rebuttal/prompt.md
    model: sonnet
    sections: []
    phase: 2
    debateRole: rebuttal (Step 3)
    dpFields: []

  judge:
    prompt: agents/financial-analyst-finalthesis/prompt.md
    model: sonnet
    sections: []
    phase: 2
    debateRole: judge (Step 4)
    dpFields: []

  compose:
    prompt: agents/synthesis-writer-finalthesis-compose/prompt.md
    model: sonnet
    sections: [debate]
    phase: 2
    debateRole: compose (Final Section 6)
    dpFields: []

  trade-plan:
    prompt: agents/trade-plan-finalthesis/prompt.md
    model: sonnet
    sections: [trade_plan]
    phase: 3
    dpFields: []
```

(Note: `phase: 3` is added for trade-plan to make the new dispatch wave explicit. Phase 1 = parallel deep analysis; Phase 2 = sequential debate; Phase 3 = trade plan after debate composes.)

### Task 4.2: Update PD_INHERITANCE_MAP

**Files:**
- Modify: `.claude/skills/generate-final-thesis/SKILL.md`

- [ ] **Step 1: Replace PD_INHERITANCE_MAP**

Find `## Pitch Deck Inheritance Map`. Replace with:

```
PD_INHERITANCE_MAP:
  event_analysis:        [pest, radar]
  business_analysis:     [simple_predictable, market_position]
  moat_analysis:         [barriers_moats, market_position]
  management_analysis:   [management, balance_sheet]
  valuation_analysis:    [fcf, roe_roic_debt, valuation]
```

(Sections 6 and 7 don't inherit from Pitch Deck — they synthesize from the other Final Thesis sections.)

### Task 4.3: Update Phase Structure block

**Files:**
- Modify: `.claude/skills/generate-final-thesis/SKILL.md`

- [ ] **Step 1: Replace the Phase Structure block**

Old:
```
Phase 1 (Deep Analysis):  risk-analyst + business-analyst + competitor-evaluator + management-evaluator + valuation-specialist  [PARALLEL]
Phase 2 (The Debate):     Bull (synthesis-writer) → Bear (risk-analyst) → Rebuttal (synthesis-writer) → Judge (financial-analyst) → Compose (synthesis-writer)  [SEQUENTIAL]
```

New:
```
Phase 1 (Deep Analysis):  risk-analyst-event + business-analyst + competitor-evaluator + management-evaluator + valuation-specialist  [PARALLEL — 5 Agent dispatches in single message]
Phase 2 (The Debate):     Bull → Bear → Rebuttal → Judge → Compose  [SEQUENTIAL — each step depends on prior step's output]
Phase 3 (Trade Plan):     trade-plan  [SEQUENTIAL — depends on composed Section 6]
```

### Task 4.4: Add Step 7 — Phase 3 Trade Plan Dispatch

**Files:**
- Modify: `.claude/skills/generate-final-thesis/SKILL.md`

- [ ] **Step 1: Insert a new step between Step 6 (Phase 2 debate) and Step 8 (Assemble Final Report)**

After the `### 6g: Compose — Final Section 6 (Synthesis Writer)` subsection completes, insert:

````markdown
## Step 7: Phase 3 — Trade Plan Dispatch

### 7a: Read Trade Plan Prompt

- `agents/trade-plan-finalthesis/prompt.md`

### 7b: Build Trade Plan Context

Trade Plan receives as context:
1. The full Trade Plan agent prompt
2. All 5 Phase 1 section outputs (full JSON) — for buy prices, moat width, KPIs
3. The composed Section 6 (`sections/debate.json`) — for verdict, watchpoints, debate outcome
4. Task instruction (below)

### 7c: Dispatch Trade Plan

Dispatch via Agent tool with the context above and:

```
You are producing Final Thesis Section 7: Trade Plan for {TICKER} ({COMPANY_NAME}).

The 6 prior sections are above. Section 6 (The Debate) has produced the verdict
that gates this section: a FAIL verdict means produce a "no trade" plan; a PASS
or WATCHLIST verdict means produce a real trade plan.

Cover all 5 required components: position sizing, entry tranches, sell rules,
PACE plan, and the closing forcing question. Be concrete — every recommendation
must have a specific number, trigger, and action.

Honor the Section 5 buy price range and the Section 6 watchpoints — the trade
plan inherits from these and must not contradict them.

Return your output as Format A (ReportSectionSchema) JSON with key `trade_plan`,
sectionNumber 7.
```

Wait. Extract COMPLETE JSON, save to `sections/trade_plan.json`. 5-30KB.
````

### Task 4.5: Update Step 8 (Assemble Final Report)

**Files:**
- Modify: `.claude/skills/generate-final-thesis/SKILL.md`

- [ ] **Step 1: Update the assembled-report JSON template**

Find the Step 8 JSON template. Update:
- `"sections"` array — `7` ReportSectionSchema objects (was 6)
- `"sectionKeys"` — replace with `["event_analysis", "business_analysis", "moat_analysis", "management_analysis", "valuation_analysis", "debate", "trade_plan"]`
- File output path — replace `.thesis/reports/{TICKER}/full-story.json` with `.thesis/reports/{TICKER}/final-thesis.json`
- The markdown filename in the second-to-last paragraph — replace `full-story.md` with `final-thesis.md`

Example of the relevant lines:

Old:
```
"sectionKeys": ["event_analysis", "meaning_checklist", "moat_checklist", "management_checklist", "valuation_confirmation", "inversion_rebuttal"],
```

New:
```
"sectionKeys": ["event_analysis", "business_analysis", "moat_analysis", "management_analysis", "valuation_analysis", "debate", "trade_plan"],
```

### Task 4.6: Update Step 10 (Generate PDF)

**Files:**
- Modify: `.claude/skills/generate-final-thesis/SKILL.md`

- [ ] **Step 1: Update the PDF generation block**

Old:
```bash
cp .thesis/reports/{TICKER}/full-story.json .thesis/reports/{TICKER}/full-story-api.json
python3 scripts/pdf/generate_full_story_pdf.py {TICKER}
```

New:
```bash
cp .thesis/reports/{TICKER}/final-thesis.json .thesis/reports/{TICKER}/final-thesis-api.json
python3 scripts/pdf/generate_final_thesis_pdf.py {TICKER}
```

### Task 4.7: Update Step 11 (Auto-Archive)

**Files:**
- Modify: `.claude/skills/generate-final-thesis/SKILL.md`

- [ ] **Step 1: Update the archive paths**

Old:
```bash
cp .thesis/reports/{TICKER}/full-story.json .thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp .thesis/reports/{TICKER}/full-story-api.json .thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp .thesis/reports/{TICKER}/sections/debate-*.json .thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
```

New:
```bash
cp .thesis/reports/{TICKER}/final-thesis.json .thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp .thesis/reports/{TICKER}/final-thesis-api.json .thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp .thesis/reports/{TICKER}/sections/debate-*.json .thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
cp .thesis/reports/{TICKER}/sections/trade_plan.json .thesis/reports/{TICKER}/archive/${ARCHIVE_ID}/ 2>/dev/null
```

### Task 4.8: Update Step 12 (Print Summary)

**Files:**
- Modify: `.claude/skills/generate-final-thesis/SKILL.md`

- [ ] **Step 1: Update the summary template**

Find the Step 12 print summary. Change "sections completed (X/6)" to "sections completed (X/7)" to reflect the new count.

### Task 4.9: Sweep SKILL.md for any remaining old references

- [ ] **Step 1: Grep**

```bash
grep -nE "full-story|fullstory|full_story|inversion_rebuttal|meaning_checklist|moat_checklist|management_checklist|valuation_confirmation|Inversion & Rebuttal|Meaning Checklist|Moat Checklist|Management Checklist|Valuation Confirmation|Full Story" /Users/kylehoff/Desktop/Thesis/.claude/skills/generate-final-thesis/SKILL.md
```
Expected: 0 matches.

- [ ] **Step 2: Sanity-read the file**

Read the file end-to-end. Confirm the flow is consistent: 7 sections, the AGENT_REGISTRY uses new agent paths, the sectionKeys array has 7 entries, all output paths use `final-thesis.*`, the Phase 3 trade-plan dispatch is wired in.

### Task 4.10: Pause for user approval; commit Phase 4

- [ ] **Step 1: Show diff**

```bash
cd /Users/kylehoff/Desktop/Thesis && git diff --stat .claude/skills/generate-final-thesis/SKILL.md
```

- [ ] **Step 2: Ask user approval**

Tell the user: "Phase 4 (SKILL.md orchestration) complete. AGENT_REGISTRY updated, PD_INHERITANCE_MAP updated, Phase 3 Trade Plan dispatch wired in, output paths use final-thesis.*, summary references 7 sections. Ready to commit?"

- [ ] **Step 3: Commit (only after approval)**

```bash
cd /Users/kylehoff/Desktop/Thesis && git add -A && git commit -m "$(cat <<'EOF'
phase 4: rewrite SKILL.md orchestration for 7-section Final Thesis

- AGENT_REGISTRY: 11 agents (was 7) — split deprecated combined-role
  registrations, add trade-plan agent
- PD_INHERITANCE_MAP: keys updated to new section names
- Phase Structure: 3 phases (was 2) — Phase 3 = Trade Plan after debate
- New Step 7: Phase 3 Trade Plan dispatch
- Step 8 assembly: 7 sections, new sectionKeys, final-thesis.json output
- Step 10 PDF generation: final-thesis paths
- Step 11 auto-archive: includes trade_plan.json
- Step 12 summary: X/7 (was X/6)

Per pod #4 spec: docs/specs/2026-05-09-final-thesis-redesign.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — PDF and DOCX template work

**Goal:** Update `scripts/pdf/generate_final_thesis_pdf.py`, `generate_final_thesis_docx.py`, and `section_renderers.py` to drop checklist rendering, add the verdict-box visual, promote the Promise Tracker as a standalone subsection, render the reverse-DCF lead paragraph in §5, render the watchpoints subsection in §6 Compose, and render the new §7 Trade Plan.

### Task 5.1: Add verdict-box renderer to section_renderers.py

**Files:**
- Modify: `scripts/pdf/section_renderers.py`

- [ ] **Step 1: Add `render_verdict_box(pdf, section)` helper**

Append to `scripts/pdf/section_renderers.py`:

```python
def render_verdict_box(pdf, section):
    """
    Renders the prose-section verdict box: a small bordered call-out
    with the structured `data.verdict` object's fields plus an overall
    PASS/WATCHLIST/FAIL stamp. Renders nothing if data.verdict is missing.
    """
    data = section.get('data', {})
    if isinstance(data, str):
        # data may arrive as a JSON string from the schema; parse it
        import json
        try:
            data = json.loads(data)
        except Exception:
            return
    verdict = data.get('verdict')
    if not isinstance(verdict, dict):
        return

    overall = verdict.get('overall', 'WATCHLIST')
    color_map = {
        'PASS': (31, 122, 90),
        'WATCHLIST': (181, 138, 0),
        'FAIL': (161, 58, 58),
    }
    r, g, b = color_map.get(overall, (85, 85, 85))

    pdf.ln(4)
    pdf.set_draw_color(r, g, b)
    pdf.set_line_width(0.4)
    pdf.set_fill_color(250, 250, 250)
    box_top = pdf.get_y()

    # Heading
    pdf.set_text_color(r, g, b)
    pdf.set_font('Helvetica', 'B', 11)
    title = section.get('title', 'Section') + ' verdict'
    pdf.cell(0, 6, title, ln=True)

    # Verdict-detail lines
    pdf.set_text_color(60, 60, 60)
    pdf.set_font('Helvetica', '', 10)
    for key, value in verdict.items():
        if key == 'overall':
            continue
        label = key.replace('_', ' ').replace(camel_to_words(key), camel_to_words(key))
        pdf.cell(0, 5, f"  {camel_to_words(key)}: {value}", ln=True)

    # Overall stamp
    pdf.ln(1)
    pdf.set_text_color(r, g, b)
    pdf.set_font('Helvetica', 'B', 11)
    pdf.cell(0, 6, f"Verdict: {overall}", ln=True)

    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Helvetica', '', 10)
    pdf.ln(4)


def camel_to_words(s):
    """Convert camelCase or snake_case to 'Title Words'."""
    import re
    s = s.replace('_', ' ')
    s = re.sub(r'([a-z])([A-Z])', r'\1 \2', s)
    return s[:1].upper() + s[1:]
```

(Adapt the API style to match how other render helpers in this file are written — the explorer report didn't show the existing helper signatures, but the pattern of "take pdf object, take section dict, mutate pdf state" is standard for fpdf-style libraries.)

### Task 5.2: Drop CHECKLIST_KEYS / CHECKLIST_SECTIONS handling

**Files:**
- Modify: `scripts/pdf/generate_final_thesis_docx.py` line ~41
- Modify: `scripts/pdf/section_renderers.py` (delete the `render_checklist_items` function if it exists)
- Modify: `scripts/pdf/generate_final_thesis_pdf.py` (delete checklist render calls if any)

- [ ] **Step 1: Locate and delete CHECKLIST_SECTIONS in DOCX generator**

Edit `scripts/pdf/generate_final_thesis_docx.py`. Around line 41 find:
```python
CHECKLIST_SECTIONS = {'meaning_checklist', 'moat_checklist', 'management_checklist'}
```

Delete this constant. Then find any `if section_key in CHECKLIST_SECTIONS:` blocks and remove them — sections §§2-4 should fall through to the standard prose+verdict-box render path.

- [ ] **Step 2: Delete `render_checklist_items` from section_renderers.py**

```bash
grep -n "render_checklist_items\|def render_checklist" /Users/kylehoff/Desktop/Thesis/scripts/pdf/section_renderers.py
```

If a `render_checklist_items` function exists, delete it. Then grep for any remaining call sites and remove those too.

- [ ] **Step 3: Verify**

```bash
grep -nE "checklist_items|CHECKLIST_SECTIONS|CHECKLIST_KEYS|render_checklist" /Users/kylehoff/Desktop/Thesis/scripts/pdf/
```
Expected: 0 matches.

### Task 5.3: Wire verdict_box into the main render loop

**Files:**
- Modify: `scripts/pdf/generate_final_thesis_pdf.py`
- Modify: `scripts/pdf/generate_final_thesis_docx.py`

- [ ] **Step 1: PDF: add verdict_box call after each prose section's render**

In `scripts/pdf/generate_final_thesis_pdf.py`, find the section render loop (the part that iterates `report.sections` and calls `render_narrative` etc.). After `render_narrative(pdf, section)` (or equivalent), call:

```python
from section_renderers import render_verdict_box
# ... inside the loop, after narrative + tables + redflags ...
render_verdict_box(pdf, section)
```

Apply this for every section EXCEPT `debate` and `trade_plan` (which have their own renderers per Tasks 5.5 and 5.6).

- [ ] **Step 2: DOCX: same pattern in the docx generator**

Same pattern in `generate_final_thesis_docx.py`. The DOCX equivalent of `render_verdict_box` may need to be a separate helper using the docx library's table/paragraph APIs. Add `render_verdict_box_docx(doc, section)` to `docx_helpers.py` (or wherever DOCX helpers live) and call it after the standard section render.

### Task 5.4: Add Promise Tracker as a standalone subsection in §4 render

**Files:**
- Modify: `scripts/pdf/generate_final_thesis_pdf.py`
- Modify: `scripts/pdf/generate_final_thesis_docx.py`

- [ ] **Step 1: PDF: after rendering §4 (`management_analysis`), render the promises table as a subsection**

In the PDF render loop, after `render_verdict_box(pdf, section)` for §4, add:

```python
if section.get('key') == 'management_analysis':
    data = section.get('data', {})
    if isinstance(data, str):
        import json
        try:
            data = json.loads(data)
        except Exception:
            data = {}
    promises = data.get('promises', [])
    if promises:
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 7, 'Management Promise Tracker', ln=True)
        pdf.set_font('Helvetica', '', 10)
        # Render as a 5-column table: Quarter / Category / Promise / Evidence / Status
        col_widths = [25, 25, 60, 50, 20]
        headers = ['Quarter', 'Category', 'Promise', 'Evidence', 'Status']
        for i, h in enumerate(headers):
            pdf.cell(col_widths[i], 6, h, border=1)
        pdf.ln(6)
        for p in promises:
            pdf.cell(col_widths[0], 6, p.get('quarterYear', ''), border=1)
            pdf.cell(col_widths[1], 6, p.get('category', ''), border=1)
            pdf.cell(col_widths[2], 6, p.get('quote', '')[:50], border=1)
            pdf.cell(col_widths[3], 6, p.get('evidence', '')[:40], border=1)
            pdf.cell(col_widths[4], 6, p.get('status', ''), border=1)
            pdf.ln(6)
```

(If `promise_tracker` already had a separate top-level render block in the existing PDF generator, refactor to consolidate: render only ONCE, here as a §4 subsection.)

- [ ] **Step 2: DOCX: equivalent**

Same pattern in `generate_final_thesis_docx.py` using the docx library's `add_table` API.

### Task 5.5: Trade Plan render

**Files:**
- Modify: `scripts/pdf/generate_final_thesis_pdf.py`
- Modify: `scripts/pdf/generate_final_thesis_docx.py`
- Modify: `scripts/pdf/section_renderers.py` (add `render_trade_plan`)

- [ ] **Step 1: Add `render_trade_plan(pdf, section)` to section_renderers.py**

Append:

```python
def render_trade_plan(pdf, section):
    """
    Renders Section 7 Trade Plan: position sizing, tranches table,
    sell rules list, PACE plan, forcing question.
    """
    data = section.get('data', {})
    if isinstance(data, str):
        import json
        try:
            data = json.loads(data)
        except Exception:
            data = {}

    # Position sizing
    if data.get('positionSizing'):
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 7, 'Position Sizing', ln=True)
        pdf.set_font('Helvetica', '', 10)
        pdf.multi_cell(0, 5, data['positionSizing'])
        pdf.ln(2)

    # Tranches table
    tranches = data.get('tranches', [])
    if tranches:
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 7, 'Entry Tranches', ln=True)
        pdf.set_font('Helvetica', '', 10)
        col_widths = [25, 25, 35, 95]
        for h in ['Tranche', 'Size', 'Trigger Price', 'Rationale']:
            pdf.cell(col_widths[['Tranche', 'Size', 'Trigger Price', 'Rationale'].index(h)], 6, h, border=1)
        pdf.ln(6)
        for t in tranches:
            pdf.cell(col_widths[0], 6, str(t.get('tranche', '')), border=1)
            pdf.cell(col_widths[1], 6, str(t.get('size', '')), border=1)
            pdf.cell(col_widths[2], 6, str(t.get('triggerPrice', '')), border=1)
            pdf.cell(col_widths[3], 6, str(t.get('rationale', ''))[:80], border=1)
            pdf.ln(6)
        pdf.ln(2)

    # Sell rules
    sell_rules = data.get('sellRules', [])
    if sell_rules:
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 7, 'Sell Rules', ln=True)
        pdf.set_font('Helvetica', '', 10)
        for r in sell_rules:
            line = f"  • {r.get('trigger', '')}: {r.get('action', '')}"
            if r.get('threshold'):
                line += f" (threshold: {r['threshold']})"
            pdf.multi_cell(0, 5, line)
        pdf.ln(2)

    # PACE plan
    pace = data.get('pacePlan')
    if pace:
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 7, 'PACE Plan', ln=True)
        pdf.set_font('Helvetica', '', 10)
        for label in ['primary', 'alternative', 'contingency', 'emergency']:
            value = pace.get(label, '')
            if value:
                pdf.multi_cell(0, 5, f"  • {label.capitalize()}: {value}")
        pdf.ln(2)

    # Forcing question
    fq = data.get('forcingQuestion')
    if fq:
        pdf.set_font('Helvetica', 'I', 11)
        pdf.set_fill_color(245, 245, 240)
        pdf.multi_cell(0, 6, fq, fill=True)
        pdf.set_font('Helvetica', '', 10)
        pdf.ln(2)
```

- [ ] **Step 2: PDF: dispatch to render_trade_plan when section.key == 'trade_plan'**

In the PDF generator's section loop, add a special case:

```python
if section.get('key') == 'trade_plan':
    render_narrative(pdf, section)  # standard prose first
    render_trade_plan(pdf, section)  # then structured trade plan visuals
    continue  # skip standard verdict box (trade plan has no verdict)
```

- [ ] **Step 3: DOCX: equivalent**

Add `render_trade_plan_docx(doc, section)` helper in `docx_helpers.py` and dispatch from `generate_final_thesis_docx.py`.

### Task 5.6: Watchpoints render in §6 Compose

**Files:**
- Modify: `scripts/pdf/generate_final_thesis_pdf.py`
- Modify: `scripts/pdf/generate_final_thesis_docx.py`

- [ ] **Step 1: PDF: after rendering the §6 debate, render watchpoints**

In the PDF generator, find the existing `_render_debate` (or equivalent debate-render) code path. After the existing render completes, add:

```python
def render_watchpoints(pdf, section):
    """Render the 'What we're monitoring' subsection at the end of §6."""
    data = section.get('data', {})
    if isinstance(data, str):
        import json
        try:
            data = json.loads(data)
        except Exception:
            data = {}
    watchpoints = data.get('watchpoints', [])
    if not watchpoints:
        return
    pdf.set_font('Helvetica', 'B', 12)
    pdf.cell(0, 7, "What we're monitoring", ln=True)
    pdf.set_font('Helvetica', '', 10)
    for wp in watchpoints:
        line = f"  • {wp.get('metric', '')}. Currently {wp.get('currentValue', '')}. Re-evaluate if {'drops below' if wp.get('direction') == 'below' else 'rises above'} {wp.get('threshold', '')}."
        if wp.get('sourceInversionId') is not None:
            line += f" (Source: Bear inversion #{wp['sourceInversionId']}.)"
        pdf.multi_cell(0, 5, line)
    pdf.ln(2)
```

Call `render_watchpoints(pdf, section)` after the existing debate render and before the verdict box (or after if the debate doesn't get a verdict box — which it does, since the Compose output is a standard ReportSectionSchema).

- [ ] **Step 2: DOCX: equivalent**

Same pattern using the docx library APIs.

### Task 5.7: Reverse-DCF lead paragraph in §5 render

**Files:**
- Modify: `scripts/pdf/generate_final_thesis_pdf.py`
- Modify: `scripts/pdf/generate_final_thesis_docx.py`

The reverse-DCF paragraph is part of the section's `narrative` field (the agent prompt requires it as the FIRST paragraph). So no special render handling is needed — the existing `render_narrative` call will surface it as the lead.

- [ ] **Step 1: Verify the narrative renderer doesn't truncate or skip the lead paragraph**

Read `render_narrative` in `section_renderers.py`. Confirm it renders the full narrative without truncation. If it truncates (e.g., shows only the first 500 chars), remove the truncation for §5 — the reverse-DCF paragraph plus the 5 stress tests can run 600+ words.

- [ ] **Step 2: Optionally promote the implied-expectations data structure as a small visual**

If `data.impliedExpectations` is present in §5, optionally render it as a small fact box right under the narrative lead paragraph (before the rest of the narrative continues). This is optional polish; skip if it would add complexity.

### Task 5.8: Smoke-test the PDF and DOCX generators against an archived report

**Files:**
- None modified

- [ ] **Step 1: Find an archived report**

```bash
ls /Users/kylehoff/.thesis/reports/ 2>/dev/null || ls /Users/kylehoff/Desktop/Thesis/.thesis/reports/ 2>/dev/null
```
Expected: at least one ticker folder. If none exist, the smoke test moves to Phase 6 (run the full skill end-to-end).

- [ ] **Step 2: If a report exists, generate PDF + DOCX**

Pick a ticker (e.g., `LULU`). Confirm `final-thesis.json` exists for it (might be the renamed `full-story.json` from Phase 1). Then run:

```bash
cd /Users/kylehoff/Desktop/Thesis
python3 scripts/pdf/generate_final_thesis_pdf.py LULU
python3 scripts/pdf/generate_final_thesis_docx.py LULU
```

Expected: both succeed without error.

- [ ] **Step 3: Open the outputs and eyeball**

Open the produced `final-thesis.pdf` and `final-thesis.docx`. Confirm:
- §§1-5 render with prose followed by a verdict box (or a graceful absence of verdict box if the legacy data has no `data.verdict`).
- §4 has the Promise Tracker as a standalone subsection table.
- §6 (Debate) renders without crashing; "What we're monitoring" section shows if `data.watchpoints` exists, otherwise omits gracefully.
- §7 (Trade Plan) renders if the legacy data has it (it won't — Phase 6 is the first time this section gets generated).

### Task 5.9: Pause for user approval; commit Phase 5

- [ ] **Step 1: Show diff**

```bash
cd /Users/kylehoff/Desktop/Thesis && git status --short && git diff --stat scripts/pdf/
```

- [ ] **Step 2: Ask user**

Tell the user: "Phase 5 (PDF/DOCX templates) complete. Verdict-box helper added, checklist rendering removed, Promise Tracker promoted as §4 subsection, Trade Plan render added, watchpoints render added to §6. Smoke-test on archived report passed. Ready to commit?"

- [ ] **Step 3: Commit (only after approval)**

```bash
cd /Users/kylehoff/Desktop/Thesis && git add -A && git commit -m "$(cat <<'EOF'
phase 5: rewrite PDF and DOCX templates for Final Thesis

- Add render_verdict_box helper to section_renderers (PDF + DOCX equivalents)
- Drop CHECKLIST_SECTIONS / render_checklist_items everywhere
- Wire verdict_box into the main render loop after each prose section
- Promote Promise Tracker as a §4 subsection table (5 cols)
- Add render_trade_plan for §7 (position sizing, tranches table, sell rules,
  PACE plan, forcing question)
- Add render_watchpoints for the §6 Compose closing subsection
- §5 reverse-DCF lead paragraph requires no special handling — it lives in
  the narrative field per the agent prompt

Renders gracefully against legacy reports: missing verdict / watchpoints /
trade plan structures simply omit those visuals.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — End-to-end verification

**Goal:** Run `/generate-final-thesis` against a real ticker that has a passing Pitch Deck, and verify the output matches the spec at every gate.

### Task 6.1: Pre-flight check

- [ ] **Step 1: Confirm a Pitch Deck exists for a test ticker**

```bash
ls /Users/kylehoff/Desktop/Thesis/.thesis/reports/*/pitch-deck.json 2>/dev/null
```

Expected: at least one `pitch-deck.json`. Pick a ticker whose pitch deck verdict is PASS or WATCHLIST (not FAIL — Final Thesis gate-checks this).

If no Pitch Deck exists for any ticker, generate one first:
```bash
# In Claude Code:
/analyze LULU
# (or whatever ticker)
```
Wait for One Pager + Pitch Deck to complete and PASS. Then continue.

### Task 6.2: Run the new skill

- [ ] **Step 1: Invoke the skill**

In Claude Code, run:
```
/generate-final-thesis LULU
```
(Or the ticker chosen in Task 6.1.)

- [ ] **Step 2: Wait for completion**

The pipeline runs:
- Phase 1: 5 parallel agents (deep analysis)
- Phase 2: 5 sequential debate steps (Bull → Bear → Rebuttal → Judge → Compose)
- Phase 3: Trade Plan agent (new)
- Then PDF + DOCX generation + auto-archive

Expected completion time: roughly the same as the prior `/generate-full-story` plus 2-5 minutes for the new Trade Plan dispatch.

### Task 6.3: Verify output structure

- [ ] **Step 1: Check the output JSON**

```bash
cd /Users/kylehoff/Desktop/Thesis
jq '.sectionKeys' .thesis/reports/LULU/final-thesis.json
jq '.sections | map(.key)' .thesis/reports/LULU/final-thesis.json
```

Expected: both arrays are `["event_analysis", "business_analysis", "moat_analysis", "management_analysis", "valuation_analysis", "debate", "trade_plan"]`.

- [ ] **Step 2: Check no checklist artifact survived**

```bash
jq '.sections | map(.data.items)' .thesis/reports/LULU/final-thesis.json
```

Expected: all entries are `null` (no agent emitted a `data.items` array). If any are non-null, the corresponding agent prompt didn't get fully rewritten — return to Phase 3 and fix.

- [ ] **Step 3: Check the verdict box data is present in §§1-5**

```bash
jq '.sections | map({key, hasVerdict: (.data.verdict != null)})' .thesis/reports/LULU/final-thesis.json
```

Expected: §§1-5 all show `"hasVerdict": true`. If false for any, that agent prompt's Output Format spec wasn't followed — re-run that agent (the SKILL.md has retry logic) or fix the prompt.

- [ ] **Step 4: Check §6 has watchpoints**

```bash
jq '.sections[] | select(.key == "debate") | .data.watchpoints' .thesis/reports/LULU/final-thesis.json
```

Expected: an array (possibly empty if the Judge produced 0 unresolved). If `null`, the Compose prompt wasn't followed.

- [ ] **Step 5: Check §7 Trade Plan is present and structured**

```bash
jq '.sections[] | select(.key == "trade_plan") | .data | keys' .thesis/reports/LULU/final-thesis.json
```

Expected: keys include at minimum `positionSizing`, `tranches`, `sellRules`, `pacePlan`, `forcingQuestion`. (For a FAIL verdict, the structure may be reduced — see the trade-plan prompt's "If Section 6 verdict is FAIL" branch.)

### Task 6.4: Verify the rendered PDF

- [ ] **Step 1: Open the PDF**

```bash
open /Users/kylehoff/Desktop/Thesis/.thesis/reports/LULU/final-thesis.pdf
```

(macOS open command. If on a different OS, use the equivalent.)

- [ ] **Step 2: Visually verify against the spec**

Walk the PDF and confirm:

- [ ] **Stage name** reads "Final Thesis" (not "Full Story") in the title and headers.
- [ ] **§§1-5** each render with prose narrative followed by a small bordered verdict box. No 15-row PASS/FAIL tables anywhere.
- [ ] **§4 Management Analysis** has the Promise Tracker as a standalone table subsection (Quarter / Category / Promise / Evidence / Status).
- [ ] **§5 Valuation Analysis** opens with the reverse-DCF paragraph ("At $X, the market is pricing in N% revenue growth..."), THEN the 5 stress tests, THEN the buy price summary, THEN the verdict box.
- [ ] **§6 The Debate** ends with a "What we're monitoring" subsection listing watchpoints with thresholds.
- [ ] **§7 Trade Plan** is present with: position sizing line, entry tranches table, sell rules list, PACE plan, italicized forcing question at the bottom.
- [ ] **No R1 vocabulary** appears anywhere — no "Rule One", "Phil Town", "R1", "Investment Story Form", "Inversion & Rebuttal", "Meaning Checklist", "Moat Checklist", "Management Checklist", "Valuation Confirmation".

If any item fails, return to the relevant phase and fix.

### Task 6.5: Verify the rendered DOCX

- [ ] **Step 1: Open and walk the DOCX**

```bash
open /Users/kylehoff/Desktop/Thesis/.thesis/reports/LULU/final-thesis.docx
```

Apply the same checklist as Task 6.4. Both PDF and DOCX must pass.

### Task 6.6: Verify the UI render

- [ ] **Step 1: Boot dev server and load the report**

```bash
cd /Users/kylehoff/Desktop/Thesis && npm run dev
```

Open `http://localhost:5173`. Navigate to the Final Thesis view for the test ticker. Apply the same content checklist as Tasks 6.4 and 6.5.

- [ ] **Step 2: Kill the dev server**

### Task 6.7: Verify the archive

- [ ] **Step 1: Check the archive directory**

```bash
ls /Users/kylehoff/Desktop/Thesis/.thesis/reports/LULU/archive/
```

Expected: the most recent timestamped folder contains `final-thesis.json`, `final-thesis-api.json`, `debate-step-*.json`, `trade_plan.json`, and `final-thesis.pdf` (and `final-thesis.docx` if generated).

### Task 6.8: Update STEPS.md to mark implementation complete

**Files:**
- Modify: `STEPS.md`

- [ ] **Step 1: Update the pod #4 entry**

Find the line:
```markdown
- [x] **Final Thesis (formerly Full Story) — spec locked 2026-05-09.** See [docs/specs/2026-05-09-final-thesis-redesign.md](docs/specs/2026-05-09-final-thesis-redesign.md). Implementation pending; gates W2 semantic UI rewrite for Stage 3 components.
```

Replace with:
```markdown
- [x] **Final Thesis (formerly Full Story) — spec locked 2026-05-09; implementation complete YYYY-MM-DD.** See [docs/specs/2026-05-09-final-thesis-redesign.md](docs/specs/2026-05-09-final-thesis-redesign.md) and [docs/plans/2026-05-09-final-thesis-implementation.md](docs/plans/2026-05-09-final-thesis-implementation.md). W2 semantic UI rewrite for Stage 3 components is unblocked.
```

(Substitute `YYYY-MM-DD` with the actual completion date.)

### Task 6.9: Pause for user approval; commit Phase 6

- [ ] **Step 1: Show diff**

```bash
cd /Users/kylehoff/Desktop/Thesis && git status --short
```

- [ ] **Step 2: Ask user**

Tell the user: "Phase 6 (end-to-end verification) complete. Final Thesis pipeline runs end-to-end on LULU (or test ticker), all 7 sections render correctly in JSON / PDF / DOCX / UI, no R1 vocabulary survived. STEPS.md updated. Ready to commit Phase 6 and close pod #4?"

- [ ] **Step 3: Commit (only after approval)**

```bash
cd /Users/kylehoff/Desktop/Thesis && git add -A && git commit -m "$(cat <<'EOF'
phase 6: Final Thesis verified end-to-end; pod #4 implementation complete

Ran /generate-final-thesis against LULU (or chosen test ticker). All 7 sections
emitted with new keys, prose-with-verdict-box render confirmed in JSON and PDF
and DOCX and UI. No checklist scorecards anywhere. §4 Promise Tracker promoted
as standalone subsection. §5 leads with reverse-DCF reality check. §6 closes
with "What we're monitoring" watchpoints. §7 Trade Plan present with position
sizing, tranches, sell rules, PACE plan, forcing question.

STEPS.md updated to mark pod #4 implementation complete; W2 semantic UI
rewrite for Stage 3 components is now unblocked.

Per pod #4 spec: docs/specs/2026-05-09-final-thesis-redesign.md
Per pod #4 plan: docs/plans/2026-05-09-final-thesis-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

This plan was self-reviewed against the spec [docs/specs/2026-05-09-final-thesis-redesign.md](../specs/2026-05-09-final-thesis-redesign.md) before publication:

**Spec coverage check:**
- Stage rename: covered in Phase 1 (mass mechanical rename across all surfaces).
- §1 Event Analysis prose+verdict-box: Tasks 3.4 (prompt) + 5.1, 5.3 (render).
- §2 Business Analysis (was meaning_checklist): Tasks 2.2-2.4 (UI), 3.1 (prompt), 5.1-5.3 (render).
- §3 Moat Analysis (R1's 6 moat types preserved): Task 3.2 documents the matrix structure preserving all 6 types.
- §4 Management Analysis with promoted Promise Tracker: Tasks 2.6 (UI), 3.3 (prompt), 5.4 (render).
- §5 Valuation Analysis with reverse-DCF lead: Task 3.5 specifies the new prompt requirement; Task 5.7 confirms render.
- §5 buy-price methods (MOS / PBT / Ten Cap / Equity Bond) intact: Task 3.5 preserves them in the data structure.
- §5 NO Bond Comparison table: explicitly verified at end of Task 3.5.
- §6 The Debate (renamed from Inversion & Rebuttal): Tasks 2.7 (UI), 3.6-3.7 (prompts), 5.6 (render).
- §6 Bull Thesis name preserved: Task 3.7 explicitly preserves it.
- §6 Watchpoints subsection: Tasks 2.7 (UI), 3.6 (prompt), 5.6 (render).
- §7 Trade Plan (new): Tasks 2.5 (UI), 3.9 (new agent), 5.5 (render).
- All 6 R1 moat types kept (not 5): Task 3.2 lists all 6.
- ReportSectionSchema unchanged: confirmed in file structure table; no Phase touches `src/schemas/reportSection.js`.
- KEY_NORMALIZATION cleanup: Task 2.3 updates the FullStory copy → FinalThesis (PD copy left alone per scope).
- STEPS.md updated: Task 6.8.

**Out-of-scope items confirmed not implemented:**
- Bond Comparison table: not added.
- VIC variant-perception spine: not added.
- Greenwald Asset/EPV/Franchise/Growth tiers: not added.
- Pat Dorsey 4-source moat taxonomy: not added (Width/Trend rubric in §3 verdict box is the only borrow).
- "Bull Thesis" → "Investment Thesis" rename: not done.
- 6 → 5 moat types: not done.

**Type consistency check:**
- Section keys consistent across all phases: `event_analysis`, `business_analysis`, `moat_analysis`, `management_analysis`, `valuation_analysis`, `debate`, `trade_plan`.
- Agent paths consistent: `agents/{role}-finalthesis/prompt.md` for all (with `-event` and `-bear` suffixes for risk-analyst sub-roles, and `-bull`, `-rebuttal`, `-compose` suffixes for synthesis-writer sub-roles).
- Output filenames consistent: `final-thesis.json`, `final-thesis.md`, `final-thesis-api.json`, `final-thesis.pdf`, `final-thesis.docx`.
- API URL paths consistent: `/api/thesis/reports/{ticker}/final-thesis`, `/api/thesis/reports/{ticker}/final-thesis-quality`.

**Placeholder scan:** no `TBD` / `TODO` / `implement later` / `add appropriate error handling` / "similar to Task N" placeholders found in the action steps.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-05-09-final-thesis-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (recommended for a 50+ task plan)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Reduces context bloat in the main session.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
