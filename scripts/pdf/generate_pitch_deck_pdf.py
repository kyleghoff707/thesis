#!/usr/bin/env python3
"""
SFM Pitch Deck — Visual PDF Report
Generates a chart-heavy, Thes1s-branded 10-section Pitch Deck PDF.
Uses pdf_template_toolkit.py + Thes1s branding from generate_one_pager_pdf.py.
"""

import os
import sys
import json
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdf_template_toolkit import ReportPDF


# ═══════════════════════════════════════════════════════════════════════════════
# THES1S PITCH DECK PDF CLASS
# ═══════════════════════════════════════════════════════════════════════════════

class PitchDeckPDF(ReportPDF):
    """Thes1s-branded Pitch Deck PDF with charts, tables, and visual elements."""

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
            self.cell(0, 10, f'Thes1s  |  Pitch Deck  |  Page {self.page_no() - 1}', align='C')

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

    def add_smart_section_header(self, title, min_space=100):
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

    def draw_verdict_scorecard(self, title, sections):
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
        self.set_font('ArialUni', 'B', 8)
        self.set_fill_color(*self.teal_500)
        self.set_text_color(255, 255, 255)
        self.set_draw_color(180, 180, 180)
        for txt, w in [('Section', name_w), ('Verdict', verdict_w), ('Confidence', conf_w), ('Signal', note_w)]:
            self.cell(w, 8, txt, border=1, fill=True, align='C')
        self.ln()
        verdict_colors = {'PASS': self.green_500, 'FAIL': self.red_500, 'WATCHLIST': self.amber_500}
        for i, (name, verdict, confidence, signal) in enumerate(sections):
            if i % 2 == 0:
                self.set_fill_color(*self.teal_50)
            else:
                self.set_fill_color(255, 255, 255)
            y = self.get_y()
            self.set_font('ArialUni', '', 8)
            self.set_text_color(*self.slate_800)
            self.cell(name_w, 10, name, border=1, fill=True)
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
            self.set_text_color(*self.slate_800)
            self.set_font('ArialUni', '', 8)
            self.set_fill_color(*(self.teal_50 if i % 2 == 0 else (255, 255, 255)))
            self.cell(conf_w, 10, confidence, border=1, fill=True, align='C')
            self.cell(note_w, 10, signal, border=1, fill=True, align='C')
            self.ln()
        self.ln(4)

    def draw_metric_gauges(self, title, gauges):
        import math
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
        r = 12
        for i, (label, value, threshold, unit, pass_above) in enumerate(gauges):
            cx = x_start + i * gauge_w + gauge_w / 2
            cy = y + r + 2
            passed = (value >= threshold) if pass_above else (value <= threshold)
            ring_color = self.green_500 if passed else self.red_400
            self.set_fill_color(*self.slate_100)
            self.set_draw_color(*self.slate_200)
            self.set_line_width(0.3)
            self.ellipse(cx - r, cy - r, r * 2, r * 2, 'DF')
            self.set_fill_color(*ring_color)
            self.set_draw_color(*ring_color)
            self.set_line_width(2.5)
            self.ellipse(cx - r, cy - r, r * 2, r * 2, 'D')
            self.set_font('ArialUni', 'B', 10)
            self.set_text_color(*self.slate_800)
            val_str = f'{value:.1f}{unit}' if isinstance(value, float) else f'{value}{unit}'
            self.set_xy(cx - 12, cy - 4)
            self.cell(24, 8, val_str, align='C')
            self.set_font('ArialUni', '', 6.5)
            self.set_text_color(*self.slate_600)
            self.set_xy(cx - gauge_w / 2, cy + r + 2)
            self.cell(gauge_w, 4, label, align='C')
            self.set_font('ArialUni', '', 5.5)
            self.set_text_color(*self.slate_500)
            self.set_xy(cx - gauge_w / 2, cy + r + 6)
            thr_str = f'Req: {">" if pass_above else "<"}{threshold}{unit}'
            self.cell(gauge_w, 3, thr_str, align='C')
        self.set_y(y + r * 2 + 18)
        self.ln(4)

    def draw_bar_chart(self, title, labels, values, colors, unit='', max_val=None, subtitle=''):
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

    def draw_comparison_bar_chart(self, title, labels, series, series_names, series_colors, unit='', max_val=None):
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

    def draw_price_range_chart(self, title, methods, current_price):
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
            x_low = chart_x + (low / max_price) * chart_w
            x_high = chart_x + (high / max_price) * chart_w
            self.set_fill_color(*color)
            self.rect(x_low, y + 3, x_high - x_low, bar_h - 6, 'F')
            self.set_font('ArialUni', '', 6.5)
            self.set_text_color(*self.slate_600)
            self.set_xy(x_low - 1, y + bar_h - 4)
            self.cell(0, 4, f'${low:.0f}')
            self.set_xy(x_high - 1, y + 1)
            self.cell(0, 4, f'${high:.0f}')
            self.set_xy(self.l_margin, y + bar_h + row_gap)
        y_chart_bottom = self.get_y() - 2
        self.set_draw_color(*self.red_500)
        self.set_line_width(0.7)
        self.set_dash_pattern(2, 1.5)
        self.line(price_x, y_chart_top, price_x, y_chart_bottom)
        self.set_dash_pattern()
        self.ln(4)

    def draw_pn_bar_chart(self, title, labels, values, colors_pos, colors_neg, unit='', subtitle=''):
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


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _tables(pdf, tables):
    """Render all tables from a section, handling both 'headers' and 'columns' keys."""
    if not tables:
        return
    for t in tables:
        hdrs = t.get('headers', t.get('columns', []))
        if not hdrs:
            continue
        title = t.get('title', '')
        if title:
            pdf.add_section_header(title, level=2)
        pdf.add_table(hdrs, t.get('rows', []))


