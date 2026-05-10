#!/usr/bin/env python3
"""
Generic Final Thesis PDF Generator
Generates a chart-heavy, Thesis-branded Final Thesis PDF for any ticker.
Includes checklist tables, adversarial debate rendering, and evidence sections.
Reads from final-thesis-api.json and DataPacket (data-packet.json).

Usage: python3 scripts/pdf/generate_final_thesis_pdf.py MNST
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
    get_verdict_color, format_currency,
    _clean_narrative,
    render_verdict_box, render_promise_tracker,
    render_trade_plan, render_watchpoints,
)
from citation_links import extract_url
from prose_structurer import structure_prose


# =========================================================================
# NARRATIVE RENDERING
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


def _format_citation_value(text):
    """Format citation values: large numbers become currency/readable."""
    if not text:
        return text
    try:
        num = float(text)
        if abs(num) >= 1e9:
            return f'${num/1e9:.2f}B'
        elif abs(num) >= 1e6:
            return f'${num/1e6:.2f}M'
        elif abs(num) >= 1e3 and num == int(num):
            return f'${num:,.0f}'
        return text
    except (ValueError, TypeError):
        return text


def _render_citations_page(pdf, all_citations):
    """Render a numbered citations page."""
    pdf.add_section_header('Citations & Sources', level=1)
    pdf.add_body_text(
        'All quantitative claims and data points are cited to their source. '
        'Citations are grouped by section.'
    )
    for section_name, cites in all_citations:
        if not cites:
            continue
        pdf.add_section_header(section_name, level=3)
        for i, c in enumerate(cites, 1):
            ref = c.get('ref', '')
            text = _format_citation_value(c.get('text', ''))
            source = c.get('source', 'DataPacket')
            line = f'[{i}] {ref}'
            if text:
                line += f': {text}'
            url_info = extract_url(source) if source else None
            if url_info:
                url, display = url_info
                line += f'  ({display})'
                pdf.add_bullet(line, indent=2, link=url, link_text=display)
            elif source and source != 'DataPacket':
                line += f'  ({source})'
                pdf.add_bullet(line, indent=2)
            else:
                pdf.add_bullet(line, indent=2)


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
# NEW VISUAL HELPERS — debate, trade plan, promises
# =========================================================================

def _section_data_dict(section):
    """Return section.data as a dict, decoding JSON-string variants."""
    if not isinstance(section, dict):
        return {}
    raw = section.get('data')
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except (ValueError, TypeError):
            return {}
    return {}


def _render_debate_divergent_bar(pdf, section):
    """Bull vs Bear divergent bar from debate.exchanges outcomes."""
    data = _section_data_dict(section)
    exchanges = data.get('exchanges')
    if not isinstance(exchanges, list) or not exchanges:
        return
    bulls, bears = [], []
    for ex in exchanges:
        if not isinstance(ex, dict):
            continue
        topic = str(ex.get('topic', ''))[:60]
        outcome = str(ex.get('outcome', '')).lower()
        if 'strong bull' in outcome or outcome == 'bull':
            bulls.append((topic, 9 if 'strong' in outcome else 6))
        elif 'strong bear' in outcome or outcome == 'bear':
            bears.append((topic, 9 if 'strong' in outcome else 6))
        elif 'unresolved' in outcome or 'mixed' in outcome:
            bulls.append((topic, 4))
            bears.append((topic, 4))
    if bulls or bears:
        pdf.draw_divergent_bar_chart('Debate Outcomes by Exchange', bulls, bears)


def _render_watchpoint_gauges(pdf, section):
    """Threshold gauge cluster for watchpoints."""
    data = _section_data_dict(section)
    wps = data.get('watchpoints')
    if not isinstance(wps, list) or not wps:
        return
    # Render as informational bar visual: each watchpoint shows current/threshold
    # text in a tinted card. We use a simple vertical list of mini-cards.
    pdf.ln(2)
    pdf.set_font('ArialUni', 'B', 10)
    pdf.set_text_color(*pdf.teal_500)
    pdf.cell(0, 7, 'Watchpoint Thresholds', new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    aw = pdf.w - pdf.l_margin - pdf.r_margin
    for wp in wps:
        if not isinstance(wp, dict):
            continue
        metric = str(wp.get('metric', ''))[:80]
        current = str(wp.get('currentValue', wp.get('current', '')))[:80]
        threshold = str(wp.get('threshold', ''))[:120]
        direction = str(wp.get('direction', '')).lower()

        if pdf.get_y() + 18 > pdf.h - 25:
            pdf.add_page()
        y = pdf.get_y()
        # Card background
        pdf.set_fill_color(*pdf.teal_50)
        pdf.set_draw_color(*pdf.teal_500)
        pdf.set_line_width(0.4)
        pdf.rect(pdf.l_margin, y, aw, 14, 'DF')

        # Metric (left)
        pdf.set_font('ArialUni', 'B', 9)
        pdf.set_text_color(*pdf.slate_800)
        pdf.set_xy(pdf.l_margin + 2, y + 1)
        pdf.cell(aw - 4, 4, metric)

        # Current
        pdf.set_font('ArialUni', '', 8)
        pdf.set_text_color(*pdf.slate_600)
        pdf.set_xy(pdf.l_margin + 2, y + 5.5)
        pdf.cell(aw - 4, 4, f'Current: {current}')

        # Threshold (with direction icon)
        arrow = {'below': 'v', 'above': '^', 'absent': 'x'}.get(direction, '~')
        pdf.set_font('ArialUni', 'B', 8)
        pdf.set_text_color(*pdf.amber_500)
        pdf.set_xy(pdf.l_margin + 2, y + 9.5)
        pdf.cell(aw - 4, 4, f'Re-evaluate {arrow} {threshold}')

        pdf.set_y(y + 16)
    pdf.ln(2)
    pdf.set_text_color(*pdf.slate_800)


def _render_trade_plan_ladder(pdf, section, current_price):
    """Price ladder visualization from entryTranches + sellRules."""
    data = _section_data_dict(section)
    tranches = data.get('entryTranches') or data.get('tranches') or []
    sell_rules = data.get('sellRules') or []

    levels = []
    for t in tranches:
        if not isinstance(t, dict):
            continue
        trig = t.get('triggerPrice') or t.get('trigger')
        try:
            price = float(str(trig).replace('$', '').replace(',', '').split('-')[0])
        except (ValueError, TypeError):
            continue
        label = f"Tranche {t.get('tranche', '')}"
        levels.append((label, price * 0.97, price * 1.03, 'entry'))

    for r in sell_rules:
        if not isinstance(r, dict):
            continue
        thr = r.get('threshold')
        action = str(r.get('action', '')).lower()
        try:
            # threshold strings often look like "$380" or "EPS below $10.57..."
            import re as _re
            m = _re.search(r'\$([\d,]+(?:\.\d+)?)', str(thr))
            if not m:
                continue
            price = float(m.group(1).replace(',', ''))
        except (ValueError, TypeError):
            continue
        label = str(r.get('trigger', ''))[:32]
        kind = 'exit' if 'full exit' in action or '100%' in action else 'trim'
        levels.append((label, price * 0.97, price * 1.03, kind))

    if levels and current_price:
        pdf.draw_price_ladder('Trade Plan — Entry, Trim, Exit Levels',
                              float(current_price), levels)


def _render_promise_status_grid(pdf, section):
    """Status heatmap for management promises."""
    data = _section_data_dict(section)
    promises = data.get('promises')
    if not isinstance(promises, list) or not promises:
        return
    # Group rows by category, columns by quarterYear
    from collections import OrderedDict
    rows = []
    cols_set = []
    cell_status = {}
    for p in promises:
        if not isinstance(p, dict):
            continue
        cat = str(p.get('category', 'OTHER'))[:24]
        q = str(p.get('quarterYear', p.get('quarter', '?')))[:14]
        status = str(p.get('status', '')).lower()
        # Map promise statuses to chart statuses
        smap = {'kept': 'delivered', 'partial': 'partial', 'missed': 'missed',
                'broken': 'missed', 'pending': 'pending', 'delivered': 'delivered'}
        s = smap.get(status, 'pending')
        if cat not in rows:
            rows.append(cat)
        if q not in cols_set:
            cols_set.append(q)
        cell_status[(cat, q)] = s

    if not rows or not cols_set:
        return
    # Sort columns chronologically by extracting Q#/year
    def _qkey(q):
        import re as _re
        m = _re.search(r'Q(\d).*?(\d{4})', q)
        return (int(m.group(2)), int(m.group(1))) if m else (9999, 9)
    cols_set.sort(key=_qkey)

    statuses = [[cell_status.get((r, c)) for c in cols_set] for r in rows]
    pdf.draw_status_grid('Management Promise Tracker — Status Grid',
                         rows, cols_set, statuses)


# =========================================================================
# MAIN GENERATOR
# =========================================================================

def generate_final_thesis(ticker, base_dir=None):
    """Build the Final Thesis PDF with checklists, debate, and evidence."""
    if base_dir is None:
        base_dir = os.path.join(os.path.dirname(__file__), '..', '..')
    report_dir = os.path.join(base_dir, '.thesis', 'reports', ticker)

    data = ReportData(ticker, 'final-thesis', base_dir=base_dir)
    company_name = data.get_company_name()

    # Final Thesis may not have a single overall verdict -- the debate IS the verdict
    overall_verdict = data.get_overall_verdict()

    pdf = ThesisPDF(
        title=f'{company_name} ({ticker})',
        subtitle='Final Thesis \u2014 Investment Thesis Deep Dive',
        stage_label='Final Thesis'
    )

    # ── Title Page ───────────────────────────────────────────────────────
    pdf.title_page(
        ticker, company_name, 'Final Thesis',
        'Investment Thesis Deep Dive',
        verdict=overall_verdict if overall_verdict != 'N/A' else '',
        disclaimer='AI-generated research report for educational purposes only. Not financial advice.'
    )

    # Pipeline flow on cover
    pdf.draw_pipeline_flow('Final Thesis')

    current_price = data.data_packet.get('currentPrice', {}).get('price')

    # ── Per-Section Rendering ────────────────────────────────────────────
    # Final Thesis sections (new pipeline): event_analysis, business_analysis,
    # moat_analysis, management_analysis, valuation_analysis, debate, trade_plan.
    # Legacy reports may also include: meaning_checklist, moat_checklist,
    # management_checklist, valuation_confirmation, inversion_rebuttal.
    DEBATE_KEYS = {'debate', 'inversion_rebuttal'}
    VALUATION_KEYS = {'valuation_analysis', 'valuation_confirmation'}

    section_num = 0
    for key in data.get_section_keys():
        section = data.get_section(key)
        if not section:
            continue

        section_num += 1
        title = section.get('title', key.replace('_', ' ').title())
        pdf.add_smart_section_header(f'{section_num}. {title}')

        # ── Trade Plan (§7) — own renderer, no verdict box ──────────────
        if key == 'trade_plan':
            narr = get_narrative(section)
            if narr:
                _render_narrative(pdf, narr)
            # NEW: visual price ladder before the textual rendering
            _render_trade_plan_ladder(pdf, section, current_price)
            render_trade_plan(pdf, section)
            # Red flags (rare on §7, but render if present)
            flags = get_red_flags(section)
            _render_red_flags(pdf, flags)
            continue

        # ── Debate / Inversion-Rebuttal (§6) — own renderer + watchpoints
        if key in DEBATE_KEYS:
            narr = get_narrative(section)
            if narr:
                _render_narrative(pdf, narr)
            # NEW: bull/bear divergent bar visualizing debate outcomes
            _render_debate_divergent_bar(pdf, section)
            # Adversarial debate rendering (text)
            debate_outputs = data.get_debate_outputs()
            _render_debate(pdf, debate_outputs)
            # NEW: visual watchpoint cards
            _render_watchpoint_gauges(pdf, section)
            # Watchpoints subsection (textual) at the end of §6 Compose
            render_watchpoints(pdf, section)
            # Standard verdict box for the Compose section (it does have a verdict)
            render_verdict_box(pdf, section)
            # Red flags
            flags = get_red_flags(section)
            _render_red_flags(pdf, flags)
            continue

        # ── Valuation §5 — narrative + price range chart + tables ───────
        if key in VALUATION_KEYS:
            narr = get_narrative(section)
            if narr:
                _render_narrative(pdf, narr)
            _render_price_range(pdf, data)
            tables = get_tables(section)
            _render_tables(pdf, tables)
            render_verdict_box(pdf, section)
            flags = get_red_flags(section)
            _render_red_flags(pdf, flags)
            continue

        # ── Standard prose sections (event_analysis, business_analysis,
        #    moat_analysis, management_analysis) ─────────────────────────
        narr = get_narrative(section)
        if narr:
            _render_narrative(pdf, narr)

        tables = get_tables(section)
        _render_tables(pdf, tables)

        # Verdict box callout (no-op if data.verdict missing)
        render_verdict_box(pdf, section)

        # Promise Tracker as a §4 subsection
        if key == 'management_analysis':
            _render_promise_status_grid(pdf, section)
            render_promise_tracker(pdf, section)

        # Red flags
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
    out_path = os.path.join(report_dir, 'final-thesis.pdf')
    pdf.output(out_path)
    print(f'PDF generated: {out_path}')
    print(f'Pages: {pdf.page_no()}')
    return out_path


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python3 generate_final_thesis_pdf.py <TICKER>')
        sys.exit(1)
    ticker = sys.argv[1].upper()
    generate_final_thesis(ticker)
