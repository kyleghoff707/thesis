#!/usr/bin/env python3
"""
Reusable PDF Generation Toolkit
================================
A template for generating professionally formatted PDFs with diagrams, flow charts,
bar charts, tables, and rich text formatting using fpdf2.

Dependencies:
    pip install fpdf2

Usage:
    1. Subclass ReportPDF or use it directly
    2. Call drawing methods to build your document
    3. Use parse_and_render() to convert markdown files to PDF automatically

This toolkit was extracted from production competitive intelligence reports.
All diagrams are drawn programmatically using fpdf2's drawing primitives —
no external charting libraries needed.
"""

import os
import re
import math
from fpdf import FPDF
from datetime import date


# ═══════════════════════════════════════════════════════════════════════════════
# CORE PDF CLASS
# ═══════════════════════════════════════════════════════════════════════════════

class ReportPDF(FPDF):
    """
    Professional PDF report generator with built-in support for:
    - Title pages with metadata
    - Table of contents
    - Section headers (3 levels)
    - Body text, bullets, numbered items
    - Code/diagram blocks with shaded backgrounds
    - Auto-formatted tables with alternating row colors
    - Horizontal bar charts (single and grouped/comparison)
    - Vertical flow charts with arrows
    - Comparison scorecard tables
    - Automatic markdown-to-PDF rendering
    """

    def __init__(self, title='Report', subtitle='', orientation='P', page_format='Letter'):
        super().__init__(orientation, 'mm', page_format)
        self.set_auto_page_break(auto=True, margin=25)
        self.report_title = title
        self.report_subtitle = subtitle

        # ── Font Setup ──
        # Try macOS fonts first, then Linux (Liberation Sans = Arial-compatible)
        import platform
        if platform.system() == 'Darwin':
            self.add_font('ArialUni', '', '/System/Library/Fonts/Supplemental/Arial.ttf')
            self.add_font('ArialUni', 'B', '/System/Library/Fonts/Supplemental/Arial Bold.ttf')
            self.add_font('ArialUni', 'I', '/System/Library/Fonts/Supplemental/Arial Italic.ttf')
            self.add_font('ArialUni', 'BI', '/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf')
        else:
            # Linux: use Liberation Sans (apt-get install fonts-liberation)
            lib_dir = '/usr/share/fonts/truetype/liberation'
            self.add_font('ArialUni', '', os.path.join(lib_dir, 'LiberationSans-Regular.ttf'))
            self.add_font('ArialUni', 'B', os.path.join(lib_dir, 'LiberationSans-Bold.ttf'))
            self.add_font('ArialUni', 'I', os.path.join(lib_dir, 'LiberationSans-Italic.ttf'))
            self.add_font('ArialUni', 'BI', os.path.join(lib_dir, 'LiberationSans-BoldItalic.ttf'))
        # Monospace for code blocks (optional — comment out if not needed)
        # self.add_font('CourierNew', '', '/System/Library/Fonts/Supplemental/Courier New.ttf', uni=True)

        # ── Color Palette ──
        # Override these to customize your report's look
        self.color_primary = (20, 60, 120)       # Dark blue — headers, accents
        self.color_secondary = (40, 80, 140)      # Medium blue — subheaders
        self.color_text = (30, 30, 30)            # Near-black — body text
        self.color_muted = (80, 80, 80)           # Gray — metadata, captions
        self.color_light_muted = (120, 120, 120)  # Light gray — headers/footers
        self.color_accent = (150, 30, 30)         # Red — warnings, confidential
        self.color_table_header = (20, 60, 120)   # Table header background
        self.color_table_alt_row = (245, 248, 252) # Alternating row background

    # ─── Header & Footer (auto-called by fpdf2 on each page) ────────────────

    def header(self):
        if self.page_no() > 1:
            self.set_font('ArialUni', 'I', 8)
            self.set_text_color(*self.color_light_muted)
            self.cell(0, 5, self.report_title, align='L')
            self.cell(0, 5, '', align='R', new_x="LMARGIN", new_y="NEXT")
            self.set_draw_color(200, 200, 200)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.ln(3)

    def footer(self):
        self.set_y(-15)
        self.set_font('ArialUni', 'I', 8)
        self.set_text_color(*self.color_light_muted)
        if self.page_no() > 1:
            self.cell(0, 10, f'Page {self.page_no() - 1}', align='C')

    # ═══════════════════════════════════════════════════════════════════════════
    # STRUCTURAL ELEMENTS
    # ═══════════════════════════════════════════════════════════════════════════

    def add_title_page(self, info_lines=None, disclaimer=None):
        """
        Add a professional title page.

        Args:
            info_lines: List of metadata strings (date, author, etc.)
                        Defaults to just the current date.
            disclaimer: Optional disclaimer text at the bottom (italic, red).
        """
        self.add_page()
        self.ln(35)

        # Main title
        self.set_font('ArialUni', 'B', 26)
        self.set_text_color(*self.color_primary)
        self.multi_cell(0, 11, self.report_title, align='C')
        self.ln(5)

        # Subtitle
        if self.report_subtitle:
            self.set_font('ArialUni', '', 18)
            self.set_text_color(60, 60, 60)
            self.multi_cell(0, 9, self.report_subtitle, align='C')
            self.ln(15)

        # Decorative line
        self.set_draw_color(*self.color_primary)
        self.set_line_width(0.8)
        x_center = self.w / 2
        self.line(x_center - 40, self.get_y(), x_center + 40, self.get_y())
        self.ln(15)

        # Info lines
        self.set_font('ArialUni', '', 12)
        self.set_text_color(*self.color_muted)
        if info_lines is None:
            info_lines = [f'Date: {date.today().strftime("%B %d, %Y")}']
        for line in info_lines:
            self.cell(0, 8, line, align='C', new_x="LMARGIN", new_y="NEXT")

        # Disclaimer
        if disclaimer:
            self.ln(25)
            self.set_font('ArialUni', 'I', 10)
            self.set_text_color(*self.color_accent)
            self.multi_cell(0, 6, disclaimer, align='C')

    def add_toc(self, sections):
        """Add a Table of Contents page."""
        self.add_page()
        self.set_font('ArialUni', 'B', 18)
        self.set_text_color(*self.color_primary)
        self.cell(0, 12, 'Table of Contents', new_x="LMARGIN", new_y="NEXT")
        self.ln(8)
        self.set_font('ArialUni', '', 11)
        self.set_text_color(40, 40, 40)
        for i, section in enumerate(sections, 1):
            self.cell(0, 8, f'{i}.  {section}', new_x="LMARGIN", new_y="NEXT")

    def add_section_header(self, title, level=1):
        """
        Add a section header.
        Level 1: New page, large blue header with underline
        Level 2: Medium blue subheader
        Level 3: Small dark gray sub-subheader
        """
        if level == 1:
            self.add_page()
            self.set_font('ArialUni', 'B', 18)
            self.set_text_color(*self.color_primary)
            self.multi_cell(0, 10, title)
            self.set_draw_color(*self.color_primary)
            self.set_line_width(0.5)
            self.line(self.l_margin, self.get_y() + 1, self.w - self.r_margin, self.get_y() + 1)
            self.ln(6)
        elif level == 2:
            self.ln(4)
            self.set_font('ArialUni', 'B', 14)
            self.set_text_color(*self.color_secondary)
            self.multi_cell(0, 8, title)
            self.ln(3)
        elif level == 3:
            self.ln(3)
            self.set_font('ArialUni', 'B', 12)
            self.set_text_color(60, 60, 60)
            self.multi_cell(0, 7, title)
            self.ln(2)

    # ═══════════════════════════════════════════════════════════════════════════
    # TEXT ELEMENTS
    # ═══════════════════════════════════════════════════════════════════════════

    def add_body_text(self, text):
        """Add a paragraph of body text. Strips markdown bold markers."""
        self.set_font('ArialUni', '', 10)
        self.set_text_color(*self.color_text)
        clean_text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
        self.multi_cell(0, 5.5, clean_text)
        self.ln(2)

    def add_bullet(self, text, indent=0):
        """Add a bullet point. Use indent (in mm) for nested bullets."""
        self.set_font('ArialUni', '', 10)
        self.set_text_color(*self.color_text)
        clean_text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
        x_start = self.l_margin + indent
        self.set_x(x_start)
        bullet_width = 5
        self.cell(bullet_width, 5.5, chr(8226))  # bullet character
        self.multi_cell(self.w - self.r_margin - x_start - bullet_width, 5.5, clean_text)
        self.ln(1)

    def add_numbered_item(self, number, text):
        """Add a numbered list item."""
        self.set_font('ArialUni', '', 10)
        self.set_text_color(*self.color_text)
        clean_text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
        num_width = 8
        self.cell(num_width, 5.5, f'{number}.')
        self.multi_cell(self.w - self.r_margin - self.l_margin - num_width, 5.5, clean_text)
        self.ln(1)

    def add_code_block(self, text):
        """Add a code or diagram block with monospace font and shaded background."""
        if self.get_y() + 30 > self.h - 30:
            self.add_page()
        self.set_fill_color(245, 245, 250)
        self.set_draw_color(200, 200, 210)
        self.set_font('ArialUni', '', 7.5)
        self.set_text_color(40, 40, 60)
        x = self.l_margin
        y = self.get_y()
        w = self.w - self.l_margin - self.r_margin
        lines = text.split('\n')
        line_height = 4.2
        block_height = len(lines) * line_height + 6
        if y + block_height > self.h - 25:
            self.add_page()
            y = self.get_y()
        self.rect(x, y, w, block_height, 'DF')
        self.set_xy(x + 3, y + 3)
        for line in lines:
            self.set_x(x + 3)
            if len(line) > 90:
                line = line[:87] + '...'
            self.cell(w - 6, line_height, line)
            self.ln(line_height)
        self.ln(4)

    # ═══════════════════════════════════════════════════════════════════════════
    # TABLES
    # ═══════════════════════════════════════════════════════════════════════════

    def add_table(self, headers, rows, col_widths=None):
        """
        Add a formatted table with colored header row and alternating row colors.

        Args:
            headers: List of column header strings
            rows: List of lists — each inner list is one row of cell values
            col_widths: Optional list of column widths. Auto-calculated if None.
        """
        available_width = self.w - self.l_margin - self.r_margin
        if col_widths is None:
            col_widths = self._calc_col_widths(headers, rows, available_width)

        needed_height = 7 * min(3, len(rows) + 1)
        if self.get_y() + needed_height > self.h - 30:
            self.add_page()

        row_height = 7

        # Header row
        self._draw_table_header(headers, col_widths, row_height)

        # Data rows
        self.set_font('ArialUni', '', 7.5)
        self.set_text_color(*self.color_text)
        for row_idx, row in enumerate(rows):
            if row_idx % 2 == 0:
                self.set_fill_color(*self.color_table_alt_row)
            else:
                self.set_fill_color(255, 255, 255)

            # Page break mid-table: re-draw header
            if self.get_y() + row_height > self.h - 25:
                self.add_page()
                self._draw_table_header(headers, col_widths, row_height)
                self.set_font('ArialUni', '', 7.5)
                self.set_text_color(*self.color_text)
                if row_idx % 2 == 0:
                    self.set_fill_color(*self.color_table_alt_row)
                else:
                    self.set_fill_color(255, 255, 255)

            for i, cell_text in enumerate(row):
                w = col_widths[i] if i < len(col_widths) else col_widths[-1]
                align = 'L' if i == 0 else 'C'
                self.cell(w, row_height,
                         self._truncate(str(cell_text), w, 'ArialUni', '', 7.5),
                         border=1, fill=True, align=align)
            self.ln()
        self.ln(3)

    def _draw_table_header(self, headers, col_widths, row_height):
        """Internal: draw the colored header row of a table."""
        self.set_font('ArialUni', 'B', 8)
        self.set_fill_color(*self.color_table_header)
        self.set_text_color(255, 255, 255)
        self.set_draw_color(180, 180, 180)
        for i, header in enumerate(headers):
            w = col_widths[i] if i < len(col_widths) else col_widths[-1]
            self.cell(w, row_height,
                     self._truncate(header, w, 'ArialUni', 'B', 8),
                     border=1, fill=True, align='C')
        self.ln()

    def _truncate(self, text, max_width, family, style, size):
        """Truncate text to fit within a given width."""
        self.set_font(family, style, size)
        if self.get_string_width(text) <= max_width - 2:
            return text
        while self.get_string_width(text + '..') > max_width - 2 and len(text) > 0:
            text = text[:-1]
        return text + '..'

    def _calc_col_widths(self, headers, rows, available_width):
        """Auto-calculate column widths based on content."""
        max_widths = []
        self.set_font('ArialUni', 'B', 8)
        for i, h in enumerate(headers):
            max_w = self.get_string_width(h) + 4
            self.set_font('ArialUni', '', 7.5)
            for row in rows:
                if i < len(row):
                    cell_w = self.get_string_width(str(row[i])) + 4
                    max_w = max(max_w, cell_w)
            max_widths.append(max_w)
        total_natural = sum(max_widths)
        if total_natural <= available_width:
            scale = available_width / total_natural
            return [w * scale for w in max_widths]
        else:
            min_col_width = 12
            scale = available_width / total_natural
            widths = [max(w * scale, min_col_width) for w in max_widths]
            total = sum(widths)
            return [w * available_width / total for w in widths]

    # ═══════════════════════════════════════════════════════════════════════════
    # DIAGRAMS & CHARTS
    # ═══════════════════════════════════════════════════════════════════════════

    def draw_bar_chart(self, title, labels, values, colors=None, unit='',
                       max_val=None, bar_height=8):
        """
        Draw a horizontal bar chart.

        Args:
            title: Chart title
            labels: List of label strings (one per bar)
            values: List of numeric values
            colors: List of (R, G, B) tuples — one per bar. Defaults to primary blue.
            unit: Unit suffix for value labels (e.g., '%', ' MPa')
            max_val: Maximum value for scaling. Auto-calculated if None.
            bar_height: Height of each bar in mm
        """
        if self.get_y() + len(labels) * (bar_height + 3) + 30 > self.h - 25:
            self.add_page()
        self.ln(3)

        # Title
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.color_primary)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

        if max_val is None:
            max_val = max(values) * 1.15

        available_width = self.w - self.l_margin - self.r_margin
        label_width = 55
        chart_width = available_width - label_width - 25

        if colors is None:
            colors = [(20, 100, 180)] * len(labels)

        for i, (label, value) in enumerate(zip(labels, values)):
            # Label
            self.set_font('ArialUni', '', 8)
            self.set_text_color(40, 40, 40)
            self.cell(label_width, bar_height, label, align='R')
            self.set_x(self.l_margin + label_width + 2)

            # Bar
            bar_w = (value / max_val) * chart_width if max_val > 0 else 0
            r, g, b = colors[i]
            self.set_fill_color(r, g, b)
            self.set_draw_color(
                r - 20 if r > 20 else 0,
                g - 20 if g > 20 else 0,
                b - 20 if b > 20 else 0
            )
            y = self.get_y()
            self.rect(self.l_margin + label_width + 2, y, bar_w, bar_height - 1, 'DF')

            # Value label
            self.set_xy(self.l_margin + label_width + bar_w + 4, y)
            self.set_font('ArialUni', 'B', 7.5)
            if isinstance(value, int):
                val_str = f'{value}{unit}'
            elif isinstance(value, float):
                val_str = f'{value:.1f}{unit}'
            else:
                val_str = str(value)
            self.cell(20, bar_height - 1, val_str)
            self.set_xy(self.l_margin, y + bar_height + 1)
        self.ln(5)

    def draw_comparison_bar_chart(self, title, categories, series_data,
                                  series_names, series_colors, unit='', max_val=None):
        """
        Draw a grouped horizontal bar chart comparing multiple series.

        Args:
            title: Chart title
            categories: List of category labels (y-axis)
            series_data: List of lists — each inner list is values for one series
            series_names: List of series names (for legend)
            series_colors: List of (R, G, B) tuples — one per series
            unit: Unit suffix for value labels
            max_val: Maximum value for scaling. Auto-calculated if None.
        """
        bar_height = 6
        group_gap = 4
        total_height = len(categories) * (bar_height * len(series_data) + group_gap) + 40
        if self.get_y() + total_height > self.h - 25:
            self.add_page()
        self.ln(3)

        # Title
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.color_primary)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

        # Legend
        legend_x = self.l_margin
        for idx, (name, color) in enumerate(zip(series_names, series_colors)):
            self.set_fill_color(*color)
            self.rect(legend_x, self.get_y(), 8, 4, 'F')
            self.set_font('ArialUni', '', 7.5)
            self.set_text_color(40, 40, 40)
            self.set_xy(legend_x + 10, self.get_y())
            self.cell(30, 4, name)
            legend_x += 45
        self.ln(7)

        # Auto-calculate max
        if max_val is None:
            all_vals = []
            for s in series_data:
                all_vals.extend([v for v in s if v is not None])
            max_val = max(all_vals) * 1.15 if all_vals else 100

        available_width = self.w - self.l_margin - self.r_margin
        label_width = 50
        chart_width = available_width - label_width - 25

        for cat_idx, category in enumerate(categories):
            self.set_font('ArialUni', '', 8)
            self.set_text_color(40, 40, 40)
            y_start = self.get_y()
            self.cell(label_width, bar_height * len(series_data), category, align='R')

            for s_idx, (series, color) in enumerate(zip(series_data, series_colors)):
                val = series[cat_idx] if cat_idx < len(series) and series[cat_idx] is not None else 0
                y = y_start + s_idx * bar_height
                bar_w = (val / max_val) * chart_width if max_val > 0 and val > 0 else 0
                self.set_fill_color(*color)
                if bar_w > 0:
                    self.rect(self.l_margin + label_width + 2, y, bar_w, bar_height - 1, 'F')
                self.set_xy(self.l_margin + label_width + bar_w + 4, y)
                self.set_font('ArialUni', '', 7)
                if val > 0:
                    val_str = f'{val}{unit}' if isinstance(val, int) else f'{val:.0f}{unit}'
                    self.cell(20, bar_height - 1, val_str)

            self.set_y(y_start + bar_height * len(series_data) + group_gap)
        self.ln(5)

    def draw_flow_chart(self, title, steps, arrow_color=(20, 100, 180),
                        box_fill=(230, 240, 255), text_color=(20, 40, 80)):
        """
        Draw a vertical flow chart with boxes and arrows.

        Args:
            title: Chart title
            steps: List of step description strings
            arrow_color: (R, G, B) for box borders and arrows
            box_fill: (R, G, B) for box background
            text_color: (R, G, B) for text inside boxes
        """
        box_w = 140
        box_h = 14
        arrow_len = 8
        total_height = len(steps) * (box_h + arrow_len) + 30
        if self.get_y() + total_height > self.h - 25:
            self.add_page()
        self.ln(3)

        # Title
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.color_primary)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

        x_center = self.w / 2
        x_box = x_center - box_w / 2

        for i, step in enumerate(steps):
            y = self.get_y()
            if y + box_h + arrow_len + 5 > self.h - 25:
                self.add_page()
                y = self.get_y()

            # Box
            self.set_fill_color(*box_fill)
            self.set_draw_color(*arrow_color)
            self.set_line_width(0.4)
            self.rect(x_box, y, box_w, box_h, 'DF')

            # Text in box
            self.set_font('ArialUni', '', 8.5)
            self.set_text_color(*text_color)
            clean = re.sub(r'\*\*(.*?)\*\*', r'\1', step)
            self.set_xy(x_box + 3, y + 2)
            self.multi_cell(box_w - 6, 5, clean, align='C')
            y_bottom = y + box_h

            # Arrow (if not last step)
            if i < len(steps) - 1:
                self.set_draw_color(*arrow_color)
                self.set_line_width(0.6)
                mid_x = x_center
                self.line(mid_x, y_bottom, mid_x, y_bottom + arrow_len)
                # Arrow head
                self.line(mid_x - 2, y_bottom + arrow_len - 3, mid_x, y_bottom + arrow_len)
                self.line(mid_x + 2, y_bottom + arrow_len - 3, mid_x, y_bottom + arrow_len)

            self.set_y(y_bottom + arrow_len + 1)
        self.ln(5)

    def draw_scorecard(self, title, labels, series_vals, series_names, series_colors):
        """
        Draw a comparison scorecard table (radar chart alternative).

        Args:
            title: Chart title
            labels: List of property/dimension names
            series_vals: List of value lists — one per series
            series_names: List of series names
            series_colors: Not used for the table itself, but kept for API consistency
        """
        if self.get_y() + 60 > self.h - 25:
            self.add_page()
        self.ln(3)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.color_primary)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

        headers = ['Property'] + series_names + ['Advantage']
        rows = []
        for idx, label in enumerate(labels):
            row = [label]
            vals = []
            for s in series_vals:
                v = s[idx] if idx < len(s) else 0
                row.append(str(v))
                vals.append(v)
            best = max(vals)
            winners = [series_names[i] for i, v in enumerate(vals) if v == best]
            row.append(' / '.join(winners) if len(set(vals)) > 1 else 'Tie')
            rows.append(row)
        self.add_table(headers, rows)


