#!/usr/bin/env python3
"""
CEG One Pager — Visual PDF Report
Generates a chart-heavy, Thes1s-branded investment analysis PDF.
Uses pdf_template_toolkit.py + Thes1sPDF patterns from generate_agentic_workflow_stack.py.
"""

import os
import sys
import json
import math
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdf_template_toolkit import ReportPDF


# ═══════════════════════════════════════════════════════════════════════════════
# THES1S-BRANDED PDF CLASS
# ═══════════════════════════════════════════════════════════════════════════════

class OnePagerPDF(ReportPDF):
    """Thes1s-branded One Pager PDF with custom chart methods."""

    def __init__(self, title, subtitle=''):
        super().__init__(title, subtitle)
        # Thes1s palette
        self.color_primary = (15, 118, 110)
        self.color_secondary = (30, 41, 59)
        self.color_text = (30, 41, 59)
        self.color_muted = (100, 116, 139)
        self.color_light_muted = (148, 163, 184)
        self.color_accent = (15, 118, 110)
        self.color_table_header = (15, 118, 110)
        self.color_table_alt_row = (240, 253, 250)

        # Extended palette for charts
        self.teal_500 = (15, 118, 110)
        self.teal_400 = (45, 212, 191)
        self.teal_300 = (94, 234, 212)
        self.teal_100 = (204, 251, 241)
        self.teal_50 = (240, 253, 250)
        self.slate_800 = (30, 41, 59)
        self.slate_700 = (51, 65, 85)
        self.slate_600 = (71, 85, 105)
        self.slate_500 = (100, 116, 139)
        self.slate_200 = (226, 232, 240)
        self.slate_100 = (241, 245, 249)
        self.red_500 = (239, 68, 68)
        self.red_400 = (248, 113, 113)
        self.amber_500 = (245, 158, 11)
        self.amber_400 = (251, 191, 36)
        self.green_500 = (34, 197, 94)
        self.green_400 = (74, 222, 128)
        self.blue_500 = (59, 130, 246)
        self.blue_400 = (96, 165, 250)

    def draw_logo(self, x, y, size=22):
        s = size / 32
        self.set_fill_color(*self.slate_800)
        self.rect(x, y, 32 * s, 32 * s, 'F')
        self.set_fill_color(20, 184, 166)
        cx, cy = x + 16 * s, y + 5 * s
        r = 2.5 * s
        self.ellipse(cx - r, cy - r, r * 2, r * 2, 'F')
        self.set_fill_color(203, 213, 225)
        self.rect(x + 4.5 * s, y + 10 * s, 23 * s, 2.8 * s, 'F')
        self.set_fill_color(20, 184, 166)
        self.rect(x + 14 * s, y + 10 * s, 4 * s, 17 * s, 'F')

    def header(self):
        if self.page_no() > 1:
            self.draw_logo(self.l_margin, 5, 8)
            self.set_font('ArialUni', '', 8)
            self.set_text_color(*self.slate_500)
            self.set_xy(self.l_margin + 11, 5)
            self.cell(0, 8, self.report_title)
            self.set_draw_color(*self.teal_100)
            self.set_line_width(0.3)
            self.line(self.l_margin, 14, self.w - self.r_margin, 14)
            self.set_y(18)

    def footer(self):
        self.set_y(-12)
        self.set_font('ArialUni', '', 7.5)
        self.set_text_color(*self.slate_500)
        if self.page_no() > 1:
            self.cell(0, 10, f'Thes1s  |  CEG One Pager  |  Page {self.page_no() - 1}', align='C')

    def add_title_page(self, info_lines=None, disclaimer=None):
        self.add_page()
        self.ln(20)
        logo_size = 28
        self.draw_logo((self.w - logo_size) / 2, self.get_y(), logo_size)
        self.ln(logo_size + 8)
        self.set_font('ArialUni', 'B', 12)
        self.set_text_color(*self.teal_500)
        self.cell(0, 6, 'Thes1s', align='C', new_x="LMARGIN", new_y="NEXT")
        self.ln(12)
        self.set_font('ArialUni', 'B', 24)
        self.set_text_color(*self.slate_800)
        self.multi_cell(0, 10, self.report_title, align='C')
        self.ln(4)
        if self.report_subtitle:
            self.set_font('ArialUni', '', 14)
            self.set_text_color(*self.slate_600)
            self.multi_cell(0, 8, self.report_subtitle, align='C')
            self.ln(10)
        self.set_draw_color(*self.teal_500)
        self.set_line_width(0.8)
        xc = self.w / 2
        self.line(xc - 40, self.get_y(), xc + 40, self.get_y())
        self.ln(12)
        self.set_font('ArialUni', '', 11)
        self.set_text_color(*self.slate_500)
        if info_lines:
            for line in info_lines:
                self.cell(0, 7, line, align='C', new_x="LMARGIN", new_y="NEXT")
        if disclaimer:
            self.ln(20)
            self.set_font('ArialUni', 'I', 9)
            self.set_text_color(*self.slate_500)
            self.multi_cell(0, 5, disclaimer, align='C')

    # ── Custom Chart: Verdict Scorecard ──────────────────────────────────────

    def draw_verdict_scorecard(self, title, sections):
        """Draw a visual scorecard with colored verdict badges."""
        if self.get_y() + len(sections) * 12 + 25 > self.h - 25:
            self.add_page()
        self.ln(3)
        self.set_font('ArialUni', 'B', 11)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

        aw = self.w - self.l_margin - self.r_margin
        name_w = aw * 0.42
        verdict_w = aw * 0.20
        conf_w = aw * 0.18
        note_w = aw * 0.20

        # Header
        self.set_font('ArialUni', 'B', 8)
        self.set_fill_color(*self.teal_500)
        self.set_text_color(255, 255, 255)
        self.set_draw_color(180, 180, 180)
        for txt, w in [('Section', name_w), ('Verdict', verdict_w), ('Confidence', conf_w), ('Signal', note_w)]:
            self.cell(w, 8, txt, border=1, fill=True, align='C')
        self.ln()

        verdict_colors = {
            'PASS': self.green_500,
            'FAIL': self.red_500,
            'WATCHLIST': self.amber_500,
        }

        for i, (name, verdict, confidence, signal) in enumerate(sections):
            if i % 2 == 0:
                self.set_fill_color(*self.teal_50)
            else:
                self.set_fill_color(255, 255, 255)

            y = self.get_y()

            # Name
            self.set_font('ArialUni', '', 8)
            self.set_text_color(*self.slate_800)
            self.cell(name_w, 10, name, border=1, fill=True)

            # Verdict badge
            vc = verdict_colors.get(verdict, self.slate_500)
            self.set_fill_color(*vc)
            badge_x = self.get_x() + verdict_w / 2 - 12
            self.set_fill_color(*(self.teal_50 if i % 2 == 0 else (255, 255, 255)))
            self.cell(verdict_w, 10, '', border=1, fill=True)
            # Draw badge on top
            self.set_fill_color(*vc)
            self.rect(badge_x, y + 2, 24, 6, 'F')
            self.set_font('ArialUni', 'B', 6.5)
            self.set_text_color(255, 255, 255)
            self.set_xy(badge_x, y + 2)
            self.cell(24, 6, verdict, align='C')
            self.set_xy(self.l_margin + name_w + verdict_w, y)

            # Confidence
            self.set_text_color(*self.slate_800)
            self.set_font('ArialUni', '', 8)
            self.set_fill_color(*(self.teal_50 if i % 2 == 0 else (255, 255, 255)))
            self.cell(conf_w, 10, confidence, border=1, fill=True, align='C')

            # Signal
            self.cell(note_w, 10, signal, border=1, fill=True, align='C')
            self.ln()
        self.ln(4)

    # ── Custom Chart: Dual-axis bar (positive/negative) ──────────────────────

    def draw_pn_bar_chart(self, title, labels, values, colors_pos, colors_neg,
                          unit='', subtitle=''):
        """Horizontal bars that go left for negative, right for positive."""
        bar_h = 9
        needed = len(labels) * (bar_h + 3) + 35
        if self.get_y() + needed > self.h - 25:
            self.add_page()
        self.ln(3)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        if subtitle:
            self.set_font('ArialUni', 'I', 7.5)
            self.set_text_color(*self.slate_500)
            self.cell(0, 5, subtitle, new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

        aw = self.w - self.l_margin - self.r_margin
        label_w = 35
        chart_w = aw - label_w - 10
        abs_max = max(abs(v) for v in values) * 1.15
        zero_x = self.l_margin + label_w + chart_w * 0.5

        # Zero line
        self.set_draw_color(*self.slate_200)
        self.set_line_width(0.3)
        y_top = self.get_y()
        y_bot = y_top + len(labels) * (bar_h + 3)
        self.line(zero_x, y_top - 2, zero_x, y_bot + 2)

        for i, (label, val) in enumerate(zip(labels, values)):
            y = self.get_y()
            self.set_font('ArialUni', 'B', 8)
            self.set_text_color(*self.slate_800)
            self.cell(label_w, bar_h, label, align='R')

            bar_frac = abs(val) / abs_max if abs_max > 0 else 0
            bar_w = bar_frac * chart_w * 0.5

            if val >= 0:
                self.set_fill_color(*colors_pos)
                self.rect(zero_x, y, bar_w, bar_h - 1, 'F')
                self.set_xy(zero_x + bar_w + 2, y)
            else:
                self.set_fill_color(*colors_neg)
                self.rect(zero_x - bar_w, y, bar_w, bar_h - 1, 'F')
                self.set_xy(zero_x - bar_w - 22, y)

            self.set_font('ArialUni', '', 7)
            self.set_text_color(*self.slate_600)
            if abs(val) >= 1e9:
                val_str = f'${val / 1e9:.1f}B'
            elif abs(val) >= 1e6:
                val_str = f'${val / 1e6:.0f}M'
            else:
                val_str = f'{val}{unit}'
            self.cell(20, bar_h - 1, val_str, align='L' if val >= 0 else 'R')
            self.set_xy(self.l_margin, y + bar_h + 3)
        self.ln(5)

    # ── Custom Chart: Price vs Buy Range ─────────────────────────────────────

    def draw_price_range_chart(self, title, methods, current_price):
        """Visual chart showing buy price ranges vs current price."""
        bar_h = 14
        row_gap = 4
        label_above = 8   # space for "Current $294" label above chart
        needed = label_above + len(methods) * (bar_h + row_gap) + 20
        if self.get_y() + needed > self.h - 25:
            self.add_page()
        self.ln(3)
        self.set_font('ArialUni', 'B', 11)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

        aw = self.w - self.l_margin - self.r_margin
        label_w = 40
        chart_x = self.l_margin + label_w + 3
        chart_w = aw - label_w - 5
        max_price = current_price * 1.15

        # Draw current price label FIRST, above the chart area
        price_x = chart_x + (current_price / max_price) * chart_w
        self.set_font('ArialUni', 'B', 7)
        self.set_text_color(*self.red_500)
        self.set_x(self.l_margin)
        self.cell(0, 4, '')  # placeholder
        self.set_xy(price_x - 14, self.get_y())
        self.cell(28, 5, f'Current ${current_price:.0f}', align='C')
        self.ln(6)

        # Track chart top for the dashed line
        y_chart_top = self.get_y()

        for i, (name, low, high, color) in enumerate(methods):
            y = self.get_y()
            self.set_font('ArialUni', 'B', 8.5)
            self.set_text_color(*self.slate_800)
            self.cell(label_w, bar_h, name, align='R')

            # Range bar
            x_low = chart_x + (low / max_price) * chart_w
            x_high = chart_x + (high / max_price) * chart_w
            self.set_fill_color(*color)
            self.rect(x_low, y + 3, x_high - x_low, bar_h - 6, 'F')

            # Low label (below-left of bar)
            self.set_font('ArialUni', '', 6.5)
            self.set_text_color(*self.slate_600)
            self.set_xy(x_low - 1, y + bar_h - 4)
            self.cell(0, 4, f'${low:.0f}')

            # High label (above-right of bar)
            self.set_xy(x_high - 1, y + 1)
            self.cell(0, 4, f'${high:.0f}')

            self.set_xy(self.l_margin, y + bar_h + row_gap)

        y_chart_bottom = self.get_y() - 2

        # Dashed current price line spanning full chart height
        self.set_draw_color(*self.red_500)
        self.set_line_width(0.7)
        self.set_dash_pattern(2, 1.5)
        self.line(price_x, y_chart_top, price_x, y_chart_bottom)
        self.set_dash_pattern()
        self.ln(4)

    # ── Custom: Gauge / Meter ────────────────────────────────────────────────

    def add_smart_section_header(self, title, min_space=100):
        """Level-1 visual weight but only breaks page if less than min_space mm remains."""
        remaining = self.h - self.get_y() - 25
        if remaining < min_space:
            self.add_page()
        else:
            self.ln(6)
            self.set_draw_color(*self.teal_500)
            self.set_line_width(0.4)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.ln(6)
        self.set_font('ArialUni', 'B', 18)
        self.set_text_color(*self.color_primary)
        self.multi_cell(0, 10, title)
        self.set_draw_color(*self.color_primary)
        self.set_line_width(0.5)
        self.line(self.l_margin, self.get_y() + 1, self.w - self.r_margin, self.get_y() + 1)
        self.ln(6)

    def draw_metric_gauges(self, title, gauges):
        """Draw a row of circular gauge indicators.
        gauges: list of (label, value, threshold, unit, pass_above)
        """
        n = len(gauges)
        gauge_w = min(42, (self.w - self.l_margin - self.r_margin) / n)
        total_h = 42
        if self.get_y() + total_h > self.h - 25:
            self.add_page()
        self.ln(2)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

        aw = self.w - self.l_margin - self.r_margin
        x_start = self.l_margin + (aw - n * gauge_w) / 2
        y = self.get_y()
        r = 12  # radius

        for i, (label, value, threshold, unit, pass_above) in enumerate(gauges):
            cx = x_start + i * gauge_w + gauge_w / 2
            cy = y + r + 2

            # Determine pass/fail
            passed = (value >= threshold) if pass_above else (value <= threshold)
            ring_color = self.green_500 if passed else self.red_400

            # Background circle
            self.set_fill_color(*self.slate_100)
            self.set_draw_color(*self.slate_200)
            self.set_line_width(0.3)
            self.ellipse(cx - r, cy - r, r * 2, r * 2, 'DF')

            # Colored arc (simplified — fill proportional)
            self.set_fill_color(*ring_color)
            self.set_draw_color(*ring_color)
            self.set_line_width(2.5)
            # Draw arc as thick circle border
            self.ellipse(cx - r, cy - r, r * 2, r * 2, 'D')

            # Value text
            self.set_font('ArialUni', 'B', 10)
            self.set_text_color(*self.slate_800)
            val_str = f'{value:.1f}{unit}' if isinstance(value, float) else f'{value}{unit}'
            self.set_xy(cx - 12, cy - 4)
            self.cell(24, 8, val_str, align='C')

            # Label below
            self.set_font('ArialUni', '', 6.5)
            self.set_text_color(*self.slate_600)
            self.set_xy(cx - gauge_w / 2, cy + r + 2)
            self.cell(gauge_w, 4, label, align='C')

            # Threshold line
            self.set_font('ArialUni', '', 5.5)
            self.set_text_color(*self.slate_500)
            self.set_xy(cx - gauge_w / 2, cy + r + 6)
            thr_str = f'Req: {">" if pass_above else "<"}{threshold}{unit}'
            self.cell(gauge_w, 3, thr_str, align='C')

        self.set_y(y + r * 2 + 18)
        self.ln(4)


# ═══════════════════════════════════════════════════════════════════════════════
# REPORT GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

def _render_narrative(pdf, narrative):
    """Render a section narrative, splitting on paragraph headers (bold lines)."""
    for para in narrative.split('\n\n'):
        para = para.strip()
        if not para:
            continue
        # Detect bold-style sub-headers like "Income Statement — ..."
        if para.endswith(':') or (len(para) < 120 and '—' in para):
            pdf.add_section_header(para.rstrip(':'), level=3)
        else:
            pdf.add_body_text(para)


def _render_citations(pdf, all_citations):
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
            ref = c.get('ref') or c.get('field') or ''
            text = str(c.get('text') or c.get('value') or c.get('label') or '')
            source = c.get('source') or c.get('url') or 'DataPacket'
            line = f'[{i}] {ref}'
            if text:
                line += f' = {text}'
            line += f'  ({source})'
            pdf.add_bullet(line, indent=2)


def generate_ceg_one_pager():
    """Build the full visual PDF for CEG One Pager."""
    proj = os.path.join(os.path.dirname(__file__), '..', '..')
    report_dir = os.path.join(proj, '.thes1s', 'reports', 'CEG')

    # Load data
    dp = json.load(open(os.path.join(report_dir, 'data-packet.json')))
    rpt = json.load(open(os.path.join(report_dir, 'one-pager.json')))
    sections = {s['key']: s for s in rpt['sections']}

    pdf = OnePagerPDF(
        title='Constellation Energy Corp (CEG)',
        subtitle='Rule One One Pager — Investment Analysis'
    )

    # ── Title Page ───────────────────────────────────────────────────────────
    pdf.add_title_page(
        info_lines=[
            'Ticker: CEG  |  Exchange: Nasdaq  |  SIC: 4911 Electric Services',
            f'Current Price: ${dp["currentPrice"]["price"]:.2f}  |  Market Cap: ~$91.8B',
            '',
            'Overall Verdict: WATCHLIST',
            '"Wonderful business at a wonderful-business price"',
            '',
            f'Generated: {date.today().strftime("%B %d, %Y")}',
        ],
        disclaimer='AI-generated research report for educational purposes only. Not financial advice.'
    )

    # ── Page 2: Executive Summary + Verdict Scorecard ────────────────────────
    pdf.add_section_header('Executive Summary', level=1)

    # Pull the synthesis-writer's narrative (the Overall Verdict)
    ov = sections['overall_verdict']
    _render_narrative(pdf, ov.get('narrative', ''))

    # Verdict scorecard
    pdf.draw_verdict_scorecard('Section Verdicts', [
        ('1. Company Info & Business Model', 'PASS', 'HIGH', 'Toll bridge moat'),
        ('2. Minimum Standards', 'WATCHLIST', 'HIGH', '4yr history gap'),
        ('3. Meaning — Financial Health', 'WATCHLIST', 'MEDIUM', 'Calpine leverage'),
        ('4. Growth Metrics — Big 4', 'WATCHLIST', 'LOW', 'Insufficient data'),
        ('5. Valuation Summary', 'FAIL', 'MEDIUM', 'No margin of safety'),
        ('6. Overall Verdict', 'WATCHLIST', 'MEDIUM', 'Price must decline'),
    ])

    # Key metrics gauges
    pdf.draw_metric_gauges('Rule One Quick Screen', [
        ('ROE (3yr)', 19.8, 10, '%', True),
        ('ROIC (3yr)', 12.6, 10, '%', True),
        ('Debt/Earn', 2.3, 3.0, 'x', False),
        ('Current Ratio', 1.53, 1.0, 'x', True),
        ('BVPS Growth', 17.8, 10, '%', True),
    ])

    # ── Section 1: Company Info ──────────────────────────────────────────────
    pdf.add_section_header('1. Company Information & Business Model', level=1)
    ci = sections['company_info']
    _render_narrative(pdf, ci.get('narrative', ''))

    # Red flags
    pdf.add_section_header('Red Flags', level=3)
    for rf in ci.get('redFlags', []):
        pdf.add_bullet(rf)

    # ── Section 2: Minimum Standards ─────────────────────────────────────────
    pdf.add_section_header('2. Minimum Standards', level=1)
    ms = sections['minimum_standards']
    _render_narrative(pdf, ms.get('narrative', ''))

    pdf.add_section_header('Red Flags', level=3)
    for rf in ms.get('redFlags', []):
        pdf.add_bullet(rf)

    # Guru Holdings table
    pdf.add_section_header('Guru Holdings', level=2)
    pdf.add_table(
        ['Guru', 'Fund', 'Shares', 'Value', '% of Portfolio'],
        [
            ['Daniel Loeb', 'Third Point LLC', '475,000', '$167.8M', '2.31%'],
            ['Ray Dalio', 'Bridgewater Associates', '42,937', '$15.2M', '0.06%'],
        ]
    )
    pdf.add_body_text(
        'Per Rule One: guru ownership provides context, not confirmation.'
    )

    # ── Section 3: Meaning — Financial Health ────────────────────────────────
    pdf.add_section_header('3. Meaning — Financial Health Assessment', level=1)

    # Net Income bar chart
    pdf.draw_pn_bar_chart(
        'Net Income Trajectory',
        ['FY2022', 'FY2023', 'FY2024', 'FY2025'],
        [-160e6, 1623e6, 3749e6, 2319e6],
        colors_pos=pdf.teal_500,
        colors_neg=pdf.red_400,
        subtitle='Loss at spinoff; rapid recovery through 2024; 2025 GAAP decline is mark-to-market noise'
    )

    mn = sections['meaning']
    _render_narrative(pdf, mn.get('narrative', ''))

    # Operating Cash Flow — the key insight
    pdf.draw_pn_bar_chart(
        'Operating Cash Flow (GAAP)',
        ['FY2022', 'FY2023', 'FY2024', 'FY2025'],
        [-2353e6, -5301e6, -2464e6, 4237e6],
        colors_pos=pdf.green_500,
        colors_neg=pdf.amber_500,
        subtitle='Negative 2022-2024 = hedging collateral, NOT business distress. 2025 reversal confirms underlying cash engine.'
    )

    # EBITDA — the better proxy
    pdf.draw_bar_chart(
        'EBITDA — True Cash Generation Proxy',
        ['FY2022', 'FY2023', 'FY2024', 'FY2025'],
        [2.9, 4.1, 7.1, 5.7],
        colors=[pdf.teal_400, pdf.teal_400, pdf.teal_500, pdf.teal_500],
        unit='B',
        max_val=8.0,
    )

    # ROE vs ROIC comparison
    pdf.draw_comparison_bar_chart(
        'Return on Equity vs Return on Invested Capital',
        ['FY2023', 'FY2024', 'FY2025', '3yr Avg'],
        [
            [14.9, 28.5, 16.0, 19.8],   # ROE
            [8.8, 18.2, 10.7, 12.6],     # ROIC
        ],
        series_names=['ROE', 'ROIC'],
        series_colors=[pdf.teal_500, pdf.blue_500],
        unit='%',
        max_val=32,
    )

    # Balance sheet table
    pdf.add_section_header('Balance Sheet Health', level=2)
    pdf.add_table(
        ['Metric', 'FY2022', 'FY2023', 'FY2024', 'FY2025'],
        [
            ['Total Equity', '$11.0B', '$10.9B', '$13.2B', '$14.5B'],
            ['LT Debt', '$4.5B', '$7.5B', '$7.4B', '$7.3B'],
            ['Net Debt', '$5.3B', '$8.9B', '$5.4B', '$5.4B'],
            ['Cash', '$0.4B', '$0.4B', '$3.0B', '$3.6B'],
            ['Current Ratio', '1.19', '1.31', '1.57', '1.53'],
            ['BVPS', '$33.83', '$38.02', '$49.16', '$55.29'],
            ['Shares (M)', '327', '317', '313', '312'],
        ]
    )

    # BVPS growth
    pdf.draw_bar_chart(
        'Book Value Per Share — 3yr CAGR: 17.8%',
        ['FY2022', 'FY2023', 'FY2024', 'FY2025'],
        [33.83, 38.02, 49.16, 55.29],
        colors=[pdf.teal_300, pdf.teal_400, pdf.teal_500, pdf.teal_500],
        unit='',
        max_val=62,
    )

    # Red flags for section 3
    pdf.add_section_header('Red Flags', level=3)
    for rf in mn.get('redFlags', []):
        pdf.add_bullet(rf)

    # ── Section 4: Growth Metrics ────────────────────────────────────────────
    pdf.add_section_header('4. Growth Metrics — Big 4 Analysis', level=1)

    pdf.add_table(
        ['Metric', '10yr', '7yr', '5yr', '3yr', '1yr', 'Benchmark', 'Status'],
        [
            ['BVPS + Div', 'N/A', 'N/A', 'N/A', '17.8%', '12.5%', '>15%', 'PASS'],
            ['Earnings', 'N/A', 'N/A', 'N/A', 'N/A', '-38%', '>15%', 'N/A'],
            ['Adj. EPS', 'N/A', 'N/A', 'N/A', '~22%*', '+8.3%', '>15%', 'WATCH'],
            ['Revenue', 'N/A', 'N/A', 'N/A', '-2.5%', '+19.5%', '>15%', 'FAIL'],
            ['Op. Cash', 'N/A', 'N/A', 'N/A', 'N/A', '+272%', '>15%', 'N/A'],
            ['EBITDA', 'N/A', 'N/A', 'N/A', '~25%', '-19%', 'n/a', 'INFO'],
        ]
    )
    pdf.add_body_text('* Adjusted EPS 2-year CAGR (2023-2025): non-GAAP metric, management-preferred.')

    gm = sections['growth_metrics']
    _render_narrative(pdf, gm.get('narrative', ''))

    # EPS comparison chart
    pdf.draw_comparison_bar_chart(
        'GAAP EPS vs Adjusted Operating EPS',
        ['FY2023', 'FY2024', 'FY2025'],
        [
            [5.01, 11.89, 7.40],   # GAAP
            [6.28, 8.67, 9.39],    # Adjusted
        ],
        series_names=['GAAP EPS', 'Adjusted EPS'],
        series_colors=[pdf.slate_600, pdf.teal_500],
        unit='',
        max_val=14,
    )

    pdf.add_section_header('Red Flags', level=3)
    for rf in gm.get('redFlags', []):
        pdf.add_bullet(rf)

    # ── Section 5: Valuation ─────────────────────────────────────────────────
    pdf.add_smart_section_header('5. Valuation — Buy Price Analysis')

    # The key visual: buy price ranges vs current price
    pdf.draw_price_range_chart(
        'Buy Price Ranges vs Current Price',
        [
            ('MOS', 111, 226, pdf.teal_400),
            ('Ten Cap', 108, 127, pdf.blue_500),
            ('Equity Bond', 114, 151, pdf.green_500),
            ('PBT*', 65, 82, pdf.slate_200),
        ],
        current_price=293.82,
    )
    pdf.add_body_text('* PBT excluded from convergence — only 1 year of positive FCF history.')

    vs = sections['valuation_summary']
    _render_narrative(pdf, vs.get('narrative', ''))

    # Valuation inputs table
    pdf.add_section_header('Valuation Inputs', level=2)
    pdf.add_table(
        ['Calculator', 'Key Inputs', 'Sticker Price', 'Buy Price Range'],
        [
            ['MOS', 'EPS $7.39, FGR 15-20%, P/E 30-40x', '$222 - $452', '$111 - $226'],
            ['Ten Cap', 'OCF $4.2B, Maint 50-70%, Tax $1.2B', 'n/a (yield)', '$108 - $127'],
            ['Equity Bond', 'BVPS $55, ROE 19.8%, Ret 79%', '$227 - $303', '$114 - $151'],
            ['PBT', 'FCF/sh $4.13, FGR 15-20%', 'n/a (payback)', '$65 - $82*'],
        ]
    )

    # FGR inputs
    pdf.add_section_header('Preliminary FGR: 10-15%', level=2)
    pdf.draw_bar_chart(
        'FGR Input Sources',
        [
            'BVPS 3yr CAGR',
            'Adj. EPS 2yr CAGR',
            'Mgmt Guidance (2024-30)',
            'Analyst Consensus',
            'Nuclear Industry CAGR',
            'Preliminary FGR (mid)',
        ],
        [17.8, 22.0, 13.0, 22.4, 4.0, 12.5],
        colors=[
            pdf.teal_400, pdf.teal_400, pdf.green_500,
            pdf.blue_400, pdf.slate_500, pdf.teal_500,
        ],
        unit='%',
        max_val=25,
    )

    pdf.add_section_header('Red Flags', level=3)
    for rf in vs.get('redFlags', []):
        pdf.add_bullet(rf)

    # ── Key Risks ────────────────────────────────────────────────────────────
    pdf.add_smart_section_header('Key Risks & Red Flags')

    pdf.add_table(
        ['Severity', 'Risk', 'Impact'],
        [
            ['HIGH', 'No margin of safety at current price', 'Stock 50-165% above buy range'],
            ['HIGH', 'Calpine acquisition leverage', 'Pro-forma net debt ~$18B (~7.8x NI)'],
            ['HIGH', 'Insufficient operating history', 'Only 4yr; most Big 4 rates null'],
            ['MEDIUM', 'Nuclear PTC policy dependence', '~$2B/yr revenue at political risk'],
            ['MEDIUM', 'GAAP earnings volatility', 'Mark-to-market distortions'],
            ['MEDIUM', 'Growth thesis depends on AI demand', 'Nuclear CAGR only 2-6% without it'],
            ['LOW', 'Pension liability $1.98B', 'Off standard debt metrics'],
            ['LOW', 'Current ratio 1.53', 'Below Rule One 2:1 preferred'],
        ]
    )

    # Debt stress test
    pdf.add_section_header('Debt Stress Test: Pre vs Post Calpine', level=2)
    pdf.draw_comparison_bar_chart(
        'Leverage Metrics — Pre vs Post Calpine Acquisition',
        ['Net Debt ($B)', 'Net Debt / NI', 'LT Debt / NI'],
        [
            [5.4, 2.3, 3.1],
            [18.0, 7.8, 7.0],
        ],
        series_names=['Pre-Calpine (2025)', 'Post-Calpine (est.)'],
        series_colors=[pdf.teal_400, pdf.red_400],
        unit='',
        max_val=20,
    )

    # ── Watchlist Action Plan ────────────────────────────────────────────────
    pdf.add_smart_section_header('Watchlist Action Plan')

    # Key strengths & concerns side by side
    pdf.add_table(
        ['Key Strengths', 'Key Concerns'],
        [
            ['Nuclear fleet — irreplaceable toll bridge moat', 'Valuation: ~40x P/E, buy range $110-$150'],
            ['AI/data center PPAs (Microsoft, Meta)', 'Calpine leverage: ~$18B pro-forma net debt'],
            ['ROIC 12.6% avg clears 10% threshold', 'Only 4 years independent history'],
            ['BVPS growing 17.8% CAGR', 'Nuclear PTC policy-dependent ($2B/yr)'],
            ['TMI restart for MSFT (2027 catalyst)', 'GAAP earnings volatile, hard to assess'],
        ]
    )

    pdf.add_section_header('Next Steps', level=2)
    pdf.add_bullet('Set price alert at $150 (top of buy range) and $120 (convergence center)')
    pdf.add_bullet('Monitor Q2-Q3 2026 for Calpine integration progress and debt paydown')
    pdf.add_bullet('Track pro-forma leverage ratio — target below 4x before upgrading')
    pdf.add_bullet('Watch Three Mile Island Unit 1 restart milestones (2027)')
    pdf.add_bullet('Reassess Big 4 growth rates after FY2026 provides 5th year of data')
    pdf.add_bullet('Monitor nuclear PTC legislative status and IRA provisions')
    pdf.add_bullet('Revisit if market correction brings price within 20% of $150')

    pdf.ln(6)
    pdf.add_body_text(
        'The right move is patience. If the nuclear renaissance thesis is as durable as we '
        'think, there will be a market correction, an earnings miss, or a regulatory scare '
        'that brings the price within range. Patience is not the absence of action — it is '
        'the discipline to act only when the odds are overwhelmingly in your favor.'
    )

    # ── Citations ────────────────────────────────────────────────────────────
    all_citations = []
    section_labels = {
        'company_info': '1. Company Info',
        'minimum_standards': '2. Minimum Standards',
        'meaning': '3. Financial Health',
        'growth_metrics': '4. Growth Metrics',
        'valuation_summary': '5. Valuation',
        'overall_verdict': '6. Overall Verdict',
    }
    for key in rpt['sectionKeys']:
        s = sections[key]
        all_citations.append((section_labels.get(key, key), s.get('citations', [])))
    _render_citations(pdf, all_citations)

    # ── Save ─────────────────────────────────────────────────────────────────
    out_path = os.path.join(report_dir, 'one-pager.pdf')
    pdf.output(out_path)
    print(f'PDF generated: {out_path}')
    print(f'Pages: {pdf.page_no()}')
    return out_path


if __name__ == '__main__':
    generate_ceg_one_pager()
