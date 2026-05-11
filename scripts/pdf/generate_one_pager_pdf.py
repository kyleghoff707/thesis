#!/usr/bin/env python3
"""
Generic One Pager PDF Generator
Generates a chart-heavy, Thesis-branded One Pager PDF for any ticker.
Reads from pipeline output (one-pager.json) and DataPacket (data-packet.json).

Usage: python3 scripts/pdf/generate_one_pager_pdf.py MNST
"""

import os
import sys
import json
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from thesis_pdf import ThesisPDF
from report_data_reader import ReportData
from thesis_dir import reports_dir
from section_renderers import (
    get_narrative, get_tables, get_red_flags, get_citations,
    get_verdict_color, format_currency, _clean_narrative
)
from citation_links import extract_url
from prose_structurer import structure_prose


# =========================================================================
# NARRATIVE RENDERER
# =========================================================================

def _render_narrative(pdf, narrative):
    """Render a section narrative as a sequence of typed blocks."""
    if not narrative:
        return
    narrative = _clean_narrative(narrative)
    for block in structure_prose(narrative):
        kind = block['kind']
        if kind == 'subheader':
            pdf.add_section_header(block['text'], level=3)
        elif kind == 'bullets':
            for item in block['items']:
                pdf.add_bullet(item, indent=2)
        elif kind == 'numbered':
            for i, item in enumerate(block['items'], 1):
                pdf.add_numbered_item(i, item)
        else:
            pdf.add_body_text(block['text'])


def _render_citations_page(pdf, all_citations):
    """Render a numbered citations page."""
    pdf.add_section_header('Citations & Sources', level=1)
    pdf.add_body_text(
        'All quantitative claims trace to DataPacket field paths or external sources. '
        'Citations are grouped by section.'
    )
    for section_name, cites in all_citations:
        if not cites:
            continue
        pdf.add_section_header(section_name, level=3)
        for i, c in enumerate(cites, 1):
            ref = c.get('ref', c.get('field', ''))
            text = str(c.get('text', c.get('value', c.get('label', ''))))
            source = c.get('source', c.get('url', 'DataPacket'))
            line = f'[{i}] {ref}'
            if text:
                line += f' = {text}'
            url_info = extract_url(source) if source else None
            if url_info:
                url, display = url_info
                line += f'  ({display})'
                pdf.add_bullet(line, indent=2, link=url, link_text=display)
            else:
                line += f'  ({source})'
                pdf.add_bullet(line, indent=2)


# =========================================================================
# FINANCIAL CHARTS FROM DATAPACKET
# =========================================================================

def _get_financial_series(data, statement, field, n=5):
    """Extract last N years of a financial field from DataPacket.
    Returns: list of (year_label, value) tuples, sorted chronologically.
    """
    years = data.get_financial_years(n)
    result = []
    for yr in years:
        yr_str = str(yr)
        stmt_data = data.data_packet.get('financials', {}).get(statement, {}).get(yr_str, {})
        val = stmt_data.get(field)
        if val is not None:
            result.append((f'FY{yr}', val))
    return result


def _render_revenue_chart(pdf, data):
    """Revenue bar chart from DataPacket."""
    series = _get_financial_series(data, 'income', 'revenues', 5)
    if not series:
        return
    labels = [s[0] for s in series]
    values = [s[1] / 1e9 for s in series]
    colors = [pdf.teal_400 if i < len(values) - 1 else pdf.teal_500 for i in range(len(values))]
    pdf.draw_bar_chart('Revenue (Billions)', labels, values, colors, unit='B', max_val=max(values) * 1.15)


def _render_eps_chart(pdf, data):
    """EPS bar chart from DataPacket."""
    series = _get_financial_series(data, 'income', 'diluted_earnings_per_share', 5)
    if not series:
        return
    labels = [s[0] for s in series]
    values = [s[1] for s in series]
    colors = [pdf.teal_400 if i < len(values) - 1 else pdf.teal_500 for i in range(len(values))]
    max_v = max(abs(v) for v in values) * 1.15 if values else 5
    pdf.draw_bar_chart('Diluted EPS', labels, values, colors, unit='', max_val=max_v)


