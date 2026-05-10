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

// Test-only: reset the singleton cache between tests.
export function _resetUserAgentCache() {
  cached = null;
}
