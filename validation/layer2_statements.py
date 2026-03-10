#!/usr/bin/env python3
"""
Layer 2: Third-party financial statement comparison.
Compares Thes1s EDGAR-extracted values against yfinance (Yahoo Finance)
and mstarpy (Morningstar) for cross-validation.

Usage: python3 validation/layer2_statements.py [TICKER...]
If no tickers given, processes all exported JSON files in data/thesis/.
"""

import json, os, sys, time, traceback
from pathlib import Path
from datetime import datetime

import yfinance as yf
import mstarpy

# ─── Paths ─────────────────────────────────────────────────────
ROOT = Path(__file__).parent
THESIS_DIR = ROOT / "data" / "thesis"
YF_DIR = ROOT / "data" / "yfinance"
MS_DIR = ROOT / "data" / "mstarpy"
REPORT_DIR = ROOT / "reports"

for d in [YF_DIR, MS_DIR, REPORT_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ─── Field Mappings ────────────────────────────────────────────
# Maps yfinance row names → Thes1s field names + statement type
YF_INCOME_MAP = {
    "Total Revenue":           "revenues",
    "Cost Of Revenue":         "cost_of_revenue",
    "Gross Profit":            "gross_profit",
    "Operating Income":        "operating_income_loss",
    "Operating Expense":       "operating_expenses",
    "Selling General And Administration": "sga",
    "Research And Development": "research_and_development",
    "Interest Expense":        "interest_expense",
    "Interest Income":         "interest_income",
    "Pretax Income":           "income_before_tax",
    "Tax Provision":           "income_tax",
    "Net Income":              "net_income_loss",
    "Net Income Including Noncontrolling Interests": "net_income_including_nci",
    "EBIT":                    "ebit",
    "EBITDA":                  "ebitda",
    "Diluted EPS":             "diluted_earnings_per_share",
    "Basic EPS":               "basic_earnings_per_share",
    "Diluted Average Shares":  "diluted_average_shares",
    "Basic Average Shares":    "basic_average_shares",
}

YF_BALANCE_MAP = {
    "Total Assets":            "assets",
    "Current Assets":          "current_assets",
    "Total Non Current Assets": "non_current_assets",
    "Cash And Cash Equivalents": "cash",
    "Other Short Term Investments": "short_term_investments",
    "Accounts Receivable":     "accounts_receivable",
    "Inventory":               "inventory",
    "Net PPE":                 "property_plant_equipment",
    "Accounts Payable":        "accounts_payable",
    "Current Liabilities":     "current_liabilities",
    "Total Non Current Liabilities Net Minority Interest": "non_current_liabilities",
    "Total Liabilities Net Minority Interest": "liabilities",
    "Stockholders Equity":     "equity_attributable_to_parent",
    "Long Term Debt":          "long_term_debt",
    "Current Debt":            "short_term_debt",
    "Total Debt":              "total_debt",
    "Net Debt":                "net_debt",
    "Retained Earnings":       "retained_earnings",
    "Working Capital":         "working_capital",
    "Invested Capital":        "invested_capital",
    "Common Stock Equity":     "equity_attributable_to_parent",
}

YF_CASHFLOW_MAP = {
    "Operating Cash Flow":     "net_cash_flow_from_operating_activities",
    "Capital Expenditure":     "capital_expenditures",
    "Free Cash Flow":          "free_cash_flow",
    "Investing Cash Flow":     "net_cash_flow_from_investing_activities",
    "Financing Cash Flow":     "net_cash_flow_from_financing_activities",
    "Depreciation And Amortization": "depreciation_and_amortization",
    "Stock Based Compensation": "stock_based_compensation",
    "Changes In Cash":         "net_change_in_cash",
    "Repurchase Of Capital Stock": "share_repurchases",
    "Common Stock Dividend Paid": "dividends_paid",
}

# mstarpy field labels → Thes1s fields (mstarpy values in millions)
MS_INCOME_MAP = {
    "Total Revenue":           "revenues",
    "Cost of Goods Sold":      "cost_of_revenue",
    "Gross Profit":            "gross_profit",
    "Operating Income":        "operating_income_loss",
    "Interest Expense":        "interest_expense",
    "Pretax Income":           "income_before_tax",
    "Net Income":              "net_income_loss",
    "Diluted EPS":             "diluted_earnings_per_share",
    "Basic EPS":               "basic_earnings_per_share",
    "Diluted Shares":          "diluted_average_shares",
    "Basic Shares":            "basic_average_shares",
}

MS_BALANCE_MAP = {
    "Total Assets":            "assets",
    "Current Assets":          "current_assets",
    "Cash and Cash Equivalents": "cash",
    "Accounts Receivable":     "accounts_receivable",
    "Inventories":             "inventory",
    "Net Property, Plant and Equipment": "property_plant_equipment",
    "Accounts Payable":        "accounts_payable",
    "Current Liabilities":     "current_liabilities",
    "Total Liabilities":       "liabilities",
    "Stockholders' Equity":    "equity_attributable_to_parent",
    "Long-Term Debt":          "long_term_debt",
    "Retained Earnings":       "retained_earnings",
}

MS_CASHFLOW_MAP = {
    "Cash from Operating Activities": "net_cash_flow_from_operating_activities",
    "Capital Expenditure":     "capital_expenditures",
    "Free Cash Flow":          "free_cash_flow",
    "Cash from Investing Activities": "net_cash_flow_from_investing_activities",
    "Cash from Financing Activities": "net_cash_flow_from_financing_activities",
}

# Fields that are per-share (not scaled by mstarpy millions factor)
PER_SHARE_FIELDS = {
    "diluted_earnings_per_share", "basic_earnings_per_share",
    "dividends_per_share",
}

# Fields where sign convention may differ (yfinance reports capex as negative)
SIGN_FLIP_FIELDS = {
    "capital_expenditures",      # yfinance: negative, Thes1s: positive
    "share_repurchases",         # yfinance: negative, Thes1s: negative (both negative typically)
    "dividends_paid",            # yfinance: negative, Thes1s: negative
}


def load_thesis_data(ticker):
    """Load exported Thes1s data."""
    path = THESIS_DIR / f"{ticker}.json"
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def fetch_yfinance(ticker):
    """Fetch and cache yfinance data."""
    cache_path = YF_DIR / f"{ticker}.json"
    if cache_path.exists():
        with open(cache_path) as f:
            return json.load(f)

    try:
        t = yf.Ticker(ticker)
        result = {"ticker": ticker, "fetchedAt": datetime.now().isoformat()}

        for attr, key in [
            ("financials", "income"),
            ("balance_sheet", "balance"),
            ("cashflow", "cashFlow"),
        ]:
            df = getattr(t, attr, None)
            if df is not None and not df.empty:
                data = {}
                for col in df.columns:
                    year_key = col.strftime("%Y")
                    data[year_key] = {}
                    for row_name in df.index:
                        val = df.at[row_name, col]
                        if val is not None and str(val) != "nan":
                            data[year_key][row_name] = float(val)
                result[key] = data
            else:
                result[key] = {}

        with open(cache_path, "w") as f:
            json.dump(result, f, indent=2)
        return result

    except Exception as e:
        print(f"    yfinance error for {ticker}: {e}")
        return None


def extract_ms_fields(ms_data, field_map, is_per_share_map=False):
    """Extract fields from mstarpy nested row structure."""
    if not ms_data or "columnDefs" not in ms_data:
        return {}

    columns = ms_data["columnDefs"]  # e.g., ["2016", "2017", ..., "TTM"]
    result = {}  # { year: { thesis_field: value } }

    def walk_rows(rows):
        for row in rows:
            label = row.get("label", "")
            thesis_field = field_map.get(label)
            if thesis_field and "datum" in row:
                for i, val in enumerate(row["datum"]):
                    if i >= len(columns):
                        break
                    year_key = columns[i]
                    if year_key == "TTM":
                        continue
                    if isinstance(val, (int, float)):
                        if year_key not in result:
                            result[year_key] = {}
                        result[year_key][thesis_field] = val
            if "subLevel" in row:
                walk_rows(row["subLevel"])

    walk_rows(ms_data.get("rows", []))
    return result


def fetch_mstarpy(ticker):
    """Fetch and cache Morningstar data via mstarpy."""
    cache_path = MS_DIR / f"{ticker}.json"
    if cache_path.exists():
        with open(cache_path) as f:
            return json.load(f)

    try:
        stock = mstarpy.Stock(ticker)
        result = {
            "ticker": ticker,
            "name": stock.name,
            "fetchedAt": datetime.now().isoformat(),
        }

        for method, key in [
            ("incomeStatement", "income"),
            ("balanceSheet", "balance"),
            ("cashFlow", "cashFlow"),
        ]:
            try:
                data = getattr(stock, method)()
                result[key] = data
            except Exception as e:
                print(f"    mstarpy {method} error for {ticker}: {e}")
                result[key] = None

        with open(cache_path, "w") as f:
            json.dump(result, f, indent=2, default=str)
        return result

    except Exception as e:
        print(f"    mstarpy error for {ticker}: {e}")
        return None


def map_thesis_year_to_fy(thesis_data, calendar_year):
    """Map a calendar year from yfinance to Thes1s fiscal year.
    yfinance columns are period-end dates (e.g., 2025-09-30 for AAPL FY2025).
    Thes1s uses XBRL fy field. We match by finding the Thes1s year whose
    fiscal month end aligns with the yfinance period-end month."""
    return str(calendar_year)  # For most companies, fy == calendar year of period end


def compare_field(thesis_val, other_val, field_name, source="yfinance"):
    """Compare two values and return a comparison record."""
    if thesis_val is None or other_val is None:
        return None

    # Handle sign flip for capex (yfinance reports as negative)
    if source == "yfinance" and field_name in SIGN_FLIP_FIELDS:
        # Compare absolute values
        thesis_abs = abs(thesis_val)
        other_abs = abs(other_val)
    else:
        thesis_abs = abs(thesis_val)
        other_abs = abs(other_val)

    # Both zero
    if thesis_abs == 0 and other_abs == 0:
        return {"match": True, "pct_diff": 0, "status": "match"}

    # One zero, other not
    if thesis_abs == 0 or other_abs == 0:
        return {"match": False, "pct_diff": 100, "status": "major"}

    pct_diff = abs(thesis_abs - other_abs) / max(thesis_abs, other_abs) * 100

    if pct_diff < 1:
        status = "match"
    elif pct_diff < 5:
        status = "minor"
    elif pct_diff < 15:
        status = "warning"
    else:
        status = "major"

    return {
        "match": pct_diff < 1,
        "pct_diff": round(pct_diff, 2),
        "status": status,
    }


def compare_yfinance(ticker, thesis_data, yf_data):
    """Compare Thes1s data against yfinance for one ticker."""
    comparisons = []

    statement_configs = [
        ("income", YF_INCOME_MAP, "income"),
        ("balance", YF_BALANCE_MAP, "balance"),
        ("cashFlow", YF_CASHFLOW_MAP, "cashFlow"),
    ]

    yf_years = set()
    for key in ["income", "balance", "cashFlow"]:
        if key in yf_data:
            yf_years.update(yf_data[key].keys())

    for stmt_key, field_map, thesis_stmt in statement_configs:
        yf_stmt = yf_data.get(stmt_key, {})

        for yf_year in sorted(yf_stmt.keys()):
            thesis_year = int(yf_year)
            thesis_stmt_data = thesis_data.get(thesis_stmt, {}).get(str(thesis_year))
            if not thesis_stmt_data:
                # Try adjacent years (fiscal year offset — Jan FY ends need -1)
                for offset in [-1, 1]:
                    thesis_stmt_data = thesis_data.get(thesis_stmt, {}).get(str(thesis_year + offset))
                    if thesis_stmt_data:
                        thesis_year = thesis_year + offset
                        break

            if not thesis_stmt_data:
                continue

            yf_year_data = yf_stmt[yf_year]

            for yf_field, thesis_field in field_map.items():
                yf_val = yf_year_data.get(yf_field)
                thesis_val = thesis_stmt_data.get(thesis_field)

                if yf_val is None or thesis_val is None:
                    continue

                # Handle sign flips for capex etc
                if thesis_field in SIGN_FLIP_FIELDS:
                    yf_val = abs(yf_val)
                    thesis_val = abs(thesis_val)

                result = compare_field(thesis_val, yf_val, thesis_field, "yfinance")
                if result:
                    comparisons.append({
                        "ticker": ticker,
                        "year": thesis_year,
                        "field": thesis_field,
                        "statement": stmt_key,
                        "source": "yfinance",
                        "thesis_val": thesis_val,
                        "other_val": yf_val,
                        **result,
                    })

    return comparisons


def compare_mstarpy(ticker, thesis_data, ms_data):
    """Compare Thes1s data against Morningstar for one ticker."""
    comparisons = []

    # mstarpy values are in millions for USD fields, actual for per-share
    MS_SCALE = 1_000_000

    statement_configs = [
        ("income", MS_INCOME_MAP, "income"),
        ("balance", MS_BALANCE_MAP, "balance"),
        ("cashFlow", MS_CASHFLOW_MAP, "cashFlow"),
    ]

    for stmt_key, field_map, thesis_stmt in statement_configs:
        ms_raw = ms_data.get(stmt_key)
        if not ms_raw:
            continue

        ms_fields = extract_ms_fields(ms_raw, field_map)

        for ms_year, fields in ms_fields.items():
            thesis_year = int(ms_year)
            thesis_stmt_data = thesis_data.get(thesis_stmt, {}).get(str(thesis_year))
            if not thesis_stmt_data:
                for offset in [-1, 1]:
                    thesis_stmt_data = thesis_data.get(thesis_stmt, {}).get(str(thesis_year + offset))
                    if thesis_stmt_data:
                        thesis_year = thesis_year + offset
                        break

            if not thesis_stmt_data:
                continue

            for thesis_field, ms_val in fields.items():
                thesis_val = thesis_stmt_data.get(thesis_field)
                if thesis_val is None or ms_val is None:
                    continue

                # Scale mstarpy value (millions → actual) unless per-share
                if thesis_field not in PER_SHARE_FIELDS:
                    ms_val_scaled = ms_val * MS_SCALE
                else:
                    ms_val_scaled = ms_val

                # Handle sign flips
                if thesis_field in SIGN_FLIP_FIELDS:
                    ms_val_scaled = abs(ms_val_scaled)
                    thesis_val = abs(thesis_val)

                result = compare_field(thesis_val, ms_val_scaled, thesis_field, "mstarpy")
                if result:
                    comparisons.append({
                        "ticker": ticker,
                        "year": thesis_year,
                        "field": thesis_field,
                        "statement": stmt_key,
                        "source": "mstarpy",
                        "thesis_val": thesis_val,
                        "other_val": ms_val_scaled,
                        **result,
                    })

    return comparisons


def run_validation(tickers):
    """Run Layer 2 validation for a list of tickers."""
    all_comparisons = []
    ticker_summaries = []

    for i, ticker in enumerate(tickers):
        print(f"\n[{i+1}/{len(tickers)}] {ticker}")

        thesis_data = load_thesis_data(ticker)
        if not thesis_data:
            print(f"  No Thes1s export found — skip")
            continue

        # yfinance
        print(f"  Fetching yfinance...")
        yf_data = fetch_yfinance(ticker)
        yf_comps = []
        if yf_data:
            yf_comps = compare_yfinance(ticker, thesis_data, yf_data)
            all_comparisons.extend(yf_comps)
        time.sleep(0.5)

        # mstarpy
        print(f"  Fetching mstarpy...")
        ms_data = fetch_mstarpy(ticker)
        ms_comps = []
        if ms_data:
            ms_comps = compare_mstarpy(ticker, thesis_data, ms_data)
            all_comparisons.extend(ms_comps)
        time.sleep(1.0)  # Be polite to Morningstar

        # Per-ticker summary
        all_ticker = yf_comps + ms_comps
        if all_ticker:
            n_match = sum(1 for c in all_ticker if c["status"] == "match")
            n_minor = sum(1 for c in all_ticker if c["status"] == "minor")
            n_warn = sum(1 for c in all_ticker if c["status"] == "warning")
            n_major = sum(1 for c in all_ticker if c["status"] == "major")
            total = len(all_ticker)
            match_pct = round(n_match / total * 100, 1) if total > 0 else 0
            avg_diff = round(sum(c["pct_diff"] for c in all_ticker) / total, 2) if total > 0 else 0

            summary = {
                "ticker": ticker,
                "total": total,
                "match": n_match,
                "minor": n_minor,
                "warning": n_warn,
                "major": n_major,
                "match_pct": match_pct,
                "avg_diff": avg_diff,
                "yf_comparisons": len(yf_comps),
                "ms_comparisons": len(ms_comps),
            }
            ticker_summaries.append(summary)
            status_str = f"✓{n_match} ~{n_minor} ⚠{n_warn} ✗{n_major}"
            print(f"  {total} comparisons: {status_str} ({match_pct}% match, avg {avg_diff}% diff)")
        else:
            print(f"  No comparisons possible")

    return all_comparisons, ticker_summaries


def generate_report(all_comparisons, ticker_summaries):
    """Generate summary reports."""
    ts = datetime.now().strftime("%Y-%m-%d_%H%M")

    # Save raw comparisons
    raw_path = REPORT_DIR / f"layer2_raw_{ts}.json"
    with open(raw_path, "w") as f:
        json.dump(all_comparisons, f, indent=2)

    # Save ticker summaries
    summary_path = REPORT_DIR / f"layer2_summary_{ts}.json"
    with open(summary_path, "w") as f:
        json.dump(ticker_summaries, f, indent=2)

    # Print aggregate stats
    if not all_comparisons:
        print("\nNo comparisons to report.")
        return

    total = len(all_comparisons)
    by_status = {}
    for c in all_comparisons:
        by_status[c["status"]] = by_status.get(c["status"], 0) + 1

    print(f"\n{'='*60}")
    print(f"LAYER 2 VALIDATION REPORT — {ts}")
    print(f"{'='*60}")
    print(f"\nTotal comparisons: {total}")
    print(f"  Match (<1%):   {by_status.get('match', 0):5d} ({by_status.get('match', 0)/total*100:.1f}%)")
    print(f"  Minor (1-5%):  {by_status.get('minor', 0):5d} ({by_status.get('minor', 0)/total*100:.1f}%)")
    print(f"  Warning (5-15%): {by_status.get('warning', 0):5d} ({by_status.get('warning', 0)/total*100:.1f}%)")
    print(f"  Major (>15%):  {by_status.get('major', 0):5d} ({by_status.get('major', 0)/total*100:.1f}%)")

    avg_diff = sum(c["pct_diff"] for c in all_comparisons) / total
    print(f"\nAverage difference: {avg_diff:.2f}%")

    # Per-field breakdown (most problematic fields)
    field_stats = {}
    for c in all_comparisons:
        f = c["field"]
        if f not in field_stats:
            field_stats[f] = {"total": 0, "match": 0, "diffs": []}
        field_stats[f]["total"] += 1
        if c["status"] == "match":
            field_stats[f]["match"] += 1
        field_stats[f]["diffs"].append(c["pct_diff"])

    print(f"\n{'─'*60}")
    print(f"PER-FIELD MATCH RATES (sorted by match %):")
    print(f"{'─'*60}")
    print(f"{'Field':<45} {'Match%':>7} {'Avg%':>7} {'N':>5}")
    sorted_fields = sorted(field_stats.items(), key=lambda x: x[1]["match"] / max(x[1]["total"], 1))
    for field, stats in sorted_fields:
        match_pct = stats["match"] / stats["total"] * 100 if stats["total"] > 0 else 0
        avg = sum(stats["diffs"]) / len(stats["diffs"]) if stats["diffs"] else 0
        print(f"  {field:<43} {match_pct:>6.1f}% {avg:>6.2f}% {stats['total']:>5}")

    # Per-source breakdown
    for source in ["yfinance", "mstarpy"]:
        source_comps = [c for c in all_comparisons if c["source"] == source]
        if source_comps:
            n = len(source_comps)
            n_match = sum(1 for c in source_comps if c["status"] == "match")
            avg = sum(c["pct_diff"] for c in source_comps) / n
            print(f"\n{source}: {n} comparisons, {n_match/n*100:.1f}% match, avg diff {avg:.2f}%")

    # Worst tickers
    print(f"\n{'─'*60}")
    print(f"PER-TICKER SUMMARY (sorted by match %):")
    print(f"{'─'*60}")
    print(f"{'Ticker':<8} {'Total':>6} {'Match':>6} {'Minor':>6} {'Warn':>6} {'Major':>6} {'Match%':>7} {'AvgDiff':>8}")
    sorted_tickers = sorted(ticker_summaries, key=lambda x: x["match_pct"])
    for s in sorted_tickers:
        print(f"  {s['ticker']:<6} {s['total']:>6} {s['match']:>6} {s['minor']:>6} {s['warning']:>6} {s['major']:>6} {s['match_pct']:>6.1f}% {s['avg_diff']:>7.2f}%")

    # List all major discrepancies
    majors = [c for c in all_comparisons if c["status"] == "major"]
    if majors:
        print(f"\n{'─'*60}")
        print(f"ALL MAJOR DISCREPANCIES (>15% difference):")
        print(f"{'─'*60}")
        for c in sorted(majors, key=lambda x: -x["pct_diff"]):
            thesis_fmt = f"{c['thesis_val']:,.0f}" if abs(c['thesis_val']) > 100 else f"{c['thesis_val']:.2f}"
            other_fmt = f"{c['other_val']:,.0f}" if abs(c['other_val']) > 100 else f"{c['other_val']:.2f}"
            print(f"  {c['ticker']:<6} {c['year']} {c['field']:<40} "
                  f"Thesis: {thesis_fmt:>20} vs {c['source']}: {other_fmt:>20} "
                  f"({c['pct_diff']:.1f}%)")

    print(f"\nReports saved to: {REPORT_DIR}/")
    print(f"  Raw: {raw_path.name}")
    print(f"  Summary: {summary_path.name}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args:
        tickers = [t.upper() for t in args]
    else:
        # Use all exported tickers
        tickers = sorted([
            f.stem for f in THESIS_DIR.glob("*.json")
        ])

    if not tickers:
        print("No exported data found. Run export-financials.mjs first.")
        sys.exit(1)

    print(f"Layer 2 Validation: {len(tickers)} tickers")
    print(f"Sources: yfinance + mstarpy")

    all_comps, summaries = run_validation(tickers)
    generate_report(all_comps, summaries)