def _render_opcf_chart(pdf, data):
    """Operating Cash Flow bar chart from DataPacket."""
    series = _get_financial_series(data, 'cashFlow', 'net_cash_flow_from_operating_activities', 5)
    if not series:
        # Try alternate field names
        series = _get_financial_series(data, 'cashFlow', 'free_cash_flow', 5)
        if not series:
            return
        chart_title = 'Free Cash Flow (Billions)'
    else:
        chart_title = 'Operating Cash Flow (Billions)'

    labels = [s[0] for s in series]
    values = [s[1] / 1e9 for s in series]

    # Use positive/negative chart if any negative values
    has_neg = any(v < 0 for v in values)
    if has_neg:
        pdf.draw_pn_bar_chart(chart_title, labels, values,
                              colors_pos=pdf.teal_500, colors_neg=pdf.red_400)
    else:
        colors = [pdf.teal_400 if i < len(values) - 1 else pdf.teal_500
                  for i in range(len(values))]
        pdf.draw_bar_chart(chart_title, labels, values, colors,
                           unit='B', max_val=max(values) * 1.15 if values else 5)


def _render_metric_gauges(pdf, data):
    """value investing score gauges from DataPacket if available."""
    scores = data.data_packet.get('thesisScore', {})
    rm = data.data_packet.get('returnMetrics', {})
    averages = rm.get('averages', {})

    gauges = []

    # ROIC average
    roic_3yr = averages.get('roic_3yr')
    if roic_3yr is not None:
        gauges.append(('ROIC (3yr)', round(roic_3yr, 1), 10, '%', True))

    # ROE average
    roe_3yr = averages.get('roe_3yr')
    if roe_3yr is not None:
        gauges.append(('ROE (3yr)', round(roe_3yr, 1), 10, '%', True))

    # Debt metrics
    dm = data.data_packet.get('debtMetrics', {})
    nd_ratio = dm.get('netDebtToEarnings')
    if nd_ratio is not None:
        gauges.append(('Debt/Earn', round(nd_ratio, 1), 3.0, 'x', False))

    # Growth rates: try to get BVPS growth
    gr = data.data_packet.get('growthRates', {})
    bvps_gr = gr.get('bvps', {})
    bvps_3yr = bvps_gr.get('3yr')
    if bvps_3yr is not None:
        gauges.append(('BVPS Growth', round(bvps_3yr * 100, 1), 10, '%', True))

    # Revenue growth
    rev_gr = gr.get('revenue', {})
    rev_3yr = rev_gr.get('3yr')
    if rev_3yr is not None:
        gauges.append(('Rev Growth', round(rev_3yr * 100, 1), 10, '%', True))

    if gauges:
        pdf.draw_metric_gauges('Thesis Score — Quick Screen', gauges)


def _render_thesis_pillar_gauges(pdf, data):
    """4-pillar Thesis Score (Compounding / Capital Efficiency / Capital Allocation / Resilience).

    Reads dataPacket.thesisScore.pillars if present. Each pillar may be a flat
    score number or a dict {score, metrics}. Falls back silently if missing.
    """
    score = data.data_packet.get('thesisScore', {})
    pillars = score.get('pillars') or score.get('pillarScores')
    if not isinstance(pillars, dict) or not pillars:
        return
    label_map = {
        'compounding': 'Compounding',
        'capitalEfficiency': 'Capital Efficiency',
        'capital_efficiency': 'Capital Efficiency',
        'capitalAllocation': 'Capital Allocation',
        'capital_allocation': 'Capital Allocation',
        'resilience': 'Resilience',
    }
    gauges = []
    for k, v in pillars.items():
        if isinstance(v, dict):
            v = v.get('score')
        if not isinstance(v, (int, float)):
            continue
        gauges.append((label_map.get(k, k), float(v), 70.0, '%', True))
    if gauges:
        pdf.draw_metric_gauges('Thesis Score — 4 Pillars', gauges)


