#!/usr/bin/env python3
"""
Pitch Deck Word Document Generator — Thesis-branded .docx export.

Generates a professional Word document from any ticker's Pitch Deck pipeline output
with embedded chart images (verdict scorecard, financial trends, price ranges),
styled tables, citations, and Thesis branding.

Usage:
    python3 scripts/pdf/generate_pitch_deck_docx.py MNST
"""

import os
import sys

# Ensure scripts/pdf is importable
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

from scripts.pdf.report_data_reader import ReportData
from scripts.pdf.section_renderers import (
    get_narrative, get_tables, get_red_flags, get_citations,
)
from scripts.pdf.chart_image_generator import (
    generate_bar_chart, generate_verdict_scorecard,
    generate_price_range_chart, generate_comparison_chart,
)
from scripts.pdf.docx_helpers import (
    create_thesis_doc, add_title_page, add_styled_table,
    add_verdict_table, add_section_heading, add_body_paragraphs,
    embed_chart, add_red_flags as render_red_flags, add_citations_section,
    cleanup_temp_charts, VERDICT_COLORS_RGB, SLATE_600,
)
from docx.shared import Pt


# Section keys that get specific chart treatments
CHART_SECTIONS = {
    'simple_and_predictable': 'revenue',
    'fcf': 'fcf',
    'balance_sheet': 'debt_equity',
    'valuation_summary': 'price_range',
}


def _add_revenue_chart(doc, data, temp_charts):
    """Add revenue trend chart for simple_and_predictable section."""
    try:
        years = data.get_financial_years(n=5)
        if not years:
            return
        rev_data = data.get_financial_data('income', 'revenues', years)
        if rev_data and len(rev_data) >= 2:
            chart_years = [str(y) for y, _ in rev_data]
            chart_values = [v / 1e9 for _, v in rev_data]
            path = generate_bar_chart(
                chart_years, chart_values,
                title='Revenue Trend (5yr)', unit='B',
            )
            temp_charts.append(path)
            embed_chart(doc, path)
    except Exception:
        pass


def _add_fcf_chart(doc, data, temp_charts):
    """Add FCF bar chart for fcf section."""
    try:
        years = data.get_financial_years(n=5)
        if not years:
            return
        ocf_data = data.get_financial_data('cashFlow', 'operating_cash_flow', years)
        capex_data = data.get_financial_data('cashFlow', 'capital_expenditures', years)
        if ocf_data and len(ocf_data) >= 2:
            # Compute FCF = OCF - CapEx
            ocf_map = dict(ocf_data)
            capex_map = dict(capex_data) if capex_data else {}
            fcf_years = []
            fcf_values = []
            for y in years:
                ocf = ocf_map.get(y)
                capex = abs(capex_map.get(y, 0))
                if ocf is not None:
                    fcf_years.append(str(y))
                    fcf_values.append((ocf - capex) / 1e9)
            if len(fcf_years) >= 2:
                path = generate_bar_chart(
                    fcf_years, fcf_values,
                    title='Free Cash Flow Trend', unit='B',
                )
                temp_charts.append(path)
                embed_chart(doc, path)
    except Exception:
        pass


def _add_debt_equity_chart(doc, data, temp_charts):
    """Add debt vs equity comparison chart for balance_sheet section."""
    try:
        years = data.get_financial_years(n=5)
        if not years:
            return
        debt_data = data.get_financial_data('balance', 'total_debt', years)
        equity_data = data.get_financial_data('balance', 'stockholders_equity', years)
        if debt_data and equity_data and len(debt_data) >= 2:
            chart_years = [str(y) for y, _ in debt_data]
            debt_vals = [v / 1e9 for _, v in debt_data]
            equity_vals = [v / 1e9 for _, v in equity_data[:len(debt_data)]]
            path = generate_comparison_chart(
                chart_years,
                [debt_vals, equity_vals],
                ['Total Debt', 'Equity'],
                title='Debt vs Equity', unit='B',
            )
            temp_charts.append(path)
            embed_chart(doc, path)
    except Exception:
        pass


def _add_price_range_chart(doc, data, temp_charts):
    """Add buy price range chart for valuation_summary section."""
    try:
        buy_prices = data.get_buy_prices()
        current_price = buy_prices.get('currentPrice', 0) or data.get_current_price()
        if not current_price:
            return

        methods = []
        # MOS
        mos = buy_prices.get('mosBuyPrice')
        if isinstance(mos, dict) and mos.get('low') and mos.get('high'):
            methods.append(('MOS', float(mos['low']), float(mos['high']), '#22c55e'))
        elif isinstance(mos, (int, float)) and mos > 0:
            methods.append(('MOS', float(mos) * 0.9, float(mos) * 1.1, '#22c55e'))

        # PBT
        pbt = buy_prices.get('pbtBuyPrice')
        if isinstance(pbt, dict) and pbt.get('low') and pbt.get('high'):
            methods.append(('PBT', float(pbt['low']), float(pbt['high']), '#3b82f6'))
        elif isinstance(pbt, (int, float)) and pbt > 0:
            methods.append(('PBT', float(pbt) * 0.9, float(pbt) * 1.1, '#3b82f6'))

        # Ten Cap
        tc = buy_prices.get('tenCapPrice')
        if isinstance(tc, dict):
            low = tc.get('ruleOne') or tc.get('low')
            high = tc.get('graham') or tc.get('high')
            if low and high:
                methods.append(('Ten Cap', float(min(low, high)), float(max(low, high)), '#f59e0b'))
        elif isinstance(tc, (int, float)) and tc > 0:
            methods.append(('Ten Cap', float(tc) * 0.9, float(tc) * 1.1, '#f59e0b'))

        # Equity Bond
        eb = buy_prices.get('equityBondBuyPrice')
        if isinstance(eb, dict) and eb.get('low') and eb.get('high'):
            methods.append(('Equity Bond', float(eb['low']), float(eb['high']), '#8b5cf6'))
        elif isinstance(eb, (int, float)) and eb > 0:
            methods.append(('Equity Bond', float(eb) * 0.9, float(eb) * 1.1, '#8b5cf6'))

        if methods and current_price > 0:
            path = generate_price_range_chart(
                methods, float(current_price),
                title=f'{data.ticker} Buy Price Ranges',
            )
            temp_charts.append(path)
            embed_chart(doc, path)
    except Exception:
        pass