# ═══════════════════════════════════════════════════════════════════════════════
# MARKDOWN-TO-PDF PARSER
# ═══════════════════════════════════════════════════════════════════════════════

def parse_markdown_table(lines):
    """Parse a markdown table into headers and rows."""
    headers = []
    rows = []
    for line in lines:
        line = line.strip()
        if not line.startswith('|'):
            continue
        cells = [c.strip() for c in line.split('|')[1:-1]]
        if all(set(c) <= {'-', ':', ' '} for c in cells):
            continue
        if not headers:
            headers = cells
        else:
            rows.append(cells)
    return headers, rows


def parse_and_render(pdf, md_path, sections=None):
    """
    Parse a markdown file and render it into the PDF.
    Handles: headers, body text, bullets, numbered lists, tables, code blocks.

    Args:
        pdf: ReportPDF instance (must already have title page added if desired)
        md_path: Path to the markdown file
        sections: Optional list of section names for TOC
    """
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    if sections:
        pdf.add_toc(sections)

    lines = content.split('\n')
    i = 0
    table_lines = []
    in_table = False
    in_code = False
    code_lines = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Horizontal rules
        if stripped == '---':
            i += 1
            continue

        # Code blocks
        if stripped.startswith('```'):
            if in_code:
                in_code = False
                if code_lines:
                    pdf.add_code_block('\n'.join(code_lines))
                code_lines = []
            else:
                in_code = True
                code_lines = []
            i += 1
            continue

        if in_code:
            code_lines.append(line.rstrip())
            i += 1
            continue

        # Tables
        if stripped.startswith('|') and not in_table:
            in_table = True
            table_lines = [stripped]
            i += 1
            continue
        elif in_table and stripped.startswith('|'):
            table_lines.append(stripped)
            i += 1
            continue
        elif in_table and not stripped.startswith('|'):
            in_table = False
            headers, rows = parse_markdown_table(table_lines)
            if headers and rows:
                pdf.add_table(headers, rows)
            table_lines = []
            continue

        # Section headers
        if stripped.startswith('# ') and not stripped.startswith('## '):
            title = stripped[2:].strip()
            title = re.sub(r'^\d+\.\s*', '', title)
            pdf.add_section_header(title, level=1)
            i += 1
            continue

        if stripped.startswith('## '):
            title = stripped[3:].strip()
            title = re.sub(r'^\d+\.\d*\s*', '', title)
            pdf.add_section_header(title, level=2)
            i += 1
            continue

        if stripped.startswith('### '):
            title = stripped[4:].strip()
            pdf.add_section_header(title, level=3)
            i += 1
            continue

        # Bullet points
        if stripped.startswith('- '):
            text = stripped[2:].strip()
            pdf.add_bullet(text)
            i += 1
            continue

        # Numbered items
        num_match = re.match(r'^(\d+)\.\s+(.+)', stripped)
        if num_match:
            pdf.add_numbered_item(num_match.group(1), num_match.group(2))
            i += 1
            continue

        # Regular paragraph text (joins consecutive non-empty lines)
        if stripped:
            para_lines = [stripped]
            i += 1
            while i < len(lines):
                next_line = lines[i].strip()
                if (not next_line or next_line.startswith('#') or next_line.startswith('|')
                    or next_line.startswith('- ') or re.match(r'^\d+\.', next_line)
                    or next_line == '---' or next_line.startswith('```')):
                    break
                para_lines.append(next_line)
                i += 1
            paragraph = ' '.join(para_lines)
            pdf.add_body_text(paragraph)
            continue

        i += 1

    # Flush remaining table
    if in_table and table_lines:
        headers, rows = parse_markdown_table(table_lines)
        if headers and rows:
            pdf.add_table(headers, rows)