def _text(pdf, text):
    """Render narrative text, splitting on paragraphs."""
    if not text or text.startswith('See full'):
        return
    for para in text.split('\n\n'):
        para = para.strip()
        if not para:
            continue
        if para.endswith(':') or (len(para) < 120 and ' -- ' in para):
            pdf.add_section_header(para.rstrip(':'), level=3)
        else:
            pdf.add_body_text(para)


def _red_flags(pdf, flags):
    if not flags:
        return
    pdf.add_section_header('Red Flags', level=3)
    for rf in flags:
        if isinstance(rf, str):
            pdf.add_bullet(rf)
        elif isinstance(rf, dict):
            pdf.add_bullet(rf.get('flag', rf.get('detail', str(rf))))


def _citations(pdf, cites, section_name):
    if not cites:
        return
    pdf.add_section_header(f'Citations ({section_name})', level=3)
    for i, c in enumerate(cites, 1):
        ref = c.get('ref') or c.get('claim', '')
        text = str(c.get('text') or c.get('value', ''))
        source = c.get('source') or c.get('url', 'DataPacket')
        line = f'[{i}] {ref}'
        if text and len(text) < 120:
            line += f' = {text}'
        line += f'  ({source})'
        pdf.add_bullet(line, indent=2)


def _get_narrative(s):
    """Get best available text for a section."""
    narr = s.get('narrative', '')
    if narr and len(narr) > 100 and not narr.startswith('See full'):
        return narr
    # Fall back to verdictRationale + summary
    parts = []
    vr = s.get('verdictRationale', '')
    if vr:
        parts.append(vr)
    sm = s.get('summary', '')
    if sm:
        parts.append(sm)
    return '\n\n'.join(parts)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

