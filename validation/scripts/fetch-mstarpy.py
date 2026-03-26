#!/usr/bin/env python3
"""Pre-fetch Morningstar data for 50 truth set companies via mstarpy.

Fetches income statement, balance sheet, and cash flow (annual, restated)
for each ticker and saves to validation/data/mstarpy/{TICKER}.json.

Usage:
    python validation/scripts/fetch-mstarpy.py
    python validation/scripts/fetch-mstarpy.py AAPL MSFT  # specific tickers only
"""

import json
import sys
import os
import time

try:
    from mstarpy import Stock
except ImportError:
    print("ERROR: mstarpy not installed. Run: pip install mstarpy", file=sys.stderr)
    sys.exit(1)

TICKERS = [
    "AAPL", "AMAT", "AMT", "AMZN", "BA", "BOOT", "BRK-B", "CMG", "COST", "CPRT",
    "CRM", "DAL", "DINO", "EQIX", "EW", "GOOGL", "INTU", "JNJ", "JPM", "LEN",
    "LULU", "MET", "META", "MLI", "MNST", "MSFT", "MU", "NEE", "NEM", "NKE",
    "NVDA", "O", "ODFL", "PG", "POOL", "RACE", "SBUX", "SFM", "T", "TSCO",
    "TXRH", "ULTA", "UNH", "V", "WFC", "WMS", "WSM", "XOM", "XPEL", "XYZ",
]

# BRK-B needs special handling for mstarpy (uses BRK.B)
TICKER_ALIASES = {
    "BRK-B": "BRK.B",
}

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "mstarpy")


def fetch_ticker(ticker):
    """Fetch all 3 statements for a single ticker."""
    search_term = TICKER_ALIASES.get(ticker, ticker)
    s = Stock(term=search_term)

    income = s.incomeStatement(period="annual", reportType="restated")
    balance = s.balanceSheet(period="annual", reportType="restated")
    cf = s.cashFlow(period="annual", reportType="restated")

    return {
        "_cachedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ticker": ticker,
        "income": income,
        "balance": balance,
        "cashFlow": cf,
    }


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Allow filtering to specific tickers via CLI args
    tickers = sys.argv[1:] if len(sys.argv) > 1 else TICKERS

    ok_count = 0
    err_count = 0

    for ticker in tickers:
        outfile = os.path.join(OUTPUT_DIR, f"{ticker}.json")
        try:
            data = fetch_ticker(ticker)
            with open(outfile, "w") as f:
                json.dump(data, f, default=str, indent=2)
            print(f"OK  {ticker}")
            ok_count += 1
            time.sleep(1)  # Be polite to Morningstar
        except Exception as e:
            print(f"ERR {ticker}: {e}", file=sys.stderr)
            err_count += 1

    print(f"\nDone: {ok_count} OK, {err_count} ERR out of {len(tickers)} tickers")


if __name__ == "__main__":
    main()
