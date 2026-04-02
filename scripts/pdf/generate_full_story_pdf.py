#!/usr/bin/env python3
"""
Generic Full Story PDF Generator
Generates a chart-heavy, Thes1s-branded Full Story PDF for any ticker.
Includes checklist tables, adversarial debate rendering, and evidence sections.
Reads from full-story-api.json and DataPacket (data-packet.json).

Usage: python3 scripts/pdf/generate_full_story_pdf.py MNST
"""

import os
import sys
import json
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from thes1s_pdf import Thes1sPDF
from report_data_reader import ReportData
from section_renderers import (
    get_narrative, get_tables, get_red_flags, get_citations,
    get_checklist_items, get_verdict_color, format_currency
)


# =========================================================================
# NARRATIVE RENDERING
# =========================================================================

def _render_narrative(pdf, narrative):
    """Render a section narrative, splitting on paragraph headers."""
    if not narrative:
        return
    for para in narrative.split('\n\n'):
        para = para.strip()
        if not para:
            continue
        if para.endswith(':') or (len(para) < 120 and '\u2014' in para):
            pdf.add_section_header(para.rstrip(':'), level=3)
        else:
            pdf.add_body_text(para)


def _render_tables(pdf, tables):
    """Render a list of tables."""
    for tbl in tables:
        headers = tbl.get('headers', [])
        rows = tbl.get('rows', [])
        tbl_title = tbl.get('title', '')
        if tbl_title:
            pdf.add_section_header(tbl_title, level=3)
        if headers and rows:
            norm_rows = []
            for row in rows:
                if isinstance(row, dict):
                    norm_rows.append([str(row.get(h, '')) for h in headers])
                elif isinstance(row, list):
                    norm_rows.append([str(c) for c in row])
            if norm_rows:
                pdf.add_table(headers, norm_rows)


def _render_red_flags(pdf, flags):
    """Render red flags as bullet list."""
    if not flags:
        return
    pdf.add_section_header('Red Flags', level=3)
    for rf in flags:
        pdf.add_bullet(rf)


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
            ref = c.get('ref', '')
            text = c.get('text', '')
            source = c.get('source', 'DataPacket')
            line = f'[{i}] {ref}'
            if text:
                line += f' = {text}'
            if source:
                line += f'  ({source})'
            pdf.add_bullet(line, indent=2)


# =========================================================================
# CHECKLIST RENDERING
# =========================================================================

def _render_checklist_summary(pdf, items):
    """Render a visual summary of checklist pass/fail/partial counts."""
    if not items:
        return

    total = len(items)
    pass_count = sum(1 for it in items
                     if str(it.get('verdict', '')).upper() == 'PASS')
    fail_count = sum(1 for it in items
                     if str(it.get('verdict', '')).upper() == 'FAIL')
    partial_count = total - pass_count - fail_count

    gauges = [
        ('PASS', pass_count, total, '', True),
        ('FAIL', fail_count, 0, '', False),  # 0 threshold = any is bad
        ('PARTIAL', partial_count, total, '', True),
    ]
    pdf.draw_metric_gauges(
        f'Checklist Results ({pass_count}/{total} PASS)',
        gauges
    )


def _render_checklist_table(pdf, items):
    """Render a checklist as a table with colored verdict badges."""
    if not items:
        return

    headers = ['#', 'Item', 'Verdict', 'Confidence']
    rows = []
    for it in items:
        num = str(it.get('number', ''))
        item_text = str(it.get('item', ''))
        # Truncate long item text for table
        if len(item_text) > 80:
            item_text = item_text[:77] + '...'
        verdict = str(it.get('verdict', 'N/A'))
        confidence = str(it.get('confidence', 'N/A'))
        rows.append([num, item_text, verdict, confidence])

    if rows:
        pdf.add_table(headers, rows)


def _render_checklist_evidence(pdf, items, max_items=None):
    """Render detailed evidence for checklist items."""
    rendered = 0
    for it in items:
        evidence = str(it.get('evidence', ''))
        if len(evidence) < 100:
            continue  # Skip items with sparse evidence

        item_name = str(it.get('item', ''))
        num = it.get('number', '')
        verdict = str(it.get('verdict', 'N/A'))

        pdf.add_section_header(f'Item {num}: {item_name} [{verdict}]', level=3)
        _render_narrative(pdf, evidence)

        rendered += 1
        if max_items and rendered >= max_items:
            pdf.add_body_text(f'... and {len(items) - rendered} more items (see full report)')
            break


# =========================================================================
# DEBATE RENDERING
# =========================================================================