def _render_minimum_standards_grid(pdf, data):
    """Render the minimum standards as a 2x2 pass/fail gate grid."""
    section = data.get_section('minimum_standards')
    if not section:
        return
    raw = section.get('data')
    gates = None
    if isinstance(raw, str):
        try:
            gates = json.loads(raw).get('gates')
        except (ValueError, TypeError):
            gates = None
    elif isinstance(raw, dict):
        gates = raw.get('gates')
    if not isinstance(gates, dict):
        return

    rows = []
    if 'marketCap' in gates:
        g = gates['marketCap']
        rows.append(('Market Cap', g.get('result', 'WARN'),
                     f"{g.get('estimated', '')} (req {g.get('threshold', '')})"))
    if 'usHeadquarters' in gates:
        g = gates['usHeadquarters']
        rows.append(('US Headquarters', g.get('result', 'WARN'),
                     str(g.get('value', ''))[:80]))
    if 'publicHistory' in gates:
        g = gates['publicHistory']
        rows.append(('Public History', g.get('result', 'WARN'),
                     f"IPO {g.get('ipoYear', '?')} ({g.get('yearsPublic', '?')} yrs, req {g.get('threshold', '')})"))
    if 'debtToEarnings' in gates:
        g = gates['debtToEarnings']
        rows.append(('Debt / Earnings', g.get('result', 'WARN'),
                     f"{g.get('ratio', '?')} yrs (req {g.get('threshold', '')})"))
    if rows:
        pdf.draw_gate_grid('Minimum Standards — Gate Audit', rows)


def _render_margin_sparklines(pdf, data):
    """Sparkline trio for gross / operating / net margin trends (5y)."""
    income_block = data.data_packet.get('financials', {}).get('income', {})
    years = sorted([y for y in income_block.keys() if str(y).isdigit()])[-5:]
    if len(years) < 3:
        return

    def _ratio(y, num_field, den_field='revenues'):
        rec = income_block.get(y) or income_block.get(str(y)) or {}
        num = rec.get(num_field)
        den = rec.get(den_field)
        if num is None or den is None or den == 0:
            return None
        return num / den * 100

    series = []
    gross_vals = [_ratio(y, 'gross_profit') for y in years]
    op_vals = [_ratio(y, 'operating_income_loss') for y in years]
    net_vals = [_ratio(y, 'net_income_loss') for y in years]

    if all(v is not None for v in gross_vals):
        series.append(('Gross Margin', gross_vals, pdf.teal_500))
    if all(v is not None for v in op_vals):
        series.append(('Operating Margin', op_vals, pdf.teal_400))
    if all(v is not None for v in net_vals):
        series.append(('Net Margin', net_vals, pdf.blue_500))

    if series:
        pdf.draw_sparkline_trio('Margin Trends (last 5 fiscal years)', series)


# =========================================================================
# VERDICT SCORECARD
# =========================================================================

def _build_scorecard_rows(data):
    """Build verdict scorecard rows from section data."""
    rows = []
    for key in data.get_section_keys():
        if key == 'overall_verdict':
            continue
        section = data.get_section(key)
        if not section:
            continue
        title = section.get('title', key.replace('_', ' ').title())
        verdict = section.get('verdict', 'N/A')
        confidence = section.get('confidence', 'N/A')
        rationale = section.get('verdictRationale', '')
        signal = rationale[:40] + '...' if len(rationale) > 40 else rationale
        rows.append((title, verdict, confidence, signal))
    return rows


# =========================================================================
# MAIN GENERATOR
# =========================================================================