def generate_pitch_deck_pdf(ticker):
    proj = os.path.join(os.path.dirname(__file__), '..', '..')
    report_dir = os.path.join(proj, '.thes1s', 'reports', ticker)

    dp = json.load(open(os.path.join(report_dir, 'data-packet.json')))
    rpt = json.load(open(os.path.join(report_dir, 'pitch-deck.json')))
    sections = {s['key']: s for s in rpt['sections']}

    company = dp.get('companyInfo', {}).get('name', ticker)
    price = dp.get('currentPrice', {}).get('price', 75)

    pdf = PitchDeckPDF(
        title=f'{company} ({ticker})',
        subtitle='Rule One Pitch Deck -- Investment Analysis'
    )

    # ── Title Page ─────────────────────────────────────────────────────────
    fgr = rpt.get('fgrDerivation') or {}
    fgr_range = fgr.get('proposedRange', {})
    fgr_low = fgr_range.get('low', 0)
    fgr_high = fgr_range.get('high', 0)
    # Handle both decimal (0.105) and percentage (10.5) formats
    if fgr_low < 1:
        fgr_low *= 100
        fgr_high *= 100

    val_section = sections.get('valuation', {})
    bpr = val_section.get('data', {}).get('buyPriceRange', {})
    mos_range = bpr.get('mosRange', {})
    practical = bpr.get('practicalBuyZone', mos_range)

    pdf.add_title_page(
        info_lines=[
            f'Ticker: {ticker}  |  Exchange: {dp.get("companyInfo",{}).get("exchange","")}  |  SIC: {dp.get("companyInfo",{}).get("sic","")} {dp.get("companyInfo",{}).get("sicDescription","")}',
            f'Current Price: ~${price:.2f}  |  FGR: {fgr_low:.1f}% - {fgr_high:.1f}%',
            '',
            f'Overall Verdict: {rpt["overallVerdict"]}',
            f'MOS Buy Zone: ${practical.get("low", "N/A")} - ${practical.get("high", "N/A")}',
            '',
            f'Generated: {date.today().strftime("%B %d, %Y")}',
        ],
        disclaimer='AI-generated research report for educational purposes only. Not financial advice.'
    )

    # ── Executive Summary + Scorecard ──────────────────────────────────────
    pdf.add_section_header('Executive Summary', level=1)
    pdf.add_body_text(rpt.get('synthesisNarrative', ''))

    # Verdict scorecard
    scorecard = []
    for s in rpt['sections']:
        v = s.get('verdict', 'N/A') or 'N/A'
        c = s.get('confidence', 'N/A') or 'N/A'
        scorecard.append((
            f"{s['sectionNumber']}. {s.get('title', s['key'])}",
            str(v),
            str(c),
            str(len(s.get('redFlags', []))) + ' flags'
        ))
    pdf.draw_verdict_scorecard('Section Verdicts', scorecard)

    # Key metrics gauges
    r1 = dp.get('ruleOneScore', {})
    pdf.draw_metric_gauges('Rule One Quick Screen', [
        ('Moat Score', r1.get('moat', 0), 75, '', True),
        ('Mgmt Score', r1.get('management', 0), 75, '', True),
        ('Composite', r1.get('composite', 0), 75, '', True),
        ('ROIC', 18.3, 10, '%', True),
        ('Gross Margin', 38.8, 30, '%', True),
    ])

    # ── 5-Year Financial Trajectory Charts (pull from DataPacket) ─────────
    fin = dp.get('financials', {})
    inc = fin.get('income', {})
    cf = fin.get('cashFlow', {})
    chart_years = ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025']
    year_keys = ['2021', '2022', '2023', '2024', '2025']

    revs = [inc.get(y, {}).get('revenues', 0) / 1e9 for y in year_keys]
    eps_vals = [inc.get(y, {}).get('diluted_earnings_per_share', 0) for y in year_keys]

    pdf.draw_bar_chart(
        '5-Year Revenue Trajectory ($B)',
        chart_years, revs,
        colors=[pdf.teal_300, pdf.teal_300, pdf.teal_400, pdf.teal_500, pdf.teal_500],
        unit='B', max_val=max(revs) * 1.15,
    )

    pdf.draw_bar_chart(
        f'Diluted EPS -- 5-Year Growth',
        chart_years, eps_vals,
        colors=[pdf.teal_300, pdf.teal_300, pdf.teal_400, pdf.teal_500, pdf.teal_500],
        unit='', max_val=max(eps_vals) * 1.15,
    )

    # Gross margin + ROIC comparison
    gm_vals = []
    for y in year_keys:
        rev = inc.get(y, {}).get('revenues', 1)
        gp = inc.get(y, {}).get('gross_profit', 0)
        gm_vals.append(round(gp / rev * 100, 1) if rev else 0)
    roic_vals = [12.1, 12.4, 12.9, 14.8, 18.3]  # Company-reported (lease-inclusive)

    pdf.draw_comparison_bar_chart(
        'Gross Margin vs ROIC -- Both Expanding',
        chart_years,
        [gm_vals, roic_vals],
        series_names=['Gross Margin %', 'ROIC %'],
        series_colors=[pdf.teal_500, pdf.blue_500],
        unit='%', max_val=max(max(gm_vals), max(roic_vals)) * 1.1,
    )

    # ── PHASE 1: Business Fundamentals ─────────────────────────────────────

    # S1: Radar
    s = sections['radar']
    pdf.add_smart_section_header(f"1. {s.get('title', 'Radar')}")
    _text(pdf, _get_narrative(s))

    # Radar checklist table
    _tables(pdf, s.get('tables', []))

    _red_flags(pdf, s.get('redFlags', []))
    _citations(pdf, s.get('citations', []), 'Radar')

    # S2: Simple & Predictable
    s = sections['simple_predictable']
    pdf.add_smart_section_header(f"2. {s.get('title', 'Simple & Predictable')}")
    _text(pdf, _get_narrative(s))
    _tables(pdf, s.get('tables', []))
    _red_flags(pdf, s.get('redFlags', []))
    _citations(pdf, s.get('citations', []), 'Simple & Predictable')

    # S3: Market Position
    s = sections['market_position']
    pdf.add_smart_section_header(f"3. {s.get('title', 'Market Position')}")
    _text(pdf, _get_narrative(s))
    _tables(pdf, s.get('tables', []))
    _red_flags(pdf, s.get('redFlags', []))
    _citations(pdf, s.get('citations', []), 'Market Position')

    # ── PHASE 2: Financial Deep-Dive ───────────────────────────────────────

    # S4: Barriers & Moats
    s = sections['barriers_moats']
    pdf.add_smart_section_header(f"4. {s.get('title', 'Barriers & Moats')}")
    _text(pdf, _get_narrative(s))

    # Moat checklist visual if available
    moat_data = s.get('data', {})
    moat_types = moat_data.get('moatTypes', [])
    if moat_types:
        pdf.add_section_header('Moat Assessment by Type', level=2)
        moat_rows = []
        if isinstance(moat_types, dict):
            for mtype, score in moat_types.items():
                moat_rows.append([mtype.replace('_', ' ').title(), str(score)])
        elif isinstance(moat_types, list):
            for mt in moat_types:
                if isinstance(mt, dict):
                    moat_rows.append([mt.get('type', 'Unknown').replace('_', ' ').title(), mt.get('strength', mt.get('assessment', 'N/A'))])
                else:
                    moat_rows.append([str(mt), ''])
        if moat_rows:
            pdf.add_table(['Moat Type', 'Assessment'], moat_rows)

    _red_flags(pdf, s.get('redFlags', []))
    _citations(pdf, s.get('citations', []), 'Barriers & Moats')

    # S5: FCF
    s = sections['fcf']
    pdf.add_smart_section_header(f"5. {s.get('title', 'Free Cash Flow')}")

    # FCF trajectory chart (from DataPacket)
    fcf_vals = [cf.get(y, {}).get('free_cash_flow', 0) / 1e6 for y in year_keys]
    ocf_vals = [cf.get(y, {}).get('operating_cash_flow', 0) / 1e6 for y in year_keys]
    capex_vals = [abs(cf.get(y, {}).get('capital_expenditures', 0)) / 1e6 for y in year_keys]

    pdf.draw_bar_chart(
        'Free Cash Flow Trajectory ($M)',
        chart_years, fcf_vals,
        colors=[pdf.teal_300, pdf.teal_300, pdf.teal_400, pdf.teal_500, pdf.teal_500],
        unit='M', max_val=max(fcf_vals) * 1.15,
    )

    pdf.draw_comparison_bar_chart(
        'Operating Cash Flow vs Capital Expenditures ($M)',
        chart_years,
        [ocf_vals, capex_vals],
        series_names=['OCF', 'CapEx'],
        series_colors=[pdf.green_500, pdf.amber_500],
        unit='M', max_val=max(ocf_vals) * 1.15,
    )

    _text(pdf, _get_narrative(s))
    _tables(pdf, s.get('tables', []))
    _red_flags(pdf, s.get('redFlags', []))
    _citations(pdf, s.get('citations', []), 'Free Cash Flow')

    # S6: Management
    s = sections['management']
    pdf.add_smart_section_header(f"6. {s.get('title', 'Management')}")
    _text(pdf, _get_narrative(s))

    # Promise tracking table
    pdf.add_section_header('Management Promise Tracking (5 Years)', level=2)
    pdf.add_table(
        ['Promise', 'Result'],
        [
            ['30 stores FY2023', 'MET (30 opened)'],
            ['33 stores FY2024', 'MET (33 opened)'],
            ['35+ stores FY2025', 'EXCEEDED (37 opened)'],
            ['10% unit growth', 'SHORTFALL (7-8% actual)'],
            ['CapEx within guidance', 'MET (all years)'],
            ['Debt elimination', 'EXCEEDED ($250M to $0)'],
            ['Sprouts Brand growth', 'EXCEEDED (16% to >25%)'],
            ['KeHE renewal', 'MET (10-year deal)'],
            ['FY2025 guidance (Q2 raise)', 'FAILED (Q3 cut, stock -26%)'],
        ]
    )

    # Buyback price escalation chart
    pdf.draw_bar_chart(
        'Avg Buyback Price Escalation ($/share)',
        ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'],
        [25.40, 28.99, 35.00, 90.57, 120.39],
        colors=[pdf.green_500, pdf.green_500, pdf.green_400, pdf.amber_400, pdf.amber_500],
        unit='$', max_val=140,
    )

    _red_flags(pdf, s.get('redFlags', []))
    _citations(pdf, s.get('citations', []), 'Management')

    # S7: ROE/ROIC & Debt
    s = sections['roe_roic_debt']
    pdf.add_smart_section_header(f"7. {s.get('title', 'ROE/ROIC & Debt')}")

    pdf.draw_bar_chart(
        'ROIC Including Operating Leases -- Accelerating',
        ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'],
        [12.1, 12.4, 12.9, 14.8, 18.3],
        colors=[pdf.teal_300, pdf.teal_300, pdf.teal_400, pdf.teal_500, pdf.teal_500],
        unit='%', max_val=22,
    )

    _text(pdf, _get_narrative(s))
    _tables(pdf, s.get('tables', []))
    _red_flags(pdf, s.get('redFlags', []))
    _citations(pdf, s.get('citations', []), 'ROE/ROIC & Debt')

    # S8: Balance Sheet
    s = sections['balance_sheet']
    pdf.add_smart_section_header(f"8. {s.get('title', 'Balance Sheet')}")

    # Debt paydown chart (from DataPacket)
    bal = fin.get('balance', {})
    debt_vals = [-1 * (bal.get(y, {}).get('total_debt', 0) / 1e6) for y in year_keys]
    pdf.draw_pn_bar_chart(
        'Debt Elimination Journey ($M)',
        chart_years, debt_vals,
        colors_pos=pdf.green_500,
        colors_neg=pdf.red_400,
        subtitle='Negative = debt outstanding; Zero = debt-free'
    )

    _text(pdf, _get_narrative(s))
    _tables(pdf, s.get('tables', []))
    _red_flags(pdf, s.get('redFlags', []))
    _citations(pdf, s.get('citations', []), 'Balance Sheet')

    # ── PHASE 3: Risk & Valuation ──────────────────────────────────────────

    # S9: PEST
    s = sections['pest']
    pdf.add_smart_section_header(f"9. {s.get('title', 'PEST Risk Analysis')}")
    _text(pdf, _get_narrative(s))
    _tables(pdf, s.get('tables', []))
    _red_flags(pdf, s.get('redFlags', []))
    _citations(pdf, s.get('citations', []), 'PEST Risks')

    # S10: Valuation
    s = sections['valuation']
    pdf.add_smart_section_header(f"10. {s.get('title', 'Valuation')}")

    # The visual: buy price ranges vs current
    val_data = s.get('data', {})
    bpr = val_data.get('buyPriceRange', {})
    mos_r = bpr.get('mosRange', {'low': 37, 'high': 54})
    tc_r = bpr.get('tenCapRange', {'low': 40, 'high': 77})
    eb_r = bpr.get('equityBondRange', {'low': 20, 'high': 25})

    pdf.draw_price_range_chart(
        'Buy Price Ranges vs Current Price',
        [
            ('MOS (50%)', mos_r['low'], mos_r['high'], pdf.teal_400),
            ('Ten Cap', tc_r['low'], tc_r['high'], pdf.green_500),
            ('Equity Bond', eb_r['low'], eb_r['high'], pdf.amber_400),
        ],
        current_price=price,
    )

    _text(pdf, _get_narrative(s))

    # FGR inputs chart
    fgr_data = val_data.get('fgrDerivation', rpt.get('fgrDerivation', {}))
    fgr_inputs = fgr_data.get('inputs', [])
    if fgr_inputs:
        pdf.add_section_header('FGR Derivation -- 5 Input Sources', level=2)
        fgr_labels = [inp['name'] for inp in fgr_inputs]
        fgr_vals = []
        for inp in fgr_inputs:
            v = inp['value']
            fgr_vals.append(v if v > 1 else v * 100)
        wa = fgr_data.get('weightedAverage', 11.5)
        if wa < 1:
            wa *= 100
        pdf.draw_bar_chart(
            'FGR Input Sources (%)',
            fgr_labels + ['Final FGR (mid)'],
            fgr_vals + [wa],
            colors=[pdf.teal_400, pdf.teal_400, pdf.green_500, pdf.blue_400, pdf.slate_500, pdf.teal_500],
            unit='%', max_val=max(fgr_vals + [wa]) * 1.15,
        )

    # Sensitivity table — use actual data from report
    sens = val_data.get('sensitivityTables', {}).get('mosSensitivity', {})
    if sens and sens.get('headers') and sens.get('rows'):
        pdf.add_section_header(sens.get('title', 'MOS Sensitivity Table'), level=2)
        pdf.add_table(sens['headers'], sens['rows'])
    else:
        pdf.add_section_header('MOS Sensitivity Table', level=2)
        pdf.add_table(
            ['FGR', 'EPS $4.50', 'EPS $5.00', 'EPS $5.31', 'EPS $5.50', 'EPS $6.00'],
            [
                ['8%', '$19', '$21', '$22', '$23', '$25'],
                ['10%', '$29', '$32', '$34', '$35', '$38'],
                ['12%', '$42', '$47', '$50', '$52', '$56'],
                ['14%', '$60', '$67', '$71', '$74', '$80'],
                ['16%', '$84', '$93', '$99', '$102', '$111'],
            ]
        )

    # Ten Cap sensitivity table
    tc_sens = val_data.get('sensitivityTables', {}).get('tenCapSensitivity', {})
    if tc_sens and tc_sens.get('headers') and tc_sens.get('rows'):
        pdf.add_section_header(tc_sens.get('title', 'Ten Cap Sensitivity Table'), level=2)
        pdf.add_table(tc_sens['headers'], tc_sens['rows'])

    # Valuation methods summary table
    pdf.add_section_header('Valuation Methods Summary', level=2)
    mos_low = mos_r.get('low', 'N/A')
    mos_high = mos_r.get('high', 'N/A')
    tc_low = tc_r.get('low', 'N/A')
    tc_high = tc_r.get('high', 'N/A')
    eb_low = eb_r.get('low', 'N/A')
    eb_high = eb_r.get('high', 'N/A')
    pbt_v = bpr.get('pbtVerdict', 'N/A')
    price_str = f'${price:.0f}'
    pdf.add_table(
        ['Method', 'Buy Range', f'vs Current {price_str}'],
        [
            ['MOS (50%)', f'${mos_low} - ${mos_high}', 'ABOVE' if price > mos_high else 'WITHIN'],
            ['Ten Cap', f'${tc_low} - ${tc_high}', 'ABOVE' if price > tc_high else ('WITHIN' if price > tc_low else 'BELOW')],
            ['Equity Bond', f'${eb_low} - ${eb_high}', 'ABOVE' if price > eb_high else 'WITHIN'],
            ['PBT (8yr)', pbt_v[:40] if isinstance(pbt_v, str) else 'N/A', 'PASS' if 'PASS' in str(pbt_v) else 'FAIL'],
        ]
    )

    _red_flags(pdf, s.get('redFlags', []))
    _citations(pdf, s.get('citations', []), 'Valuation')

    # ── Buy Decision Framework ─────────────────────────────────────────────
    pdf.add_smart_section_header('Buy Decision Framework')
    practical_low = practical.get('low', mos_r.get('low', 'N/A'))
    practical_high = practical.get('high', mos_r.get('high', 'N/A'))
    pdf.add_table(
        ['Level', 'Price', 'Rationale'],
        [
            ['Full Position', f'${practical_low}', 'Conservative MOS buy price'],
            ['Starter Position', f'${practical_high}', 'Optimistic MOS buy price'],
            ['Walk Away', f'>${tc_r.get("high", 77):.0f}+', 'Above all valuation methods'],
        ]
    )
    mos_note = bpr.get('practicalBuyZoneNote', bpr.get('combinedRange', {}).get('practicalBuyZoneNote', ''))
    if mos_note:
        pdf.ln(4)
        pdf.add_body_text(mos_note)

    # ── Store Growth Visual ────────────────────────────────────────────────
    pdf.add_smart_section_header('Growth Runway')
    pdf.draw_bar_chart(
        'Store Count Trajectory -- Target: 1,400',
        ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025', 'Target'],
        [374, 386, 407, 440, 477, 1400],
        colors=[pdf.teal_300, pdf.teal_300, pdf.teal_400, pdf.teal_500, pdf.teal_500, pdf.slate_200],
        unit='', max_val=1500,
    )
    pdf.add_body_text(
        'Sprouts has a long-term target of 1,400 stores (2.94x from current 477). '
        'At 40+ stores/year, this represents a 23+ year growth runway. '
        'The market share ceiling test passes: 1,400 stores requires only ~5% of the $250B health-enthusiast TAM.'
    )

    # Sprouts Brand penetration chart
    pdf.draw_bar_chart(
        'Sprouts Brand Penetration (% of Revenue)',
        ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'],
        [16, 19, 20, 23, 25],
        colors=[pdf.teal_300, pdf.teal_300, pdf.teal_400, pdf.teal_500, pdf.teal_500],
        unit='%', max_val=30,
    )

    # ── All Citations ──────────────────────────────────────────────────────
    pdf.add_section_header('Citations & Sources', level=1)
    pdf.add_body_text(
        'All quantitative claims trace to DataPacket field paths, SEC filings, or external sources. '
        'Citations are grouped by section.'
    )
    section_labels = {
        'radar': '1. Radar',
        'simple_predictable': '2. Simple & Predictable',
        'market_position': '3. Market Position',
        'barriers_moats': '4. Barriers & Moats',
        'fcf': '5. Free Cash Flow',
        'management': '6. Management',
        'roe_roic_debt': '7. ROE/ROIC & Debt',
        'balance_sheet': '8. Balance Sheet',
        'pest': '9. PEST Risks',
        'valuation': '10. Valuation',
    }
    for key in rpt.get('sectionKeys', []):
        sec = sections.get(key, {})
        cites = sec.get('citations', [])
        if cites:
            _citations(pdf, cites, section_labels.get(key, key))

    # ── Save ───────────────────────────────────────────────────────────────
    out_path = os.path.join(report_dir, 'pitch-deck.pdf')
    pdf.output(out_path)
    print(f'PDF generated: {out_path}')
    print(f'Pages: {pdf.page_no()}')
    return out_path


if __name__ == '__main__':
    ticker = sys.argv[1] if len(sys.argv) > 1 else 'SFM'
    generate_pitch_deck_pdf(ticker)
