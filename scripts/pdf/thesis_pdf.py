#!/usr/bin/env python3
"""
ThesisPDF — Shared base class for all Thesis-branded PDF report generators.

Extracts the 95% duplicated code from OnePagerPDF and PitchDeckPDF into a single
base class that all 3 stage generators (One Pager, Pitch Deck, Final Thesis) inherit from.

Provides:
- Thesis color palette (teal + slate + accent colors)
- Logo drawing (fused T1 letterform)
- Title page with branding
- Verdict scorecard table
- Metric gauge indicators
- Bar charts (single, comparison, positive/negative)
- Price range visualization
- Smart section headers with page break detection
- Branded header and footer

Usage:
    from scripts.pdf.thesis_pdf import ThesisPDF

    class OnePagerPDF(ThesisPDF):
        def __init__(self, title, subtitle=''):
            super().__init__(title, subtitle, stage_label='One Pager')
"""

import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdf_template_toolkit import ReportPDF


class ThesisPDF(ReportPDF):
    """Shared Thesis-branded PDF base class for all 3 report stages."""

    def __init__(self, title, subtitle='', stage_label='Report'):
        super().__init__(title, subtitle)
        self.stage_label = stage_label  # "One Pager", "Pitch Deck", "Final Thesis"

        # Thesis palette (identical in both existing generators)
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

    # ── Logo ─────────────────────────────────────────────────────────────────

    def draw_logo(self, x, y, size=22):
        """Draw the Thesis fused T1 letterform logo."""
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

    # ── Header & Footer ──────────────────────────────────────────────────────

    def header(self):
        """Branded header with logo and title on pages after the cover."""
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
        """Branded footer with stage label and page number."""
        self.set_y(-12)
        self.set_font('ArialUni', '', 7.5)
        self.set_text_color(*self.slate_500)
        if self.page_no() > 1:
            self.cell(0, 10, f'Thesis  |  {self.stage_label}  |  Page {self.page_no() - 1}', align='C')

    # ── Title Page ────────────────────────────────────────────────────────────

    def title_page(self, ticker='', company='', stage_title='', subtitle_text='',
                   verdict='', disclaimer='', info_lines=None):
        """
        Add a Thesis-branded cover page.

        Args:
            ticker: Stock ticker symbol
            company: Company name
            stage_title: e.g., "value investing One Pager"
            subtitle_text: Subtitle line
            verdict: Overall verdict string
            disclaimer: Disclaimer text at bottom
            info_lines: List of info strings; if provided, overrides auto-generated lines
        """
        self.add_page()
        self.ln(20)
        logo_size = 28
        self.draw_logo((self.w - logo_size) / 2, self.get_y(), logo_size)
        self.ln(logo_size + 8)

        # Thesis branding
        self.set_font('ArialUni', 'B', 12)
        self.set_text_color(*self.teal_500)
        self.cell(0, 6, 'Thesis', align='C', new_x="LMARGIN", new_y="NEXT")
        self.ln(12)

        # Title
        self.set_font('ArialUni', 'B', 24)
        self.set_text_color(*self.slate_800)
        self.multi_cell(0, 10, self.report_title, align='C')
        self.ln(4)

        # Subtitle
        if self.report_subtitle:
            self.set_font('ArialUni', '', 14)
            self.set_text_color(*self.slate_600)
            self.multi_cell(0, 8, self.report_subtitle, align='C')
            self.ln(10)

        # Decorative line
        self.set_draw_color(*self.teal_500)
        self.set_line_width(0.8)
        xc = self.w / 2
        self.line(xc - 40, self.get_y(), xc + 40, self.get_y())
        self.ln(12)

        # Info lines
        self.set_font('ArialUni', '', 11)
        self.set_text_color(*self.slate_500)
        if info_lines:
            for line in info_lines:
                self.cell(0, 7, line, align='C', new_x="LMARGIN", new_y="NEXT")

        # Disclaimer
        if disclaimer:
            self.ln(20)
            self.set_font('ArialUni', 'I', 9)
            self.set_text_color(*self.slate_500)
            self.multi_cell(0, 5, disclaimer, align='C')

    # For backward compatibility with existing generators
    def add_title_page(self, info_lines=None, disclaimer=None):
        """Legacy title page method for backward compatibility."""
        self.title_page(info_lines=info_lines, disclaimer=disclaimer)

    # ── Smart Section Header ──────────────────────────────────────────────────

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

    # ── Verdict Scorecard ─────────────────────────────────────────────────────

    def draw_verdict_scorecard(self, title, sections):
        """
        Draw a visual scorecard with colored verdict badges.

        Args:
            title: Chart title
            sections: List of (name, verdict, confidence, signal) tuples
        """
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

        # Header row
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

            # Name cell
            self.set_font('ArialUni', '', 8)
            self.set_text_color(*self.slate_800)
            self.cell(name_w, 10, self._truncate(name, name_w, 'ArialUni', '', 8), border=1, fill=True)

            # Verdict badge
            vc = verdict_colors.get(verdict, self.slate_500)
            self.set_fill_color(*(self.teal_50 if i % 2 == 0 else (255, 255, 255)))
            self.cell(verdict_w, 10, '', border=1, fill=True)
            self.set_fill_color(*vc)
            badge_x = self.l_margin + name_w + verdict_w / 2 - 12
            self.rect(badge_x, y + 2, 24, 6, 'F')
            self.set_font('ArialUni', 'B', 6.5)
            self.set_text_color(255, 255, 255)
            self.set_xy(badge_x, y + 2)
            self.cell(24, 6, verdict, align='C')
            self.set_xy(self.l_margin + name_w + verdict_w, y)

            # Confidence + Signal
            self.set_text_color(*self.slate_800)
            self.set_font('ArialUni', '', 8)
            self.set_fill_color(*(self.teal_50 if i % 2 == 0 else (255, 255, 255)))
            self.cell(conf_w, 10, confidence, border=1, fill=True, align='C')
            self.cell(note_w, 10, self._truncate(signal, note_w, 'ArialUni', '', 8), border=1, fill=True, align='C')
            self.ln()
        self.ln(4)

    # ── Metric Gauges ─────────────────────────────────────────────────────────

    def draw_metric_gauges(self, title, gauges):
        """
        Draw a row of circular gauge indicators.

        Args:
            title: Chart title
            gauges: List of (label, value, threshold, unit, pass_above) tuples
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

            # Colored arc (simplified)
            self.set_fill_color(*ring_color)
            self.set_draw_color(*ring_color)
            self.set_line_width(2.5)
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

    # ── Bar Chart ─────────────────────────────────────────────────────────────

    def draw_bar_chart(self, title, labels, values, colors, unit='', max_val=None, subtitle=''):
        """
        Draw a horizontal bar chart with Thesis styling.

        Args:
            title: Chart title
            labels: List of label strings
            values: List of numeric values
            colors: Single (R,G,B) tuple or list of tuples (one per bar)
            unit: Unit suffix ('$', 'B', 'M', '%', '')
            max_val: Maximum scale value (auto-calculated if None)
            subtitle: Optional subtitle text
        """
        bar_h = 9
        needed = len(labels) * (bar_h + 3) + 30
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
        label_w = 40
        chart_w = aw - label_w - 10
        if max_val is None:
            max_val = max(values) * 1.15

        for i, (label, val) in enumerate(zip(labels, values)):
            y = self.get_y()
            self.set_font('ArialUni', 'B', 8)
            self.set_text_color(*self.slate_800)
            self.cell(label_w, bar_h, str(label), align='R')

            bar_frac = val / max_val if max_val > 0 else 0
            bar_w = bar_frac * chart_w
            color = colors[i] if isinstance(colors, list) else colors
            self.set_fill_color(*color)
            self.rect(self.l_margin + label_w + 3, y, bar_w, bar_h - 1, 'F')

            self.set_font('ArialUni', '', 7)
            self.set_text_color(*self.slate_600)
            if unit == '$':
                val_str = f'${val:,.0f}'
            elif unit == 'B':
                val_str = f'${val:.1f}B'
            elif unit == 'M':
                val_str = f'${val:.0f}M'
            elif unit == '%':
                val_str = f'{val:.1f}%'
            else:
                val_str = f'{val}'
            self.set_xy(self.l_margin + label_w + 3 + bar_w + 2, y)
            self.cell(20, bar_h - 1, val_str)
            self.set_xy(self.l_margin, y + bar_h + 3)
        self.ln(5)

    # ── Comparison Bar Chart ──────────────────────────────────────────────────

    def draw_comparison_bar_chart(self, title, labels, series, series_names, series_colors,
                                  unit='', max_val=None):
        """
        Draw a grouped horizontal bar chart with multiple series.

        Args:
            title: Chart title
            labels: List of group labels
            series: List of value lists (one per series)
            series_names: List of series names for legend
            series_colors: List of (R,G,B) tuples for each series
            unit: Unit suffix
            max_val: Maximum scale value
        """
        n_series = len(series)
        bar_h = 7
        group_h = n_series * (bar_h + 1) + 4
        needed = len(labels) * group_h + 40
        if self.get_y() + needed > self.h - 25:
            self.add_page()
        self.ln(3)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")

        # Legend
        self.ln(2)
        for si, (sn, sc) in enumerate(zip(series_names, series_colors)):
            self.set_fill_color(*sc)
            self.rect(self.l_margin + si * 60, self.get_y(), 8, 4, 'F')
            self.set_font('ArialUni', '', 7)
            self.set_text_color(*self.slate_600)
            self.set_xy(self.l_margin + si * 60 + 10, self.get_y() - 1)
            self.cell(40, 6, sn)
        self.set_xy(self.l_margin, self.get_y() + 8)

        aw = self.w - self.l_margin - self.r_margin
        label_w = 40
        chart_w = aw - label_w - 10
        if max_val is None:
            max_val = max(max(s) for s in series) * 1.15

        for i, label in enumerate(labels):
            y = self.get_y()
            self.set_font('ArialUni', 'B', 8)
            self.set_text_color(*self.slate_800)
            self.cell(label_w, group_h - 4, str(label), align='R')
            for si, (s_data, s_color) in enumerate(zip(series, series_colors)):
                val = s_data[i]
                bar_frac = val / max_val if max_val > 0 else 0
                bar_w = bar_frac * chart_w
                self.set_fill_color(*s_color)
                bar_y = y + si * (bar_h + 1)
                self.rect(self.l_margin + label_w + 3, bar_y, bar_w, bar_h - 1, 'F')
                self.set_font('ArialUni', '', 6.5)
                self.set_text_color(*self.slate_600)
                val_str = f'{val:.1f}{unit}' if isinstance(val, float) else f'{val}{unit}'
                self.set_xy(self.l_margin + label_w + 3 + bar_w + 2, bar_y)
                self.cell(20, bar_h - 1, val_str)
            self.set_xy(self.l_margin, y + group_h)
        self.ln(5)

    # ── Positive/Negative Bar Chart ───────────────────────────────────────────

    def draw_pn_bar_chart(self, title, labels, values, colors_pos, colors_neg,
                          unit='', subtitle=''):
        """
        Horizontal bars that go left for negative, right for positive.

        Args:
            title: Chart title
            labels: List of label strings
            values: List of numeric values (positive and negative)
            colors_pos: (R,G,B) tuple for positive bars
            colors_neg: (R,G,B) tuple for negative bars
            unit: Unit suffix
            subtitle: Optional subtitle
        """
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

    # ── Price Range Chart ─────────────────────────────────────────────────────

    def draw_price_range_chart(self, title, methods, current_price):
        """
        Visual chart showing buy price ranges vs current price.

        Args:
            title: Chart title
            methods: List of (name, low, high, color) tuples where color is (R,G,B)
            current_price: Current stock price (draws vertical dashed line)
        """
        bar_h = 14
        row_gap = 4
        needed = len(methods) * (bar_h + row_gap) + 30
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
        max_price = max(current_price, max(h for _, _, h, _ in methods)) * 1.15

        # Current price label
        price_x = chart_x + (current_price / max_price) * chart_w
        self.set_font('ArialUni', 'B', 7)
        self.set_text_color(*self.red_500)
        self.set_xy(price_x - 14, self.get_y())
        self.cell(28, 5, f'Current ${current_price:.0f}', align='C')
        self.ln(6)

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

            # Low/High labels
            self.set_font('ArialUni', '', 6.5)
            self.set_text_color(*self.slate_600)
            self.set_xy(x_low - 1, y + bar_h - 4)
            self.cell(0, 4, f'${low:.0f}')
            self.set_xy(x_high - 1, y + 1)
            self.cell(0, 4, f'${high:.0f}')

            self.set_xy(self.l_margin, y + bar_h + row_gap)

        y_chart_bottom = self.get_y() - 2

        # Dashed current price line
        self.set_draw_color(*self.red_500)
        self.set_line_width(0.7)
        self.set_dash_pattern(2, 1.5)
        self.line(price_x, y_chart_top, price_x, y_chart_bottom)
        self.set_dash_pattern()
        self.ln(4)

    # ── Pipeline Flow (cover page) ────────────────────────────────────────────

    def draw_pipeline_flow(self, current_stage):
        """3-stage pipeline flow chart for cover pages.

        current_stage: 'One Pager', 'Pitch Deck', or 'Final Thesis'.
        Highlights the current stage in teal; others in slate.
        """
        stages = ['One Pager', 'Pitch Deck', 'Final Thesis']
        aw = self.w - self.l_margin - self.r_margin
        box_w = (aw - 30) / 3
        box_h = 14
        gap = 15

        y = self.get_y()
        x = self.l_margin

        for i, stage in enumerate(stages):
            is_current = (stage == current_stage)
            border = self.teal_500 if is_current else self.slate_200
            fill = self.teal_50 if is_current else (255, 255, 255)
            label_color = self.teal_500 if is_current else self.slate_500

            self.set_draw_color(*border)
            self.set_line_width(0.8 if is_current else 0.4)
            self.set_fill_color(*fill)
            self.rect(x, y, box_w, box_h, 'DF')

            self.set_font('ArialUni', 'B', 9)
            self.set_text_color(*label_color)
            self.set_xy(x, y + 3.5)
            self.cell(box_w, 4, f'Stage {i+1}', align='C')
            self.set_xy(x, y + 7.5)
            self.cell(box_w, 4, stage, align='C')

            if i < len(stages) - 1:
                arrow_y = y + box_h / 2
                arrow_x_start = x + box_w + 2
                arrow_x_end = x + box_w + gap - 2
                self.set_draw_color(*self.slate_500)
                self.set_line_width(0.5)
                self.line(arrow_x_start, arrow_y, arrow_x_end - 2, arrow_y)
                self.line(arrow_x_end - 4, arrow_y - 1.5, arrow_x_end - 2, arrow_y)
                self.line(arrow_x_end - 4, arrow_y + 1.5, arrow_x_end - 2, arrow_y)

                # 'Gate' label between boxes
                self.set_font('ArialUni', '', 6.5)
                self.set_text_color(*self.slate_500)
                self.set_xy(arrow_x_start, arrow_y + 1)
                self.cell(gap - 4, 3, 'gate', align='C')

            x += box_w + gap

        self.set_y(y + box_h + 6)
        self.set_text_color(*self.slate_800)

    # ── Sparkline ─────────────────────────────────────────────────────────────

    def draw_sparkline(self, x, y, w, h, values, color=None, label=''):
        """Inline sparkline. Renders nothing if values is empty or all-equal."""
        if not values or len(values) < 2:
            return
        vmin, vmax = min(values), max(values)
        if vmax == vmin:
            return
        color = color or self.teal_500
        self.set_draw_color(*color)
        self.set_line_width(0.6)
        n = len(values)
        prev = None
        for i, v in enumerate(values):
            px = x + (i / (n - 1)) * w
            py = y + h - ((v - vmin) / (vmax - vmin)) * h
            if prev is not None:
                self.line(prev[0], prev[1], px, py)
            prev = (px, py)
        if label:
            self.set_font('ArialUni', '', 7)
            self.set_text_color(*self.slate_600)
            self.set_xy(x, y - 3.5)
            self.cell(w, 3, f'{label}: {values[0]:.1f}% → {values[-1]:.1f}%')

    def draw_sparkline_trio(self, title, series):
        """Stacked sparkline trio. series is a list of (label, values, color)."""
        if not series:
            return
        if self.get_y() + 50 > self.h - 25:
            self.add_page()
        self.ln(2)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

        aw = self.w - self.l_margin - self.r_margin
        spark_h = 8
        for label, values, color in series:
            y = self.get_y() + 4
            self.draw_sparkline(self.l_margin + 50, y, aw - 60, spark_h, values, color, label)
            self.ln(spark_h + 5)

    # ── Gate Grid (One Pager minimum standards) ──────────────────────────────

    def draw_gate_grid(self, title, gates):
        """2×N grid of pass/fail gates with status circle.

        gates: list of (label, status, detail) where status in {'PASS','FAIL','WARN'}.
        """
        if not gates:
            return
        if self.get_y() + 50 > self.h - 25:
            self.add_page()
        self.ln(2)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

        aw = self.w - self.l_margin - self.r_margin
        cols = 2
        rows = (len(gates) + cols - 1) // cols
        cell_w = aw / cols
        cell_h = 18

        status_color = {
            'PASS': self.green_500,
            'FAIL': self.red_500,
            'WARN': self.amber_500,
        }

        y_top = self.get_y()
        for i, (label, status, detail) in enumerate(gates):
            r, c = divmod(i, cols)
            cx = self.l_margin + c * cell_w
            cy = y_top + r * cell_h

            color = status_color.get(str(status).upper(), self.slate_500)
            self.set_draw_color(*self.slate_200)
            self.set_line_width(0.3)
            self.rect(cx + 1, cy, cell_w - 4, cell_h - 2, 'D')

            # Status circle
            self.set_fill_color(*color)
            self.set_draw_color(*color)
            self.ellipse(cx + 4, cy + 5, 5, 5, 'F')

            # Status text inside circle
            self.set_font('ArialUni', 'B', 6)
            self.set_text_color(255, 255, 255)
            self.set_xy(cx + 4, cy + 6)
            stext = {'PASS': 'OK', 'FAIL': 'X', 'WARN': '!'}.get(str(status).upper(), '?')
            self.cell(5, 3, stext, align='C')

            # Label and detail
            self.set_font('ArialUni', 'B', 9)
            self.set_text_color(*self.slate_800)
            self.set_xy(cx + 12, cy + 2)
            self.cell(cell_w - 16, 5, str(label))
            self.set_font('ArialUni', '', 7.5)
            self.set_text_color(*self.slate_600)
            self.set_xy(cx + 12, cy + 8)
            self.cell(cell_w - 16, 5, str(detail)[:80])

        self.set_y(y_top + rows * cell_h + 2)
        self.set_text_color(*self.slate_800)

    # ── Donut Chart ───────────────────────────────────────────────────────────

    def draw_donut(self, title, slices, colors=None):
        """Donut chart approximating arcs with line segments.

        slices: list of (label, value) tuples.
        """
        if not slices:
            return
        total = sum(v for _, v in slices if v > 0)
        if total <= 0:
            return
        if self.get_y() + 70 > self.h - 25:
            self.add_page()
        self.ln(2)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

        default_palette = [self.teal_500, self.blue_500, self.amber_500,
                           self.slate_600, self.teal_300, self.green_500]
        colors = colors or default_palette

        aw = self.w - self.l_margin - self.r_margin
        cx = self.l_margin + 30
        cy = self.get_y() + 28
        r_outer = 22
        r_inner = 12

        import math
        start = -math.pi / 2  # start at top
        seg_step = math.pi / 90  # 2-degree segments

        for i, (label, value) in enumerate(slices):
            if value <= 0:
                continue
            color = colors[i % len(colors)]
            sweep = (value / total) * 2 * math.pi
            self.set_fill_color(*color)
            self.set_draw_color(*color)
            t = start
            while t < start + sweep:
                t_next = min(t + seg_step, start + sweep)
                # Triangle fan from center to two arc points (donut: outer ring only)
                x0 = cx + r_outer * math.cos(t)
                y0 = cy + r_outer * math.sin(t)
                x1 = cx + r_outer * math.cos(t_next)
                y1 = cy + r_outer * math.sin(t_next)
                xi0 = cx + r_inner * math.cos(t)
                yi0 = cy + r_inner * math.sin(t)
                xi1 = cx + r_inner * math.cos(t_next)
                yi1 = cy + r_inner * math.sin(t_next)
                # Render quad as two triangles via polygon
                self.polygon([(x0, y0), (x1, y1), (xi1, yi1), (xi0, yi0)], style='F')
                t = t_next
            start += sweep

        # Legend
        legend_x = self.l_margin + 70
        legend_y = cy - 22
        for i, (label, value) in enumerate(slices):
            color = colors[i % len(colors)]
            pct = value / total * 100
            self.set_fill_color(*color)
            self.rect(legend_x, legend_y + i * 6, 4, 4, 'F')
            self.set_font('ArialUni', '', 8)
            self.set_text_color(*self.slate_700)
            self.set_xy(legend_x + 6, legend_y + i * 6 - 1)
            self.cell(aw - 80, 6, f'{label}: {pct:.0f}%')

        self.set_y(cy + r_outer + 6)
        self.set_text_color(*self.slate_800)

    # ── Radar Chart ───────────────────────────────────────────────────────────

    def draw_radar(self, title, axes, values, max_value=10):
        """Radar/spider chart with N axes.

        axes: list of axis labels.
        values: list of numeric values (same length).
        """
        if not axes or len(axes) != len(values) or len(axes) < 3:
            return
        if self.get_y() + 75 > self.h - 25:
            self.add_page()
        self.ln(2)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

        import math
        aw = self.w - self.l_margin - self.r_margin
        cx = self.l_margin + aw / 2
        cy = self.get_y() + 32
        r = 26

        n = len(axes)
        # Concentric grid (4 rings)
        self.set_draw_color(*self.slate_200)
        self.set_line_width(0.2)
        for k in range(1, 5):
            grid_r = r * k / 4
            pts = []
            for i in range(n):
                a = -math.pi / 2 + 2 * math.pi * i / n
                pts.append((cx + grid_r * math.cos(a), cy + grid_r * math.sin(a)))
            for i in range(n):
                p, q = pts[i], pts[(i + 1) % n]
                self.line(p[0], p[1], q[0], q[1])

        # Axes
        for i in range(n):
            a = -math.pi / 2 + 2 * math.pi * i / n
            self.set_draw_color(*self.slate_200)
            self.line(cx, cy, cx + r * math.cos(a), cy + r * math.sin(a))

        # Values polygon
        pts = []
        for i, v in enumerate(values):
            a = -math.pi / 2 + 2 * math.pi * i / n
            frac = max(0, min(1, v / max_value))
            pts.append((cx + r * frac * math.cos(a), cy + r * frac * math.sin(a)))
        self.set_fill_color(*self.teal_300)
        self.set_draw_color(*self.teal_500)
        self.set_line_width(0.6)
        self.polygon(pts, style='DF')

        # Axis labels
        self.set_font('ArialUni', '', 7)
        self.set_text_color(*self.slate_700)
        for i, label in enumerate(axes):
            a = -math.pi / 2 + 2 * math.pi * i / n
            lx = cx + (r + 4) * math.cos(a) - 14
            ly = cy + (r + 4) * math.sin(a) - 1
            self.set_xy(lx, ly)
            self.cell(28, 4, str(label)[:18], align='C')

        self.set_y(cy + r + 8)
        self.set_text_color(*self.slate_800)

    # ── Stacked Bar Chart ─────────────────────────────────────────────────────

    def draw_stacked_bar_chart(self, title, periods, stacks, stack_names, stack_colors,
                               unit='B'):
        """Vertical-style stacked bars over multiple periods.

        periods: list of period labels (x-axis).
        stacks: list of value lists, one per stack name. Each inner list aligns
                with periods.
        """
        if not periods or not stacks:
            return
        n_periods = len(periods)
        if any(len(s) != n_periods for s in stacks):
            return
        if self.get_y() + 75 > self.h - 25:
            self.add_page()
        self.ln(2)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")

        # Legend
        self.ln(2)
        legend_y = self.get_y()
        for si, (sn, sc) in enumerate(zip(stack_names, stack_colors)):
            self.set_fill_color(*sc)
            self.rect(self.l_margin + si * 42, legend_y, 6, 4, 'F')
            self.set_font('ArialUni', '', 7)
            self.set_text_color(*self.slate_600)
            self.set_xy(self.l_margin + si * 42 + 8, legend_y - 0.5)
            self.cell(34, 5, sn[:16])
        self.ln(8)

        aw = self.w - self.l_margin - self.r_margin
        chart_h = 45
        bar_w = (aw - 20) / n_periods * 0.6
        gap = (aw - 20) / n_periods * 0.4

        # Compute period totals to determine scale
        totals = [sum(s[i] for s in stacks) for i in range(n_periods)]
        max_total = max(totals) * 1.10 if totals else 1

        y_base = self.get_y() + chart_h
        for pi, period in enumerate(periods):
            x = self.l_margin + 10 + pi * (bar_w + gap) + gap / 2
            cum = 0
            for si, s in enumerate(stacks):
                v = max(0, s[pi])
                seg_h = (v / max_total) * chart_h if max_total > 0 else 0
                color = stack_colors[si]
                self.set_fill_color(*color)
                self.rect(x, y_base - cum - seg_h, bar_w, seg_h, 'F')
                cum += seg_h

            # Period label
            self.set_font('ArialUni', '', 7.5)
            self.set_text_color(*self.slate_600)
            self.set_xy(x - 5, y_base + 1)
            self.cell(bar_w + 10, 4, str(period), align='C')

            # Total label above bar
            self.set_font('ArialUni', 'B', 7)
            self.set_text_color(*self.slate_700)
            t = totals[pi]
            if unit == 'B':
                t_str = f'${t/1e9:.1f}B' if abs(t) >= 1e9 else f'${t/1e6:.0f}M'
            elif unit == '%':
                t_str = f'{t:.1f}%'
            else:
                t_str = f'{t:.1f}'
            self.set_xy(x - 5, y_base - cum - 5)
            self.cell(bar_w + 10, 4, t_str, align='C')

        self.set_y(y_base + 8)
        self.set_text_color(*self.slate_800)

    # ── Divergent Bar (Bull vs Bear) ──────────────────────────────────────────

    def draw_divergent_bar_chart(self, title, bulls, bears):
        """Side-by-side divergent horizontal bars: bulls right (teal), bears left (red).

        bulls/bears: list of (label, weight) tuples (weight 1-10 typical).
        """
        if not bulls and not bears:
            return
        n = max(len(bulls), len(bears))
        if self.get_y() + 30 + n * 11 > self.h - 25:
            self.add_page()
        self.ln(2)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

        # Subtitle row
        self.set_font('ArialUni', 'B', 8)
        aw = self.w - self.l_margin - self.r_margin
        col_w = aw / 2
        self.set_text_color(*self.red_500)
        self.cell(col_w, 5, 'BEAR THESIS', align='R')
        self.set_text_color(*self.teal_500)
        self.cell(col_w, 5, 'BULL THESIS', align='L', new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

        center_x = self.l_margin + aw / 2
        max_weight = max(
            ([w for _, w in bulls] or [1]) +
            ([w for _, w in bears] or [1])
        )

        bar_h = 8
        for i in range(n):
            y = self.get_y()
            # Bear (left)
            if i < len(bears):
                label, weight = bears[i]
                bar_w = (weight / max_weight) * (aw / 2 - 5)
                self.set_fill_color(*self.red_500)
                self.rect(center_x - bar_w, y, bar_w, bar_h, 'F')
                self.set_font('ArialUni', '', 7.5)
                self.set_text_color(*self.slate_700)
                self.set_xy(self.l_margin, y)
                txt = str(label)[:60]
                self.cell(aw / 2 - bar_w - 3, bar_h, txt, align='R')
            # Bull (right)
            if i < len(bulls):
                label, weight = bulls[i]
                bar_w = (weight / max_weight) * (aw / 2 - 5)
                self.set_fill_color(*self.teal_500)
                self.rect(center_x, y, bar_w, bar_h, 'F')
                self.set_font('ArialUni', '', 7.5)
                self.set_text_color(*self.slate_700)
                self.set_xy(center_x + bar_w + 3, y)
                self.cell(aw / 2 - bar_w - 3, bar_h, str(label)[:60])

            self.set_xy(self.l_margin, y + bar_h + 3)

        # Center axis line
        self.set_draw_color(*self.slate_400 if hasattr(self, 'slate_400') else self.slate_500)
        self.set_line_width(0.4)
        self.set_y(self.get_y() + 2)

    # ── Price Ladder (trade plan) ─────────────────────────────────────────────

    def draw_price_ladder(self, title, current_price, levels):
        """Vertical price ladder showing entry/trim/exit zones.

        levels: list of (zone_label, low, high, kind) where kind in
                {'entry','trim','exit'} controls color.
        """
        if not levels:
            return
        if self.get_y() + 90 > self.h - 25:
            self.add_page()
        self.ln(2)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

        aw = self.w - self.l_margin - self.r_margin
        chart_h = 70
        y_top = self.get_y() + 4
        y_bot = y_top + chart_h
        axis_x = self.l_margin + 80

        all_prices = [current_price] + [l for _, l, _, _ in levels] + [h for _, _, h, _ in levels]
        pmin = min(all_prices) * 0.95
        pmax = max(all_prices) * 1.05
        if pmax == pmin:
            pmax = pmin + 1

        def y_for(p):
            return y_bot - ((p - pmin) / (pmax - pmin)) * chart_h

        # Draw axis line
        self.set_draw_color(*self.slate_300 if hasattr(self, 'slate_300') else self.slate_500)
        self.set_line_width(0.4)
        self.line(axis_x, y_top, axis_x, y_bot)

        zone_color = {
            'entry': self.teal_500,
            'trim': self.amber_500,
            'exit': self.red_500,
        }

        # Zones as horizontal bands on the right of the axis
        zone_x = axis_x + 3
        zone_w = aw - (axis_x - self.l_margin) - 5
        for label, low, high, kind in levels:
            color = zone_color.get(kind, self.slate_500)
            yh = y_for(high)
            yl = y_for(low)
            self.set_fill_color(*color)
            self.set_draw_color(*color)
            self.rect(zone_x, yh, zone_w, yl - yh, 'F')
            # Label inside zone
            self.set_font('ArialUni', 'B', 7.5)
            self.set_text_color(255, 255, 255)
            self.set_xy(zone_x + 2, yh + 1)
            self.cell(zone_w - 4, 4, f'{label} (${low:.0f}–${high:.0f})')

        # Current price marker
        cy = y_for(current_price)
        self.set_draw_color(*self.slate_800)
        self.set_line_width(0.8)
        self.set_dash_pattern(2, 1.5)
        self.line(self.l_margin + 10, cy, axis_x, cy)
        self.set_dash_pattern()

        self.set_font('ArialUni', 'B', 8)
        self.set_text_color(*self.slate_800)
        self.set_xy(self.l_margin + 10, cy - 2.5)
        self.cell(60, 4, f'Current ${current_price:.0f}', align='R')

        self.set_y(y_bot + 4)

    # ── Status Grid (promise tracker) ─────────────────────────────────────────

    def draw_status_grid(self, title, rows, columns, statuses):
        """Gantt-lite status heatmap.

        rows: list of row labels.
        columns: list of column labels (e.g. quarters).
        statuses: 2D list shape [len(rows)][len(columns)] with values in
                  {'delivered','partial','missed','pending', None}.
        """
        if not rows or not columns:
            return
        if self.get_y() + 20 + len(rows) * 7 > self.h - 25:
            self.add_page()
        self.ln(2)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

        aw = self.w - self.l_margin - self.r_margin
        label_w = 60
        cell_w = (aw - label_w - 4) / max(len(columns), 1)
        cell_h = 6

        # Header row
        self.set_font('ArialUni', 'B', 7.5)
        self.set_text_color(*self.slate_700)
        self.set_x(self.l_margin + label_w + 2)
        for col in columns:
            self.cell(cell_w, cell_h, str(col)[:14], align='C')
        self.ln(cell_h)

        color_map = {
            'delivered': self.green_500,
            'pass': self.green_500,
            'partial': self.amber_500,
            'missed': self.red_500,
            'fail': self.red_500,
            'pending': self.slate_300 if hasattr(self, 'slate_300') else self.slate_500,
        }

        for ri, label in enumerate(rows):
            y = self.get_y()
            self.set_font('ArialUni', '', 7.5)
            self.set_text_color(*self.slate_700)
            self.cell(label_w, cell_h, str(label)[:50])
            for ci in range(len(columns)):
                status = None
                if ri < len(statuses) and ci < len(statuses[ri]):
                    status = str(statuses[ri][ci]).lower() if statuses[ri][ci] else None
                color = color_map.get(status, self.slate_200)
                self.set_fill_color(*color)
                self.set_draw_color(255, 255, 255)
                self.rect(self.l_margin + label_w + 2 + ci * cell_w, y, cell_w - 1, cell_h - 1, 'F')
            self.ln(cell_h)
        self.ln(3)
        self.set_text_color(*self.slate_800)
