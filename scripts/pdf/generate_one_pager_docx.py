#!/usr/bin/env python3
"""
One Pager Word Document Generator — Thesis-branded .docx export.

Generates a professional Word document from any ticker's One Pager pipeline output
with embedded chart images (verdict scorecard, financial trends), styled tables,
and Thesis branding (teal headings, Arial font, alternating row shading).

Usage:
    python3 scripts/pdf/generate_one_pager_docx.py MNST
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
    generate_bar_chart, generate_verdict_scorecard, generate_trend_chart,
)
from scripts.pdf.docx_helpers import (
    create_thesis_doc, add_title_page, add_styled_table,
    add_verdict_table, add_section_heading, add_body_paragraphs,
    embed_chart, add_red_flags as render_red_flags, add_citations_section,
    cleanup_temp_charts,
)


def generate_one_pager_docx(ticker, base_dir=None):
    """Generate One Pager Word document for the given ticker."""

    data = ReportData(ticker, 'one-pager', base_dir=base_dir)
    company_name = data.get_company_name()
    verdict = data.get_overall_verdict()

    doc = create_thesis_doc()
    temp_charts = []

    # ── Title Page ───────────────────────────────────────────────────────────
    add_title_page(
        doc, ticker, company_name, 'One Pager',
        subtitle='Investment Screening Analysis',
        verdict=verdict,
    )

    # ── Verdict Scorecard Chart ──────────────────────────────────────────────
    try:
        scorecard_sections = []
        for key in data.get_section_keys():
            if key == 'overall_verdict':
                continue
            section = data.get_section(key)
            name = section.get('title', key.replace('_', ' ').title())
            v = section.get('verdict', 'N/A')
            conf = section.get('confidence', '')
            signal = section.get('verdictRationale', '')[:60] if section.get('verdictRationale') else ''
            scorecard_sections.append((name, v, conf, signal))

        if scorecard_sections:
            chart_path = generate_verdict_scorecard(
                scorecard_sections, title=f'{ticker} One Pager Scorecard'
            )
            temp_charts.append(chart_path)
            add_section_heading(doc, 'Verdict Scorecard', level=1)
            embed_chart(doc, chart_path)

            # Also add as a Word table for accessibility
            add_verdict_table(doc, scorecard_sections)
    except Exception:
        pass

    # ── Financial Overview Charts (from DataPacket) ──────────────────────────
    years = data.get_financial_years(n=5)
    if years:
        add_section_heading(doc, 'Financial Overview', level=1)

        # Revenue trend
        try:
            rev_data = data.get_financial_data('income', 'revenues', years)
            if rev_data and len(rev_data) >= 2:
                chart_years = [str(y) for y, _ in rev_data]
                chart_values = [v / 1e9 for _, v in rev_data]
                path = generate_bar_chart(
                    chart_years, chart_values,
                    title='Revenue Trend', unit='B',
                )
                temp_charts.append(path)
                embed_chart(doc, path)
        except Exception:
            pass

        # EPS trend (net income / shares as proxy)
        try:
            ni_data = data.get_financial_data('income', 'net_income_loss', years)
            if ni_data and len(ni_data) >= 2:
                chart_years = [str(y) for y, _ in ni_data]
                chart_values = [v / 1e6 for _, v in ni_data]
                path = generate_bar_chart(
                    chart_years, chart_values,
                    title='Net Income Trend', unit='M',
                )
                temp_charts.append(path)
                embed_chart(doc, path)
        except Exception:
            pass

        # Operating cash flow
        try:
            ocf_data = data.get_financial_data('cashFlow', 'operating_cash_flow', years)
            if ocf_data and len(ocf_data) >= 2:
                chart_years = [str(y) for y, _ in ocf_data]
                chart_values = [v / 1e9 for _, v in ocf_data]
                path = generate_bar_chart(
                    chart_years, chart_values,
                    title='Operating Cash Flow', unit='B',
                )
                temp_charts.append(path)
                embed_chart(doc, path)
        except Exception:
            pass

    # ── Section Narratives ───────────────────────────────────────────────────
    for key in data.get_section_keys():
        if key == 'overall_verdict':
            continue

        section = data.get_section(key)
        title = section.get('title', key.replace('_', ' ').title())

        add_section_heading(doc, title, level=1)

        # Verdict line for section
        sec_verdict = section.get('verdict', '')
        if sec_verdict:
            from scripts.pdf.docx_helpers import VERDICT_COLORS_RGB, SLATE_600
            from docx.shared import Pt
            p = doc.add_paragraph()
            run = p.add_run(f'Verdict: {sec_verdict}')
            run.font.bold = True
            run.font.size = Pt(10)
            run.font.name = 'Arial'
            run.font.color.rgb = VERDICT_COLORS_RGB.get(
                str(sec_verdict).upper().strip(), SLATE_600
            )

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

    # ── Overall Verdict Section ──────────────────────────────────────────────
    ov_section = data.get_section('overall_verdict')
    if ov_section:
        add_section_heading(doc, 'Overall Verdict', level=1)
        narrative = get_narrative(ov_section)
        if narrative:
            add_body_paragraphs(doc, narrative)

    # ── Save ─────────────────────────────────────────────────────────────────
    output_path = os.path.join(data.report_dir, 'one-pager.docx')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc.save(output_path)

    cleanup_temp_charts(temp_charts)
    print(f'One Pager Word doc saved: {output_path}')
    return output_path


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python3 scripts/pdf/generate_one_pager_docx.py TICKER')
        sys.exit(1)
    generate_one_pager_docx(sys.argv[1])
