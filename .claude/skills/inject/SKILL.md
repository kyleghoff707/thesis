---
name: inject
description: Push locally-generated reports for a ticker to your Thesis website account
argument-hint: TICKER
disable-model-invocation: true
---

# Inject

Push locally-generated reports for a ticker to your Thesis website account.

## Step 1: Validate input

The ticker symbol is `$0`. Uppercase it and store as `TICKER`.

- If `$0` is empty, print `Usage: /inject TICKER` and stop.
- Validate `TICKER` before running any command. It must match `^[A-Z0-9]+([.-][A-Z0-9]+)?$` and be 12 characters or fewer (examples: `AAPL`, `BRK.B`, `BF-B`). If it does not match, print `Invalid ticker` and stop.

## Step 2: Run the inject script

Run:
```bash
node scripts/inject-report.mjs --ticker {TICKER}
```

Pass stdout and the exit code through to the user.