def _render_debate(pdf, debate_outputs):
    """Render the full adversarial debate (Bull, Bear, Rebuttal, Judge)."""
    if not debate_outputs:
        pdf.add_body_text('No debate data available for this report.')
        return

    # ── Bull Thesis ──────────────────────────────────────────────────────
    bull = debate_outputs.get('bull', {})
    bull_content = bull.get('content', {})
    if bull_content:
        pdf.add_section_header('Bull Thesis', level=2)

        thesis = bull_content.get('overallThesis', '')
        if thesis:
            pdf.add_body_text(thesis)

        points = bull_content.get('thesisPoints', [])
        for i, pt in enumerate(points, 1):
            if isinstance(pt, dict):
                point_text = pt.get('point', '')
                evidence = pt.get('evidence', '')
                pdf.add_bullet(f'[{i}] {point_text}')
                if evidence and len(evidence) > 50:
                    pdf.add_body_text(f'   Evidence: {evidence[:200]}...'
                                      if len(evidence) > 200 else f'   Evidence: {evidence}')
            elif isinstance(pt, str):
                pdf.add_bullet(f'[{i}] {pt}')

    # ── Bear Inversion ───────────────────────────────────────────────────
    bear = debate_outputs.get('bear', {})
    bear_content = bear.get('content', {})
    if bear_content:
        pdf.add_section_header('Bear Inversion', level=2)

        bear_case = bear_content.get('overallBearCase', '')
        if bear_case:
            pdf.add_body_text(bear_case)

        inversions = bear_content.get('inversions', [])
        severity_colors = {
            'HIGH': pdf.red_500,
            'MEDIUM': pdf.amber_500,
            'LOW': pdf.green_400,
        }
        for inv in inversions:
            if isinstance(inv, dict):
                severity = str(inv.get('severity', 'MEDIUM')).upper()
                counter = inv.get('counterArgument', '')
                color_name = severity
                pdf.add_bullet(f'[{severity}] {counter[:200]}' +
                               ('...' if len(counter) > 200 else ''))

    # ── Bull Rebuttal ────────────────────────────────────────────────────
    rebuttal = debate_outputs.get('bull_rebuttal', {})
    rebuttal_content = rebuttal.get('content', {})
    if rebuttal_content:
        pdf.add_section_header('Bull Rebuttal', level=2)

        rebuttals = rebuttal_content.get('rebuttals', [])
        for reb in rebuttals:
            if isinstance(reb, dict):
                bear_pt = reb.get('bearPoint', '')
                rebuttal_text = reb.get('rebuttal', reb.get('counterRebuttal', ''))
                strength = reb.get('strength', '')
                if bear_pt:
                    pdf.add_bullet(f'Bear: {bear_pt[:120]}...'
                                   if len(bear_pt) > 120 else f'Bear: {bear_pt}')
                if rebuttal_text:
                    prefix = f'[{strength}] ' if strength else ''
                    pdf.add_body_text(f'   Rebuttal: {prefix}{rebuttal_text[:300]}' +
                                      ('...' if len(rebuttal_text) > 300 else ''))

    # ── Judge Verdict ────────────────────────────────────────────────────
    judge = debate_outputs.get('judge', {})
    judge_content = judge.get('content', {})
    if judge_content:
        pdf.add_section_header('Judge Verdict', level=2)

        overall = judge_content.get('overallVerdict', {})
        if isinstance(overall, dict):
            direction = str(overall.get('direction', 'N/A'))
            unresolved = overall.get('unresolvedCount', 0)
            summary = overall.get('summary', '')
            implication = overall.get('investmentImplication', '')

            # Direction badge
            vc = get_verdict_color(direction)
            badge_w = 50
            badge_h = 10
            bx = pdf.l_margin
            by = pdf.get_y()
            pdf.set_fill_color(*vc)
            pdf.rect(bx, by, badge_w, badge_h, 'F')
            pdf.set_font('ArialUni', 'B', 9)
            pdf.set_text_color(255, 255, 255)
            pdf.set_xy(bx, by + 1)
            pdf.cell(badge_w, badge_h - 2, f'Direction: {direction}', align='C')
            pdf.set_xy(bx + badge_w + 5, by)
            pdf.set_font('ArialUni', '', 9)
            pdf.set_text_color(*pdf.slate_800)
            pdf.cell(0, badge_h, f'Unresolved risks: {unresolved}')
            pdf.ln(badge_h + 4)

            if summary:
                pdf.add_body_text(summary)
            if implication:
                pdf.add_section_header('Investment Implication', level=3)
                pdf.add_body_text(implication)

        # Exchange table
        exchanges = judge_content.get('exchanges', [])
        if exchanges:
            pdf.add_section_header('Debate Exchanges', level=3)
            headers = ['Topic', 'Bull', 'Bear', 'Verdict']
            rows = []
            for ex in exchanges:
                if isinstance(ex, dict):
                    topic = str(ex.get('topic', ''))[:50]
                    bull_str = str(ex.get('bullStrength', ''))
                    bear_str = str(ex.get('bearStrength', ''))
                    verdict_str = str(ex.get('verdict', ''))
                    rows.append([topic, bull_str, bear_str, verdict_str])
            if rows:
                pdf.add_table(headers, rows)


# =========================================================================
# PRICE RANGE CHART
# =========================================================================