# ═══════════════════════════════════════════════════════════════════════════════
# EXAMPLE / DEMO
# ═══════════════════════════════════════════════════════════════════════════════

def demo():
    """Generate a demo PDF showing all available components."""
    pdf = ReportPDF(
        title='PDF Toolkit Demo',
        subtitle='All Available Components'
    )

    # Title page
    pdf.add_title_page(
        info_lines=[
            f'Date: {date.today().strftime("%B %d, %Y")}',
            'Author: Your Name',
            'Organization: Your Org',
        ],
        disclaimer='This is a demo document showing all available PDF components.'
    )

    # Table of contents
    sections = ['Bar Charts', 'Comparison Charts', 'Flow Charts', 'Tables', 'Text Elements']
    pdf.add_toc(sections)

    # ── Bar Charts ──
    pdf.add_section_header('Bar Charts', level=1)
    pdf.add_body_text('Horizontal bar charts with customizable colors, labels, and units.')

    pdf.draw_bar_chart(
        'Single Series Bar Chart',
        ['Category A', 'Category B', 'Category C', 'Category D', 'Category E'],
        [85, 72, 63, 45, 30],
        colors=[
            (46, 139, 87), (46, 139, 87), (20, 100, 180),
            (220, 140, 20), (200, 60, 60)
        ],
        unit='%',
        max_val=100
    )

    # ── Comparison Charts ──
    pdf.add_section_header('Comparison Charts', level=1)
    pdf.add_body_text('Grouped bar charts for comparing multiple series side by side.')

    pdf.draw_comparison_bar_chart(
        'Two-Series Comparison',
        ['Metric 1', 'Metric 2', 'Metric 3', 'Metric 4'],
        [[80, 65, 90, 45], [60, 85, 70, 75]],
        ['Series A', 'Series B'],
        [(46, 139, 87), (20, 100, 180)],
        unit='%',
        max_val=100
    )

    # ── Flow Charts ──
    pdf.add_section_header('Flow Charts', level=1)
    pdf.add_body_text('Vertical flow charts with customizable colors.')

    pdf.draw_flow_chart(
        'Process Flow — Default Blue',
        [
            'Step 1: Define Requirements',
            'Step 2: Design Architecture',
            'Step 3: Implement Solution',
            'Step 4: Test & Validate',
            'Step 5: Deploy to Production',
        ]
    )

    pdf.draw_flow_chart(
        'Decision Flow — Green Theme',
        [
            'Identify the problem',
            'Research options',
            'Evaluate trade-offs',
            'Make decision',
            'Execute and measure',
        ],
        arrow_color=(46, 139, 87),
        box_fill=(230, 250, 240),
        text_color=(20, 80, 40)
    )

    # ── Tables ──
    pdf.add_section_header('Tables', level=1)
    pdf.add_body_text('Auto-formatted tables with colored headers and alternating rows.')

    pdf.add_table(
        ['Feature', 'Status', 'Priority', 'Owner'],
        [
            ['Authentication', 'Complete', 'High', 'Alice'],
            ['Dashboard', 'In Progress', 'High', 'Bob'],
            ['Reporting', 'Planned', 'Medium', 'Carol'],
            ['API v2', 'Blocked', 'Low', 'Dave'],
        ]
    )

    # ── Text Elements ──
    pdf.add_section_header('Text Elements', level=1)

    pdf.add_section_header('Level 2 Subheader', level=2)
    pdf.add_section_header('Level 3 Sub-subheader', level=3)

    pdf.add_body_text(
        'This is body text. It supports basic paragraph formatting and '
        'will automatically wrap to fit the page width. Markdown **bold** '
        'markers are stripped automatically.'
    )

    pdf.add_bullet('First bullet point')
    pdf.add_bullet('Second bullet point with longer text that wraps')
    pdf.add_bullet('Nested bullet', indent=8)

    pdf.add_numbered_item(1, 'First numbered item')
    pdf.add_numbered_item(2, 'Second numbered item')
    pdf.add_numbered_item(3, 'Third numbered item')

    pdf.add_code_block(
        'def hello():\n'
        '    print("Hello from a code block!")\n'
        '    return True'
    )

    # ── Scorecard ──
    pdf.add_section_header('Scorecard (Radar Chart Alternative)', level=2)
    pdf.draw_scorecard(
        'Feature Comparison Scorecard',
        ['Speed', 'Accuracy', 'Cost', 'Ease of Use', 'Support'],
        [[5, 4, 3, 5, 4], [4, 5, 2, 3, 5], [3, 3, 5, 4, 3]],
        ['Product A', 'Product B', 'Product C'],
        [(46, 139, 87), (20, 100, 180), (200, 60, 60)]
    )

    # Output
    output_path = 'pdf_toolkit_demo.pdf'
    pdf.output(output_path)
    print(f'Demo PDF generated: {output_path} ({pdf.page_no()} pages)')


if __name__ == '__main__':
    demo()
