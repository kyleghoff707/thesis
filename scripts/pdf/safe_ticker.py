"""Cross-platform ticker -> directory name sanitizer.

Mirrors src/utils/safeTickerDir.js so JS and Python agree on directory layout.
"""

import re

RESERVED = re.compile(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$', re.IGNORECASE)
TICKER_PATTERN = re.compile(r'^[A-Z0-9]+([.-][A-Z0-9]+)?$')
MAX_TICKER_LENGTH = 12


def normalize_ticker(ticker: str) -> str:
    normalized = ticker.strip().upper() if isinstance(ticker, str) else ''
    if not normalized:
        raise ValueError('Ticker is required')
    if len(normalized) > MAX_TICKER_LENGTH or not TICKER_PATTERN.match(normalized):
        raise ValueError('Invalid ticker. Use letters/numbers with one optional dot or dash, e.g. AAPL, BRK.B, or BF-B.')
    return normalized


def safe_ticker_dir(ticker: str) -> str:
    if not isinstance(ticker, str) or not ticker.strip():
        raise ValueError('safe_ticker_dir: ticker must be a non-empty string')
    cleaned = ticker.upper()
    cleaned = re.sub(r'[^A-Z0-9._-]', '_', cleaned)
    cleaned = re.sub(r'^\.+', '_', cleaned)
    if RESERVED.match(cleaned):
        cleaned = cleaned + '_'
    return cleaned
