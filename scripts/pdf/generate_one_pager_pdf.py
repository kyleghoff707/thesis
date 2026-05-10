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
from section_renderers import (
    get_narrative, get_tables, get_red_flags, get_citations,
    get_verdict_color, format_currency, _clean_narrative
)


# =========================================================================
# NARRATIVE RENDERER
# =========================================================================

def _render_narrative(pdf, narrative):
    """Render a section narrative, splitting on paragraph headers."""
    if not narrative:
        return
    # Clean cite tags and internal jargon before rendering
    narrative = _clean_narrative(narrative)
    for para in narrative.split('\n\n'):
        para = para.strip()
        if not para:
            continue
        # Bold markdown sub-headers: **Title Text**
        if para.startswith('**') and para.endswith('**') and len(para) < 120:
            pdf.add_section_header(para[2:-2], level=3)
        elif para.endswith(':') or (len(para) < 120 and '\u2014' in para):
            pdf.add_section_header(para.rstrip(':'), level=3)
        else:
            pdf.add_body_text(para)


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
        pdf.draw_metric_gauges('value investing Quick Screen', gauges)


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
    if base_dir is None:
        base_dir = os.path.join(os.path.dirname(__file__), '..', '..')
    report_dir = os.path.join(base_dir, '.thesis', 'reports', ticker)

    # Load data through the unified reader
    data = ReportData(ticker, 'one-pager', base_dir=base_dir)
    company_name = data.get_company_name()
    overall_verdict = data.get_overall_verdict()

    pdf = ThesisPDF(
        title=f'{company_name} ({ticker})',
        subtitle='value investing One Pager \u2014 Investment Screening Analysis',
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

    # Metric gauges from DataPacket
    _render_metric_gauges(pdf, data)

    # ── Financial Overview (charts from DataPacket) ──────────────────────
    pdf.add_section_header('Financial Overview', level=1)
    _render_revenue_chart(pdf, data)
    _render_eps_chart(pdf, data)
    _render_opcf_chart(pdf, data)

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
