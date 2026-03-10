#!/usr/bin/env python3
"""
Layer 3: Key metrics comparison.
Compares Thes1s computed metrics against yfinance .info dict
(which provides ~15 comparable key ratios).

Usage: python3 validation/layer3_metrics.py [TICKER...]
If no tickers given, processes all exported JSON files in data/thesis/.
"""

import json, os, sys, time
from pathlib import Path
from datetime import datetime

import yfinance as yf

# ─── Paths ─────────────────────────────────────────────────────
ROOT = Path(__file__).parent
THESIS_DIR = ROOT / "data" / "thesis"
REPORT_DIR = ROOT / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

# ─── yfinance .info → Thes1s key metrics mapping ──────────────
# yfinance .info key → (thesis category, thesis metric name, scale factor)
# scale factor: 1 = direct compare, 100 = yfinance is decimal (0.25 = 25%)
YF_INFO_MAP = {
    # Profitability (yfinance returns as decimal, e.g., 0.25 = 25%)
    "returnOnEquity":       ("profitability", "roe", 100),
    "returnOnAssets":       ("profitability", "roa", 100),
    "grossMargins":         ("profitability", "grossMargin", 100),
    "operatingMargins":     ("profitability", "operatingMargin", 100),
    "profitMargins":        ("profitability", "profitMarginTotal", 100),

    # Liquidity
    "currentRatio":         ("liquidity", "currentRatio", 1),
    "quickRatio":           ("liquidity", "quickRatio", 1),

    # Debt (yfinance debtToEquity is a percentage, e.g., 102.63 = 102.63%)
    # Our debtToTotalCapital is different concept, skip
    # Our ltDebtToEquity is ratio not %, so multiply yf by 0.01
    "debtToEquity":         ("debtRatios", "ltDebtToEquity", 0.01),

    # Per share
    "bookValue":            ("perShare", "bookValuePerShare", 1),
    "trailingEps":          ("perShare", "dilutedEPS", 1),
    "revenuePerShare":      ("perShare", "salesPerShare", 1),

    # Operating
    "operatingCashflow":    ("perShare", "operatingCFPerShare", None),  # skip — different units

    # Price metrics — our export doesn't have these (requires current price)
    # so skip for now
}


def load_thesis_data(ticker):
    """Load exported Thes1s data."""
    path = THESIS_DIR / f"{ticker}.json"
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def fetch_yf_info(ticker):
    """Fetch yfinance .info dict for key metrics comparison."""
    try:
        t = yf.Ticker(ticker)
        info = t.info
        return info
    except Exception as e:
        print(f"    yfinance .info error for {ticker}: {e}")
        return None


def compare_metrics(ticker, thesis_data, yf_info):
    """Compare Thes1s key metrics against yfinance .info for latest year."""
    comparisons = []

    if not thesis_data.get("keyMetrics"):
        return comparisons

    # Use the latest year for comparison
    years = thesis_data.get("years", [])
    if not years:
        return comparisons
    latest_year = str(years[0])

    thesis_metrics = thesis_data["keyMetrics"].get(latest_year, {})
    if not thesis_metrics:
        return comparisons

    for yf_key, (thesis_cat, thesis_metric, scale) in YF_INFO_MAP.items():
        yf_val = yf_info.get(yf_key)
        if yf_val is None or yf_val == "Infinity" or yf_val == "-Infinity":
            continue

        try:
            yf_val = float(yf_val)
        except (ValueError, TypeError):
            continue

        # Get thesis value from nested category
        thesis_cat_data = thesis_metrics.get(thesis_cat, {})
        thesis_val = thesis_cat_data.get(thesis_metric)
        if thesis_val is None:
            continue

        # Skip entries with None scale (not comparable)
        if scale is None:
            continue

        # Scale yfinance value if needed (decimal → percentage)
        yf_val_scaled = yf_val * scale

        # Compare
        thesis_abs = abs(thesis_val)
        yf_abs = abs(yf_val_scaled)

        if thesis_abs == 0 and yf_abs == 0:
            pct_diff = 0
            status = "match"
        elif thesis_abs == 0 or yf_abs == 0:
            pct_diff = 100
            status = "major"
        else:
            pct_diff = abs(thesis_abs - yf_abs) / max(thesis_abs, yf_abs) * 100
            if pct_diff < 1:
                status = "match"
            elif pct_diff < 5:
                status = "minor"
            elif pct_diff < 15:
                status = "warning"
            else:
                status = "major"

        comparisons.append({
            "ticker": ticker,
            "year": int(latest_year),
            "metric": thesis_metric,
            "category": thesis_cat,
            "source": "yfinance",
            "thesis_val": round(thesis_val, 4),
            "other_val": round(yf_val_scaled, 4),
            "pct_diff": round(pct_diff, 2),
            "status": status,
            "yf_key": yf_key,
        })

    return comparisons


