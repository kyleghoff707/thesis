import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
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

if (IS_NODE) {
  globalThis.DOMParser = class NodeDOMParser {
    parseFromString(content, type) {
      return createDOMParser().parseFromString(content, type);
    }
  };

  globalThis.__nodeTranscriptRead = readBundledTranscript;
  globalThis.__nodeBundledTranscriptsExist = hasBundledTranscripts;
}