def _render_price_range(pdf, data):
    """Price range chart for valuation confirmation."""
    buy_prices = data.get_buy_prices()
    if not buy_prices:
        return

    current_price = data.data_packet.get('currentPrice', {}).get('price')
    if not current_price:
        return

    color_map = {
        'MOS': pdf.teal_400,
        'PBT': pdf.blue_500,
        'Ten Cap': pdf.green_500,
        'Equity Bond': pdf.blue_400,
    }

    methods = []
    for name, prices in buy_prices.items():
        if isinstance(prices, dict):
            low = prices.get('low', prices.get('ruleOne', 0))
            high = prices.get('high', prices.get('graham', low))
            if low and high:
                color = color_map.get(name, pdf.slate_500)
                methods.append((name, float(low), float(high), color))

    if methods:
        pdf.draw_price_range_chart('Buy Price Ranges vs Current Price',
                                   methods, current_price)


# =========================================================================
# MAIN GENERATOR
# =========================================================================

def generate_full_story(ticker):
    """Build the Full Story PDF with checklists, debate, and evidence."""
    proj = os.path.join(os.path.dirname(__file__), '..', '..')
    report_dir = os.path.join(proj, '.thes1s', 'reports', ticker)

    data = ReportData(ticker, 'full-story')
    company_name = data.get_company_name()

    # Full Story may not have a single overall verdict -- the debate IS the verdict
    overall_verdict = data.get_overall_verdict()

    pdf = Thes1sPDF(
        title=f'{company_name} ({ticker})',
        subtitle='Rule One Full Story \u2014 Investment Thesis Deep Dive',
        stage_label='Full Story'
    )

    # ── Title Page ───────────────────────────────────────────────────────
    pdf.title_page(
        ticker, company_name, 'Full Story',
        'Investment Thesis Deep Dive',
        verdict=overall_verdict if overall_verdict != 'N/A' else '',
        disclaimer='AI-generated research report for educational purposes only. Not financial advice.'
    )

    # ── Per-Section Rendering ────────────────────────────────────────────
    # Full Story sections: event_analysis, meaning_checklist, moat_checklist,
    # management_checklist, valuation_confirmation, inversion_rebuttal
    CHECKLIST_SECTIONS = {'meaning_checklist', 'moat_checklist', 'management_checklist'}

    section_num = 0
    for key in data.get_section_keys():
        section = data.get_section(key)
        if not section:
            continue

        section_num += 1
        title = section.get('title', key.replace('_', ' ').title())
        pdf.add_smart_section_header(f'{section_num}. {title}')

        # ── Checklist Sections ───────────────────────────────────────────
        if key in CHECKLIST_SECTIONS:
            # Narrative intro (if present)
            narr = get_narrative(section)
            if narr:
                _render_narrative(pdf, narr)

            # Checklist items
            items = get_checklist_items(section)
            if items:
                # Summary visual (pass/fail/partial counts)
                _render_checklist_summary(pdf, items)

                # Checklist table
                _render_checklist_table(pdf, items)

                # Detailed evidence for items with substantial content
                pdf.add_section_header('Evidence Detail', level=2)
                _render_checklist_evidence(pdf, items, max_items=8)

            # Checklist section summary from data
            section_data = section.get('data', {})
            if isinstance(section_data, dict):
                summary = section_data.get('summary', '')
                if isinstance(summary, dict):
                    # Structured summary: {passCount, failCount, partialCount, totalItems, scoreDisplay}
                    score = summary.get('scoreDisplay', '')
                    total = summary.get('totalItems', 0)
                    passes = summary.get('passCount', 0)
                    fails = summary.get('failCount', 0)
                    partials = summary.get('partialCount', 0)
                    summary_text = (f'Score: {score}  |  '
                                    f'{passes} PASS, {fails} FAIL, {partials} PARTIAL '
                                    f'out of {total} items')
                    pdf.add_section_header('Checklist Summary', level=3)
                    pdf.add_body_text(summary_text)
                elif isinstance(summary, str) and summary:
                    pdf.add_section_header('Checklist Summary', level=3)
                    pdf.add_body_text(summary)

        # ── Valuation Confirmation ───────────────────────────────────────
        elif key == 'valuation_confirmation':
            narr = get_narrative(section)
            if narr:
                _render_narrative(pdf, narr)

            # Price range chart
            _render_price_range(pdf, data)

            # Tables (sensitivity tables if present)
            tables = get_tables(section)
            _render_tables(pdf, tables)

        # ── Inversion & Rebuttal ─────────────────────────────────────────
        elif key == 'inversion_rebuttal':
            # Section narrative first (if present)
            narr = get_narrative(section)
            if narr:
                _render_narrative(pdf, narr)

            # Adversarial debate rendering
            debate_outputs = data.get_debate_outputs()
            _render_debate(pdf, debate_outputs)

        # ── Standard Sections (event_analysis, etc.) ─────────────────────
        else:
            narr = get_narrative(section)
            if narr:
                _render_narrative(pdf, narr)

            tables = get_tables(section)
            _render_tables(pdf, tables)

        # Red flags (all sections)
        flags = get_red_flags(section)
        _render_red_flags(pdf, flags)

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
    out_path = os.path.join(report_dir, 'full-story.pdf')
    pdf.output(out_path)
    print(f'PDF generated: {out_path}')
    print(f'Pages: {pdf.page_no()}')
    return out_path


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python3 generate_full_story_pdf.py <TICKER>')
        sys.exit(1)
    ticker = sys.argv[1].upper()
    generate_full_story(ticker)
