#!/usr/bin/env python3
"""
Generic Pitch Deck PDF Generator
Generates a chart-heavy, Thesis-branded 10-section Pitch Deck PDF for any ticker.
Reads from pipeline output (pipeline-output.json) and DataPacket (data-packet.json).

Usage: python3 scripts/pdf/generate_pitch_deck_pdf.py MNST
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
    get_verdict_color, format_currency, format_pct,
    _clean_narrative
)


# =========================================================================
# PITCH DECK REDESIGN (2026-05-09) — KEY MIGRATION + GROUPING
# =========================================================================

# Legacy section-key → current section-key. Routes archived pitch-deck JSON
# (generated before the 2026-05-09 redesign) through the new top-level grouping.
# Kept indefinitely so old reports still render.
LEGACY_KEY_MAP = {
    'radar': 'setup',
    'simple_predictable': 'business_quality',
    'simple_and_predictable': 'business_quality',
    'barriers_moats': 'moat_analysis',
    'fcf': 'cash_generation',
    'roe_roic_debt': 'returns_leverage',
    'management': 'management_capital_allocation',
    'pest': 'risk_profile',
    'pest_risks': 'risk_profile',
    'overall_verdict': 'investment_verdict',
    'valuation_summary': 'valuation',
}


def normalize_section_key(key):
    """Map legacy section keys to current keys; pass through if already current."""
    if not isinstance(key, str):
        return key
    return LEGACY_KEY_MAP.get(key, key)


# 8 top-level groupings used by the redesigned pitch deck. The renderer iterates
# this list and pulls matching subsection sections from the JSON. (UI/PDF stay
# in sync via the same constant in src/utils/keyNormalization.js.)
TOP_LEVEL_GROUPS = [
    {'title': 'Setup & Situation', 'subsection_keys': ['setup']},
    {'title': 'Business Quality', 'subsection_keys': ['business_quality']},
    {'title': 'Industry & Competitive Position',
     'subsection_keys': ['market_position', 'moat_analysis']},
    {'title': 'Financial Analysis',
     'subsection_keys': ['cash_generation', 'returns_leverage',
                         'balance_sheet', 'accounting_red_flags']},
    {'title': 'Management & Capital Allocation',
     'subsection_keys': ['management_capital_allocation']},
    {'title': 'Valuation', 'subsection_keys': ['valuation']},
    {'title': 'Risk Profile', 'subsection_keys': ['risk_profile']},
    {'title': 'Investment Verdict', 'subsection_keys': ['investment_verdict']},
]


# Verdict colors for the call-out box, matching the spec in the redesign plan.
VERDICT_BOX_COLORS = {
    'PASS':       (76, 175, 80),    # #4caf50 green
    'WATCHLIST':  (255, 152, 0),    # #ff9800 amber
    'PARTIAL':    (255, 152, 0),    # amber (alias)
    'CONTEXT':    (255, 152, 0),    # amber (alias)
    'FAIL':       (244, 67, 54),    # #f44336 red
}


def _verdict_box_color(verdict):
    """Return RGB tuple for the verdict-box border/accent."""
    v = str(verdict or '').upper().strip()
    return VERDICT_BOX_COLORS.get(v, (100, 116, 139))  # slate fallback


# =========================================================================
# NARRATIVE AND TABLE RENDERING
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


def _render_tables(pdf, tables):
    """Render a list of tables."""
    for tbl in tables:
        headers = tbl.get('headers', [])
        rows = tbl.get('rows', [])
        tbl_title = tbl.get('title', '')
        if tbl_title:
            pdf.add_section_header(tbl_title, level=3)
        if headers and rows:
            # Normalize rows -- sometimes they're dicts, sometimes lists
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
            if source and source != 'DataPacket':
                line += f'  ({source})'
            pdf.add_bullet(line, indent=2)


# =========================================================================
# SECTION-SPECIFIC CHART RENDERERS
# =========================================================================

def _get_financial_series(data, statement, field, n=5):
    """Extract last N years of a financial field from DataPacket.
    Returns: list of (year_label, value) tuples, oldest first.
    """
    years = data.get_financial_years(n)
    result = []
    for yr in reversed(years):  # oldest first
        yr_str = str(yr)
        stmt_data = data.data_packet.get('financials', {}).get(statement, {}).get(yr_str, {})
        val = stmt_data.get(field)
        if val is not None:
            result.append((f'FY{yr}', val))
    return result


def _render_revenue_chart(pdf, data):
    """Revenue bar chart for simple_and_predictable section."""
    series = _get_financial_series(data, 'income', 'revenues', 5)
    if not series:
        return
    labels = [s[0] for s in series]
    values = [s[1] / 1e9 for s in series]
    colors = [pdf.teal_400 if i < len(values) - 1 else pdf.teal_500 for i in range(len(values))]
    pdf.draw_bar_chart('Revenue Trend (Billions)', labels, values, colors,
                       unit='B', max_val=max(values) * 1.15)


def _render_fcf_chart(pdf, data):
    """Free Cash Flow bar chart for FCF section."""
    series = _get_financial_series(data, 'cashFlow', 'free_cash_flow', 5)
    if not series:
        return
    labels = [s[0] for s in series]
    values = [s[1] / 1e9 for s in series]
    has_neg = any(v < 0 for v in values)
    if has_neg:
        pdf.draw_pn_bar_chart('Free Cash Flow (Billions)', labels, values,
                              colors_pos=pdf.teal_500, colors_neg=pdf.red_400)
    else:
        colors = [pdf.teal_400 if i < len(values) - 1 else pdf.teal_500
                  for i in range(len(values))]
        pdf.draw_bar_chart('Free Cash Flow (Billions)', labels, values, colors,
                           unit='B', max_val=max(values) * 1.15 if values else 1)


def _render_balance_sheet_chart(pdf, data):
    """Debt/equity comparison for balance_sheet section."""
    years = data.get_financial_years(3)
    if not years:
        return

    equity_series = []
    debt_series = []
    labels = []
    for yr in reversed(years):
        yr_str = str(yr)
        bal = data.data_packet.get('financials', {}).get('balance', {}).get(yr_str, {})
        eq = bal.get('total_equity')
        debt = bal.get('total_debt') or bal.get('long_term_debt')
        if eq is not None:
            equity_series.append(eq / 1e9)
            debt_series.append((debt or 0) / 1e9)
            labels.append(f'FY{yr}')

    if equity_series:
        max_val = max(max(equity_series), max(debt_series)) * 1.15 if equity_series else 10
        pdf.draw_comparison_bar_chart(
            'Equity vs Debt',
            labels,
            [equity_series, debt_series],
            series_names=['Total Equity', 'Total Debt'],
            series_colors=[pdf.teal_500, pdf.red_400],
            unit='B',
            max_val=max_val,
        )


def _render_price_range(pdf, data):
    """Fair value range chart for the valuation section."""
    buy_prices = data.get_buy_prices()
    if not buy_prices:
        return

    current_price = data.data_packet.get('currentPrice', {}).get('price')
    if not current_price:
        return

    # Build method entries for chart
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
        pdf.draw_price_range_chart('Fair Value Ranges vs Current Price',
                                   methods, current_price)


def _render_valuation_deep_dive(pdf, data, section):
    """Render detailed valuation content: FGR derivation, per-method prices,
    historical P/E, dual owner earnings, convergence, and Rule of 72."""
    section_data = section.get('data', {})
    if isinstance(section_data, str):
        try:
            section_data = json.loads(section_data)
        except (json.JSONDecodeError, TypeError):
            section_data = {}
    if not isinstance(section_data, dict):
        return

    # ── FGR Derivation ──────────────────────────────────────────────────
    fgr = section_data.get('fgrDerivation', {})
    if fgr:
        pdf.add_section_header('Future Growth Rate (FGR) Derivation', level=2)

        fgr_rows = []
        perspective_names = {
            'historicalComposite': 'Historical Composite (Big 4)',
            'marketRelativity': 'Market Relativity (vs S&P 500)',
            'companyGuidance': 'Company Guidance',
            'industryCagr': 'Industry CAGR',
            'analystConsensus': 'Analyst Consensus',
        }
        for key, label in perspective_names.items():
            entry = fgr.get(key, {})
            if isinstance(entry, dict):
                val = entry.get('value', 'N/A')
                conf = entry.get('confidence', 'N/A')
                fgr_rows.append([label, str(val), str(conf)])

        if fgr_rows:
            pdf.add_table(['Perspective', 'Estimate', 'Confidence'], fgr_rows)

        final_fgr = fgr.get('finalFGR', {})
        if isinstance(final_fgr, dict):
            low = final_fgr.get('low', '')
            high = final_fgr.get('high', '')
            if low and high:
                low_pct = f'{float(low)*100:.0f}%' if isinstance(low, (int, float)) else str(low)
                high_pct = f'{float(high)*100:.0f}%' if isinstance(high, (int, float)) else str(high)
                pdf.add_body_text(f'Final FGR Range: {low_pct} — {high_pct}')

    # ── Per-Method Buy Prices ───────────────────────────────────────────
    method_data = []
    method_configs = [
        ('mosBuyPrice', 'Margin of Safety (MOS)', ['low', 'high']),
        ('pbtBuyPrice', 'Payback Time (PBT)', ['low', 'high']),
        ('tenCapPrice', 'Ten Cap', ['ruleOne', 'graham']),
        ('equityBondBuyPrice', 'Equity Bond', ['low', 'high']),
    ]
    for field, label, keys in method_configs:
        prices = section_data.get(field, {})
        if isinstance(prices, dict):
            vals = []
            for k in keys:
                v = prices.get(k)
                if v is not None:
                    vals.append(f'${float(v):,.2f}')
                else:
                    vals.append('N/A')
            method_data.append([label, vals[0], vals[1] if len(vals) > 1 else 'N/A'])

    if method_data:
        pdf.add_section_header('Fair Value Summary by Method', level=2)
        col_labels = ['Method', 'Conservative', 'Optimistic']
        pdf.add_table(col_labels, method_data)

    # Current price context
    current = section_data.get('currentPrice')
    pvb = section_data.get('priceVsBuyRange', '')
    if pvb:
        pdf.add_body_text(pvb)

    # ── Historical P/E ──────────────────────────────────────────────────
    hist_pe = section_data.get('historicalPE', {})
    if isinstance(hist_pe, dict) and hist_pe:
        pdf.add_section_header('Historical P/E Analysis', level=2)
        pe_rows = []
        for k, label in [('10yrAverage', '10-Year Average'), ('10yrMedian', '10-Year Median'),
                         ('10yrMin', '10-Year Min'), ('10yrMax', '10-Year Max'),
                         ('futurePEUsed', 'Future P/E Used')]:
            v = hist_pe.get(k)
            if v is not None:
                pe_rows.append([label, f'{float(v):.1f}'])
        if pe_rows:
            pdf.add_table(['Metric', 'Value'], pe_rows)
        rationale = hist_pe.get('rationale', '')
        if rationale:
            pdf.add_body_text(rationale)

    # ── Dual Owner Earnings ─────────────────────────────────────────────
    dual_oe = section_data.get('dualOwnerEarnings', {})
    if isinstance(dual_oe, dict) and dual_oe:
        pdf.add_section_header('Dual Owner Earnings', level=2)
        oe_rows = []
        r1 = dual_oe.get('ruleOneOE')
        gr = dual_oe.get('grahamOE')
        if r1 is not None:
            oe_rows.append(['Value Investing Method', format_currency(r1)])
        if gr is not None:
            oe_rows.append(['Graham Method', format_currency(gr)])
        if oe_rows:
            pdf.add_table(['Method', 'Owner Earnings'], oe_rows)
        divergence = dual_oe.get('divergence', '')
        if divergence:
            pdf.add_body_text(f'Divergence: {divergence}')

    # ── Convergence Analysis ────────────────────────────────────────────
    convergence = section_data.get('convergence', '')
    if convergence:
        pdf.add_section_header('Method Convergence', level=2)
        pdf.add_body_text(convergence)

    # ── Rule of 72 Spot Check ───────────────────────────────────────────
    rule72 = section_data.get('ruleOf72SpotCheck', {})
    if isinstance(rule72, dict) and rule72:
        pdf.add_section_header('Rule of 72 Market Ceiling Check', level=2)
        for label, key in [('FGR Low', 'fgrLow'), ('FGR High', 'fgrHigh')]:
            val = rule72.get(key, '')
            if val:
                pdf.add_bullet(f'{label}: {val}')


# =========================================================================
# SCORECARD BUILDER
# =========================================================================

def _build_scorecard_rows(data):
    """Build verdict scorecard rows from all subsections (skip the final
    investment_verdict which is the overall summary)."""
    rows = []
    for key in data.get_section_keys():
        norm_key = normalize_section_key(key)
        if norm_key == 'investment_verdict':
            continue
        section = data.get_section(key)
        if not section:
            continue
        title = section.get('title', norm_key.replace('_', ' ').title())
        verdict = section.get('verdict', 'N/A')
        confidence = section.get('confidence', 'N/A')
        rationale = section.get('verdictRationale', '')
        signal = rationale[:40] + '...' if len(rationale) > 40 else rationale
        rows.append((title, verdict, confidence, signal))
    return rows


def _build_section_index(data):
    """Build a lookup of normalized-key → (raw_key, section dict)."""
    index = {}
    for raw_key in data.get_section_keys():
        norm = normalize_section_key(raw_key)
        section = data.get_section(raw_key)
        if section and norm not in index:
            index[norm] = (raw_key, section)
    return index


# =========================================================================
# SECTION-SPECIFIC VISUAL INJECTIONS
# =========================================================================

# Sections where we inject DataPacket-sourced charts.
# Keyed by NORMALIZED (current) section keys.
CHART_SECTIONS = {
    'business_quality': '_render_revenue_chart',
    'cash_generation': '_render_fcf_chart',
    'balance_sheet': '_render_balance_sheet_chart',
    'valuation': '_render_price_range',
}


def _render_section_charts(pdf, data, section_key, original_key=None):
    """Inject section-specific charts based on the NORMALIZED section key.

    `section_key` is the normalized current key. `original_key` (optional)
    is the raw key from JSON, used to look up the raw section for legacy
    code paths that still call ReportData.get_section() with the old key.
    """
    raw_key = original_key or section_key
    if section_key == 'business_quality':
        _render_revenue_chart(pdf, data)
    elif section_key == 'cash_generation':
        _render_fcf_chart(pdf, data)
    elif section_key == 'balance_sheet':
        _render_balance_sheet_chart(pdf, data)
    elif section_key == 'valuation':
        _render_price_range(pdf, data)
        _render_valuation_deep_dive(pdf, data, data.get_section(raw_key))
    elif section_key == 'management_capital_allocation':
        # Score gauges if data available
        scores = data.get_scores()
        if scores:
            gauges = []
            if 'moat' in scores:
                gauges.append(('Moat Score', scores['moat'], 70, '', True))
            if 'management' in scores:
                gauges.append(('Mgmt Score', scores['management'], 70, '', True))
            if 'composite' in scores:
                gauges.append(('Composite', scores['composite'], 70, '', True))
            if gauges:
                pdf.draw_metric_gauges('Thesis Scores', gauges)


# =========================================================================
# VERDICT BOX + REDESIGN-SPECIFIC RENDERERS
# =========================================================================

def render_verdict_box(pdf, section):
    """Render a color-coded bordered call-out summarizing the section verdict.

    Reads section.verdict (PASS / WATCHLIST / FAIL), section.verdictRationale,
    and any structured verdict-box fields the agent emitted at the end of its
    data payload. Drawn as a bordered box with a left accent stripe colored
    by the verdict.
    """
    if not isinstance(section, dict):
        return

    verdict = str(section.get('verdict', '') or '').upper().strip()
    if not verdict:
        return

    rationale = section.get('verdictRationale', '') or ''
    rationale = _clean_narrative(rationale) if rationale else ''
    confidence = section.get('confidence', '') or ''

    # Optional structured verdict-box payload from the agent
    data = section.get('data', {}) if isinstance(section.get('data'), dict) else {}
    box_payload = data.get('verdictBox') if isinstance(data.get('verdictBox'), dict) else {}

    color = _verdict_box_color(verdict)
    pad = 4  # mm
    avail_w = pdf.w - pdf.l_margin - pdf.r_margin

    # Estimate height from the rationale length (rough; multi_cell will reflow).
    pdf.ln(2)
    y_start = pdf.get_y()

    # Page-break if not enough room for at least the header row.
    if y_start + 20 > pdf.h - 25:
        pdf.add_page()
        y_start = pdf.get_y()

    x_start = pdf.l_margin
    accent_w = 2.0  # left accent stripe width

    # Header line — "Verdict: PASS  |  Confidence: HIGH"
    pdf.set_xy(x_start + accent_w + pad, y_start + pad)
    pdf.set_font('ArialUni', 'B', 11)
    pdf.set_text_color(*color)
    header_txt = f'Verdict: {verdict}'
    if confidence:
        header_txt += f'   |   Confidence: {confidence}'
    pdf.cell(avail_w - accent_w - 2 * pad, 6, header_txt)
    pdf.ln(7)

    # Rationale
    if rationale:
        pdf.set_x(x_start + accent_w + pad)
        pdf.set_font('ArialUni', '', 9.5)
        pdf.set_text_color(40, 40, 50)
        pdf.multi_cell(avail_w - accent_w - 2 * pad, 5, rationale)

    # Optional structured fields (verdict-box payload)
    if box_payload:
        for label, key in [
            ('Bull Case', 'bullCase'),
            ('Bear Case', 'bearCase'),
            ('What Would Change This', 'whatWouldChange'),
            ('Watch Items', 'watchItems'),
        ]:
            val = box_payload.get(key)
            if not val:
                continue
            pdf.set_x(x_start + accent_w + pad)
            pdf.set_font('ArialUni', 'B', 9)
            pdf.set_text_color(60, 60, 80)
            pdf.cell(avail_w - accent_w - 2 * pad, 5, f'{label}:')
            pdf.ln(5)
            pdf.set_x(x_start + accent_w + pad)
            pdf.set_font('ArialUni', '', 9)
            pdf.set_text_color(50, 50, 60)
            if isinstance(val, list):
                for item in val:
                    pdf.set_x(x_start + accent_w + pad)
                    pdf.cell(4, 5, chr(8226))
                    pdf.multi_cell(avail_w - accent_w - 2 * pad - 4, 5, str(item))
            else:
                pdf.multi_cell(avail_w - accent_w - 2 * pad, 5, str(val))

    # Compute box height and draw the border + accent stripe.
    y_end = pdf.get_y() + pad
    box_h = y_end - y_start
    if box_h < 12:
        box_h = 12

    # Border
    pdf.set_draw_color(*color)
    pdf.set_line_width(0.4)
    pdf.rect(x_start, y_start, avail_w, box_h)
    # Accent stripe (filled)
    pdf.set_fill_color(*color)
    pdf.rect(x_start, y_start, accent_w, box_h, 'F')
    pdf.set_line_width(0.2)

    # Reset text color and advance below the box.
    pdf.set_text_color(*pdf.color_text)
    pdf.set_y(y_start + box_h + 3)


def render_accounting_red_flags(pdf, section):
    """Render the §4d Accounting Red Flags section.

    Iterates `data.categories[]`. Each category has a name, a status ("Clean"
    or "Issues Found"), and a `flagsFound[]` list. Renders each as a sub-block
    color-coded by status using the same palette as the verdict box.
    """
    if not isinstance(section, dict):
        return
    data = section.get('data', {})
    if not isinstance(data, dict):
        return
    categories = data.get('categories', [])
    if not isinstance(categories, list) or not categories:
        return

    pdf.add_section_header('Accounting Red Flag Categories', level=2)

    for cat in categories:
        if not isinstance(cat, dict):
            continue
        name = str(cat.get('name', cat.get('category', 'Category')))
        status = str(cat.get('status', cat.get('verdict', '')) or '').strip()
        flags = cat.get('flagsFound', cat.get('flags', []))
        if not isinstance(flags, list):
            flags = []

        # Status drives the color; map "Clean" → green, "Issues Found" → amber/red.
        status_upper = status.upper()
        if status_upper in ('CLEAN', 'PASS', 'OK'):
            color = VERDICT_BOX_COLORS['PASS']
            display_status = 'Clean'
        elif status_upper in ('FAIL', 'CRITICAL'):
            color = VERDICT_BOX_COLORS['FAIL']
            display_status = status or 'Issues Found'
        else:
            color = VERDICT_BOX_COLORS['WATCHLIST']
            display_status = status or 'Issues Found'

        # Category header
        pdf.set_font('ArialUni', 'B', 11)
        pdf.set_text_color(*color)
        pdf.multi_cell(0, 6, f'{name}: {display_status}')
        pdf.set_text_color(*pdf.color_text)

        # Flags (or "Clean" note)
        if flags:
            for f in flags:
                if isinstance(f, dict):
                    txt = f.get('flag') or f.get('description') or f.get('detail') or str(f)
                else:
                    txt = str(f)
                pdf.add_bullet(txt)
        else:
            pdf.set_font('ArialUni', '', 9.5)
            pdf.set_text_color(80, 80, 90)
            pdf.multi_cell(0, 5, 'No issues identified in this category.')
            pdf.set_text_color(*pdf.color_text)

        pdf.ln(2)


def render_pre_decision_check(pdf, section):
    """Render the closing Pre-Decision Quality Check block on Investment Verdict.

    Reads section.data.preDecisionCheck. Visually distinct: indented, italic,
    light-gray background.
    """
    if not isinstance(section, dict):
        return
    data = section.get('data', {})
    if not isinstance(data, dict):
        return
    pdc = data.get('preDecisionCheck')
    if not pdc:
        return

    # Normalize: dict with confidenceCalibration + anticipatedRegret, or string.
    confidence_calibration = ''
    anticipated_regret = ''
    free_text = ''
    if isinstance(pdc, dict):
        confidence_calibration = str(pdc.get('confidenceCalibration', '') or '')
        anticipated_regret = str(pdc.get('anticipatedRegret', '') or '')
        free_text = str(pdc.get('text', '') or pdc.get('summary', '') or '')
    elif isinstance(pdc, str):
        free_text = pdc

    if not (confidence_calibration or anticipated_regret or free_text):
        return

    pdf.ln(3)
    pdf.add_section_header('Pre-Decision Quality Check', level=3)

    pad = 3
    indent = 6
    avail_w = pdf.w - pdf.l_margin - pdf.r_margin - indent
    y_start = pdf.get_y()

    if y_start + 20 > pdf.h - 25:
        pdf.add_page()
        y_start = pdf.get_y()

    pdf.set_xy(pdf.l_margin + indent, y_start + pad)
    pdf.set_font('ArialUni', 'I', 9.5)
    pdf.set_text_color(60, 60, 80)

    if confidence_calibration:
        pdf.set_x(pdf.l_margin + indent)
        pdf.set_font('ArialUni', 'B', 9.5)
        pdf.cell(avail_w - 2 * pad, 5, 'Confidence calibration:')
        pdf.ln(5)
        pdf.set_x(pdf.l_margin + indent)
        pdf.set_font('ArialUni', 'I', 9.5)
        pdf.multi_cell(avail_w - 2 * pad, 5, confidence_calibration)
        pdf.ln(1)
    if anticipated_regret:
        pdf.set_x(pdf.l_margin + indent)
        pdf.set_font('ArialUni', 'B', 9.5)
        pdf.cell(avail_w - 2 * pad, 5, 'Anticipated regret:')
        pdf.ln(5)
        pdf.set_x(pdf.l_margin + indent)
        pdf.set_font('ArialUni', 'I', 9.5)
        pdf.multi_cell(avail_w - 2 * pad, 5, anticipated_regret)
        pdf.ln(1)
    if free_text and not (confidence_calibration or anticipated_regret):
        pdf.set_x(pdf.l_margin + indent)
        pdf.multi_cell(avail_w - 2 * pad, 5, free_text)

    y_end = pdf.get_y() + pad
    box_h = y_end - y_start
    if box_h < 10:
        box_h = 10

    # Light-gray fill behind the block (drawn AFTER content so it shows the
    # outline; FPDF doesn't support drawing behind text without separate state,
    # so we draw a thin border in slate to differentiate).
    pdf.set_draw_color(180, 188, 200)
    pdf.set_line_width(0.3)
    pdf.rect(pdf.l_margin, y_start, pdf.w - pdf.l_margin - pdf.r_margin, box_h)

    pdf.set_text_color(*pdf.color_text)
    pdf.set_line_width(0.2)
    pdf.set_y(y_start + box_h + 3)


# =========================================================================
# MAIN GENERATOR
# =========================================================================

def generate_pitch_deck(ticker, base_dir=None):
    """Build the full visual Pitch Deck PDF."""
    if base_dir is None:
        base_dir = os.path.join(os.path.dirname(__file__), '..', '..')
    report_dir = os.path.join(base_dir, '.thesis', 'reports', ticker)

    data = ReportData(ticker, 'pitch-deck', base_dir=base_dir)
    company_name = data.get_company_name()
    overall_verdict = data.get_overall_verdict()

    pdf = ThesisPDF(
        title=f'{company_name} ({ticker})',
        subtitle='value investing Pitch Deck \u2014 Business Research Case',
        stage_label='Pitch Deck'
    )

    # ── Title Page ───────────────────────────────────────────────────────
    pdf.title_page(
        ticker, company_name, 'Pitch Deck',
        'Business Research Case',
        verdict=overall_verdict,
        disclaimer='AI-generated research report for educational purposes only. Not financial advice.'
    )

    # ── Verdict Scorecard ────────────────────────────────────────────────
    pdf.add_section_header('Section Verdict Scorecard', level=1)
    scorecard_rows = _build_scorecard_rows(data)
    if scorecard_rows:
        pdf.draw_verdict_scorecard('Section Verdicts', scorecard_rows)

    # ── Per-Section Rendering (7-group structure) ────────────────────────
    # Iterate TOP_LEVEL_GROUPS, render top-level heading once, then each
    # matching subsection in order. Legacy keys are auto-routed via
    # normalize_section_key. Top-level groups with no matching subsections
    # in this report are skipped (graceful degradation against legacy data).
    section_index = _build_section_index(data)
    all_citations = []

    for group_num, group in enumerate(TOP_LEVEL_GROUPS, start=1):
        sub_keys = group['subsection_keys']
        present_subs = [(sk, section_index[sk]) for sk in sub_keys if sk in section_index]
        if not present_subs:
            continue

        # Top-level heading (level 1 → new page)
        pdf.add_section_header(f'{group_num}. {group["title"]}', level=1)

        for norm_key, (raw_key, section) in present_subs:
            # Subsection title
            sub_title = section.get('title', norm_key.replace('_', ' ').title())
            pdf.add_section_header(sub_title, level=2)

            # Section-specific charts BEFORE narrative (visual lead-in)
            _render_section_charts(pdf, data, norm_key, original_key=raw_key)

            # Narrative
            narr = get_narrative(section)
            if narr:
                _render_narrative(pdf, narr)

            # Tables from section data
            tables = get_tables(section)
            _render_tables(pdf, tables)

            # Red flags (skip on accounting_red_flags — categories block below
            # already covers them in a structured way).
            if norm_key != 'accounting_red_flags':
                flags = get_red_flags(section)
                _render_red_flags(pdf, flags)

            # §4d Accounting Red Flags categories block
            if norm_key == 'accounting_red_flags':
                render_accounting_red_flags(pdf, section)

            # Verdict box after each subsection narrative
            render_verdict_box(pdf, section)

            # Investment verdict gets the closing pre-decision check block
            if norm_key == 'investment_verdict':
                render_pre_decision_check(pdf, section)

            # Collect citations
            cites = get_citations(section)
            label = f'{group_num}. {group["title"]} — {sub_title}'
            all_citations.append((label, cites))

    # ── Citations ────────────────────────────────────────────────────────
    _render_citations_page(pdf, all_citations)

    # ── Save ─────────────────────────────────────────────────────────────
    os.makedirs(report_dir, exist_ok=True)
    out_path = os.path.join(report_dir, 'pitch-deck.pdf')
    pdf.output(out_path)
    print(f'PDF generated: {out_path}')
    print(f'Pages: {pdf.page_no()}')
    return out_path


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python3 generate_pitch_deck_pdf.py <TICKER>')
        sys.exit(1)
    ticker = sys.argv[1].upper()
    generate_pitch_deck(ticker)
