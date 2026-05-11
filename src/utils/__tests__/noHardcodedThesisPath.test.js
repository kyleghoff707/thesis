// Regression test: catches the recurring Phase 3 bug class where top-level
// scripts hardcode '<repo>/.thesis/' instead of using the ~/thesis/ helpers.
//
// Three rounds of investigate had to clean this up:
//   - 1st round: 7 scripts (assemble-data, prepare-data, preprocess-filings,
//     run-quality-v4, slice-datapacket, prefetch-gurus, inject-report)
//   - 2nd round: data-quality-checkpoint.js + the entire scripts/pdf/ layer
//
// This test guards: any new script that hardcodes the old project-local path
// fails CI, surfacing the bug before it ships.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPTS_DIR = join(process.cwd(), 'scripts');

// Pattern that matches any string literal containing '.thesis/' — this is the
// shape of the bug: hardcoding a project-local path instead of using
// src/utils/thesisDir.js (JS) or scripts/pdf/thesis_dir.py (Python).
//
// Bare comments mentioning ".thesis/" are fine; only quoted/templated paths
// are flagged.
const FORBIDDEN = /['"`]\.thesis\//;

function walk(dir, extensions) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      out.push(...walk(path, extensions));
    } else if (extensions.some(ext => name.endsWith(ext))) {
      out.push(path);
    }
  }
  return out;
}

describe('no hardcoded .thesis/ paths in top-level scripts', () => {
  it('every script under scripts/ uses thesisDir / thesis_dir helpers, not raw .thesis/', () => {
    const files = walk(SCRIPTS_DIR, ['.js', '.mjs', '.cjs', '.py']);
    const offenders = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (FORBIDDEN.test(lines[i])) {
          offenders.push(`${file}:${i + 1}  ${lines[i].trim()}`);
        }
      }
    }
    expect(offenders, `Found hardcoded '.thesis/' paths — should use thesisDir.js or thesis_dir.py:\n${offenders.join('\n')}`).toEqual([]);
  });
});
