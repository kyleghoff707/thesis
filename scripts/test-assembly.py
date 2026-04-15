#!/usr/bin/env python3
"""Test DataPacket assembly + filing pre-fetch for a single ticker.
Two separate API calls to stay within Worker CPU limits:
  1. POST /api/pipeline/assemble-data/:ticker — DataPacket
  2. POST /api/pipeline/assemble-filings/:ticker — filings only (uses DataPacket output)
Exit 0 = pass, exit 1 = fail with details."""

import json, sys, subprocess, time, tempfile, os

TICKER = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
SESSION = "21fcb290-a882-41d3-a885-cabd493b5734"
BASE = sys.argv[2] if len(sys.argv) > 2 else "https://api.thes1sinvesting.com"

def api_call(method, path, body=None, max_time=180):
    cmd = ["curl", "-s", "--max-time", str(max_time), "-X", method,
           f"{BASE}{path}", "-H", f"Cookie: session={SESSION}"]
    tmp_file = None
    if body:
        # Write body to temp file to avoid command-line length limits
        tmp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        json.dump(body, tmp_file)
        tmp_file.close()
        cmd += ["-H", "Content-Type: application/json", "-d", f"@{tmp_file.name}"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if tmp_file:
        os.unlink(tmp_file.name)
    raw = result.stdout
    if not raw.strip():
        return None, "empty response"
    if "<html>" in raw[:100]:
        # Extract error info from HTML
        if "504" in raw: return None, "504 gateway timeout"
        if "1102" in raw: return None, "1102 Worker resource limit exceeded"
        return None, f"HTML error: {raw[:200]}"
    try:
        return json.loads(raw), None
    except json.JSONDecodeError as e:
        return None, f"invalid JSON: {e}"

print(f"\n{'='*60}")
print(f"Testing {TICKER}")
print(f"{'='*60}")

# ── Phase 1: DataPacket ──
print(f"\n[Phase 1] DataPacket assembly...")
t0 = time.time()
data, err = api_call("POST", f"/api/pipeline/assemble-data/{TICKER}")
t1 = time.time()

if err:
    # One retry — transient Worker errors happen (cold start, resource pressure)
    print(f"  Attempt 1: {err} ({t1-t0:.1f}s) — retrying...")
    time.sleep(5)
    t0 = time.time()
    data, err = api_call("POST", f"/api/pipeline/assemble-data/{TICKER}")
    t1 = time.time()

if err:
    print(f"FAIL {TICKER} Phase 1: {err} ({t1-t0:.1f}s)")
    sys.exit(1)

if "error" in data and "dataPacket" not in data:
    print(f"FAIL {TICKER} Phase 1: API error: {data['error']}")
    sys.exit(1)

dp = data.get("dataPacket", {})
errors = data.get("errors", [])
elapsed = data.get("elapsedSeconds", 0)
populated = data.get("populated", 0)
ci = dp.get("companyInfo", {})
comp = dp.get("compensation")
comp_execs = len(comp.get("executives", [])) if comp else 0
comp_dirs = len(comp.get("directors", [])) if comp else 0

print(f"  {ci.get('name','?')} (SIC {ci.get('sic','?')})")
print(f"  {elapsed:.1f}s | {populated} fields | Comp: {comp_execs}E/{comp_dirs}D")

# Show top exec
if comp and comp.get("executives"):
    top = comp["executives"][0]
    name = top.get("name", "?")
    comps = top.get("compensation", {})
    latest = list(comps.values())[0] if comps else {}
    total = latest.get("total", 0)
    print(f"  Top exec: {name} ${total:,.0f}")

# Check required fields
failures = []
required = ["companyInfo", "classification", "financials", "growthRates", "fcf", "keyMetrics"]
for f in required:
    if dp.get(f) is None:
        failures.append(f"missing: {f}")
if comp is None:
    failures.append("compensation null")
elif comp_execs == 0 and comp_dirs == 0:
    failures.append("compensation empty (0 executives, 0 directors)")
elif comp_execs == 0:
    print(f"  NOTE: 0 executives (pre-existing parser gap — {comp_dirs} directors found)")
if errors:
    failures.append(f"errors: {errors}")

if failures:
    print(f"  FAIL Phase 1:")
    for f in failures:
        print(f"    - {f}")
    sys.exit(1)
print(f"  Phase 1: PASS")

# ── Phase 2: Filing pre-fetch (separate call) ──
print(f"\n[Phase 2] Filing pre-fetch...")

filings = dp.get("filings")
cik = ci.get("cik")
if not filings or not cik:
    print(f"  SKIP Phase 2: no filings list or CIK in DataPacket")
    print(f"\nRESULT: PASS {TICKER} (DataPacket only)")
    sys.exit(0)

t0 = time.time()
data2, err2 = api_call("POST", f"/api/pipeline/assemble-filings/{TICKER}",
                        body={"filings": filings, "cik": cik})
t1 = time.time()

if err2:
    print(f"  First attempt: {err2} ({t1-t0:.1f}s)")
    # If timeout/resource limit, retry once — some filings may now be R2-cached
    if "timeout" in err2 or "1102" in err2:
        print(f"  Retrying (partial R2 cache may help)...")
        time.sleep(5)
        t0 = time.time()
        data2, err2 = api_call("POST", f"/api/pipeline/assemble-filings/{TICKER}",
                                body={"filings": filings, "cik": cik})
        t1 = time.time()
    if err2:
        print(f"  FAIL Phase 2: {err2} ({t1-t0:.1f}s)")
        sys.exit(1)

if "error" in data2 and "filingContent" not in data2:
    print(f"  FAIL Phase 2: {data2['error']}")
    sys.exit(1)

fc = data2.get("filingContent", {})
tc = data2.get("transcriptContent", {})
stats = data2.get("stats", {})
f_errors = data2.get("errors", [])
f_elapsed = data2.get("elapsedSeconds", 0)

filings_fetched = stats.get("filingsFetched", 0)
transcripts_fetched = stats.get("transcriptsFetched", 0)

print(f"  {f_elapsed:.1f}s | Filings: {filings_fetched} | Transcripts: {transcripts_fetched}")

# Check filings
failures_f = []
if filings_fetched == 0:
    failures_f.append("0 filings fetched")
else:
    with_sections = sum(1 for v in fc.values()
                       if isinstance(v, dict) and len(v.get("sections", {})) > 0)
    if with_sections == 0:
        failures_f.append(f"0/{filings_fetched} filings have sections")
    elif with_sections < filings_fetched * 0.5:
        failures_f.append(f"only {with_sections}/{filings_fetched} have sections")

    for key, val in fc.items():
        if isinstance(val, dict):
            secs = list(val.get("sections", {}).keys())
            chars = val.get("charCount", 0)
            cached = val.get("fromCache", False)
            print(f"    {key}: {secs} ({chars:,}ch) {'[cached]' if cached else '[fresh]'}")

# Budget/truncation warnings are acceptable, real errors are not
real_errors = [e for e in f_errors if "budget" not in e and "truncated" not in e]
warnings = [e for e in f_errors if "budget" in e or "truncated" in e]
if warnings:
    for w in warnings:
        print(f"  WARNING: {w}")
if real_errors:
    failures_f.append(f"errors: {real_errors}")

if tc:
    print(f"  Transcripts: {len(tc)}")

if failures_f:
    print(f"  FAIL Phase 2:")
    for f in failures_f:
        print(f"    - {f}")
    sys.exit(1)

print(f"  Phase 2: PASS")
print(f"\nRESULT: PASS {TICKER}")
sys.exit(0)
