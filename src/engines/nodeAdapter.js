import dotenv from 'dotenv';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseHTML } from 'linkedom';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

export const IS_NODE = typeof window === 'undefined';

export function getEnv(key) {
  return process.env[key]?.trim() || '';
}

export function isDev() {
  return false;
}

export function createDOMParser() {
  return {
    parseFromString(content) {
      const { document } = parseHTML(content);
      return document;
    },
  };
}

const TRANSCRIPTS_DIR = join(process.cwd(), 'transcripts');

export function readBundledTranscript(ticker, year, quarter) {
  const path = join(TRANSCRIPTS_DIR, ticker, String(year), `Q${quarter}.md`);
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, 'utf8');
    return { text, meta: { source: 'repo', year, quarterNum: quarter } };
  } catch {
    return null;
  }
}

export function hasBundledTranscripts(ticker) {
  if (!ticker || typeof ticker !== 'string') return false;
  return existsSync(join(TRANSCRIPTS_DIR, ticker.toUpperCase()));
}

// List every bundled transcript on disk for a ticker by scanning the corpus
// directory. Returns [{ year, quarter }] sorted newest-first. This reads the
// actual files rather than guessing fiscal quarters from filing dates, so a
// company's fiscal-calendar quirks can never cause a bundled transcript to be
// missed — if it's in the folder, it gets found.
export function listBundledTranscripts(ticker) {
  if (!ticker || typeof ticker !== 'string') return [];
  const dir = join(TRANSCRIPTS_DIR, ticker.toUpperCase());
  if (!existsSync(dir)) return [];
  const found = [];
  let yearDirs;
  try {
    yearDirs = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of yearDirs) {
    if (!entry.isDirectory()) continue;
    const year = Number(entry.name);
    if (!Number.isInteger(year)) continue;
    let files;
    try {
      files = readdirSync(join(dir, entry.name));
    } catch {
      continue;
    }
    for (const file of files) {
      const match = /^Q([1-4])\.md$/.exec(file);
      if (match) found.push({ year, quarter: Number(match[1]) });
    }
  }
  found.sort((a, b) => b.year - a.year || b.quarter - a.quarter);
  return found;
}

if (IS_NODE) {
  globalThis.DOMParser = class NodeDOMParser {
    parseFromString(content, type) {
      return createDOMParser().parseFromString(content, type);
    }
  };

  globalThis.__nodeTranscriptRead = readBundledTranscript;
  globalThis.__nodeBundledTranscriptsExist = hasBundledTranscripts;
  globalThis.__nodeListBundledTranscripts = listBundledTranscripts;
}