def generate_one_pager(ticker, base_dir=None):
    """Build the full visual PDF for a One Pager."""
    # Phase 3: paths resolve via ~/thesis/; base_dir is accepted for backward
    # compatibility but ignored.
    report_dir = str(reports_dir(ticker))

    # Load data through the unified reader
    data = ReportData(ticker, 'one-pager')
    company_name = data.get_company_name()
    overall_verdict = data.get_overall_verdict()

    pdf = ThesisPDF(
        title=f'{company_name} ({ticker})',
        subtitle='One Pager \u2014 Investment Screening Analysis',
        stage_label='One Pager'
    )

    # Get current price from DataPacket
    current_price = data.data_packet.get('currentPrice', {}).get('price')
    sic_desc = data.data_packet.get('companyInfo', {}).get('sicDescription', '')
    exchange = data.data_packet.get('companyInfo', {}).get('exchange', '')

    # ── Title Page ───────────────────────────────────────────────────────
    info_lines = [
        f'Ticker: {ticker}  |  Exchange: {exchange}  |  SIC: {sic_desc}',
    ]
    if current_price:
        info_lines.append(f'Current Price: ${current_price:.2f}')
    info_lines.append('')
    info_lines.append(f'Overall Verdict: {overall_verdict}')
    info_lines.append('')
    info_lines.append(f'Generated: {date.today().strftime("%B %d, %Y")}')

    pdf.title_page(
        ticker, company_name, 'One Pager',
        'Investment Screening Analysis',
        verdict=overall_verdict,
        disclaimer='AI-generated research report for educational purposes only. Not financial advice.'
    )

    # Pipeline flow chart on cover
    pdf.draw_pipeline_flow('One Pager')

    # ── Executive Summary + Verdict Scorecard ────────────────────────────
    pdf.add_section_header('Executive Summary', level=1)

    # Overall verdict narrative
    ov_section = data.get_section('overall_verdict')
    if ov_section:
        narr = get_narrative(ov_section)
        if narr:
            _render_narrative(pdf, narr)

    # Verdict scorecard
    scorecard_rows = _build_scorecard_rows(data)
    if scorecard_rows:
        pdf.draw_verdict_scorecard('Section Verdicts', scorecard_rows)

    # Thesis Score 4-pillar gauges (NEW) — falls back silently if data absent
    _render_thesis_pillar_gauges(pdf, data)

    # Minimum standards gate grid (NEW)
    _render_minimum_standards_grid(pdf, data)

    # Existing metric gauges from DataPacket (ROIC, ROE, etc.)
    _render_metric_gauges(pdf, data)

    # ── Financial Overview (charts from DataPacket) ──────────────────────
    pdf.add_section_header('Financial Overview', level=1)
    _render_revenue_chart(pdf, data)
    _render_eps_chart(pdf, data)
    _render_opcf_chart(pdf, data)
    _render_margin_sparklines(pdf, data)

    # ── Section Narratives ───────────────────────────────────────────────
    section_num = 0
    for key in data.get_section_keys():
        if key == 'overall_verdict':
            continue  # Already rendered in Executive Summary

        section = data.get_section(key)
        if not section:
            continue

        section_num += 1
        title = section.get('title', key.replace('_', ' ').title())
        pdf.add_section_header(f'{section_num}. {title}', level=1)

        # Narrative
        narr = get_narrative(section)
        if narr:
            _render_narrative(pdf, narr)

        # Tables (if any -- One Pager sections usually have none)
        tables = get_tables(section)
        for tbl in tables:
            headers = tbl.get('headers', [])
            rows = tbl.get('rows', [])
            tbl_title = tbl.get('title', '')
            if tbl_title:
                pdf.add_section_header(tbl_title, level=3)
            if headers and rows:
                pdf.add_table(headers, rows)

        # Red flags
        flags = get_red_flags(section)
        if flags:
            pdf.add_section_header('Red Flags', level=3)
            for rf in flags:
                pdf.add_bullet(rf)

    # ── Citations ────────────────────────────────────────────────────────
    all_citations = []
    section_num = 0
    for key in data.get_section_keys():
        section = data.get_section(key)
        if not section:
            continue
        section_num += 1
        label = f'{section_num}. {section.get("title", key)}'
        cites = get_citations(section)
        all_citations.append((label, cites))
    _render_citations_page(pdf, all_citations)

    # ── Save ─────────────────────────────────────────────────────────────
    os.makedirs(report_dir, exist_ok=True)
    out_path = os.path.join(report_dir, 'one-pager.pdf')
    pdf.output(out_path)
    print(f'PDF generated: {out_path}')
    print(f'Pages: {pdf.page_no()}')
    return out_path


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python3 generate_one_pager_pdf.py <TICKER>')
        sys.exit(1)
    ticker = sys.argv[1].upper()
    generate_one_pager(ticker)
