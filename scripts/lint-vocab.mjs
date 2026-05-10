#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const TIER_1_PHRASES = [
  'Three Ms',
  '3 Ms framework',
  'Wonderful Company',
  'Six-Inch Bar',
  'Six Inch Bar',
  'Big Audacious Goal',
  'BAG',
  'Rulers',
  'value investing Rulers',
];

const TIER_2_PHRASES = [
  'Sticker price',
  'sticker price',
];

const SCHEMA_FIELDS = [
  'ruleOneMethod',
  'stickerPriceLow',
  'stickerPriceHigh',
  'stickerPrice',
  'ceo.bag',
  '"bag":',
  '"bag" :',
];

const BANNED = [...TIER_1_PHRASES, ...TIER_2_PHRASES, ...SCHEMA_FIELDS];

const SCAN_GLOBS = [
  'agents/business-analyst-pitchdeck/prompt.md',
  'agents/competitor-evaluator-market-position-pitchdeck/prompt.md',
  'agents/competitor-evaluator-moats-pitchdeck/prompt.md',
  'agents/financial-analyst-pitchdeck/prompt.md',
  'agents/management-evaluator-pitchdeck/prompt.md',
  'agents/risk-analyst-pitchdeck/prompt.md',
  'agents/valuation-specialist-pitchdeck/prompt.md',
  'agents/synthesis-writer-pitchdeck/prompt.md',
  '.claude/skills/generate-pitch-deck/SKILL.md',
];

// Schema-field phrases need exact-case matching (e.g., "BAG" must not match "bag" inside
// "subagent"); prose phrases match case-insensitively. We use word boundaries on every
// pattern so substring matches inside legitimate words ("subagent", "manager") don't fire.
const SCHEMA_FIELD_SET = new Set(SCHEMA_FIELDS);
// Acronyms that should match case-sensitively (avoid hits on lowercase substrings).
const CASE_SENSITIVE_ACRONYMS = new Set(['BAG']);

export function scanFileForBannedPhrases(content, banned, filePath) {
  const violations = [];
  const lines = content.split('\n');
  for (const phrase of banned) {
    const isCaseSensitive = SCHEMA_FIELD_SET.has(phrase) || CASE_SENSITIVE_ACRONYMS.has(phrase);
    const flags = isCaseSensitive ? 'g' : 'gi';
    // \b is word-boundary; \B?\b allows leading punctuation like ".bag" to match too.
    const re = new RegExp('\\b' + escapeRegex(phrase) + '\\b', flags);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        violations.push({ file: filePath, line: i + 1, phrase, snippet: lines[i].trim().slice(0, 120) });
      }
    }
  }
  return violations;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function main() {
  const allViolations = [];
  for (const rel of SCAN_GLOBS) {
    const abs = join(repoRoot, rel);
    try {
      const content = readFileSync(abs, 'utf8');
      allViolations.push(...scanFileForBannedPhrases(content, BANNED, rel));
    } catch (err) {
      console.warn(`[lint-vocab] could not read ${rel}: ${err.message}`);
    }
  }
  if (allViolations.length === 0) {
    console.log('[lint-vocab] OK — no banned phrases found.');
    return 0;
  }
  console.error(`[lint-vocab] FOUND ${allViolations.length} violations:`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}  "${v.phrase}"  — ${v.snippet}`);
  }
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