def generate_pitch_deck_docx(ticker, base_dir=None):
    """Generate Pitch Deck Word document for the given ticker."""

    data = ReportData(ticker, 'pitch-deck', base_dir=base_dir)
    company_name = data.get_company_name()
    verdict = data.get_overall_verdict()

    doc = create_thesis_doc()
    temp_charts = []
    all_citations = []

    # ── Title Page ───────────────────────────────────────────────────────────
    add_title_page(
        doc, ticker, company_name, 'Pitch Deck',
        subtitle='Investment Research Analysis',
        verdict=verdict,
    )

    # ── Verdict Scorecard ────────────────────────────────────────────────────
    try:
        scorecard_sections = []
        for key in data.get_section_keys():
            if key == 'overall_verdict':
                continue
            section = data.get_section(key)
            name = section.get('title', key.replace('_', ' ').title())
            v = section.get('verdict', 'N/A')
            conf = section.get('confidence', '')
            signal = str(section.get('verdictRationale', ''))[:60]
            scorecard_sections.append((name, v, conf, signal))

        if scorecard_sections:
            chart_path = generate_verdict_scorecard(
                scorecard_sections, title=f'{ticker} Pitch Deck Scorecard'
            )
            temp_charts.append(chart_path)
            add_section_heading(doc, 'Verdict Scorecard', level=1)
            embed_chart(doc, chart_path)
            add_verdict_table(doc, scorecard_sections)
    except Exception:
        pass

    # ── Per-Section Rendering ────────────────────────────────────────────────
    for key in data.get_section_keys():
        if key == 'overall_verdict':
            continue

        section = data.get_section(key)
        title = section.get('title', key.replace('_', ' ').title())

        add_section_heading(doc, title, level=1)

        # Section verdict
        sec_verdict = section.get('verdict', '')
        if sec_verdict:
            p = doc.add_paragraph()
            run = p.add_run(f'Verdict: {sec_verdict}')
            run.font.bold = True
            run.font.size = Pt(10)
            run.font.name = 'Arial'
            run.font.color.rgb = VERDICT_COLORS_RGB.get(
                str(sec_verdict).upper().strip(), SLATE_600
            )

            # Confidence
            sec_conf = section.get('confidence', '')
            if sec_conf:
                run = p.add_run(f'  |  Confidence: {sec_conf}')
                run.font.size = Pt(10)
                run.font.name = 'Arial'
                run.font.color.rgb = SLATE_600

        # Strategic chart for specific sections
        chart_type = CHART_SECTIONS.get(key)
        if chart_type == 'revenue':
            _add_revenue_chart(doc, data, temp_charts)
        elif chart_type == 'fcf':
            _add_fcf_chart(doc, data, temp_charts)
        elif chart_type == 'debt_equity':
            _add_debt_equity_chart(doc, data, temp_charts)
        elif chart_type == 'price_range':
            _add_price_range_chart(doc, data, temp_charts)

        # Narrative
        narrative = get_narrative(section)
        if narrative:
            add_body_paragraphs(doc, narrative)

        # Tables
        tables = get_tables(section)
        for t in tables:
            if t.get('title'):
                add_section_heading(doc, t['title'], level=3)
            add_styled_table(doc, t.get('headers', []), t.get('rows', []))

        # Red flags
        flags = get_red_flags(section)
        if flags:
            render_red_flags(doc, flags)

        # Collect citations for end-of-doc section
        cites = get_citations(section)
        all_citations.extend(cites)

    # ── Overall Verdict Section ──────────────────────────────────────────────
    ov_section = data.get_section('overall_verdict')
    if ov_section:
        add_section_heading(doc, 'Overall Verdict', level=1)
        narrative = get_narrative(ov_section)
        if narrative:
            add_body_paragraphs(doc, narrative)

    # ── Citations ────────────────────────────────────────────────────────────
    if all_citations:
        add_citations_section(doc, all_citations)

    # ── Save ─────────────────────────────────────────────────────────────────
    output_path = os.path.join(data.report_dir, 'pitch-deck.docx')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc.save(output_path)

    cleanup_temp_charts(temp_charts)
    print(f'Pitch Deck Word doc saved: {output_path}')
    return output_path


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python3 scripts/pdf/generate_pitch_deck_docx.py TICKER')
        sys.exit(1)
    generate_pitch_deck_docx(sys.argv[1])
