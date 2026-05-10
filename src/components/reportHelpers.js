// Shared formatting functions for all report viewers (OnePager, PitchDeck, FinalThesis)
// Single source of truth — eliminates duplication across stage components

import { C } from '../theme';

// --- Title & Time Formatters ---

// Strip /NEW, /DE, /OLD suffixes and title-case the result
export function formatTitle(name) {
  if (!name) return '';
  // Remove trailing / followed by common suffixes (case-insensitive)
  const cleaned = name.replace(/\s*\/(NEW|DE|OLD)\s*$/i, '').trim();
  // Title case: capitalize first letter of each word, lowercase the rest
  return cleaned
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Return human-readable relative time from ISO date string
export function formatRelativeTime(isoDate) {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// --- Progress State ---

// Map progress state enum to human-readable label
export function stateToLabel(state) {
  const map = {
    IDLE: 'Preparing...',
    DATA_ASSEMBLY: 'Assembling data...',
    PRIMARY_SOURCE_READING: 'Reading primary sources...',
    WAVE_1_RUNNING: 'Phase 1: Business Fundamentals...',
    WAVE_2_RUNNING: 'Phase 2: Financial Deep-Dive...',
    WAVE_3_RUNNING: 'Phase 3: Risk & Valuation...',
    SYNTHESIS: 'Writing synthesis...',
    QUALITY_CHECK: 'Quality check...',
    COMPLETE: 'Complete',
  };
  return map[state] || 'Working...';
}

// --- Verdict Colors ---

// Map verdict string to theme palette color
export function verdictDotColor(verdict) {
  const map = {
    PASS: C.green,
    FAIL: C.red,
    WATCHLIST: C.yellow,
    REVIEW: C.accent,
  };
  return map[verdict] || C.textMuted;
}

// --- Data Grid Formatters ---

// Dollar-related key patterns
const DOLLAR_KEYS = /revenue|income|debt|assets|cash|capex|market_cap|book_value|earnings|fcf|price|cost|expense|profit|ebitda|ebit|sales|liabilities|equity|dividend|owner_earnings|sticker|buy_price/i;
// Percentage-related key patterns
const PCT_KEYS = /margin|ratio|yield|growth|return|pct|rate|roe|roic|roa|cagr/i;

// Abbreviate large numbers: 1,234,567,890 -> "1.23B"
export function fmtNum(n) {
  if (n == null || isNaN(n)) return '--';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
  return sign + abs.toFixed(2);
}

export function fmtDollar(n) {
  if (n == null || isNaN(n)) return '--';
  return '$' + fmtNum(n);
}

export function fmtPct(n) {
  if (n == null || isNaN(n)) return '--';
  // If value is already in percentage form (e.g., 45.2), display as-is
  // If value is in decimal form (e.g., 0.452), multiply by 100
  const val = Math.abs(n) < 1 && Math.abs(n) > 0 ? n * 100 : n;
  return val.toFixed(1) + '%';
}

// Format data value based on key and type -- applies smart formatting
export function formatDataValue(key, value) {
  if (value == null) return '--';
  if (value === '--' || value === '') return '--';

  const keyLower = (key || '').toLowerCase();
  const isFGR = keyLower.includes('fgr');
  const isPrice = keyLower.includes('price');

  // Range object with low/high
  if (typeof value === 'object' && value.low != null && value.high != null) {
    if (isFGR) {
      return `${(value.low * 100).toFixed(1)}% - ${(value.high * 100).toFixed(1)}%`;
    }
    return `$${value.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - $${value.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Single number -- apply smart formatting based on key patterns
  if (typeof value === 'number') {
    if (isFGR) return `${(value * 100).toFixed(1)}%`;
    if (isPrice) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (DOLLAR_KEYS.test(keyLower)) return fmtDollar(value);
    if (PCT_KEYS.test(keyLower)) return fmtPct(value);
    if (Math.abs(value) > 1000) return fmtNum(value);
    return value.toFixed(2);
  }

  // String
  if (typeof value === 'string') return value;

  return '--';
}
