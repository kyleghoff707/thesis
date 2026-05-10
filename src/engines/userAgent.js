// Single User-Agent constant for SEC EDGAR + other identified-fetch APIs.
// SEC enforces an email-format UA — URL-only or no-email returns 403. The default
// is a real inbox on a project domain (not a personal Gmail). Users may override
// via ~/thesis/config.json { "userAgent": "..." } to surface their own contact info.
//
// Caveat: appending anything after the email (e.g. " (+https://...)") also returns
// 403. The string must end with the email.

import { configPath } from '../utils/thesisDir.js';
import { readFileSync, existsSync } from 'node:fs';

const DEFAULT_UA = 'Thesis CLI/0.1 kyle@thesis-investing.com';

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
