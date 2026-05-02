#!/usr/bin/env python3
"""
Generic Pitch Deck PDF Generator
Generates a chart-heavy, Thes1s-branded 10-section Pitch Deck PDF for any ticker.
Reads from pipeline output (pipeline-output.json) and DataPacket (data-packet.json).

Usage: python3 scripts/pdf/generate_pitch_deck_pdf.py MNST
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
    get_verdict_color, format_currency, format_pct,
    _clean_narrative
)


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
    """Price range chart for valuation_summary section."""
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
        pdf.draw_price_range_chart('Buy Price Ranges vs Current Price',
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
        pdf.add_section_header('Buy Price Summary by Method', level=2)
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
            oe_rows.append(['Rule One Method', format_currency(r1)])
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
    """Build verdict scorecard rows from all sections."""
    rows = []
    for key in data.get_section_keys():
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
# SECTION-SPECIFIC VISUAL INJECTIONS
# =========================================================================

# Sections where we inject DataPacket-sourced charts
CHART_SECTIONS = {
    'simple_and_predictable': '_render_revenue_chart',
    'fcf': '_render_fcf_chart',
    'balance_sheet': '_render_balance_sheet_chart',
    'valuation_summary': '_render_price_range',
}


def _render_section_charts(pdf, data, section_key):
    """Inject section-specific charts based on section key."""
    if section_key == 'simple_and_predictable':
        _render_revenue_chart(pdf, data)
    elif section_key == 'fcf':
        _render_fcf_chart(pdf, data)
    elif section_key == 'balance_sheet':
        _render_balance_sheet_chart(pdf, data)
    elif section_key == 'valuation_summary':
        _render_price_range(pdf, data)
        _render_valuation_deep_dive(pdf, data, data.get_section(section_key))
    elif section_key == 'management':
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
                pdf.draw_metric_gauges('Rule One Scores', gauges)


# =========================================================================
# MAIN GENERATOR
# =========================================================================

def generate_pitch_deck(ticker, base_dir=None):
    """Build the full visual Pitch Deck PDF."""
    if base_dir is None:
        base_dir = os.path.join(os.path.dirname(__file__), '..', '..')
    report_dir = os.path.join(base_dir, '.thes1s', 'reports', ticker)

    data = ReportData(ticker, 'pitch-deck', base_dir=base_dir)
    company_name = data.get_company_name()
    overall_verdict = data.get_overall_verdict()

    pdf = Thes1sPDF(
        title=f'{company_name} ({ticker})',
        subtitle='Rule One Pitch Deck \u2014 10-Section Business Case',
        stage_label='Pitch Deck'
    )

    # ── Title Page ───────────────────────────────────────────────────────
    pdf.title_page(
        ticker, company_name, 'Pitch Deck',
        '10-Section Business Case',
        verdict=overall_verdict,
        disclaimer='AI-generated research report for educational purposes only. Not financial advice.'
    )

    # ── Verdict Scorecard ────────────────────────────────────────────────
    pdf.add_section_header('Section Verdict Scorecard', level=1)
    scorecard_rows = _build_scorecard_rows(data)
    if scorecard_rows:
        pdf.draw_verdict_scorecard('10-Section Verdicts', scorecard_rows)

    # ── Per-Section Rendering ────────────────────────────────────────────
    section_num = 0
    for key in data.get_section_keys():
        section = data.get_section(key)
        if not section:
            continue

        section_num += 1
        title = section.get('title', key.replace('_', ' ').title())

        # Each major section starts on a new page
        pdf.add_smart_section_header(f'{section_num}. {title}')

        # Section-specific charts BEFORE narrative (visual lead-in)
        _render_section_charts(pdf, data, key)

        # Narrative
        narr = get_narrative(section)
        if narr:
            _render_narrative(pdf, narr)

        # Tables from section data
        tables = get_tables(section)
        _render_tables(pdf, tables)

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