def run_validation(tickers):
    """Run Layer 3 validation for a list of tickers."""
    all_comparisons = []
    ticker_summaries = []

    for i, ticker in enumerate(tickers):
        print(f"\n[{i+1}/{len(tickers)}] {ticker}")

        thesis_data = load_thesis_data(ticker)
        if not thesis_data:
            print(f"  No Thes1s export — skip")
            continue

        print(f"  Fetching yfinance .info...")
        yf_info = fetch_yf_info(ticker)
        if not yf_info:
            print(f"  No yfinance data — skip")
            time.sleep(0.5)
            continue

        comps = compare_metrics(ticker, thesis_data, yf_info)
        all_comparisons.extend(comps)

        if comps:
            n_match = sum(1 for c in comps if c["status"] == "match")
            n_minor = sum(1 for c in comps if c["status"] == "minor")
            n_warn = sum(1 for c in comps if c["status"] == "warning")
            n_major = sum(1 for c in comps if c["status"] == "major")
            total = len(comps)
            match_pct = round(n_match / total * 100, 1) if total > 0 else 0
            avg_diff = round(sum(c["pct_diff"] for c in comps) / total, 2) if total > 0 else 0

            ticker_summaries.append({
                "ticker": ticker,
                "total": total,
                "match": n_match,
                "minor": n_minor,
                "warning": n_warn,
                "major": n_major,
                "match_pct": match_pct,
                "avg_diff": avg_diff,
            })
            print(f"  {total} metrics: ✓{n_match} ~{n_minor} ⚠{n_warn} ✗{n_major} ({match_pct}% match)")
        else:
            print(f"  No comparable metrics")

        time.sleep(0.5)

    return all_comparisons, ticker_summaries


def generate_report(all_comparisons, ticker_summaries):
    """Generate summary reports."""
    ts = datetime.now().strftime("%Y-%m-%d_%H%M")

    # Save raw comparisons
    raw_path = REPORT_DIR / f"layer3_raw_{ts}.json"
    with open(raw_path, "w") as f:
        json.dump(all_comparisons, f, indent=2)

    # Save summaries
    summary_path = REPORT_DIR / f"layer3_summary_{ts}.json"
    with open(summary_path, "w") as f:
        json.dump(ticker_summaries, f, indent=2)

    if not all_comparisons:
        print("\nNo comparisons to report.")
        return

    total = len(all_comparisons)
    by_status = {}
    for c in all_comparisons:
        by_status[c["status"]] = by_status.get(c["status"], 0) + 1

    print(f"\n{'='*60}")
    print(f"LAYER 3 KEY METRICS REPORT — {ts}")
    print(f"{'='*60}")
    print(f"\nTotal metric comparisons: {total}")
    print(f"  Match (<1%):   {by_status.get('match', 0):5d} ({by_status.get('match', 0)/total*100:.1f}%)")
    print(f"  Minor (1-5%):  {by_status.get('minor', 0):5d} ({by_status.get('minor', 0)/total*100:.1f}%)")
    print(f"  Warning (5-15%): {by_status.get('warning', 0):5d} ({by_status.get('warning', 0)/total*100:.1f}%)")
    print(f"  Major (>15%):  {by_status.get('major', 0):5d} ({by_status.get('major', 0)/total*100:.1f}%)")

    avg_diff = sum(c["pct_diff"] for c in all_comparisons) / total
    print(f"\nAverage difference: {avg_diff:.2f}%")

    # Per-metric breakdown
    metric_stats = {}
    for c in all_comparisons:
        m = c["metric"]
        if m not in metric_stats:
            metric_stats[m] = {"total": 0, "match": 0, "diffs": []}
        metric_stats[m]["total"] += 1
        if c["status"] == "match":
            metric_stats[m]["match"] += 1
        metric_stats[m]["diffs"].append(c["pct_diff"])

    print(f"\n{'─'*60}")
    print(f"PER-METRIC MATCH RATES:")
    print(f"{'─'*60}")
    print(f"{'Metric':<30} {'Match%':>7} {'AvgDiff':>8} {'N':>5}")
    for metric, stats in sorted(metric_stats.items(), key=lambda x: x[1]["match"] / max(x[1]["total"], 1)):
        match_pct = stats["match"] / stats["total"] * 100 if stats["total"] > 0 else 0
        avg = sum(stats["diffs"]) / len(stats["diffs"]) if stats["diffs"] else 0
        print(f"  {metric:<28} {match_pct:>6.1f}% {avg:>7.2f}% {stats['total']:>5}")

    # Per-ticker (worst first)
    print(f"\n{'─'*60}")
    print(f"PER-TICKER SUMMARY (sorted by match %):")
    print(f"{'─'*60}")
    print(f"{'Ticker':<8} {'Total':>6} {'Match':>6} {'Minor':>6} {'Warn':>6} {'Major':>6} {'Match%':>7}")
    for s in sorted(ticker_summaries, key=lambda x: x["match_pct"]):
        print(f"  {s['ticker']:<6} {s['total']:>6} {s['match']:>6} {s['minor']:>6} {s['warning']:>6} {s['major']:>6} {s['match_pct']:>6.1f}%")

    # Major discrepancies
    majors = [c for c in all_comparisons if c["status"] == "major"]
    if majors:
        print(f"\n{'─'*60}")
        print(f"MAJOR DISCREPANCIES (>15%):")
        print(f"{'─'*60}")
        for c in sorted(majors, key=lambda x: -x["pct_diff"]):
            print(f"  {c['ticker']:<6} {c['metric']:<25} Thesis: {c['thesis_val']:>12.2f}  yf: {c['other_val']:>12.2f}  ({c['pct_diff']:.1f}%)")

    print(f"\nReports saved to: {REPORT_DIR}/")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args:
        tickers = [t.upper() for t in args]
    else:
        tickers = sorted([f.stem for f in THESIS_DIR.glob("*.json")])

    if not tickers:
        print("No exported data found. Run export-financials.mjs first.")
        sys.exit(1)

    print(f"Layer 3 Validation: {len(tickers)} tickers")
    print(f"Source: yfinance .info (key ratios)")

    all_comps, summaries = run_validation(tickers)
    generate_report(all_comps, summaries)
