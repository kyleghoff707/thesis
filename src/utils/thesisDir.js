// Single source of truth for ~/thesis/ paths.
// All engines, scripts, and tests resolve paths through this helper.
//
// Default: $HOME/thesis (visible folder, cross-platform).
// Override: set THESIS_DIR=/some/path to relocate (CI, alt drive, dev).

import os from 'node:os';
import path from 'node:path';
import { safeTickerDir } from './safeTickerDir.js';

export function thesisHome() {
  return process.env.THESIS_DIR || path.join(os.homedir(), 'thesis');
}

export function reportsDir(ticker) {
  if (!ticker) return path.join(thesisHome(), 'reports');
  return path.join(thesisHome(), 'reports', safeTickerDir(ticker));
}

export function cacheDir(ticker) {
  if (!ticker) return path.join(thesisHome(), 'cache');
  return path.join(thesisHome(), 'cache', safeTickerDir(ticker));
}

export function configPath() {
  return path.join(thesisHome(), 'config.json');
}
