// Postbuild guardrail. Fails the build if any secret-shaped string appears
// in dist/. Run automatically after `vite build` via npm script.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

// Patterns that should NEVER appear in the public bundle.
// VITE_*_KEY (any var ending in _KEY) catches the "env object dump" bug.
// Provider prefixes catch raw secrets in case a key sneaks in some other way.
const PATTERNS = [
  { name: 'VITE_*_KEY env reference', re: /VITE_[A-Z0-9_]*KEY[A-Z0-9_]*\s*[:=]\s*["']/g },
  { name: 'Anthropic key', re: /sk-ant-api03-[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI key', re: /sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/g },
  { name: 'Stripe live key', re: /sk_live_[A-Za-z0-9]{20,}/g },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9_]{30,}/g },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(js|html|css|json|map)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(DIST);
let leaked = false;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    const matches = [...content.matchAll(re)];
    if (matches.length === 0) continue;
    leaked = true;
    console.error(`\n  LEAK in ${file}`);
    console.error(`     pattern: ${name}`);
    for (const m of matches.slice(0, 3)) {
      const preview = m[0].length > 60 ? m[0].slice(0, 60) + '…' : m[0];
      console.error(`     match:   ${preview}`);
    }
    if (matches.length > 3) console.error(`     (and ${matches.length - 3} more)`);
  }
}

if (leaked) {
  console.error('\nBundle scan FAILED — do not deploy. Fix the leaks above.\n');
  process.exit(1);
}

console.log(`Bundle scan OK — ${files.length} files checked, no secrets detected.`);
